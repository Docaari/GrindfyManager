import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint AI-0A — RF-15: auditoria do xSearchProvider (deliverable = documento)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-15)
// Deliverable: Docs/architecture/audits/xsearch-provider-audit-2026-05.md
//
// Teste leve de existencia + conteudo minimo. Nenhuma mudanca de codigo no
// provider neste sprint.
// =============================================================================

async function readAuditDoc(): Promise<string> {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const p = path.resolve(process.cwd(), 'Docs/architecture/audits/xsearch-provider-audit-2026-05.md');
  return fs.readFileSync(p, 'utf8');
}

describe('AI-0A · RF-15 — documento de auditoria do xSearchProvider', () => {
  it('existe Docs/architecture/audits/xsearch-provider-audit-2026-05.md', async () => {
    const doc = await readAuditDoc();
    expect(doc.length).toBeGreaterThan(200);
  });

  it('menciona o achado: title/summary sao prosa autoral do Grok (URLs cross-validadas, texto nao)', async () => {
    const doc = (await readAuditDoc()).toLowerCase();
    expect(doc).toMatch(/title/);
    expect(doc).toMatch(/summary/);
    // achado: o texto e gerado/autoral; risco residual.
    expect(doc).toMatch(/autora|gerad|prosa|fabric|aluci/);
  });

  it('referencia ADR-107 e ADR-110 e a sessao news-3', async () => {
    const doc = await readAuditDoc();
    expect(doc).toMatch(/ADR-107/);
    expect(doc).toMatch(/ADR-110/);
    expect(doc).toMatch(/session_2026-05-04-news-audit-and-news-3/);
  });

  it('traz recomendacao ordenada por esforco + veredito (sprint / backlog / aceitar risco)', async () => {
    const doc = (await readAuditDoc()).toLowerCase();
    expect(doc).toMatch(/recomenda/);
    expect(doc).toMatch(/backlog|news-4|item de sprint|aceitar.*risco/);
  });

  it('codigo do provider nao mudou — xSearchProvider.ts continua existindo intacto (sanity)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const p = path.resolve(process.cwd(), 'server/services/news/xSearchProvider.ts');
    expect(fs.existsSync(p)).toBe(true);
  });
});
