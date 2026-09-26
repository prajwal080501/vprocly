import type { Role } from '@vprocly/contracts';

/** Who is acting, for a supplier-authenticated request. Deliberately not RequestContext: a supplier token
 *  has no tenant_id at all (see SupplierAuthGuard), so there is no tenant to scope tenantDb.run/audit/events
 *  by, and nothing here should ever be passed into code that expects a buyer's RequestContext. */
export type SupplierRequestContext = {
  platformSupplierId: string;
  subject: string;
  roles: Role[];
  email?: string;
  name?: string;
  correlationId: string;
};

declare module 'express' {
  interface Request {
    supplierCtx?: SupplierRequestContext;
  }
}
