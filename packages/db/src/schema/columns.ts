import { integer, jsonb, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const id = () => uuid('id').primaryKey().defaultRandom();

export const tenantId = () => uuid('tenant_id').notNull();

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Evidence attached to every canonical object (blueprint p.11): where the record came from,
 * which import/event produced it, who did it, and how confident we are.
 */
export const provenance = {
  sourceSystem: text('source_system').notNull().default('manual'),
  externalId: text('external_id'),
  sourceRef: jsonb('source_ref').$type<SourceRef>(),
  importBatchId: uuid('import_batch_id'),
  correlationId: uuid('correlation_id'),
  createdBy: uuid('created_by'),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  validationStatus: text('validation_status').notNull().default('valid'),
  version: integer('version').notNull().default(1),
};

export type SourceRef = {
  documentId?: string;
  fileName?: string;
  sheet?: string;
  row?: number;
  cell?: string;
  page?: number;
};
