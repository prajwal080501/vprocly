import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@vprocly/contracts';
import type { Request } from 'express';
import type { RequestContext } from '../../platform/request-context.js';
import type { SupplierRequestContext } from './supplier-request-context.js';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
/** Caller needs at least one of these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const Ctx = createParamDecorator((_: unknown, host: ExecutionContext): RequestContext => {
  const req = host.switchToHttp().getRequest<Request>();
  if (!req.ctx) throw new Error('Ctx used on a public route');
  return req.ctx;
});

export const SupplierCtx = createParamDecorator((_: unknown, host: ExecutionContext): SupplierRequestContext => {
  const req = host.switchToHttp().getRequest<Request>();
  if (!req.supplierCtx) throw new Error('SupplierCtx used on a route without SupplierAuthGuard');
  return req.supplierCtx;
});
