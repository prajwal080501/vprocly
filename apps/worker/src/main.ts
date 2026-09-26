import { jetstream } from '@nats-io/jetstream';
import { connect } from '@nats-io/transport-node';
import { Client, Connection } from '@temporalio/client';
import { createDatabase, createPool } from '@vprocly/db';
import { ClamAv } from './clamav.js';
import { loadConfig } from './config.js';
import { runConsumer } from './consumer.js';
import { buildConsumers } from './consumers/index.js';
import { createMailer } from './mailer.js';
import { ObjectStorage } from './object-storage.js';
import { relayOnce } from './relay.js';
import { ensureStreams } from './streams.js';
import { createDocumentActivities } from './temporal/activities/documents.js';
import { createTemporalWorker } from './temporal/worker.js';

const config = loadConfig();
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

const consumers = buildConsumers({
  db,
  storage,
  clamav: new ClamAv(config.CLAMAV_HOST, config.CLAMAV_PORT),
  temporal,
  taskQueue: config.TEMPORAL_TASK_QUEUE,
  uploadDeadlineSeconds: config.UPLOAD_DEADLINE_SECONDS,
  mailer: createMailer(config),
  mailFrom: config.MAIL_FROM,
  publicWebUrl: config.PUBLIC_WEB_URL,
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
      console.error(JSON.stringify({ msg: 'outbox relay error', error: String(err) }));
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
