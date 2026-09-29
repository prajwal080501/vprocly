import { parseEventPayload } from '@vprocly/contracts';
import {
  categories,
  enqueueEvent,
  platformSuppliers,
  supplierCategories,
  supplierResearchRuns,
  sourcingLineNotifications,
  sourcingResearchJobs,
  withTenant,
  type Database,
} from '@vprocly/db';
import { and, eq, sql } from 'drizzle-orm';
import type { ConsumerDefinition } from '../consumer.js';
import type { SupplierCandidate, SupplierResearchClient } from '../research/supplier-research-client.js';

/**
 * AI supplier discovery: fired when a sourcing line has no active supplier match and no prior AI-discovered
 * prospect either (see sourcing.service.ts's commitLine, tier 3). Finds real candidate suppliers (Gemini
 * grounded search + Google Places verification, see gemini-places-client.ts), persists each as a
 * platform_suppliers row with status='prospect' so the supplier database itself grows, then re-emits
 * sourcing.sourcing_line_matched so the outreach router can call first when a phone exists, then request
 * the existing bidding email only when voice is unavailable or unanswered.
 */
type Prepared = {
  /** Newly researched candidates -- get their own new platform_suppliers row. Empty when skipped below. */
  newCandidates: SupplierCandidate[];
  /** A prospect that already covers this category from a prior run -- just needs re-notifying for this
   *  line, no new row. Populated only when research was skipped (see `researched`). */
  existingProspects: { id: string; email: string }[];
  /** False when the redelivery/race guard skipped calling the research client entirely -- distinguishes
   *  "skipped, no signal either way" from a genuine zero-result research run for the cost-guard log. */
  researched: boolean;
};

export function supplierResearchAgent(
  deps: { db: Database; research: SupplierResearchClient; maxCandidates: number },
): ConsumerDefinition<Prepared> {
  return {
    name: 'supplier-research-agent',
    filterSubjects: ['vprocly.*.sourcing.sourcing_line_unmatched.v1'],
    // Lower than the default (6): bounds worst-case paid Gemini/Places spend per event before it dead-letters.
    maxDeliver: 3,
    async prepare(event) {
      const categoryId = String(event.payload.categoryId);
      const sourcingLineId = String(event.payload.sourcingLineId);
      const neededSupplierCount = Number(event.payload.neededSupplierCount ?? deps.maxCandidates);
      const targetCount = Math.max(1, Math.min(deps.maxCandidates, neededSupplierCount));

      await withTenant(deps.db, { tenantId: event.tenantId, correlationId: event.correlationId ?? undefined }, async (tx) => {
        await tx
          .insert(sourcingResearchJobs)
          .values({ tenantId: event.tenantId, sourcingLineId, status: 'researching', targetCount: deps.maxCandidates, attemptCount: 1, startedAt: new Date() })
          .onConflictDoUpdate({
            target: sourcingResearchJobs.sourcingLineId,
            set: {
              status: 'researching',
              attemptCount: sql`${sourcingResearchJobs.attemptCount} + 1`,
              lastError: null,
              startedAt: new Date(),
              completedAt: null,
              updatedAt: new Date(),
            },
          });
      });

      // Cost guard against redelivery double-spend: if a prospect already covers this category (e.g. this
      // exact event redelivered after a crash post-commit, or a sibling line for the same category raced
      // ahead of us), skip spending on Gemini/Places again -- but still notify this line about the prospect
      // that's already there, rather than silently dropping its invite.
      const { existingProspects, categoryName } = await withTenant(deps.db, { tenantId: event.tenantId }, async (tx) => {
        const found = await tx
          .select({ id: platformSuppliers.id, email: platformSuppliers.email })
          .from(platformSuppliers)
          .innerJoin(supplierCategories, eq(supplierCategories.platformSupplierId, platformSuppliers.id))
          .where(and(eq(supplierCategories.categoryId, categoryId), eq(platformSuppliers.status, 'prospect')))
          .limit(targetCount);
        const [category] = await tx.select({ name: categories.name }).from(categories).where(eq(categories.id, categoryId));
        return { existingProspects: found, categoryName: category?.name ?? 'unknown category' };
      });
      if (existingProspects.length >= targetCount) return { newCandidates: [], existingProspects, researched: false };

      const newCandidates = await deps.research.findSuppliers({
        categoryName,
        itemDescription: String(event.payload.description),
        deliveryCity: String(event.payload.deliveryCity),
        deliveryState: String(event.payload.deliveryState),
        maxResults: targetCount - existingProspects.length,
      });
      return { newCandidates, existingProspects, researched: true };
    },
    async onError(event, error) {
      const reason = error instanceof Error ? error.message : String(error);
      await withTenant(deps.db, { tenantId: event.tenantId, correlationId: event.correlationId ?? undefined }, async (tx) => {
        await tx
          .update(sourcingResearchJobs)
          .set({ status: 'failed', lastError: reason.slice(0, 2000), completedAt: new Date(), updatedAt: new Date() })
          .where(eq(sourcingResearchJobs.sourcingLineId, String(event.payload.sourcingLineId)));
      });
    },
    async handler(tx, event, { newCandidates, existingProspects, researched }) {
      const sourcingLineId = String(event.payload.sourcingLineId);
      const categoryId = String(event.payload.categoryId);

      let invitedNewCount = 0;
      const [existingNotification] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(sourcingLineNotifications)
        .where(eq(sourcingLineNotifications.sourcingLineId, sourcingLineId));
      let remainingSlots = Math.max(0, deps.maxCandidates - Number(existingNotification?.count ?? 0));
      const notify = async (email: string, platformSupplierId: string) => {
        if (remainingSlots <= 0) return;
        const [inserted] = await tx
          .insert(sourcingLineNotifications)
          .values({ tenantId: event.tenantId, sourcingLineId, email, platformSupplierId })
          .onConflictDoNothing()
          .returning({ id: sourcingLineNotifications.id });
        if (inserted) {
          invitedNewCount++;
          remainingSlots--;
        }
      };

      for (const p of existingProspects) await notify(p.email, p.id);

      for (const c of newCandidates) {
        let [supplier] = await tx
          .insert(platformSuppliers)
          .values({
            name: c.name,
            gst: null,
            email: c.email,
            phone: c.phone,
            city: c.city,
            state: c.state,
            country: c.country,
            status: 'prospect',
            discoveryMetadata: { placeId: c.placeId, sourceUrls: c.sourceUrls, searchQuery: c.searchQuery, discoveredAt: new Date().toISOString(), sourcingLineId },
          })
          .onConflictDoNothing({ target: platformSuppliers.email })
          .returning();
        if (!supplier) [supplier] = await tx.select().from(platformSuppliers).where(eq(platformSuppliers.email, c.email));
        if (!supplier) continue;

        await tx.insert(supplierCategories).values({ platformSupplierId: supplier.id, categoryId }).onConflictDoNothing();
        await notify(c.email, supplier.id);
      }

      // Only a useful result activates the category cooldown. Upstream failures throw before this transaction,
      // and an empty result remains retryable so a temporary search-quality issue cannot suppress later lines.
      if (researched && newCandidates.length > 0) {
        await tx.insert(supplierResearchRuns).values({ categoryId, candidatesFound: newCandidates.length });
      }

      const [notificationCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(sourcingLineNotifications)
        .where(eq(sourcingLineNotifications.sourcingLineId, sourcingLineId));
      const foundCount = Math.min(deps.maxCandidates, Number(notificationCount?.count ?? 0));
      const status = foundCount >= deps.maxCandidates ? 'completed' : foundCount > 0 ? 'partial' : 'failed';
      await tx
        .update(sourcingResearchJobs)
        .set({
          status,
          foundCount,
          lastError: status === 'failed' ? 'No verified suppliers with a public contact email were found.' : null,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sourcingResearchJobs.sourcingLineId, sourcingLineId));

      if (invitedNewCount > 0) {
        const payload = parseEventPayload('sourcing.sourcing_line_matched', 1, { sourcingLineId, matchedSupplierCount: 0, invitedNewCount });
        await enqueueEvent(tx, event.tenantId, {
          eventType: 'sourcing.sourcing_line_matched',
          eventVersion: 1,
          aggregateType: 'sourcing_line',
          aggregateId: sourcingLineId,
          payload,
          correlationId: event.correlationId,
          actorId: event.actorId,
        });
      }
    },
  };
}
