import { randomBytes, randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { appendAudit, createTenant, withTenant, type Database } from '@vprocly/db';
import { z } from 'zod';
import { DATABASE } from '../../platform/database.module.js';
import { KeycloakAdminService } from '../identity-tenancy/index.js';

export const OrganizationSignup = z.object({
  companyName: z.string().trim().min(1).max(255),
  adminName: z.string().trim().min(1).max(255),
  email: z.email(),
  password: z.string().min(8).max(200),
});
export type OrganizationSignup = z.infer<typeof OrganizationSignup>;

const MAX_SLUG_ATTEMPTS = 5;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'company';
}

/** Lets a new buyer company create its own account instead of needing to be manually seeded. */
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  async signup(input: OrganizationSignup): Promise<{ tenantId: string; slug: string }> {
    if (await this.keycloakAdmin.emailTaken(input.email)) {
      throw new ConflictException('An account with this email already exists');
    }

    const base = slugify(input.companyName);
    let slug = base;
    let tenantId = randomUUID();
    let created = false;

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && !created; attempt++) {
      slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
      tenantId = randomUUID();
      // create_tenant races against the slug's unique constraint atomically (no separate check-then-insert);
      // see migration 0007. A false result means this slug lost the race, not that anything is broken.
      created = await withTenant(this.db, { tenantId }, async (tx) => {
        const ok = await createTenant(tx, { id: tenantId, slug, name: input.companyName });
        if (ok) {
          await appendAudit(tx, {
            actorType: 'system',
            action: 'organization.created',
            entityType: 'tenant',
            entityId: tenantId,
            data: { companyName: input.companyName, adminEmail: input.email },
          });
        }
        return ok;
      });
    }
    if (!created) throw new ConflictException('Could not allocate a company identifier; please try again');

    // The tenant commits first, then Keycloak: if Keycloak fails, the worst case is a tenant with no users
    // yet (visible and repairable), not an orphaned login pointing at a tenant that doesn't exist -- same
    // ordering already used for supplier signup, see marketplace-suppliers.service.ts.
    try {
      await this.keycloakAdmin.createUser({
        email: input.email,
        name: input.adminName,
        password: input.password,
        attributes: { tenant_id: [tenantId] },
        roles: ['tenant_admin', 'buyer'],
      });
    } catch (err) {
      this.logger.error(`Organization ${tenantId} (${slug}) was created but its admin login was not`, err as Error);
      throw err;
    }

    return { tenantId, slug };
  }
}
