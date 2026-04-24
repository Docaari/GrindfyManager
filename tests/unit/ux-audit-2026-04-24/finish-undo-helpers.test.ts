import { describe, it, expect } from 'vitest';
import {
  captureFinishSnapshot,
  buildUndoFinishPayload,
  UNDO_FINISH_TOAST_DURATION_MS,
} from '../../../client/src/components/grind-session-live/finish-undo-helpers';

// =============================================================================
// UX Audit 2026-04-24 — GL-B: GG! com undo toast
// =============================================================================

describe('captureFinishSnapshot', () => {
  it('captura status, result, bounty, position e endTime', () => {
    const snap = captureFinishSnapshot({
      id: 't1',
      status: 'registered',
      result: '0',
      bounty: '0',
      position: null,
      startTime: '2026-04-24T20:00:00.000Z',
      endTime: null,
    });
    expect(snap).toEqual({
      tournamentId: 't1',
      prevStatus: 'registered',
      prevResult: '0',
      prevBounty: '0',
      prevPosition: null,
      prevEndTime: null,
      prevStartTime: '2026-04-24T20:00:00.000Z',
    });
  });

  it('normaliza result/bounty numericos para string', () => {
    const snap = captureFinishSnapshot({
      id: 't1',
      status: 'registered',
      result: 50,
      bounty: 10,
      position: 3,
      startTime: null,
      endTime: null,
    });
    expect(snap?.prevResult).toBe('50');
    expect(snap?.prevBounty).toBe('10');
    expect(snap?.prevPosition).toBe(3);
  });

  it('converte Date para ISO string', () => {
    const now = new Date('2026-04-24T18:00:00.000Z');
    const snap = captureFinishSnapshot({
      id: 't1',
      status: 'registered',
      startTime: now,
      endTime: null,
    });
    expect(snap?.prevStartTime).toBe('2026-04-24T18:00:00.000Z');
  });

  it('retorna null para input invalido', () => {
    expect(captureFinishSnapshot(null)).toBeNull();
    expect(captureFinishSnapshot(undefined)).toBeNull();
    expect(captureFinishSnapshot({ id: '' } as any)).toBeNull();
  });

  it('default status "registered" quando ausente', () => {
    const snap = captureFinishSnapshot({ id: 't1' });
    expect(snap?.prevStatus).toBe('registered');
  });

  it('default result/bounty "0" quando null/undefined', () => {
    const snap = captureFinishSnapshot({ id: 't1' });
    expect(snap?.prevResult).toBe('0');
    expect(snap?.prevBounty).toBe('0');
  });
});

describe('buildUndoFinishPayload', () => {
  it('constroi payload para restaurar status anterior', () => {
    const payload = buildUndoFinishPayload({
      tournamentId: 't1',
      prevStatus: 'registered',
      prevResult: '0',
      prevBounty: '0',
      prevPosition: null,
      prevEndTime: null,
      prevStartTime: '2026-04-24T20:00:00.000Z',
    });
    expect(payload).toEqual({
      id: 't1',
      data: {
        status: 'registered',
        result: '0',
        bounty: '0',
        position: null,
        endTime: null,
        startTime: '2026-04-24T20:00:00.000Z',
      },
    });
  });

  it('preserva bounty e result nao-zero (torneio finalizado com dados)', () => {
    // Caso edge: usuario registrou resultado e depois clicou GG!
    // Undo deve restaurar o result/bounty anteriores, nao zera-los
    const payload = buildUndoFinishPayload({
      tournamentId: 't1',
      prevStatus: 'registered',
      prevResult: '50.00',
      prevBounty: '10.00',
      prevPosition: 3,
      prevEndTime: null,
      prevStartTime: null,
    });
    expect(payload.data.result).toBe('50.00');
    expect(payload.data.bounty).toBe('10.00');
    expect(payload.data.position).toBe(3);
  });
});

describe('UNDO_FINISH_TOAST_DURATION_MS', () => {
  it('e 8000ms (8 segundos)', () => {
    expect(UNDO_FINISH_TOAST_DURATION_MS).toBe(8000);
  });
});
