/**
 * Soneca do alerta do Grind Live (+1min / +3min no toast).
 *
 * Protege a invariante que `unmarkFired` sozinho NAO garante: reagendar o
 * `triggerAt`. Sem isso o alerta sonecado volta a satisfazer `triggerAt <= now`
 * e re-dispara no tick seguinte — a soneca nao soneca nada.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionAlertManager } from '@shared/generic-alerts';

describe('SessionAlertManager.snoozeAlert', () => {
  let manager: SessionAlertManager;
  const NOW = new Date('2026-03-22T18:00:00');

  beforeEach(() => {
    manager = new SessionAlertManager();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const addFiredAlert = () => {
    const alert = manager.addAlert({
      type: 'custom',
      label: 'Registrar no Bounty Builder',
      triggerAt: new Date('2026-03-22T17:59:00'),
    });
    manager.markFired(alert.id);
    return alert;
  };

  it('reagenda triggerAt para agora + minutos e devolve o alerta a fila de pendentes', () => {
    const alert = addFiredAlert();

    const snoozed = manager.snoozeAlert(alert.id, 3);

    expect(snoozed).not.toBeNull();
    expect(snoozed!.triggerAt).toEqual(new Date('2026-03-22T18:03:00'));
    expect(snoozed!.fired).toBe(false);
    expect(snoozed!.dismissed).toBe(false);
  });

  it('alerta sonecado NAO volta em getAlertsToFire antes do novo horario', () => {
    const alert = addFiredAlert();
    manager.snoozeAlert(alert.id, 1);

    // Tick imediato: ainda nao chegou a hora.
    expect(manager.getAlertsToFire()).toHaveLength(0);

    // 59s depois: ainda nao.
    vi.setSystemTime(new Date('2026-03-22T18:00:59'));
    expect(manager.getAlertsToFire()).toHaveLength(0);

    // 1min: dispara.
    vi.setSystemTime(new Date('2026-03-22T18:01:00'));
    expect(manager.getAlertsToFire().map((a) => a.id)).toEqual([alert.id]);
  });

  it('alerta sonecado volta a contar como ativo (sai da lista de disparados)', () => {
    const alert = addFiredAlert();
    expect(manager.getFiredAlerts()).toHaveLength(1);
    expect(manager.getActiveCount()).toBe(0);

    manager.snoozeAlert(alert.id, 1);

    expect(manager.getFiredAlerts()).toHaveLength(0);
    expect(manager.getActiveAlerts().map((a) => a.id)).toEqual([alert.id]);
    expect(manager.getActiveCount()).toBe(1);
  });

  it('soneca de alerta ja dispensado o traz de volta (dismissed=false)', () => {
    const alert = addFiredAlert();
    manager.dismissAlert(alert.id);

    const snoozed = manager.snoozeAlert(alert.id, 3);

    expect(snoozed!.dismissed).toBe(false);
    expect(manager.getActiveAlerts().map((a) => a.id)).toEqual([alert.id]);
  });

  it('id desconhecido devolve null — sinal para o caller criar alerta custom equivalente', () => {
    // Caso real: alerta AUTOMATICO de late reg, que vive no LateRegAlertManager
    // e nao aqui. O caller usa o null para recriar o lembrete como custom.
    expect(manager.snoozeAlert('latereg-tourn-1', 1)).toBeNull();
  });

  it('soneca repetida acumula a partir de AGORA, nao do triggerAt anterior', () => {
    const alert = addFiredAlert();

    manager.snoozeAlert(alert.id, 3);
    vi.setSystemTime(new Date('2026-03-22T18:02:00'));
    const second = manager.snoozeAlert(alert.id, 3);

    expect(second!.triggerAt).toEqual(new Date('2026-03-22T18:05:00'));
  });
});
