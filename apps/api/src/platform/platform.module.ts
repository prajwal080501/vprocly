import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config.js';
import { DatabaseModule } from './database.module.js';
import { EventsService } from './events.service.js';
import { PlatformDb } from './platform-db.service.js';
import { HealthController } from './health.controller.js';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }, EventsService, PlatformDb],
  exports: [APP_CONFIG, EventsService, PlatformDb],
})
export class PlatformModule {}
