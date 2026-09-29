import type { Client } from '@temporalio/client';
import type { Database } from '@vprocly/db';
import type { ClamAv } from '../clamav.js';
import type { AnyConsumer } from '../consumer.js';
import type { Mailers } from '../mailer.js';
import type { ObjectStorage } from '../object-storage.js';
import type { SupplierResearchClient } from '../research/supplier-research-client.js';
import type { CampaignClient } from '../voice/sarvam-campaign-client.js';
import type { VoiceCallClient } from '../voice/sarvam-client.js';
import { documentScanner } from './document-scanner.js';
import { sourcingInviteMailer } from './sourcing-invite-mailer.js';
import { sourcingManualMailer } from './sourcing-manual-mailer.js';
import { sourcingAwardMailer } from './sourcing-award-mailer.js';
import { sourcingRequestSummaryMailer } from './sourcing-request-summary-mailer.js';
import { supplierResearchAgent } from './supplier-research-agent.js';
import { supplierOutreachRouter } from './supplier-outreach-router.js';
import { supplierVoiceCaller } from './supplier-voice-caller.js';
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
  /** Unset disables AI supplier discovery entirely (no GEMINI_API_KEY/GOOGLE_PLACES_API_KEY configured) --
   *  sourcing.sourcing_line_unmatched events simply queue durably in JetStream, unconsumed, until a properly
   *  configured worker instance is online. Deliberately optional so a missing key on this optional feature
   *  can never crash every other consumer on startup. */
  research?: SupplierResearchClient;
  supplierResearchMaxCandidates: number;
  voiceMode: 'capture' | 'live';
  /** Instant Outbound -- the Phase E manual "Call" button only, always live regardless of voiceMode. */
  voice?: VoiceCallClient;
  /** Batch outbound (Campaigns + Cohorts) -- the automatic call-on-match path, see supplier-outreach-router.ts. */
  campaign?: CampaignClient;
  campaignId?: string;
};

/** Registered event consumers. ExceptionOS detectors and projections are added here later. */
export function buildConsumers(deps: ConsumerDeps): AnyConsumer[] {
  const consumers: AnyConsumer[] = [
    documentScanner(deps),
    uploadDeadlines({ temporal: deps.temporal, taskQueue: deps.taskQueue, deadlineSeconds: deps.uploadDeadlineSeconds }),
    sourcingInviteMailer(deps),
    sourcingManualMailer(deps),
    sourcingRequestSummaryMailer(deps),
    sourcingAwardMailer(deps),
    supplierOutreachRouter({ db: deps.db, voiceMode: deps.voiceMode, campaign: deps.campaign, campaignId: deps.campaignId }),
  ];
  if (deps.voice) consumers.push(supplierVoiceCaller({ db: deps.db, voice: deps.voice }));
  if (deps.research) consumers.push(supplierResearchAgent({ db: deps.db, research: deps.research, maxCandidates: deps.supplierResearchMaxCandidates }));
  return consumers;
}
