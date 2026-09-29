import { date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { categories, platformSuppliers } from './marketplace.js';
import { suppliers } from './master-data.js';
import { id, provenance, tenantId, timestamps } from './columns.js';
import { tenants } from './tenancy.js';

/** One buyer's posting: a BOM upload or a manually-entered set of line items open for supplier bidding. */
export const sourcingRequests = pgTable('sourcing_requests', {
  id: id(),
  tenantId: tenantId().references(() => tenants.id),
  title: text('title').notNull(),
  source: text('source').notNull(), // 'manual' | 'bom_upload'
  status: text('status').notNull().default('open'), // 'open' | 'closed'
  createdBy: uuid('created_by'),
  ...timestamps,
});

export const sourcingLines = pgTable('sourcing_lines', {
  id: id(),
  tenantId: tenantId().references(() => tenants.id),
  sourcingRequestId: uuid('sourcing_request_id').notNull().references(() => sourcingRequests.id),
  itemCode: text('item_code'),
  brandManufacturer: text('brand_manufacturer'),
  hsnMfgCode: text('hsn_mfg_code'),
  description: text('description').notNull(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  qty: numeric('qty', { precision: 14, scale: 3 }).notNull(),
  uom: text('uom').notNull(),
  deliveryCity: text('delivery_city').notNull(),
  deliveryState: text('delivery_state').notNull(),
  needBy: date('need_by'),
  status: text('status').notNull().default('open'), // 'open' | 'awarded' | 'closed'
  ...provenance,
  ...timestamps,
});

/** Durable, buyer-visible progress for the local-match + Google research workflow. One row follows each
 * sourcing line through queued, active, terminal, and manually retried states. */
export const sourcingResearchJobs = pgTable(
  'sourcing_research_jobs',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id).unique(),
    status: text('status').notNull().default('queued'), // queued | researching | completed | partial | failed
    targetCount: integer('target_count').notNull().default(5),
    foundCount: integer('found_count').notNull().default(0),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('sourcing_research_jobs_status_idx').on(t.tenantId, t.status)],
);

/**
 * Tracks who was told about a line, so a supplier is never emailed twice for the same line: already-registered
 * matched suppliers get `platformSupplierId` set immediately; a cold-start email invite (new or existing
 * supplier) also gets a signup token. Tenant-scoped like the request it belongs to, even though it points at
 * a platform-level supplier.
 */
export const sourcingLineNotifications = pgTable(
  'sourcing_line_notifications',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id),
    email: text('email').notNull(),
    platformSupplierId: uuid('platform_supplier_id').references(() => platformSuppliers.id),
    tokenHash: text('token_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique().on(t.sourcingLineId, t.email), index('sourcing_line_notifications_line_idx').on(t.sourcingLineId)],
);

/** One outbound voice attempt per supplier notification. The terminal result decides whether the bidding
 * email is suppressed (`connected`) or requested as a fallback (`no_answer`, `busy`, `failed`, `skipped`). */
export const supplierVoiceCalls = pgTable(
  'supplier_voice_calls',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    notificationId: uuid('notification_id').notNull().references(() => sourcingLineNotifications.id).unique(),
    sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id),
    platformSupplierId: uuid('platform_supplier_id').references(() => platformSuppliers.id),
    provider: text('provider').notNull().default('sarvam'),
    phone: text('phone').notNull(),
    status: text('status').notNull().default('queued'), // queued | dialing | connected | no_answer | busy | failed | skipped
    attemptId: text('attempt_id').unique(),
    interactionId: text('interaction_id'),
    durationSeconds: numeric('duration_seconds', { precision: 10, scale: 2 }),
    failureReason: text('failure_reason'),
    finalAgentVariables: jsonb('final_agent_variables').$type<Record<string, unknown>>(),
    interactionTranscript: jsonb('interaction_transcript').$type<Array<{ role: 'agent' | 'user'; enText: string }>>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('supplier_voice_calls_line_idx').on(t.sourcingLineId), index('supplier_voice_calls_status_idx').on(t.tenantId, t.status)],
);

/**
 * A supplier's price quote on a line. Tenant-scoped and RLS-protected like the line it bids on -- the
 * buyer eventually needs to review these within their own tenant. The write path is a supplier acting with
 * no tenant session at all, so it goes through a SECURITY DEFINER function (submit_supplier_bid, migration
 * 0012) the same way sourcing_line_notifications' invite functions do (migration 0006), never a direct
 * insert from app code. One active bid per (line, supplier); resubmitting while the line is open updates it
 * in place rather than creating a second row -- see the plan doc.
 */
export const bids = pgTable(
  'bids',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id),
    platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    minimumOrderQty: numeric('minimum_order_qty', { precision: 14, scale: 3 }),
    leadTimeDays: integer('lead_time_days'),
    notes: text('notes'),
    status: text('status').notNull().default('submitted'), // 'submitted' | 'accepted' | 'rejected' | 'withdrawn'
    ...timestamps,
  },
  (t) => [unique().on(t.sourcingLineId, t.platformSupplierId)],
);

/** The minimal executable output of an award. Later procurement phases can expand this into headers and
 * lines; for the marketplace MVP each awarded sourcing line creates exactly one traceable draft PO. */
export const purchaseOrders = pgTable('purchase_orders', {
  id: id(),
  tenantId: tenantId().references(() => tenants.id),
  poNumber: text('po_number').notNull(),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id).unique(),
  acceptedBidId: uuid('accepted_bid_id').notNull().references(() => bids.id).unique(),
  description: text('description').notNull(),
  qty: numeric('qty', { precision: 14, scale: 3 }).notNull(),
  uom: text('uom').notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  deliveryCity: text('delivery_city').notNull(),
  deliveryState: text('delivery_state').notNull(),
  needBy: date('need_by'),
  status: text('status').notNull().default('draft'),
  createdBy: uuid('created_by'),
  ...timestamps,
}, (t) => [unique().on(t.tenantId, t.poNumber)]);
