import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { supplierSignupOtps } from '@vprocly/db';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { PlatformDb } from '../../platform/platform-db.service.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_TTL_MS = 20 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const HOURLY_LIMIT = 5;
const MAX_ATTEMPTS = 5;

export const SupplierOtpRequestInput = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()) });
export const SupplierOtpVerifyInput = SupplierOtpRequestInput.extend({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code') });

function hashCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(code, salt, 32).toString('hex')}`;
}

function codeMatches(code: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(code, salt, 32);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SupplierEmailOtpService {
  private readonly mailer: Transporter;

  constructor(
    private readonly platformDb: PlatformDb,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    const user = config.NOREPLY_SMTP_USER?.trim();
    const pass = config.NOREPLY_SMTP_PASS?.trim();
    this.mailer = nodemailer.createTransport({
      host: config.NOREPLY_SMTP_HOST,
      port: config.NOREPLY_SMTP_PORT,
      secure: config.NOREPLY_SMTP_PORT === 465,
      requireTLS: Boolean(user && pass),
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async request(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const now = new Date();
    const cooldownStart = new Date(now.getTime() - RESEND_COOLDOWN_MS);
    const hourStart = new Date(now.getTime() - 60 * 60 * 1000);

    const recent = await this.platformDb.run((tx) => tx
      .select({ id: supplierSignupOtps.id })
      .from(supplierSignupOtps)
      .where(and(eq(supplierSignupOtps.email, email), gt(supplierSignupOtps.createdAt, cooldownStart)))
      .limit(1));
    if (recent.length) throw new HttpException('Please wait one minute before requesting another code', HttpStatus.TOO_MANY_REQUESTS);

    const [hourly] = await this.platformDb.run((tx) => tx
      .select({ count: sql<number>`count(*)::int` })
      .from(supplierSignupOtps)
      .where(and(eq(supplierSignupOtps.email, email), gt(supplierSignupOtps.createdAt, hourStart))));
    if (Number(hourly?.count ?? 0) >= HOURLY_LIMIT) throw new HttpException('Too many verification codes requested; try again later', HttpStatus.TOO_MANY_REQUESTS);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const [challenge] = await this.platformDb.run((tx) => tx.insert(supplierSignupOtps).values({
      email,
      codeHash: hashCode(code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    }).returning({ id: supplierSignupOtps.id }));

    try {
      await this.mailer.sendMail({
        from: this.config.NOREPLY_SMTP_FROM,
        to: email,
        subject: `${code} is your vProcly verification code`,
        text: `Your vProcly verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;color:#172033"><h2 style="margin:0 0 16px">Verify your email</h2><p>Enter this code to finish creating your vProcly supplier account:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p><p style="color:#667085">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`,
      });
    } catch (error) {
      if (challenge) await this.platformDb.run((tx) => tx.delete(supplierSignupOtps).where(eq(supplierSignupOtps.id, challenge.id)));
      throw error;
    }
    return { sent: true, expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  async verify(emailInput: string, code: string) {
    const email = emailInput.trim().toLowerCase();
    const [challenge] = await this.platformDb.run((tx) => tx
      .select()
      .from(supplierSignupOtps)
      .where(and(
        eq(supplierSignupOtps.email, email),
        eq(supplierSignupOtps.purpose, 'supplier_signup'),
        isNull(supplierSignupOtps.consumedAt),
      ))
      .orderBy(desc(supplierSignupOtps.createdAt))
      .limit(1));

    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) throw new BadRequestException('The verification code is invalid or has expired');
    if (challenge.attempts >= MAX_ATTEMPTS) throw new BadRequestException('Too many incorrect attempts; request a new code');
    if (!codeMatches(code, challenge.codeHash)) {
      await this.platformDb.run((tx) => tx.update(supplierSignupOtps)
        .set({ attempts: sql`${supplierSignupOtps.attempts} + 1` })
        .where(eq(supplierSignupOtps.id, challenge.id)));
      throw new BadRequestException('The verification code is incorrect');
    }

    const verificationToken = randomBytes(32).toString('base64url');
    await this.platformDb.run((tx) => tx.update(supplierSignupOtps).set({
      verifiedAt: new Date(),
      verificationTokenHash: hashToken(verificationToken),
      verificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    }).where(eq(supplierSignupOtps.id, challenge.id)));
    return { verificationToken, expiresInSeconds: VERIFICATION_TTL_MS / 1000 };
  }

  async assertVerified(emailInput: string, verificationToken: string): Promise<string> {
    const email = emailInput.trim().toLowerCase();
    const [challenge] = await this.platformDb.run((tx) => tx
      .select({ id: supplierSignupOtps.id, verificationExpiresAt: supplierSignupOtps.verificationExpiresAt })
      .from(supplierSignupOtps)
      .where(and(
        eq(supplierSignupOtps.email, email),
        eq(supplierSignupOtps.verificationTokenHash, hashToken(verificationToken)),
        isNull(supplierSignupOtps.consumedAt),
      ))
      .limit(1));
    if (!challenge?.verificationExpiresAt || challenge.verificationExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Verify your email before creating the account');
    }
    return challenge.id;
  }

  async consume(id: string): Promise<void> {
    await this.platformDb.run((tx) => tx.update(supplierSignupOtps).set({ consumedAt: new Date() }).where(eq(supplierSignupOtps.id, id)));
  }
}
