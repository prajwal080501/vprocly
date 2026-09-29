import ExcelJS from 'exceljs';
import { publicApi } from '@/lib/public-api';
import type { Category } from '@/lib/types';

type TemplateField = { key: string; label: string; required: boolean };

const exampleValues: Record<string, string | number> = {
  itemCode: 'ITEM-001',
  brandManufacturer: 'Tata Steel',
  hsnMfgCode: '7208 / IS2062-E250',
  description: 'MS Plate 10mm',
  qty: 25,
  uom: 'NOS',
  deliveryCity: 'Pune',
  deliveryState: 'Maharashtra',
};

/** Generates a real Excel template with a controlled category dropdown and a hidden taxonomy sheet. */
export async function GET() {
  const [{ fields }, categories] = await Promise.all([
    publicApi<{ fields: TemplateField[] }>('/sourcing-requests/bom-template'),
    publicApi<Category[]>('/categories'),
  ]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'vProcly';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Sourcing Items', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = fields.map((field) => ({ header: field.label, key: field.key, width: Math.max(15, field.label.length + 4) }));
  sheet.addRow(Object.fromEntries(fields.map((field) => [field.key, field.key === 'category' ? categories[0]?.name ?? '' : exampleValues[field.key] ?? ''])));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length } };
  sheet.getRow(1).height = 24;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { vertical: 'middle' };
  });

  const categorySheet = workbook.addWorksheet('Categories', { state: 'veryHidden' });
  categories.forEach((category, index) => { categorySheet.getCell(index + 1, 1).value = category.name; });
  const categoryColumn = fields.findIndex((field) => field.key === 'category') + 1;
  if (categoryColumn > 0 && categories.length > 0) {
    for (let row = 2; row <= 501; row++) {
      sheet.getCell(row, categoryColumn).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`'Categories'!$A$1:$A$${categories.length}`],
        showErrorMessage: true,
        errorTitle: 'Select a category',
        error: 'Choose a category from the predefined list.',
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="vprocly-sourcing-template.xlsx"',
      'cache-control': 'no-store',
    },
  });
}
