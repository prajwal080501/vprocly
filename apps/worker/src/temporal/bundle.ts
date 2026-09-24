// Pre-bundles workflow code at build time so worker start-up does not run webpack.
import { writeFile } from 'node:fs/promises';
import { bundleWorkflowCode } from '@temporalio/worker';
import { workflowBundlePath, workflowsPath } from './worker.js';

const { code } = await bundleWorkflowCode({ workflowsPath });
await writeFile(workflowBundlePath, code);
console.log(`workflow bundle written to ${workflowBundlePath}`);
