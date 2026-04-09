import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: FP-10 — Logica de exportacao de dados (CSV)
//
// Funcoes puras que formatam e constroem CSVs para export do dashboard:
//   - `formatCSVRow(data, headers)` — formata linha de CSV com escaping
//   - `buildCSVContent(headers, rows)` — monta CSV completo
//   - `getExportFilename(prefix, period, format)` — gera nome do arquivo
//   - `sanitizeForCSV(value)` — escapa caracteres especiais
//   - `getExportHeaders(tabType)` — retorna headers corretos por tab
//
// Modulo esperado: `client/src/lib/export-helpers.ts`
//
// Fonte de verdade: spec RF-09 (CSV), RF-11 (Tournament Library CSV)
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Stubs para compilacao — Implementer substituira
let formatCSVRow: (data: Record<string, any>, headers: string[]) => string;
let buildCSVContent: (headers: string[], rows: string[]) => string;
let getExportFilename: (prefix: string, period: string, format: 'csv' | 'png') => string;
let sanitizeForCSV: (value: any) => string;
let getExportHeaders: (tabType: string) => string[];

try {
  const mod = require('../../../client/src/lib/export-helpers');
  if (mod.formatCSVRow) formatCSVRow = mod.formatCSVRow;
  if (mod.buildCSVContent) buildCSVContent = mod.buildCSVContent;
  if (mod.getExportFilename) getExportFilename = mod.getExportFilename;
  if (mod.sanitizeForCSV) sanitizeForCSV = mod.sanitizeForCSV;
  if (mod.getExportHeaders) getExportHeaders = mod.getExportHeaders;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// sanitizeForCSV — escapa caracteres especiais para CSV
// ---------------------------------------------------------------------------

describe('sanitizeForCSV', () => {
  it('deve retornar string sem alteracao quando nao tem caracteres especiais', () => {
    expect(sanitizeForCSV('PokerStars')).toBe('PokerStars');
  });

  it('deve envolver em aspas quando contem virgula', () => {
    expect(sanitizeForCSV('PKO, Bounty')).toBe('"PKO, Bounty"');
  });

  it('deve escapar aspas duplas dobrando-as', () => {
    expect(sanitizeForCSV('Torneio "Elite"')).toBe('"Torneio ""Elite"""');
  });

  it('deve envolver em aspas quando contem quebra de linha', () => {
    const value = 'Linha 1\nLinha 2';
    const result = sanitizeForCSV(value);
    expect(result).toContain('"');
    expect(result).toContain('Linha 1');
  });

  it('deve converter numero para string', () => {
    expect(sanitizeForCSV(42.5)).toBe('42.5');
  });

  it('deve converter null/undefined para string vazia', () => {
    expect(sanitizeForCSV(null)).toBe('');
    expect(sanitizeForCSV(undefined)).toBe('');
  });

  it('deve tratar valor booleano', () => {
    expect(sanitizeForCSV(true)).toBe('true');
    expect(sanitizeForCSV(false)).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// formatCSVRow — formata uma linha de dados em CSV
// ---------------------------------------------------------------------------

describe('formatCSVRow', () => {
  it('deve formatar uma linha simples com valores alinhados aos headers', () => {
    const data = { Site: 'PokerStars', Torneios: 150, Profit: 2500 };
    const headers = ['Site', 'Torneios', 'Profit'];
    const result = formatCSVRow(data, headers);
    expect(result).toBe('PokerStars,150,2500');
  });

  it('deve escapar valores com virgula', () => {
    const data = { Site: 'GGPoker, Natural8', Torneios: 100 };
    const headers = ['Site', 'Torneios'];
    const result = formatCSVRow(data, headers);
    expect(result).toContain('"GGPoker, Natural8"');
  });

  it('deve usar string vazia para campos ausentes', () => {
    const data = { Site: 'PokerStars' };
    const headers = ['Site', 'Torneios', 'Profit'];
    const result = formatCSVRow(data, headers);
    expect(result).toBe('PokerStars,,');
  });
});

// ---------------------------------------------------------------------------
// buildCSVContent — monta CSV completo com BOM UTF-8
// ---------------------------------------------------------------------------

describe('buildCSVContent', () => {
  it('deve comecar com BOM UTF-8', () => {
    const content = buildCSVContent(['Col1'], ['val1']);
    expect(content.charCodeAt(0)).toBe(0xFEFF);
  });

  it('deve ter header na primeira linha apos BOM', () => {
    const content = buildCSVContent(['Site', 'Torneios'], ['PokerStars,150']);
    const lines = content.replace(/^\uFEFF/, '').split('\n');
    expect(lines[0]).toBe('Site,Torneios');
  });

  it('deve ter dados nas linhas subsequentes', () => {
    const headers = ['Site', 'ROI'];
    const rows = ['PokerStars,12.5', 'GGPoker,8.3'];
    const content = buildCSVContent(headers, rows);
    const lines = content.replace(/^\uFEFF/, '').split('\n');
    expect(lines[1]).toBe('PokerStars,12.5');
    expect(lines[2]).toBe('GGPoker,8.3');
  });

  it('deve terminar com newline', () => {
    const content = buildCSVContent(['A'], ['1']);
    expect(content.endsWith('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getExportFilename — gera nome do arquivo de export
// ---------------------------------------------------------------------------

describe('getExportFilename', () => {
  it('deve gerar nome no formato grindfy-[prefix]-[period].[format]', () => {
    const name = getExportFilename('dashboard', '2026-04', 'csv');
    expect(name).toBe('grindfy-dashboard-2026-04.csv');
  });

  it('deve funcionar com formato png', () => {
    const name = getExportFilename('site', '2026-04', 'png');
    expect(name).toBe('grindfy-site-2026-04.png');
  });

  it('deve sanitizar prefix com espacos para hifens', () => {
    const name = getExportFilename('by site', '2026-04', 'csv');
    expect(name).toBe('grindfy-by-site-2026-04.csv');
  });

  it('deve converter prefix para lowercase', () => {
    const name = getExportFilename('Biblioteca', '2026-04', 'csv');
    expect(name).toBe('grindfy-biblioteca-2026-04.csv');
  });

  it('deve aceitar period com formato YYYY-MM-DD', () => {
    const name = getExportFilename('dashboard', '2026-04-08', 'csv');
    expect(name).toBe('grindfy-dashboard-2026-04-08.csv');
  });
});

// ---------------------------------------------------------------------------
// getExportHeaders — retorna headers corretos por tipo de tab
// ---------------------------------------------------------------------------

describe('getExportHeaders', () => {
  it('deve retornar headers para tab "geral": Metrica, Valor', () => {
    const headers = getExportHeaders('geral');
    expect(headers).toEqual(['Metrica', 'Valor']);
  });

  it('deve retornar headers para tab "site": Site, Torneios, Profit, ROI%, ITM%', () => {
    const headers = getExportHeaders('site');
    expect(headers).toEqual(['Site', 'Torneios', 'Profit', 'ROI%', 'ITM%']);
  });

  it('deve retornar headers para tab "abi": Faixa, Torneios, Profit, ROI%', () => {
    const headers = getExportHeaders('abi');
    expect(headers).toEqual(['Faixa', 'Torneios', 'Profit', 'ROI%']);
  });

  it('deve retornar headers para tab "tipo": Categoria, Torneios, Profit, ROI%', () => {
    const headers = getExportHeaders('tipo');
    expect(headers).toEqual(['Categoria', 'Torneios', 'Profit', 'ROI%']);
  });

  it('deve retornar headers para tab "velocidade": Speed, Torneios, Profit, ROI%', () => {
    const headers = getExportHeaders('velocidade');
    expect(headers).toEqual(['Speed', 'Torneios', 'Profit', 'ROI%']);
  });

  it('deve retornar headers para tab "periodo": Mes, Torneios, Profit, ROI%', () => {
    const headers = getExportHeaders('periodo');
    expect(headers).toEqual(['Mes', 'Torneios', 'Profit', 'ROI%']);
  });

  it('deve retornar headers para tab "participantes": Faixa, Torneios, Profit, ROI%', () => {
    const headers = getExportHeaders('participantes');
    expect(headers).toEqual(['Faixa', 'Torneios', 'Profit', 'ROI%']);
  });

  it('deve retornar headers para tab "posicao": Posicao, Frequencia, Profit', () => {
    const headers = getExportHeaders('posicao');
    expect(headers).toEqual(['Posicao', 'Frequencia', 'Profit']);
  });

  it('deve retornar headers para tab "biblioteca": colunas completas de templates', () => {
    const headers = getExportHeaders('biblioteca');
    expect(headers).toEqual([
      'Nome', 'Site', 'Formato', 'Categoria', 'Velocidade',
      'ABI', 'ROI%', 'ITM%', 'Total Jogados', 'Profit', 'Confidence',
    ]);
  });

  it('deve retornar array vazio para tab desconhecida', () => {
    const headers = getExportHeaders('inexistente');
    expect(headers).toEqual([]);
  });
});
