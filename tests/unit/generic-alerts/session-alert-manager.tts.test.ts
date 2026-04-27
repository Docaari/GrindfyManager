/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint Alarmes 2.0
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-04 SessionAlert ganha campo narrationText
 *  - DP-04: novo type 'tournament'
 *  - addTournamentAlert helper
 *
 * Modulo testado: shared/generic-alerts.ts (existe — sera estendido)
 *
 * Backward compat:
 *  - Alarmes existentes (sem narrationText) continuam funcionando.
 *  - Type 'late-reg' e 'custom' continuam aceitos.
 *
 * Shape REAL do storage validado em shared/generic-alerts.ts (linha 6-15).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionAlertManager } from '@shared/generic-alerts';
import type { SessionAlert } from '@shared/generic-alerts';

describe('SessionAlertManager — TTS extensions (RF-04)', () => {
  let manager: SessionAlertManager;

  beforeEach(() => {
    manager = new SessionAlertManager();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T18:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('narrationText opcional persistido', () => {
    it('addAlert aceita narrationText e persiste no objeto', () => {
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Faltam 5min',
        triggerAt: new Date('2026-04-27T18:30:00'),
        narrationText: 'Atencao, faltam cinco minutos para o break',
      } as any);

      expect((alert as any).narrationText).toBe(
        'Atencao, faltam cinco minutos para o break'
      );
    });

    it('addAlert sem narrationText -> alert.narrationText undefined (backward compat)', () => {
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Faltam 5min',
        triggerAt: new Date('2026-04-27T18:30:00'),
      });

      expect((alert as any).narrationText).toBeUndefined();
    });
  });

  describe('Novo type "tournament" (DP-04)', () => {
    it('addAlert aceita type tournament', () => {
      const alert = manager.addAlert({
        type: 'tournament' as any,
        label: 'Suprema, Sunday Plus, atencao',
        triggerAt: new Date('2026-04-27T19:50:00'),
        tournamentId: 'tourn-1',
        narrationText: 'Suprema, Sunday Plus, atencao',
      } as any);

      expect(alert.type).toBe('tournament');
      expect((alert as any).narrationText).toBe('Suprema, Sunday Plus, atencao');
    });
  });

  describe('addTournamentAlert (helper RF-04)', () => {
    it('cria alarme tournament com narrationText armazenado', () => {
      const alert = (manager as any).addTournamentAlert({
        tournamentId: 'tourn-1',
        narrationText: 'Suprema, Sunday Plus, buy-in 100',
        triggerAt: new Date('2026-04-27T19:50:00'),
        label: 'Sunday Plus em 10min',
      });

      expect(alert.type).toBe('tournament');
      expect(alert.tournamentId).toBe('tourn-1');
      expect(alert.narrationText).toBe('Suprema, Sunday Plus, buy-in 100');
      expect(alert.label).toBe('Sunday Plus em 10min');
      expect(alert.fired).toBe(false);
      expect(alert.dismissed).toBe(false);
    });

    it('respeita limite de 50 alarmes (reusa MAX_ALERTS)', () => {
      for (let i = 0; i < 50; i++) {
        manager.addAlert({
          type: 'custom',
          label: `Alert ${i}`,
          triggerAt: new Date('2026-04-27T20:00:00'),
        });
      }

      expect(() =>
        (manager as any).addTournamentAlert({
          tournamentId: 'tourn-X',
          narrationText: 'X',
          triggerAt: new Date('2026-04-27T20:00:00'),
          label: 'X',
        })
      ).toThrow('Limite de alertas atingido');
    });
  });

  describe('Backward compat — alarmes antigos sem narrationText', () => {
    it('addLateRegAlert continua funcionando (sem narrationText)', () => {
      const alert = manager.addLateRegAlert(
        {
          id: 'tourn-1',
          name: 'Sunday Plus',
          site: 'Suprema',
          startTime: new Date('2026-04-27T19:00:00'),
          lateRegMinutes: 60,
        },
        10
      );

      expect(alert.type).toBe('late-reg');
      expect((alert as any).narrationText).toBeUndefined();
      expect(alert.label).toContain('Late Reg');
    });

    it('getActiveAlerts retorna alarmes mistos (com e sem narrationText)', () => {
      manager.addAlert({
        type: 'custom',
        label: 'Sem narration',
        triggerAt: new Date('2026-04-27T19:00:00'),
      });
      manager.addAlert({
        type: 'tournament' as any,
        label: 'Com narration',
        triggerAt: new Date('2026-04-27T20:00:00'),
        narrationText: 'Suprema, Loncar, atencao',
      } as any);

      const active = manager.getActiveAlerts();
      expect(active.length).toBe(2);
      const withNarration = active.find((a) => (a as any).narrationText);
      expect(withNarration).toBeDefined();
      expect((withNarration as any).narrationText).toBe('Suprema, Loncar, atencao');
    });
  });

  describe('reset limpa narrationText', () => {
    it('reset apos addTournamentAlert -> alarmes limpos', () => {
      (manager as any).addTournamentAlert({
        tournamentId: 'tourn-1',
        narrationText: 'X',
        triggerAt: new Date('2026-04-27T20:00:00'),
        label: 'X',
      });

      manager.reset();

      expect(manager.getActiveAlerts()).toEqual([]);
    });
  });
});
