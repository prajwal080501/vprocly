export type SupplierResearchItem = {
  itemCode?: string | null;
  brandManufacturer?: string | null;
  hsnMfgCode?: string | null;
  description: string;
};

/**
 * Stable, non-semantic identity for reusing supplier evidence. Category is intentionally excluded: two
 * items in the same category must not share a paid-research cooldown. The compact dual hash keeps the
 * value index-friendly without exposing a buyer's complete item description in platform-level tables.
 */
export function supplierResearchFingerprint(item: SupplierResearchItem): string {
  const canonical = [item.itemCode, item.brandManufacturer, item.hsnMfgCode, item.description]
    .map((value) => normalize(value ?? ''))
    .join('|');
  return `v1-${fnv1a(canonical, 0x811c9dc5)}${fnv1a(canonical, 0x9e3779b9)}`;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fnv1a(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
