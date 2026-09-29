import { pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { id, provenance, tenantId, timestamps } from './columns.js';
import { platformSuppliers } from './marketplace.js';
import { tenants } from './tenancy.js';

export const suppliers = pgTable(
  'suppliers',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    platformSupplierId: uuid('platform_supplier_id').references(() => platformSuppliers.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    email: text('email'),
    phone: text('phone'),
    status: text('status').notNull().default('active'),
    ...provenance,
    ...timestamps,
  },
  (t) => [unique().on(t.tenantId, t.code), unique().on(t.tenantId, t.platformSupplierId)],
);
