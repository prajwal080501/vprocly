import { ConflictException, Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config.js';

/**
 * Authenticates as a confidential service-account client scoped to realm-management:manage-users within the
 * target realm only (see infra/compose/keycloak/vprocly-realm.json: "vprocly-admin-api") -- deliberately
 * not master-realm admin credentials, which would be able to manage every realm on the server, not just
 * this one. Shared by buyer organization signup and supplier signup: both need to create a Keycloak login,
 * just with different attributes/roles.
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private async adminToken(): Promise<string> {
    const res = await fetch(`${this.config.KEYCLOAK_ADMIN_URL}/realms/${this.config.KEYCLOAK_TARGET_REALM}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.KEYCLOAK_ADMIN_CLIENT_ID,
        client_secret: this.config.KEYCLOAK_ADMIN_CLIENT_SECRET,
      }),
    });
    if (!res.ok) throw new InternalServerErrorException(`Keycloak admin auth failed: ${res.status}`);
    return ((await res.json()) as { access_token: string }).access_token;
  }

  private async adminFetch(path: string, init: RequestInit): Promise<Response> {
    const token = await this.adminToken();
    const res = await fetch(`${this.config.KEYCLOAK_ADMIN_URL}/admin/realms/${this.config.KEYCLOAK_TARGET_REALM}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Keycloak admin ${init.method ?? 'GET'} ${path} -> ${res.status}: ${body}`);
      // A 409 here is the caller's mistake (email already exists), not a server failure -- distinct status
      // so callers can tell "you did something wrong" from "we broke."
      if (res.status === 409) throw new ConflictException('An account with this email already exists');
      throw new InternalServerErrorException('Could not create the account');
    }
    return res;
  }

  /**
   * Checked before creating a tenant/supplier row, not just relied on as a side effect of the 409 above --
   * without this, a duplicate-email signup attempt would leave an orphaned tenant/supplier row with no
   * working login, since that row is committed before this call. See organizations.service.ts and
   * marketplace-suppliers.service.ts.
   */
  async emailTaken(email: string): Promise<boolean> {
    const res = await this.adminFetch(`/users?email=${encodeURIComponent(email)}&exact=true`, { method: 'GET' });
    const users = (await res.json()) as unknown[];
    return users.length > 0;
  }

  /**
   * Creates a Keycloak login with the given attributes (e.g. `{ tenant_id: [...] }` for a buyer,
   * `{ platform_supplier_id: [...] }` for a supplier) and realm roles. Returns the new user's subject id.
   */
  async createUser(input: { email: string; name: string; password: string; attributes: Record<string, string[]>; roles: string[] }): Promise<string> {
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    const createRes = await this.adminFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: input.email,
        email: input.email,
        emailVerified: true,
        enabled: true,
        firstName,
        lastName: rest.join(' ') || undefined,
        attributes: input.attributes,
        credentials: [{ type: 'password', value: input.password, temporary: false }],
      }),
    });
    const location = createRes.headers.get('location');
    const subject = location?.split('/').pop();
    if (!subject) throw new InternalServerErrorException('Keycloak did not return the new user id');

    if (input.roles.length > 0) {
      const roles = await Promise.all(
        input.roles.map((name) => this.adminFetch(`/roles/${name}`, { method: 'GET' }).then((r) => r.json())),
      );
      await this.adminFetch(`/users/${subject}/role-mappings/realm`, { method: 'POST', body: JSON.stringify(roles) });
    }
    return subject;
  }
}
