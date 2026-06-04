/**
 * Sprint biblioteca-administrar-dedup — Fatia 1 / RF-01 (RED phase).
 *
 * Helper puro NOVO `shared/library-canonical-key.ts` → `libraryCanonicalKey(entry)`.
 * AINDA NAO EXISTE — o Implementer vai cria-lo. Todos os testes devem FALHAR
 * (modulo inexistente → import quebra → red phase).
 *
 * Contrato (ADR-200 Parte A + spec Fatia 1 RF-01):
 *   key = `${site}|${dayOfWeek|"sem-dia"}|${timeBin|"sem-horario"}|${canonicalBuyIn}|${typePrimary}`
 *
 * REUSA (nao reimplementa):
 *   - canonicalBuyIn / typePrimary (via enrichTournamentTypeFields) de libraryGrouping.ts
 *   - timeBin2h de shared/time-bin.ts (derivado de `time` HH:MM → hora inteira → bin de 2h)
 *
 * Funcao PURA, deterministica, sem I/O, sem Date.now() (lesson #36).
 *
 * Os testes validam o CONTRATO observavel (igualdade/diferenca de keys + tokens),
 * NAO o nome do metodo interno chamado (lesson: testar comportamento, nao impl).
 */

import { describe, it, expect } from 'vitest';
// Import do modulo que AINDA NAO EXISTE — sera criado pelo Implementer.
import { libraryCanonicalKey } from '../../../shared/library-canonical-key';

/** Entry/planned-like minima relevante para a key canonica. */
interface CanonicalKeyEntry {
  name?: string | null;
  site?: string | null;
  buyIn?: string | number | null;
  time?: string | null;
  type?: string | null;
  speed?: string | null;
  dayOfWeek?: number | null;
  [key: string]: any;
}

function makeEntry(overrides: Partial<CanonicalKeyEntry> = {}): CanonicalKeyEntry {
  return {
    name: 'Daily Special',
    site: 'PokerStars',
    buyIn: '22',
    time: '19:00',
    type: 'Vanilla',
    speed: 'Normal',
    dayOfWeek: 0,
    ...overrides,
  };
}

describe('libraryCanonicalKey — formato e determinismo', () => {
  it('retorna string com 5 componentes separados por pipe', () => {
    const key = libraryCanonicalKey(makeEntry());
    expect(typeof key).toBe('string');
    expect(key.split('|')).toHaveLength(5);
  });

  it('e deterministica — mesma entry N vezes → mesma key', () => {
    const entry = makeEntry();
    const k1 = libraryCanonicalKey(entry);
    const k2 = libraryCanonicalKey(entry);
    const k3 = libraryCanonicalKey({ ...entry });
    expect(k1).toBe(k2);
    expect(k2).toBe(k3);
  });

  it('inclui o site como primeiro componente', () => {
    const key = libraryCanonicalKey(makeEntry({ site: 'GGPoker' }));
    expect(key.split('|')[0]).toBe('GGPoker');
  });

  it('site ausente/null → token "Unknown"', () => {
    const key = libraryCanonicalKey(makeEntry({ site: null }));
    expect(key.split('|')[0]).toBe('Unknown');
  });
});

describe('libraryCanonicalKey — type na key (PKO ≠ Vanilla)', () => {
  it('PKO e Vanilla no mesmo (site, dia, hora, buyIn) → keys DIFERENTES', () => {
    const pko = libraryCanonicalKey(makeEntry({ type: 'PKO' }));
    const vanilla = libraryCanonicalKey(makeEntry({ type: 'Vanilla' }));
    expect(pko).not.toBe(vanilla);
  });

  it('type=null resolve para Vanilla (typePrimary default) — casa com Vanilla real', () => {
    const nullType = libraryCanonicalKey(makeEntry({ type: null }));
    const vanilla = libraryCanonicalKey(makeEntry({ type: 'Vanilla' }));
    expect(nullType).toBe(vanilla);
  });

  it('Mystery e PKO no mesmo slot → keys diferentes', () => {
    const mystery = libraryCanonicalKey(makeEntry({ type: 'Mystery' }));
    const pko = libraryCanonicalKey(makeEntry({ type: 'PKO' }));
    expect(mystery).not.toBe(pko);
  });

  it('typePrimary eleva via nome (Satellite detectado no nome com type=null)', () => {
    // enrichTournamentTypeFields eleva Vanilla→Satellite quando o nome bate.
    const satByName = libraryCanonicalKey(
      makeEntry({ name: 'Sunday Satellite to Main', type: null }),
    );
    const vanilla = libraryCanonicalKey(makeEntry({ name: 'Sunday Regular', type: 'Vanilla' }));
    expect(satByName).not.toBe(vanilla);
  });
});

describe('libraryCanonicalKey — canonicalBuyIn (snap ±3%)', () => {
  it('$21.60 e $22 no mesmo slot → MESMA key (snap de fee)', () => {
    const k1 = libraryCanonicalKey(makeEntry({ buyIn: '21.60' }));
    const k2 = libraryCanonicalKey(makeEntry({ buyIn: '22' }));
    expect(k1).toBe(k2);
  });

  it('$5 e $500 no mesmo slot → keys DIFERENTES', () => {
    const k5 = libraryCanonicalKey(makeEntry({ buyIn: '5' }));
    const k500 = libraryCanonicalKey(makeEntry({ buyIn: '500' }));
    expect(k5).not.toBe(k500);
  });

  it('aceita buyIn numerico e string equivalentes → mesma key', () => {
    const kNum = libraryCanonicalKey(makeEntry({ buyIn: 22 }));
    const kStr = libraryCanonicalKey(makeEntry({ buyIn: '22' }));
    expect(kNum).toBe(kStr);
  });

  it('buyIn invalido (vazio/simbolo) → canonicalBuyIn=0, nao derruba', () => {
    expect(() => libraryCanonicalKey(makeEntry({ buyIn: 'abc' }))).not.toThrow();
    const key = libraryCanonicalKey(makeEntry({ buyIn: 'abc' }));
    // componente de buy-in (4o) deve ser "0" para entrada invalida
    expect(key.split('|')[3]).toBe('0');
  });

  it('buyIn null → canonicalBuyIn=0', () => {
    const key = libraryCanonicalKey(makeEntry({ buyIn: null }));
    expect(key.split('|')[3]).toBe('0');
  });
});

describe('libraryCanonicalKey — timeBin derivado de `time` HH:MM (bins de 2h)', () => {
  it('"19:00" e "19:30" caem no MESMO timeBin de 2h → mesma key', () => {
    const k1 = libraryCanonicalKey(makeEntry({ time: '19:00' }));
    const k2 = libraryCanonicalKey(makeEntry({ time: '19:30' }));
    expect(k1).toBe(k2);
  });

  it('"19:00" e "21:00" caem em bins DIFERENTES → keys diferentes', () => {
    const k19 = libraryCanonicalKey(makeEntry({ time: '19:00' }));
    const k21 = libraryCanonicalKey(makeEntry({ time: '21:00' }));
    expect(k19).not.toBe(k21);
  });

  it('"19:00" deriva o bin "18-20" via timeBin2h(19)', () => {
    const key = libraryCanonicalKey(makeEntry({ time: '19:00' }));
    expect(key.split('|')[2]).toBe('18-20');
  });

  it('time=null → timeBin = "sem-horario"', () => {
    const key = libraryCanonicalKey(makeEntry({ time: null }));
    expect(key.split('|')[2]).toBe('sem-horario');
  });

  it('time invalido ("abc") → timeBin = "sem-horario"', () => {
    const key = libraryCanonicalKey(makeEntry({ time: 'abc' }));
    expect(key.split('|')[2]).toBe('sem-horario');
  });

  it('duas entries sem horario no mesmo slot → MESMA key', () => {
    const k1 = libraryCanonicalKey(makeEntry({ time: null }));
    const k2 = libraryCanonicalKey(makeEntry({ time: undefined }));
    expect(k1).toBe(k2);
  });
});

describe('libraryCanonicalKey — dayOfWeek (null → "sem-dia")', () => {
  it('dayOfWeek=null → componente "sem-dia"', () => {
    const key = libraryCanonicalKey(makeEntry({ dayOfWeek: null }));
    expect(key.split('|')[1]).toBe('sem-dia');
  });

  it('duas entries dayOfWeek=null no mesmo slot → MESMA key (token "sem-dia")', () => {
    const k1 = libraryCanonicalKey(makeEntry({ dayOfWeek: null }));
    const k2 = libraryCanonicalKey(makeEntry({ dayOfWeek: null }));
    expect(k1).toBe(k2);
  });

  it('entry com dia (0) e entry sem dia (null) no mesmo slot → keys DIFERENTES (isoladas)', () => {
    const comDia = libraryCanonicalKey(makeEntry({ dayOfWeek: 0 }));
    const semDia = libraryCanonicalKey(makeEntry({ dayOfWeek: null }));
    expect(comDia).not.toBe(semDia);
  });

  it('dias distintos (Dom=0 vs Sab=6) no mesmo slot → keys diferentes', () => {
    const dom = libraryCanonicalKey(makeEntry({ dayOfWeek: 0 }));
    const sab = libraryCanonicalKey(makeEntry({ dayOfWeek: 6 }));
    expect(dom).not.toBe(sab);
  });

  it('dayOfWeek=0 (Domingo) usa o literal "0" na key', () => {
    const key = libraryCanonicalKey(makeEntry({ dayOfWeek: 0 }));
    expect(key.split('|')[1]).toBe('0');
  });
});

describe('libraryCanonicalKey — speed FORA da key (so aviso)', () => {
  it('Speed Normal vs Hyper no mesmo slot → MESMA key (speed nao entra)', () => {
    const normal = libraryCanonicalKey(makeEntry({ speed: 'Normal' }));
    const hyper = libraryCanonicalKey(makeEntry({ speed: 'Hyper' }));
    expect(normal).toBe(hyper);
  });

  it('Speed Turbo vs Normal no mesmo slot → MESMA key', () => {
    const turbo = libraryCanonicalKey(makeEntry({ speed: 'Turbo' }));
    const normal = libraryCanonicalKey(makeEntry({ speed: 'Normal' }));
    expect(turbo).toBe(normal);
  });
});

describe('libraryCanonicalKey — nameSignature FORA da key (Fatia 1)', () => {
  it('nomes diferentes (mesmo site/dia/hora/buyIn/type) → MESMA key (name nao entra)', () => {
    // "Sunday Million" vs "Sunday Million Day 1A" — name fora da key da Fatia 1;
    // a classificacao "Duplicata vs Parecidos" e da Fatia 3, nao da key.
    const k1 = libraryCanonicalKey(makeEntry({ name: 'Sunday Million' }));
    const k2 = libraryCanonicalKey(makeEntry({ name: 'Sunday Million Day 1A' }));
    expect(k1).toBe(k2);
  });
});
