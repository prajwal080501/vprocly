export type SupplierCallRequest = {
  phone: string;
  tenantId: string;
  voiceCallId: string;
  supplierName: string;
  itemDescription: string;
  quantity: string;
  uom: string;
  deliveryCity: string;
  deliveryState: string;
};

export interface VoiceCallClient {
  createCall(request: SupplierCallRequest): Promise<{ attemptId: string }>;
}

export function supplierCallItemDescription(
  itemDescription: string,
  quantity: string,
  uom: string,
  deliveryCity: string,
  deliveryState: string,
): string {
  const quantityLabel = [quantity, uom].filter(Boolean).join(' ');
  const deliveryLabel = [deliveryCity, deliveryState].filter(Boolean).join(', ');
  const context = [quantityLabel && `Quantity: ${quantityLabel}`, deliveryLabel && `Delivery: ${deliveryLabel}`].filter(Boolean);
  return context.length > 0 ? `${itemDescription}\n${context.join('\n')}` : itemDescription;
}

/** Sarvam requires E.164 (`+<countrycode><number>`), but phone numbers reach this platform from several
 * places that don't enforce that -- a supplier typing their own number into the profile popover, or the
 * AI research pipeline lifting one off Google Places, both commonly in India's bare national format
 * ("9834477319" or "09834477319"). This platform is India-only today (INR, GST, Indian addresses
 * throughout), so it's safe to assume +91 for anything that isn't already E.164; anything that still
 * doesn't look like a plausible number is passed through unchanged so Sarvam's own validation error (not a
 * silently wrong guess) is what the buyer sees. */
export function toE164India(phone: string): string {
  const digits = phone.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) return digits;
  if (/^0\d{10}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  return phone;
}

type SarvamConfig = {
  apiKey: string;
  orgId: string;
  workspaceId: string;
  appId: string;
  appVersion: number;
  connectionId: string;
  agentPhoneNumber: string;
  webhookUrl: string;
};

/** Sarvam Instant Outbound API client. API keys stay server-side; supplier/item context is supplied as
 * agent variables so the configured voice agent can explain the sourcing opportunity and invite a bid. */
export class SarvamVoiceCallClient implements VoiceCallClient {
  constructor(private readonly config: SarvamConfig) {}

  async createCall(request: SupplierCallRequest): Promise<{ attemptId: string }> {
    const url = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${encodeURIComponent(this.config.orgId)}/workspaces/${encodeURIComponent(this.config.workspaceId)}/outbounds`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.config.apiKey },
      body: JSON.stringify({
        app_config: {
          app_id: this.config.appId,
          app_version: this.config.appVersion,
          connection_config: {
            connection_id: this.config.connectionId,
            agent_phone_number: this.config.agentPhoneNumber,
          },
          agent_variables: {
            supplier_name: request.supplierName,
            item_description: supplierCallItemDescription(
              request.itemDescription,
              request.quantity,
              request.uom,
              request.deliveryCity,
              request.deliveryState,
            ),
          },
        },
        user_config: { user_phone_number: toE164India(request.phone) },
        webhook_config: {
          url: this.config.webhookUrl,
          metadata: { tenant_id: request.tenantId, voice_call_id: request.voiceCallId },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => null)) as { attempt_id?: string; detail?: unknown } | null;
    if (!response.ok || !body?.attempt_id) {
      throw new Error(`Sarvam outbound call failed (${response.status}): ${JSON.stringify(body?.detail ?? body)}`);
    }
    return { attemptId: body.attempt_id };
  }
}
