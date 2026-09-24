import { appendAudit, documents, withTenant, type Database } from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import type { ObjectStorage } from '../../object-storage.js';

export type DocumentActivities = ReturnType<typeof createDocumentActivities>;

export function createDocumentActivities(deps: { db: Database; storage: ObjectStorage }) {
  return {
    /** Marks an upload that never completed as expired. Returns false if it had already moved on. */
    async expireUploadIfPending(input: { tenantId: string; documentId: string }): Promise<boolean> {
      const expired = await withTenant(deps.db, { tenantId: input.tenantId }, async (tx) => {
        const [row] = await tx
          .update(documents)
          .set({ status: 'expired' })
          .where(and(eq(documents.id, input.documentId), eq(documents.status, 'pending_upload')))
          .returning({ bucket: documents.bucket, objectKey: documents.objectKey });
        if (!row) return null;
        await appendAudit(tx, {
          actorType: 'system',
          action: 'document.upload_expired',
          entityType: 'document',
          entityId: input.documentId,
        });
        return row;
      });
      if (!expired) return false;
      // A partial or late object may exist; remove it (idempotent).
      await deps.storage.delete(expired.bucket, expired.objectKey);
      return true;
    },
  };
}
