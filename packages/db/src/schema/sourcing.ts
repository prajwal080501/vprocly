import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
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
    itemFingerprint: text('item_fingerprint'),
    tokenHash: text('token_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique().on(t.sourcingLineId, t.email),
    index('sourcing_line_notifications_line_idx').on(t.sourcingLineId),
    index('sourcing_line_notifications_item_idx').on(t.itemFingerprint, t.platformSupplierId),
  ],
);

/** A supplier's lightweight qualification response before they invest time in a full quotation. */
export const supplierLineResponses = pgTable(
  'supplier_line_responses',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id),
    platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
    status: text('status').notNull(), // can_supply | needs_clarification | declined
    reason: text('reason'),
    respondedAt: timestamp('responded_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.sourcingLineId, t.platformSupplierId),
    index('supplier_line_responses_line_idx').on(t.sourcingLineId),
    index('supplier_line_responses_supplier_idx').on(t.platformSupplierId),
  ],
);

/** Item-wise clarification thread. A thread is the (line, supplier) pair, preserving blind-bid privacy. */
export const itemClarificationMessages = pgTable(
  'item_clarification_messages',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id),
    platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
    senderType: text('sender_type').notNull(), // buyer | supplier
    senderUserId: uuid('sender_user_id'),
    senderLabel: text('sender_label').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('item_clarification_messages_thread_idx').on(t.sourcingLineId, t.platformSupplierId, t.createdAt),
    index('item_clarification_messages_tenant_idx').on(t.tenantId, t.createdAt),
  ],
);

/** One outbound voice notification per supplier match. Bidding always happens through the emailed invite;
 * call outcomes are retained for buyer visibility and do not create or suppress bids. */
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

/** One row per channel attempt. The existing voice-call row remains the latest-state compatibility view. */
export const supplierContactAttempts = pgTable('supplier_contact_attempts', {
  id: id(),
  tenantId: tenantId().references(() => tenants.id),
  notificationId: uuid('notification_id').notNull().references(() => sourcingLineNotifications.id),
  sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id),
  platformSupplierId: uuid('platform_supplier_id').references(() => platformSuppliers.id),
  voiceCallId: uuid('voice_call_id').references(() => supplierVoiceCalls.id),
  channel: text('channel').notNull(), // voice | email | sms | whatsapp
  direction: text('direction').notNull().default('outbound'),
  purpose: text('purpose').notNull().default('rfq'),
  status: text('status').notNull().default('queued'),
  provider: text('provider'),
  providerAttemptId: text('provider_attempt_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps,
}, (t) => [
  index('supplier_contact_attempts_line_idx').on(t.sourcingLineId),
  index('supplier_contact_attempts_supplier_idx').on(t.platformSupplierId),
  index('supplier_contact_attempts_voice_idx').on(t.voiceCallId),
]);

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
    currency: text('currency').notNull().default('INR'),
    taxPercent: numeric('tax_percent', { precision: 6, scale: 3 }),
    freightAmount: numeric('freight_amount', { precision: 14, scale: 2 }),
    quoteValidityDate: date('quote_validity_date'),
    notes: text('notes'),
    status: text('status').notNull().default('submitted'), // 'submitted' | 'accepted' | 'rejected' | 'withdrawn'
    ...timestamps,
  },
  (t) => [unique().on(t.sourcingLineId, t.platformSupplierId)],
);

export const bidDrafts = pgTable('bid_drafts', {
  id: id(),
  tenantId: tenantId().references(() => tenants.id),
  sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id),
  notificationId: uuid('notification_id').notNull().references(() => sourcingLineNotifications.id),
  platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
  voiceCallId: uuid('voice_call_id').notNull().references(() => supplierVoiceCalls.id).unique(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }),
  minimumOrderQty: numeric('minimum_order_qty', { precision: 14, scale: 3 }),
  leadTimeDays: integer('lead_time_days'),
  currency: text('currency').notNull().default('INR'),
  taxPercent: numeric('tax_percent', { precision: 6, scale: 3 }),
  freightAmount: numeric('freight_amount', { precision: 14, scale: 2 }),
  quoteValidityDate: date('quote_validity_date'),
  notes: text('notes'),
  status: text('status').notNull().default('incomplete'), // incomplete | pending_confirmation | confirmed | expired
  extractionConfidence: numeric('extraction_confidence', { precision: 5, scale: 4 }),
  rawFields: jsonb('raw_fields').$type<Record<string, unknown>>(),
  confirmationTokenHash: text('confirmation_token_hash').unique(),
  confirmationExpiresAt: timestamp('confirmation_expires_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  ...timestamps,
}, (t) => [index('bid_drafts_line_idx').on(t.sourcingLineId), index('bid_drafts_status_idx').on(t.tenantId, t.status)]);

export const bidRevisions = pgTable('bid_revisions', {
  id: id(),
  tenantId: tenantId().references(() => tenants.id),
  bidId: uuid('bid_id').notNull().references(() => bids.id),
  sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id),
  platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
  revisionNumber: integer('revision_number').notNull(),
  source: text('source').notNull().default('portal'),
  sourceDraftId: uuid('source_draft_id').references(() => bidDrafts.id),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  minimumOrderQty: numeric('minimum_order_qty', { precision: 14, scale: 3 }),
  leadTimeDays: integer('lead_time_days'),
  currency: text('currency').notNull().default('INR'),
  taxPercent: numeric('tax_percent', { precision: 6, scale: 3 }),
  freightAmount: numeric('freight_amount', { precision: 14, scale: 2 }),
  quoteValidityDate: date('quote_validity_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.bidId, t.revisionNumber), index('bid_revisions_line_idx').on(t.sourcingLineId)]);

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

/** Append-only operational outcomes. purchase_orders.status is the current projection used by existing UI. */
export const purchaseOrderOutcomes = pgTable('purchase_order_outcomes', {
  id: id(),
  tenantId: tenantId().references(() => tenants.id),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id),
  sourcingLineId: uuid('sourcing_line_id').notNull().references(() => sourcingLines.id),
  platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
  type: text('type').notNull(), // acknowledged | dispatched | delivered | quality_accepted | quality_rejected | cancelled | disputed
  promisedAt: timestamp('promised_at', { withTimezone: true }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  quantity: numeric('quantity', { precision: 14, scale: 3 }),
  rating: integer('rating'),
  reasonCode: text('reason_code'),
  notes: text('notes'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('purchase_order_outcomes_po_idx').on(t.purchaseOrderId), index('purchase_order_outcomes_supplier_idx').on(t.platformSupplierId)]);
