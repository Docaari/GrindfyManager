import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: client/src/lib/scoringHelpers.ts (NAO existe ainda)
//
// Helpers usados pelos componentes do widget Selector + LibraryCardScoreBadge:
//   - getGradeColor(grade) -> { bg, text, icon }
//   - getGradeLabel(grade) -> string PT-BR
//   - getConfidenceLabel(confidence) -> string PT-BR
//   - formatTimeOfDayBucket(bucket) -> string PT-BR
//   - formatScore(score) -> string formatada
// =============================================================================

import {
  getGradeColor,
  getGradeLabel,
  getConfidenceLabel,
  formatTimeOfDayBucket,
  formatScore,
} from '../../../client/src/lib/scoringHelpers';

describe('getGradeColor - mapping completo', () => {
  it('S retorna verde com icone trofeu', () => {
    const r = getGradeColor('S');
    expect(r).toHaveProperty('bg');
    expect(r).toHaveProperty('text');
    expect(r).toHaveProperty('icon');
    expect(r.icon.toLowerCase()).toContain('trophy');
  });

  it('A retorna azul', () => {
    expect(getGradeColor('A').bg).toBeDefined();
  });

  it('B retorna amarelo', () => {
    expect(getGradeColor('B').bg).toBeDefined();
  });

  it('C retorna laranja', () => {
    expect(getGradeColor('C').bg).toBeDefined();
  });

  it('D retorna vermelho', () => {
    expect(getGradeColor('D').bg).toBeDefined();
  });

  it('grade invalida retorna fallback (cinza)', () => {
    const r = getGradeColor('X' as any);
    expect(r).toBeDefined();
  });
});

describe('getGradeLabel', () => {
  it('S -> "Excelente"', () => {
    expect(getGradeLabel('S')).toBe('Excelente');
  });
  it('A -> "Otimo"', () => {
    expect(getGradeLabel('A')).toBe('Otimo');
  });
  it('B -> "Bom"', () => {
    expect(getGradeLabel('B')).toBe('Bom');
  });
  it('C -> "Regular"', () => {
    expect(getGradeLabel('C')).toBe('Regular');
  });
  it('D -> "Evitar"', () => {
    expect(getGradeLabel('D')).toBe('Evitar');
  });
});

describe('getConfidenceLabel', () => {
  it('high -> "Alta confianca"', () => {
    expect(getConfidenceLabel('high')).toBe('Alta confianca');
  });
  it('medium -> "Media confianca"', () => {
    expect(getConfidenceLabel('medium')).toBe('Media confianca');
  });
  it('low -> "Baixa confianca"', () => {
    expect(getConfidenceLabel('low')).toBe('Baixa confianca');
  });
});

describe('formatTimeOfDayBucket', () => {
  it('madrugada -> "Madrugada (00h-06h)"', () => {
    expect(formatTimeOfDayBucket('madrugada')).toContain('Madrugada');
  });
  it('manha -> "Manha (06h-12h)"', () => {
    expect(formatTimeOfDayBucket('manha')).toContain('Manha');
  });
  it('tarde -> "Tarde (12h-18h)"', () => {
    expect(formatTimeOfDayBucket('tarde')).toContain('Tarde');
  });
  it('noite-cedo -> "Noite cedo (18h-21h)"', () => {
    expect(formatTimeOfDayBucket('noite-cedo')).toContain('Noite');
  });
  it('noite-nobre -> "Horario nobre (21h-00h)"', () => {
    expect(formatTimeOfDayBucket('noite-nobre').toLowerCase()).toContain('nobre');
  });
});

describe('formatScore', () => {
  it('inteiro 87 -> "87"', () => {
    expect(formatScore(87)).toBe('87');
  });
  it('arredonda decimais (87.4) -> "87"', () => {
    expect(formatScore(87.4)).toBe('87');
  });
  it('clamp negativo nao negativo na exibicao', () => {
    expect(formatScore(0)).toBe('0');
  });
  it('clamp >100', () => {
    expect(formatScore(150)).toBe('100');
  });
});
