import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const url = process.env.DATABASE_ADMIN_URL ?? 'postgres://vprocly_admin:vprocly_admin@localhost:55432/vprocly';
const pool = new pg.Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
await pool.end();
console.log('migrations applied');
