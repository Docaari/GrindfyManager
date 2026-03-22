import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionAlertManager } from '@shared/generic-alerts';
import type { SessionAlert } from '@shared/generic-alerts';

describe('SessionAlertManager', () => {
  let manager: SessionAlertManager;

  beforeEach(() => {
    manager = new SessionAlertManager();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T18:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('addAlert', () => {
    it('creates an alert with id, createdAt, fired=false, dismissed=false', () => {
      const triggerAt = new Date('2026-03-22T19:00:00');
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Verificar stack',
        triggerAt,
      });

      expect(alert.id).toBeDefined();
      expect(alert.id.length).toBeGreaterThan(0);
      expect(alert.type).toBe('custom');
      expect(alert.label).toBe('Verificar stack');
      expect(alert.triggerAt).toEqual(triggerAt);
      expect(alert.createdAt).toEqual(new Date('2026-03-22T18:00:00'));
      expect(alert.fired).toBe(false);
      expect(alert.dismissed).toBe(false);
      expect(alert.tournamentId).toBeUndefined();
    });

    it('creates an alert with tournamentId when provided', () => {
      const alert = manager.addAlert({
        type: 'late-reg',
        label: 'Late Reg $22 PokerStars',
        triggerAt: new Date('2026-03-22T19:00:00'),
        tournamentId: 'tourn-123',
      });

      expect(alert.tournamentId).toBe('tourn-123');
    });

    it('throws when limit of 50 alerts is reached', () => {
      for (let i = 0; i < 50; i++) {
        manager.addAlert({
          type: 'custom',
          label: `Alert ${i}`,
          triggerAt: new Date('2026-03-22T20:00:00'),
        });
      }

      expect(() => {
        manager.addAlert({
          type: 'custom',
          label: 'Alert 51',
          triggerAt: new Date('2026-03-22T20:00:00'),
        });
      }).toThrow('Limite de alertas atingido');
    });
  });

  describe('addLateRegAlert', () => {
    it('calculates triggerAt = startTime + lateRegMinutes - minutesBefore', () => {
      const tournament = {
        id: 'tourn-1',
        name: '$22 PokerStars',
        site: 'PokerStars',
        startTime: new Date('2026-03-22T19:00:00'),
        lateRegMinutes: 60,
      };

      const alert = manager.addLateRegAlert(tournament, 10);

      // deadline = 19:00 + 60min = 20:00
      // triggerAt = 20:00 - 10min = 19:50
      expect(alert.triggerAt).toEqual(new Date('2026-03-22T19:50:00'));
      expect(alert.type).toBe('late-reg');
      expect(alert.tournamentId).toBe('tourn-1');
      expect(alert.label).toContain('$22 PokerStars');
      expect(alert.label).toContain('10min');
    });

    it('creates a late-reg alert with proper label format', () => {
      const tournament = {
        id: 'tourn-2',
        name: 'Monday Special',
        site: 'GGPoker',
        startTime: new Date('2026-03-22T19:00:00'),
        lateRegMinutes: 30,
      };

      const alert = manager.addLateRegAlert(tournament, 5);

      expect(alert.label).toBe('Late Reg: Monday Special - 5min');
    });
  });

  describe('addRelativeAlert', () => {
    it('calculates triggerAt = now + minutesFromNow', () => {
      const alert = manager.addRelativeAlert('Break em 30min', 30);

      expect(alert.triggerAt).toEqual(new Date('2026-03-22T18:30:00'));
      expect(alert.type).toBe('custom');
      expect(alert.label).toBe('Break em 30min');
      expect(alert.tournamentId).toBeUndefined();
    });

    it('accepts optional tournamentId', () => {
      const alert = manager.addRelativeAlert('Check stack', 15, 'tourn-5');

      expect(alert.tournamentId).toBe('tourn-5');
      expect(alert.triggerAt).toEqual(new Date('2026-03-22T18:15:00'));
    });
  });

  describe('removeAlert', () => {
    it('removes an alert from the manager', () => {
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Test',
        triggerAt: new Date('2026-03-22T19:00:00'),
      });

      expect(manager.getActiveCount()).toBe(1);
      manager.removeAlert(alert.id);
      expect(manager.getActiveCount()).toBe(0);
    });

    it('does nothing if alert id does not exist', () => {
      manager.addAlert({
        type: 'custom',
        label: 'Test',
        triggerAt: new Date('2026-03-22T19:00:00'),
      });

      manager.removeAlert('nonexistent-id');
      expect(manager.getActiveCount()).toBe(1);
    });
  });

  describe('dismissAlert', () => {
    it('sets dismissed=true', () => {
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Test',
        triggerAt: new Date('2026-03-22T19:00:00'),
      });

      manager.dismissAlert(alert.id);
      expect(manager.getActiveAlerts()).toHaveLength(0);
      expect(manager.getActiveCount()).toBe(0);
    });

    it('dismissed alert does not appear in getAlertsToFire', () => {
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Test',
        triggerAt: new Date('2026-03-22T17:00:00'), // in the past
      });

      manager.dismissAlert(alert.id);
      expect(manager.getAlertsToFire()).toHaveLength(0);
    });
  });

  describe('getAlertsToFire', () => {
    it('returns alerts where triggerAt <= now, fired=false, dismissed=false', () => {
      // Past - should fire
      manager.addAlert({
        type: 'custom',
        label: 'Past alert',
        triggerAt: new Date('2026-03-22T17:30:00'),
      });

      // Future - should NOT fire
      manager.addAlert({
        type: 'custom',
        label: 'Future alert',
        triggerAt: new Date('2026-03-22T19:00:00'),
      });

      // Exactly now - should fire
      manager.addAlert({
        type: 'custom',
        label: 'Now alert',
        triggerAt: new Date('2026-03-22T18:00:00'),
      });

      const toFire = manager.getAlertsToFire();
      expect(toFire).toHaveLength(2);
      expect(toFire.map(a => a.label).sort()).toEqual(['Now alert', 'Past alert']);
    });

    it('does not return fired alerts', () => {
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Test',
        triggerAt: new Date('2026-03-22T17:00:00'),
      });

      manager.markFired(alert.id);
      expect(manager.getAlertsToFire()).toHaveLength(0);
    });

    it('does not return dismissed alerts', () => {
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Test',
        triggerAt: new Date('2026-03-22T17:00:00'),
      });

      manager.dismissAlert(alert.id);
      expect(manager.getAlertsToFire()).toHaveLength(0);
    });
  });

  describe('markFired', () => {
    it('sets fired=true so the alert does not fire again', () => {
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Test',
        triggerAt: new Date('2026-03-22T17:00:00'),
      });

      expect(manager.getAlertsToFire()).toHaveLength(1);
      manager.markFired(alert.id);
      expect(manager.getAlertsToFire()).toHaveLength(0);
    });

    it('fired alert appears in getFiredAlerts', () => {
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Test',
        triggerAt: new Date('2026-03-22T17:00:00'),
      });

      manager.markFired(alert.id);
      const fired = manager.getFiredAlerts();
      expect(fired).toHaveLength(1);
      expect(fired[0].label).toBe('Test');
    });
  });

  describe('getActiveAlerts', () => {
    it('excludes fired and dismissed alerts', () => {
      const a1 = manager.addAlert({ type: 'custom', label: 'Active', triggerAt: new Date('2026-03-22T19:00:00') });
      const a2 = manager.addAlert({ type: 'custom', label: 'Fired', triggerAt: new Date('2026-03-22T17:00:00') });
      const a3 = manager.addAlert({ type: 'custom', label: 'Dismissed', triggerAt: new Date('2026-03-22T19:30:00') });

      manager.markFired(a2.id);
      manager.dismissAlert(a3.id);

      const active = manager.getActiveAlerts();
      expect(active).toHaveLength(1);
      expect(active[0].label).toBe('Active');
    });

    it('returns alerts sorted by triggerAt ascending', () => {
      manager.addAlert({ type: 'custom', label: 'Later', triggerAt: new Date('2026-03-22T20:00:00') });
      manager.addAlert({ type: 'custom', label: 'Sooner', triggerAt: new Date('2026-03-22T18:30:00') });
      manager.addAlert({ type: 'custom', label: 'Middle', triggerAt: new Date('2026-03-22T19:00:00') });

      const active = manager.getActiveAlerts();
      expect(active.map(a => a.label)).toEqual(['Sooner', 'Middle', 'Later']);
    });
  });

  describe('getFiredAlerts', () => {
    it('returns fired=true, dismissed=false alerts', () => {
      const a1 = manager.addAlert({ type: 'custom', label: 'Fired only', triggerAt: new Date('2026-03-22T17:00:00') });
      const a2 = manager.addAlert({ type: 'custom', label: 'Fired+dismissed', triggerAt: new Date('2026-03-22T17:30:00') });
      const a3 = manager.addAlert({ type: 'custom', label: 'Not fired', triggerAt: new Date('2026-03-22T19:00:00') });

      manager.markFired(a1.id);
      manager.markFired(a2.id);
      manager.dismissAlert(a2.id);

      const fired = manager.getFiredAlerts();
      expect(fired).toHaveLength(1);
      expect(fired[0].label).toBe('Fired only');
    });
  });

  describe('getActiveCount', () => {
    it('returns correct count', () => {
      expect(manager.getActiveCount()).toBe(0);

      manager.addAlert({ type: 'custom', label: 'A1', triggerAt: new Date('2026-03-22T19:00:00') });
      expect(manager.getActiveCount()).toBe(1);

      const a2 = manager.addAlert({ type: 'custom', label: 'A2', triggerAt: new Date('2026-03-22T19:30:00') });
      expect(manager.getActiveCount()).toBe(2);

      manager.markFired(a2.id);
      expect(manager.getActiveCount()).toBe(1);
    });
  });

  describe('reset', () => {
    it('clears all alerts', () => {
      manager.addAlert({ type: 'custom', label: 'A1', triggerAt: new Date('2026-03-22T19:00:00') });
      manager.addAlert({ type: 'custom', label: 'A2', triggerAt: new Date('2026-03-22T19:30:00') });

      expect(manager.getActiveCount()).toBe(2);
      manager.reset();
      expect(manager.getActiveCount()).toBe(0);
      expect(manager.getActiveAlerts()).toHaveLength(0);
      expect(manager.getFiredAlerts()).toHaveLength(0);
    });
  });

  describe('alert in the past', () => {
    it('fires immediately on next getAlertsToFire check', () => {
      // triggerAt is in the past
      manager.addAlert({
        type: 'custom',
        label: 'Past alert',
        triggerAt: new Date('2026-03-22T17:00:00'),
      });

      const toFire = manager.getAlertsToFire();
      expect(toFire).toHaveLength(1);
      expect(toFire[0].label).toBe('Past alert');
    });
  });

  describe('multiple alerts for same tournament', () => {
    it('allows multiple alerts for the same tournamentId', () => {
      manager.addAlert({
        type: 'late-reg',
        label: '5min before',
        triggerAt: new Date('2026-03-22T19:55:00'),
        tournamentId: 'tourn-1',
      });

      manager.addAlert({
        type: 'late-reg',
        label: '10min before',
        triggerAt: new Date('2026-03-22T19:50:00'),
        tournamentId: 'tourn-1',
      });

      expect(manager.getActiveCount()).toBe(2);
      const active = manager.getActiveAlerts();
      expect(active.every(a => a.tournamentId === 'tourn-1')).toBe(true);
    });
  });

  describe('re-fire alert', () => {
    it('allows re-firing by setting fired back to false', () => {
      const alert = manager.addAlert({
        type: 'custom',
        label: 'Refirable',
        triggerAt: new Date('2026-03-22T17:00:00'),
      });

      manager.markFired(alert.id);
      expect(manager.getAlertsToFire()).toHaveLength(0);
      expect(manager.getFiredAlerts()).toHaveLength(1);

      manager.unmarkFired(alert.id);
      expect(manager.getAlertsToFire()).toHaveLength(1);
      expect(manager.getFiredAlerts()).toHaveLength(0);
    });
  });

  describe('hasDuplicateLateReg', () => {
    it('detects existing alert with same tournamentId and similar triggerAt (within 1 minute)', () => {
      manager.addAlert({
        type: 'late-reg',
        label: 'Late Reg: Test - 10min',
        triggerAt: new Date('2026-03-22T19:50:00'),
        tournamentId: 'tourn-1',
      });

      expect(manager.hasDuplicateLateReg('tourn-1', new Date('2026-03-22T19:50:30'))).toBe(true);
      expect(manager.hasDuplicateLateReg('tourn-1', new Date('2026-03-22T19:52:00'))).toBe(false);
      expect(manager.hasDuplicateLateReg('tourn-2', new Date('2026-03-22T19:50:00'))).toBe(false);
    });
  });
});
