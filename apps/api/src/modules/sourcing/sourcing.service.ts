import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { supplierItemRecommendationScore, supplierResearchFingerprint } from '@vprocly/contracts';
import {
  auditLog,
  bids,
  bidDrafts,
  itemClarificationMessages,
  itemEquivalences,
  priceBenchmarkSnapshots,
  platformSuppliers,
  purchaseOrders,
  purchaseOrderOutcomes,
  sourcingLineNotifications,
  sourcingLines,
  sourcingResearchJobs,
  sourcingRequests,
  suppliers,
  supplierCategories,
  supplierItemClaims,
  supplierScoreSnapshots,
  supplierResearchRuns,
  supplierContactAttempts,
  supplierLineResponses,
  supplierVoiceCalls,
  tenants,
  type Tx,
  users,
} from '@vprocly/db';
import { and, asc, desc, eq, gt, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { EventsService } from '../../platform/events.service.js';
import type { RequestContext } from '../../platform/request-context.js';
import { AuditService } from '../audit-evidence/index.js';
import { CategoryResolverService } from '../categories/index.js';
import { DocumentsService, ObjectStorage } from '../documents/index.js';
import { TenantDb } from '../identity-tenancy/index.js';
import {
  BOM_TEMPLATE_FIELDS,
  matchBomHeaders,
  missingRequiredColumns,
  parseBomRow,
  type BomLineValue,
  type BomRowResult,
} from './bom-template.js';

/** Suppliers are matched, and get an emailed invite, without ever seeing the buyer's identity (blind-bid rule). */
const MAX_MATCHES_PER_LINE = 5;

/** A successfully researched item reuses its evidence for this long. Empty and failed runs remain retryable. */
const RESEARCH_RETRY_HOURS = 24;

export const ManualLine = z.object({
  itemCode: z.string().trim().max(64).optional(),
  brandManufacturer: z.string().trim().max(255).optional(),
  hsnMfgCode: z.string().trim().max(120).optional(),
  description: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(120),
  qty: z.coerce.number().positive(),
  uom: z.string().trim().min(1).max(32),
  deliveryCity: z.string().trim().min(1).max(120),
  deliveryState: z.string().trim().min(1).max(120),
  needBy: z.iso.date().optional(),
  inviteEmails: z.array(z.email()).max(10).optional(),
});
export type ManualLine = z.infer<typeof ManualLine>;

export const CreateManualRequest = z.object({
  title: z.string().trim().min(1).max(255),
  sourcingRequestId: z.uuid().optional(),
  lines: z.array(ManualLine).min(1).max(200),
});
export type CreateManualRequest = z.infer<typeof CreateManualRequest>;

export const InviteToLineInput = z.object({
  emails: z.array(z.email()).min(1).max(10),
});
export type InviteToLineInput = z.infer<typeof InviteToLineInput>;

export const BuyerClarificationInput = z.object({
  platformSupplierId: z.uuid(),
  message: z.string().trim().min(1).max(2000),
});
export type BuyerClarificationInput = z.infer<typeof BuyerClarificationInput>;

export const ImportBomRequest = z.object({
  title: z.string().trim().min(1).max(255),
  documentId: z.uuid(),
});
export type ImportBomRequest = z.infer<typeof ImportBomRequest>;

export const RecordPurchaseOrderOutcome = z.object({
  type: z.enum(['acknowledged', 'dispatched', 'delivered', 'quality_accepted', 'quality_rejected', 'cancelled', 'disputed']),
  promisedAt: z.iso.datetime().nullable().optional(),
  occurredAt: z.iso.datetime().optional(),
  quantity: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  reasonCode: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type RecordPurchaseOrderOutcome = z.infer<typeof RecordPurchaseOrderOutcome>;

type ParsedLine = Omit<ManualLine, 'category'> & { categoryId: string };

type MatchSummary = { description: string; matchedSupplierCount: number; invitedNewCount: number };

@Injectable()
export class SourcingService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly documents: DocumentsService,
    private readonly storage: ObjectStorage,
    private readonly categoryResolver: CategoryResolverService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  bomTemplateFields() {
    return BOM_TEMPLATE_FIELDS;
  }

  list(ctx: RequestContext) {
    return this.tenantDb.run(ctx, async (tx) => {
      const requests = await tx.select().from(sourcingRequests).orderBy(desc(sourcingRequests.createdAt));
      if (requests.length === 0) return [];

      const lines = await tx
        .select()
        .from(sourcingLines)
        .where(inArray(sourcingLines.sourcingRequestId, requests.map((request) => request.id)))
        .orderBy(desc(sourcingLines.createdAt));
      const lineIds = lines.map((line) => line.id);
      const notified = lineIds.length
        ? await tx
            .select({ sourcingLineId: sourcingLineNotifications.sourcingLineId, count: sql<number>`count(*)::int` })
            .from(sourcingLineNotifications)
            .where(inArray(sourcingLineNotifications.sourcingLineId, lineIds))
            .groupBy(sourcingLineNotifications.sourcingLineId)
        : [];
      const bidTotals = lineIds.length
        ? await tx
            .select({ sourcingLineId: bids.sourcingLineId, count: sql<number>`count(*)::int` })
            .from(bids)
            .where(inArray(bids.sourcingLineId, lineIds))
            .groupBy(bids.sourcingLineId)
        : [];
      const notifiedByLine = new Map(notified.map((row) => [row.sourcingLineId, row.count]));
      const bidsByLine = new Map(bidTotals.map((row) => [row.sourcingLineId, row.count]));
      const linesByRequest = new Map<string, Array<(typeof lines)[number] & { notifiedCount: number; bidCount: number }>>();

      for (const line of lines) {
        const requestLines = linesByRequest.get(line.sourcingRequestId) ?? [];
        requestLines.push({
          ...line,
          notifiedCount: notifiedByLine.get(line.id) ?? 0,
          bidCount: bidsByLine.get(line.id) ?? 0,
        });
        linesByRequest.set(line.sourcingRequestId, requestLines);
      }

      return requests.map((request) => ({ ...request, lines: linesByRequest.get(request.id) ?? [] }));
    });
  }

  async get(ctx: RequestContext, id: string) {
    return this.tenantDb.run(ctx, async (tx) => {
      const [request] = await tx.select().from(sourcingRequests).where(eq(sourcingRequests.id, id));
      if (!request) throw new NotFoundException();
      const lines = await tx.select().from(sourcingLines).where(eq(sourcingLines.sourcingRequestId, id));
      const notified = await tx
        .select({ sourcingLineId: sourcingLineNotifications.sourcingLineId, count: sql<number>`count(*)::int` })
        .from(sourcingLineNotifications)
        .where(
          inArray(
            sourcingLineNotifications.sourcingLineId,
            lines.map((l) => l.id).length ? lines.map((l) => l.id) : [''],
          ),
        )
        .groupBy(sourcingLineNotifications.sourcingLineId);
      const notifiedByLine = new Map(notified.map((n) => [n.sourcingLineId, n.count]));
      const lineIds = lines.map((line) => line.id);
      const lineById = new Map(lines.map((line) => [line.id, line]));
      const lineFingerprintById = new Map(lines.map((line) => [line.id, supplierResearchFingerprint(line)]));
      const lineFingerprints = [...new Set(lineFingerprintById.values())];
      const approvedEquivalences = lineFingerprints.length
        ? await tx.select().from(itemEquivalences).where(and(
            eq(itemEquivalences.status, 'approved'),
            or(
              inArray(itemEquivalences.sourceFingerprint, lineFingerprints),
              inArray(itemEquivalences.targetFingerprint, lineFingerprints),
            ),
          ))
        : [];
      const acceptedFingerprintsByLine = new Map<string, Set<string>>();
      for (const [lineId, fingerprint] of lineFingerprintById) {
        const accepted = new Set([fingerprint]);
        for (const equivalence of approvedEquivalences) {
          if (equivalence.sourceFingerprint === fingerprint) accepted.add(equivalence.targetFingerprint);
          if (equivalence.targetFingerprint === fingerprint) accepted.add(equivalence.sourceFingerprint);
        }
        acceptedFingerprintsByLine.set(lineId, accepted);
      }
      const notificationRows = lineIds.length
        ? await tx
            .select({
              id: sourcingLineNotifications.id,
              sourcingLineId: sourcingLineNotifications.sourcingLineId,
              email: sourcingLineNotifications.email,
              sentAt: sourcingLineNotifications.sentAt,
              platformSupplierId: platformSuppliers.id,
              supplierName: platformSuppliers.name,
              supplierPhone: platformSuppliers.phone,
              supplierCity: platformSuppliers.city,
              supplierState: platformSuppliers.state,
              supplierStatus: platformSuppliers.status,
              supplierDiscoveryMetadata: platformSuppliers.discoveryMetadata,
              voiceCallId: supplierVoiceCalls.id,
              voiceCallStatus: supplierVoiceCalls.status,
              voiceCallAttemptId: supplierVoiceCalls.attemptId,
              voiceCallInteractionId: supplierVoiceCalls.interactionId,
              voiceCallDurationSeconds: supplierVoiceCalls.durationSeconds,
              voiceCallFailureReason: supplierVoiceCalls.failureReason,
              voiceCallFinalAgentVariables: supplierVoiceCalls.finalAgentVariables,
              voiceCallInteractionTranscript: supplierVoiceCalls.interactionTranscript,
              voiceCallStartedAt: supplierVoiceCalls.startedAt,
              voiceCallCompletedAt: supplierVoiceCalls.completedAt,
              bidDraftId: bidDrafts.id,
              bidDraftStatus: bidDrafts.status,
              bidDraftUnitPrice: bidDrafts.unitPrice,
              bidDraftLeadTimeDays: bidDrafts.leadTimeDays,
              bidDraftExtractionConfidence: bidDrafts.extractionConfidence,
            })
            .from(sourcingLineNotifications)
            .leftJoin(platformSuppliers, eq(platformSuppliers.id, sourcingLineNotifications.platformSupplierId))
            .leftJoin(supplierVoiceCalls, eq(supplierVoiceCalls.notificationId, sourcingLineNotifications.id))
            .leftJoin(bidDrafts, eq(bidDrafts.voiceCallId, supplierVoiceCalls.id))
            .where(inArray(sourcingLineNotifications.sourcingLineId, lineIds))
            .orderBy(asc(sourcingLineNotifications.createdAt))
        : [];
      const capabilityRows = lineIds.length
        ? await tx.select().from(supplierLineResponses).where(inArray(supplierLineResponses.sourcingLineId, lineIds))
        : [];
      const capabilityByThread = new Map(capabilityRows.map((response) => [`${response.sourcingLineId}:${response.platformSupplierId}`, response]));
      const clarificationRows = lineIds.length
        ? await tx
            .select({
              id: itemClarificationMessages.id,
              sourcingLineId: itemClarificationMessages.sourcingLineId,
              platformSupplierId: itemClarificationMessages.platformSupplierId,
              senderType: itemClarificationMessages.senderType,
              senderLabel: itemClarificationMessages.senderLabel,
              body: itemClarificationMessages.body,
              createdAt: itemClarificationMessages.createdAt,
            })
            .from(itemClarificationMessages)
            .where(inArray(itemClarificationMessages.sourcingLineId, lineIds))
            .orderBy(asc(itemClarificationMessages.createdAt))
        : [];
      const clarificationsByLine = new Map<string, typeof clarificationRows>();
      for (const message of clarificationRows) {
        const messages = clarificationsByLine.get(message.sourcingLineId) ?? [];
        messages.push(message);
        clarificationsByLine.set(message.sourcingLineId, messages);
      }
      const scoreSupplierIds = [...new Set(notificationRows.map((row) => row.platformSupplierId).filter((id): id is string => Boolean(id)))];
      const itemClaimRows = scoreSupplierIds.length
        ? await tx.select().from(supplierItemClaims).where(and(
            inArray(supplierItemClaims.platformSupplierId, scoreSupplierIds),
            gt(supplierItemClaims.expiresAt, new Date()),
          ))
        : [];
      const itemClaimFor = (supplierId: string, lineId: string) => {
        const accepted = acceptedFingerprintsByLine.get(lineId);
        return itemClaimRows.find((claim) => claim.platformSupplierId === supplierId && accepted?.has(claim.itemFingerprint)) ?? null;
      };
      const scoreRows = scoreSupplierIds.length
        ? await tx.select().from(supplierScoreSnapshots).where(inArray(supplierScoreSnapshots.platformSupplierId, scoreSupplierIds)).orderBy(desc(supplierScoreSnapshots.version))
        : [];
      const latestScoreBySupplier = new Map<string, (typeof scoreRows)[number]>();
      for (const score of scoreRows) if (!latestScoreBySupplier.has(score.platformSupplierId)) latestScoreBySupplier.set(score.platformSupplierId, score);
      const categoryRows = scoreSupplierIds.length
        ? await tx.select().from(supplierCategories).where(inArray(supplierCategories.platformSupplierId, scoreSupplierIds))
        : [];
      const supplierCategoryKeys = new Set(categoryRows.map((row) => `${row.platformSupplierId}:${row.categoryId}`));
      const scoreView = (supplierId: string | null, sourcingLineId: string) => {
        if (!supplierId) return null;
        const score = latestScoreBySupplier.get(supplierId);
        if (!score) return null;
        const categoryId = lineById.get(sourcingLineId)?.categoryId;
        const categoryMatchScore = categoryId && supplierCategoryKeys.has(`${supplierId}:${categoryId}`) ? 100 : 40;
        const overallScore = Math.max(0, Math.min(100, Number(score.overallScore) - Number(score.categoryMatchScore) * 0.25 + categoryMatchScore * 0.25));
        return {
          overallScore: Number(overallScore.toFixed(2)),
          version: score.version,
          sampleSize: score.sampleSize,
          components: {
            categoryMatch: categoryMatchScore,
            response: Number(score.responseScore),
            price: Number(score.priceScore),
            leadTime: Number(score.leadTimeScore),
            fulfillment: Number(score.fulfillmentScore),
            compliance: Number(score.complianceScore),
          },
          explanation: score.explanation,
          calculatedAt: score.calculatedAt,
        };
      };
      const notificationViews = notificationRows.map((notification) => ({
        ...notification,
        itemEvidence: notification.platformSupplierId
          ? itemClaimFor(notification.platformSupplierId, notification.sourcingLineId)
          : null,
        capabilityResponse: notification.platformSupplierId
          ? capabilityByThread.get(`${notification.sourcingLineId}:${notification.platformSupplierId}`) ?? null
          : null,
        supplierScore: scoreView(notification.platformSupplierId, notification.sourcingLineId),
        voiceCall: notification.voiceCallId
          ? {
              id: notification.voiceCallId,
              status: notification.voiceCallStatus,
              attemptId: notification.voiceCallAttemptId,
              interactionId: notification.voiceCallInteractionId,
              durationSeconds: notification.voiceCallDurationSeconds,
              failureReason: notification.voiceCallFailureReason,
              finalAgentVariables: notification.voiceCallFinalAgentVariables,
              interactionTranscript: notification.voiceCallInteractionTranscript,
              startedAt: notification.voiceCallStartedAt,
              completedAt: notification.voiceCallCompletedAt,
            }
          : null,
        bidDraft: notification.bidDraftId ? {
          id: notification.bidDraftId,
          status: notification.bidDraftStatus,
          unitPrice: notification.bidDraftUnitPrice,
          leadTimeDays: notification.bidDraftLeadTimeDays,
          extractionConfidence: notification.bidDraftExtractionConfidence,
        } : null,
      }));
      const notificationsByLine = new Map<string, typeof notificationViews>();
      for (const notification of notificationViews) {
        const lineNotifications = notificationsByLine.get(notification.sourcingLineId) ?? [];
        lineNotifications.push(notification);
        notificationsByLine.set(notification.sourcingLineId, lineNotifications);
      }
      const submittedBids = lineIds.length
        ? await tx
            .select({
              id: bids.id,
              sourcingLineId: bids.sourcingLineId,
              supplierId: platformSuppliers.id,
              supplierName: platformSuppliers.name,
              supplierCity: platformSuppliers.city,
              supplierState: platformSuppliers.state,
              unitPrice: bids.unitPrice,
              minimumOrderQty: bids.minimumOrderQty,
              leadTimeDays: bids.leadTimeDays,
              currency: bids.currency,
              taxPercent: bids.taxPercent,
              freightAmount: bids.freightAmount,
              quoteValidityDate: bids.quoteValidityDate,
              notes: bids.notes,
              status: bids.status,
              createdAt: bids.createdAt,
              updatedAt: bids.updatedAt,
            })
            .from(bids)
            .innerJoin(platformSuppliers, eq(platformSuppliers.id, bids.platformSupplierId))
            .where(inArray(bids.sourcingLineId, lineIds))
            .orderBy(asc(bids.unitPrice))
        : [];
      const bidSupplierIds = [...new Set(submittedBids.map((bid) => bid.supplierId))];
      const missingScoreSupplierIds = bidSupplierIds.filter((id) => !latestScoreBySupplier.has(id));
      if (missingScoreSupplierIds.length) {
        const missingScores = await tx.select().from(supplierScoreSnapshots).where(inArray(supplierScoreSnapshots.platformSupplierId, missingScoreSupplierIds)).orderBy(desc(supplierScoreSnapshots.version));
        for (const score of missingScores) if (!latestScoreBySupplier.has(score.platformSupplierId)) latestScoreBySupplier.set(score.platformSupplierId, score);
        const missingCategories = await tx.select().from(supplierCategories).where(inArray(supplierCategories.platformSupplierId, missingScoreSupplierIds));
        for (const row of missingCategories) supplierCategoryKeys.add(`${row.platformSupplierId}:${row.categoryId}`);
      }
      const tenantCurrencyRows = await tx.select({ currency: tenants.defaultCurrency }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
      const defaultCurrency = tenantCurrencyRows[0]?.currency ?? 'INR';
      const categoryIds = [...new Set(lines.map((line) => line.categoryId))];
      const benchmarks = categoryIds.length
        ? await tx.select().from(priceBenchmarkSnapshots).where(and(
            inArray(priceBenchmarkSnapshots.categoryId, categoryIds),
            eq(priceBenchmarkSnapshots.currency, defaultCurrency.toUpperCase()),
            or(eq(priceBenchmarkSnapshots.region, '*'), inArray(priceBenchmarkSnapshots.region, lines.map((line) => line.deliveryState))),
          ))
        : [];
      const benchmarkForLine = (line: (typeof lines)[number]) => benchmarks.find((row) =>
        row.categoryId === line.categoryId && row.uom === line.uom.toUpperCase() && row.region.toLowerCase() === line.deliveryState.toLowerCase(),
      ) ?? benchmarks.find((row) => row.categoryId === line.categoryId && row.uom === line.uom.toUpperCase() && row.region === '*');
      const acceptedHistory = lineIds.length
        ? await tx.select({ bid: bids, line: sourcingLines }).from(bids).innerJoin(sourcingLines, eq(sourcingLines.id, bids.sourcingLineId)).where(eq(bids.status, 'accepted')).orderBy(desc(bids.updatedAt))
        : [];
      const previousPurchaseForLine = (line: (typeof lines)[number]) => acceptedHistory.find((row) =>
        row.line.id !== line.id && row.line.categoryId === line.categoryId && row.line.uom.toUpperCase() === line.uom.toUpperCase() && row.bid.currency.toUpperCase() === defaultCurrency.toUpperCase(),
      );
      const landedUnitCost = (bid: (typeof submittedBids)[number], line: (typeof lines)[number]) =>
        Number(bid.unitPrice) * (1 + Number(bid.taxPercent ?? 0) / 100) + Number(bid.freightAmount ?? 0) / Number(line.qty);
      const bidsByLine = new Map<string, typeof submittedBids>();
      for (const bid of submittedBids) {
        const line = lineById.get(bid.sourcingLineId)!;
        const benchmark = benchmarkForLine(line);
        const landed = landedUnitCost(bid, line);
        const enrichedBid = {
          ...bid,
          landedUnitCost: Number(landed.toFixed(4)),
          priceSignal: !benchmark ? 'insufficient_data' : landed < Number(benchmark.percentile25) ? 'below_range' : landed > Number(benchmark.percentile75) ? 'above_range' : 'within_range',
          supplierScore: scoreView(bid.supplierId, bid.sourcingLineId),
        };
        const lineBids = bidsByLine.get(bid.sourcingLineId) ?? [];
        lineBids.push(enrichedBid);
        bidsByLine.set(bid.sourcingLineId, lineBids as typeof submittedBids);
      }
      const researchJobs = lineIds.length
        ? await tx.select().from(sourcingResearchJobs).where(inArray(sourcingResearchJobs.sourcingLineId, lineIds))
        : [];
      const researchJobByLine = new Map(researchJobs.map((job) => [job.sourcingLineId, job]));
      const orderRows = lineIds.length
        ? await tx
            .select({ order: purchaseOrders, platformSupplierId: bids.platformSupplierId, supplierName: platformSuppliers.name })
            .from(purchaseOrders)
            .innerJoin(bids, eq(bids.id, purchaseOrders.acceptedBidId))
            .innerJoin(platformSuppliers, eq(platformSuppliers.id, bids.platformSupplierId))
            .where(inArray(purchaseOrders.sourcingLineId, lineIds))
        : [];
      const orderIds = orderRows.map((row) => row.order.id);
      const outcomeRows = orderIds.length
        ? await tx.select().from(purchaseOrderOutcomes).where(inArray(purchaseOrderOutcomes.purchaseOrderId, orderIds)).orderBy(asc(purchaseOrderOutcomes.occurredAt))
        : [];
      const outcomesByOrder = new Map<string, typeof outcomeRows>();
      for (const outcome of outcomeRows) {
        const current = outcomesByOrder.get(outcome.purchaseOrderId) ?? [];
        current.push(outcome);
        outcomesByOrder.set(outcome.purchaseOrderId, current);
      }
      const orderByLine = new Map(orderRows.map((row) => [row.order.sourcingLineId, { ...row.order, platformSupplierId: row.platformSupplierId, supplierName: row.supplierName, outcomes: outcomesByOrder.get(row.order.id) ?? [] }]));
      const timeline = await tx
        .select({
          id: auditLog.id,
          action: auditLog.action,
          actorType: auditLog.actorType,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          data: auditLog.data,
          occurredAt: auditLog.occurredAt,
        })
        .from(auditLog)
        .where(or(
          and(eq(auditLog.entityType, 'sourcing_request'), eq(auditLog.entityId, id)),
          and(eq(auditLog.entityType, 'sourcing_line'), inArray(auditLog.entityId, lineIds.length ? lineIds : [''])),
          and(eq(auditLog.entityType, 'sourcing_line_notification'), inArray(auditLog.entityId, notificationRows.length ? notificationRows.map((row) => row.id) : [''])),
        ))
        .orderBy(desc(auditLog.occurredAt))
        .limit(200);
      return {
        ...request,
        timeline,
        lines: lines.map((line) => {
          const benchmark = benchmarkForLine(line);
          const previous = previousPurchaseForLine(line);
          const previousLanded = previous ? Number(previous.bid.unitPrice) * (1 + Number(previous.bid.taxPercent ?? 0) / 100) + Number(previous.bid.freightAmount ?? 0) / Number(previous.line.qty) : null;
          return ({
          ...line,
          notifiedCount: notifiedByLine.get(line.id) ?? 0,
          supplierResearch: notificationsByLine.get(line.id) ?? [],
          clarificationMessages: clarificationsByLine.get(line.id) ?? [],
          researchJob: researchJobByLine.get(line.id) ?? null,
          bids: bidsByLine.get(line.id) ?? [],
          purchaseOrder: orderByLine.get(line.id) ?? null,
          priceIntelligence: {
            currency: defaultCurrency,
            benchmark: benchmark ? {
              scope: benchmark.region === '*' ? 'national' : 'regional',
              quoteCount: benchmark.quoteCount,
              buyerCount: benchmark.buyerCount,
              supplierCount: benchmark.supplierCount,
              low: Number(benchmark.low),
              expectedLow: Number(benchmark.percentile25),
              median: Number(benchmark.median),
              expectedHigh: Number(benchmark.percentile75),
              high: Number(benchmark.high),
              negotiationTarget: Number(benchmark.percentile25),
              calculatedAt: benchmark.calculatedAt,
            } : null,
            previousPurchase: previousLanded == null ? null : Number(previousLanded.toFixed(4)),
            privacyThreshold: { minimumQuotes: 5, minimumBuyers: 3, met: Boolean(benchmark) },
          },
        }); }),
      };
    });
  }

  async postClarification(ctx: RequestContext, requestId: string, lineId: string, input: BuyerClarificationInput) {
    return this.tenantDb.run(ctx, async (tx) => {
      const [line] = await tx
        .select({ id: sourcingLines.id, status: sourcingLines.status })
        .from(sourcingLines)
        .where(and(eq(sourcingLines.id, lineId), eq(sourcingLines.sourcingRequestId, requestId)));
      if (!line) throw new NotFoundException('Sourcing item not found');

      const [notification] = await tx
        .select({ id: sourcingLineNotifications.id })
        .from(sourcingLineNotifications)
        .where(and(
          eq(sourcingLineNotifications.sourcingLineId, lineId),
          eq(sourcingLineNotifications.platformSupplierId, input.platformSupplierId),
        ));
      if (!notification) throw new BadRequestException('This supplier is not matched to the item');

      const [message] = await tx
        .insert(itemClarificationMessages)
        .values({
          tenantId: ctx.tenantId,
          sourcingLineId: lineId,
          platformSupplierId: input.platformSupplierId,
          senderType: 'buyer',
          senderUserId: ctx.userId,
          senderLabel: 'Buyer team',
          body: input.message,
        })
        .returning({ id: itemClarificationMessages.id, createdAt: itemClarificationMessages.createdAt });
      await this.audit.record(tx, ctx, {
        action: 'sourcing_line.clarification_sent',
        entityType: 'sourcing_line',
        entityId: lineId,
        data: { platformSupplierId: input.platformSupplierId },
      });
      return message!;
    });
  }

  async acceptBid(ctx: RequestContext, requestId: string, lineId: string, bidId: string) {
    return this.tenantDb.run(ctx, async (tx) => {
      // Serialize awards for this line so two buyer clicks cannot create two winners or draft POs.
      const lock = await tx.execute<{ id: string }>(sql`SELECT id FROM sourcing_lines WHERE id = ${lineId}::uuid FOR UPDATE`);
      if (lock.rows.length === 0) throw new NotFoundException('Sourcing line not found');

      const [row] = await tx
        .select({
          line: sourcingLines,
          request: sourcingRequests,
          bid: bids,
          platformSupplier: platformSuppliers,
          tenantName: tenants.name,
          currency: tenants.defaultCurrency,
          buyerName: users.displayName,
          buyerEmail: users.email,
        })
        .from(sourcingLines)
        .innerJoin(sourcingRequests, eq(sourcingRequests.id, sourcingLines.sourcingRequestId))
        .innerJoin(bids, and(eq(bids.id, bidId), eq(bids.sourcingLineId, sourcingLines.id)))
        .innerJoin(platformSuppliers, eq(platformSuppliers.id, bids.platformSupplierId))
        .innerJoin(tenants, eq(tenants.id, sourcingLines.tenantId))
        .leftJoin(users, eq(users.id, sourcingRequests.createdBy))
        .where(and(eq(sourcingLines.id, lineId), eq(sourcingRequests.id, requestId)));

      if (!row) throw new NotFoundException('Bid not found for this sourcing line');
      if (row.line.status !== 'open') throw new ConflictException('This line has already been awarded or closed');
      if (row.bid.status !== 'submitted') throw new ConflictException('Only a submitted bid can be accepted');

      await tx.update(bids).set({ status: 'accepted', updatedAt: new Date() }).where(eq(bids.id, bidId));
      await tx
        .update(bids)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(and(eq(bids.sourcingLineId, lineId), ne(bids.id, bidId), eq(bids.status, 'submitted')));
      await tx.update(sourcingLines).set({ status: 'awarded', updatedAt: new Date() }).where(eq(sourcingLines.id, lineId));

      const vendorCode = `MKT-${row.platformSupplier.id.slice(0, 8).toUpperCase()}`;
      const [vendor] = await tx
        .insert(suppliers)
        .values({
          tenantId: ctx.tenantId,
          platformSupplierId: row.platformSupplier.id,
          code: vendorCode,
          name: row.platformSupplier.name,
          taxId: row.platformSupplier.gst,
          email: row.platformSupplier.email,
          phone: row.platformSupplier.phone,
          sourceSystem: 'marketplace',
          externalId: row.platformSupplier.id,
          createdBy: ctx.userId,
          correlationId: ctx.correlationId,
        })
        .onConflictDoUpdate({
          target: [suppliers.tenantId, suppliers.platformSupplierId],
          set: {
            name: row.platformSupplier.name,
            taxId: row.platformSupplier.gst,
            email: row.platformSupplier.email,
            phone: row.platformSupplier.phone,
            updatedAt: new Date(),
          },
        })
        .returning();

      const [purchaseOrder] = await tx
        .insert(purchaseOrders)
        .values({
          tenantId: ctx.tenantId,
          poNumber: `DRAFT-${lineId.slice(0, 8).toUpperCase()}`,
          supplierId: vendor!.id,
          sourcingLineId: lineId,
          acceptedBidId: bidId,
          description: row.line.description,
          qty: row.line.qty,
          uom: row.line.uom,
          unitPrice: row.bid.unitPrice,
          currency: row.bid.currency,
          deliveryCity: row.line.deliveryCity,
          deliveryState: row.line.deliveryState,
          needBy: row.line.needBy,
          createdBy: ctx.userId,
        })
        .returning();

      const [remainingOpen] = await tx
        .select({ id: sourcingLines.id })
        .from(sourcingLines)
        .where(and(eq(sourcingLines.sourcingRequestId, requestId), eq(sourcingLines.status, 'open')))
        .limit(1);
      if (!remainingOpen) await tx.update(sourcingRequests).set({ status: 'closed', updatedAt: new Date() }).where(eq(sourcingRequests.id, requestId));

      await this.audit.record(tx, ctx, {
        action: 'sourcing_bid.accepted',
        entityType: 'bid',
        entityId: bidId,
        data: { sourcingRequestId: requestId, sourcingLineId: lineId, supplierId: row.platformSupplier.id, purchaseOrderId: purchaseOrder!.id },
      });
      await this.events.emit(tx, ctx, {
        type: 'sourcing.bid_accepted',
        version: 1,
        aggregateType: 'sourcing_line',
        aggregateId: lineId,
        payload: {
          sourcingRequestId: requestId,
          sourcingLineId: lineId,
          acceptedBidId: bidId,
          platformSupplierId: row.platformSupplier.id,
          purchaseOrderId: purchaseOrder!.id,
        },
      });

      return { bidId, sourcingLineId: lineId, supplierId: vendor!.id, purchaseOrderId: purchaseOrder!.id, status: 'accepted' as const };
    });
  }

  async recordOutcome(ctx: RequestContext, requestId: string, lineId: string, purchaseOrderId: string, input: RecordPurchaseOrderOutcome) {
    return this.tenantDb.run(ctx, async (tx) => {
      const [row] = await tx
        .select({ order: purchaseOrders, platformSupplierId: bids.platformSupplierId })
        .from(purchaseOrders)
        .innerJoin(sourcingLines, eq(sourcingLines.id, purchaseOrders.sourcingLineId))
        .innerJoin(bids, eq(bids.id, purchaseOrders.acceptedBidId))
        .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(sourcingLines.id, lineId), eq(sourcingLines.sourcingRequestId, requestId)));
      if (!row) throw new NotFoundException('Purchase order not found');
      const [outcome] = await tx
        .insert(purchaseOrderOutcomes)
        .values({
          tenantId: ctx.tenantId,
          purchaseOrderId,
          sourcingLineId: lineId,
          platformSupplierId: row.platformSupplierId,
          type: input.type,
          promisedAt: input.promisedAt ? new Date(input.promisedAt) : null,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
          quantity: input.quantity == null ? null : String(input.quantity),
          rating: input.rating ?? null,
          reasonCode: input.reasonCode ?? null,
          notes: input.notes ?? null,
          createdBy: ctx.userId,
        })
        .returning();
      const status = input.type === 'quality_accepted' ? 'completed' : input.type === 'quality_rejected' || input.type === 'cancelled' || input.type === 'disputed' ? input.type : input.type;
      await tx.update(purchaseOrders).set({ status, updatedAt: new Date() }).where(eq(purchaseOrders.id, purchaseOrderId));
      await this.events.emit(tx, ctx, {
        type: 'sourcing.purchase_order_outcome_recorded',
        version: 1,
        aggregateType: 'purchase_order',
        aggregateId: purchaseOrderId,
        payload: { purchaseOrderId, sourcingLineId: lineId, platformSupplierId: row.platformSupplierId, outcomeType: input.type },
      });
      await this.audit.record(tx, ctx, {
        action: 'purchase_order.outcome_recorded',
        entityType: 'purchase_order',
        entityId: purchaseOrderId,
        data: { sourcingLineId: lineId, outcomeType: input.type, rating: input.rating ?? null },
      });
      return outcome;
    });
  }

  /**
   * Cold-start invites, but for a line that's already been posted -- the same mechanism `commitLine` uses
   * at creation time (a `sourcing_line_notifications` row with no `platformSupplierId`, resolved later at
   * signup/login), just triggerable again afterward instead of only up front. Re-emitting
   * `sourcing.sourcing_line_matched` is what makes the worker route these. Notifications without a platform
   * supplier are explicit buyer-entered invites, so the outreach router sends them through the live manual
   * mailer while automatic researched/matched outreach continues to respect capture/live delivery mode.
   */
  async inviteToLine(ctx: RequestContext, requestId: string, lineId: string, emails: string[]) {
    return this.tenantDb.run(ctx, async (tx) => {
      const [line] = await tx
        .select({
          id: sourcingLines.id,
          status: sourcingLines.status,
          itemCode: sourcingLines.itemCode,
          brandManufacturer: sourcingLines.brandManufacturer,
          hsnMfgCode: sourcingLines.hsnMfgCode,
          description: sourcingLines.description,
        })
        .from(sourcingLines)
        .where(and(eq(sourcingLines.id, lineId), eq(sourcingLines.sourcingRequestId, requestId)));
      if (!line) throw new NotFoundException('Sourcing line not found');
      if (line.status !== 'open') throw new ConflictException('This line is no longer open for new invites');
      const itemFingerprint = supplierResearchFingerprint(line);

      const uniqueEmails = [...new Set(emails)];
      let invitedNewCount = 0;
      for (const email of uniqueEmails) {
        const [inserted] = await tx
          .insert(sourcingLineNotifications)
          .values({ tenantId: ctx.tenantId, sourcingLineId: lineId, email, itemFingerprint })
          .onConflictDoNothing()
          .returning({ id: sourcingLineNotifications.id });
        if (inserted) invitedNewCount++;
      }

      await this.audit.record(tx, ctx, {
        action: 'sourcing_line.invited',
        entityType: 'sourcing_line',
        entityId: lineId,
        data: { emails: uniqueEmails, invitedNewCount },
      });
      if (invitedNewCount > 0) {
        await this.events.emit(tx, ctx, {
          type: 'sourcing.sourcing_line_matched',
          version: 1,
          aggregateType: 'sourcing_line',
          aggregateId: lineId,
          payload: { sourcingLineId: lineId, matchedSupplierCount: 0, invitedNewCount },
        });
      }

      return { invitedNewCount };
    });
  }

  async retryResearch(ctx: RequestContext, requestId: string, lineId: string) {
    return this.tenantDb.run(ctx, async (tx) => {
      const [row] = await tx
        .select({ line: sourcingLines, requestStatus: sourcingRequests.status, jobStatus: sourcingResearchJobs.status })
        .from(sourcingLines)
        .innerJoin(sourcingRequests, eq(sourcingRequests.id, sourcingLines.sourcingRequestId))
        .leftJoin(sourcingResearchJobs, eq(sourcingResearchJobs.sourcingLineId, sourcingLines.id))
        .where(and(eq(sourcingLines.id, lineId), eq(sourcingRequests.id, requestId)));
      if (!row) throw new NotFoundException('Sourcing line not found');
      if (row.line.status !== 'open' || row.requestStatus !== 'open') throw new ConflictException('This sourcing line is no longer open');
      if (row.jobStatus === 'queued' || row.jobStatus === 'researching') throw new ConflictException('Supplier research is already active');

      const [notificationCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(sourcingLineNotifications)
        .where(eq(sourcingLineNotifications.sourcingLineId, lineId));
      const foundCount = Math.min(MAX_MATCHES_PER_LINE, Number(notificationCount?.count ?? 0));
      if (foundCount >= MAX_MATCHES_PER_LINE) throw new ConflictException('This line already has five suppliers');

      await tx
        .insert(sourcingResearchJobs)
        .values({
          tenantId: ctx.tenantId,
          sourcingLineId: lineId,
          status: 'queued',
          targetCount: MAX_MATCHES_PER_LINE,
          foundCount,
        })
        .onConflictDoUpdate({
          target: sourcingResearchJobs.sourcingLineId,
          set: { status: 'queued', foundCount, lastError: null, startedAt: null, completedAt: null, updatedAt: new Date() },
        });

      await this.events.emit(tx, ctx, {
        type: 'sourcing.sourcing_line_unmatched',
        version: 1,
        aggregateType: 'sourcing_line',
        aggregateId: lineId,
        payload: {
          sourcingLineId: lineId,
          categoryId: row.line.categoryId,
          itemCode: row.line.itemCode,
          description: row.line.description,
          qty: row.line.qty,
          uom: row.line.uom,
          deliveryCity: row.line.deliveryCity,
          deliveryState: row.line.deliveryState,
          needBy: row.line.needBy,
          neededSupplierCount: MAX_MATCHES_PER_LINE - foundCount,
        },
      });
      await this.audit.record(tx, ctx, {
        action: 'sourcing_research.retried',
        entityType: 'sourcing_line',
        entityId: lineId,
        data: { sourcingRequestId: requestId, foundCount, targetCount: MAX_MATCHES_PER_LINE },
      });
      return { status: 'queued' as const, foundCount, targetCount: MAX_MATCHES_PER_LINE };
    });
  }

  /** The "Email" button on a supplier row -- always sends for real via the live SMTP provider, regardless
   *  of EMAIL_DELIVERY_MODE, and regardless of whether this notification already shows sentAt from an
   *  earlier capture-mode auto-send. See apps/worker/src/consumers/sourcing-manual-mailer.ts. */
  async manualEmail(ctx: RequestContext, requestId: string, lineId: string, notificationId: string) {
    return this.tenantDb.run(ctx, async (tx) => {
      const [row] = await tx
        .select({ id: sourcingLineNotifications.id })
        .from(sourcingLineNotifications)
        .innerJoin(sourcingLines, eq(sourcingLines.id, sourcingLineNotifications.sourcingLineId))
        .where(and(eq(sourcingLineNotifications.id, notificationId), eq(sourcingLines.id, lineId), eq(sourcingLines.sourcingRequestId, requestId)));
      if (!row) throw new NotFoundException('Supplier notification not found');

      await this.events.emit(tx, ctx, {
        type: 'sourcing.supplier_manual_email_requested',
        version: 1,
        aggregateType: 'sourcing_line_notification',
        aggregateId: notificationId,
        payload: { notificationId, sourcingLineId: lineId },
      });
      await this.audit.record(tx, ctx, {
        action: 'sourcing_line_notification.manual_email_requested',
        entityType: 'sourcing_line_notification',
        entityId: notificationId,
        data: { sourcingLineId: lineId },
      });
      return { requested: true as const };
    });
  }

  /** The compatibility voice row stores latest state; supplier_contact_attempts keeps every retry. */
  async manualCall(ctx: RequestContext, requestId: string, lineId: string, notificationId: string) {
    return this.tenantDb.run(ctx, async (tx) => {
      const [row] = await tx
        .select({ platformSupplierId: sourcingLineNotifications.platformSupplierId, phone: platformSuppliers.phone })
        .from(sourcingLineNotifications)
        .innerJoin(sourcingLines, eq(sourcingLines.id, sourcingLineNotifications.sourcingLineId))
        .leftJoin(platformSuppliers, eq(platformSuppliers.id, sourcingLineNotifications.platformSupplierId))
        .where(and(eq(sourcingLineNotifications.id, notificationId), eq(sourcingLines.id, lineId), eq(sourcingLines.sourcingRequestId, requestId)));
      if (!row) throw new NotFoundException('Supplier notification not found');
      const phone = row.phone?.trim();
      if (!phone) throw new BadRequestException('This supplier has no phone number on file');

      const [voiceCall] = await tx
        .insert(supplierVoiceCalls)
        .values({ tenantId: ctx.tenantId, notificationId, sourcingLineId: lineId, platformSupplierId: row.platformSupplierId, phone, status: 'queued' })
        .onConflictDoUpdate({
          target: supplierVoiceCalls.notificationId,
          set: { phone, status: 'queued', failureReason: null, attemptId: null, interactionId: null, durationSeconds: null, startedAt: null, completedAt: null, updatedAt: new Date() },
        })
        .returning({ id: supplierVoiceCalls.id });
      const [contactAttempt] = await tx
        .insert(supplierContactAttempts)
        .values({
          tenantId: ctx.tenantId,
          notificationId,
          sourcingLineId: lineId,
          platformSupplierId: row.platformSupplierId,
          voiceCallId: voiceCall!.id,
          channel: 'voice',
          purpose: 'rfq',
          provider: 'sarvam',
          status: 'queued',
        })
        .returning({ id: supplierContactAttempts.id });

      await this.events.emit(tx, ctx, {
        type: 'sourcing.supplier_call_requested',
        version: 1,
        aggregateType: 'supplier_voice_call',
        aggregateId: voiceCall!.id,
        payload: { voiceCallId: voiceCall!.id, contactAttemptId: contactAttempt!.id, notificationId, sourcingLineId: lineId },
      });
      await this.audit.record(tx, ctx, {
        action: 'sourcing_line_notification.manual_call_requested',
        entityType: 'sourcing_line_notification',
        entityId: notificationId,
        data: { sourcingLineId: lineId, voiceCallId: voiceCall!.id, contactAttemptId: contactAttempt!.id },
      });
      return { requested: true as const };
    });
  }

  /**
   * A genuine delete, not a soft-delete/cancel: the audit log (append-only, independent of these rows)
   * keeps the history regardless, and a deleted line's invite link correctly falls through to the existing
   * "invalid or expired" response -- no separate cancelled-state handling needed there.
   *
   * Bidding now exists (Phase B): a request with any bid on any of its lines can't be deleted outright --
   * refunding wallet debits for open-but-unaccepted bids isn't decided yet (see the plan doc's deferred
   * items), so the safe default is to block the delete entirely rather than silently orphan/refund nothing.
   */
  async remove(ctx: RequestContext, id: string): Promise<void> {
    await this.tenantDb.run(ctx, async (tx) => {
      const [request] = await tx.select().from(sourcingRequests).where(eq(sourcingRequests.id, id));
      if (!request) throw new NotFoundException();

      const lines = await tx.select({ id: sourcingLines.id }).from(sourcingLines).where(eq(sourcingLines.sourcingRequestId, id));
      const lineIds = lines.map((l) => l.id);
      if (lineIds.length > 0) {
        const [existingBid] = await tx.select({ id: bids.id }).from(bids).where(inArray(bids.sourcingLineId, lineIds)).limit(1);
        if (existingBid) throw new ConflictException('Cannot delete a sourcing request that already has bids on it');

        await tx.delete(bidDrafts).where(inArray(bidDrafts.sourcingLineId, lineIds));
        await tx.delete(itemClarificationMessages).where(inArray(itemClarificationMessages.sourcingLineId, lineIds));
        await tx.delete(supplierLineResponses).where(inArray(supplierLineResponses.sourcingLineId, lineIds));
        await tx.delete(supplierContactAttempts).where(inArray(supplierContactAttempts.sourcingLineId, lineIds));
        await tx.delete(supplierVoiceCalls).where(inArray(supplierVoiceCalls.sourcingLineId, lineIds));
        await tx.delete(sourcingLineNotifications).where(inArray(sourcingLineNotifications.sourcingLineId, lineIds));
        await tx.delete(sourcingResearchJobs).where(inArray(sourcingResearchJobs.sourcingLineId, lineIds));
        await tx.delete(sourcingLines).where(eq(sourcingLines.sourcingRequestId, id));
      }
      await tx.delete(sourcingRequests).where(eq(sourcingRequests.id, id));

      await this.audit.record(tx, ctx, {
        action: 'sourcing_request.deleted',
        entityType: 'sourcing_request',
        entityId: id,
        data: { title: request.title, lineCount: lineIds.length },
      });
      await this.events.emit(tx, ctx, {
        type: 'sourcing.sourcing_request_deleted',
        version: 1,
        aggregateType: 'sourcing_request',
        aggregateId: id,
        payload: { sourcingRequestId: id, lineCount: lineIds.length },
      });
    });
  }

  async createManual(ctx: RequestContext, input: CreateManualRequest) {
    const lines: ParsedLine[] = await Promise.all(
      input.lines.map(async ({ category, ...rest }) => ({ ...rest, categoryId: await this.categoryResolver.resolve(category) })),
    );
    return this.commit(ctx, input.title, 'manual', lines, input.sourcingRequestId);
  }

  async importBom(ctx: RequestContext, input: ImportBomRequest) {
    const doc = await this.documents.get(ctx, input.documentId);
    if (doc.status !== 'clean') throw new BadRequestException(`Document is ${doc.status}; only a scanned-clean file can be imported`);

    const url = await this.storage.presignGetForExcelService(doc.bucket, doc.objectKey);
    const res = await fetch(`${this.config.EXCEL_SERVICE_URL}/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, file_name: doc.fileName }),
    });
    if (!res.ok) throw new BadRequestException(`Could not read the file: ${await res.text()}`);
    const sheet = (await res.json()) as { headers: string[]; rows: unknown[][] };

    const { mapping, unrecognized } = matchBomHeaders(sheet.headers);
    const missing = missingRequiredColumns(mapping);
    if (missing.length > 0) {
      return { status: 'template_error' as const, missingColumns: missing, unrecognizedColumns: unrecognized };
    }

    const parsed: BomRowResult[] = sheet.rows.map((cells, i) => parseBomRow(i + 1, cells, mapping));
    const rowErrors = parsed.filter((r): r is { row: number; ok: false; errors: string[] } => !r.ok);
    if (rowErrors.length > 0) {
      return { status: 'row_errors' as const, rowErrors, validCount: parsed.length - rowErrors.length, totalRows: parsed.length };
    }
    const validRows = parsed.filter((r): r is { row: number; ok: true; value: BomLineValue } => r.ok);

    // A category free-text value resolves-or-creates (CategoryResolverService) instead of being rejected as
    // "unknown" against a fixed list -- any BOM from any domain commits, and a genuinely new category just
    // becomes a new row. Resolved once per distinct name (a BOM commonly repeats the same category across
    // many rows), before the request even opens a DB transaction.
    const categoryNames = [...new Set(validRows.map((r) => r.value.category))];
    const categoryIdByName = new Map<string, string>();
    for (const name of categoryNames) categoryIdByName.set(name, await this.categoryResolver.resolve(name));

    const lines: ParsedLine[] = validRows.map(({ value: v }) => ({
      itemCode: v.itemCode,
      brandManufacturer: v.brandManufacturer,
      hsnMfgCode: v.hsnMfgCode,
      description: v.description,
      categoryId: categoryIdByName.get(v.category)!,
      qty: v.qty,
      uom: v.uom,
      deliveryCity: v.deliveryCity,
      deliveryState: v.deliveryState,
      needBy: v.needBy,
      inviteEmails: v.inviteEmails
        ? v.inviteEmails.split(/[;,]/).map((e) => e.trim()).filter(Boolean)
        : undefined,
    }));

    return this.commit(ctx, input.title, 'bom_upload', lines);
  }

  private async commit(ctx: RequestContext, title: string, source: 'manual' | 'bom_upload', lines: ParsedLine[], existingRequestId?: string) {
    return this.tenantDb.run(ctx, async (tx) => {
      let request = null;
      if (source === 'manual' && existingRequestId) {
        [request] = await tx
          .select()
          .from(sourcingRequests)
          .where(and(eq(sourcingRequests.id, existingRequestId), eq(sourcingRequests.source, 'manual'), eq(sourcingRequests.status, 'open')))
          .limit(1);
        if (existingRequestId && !request) throw new ConflictException('The selected custom request is no longer open');
      }

      const appending = Boolean(request);
      if (!request) {
        [request] = await tx.insert(sourcingRequests).values({ tenantId: ctx.tenantId, title, source, createdBy: ctx.userId }).returning();
        await this.audit.record(tx, ctx, { action: 'sourcing_request.created', entityType: 'sourcing_request', entityId: request!.id, data: { title, source, lineCount: lines.length } });
        await this.events.emit(tx, ctx, {
          type: 'sourcing.sourcing_request_created',
          version: 1,
          aggregateType: 'sourcing_request',
          aggregateId: request!.id,
          payload: { sourcingRequestId: request!.id, lineCount: lines.length },
        });
      } else {
        await this.audit.record(tx, ctx, {
          action: 'sourcing_request.lines_added',
          entityType: 'sourcing_request',
          entityId: request.id,
          data: { lineCount: lines.length },
        });
      }

      const summaries: MatchSummary[] = [];
      for (const line of lines) {
        const summary = await this.commitLine(tx, ctx, request!.id, line);
        summaries.push(summary);
      }

      // Aggregated totals, emitted once the whole request (not just one line) is fully matched, so the
      // buyer-summary email (worker) can build its counts straight from the payload with no re-query.
      await this.events.emit(tx, ctx, {
        type: 'sourcing.sourcing_request_matched',
        version: 1,
        aggregateType: 'sourcing_request',
        aggregateId: request!.id,
        payload: {
          sourcingRequestId: request!.id,
          title: request!.title,
          lineCount: lines.length,
          matchedSupplierCount: summaries.reduce((n, s) => n + s.matchedSupplierCount, 0),
          invitedNewCount: summaries.reduce((n, s) => n + s.invitedNewCount, 0),
        },
      });

      return { sourcingRequestId: request!.id, title: request!.title, lineCount: lines.length, matches: summaries, appended: appending };
    });
  }

  private async commitLine(tx: Tx, ctx: RequestContext, sourcingRequestId: string, line: ParsedLine): Promise<MatchSummary> {
    const [row] = await tx
      .insert(sourcingLines)
      .values({
        tenantId: ctx.tenantId,
        sourcingRequestId,
        itemCode: line.itemCode,
        brandManufacturer: line.brandManufacturer,
        hsnMfgCode: line.hsnMfgCode,
        description: line.description,
        categoryId: line.categoryId,
        qty: String(line.qty),
        uom: line.uom,
        deliveryCity: line.deliveryCity,
        deliveryState: line.deliveryState,
        needBy: line.needBy,
        createdBy: ctx.userId,
        correlationId: ctx.correlationId,
      })
      .returning();

    const itemFingerprint = supplierResearchFingerprint(row!);
    const equivalentRows = await tx
      .select({ source: itemEquivalences.sourceFingerprint, target: itemEquivalences.targetFingerprint })
      .from(itemEquivalences)
      .where(and(
        eq(itemEquivalences.status, 'approved'),
        or(eq(itemEquivalences.sourceFingerprint, itemFingerprint), eq(itemEquivalences.targetFingerprint, itemFingerprint)),
      ));
    const acceptedFingerprints = [itemFingerprint, ...equivalentRows.map((equivalence) =>
      equivalence.source === itemFingerprint ? equivalence.target : equivalence.source,
    )];
    // Item evidence leads. Category-only suppliers are retained as a small exploration fallback, but can no
    // longer fill all five slots and prevent exact item-code/specification research from running.
    const exactMatches = await tx
      .select({
        id: platformSuppliers.id,
        email: platformSuppliers.email,
        city: platformSuppliers.city,
        state: platformSuppliers.state,
        matchScore: supplierItemClaims.matchScore,
        evidenceScore: supplierItemClaims.evidenceScore,
        sourceWeight: supplierItemClaims.sourceWeight,
        outcomeScore: supplierItemClaims.outcomeScore,
        lastVerifiedAt: supplierItemClaims.lastVerifiedAt,
      })
      .from(platformSuppliers)
      .innerJoin(supplierItemClaims, eq(supplierItemClaims.platformSupplierId, platformSuppliers.id))
      .where(and(
        inArray(supplierItemClaims.itemFingerprint, acceptedFingerprints),
        gt(supplierItemClaims.expiresAt, new Date()),
        inArray(platformSuppliers.status, ['active', 'prospect']),
      ))
      .limit(MAX_MATCHES_PER_LINE * 3);
    const exactRanked = rankByItemEvidence(exactMatches, line.deliveryCity, line.deliveryState).slice(0, MAX_MATCHES_PER_LINE);
    const exactIds = new Set(exactRanked.map((supplier) => supplier.id));

    const categoryFallback = exactRanked.length < MAX_MATCHES_PER_LINE
      ? await tx
        .select({ id: platformSuppliers.id, email: platformSuppliers.email, city: platformSuppliers.city, state: platformSuppliers.state })
        .from(platformSuppliers)
        .innerJoin(supplierCategories, eq(supplierCategories.platformSupplierId, platformSuppliers.id))
        .where(and(eq(supplierCategories.categoryId, line.categoryId), eq(platformSuppliers.status, 'active')))
        .limit(MAX_MATCHES_PER_LINE * 3)
      : [];
    const fallbackRanked = rankByLocation(categoryFallback.filter((supplier) => !exactIds.has(supplier.id)), line.deliveryCity, line.deliveryState)
      .slice(0, Math.min(2, MAX_MATCHES_PER_LINE - exactRanked.length));
    const effectiveMatched = [...exactRanked, ...fallbackRanked].slice(0, MAX_MATCHES_PER_LINE);

    const notifyEmails = new Map<string, string | null>(); // email -> platformSupplierId | null
    for (const s of effectiveMatched) notifyEmails.set(s.email, s.id);
    for (const email of line.inviteEmails ?? []) if (!notifyEmails.has(email)) notifyEmails.set(email, null);

    let invitedNewCount = 0;
    for (const [email, platformSupplierId] of notifyEmails) {
      if (!platformSupplierId) invitedNewCount++;
      await tx
        .insert(sourcingLineNotifications)
        .values({ tenantId: ctx.tenantId, sourcingLineId: row!.id, email, platformSupplierId, itemFingerprint })
        .onConflictDoNothing();
    }

    await this.audit.record(tx, ctx, {
      action: 'sourcing_line.created',
      entityType: 'sourcing_line',
      entityId: row!.id,
      data: { description: line.description, matchedSupplierCount: effectiveMatched.length, invitedNewCount },
    });
    // Notification rows carry no token yet -- the worker generates one per invite only when it actually
    // sends the email (see apps/worker/src/consumers/sourcing-invite-mailer.ts). A raw invite token must
    // never sit in a durable, replayable event payload.
    await this.events.emit(tx, ctx, {
      type: 'sourcing.sourcing_line_matched',
      version: 1,
      aggregateType: 'sourcing_line',
      aggregateId: row!.id,
      payload: { sourcingLineId: row!.id, matchedSupplierCount: effectiveMatched.length, invitedNewCount },
    });

    // Tier 3: fewer than five suppliers from the local DB/prospect cache -- ask the AI supplier-discovery
    // consumer (apps/worker/.../supplier-research-agent.ts) to fill the remaining slots with Google-backed research.
    // Only successful runs that found suppliers activate the exact-item cooldown. Empty or failed research
    // must remain retryable; otherwise one upstream outage can suppress every later line for a full day.
    const initialFoundCount = Math.min(MAX_MATCHES_PER_LINE, notifyEmails.size);
    let researchStatus: 'queued' | 'completed' | 'partial' = initialFoundCount >= MAX_MATCHES_PER_LINE ? 'completed' : 'partial';
    if (initialFoundCount < MAX_MATCHES_PER_LINE) {
      const [recentRun] = await tx
        .select({ id: supplierResearchRuns.id })
        .from(supplierResearchRuns)
        .where(
          and(
            eq(supplierResearchRuns.itemFingerprint, itemFingerprint),
            gt(supplierResearchRuns.candidatesFound, 0),
            gt(supplierResearchRuns.triggeredAt, sql`now() - (interval '1 hour' * ${RESEARCH_RETRY_HOURS})`),
          ),
        )
        .limit(1);
      if (!recentRun) {
        researchStatus = 'queued';
        await this.events.emit(tx, ctx, {
          type: 'sourcing.sourcing_line_unmatched',
          version: 1,
          aggregateType: 'sourcing_line',
          aggregateId: row!.id,
          payload: {
            sourcingLineId: row!.id,
            categoryId: line.categoryId,
            itemCode: row!.itemCode,
            description: row!.description,
            qty: row!.qty,
            uom: row!.uom,
            deliveryCity: row!.deliveryCity,
            deliveryState: row!.deliveryState,
            needBy: row!.needBy,
            neededSupplierCount: MAX_MATCHES_PER_LINE - initialFoundCount,
          },
        });
      }
    }
    await tx.insert(sourcingResearchJobs).values({
      tenantId: ctx.tenantId,
      sourcingLineId: row!.id,
      status: researchStatus,
      targetCount: MAX_MATCHES_PER_LINE,
      foundCount: initialFoundCount,
      completedAt: researchStatus === 'queued' ? null : new Date(),
    });

    return { description: line.description, matchedSupplierCount: effectiveMatched.length, invitedNewCount };
  }
}

type LocatableSupplier = { id: string; email: string; city: string; state: string };
type ItemEvidenceSupplier = LocatableSupplier & {
  matchScore: string;
  evidenceScore: string;
  sourceWeight: string;
  outcomeScore: string;
  lastVerifiedAt: Date;
};

/** Ranks candidates by exact city then exact state match -- shared by both the active-supplier and
 *  prospect-supplier matching queries in commitLine, so they rank identically. */
function rankByLocation<T extends LocatableSupplier>(rows: T[], city: string, state: string): (T & { score: number })[] {
  return rows
    .map((s) => ({ ...s, score: (s.city === city ? 2 : 0) + (s.state === state ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
}

function rankByItemEvidence<T extends ItemEvidenceSupplier>(rows: T[], city: string, state: string): (T & { score: number })[] {
  return rows
    .map((supplier) => ({
      ...supplier,
      score: supplierItemRecommendationScore(supplier)
        + (supplier.city === city ? 0.1 : supplier.state === state ? 0.05 : 0),
    }))
    .sort((a, b) => b.score - a.score);
}
