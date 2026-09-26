import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  categories as categoriesTable,
  platformSuppliers,
  sourcingLineNotifications,
  sourcingLines,
  sourcingRequests,
  supplierCategories,
  type Tx,
} from '@vprocly/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { EventsService } from '../../platform/events.service.js';
import type { RequestContext } from '../../platform/request-context.js';
import { AuditService } from '../audit-evidence/index.js';
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
const MAX_MATCHES_PER_LINE = 10;

export const ManualLine = z.object({
  itemCode: z.string().trim().max(64).optional(),
  description: z.string().trim().min(1).max(500),
  categoryId: z.uuid(),
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

export const ImportBomRequest = z.object({
  title: z.string().trim().min(1).max(255),
  documentId: z.uuid(),
});
export type ImportBomRequest = z.infer<typeof ImportBomRequest>;

type ParsedLine = Omit<ManualLine, 'categoryId'> & { categoryId: string };

type MatchSummary = { description: string; matchedSupplierCount: number; invitedNewCount: number };

@Injectable()
export class SourcingService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly documents: DocumentsService,
    private readonly storage: ObjectStorage,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  bomTemplateFields() {
    return BOM_TEMPLATE_FIELDS;
  }

  list(ctx: RequestContext) {
    return this.tenantDb.run(ctx, (tx) => tx.select().from(sourcingRequests).orderBy(sourcingRequests.createdAt));
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
      return { ...request, lines: lines.map((l) => ({ ...l, notifiedCount: notifiedByLine.get(l.id) ?? 0 })) };
    });
  }

  async createManual(ctx: RequestContext, input: CreateManualRequest) {
    const lines: ParsedLine[] = input.lines;
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

    const categoryNames = [...new Set(validRows.map((r) => r.value.category))];
    const categoryIdByName = await this.resolveCategoryIds(ctx, categoryNames);
    const unknownCategories = categoryNames.filter((c) => !categoryIdByName.has(c.toLowerCase()));
    if (unknownCategories.length > 0) {
      return { status: 'template_error' as const, missingColumns: [], unrecognizedColumns: [], unknownCategories };
    }

    const lines: ParsedLine[] = validRows.map(({ value: v }) => ({
      itemCode: v.itemCode,
      description: v.description,
      categoryId: categoryIdByName.get(v.category.toLowerCase())!,
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

  /** Case-insensitive match against the fixed taxonomy; there are only ~12 categories, so fetch once and match in memory. */
  private async resolveCategoryIds(ctx: RequestContext, names: string[]): Promise<Map<string, string>> {
    if (names.length === 0) return new Map();
    const all = await this.tenantDb.run(ctx, (tx) => tx.select().from(categoriesTable));
    const map = new Map<string, string>();
    for (const name of names) {
      const hit = all.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (hit) map.set(name.toLowerCase(), hit.id);
    }
    return map;
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
    // by exact city then exact state. AI/semantic ranking is a documented fast-follow, not MVP.
    const matched = await tx
      .select({ id: platformSuppliers.id, email: platformSuppliers.email, city: platformSuppliers.city, state: platformSuppliers.state })
      .from(platformSuppliers)
      .innerJoin(supplierCategories, eq(supplierCategories.platformSupplierId, platformSuppliers.id))
      .where(and(eq(supplierCategories.categoryId, line.categoryId), eq(platformSuppliers.status, 'active')))
      .limit(MAX_MATCHES_PER_LINE * 3); // over-fetch, then rank in JS -- fine at this volume

    const ranked = matched
      .map((s) => ({ ...s, score: (s.city === line.deliveryCity ? 2 : 0) + (s.state === line.deliveryState ? 1 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES_PER_LINE);

    const notifyEmails = new Map<string, string | null>(); // email -> platformSupplierId | null
    for (const s of ranked) notifyEmails.set(s.email, s.id);
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
      data: { description: line.description, matchedSupplierCount: ranked.length, invitedNewCount },
    });
    // Notification rows carry no token yet -- the worker generates one per invite only when it actually
    // sends the email (see apps/worker/src/consumers/sourcing-invite-mailer.ts). A raw invite token must
    // never sit in a durable, replayable event payload.
    await this.events.emit(tx, ctx, {
      type: 'sourcing.sourcing_line_matched',
      version: 1,
      aggregateType: 'sourcing_line',
      aggregateId: row!.id,
      payload: { sourcingLineId: row!.id, matchedSupplierCount: ranked.length, invitedNewCount },
    });

    return { description: line.description, matchedSupplierCount: ranked.length, invitedNewCount };
  }
}
