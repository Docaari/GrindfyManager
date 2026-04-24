import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: server/scoring/timeOfDayBucket.ts (NAO existe ainda)
//
// Funcao pura `getTimeOfDayBucket(hhmm: string): TimeOfDayBucket` que mapeia
// um horario "HH:mm" para o bucket de turno conforme spec RF-06:
//
//   madrugada    00:00 - 05:59
//   manha        06:00 - 11:59
//   tarde        12:00 - 17:59
//   noite-cedo   18:00 - 20:59
//   noite-nobre  21:00 - 23:59
// =============================================================================

import { getTimeOfDayBucket } from '../../../server/scoring/timeOfDayBucket';

describe('getTimeOfDayBucket - madrugada (00:00 - 05:59)', () => {
  it('00:00 -> madrugada', () => {
    expect(getTimeOfDayBucket('00:00')).toBe('madrugada');
  });
  it('03:30 -> madrugada', () => {
    expect(getTimeOfDayBucket('03:30')).toBe('madrugada');
  });
  it('05:59 -> madrugada (boundary)', () => {
    expect(getTimeOfDayBucket('05:59')).toBe('madrugada');
  });
});

describe('getTimeOfDayBucket - manha (06:00 - 11:59)', () => {
  it('06:00 -> manha (boundary inferior)', () => {
    expect(getTimeOfDayBucket('06:00')).toBe('manha');
  });
  it('09:15 -> manha', () => {
    expect(getTimeOfDayBucket('09:15')).toBe('manha');
  });
  it('11:59 -> manha (boundary superior)', () => {
    expect(getTimeOfDayBucket('11:59')).toBe('manha');
  });
});

describe('getTimeOfDayBucket - tarde (12:00 - 17:59)', () => {
  it('12:00 -> tarde (boundary inferior)', () => {
    expect(getTimeOfDayBucket('12:00')).toBe('tarde');
  });
  it('15:00 -> tarde', () => {
    expect(getTimeOfDayBucket('15:00')).toBe('tarde');
  });
  it('17:59 -> tarde (boundary superior — off-by-one critico)', () => {
    expect(getTimeOfDayBucket('17:59')).toBe('tarde');
  });
});

describe('getTimeOfDayBucket - noite-cedo (18:00 - 20:59)', () => {
  it('18:00 -> noite-cedo (boundary apos tarde)', () => {
    expect(getTimeOfDayBucket('18:00')).toBe('noite-cedo');
  });
  it('19:30 -> noite-cedo', () => {
    expect(getTimeOfDayBucket('19:30')).toBe('noite-cedo');
  });
  it('20:59 -> noite-cedo (boundary superior — off-by-one critico)', () => {
    expect(getTimeOfDayBucket('20:59')).toBe('noite-cedo');
  });
});

describe('getTimeOfDayBucket - noite-nobre (21:00 - 23:59)', () => {
  it('21:00 -> noite-nobre (boundary apos noite-cedo)', () => {
    expect(getTimeOfDayBucket('21:00')).toBe('noite-nobre');
  });
  it('22:30 -> noite-nobre', () => {
    expect(getTimeOfDayBucket('22:30')).toBe('noite-nobre');
  });
  it('23:59 -> noite-nobre (ultimo do dia)', () => {
    expect(getTimeOfDayBucket('23:59')).toBe('noite-nobre');
  });
});

describe('getTimeOfDayBucket - inputs invalidos', () => {
  it('formato invalido lanca ou retorna null', () => {
    // Implementer escolhe; preferencia por throw em invalido para nao mascarar bug
    expect(() => getTimeOfDayBucket('25:00')).toThrow();
  });

  it('string vazia lanca', () => {
    expect(() => getTimeOfDayBucket('')).toThrow();
  });

  it('formato sem :  lanca', () => {
    expect(() => getTimeOfDayBucket('1700')).toThrow();
  });
});

describe('getTimeOfDayBucket - cobertura total', () => {
  it('todas as 24 horas mapeadas para algum bucket valido', () => {
    const valids = ['madrugada', 'manha', 'tarde', 'noite-cedo', 'noite-nobre'];
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, '0');
      const bucket = getTimeOfDayBucket(`${hh}:00`);
      expect(valids).toContain(bucket);
    }
  });
});
