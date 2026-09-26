import { api } from '@/lib/api';

type TemplateField = { key: string; label: string; required: boolean };

/** A ready-to-fill CSV with the exact column names the fixed BOM template expects (see sourcing.service.ts). */
export async function GET() {
  const { fields } = await api<{ fields: TemplateField[] }>('/sourcing-requests/bom-template');
  const header = fields.map((f) => f.label).join(',');
  const example = fields.map((f) => (f.key === 'description' ? 'MS Plate 10mm' : f.key === 'qty' ? '25' : '')).join(',');
  return new Response(`${header}\n${example}\n`, {
    headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="bom-template.csv"' },
  });
}
