// =============================================================================
// playerLevel — Sprint AI-1A / RF-08 (ADR-154)
//
// estimatePlayerLevel(input): heuristica rule-based (sem ML) para estimar o
// nivel do jogador a partir de metricas agregadas. Funcao PURA — sem DB/env/Date
// (accountAgeMonths vem pronto no input; abiUSD ja normalizado pra USD pelo
// handler — lesson #6).
//
// Niveis: sem_dados / iniciando / micro_ascensao / mid_consistente / high_stakes
//         / recreativo_serio
// Tie-break: high_stakes > mid_consistente > micro_ascensao > recreativo_serio > iniciando
// =============================================================================

export type PlayerLevel =
  | "sem_dados"
  | "iniciando"
  | "micro_ascensao"
  | "mid_consistente"
  | "high_stakes"
  | "recreativo_serio";

export interface LevelEstimateInput {
  abiUSD: number | null;
  volumeAllTime: number;
  volumeLast90d: number;
  roiAllTime: number | null;
  roiLast90d: number | null;
  distinctNetworks: number;
  accountAgeMonths: number;
  subscriptionPlan: string;
}

export interface LevelEstimate {
  nivel: PlayerLevel;
  confidence: "low" | "medium" | "high";
  humanLabel: string;
  evidence: {
    abiUSD: number | null;
    volumeAllTime: number;
    volumeLast90d: number;
    roiAllTime: number | null;
    distinctNetworks: number;
    accountAgeMonths: number;
  };
  note?: string;
}

const HUMAN_LABELS: Record<PlayerLevel, string> = {
  sem_dados: "ainda sem dados suficientes",
  iniciando: "comecando a jornada",
  micro_ascensao: "micro grinder em ascensao",
  mid_consistente: "mid-stakes consistente",
  high_stakes: "high-stakes",
  recreativo_serio: "recreativo serio",
};

// Prioridade do tie-break (maior = vence).
const PRIORITY: Record<PlayerLevel, number> = {
  high_stakes: 5,
  mid_consistente: 4,
  micro_ascensao: 3,
  recreativo_serio: 2,
  iniciando: 1,
  sem_dados: 0,
};

const NOTE_SEM_DADOS =
  "amostra insuficiente — joga mais que importou os dados pra eu ter certeza";

export function estimatePlayerLevel(input: LevelEstimateInput): LevelEstimate {
  const abi = input.abiUSD;
  const volAll = input.volumeAllTime ?? 0;
  const vol90 = input.volumeLast90d ?? 0;
  const roiAll = input.roiAllTime;
  const roi90 = input.roiLast90d;
  const ageMonths = input.accountAgeMonths ?? 0;

  const evidence = {
    abiUSD: abi ?? null,
    volumeAllTime: volAll,
    volumeLast90d: vol90,
    roiAllTime: roiAll ?? null,
    distinctNetworks: input.distinctNetworks ?? 0,
    accountAgeMonths: ageMonths,
  };

  // sem_dados: amostra insuficiente — curto-circuito.
  if (volAll < 30 || abi == null) {
    return {
      nivel: "sem_dados",
      confidence: "low",
      humanLabel: HUMAN_LABELS.sem_dados,
      evidence,
      note: NOTE_SEM_DADOS,
    };
  }

  // Coleta todas as regras que batem -> tie-break por prioridade.
  const matched: Array<{ nivel: PlayerLevel; confidence: "low" | "medium" | "high" }> = [];

  // high_stakes
  if (abi >= 215 && volAll >= 200) {
    matched.push({ nivel: "high_stakes", confidence: vol90 >= 100 ? "high" : "medium" });
  }

  // mid_consistente
  if (
    abi >= 33 &&
    abi < 215 &&
    vol90 >= 80 &&
    roi90 != null &&
    roi90 >= -5 &&
    ageMonths >= 6
  ) {
    matched.push({
      nivel: "mid_consistente",
      confidence: vol90 >= 150 && roiAll != null ? "high" : "medium",
    });
  }

  // micro_ascensao
  if (abi < 33 && vol90 >= 80) {
    matched.push({ nivel: "micro_ascensao", confidence: "medium" });
  }

  // recreativo_serio — volume baixo, conta antiga, ROI positivo, NAO bateu mid/micro por volume.
  const bateuVolumeAlto = vol90 >= 80; // mid (com abi>=33) ou micro (com abi<33) precisam vol90>=80
  if (
    !bateuVolumeAlto &&
    ageMonths >= 12 &&
    volAll >= 100 &&
    roiAll != null &&
    roiAll > 0
  ) {
    matched.push({ nivel: "recreativo_serio", confidence: "medium" });
  }

  if (matched.length > 0) {
    matched.sort((a, b) => PRIORITY[b.nivel] - PRIORITY[a.nivel]);
    const chosen = matched[0];
    return {
      nivel: chosen.nivel,
      confidence: chosen.confidence,
      humanLabel: HUMAN_LABELS[chosen.nivel],
      evidence,
    };
  }

  // iniciando — fallback (conta nova OU volume baixo).
  return {
    nivel: "iniciando",
    confidence: "low",
    humanLabel: HUMAN_LABELS.iniciando,
    evidence,
  };
}
