/**
 * Finish Undo Helpers (UX 2026-04-24 — GL-B)
 *
 * Suporta um "desfazer" para a acao GG! em Grind Live. Cliques acidentais
 * em GG destroem o registro — permitir undo durante 8s via toast reduz
 * friccao sem bloquear o fluxo rapido de multitable.
 */

export interface FinishUndoSnapshot {
  tournamentId: string;
  prevStatus: string;           // 'registered' tipicamente
  prevResult: string;           // numero como string
  prevBounty: string;           // numero como string
  prevPosition: number | null;
  prevEndTime: string | null;
  prevStartTime: string | null; // preservar para continuidade
}

export interface FinishableTournament {
  id: string;
  status?: string | null;
  result?: string | number | null;
  bounty?: string | number | null;
  position?: number | null;
  endTime?: string | Date | null;
  startTime?: string | Date | null;
}

function toIsoOrNull(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toStringOrZero(value: string | number | null | undefined): string {
  if (value == null) return '0';
  if (typeof value === 'number') return String(value);
  return value || '0';
}

/**
 * Cria um snapshot do torneio ANTES de aplicar finish. O snapshot e usado
 * para construir o payload de undo (revert to prev state).
 */
export function captureFinishSnapshot(
  tournament: FinishableTournament | null | undefined,
): FinishUndoSnapshot | null {
  if (!tournament || !tournament.id) return null;
  return {
    tournamentId: tournament.id,
    prevStatus: tournament.status ?? 'registered',
    prevResult: toStringOrZero(tournament.result),
    prevBounty: toStringOrZero(tournament.bounty),
    prevPosition: tournament.position ?? null,
    prevEndTime: toIsoOrNull(tournament.endTime),
    prevStartTime: toIsoOrNull(tournament.startTime),
  };
}

/**
 * Constroi o payload de mutation para reverter um finish — envia o estado
 * anterior preservado no snapshot.
 */
export function buildUndoFinishPayload(snapshot: FinishUndoSnapshot): {
  id: string;
  data: Record<string, unknown>;
} {
  return {
    id: snapshot.tournamentId,
    data: {
      status: snapshot.prevStatus,
      result: snapshot.prevResult,
      bounty: snapshot.prevBounty,
      position: snapshot.prevPosition,
      endTime: snapshot.prevEndTime,
      startTime: snapshot.prevStartTime,
    },
  };
}

/**
 * Duracao padrao do toast de undo (ms). Tempo suficiente para reagir em
 * multitable mas curto o suficiente para nao atrapalhar o flow.
 */
export const UNDO_FINISH_TOAST_DURATION_MS = 8000;
