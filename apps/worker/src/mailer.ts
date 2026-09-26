import nodemailer, { type Transporter } from 'nodemailer';
import type { WorkerConfig } from './config.js';

export type Mailers = {
  /** Sends the invite emails suppliers actually see -- see sourcing-invite-mailer.ts. */
  rfq: Transporter;
  rfqFrom: string;
  /** Sends system notifications back to the buyer (never to a supplier) -- see sourcing-request-summary-mailer.ts. */
  noreply: Transporter;
  noreplyFrom: string;
};

function transport(host: string, port: number, user: string | undefined, pass: string | undefined): Transporter {
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    // Only enforced for a real provider (has auth); Mailpit in dev/CI has no TLS at all.
    requireTLS: Boolean(user && pass),
    auth: user && pass ? { user, pass } : undefined,
  });
}

export function createMailers(config: WorkerConfig): Mailers {
  return {
    rfq: transport(config.SMTP_HOST, config.SMTP_PORT, config.SMTP_USER, config.SMTP_PASS),
    rfqFrom: config.SMTP_FROM,
    noreply: transport(config.NOREPLY_SMTP_HOST, config.NOREPLY_SMTP_PORT, config.NOREPLY_SMTP_USER, config.NOREPLY_SMTP_PASS),
    noreplyFrom: config.NOREPLY_SMTP_FROM,
  };
}
