import { z } from 'zod';

/**
 * Versioned event payloads. Add a new version rather than changing an existing one; keep old versions
 * until no consumer depends on them.
 */
export const SupplierCreatedV1 = z.object({
  supplierId: z.uuid(),
  code: z.string(),
  name: z.string(),
  sourceSystem: z.string(),
});

export const UploadRequestedV1 = z.object({
  documentId: z.uuid(),
  fileName: z.string(),
  purpose: z.string(),
});

export const DocumentUploadedV1 = z.object({
  documentId: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  purpose: z.string(),
});

export const DocumentScannedV1 = z.object({
  documentId: z.uuid(),
  result: z.enum(['clean', 'infected']),
  signature: z.string().nullable(),
});

export const SourcingRequestCreatedV1 = z.object({
  sourcingRequestId: z.uuid(),
  lineCount: z.number().int().nonnegative(),
});

export const SourcingRequestDeletedV1 = z.object({
  sourcingRequestId: z.uuid(),
  lineCount: z.number().int().nonnegative(),
});

export const SourcingLineMatchedV1 = z.object({
  sourcingLineId: z.uuid(),
  matchedSupplierCount: z.number().int().nonnegative(),
  invitedNewCount: z.number().int().nonnegative(),
});

/** Fires once per request, after every line has been matched -- aggregated totals, so the buyer-summary
 *  email (sourcing-request-summary-mailer.ts) never needs to re-query anything to build its counts. */
export const SourcingRequestMatchedV1 = z.object({
  sourcingRequestId: z.uuid(),
  title: z.string(),
  lineCount: z.number().int().nonnegative(),
  matchedSupplierCount: z.number().int().nonnegative(),
  invitedNewCount: z.number().int().nonnegative(),
});

export const SupplierRegisteredV1 = z.object({
  platformSupplierId: z.uuid(),
  email: z.string(),
  grantedPoints: z.number().int().positive(),
});

export const EventCatalog = {
  'master_data.supplier_created': { 1: SupplierCreatedV1 },
  'documents.upload_requested': { 1: UploadRequestedV1 },
  'documents.document_uploaded': { 1: DocumentUploadedV1 },
  'documents.document_scanned': { 1: DocumentScannedV1 },
  'sourcing.sourcing_request_created': { 1: SourcingRequestCreatedV1 },
  'sourcing.sourcing_request_deleted': { 1: SourcingRequestDeletedV1 },
  'sourcing.sourcing_line_matched': { 1: SourcingLineMatchedV1 },
  'sourcing.sourcing_request_matched': { 1: SourcingRequestMatchedV1 },
  'marketplace.supplier_registered': { 1: SupplierRegisteredV1 },
} as const;

export type EventType = keyof typeof EventCatalog;
export type EventPayload<T extends EventType, V extends keyof (typeof EventCatalog)[T]> = z.infer<
  (typeof EventCatalog)[T][V] & z.ZodType
>;

/** Validates a payload against the catalog; unknown type/version throws so producers cannot drift silently. */
export function parseEventPayload(type: string, version: number, payload: unknown): Record<string, unknown> {
  const versions = (EventCatalog as Record<string, Record<number, z.ZodType>>)[type];
  const schema = versions?.[version];
  if (!schema) throw new Error(`Unknown event ${type} v${version}`);
  return schema.parse(payload) as Record<string, unknown>;
}
