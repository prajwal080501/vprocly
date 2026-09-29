export type Me = {
  user: { id: string; email?: string; name?: string; roles: string[]; phone: string | null };
  tenant: { id: string; slug: string; name: string; defaultCurrency: string };
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
  researchJob: SourcingResearchJob | null;
  bids: SourcingBid[];
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
  supplierDiscoveryMetadata: { sourceUrls?: string[]; searchQuery?: string; discoveredAt?: string } | null;
  voiceCall: SupplierVoiceCall | null;
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
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SourcingRequestDetail = SourcingRequestSummary & { lines: SourcingLine[] };

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
  name: string;
  email: string;
  phone: string | null;
  city: string;
  state: string;
  country: string | null;
  walletBalance: number;
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
