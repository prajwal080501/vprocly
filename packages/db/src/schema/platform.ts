import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, tenantId } from './columns.js';
import { tenants } from './tenancy.js';

/** Append-only, hash-chained per tenant. Write only through the audit_append() SQL function. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: tenantId().references(() => tenants.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id'),
    actorType: text('actor_type').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    correlationId: uuid('correlation_id'),
    data: jsonb('data').notNull().default({}),
    prevHash: text('prev_hash'),
    hash: text('hash').notNull(),
  },
  (t) => [index('audit_log_entity_idx').on(t.tenantId, t.entityType, t.entityId)],
);

/** Transactional outbox: written in the same transaction as the state change it describes. */
export const outbox = pgTable(
  'outbox',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    eventType: text('event_type').notNull(),
    eventVersion: integer('event_version').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    correlationId: uuid('correlation_id'),
    actorId: uuid('actor_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
  },
  (t) => [index('outbox_pending_idx').on(t.nextAttemptAt).where(sql`published_at IS NULL`)],
);

/** Consumer-side idempotency: one row per (consumer, event) processed. */
export const inboxDedup = pgTable(
  'inbox_dedup',
  {
    tenantId: tenantId().references(() => tenants.id),
    consumer: text('consumer').notNull(),
    eventId: uuid('event_id').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.consumer, t.eventId] })],
);

export const documents = pgTable('documents', {
  id: id(),
  tenantId: tenantId().references(() => tenants.id),
  bucket: text('bucket').notNull(),
  objectKey: text('object_key').notNull(),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes'),
  sha256: text('sha256'),
  status: text('status').notNull().default('pending_upload'),
  uploadedBy: uuid('uploaded_by'),
  scannedAt: timestamp('scanned_at', { withTimezone: true }),
  scanSignature: text('scan_signature'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
