import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';

type RequestSample = { route: string; status: number; durationMs: number; at: number };

@Injectable()
export class ObservabilityService {
  private readonly startedAt = new Date();
  private readonly samples: RequestSample[] = [];
  private readonly lastAlertAt = new Map<string, number>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  recordRequest(sample: RequestSample) {
    this.samples.push(sample);
    if (this.samples.length > 2_000) this.samples.splice(0, this.samples.length - 2_000);
  }

  snapshot(windowMinutes = 15) {
    const cutoff = Date.now() - windowMinutes * 60_000;
    const samples = this.samples.filter((sample) => sample.at >= cutoff);
    const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
    const percentile = (value: number) => durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * value))]! : 0;
    const errors = samples.filter((sample) => sample.status >= 500);
    const webhookErrors = errors.filter((sample) => sample.route.includes('/webhooks/'));
    return {
      windowMinutes,
      requestCount: samples.length,
      errorCount: errors.length,
      errorRate: samples.length ? errors.length / samples.length : 0,
      averageLatencyMs: samples.length ? Math.round(samples.reduce((sum, sample) => sum + sample.durationMs, 0) / samples.length) : 0,
      p95LatencyMs: Math.round(percentile(0.95)),
      webhookFailureCount: webhookErrors.length,
      startedAt: this.startedAt.toISOString(),
    };
  }

  async alert(key: string, summary: string, context: Record<string, unknown>) {
    if (!this.config.OPS_ALERT_WEBHOOK_URL) return;
    const now = Date.now();
    if (now - (this.lastAlertAt.get(key) ?? 0) < 5 * 60_000) return;
    this.lastAlertAt.set(key, now);
    try {
      const response = await fetch(this.config.OPS_ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ service: 'vprocly-api', releaseVersion: this.config.RELEASE_VERSION, severity: 'error', summary, ...context }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) console.error(JSON.stringify({ msg: 'operations alert delivery failed', status: response.status, key }));
    } catch (error) {
      console.error(JSON.stringify({ msg: 'operations alert delivery failed', key, error: String(error) }));
    }
  }
}
