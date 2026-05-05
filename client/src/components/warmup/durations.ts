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

export const MODE_CONFIGS: Record<WarmupMode, WarmupModeConfig> = {
  "6m": {
    mode: "6m",
    label: "6 min",
    breathingSeconds: 60,
    heuristicsSeconds: 60,
    intentionSeconds: 120,
    pfcSeconds: 180,
  },
  "15m": {
    mode: "15m",
    label: "15 min",
    breathingSeconds: 360,
    heuristicsSeconds: 120,
    intentionSeconds: 120,
    pfcSeconds: 360,
  },
  "30m": {
    mode: "30m",
    label: "30 min",
    breathingSeconds: 720,
    heuristicsSeconds: 180,
    intentionSeconds: 180,
    pfcSeconds: 720,
  },
};

export function totalSeconds(mode: WarmupMode): number {
  const c = MODE_CONFIGS[mode];
  return c.breathingSeconds + c.heuristicsSeconds + c.intentionSeconds + c.pfcSeconds;
}
