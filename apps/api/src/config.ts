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
  EXCEL_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  /**
   * The API creates supplier Keycloak users via a confidential service-account client scoped to
   * realm-management:manage-users within KEYCLOAK_TARGET_REALM only -- see keycloak-admin.service.ts.
   */
  KEYCLOAK_ADMIN_URL: z.string().url(),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().default('vprocly-admin-api'),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string(),
  KEYCLOAK_TARGET_REALM: z.string().default('vprocly'),
});
export type AppConfig = z.infer<typeof Env>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return Env.parse(env);
}
