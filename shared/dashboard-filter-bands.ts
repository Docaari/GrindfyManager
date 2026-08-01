/**
 * Faixas usadas pelos filtros do Dashboard (ABI e participantes).
 *
 * Vive em `shared/` porque a MESMA definicao e usada nos dois lados: a tela
 * desenha um botao por faixa e o servidor traduz o id da faixa de volta para um
 * intervalo numerico. So o `id` viaja na URL/query — os numeros nunca cruzam a
 * rede, entao `Infinity` na ultima faixa nao vira `null` no JSON.
 *
 * As faixas de ABI espelham `BUYIN_BUCKETS` (server/scoring/scoringConstants),
 * que ja e o recorte usado pelo Tournament Selector e pela area Torneios — o
 * jogador ve o mesmo "$16-19" nos tres lugares. O servidor nao pode ser
 * importado pelo cliente, entao a lista e redeclarada aqui e um teste de guarda
 * (`tests/unit/dashboard/filter-bands-parity.test.ts`) falha se as duas
 * divergirem.
 *
 * `max` e SEMPRE exclusivo (`min <= valor < max`), igual a `bucketBuyIn`.
 */

export interface FilterBand {
  /** Id estavel — e o que vai para a URL. Nao mudar depois de publicado. */
  id: string;
  /** Rotulo exibido no botao. */
  label: string;
  min: number;
  /** Exclusivo. `Infinity` na ultima faixa. */
  max: number;
}

/** 12 faixas de buy-in em USD. Espelha BUYIN_BUCKETS. */
export const BUYIN_BANDS: FilterBand[] = [
  { id: "abi_1_6", label: "$1-6", min: 0, max: 7 },
  { id: "abi_7_15", label: "$7-15", min: 7, max: 16 },
  { id: "abi_16_19", label: "$16-19", min: 16, max: 20 },
  { id: "abi_20_29", label: "$20-29", min: 20, max: 30 },
  { id: "abi_30_49", label: "$30-49", min: 30, max: 50 },
  { id: "abi_50_70", label: "$50-70", min: 50, max: 71 },
  { id: "abi_71_130", label: "$71-130", min: 71, max: 131 },
  { id: "abi_131_250", label: "$131-250", min: 131, max: 251 },
  { id: "abi_251_350", label: "$251-350", min: 251, max: 351 },
  { id: "abi_351_599", label: "$351-599", min: 351, max: 600 },
  { id: "abi_600_1k", label: "$600-1K", min: 600, max: 1000 },
  { id: "abi_1k_plus", label: "$1K+", min: 1000, max: Infinity },
];

/**
 * Faixas de participantes (tamanho do field). Mantem exatamente os cortes que
 * ja existiam nos botoes rapidos do dashboard — o jogador nao perde referencia.
 */
export const FIELD_BANDS: FilterBand[] = [
  { id: "field_0_99", label: "<100", min: 0, max: 100 },
  { id: "field_100_300", label: "100-300", min: 100, max: 301 },
  { id: "field_300_700", label: "300-700", min: 300, max: 701 },
  { id: "field_700_1500", label: "700-1500", min: 700, max: 1501 },
  { id: "field_1500_3000", label: "1500-3000", min: 1500, max: 3001 },
  { id: "field_3000_6000", label: "3000-6000", min: 3000, max: 6001 },
  { id: "field_6000_12000", label: "6000-12000", min: 6000, max: 12001 },
  { id: "field_12000_plus", label: "12000+", min: 12000, max: Infinity },
];

/**
 * Modificadores que ganham botao proprio no filtro.
 *
 * `satellite` e `flight` sao coisas DIFERENTES e independentes (ADR-031: tipo
 * primario vs modificador ortogonal): um satelite pode ou nao ser multi-flight,
 * e um flight pode ser de um torneio comum. Por isso viram botoes separados em
 * vez de mais um valor dentro do grupo "Tipo".
 */
export const MODIFIER_FILTERS = [
  { id: "satellite", label: "Satélite" },
  { id: "flight", label: "Flight" },
] as const;

export type ModifierFilterId = (typeof MODIFIER_FILTERS)[number]["id"];

/** Traduz ids de faixa em intervalos. Ids desconhecidos sao ignorados. */
export function resolveBands(
  ids: string[] | undefined | null,
  bands: FilterBand[],
): Array<{ min: number; max: number }> {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const byId = new Map(bands.map((b) => [b.id, b]));
  const out: Array<{ min: number; max: number }> = [];
  for (const id of ids) {
    const band = byId.get(String(id));
    if (band) out.push({ min: band.min, max: band.max });
  }
  return out;
}
