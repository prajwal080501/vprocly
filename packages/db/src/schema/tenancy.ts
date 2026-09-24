import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { id, tenantId, timestamps } from './columns.js';

export const tenants = pgTable('tenants', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  defaultCurrency: text('default_currency').notNull().default('INR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const legalEntities = pgTable(
  'legal_entities',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    ...timestamps,
  },
  (t) => [unique().on(t.tenantId, t.code)],
);

export const plants = pgTable(
  'plants',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    legalEntityId: uuid('legal_entity_id').notNull().references(() => legalEntities.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.tenantId, t.code)],
);

/** Users are provisioned just-in-time from the identity provider token. */
export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    subject: text('subject').notNull(),
    email: text('email'),
    displayName: text('display_name'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique().on(t.tenantId, t.subject)],
);
