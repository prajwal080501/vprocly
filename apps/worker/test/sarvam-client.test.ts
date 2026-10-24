import { afterEach, describe, expect, it, vi } from 'vitest';
import { SarvamVoiceCallClient, toE164India } from '../src/voice/sarvam-client.js';

afterEach(() => vi.unstubAllGlobals());

describe('SarvamVoiceCallClient', () => {
  it('uses the documented Instant Outbound endpoint, API key, variables, and webhook metadata', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ attempt_id: 'attempt-123' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new SarvamVoiceCallClient({
      apiKey: 'secret-api-key',
      orgId: 'org id',
      workspaceId: 'workspace',
      appId: 'supplier-agent',
      appVersion: 3,
      connectionId: 'connection',
      agentPhoneNumber: '+918000000000',
      webhookUrl: 'https://api.example.com/api/webhooks/sarvam/instant-outbound/secret',
    });

    await expect(client.createCall({
      phone: '+919876543210',
      tenantId: '11111111-1111-4111-8111-111111111111',
      voiceCallId: '22222222-2222-4222-8222-222222222222',
      buyerCompanyName: 'Buyer Industries',
      supplierName: 'Supplier Co',
      itemDescription: 'Precision bearing',
      quantity: '10.000',
      uom: 'NOS',
      deliveryCity: 'Pune',
      deliveryState: 'Maharashtra',
    })).resolves.toEqual({ attemptId: 'attempt-123' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://apps.sarvam.ai/api/outbounds/v1/orgs/org%20id/workspaces/workspace/outbounds');
    expect(init?.headers).toMatchObject({ 'X-API-Key': 'secret-api-key' });
    expect(JSON.parse(String(init?.body))).toEqual({
      app_config: {
        app_id: 'supplier-agent',
        app_version: 3,
        connection_config: { connection_id: 'connection', agent_phone_number: '+918000000000' },
        agent_variables: {
          buyer_company_name: 'Buyer Industries',
          supplier_name: 'Supplier Co',
          item_description: 'Precision bearing\nQuantity: 10.000 NOS\nDelivery: Pune, Maharashtra\nNotify the supplier about this request and ask them to check their email for the secure bidding link. Do not collect bid details during the call.',
        },
      },
      user_config: { user_phone_number: '+919876543210' },
      webhook_config: {
        url: 'https://api.example.com/api/webhooks/sarvam/instant-outbound/secret',
        metadata: { tenant_id: '11111111-1111-4111-8111-111111111111', voice_call_id: '22222222-2222-4222-8222-222222222222' },
      },
    });
  });

  it('normalizes a bare Indian national number to E.164 before sending it to Sarvam', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ attempt_id: 'attempt-456' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new SarvamVoiceCallClient({
      apiKey: 'k',
      orgId: 'org',
      workspaceId: 'ws',
      appId: 'app',
      appVersion: 1,
      connectionId: 'conn',
      agentPhoneNumber: '+918000000000',
      webhookUrl: 'https://api.example.com/webhook',
    });

    await client.createCall({
      phone: '9834477319', // exactly the bare national format Sarvam rejected in production
      tenantId: '11111111-1111-4111-8111-111111111111',
      voiceCallId: '22222222-2222-4222-8222-222222222222',
      buyerCompanyName: 'Buyer Industries',
      supplierName: 'Supplier Co',
      itemDescription: 'Precision bearing',
      quantity: '10.000',
      uom: 'NOS',
      deliveryCity: 'Pune',
      deliveryState: 'Maharashtra',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({ user_config: { user_phone_number: '+919834477319' } });
  });
});

describe('toE164India', () => {
  it('leaves an already-E.164 number untouched', () => {
    expect(toE164India('+919876543210')).toBe('+919876543210');
  });

  it('adds +91 to a bare 10-digit number', () => {
    expect(toE164India('9834477319')).toBe('+919834477319');
  });

  it('adds +91 and drops the leading 0 from a national-format number', () => {
    expect(toE164India('09834477319')).toBe('+919834477319');
  });

  it('adds the missing + to a 91-prefixed number with no plus', () => {
    expect(toE164India('919834477319')).toBe('+919834477319');
  });

  it('strips spaces and hyphens before normalizing', () => {
    expect(toE164India('98344 77319')).toBe('+919834477319');
    expect(toE164India('98344-77319')).toBe('+919834477319');
  });

  it('passes through anything it cannot confidently normalize, so Sarvam surfaces a real validation error', () => {
    expect(toE164India('12345')).toBe('12345');
  });
});
