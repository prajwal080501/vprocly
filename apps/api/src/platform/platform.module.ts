import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config.js';
import { DatabaseModule } from './database.module.js';
import { EventsService } from './events.service.js';
import { HealthController } from './health.controller.js';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }, EventsService],
  exports: [APP_CONFIG, EventsService],
})
export class PlatformModule {}
