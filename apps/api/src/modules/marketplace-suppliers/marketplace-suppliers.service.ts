import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  consumeSourcingLineInvite,
  listOpenLinesForSupplier,
  listSupplierBidActivity,
  platformSuppliers,
  resolveSourcingLineInvite,
  submitSupplierBid,
  supplierCategories,
  supplierMembers,
} from '@vprocly/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { PlatformDb } from '../../platform/platform-db.service.js';
import { hashInviteToken } from '@vprocly/contracts';
import { CategoryResolverService } from '../categories/index.js';
import type { SupplierRequestContext } from '../identity-tenancy/index.js';
import { KeycloakAdminService } from '../identity-tenancy/index.js';
import { BID_FEE_POINTS, SIGNUP_GRANT_POINTS, WalletService } from './wallet.service.js';

export const SignupInput = z.object({
  name: z.string().trim().min(1).max(255),
  gst: z.string().trim().min(1).max(32),
  categories: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
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
  gst: z.string().trim().min(1).max(32),
  email: z.email(),
  categories: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
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
  ) {}

  private async loadInvite(token: string) {
    const invite = await this.platformDb.run((tx) => resolveSourcingLineInvite(tx, hashInviteToken(token)));
    if (!invite) throw new NotFoundException('Invite link is invalid or has expired');
    return invite;
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
            .set({ name: input.name, gst: input.gst, city: input.city, state: input.state, status: 'active' })
            .where(eq(platformSuppliers.id, existing.id))
            .returning()
        : await tx
            .insert(platformSuppliers)
            .values({ name: input.name, gst: input.gst, email: invite.email, city: input.city, state: input.state })
            .returning();
      for (const categoryId of categoryIds) {
        await tx.insert(supplierCategories).values({ platformSupplierId: supplier!.id, categoryId }).onConflictDoNothing();
      }
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

    const categoryIds = await Promise.all(input.categories.map((c) => this.categoryResolver.resolve(c)));

    const supplierId = await this.platformDb.run(async (tx) => {
      const [supplier] = existing
        ? await tx
            .update(platformSuppliers)
            .set({ name: input.name, gst: input.gst, city: input.city, state: input.state, country: input.country, status: 'active' })
            .where(eq(platformSuppliers.id, existing.id))
            .returning()
        : await tx
            .insert(platformSuppliers)
            .values({ name: input.name, gst: input.gst, email: input.email, city: input.city, state: input.state, country: input.country })
            .returning();
      for (const categoryId of categoryIds) {
        await tx.insert(supplierCategories).values({ platformSupplierId: supplier!.id, categoryId }).onConflictDoNothing();
      }
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
    return {
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      city: supplier.city,
      state: supplier.state,
      country: supplier.country,
      walletBalance: balance,
    };
  }

  /** Lets a supplier add/update their own mobile number -- see the "Mobile number" field in the supplier
   *  dashboard's profile popover. Needed for the buyer-side "Call" button on a supplier row to have
   *  anything to dial; not otherwise validated as a real phone number here (kept loose, matching this
   *  codebase's existing convention for free-text contact fields). */
  async updateMe(ctx: SupplierRequestContext, input: UpdateSupplierProfile) {
    await this.platformDb.run((tx) => tx.update(platformSuppliers).set({ phone: input.phone ?? null }).where(eq(platformSuppliers.id, ctx.platformSupplierId)));
    return this.me(ctx);
  }

  /** Open lines this supplier was matched/notified for -- blind (no buyer/tenant field), see
   *  list_open_lines_for_supplier, migration 0012. */
  async openLines(ctx: SupplierRequestContext) {
    const rows = await this.platformDb.run((tx) => listOpenLinesForSupplier(tx, ctx.platformSupplierId));
    return rows.map((r) => ({
      sourcingLineId: r.sourcing_line_id,
      itemCode: r.item_code,
      description: r.description,
      qty: r.qty,
      uom: r.uom,
      needBy: r.need_by,
      alreadyBid: r.already_bid,
      myUnitPrice: r.my_unit_price,
      myMinimumOrderQty: r.my_minimum_order_qty,
    }));
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
