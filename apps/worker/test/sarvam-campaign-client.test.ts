import { afterEach, describe, expect, it, vi } from 'vitest';
import { SarvamCampaignClient } from '../src/voice/sarvam-campaign-client.js';

afterEach(() => vi.unstubAllGlobals());

const baseConfig = {
  apiKey: 'k',
  orgId: 'org id',
  workspaceId: 'ws',
  appId: 'app',
  appVersion: 1,
  connectionId: 'conn',
  agentPhoneNumber: '+918000000000',
  webhookUrl: 'https://api.example.com/webhook',
  campaignName: 'vprocly-supplier-outreach',
  attemptsPerSecond: 1,
  maxRetries: 2,
  retryIntervalMinutes: 15,
  timezone: 'Asia/Kolkata',
  startTime: '10:00',
  endTime: '18:00',
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

describe('SarvamCampaignClient.ensureCampaign', () => {
  it('reuses an existing active campaign matching the configured name instead of creating a new one', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ items: [{ campaign_id: 'existing-123', name: 'vprocly-supplier-outreach', status: 'active' }], total: 1, limit: 10, offset: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new SarvamCampaignClient(baseConfig);

    await expect(client.ensureCampaign()).resolves.toEqual({ campaignId: 'existing-123' });
    expect(fetchMock).toHaveBeenCalledTimes(1); // list only, no create
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/campaigns');
  });

  it('ignores an ended campaign with the same name and creates a fresh one', async () => {
    let call = 0;
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ items: [{ campaign_id: 'old-1', name: 'vprocly-supplier-outreach', status: 'ended' }], total: 1, limit: 10, offset: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ campaign_id: 'new-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new SarvamCampaignClient(baseConfig);

    await expect(client.ensureCampaign()).resolves.toEqual({ campaignId: 'new-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, createInit] = fetchMock.mock.calls[1]!;
    const body = JSON.parse(String(createInit?.body));
    expect(body).toMatchObject({
      name: 'vprocly-supplier-outreach',
      app_config: {
        app_id: 'app',
        app_version: 1,
        attempts_per_second: 1,
        connection_configs: [{ connection_id: 'conn', agent_phone_number: '+918000000000' }],
        retry_config: { max_retries: 2, retry_interval_minutes: 15 },
      },
      allowed_schedule: { timezone: 'Asia/Kolkata', allowed_start_time: '10:00', allowed_end_time: '18:00', allowed_days: baseConfig.days },
    });
  });

  it('throws with the response body when campaign creation fails', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify({ items: [], total: 0, limit: 10, offset: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ detail: 'bad request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new SarvamCampaignClient(baseConfig);

    await expect(client.ensureCampaign()).rejects.toThrow(/Sarvam create campaign failed \(400\)/);
  });
});

describe('SarvamCampaignClient.addToCohort', () => {
  it('streams members into the given campaign, mapping field names to Sarvam\'s snake_case shape', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ cohort_id: 'cohort-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SarvamCampaignClient(baseConfig);

    await client.addToCohort('campaign-1', [
      { userPhoneNumber: '+919876543210', userIdentifier: 'tenant:call-1', appVariables: { supplier_name: 'Acme', quantity: '5' } },
    ]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/campaigns/campaign-1/cohorts/stream');
    const body = JSON.parse(String(init?.body));
    expect(body.users).toEqual([{ user_phone_number: '+919876543210', user_identifier: 'tenant:call-1', app_variables: { supplier_name: 'Acme', quantity: '5' } }]);
  });

  it('does not call fetch at all for an empty member list', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new SarvamCampaignClient(baseConfig);

    await client.addToCohort('campaign-1', []);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when Sarvam rejects the cohort', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 422 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new SarvamCampaignClient(baseConfig);

    await expect(client.addToCohort('campaign-1', [{ userPhoneNumber: '+919876543210', userIdentifier: 'x', appVariables: {} }])).rejects.toThrow(/Sarvam stream cohort failed \(422\)/);
  });
});
