import { describe, it, expect } from 'vitest';
import {
  projectRowForExport,
  getExportHeaders,
  formatCSVRow,
} from '../../../client/src/lib/export-helpers';

// =============================================================================
// Regressao 2026-08-01: o CSV do dashboard saia com cabecalho certo e TODAS as
// linhas em branco em 7 das 8 abas.
//
// `formatCSVRow(row, headers)` le `row[header]` — espera as chaves em portugues.
// As abas passavam a linha crua da API, com chave em ingles (`volume`, `roi`).
// `projectRowForExport` faz a ponte. Estes testes existem para o arquivo nunca
// mais sair vazio sem alguem perceber.
// =============================================================================

describe('projectRowForExport', () => {
  it('traduz a linha da aba Site para os rotulos do cabecalho', () => {
    const apiRow = { site: 'ACR', volume: 340, profit: 4200.5, buyins: 20000, roi: 21.5 };
    const projected = projectRowForExport(apiRow, 'site');
    expect(projected['Site']).toBe('ACR');
    expect(projected['Torneios']).toBe(340);
    expect(projected['Profit']).toBe(4200.5);
    expect(projected['ROI%']).toBe(21.5);
  });

  it('coluna sem campo correspondente vira vazia, nao "undefined"', () => {
    const projected = projectRowForExport({ site: 'GG', volume: 10 }, 'site');
    expect(projected['Profit']).toBe('');
  });

  it('mantem a aba Geral, que ja vem com as chaves finais', () => {
    const projected = projectRowForExport({ Metrica: 'ROI%', Valor: 12 }, 'geral');
    expect(projected).toEqual({ Metrica: 'ROI%', Valor: 12 });
  });

  it('aba desconhecida devolve a linha intacta', () => {
    const row = { qualquer: 1 };
    expect(projectRowForExport(row, 'inexistente')).toBe(row);
  });

  it('tolera linha nula sem quebrar o export inteiro', () => {
    expect(() => projectRowForExport(null as any, 'site')).not.toThrow();
  });
});

describe('linha final do CSV (projecao + formatacao)', () => {
  const cases: Array<[string, Record<string, any>, string]> = [
    ['site', { site: 'ACR', volume: 340, profit: 4200, roi: 21.5 }, 'ACR,340,4200,21.5'],
    ['tipo', { category: 'PKO', volume: 120, profit: -300, roi: -4.2 }, 'PKO,120,-300,-4.2'],
    ['velocidade', { speed: 'Turbo', volume: 88, profit: 150, roi: 3.1 }, 'Turbo,88,150,3.1'],
    ['abi', { buyinRange: '$21-$32', volume: 44, profit: 90, roi: 6 }, '$21-$32,44,90,6'],
    ['participantes', { fieldRange: '<100', volume: 61, profit: 12, roi: 1.5 }, '<100,61,12,1.5'],
  ];

  for (const [tabType, apiRow, expected] of cases) {
    it(`aba ${tabType} gera linha preenchida`, () => {
      const headers = getExportHeaders(tabType);
      const line = formatCSVRow(projectRowForExport(apiRow, tabType), headers);
      // Nunca pode ser so virgulas — era exatamente esse o bug.
      expect(line.replace(/,/g, '')).not.toBe('');
      expect(line.startsWith(expected)).toBe(true);
    });
  }

  it('aba de reentradas tem cabecalho e projecao proprios', () => {
    const headers = getExportHeaders('reentradas');
    expect(headers).toContain('Custo das reentradas');
    const line = formatCSVRow(
      projectRowForExport(
        { bucket: '1-reentrada', volume: 30, invested: 900, reentryCost: 450, profit: -120, roi: -13.3 },
        'reentradas',
      ),
      headers,
    );
    expect(line).toBe('1-reentrada,30,900,450,-120,-13.3');
  });
});
