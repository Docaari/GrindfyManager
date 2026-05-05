/**
 * Warm-up duration modes — 6m / 15m / 30m
 *
 * Tempos por bloco em segundos. Setup Fisico nao conta no timer global
 * (nao tem `seconds`). Timer global = soma dos blocos cronometrados.
 *
 * Ordem: Setup Fisico -> Respiracao -> Foco semana (Heuristicas) -> Intencao -> PFC.
 */

export type WarmupMode = "6m" | "15m" | "30m";

export interface WarmupModeConfig {
  mode: WarmupMode;
  label: string;
  // Segundos por bloco cronometrado
  breathingSeconds: number;
  heuristicsSeconds: number;
  intentionSeconds: number;
  pfcSeconds: number;
}

// Tempos ajustados para somar EXATO o label (6/15/30 min).
// Intencao OPCIONAL encurtada nos modos 6m/15m para fechar a soma sem
// sacrificar Respiracao ou Drills (priorizados pela spec do founder).
export const MODE_CONFIGS: Record<WarmupMode, WarmupModeConfig> = {
  "6m": {
    mode: "6m",
    label: "6 min",
    breathingSeconds: 60,    // 1m
    heuristicsSeconds: 60,   // 1m
    intentionSeconds: 60,    // 1m (opcional; encurtado de 2m)
    pfcSeconds: 180,         // 3m
  },                         // total 6m
  "15m": {
    mode: "15m",
    label: "15 min",
    breathingSeconds: 360,   // 6m
    heuristicsSeconds: 120,  // 2m
    intentionSeconds: 60,    // 1m (opcional; encurtado de 2m)
    pfcSeconds: 360,         // 6m
  },                         // total 15m
  "30m": {
    mode: "30m",
    label: "30 min",
    breathingSeconds: 720,   // 12m
    heuristicsSeconds: 180,  // 3m
    intentionSeconds: 180,   // 3m
    pfcSeconds: 720,         // 12m
  },                         // total 30m
};

export function totalSeconds(mode: WarmupMode): number {
  const c = MODE_CONFIGS[mode];
  return c.breathingSeconds + c.heuristicsSeconds + c.intentionSeconds + c.pfcSeconds;
}
