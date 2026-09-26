import { date, index, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { categories, platformSuppliers } from './marketplace.js';
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
