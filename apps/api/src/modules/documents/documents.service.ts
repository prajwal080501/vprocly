import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { documents } from '@vprocly/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { EventsService } from '../../platform/events.service.js';
import type { RequestContext } from '../../platform/request-context.js';
import { AuditService } from '../audit-evidence/index.js';
import { TenantDb } from '../identity-tenancy/index.js';
import { ObjectStorage } from './object-storage.service.js';

export const ALLOWED_CONTENT_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const CreateUpload = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  purpose: z.enum(['import', 'quotation', 'attachment']),
});
export type CreateUpload = z.infer<typeof CreateUpload>;

/**
 * Uploads land in the quarantine bucket via a short-lived presigned URL. Completing an upload verifies the
 * object, records its hash, and leaves it as `pending_scan` until the file scanner (Sprint 1) releases it.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async createUpload(ctx: RequestContext, input: CreateUpload) {
    const safeName = input.fileName.replace(/[^\w.\- ]+/g, '_');
    const doc = await this.tenantDb.run(ctx, async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({
          tenantId: ctx.tenantId,
          bucket: this.storage.buckets.quarantine,
          objectKey: 'pending',
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          uploadedBy: ctx.userId,
        })
        .returning();
      const objectKey = `${ctx.tenantId}/${row!.id}/${safeName}`;
      await tx.update(documents).set({ objectKey }).where(eq(documents.id, row!.id));
      // Starts the upload-deadline workflow (via the worker), so abandoned uploads expire.
      await this.events.emit(tx, ctx, {
        type: 'documents.upload_requested',
        version: 1,
        aggregateType: 'document',
        aggregateId: row!.id,
        payload: { documentId: row!.id, fileName: input.fileName, purpose: input.purpose },
      });
      return { ...row!, objectKey };
    });
    const uploadUrl = await this.storage.presignPut(doc.bucket, doc.objectKey, input.contentType, input.sizeBytes);
    return { documentId: doc.id, uploadUrl, method: 'PUT', headers: { 'content-type': input.contentType } };
  }

  async completeUpload(ctx: RequestContext, documentId: string, purpose: CreateUpload['purpose']) {
    const [doc] = await this.tenantDb.run(ctx, (tx) =>
      tx
        .select()
        .from(documents)
        .where(and(eq(documents.id, documentId), eq(documents.status, 'pending_upload'))),
    );
    if (!doc) throw new NotFoundException('Document not found or already completed');

    // Object-store work happens outside the transaction; the status guard below makes completion idempotent.
    const head = await this.storage.head(doc.bucket, doc.objectKey);
    if (!head) throw new BadRequestException('Object has not been uploaded');
    if (head.ContentLength !== doc.sizeBytes) throw new BadRequestException('Uploaded size does not match');
    const sha256 = await this.storage.sha256(doc.bucket, doc.objectKey);

    return this.tenantDb.run(ctx, async (tx) => {
      const [updated] = await tx
        .update(documents)
        .set({ status: 'pending_scan', sha256 })
        .where(and(eq(documents.id, doc.id), eq(documents.status, 'pending_upload')))
        .returning();
      if (!updated) throw new NotFoundException('Document not found or already completed');

      await this.audit.record(tx, ctx, {
        action: 'document.uploaded',
        entityType: 'document',
        entityId: doc.id,
        data: { fileName: doc.fileName, sha256, sizeBytes: doc.sizeBytes, purpose },
      });
      await this.events.emit(tx, ctx, {
        type: 'documents.document_uploaded',
        version: 1,
        aggregateType: 'document',
        aggregateId: doc.id,
        payload: { documentId: doc.id, fileName: doc.fileName, contentType: doc.contentType, purpose },
      });
      return updated;
    });
  }

  /** Short-lived download link, only for documents the virus scanner has released. Every download is audited. */
  async downloadUrl(ctx: RequestContext, documentId: string) {
    const doc = await this.tenantDb.run(ctx, async (tx) => {
      const [row] = await tx.select().from(documents).where(eq(documents.id, documentId));
      if (!row) throw new NotFoundException();
      if (row.status !== 'clean') throw new ConflictException(`Document is ${row.status}; only scanned-clean files can be downloaded`);
      await this.audit.record(tx, ctx, { action: 'document.download_link_issued', entityType: 'document', entityId: row.id });
      return row;
    });
    return { url: await this.storage.presignGet(doc.bucket, doc.objectKey, doc.fileName), expiresInSeconds: 300 };
  }

  async get(ctx: RequestContext, documentId: string) {
    const [doc] = await this.tenantDb.run(ctx, (tx) => tx.select().from(documents).where(eq(documents.id, documentId)));
    if (!doc) throw new NotFoundException();
    return doc;
  }
}
