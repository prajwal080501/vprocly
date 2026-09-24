import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import { NativeConnection, Worker } from '@temporalio/worker';
import type { EventEnvelope } from '@vprocly/contracts';
import { auditLog, createDatabase, createPool, documents, withTenant } from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { handleEvent } from '../src/consumer.js';
import { uploadDeadlineWorkflowId, uploadDeadlines } from '../src/consumers/upload-deadlines.js';
import { ObjectStorage } from '../src/object-storage.js';
import { createDocumentActivities } from '../src/temporal/activities/documents.js';
import { workflowsPath } from '../src/temporal/worker.js';
import { uploadCompletedSignal, uploadDeadlineWorkflow } from '../src/temporal/workflows/index.js';

// Runs against the dev Temporal server; a unique task queue isolates this run from a running worker.
const ACME = '11111111-1111-4111-8111-111111111111';
const config = loadConfig({
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly',
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:58333',
  S3_ACCESS_KEY: 'vprocly',
  S3_SECRET_KEY: 'vprocly-secret',
  TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS ?? 'localhost:57233',
});
const taskQueue = `test-${randomUUID()}`;
const pool = createPool(config.DATABASE_URL);
const db = createDatabase(pool);
let client: Client;
let clientConnection: Connection;
let workerConnection: NativeConnection;
let worker: Worker;
let run: Promise<void>;

beforeAll(async () => {
  clientConnection = await Connection.connect({ address: config.TEMPORAL_ADDRESS });
  client = new Client({ connection: clientConnection });
  workerConnection = await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
  worker = await Worker.create({
    connection: workerConnection,
    taskQueue,
    workflowsPath,
    activities: createDocumentActivities({ db, storage: new ObjectStorage(config) }),
  });
  run = worker.run();
}, 120_000);

afterAll(async () => {
  worker?.shutdown();
  await run;
  await workerConnection?.close();
  await clientConnection?.close();
  await pool.end();
});

async function documentWithStatus(status: string) {
  const id = randomUUID();
  await withTenant(db, { tenantId: ACME }, (tx) =>
    tx.insert(documents).values({
      id,
      tenantId: ACME,
      bucket: 'vprocly-quarantine',
      objectKey: `${ACME}/${id}/x.csv`,
      fileName: 'x.csv',
      contentType: 'text/csv',
      status,
    }),
  );
  return id;
}

const statusOf = async (id: string) =>
  (await withTenant(db, { tenantId: ACME }, (tx) => tx.select().from(documents).where(eq(documents.id, id))))[0]!.status;

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

describe('upload deadline workflow', () => {
  it('expires an upload that is still pending at the deadline', async () => {
    const documentId = await documentWithStatus('pending_upload');
    const result = await client.workflow.execute(uploadDeadlineWorkflow, {
      taskQueue,
      workflowId: `t-${documentId}`,
      args: [{ tenantId: ACME, documentId, deadlineAt: inSeconds(1) }],
    });
    expect(result).toBe('expired');
    expect(await statusOf(documentId)).toBe('expired');
    const audit = await withTenant(db, { tenantId: ACME }, (tx) =>
      tx.select().from(auditLog).where(and(eq(auditLog.entityType, 'document'), eq(auditLog.entityId, documentId))),
    );
    expect(audit.map((a) => a.action)).toEqual(['document.upload_expired']);
  });

  it('stops early when the upload completes', async () => {
    const documentId = await documentWithStatus('pending_upload');
    const handle = await client.workflow.start(uploadDeadlineWorkflow, {
      taskQueue,
      workflowId: `t-${documentId}`,
      args: [{ tenantId: ACME, documentId, deadlineAt: inSeconds(600) }],
    });
    await handle.signal(uploadCompletedSignal);
    expect(await handle.result()).toBe('completed');
    expect(await statusOf(documentId)).toBe('pending_upload');
  });

  it('leaves a document that already moved on untouched', async () => {
    const documentId = await documentWithStatus('pending_scan');
    const result = await client.workflow.execute(uploadDeadlineWorkflow, {
      taskQueue,
      workflowId: `t-${documentId}`,
      args: [{ tenantId: ACME, documentId, deadlineAt: inSeconds(0) }],
    });
    expect(result).toBe('already-finished');
    expect(await statusOf(documentId)).toBe('pending_scan');
  });
});

describe('upload deadline consumer', () => {
  const event = (type: string, documentId: string): EventEnvelope => ({
    id: randomUUID(),
    type,
    version: 1,
    tenantId: ACME,
    aggregateType: 'document',
    aggregateId: documentId,
    occurredAt: new Date().toISOString(),
    correlationId: null,
    actorId: null,
    payload: { documentId, fileName: 'x.csv', contentType: 'text/csv', purpose: 'import' },
  });

  it('starts the workflow once per upload and stops it when the upload completes', async () => {
    const consumer = uploadDeadlines({ temporal: client, taskQueue, deadlineSeconds: 600 });
    const documentId = await documentWithStatus('pending_upload');
    const requested = event('documents.upload_requested', documentId);

    await handleEvent(db, consumer, requested);
    // A second request event for the same document does not start a second workflow.
    await handleEvent(db, consumer, { ...requested, id: randomUUID() });
    const handle = client.workflow.getHandle(uploadDeadlineWorkflowId(documentId));
    expect((await handle.describe()).status.name).toBe('RUNNING');

    await handleEvent(db, consumer, event('documents.document_uploaded', documentId));
    expect(await handle.result()).toBe('completed');

    // Signalling a finished or unknown workflow is a no-op.
    await handleEvent(db, consumer, event('documents.document_uploaded', documentId));
    await handleEvent(db, consumer, event('documents.document_uploaded', randomUUID()));
  });
});
