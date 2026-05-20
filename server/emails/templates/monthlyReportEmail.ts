// =============================================================================
// monthlyReportEmail — Sprint AI-2B / RF-07.3 (ADR-172)
// =============================================================================

import { escapeHtml, renderFooter } from "./_helpers";

const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function monthLabel(periodStart: string): string {
  const m = /^(\d{4})-(\d{2})-/.exec(periodStart);
  if (!m) return periodStart;
  const year = m[1];
  const monthIdx = parseInt(m[2], 10) - 1;
  return `${MONTH_NAMES_PT[monthIdx] ?? m[2]}/${year}`;
}

export interface RenderReportEmailArgs {
  content: any;
  userName: string;
  unsubscribeUrl: string;
  baseUrl: string;
  reportId: string;
}

export function renderMonthlyReportEmail(args: RenderReportEmailArgs): { subject: string; html: string; text: string } {
  const { content, userName, unsubscribeUrl, baseUrl, reportId } = args;
  const ml = monthLabel(String(content?.periodStart ?? ""));
  const subject = `Seu relatorio mensal — ${ml}`;
  const safeName = escapeHtml(userName);
  const url = `${baseUrl}/coach-ai/relatorio/${escapeHtml(reportId)}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h1>Ola ${safeName},</h1>
      <p>Seu relatorio mensal do Grindfy esta pronto (${escapeHtml(ml)}).</p>
      <p style="margin-top:24px;">
        <a href="${url}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
          Abrir relatorio completo
        </a>
      </p>
      ${renderFooter(content?.disclaimer, unsubscribeUrl)}
    </div>
  `;

  const text = `Ola ${userName},\n\nSeu relatorio mensal do Grindfy esta pronto (${ml}).\n\nAbra em: ${url}\n\n${content?.disclaimer ?? ""}\n\nUnsubscribe: ${unsubscribeUrl}`;

  return { subject, html, text };
}
