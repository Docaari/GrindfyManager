/**
 * Test — Sprint home-reform-5 item 3.
 *
 * Spec: Docs/specs/home-reform-5.md item 3 (Pergunte ao Coach).
 *
 * Cobre buildCoachContext puro:
 *   - activeProfiles: array dos perfis ativos hoje (single-profile schema atual).
 *   - todayTournamentsTotal: soma dos torneios planejados nos perfis ativos.
 *   - isDayOff: true quando nenhum perfil ativo (OFF / null / [].).
 */

import { describe, it, expect } from 'vitest';
import {
  buildCoachContext,
  type BuildCoachContextInput,
} from '../../server/services/coachContext';

function baseInput(over: Partial<BuildCoachContextInput> = {}): BuildCoachContextInput {
  return {
    activeProfile: 'B',
    plannedTournaments: [
      { profile: 'B' } as any,
      { profile: 'B' } as any,
      { profile: 'A' } as any,
    ],
    ...over,
  };
}

describe('buildCoachContext — activeProfiles', () => {
  it('retorna [activeProfile] quando 1 perfil ativo', () => {
    const out = buildCoachContext(baseInput({ activeProfile: 'B' }));
    expect(out.activeProfiles).toEqual(['B']);
  });

  it('retorna [] quando activeProfile null', () => {
    const out = buildCoachContext(baseInput({ activeProfile: null }));
    expect(out.activeProfiles).toEqual([]);
  });

  it('retorna [] quando activeProfile OFF', () => {
    const out = buildCoachContext(baseInput({ activeProfile: 'OFF' }));
    expect(out.activeProfiles).toEqual([]);
  });

  it('aceita array de perfis (futuro multi-profile)', () => {
    const out = buildCoachContext(
      baseInput({ activeProfile: ['A', 'B'] as any }),
    );
    expect(out.activeProfiles).toEqual(['A', 'B']);
  });

  it('filtra valores invalidos do array', () => {
    const out = buildCoachContext(
      baseInput({ activeProfile: ['A', 'X', 'B', null] as any }),
    );
    expect(out.activeProfiles).toEqual(['A', 'B']);
  });
});

describe('buildCoachContext — todayTournamentsTotal', () => {
  it('soma torneios apenas dos perfis ativos', () => {
    const out = buildCoachContext(
      baseInput({
        activeProfile: 'B',
        plannedTournaments: [
          { profile: 'B' } as any,
          { profile: 'B' } as any,
          { profile: 'A' } as any,
        ],
      }),
    );
    expect(out.todayTournamentsTotal).toBe(2);
  });

  it('soma de multiplos perfis ativos', () => {
    const out = buildCoachContext(
      baseInput({
        activeProfile: ['A', 'B'] as any,
        plannedTournaments: [
          { profile: 'A' } as any,
          { profile: 'A' } as any,
          { profile: 'B' } as any,
          { profile: 'C' } as any,
        ],
      }),
    );
    expect(out.todayTournamentsTotal).toBe(3);
  });

  it('zero quando nenhum perfil ativo', () => {
    const out = buildCoachContext(
      baseInput({
        activeProfile: null,
        plannedTournaments: [{ profile: 'A' } as any],
      }),
    );
    expect(out.todayTournamentsTotal).toBe(0);
  });

  it('zero quando perfil ativo nao tem torneios', () => {
    const out = buildCoachContext(
      baseInput({
        activeProfile: 'C',
        plannedTournaments: [
          { profile: 'A' } as any,
          { profile: 'B' } as any,
        ],
      }),
    );
    expect(out.todayTournamentsTotal).toBe(0);
  });

  it('aceita lista vazia', () => {
    const out = buildCoachContext(
      baseInput({ activeProfile: 'B', plannedTournaments: [] }),
    );
    expect(out.todayTournamentsTotal).toBe(0);
  });

  it('ignora rows sem campo profile', () => {
    const out = buildCoachContext(
      baseInput({
        activeProfile: 'B',
        plannedTournaments: [
          { profile: 'B' } as any,
          {} as any,
          { profile: null } as any,
        ],
      }),
    );
    expect(out.todayTournamentsTotal).toBe(1);
  });
});

describe('buildCoachContext — isDayOff', () => {
  it('false quando ha perfil ativo', () => {
    const out = buildCoachContext(baseInput({ activeProfile: 'B' }));
    expect(out.isDayOff).toBe(false);
  });

  it('true quando activeProfile null', () => {
    const out = buildCoachContext(baseInput({ activeProfile: null }));
    expect(out.isDayOff).toBe(true);
  });

  it('true quando activeProfile OFF', () => {
    const out = buildCoachContext(baseInput({ activeProfile: 'OFF' }));
    expect(out.isDayOff).toBe(true);
  });

  it('true quando array vazio', () => {
    const out = buildCoachContext(baseInput({ activeProfile: [] as any }));
    expect(out.isDayOff).toBe(true);
  });

  it('false mesmo quando perfil ativo tem 0 torneios planejados', () => {
    // Founder hoje: profile B com 0 torneios — NAO eh DAY OFF (perfil esta ativo).
    const out = buildCoachContext(
      baseInput({ activeProfile: 'B', plannedTournaments: [] }),
    );
    expect(out.isDayOff).toBe(false);
    expect(out.todayTournamentsTotal).toBe(0);
  });
});
