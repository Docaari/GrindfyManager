/**
 * Test — Sprint home-reform-5 item 4.
 *
 * Spec: Docs/specs/home-reform-5.md item 4 (Acao Imediata).
 *
 * Cobre buildImmediateAction puro:
 *   - Prioridade: pending_hand > focus_stat > start_session > null.
 *   - pending_hand: ativa quando pendingHandsCount > 0.
 *   - focus_stat: slot dormante. Ativa apenas quando focusStatPending nao-null.
 *   - start_session: ativa quando todayTournamentsTotal > 0 + nao DAY OFF +
 *     nenhuma sessao /grind aberta.
 *   - null: nenhum gancho atende.
 */

import { describe, it, expect } from 'vitest';
import {
  buildImmediateAction,
  type BuildImmediateActionInput,
} from '../../server/services/immediateAction';

function baseInput(over: Partial<BuildImmediateActionInput> = {}): BuildImmediateActionInput {
  return {
    pendingHandsCount: 0,
    focusStatPending: null,
    todayTournamentsTotal: 0,
    isDayOff: false,
    hasActiveGrindSession: false,
    activeProfilesLabel: null,
    ...over,
  };
}

describe('buildImmediateAction — prioridade', () => {
  it('escolhe pending_hand quando ha mao pendente (prioridade 1)', () => {
    const out = buildImmediateAction(
      baseInput({
        pendingHandsCount: 3,
        focusStatPending: { statName: 'VPIP', daysSince: 9, ctaHref: '/estudos/stats/VPIP' },
        todayTournamentsTotal: 5,
        activeProfilesLabel: 'B',
      }),
    );
    expect(out?.kind).toBe('pending_hand');
  });

  it('escolhe focus_stat quando sem mao pendente mas focus_stat ativo (prioridade 2)', () => {
    const out = buildImmediateAction(
      baseInput({
        pendingHandsCount: 0,
        focusStatPending: { statName: 'VPIP', daysSince: 9, ctaHref: '/estudos/stats/VPIP' },
        todayTournamentsTotal: 5,
        activeProfilesLabel: 'B',
      }),
    );
    expect(out?.kind).toBe('focus_stat');
  });

  it('escolhe start_session quando sem mao+focus mas ha torneio hoje (prioridade 3)', () => {
    const out = buildImmediateAction(
      baseInput({
        pendingHandsCount: 0,
        focusStatPending: null,
        todayTournamentsTotal: 12,
        activeProfilesLabel: 'A + B',
      }),
    );
    expect(out?.kind).toBe('start_session');
  });

  it('retorna null quando nenhum dos ganchos esta ativo', () => {
    const out = buildImmediateAction(baseInput());
    expect(out).toBeNull();
  });
});

describe('buildImmediateAction — variant pending_hand', () => {
  it('retorna count + ctaHref /estudos', () => {
    const out = buildImmediateAction(baseInput({ pendingHandsCount: 4 }));
    expect(out).toEqual({
      kind: 'pending_hand',
      count: 4,
      ctaHref: '/estudos',
    });
  });

  it('count = 1 (singular ainda dispara)', () => {
    const out = buildImmediateAction(baseInput({ pendingHandsCount: 1 }));
    expect(out?.kind).toBe('pending_hand');
    expect((out as any).count).toBe(1);
  });
});

describe('buildImmediateAction — variant focus_stat (slot dormante)', () => {
  it('retorna statName + daysSince + ctaHref repassados', () => {
    const out = buildImmediateAction(
      baseInput({
        focusStatPending: {
          statName: 'PFR',
          daysSince: 11,
          ctaHref: '/estudos/stats/PFR',
        },
      }),
    );
    expect(out).toEqual({
      kind: 'focus_stat',
      statName: 'PFR',
      daysSince: 11,
      ctaHref: '/estudos/stats/PFR',
    });
  });

  it('focusStatPending null nao dispara variant', () => {
    const out = buildImmediateAction(
      baseInput({ focusStatPending: null, todayTournamentsTotal: 0 }),
    );
    expect(out).toBeNull();
  });
});

describe('buildImmediateAction — variant start_session', () => {
  it('ativa quando todayTournamentsTotal > 0, nao DAY OFF, sem sessao /grind aberta', () => {
    const out = buildImmediateAction(
      baseInput({
        todayTournamentsTotal: 8,
        isDayOff: false,
        hasActiveGrindSession: false,
        activeProfilesLabel: 'B',
      }),
    );
    expect(out).toEqual({
      kind: 'start_session',
      plannedCount: 8,
      activeProfilesLabel: 'B',
      ctaHref: '/grind?open=quickstart',
    });
  });

  it('NAO ativa quando isDayOff=true mesmo com totalCount>0', () => {
    const out = buildImmediateAction(
      baseInput({
        todayTournamentsTotal: 5,
        isDayOff: true,
      }),
    );
    expect(out).toBeNull();
  });

  it('NAO ativa quando ja existe sessao /grind aberta (status=active)', () => {
    const out = buildImmediateAction(
      baseInput({
        todayTournamentsTotal: 5,
        hasActiveGrindSession: true,
        activeProfilesLabel: 'B',
      }),
    );
    expect(out).toBeNull();
  });

  it('NAO ativa quando todayTournamentsTotal=0', () => {
    const out = buildImmediateAction(
      baseInput({ todayTournamentsTotal: 0, activeProfilesLabel: 'B' }),
    );
    expect(out).toBeNull();
  });

  it('aceita activeProfilesLabel null (sem rotulo de perfis)', () => {
    const out = buildImmediateAction(
      baseInput({
        todayTournamentsTotal: 3,
        activeProfilesLabel: null,
      }),
    );
    expect(out).toEqual({
      kind: 'start_session',
      plannedCount: 3,
      activeProfilesLabel: null,
      ctaHref: '/grind?open=quickstart',
    });
  });
});

describe('buildImmediateAction — saneamento', () => {
  it('pendingHandsCount negativo eh tratado como zero', () => {
    const out = buildImmediateAction(
      baseInput({ pendingHandsCount: -1, todayTournamentsTotal: 3, activeProfilesLabel: 'B' }),
    );
    expect(out?.kind).toBe('start_session');
  });

  it('todayTournamentsTotal negativo nao ativa start_session', () => {
    const out = buildImmediateAction(
      baseInput({ todayTournamentsTotal: -2 }),
    );
    expect(out).toBeNull();
  });
});
