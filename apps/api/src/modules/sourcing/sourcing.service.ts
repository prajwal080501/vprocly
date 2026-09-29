import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  bids,
  platformSuppliers,
  purchaseOrders,
  sourcingLineNotifications,
  sourcingLines,
  sourcingResearchJobs,
  sourcingRequests,
  suppliers,
  supplierCategories,
  supplierResearchRuns,
  supplierVoiceCalls,
  tenants,
  type Tx,
  users,
} from '@vprocly/db';
import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
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

/** A hopeless category (AI research found nothing usable) only gets re-tried this often -- otherwise every
 *  subsequent BOM line in the same category would re-trigger full paid Gemini+Places research forever. */
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
  lines: z.array(ManualLine).min(1).max(200),
});
export type CreateManualRequest = z.infer<typeof CreateManualRequest>;

export const InviteToLineInput = z.object({
  emails: z.array(z.email()).min(1).max(10),
});
export type InviteToLineInput = z.infer<typeof InviteToLineInput>;

export const ImportBomRequest = z.object({
  title: z.string().trim().min(1).max(255),
  documentId: z.uuid(),
});
export type ImportBomRequest = z.infer<typeof ImportBomRequest>;

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
            })
            .from(sourcingLineNotifications)
            .leftJoin(platformSuppliers, eq(platformSuppliers.id, sourcingLineNotifications.platformSupplierId))
            .leftJoin(supplierVoiceCalls, eq(supplierVoiceCalls.notificationId, sourcingLineNotifications.id))
            .where(inArray(sourcingLineNotifications.sourcingLineId, lineIds))
            .orderBy(asc(sourcingLineNotifications.createdAt))
        : [];
      const notificationViews = notificationRows.map((notification) => ({
        ...notification,
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
      const bidsByLine = new Map<string, typeof submittedBids>();
      for (const bid of submittedBids) {
        const lineBids = bidsByLine.get(bid.sourcingLineId) ?? [];
        lineBids.push(bid);
        bidsByLine.set(bid.sourcingLineId, lineBids);
      }
      const researchJobs = lineIds.length
        ? await tx.select().from(sourcingResearchJobs).where(inArray(sourcingResearchJobs.sourcingLineId, lineIds))
        : [];
      const researchJobByLine = new Map(researchJobs.map((job) => [job.sourcingLineId, job]));
      return {
        ...request,
        lines: lines.map((line) => ({
          ...line,
          notifiedCount: notifiedByLine.get(line.id) ?? 0,
          supplierResearch: notificationsByLine.get(line.id) ?? [],
          researchJob: researchJobByLine.get(line.id) ?? null,
          bids: bidsByLine.get(line.id) ?? [],
        })),
      };
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
          currency: row.currency,
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
        .select({ id: sourcingLines.id, status: sourcingLines.status })
        .from(sourcingLines)
        .where(and(eq(sourcingLines.id, lineId), eq(sourcingLines.sourcingRequestId, requestId)));
      if (!line) throw new NotFoundException('Sourcing line not found');
      if (line.status !== 'open') throw new ConflictException('This line is no longer open for new invites');

      const uniqueEmails = [...new Set(emails)];
      let invitedNewCount = 0;
      for (const email of uniqueEmails) {
        const [inserted] = await tx
          .insert(sourcingLineNotifications)
          .values({ tenantId: ctx.tenantId, sourcingLineId: lineId, email })
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

  /** The "Call" button on a supplier row -- always dials for real via Sarvam, regardless of
   *  VOICE_DELIVERY_MODE. Retries in place: reuses the existing supplier_voice_calls row for this
   *  notification (its notification_id column is unique) rather than keeping per-attempt history. */
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

      await this.events.emit(tx, ctx, {
        type: 'sourcing.supplier_call_requested',
        version: 1,
        aggregateType: 'supplier_voice_call',
        aggregateId: voiceCall!.id,
        payload: { voiceCallId: voiceCall!.id, notificationId, sourcingLineId: lineId },
      });
      await this.audit.record(tx, ctx, {
        action: 'sourcing_line_notification.manual_call_requested',
        entityType: 'sourcing_line_notification',
        entityId: notificationId,
        data: { sourcingLineId: lineId, voiceCallId: voiceCall!.id },
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
    return this.commit(ctx, input.title, 'manual', lines);
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

  private async commit(ctx: RequestContext, title: string, source: 'manual' | 'bom_upload', lines: ParsedLine[]) {
    return this.tenantDb.run(ctx, async (tx) => {
      const [request] = await tx.insert(sourcingRequests).values({ tenantId: ctx.tenantId, title, source, createdBy: ctx.userId }).returning();
      await this.audit.record(tx, ctx, { action: 'sourcing_request.created', entityType: 'sourcing_request', entityId: request!.id, data: { title, source, lineCount: lines.length } });
      await this.events.emit(tx, ctx, {
        type: 'sourcing.sourcing_request_created',
        version: 1,
        aggregateType: 'sourcing_request',
        aggregateId: request!.id,
        payload: { sourcingRequestId: request!.id, lineCount: lines.length },
      });

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
          title,
          lineCount: lines.length,
          matchedSupplierCount: summaries.reduce((n, s) => n + s.matchedSupplierCount, 0),
          invitedNewCount: summaries.reduce((n, s) => n + s.invitedNewCount, 0),
        },
      });

      return { sourcingRequestId: request!.id, title, lineCount: lines.length, matches: summaries };
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

    // Matching is deliberately simple (blueprint: "avoid premature complexity"): exact category match, ranked
    // by exact city then exact state. AI/semantic ranking of *which* category a line belongs to happens once,
    // up front, in CategoryResolverService -- this join itself stays exact categoryId equality.
    const activeMatches = await tx
      .select({ id: platformSuppliers.id, email: platformSuppliers.email, city: platformSuppliers.city, state: platformSuppliers.state })
      .from(platformSuppliers)
      .innerJoin(supplierCategories, eq(supplierCategories.platformSupplierId, platformSuppliers.id))
      .where(and(eq(supplierCategories.categoryId, line.categoryId), eq(platformSuppliers.status, 'active')))
      .limit(MAX_MATCHES_PER_LINE * 3); // over-fetch, then rank in JS -- fine at this volume
    const ranked = rankByLocation(activeMatches, line.deliveryCity, line.deliveryState).slice(0, MAX_MATCHES_PER_LINE);

    // Tier 2: no active supplier in this category yet, but a *prior* AI research run already found and
    // invited prospects for it -- re-notify them instead of paying for research again. A prospect is a known
    // platform_suppliers row (just not yet signed up for real), so it counts as "matched," not "invited new."
    let prospectRanked: typeof ranked = [];
    if (ranked.length === 0) {
      const prospectMatches = await tx
        .select({ id: platformSuppliers.id, email: platformSuppliers.email, city: platformSuppliers.city, state: platformSuppliers.state })
        .from(platformSuppliers)
        .innerJoin(supplierCategories, eq(supplierCategories.platformSupplierId, platformSuppliers.id))
        .where(and(eq(supplierCategories.categoryId, line.categoryId), eq(platformSuppliers.status, 'prospect')))
        .limit(MAX_MATCHES_PER_LINE * 3);
      prospectRanked = rankByLocation(prospectMatches, line.deliveryCity, line.deliveryState).slice(0, MAX_MATCHES_PER_LINE);
    }
    const effectiveMatched = ranked.length > 0 ? ranked : prospectRanked;

    const notifyEmails = new Map<string, string | null>(); // email -> platformSupplierId | null
    for (const s of effectiveMatched) notifyEmails.set(s.email, s.id);
    for (const email of line.inviteEmails ?? []) if (!notifyEmails.has(email)) notifyEmails.set(email, null);

    let invitedNewCount = 0;
    for (const [email, platformSupplierId] of notifyEmails) {
      if (!platformSupplierId) invitedNewCount++;
      await tx
        .insert(sourcingLineNotifications)
        .values({ tenantId: ctx.tenantId, sourcingLineId: row!.id, email, platformSupplierId })
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
    // Only successful runs that found suppliers activate the category cooldown. Empty or failed research
    // must remain retryable; otherwise one upstream outage can suppress every later line for a full day.
    const initialFoundCount = Math.min(MAX_MATCHES_PER_LINE, notifyEmails.size);
    let researchStatus: 'queued' | 'completed' | 'partial' = initialFoundCount >= MAX_MATCHES_PER_LINE ? 'completed' : 'partial';
    if (initialFoundCount < MAX_MATCHES_PER_LINE) {
      const [recentRun] = await tx
        .select({ id: supplierResearchRuns.id })
        .from(supplierResearchRuns)
        .where(
          and(
            eq(supplierResearchRuns.categoryId, line.categoryId),
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

/** Ranks candidates by exact city then exact state match -- shared by both the active-supplier and
 *  prospect-supplier matching queries in commitLine, so they rank identically. */
function rankByLocation<T extends LocatableSupplier>(rows: T[], city: string, state: string): (T & { score: number })[] {
  return rows
    .map((s) => ({ ...s, score: (s.city === city ? 2 : 0) + (s.state === state ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
}
