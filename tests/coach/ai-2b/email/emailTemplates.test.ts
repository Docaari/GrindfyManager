// =============================================================================
// Sprint AI-2B / RF-07.3 (ADR-172 §2.5) — templates HTML weekly/monthly/quarterly
//
// Cobre:
//   - 3 templates renderizam { subject, html, text }.
//   - Subject patterns: weekly "Seu relatório semanal — semana de DD/MM",
//     monthly "Seu relatório mensal — Mês/AAAA", quarterly "Seu relatório trimestral — Q{N}/{ANO}".
//   - Footer inclui disclaimer regulatório (REPORT_DISCLAIMER — ADR-173).
//   - Unsubscribe link presente no footer.
//   - CTA link aponta para ${baseUrl}/coach-ai/relatorio/${reportId} (rota Wouter — lesson #19).
//   - Texto livre do user (mental hands) escapa HTML.
//
// Status esperado: TODOS FALHAM (templates não existem).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("renderWeeklyReportEmail", () => {
  it("retorna { subject, html, text } válidos", async () => {
    const { renderWeeklyReportEmail } = await import(
      "../../../../server/emails/templates/weeklyReportEmail"
    );
    const out = renderWeeklyReportEmail({
      content: {
        reportType: "weekly",
        periodStart: "2026-05-13",
        periodEnd: "2026-05-19",
        schemaVersion: 3,
        disclaimer: "Informativo — consulte profissional.",
      } as any,
      userName: "João",
      unsubscribeUrl: "https://app.grindfy.com/api/coach/email/unsubscribe?token=xyz",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-1",
    });
    expect(out.subject).toMatch(/semanal/i);
    expect(out.subject).toMatch(/13\/05/);
    expect(out.html).toContain("João");
    expect(out.text).toBeTruthy();
  });

  it("footer inclui disclaimer + unsubscribe", async () => {
    const { renderWeeklyReportEmail } = await import(
      "../../../../server/emails/templates/weeklyReportEmail"
    );
    const out = renderWeeklyReportEmail({
      content: {
        reportType: "weekly",
        periodStart: "2026-05-13",
        periodEnd: "2026-05-19",
        schemaVersion: 3,
        disclaimer: "DISCLAIMER_CANONICO",
      } as any,
      userName: "João",
      unsubscribeUrl: "https://app.grindfy.com/unsub",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-1",
    });
    expect(out.html).toContain("DISCLAIMER_CANONICO");
    expect(out.html).toContain("unsub");
  });

  it("CTA aponta para /coach-ai/relatorio/:id (rota Wouter registrada)", async () => {
    const { renderWeeklyReportEmail } = await import(
      "../../../../server/emails/templates/weeklyReportEmail"
    );
    const out = renderWeeklyReportEmail({
      content: { reportType: "weekly", periodStart: "2026-05-13", periodEnd: "2026-05-19", schemaVersion: 3 } as any,
      userName: "João",
      unsubscribeUrl: "https://x/u",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-42",
    });
    expect(out.html).toMatch(/\/coach-ai\/relatorio\/rep-42/);
  });

  it("escapa HTML do texto livre (mental hand snippets) — XSS protection", async () => {
    const { renderWeeklyReportEmail } = await import(
      "../../../../server/emails/templates/weeklyReportEmail"
    );
    const out = renderWeeklyReportEmail({
      content: {
        reportType: "weekly",
        periodStart: "2026-05-13",
        periodEnd: "2026-05-19",
        schemaVersion: 3,
        mentalHandHighlights: [
          {
            id: "mh-1",
            occurredAt: "2026-05-15",
            emotion: "tilt",
            situation: "<script>alert('xss')</script>",
            idealResponse: "fold",
          },
        ],
      } as any,
      userName: "Mallory",
      unsubscribeUrl: "https://x/u",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-1",
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toMatch(/&lt;script&gt;|&amp;lt;script/);
  });
});

describe("renderMonthlyReportEmail", () => {
  it("subject pattern 'mensal — Mês/AAAA'", async () => {
    const { renderMonthlyReportEmail } = await import(
      "../../../../server/emails/templates/monthlyReportEmail"
    );
    const out = renderMonthlyReportEmail({
      content: {
        reportType: "monthly",
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
        schemaVersion: 3,
      } as any,
      userName: "João",
      unsubscribeUrl: "https://x/u",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-2",
    });
    expect(out.subject).toMatch(/mensal/i);
    expect(out.subject).toMatch(/2026/);
  });
});

describe("renderQuarterlyReportEmail", () => {
  it("subject pattern 'trimestral — Q{N}/{ANO}'", async () => {
    const { renderQuarterlyReportEmail } = await import(
      "../../../../server/emails/templates/quarterlyReportEmail"
    );
    const out = renderQuarterlyReportEmail({
      content: {
        reportType: "quarterly",
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        schemaVersion: 3,
      } as any,
      userName: "João",
      unsubscribeUrl: "https://x/u",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-3",
    });
    expect(out.subject).toMatch(/trimestral/i);
    expect(out.subject).toMatch(/Q1\/2026|Q1.*2026/);
  });
});
