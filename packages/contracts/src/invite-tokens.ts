import { createHash, randomBytes } from 'node:crypto';

/**
 * Shared by the API (issues invite links, resolves/consumes them) and the worker (generates the token at
 * send time -- see apps/worker/src/consumers/sourcing-invite-mailer.ts). Only the hash is ever persisted;
 * the raw token exists only in memory and in the email actually sent.
 */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const INVITE_TOKEN_TTL_DAYS = 14;
