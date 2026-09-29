import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const required = {
  DATABASE_URL: 'postgres://user:pass@localhost:55432/vprocly',
  S3_ACCESS_KEY: 'test',
  S3_SECRET_KEY: 'test',
};

describe('worker email delivery configuration', () => {
  it('defaults to safe Mailpit capture even when real SMTP values are present', () => {
    const config = loadConfig({
      ...required,
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'rfq@example.com',
      SMTP_PASS: 'secret',
    });
    expect(config.EMAIL_DELIVERY_MODE).toBe('capture');
    expect(config.MAILPIT_SMTP_HOST).toBe('localhost');
  });

  it('requires both authenticated sender identities for live delivery', () => {
    expect(() => loadConfig({ ...required, EMAIL_DELIVERY_MODE: 'live' })).toThrow(/SMTP_USER/);
    expect(
      loadConfig({
        ...required,
        EMAIL_DELIVERY_MODE: 'live',
        SMTP_USER: 'rfq@example.com',
        SMTP_PASS: 'secret',
        NOREPLY_SMTP_USER: 'noreply@example.com',
        NOREPLY_SMTP_PASS: 'secret',
      }).EMAIL_DELIVERY_MODE,
    ).toBe('live');
  });

  it('defaults voice delivery to capture and requires every Sarvam identifier in live mode', () => {
    expect(loadConfig(required).VOICE_DELIVERY_MODE).toBe('capture');
    expect(() => loadConfig({ ...required, VOICE_DELIVERY_MODE: 'live' })).toThrow(/SARVAM_API_KEY/);
    expect(loadConfig({
      ...required,
      VOICE_DELIVERY_MODE: 'live',
      SARVAM_API_KEY: 'test-key',
      SARVAM_ORG_ID: 'org',
      SARVAM_WORKSPACE_ID: 'workspace',
      SARVAM_APP_ID: 'app',
      SARVAM_CONNECTION_ID: 'connection',
      SARVAM_AGENT_PHONE_NUMBER: '+918000000000',
      SARVAM_WEBHOOK_SECRET: 'test-webhook-secret-123456789',
    }).VOICE_DELIVERY_MODE).toBe('live');
  });
});
