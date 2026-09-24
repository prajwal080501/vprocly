import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import type { WorkerConfig } from '../config.js';

// .ts under the test runner, .js in the build.
export const workflowsPath = fileURLToPath(
  new URL(`./workflows/index${extname(fileURLToPath(import.meta.url))}`, import.meta.url),
);

/** Written by `pnpm build` (dist/temporal/bundle.js); used in containers to skip bundling at start-up. */
export const workflowBundlePath = fileURLToPath(new URL('./workflow-bundle.js', import.meta.url));

export async function createTemporalWorker(config: WorkerConfig, activities: object) {
  const connection = await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    ...(existsSync(workflowBundlePath) ? { workflowBundle: { codePath: workflowBundlePath } } : { workflowsPath }),
    activities,
  });
  return { worker, connection };
}
