import { bigserial, boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid, vector } from 'drizzle-orm/pg-core';
import { id } from './columns.js';

/**
 * Platform-level tables: no tenant_id, no RLS. A supplier bids across many buyer tenants, so there is no
 * single tenant to partition by. Access control lives in the service layer (a caller is scoped to their own
 * platformSupplierId), not in the database. Use `db.transaction(...)` directly here, never `withTenant`.
 */

/** An open-ended, self-growing vocabulary -- not a fixed list. A new category name is only ever created
 *  by `CategoryResolverService` (apps/api/.../category-resolver.service.ts), which embeds the free text a
 *  buyer or supplier typed and reuses an existing row if one is already close enough in meaning, so the
 *  same underlying idea spelled two different ways ("Steel Products" vs "Steel & Metal Products") collapses
 *  onto one row instead of sprawling. `embedding` is nullable: rows seeded before pgvector existed, or
 *  created while the embeddings API was unavailable (see the resolver's exact-match fallback), have none
 *  yet and are matched by name only until backfilled. */
export const categories = pgTable('categories', {
  id: id(),
  name: text('name').notNull().unique(),
  isPredefined: boolean('is_predefined').notNull().default(false),
  embedding: vector('embedding', { dimensions: 768 }),
});

/** A supplier company profile. Who can log in and act as it lives in supplierMembers below, not here --
 *  a real supplier company has more than one person (Phase A only ever creates the 'owner' member; the
 *  "invite a teammate" flow needs a supplier dashboard to invite from, which doesn't exist yet -- Phase B). */
export const platformSuppliers = pgTable('platform_suppliers', {
  id: id(),
  name: text('name').notNull(),
  // Nullable: an AI-discovered 'prospect' row (see status below) has no GST until it completes real signup
  // and gets promoted -- enforced by the platform_suppliers_gst_required_unless_prospect CHECK, migration
  // 0016, not just this looser TS type.
  gst: text('gst'),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  // Nullable: only the self-serve signup (no invite) collects this today; the older invite-gated signup
  // doesn't ask for it and there's no reason to force a backfill on those rows.
  country: text('country'),
  // 'active' (a real, signed-up company) | 'prospect' (found by AI research, invited, never yet signed up
  // -- see apps/worker/src/consumers/supplier-research-agent.ts). The existing supplier-matching query
  // already filters to 'active', so a prospect is never auto-matched or shown as a real bidder until it
  // signs up and gets promoted in place (marketplace-suppliers.service.ts's signup/selfSignup).
  status: text('status').notNull().default('active'),
  // Set only for AI-discovered prospects: place_id, source URLs, the search query used, discovered-at.
  // Left untouched on promotion to 'active' -- a permanent record of how this supplier was first found.
  discoveryMetadata: jsonb('discovery_metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Successful supplier research runs. The cost guard in sourcing.service.ts uses positive-result rows to
 * avoid repeating paid Gemini+Places research while empty and failed searches remain retryable. */
export const supplierResearchRuns = pgTable('supplier_research_runs', {
  id: id(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  candidatesFound: integer('candidates_found').notNull(),
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
