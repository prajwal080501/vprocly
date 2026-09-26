import { z } from 'zod';

/**
 * A fixed, known column set for BOM upload -- deliberately not a general column-mapping studio (that stays
 * deferred). Header matching is case-insensitive and tolerates a couple of common synonyms; anything else is
 * reported back to the buyer as an unrecognized column rather than guessed at.
 */
export const BOM_TEMPLATE_FIELDS = [
  { key: 'itemCode', label: 'Item Code', aliases: ['item code', 'code'], required: false },
  { key: 'description', label: 'Description', aliases: ['description', 'item description', 'material description'], required: true },
  { key: 'category', label: 'Category', aliases: ['category'], required: true },
  { key: 'qty', label: 'Qty', aliases: ['qty', 'quantity', 'required qty'], required: true },
  { key: 'uom', label: 'UOM', aliases: ['uom', 'unit'], required: true },
  { key: 'deliveryCity', label: 'Delivery City', aliases: ['delivery city', 'city'], required: true },
  { key: 'deliveryState', label: 'Delivery State', aliases: ['delivery state', 'state'], required: true },
  { key: 'needBy', label: 'Need By', aliases: ['need by', 'needed by', 'required by'], required: false },
  { key: 'inviteEmails', label: 'Invite Emails', aliases: ['invite emails', 'invite email'], required: false },
] as const;

export type BomFieldKey = (typeof BOM_TEMPLATE_FIELDS)[number]['key'];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Matches uploaded headers to template fields; returns the mapping plus any headers it could not place. */
export function matchBomHeaders(headers: string[]): { mapping: Partial<Record<BomFieldKey, number>>; unrecognized: string[] } {
  const mapping: Partial<Record<BomFieldKey, number>> = {};
  const unrecognized: string[] = [];
  for (const [i, header] of headers.entries()) {
    const field = BOM_TEMPLATE_FIELDS.find((f) => (f.aliases as readonly string[]).includes(norm(header)));
    if (field) mapping[field.key] = i;
    else unrecognized.push(header);
  }
  return { mapping, unrecognized };
}

export function missingRequiredColumns(mapping: Partial<Record<BomFieldKey, number>>): string[] {
  return BOM_TEMPLATE_FIELDS.filter((f) => f.required && mapping[f.key] === undefined).map((f) => f.label);
}

const RawBomLine = z.object({
  itemCode: z.string().trim().optional(),
  description: z.string().trim().min(1),
  category: z.string().trim().min(1),
  qty: z.coerce.number().positive(),
  uom: z.string().trim().min(1),
  deliveryCity: z.string().trim().min(1),
  deliveryState: z.string().trim().min(1),
  needBy: z.string().trim().optional(),
  inviteEmails: z.string().trim().optional(),
});

export type BomLineValue = z.infer<typeof RawBomLine>;
export type BomRowResult = { row: number; ok: true; value: BomLineValue } | { row: number; ok: false; errors: string[] };

/** Applies the header mapping to one raw spreadsheet row and validates it. `row` is 1-based, matching what a buyer sees in Excel. */
export function parseBomRow(row: number, cells: unknown[], mapping: Partial<Record<BomFieldKey, number>>): BomRowResult {
  const raw: Record<string, unknown> = {};
  for (const [key, index] of Object.entries(mapping)) {
    const v = cells[index as number];
    if (v !== null && v !== undefined && v !== '') raw[key] = String(v);
  }
  const result = RawBomLine.safeParse(raw);
  if (!result.success) {
    return { row, ok: false, errors: result.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`) };
  }
  return { row, ok: true, value: result.data };
}
