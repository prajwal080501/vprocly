import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, createPool, type Pool } from '@vprocly/db';
import { APP_CONFIG, type AppConfig } from '../config.js';

export const DATABASE = Symbol('DATABASE');
export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [
    { provide: PG_POOL, inject: [APP_CONFIG], useFactory: (c: AppConfig) => createPool(c.DATABASE_URL, 20) },
    { provide: DATABASE, inject: [PG_POOL], useFactory: (pool: Pool) => createDatabase(pool) },
  ],
  exports: [DATABASE, PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
