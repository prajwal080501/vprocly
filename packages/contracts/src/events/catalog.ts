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

export const EventCatalog = {
  'master_data.supplier_created': { 1: SupplierCreatedV1 },
  'documents.upload_requested': { 1: UploadRequestedV1 },
  'documents.document_uploaded': { 1: DocumentUploadedV1 },
  'documents.document_scanned': { 1: DocumentScannedV1 },
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
