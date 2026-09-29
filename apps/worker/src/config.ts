import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().url(),
  NATS_URL: z.string().default('nats://localhost:54222'),
  RELAY_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  RELAY_IDLE_MS: z.coerce.number().int().positive().default(500),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET_DOCUMENTS: z.string().default('vprocly-documents'),
  S3_BUCKET_QUARANTINE: z.string().default('vprocly-quarantine'),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().int().default(53310),
  TEMPORAL_ADDRESS: z.string().default('localhost:57233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_TASK_QUEUE: z.string().default('vprocly-platform'),
  UPLOAD_DEADLINE_SECONDS: z.coerce.number().int().positive().default(3600),
  /** Capture is the safe local/test default and ignores real SMTP settings entirely. Live delivery must be
   * explicitly enabled and provide credentials for both sender identities. */
  EMAIL_DELIVERY_MODE: z.enum(['capture', 'live']).default('capture'),
  MAILPIT_SMTP_HOST: z.string().default('localhost'),
  MAILPIT_SMTP_PORT: z.coerce.number().int().default(51025),
  // Two SMTP identities, matching Namecheap Private Email's split: SMTP_* ("rfq@") sends the actual invite
  // emails suppliers see; NOREPLY_SMTP_* ("noreply@") sends system notifications back to the buyer (and,
  // later, OTP). Neither needs SMTP_USER/PASS set locally -- both default to Mailpit, which takes no auth.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(51025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('vProcly RFQ <rfq@vprocly.example>'),
  NOREPLY_SMTP_HOST: z.string().default('localhost'),
  NOREPLY_SMTP_PORT: z.coerce.number().int().default(51025),
  NOREPLY_SMTP_USER: z.string().optional(),
  NOREPLY_SMTP_PASS: z.string().optional(),
  NOREPLY_SMTP_FROM: z.string().default('vProcly <noreply@vprocly.example>'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  INVITE_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  /** AI supplier discovery (supplier-research-agent.ts). Both optional -- unset disables the consumer
   *  entirely rather than crashing the worker on startup; see ConsumerDeps.research. */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  SUPPLIER_RESEARCH_MAX_CANDIDATES: z.coerce.number().int().positive().default(5),
  /** Voice calls are capture-only by default. Live mode requires a deployed Sarvam app, telephony
   * connection, public API webhook URL, and a shared webhook secret. */
  VOICE_DELIVERY_MODE: z.enum(['capture', 'live']).default('capture'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_ORG_ID: z.string().optional(),
  SARVAM_WORKSPACE_ID: z.string().optional(),
  SARVAM_APP_ID: z.string().optional(),
  SARVAM_APP_VERSION: z.coerce.number().int().positive().default(1),
  SARVAM_CONNECTION_ID: z.string().optional(),
  SARVAM_AGENT_PHONE_NUMBER: z.string().optional(),
  SARVAM_WEBHOOK_SECRET: z.string().min(24).optional(),
  /** Batch outbound calling (supplier-outreach-router.ts's automatic path, sarvam-campaign-client.ts). One
   *  long-lived campaign, created once and reused -- these defaults match what was agreed for supplier
   *  outreach and only need overriding for a genuinely different policy. */
  SARVAM_CAMPAIGN_NAME: z.string().default('vprocly-supplier-outreach'),
  SARVAM_CAMPAIGN_ATTEMPTS_PER_SECOND: z.coerce.number().positive().default(1),
  SARVAM_CAMPAIGN_MAX_RETRIES: z.coerce.number().int().min(0).max(20).default(2),
  SARVAM_CAMPAIGN_RETRY_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  SARVAM_CAMPAIGN_TIMEZONE: z.string().default('Asia/Kolkata'),
  SARVAM_CAMPAIGN_START_TIME: z.string().default('10:00'),
  SARVAM_CAMPAIGN_END_TIME: z.string().default('18:00'),
  SARVAM_CAMPAIGN_DAYS: z.string().default('Monday,Tuesday,Wednesday,Thursday,Friday,Saturday'),
}).superRefine((env, ctx) => {
  if (env.EMAIL_DELIVERY_MODE === 'live') {
    for (const field of ['SMTP_USER', 'SMTP_PASS', 'NOREPLY_SMTP_USER', 'NOREPLY_SMTP_PASS'] as const) {
      if (!env[field]) ctx.addIssue({ code: 'custom', path: [field], message: `${field} is required when EMAIL_DELIVERY_MODE=live` });
    }
  }
  if (env.VOICE_DELIVERY_MODE === 'live') {
    for (const field of ['SARVAM_API_KEY', 'SARVAM_ORG_ID', 'SARVAM_WORKSPACE_ID', 'SARVAM_APP_ID', 'SARVAM_CONNECTION_ID', 'SARVAM_AGENT_PHONE_NUMBER', 'SARVAM_WEBHOOK_SECRET'] as const) {
      if (!env[field]) ctx.addIssue({ code: 'custom', path: [field], message: `${field} is required when VOICE_DELIVERY_MODE=live` });
    }
  }
});
export type WorkerConfig = z.infer<typeof Env>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): WorkerConfig => Env.parse(env);
