import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — Lesson tokenizer
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-06 endpoint /top-lessons)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
//
// Modulo NAO existe ainda — Implementer cria em:
//   server/services/lessonTokenizer.ts
//
// Contrato:
//   tokenizeLessons(lessons: string[]): { token: string; count: number }[]
//
// Regras:
//   - palavras > 3 caracteres
//   - lowercase
//   - dedupe stopwords PT-BR (de, em, com, para, que, uma, etc.)
//   - sem PII (nao retorna texto livre, so tokens agregados)
//   - top 30 ordenados por count DESC
// =============================================================================

import { tokenizeLessons } from '../../../server/services/lessonTokenizer';

describe('tokenizeLessons - shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof tokenizeLessons).toBe('function');
  });

  it('retorna array vazio quando input vazio', () => {
    expect(tokenizeLessons([])).toEqual([]);
  });

  it('retorna array vazio quando todas as licoes sao vazias', () => {
    expect(tokenizeLessons(['', '   ', ''])).toEqual([]);
  });
});

describe('tokenizeLessons - regras de tokenizacao', () => {
  it('filtra palavras com 3 ou menos caracteres', () => {
    const result = tokenizeLessons(['ICM ok mas paciencia']);
    const tokens = result.map((r) => r.token);
    // 'ok' (2 chars) e 'mas' (3 chars) excluidos; 'ICM' (3 chars) excluido tambem
    // 'paciencia' permanece
    expect(tokens).toContain('paciencia');
    expect(tokens).not.toContain('ok');
    expect(tokens).not.toContain('mas');
  });

  it('lowercase obrigatorio', () => {
    const result = tokenizeLessons(['Paciencia em ICM duro']);
    const tokens = result.map((r) => r.token);
    expect(tokens).toContain('paciencia');
    expect(tokens).not.toContain('Paciencia');
  });

  it('exclui stopwords PT-BR (de, em, com, para, que, uma, mais, este, esta, sobre)', () => {
    const result = tokenizeLessons([
      'paciencia para com este spot que tem mais valor sobre uma esta',
    ]);
    const tokens = result.map((r) => r.token);
    expect(tokens).not.toContain('para');
    expect(tokens).not.toContain('com');
    expect(tokens).not.toContain('este');
    expect(tokens).not.toContain('esta');
    expect(tokens).not.toContain('uma');
    expect(tokens).not.toContain('mais');
    expect(tokens).not.toContain('sobre');
    expect(tokens).not.toContain('que');
    expect(tokens).toContain('paciencia');
    expect(tokens).toContain('valor');
  });

  it('agrega ocorrencias de mesma palavra entre licoes', () => {
    const result = tokenizeLessons([
      'paciencia em ICM',
      'ter mais paciencia',
      'paciencia e foco',
    ]);
    const paciencia = result.find((r) => r.token === 'paciencia');
    expect(paciencia?.count).toBe(3);
  });

  it('ordena por count DESC', () => {
    const result = tokenizeLessons([
      'paciencia paciencia paciencia',
      'foco foco',
      'volume',
    ]);
    expect(result[0].token).toBe('paciencia');
    expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
  });
});

describe('tokenizeLessons - top 30 limit', () => {
  it('limita resultado em top 30 tokens', () => {
    // Gera 50 palavras unicas com 5+ chars
    const lessons: string[] = [];
    for (let i = 0; i < 50; i++) {
      lessons.push(`palavra${String(i).padStart(3, '0')}`);
    }
    const result = tokenizeLessons(lessons);
    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe('tokenizeLessons - sem PII', () => {
  it('output contem apenas tokens (palavras), nao frases completas', () => {
    const result = tokenizeLessons([
      'paciencia em ICM ruim contra fish exploitavel',
    ]);
    for (const item of result) {
      expect(item.token.includes(' ')).toBe(false);
    }
  });

  it('shape do retorno: {token: string, count: number}', () => {
    const result = tokenizeLessons(['paciencia paciencia']);
    expect(result[0]).toHaveProperty('token');
    expect(result[0]).toHaveProperty('count');
    expect(typeof result[0].token).toBe('string');
    expect(typeof result[0].count).toBe('number');
  });
});
