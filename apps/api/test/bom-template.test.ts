import { describe, expect, it } from 'vitest';
import { matchBomHeaders, missingRequiredColumns, parseBomRow } from '../src/modules/sourcing/bom-template.js';

describe('sourcing BOM template', () => {
  it('maps the new brand and HSN/MFG columns and preserves their values', () => {
    const headers = [
      'Item Code',
      'Brand / Manufacturer',
      'HSN / MFG Code',
      'Description',
      'Category',
      'Qty',
      'UOM',
      'Delivery City',
      'Delivery State',
    ];
    const { mapping, unrecognized } = matchBomHeaders(headers);

    expect(unrecognized).toEqual([]);
    expect(missingRequiredColumns(mapping)).toEqual([]);
    expect(parseBomRow(2, ['ITEM-1', 'Tata Steel', '7208 / IS2062', 'MS Plate 10mm', 'Minerals, Metals & Alloys', 25, 'NOS', 'Pune', 'Maharashtra'], mapping)).toEqual({
      row: 2,
      ok: true,
      value: {
        itemCode: 'ITEM-1',
        brandManufacturer: 'Tata Steel',
        hsnMfgCode: '7208 / IS2062',
        description: 'MS Plate 10mm',
        category: 'Minerals, Metals & Alloys',
        qty: 25,
        uom: 'NOS',
        deliveryCity: 'Pune',
        deliveryState: 'Maharashtra',
      },
    });
  });

  it('accepts common manufacturer and part-number header aliases', () => {
    const { mapping, unrecognized } = matchBomHeaders(['Make', 'Part Number']);
    expect(unrecognized).toEqual([]);
    expect(mapping).toMatchObject({ brandManufacturer: 0, hsnMfgCode: 1 });
  });
});
