import type { SupplierCandidate, SupplierResearchQuery } from './supplier-research-client.js';

export type ResearchStep = {
  kind: 'exact_identifier' | 'specification' | 'regional_fallback';
  query: string;
};

const meaningful = (value: string | null | undefined) => value?.trim() || null;

/** A cheap deterministic query ladder. Exact public identifiers lead; HSN/category only broaden later. */
export function buildResearchPlan(input: SupplierResearchQuery): ResearchStep[] {
  const code = meaningful(input.itemCode);
  const brand = meaningful(input.brandManufacturer);
  const hsn = meaningful(input.hsnMfgCode);
  const place = `${input.deliveryCity}, ${input.deliveryState}`;
  const steps: ResearchStep[] = [];

  if (code) {
    steps.push({
      kind: 'exact_identifier',
      query: [`"${code}"`, brand, 'supplier OR distributor OR manufacturer', place].filter(Boolean).join(' '),
    });
  }

  steps.push({
    kind: 'specification',
    query: [brand, `"${input.itemDescription}"`, hsn ? `HSN ${hsn}` : null, 'supplier', place].filter(Boolean).join(' '),
  });

  steps.push({
    kind: 'regional_fallback',
    query: [input.categoryName, input.itemDescription, 'manufacturer distributor supplier', place].filter(Boolean).join(' '),
  });

  return steps.filter((step, index, all) => all.findIndex((other) => other.query.toLowerCase() === step.query.toLowerCase()) === index);
}

export function rankResearchCandidates(candidates: SupplierCandidate[], input: SupplierResearchQuery): SupplierCandidate[] {
  const city = input.deliveryCity.toLowerCase();
  const state = input.deliveryState.toLowerCase();
  return [...candidates].sort((a, b) => score(b) - score(a));

  function score(candidate: SupplierCandidate): number {
    const location = candidate.city.toLowerCase() === city ? 0.1 : candidate.state.toLowerCase() === state ? 0.05 : 0;
    const contact = candidate.email ? 0.05 : 0;
    return (candidate.itemMatchScore ?? 0.35) * 0.65 + (candidate.evidenceScore ?? 0.25) * 0.25 + location + contact;
  }
}
