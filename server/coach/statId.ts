// server/coach/statId.ts — MDA-1 (ADR-230 / D-5)
//
// Validacao compartilhada de statId entre MDA + study-sessions (EST-3), evitando
// divergencia. statId aceita catalog id (via getStatById) OU custom_* (shape
// ^custom_[A-Za-z0-9_-]{1,48}$). Bloqueia path traversal / chars invalidos.
//
// TODO(EST-3 MEDIUM-1): custom_* validado so por shape; o irmao statsAnalyzer
// checa ownership via getUserCustomStatIds(userId). Sem ownership, um custom_*
// inexistente cria grupo orfao na revisao — sem dano de seguranca (statId nunca
// toca o FS). Herdado por MDA sem dívida nova.

import { getStatById } from "@shared/hud-stat-catalog";

export { getStatById };

export const CUSTOM_STAT_RE = /^custom_[A-Za-z0-9_-]{1,48}$/;

export function isValidStatId(statId: string): boolean {
  if (typeof statId !== "string" || statId.length === 0) return false;
  if (statId.startsWith("custom_")) return CUSTOM_STAT_RE.test(statId);
  return !!getStatById(statId);
}
