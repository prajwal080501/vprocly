import type { Role } from '@vprocly/contracts';

/** Who is acting, for which tenant, under which correlation id. Passed explicitly into every service call. */
export type RequestContext = {
  tenantId: string;
  userId: string;
  subject: string;
  roles: Role[];
  email?: string;
  name?: string;
  correlationId: string;
};

declare module 'express' {
  interface Request {
    correlationId?: string;
    ctx?: RequestContext;
  }
}
