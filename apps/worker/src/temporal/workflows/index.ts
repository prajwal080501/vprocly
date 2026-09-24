// Workflow code runs in Temporal's deterministic sandbox: import only @temporalio/workflow and types here.
import { condition, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import type { DocumentActivities } from '../activities/documents.js';

export const uploadCompletedSignal = defineSignal('uploadCompleted');

const { expireUploadIfPending } = proxyActivities<DocumentActivities>({
  startToCloseTimeout: '1 minute',
  retry: { maximumAttempts: 10 },
});

export type UploadDeadlineInput = { tenantId: string; documentId: string; deadlineAt: string };
export type UploadDeadlineResult = 'completed' | 'expired' | 'already-finished';

/**
 * Waits until the upload's deadline. Completing the upload signals the workflow to stop early; otherwise
 * the document is expired. The same timer + signal shape is used later for approval SLAs.
 */
export async function uploadDeadlineWorkflow(input: UploadDeadlineInput): Promise<UploadDeadlineResult> {
  let completed = false;
  setHandler(uploadCompletedSignal, () => {
    completed = true;
  });
  const remainingMs = Math.max(0, Date.parse(input.deadlineAt) - Date.now());
  if (await condition(() => completed, remainingMs)) return 'completed';
  return (await expireUploadIfPending({ tenantId: input.tenantId, documentId: input.documentId }))
    ? 'expired'
    : 'already-finished';
}
