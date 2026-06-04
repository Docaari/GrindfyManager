/**
 * Sprint biblioteca-administrar-dedup — Fatia 1 / RF-03 (RED phase).
 *
 * Migra `filterNewTournaments` (shared/library-dedup.ts) da key
 * `(name.toLowerCase, site, buyIn)` — que IGNORA `time` — para a key canonica
 * `libraryCanonicalKey`, preservando o curto-circuito por `externalId`.
 *
 * Contrato (ADR-200 §filterNewTournaments + spec Fatia 1 RF-03):
 *   - externalId nao-nulo casando existente → duplicata (curto-circuito Suprema).
 *   - sem externalId → comparar por libraryCanonicalKey (NAO mais name+site+buyIn
 *     ignorando time).
 *   - comparar contra ativos E trashed (nao re-importa trashed — D5).
 *
 * MUDANCAS observaveis vs comportamento atual:
 *   - difere SO no `time` (timeBin diferente) → tratado como DIFERENTE (antes:
 *     mesclava errado porque ignorava time).
 *   - PKO vs Vanilla no mesmo slot → diferentes (type entra na key).
 *   - $21.60 vs $22 no mesmo slot → iguais (snap de buy-in).
 *
 * Incoming/existing carregam os campos canonicos (time, type, dayOfWeek) alem
 * dos antigos (name, site, buyIn, externalId, deletedAt).
 *
 * Estes testes definem o comportamento NOVO; vao falhar ate a migracao.
 */

import { describe, it, expect } from 'vitest';
import { filterNewTournaments } from '../../../shared/library-dedup';

function makeIncoming(overrides: Record<string, any> = {}): any {
  return {
    name: 'Daily Special',
    site: 'GGPoker',
    buyIn: '22',
    time: '19:00',
    type: 'Vanilla',
    dayOfWeek: 0,
    externalId: null,
    source: 'grind-live',
    ...overrides,
  };
}

function makeExisting(overrides: Record<string, any> = {}): any {
  return {
    id: 'lib-001',
    name: 'Daily Special',
    site: 'GGPoker',
    buyIn: '22',
    time: '19:00',
    type: 'Vanilla',
    dayOfWeek: 0,
    externalId: null,
    deletedAt: null,
    userId: 'USER-0001',
    ...overrides,
  };
}

describe('filterNewTournaments (canonica) — curto-circuito por externalId', () => {
  it('externalId duplicado → filtrado (curto-circuito Suprema)', () => {
    const incoming = [makeIncoming({ name: 'T1', externalId: 'suprema-100' })];
    const existing = [makeExisting({ externalId: 'suprema-100' })];
    expect(filterNewTournaments(incoming, existing)).toHaveLength(0);
  });

  it('externalId distinto e key canonica distinta → mantido', () => {
    const incoming = [
      makeIncoming({ name: 'Novo', externalId: 'suprema-999', site: 'PartyPoker', buyIn: '5' }),
    ];
    const existing = [makeExisting({ externalId: 'suprema-100' })];
    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Novo');
  });

  it('externalId null em ambos → NAO casa por id (cai na key canonica)', () => {
    // ambos sem externalId, mas keys canonicas DIFERENTES (sites diferentes) → mantido
    const incoming = [makeIncoming({ externalId: null, site: 'PartyPoker' })];
    const existing = [makeExisting({ externalId: null, site: 'GGPoker' })];
    expect(filterNewTournaments(incoming, existing)).toHaveLength(1);
  });
});

describe('filterNewTournaments (canonica) — respeita `time` via timeBin', () => {
  it('import que difere SO no time (bin diferente) → tratado como DIFERENTE (mantido)', () => {
    const incoming = [makeIncoming({ time: '21:00' })]; // bin 20-22
    const existing = [makeExisting({ time: '19:00' })]; // bin 18-20
    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(1);
  });

  it('import no MESMO bin de 2h (19:30 vs 19:00) → duplicata (filtrado)', () => {
    const incoming = [makeIncoming({ time: '19:30' })];
    const existing = [makeExisting({ time: '19:00' })];
    expect(filterNewTournaments(incoming, existing)).toHaveLength(0);
  });
});

describe('filterNewTournaments (canonica) — type e buy-in snap na key', () => {
  it('PKO incoming vs Vanilla existente no mesmo slot → DIFERENTE (mantido)', () => {
    const incoming = [makeIncoming({ type: 'PKO' })];
    const existing = [makeExisting({ type: 'Vanilla' })];
    expect(filterNewTournaments(incoming, existing)).toHaveLength(1);
  });

  it('$21.60 incoming vs $22 existente no mesmo slot → duplicata (snap, filtrado)', () => {
    const incoming = [makeIncoming({ buyIn: '21.60' })];
    const existing = [makeExisting({ buyIn: '22' })];
    expect(filterNewTournaments(incoming, existing)).toHaveLength(0);
  });

  it('$5 incoming vs $500 existente no mesmo slot → DIFERENTE (mantido)', () => {
    const incoming = [makeIncoming({ buyIn: '5' })];
    const existing = [makeExisting({ buyIn: '500' })];
    expect(filterNewTournaments(incoming, existing)).toHaveLength(1);
  });
});

describe('filterNewTournaments (canonica) — trashed conta como existente (D5)', () => {
  it('casa entry trashed por key canonica → filtrado (nao re-importa)', () => {
    const incoming = [makeIncoming()];
    const existing = [makeExisting({ deletedAt: new Date() })];
    expect(filterNewTournaments(incoming, existing)).toHaveLength(0);
  });

  it('casa entry trashed por externalId → filtrado (curto-circuito + lixeira)', () => {
    const incoming = [makeIncoming({ externalId: 'suprema-100' })];
    const existing = [makeExisting({ externalId: 'suprema-100', deletedAt: new Date() })];
    expect(filterNewTournaments(incoming, existing)).toHaveLength(0);
  });
});

describe('filterNewTournaments (canonica) — edge cases / determinismo', () => {
  it('sem existentes → mantem todos', () => {
    const incoming = [makeIncoming({ name: 'T1' }), makeIncoming({ name: 'T2', site: 'PartyPoker' })];
    expect(filterNewTournaments(incoming, [])).toHaveLength(2);
  });

  it('incoming vazio → array vazio', () => {
    expect(filterNewTournaments([], [makeExisting()])).toHaveLength(0);
  });

  it('mantem mesmo nome/buyIn mas SITE diferente (key canonica difere por site)', () => {
    const incoming = [
      makeIncoming({ site: 'GGPoker' }),
      makeIncoming({ site: 'PokerStars' }),
    ];
    const existing = [makeExisting({ site: 'GGPoker' })];
    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(1);
    expect(result[0].site).toBe('PokerStars');
  });

  it('dia diferente (Dom vs Sab) no mesmo slot → mantido (dayOfWeek na key)', () => {
    const incoming = [makeIncoming({ dayOfWeek: 6 })];
    const existing = [makeExisting({ dayOfWeek: 0 })];
    expect(filterNewTournaments(incoming, existing)).toHaveLength(1);
  });

  it('lote misto: filtra duplicata canonica + externalId, mantem o novo', () => {
    const incoming = [
      makeIncoming({ name: 'Suprema dup', externalId: 'suprema-100', site: 'Suprema', buyIn: '11' }),
      makeIncoming({ name: 'Manual dup', externalId: null, buyIn: '21.60' }), // snapa pra 22 existente
      makeIncoming({ name: 'Novo', externalId: 'suprema-999', site: 'PartyPoker', buyIn: '5' }),
    ];
    const existing = [
      makeExisting({ externalId: 'suprema-100', name: 'Suprema dup', site: 'Suprema', buyIn: '11' }),
      makeExisting({ buyIn: '22' }),
    ];
    const result = filterNewTournaments(incoming, existing);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Novo');
  });
});
