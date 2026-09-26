import type { Client } from '@temporalio/client';
import type { Database } from '@vprocly/db';
import type { ClamAv } from '../clamav.js';
import type { AnyConsumer } from '../consumer.js';
import type { Mailers } from '../mailer.js';
import type { ObjectStorage } from '../object-storage.js';
import { documentScanner } from './document-scanner.js';
import { sourcingInviteMailer } from './sourcing-invite-mailer.js';
import { sourcingRequestSummaryMailer } from './sourcing-request-summary-mailer.js';
import { uploadDeadlines } from './upload-deadlines.js';

export type ConsumerDeps = {
  db: Database;
  storage: ObjectStorage;
  clamav: ClamAv;
  temporal: Client;
  taskQueue: string;
  uploadDeadlineSeconds: number;
  mailers: Mailers;
  publicWebUrl: string;
};

/** Registered event consumers. ExceptionOS detectors and projections are added here later. */
export function buildConsumers(deps: ConsumerDeps): AnyConsumer[] {
  return [
    documentScanner(deps),
    uploadDeadlines({ temporal: deps.temporal, taskQueue: deps.taskQueue, deadlineSeconds: deps.uploadDeadlineSeconds }),
    sourcingInviteMailer(deps),
    sourcingRequestSummaryMailer(deps),
  ];
}
