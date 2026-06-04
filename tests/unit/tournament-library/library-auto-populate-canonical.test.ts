/**
 * Sprint biblioteca-administrar-dedup — Fatia 1 / RF-02 (RED phase).
 *
 * Migra `decideLibraryAction` (server/services/libraryAutoPopulate.ts) da key
 * EXATA `(name, site, buyIn, time)` para a key canonica `libraryCanonicalKey`.
 *
 * Estado da maquina PRESERVADO (ADR-200 §Back-compat):
 *   - planned ja linkado (libraryTemplateId) → skip (idempotencia)
 *   - sem userId/name/site → skip (dado insuficiente)
 *   - match ATIVO pela key canonica → link
 *   - so match TRASHED → skip (D5 mantida — respeita exclusao do user)
 *   - nenhum match → create
 *
 * MUDANCA: "match" agora e por key canonica (snap de buy-in, type na key,
 * speed fora, name fora, timeBin de `time` HH:MM) — NAO mais (name,site,buyIn)
 * exatos + time exato.
 *
 * IMPORTANTE (lesson #3 — shape real): a query de candidatos passa a ser COARSE
 * por (user_id, site) trazendo os campos necessarios para canonicalizar em
 * memoria. Portanto os candidate rows nestes testes carregam os campos
 * canonicos (name, site, buyIn, time, type, dayOfWeek) alem de id/deletedAt.
 * decideLibraryAction continua PURA (recebe os candidatos; nao toca db).
 *
 * Estes testes definem o comportamento NOVO; vao falhar ate a migracao
 * (a impl atual casa por `time` exato e ignora type/buyIn-snap/dayOfWeek).
 */

import { describe, it, expect } from 'vitest';
import {
  decideLibraryAction,
  type PlannedLike,
} from '../../../server/services/libraryAutoPopulate';

/**
 * Candidate row no formato canonico (coarse por user+site, canonicalizado em
 * memoria). Inclui os campos que a key canonica consome. O Implementer pode
 * tipar como LibraryDedupRow estendido; aqui passamos `as any` para nao
 * acoplar ao nome exato do tipo enquanto a migracao ainda nao existe.
 */
function row(overrides: Record<string, any> = {}): any {
  return {
    id: 'tpl-x',
    name: 'Daily Special',
    site: 'PokerStars',
    buyIn: '22',
    time: '19:00',
    type: 'Vanilla',
    dayOfWeek: 0,
    deletedAt: null,
    ...overrides,
  };
}

const basePlanned: PlannedLike = {
  id: 'planned-1',
  userId: 'USER-0001',
  name: 'Daily Special',
  site: 'PokerStars',
  buyIn: '22',
  time: '19:00',
  type: 'Vanilla',
  dayOfWeek: 0,
};

describe('decideLibraryAction (canonica) — estado da maquina preservado', () => {
  it('skip quando planned ja tem libraryTemplateId (idempotencia back-compat)', () => {
    expect(
      decideLibraryAction({ ...basePlanned, libraryTemplateId: 'tpl-x' }, [row()]),
    ).toEqual({ action: 'skip' });
  });

  it('skip quando falta name', () => {
    expect(decideLibraryAction({ ...basePlanned, name: null }, [row()])).toEqual({
      action: 'skip',
    });
  });

  it('skip quando falta site', () => {
    expect(decideLibraryAction({ ...basePlanned, site: '' }, [row()])).toEqual({
      action: 'skip',
    });
  });

  it('skip quando falta userId', () => {
    expect(decideLibraryAction({ ...basePlanned, userId: '' }, [row()])).toEqual({
      action: 'skip',
    });
  });

  it('create quando nao ha candidato', () => {
    expect(decideLibraryAction(basePlanned, [])).toEqual({ action: 'create' });
  });

  it('link quando ha match ativo com a MESMA key canonica', () => {
    expect(decideLibraryAction(basePlanned, [row({ id: 'tpl-a' })])).toEqual({
      action: 'link',
      templateId: 'tpl-a',
    });
  });
});

describe('decideLibraryAction (canonica) — snap de buy-in ($21.60 ≈ $22)', () => {
  it('planned $21.60 casa entry existente $22 no mesmo slot → link (antes: create)', () => {
    const candidates = [row({ id: 'tpl-2160', buyIn: '22' })];
    expect(decideLibraryAction({ ...basePlanned, buyIn: '21.60' }, candidates)).toEqual({
      action: 'link',
      templateId: 'tpl-2160',
    });
  });

  it('planned $5 NAO casa entry $500 no mesmo slot → create', () => {
    const candidates = [row({ id: 'tpl-500', buyIn: '500' })];
    expect(decideLibraryAction({ ...basePlanned, buyIn: '5' }, candidates)).toEqual({
      action: 'create',
    });
  });
});

describe('decideLibraryAction (canonica) — type na key (PKO ≠ Vanilla)', () => {
  it('PKO planned NAO casa Vanilla existente no mesmo slot → create', () => {
    const candidates = [row({ id: 'tpl-vanilla', type: 'Vanilla' })];
    expect(decideLibraryAction({ ...basePlanned, type: 'PKO' }, candidates)).toEqual({
      action: 'create',
    });
  });

  it('PKO planned casa PKO existente no mesmo slot → link', () => {
    const candidates = [row({ id: 'tpl-pko', type: 'PKO' })];
    expect(decideLibraryAction({ ...basePlanned, type: 'PKO' }, candidates)).toEqual({
      action: 'link',
      templateId: 'tpl-pko',
    });
  });
});

describe('decideLibraryAction (canonica) — timeBin de 2h (nao mais time exato)', () => {
  it('planned "19:30" casa entry "19:00" (mesmo bin 18-20) → link', () => {
    const candidates = [row({ id: 'tpl-1900', time: '19:00' })];
    expect(decideLibraryAction({ ...basePlanned, time: '19:30' }, candidates)).toEqual({
      action: 'link',
      templateId: 'tpl-1900',
    });
  });

  it('planned "21:00" NAO casa entry "19:00" (bins diferentes) → create', () => {
    const candidates = [row({ id: 'tpl-1900', time: '19:00' })];
    expect(decideLibraryAction({ ...basePlanned, time: '21:00' }, candidates)).toEqual({
      action: 'create',
    });
  });
});

describe('decideLibraryAction (canonica) — speed FORA da key', () => {
  it('planned Hyper casa entry Normal no mesmo slot → link (speed nao separa)', () => {
    const candidates = [row({ id: 'tpl-normal', speed: 'Normal' })];
    expect(
      decideLibraryAction({ ...basePlanned, speed: 'Hyper' } as PlannedLike, candidates),
    ).toEqual({ action: 'link', templateId: 'tpl-normal' });
  });
});

describe('decideLibraryAction (canonica) — dayOfWeek na key', () => {
  it('dias diferentes (Dom vs Sab) no mesmo slot → create (nao casa)', () => {
    const candidates = [row({ id: 'tpl-sab', dayOfWeek: 6 })];
    expect(decideLibraryAction({ ...basePlanned, dayOfWeek: 0 }, candidates)).toEqual({
      action: 'create',
    });
  });

  it('planned sem dia (null) NAO casa entry com dia (0) → create (isolados)', () => {
    const candidates = [row({ id: 'tpl-dom', dayOfWeek: 0 })];
    expect(decideLibraryAction({ ...basePlanned, dayOfWeek: null }, candidates)).toEqual({
      action: 'create',
    });
  });
});

describe('decideLibraryAction (canonica) — regra lixeira→skip (D5 mantida)', () => {
  it('match SO na lixeira pela key canonica → skip (respeita exclusao)', () => {
    const candidates = [row({ id: 'tpl-trashed', deletedAt: new Date() })];
    expect(decideLibraryAction(basePlanned, candidates)).toEqual({ action: 'skip' });
  });

  it('prefere match ativo quando ha trashed + ativo na mesma key (qualquer ordem)', () => {
    const candidates = [
      row({ id: 'tpl-trashed', deletedAt: new Date() }),
      row({ id: 'tpl-active', deletedAt: null }),
    ];
    expect(decideLibraryAction(basePlanned, candidates)).toEqual({
      action: 'link',
      templateId: 'tpl-active',
    });
    expect(decideLibraryAction(basePlanned, [...candidates].reverse())).toEqual({
      action: 'link',
      templateId: 'tpl-active',
    });
  });

  it('match trashed por buy-in snapado ($21.60 vs $22 na lixeira) → skip', () => {
    const candidates = [row({ id: 'tpl-trashed', buyIn: '22', deletedAt: new Date() })];
    expect(decideLibraryAction({ ...basePlanned, buyIn: '21.60' }, candidates)).toEqual({
      action: 'skip',
    });
  });
});

describe('decideLibraryAction (canonica) — back-compat / nao re-duplica', () => {
  it('candidato com key DIFERENTE em todas as dimensoes → create (nao casa por engano)', () => {
    const candidates = [
      row({ id: 'tpl-other', site: 'GGPoker', buyIn: '55', time: '12:00', type: 'PKO', dayOfWeek: 3 }),
    ];
    expect(decideLibraryAction(basePlanned, candidates)).toEqual({ action: 'create' });
  });

  it('multiplos candidatos: casa o ATIVO cuja key bate, ignora os de outra key', () => {
    const candidates = [
      row({ id: 'tpl-noise', buyIn: '999', type: 'Mystery' }),
      row({ id: 'tpl-hit', buyIn: '22', type: 'Vanilla' }),
    ];
    expect(decideLibraryAction(basePlanned, candidates)).toEqual({
      action: 'link',
      templateId: 'tpl-hit',
    });
  });
});
