import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  consumeSourcingLineInvite,
  listOpenLinesForSupplier,
  listSupplierItemClarifications,
  listSupplierLineResponses,
  listSupplierBidActivity,
  platformSuppliers,
  confirmVoiceBid,
  resolveVoiceBidConfirmation,
  resolveSourcingLineInvite,
  submitSupplierBid,
  postSupplierItemClarification,
  setSupplierLineResponse,
  supplierCategories,
  supplierCapabilities,
  supplierCertifications,
  supplierContacts,
  supplierIdentifiers,
  supplierLocations,
  supplierMembers,
  supplierNetworkPreferences,
  categories,
  type Tx,
} from '@vprocly/db';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PlatformDb } from '../../platform/platform-db.service.js';
import { hashInviteToken } from '@vprocly/contracts';
import { CategoryResolverService } from '../categories/index.js';
import type { SupplierRequestContext } from '../identity-tenancy/index.js';
import { KeycloakAdminService } from '../identity-tenancy/index.js';
import { BID_FEE_POINTS, SIGNUP_GRANT_POINTS, WalletService } from './wallet.service.js';
import { SupplierEmailOtpService } from './supplier-email-otp.service.js';

export const SignupInput = z.object({
  name: z.string().trim().min(1).max(255),
  gst: z.string().trim().max(32).optional().transform((value) => value || null),
  phone: z.string().trim().max(32).refine((value) => !value || value.length >= 8).optional().transform((value) => value || null),
  categories: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
  verificationToken: z.string().min(32).max(200),
});
export type SignupInput = z.infer<typeof SignupInput>;

export type InviteLineSummary = {
  itemCode: string | null;
  description: string;
  qty: string;
  uom: string;
  categoryId: string;
  deliveryCity: string;
  deliveryState: string;
  needBy: string | null;
};

export type InviteView =
  | { status: 'consumed' }
  | { status: 'already_registered'; email: string; line: InviteLineSummary }
  | { status: 'pending_signup'; email: string; line: InviteLineSummary };

/** Self-serve signup: no invite token, so the email/category/location all come from the form itself. */
export const SupplierSelfSignup = z.object({
  name: z.string().trim().min(1).max(255),
  gst: z.string().trim().max(32).optional().transform((value) => value || null),
  phone: z.string().trim().max(32).refine((value) => !value || value.length >= 8).optional().transform((value) => value || null),
  email: z.email(),
  categories: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
  verificationToken: z.string().min(32).max(200),
});
export type SupplierSelfSignup = z.infer<typeof SupplierSelfSignup>;

export const UpdateSupplierProfile = z.object({
  phone: z.string().trim().min(1).max(32).nullable().optional(),
});
export type UpdateSupplierProfile = z.infer<typeof UpdateSupplierProfile>;

export const PlaceBidInput = z.object({
  unitPrice: z.number().positive().max(1_000_000_000),
  minimumOrderQty: z.number().positive().max(1_000_000_000).nullable().optional(),
  leadTimeDays: z.number().int().positive().max(3650).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type PlaceBidInput = z.infer<typeof PlaceBidInput>;

export const SupplierClarificationInput = z.object({
  message: z.string().trim().min(1).max(2000),
});
export type SupplierClarificationInput = z.infer<typeof SupplierClarificationInput>;

export const SupplierCapabilityInput = z.object({
  status: z.enum(['can_supply', 'needs_clarification', 'declined']),
  reason: z.string().trim().max(500).nullable().optional(),
});
export type SupplierCapabilityInput = z.infer<typeof SupplierCapabilityInput>;

export const ConfirmVoiceBidInput = z.object({
  unitPrice: z.number().positive().max(1_000_000_000),
  minimumOrderQty: z.number().positive().max(1_000_000_000).nullable().optional(),
  leadTimeDays: z.number().int().positive().max(3650),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  taxPercent: z.number().min(0).max(100).nullable().optional(),
  freightAmount: z.number().min(0).max(1_000_000_000).nullable().optional(),
  quoteValidityDate: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type ConfirmVoiceBidInput = z.infer<typeof ConfirmVoiceBidInput>;

export const SupplierPassportInput = z.object({
  identifiers: z.array(z.object({ type: z.enum(['gstin', 'pan', 'udyam', 'external']), value: z.string().trim().min(1).max(120) })).max(20),
  locations: z.array(z.object({
    type: z.enum(['registered', 'factory', 'warehouse', 'service']),
    label: z.string().trim().max(120).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().max(20).nullable().optional(),
    isPrimary: z.boolean().optional(),
  })).max(50),
  capabilities: z.array(z.object({
    categoryId: z.uuid(),
    description: z.string().trim().max(1000).nullable().optional(),
    materials: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    processes: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    brands: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  })).max(100),
  certifications: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    issuer: z.string().trim().max(160).nullable().optional(),
    certificateNumber: z.string().trim().max(120).nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
    documentUrl: z.url().max(1000).nullable().optional(),
  })).max(50),
  contacts: z.array(z.object({
    name: z.string().trim().max(160).nullable().optional(),
    role: z.string().trim().max(120).nullable().optional(),
    email: z.email().nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    preferredChannel: z.enum(['voice', 'email', 'sms', 'whatsapp']).nullable().optional(),
    isPrimary: z.boolean().optional(),
  })).max(50),
});
export type SupplierPassportInput = z.infer<typeof SupplierPassportInput>;

export const SupplierNetworkPreferencesInput = z.object({
  opportunityAlerts: z.boolean(),
  digestFrequency: z.enum(['instant', 'daily', 'weekly', 'off']),
  minimumRecommendationScore: z.number().int().min(0).max(100),
});
export type SupplierNetworkPreferencesInput = z.infer<typeof SupplierNetworkPreferencesInput>;

/**
 * Public, token-authenticated flows for a supplier who received an invite email: view what they were
 * matched to (never the buyer's identity -- see resolve_sourcing_line_invite, migration 0006) and sign up.
 * See docs/plans/mvp-bidding-marketplace.md.
 */
@Injectable()
export class MarketplaceSuppliersService {
  private readonly logger = new Logger(MarketplaceSuppliersService.name);

  constructor(
    private readonly platformDb: PlatformDb,
    private readonly wallet: WalletService,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly categoryResolver: CategoryResolverService,
    private readonly otp: SupplierEmailOtpService,
  ) {}

  private async seedPassport(tx: Tx, supplier: { id: string; gst: string | null; email: string; phone: string | null; city: string; state: string; country: string | null }) {
    if (supplier.gst) {
      await tx.insert(supplierIdentifiers).values({ platformSupplierId: supplier.id, type: 'gstin', value: supplier.gst }).onConflictDoNothing();
    }
    const [location] = await tx.select({ id: supplierLocations.id }).from(supplierLocations).where(eq(supplierLocations.platformSupplierId, supplier.id)).limit(1);
    if (!location) await tx.insert(supplierLocations).values({ platformSupplierId: supplier.id, type: 'registered', city: supplier.city, state: supplier.state, country: supplier.country ?? 'India', isPrimary: true });
    const [contact] = await tx.select({ id: supplierContacts.id }).from(supplierContacts).where(eq(supplierContacts.platformSupplierId, supplier.id)).limit(1);
    if (!contact) await tx.insert(supplierContacts).values({ platformSupplierId: supplier.id, email: supplier.email, phone: supplier.phone, preferredChannel: supplier.phone ? 'voice' : 'email', isPrimary: true });
  }

  private async loadInvite(token: string) {
    const invite = await this.platformDb.run((tx) => resolveSourcingLineInvite(tx, hashInviteToken(token)));
    if (!invite) throw new NotFoundException('Invite link is invalid or has expired');
    return invite;
  }

  async viewBidConfirmation(token: string) {
    const row = await this.platformDb.run((tx) => resolveVoiceBidConfirmation(tx, hashInviteToken(token)));
    if (!row || !row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) throw new NotFoundException('Confirmation link is invalid or has expired');
    return {
      draftId: row.draft_id,
      status: row.status,
      supplierName: row.supplier_name,
      itemCode: row.item_code,
      description: row.description,
      qty: row.qty,
      uom: row.uom,
      deliveryCity: row.delivery_city,
      deliveryState: row.delivery_state,
      needBy: row.need_by,
      unitPrice: row.unit_price,
      minimumOrderQty: row.minimum_order_qty,
      leadTimeDays: row.lead_time_days,
      currency: row.currency,
      taxPercent: row.tax_percent,
      freightAmount: row.freight_amount,
      quoteValidityDate: row.quote_validity_date,
      notes: row.notes,
      expiresAt: row.expires_at,
    };
  }

  async confirmBidFromVoice(token: string, input: ConfirmVoiceBidInput) {
    try {
      return await this.platformDb.run((tx) => confirmVoiceBid(tx, {
        tokenHash: hashInviteToken(token),
        unitPrice: String(input.unitPrice),
        minimumOrderQty: input.minimumOrderQty == null ? null : String(input.minimumOrderQty),
        leadTimeDays: input.leadTimeDays,
        currency: input.currency,
        taxPercent: input.taxPercent == null ? null : String(input.taxPercent),
        freightAmount: input.freightAmount == null ? null : String(input.freightAmount),
        quoteValidityDate: input.quoteValidityDate ?? null,
        notes: input.notes ?? null,
      }));
    } catch (error) {
      const cause = (error as { cause?: { message?: string } }).cause ?? (error as { message?: string });
      if (cause.message?.includes('confirmation_expired')) throw new NotFoundException('Confirmation link is invalid or has expired');
      if (cause.message?.includes('incomplete_bid')) throw new BadRequestException('Price and lead time are required');
      if (cause.message?.includes('line_not_open')) throw new ConflictException('This sourcing opportunity is no longer open');
      throw error;
    }
  }

  async viewInvite(token: string): Promise<InviteView> {
    const invite = await this.loadInvite(token);
    if (invite.consumed) return { status: 'consumed' };

    const line: InviteLineSummary = {
      itemCode: invite.item_code,
      description: invite.description,
      qty: invite.qty,
      uom: invite.uom,
      categoryId: invite.category_id,
      deliveryCity: invite.delivery_city,
      deliveryState: invite.delivery_state,
      needBy: invite.need_by,
    };
    // An AI-discovered 'prospect' row (see marketplace.ts) is a company vProcly found and invited, not a
    // completed signup -- it should see the same signup form as a never-invited email, not "already
    // registered." Only status='active' (a real, completed signup) counts as a conflict.
    const [existing] = await this.platformDb.run((tx) =>
      tx.select({ id: platformSuppliers.id, status: platformSuppliers.status }).from(platformSuppliers).where(eq(platformSuppliers.email, invite.email)),
    );
    return existing?.status === 'active'
      ? { status: 'already_registered', email: invite.email, line }
      : { status: 'pending_signup', email: invite.email, line };
  }

  async requestInviteOtp(token: string) {
    const invite = await this.loadInvite(token);
    if (invite.consumed) throw new ConflictException('This invite has already been used');
    return this.otp.request(invite.email);
  }

  async verifyInviteOtp(token: string, code: string) {
    const invite = await this.loadInvite(token);
    if (invite.consumed) throw new ConflictException('This invite has already been used');
    return this.otp.verify(invite.email, code);
  }

  requestSelfSignupOtp(email: string) {
    return this.otp.request(email);
  }

  verifySelfSignupOtp(email: string, code: string) {
    return this.otp.verify(email, code);
  }

  async signup(token: string, input: SignupInput) {
    const invite = await this.loadInvite(token);
    if (invite.consumed) throw new ConflictException('This invite has already been used');

    const [existing] = await this.platformDb.run((tx) =>
      tx.select({ id: platformSuppliers.id, status: platformSuppliers.status }).from(platformSuppliers).where(eq(platformSuppliers.email, invite.email)),
    );
    if (existing?.status === 'active') throw new ConflictException('This email is already registered; log in instead (coming soon)');
    // Also covers an email already used for a different kind of account (e.g. a buyer) -- Keycloak usernames
    // are unique across the whole realm, not just within suppliers. A prospect never has a Keycloak account
    // (no supplierMembers row until real signup), so this never false-positives on one.
    if (await this.keycloakAdmin.emailTaken(invite.email)) throw new ConflictException('An account with this email already exists');
    const otpChallengeId = await this.otp.assertVerified(invite.email, input.verificationToken);

    const categoryIds = await Promise.all(input.categories.map((c) => this.categoryResolver.resolve(c)));

    // The company profile (platformSuppliers) commits first, and only then do we call out to Keycloak.
    // Doing it the other way round -- Keycloak call inside the transaction -- risks an orphaned Keycloak
    // login if the transaction later rolls back (a bug already hit and fixed once in this codebase for
    // document uploads; see documents.service.ts). This way, the worst case if Keycloak is down is a
    // company profile with zero members (visible, repairable: retry creates the member), never a login
    // that exists in Keycloak but is unlinked from any company. No supplierMembers row is written -- and so
    // no one can log in as this supplier -- until Keycloak actually confirms the account.
    const supplierId = await this.platformDb.run(async (tx) => {
      // A promoted prospect is updated in place, not re-inserted -- email is unique, so a second insert
      // would fail anyway. discoveryMetadata and any Places-sourced phone/country are left untouched: a
      // permanent record that this supplier started as an AI discovery.
      const [supplier] = existing
        ? await tx
            .update(platformSuppliers)
            .set({ name: input.name, gst: input.gst, phone: input.phone ?? undefined, city: input.city, state: input.state, status: 'active' })
            .where(eq(platformSuppliers.id, existing.id))
            .returning()
        : await tx
            .insert(platformSuppliers)
            .values({ name: input.name, gst: input.gst, email: invite.email, phone: input.phone, city: input.city, state: input.state })
            .returning();
      for (const categoryId of categoryIds) {
        await tx.insert(supplierCategories).values({ platformSupplierId: supplier!.id, categoryId }).onConflictDoNothing();
        await tx.insert(supplierCapabilities).values({ platformSupplierId: supplier!.id, categoryId }).onConflictDoNothing();
      }
      await this.seedPassport(tx, supplier!);
      await this.wallet.grant(tx, supplier!.id, SIGNUP_GRANT_POINTS, 'signup', supplier!.id);

      const consumed = await consumeSourcingLineInvite(tx, hashInviteToken(token), supplier!.id);
      if (!consumed) throw new ConflictException('This invite has already been used');

      return supplier!.id;
    });

    try {
      const keycloakSubject = await this.keycloakAdmin.createUser({
        email: invite.email,
        name: input.name,
        password: input.password,
        attributes: { platform_supplier_id: [supplierId] },
        roles: ['supplier'],
      });
      await this.platformDb.run((tx) =>
        tx.insert(supplierMembers).values({ platformSupplierId: supplierId, email: invite.email, keycloakSubject, role: 'owner' }),
      );
      await this.otp.consume(otpChallengeId);
    } catch (err) {
      this.logger.error(`Supplier ${supplierId} was created but has no member who can log in yet (Keycloak call failed)`, err as Error);
      throw err;
    }

    return { platformSupplierId: supplierId, walletBalance: SIGNUP_GRANT_POINTS };
  }

  /** Self-serve signup: identical account-creation shape to the invite-gated signup() above, just without
   *  an invite to consume -- the supplier provides their own email instead of one prefilled by an invite. */
  async selfSignup(input: SupplierSelfSignup) {
    const [existing] = await this.platformDb.run((tx) =>
      tx.select({ id: platformSuppliers.id, status: platformSuppliers.status }).from(platformSuppliers).where(eq(platformSuppliers.email, input.email)),
    );
    if (existing?.status === 'active') throw new ConflictException('This email is already registered');
    if (await this.keycloakAdmin.emailTaken(input.email)) throw new ConflictException('An account with this email already exists');
    const otpChallengeId = await this.otp.assertVerified(input.email, input.verificationToken);

    const categoryIds = await Promise.all(input.categories.map((c) => this.categoryResolver.resolve(c)));

    const supplierId = await this.platformDb.run(async (tx) => {
      const [supplier] = existing
        ? await tx
            .update(platformSuppliers)
            .set({ name: input.name, gst: input.gst, phone: input.phone ?? undefined, city: input.city, state: input.state, country: input.country, status: 'active' })
            .where(eq(platformSuppliers.id, existing.id))
            .returning()
        : await tx
            .insert(platformSuppliers)
            .values({ name: input.name, gst: input.gst, email: input.email, phone: input.phone, city: input.city, state: input.state, country: input.country })
            .returning();
      for (const categoryId of categoryIds) {
        await tx.insert(supplierCategories).values({ platformSupplierId: supplier!.id, categoryId }).onConflictDoNothing();
        await tx.insert(supplierCapabilities).values({ platformSupplierId: supplier!.id, categoryId }).onConflictDoNothing();
      }
      await this.seedPassport(tx, supplier!);
      await this.wallet.grant(tx, supplier!.id, SIGNUP_GRANT_POINTS, 'signup', supplier!.id);
      return supplier!.id;
    });

    try {
      const keycloakSubject = await this.keycloakAdmin.createUser({
        email: input.email,
        name: input.name,
        password: input.password,
        attributes: { platform_supplier_id: [supplierId] },
        roles: ['supplier'],
      });
      await this.platformDb.run((tx) =>
        tx.insert(supplierMembers).values({ platformSupplierId: supplierId, email: input.email, keycloakSubject, role: 'owner' }),
      );
      await this.otp.consume(otpChallengeId);
    } catch (err) {
      this.logger.error(`Supplier ${supplierId} was created but has no member who can log in yet (Keycloak call failed)`, err as Error);
      throw err;
    }

    return { platformSupplierId: supplierId, walletBalance: SIGNUP_GRANT_POINTS };
  }

  async me(ctx: SupplierRequestContext) {
    const [supplier] = await this.platformDb.run((tx) =>
      tx.select().from(platformSuppliers).where(eq(platformSuppliers.id, ctx.platformSupplierId)),
    );
    if (!supplier) throw new NotFoundException();
    const balance = await this.platformDb.run((tx) => this.wallet.balance(tx, ctx.platformSupplierId));
    const [verifiedIdentifier] = await this.platformDb.run((tx) =>
      tx.select({ id: supplierIdentifiers.id }).from(supplierIdentifiers).where(and(
        eq(supplierIdentifiers.platformSupplierId, ctx.platformSupplierId),
        eq(supplierIdentifiers.verificationStatus, 'verified'),
      )).limit(1),
    );
    return {
      id: supplier.id,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      city: supplier.city,
      state: supplier.state,
      country: supplier.country,
      walletBalance: balance,
      verified: Boolean(verifiedIdentifier),
    };
  }

  async networkInsights(ctx: SupplierRequestContext) {
    return this.platformDb.run(async (tx) => {
      const result = await tx.execute<{ insights: Record<string, unknown> }>(
        sql`SELECT supplier_network_insights(${ctx.platformSupplierId}::uuid) AS insights`,
      );
      const [preferences] = await tx
        .insert(supplierNetworkPreferences)
        .values({ platformSupplierId: ctx.platformSupplierId })
        .onConflictDoUpdate({
          target: supplierNetworkPreferences.platformSupplierId,
          set: { updatedAt: sql`${supplierNetworkPreferences.updatedAt}` },
        })
        .returning();
      return { ...(result.rows[0]?.insights ?? {}), preferences };
    });
  }

  async updateNetworkPreferences(ctx: SupplierRequestContext, input: SupplierNetworkPreferencesInput) {
    await this.platformDb.run((tx) => tx
      .insert(supplierNetworkPreferences)
      .values({ platformSupplierId: ctx.platformSupplierId, ...input })
      .onConflictDoUpdate({
        target: supplierNetworkPreferences.platformSupplierId,
        set: { ...input, updatedAt: new Date() },
      }));
    return this.networkInsights(ctx);
  }

  /** Lets a supplier add/update their own mobile number -- see the "Mobile number" field in the supplier
   *  dashboard's profile popover. Needed for the buyer-side "Call" button on a supplier row to have
   *  anything to dial; not otherwise validated as a real phone number here (kept loose, matching this
   *  codebase's existing convention for free-text contact fields). */
  async updateMe(ctx: SupplierRequestContext, input: UpdateSupplierProfile) {
    await this.platformDb.run(async (tx) => {
      await tx.update(platformSuppliers).set({ phone: input.phone ?? null }).where(eq(platformSuppliers.id, ctx.platformSupplierId));
      await tx.update(supplierContacts).set({ phone: input.phone ?? null, preferredChannel: input.phone ? 'voice' : 'email', updatedAt: new Date() }).where(eq(supplierContacts.platformSupplierId, ctx.platformSupplierId));
    });
    return this.me(ctx);
  }

  async passport(ctx: SupplierRequestContext) {
    return this.platformDb.run(async (tx) => {
      const identifiers = await tx.select().from(supplierIdentifiers).where(eq(supplierIdentifiers.platformSupplierId, ctx.platformSupplierId));
      const locations = await tx.select().from(supplierLocations).where(eq(supplierLocations.platformSupplierId, ctx.platformSupplierId));
      const capabilities = await tx.select({ capability: supplierCapabilities, categoryName: categories.name }).from(supplierCapabilities).innerJoin(categories, eq(categories.id, supplierCapabilities.categoryId)).where(eq(supplierCapabilities.platformSupplierId, ctx.platformSupplierId));
      const certifications = await tx.select().from(supplierCertifications).where(eq(supplierCertifications.platformSupplierId, ctx.platformSupplierId));
      const contacts = await tx.select().from(supplierContacts).where(eq(supplierContacts.platformSupplierId, ctx.platformSupplierId));
      const completed = [identifiers.length > 0, locations.length > 0, capabilities.length > 0, contacts.length > 0, certifications.length > 0].filter(Boolean).length;
      return { identifiers, locations, capabilities: capabilities.map(({ capability, categoryName }) => ({ ...capability, categoryName })), certifications, contacts, completionPercent: completed * 20 };
    });
  }

  async replacePassport(ctx: SupplierRequestContext, input: SupplierPassportInput) {
    await this.platformDb.run(async (tx) => {
      const primaryContact = input.contacts.find((row) => row.isPrimary) ?? input.contacts[0];
      await tx
        .update(platformSuppliers)
        .set({ phone: primaryContact?.phone?.trim() || null })
        .where(eq(platformSuppliers.id, ctx.platformSupplierId));
      await tx.delete(supplierIdentifiers).where(eq(supplierIdentifiers.platformSupplierId, ctx.platformSupplierId));
      await tx.delete(supplierLocations).where(eq(supplierLocations.platformSupplierId, ctx.platformSupplierId));
      await tx.delete(supplierCapabilities).where(eq(supplierCapabilities.platformSupplierId, ctx.platformSupplierId));
      await tx.delete(supplierCategories).where(eq(supplierCategories.platformSupplierId, ctx.platformSupplierId));
      await tx.delete(supplierCertifications).where(eq(supplierCertifications.platformSupplierId, ctx.platformSupplierId));
      await tx.delete(supplierContacts).where(eq(supplierContacts.platformSupplierId, ctx.platformSupplierId));
      if (input.identifiers.length) await tx.insert(supplierIdentifiers).values(input.identifiers.map((row) => ({ ...row, platformSupplierId: ctx.platformSupplierId })));
      if (input.locations.length) await tx.insert(supplierLocations).values(input.locations.map((row) => ({ ...row, label: row.label ?? null, address: row.address ?? null, postalCode: row.postalCode ?? null, isPrimary: row.isPrimary ?? false, platformSupplierId: ctx.platformSupplierId })));
      if (input.capabilities.length) {
        await tx.insert(supplierCapabilities).values(input.capabilities.map((row) => ({ ...row, description: row.description ?? null, materials: row.materials ?? [], processes: row.processes ?? [], brands: row.brands ?? [], platformSupplierId: ctx.platformSupplierId })));
        await tx.insert(supplierCategories).values(input.capabilities.map((row) => ({ categoryId: row.categoryId, platformSupplierId: ctx.platformSupplierId })));
      }
      if (input.certifications.length) await tx.insert(supplierCertifications).values(input.certifications.map((row) => ({ ...row, issuer: row.issuer ?? null, certificateNumber: row.certificateNumber ?? null, expiresAt: row.expiresAt ? new Date(row.expiresAt) : null, documentUrl: row.documentUrl ?? null, platformSupplierId: ctx.platformSupplierId })));
      if (input.contacts.length) await tx.insert(supplierContacts).values(input.contacts.map((row) => ({ ...row, name: row.name ?? null, role: row.role ?? null, email: row.email ?? null, phone: row.phone ?? null, preferredChannel: row.preferredChannel ?? null, isPrimary: row.isPrimary ?? false, platformSupplierId: ctx.platformSupplierId })));
    });
    return this.passport(ctx);
  }

  /** Open lines this supplier was matched/notified for -- blind (no buyer/tenant field), see
   *  list_open_lines_for_supplier, migration 0012. */
  async openLines(ctx: SupplierRequestContext) {
    const { rows, responses, messages } = await this.platformDb.run(async (tx) => {
      const [rows, responses, messages] = await Promise.all([
        listOpenLinesForSupplier(tx, ctx.platformSupplierId),
        listSupplierLineResponses(tx, ctx.platformSupplierId),
        listSupplierItemClarifications(tx, ctx.platformSupplierId),
      ]);
      return { rows, responses, messages };
    });
    const responseByLine = new Map(responses.map((response) => [response.sourcing_line_id, response]));
    const messagesByLine = new Map<string, typeof messages>();
    for (const message of messages) {
      const current = messagesByLine.get(message.sourcing_line_id) ?? [];
      current.push(message);
      messagesByLine.set(message.sourcing_line_id, current);
    }
    return rows.map((r) => {
      const response = responseByLine.get(r.sourcing_line_id);
      return {
        sourcingLineId: r.sourcing_line_id,
        itemCode: r.item_code,
        description: r.description,
        qty: r.qty,
        uom: r.uom,
        needBy: r.need_by,
        alreadyBid: r.already_bid,
        myUnitPrice: r.my_unit_price,
        myMinimumOrderQty: r.my_minimum_order_qty,
        capabilityResponse: response ? { status: response.status, reason: response.reason, respondedAt: response.responded_at } : null,
        clarificationCount: messagesByLine.get(r.sourcing_line_id)?.length ?? 0,
      };
    });
  }

  async clarificationMessages(ctx: SupplierRequestContext, sourcingLineId?: string) {
    const rows = await this.platformDb.run((tx) => listSupplierItemClarifications(tx, ctx.platformSupplierId, sourcingLineId));
    return rows.map((row) => ({
      id: row.id,
      sourcingLineId: row.sourcing_line_id,
      senderType: row.sender_type,
      senderLabel: row.sender_label,
      body: row.body,
      createdAt: row.created_at,
    }));
  }

  async postClarification(ctx: SupplierRequestContext, sourcingLineId: string, input: SupplierClarificationInput) {
    try {
      const id = await this.platformDb.run((tx) => postSupplierItemClarification(tx, ctx.platformSupplierId, sourcingLineId, input.message));
      return { id };
    } catch (error) {
      const cause = (error as { cause?: { message?: string } }).cause ?? (error as { message?: string });
      if (cause.message?.includes('not_matched')) throw new ForbiddenException('You are not matched to this item');
      if (cause.message?.includes('invalid_message')) throw new BadRequestException('Enter a message of up to 2000 characters');
      throw error;
    }
  }

  async setCapability(ctx: SupplierRequestContext, sourcingLineId: string, input: SupplierCapabilityInput) {
    try {
      const id = await this.platformDb.run((tx) => setSupplierLineResponse(
        tx,
        ctx.platformSupplierId,
        sourcingLineId,
        input.status,
        input.reason ?? null,
      ));
      return { id, status: input.status };
    } catch (error) {
      const cause = (error as { cause?: { message?: string } }).cause ?? (error as { message?: string });
      if (cause.message?.includes('not_matched')) throw new ForbiddenException('You are not matched to this item');
      throw error;
    }
  }

  async bidActivity(ctx: SupplierRequestContext) {
    const rows = await this.platformDb.run((tx) => listSupplierBidActivity(tx, ctx.platformSupplierId));
    return rows.map((r) => ({
      bidId: r.bid_id,
      sourcingLineId: r.sourcing_line_id,
      itemCode: r.item_code,
      description: r.description,
      qty: r.qty,
      uom: r.uom,
      deliveryCity: r.delivery_city,
      deliveryState: r.delivery_state,
      needBy: r.need_by,
      unitPrice: r.unit_price,
      minimumOrderQty: r.minimum_order_qty,
      leadTimeDays: r.lead_time_days,
      notes: r.notes,
      status: r.bid_status,
      buyer: r.buyer_name
        ? { name: r.buyer_name, contactName: r.buyer_contact_name, contactEmail: r.buyer_contact_email }
        : null,
    }));
  }

  /** Debits BID_FEE_POINTS once per (line, supplier) -- only on the first bid, never on a later price
   *  revision -- atomically with the bid write: both happen in the same transaction, so an insufficient
   *  balance (the wallet's non-negative check constraint, migration 0005) rolls back the bid too. */
  async placeBid(ctx: SupplierRequestContext, sourcingLineId: string, input: PlaceBidInput) {
    try {
      return await this.platformDb.run(async (tx) => {
        const { id, isNew } = await submitSupplierBid(tx, {
          platformSupplierId: ctx.platformSupplierId,
          sourcingLineId,
          unitPrice: String(input.unitPrice),
          minimumOrderQty: input.minimumOrderQty == null ? null : String(input.minimumOrderQty),
          leadTimeDays: input.leadTimeDays ?? null,
          notes: input.notes ?? null,
        });
        const balance = isNew ? await this.wallet.debit(tx, ctx.platformSupplierId, BID_FEE_POINTS, 'bid', id) : await this.wallet.balance(tx, ctx.platformSupplierId);
        return { bidId: id, walletBalance: balance };
      });
    } catch (err) {
      // node-postgres errors arrive wrapped in a DrizzleQueryError -- the SQLSTATE/message we actually care
      // about is on .cause, not the wrapper itself.
      const cause = (err as { cause?: { code?: string; message?: string } }).cause ?? (err as { code?: string; message?: string });
      if (cause.code === '23514') throw new ConflictException('Insufficient wallet balance to place a bid');
      if (cause.message?.includes('line_not_open')) throw new BadRequestException('This line is no longer open for bidding');
      if (cause.message?.includes('not_matched')) throw new ForbiddenException('You were not matched to this line');
      throw err;
    }
  }
}
