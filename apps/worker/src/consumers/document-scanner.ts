import { appendAudit, documents, enqueueEvent, withTenant, type Database } from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import type { ClamAv } from '../clamav.js';
import type { ConsumerDefinition } from '../consumer.js';
import type { ObjectStorage } from '../object-storage.js';

type Prepared =
  | { skip: true }
  | { skip: false; documentId: string; objectKey: string; clean: boolean; signature: string | null };

/**
 * Scans each uploaded document. Clean files are copied to the documents bucket and released; infected files
 * stay in quarantine (kept for investigation) and are marked `infected`. Nothing is downloadable before this.
 */
export function documentScanner(deps: { db: Database; storage: ObjectStorage; clamav: ClamAv }): ConsumerDefinition<Prepared> {
  const { db, storage, clamav } = deps;
  return {
    name: 'documents-scanner',
    filterSubjects: ['vprocly.*.documents.document_uploaded.v1'],
    async prepare(event) {
      const documentId = String(event.payload.documentId);
      const [doc] = await withTenant(db, { tenantId: event.tenantId }, (tx) =>
        tx.select().from(documents).where(eq(documents.id, documentId)),
      );
      if (!doc || doc.status !== 'pending_scan') return { skip: true };

      const result = await clamav.scan(await storage.stream(storage.buckets.quarantine, doc.objectKey));
      if (result.clean) await storage.copy(storage.buckets.quarantine, storage.buckets.documents, doc.objectKey);
      return {
        skip: false,
        documentId,
        objectKey: doc.objectKey,
        clean: result.clean,
        signature: result.clean ? null : result.signature,
      };
    },
    async handler(tx, event, p) {
      if (p.skip) return;
      const status = p.clean ? 'clean' : 'infected';
      const [updated] = await tx
        .update(documents)
        .set({
          status,
          bucket: p.clean ? storage.buckets.documents : storage.buckets.quarantine,
          scannedAt: new Date(),
          scanSignature: p.signature,
        })
        .where(and(eq(documents.id, p.documentId), eq(documents.status, 'pending_scan')))
        .returning({ id: documents.id });
      if (!updated) return;

      await appendAudit(tx, {
        actorType: 'system',
        action: p.clean ? 'document.scan_clean' : 'document.scan_infected',
        entityType: 'document',
        entityId: p.documentId,
        correlationId: event.correlationId,
        data: p.signature ? { signature: p.signature } : {},
      });
      await enqueueEvent(tx, event.tenantId, {
        eventType: 'documents.document_scanned',
        eventVersion: 1,
        aggregateType: 'document',
        aggregateId: p.documentId,
        payload: { documentId: p.documentId, result: status, signature: p.signature },
        correlationId: event.correlationId,
      });
    },
    async afterCommit(_event, p) {
      if (!p.skip && p.clean) await storage.delete(storage.buckets.quarantine, p.objectKey);
    },
  };
}
