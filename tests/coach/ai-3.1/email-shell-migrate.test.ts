// =============================================================================
// Sprint AI-3.1 / RF-04 — Weekly + Monthly email shell migrate
//
// MEDIUM-4 do reviewer AI-3: AI-3 criou `_renderReportShell` e migrou apenas
// quarterly. Weekly e Monthly continuam com header/CTA/footer inline (~70%
// duplicacao). Migrar ambos para `renderReportShell({...})`.
//
// Tambem: rename do parametro `bodyHtml` → `safeBodyHtml` no shell, com
// JSDoc `@safe-html` contract (caller MUST sanitize; sem DOMPurify server).
//
// Status esperado: TODOS FALHAM
//   - Weekly/Monthly chamam renderReportShell (hoje nao chamam — usam inline)
//   - Shell aceita `safeBodyHtml` (hoje aceita `bodyHtml`)
//
// CUIDADO LESSON #38: pode haver snapshot tests existentes em
// tests/coach/ai-2b/email/emailTemplates.test.ts que prendem o HTML inline
// atual. Apos RF-04, o HTML produzido pode mudar marginalmente (whitespace,
// ordem de footer). Implementer documenta no resumo.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RF-04 — renderReportShell aceita `safeBodyHtml` (rename)", () => {
  it("renderReportShell aceita campo `safeBodyHtml` no input", async () => {
    const mod: any = await import(
      "../../../server/emails/templates/_renderReportShell"
    );

    const out = mod.renderReportShell({
      userName: "Test",
      subject: "Test",
      intro: "Intro text.",
      safeBodyHtml: "<div data-testid='miolo'>contents</div>",
      ctaLabel: "Abrir",
      ctaUrl: "https://app.grindfy.com/coach-ai/relatorio/X",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe",
    });

    expect(out.html).toContain("<div data-testid='miolo'>contents</div>");
  });

  it("renderReportShell escapa userName (XSS) com `safeBodyHtml`", async () => {
    const mod: any = await import(
      "../../../server/emails/templates/_renderReportShell"
    );

    const out = mod.renderReportShell({
      userName: "<script>alert(1)</script>",
      subject: "Test",
      intro: "Intro.",
      safeBodyHtml: "<p>body</p>",
      ctaLabel: "Abrir",
      ctaUrl: "https://app.grindfy.com/X",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe",
    });

    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toMatch(/&lt;script&gt;/);
  });
});

describe("RF-04 — weeklyReportEmail migrate to renderReportShell", () => {
  it("weeklyReportEmail invoca renderReportShell internamente", async () => {
    const renderShellSpy = vi.fn(() => ({
      html: "<html-shell-stub />",
      text: "text-shell-stub",
    }));
    vi.doMock("../../../server/emails/templates/_renderReportShell", () => ({
      renderReportShell: renderShellSpy,
    }));

    const { renderWeeklyReportEmail } = await import(
      "../../../server/emails/templates/weeklyReportEmail"
    );

    renderWeeklyReportEmail({
      content: {
        periodStart: "2026-05-12",
        disclaimer: "Informativo.",
        mentalHandHighlights: [],
      },
      userName: "Ricardo",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe?token=abc",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-1",
    });

    expect(renderShellSpy).toHaveBeenCalledTimes(1);
    const args = renderShellSpy.mock.calls[0][0] as any;
    expect(args).toHaveProperty("safeBodyHtml");
    expect(typeof args.safeBodyHtml).toBe("string");
    expect(args.userName).toBe("Ricardo");
    expect(args.unsubscribeUrl).toContain("unsubscribe");
  });

  it("weeklyReportEmail retorna HTML do shell + subject", async () => {
    const renderShellSpy = vi.fn(() => ({
      html: "<html-shell>WEEKLY</html-shell>",
      text: "text-weekly",
    }));
    vi.doMock("../../../server/emails/templates/_renderReportShell", () => ({
      renderReportShell: renderShellSpy,
    }));

    const { renderWeeklyReportEmail } = await import(
      "../../../server/emails/templates/weeklyReportEmail"
    );

    const out = renderWeeklyReportEmail({
      content: { periodStart: "2026-05-12", disclaimer: "Disc." },
      userName: "Test",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-1",
    });

    expect(out.subject).toContain("semanal");
    expect(out.html).toContain("WEEKLY");
    expect(out.text).toBe("text-weekly");
  });
});

describe("RF-04 — monthlyReportEmail migrate to renderReportShell", () => {
  it("monthlyReportEmail invoca renderReportShell internamente", async () => {
    const renderShellSpy = vi.fn(() => ({
      html: "<html-shell-stub />",
      text: "text-shell-stub",
    }));
    vi.doMock("../../../server/emails/templates/_renderReportShell", () => ({
      renderReportShell: renderShellSpy,
    }));

    const { renderMonthlyReportEmail } = await import(
      "../../../server/emails/templates/monthlyReportEmail"
    );

    renderMonthlyReportEmail({
      content: { periodStart: "2026-04-01", disclaimer: "Informativo." },
      userName: "Ricardo",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe?token=abc",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-1",
    });

    expect(renderShellSpy).toHaveBeenCalledTimes(1);
    const args = renderShellSpy.mock.calls[0][0] as any;
    expect(args).toHaveProperty("safeBodyHtml");
    expect(args.userName).toBe("Ricardo");
  });

  it("monthlyReportEmail subject inclui month label PT-BR", async () => {
    const renderShellSpy = vi.fn(() => ({
      html: "<html-shell>MONTHLY</html-shell>",
      text: "text-monthly",
    }));
    vi.doMock("../../../server/emails/templates/_renderReportShell", () => ({
      renderReportShell: renderShellSpy,
    }));

    const { renderMonthlyReportEmail } = await import(
      "../../../server/emails/templates/monthlyReportEmail"
    );

    const out = renderMonthlyReportEmail({
      content: { periodStart: "2026-04-01", disclaimer: "Disc." },
      userName: "Test",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-1",
    });

    expect(out.subject).toContain("Abril");
    expect(out.subject).toContain("2026");
  });
});

describe("RF-04 — bodyHtml field NAO existe mais (rename completo)", () => {
  it("renderReportShell NAO usa o legacy `bodyHtml` (verifica que rename foi feito)", async () => {
    // Se RF-04 esta completo, passar `bodyHtml` em vez de `safeBodyHtml`
    // resulta em HTML sem o miolo. Testa a substituicao do nome do campo.
    const mod: any = await import(
      "../../../server/emails/templates/_renderReportShell"
    );

    const outLegacy = mod.renderReportShell({
      userName: "Test",
      subject: "Test",
      intro: "Intro.",
      bodyHtml: "<div>OLD_FIELD_NAME</div>", // campo deprecated
      ctaLabel: "X",
      ctaUrl: "https://x",
      unsubscribeUrl: "https://u",
    });

    // Pos-RF-04: campo `bodyHtml` (sem `safe` prefixo) NAO eh mais interpolado.
    // (Implementer pode preservar back-compat 1 sprint — se sim, ajustar este teste.)
    expect(outLegacy.html).not.toContain("OLD_FIELD_NAME");
  });
});
