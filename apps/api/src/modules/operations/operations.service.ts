import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { itemEquivalences, walletRefillOrders } from '@vprocly/db';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { ObservabilityService } from '../../platform/observability.service.js';
import { PlatformDb } from '../../platform/platform-db.service.js';
import type { RequestContext } from '../../platform/request-context.js';
import { TenantDb } from '../identity-tenancy/index.js';

type CountRow = { status: string; channel?: string; count: number };

export const ReviewItemEquivalence = z.object({ status: z.enum(['approved', 'rejected']) });
export type ReviewItemEquivalence = z.infer<typeof ReviewItemEquivalence>;

@Injectable()
export class OperationsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
    private readonly observability: ObservabilityService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async summary(ctx: RequestContext) {
    const tenant = await this.tenantDb.run(ctx, async (tx) => {
      const failedResearch = await tx.execute<{
        job_id: string;
        sourcing_line_id: string;
        request_id: string;
        request_title: string;
        item_description: string;
        attempt_count: number;
        last_error: string | null;
        updated_at: Date;
      }>(sql`
        SELECT j.id AS job_id, j.sourcing_line_id, r.id AS request_id, r.title AS request_title,
               l.description AS item_description, j.attempt_count, j.last_error, j.updated_at
          FROM sourcing_research_jobs j
          JOIN sourcing_lines l ON l.id = j.sourcing_line_id
          JOIN sourcing_requests r ON r.id = l.sourcing_request_id
         WHERE j.status = 'failed'
         ORDER BY j.updated_at DESC
         LIMIT 20
      `);
      const deliveryRows = await tx.execute<CountRow>(sql`
        SELECT channel, status, count(*)::int AS count
          FROM supplier_contact_attempts
         GROUP BY channel, status
         ORDER BY channel, status
      `);
      const callRows = await tx.execute<CountRow>(sql`
        SELECT status, count(*)::int AS count
          FROM supplier_voice_calls
         GROUP BY status
         ORDER BY status
      `);
      const queueRows = await tx.execute<{
        pending_count: number;
        failed_attempt_count: number;
        oldest_age_seconds: number | null;
        average_processing_ms: number | null;
        p95_processing_ms: number | null;
      }>(sql`
        SELECT
          count(*) FILTER (WHERE published_at IS NULL)::int AS pending_count,
          count(*) FILTER (WHERE published_at IS NULL AND attempts > 0)::int AS failed_attempt_count,
          extract(epoch FROM (now() - min(occurred_at) FILTER (WHERE published_at IS NULL)))::float AS oldest_age_seconds,
          avg(extract(epoch FROM (published_at - occurred_at)) * 1000) FILTER (WHERE published_at >= now() - interval '1 hour')::float AS average_processing_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (published_at - occurred_at)) * 1000)
            FILTER (WHERE published_at >= now() - interval '1 hour')::float AS p95_processing_ms
        FROM outbox
      `);
      const delayedRows = await tx.execute<{
        kind: string;
        id: string;
        label: string;
        status: string;
        age_seconds: number;
      }>(sql`
        SELECT 'research' AS kind, j.id::text AS id, l.description AS label, j.status,
               extract(epoch FROM (now() - j.updated_at))::float AS age_seconds
          FROM sourcing_research_jobs j
          JOIN sourcing_lines l ON l.id = j.sourcing_line_id
         WHERE j.status IN ('queued', 'researching') AND j.updated_at < now() - interval '5 minutes'
        UNION ALL
        SELECT 'outbox', o.id::text, o.event_type, 'pending',
               extract(epoch FROM (now() - o.occurred_at))::float
          FROM outbox o
         WHERE o.published_at IS NULL AND o.occurred_at < now() - interval '2 minutes'
        ORDER BY age_seconds DESC
        LIMIT 30
      `);
      return {
        failedResearchJobs: failedResearch.rows.map((row) => ({
          jobId: row.job_id,
          sourcingLineId: row.sourcing_line_id,
          requestId: row.request_id,
          requestTitle: row.request_title,
          itemDescription: row.item_description,
          attemptCount: row.attempt_count,
          lastError: row.last_error,
          updatedAt: row.updated_at,
        })),
        deliveryStatus: deliveryRows.rows,
        callStatus: callRows.rows,
        queue: queueRows.rows[0] ?? { pending_count: 0, failed_attempt_count: 0, oldest_age_seconds: null, average_processing_ms: null, p95_processing_ms: null },
        delayedTasks: delayedRows.rows.map((row) => ({ kind: row.kind, id: row.id, label: row.label, status: row.status, ageSeconds: row.age_seconds })),
      };
    });

    const platform = await this.platformDb.run(async (tx) => {
      const rows = await tx
        .select({ id: walletRefillOrders.id, status: walletRefillOrders.status, createdAt: walletRefillOrders.createdAt })
        .from(walletRefillOrders)
        .where(or(
          and(eq(walletRefillOrders.status, 'created'), lt(walletRefillOrders.createdAt, new Date(Date.now() - 15 * 60_000))),
          and(eq(walletRefillOrders.status, 'paid'), or(isNull(walletRefillOrders.creditedAt), isNull(walletRefillOrders.razorpayPaymentId))),
        ))
        .limit(50);
      const itemEquivalenceReviews = await tx
        .select()
        .from(itemEquivalences)
        .where(eq(itemEquivalences.status, 'proposed'))
        .orderBy(desc(itemEquivalences.confidence), desc(itemEquivalences.createdAt))
        .limit(30);
      const economics = await tx.execute<{
        runs: number;
        candidates_found: number;
        cache_hits: number;
        gemini_calls: number;
        gemini_input_tokens: number;
        gemini_output_tokens: number;
        grounding_queries: number;
        places_calls: number;
        places_id_searches: number;
        places_detail_calls: number;
        estimated_cost_micros: number;
      }>(sql`
        SELECT count(*)::int AS runs,
               coalesce(sum(candidates_found), 0)::float AS candidates_found,
               coalesce(sum(cache_hits), 0)::float AS cache_hits,
               coalesce(sum(gemini_calls), 0)::float AS gemini_calls,
               coalesce(sum(gemini_input_tokens), 0)::float AS gemini_input_tokens,
               coalesce(sum(gemini_output_tokens), 0)::float AS gemini_output_tokens,
               coalesce(sum(grounding_queries), 0)::float AS grounding_queries,
               coalesce(sum(places_calls), 0)::float AS places_calls,
               coalesce(sum(places_id_searches), 0)::float AS places_id_searches,
               coalesce(sum(places_detail_calls), 0)::float AS places_detail_calls,
               coalesce(sum(estimated_cost_micros), 0)::float AS estimated_cost_micros
          FROM supplier_research_runs
         WHERE triggered_at >= now() - interval '30 days'
      `);
      return {
        paymentMismatches: rows.map((row) => ({ id: row.id, status: row.status, createdAt: row.createdAt })),
        itemEquivalenceReviews,
        researchEconomics: economics.rows[0] ?? {
          runs: 0, candidates_found: 0, cache_hits: 0, gemini_calls: 0, gemini_input_tokens: 0,
          gemini_output_tokens: 0, grounding_queries: 0, places_calls: 0, places_id_searches: 0,
          places_detail_calls: 0, estimated_cost_micros: 0,
        },
      };
    });

    const api = this.observability.snapshot();

    return {
      generatedAt: new Date().toISOString(),
      releaseVersion: this.config.RELEASE_VERSION,
      api,
      webhookFailures: api.webhookFailureCount,
      ...platform,
      ...tenant,
    };
  }

  async reviewItemEquivalence(ctx: RequestContext, id: string, input: ReviewItemEquivalence) {
    return this.platformDb.run(async (tx) => {
      const [updated] = await tx
        .update(itemEquivalences)
        .set({ status: input.status, reviewedBy: ctx.userId, reviewedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(itemEquivalences.id, id), eq(itemEquivalences.status, 'proposed')))
        .returning();
      if (!updated) throw new NotFoundException('Pending item equivalence not found');
      return updated;
    });
  }
}
