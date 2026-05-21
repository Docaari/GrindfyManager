// =============================================================================
// quarterlyReportEmail — Sprint AI-2B / RF-07.3 (ADR-172)
// Sprint AI-3 / RF-05.3 (ADR-174) — usa _renderReportShell.
// =============================================================================

import { escapeHtml } from "./_helpers";
import { renderReportShell } from "./_renderReportShell";

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
  const url = `${baseUrl}/coach-ai/relatorio/${escapeHtml(reportId)}`;

  // Miolo do email: nota do trimestre (label + quarter).
  // @safe-html — escapeHtml ja sanitiza ql; texto literal eh safe by construction.
  const safeBodyHtml = `<p>Resumo do trimestre ${escapeHtml(ql)}.</p>`;

  const shell = renderReportShell({
    userName,
    subject,
    intro: `Seu relatorio trimestral do Grindfy esta pronto (${ql}).`,
    safeBodyHtml,
    ctaLabel: "Abrir relatorio completo",
    ctaUrl: url,
    disclaimer: content?.disclaimer,
    unsubscribeUrl,
  });

  return { subject, html: shell.html, text: shell.text };
}
