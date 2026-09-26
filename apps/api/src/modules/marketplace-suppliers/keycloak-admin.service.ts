import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config.js';

/**
 * Authenticates as a confidential service-account client scoped to realm-management:manage-users within the
 * target realm only (see infra/compose/keycloak/vprocly-realm.json: "vprocly-admin-api") -- deliberately
 * not master-realm admin credentials, which would be able to manage every realm on the server, not just
 * this one.
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
      throw new InternalServerErrorException('Could not create the supplier account');
    }
    return res;
  }

  /** Creates a supplier login: no tenant_id, platform_supplier_id set, `supplier` realm role, given password. */
  async createSupplierUser(input: { email: string; name: string; password: string; platformSupplierId: string }): Promise<string> {
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
        attributes: { platform_supplier_id: [input.platformSupplierId] },
        credentials: [{ type: 'password', value: input.password, temporary: false }],
      }),
    });
    const location = createRes.headers.get('location');
    const subject = location?.split('/').pop();
    if (!subject) throw new InternalServerErrorException('Keycloak did not return the new user id');

    const rolesRes = await this.adminFetch('/roles/supplier', { method: 'GET' });
    const supplierRole = await rolesRes.json();
    await this.adminFetch(`/users/${subject}/role-mappings/realm`, {
      method: 'POST',
      body: JSON.stringify([supplierRole]),
    });
    return subject;
  }
}
