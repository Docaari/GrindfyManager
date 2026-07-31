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
  /**
   * Cor da faixa. As faixas são ORDINAIS (tamanho crescente), então a paleta é
   * de UMA matiz com luminosidade monotônica — não um arco-íris. Em fundo
   * escuro a rampa cresce do escuro para o claro, mantendo o campo maior mais
   * destacado. Validada com o validador de paleta (superfície #111827):
   * lightness monotônica, gaps >= 0.06, matiz única (spread 3 graus) e o passo
   * mais escuro em 2.19:1 contra o fundo.
   */
  color: string;
}

export const FIELD_SIZE_BUCKETS: readonly FieldSizeBucket[] = Object.freeze([
  Object.freeze({ id: "low", label: "Low (<200)", min: 0, max: 200, color: "#184f95" }),
  Object.freeze({ id: "medium", label: "Medium (200-500)", min: 200, max: 500, color: "#256abf" }),
  Object.freeze({ id: "big", label: "Big (500-1500)", min: 500, max: 1500, color: "#3987e5" }),
  Object.freeze({ id: "bigbig", label: "Big Big (1500-5000)", min: 1500, max: 5000, color: "#6da7ec" }),
  Object.freeze({ id: "giant", label: "Giant (5000+)", min: 5000, max: null, color: "#9ec5f4" }),
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

/**
 * Par divergente para valores COM SINAL (lucro, ROI) — polaridade não é ordem,
 * então esses gráficos não usam a rampa das faixas.
 *
 * Escolhido com o validador: `emerald-500 x rose-500`, usado antes no app,
 * reprova (ΔE 5.6 em deuteranopia, abaixo do piso 6 — indistinguíveis para quem
 * não enxerga verde/vermelho). Este par passa todos os checks no fundo escuro,
 * com ΔE 7.2, que é legal porque o sinal também é codificado pela posição da
 * barra em relação ao zero e pelo valor no rótulo.
 */
export const DELTA_COLORS = Object.freeze({
  positive: "#199e70",
  negative: "#d03b3b",
  neutral: "#6b7280",
});

/** Cor de um valor com sinal. */
export function colorForSignedValue(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return DELTA_COLORS.neutral;
  return n > 0 ? DELTA_COLORS.positive : DELTA_COLORS.negative;
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
