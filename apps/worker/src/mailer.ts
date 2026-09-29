import nodemailer, { type Transporter } from 'nodemailer';
import type { WorkerConfig } from './config.js';

export type Mailers = {
  /** Sends the invite emails suppliers actually see -- see sourcing-invite-mailer.ts. Routed to Mailpit in
   *  capture mode, the real provider in live mode. */
  rfq: Transporter;
  rfqFrom: string;
  /** Sends system notifications back to the buyer (never to a supplier) -- see sourcing-request-summary-mailer.ts. */
  noreply: Transporter;
  noreplyFrom: string;
  /** Always the real provider transport when SMTP_USER/SMTP_PASS are configured, regardless of
   *  EMAIL_DELIVERY_MODE -- used only by the explicit manual "send now" action
   *  (sourcing-manual-mailer.ts), never by the automatic pipeline. Undefined when no real provider
   *  credentials exist yet (e.g. a bare dev/CI box that has never set them). */
  liveRfq?: Transporter;
  liveRfqFrom: string;
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
  const liveRfq = config.SMTP_USER && config.SMTP_PASS ? transport(config.SMTP_HOST, config.SMTP_PORT, config.SMTP_USER, config.SMTP_PASS) : undefined;

  if (config.EMAIL_DELIVERY_MODE === 'capture') {
    const capture = transport(config.MAILPIT_SMTP_HOST, config.MAILPIT_SMTP_PORT, undefined, undefined);
    return {
      rfq: capture,
      rfqFrom: config.SMTP_FROM,
      noreply: capture,
      noreplyFrom: config.NOREPLY_SMTP_FROM,
      liveRfq,
      liveRfqFrom: config.SMTP_FROM,
    };
  }
  return {
    rfq: liveRfq!, // config.ts's superRefine requires SMTP_USER/PASS when EMAIL_DELIVERY_MODE=live
    rfqFrom: config.SMTP_FROM,
    noreply: transport(config.NOREPLY_SMTP_HOST, config.NOREPLY_SMTP_PORT, config.NOREPLY_SMTP_USER, config.NOREPLY_SMTP_PASS),
    noreplyFrom: config.NOREPLY_SMTP_FROM,
    liveRfq,
    liveRfqFrom: config.SMTP_FROM,
  };
}
