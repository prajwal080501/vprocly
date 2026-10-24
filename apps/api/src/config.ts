import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  OIDC_ISSUER: z.string().url(),
  OIDC_AUDIENCE: z.string().default('vprocly-api'),
  /** Where to fetch signing keys when the issuer URL is not reachable from here (e.g. inside a cluster). */
  OIDC_JWKS_URI: z.string().url().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  /** Overrides the endpoint used only for URLs handed to the Excel service to fetch -- see object-storage.service.ts. */
  S3_EXCEL_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET_DOCUMENTS: z.string().default('vprocly-documents'),
  S3_BUCKET_QUARANTINE: z.string().default('vprocly-quarantine'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  /** Used to build invite links in emails; the browser-facing URL of the web app. */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  EXCEL_SERVICE_URL: z.string().url().default('http://localhost:58001'),
  /**
   * The API creates supplier Keycloak users via a confidential service-account client scoped to
   * realm-management:manage-users within KEYCLOAK_TARGET_REALM only -- see keycloak-admin.service.ts.
   */
  KEYCLOAK_ADMIN_URL: z.string().url(),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().default('vprocly-admin-api'),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string(),
  KEYCLOAK_TARGET_REALM: z.string().default('vprocly'),
  /** Noreply SMTP identity used for supplier signup verification codes. Defaults target local Mailpit. */
  NOREPLY_SMTP_HOST: z.string().default('localhost'),
  NOREPLY_SMTP_PORT: z.coerce.number().int().positive().default(51025),
  NOREPLY_SMTP_USER: z.string().optional(),
  NOREPLY_SMTP_PASS: z.string().optional(),
  NOREPLY_SMTP_FROM: z.string().default('vProcly <noreply@vprocly.example>'),
  /**
   * Domain-agnostic category matching (CategoryResolverService): embeds free-text category names so a
   * near-duplicate ("Steel Products" vs "Steel & Metal Products") reuses an existing category instead of
   * sprawling. Optional -- unset means every category resolution falls back to plain exact-name
   * matching/creation, degraded but never broken (a BOM commit or supplier signup must never hard-fail
   * because an AI provider is down).
   */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  /** Server-restricted Google Maps key used for supplier checkout reverse geocoding. */
  GOOGLE_MAPS_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  /** Shared with the worker and embedded in Sarvam's callback URL because Instant Outbound webhooks do
   * not expose a custom signature/header setting. Leave unset when voice delivery is not live. */
  SARVAM_WEBHOOK_SECRET: z.string().min(24).optional(),
  /** Razorpay keys are optional so local development can run without payments. Refill endpoints return
   * a clear unavailable response until all three are configured. */
  RAZORPAY_KEY_ID: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  RAZORPAY_KEY_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  RAZORPAY_WEBHOOK_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(16).optional()),
  /** Immutable release identifier injected by deployment. */
  RELEASE_VERSION: z.string().default('development'),
  /** Optional generic incident destination (Slack workflow, Teams workflow, PagerDuty proxy, etc.). */
  OPS_ALERT_WEBHOOK_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
});
export type AppConfig = z.infer<typeof Env>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return Env.parse(env);
}
