// =============================================================================
// Sprint AI-3 / RF-05.3 (ADR-174 §2.5) — server/emails/templates/_renderReportShell.ts
//
// Shell HTML compartilhado entre weeklyReportEmail / monthlyReportEmail /
// quarterlyReportEmail. Header + saudação + bodyHtml injetado + CTA + footer
// (disclaimer + unsubscribe).
//
// API:
//   renderReportShell({
//     userName, subject, intro, bodyHtml, ctaLabel, ctaUrl,
//     disclaimer?, unsubscribeUrl
//   }): { html: string, text: string }
//
// Cobre:
//   - HTML contém saudação "Olá ${userName}" escapada.
//   - HTML contém o bodyHtml literal interpolado (não escapado — é HTML já pronto).
//   - HTML contém CTA com href + label.
//   - HTML contém disclaimer + unsubscribe no footer.
//   - text equivalente sem tags.
//   - Escape XSS no userName (lesson #16 DOMPurify-safe).
//
// Status esperado: TODOS FALHAM (módulo não existe).
// =============================================================================

import { describe, it, expect } from "vitest";

describe("renderReportShell — shell comum HTML (RF-05.3)", () => {
  it("HTML inclui saudação 'Olá ${userName}' com XSS escape", async () => {
    const mod: any = await import("../../../server/emails/templates/_renderReportShell");
    const out = mod.renderReportShell({
      userName: "<script>alert(1)</script>",
      subject: "Seu relatorio",
      intro: "Seu relatorio mensal esta pronto.",
      bodyHtml: "<div>conteudo do miolo</div>",
      ctaLabel: "Abrir relatorio",
      ctaUrl: "https://app.grindfy.com/coach-ai/relatorio/rep-1",
      disclaimer: "Informativo. Nao substitui aconselhamento profissional.",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe?token=abc",
    });
    expect(out.html).toContain("Olá");
    // Escape: < e > viram &lt; e &gt;
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toMatch(/&lt;script&gt;/);
  });

  it("HTML interpola bodyHtml literalmente (não escapado — é HTML já pronto)", async () => {
    const mod: any = await import("../../../server/emails/templates/_renderReportShell");
    const out = mod.renderReportShell({
      userName: "Test",
      subject: "Test",
      intro: "Test intro.",
      bodyHtml: "<div data-testid='miolo'><h2>Miolo do email</h2></div>",
      ctaLabel: "Abrir",
      ctaUrl: "https://app.grindfy.com/coach-ai/relatorio/X",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe",
    });
    expect(out.html).toContain("<div data-testid='miolo'>");
    expect(out.html).toContain("<h2>Miolo do email</h2>");
  });

  it("HTML inclui CTA com href + label", async () => {
    const mod: any = await import("../../../server/emails/templates/_renderReportShell");
    const out = mod.renderReportShell({
      userName: "Test",
      subject: "Test",
      intro: "Test",
      bodyHtml: "",
      ctaLabel: "Abrir relatorio completo",
      ctaUrl: "https://app.grindfy.com/coach-ai/relatorio/rep-42",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe",
    });
    expect(out.html).toContain("https://app.grindfy.com/coach-ai/relatorio/rep-42");
    expect(out.html).toContain("Abrir relatorio completo");
  });

  it("HTML inclui disclaimer + unsubscribe no footer", async () => {
    const mod: any = await import("../../../server/emails/templates/_renderReportShell");
    const out = mod.renderReportShell({
      userName: "Test",
      subject: "Test",
      intro: "Test",
      bodyHtml: "",
      ctaLabel: "Abrir",
      ctaUrl: "https://app.grindfy.com/coach-ai/relatorio/X",
      disclaimer: "Disclaimer customizado aqui.",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe?token=xyz",
    });
    expect(out.html).toContain("Disclaimer customizado aqui.");
    expect(out.html).toContain("https://app.grindfy.com/unsubscribe?token=xyz");
    expect(out.html).toContain("unsubscribe");
  });

  it("text é versão plain-text (sem tags HTML)", async () => {
    const mod: any = await import("../../../server/emails/templates/_renderReportShell");
    const out = mod.renderReportShell({
      userName: "Bruno",
      subject: "Seu relatorio",
      intro: "Seu relatorio esta pronto.",
      bodyHtml: "<h2>Bla</h2><p>texto</p>",
      ctaLabel: "Abrir",
      ctaUrl: "https://app.grindfy.com/coach-ai/relatorio/X",
      disclaimer: "Disc",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe",
    });
    expect(typeof out.text).toBe("string");
    expect(out.text).toContain("Bruno");
    // Sem tags HTML cruas
    expect(out.text).not.toContain("<h2>");
    expect(out.text).not.toContain("</p>");
  });

  it("disclaimer opcional — undefined → renderiza sem quebrar", async () => {
    const mod: any = await import("../../../server/emails/templates/_renderReportShell");
    const out = mod.renderReportShell({
      userName: "Test",
      subject: "Test",
      intro: "Test",
      bodyHtml: "",
      ctaLabel: "Abrir",
      ctaUrl: "https://app.grindfy.com/coach-ai/relatorio/X",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe",
    });
    expect(typeof out.html).toBe("string");
    expect(out.html.length).toBeGreaterThan(0);
  });
});

describe("renderReportShell — templates específicos delegam (RF-05.3)", () => {
  it("quarterlyReportEmail produz HTML com mesmo shell base + miolo trimestral", async () => {
    const mod: any = await import("../../../server/emails/templates/quarterlyReportEmail");
    const out = mod.renderQuarterlyReportEmail({
      content: {
        periodStart: "2026-01-01",
        disclaimer: "Relatorio informativo. Consulte um contador para questoes fiscais.",
      },
      userName: "Alice",
      unsubscribeUrl: "https://app.grindfy.com/unsubscribe?token=alice",
      baseUrl: "https://app.grindfy.com",
      reportId: "rep-q-1",
    });
    expect(out.html).toContain("Alice");
    expect(out.html).toContain("rep-q-1");
    expect(out.html).toContain("unsubscribe");
    expect(out.html).toContain("Relatorio informativo");
    // Quarter label Q1/2026
    expect(out.html).toMatch(/Q1.*2026|2026.*Q1/);
  });
});
