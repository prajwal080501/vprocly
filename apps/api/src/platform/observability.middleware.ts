import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ObservabilityService } from './observability.service.js';

@Injectable()
export class ObservabilityMiddleware implements NestMiddleware {
  constructor(private readonly observability: ObservabilityService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = performance.now();
    res.once('finish', () => {
      const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
      const route = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : req.path;
      this.observability.recordRequest({ route, status: res.statusCode, durationMs, at: Date.now() });
      const fields = {
        msg: 'http request completed',
        requestId: req.correlationId,
        tenantId: req.ctx?.tenantId,
        itemId: req.params?.lineId ?? null,
        supplierId: req.params?.supplierId ?? req.params?.notificationId ?? null,
        jobId: req.params?.jobId ?? null,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs,
      };
      const write = res.statusCode >= 500 ? console.error : console.log;
      write(JSON.stringify(fields));
      if (res.statusCode >= 500) void this.observability.alert(`http:${route}`, `API ${req.method} ${route} returned ${res.statusCode}`, fields);
    });
    next();
  }
}
