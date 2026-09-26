-- Adds automotive-industry categories alongside the original generic-manufacturing seed (migration 0004).
-- The fixed category list is global (not per-tenant) -- see packages/db/src/schema/marketplace.ts -- so as
-- more industries use the platform, the seed grows the same way: a new migration adds the missing names,
-- exactly as a real customer's BOM spells them, rather than trying to force a fuzzy/synonym match onto the
-- existing generic list. Tenant-manageable categories (letting a buyer add their own) is a real fast-follow
-- if this ad hoc growth becomes unwieldy, but is out of scope for this migration.
INSERT INTO categories (id, name) VALUES
  (gen_random_uuid(), 'Body & Structure'),
  (gen_random_uuid(), 'Braking'),
  (gen_random_uuid(), 'Steering'),
  (gen_random_uuid(), 'Suspension'),
  (gen_random_uuid(), 'Wheel & Tire'),
  (gen_random_uuid(), 'Electronics'),
  (gen_random_uuid(), 'ADAS'),
  (gen_random_uuid(), 'Electrical'),
  (gen_random_uuid(), 'EV Powertrain'),
  (gen_random_uuid(), 'Thermal Management'),
  (gen_random_uuid(), 'Lighting'),
  (gen_random_uuid(), 'Interior'),
  (gen_random_uuid(), 'Safety'),
  (gen_random_uuid(), 'Fasteners'),
  (gen_random_uuid(), 'Sealing'),
  (gen_random_uuid(), 'Glazing'),
  (gen_random_uuid(), 'Consumables')
ON CONFLICT (name) DO NOTHING;
