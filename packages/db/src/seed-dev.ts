import pg from 'pg';

// Dev-only: tenants matching the tenant_id attributes in infra/compose/keycloak/vprocly-realm.json.
// In production, tenants are provisioned by the platform onboarding flow.
const url = process.env.DATABASE_ADMIN_URL ?? 'postgres://vprocly_admin:vprocly_admin@localhost:55432/vprocly';
const pool = new pg.Pool({ connectionString: url });
await pool.query(`
  INSERT INTO tenants (id, slug, name) VALUES
    ('11111111-1111-4111-8111-111111111111', 'acme', 'Acme Manufacturing'),
    ('22222222-2222-4222-8222-222222222222', 'globex', 'Globex Industries')
  ON CONFLICT DO NOTHING`);
await pool.end();
console.log('dev tenants seeded');
