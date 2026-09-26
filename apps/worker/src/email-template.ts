/** Minimal, table-based, inline-CSS HTML shell shared by every transactional email -- kept deliberately
 * plain (no external assets/fonts) since email clients strip or mangle anything fancier. */
export function renderEmailHtml(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerNote: string;
}): string {
  const cta = opts.cta
    ? `<tr><td style="padding:8px 0 0;">
         <a href="${opts.cta.url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">${opts.cta.label}</a>
       </td></tr>`
    : '';
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#111827;padding:20px 32px;">
          <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.02em;">vProcly</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:20px;font-weight:600;color:#111827;padding:0 0 16px;">${opts.heading}</td></tr>
            <tr><td style="font-size:15px;line-height:1.6;color:#374151;">${opts.bodyHtml}</td></tr>
            ${cta}
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${opts.footerNote}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** A key/value details table, e.g. item code/description/qty/delivery for a sourcing line. */
export function renderDetailsTable(rows: Array<[string, string]>): string {
  const tr = rows
    .map(
      ([label, value]) => `<tr>
        <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${label}</td>
        <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:500;">${value}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">${tr}</table>`;
}
