export type SupplierEvidenceSource =
  | 'successful_order'
  | 'supplier_quote'
  | 'supplier_confirmation'
  | 'manufacturer_directory'
  | 'official_catalogue'
  | 'supplier_website'
  | 'google_places'
  | 'marketplace'
  | 'search_snippet'
  | 'unsupported';

export const SUPPLIER_EVIDENCE_WEIGHTS: Record<SupplierEvidenceSource, number> = {
  successful_order: 1,
  supplier_quote: 0.95,
  supplier_confirmation: 0.9,
  manufacturer_directory: 0.9,
  official_catalogue: 0.8,
  supplier_website: 0.7,
  google_places: 0.4,
  marketplace: 0.35,
  search_snippet: 0.2,
  unsupported: 0,
};

export function freshnessFactor(lastVerifiedAt: Date | string, ttlDays = 90, now = new Date()): number {
  const ageDays = Math.max(0, (now.getTime() - new Date(lastVerifiedAt).getTime()) / 86_400_000);
  if (ageDays <= ttlDays * 0.5) return 1;
  return Math.max(0.25, 1 - (ageDays - ttlDays * 0.5) / ttlDays);
}

export function supplierItemRecommendationScore(input: {
  matchScore: number | string;
  evidenceScore: number | string;
  sourceWeight: number | string;
  outcomeScore: number | string;
  lastVerifiedAt: Date | string;
  ttlDays?: number;
  now?: Date;
}): number {
  const base = Number(input.matchScore) * 0.45
    + Number(input.evidenceScore) * 0.2
    + Number(input.sourceWeight) * 0.15
    + Number(input.outcomeScore) * 0.2;
  return Math.max(0, Math.min(1, base * freshnessFactor(input.lastVerifiedAt, input.ttlDays, input.now)));
}

export function supplierResearchCoverage(found: number, target: number): { ratio: number; route: 'reuse' | 'targeted' | 'full' } {
  const ratio = target <= 0 ? 1 : Math.max(0, Math.min(1, found / target));
  return { ratio, route: ratio >= 0.85 ? 'reuse' : ratio >= 0.4 ? 'targeted' : 'full' };
}
