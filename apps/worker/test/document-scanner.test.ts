import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { EventEnvelope } from '@vprocly/contracts';
import { auditLog, createDatabase, createPool, documents, outbox, withTenant } from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { ClamAv, parseScanReply } from '../src/clamav.js';
import { loadConfig } from '../src/config.js';
import { handleEvent } from '../src/consumer.js';
import { documentScanner } from '../src/consumers/document-scanner.js';
import { ObjectStorage } from '../src/object-storage.js';

// Runs against the dev stack (Postgres, S3, ClamAV).
const ACME = '11111111-1111-4111-8111-111111111111';
const config = loadConfig({
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly',
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:58333',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? 'vprocly',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? 'vprocly-secret',
  CLAMAV_HOST: process.env.CLAMAV_HOST ?? 'localhost',
  CLAMAV_PORT: process.env.CLAMAV_PORT ?? '53310',
});
const pool = createPool(config.DATABASE_URL);
const db = createDatabase(pool);
const storage = new ObjectStorage(config);
const clamav = new ClamAv(config.CLAMAV_HOST, config.CLAMAV_PORT);
const scanner = documentScanner({ db, storage, clamav });

// The standard EICAR test file, assembled at runtime so the repository itself never contains the signature.
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');

afterAll(async () => {
  await pool.end();
});

async function uploadedDocument(content: string) {
  const id = randomUUID();
  const key = `${ACME}/${id}/file.csv`;
  await storage.client.send(new PutObjectCommand({ Bucket: storage.buckets.quarantine, Key: key, Body: content }));
  await withTenant(db, { tenantId: ACME }, (tx) =>
    tx.insert(documents).values({
      id,
      tenantId: ACME,
      bucket: storage.buckets.quarantine,
      objectKey: key,
      fileName: 'file.csv',
      contentType: 'text/csv',
      sizeBytes: content.length,
      status: 'pending_scan',
    }),
  );
  const event: EventEnvelope = {
    id: randomUUID(),
    type: 'documents.document_uploaded',
    version: 1,
    tenantId: ACME,
    aggregateType: 'document',
    aggregateId: id,
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    actorId: null,
    payload: { documentId: id, fileName: 'file.csv', contentType: 'text/csv', purpose: 'import' },
  };
  return { id, key, event };
}

async function exists(bucket: string, key: string) {
  try {
    await storage.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

const load = (id: string) =>
  withTenant(db, { tenantId: ACME }, async (tx) => ({
    doc: (await tx.select().from(documents).where(eq(documents.id, id)))[0]!,
    audit: await tx.select().from(auditLog).where(and(eq(auditLog.entityType, 'document'), eq(auditLog.entityId, id))),
    events: await tx.select().from(outbox).where(eq(outbox.aggregateId, id)),
  }));

describe('clamd client', () => {
  it('talks to clamd', async () => {
    expect(await clamav.ping()).toBe(true);
  });

  it('detects the EICAR test signature and passes clean content', async () => {
    expect(await clamav.scan(Readable.from([Buffer.from(EICAR)]))).toEqual({
      clean: false,
      signature: expect.stringMatching(/eicar/i),
    });
    expect(await clamav.scan(Readable.from([Buffer.from('Item,Qty\nBolt,10\n')]))).toEqual({ clean: true });
  });

  it('treats clamd errors as failures, never as clean', () => {
    expect(() => parseScanReply('INSTREAM size limit exceeded. ERROR')).toThrow(/clamd error/);
  });
});

describe('document scanner consumer', () => {
  it('releases a clean file to the documents bucket', async () => {
    const { id, key, event } = await uploadedDocument('Item,Qty\nBolt,10\n');
    expect(await handleEvent(db, scanner, event)).toBe('processed');

    const { doc, audit, events } = await load(id);
    expect(doc).toMatchObject({ status: 'clean', bucket: storage.buckets.documents, scanSignature: null });
    expect(doc.scannedAt).toBeInstanceOf(Date);
    expect(await exists(storage.buckets.documents, key)).toBe(true);
    expect(await exists(storage.buckets.quarantine, key)).toBe(false);
    expect(audit.map((a) => a.action)).toEqual(['document.scan_clean']);
    expect(events[0]).toMatchObject({ eventType: 'documents.document_scanned', payload: { result: 'clean' } });
  });

  it('keeps an infected file in quarantine and records the signature', async () => {
    const { id, key, event } = await uploadedDocument(EICAR);
    await handleEvent(db, scanner, event);

    const { doc, audit, events } = await load(id);
    expect(doc).toMatchObject({ status: 'infected', bucket: storage.buckets.quarantine });
    expect(doc.scanSignature).toMatch(/eicar/i);
    expect(await exists(storage.buckets.quarantine, key)).toBe(true);
    expect(await exists(storage.buckets.documents, key)).toBe(false);
    expect(audit.map((a) => a.action)).toEqual(['document.scan_infected']);
    expect(events[0]).toMatchObject({ payload: { result: 'infected' } });
  });

  it('does nothing on redelivery', async () => {
    const { id, event } = await uploadedDocument('a,b\n1,2\n');
    await handleEvent(db, scanner, event);
    expect(await handleEvent(db, scanner, event)).toBe('duplicate');
    expect((await load(id)).audit).toHaveLength(1);
  });
});
