// =============================================================================
// weeklyReportEmail — Sprint AI-2B / RF-07.3 (ADR-172)
// Sprint AI-3.1 / RF-04 (ADR-176) — migrado para `_renderReportShell`.
// =============================================================================

import { escapeHtml, formatBrDate } from "./_helpers";
import { renderReportShell } from "./_renderReportShell";

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
  // @safe-html — todos os campos de user-content passam por escapeHtml; o resto
  // eh literal de template (safe by construction).
  const safeBodyHtml = mhItems.length
    ? `<h3>Mental Hand Highlights</h3><ul>${mhItems.join("")}</ul>`
    : "";

  const shell = renderReportShell({
    userName,
    subject,
    intro: `Seu relatorio semanal do Grindfy esta pronto (${escapeHtml(startBr)}).`,
    safeBodyHtml,
    ctaLabel: "Abrir relatorio completo",
    ctaUrl: url,
    disclaimer: content?.disclaimer,
    unsubscribeUrl,
  });

  return { subject, html: shell.html, text: shell.text };
}
