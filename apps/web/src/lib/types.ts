export type Me = {
  user: { id: string; email?: string; name?: string; roles: string[] };
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

export type SourcingLine = {
  id: string;
  itemCode: string | null;
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
