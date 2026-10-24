import { Inject, Logger, type BeforeApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets';
import type { PgNotification, Pool, PoolClient } from '@vprocly/db';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Namespace, Socket } from 'socket.io';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PG_POOL } from './database.module.js';

type RealtimeClaims = JWTPayload & {
  tenant_id?: string;
  platform_supplier_id?: string;
  roles?: string[];
};

export type DashboardChange = {
  kind: 'opportunity' | 'research' | 'call' | 'email' | 'bid' | 'bid_draft' | 'fulfillment' | 'clarification' | 'capability';
  tenantId: string;
  supplierId?: string | null;
  sourcingLineId: string;
  sourcingRequestId?: string | null;
  itemDescription?: string | null;
  status?: string | null;
  occurredAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@WebSocketGateway({
  namespace: '/realtime',
  transports: ['websocket'],
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnApplicationBootstrap, BeforeApplicationShutdown {
  @WebSocketServer()
  private server!: Namespace;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly jwks;
  private listener: PoolClient | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shuttingDown = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {
    this.jwks = createRemoteJWKSet(new URL(config.OIDC_JWKS_URI ?? `${config.OIDC_ISSUER}/protocol/openid-connect/certs`));
  }

  async handleConnection(socket: Socket) {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : null;
    if (!token) return socket.disconnect(true);

    try {
      const { payload } = await jwtVerify<RealtimeClaims>(token, this.jwks, {
        issuer: this.config.OIDC_ISSUER,
        audience: this.config.OIDC_AUDIENCE,
      });
      if (payload.tenant_id && UUID.test(payload.tenant_id)) {
        await socket.join(`buyer:${payload.tenant_id}`);
        return;
      }
      if (payload.platform_supplier_id && UUID.test(payload.platform_supplier_id) && payload.roles?.includes('supplier')) {
        await socket.join(`supplier:${payload.platform_supplier_id}`);
        return;
      }
      socket.disconnect(true);
    } catch {
      socket.disconnect(true);
    }
  }

  async onApplicationBootstrap() {
    await this.connectListener();
  }

  private async connectListener() {
    if (this.shuttingDown || this.listener) return;

    try {
      const listener = await this.pool.connect();
      this.listener = listener;
      listener.on('notification', (message: PgNotification) => this.handleNotification(message));
      listener.once('error', (error: Error) => {
        if (this.listener !== listener) return;
        this.listener = null;
        listener.release(error);
        this.logger.error('PostgreSQL realtime listener failed; reconnecting', error);
        this.scheduleReconnect();
      });
      await listener.query('LISTEN vprocly_realtime');
      this.logger.log('Listening for committed dashboard changes');
    } catch (error) {
      this.listener = null;
      this.logger.error('Unable to start PostgreSQL realtime listener; reconnecting', error);
      this.scheduleReconnect();
    }
  }

  private handleNotification(message: PgNotification) {
    if (message.channel !== 'vprocly_realtime' || !message.payload) return;
    try {
      const change = JSON.parse(message.payload) as DashboardChange;
      if (!UUID.test(change.tenantId) || !UUID.test(change.sourcingLineId)) return;
      this.server.to(`buyer:${change.tenantId}`).emit('dashboard.changed', change);
      if (change.supplierId && UUID.test(change.supplierId)) {
        this.server.to(`supplier:${change.supplierId}`).emit('dashboard.changed', change);
      }
    } catch (error) {
      this.logger.warn(`Ignored malformed realtime notification: ${String(error)}`);
    }
  }

  private scheduleReconnect() {
    if (this.shuttingDown || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectListener();
    }, 5_000);
  }

  async beforeApplicationShutdown() {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const listener = this.listener;
    this.listener = null;
    if (!listener) return;
    await listener.query('UNLISTEN vprocly_realtime').catch(() => undefined);
    listener.release();
  }
}
