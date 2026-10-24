import {
  parseEventPayload,
  supplierItemRecommendationScore,
  supplierResearchCoverage,
  supplierResearchFingerprint,
  SUPPLIER_EVIDENCE_WEIGHTS,
} from '@vprocly/contracts';
import {
  categories,
  enqueueEvent,
  itemEquivalences,
  platformSuppliers,
  supplierCategories,
  supplierItemClaims,
  supplierResearchRuns,
  sourcingLines,
  sourcingLineNotifications,
  sourcingResearchJobs,
  withTenant,
  type Database,
} from '@vprocly/db';
import { and, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { ConsumerDefinition } from '../consumer.js';
import type { SupplierCandidate, SupplierResearchClient, SupplierResearchMetrics } from '../research/supplier-research-client.js';

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
  /** A supplier with a fresh claim for this exact item from a prior run -- just needs re-notifying for this
   *  line, no new row. Populated only when research was skipped (see `researched`). */
  existingProspects: { id: string; email: string }[];
  /** False when the redelivery/race guard skipped calling the research client entirely -- distinguishes
   *  "skipped, no signal either way" from a genuine zero-result research run for the cost-guard log. */
  researched: boolean;
  itemFingerprint: string;
  itemDescription: string;
  researchMetrics: SupplierResearchMetrics;
  cacheHits: number;
};

const emptyMetrics = (stopReason: SupplierResearchMetrics['stopReason'] = 'plan_exhausted'): SupplierResearchMetrics => ({
  queryCount: 0,
  geminiCalls: 0,
  geminiInputTokens: 0,
  geminiOutputTokens: 0,
  groundingQueries: 0,
  placesCalls: 0,
  placesIdSearches: 0,
  placesDetailCalls: 0,
  duplicatesRemoved: 0,
  durationMs: 0,
  estimatedCostMicros: 0,
  stopReason,
});

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
          .values({ tenantId: event.tenantId, sourcingLineId, status: 'researching', targetCount, attemptCount: 1, startedAt: new Date() })
          .onConflictDoUpdate({
            target: sourcingResearchJobs.sourcingLineId,
            set: {
              status: 'researching',
              targetCount,
              attemptCount: sql`${sourcingResearchJobs.attemptCount} + 1`,
              lastError: null,
              startedAt: new Date(),
              completedAt: null,
              updatedAt: new Date(),
            },
          });
      });

      // Cost guard against redelivery double-spend: if fresh claims already cover this exact item (e.g. this
      // event redelivered after a crash post-commit, or an equivalent sibling line raced ahead), skip paid
      // Gemini/Places work -- but still notify this line about the suppliers already present rather than
      // silently dropping their invites.
      const { existingProspects, categoryName, line, itemFingerprint } = await withTenant(deps.db, { tenantId: event.tenantId }, async (tx) => {
        const [line] = await tx
          .select({
            itemCode: sourcingLines.itemCode,
            brandManufacturer: sourcingLines.brandManufacturer,
            hsnMfgCode: sourcingLines.hsnMfgCode,
            description: sourcingLines.description,
          })
          .from(sourcingLines)
          .where(eq(sourcingLines.id, sourcingLineId));
        const researchItem = line ?? {
          itemCode: typeof event.payload.itemCode === 'string' ? event.payload.itemCode : null,
          brandManufacturer: null,
          hsnMfgCode: null,
          description: String(event.payload.description),
        };
        const itemFingerprint = supplierResearchFingerprint(researchItem);
        const equivalentRows = await tx
          .select({ source: itemEquivalences.sourceFingerprint, target: itemEquivalences.targetFingerprint })
          .from(itemEquivalences)
          .where(and(
            eq(itemEquivalences.status, 'approved'),
            or(eq(itemEquivalences.sourceFingerprint, itemFingerprint), eq(itemEquivalences.targetFingerprint, itemFingerprint)),
          ));
        const acceptedFingerprints = [itemFingerprint, ...equivalentRows.map((row) => row.source === itemFingerprint ? row.target : row.source)];
        const found = await tx
          .select({
            id: platformSuppliers.id,
            email: platformSuppliers.email,
            claimFingerprint: supplierItemClaims.itemFingerprint,
            matchScore: supplierItemClaims.matchScore,
            evidenceScore: supplierItemClaims.evidenceScore,
            sourceWeight: supplierItemClaims.sourceWeight,
            outcomeScore: supplierItemClaims.outcomeScore,
            lastVerifiedAt: supplierItemClaims.lastVerifiedAt,
          })
          .from(platformSuppliers)
          .innerJoin(supplierItemClaims, eq(supplierItemClaims.platformSupplierId, platformSuppliers.id))
          .where(and(
            inArray(supplierItemClaims.itemFingerprint, acceptedFingerprints),
            gt(supplierItemClaims.expiresAt, new Date()),
            inArray(platformSuppliers.status, ['active', 'prospect']),
          ))
          .limit(Math.max(targetCount * 4, 20));
        const rankedFound = found
          .map((supplier) => ({
            ...supplier,
            recommendationScore: supplierItemRecommendationScore(supplier),
          }))
          .filter((supplier) => supplier.recommendationScore >= 0.45)
          .sort((a, b) => b.recommendationScore - a.recommendationScore)
          .slice(0, targetCount)
          .map(({ id, email }) => ({ id, email }));
        // Full-text RAG suggests potentially reusable item mappings, but never activates them. An admin must
        // approve a proposal before it can extend exact-item retrieval.
        const similar = await tx.execute<{
          item_fingerprint: string;
          description: string;
          evidence_urls: string[];
          rank: number;
        }>(sql`
          SELECT c.item_fingerprint, c.description, c.evidence_urls,
                 ts_rank_cd(to_tsvector('simple', c.description), websearch_to_tsquery('simple', ${researchItem.description}))::float AS rank
            FROM supplier_item_claims c
            JOIN supplier_categories sc ON sc.platform_supplier_id = c.platform_supplier_id
           WHERE sc.category_id = ${categoryId}::uuid
             AND c.item_fingerprint <> ${itemFingerprint}
             AND c.expires_at > now()
             AND to_tsvector('simple', c.description) @@ websearch_to_tsquery('simple', ${researchItem.description})
           ORDER BY rank DESC
           LIMIT 3
        `);
        for (const candidate of similar.rows.filter((candidate) => candidate.rank >= 0.05)) {
          await tx.insert(itemEquivalences).values({
            sourceFingerprint: itemFingerprint,
            targetFingerprint: candidate.item_fingerprint,
            sourceDescription: researchItem.description,
            targetDescription: candidate.description,
            relationship: 'possible_equivalent',
            status: 'proposed',
            confidence: String(Math.min(0.79, 0.5 + candidate.rank)),
            evidenceUrls: candidate.evidence_urls ?? [],
            proposedBy: 'full_text_retrieval',
          }).onConflictDoNothing();
        }
        const [category] = await tx.select({ name: categories.name }).from(categories).where(eq(categories.id, categoryId));
        return { existingProspects: rankedFound, categoryName: category?.name ?? 'unknown category', line: researchItem, itemFingerprint };
      });
      const coverage = supplierResearchCoverage(existingProspects.length, targetCount);
      if (coverage.route === 'reuse') {
        return {
          newCandidates: [],
          existingProspects,
          researched: false,
          itemFingerprint,
          itemDescription: line.description,
          researchMetrics: emptyMetrics('target_reached'),
          cacheHits: existingProspects.length,
        };
      }

      const result = await deps.research.findSuppliers({
        categoryName,
        itemCode: line.itemCode,
        brandManufacturer: line.brandManufacturer,
        hsnMfgCode: line.hsnMfgCode,
        itemDescription: line.description,
        deliveryCity: String(event.payload.deliveryCity),
        deliveryState: String(event.payload.deliveryState),
        maxResults: targetCount - existingProspects.length,
      });
      return {
        newCandidates: result.candidates,
        existingProspects,
        researched: true,
        itemFingerprint,
        itemDescription: line.description,
        researchMetrics: result.metrics,
        cacheHits: existingProspects.length,
      };
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
    async handler(tx, event, { newCandidates, existingProspects, researched, itemFingerprint, itemDescription, researchMetrics, cacheHits }) {
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
          .values({ tenantId: event.tenantId, sourcingLineId, email, platformSupplierId, itemFingerprint })
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
            discoveryMetadata: {
              placeId: c.placeId,
              sourceUrls: c.sourceUrls,
              searchQuery: c.searchQuery,
              itemMatchScore: c.itemMatchScore,
              evidenceScore: c.evidenceScore,
              matchedIdentifiers: c.matchedIdentifiers,
              matchReasons: c.matchReasons,
              researchIteration: c.researchIteration,
              discoveredAt: new Date().toISOString(),
              sourcingLineId,
            },
          })
          .onConflictDoNothing({ target: platformSuppliers.email })
          .returning();
        if (!supplier) [supplier] = await tx.select().from(platformSuppliers).where(eq(platformSuppliers.email, c.email));
        if (!supplier) continue;

        await tx.insert(supplierCategories).values({ platformSupplierId: supplier.id, categoryId }).onConflictDoNothing();
        await tx
          .insert(supplierItemClaims)
          .values({
            platformSupplierId: supplier.id,
            itemFingerprint,
            description: itemDescription,
            matchScore: String(c.itemMatchScore ?? 0.35),
            evidenceScore: String(c.evidenceScore ?? 0.25),
            sourceType: c.sourceType ?? 'supplier_website',
            sourceWeight: String(SUPPLIER_EVIDENCE_WEIGHTS[c.sourceType ?? 'supplier_website']),
            matchedIdentifiers: c.matchedIdentifiers ?? [],
            matchReasons: c.matchReasons ?? [],
            evidenceUrls: c.sourceUrls,
            searchQueries: [c.searchQuery],
            lastVerifiedAt: new Date(),
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          })
          .onConflictDoUpdate({
            target: [supplierItemClaims.platformSupplierId, supplierItemClaims.itemFingerprint],
            set: {
              description: itemDescription,
              matchScore: String(c.itemMatchScore ?? 0.35),
              evidenceScore: String(c.evidenceScore ?? 0.25),
              sourceType: c.sourceType ?? 'supplier_website',
              sourceWeight: String(SUPPLIER_EVIDENCE_WEIGHTS[c.sourceType ?? 'supplier_website']),
              matchedIdentifiers: c.matchedIdentifiers ?? [],
              matchReasons: c.matchReasons ?? [],
              evidenceUrls: c.sourceUrls,
              searchQueries: [c.searchQuery],
              lastVerifiedAt: new Date(),
              expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
              updatedAt: new Date(),
            },
          });
        await notify(c.email, supplier.id);
      }

      // Log every paid research attempt (including zero-result runs) plus genuine item-cache reuse.
      // The API cooldown still filters on candidatesFound > 0, so zero-result runs remain retryable.
      if (researched || cacheHits > 0) {
        await tx.insert(supplierResearchRuns).values({
          categoryId,
          itemFingerprint,
          candidatesFound: newCandidates.length + existingProspects.length,
          cacheHits,
          queryCount: researchMetrics.queryCount,
          geminiCalls: researchMetrics.geminiCalls,
          geminiInputTokens: researchMetrics.geminiInputTokens,
          geminiOutputTokens: researchMetrics.geminiOutputTokens,
          groundingQueries: researchMetrics.groundingQueries,
          placesCalls: researchMetrics.placesCalls,
          placesIdSearches: researchMetrics.placesIdSearches,
          placesDetailCalls: researchMetrics.placesDetailCalls,
          duplicatesRemoved: researchMetrics.duplicatesRemoved,
          durationMs: researchMetrics.durationMs,
          estimatedCostMicros: researchMetrics.estimatedCostMicros,
          stopReason: researched ? researchMetrics.stopReason : 'cache_reuse',
        });
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
