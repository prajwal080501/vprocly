import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';

// Integration tests run against the dev stack (pnpm stack:up) with the dev realm users.
process.env.DATABASE_URL ??= 'postgres://vprocly_app:vprocly_app@localhost:55432/vprocly';
process.env.OIDC_ISSUER ??= 'http://localhost:58080/realms/vprocly';
process.env.S3_ENDPOINT ??= 'http://localhost:58333';
process.env.S3_ACCESS_KEY ??= 'vprocly';
process.env.S3_SECRET_KEY ??= 'vprocly-secret';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  return app;
}

export async function tokenFor(username: 'alice' | 'bob' | 'carol'): Promise<string> {
  const res = await fetch(`${process.env.OIDC_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'vprocly-web',
      client_secret: 'vprocly-web-secret',
      username,
      password: 'password',
      scope: 'openid',
    }),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}
