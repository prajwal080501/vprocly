import { WorkflowExecutionAlreadyStartedError, type Client } from '@temporalio/client';
import type { ConsumerDefinition } from '../consumer.js';
import { uploadCompletedSignal, uploadDeadlineWorkflow } from '../temporal/workflows/index.js';

export const uploadDeadlineWorkflowId = (documentId: string) => `upload-deadline-${documentId}`;

/**
 * Starts the deadline workflow when an upload is requested and signals it when the upload completes.
 * Driven by outbox events, so a Temporal outage delays these calls but never loses them.
 */
export function uploadDeadlines(deps: {
  temporal: Client;
  taskQueue: string;
  deadlineSeconds: number;
}): ConsumerDefinition {
  return {
    name: 'documents-upload-deadlines',
    filterSubjects: [
      'vprocly.*.documents.upload_requested.v1',
      'vprocly.*.documents.document_uploaded.v1',
    ],
    async prepare(event) {
      const documentId = String(event.payload.documentId);
      const workflowId = uploadDeadlineWorkflowId(documentId);
      if (event.type === 'documents.upload_requested') {
        const deadlineAt = new Date(Date.parse(event.occurredAt) + deps.deadlineSeconds * 1000).toISOString();
        try {
          await deps.temporal.workflow.start(uploadDeadlineWorkflow, {
            taskQueue: deps.taskQueue,
            workflowId,
            args: [{ tenantId: event.tenantId, documentId, deadlineAt }],
          });
        } catch (err) {
          if (!(err instanceof WorkflowExecutionAlreadyStartedError)) throw err;
        }
      } else {
        try {
          await deps.temporal.workflow.getHandle(workflowId).signal(uploadCompletedSignal);
        } catch (err) {
          // Already finished or never started: nothing to stop.
          if (!(err instanceof Error && /not ?found|already completed/i.test(`${err.name} ${err.message}`))) throw err;
        }
      }
    },
    async handler() {},
  };
}
