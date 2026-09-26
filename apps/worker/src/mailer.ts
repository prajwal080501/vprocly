import nodemailer, { type Transporter } from 'nodemailer';
import type { WorkerConfig } from './config.js';

export function createMailer(config: WorkerConfig): Transporter {
  return nodemailer.createTransport({ host: config.SMTP_HOST, port: config.SMTP_PORT, secure: false });
}
