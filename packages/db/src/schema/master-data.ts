import { pgTable, text, unique } from 'drizzle-orm/pg-core';
import { id, provenance, tenantId, timestamps } from './columns.js';
import { tenants } from './tenancy.js';

export const suppliers = pgTable(
  'suppliers',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    email: text('email'),
    phone: text('phone'),
    status: text('status').notNull().default('active'),
    ...provenance,
    ...timestamps,
  },
  (t) => [unique().on(t.tenantId, t.code)],
);
