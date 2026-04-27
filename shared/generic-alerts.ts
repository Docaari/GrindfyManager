/**
 * Generic session alert manager for Grind Live.
 * Handles custom, late-reg and tournament alerts (client-side, transient per session).
 */

import { generateClientId } from './ids';

export const ALERT_TYPES = ['late-reg', 'custom', 'tournament'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export interface SessionAlert {
  id: string;
  tournamentId?: string;
  type: AlertType;
  label: string;
  triggerAt: Date;
  createdAt: Date;
  fired: boolean;
  dismissed: boolean;
  narrationText?: string;
}

export type CreateAlertInput = Omit<SessionAlert, 'id' | 'createdAt' | 'fired' | 'dismissed'>;

export interface CreateTournamentAlertInput {
  tournamentId: string;
  narrationText: string;
  triggerAt: Date;
  label: string;
}

export interface LateRegTournament {
  id: string;
  name: string;
  site: string;
  startTime: Date;
  lateRegMinutes: number;
}

const MAX_ALERTS = 50;

export class SessionAlertManager {
  private alerts: Map<string, SessionAlert> = new Map();

  addAlert(input: CreateAlertInput): SessionAlert {
    if (this.alerts.size >= MAX_ALERTS) {
      throw new Error('Limite de alertas atingido');
    }

    const alert: SessionAlert = {
      ...input,
      id: generateClientId('alert'),
      createdAt: new Date(),
      fired: false,
      dismissed: false,
    };

    this.alerts.set(alert.id, alert);
    return alert;
  }

  addTournamentAlert(input: CreateTournamentAlertInput): SessionAlert {
    return this.addAlert({
      type: 'tournament',
      label: input.label,
      triggerAt: input.triggerAt,
      tournamentId: input.tournamentId,
      narrationText: input.narrationText,
    });
  }

  /**
   * Shortcut to create a late-reg alert.
   * triggerAt = startTime + lateRegMinutes - minutesBefore
   */
  addLateRegAlert(tournament: LateRegTournament, minutesBefore: number): SessionAlert {
    const deadline = new Date(tournament.startTime.getTime() + tournament.lateRegMinutes * 60000);
    const triggerAt = new Date(deadline.getTime() - minutesBefore * 60000);

    return this.addAlert({
      type: 'late-reg',
      label: `Late Reg: ${tournament.name} - ${minutesBefore}min`,
      triggerAt,
      tournamentId: tournament.id,
    });
  }

  /**
   * Create a relative alert ("in X minutes from now").
   */
  addRelativeAlert(label: string, minutesFromNow: number, tournamentId?: string): SessionAlert {
    const triggerAt = new Date(Date.now() + minutesFromNow * 60000);

    return this.addAlert({
      type: 'custom',
      label,
      triggerAt,
      tournamentId,
    });
  }

  /**
   * Remove an alert entirely.
   */
  removeAlert(id: string): void {
    this.alerts.delete(id);
  }

  /**
   * Dismiss an alert (user saw it and acknowledged).
   */
  dismissAlert(id: string): void {
    const alert = this.alerts.get(id);
    if (alert) {
      alert.dismissed = true;
    }
  }

  /**
   * Get alerts that should fire NOW (triggerAt <= now, not fired, not dismissed).
   */
  getAlertsToFire(): SessionAlert[] {
    const now = new Date();
    return Array.from(this.alerts.values()).filter(
      (a) => !a.fired && !a.dismissed && a.triggerAt <= now
    );
  }

  /**
   * Mark an alert as fired.
   */
  markFired(id: string): void {
    const alert = this.alerts.get(id);
    if (alert) {
      alert.fired = true;
    }
  }

  /**
   * Unmark fired (allow re-firing).
   */
  unmarkFired(id: string): void {
    const alert = this.alerts.get(id);
    if (alert) {
      alert.fired = false;
    }
  }

  /**
   * Get all active alerts (not fired, not dismissed), sorted by triggerAt ascending.
   */
  getActiveAlerts(): SessionAlert[] {
    return Array.from(this.alerts.values())
      .filter((a) => !a.fired && !a.dismissed)
      .sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());
  }

  /**
   * Get fired but not dismissed alerts.
   */
  getFiredAlerts(): SessionAlert[] {
    return Array.from(this.alerts.values()).filter(
      (a) => a.fired && !a.dismissed
    );
  }

  /**
   * Count of active (not fired, not dismissed) alerts.
   */
  getActiveCount(): number {
    return Array.from(this.alerts.values()).filter(
      (a) => !a.fired && !a.dismissed
    ).length;
  }

  /**
   * Check if a late-reg alert already exists for this tournament with a similar triggerAt (within 1 minute tolerance).
   */
  hasDuplicateLateReg(tournamentId: string, triggerAt: Date): boolean {
    const tolerance = 60000; // 1 minute
    return Array.from(this.alerts.values()).some(
      (a) =>
        a.tournamentId === tournamentId &&
        !a.dismissed &&
        Math.abs(a.triggerAt.getTime() - triggerAt.getTime()) < tolerance
    );
  }

  /**
   * Clear all alerts.
   */
  reset(): void {
    this.alerts.clear();
  }
}
