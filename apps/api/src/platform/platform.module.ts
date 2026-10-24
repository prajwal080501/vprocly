import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config.js';
import { DatabaseModule } from './database.module.js';
import { EventsService } from './events.service.js';
import { PlatformDb } from './platform-db.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { HealthController } from './health.controller.js';
import { ObservabilityMiddleware } from './observability.middleware.js';
import { ObservabilityService } from './observability.service.js';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }, EventsService, PlatformDb, RealtimeGateway, ObservabilityService, ObservabilityMiddleware],
  exports: [APP_CONFIG, EventsService, PlatformDb, ObservabilityService, ObservabilityMiddleware],
})
export class PlatformModule {}
