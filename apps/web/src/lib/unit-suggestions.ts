export type UnitSuggestion = { value: string; label: string };

const RULES: Array<{ terms: string[]; units: UnitSuggestion[] }> = [
  {
    terms: ['rice', 'grain', 'flour', 'sugar', 'powder', 'cement', 'sand', 'salt', 'spice', 'granule', 'pellet'],
    units: [
      { value: 'KG', label: 'Kilogram (KG)' },
      { value: 'LB', label: 'Pound (LB)' },
      { value: 'G', label: 'Gram (G)' },
      { value: 'TON', label: 'Metric ton (TON)' },
    ],
  },
  {
    terms: ['milk', 'oil', 'water', 'juice', 'chemical', 'paint', 'lubricant', 'fuel', 'liquid', 'solvent'],
    units: [
      { value: 'LTR', label: 'Litre (LTR)' },
      { value: 'ML', label: 'Millilitre (ML)' },
      { value: 'KL', label: 'Kilolitre (KL)' },
    ],
  },
  {
    terms: ['cable', 'wire', 'pipe', 'hose', 'rope', 'fabric', 'textile', 'tube'],
    units: [
      { value: 'M', label: 'Metre (M)' },
      { value: 'MM', label: 'Millimetre (MM)' },
      { value: 'FT', label: 'Foot (FT)' },
    ],
  },
  {
    terms: ['tile', 'flooring', 'carpet', 'laminate'],
    units: [
      { value: 'SQM', label: 'Square metre (SQM)' },
      { value: 'SQFT', label: 'Square foot (SQFT)' },
    ],
  },
  {
    terms: ['bolt', 'nut', 'bearing', 'motor', 'pump', 'valve', 'sensor', 'connector', 'battery', 'filter', 'assembly'],
    units: [
      { value: 'NOS', label: 'Number (NOS)' },
      { value: 'PCS', label: 'Pieces (PCS)' },
      { value: 'SET', label: 'Set (SET)' },
    ],
  },
];

export const COMMON_UNITS: UnitSuggestion[] = [
  { value: 'NOS', label: 'Number (NOS)' },
  { value: 'PCS', label: 'Pieces (PCS)' },
  { value: 'SET', label: 'Set (SET)' },
  { value: 'KG', label: 'Kilogram (KG)' },
  { value: 'G', label: 'Gram (G)' },
  { value: 'TON', label: 'Metric ton (TON)' },
  { value: 'LB', label: 'Pound (LB)' },
  { value: 'LTR', label: 'Litre (LTR)' },
  { value: 'ML', label: 'Millilitre (ML)' },
  { value: 'KL', label: 'Kilolitre (KL)' },
  { value: 'M', label: 'Metre (M)' },
  { value: 'MM', label: 'Millimetre (MM)' },
  { value: 'FT', label: 'Foot (FT)' },
  { value: 'SQM', label: 'Square metre (SQM)' },
  { value: 'SQFT', label: 'Square foot (SQFT)' },
];

function containsTerm(value: string, term: string) {
  return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(value);
}

export function suggestUnits(description: string): UnitSuggestion[] {
  const normalized = description.trim().toLowerCase();
  if (!normalized) return [];
  return RULES.find((rule) => rule.terms.some((term) => containsTerm(normalized, term)))?.units ?? [];
}

export function unitOptions(description: string): UnitSuggestion[] {
  const suggested = suggestUnits(description);
  return [...suggested, ...COMMON_UNITS.filter((unit) => !suggested.some((candidate) => candidate.value === unit.value))];
}
