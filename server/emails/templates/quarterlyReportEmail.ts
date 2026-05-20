// =============================================================================
// quarterlyReportEmail — Sprint AI-2B / RF-07.3 (ADR-172)
// =============================================================================

import { escapeHtml, renderFooter } from "./_helpers";

function quarterLabel(periodStart: string): string {
  const m = /^(\d{4})-(\d{2})-/.exec(periodStart);
  if (!m) return periodStart;
  const year = m[1];
  const monthIdx = parseInt(m[2], 10);
  const q = Math.floor((monthIdx - 1) / 3) + 1;
  return `Q${q}/${year}`;
}

export interface RenderReportEmailArgs {
  content: any;
  userName: string;
  unsubscribeUrl: string;
  baseUrl: string;
  reportId: string;
}

export function renderQuarterlyReportEmail(args: RenderReportEmailArgs): { subject: string; html: string; text: string } {
  const { content, userName, unsubscribeUrl, baseUrl, reportId } = args;
  const ql = quarterLabel(String(content?.periodStart ?? ""));
  const subject = `Seu relatorio trimestral — ${ql}`;
  const safeName = escapeHtml(userName);
  const url = `${baseUrl}/coach-ai/relatorio/${escapeHtml(reportId)}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h1>Ola ${safeName},</h1>
      <p>Seu relatorio trimestral do Grindfy esta pronto (${escapeHtml(ql)}).</p>
      <p style="margin-top:24px;">
        <a href="${url}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
          Abrir relatorio completo
        </a>
      </p>
      ${renderFooter(content?.disclaimer, unsubscribeUrl)}
    </div>
  `;

  const text = `Ola ${userName},\n\nSeu relatorio trimestral do Grindfy esta pronto (${ql}).\n\nAbra em: ${url}\n\n${content?.disclaimer ?? ""}\n\nUnsubscribe: ${unsubscribeUrl}`;

  return { subject, html, text };
}
