import { bigserial, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
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

/** A supplier company profile. Who can log in and act as it lives in supplierMembers below, not here --
 *  a real supplier company has more than one person (Phase A only ever creates the 'owner' member; the
 *  "invite a teammate" flow needs a supplier dashboard to invite from, which doesn't exist yet -- Phase B). */
export const platformSuppliers = pgTable('platform_suppliers', {
  id: id(),
  name: text('name').notNull(),
  gst: text('gst').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  // Nullable: only the self-serve signup (no invite) collects this today; the older invite-gated signup
  // doesn't ask for it and there's no reason to force a backfill on those rows.
  country: text('country'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per person who can log in as a platformSupplier. AuthGuard doesn't query this table at all --
 * it trusts the platform_supplier_id claim already on the Keycloak token, set identically for every member
 * of a company (see keycloak-admin.service.ts). This table exists to know who those members are and to let
 * a signup fail cleanly if Keycloak creation fails: no member row is written until Keycloak confirms the
 * login, so the failure mode is "a company profile with zero members" (visible, repairable), never an
 * orphaned Keycloak login unlinked from any company.
 */
export const supplierMembers = pgTable(
  'supplier_members',
  {
    id: id(),
    platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
    email: text('email').notNull(),
    keycloakSubject: text('keycloak_subject').notNull().unique(),
    role: text('role').notNull().default('owner'), // 'owner' | 'member' -- only 'owner' is ever created so far
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.platformSupplierId, t.email)],
);

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
