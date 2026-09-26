import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { categories, consumeSourcingLineInvite, platformSuppliers, resolveSourcingLineInvite, supplierCategories } from '@vprocly/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { PlatformDb } from '../../platform/platform-db.service.js';
import { hashInviteToken } from '@vprocly/contracts';
import { KeycloakAdminService } from './keycloak-admin.service.js';
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

    const [category] = await this.platformDb.run((tx) => tx.select().from(categories).where(eq(categories.id, input.categoryId)));
    if (!category) throw new BadRequestException('Unknown category');

    // The database write commits first (with keycloakSubject left as a placeholder), and only then do we call
    // out to Keycloak. Doing it the other way round -- Keycloak call inside the transaction -- risks an
    // orphaned Keycloak login if the transaction later rolls back (a bug already hit and fixed once in this
    // codebase for document uploads; see documents.service.ts). This way, the worst case if Keycloak is down
    // is a supplier row stuck at a placeholder keycloakSubject, which is visible and repairable, not a silent
    // orphan in an external system. There is no automatic retry/reconciliation for that state yet -- Phase B.
    // The placeholder must be unique (the column has a unique constraint) -- a literal like 'pending' would
    // collide on the second concurrent signup.
    const pendingKeycloakSubject = `pending-${randomUUID()}`;
    const supplierId = await this.platformDb.run(async (tx) => {
      const [supplier] = await tx
        .insert(platformSuppliers)
        .values({
          name: input.name,
          gst: input.gst,
          email: invite.email,
          city: input.city,
          state: input.state,
          keycloakSubject: pendingKeycloakSubject,
        })
        .returning();
      await tx.insert(supplierCategories).values({ platformSupplierId: supplier!.id, categoryId: input.categoryId });
      await this.wallet.grant(tx, supplier!.id, SIGNUP_GRANT_POINTS, 'signup', supplier!.id);

      const consumed = await consumeSourcingLineInvite(tx, hashInviteToken(token), supplier!.id);
      if (!consumed) throw new ConflictException('This invite has already been used');

      return supplier!.id;
    });

    try {
      const keycloakSubject = await this.keycloakAdmin.createSupplierUser({
        email: invite.email,
        name: input.name,
        password: input.password,
        platformSupplierId: supplierId,
      });
      await this.platformDb.run((tx) => tx.update(platformSuppliers).set({ keycloakSubject }).where(eq(platformSuppliers.id, supplierId)));
    } catch (err) {
      this.logger.error(`Supplier ${supplierId} was created but its Keycloak login was not; keycloakSubject stays 'pending'`, err as Error);
      throw err;
    }

    return { platformSupplierId: supplierId, walletBalance: SIGNUP_GRANT_POINTS };
  }
}
