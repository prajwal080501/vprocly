export type Me = {
  user: { id: string; email?: string; name?: string; roles: string[]; phone: string | null };
  tenant: { id: string; slug: string; name: string; defaultCurrency: string };
};

export type OperationsSummary = {
  generatedAt: string;
  releaseVersion: string;
  api: {
    windowMinutes: number;
    requestCount: number;
    errorCount: number;
    errorRate: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    webhookFailureCount: number;
    startedAt: string;
  };
  webhookFailures: number;
  failedResearchJobs: Array<{
    jobId: string;
    sourcingLineId: string;
    requestId: string;
    requestTitle: string;
    itemDescription: string;
    attemptCount: number;
    lastError: string | null;
    updatedAt: string;
  }>;
  deliveryStatus: Array<{ channel: string; status: string; count: number }>;
  callStatus: Array<{ status: string; count: number }>;
  queue: {
    pending_count: number;
    failed_attempt_count: number;
    oldest_age_seconds: number | null;
    average_processing_ms: number | null;
    p95_processing_ms: number | null;
  };
  delayedTasks: Array<{ kind: string; id: string; label: string; status: string; ageSeconds: number }>;
  paymentMismatches: Array<{ id: string; status: string; createdAt: string }>;
  researchEconomics: {
    runs: number;
    candidates_found: number;
    cache_hits: number;
    gemini_calls: number;
    gemini_input_tokens: number;
    gemini_output_tokens: number;
    grounding_queries: number;
    places_calls: number;
    places_id_searches: number;
    places_detail_calls: number;
    estimated_cost_micros: number;
  };
  itemEquivalenceReviews: Array<{
    id: string;
    sourceDescription: string;
    targetDescription: string;
    relationship: string;
    confidence: string;
    evidenceUrls: string[];
    proposedBy: string;
    createdAt: string;
  }>;
};

export type Supplier = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  sourceSystem: string;
  createdAt: string;
};

export type Category = { id: string; name: string };

export type SourcingRequestSummary = {
  id: string;
  title: string;
  source: 'manual' | 'bom_upload';
  status: string;
  createdAt: string;
};

export type SourcingListLine = {
  id: string;
  sourcingRequestId: string;
  itemCode: string | null;
  brandManufacturer: string | null;
  hsnMfgCode: string | null;
  description: string;
  qty: string;
  uom: string;
  deliveryCity: string;
  deliveryState: string;
  needBy: string | null;
  status: string;
  notifiedCount: number;
  bidCount: number;
};

export type SourcingRequestListEntry = SourcingRequestSummary & { lines: SourcingListLine[] };

export type CustomRequestOption = { id: string; title: string; lineCount: number };

export type SourcingLine = {
  id: string;
  itemCode: string | null;
  brandManufacturer: string | null;
  hsnMfgCode: string | null;
  description: string;
  categoryId: string;
  qty: string;
  uom: string;
  deliveryCity: string;
  deliveryState: string;
  needBy: string | null;
  status: string;
  /** Only present on the detail (GET /sourcing-requests/:id) response, not the list. */
  notifiedCount?: number;
  supplierResearch?: SupplierResearchNotification[];
  clarificationMessages: ItemClarificationMessage[];
  researchJob: SourcingResearchJob | null;
  bids: SourcingBid[];
  purchaseOrder: PurchaseOrder | null;
  priceIntelligence: PriceIntelligence;
};

export type SupplierScore = {
  overallScore: number;
  version: number;
  sampleSize: number;
  components: {
    categoryMatch: number;
    response: number;
    price: number;
    leadTime: number;
    fulfillment: number;
    compliance: number;
  };
  explanation: Record<string, unknown>;
  calculatedAt: string;
};

export type PriceIntelligence = {
  currency: string;
  benchmark: null | {
    scope: 'regional' | 'national';
    quoteCount: number;
    buyerCount: number;
    supplierCount: number;
    low: number;
    expectedLow: number;
    median: number;
    expectedHigh: number;
    high: number;
    negotiationTarget: number;
    calculatedAt: string;
  };
  previousPurchase: number | null;
  privacyThreshold: { minimumQuotes: number; minimumBuyers: number; met: boolean };
};

export type PurchaseOrderOutcome = {
  id: string;
  type: 'acknowledged' | 'dispatched' | 'delivered' | 'quality_accepted' | 'quality_rejected' | 'cancelled' | 'disputed';
  promisedAt: string | null;
  occurredAt: string;
  quantity: string | null;
  rating: number | null;
  reasonCode: string | null;
  notes: string | null;
  createdAt: string;
};

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  status: string;
  supplierName: string;
  platformSupplierId: string;
  qty: string;
  uom: string;
  unitPrice: string;
  currency: string;
  outcomes: PurchaseOrderOutcome[];
};

export type SourcingResearchJob = {
  id: string;
  sourcingLineId: string;
  status: 'queued' | 'researching' | 'completed' | 'partial' | 'failed';
  targetCount: number;
  foundCount: number;
  attemptCount: number;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierResearchNotification = {
  id: string;
  sourcingLineId: string;
  email: string;
  sentAt: string | null;
  platformSupplierId: string | null;
  supplierName: string | null;
  supplierPhone: string | null;
  supplierCity: string | null;
  supplierState: string | null;
  supplierStatus: 'active' | 'prospect' | string | null;
  supplierDiscoveryMetadata: {
    sourceUrls?: string[];
    searchQuery?: string;
    itemMatchScore?: number;
    evidenceScore?: number;
    matchedIdentifiers?: string[];
    matchReasons?: string[];
    researchIteration?: number;
    discoveredAt?: string;
  } | null;
  itemEvidence: {
    matchScore: string;
    evidenceScore: string;
    sourceType: string;
    sourceWeight: string;
    outcomeScore: string;
    positiveSignals: number;
    negativeSignals: number;
    reviewStatus: string;
    matchedIdentifiers: string[];
    matchReasons: string[];
    evidenceUrls: string[];
    searchQueries: string[];
    lastVerifiedAt: string;
    expiresAt: string;
  } | null;
  voiceCall: SupplierVoiceCall | null;
  bidDraft: { id: string; status: string; unitPrice: string | null; leadTimeDays: number | null; extractionConfidence: string | null } | null;
  supplierScore: SupplierScore | null;
  capabilityResponse: SupplierCapabilityResponse | null;
};

export type SupplierCapabilityResponse = {
  status: 'can_supply' | 'needs_clarification' | 'declined';
  reason: string | null;
  respondedAt: string;
};

export type ItemClarificationMessage = {
  id: string;
  sourcingLineId: string;
  platformSupplierId?: string;
  senderType: 'buyer' | 'supplier';
  senderLabel: string;
  body: string;
  createdAt: string;
};

export type SupplierVoiceCall = {
  id: string;
  status: 'queued' | 'dialing' | 'connected' | 'no_answer' | 'busy' | 'failed' | 'skipped';
  attemptId: string | null;
  interactionId: string | null;
  durationSeconds: string | null;
  failureReason: string | null;
  finalAgentVariables: Record<string, unknown> | null;
  interactionTranscript: Array<{ role: 'agent' | 'user'; enText: string }> | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type SourcingBid = {
  id: string;
  sourcingLineId: string;
  supplierId: string;
  supplierName: string;
  supplierCity: string;
  supplierState: string;
  unitPrice: string;
  minimumOrderQty: string | null;
  leadTimeDays: number | null;
  currency: string;
  taxPercent: string | null;
  freightAmount: string | null;
  quoteValidityDate: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  landedUnitCost: number;
  priceSignal: 'below_range' | 'within_range' | 'above_range' | 'insufficient_data';
  supplierScore: SupplierScore | null;
};

export type SourcingAuditEntry = {
  id: number;
  action: string;
  actorType: string;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  occurredAt: string;
};

export type SourcingRequestDetail = SourcingRequestSummary & { lines: SourcingLine[]; timeline: SourcingAuditEntry[] };

export type MatchSummary = { description: string; matchedSupplierCount: number; invitedNewCount: number };

export type ImportResult =
  | { status: 'template_error'; missingColumns: string[]; unrecognizedColumns: string[]; unknownCategories?: string[] }
  | { status: 'row_errors'; rowErrors: { row: number; errors: string[] }[]; validCount: number; totalRows: number }
  | { sourcingRequestId: string; title: string; lineCount: number; matches: MatchSummary[] };

export type InviteLineSummary = {
  itemCode: string | null;
  description: string;
  qty: string;
  uom: string;
  categoryId: string;
  deliveryCity: string;
  deliveryState: string;
  needBy: string | null;
};

export type InviteView =
  | { status: 'consumed' }
  | { status: 'already_registered'; email: string; line: InviteLineSummary }
  | { status: 'pending_signup'; email: string; line: InviteLineSummary };

export type SupplierMe = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string;
  state: string;
  country: string | null;
  walletBalance: number;
  verified: boolean;
};

export type SupplierNetworkInsights = {
  totalOpportunities: number;
  activeOpportunities: number;
  bidsSubmitted: number;
  bidsWon: number;
  responseRate: number | null;
  bidConversionRate: number | null;
  winRate: number | null;
  fulfillmentRate: number | null;
  score: null | {
    overall: number;
    response: number;
    price: number;
    leadTime: number;
    fulfillment: number;
    compliance: number;
    sampleSize: number;
    version: number;
  };
  categoryDemand: Array<{ category: string; opportunities30d: number; previous30d: number; changePercent: number | null }>;
  preferences: {
    opportunityAlerts: boolean;
    digestFrequency: 'instant' | 'daily' | 'weekly' | 'off';
    minimumRecommendationScore: number;
  };
};

export type RefillCurrency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD';
export type RefillPack = { id: string; points: number; label: string; amounts: Record<RefillCurrency, number> };
export type RefillPacks = {
  enabled: boolean;
  keyId: string | null;
  testMode: boolean;
  defaultCurrency: RefillCurrency;
  currencies: Array<{ code: RefillCurrency; label: string }>;
  packs: RefillPack[];
  custom: {
    minPoints: number;
    maxPoints: number;
    step: number;
    defaultPoints: number;
    basePoints: number;
    baseAmounts: Record<RefillCurrency, number>;
  };
};
export type DetectedLocation = {
  formattedAddress: string;
  countryCode: string;
  country: string;
  city: string | null;
  region: string | null;
  suggestedCurrency: RefillCurrency;
};

export type OpenLineForSupplier = {
  sourcingLineId: string;
  itemCode: string | null;
  description: string;
  qty: string;
  uom: string;
  needBy: string | null;
  alreadyBid: boolean;
  myUnitPrice: string | null;
  myMinimumOrderQty: string | null;
  capabilityResponse: SupplierCapabilityResponse | null;
  clarificationCount: number;
};

export type SupplierBidActivity = {
  bidId: string;
  sourcingLineId: string;
  itemCode: string | null;
  description: string;
  qty: string;
  uom: string;
  deliveryCity: string;
  deliveryState: string;
  needBy: string | null;
  unitPrice: string;
  minimumOrderQty: string | null;
  leadTimeDays: number | null;
  notes: string | null;
  status: 'submitted' | 'accepted' | 'rejected' | 'withdrawn';
  buyer: { name: string; contactName: string | null; contactEmail: string | null } | null;
};

export type VoiceBidConfirmation = {
  draftId: string;
  status: 'pending_confirmation' | 'confirmed' | 'expired' | string;
  supplierName: string;
  itemCode: string | null;
  description: string;
  qty: string;
  uom: string;
  deliveryCity: string;
  deliveryState: string;
  needBy: string | null;
  unitPrice: string | null;
  minimumOrderQty: string | null;
  leadTimeDays: number | null;
  currency: string;
  taxPercent: string | null;
  freightAmount: string | null;
  quoteValidityDate: string | null;
  notes: string | null;
  expiresAt: string;
};

export type SupplierPassport = {
  identifiers: Array<{ id: string; type: string; value: string; verificationStatus: string }>;
  locations: Array<{ id: string; type: string; label: string | null; address: string | null; city: string; state: string; country: string; postalCode: string | null; isPrimary: boolean }>;
  capabilities: Array<{ id: string; categoryId: string; categoryName: string; description: string | null; materials: string[] | null; processes: string[] | null; brands: string[] | null }>;
  certifications: Array<{ id: string; name: string; issuer: string | null; certificateNumber: string | null; expiresAt: string | null; verificationStatus: string }>;
  contacts: Array<{ id: string; name: string | null; role: string | null; email: string | null; phone: string | null; preferredChannel: string | null; isPrimary: boolean }>;
  completionPercent: number;
};
