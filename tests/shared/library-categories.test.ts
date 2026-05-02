import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / D13 — Categories enum hardcoded
//
// Spec: Docs/specs/biblioteca-spec-1.md D13
//
// Categorias ficam em codigo (NAO tabela DB no MVP). Cada categoria tem
// label PT-BR + cor + icone. Lessons referenciam categoryId obrigatorio.
//
// Modulo target: shared/library-categories.ts (AINDA NAO EXISTE)
// =============================================================================

import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_IDS,
  isValidLibraryCategoryId,
  getLibraryCategory,
  // @ts-expect-error - modulo nao existe ainda (red phase)
} from '../../shared/library-categories';

describe('LIBRARY_CATEGORY_IDS — enum D13', () => {
  it('deve incluir os 9 categoryIds da spec', () => {
    // Validar presenca individual (nao length — anti-pattern lesson #8)
    expect(LIBRARY_CATEGORY_IDS).toContain('performance_mental');
    expect(LIBRARY_CATEGORY_IDS).toContain('preflop');
    expect(LIBRARY_CATEGORY_IDS).toContain('postflop');
    expect(LIBRARY_CATEGORY_IDS).toContain('multiway');
    expect(LIBRARY_CATEGORY_IDS).toContain('icm_pre');
    expect(LIBRARY_CATEGORY_IDS).toContain('icm_pos');
    expect(LIBRARY_CATEGORY_IDS).toContain('final_table');
    expect(LIBRARY_CATEGORY_IDS).toContain('exploits');
    expect(LIBRARY_CATEGORY_IDS).toContain('special_formats');
  });
});

describe('LIBRARY_CATEGORIES — labels PT-BR', () => {
  it('cada categoria deve ter id + label + color + icon', () => {
    expect(Array.isArray(LIBRARY_CATEGORIES)).toBe(true);
    for (const cat of LIBRARY_CATEGORIES) {
      expect(cat).toHaveProperty('id');
      expect(cat).toHaveProperty('label');
      expect(cat).toHaveProperty('color');
      expect(cat).toHaveProperty('icon');
      expect(typeof cat.id).toBe('string');
      expect(typeof cat.label).toBe('string');
      expect(cat.label.length).toBeGreaterThan(0);
    }
  });

  it('todos os category ids devem aparecer em LIBRARY_CATEGORIES', () => {
    const ids = LIBRARY_CATEGORIES.map((c: any) => c.id);
    for (const id of LIBRARY_CATEGORY_IDS) {
      expect(ids).toContain(id);
    }
  });

  it('labels devem ser PT-BR (UI em portugues)', () => {
    const performanceMental = LIBRARY_CATEGORIES.find((c: any) => c.id === 'performance_mental');
    expect(performanceMental?.label).toMatch(/mental|performance/i);

    const finalTable = LIBRARY_CATEGORIES.find((c: any) => c.id === 'final_table');
    expect(finalTable?.label).toMatch(/mesa final/i);
  });
});

describe('isValidLibraryCategoryId', () => {
  it('deve retornar true para categoria valida', () => {
    expect(isValidLibraryCategoryId('performance_mental')).toBe(true);
    expect(isValidLibraryCategoryId('postflop')).toBe(true);
  });

  it('deve retornar false para categoria invalida', () => {
    expect(isValidLibraryCategoryId('nao_existe')).toBe(false);
    expect(isValidLibraryCategoryId('')).toBe(false);
    expect(isValidLibraryCategoryId('PERFORMANCE_MENTAL')).toBe(false); // case-sensitive
  });
});

describe('getLibraryCategory', () => {
  it('deve retornar categoria por id', () => {
    const cat = getLibraryCategory('icm_pre');
    expect(cat).toBeDefined();
    expect(cat?.id).toBe('icm_pre');
  });

  it('deve retornar undefined para id desconhecido', () => {
    expect(getLibraryCategory('inexistente')).toBeUndefined();
  });
});
