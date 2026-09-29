import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';

// Integration tests run against the dev stack (pnpm stack:up) with the dev realm users.
process.env.DATABASE_URL ??= 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly';
process.env.OIDC_ISSUER ??= 'http://localhost:58080/realms/vprocly';
process.env.S3_ENDPOINT ??= 'http://localhost:58333';
process.env.S3_EXCEL_ENDPOINT ??= 'http://host.docker.internal:58333';
process.env.S3_ACCESS_KEY ??= 'vprocly';
process.env.S3_SECRET_KEY ??= 'vprocly-secret';
process.env.EXCEL_SERVICE_URL ??= 'http://localhost:58001';
process.env.KEYCLOAK_ADMIN_URL ??= 'http://localhost:58080';
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'vprocly-admin-api-secret';
process.env.SARVAM_WEBHOOK_SECRET ??= 'test-sarvam-webhook-secret-123456';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  return app;
}

export async function tokenFor(username: 'alice' | 'bob' | 'carol'): Promise<string> {
  return tokenForCredentials(username, 'password');
}

export async function tokenForCredentials(username: string, password: string): Promise<string> {
  const res = await fetch(`${process.env.OIDC_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'vprocly-web',
      client_secret: 'vprocly-web-secret',
      username,
      password,
      scope: 'openid',
    }),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export function decodeJwtClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]!;
  const json = Buffer.from(payload.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8');
  return JSON.parse(json);
}
