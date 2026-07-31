/**
 * field-size-buckets — faixas de TAMANHO DE FIELD.
 *
 * A aba "Participantes" agrupava por percentual de eliminação (Top 5%, 5-10%,
 * …), o que responde "quão longe eu fui", não "como eu performo conforme o
 * tamanho do field". Estas faixas respondem a segunda pergunta, que é a decisão
 * real de seleção de torneio: campo pequeno paga mais rápido e tem variância
 * menor; campo gigante tem prêmio maior e ITM mais raro.
 *
 * Faixas definidas pelo founder:
 *   Low      < 200
 *   Medium   200 – 500
 *   Big      500 – 1500
 *   Big Big  1500 – 5000
 *   Giant    >= 5000
 *
 * Funções PURAS, sem I/O. Limites em `[min, max)` — sem sobreposição nem buraco.
 */

export interface FieldSizeBucket {
  /** Identificador estável (não traduzir). */
  id: "low" | "medium" | "big" | "bigbig" | "giant";
  /** Rótulo exibido no gráfico. */
  label: string;
  /** Limite inferior (inclusivo). */
  min: number;
  /** Limite superior (exclusivo). `null` = sem teto. */
  max: number | null;
  /** Cor do menor (frio) ao maior (quente) campo. */
  color: string;
}

export const FIELD_SIZE_BUCKETS: readonly FieldSizeBucket[] = Object.freeze([
  Object.freeze({ id: "low", label: "Low (<200)", min: 0, max: 200, color: "#60a5fa" }),
  Object.freeze({ id: "medium", label: "Medium (200-500)", min: 200, max: 500, color: "#34d399" }),
  Object.freeze({ id: "big", label: "Big (500-1500)", min: 500, max: 1500, color: "#fbbf24" }),
  Object.freeze({ id: "bigbig", label: "Big Big (1500-5000)", min: 1500, max: 5000, color: "#f97316" }),
  Object.freeze({ id: "giant", label: "Giant (5000+)", min: 5000, max: null, color: "#ef4444" }),
]);

/** Faixa de um field. `null` quando o torneio não informa participantes. */
export function bucketForFieldSize(fieldSize: unknown): FieldSizeBucket | null {
  if (fieldSize === null || fieldSize === undefined || fieldSize === "") return null;
  const n = typeof fieldSize === "number" ? fieldSize : Number(fieldSize);
  if (!Number.isFinite(n) || n <= 0) return null;
  for (const b of FIELD_SIZE_BUCKETS) {
    if (n >= b.min && (b.max === null || n < b.max)) return b;
  }
  return null;
}

/** Rótulo da faixa, ou null. Atalho para uso em UI. */
export function fieldSizeBucketLabel(fieldSize: unknown): string | null {
  return bucketForFieldSize(fieldSize)?.label ?? null;
}

/** Mapa rótulo -> cor, no formato que os gráficos consomem. */
export const FIELD_SIZE_BUCKET_COLORS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(FIELD_SIZE_BUCKETS.map((b) => [b.label, b.color])),
);

/**
 * Expressão SQL que traduz uma coluna de field size no rótulo da faixa.
 * Mantida junto da definição para os limites nunca divergirem entre app e banco.
 */
export function fieldSizeBucketSqlCase(column: string): string {
  const whens = FIELD_SIZE_BUCKETS.map((b) => {
    const upper = b.max === null ? "" : ` AND ${column} < ${b.max}`;
    return `WHEN ${column} >= ${b.min}${upper} THEN '${b.label}'`;
  }).join("\n      ");
  return `CASE\n      ${whens}\n      ELSE NULL\n    END`;
}
