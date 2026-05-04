/**
 * Test — Sprint home-reform-5 item 2.
 *
 * Spec: Docs/specs/home-reform-5.md item 2 (Header Sessao).
 *
 * Cobre buildHeaderStrip puro:
 *   - Banca: USD com 2 casas (ja vem em USD do walletService).
 *   - Hoje: filtro perfil ativo + DAY OFF.
 *   - ROI 30D: formula (saldoAtual - saldo30d) / invested30d * 100.
 *   - Pendencias: prioridade fixa, top-1.
 */

import { describe, it, expect } from 'vitest';
import { buildHeaderStrip, type BuildHeaderStripInput } from '../../server/services/homeHeader';

const NOW = new Date('2026-05-04T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function baseInput(over: Partial<BuildHeaderStripInput> = {}): BuildHeaderStripInput {
  return {
    bankrollUsd: 1866.84,
    activeProfile: 'B',
    plannedTournaments: [],
    bankrollAmount30dAgoUsd: 1500,
    invested30dUsd: 500,
    hasBankrollData30d: true,
    lastBankrollMovementAt: new Date(NOW.getTime() - 1 * DAY),
    lastTournamentUploadAt: new Date(NOW.getTime() - 1 * DAY),
    oldestPendingSpotAt: null,
    hasUnreviewedCoachReport: false,
    focusStatPendingDaysSince: null,
    now: NOW,
    ...over,
  };
}

// =============================================================================
// 2.1 Banca
// =============================================================================

describe('buildHeaderStrip — Banca (2.1)', () => {
  it('expoe totalUsd em USD direto', () => {
    const out = buildHeaderStrip(baseInput({ bankrollUsd: 1866.84 }));
    expect(out.banca).toEqual({ totalUsd: 1866.84, currency: 'USD' });
  });

  it('null quando banca nao configurada', () => {
    const out = buildHeaderStrip(baseInput({ bankrollUsd: null }));
    expect(out.banca).toBeNull();
  });

  it('null quando bankroll NaN/Infinity', () => {
    const out = buildHeaderStrip(baseInput({ bankrollUsd: NaN }));
    expect(out.banca).toBeNull();
  });
});

// =============================================================================
// 2.2 Hoje
// =============================================================================

describe('buildHeaderStrip — Hoje (2.2)', () => {
  it('conta planned tournaments do perfil ativo', () => {
    const out = buildHeaderStrip(
      baseInput({
        activeProfile: 'B',
        plannedTournaments: [
          { profile: 'A' }, { profile: 'B' }, { profile: 'B' }, { profile: 'C' },
        ],
      }),
    );
    expect(out.today).toEqual({ profile: 'B', plannedCount: 2, isOff: false });
  });

  it('profile B sem torneios = 0 (nao DAY OFF)', () => {
    const out = buildHeaderStrip(
      baseInput({ activeProfile: 'B', plannedTournaments: [{ profile: 'A' }] }),
    );
    expect(out.today).toEqual({ profile: 'B', plannedCount: 0, isOff: false });
  });

  it('activeProfile=null -> DAY OFF', () => {
    const out = buildHeaderStrip(baseInput({ activeProfile: null }));
    expect(out.today).toEqual({ profile: null, plannedCount: 0, isOff: true });
  });

  it('activeProfile=OFF -> DAY OFF', () => {
    const out = buildHeaderStrip(baseInput({ activeProfile: 'OFF' }));
    expect(out.today).toEqual({ profile: null, plannedCount: 0, isOff: true });
  });

  it('plannedTournaments null/undefined -> count 0 sem throw', () => {
    const out = buildHeaderStrip(
      baseInput({ activeProfile: 'A', plannedTournaments: [null, undefined as any] }),
    );
    expect(out.today.plannedCount).toBe(0);
  });
});

// =============================================================================
// 2.3 ROI 30D
// =============================================================================

describe('buildHeaderStrip — ROI 30D (2.3)', () => {
  it('formula: (saldoAtual - saldo30dAtras) / invested30d * 100', () => {
    // 2000 - 1500 = 500. 500 / 1000 = 0.5 => 50%.
    const out = buildHeaderStrip(
      baseInput({
        bankrollUsd: 2000,
        bankrollAmount30dAgoUsd: 1500,
        invested30dUsd: 1000,
      }),
    );
    expect(out.roi30d).toEqual({ value: 50, hasData: true });
  });

  it('value=0 quando saldoAtual == saldo30d', () => {
    const out = buildHeaderStrip(
      baseInput({ bankrollUsd: 1500, bankrollAmount30dAgoUsd: 1500, invested30dUsd: 100 }),
    );
    expect(out.roi30d).toEqual({ value: 0, hasData: true });
  });

  it('valor negativo permitido', () => {
    const out = buildHeaderStrip(
      baseInput({ bankrollUsd: 800, bankrollAmount30dAgoUsd: 1000, invested30dUsd: 200 }),
    );
    // (800 - 1000) / 200 = -1 => -100%
    expect(out.roi30d.value).toBe(-100);
    expect(out.roi30d.hasData).toBe(true);
  });

  it('hasBankrollData30d=false -> empty', () => {
    const out = buildHeaderStrip(baseInput({ hasBankrollData30d: false }));
    expect(out.roi30d).toEqual({ value: null, hasData: false });
  });

  it('invested30dUsd=0 -> empty (denominador zero)', () => {
    const out = buildHeaderStrip(baseInput({ invested30dUsd: 0 }));
    expect(out.roi30d.hasData).toBe(false);
    expect(out.roi30d.value).toBeNull();
  });

  it('saldo30d=null -> empty', () => {
    const out = buildHeaderStrip(baseInput({ bankrollAmount30dAgoUsd: null }));
    expect(out.roi30d.hasData).toBe(false);
  });

  it('arredonda para 2 casas decimais', () => {
    // (1010 - 1000) / 333 = 3.003003... %
    const out = buildHeaderStrip(
      baseInput({ bankrollUsd: 1010, bankrollAmount30dAgoUsd: 1000, invested30dUsd: 333 }),
    );
    expect(out.roi30d.value).toBe(3);
  });
});

// =============================================================================
// 2.4 Pendencias — prioridade fixa
// =============================================================================

describe('buildHeaderStrip — Pendencias (2.4) prioridade', () => {
  it('1) bankroll_check quando >7d sem movimentacao', () => {
    const out = buildHeaderStrip(
      baseInput({ lastBankrollMovementAt: new Date(NOW.getTime() - 8 * DAY) }),
    );
    expect(out.pendency).toMatchObject({
      kind: 'bankroll_check',
      ctaHref: '/bankroll',
      daysSince: 8,
    });
  });

  it('1) bankroll_check tambem quando lastBankrollMovementAt=null (nunca reportou)', () => {
    const out = buildHeaderStrip(baseInput({ lastBankrollMovementAt: null }));
    expect(out.pendency?.kind).toBe('bankroll_check');
    expect(out.pendency?.daysSince).toBeNull();
  });

  it('2) coach_report quando hasUnreviewedCoachReport=true e bankroll OK', () => {
    const out = buildHeaderStrip(
      baseInput({
        lastBankrollMovementAt: new Date(NOW.getTime() - 1 * DAY),
        hasUnreviewedCoachReport: true,
      }),
    );
    expect(out.pendency?.kind).toBe('coach_report');
  });

  it('3) upload_tournaments quando >7d sem upload e prioridades 1+2 OK', () => {
    const out = buildHeaderStrip(
      baseInput({
        lastBankrollMovementAt: new Date(NOW.getTime() - 1 * DAY),
        hasUnreviewedCoachReport: false,
        lastTournamentUploadAt: new Date(NOW.getTime() - 10 * DAY),
      }),
    );
    expect(out.pendency).toMatchObject({
      kind: 'upload_tournaments',
      ctaHref: '/upload',
      daysSince: 10,
    });
  });

  it('3) upload_tournaments tambem quando lastTournamentUploadAt=null', () => {
    const out = buildHeaderStrip(
      baseInput({
        lastBankrollMovementAt: new Date(NOW.getTime() - 1 * DAY),
        lastTournamentUploadAt: null,
      }),
    );
    expect(out.pendency?.kind).toBe('upload_tournaments');
  });

  it('4) spot_review quando spot >3d e prioridades 1+2+3 OK', () => {
    const out = buildHeaderStrip(
      baseInput({
        lastBankrollMovementAt: new Date(NOW.getTime() - 1 * DAY),
        lastTournamentUploadAt: new Date(NOW.getTime() - 1 * DAY),
        oldestPendingSpotAt: new Date(NOW.getTime() - 4 * DAY),
      }),
    );
    expect(out.pendency).toMatchObject({
      kind: 'spot_review',
      ctaHref: '/estudos',
      daysSince: 4,
    });
  });

  it('4) spot 2d nao dispara (limite 3d)', () => {
    const out = buildHeaderStrip(
      baseInput({
        lastBankrollMovementAt: new Date(NOW.getTime() - 1 * DAY),
        lastTournamentUploadAt: new Date(NOW.getTime() - 1 * DAY),
        oldestPendingSpotAt: new Date(NOW.getTime() - 2 * DAY),
      }),
    );
    expect(out.pendency).toBeNull();
  });

  it('5) focus_stat quando >7d e demais OK', () => {
    const out = buildHeaderStrip(
      baseInput({
        lastBankrollMovementAt: new Date(NOW.getTime() - 1 * DAY),
        lastTournamentUploadAt: new Date(NOW.getTime() - 1 * DAY),
        oldestPendingSpotAt: null,
        focusStatPendingDaysSince: 9,
      }),
    );
    expect(out.pendency?.kind).toBe('focus_stat');
  });

  it('zero pendencias -> null (Tudo em dia)', () => {
    const out = buildHeaderStrip(
      baseInput({
        lastBankrollMovementAt: new Date(NOW.getTime() - 1 * DAY),
        lastTournamentUploadAt: new Date(NOW.getTime() - 1 * DAY),
        oldestPendingSpotAt: null,
        hasUnreviewedCoachReport: false,
        focusStatPendingDaysSince: null,
      }),
    );
    expect(out.pendency).toBeNull();
  });

  it('prioridade absoluta: bankroll_check vence todas mesmo se outras ativas', () => {
    const out = buildHeaderStrip(
      baseInput({
        lastBankrollMovementAt: new Date(NOW.getTime() - 30 * DAY),
        hasUnreviewedCoachReport: true,
        lastTournamentUploadAt: new Date(NOW.getTime() - 100 * DAY),
        oldestPendingSpotAt: new Date(NOW.getTime() - 30 * DAY),
        focusStatPendingDaysSince: 30,
      }),
    );
    expect(out.pendency?.kind).toBe('bankroll_check');
  });
});
