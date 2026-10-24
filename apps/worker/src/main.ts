import { jetstream } from '@nats-io/jetstream';
import { connect } from '@nats-io/transport-node';
import { Client, Connection } from '@temporalio/client';
import { createDatabase, createPool } from '@vprocly/db';
import { ClamAv } from './clamav.js';
import { loadConfig } from './config.js';
import { runConsumer } from './consumer.js';
import { buildConsumers } from './consumers/index.js';
import { createMailers } from './mailer.js';
import { ObjectStorage } from './object-storage.js';
import { alertWorker, configureWorkerObservability } from './observability.js';
import { relayOnce } from './relay.js';
import { GeminiPlacesResearchClient } from './research/gemini-places-client.js';
import { ensureStreams } from './streams.js';
import { createDocumentActivities } from './temporal/activities/documents.js';
import { createTemporalWorker } from './temporal/worker.js';
import { SarvamCampaignClient } from './voice/sarvam-campaign-client.js';
import { SarvamVoiceCallClient } from './voice/sarvam-client.js';

const config = loadConfig();
configureWorkerObservability({ alertWebhookUrl: config.OPS_ALERT_WEBHOOK_URL, releaseVersion: config.RELEASE_VERSION });
console.log(JSON.stringify({ msg: 'email delivery configured', mode: config.EMAIL_DELIVERY_MODE }));
console.log(JSON.stringify({ msg: 'voice delivery configured', mode: config.VOICE_DELIVERY_MODE }));
const pool = createPool(config.DATABASE_URL, 5);
const db = createDatabase(pool);
const storage = new ObjectStorage(config);
await storage.ensureBuckets();

const nc = await connect({ servers: config.NATS_URL, name: 'vprocly-worker' });
const js = jetstream(nc);
await ensureStreams(nc);

const temporalConnection = await Connection.connect({ address: config.TEMPORAL_ADDRESS });
const temporal = new Client({ connection: temporalConnection, namespace: config.TEMPORAL_NAMESPACE });
const { worker: temporalWorker, connection: temporalWorkerConnection } = await createTemporalWorker(config, {
  ...createDocumentActivities({ db, storage }),
});
const temporalRun = temporalWorker.run();

const research =
  config.GEMINI_API_KEY && config.GOOGLE_PLACES_API_KEY
    ? new GeminiPlacesResearchClient({
        geminiApiKey: config.GEMINI_API_KEY,
        geminiModel: config.GEMINI_MODEL,
        placesApiKey: config.GOOGLE_PLACES_API_KEY,
        geminiInputCostMicrosPerMillion: config.GEMINI_INPUT_COST_MICROS_PER_MILLION,
        geminiOutputCostMicrosPerMillion: config.GEMINI_OUTPUT_COST_MICROS_PER_MILLION,
        geminiSearchCostMicros: config.GEMINI_SEARCH_COST_MICROS,
        placeDetailsCostMicros: config.GOOGLE_PLACE_DETAILS_COST_MICROS,
      })
    : undefined;
if (!research) console.log(JSON.stringify({ msg: 'AI supplier discovery disabled: GEMINI_API_KEY/GOOGLE_PLACES_API_KEY not set' }));

// Constructed whenever Sarvam is configured, regardless of VOICE_DELIVERY_MODE -- supplier-outreach-router.ts
// still reads voiceMode separately to decide the *automatic* call-vs-email choice. A manual call (from the
// API's manualCall endpoint) needs this client to exist even while the automatic pipeline stays in capture.
const voice = config.SARVAM_API_KEY && config.SARVAM_ORG_ID && config.SARVAM_WORKSPACE_ID && config.SARVAM_APP_ID && config.SARVAM_CONNECTION_ID && config.SARVAM_AGENT_PHONE_NUMBER && config.SARVAM_WEBHOOK_SECRET
  ? new SarvamVoiceCallClient({
      apiKey: config.SARVAM_API_KEY!,
      orgId: config.SARVAM_ORG_ID!,
      workspaceId: config.SARVAM_WORKSPACE_ID!,
      appId: config.SARVAM_APP_ID!,
      appVersion: config.SARVAM_APP_VERSION,
      connectionId: config.SARVAM_CONNECTION_ID!,
      agentPhoneNumber: config.SARVAM_AGENT_PHONE_NUMBER!,
      webhookUrl: `${config.PUBLIC_API_URL}/api/webhooks/sarvam/instant-outbound/${encodeURIComponent(config.SARVAM_WEBHOOK_SECRET!)}`,
    })
  : undefined;
if (!voice) console.log(JSON.stringify({ msg: 'Voice calling disabled: Sarvam config incomplete (both automatic and manual calls are unavailable)' }));

// The automatic call-on-match path (supplier-outreach-router.ts) streams matched suppliers into one
// long-lived Sarvam campaign instead of placing an Instant Outbound call per match -- see Phase F. Needs the
// same Sarvam config as `voice` above, so it's only constructed when that's already present.
const campaign = voice && config.VOICE_DELIVERY_MODE === 'live'
  ? new SarvamCampaignClient({
      apiKey: config.SARVAM_API_KEY!,
      orgId: config.SARVAM_ORG_ID!,
      workspaceId: config.SARVAM_WORKSPACE_ID!,
      appId: config.SARVAM_APP_ID!,
      appVersion: config.SARVAM_APP_VERSION,
      connectionId: config.SARVAM_CONNECTION_ID!,
      agentPhoneNumber: config.SARVAM_AGENT_PHONE_NUMBER!,
      webhookUrl: `${config.PUBLIC_API_URL}/api/webhooks/sarvam/instant-outbound/${encodeURIComponent(config.SARVAM_WEBHOOK_SECRET!)}`,
      campaignName: config.SARVAM_CAMPAIGN_NAME,
      attemptsPerSecond: config.SARVAM_CAMPAIGN_ATTEMPTS_PER_SECOND,
      maxRetries: config.SARVAM_CAMPAIGN_MAX_RETRIES,
      retryIntervalMinutes: config.SARVAM_CAMPAIGN_RETRY_INTERVAL_MINUTES,
      timezone: config.SARVAM_CAMPAIGN_TIMEZONE,
      startTime: config.SARVAM_CAMPAIGN_START_TIME,
      endTime: config.SARVAM_CAMPAIGN_END_TIME,
      days: config.SARVAM_CAMPAIGN_DAYS.split(',').map((d) => d.trim()),
    })
  : undefined;
// A Sarvam outage/misconfiguration here must degrade to "automatic calling is unavailable", never crash the
// whole worker -- every other consumer (mailers, document scanner, research) has nothing to do with this.
let campaignId: string | undefined;
if (campaign) {
  try {
    campaignId = (await campaign.ensureCampaign()).campaignId;
    console.log(JSON.stringify({ msg: 'Sarvam campaign ready', campaignId }));
  } catch (err) {
    const fields = { msg: 'Sarvam campaign setup failed; automatic calling disabled this run', error: String(err) };
    console.error(JSON.stringify(fields));
    void alertWorker('sarvam-campaign-setup', fields.msg, fields);
  }
}

const consumers = buildConsumers({
  db,
  storage,
  clamav: new ClamAv(config.CLAMAV_HOST, config.CLAMAV_PORT),
  temporal,
  taskQueue: config.TEMPORAL_TASK_QUEUE,
  uploadDeadlineSeconds: config.UPLOAD_DEADLINE_SECONDS,
  mailers: createMailers(config),
  publicWebUrl: config.PUBLIC_WEB_URL,
  research,
  supplierResearchMaxCandidates: config.SUPPLIER_RESEARCH_MAX_CANDIDATES,
  voiceMode: config.VOICE_DELIVERY_MODE,
  voice,
  campaign,
  campaignId,
});
const running = await Promise.all(consumers.map((def) => runConsumer(nc, js, db, def)));

let stopping = false;
const relayLoop = (async () => {
  while (!stopping) {
    try {
      const { published, failed } = await relayOnce(db, js, config.RELAY_BATCH_SIZE);
      if (published || failed) console.log(JSON.stringify({ msg: 'outbox relay', published, failed }));
      if (published + failed < config.RELAY_BATCH_SIZE) await sleep(config.RELAY_IDLE_MS);
    } catch (err) {
      const fields = { msg: 'outbox relay error', error: String(err) };
      console.error(JSON.stringify(fields));
      void alertWorker('outbox-relay', fields.msg, fields);
      await sleep(config.RELAY_IDLE_MS * 4);
    }
  }
})();

console.log(
  JSON.stringify({ msg: 'worker started', consumers: consumers.map((c) => c.name), taskQueue: config.TEMPORAL_TASK_QUEUE }),
);

async function shutdown() {
  if (stopping) return;
  stopping = true;
  await relayLoop;
  await Promise.all(running.map((r) => r.stop()));
  temporalWorker.shutdown();
  await temporalRun;
  await temporalWorkerConnection.close();
  await temporalConnection.close();
  await nc.drain();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
