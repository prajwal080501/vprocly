import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { categories, consumeSourcingLineInvite, platformSuppliers, resolveSourcingLineInvite, supplierCategories, supplierMembers } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { PlatformDb } from '../../platform/platform-db.service.js';
import { hashInviteToken } from '@vprocly/contracts';
import { KeycloakAdminService } from '../identity-tenancy/index.js';
import { SIGNUP_GRANT_POINTS, WalletService } from './wallet.service.js';

export const SignupInput = z.object({
  name: z.string().trim().min(1).max(255),
  gst: z.string().trim().min(1).max(32),
  categoryId: z.uuid(),
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
  ) {}

  listCategories() {
    return this.platformDb.run((tx) => tx.select().from(categories).orderBy(categories.name));
  }

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
    const [existing] = await this.platformDb.run((tx) =>
      tx.select({ id: platformSuppliers.id }).from(platformSuppliers).where(eq(platformSuppliers.email, invite.email)),
    );
    return existing ? { status: 'already_registered', email: invite.email, line } : { status: 'pending_signup', email: invite.email, line };
  }

  async signup(token: string, input: SignupInput) {
    const invite = await this.loadInvite(token);
    if (invite.consumed) throw new ConflictException('This invite has already been used');

    const [alreadyRegistered] = await this.platformDb.run((tx) =>
      tx.select({ id: platformSuppliers.id }).from(platformSuppliers).where(eq(platformSuppliers.email, invite.email)),
    );
    if (alreadyRegistered) throw new ConflictException('This email is already registered; log in instead (coming soon)');
    // Also covers an email already used for a different kind of account (e.g. a buyer) -- Keycloak usernames
    // are unique across the whole realm, not just within suppliers.
    if (await this.keycloakAdmin.emailTaken(invite.email)) throw new ConflictException('An account with this email already exists');

    const [category] = await this.platformDb.run((tx) => tx.select().from(categories).where(eq(categories.id, input.categoryId)));
    if (!category) throw new BadRequestException('Unknown category');

    // The company profile (platformSuppliers) commits first, and only then do we call out to Keycloak.
    // Doing it the other way round -- Keycloak call inside the transaction -- risks an orphaned Keycloak
    // login if the transaction later rolls back (a bug already hit and fixed once in this codebase for
    // document uploads; see documents.service.ts). This way, the worst case if Keycloak is down is a
    // company profile with zero members (visible, repairable: retry creates the member), never a login
    // that exists in Keycloak but is unlinked from any company. No supplierMembers row is written -- and so
    // no one can log in as this supplier -- until Keycloak actually confirms the account.
    const supplierId = await this.platformDb.run(async (tx) => {
      const [supplier] = await tx
        .insert(platformSuppliers)
        .values({ name: input.name, gst: input.gst, email: invite.email, city: input.city, state: input.state })
        .returning();
      await tx.insert(supplierCategories).values({ platformSupplierId: supplier!.id, categoryId: input.categoryId });
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
}
