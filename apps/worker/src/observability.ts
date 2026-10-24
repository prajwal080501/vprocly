let alertWebhookUrl: string | undefined;
let releaseVersion = 'development';
const lastAlertAt = new Map<string, number>();

export function configureWorkerObservability(config: { alertWebhookUrl?: string; releaseVersion: string }) {
  alertWebhookUrl = config.alertWebhookUrl;
  releaseVersion = config.releaseVersion;
}

export function operationalFields(payload: Record<string, unknown>) {
  return {
    itemId: typeof payload.sourcingLineId === 'string' ? payload.sourcingLineId : null,
    supplierId: typeof payload.platformSupplierId === 'string' ? payload.platformSupplierId : null,
    jobId: typeof payload.jobId === 'string' ? payload.jobId : typeof payload.researchJobId === 'string' ? payload.researchJobId : null,
  };
}

export async function alertWorker(key: string, summary: string, context: Record<string, unknown>) {
  if (!alertWebhookUrl) return;
  const now = Date.now();
  if (now - (lastAlertAt.get(key) ?? 0) < 5 * 60_000) return;
  lastAlertAt.set(key, now);
  try {
    const response = await fetch(alertWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: 'vprocly-worker', releaseVersion, severity: 'error', summary, ...context }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) console.error(JSON.stringify({ msg: 'operations alert delivery failed', status: response.status, key }));
  } catch (error) {
    console.error(JSON.stringify({ msg: 'operations alert delivery failed', key, error: String(error) }));
  }
}
