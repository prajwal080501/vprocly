export type CohortMember = {
  userPhoneNumber: string;
  /** Carried through to the completion webhook so we can match it back to our own supplier_voice_calls
   *  row -- the same role `voice_call_id` plays for Instant Outbound, see sarvam-client.ts. */
  userIdentifier: string;
  appVariables: Record<string, string>;
};

export interface CampaignClient {
  /** Idempotent: reuses an existing open campaign matching the configured name if one exists, else creates
   *  it. Call once at worker startup, not per event. */
  ensureCampaign(): Promise<{ campaignId: string }>;
  /** Streams up to 1000 members into an already-running campaign's cohort. Sarvam's own scheduler places
   *  the actual calls, respecting the campaign's business-hours/rate/retry config -- this call only queues
   *  them. */
  addToCohort(campaignId: string, members: CohortMember[]): Promise<void>;
}

type SarvamCampaignConfig = {
  apiKey: string;
  orgId: string;
  workspaceId: string;
  appId: string;
  appVersion: number;
  connectionId: string;
  agentPhoneNumber: string;
  webhookUrl: string;
  campaignName: string;
  attemptsPerSecond: number;
  maxRetries: number;
  retryIntervalMinutes: number;
  timezone: string;
  startTime: string;
  endTime: string;
  days: string[];
};

const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

/** Sarvam Batch Outbound (Campaigns + Cohorts) API. One long-lived campaign, created once and left open --
 *  suppliers are streamed into its cohort as they're matched, rather than accumulated into periodic
 *  batches, so Sarvam's own scheduler (business hours, rate limit, retries) is the only thing standing
 *  between a match and the actual call. */
export class SarvamCampaignClient implements CampaignClient {
  private readonly base = 'https://apps.sarvam.ai/api/app-authoring';

  constructor(private readonly config: SarvamCampaignConfig) {}

  private headers() {
    return { 'Content-Type': 'application/json', 'X-API-Key': this.config.apiKey };
  }

  private orgWorkspacePath() {
    return `orgs/${encodeURIComponent(this.config.orgId)}/workspaces/${encodeURIComponent(this.config.workspaceId)}`;
  }

  async ensureCampaign(): Promise<{ campaignId: string }> {
    const listRes = await fetch(`${this.base}/v1/${this.orgWorkspacePath()}/campaigns`, { headers: this.headers(), signal: AbortSignal.timeout(15_000) });
    if (!listRes.ok) throw new Error(`Sarvam list campaigns failed (${listRes.status}): ${await listRes.text()}`);
    const list = (await listRes.json()) as { items: { campaign_id: string; name: string; status: 'ended' | 'active' | 'paused' | 'scheduled' | 'cancelled' }[] };
    const existing = list.items.find((c) => c.name === this.config.campaignName && (c.status === 'active' || c.status === 'scheduled' || c.status === 'paused'));
    if (existing) return { campaignId: existing.campaign_id };

    const createRes = await fetch(`${this.base}/v1/${this.orgWorkspacePath()}/campaigns`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: this.config.campaignName,
        app_config: {
          app_id: this.config.appId,
          app_version: this.config.appVersion,
          app_type: 'agent',
          attempts_per_second: this.config.attemptsPerSecond,
          connection_configs: [{ connection_id: this.config.connectionId, agent_phone_number: this.config.agentPhoneNumber }],
          retry_config: {
            max_retries: this.config.maxRetries,
            retry_on: { no_answer: {}, busy: {} },
            retry_interval_minutes: this.config.retryIntervalMinutes,
          },
        },
        start_timestamp: new Date().toISOString(),
        end_timestamp: new Date(Date.now() + FIVE_YEARS_MS).toISOString(),
        allowed_schedule: {
          timezone: this.config.timezone,
          allowed_start_time: this.config.startTime,
          allowed_end_time: this.config.endTime,
          allowed_days: this.config.days,
        },
        webhook_config: { url: this.config.webhookUrl },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await createRes.json().catch(() => null)) as { campaign_id?: string; detail?: unknown } | null;
    if (!createRes.ok || !body?.campaign_id) throw new Error(`Sarvam create campaign failed (${createRes.status}): ${JSON.stringify(body?.detail ?? body)}`);
    return { campaignId: body.campaign_id };
  }

  async addToCohort(campaignId: string, members: CohortMember[]): Promise<void> {
    if (members.length === 0) return;
    const res = await fetch(`${this.base}/v1/${this.orgWorkspacePath()}/campaigns/${encodeURIComponent(campaignId)}/cohorts/stream`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: `batch-${new Date().toISOString()}`,
        users: members.map((m) => ({
          user_phone_number: m.userPhoneNumber,
          user_identifier: m.userIdentifier,
          app_variables: m.appVariables,
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Sarvam stream cohort failed (${res.status}): ${await res.text()}`);
  }
}
