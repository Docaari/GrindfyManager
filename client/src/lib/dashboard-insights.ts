/**
 * Dicas por aba do dashboard.
 *
 * Regra deterministica, SEM IA: o mesmo histórico sempre gera a mesma frase, o
 * cálculo é instantâneo e dá para testar. Tudo aqui é função pura — recebe o que
 * a aba já carregou e devolve texto. Nenhuma chamada de rede.
 *
 * Honestidade estatística é requisito, não enfeite:
 *  - com poucos torneios a dica sai marcada como amostra pequena, e o texto
 *    evita veredito ("tendência" em vez de "seu gargalo é X");
 *  - comparação só entre faixas que tenham volume mínimo — senão um único
 *    torneio premiado vira "sua melhor faixa";
 *  - quando não dá para afirmar nada, devolve `null` e a aba não mostra faixa
 *    nenhuma. Melhor silêncio do que conselho inventado.
 */

/** Volume mínimo numa faixa para ela entrar numa comparação. */
export const MIN_BUCKET_VOLUME = 30;
/** Abaixo disso a dica sai, mas avisando que a amostra é curta. */
export const LOW_SAMPLE_VOLUME = 10;

export type InsightTone = 'good' | 'bad' | 'neutral';

export interface TabInsight {
  /** Frase principal, já em PT-BR e pronta para exibir. */
  headline: string;
  /** Complemento opcional (o "e daí?"). */
  detail?: string;
  tone: InsightTone;
  /** true quando a conclusão se apoia em pouca amostra. */
  lowSample: boolean;
  /**
   * true quando existe dado na aba, mas pouco demais para comparar. Nesse caso a
   * faixa aparece explicando o silêncio em vez de sumir — silêncio puro é
   * indistinguível de tela quebrada (relato do founder em 2026-08-01).
   */
  insufficient?: boolean;
}

/**
 * "Tenho dado, mas não o bastante para afirmar." Sempre acionável: diz o que
 * fazer para a dica aparecer.
 */
function insufficientInsight(totalVolume: number): TabInsight {
  return {
    headline:
      totalVolume > 0
        ? `Poucos torneios neste recorte (${totalVolume}) para comparar com honestidade.`
        : 'Sem torneios suficientes neste recorte para comparar.',
    detail: `São necessários pelo menos ${LOW_SAMPLE_VOLUME} torneios em cada faixa. Amplie o período ou solte algum filtro.`,
    tone: 'neutral',
    lowSample: true,
    insufficient: true,
  };
}

/** Faixa genérica comparável (site, ABI, tipo, velocidade...). */
export interface InsightBucket {
  label: string;
  volume: number;
  profit: number;
  buyins: number;
  roi: number;
  avgProfit?: number;
  itmRate?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converte string|number|null em número finito (0 quando não dá). */
export function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatUsd(value: number): string {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded).toLocaleString('pt-BR');
  return `${rounded < 0 ? '-' : ''}$${abs}`;
}

export function formatPct(value: number): string {
  return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(1)}%`;
}

/** Soma de torneios de todas as faixas — usada na mensagem de amostra curta. */
function totalVolume(buckets: Array<{ volume: number }>): number {
  return buckets.reduce((sum, b) => sum + (Number(b.volume) || 0), 0);
}

/** Faixas com volume suficiente para comparar, da melhor para a pior por ROI. */
function comparable(buckets: InsightBucket[], minVolume: number): InsightBucket[] {
  return buckets
    .filter((b) => b.volume >= minVolume)
    .sort((a, b) => b.roi - a.roi);
}

/**
 * Escolhe o volume mínimo utilizável: tenta o ideal e, se sobrar menos de duas
 * faixas, cai para o mínimo tolerado — sinalizando amostra curta.
 */
function pickComparable(buckets: InsightBucket[]): { rows: InsightBucket[]; lowSample: boolean } {
  const strict = comparable(buckets, MIN_BUCKET_VOLUME);
  if (strict.length >= 2) return { rows: strict, lowSample: false };
  const loose = comparable(buckets, LOW_SAMPLE_VOLUME);
  if (loose.length >= 2) return { rows: loose, lowSample: true };
  return { rows: [], lowSample: true };
}

/**
 * O gargalo não é simplesmente a pior faixa: é onde o dinheiro sangra. Entre as
 * faixas com ROI negativo, a que teve MAIS investimento — perder 40% em algo que
 * você quase não joga não é o problema; perder 5% no que consome metade da sua
 * banca é.
 */
function findBottleneck(rows: InsightBucket[]): InsightBucket | null {
  const losing = rows.filter((b) => b.roi < 0 && b.buyins > 0);
  if (losing.length === 0) return null;
  return losing.reduce((worst, cur) => (cur.buyins > worst.buyins ? cur : worst));
}

/** Compara melhor x pior faixa e aponta o gargalo. Base das abas por categoria. */
function buildComparisonInsight(
  buckets: InsightBucket[],
  opts: { noun: string; metric?: 'roi' | 'avgProfit' },
): TabInsight | null {
  const { rows, lowSample } = pickComparable(buckets);
  if (rows.length < 2) {
    return buckets.length > 0 ? insufficientInsight(totalVolume(buckets)) : null;
  }

  const best = rows[0];
  const worst = rows[rows.length - 1];
  if (best.label === worst.label) return null;

  const metric = opts.metric ?? 'roi';
  const headline =
    metric === 'avgProfit'
      ? `Seu lucro médio por torneio é ${formatUsd(best.avgProfit ?? 0)} em ${best.label} contra ${formatUsd(worst.avgProfit ?? 0)} em ${worst.label}.`
      : `Seu ROI é ${formatPct(best.roi)} em ${best.label} contra ${formatPct(worst.roi)} em ${worst.label} (${best.volume} x ${worst.volume} torneios).`;

  const bottleneck = findBottleneck(rows);
  let detail: string | undefined;
  if (bottleneck) {
    detail = `Gargalo: ${bottleneck.label} — ${formatUsd(bottleneck.buyins)} investidos com ROI ${formatPct(bottleneck.roi)}, ${formatUsd(bottleneck.profit)} no resultado.`;
  } else {
    detail = `Nenhum ${opts.noun} com ROI negativo no período — o ajuste aqui é de alocação, não de corte.`;
  }

  return {
    headline,
    detail,
    tone: bottleneck ? 'bad' : 'good',
    lowSample,
  };
}

// ---------------------------------------------------------------------------
// Normalizadores — cada endpoint tem nome de campo próprio
// ---------------------------------------------------------------------------

function toBuckets(data: any, labelKey: string): InsightBucket[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row: any) => ({
      label: String(row?.[labelKey] ?? '').trim(),
      volume: num(row?.volume),
      profit: num(row?.profit),
      buyins: num(row?.buyins),
      roi: num(row?.roi),
      avgProfit: row?.avgProfit !== undefined ? num(row.avgProfit) : undefined,
    }))
    .filter((b) => b.label.length > 0 && b.volume > 0);
}

// ---------------------------------------------------------------------------
// Dicas por aba
// ---------------------------------------------------------------------------

export function buildSiteInsight(data: any): TabInsight | null {
  return buildComparisonInsight(toBuckets(data, 'site'), { noun: 'site' });
}

export function buildBuyinInsight(data: any): TabInsight | null {
  const buckets = toBuckets(data, 'buyinRange');
  const insight = buildComparisonInsight(buckets, { noun: 'buy-in', metric: 'avgProfit' });
  if (!insight) return null;

  // Acima do buy-in de conforto o resultado costuma virar. Procura a primeira
  // faixa negativa acima da faixa onde está o maior volume.
  const { rows } = pickComparable(buckets);
  const byVolume = [...rows].sort((a, b) => b.volume - a.volume);
  const home = byVolume[0];
  if (home) {
    const homeIdx = buckets.findIndex((b) => b.label === home.label);
    const above = buckets.slice(homeIdx + 1).filter((b) => b.volume >= LOW_SAMPLE_VOLUME);
    const firstNegative = above.find((b) => b.roi < 0);
    if (firstNegative) {
      insight.detail = `Você joga mais em ${home.label} (${home.volume} torneios). Acima disso o resultado vira: ${firstNegative.label} está em ${formatPct(firstNegative.roi)}.`;
    }
  }
  return insight;
}

export function buildCategoryInsight(data: any): TabInsight | null {
  return buildComparisonInsight(toBuckets(data, 'category'), { noun: 'tipo' });
}

export function buildSpeedInsight(data: any): TabInsight | null {
  return buildComparisonInsight(toBuckets(data, 'speed'), { noun: 'velocidade' });
}

/**
 * Período: dia da semana. Aqui a régua é LUCRO, não ROI — o jogador enxerga
 * "domingo me custou $X", não "domingo rendeu -3%".
 */
export function buildDayOfWeekInsight(data: any): TabInsight | null {
  if (!Array.isArray(data)) return null;
  const days = data
    .map((row: any) => ({
      label: String(row?.dayName ?? '').trim(),
      volume: num(row?.volume),
      profit: num(row?.profit),
      roi: num(row?.roi),
      buyins: 0,
    }))
    .filter((d) => d.label.length > 0 && d.volume > 0);

  if (days.length < 2) {
    return days.length > 0 ? insufficientInsight(totalVolume(days)) : null;
  }

  const lowSample = days.some((d) => d.volume < LOW_SAMPLE_VOLUME);
  const sorted = [...days].sort((a, b) => b.profit - a.profit);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.label === worst.label) return null;

  if (worst.profit >= 0) {
    return {
      headline: `Nenhum dia da semana no vermelho. O melhor é ${best.label}: ${formatUsd(best.profit)} em ${best.volume} torneios.`,
      detail: `O mais fraco é ${worst.label}, com ${formatUsd(worst.profit)}.`,
      tone: 'good',
      lowSample,
    };
  }

  return {
    headline: `${worst.label} está sangrando: ${formatUsd(worst.profit)} em ${worst.volume} torneios. ${best.label} vai bem: ${formatUsd(best.profit)}.`,
    detail: `Vale investigar a rotina — o que muda na sua ${best.label.toLowerCase()} que não acontece na ${worst.label.toLowerCase()}?`,
    tone: 'bad',
    lowSample,
  };
}

/**
 * Participantes: o cruzamento útil é ITM x ROI x onde está o volume. Field
 * pequeno costuma dar mais ITM e menos ROI; o problema aparece quando o volume
 * está concentrado justamente onde o retorno é pior.
 */
export function buildFieldInsight(data: any): TabInsight | null {
  if (!Array.isArray(data)) return null;
  const buckets: InsightBucket[] = data
    .map((row: any) => {
      const volume = num(row?.volume);
      const itmCount = num(row?.itmCount);
      return {
        label: String(row?.fieldRange ?? '').trim(),
        volume,
        profit: num(row?.profit),
        buyins: num(row?.buyins),
        roi: num(row?.roi),
        itmRate: volume > 0 ? (itmCount / volume) * 100 : undefined,
      };
    })
    .filter((b) => b.label.length > 0 && b.volume > 0);

  const { rows, lowSample } = pickComparable(buckets);
  if (rows.length < 2) {
    return buckets.length > 0 ? insufficientInsight(totalVolume(buckets)) : null;
  }

  const bestRoi = rows[0];
  const byVolume = [...rows].sort((a, b) => b.volume - a.volume);
  const mostPlayed = byVolume[0];
  const comparedVolume = rows.reduce((sum, b) => sum + b.volume, 0);
  const share = comparedVolume > 0 ? (mostPlayed.volume / comparedVolume) * 100 : 0;

  const itmPart =
    bestRoi.itmRate !== undefined && mostPlayed.itmRate !== undefined
      ? ` ITM de ${bestRoi.itmRate.toFixed(1)}% contra ${mostPlayed.itmRate.toFixed(1)}%.`
      : '';

  if (mostPlayed.label === bestRoi.label) {
    return {
      headline: `Seu melhor ROI (${formatPct(bestRoi.roi)}) está em field ${bestRoi.label}, que também é onde você mais joga.${itmPart}`,
      detail: 'Alocação alinhada com o resultado — o volume está no lugar certo.',
      tone: 'good',
      lowSample,
    };
  }

  return {
    headline: `Seu melhor ROI está em field ${bestRoi.label} (${formatPct(bestRoi.roi)}), mas ${Math.round(share)}% do seu volume está em ${mostPlayed.label}, que rende ${formatPct(mostPlayed.roi)}.${itmPart}`,
    detail: 'Field pequeno costuma dar mais ITM e menos ROI. Desequilíbrio aqui é escolha de grade, não de jogo.',
    tone: mostPlayed.roi < bestRoi.roi ? 'bad' : 'neutral',
    lowSample,
  };
}

/**
 * Posição: onde você cai dentro da mesa final. Cair em 7º-9º é sair logo que
 * chegou; os saltos de premiação grandes estão no 3-handed.
 */
export function buildPositionInsight(data: any): TabInsight | null {
  if (!Array.isArray(data)) return null;

  const byPosition = new Map<number, number>();
  for (const row of data) {
    const position = Number(row?.position);
    if (!Number.isFinite(position) || position < 1 || position > 9) continue;
    byPosition.set(position, (byPosition.get(position) ?? 0) + num(row?.volume));
  }

  const total = Array.from(byPosition.values()).reduce((sum, v) => sum + v, 0);
  if (total < LOW_SAMPLE_VOLUME) {
    return total > 0 ? insufficientInsight(total) : null;
  }

  const sum = (positions: number[]) =>
    positions.reduce((acc, p) => acc + (byPosition.get(p) ?? 0), 0);

  const earlyBust = sum([7, 8, 9]);
  const deep = sum([1, 2, 3]);
  const earlyShare = (earlyBust / total) * 100;
  const deepShare = (deep / total) * 100;
  const lowSample = total < MIN_BUCKET_VOLUME;

  if (earlyShare >= 45) {
    return {
      headline: `${Math.round(earlyShare)}% das suas mesas finais terminam em 7º-9º — você cai logo que chega.`,
      detail: `Só ${Math.round(deepShare)}% viram top 3, e é no 3-handed que estão os maiores saltos de premiação. Vale revisar o jogo de stack curto na entrada da FT.`,
      tone: 'bad',
      lowSample,
    };
  }

  if (deepShare >= 40) {
    return {
      headline: `${Math.round(deepShare)}% das suas mesas finais viram top 3 — você converte bem quando chega lá.`,
      detail: `Saída precoce (7º-9º) em ${Math.round(earlyShare)}%. O gargalo não está na mesa final.`,
      tone: 'good',
      lowSample,
    };
  }

  return {
    headline: `Suas mesas finais se distribuem sem concentração clara: ${Math.round(earlyShare)}% saem em 7º-9º e ${Math.round(deepShare)}% chegam ao top 3.`,
    detail: 'Os maiores saltos de premiação estão no 3-handed — é ali que ganhar uma posição vale mais.',
    tone: 'neutral',
    lowSample,
  };
}

/** Despacha a dica da aba ativa. `null` = a aba não mostra faixa. */
export function buildTabInsight(tab: string, payload: Record<string, any>): TabInsight | null {
  switch (tab) {
    case 'por-site':
      return buildSiteInsight(payload.siteAnalytics);
    case 'por-abi':
      return buildBuyinInsight(payload.buyinAnalytics);
    case 'por-tipo':
      return buildCategoryInsight(payload.categoryAnalytics);
    case 'velocidade':
      return buildSpeedInsight(payload.speedAnalytics);
    case 'por-periodo':
      return buildDayOfWeekInsight(payload.dayAnalytics);
    case 'por-participantes':
      return buildFieldInsight(payload.fieldAnalytics);
    case 'por-posicao':
      return buildPositionInsight(payload.finalTableAnalytics);
    default:
      return null;
  }
}
