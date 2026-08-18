// =============================================================================
// Regra de horario ao soltar um torneio numa celula da grade semanal.
//
// O que o jogador espera (e o que estava errado antes, que reescrevia o
// horario em todo drop):
//
//   - Soltar num bloco de hora DIFERENTE (10:00 -> 11:00) muda o horario para
//     o inicio do bloco de destino (11:00).
//   - Soltar dentro do MESMO bloco (inclusive em outro dia na mesma hora) NAO
//     mexe no horario — o arrasto ali e so reordenacao.
//   - Reordenando, se o torneio for solto ABAIXO de um que comeca mais tarde
//     (ex: abaixo de um 11:30), ele assume o minuto seguinte (11:31) para a
//     ordem bater com o horario.
//
// Escreve no campo que MANDA na posicao da celula: `registrationTime` quando
// existe (a grade bucketiza por ele via getDisplayRegistrationTime), senao
// `time`. Sem isso o chip "voltava" para o bloco antigo depois do drop.
//
// Funcao pura — client e testes.
// =============================================================================

import { getDisplayRegistrationTime } from "./grade-time";

export interface GradeDropTournament {
  id?: string;
  dayOfWeek?: number;
  time?: string | null;
  registrationTime?: string | null;
  lateRegMinutes?: number | null;
}

export interface ComputeGradeDropInput {
  /** Torneio arrastado. */
  dragged: GradeDropTournament;
  /** Bloco de origem ("HH:00") — null quando veio de fora da grade. */
  sourceSlot: string | null;
  /** Bloco de destino ("HH:00"). */
  destSlot: string;
  /** Dia de destino (0=Dom .. 6=Sab). */
  destDayOfWeek: number;
  /**
   * Torneios ja presentes na celula de destino, na ordem em que aparecem e
   * SEM o torneio arrastado.
   */
  destNeighbors: GradeDropTournament[];
  /** Indice do drop dentro da celula de destino (react-beautiful-dnd). */
  destIndex: number;
}

export interface ComputeGradeDropResult {
  updates: Record<string, any>;
}

function toMinutes(time: string | null | undefined): number | null {
  if (!time || typeof time !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function toHHMM(totalMinutes: number): string {
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function computeGradeDropUpdates(
  input: ComputeGradeDropInput,
): ComputeGradeDropResult {
  const { dragged, sourceSlot, destSlot, destDayOfWeek, destNeighbors, destIndex } =
    input;

  const updates: Record<string, any> = {};
  if (dragged.dayOfWeek !== destDayOfWeek) {
    updates.dayOfWeek = destDayOfWeek;
  }

  const destSlotMinutes = toMinutes(destSlot);
  if (destSlotMinutes === null) return { updates };

  const currentDisplay = getDisplayRegistrationTime(dragged);
  const currentMinutes = toMinutes(currentDisplay);

  // Mesmo bloco (mesma hora, mesmo em outro dia) preserva o horario digitado.
  const sameSlot = sourceSlot !== null && sourceSlot === destSlot;
  let targetMinutes =
    sameSlot && currentMinutes !== null ? currentMinutes : destSlotMinutes;

  // Vizinho imediatamente acima na celula de destino.
  const above =
    destIndex > 0 && destIndex - 1 < destNeighbors.length
      ? destNeighbors[destIndex - 1]
      : null;
  const aboveMinutes = above ? toMinutes(getDisplayRegistrationTime(above)) : null;

  if (aboveMinutes !== null && aboveMinutes >= targetMinutes) {
    // Fica um minuto depois do de cima, sem vazar para o bloco seguinte.
    const slotEnd = destSlotMinutes + 59;
    targetMinutes = Math.min(aboveMinutes + 1, slotEnd);
  }

  const newTime = toHHMM(targetMinutes);

  // Escreve no campo que a grade usa para posicionar o chip.
  const usesRegistrationTime =
    typeof dragged.registrationTime === "string" &&
    dragged.registrationTime.trim() !== "";

  if (usesRegistrationTime) {
    if (dragged.registrationTime !== newTime) updates.registrationTime = newTime;
  } else if ((dragged.time ?? "") !== newTime) {
    updates.time = newTime;
    // lateRegMinutes deslocaria o chip de novo apos o drop — ao mover pelo
    // horario de inicio, o offset deixa de valer.
    if (typeof dragged.lateRegMinutes === "number" && dragged.lateRegMinutes > 0) {
      updates.registrationTime = newTime;
    }
  }

  return { updates };
}
