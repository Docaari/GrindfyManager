// =============================================================================
// weeklyReportEmail — Sprint AI-2B / RF-07.3 (ADR-172)
// =============================================================================

import { escapeHtml, renderFooter, formatBrDate } from "./_helpers";

export interface RenderReportEmailArgs {
  content: any;
  userName: string;
  unsubscribeUrl: string;
  baseUrl: string;
  reportId: string;
}

export function renderWeeklyReportEmail(args: RenderReportEmailArgs): { subject: string; html: string; text: string } {
  const { content, userName, unsubscribeUrl, baseUrl, reportId } = args;
  const startBr = formatBrDate(String(content?.periodStart ?? ""));
  const subject = `Seu relatorio semanal — semana de ${startBr}`;
  const safeName = escapeHtml(userName);
  const url = `${baseUrl}/coach-ai/relatorio/${escapeHtml(reportId)}`;

  // Mental hand highlights (potencialmente texto livre — escape).
  const mhItems: string[] = [];
  if (Array.isArray(content?.mentalHandHighlights)) {
    for (const mh of content.mentalHandHighlights) {
      mhItems.push(
        `<li><strong>${escapeHtml(mh?.emotion ?? "")}</strong>: ${escapeHtml(mh?.situation ?? "")} → ideal: ${escapeHtml(mh?.idealResponse ?? "")}</li>`,
      );
    }
  }
  const mhBlock = mhItems.length
    ? `<h3>Mental Hand Highlights</h3><ul>${mhItems.join("")}</ul>`
    : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h1>Ola ${safeName},</h1>
      <p>Seu relatorio semanal do Grindfy esta pronto (${escapeHtml(startBr)}).</p>
      ${mhBlock}
      <p style="margin-top:24px;">
        <a href="${url}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
          Abrir relatorio completo
        </a>
      </p>
      ${renderFooter(content?.disclaimer, unsubscribeUrl)}
    </div>
  `;

  const text = `Ola ${userName},\n\nSeu relatorio semanal do Grindfy esta pronto (semana de ${startBr}).\n\nAbra em: ${url}\n\n${content?.disclaimer ?? ""}\n\nUnsubscribe: ${unsubscribeUrl}`;

  return { subject, html, text };
}
