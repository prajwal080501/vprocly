import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES, type Role } from '@vprocly/contracts';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { IS_PUBLIC, ROLES_KEY } from './decorators.js';
import { TenantDb } from './tenant-db.service.js';

type VproclyClaims = JWTPayload & {
  tenant_id?: string;
  roles?: string[];
  email?: string;
  name?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifies the OIDC bearer token (signature, issuer, audience, expiry), requires a tenant claim, resolves
 * the internal user, and enforces @Roles. Applied globally; opt out with @Public().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwks;

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantDb: TenantDb,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.jwks = createRemoteJWKSet(
      new URL(config.OIDC_JWKS_URI ?? `${config.OIDC_ISSUER}/protocol/openid-connect/certs`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = req.header('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let claims: VproclyClaims;
    try {
      ({ payload: claims } = await jwtVerify<VproclyClaims>(token, this.jwks, {
        issuer: this.config.OIDC_ISSUER,
        audience: this.config.OIDC_AUDIENCE,
      }));
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!claims.sub || !claims.tenant_id || !UUID.test(claims.tenant_id)) {
      throw new ForbiddenException('Token has no tenant');
    }
    const userId = await this.tenantDb.resolveUser({
      tenantId: claims.tenant_id,
      subject: claims.sub,
      email: claims.email,
      name: claims.name,
    });
    if (!userId) throw new ForbiddenException('Unknown tenant');

    const roles = (claims.roles ?? []).filter((r): r is Role => (ROLES as readonly string[]).includes(r));
    req.ctx = {
      tenantId: claims.tenant_id,
      userId,
      subject: claims.sub,
      roles,
      email: claims.email,
      name: claims.name,
      correlationId: req.correlationId!,
    };

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (required?.length && !required.some((r) => roles.includes(r))) {
      throw new ForbiddenException(`Requires one of: ${required.join(', ')}`);
    }
    return true;
  }
}
