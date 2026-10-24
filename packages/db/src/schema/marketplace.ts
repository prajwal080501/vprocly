import { bigserial, boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uuid, vector } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.js';

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
  // and gets promoted. GST stays nullable for low-friction onboarding and can be completed in the passport.
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

/** Short-lived email verification challenges for supplier onboarding. Raw OTPs and raw verification
 * tokens are never stored; only salted/hardened code hashes and SHA-256 token hashes are persisted. */
export const supplierSignupOtps = pgTable('supplier_signup_otps', {
  id: id(),
  email: text('email').notNull(),
  purpose: text('purpose').notNull().default('supplier_signup'),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verificationTokenHash: text('verification_token_hash').unique(),
  verificationExpiresAt: timestamp('verification_expires_at', { withTimezone: true }),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('supplier_signup_otps_email_created_idx').on(t.email, t.createdAt),
]);

/** Supplier research/cache runs, including zero-result paid attempts for complete cost accounting. The
 * cooldown only considers positive results and is keyed by item fingerprint rather than category. */
export const supplierResearchRuns = pgTable('supplier_research_runs', {
  id: id(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  itemFingerprint: text('item_fingerprint'),
  triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  candidatesFound: integer('candidates_found').notNull(),
  cacheHits: integer('cache_hits').notNull().default(0),
  queryCount: integer('query_count').notNull().default(0),
  geminiCalls: integer('gemini_calls').notNull().default(0),
  geminiInputTokens: integer('gemini_input_tokens').notNull().default(0),
  geminiOutputTokens: integer('gemini_output_tokens').notNull().default(0),
  groundingQueries: integer('grounding_queries').notNull().default(0),
  placesCalls: integer('places_calls').notNull().default(0),
  placesIdSearches: integer('places_id_searches').notNull().default(0),
  placesDetailCalls: integer('places_detail_calls').notNull().default(0),
  duplicatesRemoved: integer('duplicates_removed').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  estimatedCostMicros: integer('estimated_cost_micros').notNull().default(0),
  stopReason: text('stop_reason').notNull().default('unknown'),
}, (t) => [index('supplier_research_runs_item_idx').on(t.itemFingerprint, t.triggeredAt)]);

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

export const supplierIdentifiers = pgTable(
  'supplier_identifiers',
  {
    id: id(),
    platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
    type: text('type').notNull(), // gstin | pan | udyam | external
    value: text('value').notNull(),
    verificationStatus: text('verification_status').notNull().default('unverified'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [unique().on(t.type, t.value), index('supplier_identifiers_supplier_idx').on(t.platformSupplierId)],
);

export const supplierLocations = pgTable('supplier_locations', {
  id: id(),
  platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
  type: text('type').notNull().default('service'), // registered | factory | warehouse | service
  label: text('label'),
  address: text('address'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  country: text('country').notNull().default('India'),
  postalCode: text('postal_code'),
  isPrimary: boolean('is_primary').notNull().default(false),
  ...timestamps,
}, (t) => [index('supplier_locations_supplier_idx').on(t.platformSupplierId)]);

export const supplierCapabilities = pgTable(
  'supplier_capabilities',
  {
    id: id(),
    platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    description: text('description'),
    materials: jsonb('materials').$type<string[]>(),
    processes: jsonb('processes').$type<string[]>(),
    brands: jsonb('brands').$type<string[]>(),
    ...timestamps,
  },
  (t) => [unique().on(t.platformSupplierId, t.categoryId)],
);

/** Item-level supplier evidence used as the structured RAG/map layer. Unlike supplierCategories this
 * records why a supplier is relevant to one normalized item, so a broad category match cannot suppress
 * exact-item research. Claims expire and must retain inspectable evidence. */
export const supplierItemClaims = pgTable(
  'supplier_item_claims',
  {
    id: id(),
    platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
    itemFingerprint: text('item_fingerprint').notNull(),
    description: text('description').notNull(),
    matchScore: numeric('match_score', { precision: 5, scale: 4 }).notNull(),
    evidenceScore: numeric('evidence_score', { precision: 5, scale: 4 }).notNull(),
    sourceType: text('source_type').notNull().default('supplier_website'),
    sourceWeight: numeric('source_weight', { precision: 5, scale: 4 }).notNull().default('0.7000'),
    outcomeScore: numeric('outcome_score', { precision: 5, scale: 4 }).notNull().default('0.5000'),
    positiveSignals: integer('positive_signals').notNull().default(0),
    negativeSignals: integer('negative_signals').notNull().default(0),
    reviewStatus: text('review_status').notNull().default('unreviewed'),
    matchedIdentifiers: jsonb('matched_identifiers').$type<string[]>().notNull().default([]),
    matchReasons: jsonb('match_reasons').$type<string[]>().notNull().default([]),
    evidenceUrls: jsonb('evidence_urls').$type<string[]>().notNull().default([]),
    searchQueries: jsonb('search_queries').$type<string[]>().notNull().default([]),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).notNull().defaultNow(),
    lastOutcomeAt: timestamp('last_outcome_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.platformSupplierId, t.itemFingerprint),
    index('supplier_item_claims_item_idx').on(t.itemFingerprint, t.expiresAt),
    index('supplier_item_claims_supplier_idx').on(t.platformSupplierId),
  ],
);

/** Candidate relationships stay non-operative until a human approves them. Approved links extend exact
 * item retrieval; proposed/rejected links remain an audit trail and review queue. */
export const itemEquivalences = pgTable('item_equivalences', {
  id: id(),
  sourceFingerprint: text('source_fingerprint').notNull(),
  targetFingerprint: text('target_fingerprint').notNull(),
  sourceDescription: text('source_description').notNull(),
  targetDescription: text('target_description').notNull(),
  relationship: text('relationship').notNull().default('possible_equivalent'),
  status: text('status').notNull().default('proposed'),
  confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
  evidenceUrls: jsonb('evidence_urls').$type<string[]>().notNull().default([]),
  proposedBy: text('proposed_by').notNull().default('retrieval'),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  ...timestamps,
}, (t) => [
  unique().on(t.sourceFingerprint, t.targetFingerprint, t.relationship),
  index('item_equivalences_review_idx').on(t.status, t.createdAt),
  index('item_equivalences_source_idx').on(t.sourceFingerprint, t.status),
  index('item_equivalences_target_idx').on(t.targetFingerprint, t.status),
]);

export const supplierCertifications = pgTable('supplier_certifications', {
  id: id(),
  platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
  name: text('name').notNull(),
  issuer: text('issuer'),
  certificateNumber: text('certificate_number'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  verificationStatus: text('verification_status').notNull().default('unverified'),
  documentUrl: text('document_url'),
  ...timestamps,
}, (t) => [index('supplier_certifications_supplier_idx').on(t.platformSupplierId)]);

export const supplierContacts = pgTable('supplier_contacts', {
  id: id(),
  platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
  name: text('name'),
  role: text('role'),
  email: text('email'),
  phone: text('phone'),
  preferredChannel: text('preferred_channel'),
  isPrimary: boolean('is_primary').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  consentAt: timestamp('consent_at', { withTimezone: true }),
  ...timestamps,
}, (t) => [index('supplier_contacts_supplier_idx').on(t.platformSupplierId)]);

/** Append-only score history. The latest version is the current explainable supplier score; older rows
 * make ranking changes auditable as response, bid and fulfillment evidence accumulates. */
export const supplierScoreSnapshots = pgTable('supplier_score_snapshots', {
  id: id(),
  platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
  version: integer('version').notNull(),
  overallScore: numeric('overall_score', { precision: 5, scale: 2 }).notNull(),
  categoryMatchScore: numeric('category_match_score', { precision: 5, scale: 2 }).notNull(),
  responseScore: numeric('response_score', { precision: 5, scale: 2 }).notNull(),
  priceScore: numeric('price_score', { precision: 5, scale: 2 }).notNull(),
  leadTimeScore: numeric('lead_time_score', { precision: 5, scale: 2 }).notNull(),
  fulfillmentScore: numeric('fulfillment_score', { precision: 5, scale: 2 }).notNull(),
  complianceScore: numeric('compliance_score', { precision: 5, scale: 2 }).notNull(),
  sampleSize: integer('sample_size').notNull().default(0),
  explanation: jsonb('explanation').$type<Record<string, unknown>>().notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.platformSupplierId, t.version), index('supplier_score_latest_idx').on(t.platformSupplierId, t.version)]);

/** Cross-buyer price intelligence is materialized only after the privacy threshold is met. Rows contain
 * aggregates, never tenant, supplier, bid or item identifiers. */
export const priceBenchmarkSnapshots = pgTable('price_benchmark_snapshots', {
  id: id(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  uom: text('uom').notNull(),
  currency: text('currency').notNull(),
  region: text('region').notNull().default('*'),
  quoteCount: integer('quote_count').notNull(),
  buyerCount: integer('buyer_count').notNull(),
  supplierCount: integer('supplier_count').notNull(),
  low: numeric('low', { precision: 16, scale: 4 }).notNull(),
  percentile25: numeric('percentile_25', { precision: 16, scale: 4 }).notNull(),
  median: numeric('median', { precision: 16, scale: 4 }).notNull(),
  percentile75: numeric('percentile_75', { precision: 16, scale: 4 }).notNull(),
  high: numeric('high', { precision: 16, scale: 4 }).notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.categoryId, t.uom, t.currency, t.region), index('price_benchmark_lookup_idx').on(t.categoryId, t.uom, t.currency, t.region)]);

export const supplierNetworkPreferences = pgTable('supplier_network_preferences', {
  platformSupplierId: uuid('platform_supplier_id').primaryKey().references(() => platformSuppliers.id),
  opportunityAlerts: boolean('opportunity_alerts').notNull().default(true),
  digestFrequency: text('digest_frequency').notNull().default('instant'),
  minimumRecommendationScore: integer('minimum_recommendation_score').notNull().default(0),
  ...timestamps,
});

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

/** Razorpay-backed point purchases. The amount and point count are copied from the server-owned pack at
 * order creation time, so later pricing changes cannot alter an existing purchase. `creditedAt` is the
 * idempotency boundary: checkout confirmation and the payment webhook may race, but only one can credit. */
export const walletRefillOrders = pgTable('wallet_refill_orders', {
  id: uuid('id').primaryKey(),
  platformSupplierId: uuid('platform_supplier_id').notNull().references(() => platformSuppliers.id),
  packId: text('pack_id').notNull(),
  points: integer('points').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  currency: text('currency').notNull().default('INR'),
  razorpayOrderId: text('razorpay_order_id').notNull().unique(),
  razorpayPaymentId: text('razorpay_payment_id').unique(),
  status: text('status').notNull().default('created'), // 'created' | 'paid'
  creditedAt: timestamp('credited_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
