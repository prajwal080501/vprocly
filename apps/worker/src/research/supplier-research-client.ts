export type SupplierResearchQuery = {
  categoryName: string;
  itemCode?: string | null;
  brandManufacturer?: string | null;
  hsnMfgCode?: string | null;
  itemDescription: string;
  deliveryCity: string;
  deliveryState: string;
  maxResults: number;
};

export type SupplierCandidate = {
  name: string;
  /** Required -- a candidate with no resolvable email is never returned. There is no schema-legal way to
   *  store one: platform_suppliers.email stays NOT NULL UNIQUE even for a 'prospect' row. */
  email: string;
  phone: string | null;
  city: string;
  state: string;
  country: string | null;
  website: string | null;
  placeId: string | null;
  sourceUrls: string[];
  searchQuery: string;
  /** Deterministic ranking inputs persisted with the claim; the model proposes evidence but never owns
   * the final ordering. Optional for compatibility with test and alternate research clients. */
  itemMatchScore?: number;
  evidenceScore?: number;
  matchedIdentifiers?: string[];
  matchReasons?: string[];
  researchIteration?: number;
  sourceType?: 'manufacturer_directory' | 'official_catalogue' | 'supplier_website' | 'google_places' | 'marketplace' | 'search_snippet';
};

export type SupplierResearchMetrics = {
  queryCount: number;
  geminiCalls: number;
  geminiInputTokens: number;
  geminiOutputTokens: number;
  groundingQueries: number;
  placesCalls: number;
  placesIdSearches: number;
  placesDetailCalls: number;
  duplicatesRemoved: number;
  durationMs: number;
  estimatedCostMicros: number;
  stopReason: 'target_reached' | 'plan_exhausted' | 'places_budget_exhausted';
};

export type SupplierResearchResult = { candidates: SupplierCandidate[]; metrics: SupplierResearchMetrics };

/**
 * Swappable so tests never hit the real Gemini/Places APIs -- they cost money and aren't deterministic.
 * See gemini-places-client.ts for the real implementation and apps/worker/test/supplier-research-agent.test.ts
 * for the hand-rolled fake (the only mocked external dependency in this test suite; every other integration
 * point -- SMTP, S3, ClamAV, Postgres, Temporal -- runs against a real local instance in the dev stack).
 */
export interface SupplierResearchClient {
  findSuppliers(query: SupplierResearchQuery): Promise<SupplierResearchResult>;
}
