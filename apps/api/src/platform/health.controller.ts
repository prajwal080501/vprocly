import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from '@vprocly/db';
import { Public } from '../modules/identity-tenancy/index.js';
import { PG_POOL } from './database.module.js';

@Controller('health')
@Public()
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', db: 'down' });
    }
  }
}
