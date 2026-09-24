import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  OIDC_ISSUER: z.string().url(),
  OIDC_AUDIENCE: z.string().default('vprocly-api'),
  /** Where to fetch signing keys when the issuer URL is not reachable from here (e.g. inside a cluster). */
  OIDC_JWKS_URI: z.string().url().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET_DOCUMENTS: z.string().default('vprocly-documents'),
  S3_BUCKET_QUARANTINE: z.string().default('vprocly-quarantine'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});
export type AppConfig = z.infer<typeof Env>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return Env.parse(env);
}
