import { describe, it, expect } from 'vitest';
import {
  getPendingTournamentsForSessionEnd,
  formatPendingTournamentLabel,
} from '../../../client/src/components/grind-session-live/session-end-helpers';

// =============================================================================
// UX Audit 2026-04-24 — GL-D: Confirm session end lista pendentes
// =============================================================================

describe('getPendingTournamentsForSessionEnd', () => {
  it('filtra apenas torneios com status "registered"', () => {
    const pending = getPendingTournamentsForSessionEnd([
      { id: '1', status: 'registered', name: 'A' },
      { id: '2', status: 'upcoming', name: 'B' },
      { id: '3', status: 'finished', name: 'C' },
      { id: '4', status: 'registered', name: 'D' },
      { id: '5', status: 'deleted', name: 'E' },
    ]);
    expect(pending).toHaveLength(2);
    expect(pending.map((t) => t.id)).toEqual(['1', '4']);
  });

  it('ignora torneios sem id valido', () => {
    const pending = getPendingTournamentsForSessionEnd([
      { status: 'registered', name: 'A' } as any,
      { id: '', status: 'registered', name: 'B' },
      { id: '2', status: 'registered', name: 'C' },
    ]);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('2');
  });

  it('aceita status em maiusculas ou misto', () => {
    const pending = getPendingTournamentsForSessionEnd([
      { id: '1', status: 'REGISTERED', name: 'A' },
      { id: '2', status: 'Registered', name: 'B' },
    ]);
    expect(pending).toHaveLength(2);
  });

  it('retorna array vazio para input invalido', () => {
    expect(getPendingTournamentsForSessionEnd(null)).toEqual([]);
    expect(getPendingTournamentsForSessionEnd(undefined)).toEqual([]);
    expect(getPendingTournamentsForSessionEnd([])).toEqual([]);
  });

  it('preserva site, name, time, buyIn no resultado', () => {
    const pending = getPendingTournamentsForSessionEnd([
      {
        id: '1',
        status: 'registered',
        site: 'Suprema',
        name: 'Big 20',
        time: '20:00',
        buyIn: '20.00',
      },
    ]);
    expect(pending[0]).toMatchObject({
      id: '1',
      site: 'Suprema',
      name: 'Big 20',
      time: '20:00',
      buyIn: '20.00',
    });
  });
});

describe('formatPendingTournamentLabel', () => {
  it('formata com site, name e time', () => {
    const label = formatPendingTournamentLabel({
      id: '1', site: 'Suprema', name: 'Big 20', time: '20:00', buyIn: 20,
    });
    expect(label).toBe('Suprema - Big 20 (20:00)');
  });

  it('omite time quando nao informado', () => {
    const label = formatPendingTournamentLabel({
      id: '1', site: 'Suprema', name: 'Big 20', time: null, buyIn: 20,
    });
    expect(label).toBe('Suprema - Big 20');
  });

  it('usa fallback quando site ou name ausentes', () => {
    const label = formatPendingTournamentLabel({
      id: '1', site: null, name: null, time: '20:00', buyIn: 20,
    });
    expect(label).toBe('Torneio - Sem nome (20:00)');
  });
});
