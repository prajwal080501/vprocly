import { bigserial, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from './columns.js';

/**
 * Platform-level tables: no tenant_id, no RLS. A supplier bids across many buyer tenants, so there is no
 * single tenant to partition by. Access control lives in the service layer (a caller is scoped to their own
 * platformSupplierId), not in the database. Use `db.transaction(...)` directly here, never `withTenant`.
 */

/** Fixed taxonomy: buyers and suppliers both pick from this list, which keeps category matching reliable.
 *  Read-only via the API; seeded by migration. */
export const categories = pgTable('categories', {
  id: id(),
  name: text('name').notNull().unique(),
});

export const platformSuppliers = pgTable('platform_suppliers', {
  id: id(),
  name: text('name').notNull(),
  gst: text('gst').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  keycloakSubject: text('keycloak_subject').notNull().unique(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const supplierCategories = pgTable(
  'supplier_categories',
  {
    platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
    categoryId: uuid('category_id').notNull().references(() => categories.id),
  },
  (t) => [primaryKey({ columns: [t.platformSupplierId, t.categoryId] })],
);

/** Append-only, mirrors the budget_ledger pattern: every balance change is a row, never an update. */
export const walletLedger = pgTable('wallet_ledger', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
  type: text('type').notNull(), // 'grant' | 'debit' | 'credit'
  points: integer('points').notNull(),
  refType: text('ref_type'),
  refId: text('ref_id'),
  balanceAfter: integer('balance_after').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Cached current balance, updated in the same transaction as each ledger row (avoids summing the ledger
 *  on every read). The ledger is still the source of truth. */
export const walletBalances = pgTable('wallet_balances', {
  platformSupplierId: uuid('platform_supplier_id').primaryKey().references(() => platformSuppliers.id),
  balance: integer('balance').notNull().default(0),
});
