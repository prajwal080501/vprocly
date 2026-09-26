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
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(51025),
  MAIL_FROM: z.string().default('vProcly Marketplace <marketplace@vprocly.example>'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  INVITE_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
});
export type WorkerConfig = z.infer<typeof Env>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): WorkerConfig => Env.parse(env);
