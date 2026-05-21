// =============================================================================
// monthlyReportEmail — Sprint AI-2B / RF-07.3 (ADR-172)
// Sprint AI-3.1 / RF-04 (ADR-176) — migrado para `_renderReportShell`.
// =============================================================================

import { escapeHtml } from "./_helpers";
import { renderReportShell } from "./_renderReportShell";

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
  const url = `${baseUrl}/coach-ai/relatorio/${escapeHtml(reportId)}`;

  // @safe-html — ml passa por escapeHtml; restante eh literal.
  const safeBodyHtml = `<p>Resumo do mes ${escapeHtml(ml)}.</p>`;

  const shell = renderReportShell({
    userName,
    subject,
    intro: `Seu relatorio mensal do Grindfy esta pronto (${escapeHtml(ml)}).`,
    safeBodyHtml,
    ctaLabel: "Abrir relatorio completo",
    ctaUrl: url,
    disclaimer: content?.disclaimer,
    unsubscribeUrl,
  });

  return { subject, html: shell.html, text: shell.text };
}
