import { describe, expect, it } from 'vitest';
import { supplierItemRecommendationScore, supplierResearchCoverage, supplierResearchFingerprint } from '@vprocly/contracts';
import { buildResearchPlan, rankResearchCandidates } from '../src/research/research-plan.js';
import type { SupplierCandidate, SupplierResearchQuery } from '../src/research/supplier-research-client.js';

const query: SupplierResearchQuery = {
  categoryName: 'Bearings',
  itemCode: '6205-ZZ-C3',
  brandManufacturer: 'SKF',
  hsnMfgCode: '848210',
  itemDescription: 'Deep groove ball bearing 25x52x15 mm',
  deliveryCity: 'Pune',
  deliveryState: 'Maharashtra',
  maxResults: 5,
};

describe('supplier research plan', () => {
  it('creates the same item key across harmless punctuation and casing changes', () => {
    expect(supplierResearchFingerprint({ itemCode: '6205-ZZ-C3', description: 'Deep Groove Bearing' }))
      .toBe(supplierResearchFingerprint({ itemCode: '6205 zz c3', description: 'deep groove bearing' }));
    expect(supplierResearchFingerprint({ itemCode: '6206-ZZ-C3', description: 'Deep Groove Bearing' }))
      .not.toBe(supplierResearchFingerprint({ itemCode: '6205-ZZ-C3', description: 'Deep Groove Bearing' }));
  });

  it('routes high coverage to cache reuse and decays stale evidence', () => {
    expect(supplierResearchCoverage(5, 5).route).toBe('reuse');
    expect(supplierResearchCoverage(3, 5).route).toBe('targeted');
    expect(supplierResearchCoverage(0, 5).route).toBe('full');
    const fresh = supplierItemRecommendationScore({ matchScore: 0.9, evidenceScore: 0.8, sourceWeight: 0.7, outcomeScore: 0.8, lastVerifiedAt: '2026-10-01', now: new Date('2026-10-10') });
    const stale = supplierItemRecommendationScore({ matchScore: 0.9, evidenceScore: 0.8, sourceWeight: 0.7, outcomeScore: 0.8, lastVerifiedAt: '2025-10-01', now: new Date('2026-10-10') });
    expect(fresh).toBeGreaterThan(stale);
  });

  it('searches an exact item identifier before broad category fallback', () => {
    const plan = buildResearchPlan(query);
    expect(plan.map((step) => step.kind)).toEqual(['exact_identifier', 'specification', 'regional_fallback']);
    expect(plan[0]!.query).toContain('"6205-ZZ-C3"');
    expect(plan[1]!.query).toContain('HSN 848210');
  });

  it('ranks item evidence above a merely local category result', () => {
    const candidate = (name: string, itemMatchScore: number, evidenceScore: number, city: string): SupplierCandidate => ({
      name,
      email: `${name.toLowerCase()}@example.com`,
      phone: null,
      city,
      state: 'Maharashtra',
      country: 'IN',
      website: null,
      placeId: name,
      sourceUrls: [],
      searchQuery: 'test',
      itemMatchScore,
      evidenceScore,
    });
    const ranked = rankResearchCandidates([candidate('Local', 0.2, 0.2, 'Pune'), candidate('Exact', 0.95, 0.9, 'Mumbai')], query);
    expect(ranked[0]!.name).toBe('Exact');
  });
});
