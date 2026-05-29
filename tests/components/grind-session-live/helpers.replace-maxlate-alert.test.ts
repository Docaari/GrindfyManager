/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint grind-live-detail-parity
 *
 * Spec: Docs/specs/sprint-grind-live-detail-parity.md RF-04 + Q-D + Q-E
 * ADR-214 D3 (alerta client-side reuso SessionAlertManager) + D4 (dedup/replace por
 * tournamentId) + D5 (rollover cross-midnight + janela perdida).
 *
 * replaceMaxLateAlert(manager, tournament, opts?) — helper PURO, `now` injetavel.
 *   - Remove TODOS alertas type='tournament' do tournament.id antes de agendar (dedup).
 *   - triggerAt = registrationTime - 2min, no dia de hoje (base opts.now);
 *     cross-midnight: se target<=now -> +1 dia.
 *   - triggerAt <= now (janela <2min) -> NAO agenda (so remove).
 *   - registrationTime null/empty -> so remove (nao agenda).
 *   - Quando agenda: label "Max Late: {name} ({site})", narrationText via
 *     buildTournamentNarration respeitando opts.redactBuyIn.
 *
 * Este helper AINDA NAO EXISTE — o implementer vai cria-lo. Red phase: falha por
 * simbolo ausente.
 *
 * Observacao de contrato: usamos `manager.getActiveAlerts()` (publico) para
 * inspecionar o estado do manager — ele retorna os alertas !fired && !dismissed
 * ordenados por triggerAt. `buildTournamentNarration` e import REAL de
 * @/lib/tournamentNarration (nao mockado — helper puro deterministico).
 *
 * Lessons aplicadas:
 *   - #14/#26 await import.
 *   - now injetavel -> deterministico sem fakeTimers.
 *   - #3 shape real do SessionAlertManager validado contra shared/generic-alerts.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionAlertManager } from '../../../shared/generic-alerts';

const HELPERS = '../../../client/src/components/grind-session-live/helpers';

let manager: SessionAlertManager;

beforeEach(() => {
  manager = new SessionAlertManager();
});

function tournamentAlerts() {
  return manager.getActiveAlerts().filter((a) => a.type === 'tournament');
}

const baseTournament = {
  id: 'sess-1',
  name: 'Sunday Million',
  site: 'PokerStars',
  buyIn: '215',
  registrationTime: '20:00',
};

describe('replaceMaxLateAlert — agendamento (RF-04 / D5)', () => {
  it('registrationTime "20:00" agenda alerta com triggerAt 19:58 (now=19:00)', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0); // 19:00 local

    replaceMaxLateAlert(manager, baseTournament, { now });

    const alerts = tournamentAlerts();
    expect(alerts).toHaveLength(1);
    const trig = alerts[0].triggerAt;
    expect(trig.getHours()).toBe(19);
    expect(trig.getMinutes()).toBe(58);
  });

  it('alerta agendado usa label "Max Late: {name} ({site})"', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);

    replaceMaxLateAlert(manager, baseTournament, { now });

    expect(tournamentAlerts()[0].label).toBe('Max Late: Sunday Million (PokerStars)');
  });

  it('alerta agendado carrega narrationText com buy-in quando redactBuyIn falso/ausente', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);

    replaceMaxLateAlert(manager, baseTournament, { now });

    const narr = tournamentAlerts()[0].narrationText ?? '';
    expect(narr).toContain('PokerStars');
    expect(narr).toContain('Sunday Million');
    // redactBuyIn ausente -> valor presente.
    expect(narr).toContain('215');
  });

  it('narrationText respeita redactBuyIn=true (nao narra valor)', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);

    replaceMaxLateAlert(manager, baseTournament, { now, redactBuyIn: true });

    const narr = tournamentAlerts()[0].narrationText ?? '';
    expect(narr).not.toContain('215');
    expect(narr).toContain('atencao');
  });

  it('o alerta agendado e disparavel pelo tick (getAlertsToFire) quando o relogio passa triggerAt', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    // Agenda usando now no passado proximo para que triggerAt ja <= relogio real
    // de getAlertsToFire (que usa new Date()). triggerAt = (now-2min do "20:00 de
    // ontem")? Em vez disso forcamos: registrationTime cujo triggerAt resultante
    // esteja no passado relativo a Date.now() mas ainda > opts.now.
    const now = new Date(Date.now() - 5 * 60_000); // 5min atras
    // registrationTime = HH:MM correspondente a (now + 1min) -> target ~now+1min,
    // triggerAt = target-2min ~ now-1min (futuro relativo a opts.now? nao).
    // Para garantir agendamento (triggerAt > opts.now), usamos now bem no passado.
    const ref = new Date(now.getTime() + 3 * 60_000); // 3min depois de opts.now
    const hh = String(ref.getHours()).padStart(2, '0');
    const mm = String(ref.getMinutes()).padStart(2, '0');

    replaceMaxLateAlert(
      manager,
      { ...baseTournament, registrationTime: `${hh}:${mm}` },
      { now },
    );

    // triggerAt = ref - 2min = now+1min. Mas now esta 5min no passado real ->
    // triggerAt ~4min no passado real -> getAlertsToFire (new Date()) o pega.
    const toFire = manager.getAlertsToFire().filter((a) => a.type === 'tournament');
    expect(toFire).toHaveLength(1);
    expect(toFire[0].tournamentId).toBe('sess-1');
  });
});

describe('replaceMaxLateAlert — rollover cross-midnight (D5)', () => {
  it('"00:30" salvo as 23:00 agenda 00:28 do dia seguinte', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 23, 0, 0, 0); // 29/mai 23:00

    replaceMaxLateAlert(
      manager,
      { ...baseTournament, registrationTime: '00:30' },
      { now },
    );

    const alerts = tournamentAlerts();
    expect(alerts).toHaveLength(1);
    const trig = alerts[0].triggerAt;
    expect(trig.getHours()).toBe(0);
    expect(trig.getMinutes()).toBe(28);
    // Dia seguinte (30/mai).
    expect(trig.getDate()).toBe(30);
  });
});

describe('replaceMaxLateAlert — janela perdida (D5)', () => {
  it('"20:00" salvo as 19:59 (faltam <2min) NAO agenda', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 59, 0, 0);

    replaceMaxLateAlert(manager, baseTournament, { now });

    expect(tournamentAlerts()).toHaveLength(0);
  });

  it('"20:00" salvo exatamente as 19:58 (triggerAt == now) NAO agenda', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 58, 0, 0);

    replaceMaxLateAlert(manager, baseTournament, { now });

    expect(tournamentAlerts()).toHaveLength(0);
  });
});

describe('replaceMaxLateAlert — OFF / sem registrationTime (Q-D / D4)', () => {
  it('registrationTime null -> nao agenda nada', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);

    replaceMaxLateAlert(manager, { ...baseTournament, registrationTime: null }, { now });

    expect(tournamentAlerts()).toHaveLength(0);
  });

  it('registrationTime "" (vazio) -> nao agenda nada', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);

    replaceMaxLateAlert(manager, { ...baseTournament, registrationTime: '' }, { now });

    expect(tournamentAlerts()).toHaveLength(0);
  });

  it('OFF (registrationTime null) remove alerta tournament previamente agendado do mesmo id', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);

    // 1) agenda
    replaceMaxLateAlert(manager, baseTournament, { now });
    expect(tournamentAlerts()).toHaveLength(1);

    // 2) OFF -> remove, nao agenda
    replaceMaxLateAlert(manager, { ...baseTournament, registrationTime: null }, { now });
    expect(tournamentAlerts()).toHaveLength(0);
  });
});

describe('replaceMaxLateAlert — dedup / substituicao (Q-E / D4)', () => {
  it('re-salvar com registrationTime diferente deixa APENAS 1 alerta tournament pro id', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);

    replaceMaxLateAlert(manager, { ...baseTournament, registrationTime: '20:00' }, { now });
    replaceMaxLateAlert(manager, { ...baseTournament, registrationTime: '21:00' }, { now });

    const alerts = tournamentAlerts();
    expect(alerts).toHaveLength(1);
    // O alerta restante e o novo (triggerAt 20:58).
    expect(alerts[0].triggerAt.getHours()).toBe(20);
    expect(alerts[0].triggerAt.getMinutes()).toBe(58);
  });

  it('chamar 2x com o mesmo registrationTime e idempotente (continua 1 alerta)', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);

    replaceMaxLateAlert(manager, baseTournament, { now });
    replaceMaxLateAlert(manager, baseTournament, { now });

    expect(tournamentAlerts()).toHaveLength(1);
  });

  it('NAO remove alertas tournament de OUTRO tournamentId', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);

    replaceMaxLateAlert(manager, { ...baseTournament, id: 'sess-1', registrationTime: '20:00' }, { now });
    replaceMaxLateAlert(manager, { ...baseTournament, id: 'sess-2', registrationTime: '21:00' }, { now });

    const all = tournamentAlerts();
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.tournamentId).sort()).toEqual(['sess-1', 'sess-2']);
  });

  it('NAO remove alertas de outro type (ex late-reg) do mesmo tournamentId', async () => {
    const { replaceMaxLateAlert } = await import(HELPERS);
    const now = new Date(2026, 4, 29, 19, 0, 0, 0);

    // late-reg pre-existente do mesmo id.
    manager.addLateRegAlert(
      { id: 'sess-1', name: 'X', site: 'PokerStars', startTime: new Date(now.getTime() + 60 * 60_000), lateRegMinutes: 30 },
      5,
    );

    replaceMaxLateAlert(manager, baseTournament, { now });

    const active = manager.getActiveAlerts();
    expect(active.some((a) => a.type === 'late-reg' && a.tournamentId === 'sess-1')).toBe(true);
    expect(active.filter((a) => a.type === 'tournament' && a.tournamentId === 'sess-1')).toHaveLength(1);
  });
});
