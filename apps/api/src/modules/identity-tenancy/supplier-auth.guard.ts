import { ForbiddenException, Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ROLES, type Role } from '@vprocly/contracts';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { APP_CONFIG, type AppConfig } from '../../config.js';

type SupplierClaims = JWTPayload & {
  platform_supplier_id?: string;
  roles?: string[];
  email?: string;
  name?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The supplier-side counterpart of AuthGuard: verifies the same OIDC bearer token (same realm, same
 * vprocly-web client -- see auth.guard.ts and infra/compose/keycloak/vprocly-realm.json) but requires
 * platform_supplier_id instead of tenant_id. Applied per-route (@UseGuards) on supplier-only endpoints,
 * which are also marked @Public() to skip the global AuthGuard's tenant requirement entirely -- the two
 * guards never both run on the same route.
 */
@Injectable()
export class SupplierAuthGuard implements CanActivate {
  private readonly jwks;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.jwks = createRemoteJWKSet(new URL(config.OIDC_JWKS_URI ?? `${config.OIDC_ISSUER}/protocol/openid-connect/certs`));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.header('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let claims: SupplierClaims;
    try {
      ({ payload: claims } = await jwtVerify<SupplierClaims>(token, this.jwks, {
        issuer: this.config.OIDC_ISSUER,
        audience: this.config.OIDC_AUDIENCE,
      }));
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!claims.sub || !claims.platform_supplier_id || !UUID.test(claims.platform_supplier_id)) {
      throw new ForbiddenException('Token has no supplier');
    }

    const roles = (claims.roles ?? []).filter((r): r is Role => (ROLES as readonly string[]).includes(r));
    if (!roles.includes('supplier')) throw new ForbiddenException('Token is not a supplier login');

    req.supplierCtx = {
      platformSupplierId: claims.platform_supplier_id,
      subject: claims.sub,
      roles,
      email: claims.email,
      name: claims.name,
      correlationId: req.correlationId!,
    };
    return true;
  }
}
