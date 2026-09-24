import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from './config.js';

/** Shared by main.ts and tests so both run the same HTTP setup. */
export function configureApp(app: INestApplication) {
  const config = loadConfig();
  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] });
  app.enableCors({ origin: config.CORS_ORIGIN.split(','), exposedHeaders: ['x-correlation-id'] });
  app.enableShutdownHooks();
  const doc = new DocumentBuilder().setTitle('vProcly API').setVersion('0.1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc));
  return app;
}
