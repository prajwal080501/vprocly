import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { loadConfig } from './config.js';

const app = configureApp(await NestFactory.create(AppModule));
await app.listen(loadConfig().PORT);
