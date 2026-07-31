/**
 * quarantined-sites — redes cujo export está temporariamente NÃO confiável.
 *
 * Sprint import-otimizacao (ADR-243). Linhas dessas redes são reconhecidas pelo
 * parser mas NÃO são gravadas: entram no relatório do import como "ignoradas",
 * com o motivo, para o jogador saber exatamente o que ficou de fora e por quê.
 *
 * POR QUE O WPT GLOBAL ESTÁ AQUI
 * Auditoria com o export oficial do SharkScope (122 torneios da conta Dowkali,
 * arquivo `Dowkali-WPT Global-tournaments.csv`):
 *   - o import é fiel ao arquivo: diff CSV x banco deu 0 linhas divergentes,
 *     lucro $1.456,87 dos dois lados;
 *   - somando a coluna `Resultado (incluindo Rake)` do próprio arquivo:
 *     +$2.112,45 (USD) e -¥4.438,65 (CNY). Com qualquer cotação real do período
 *     (6,75 a 6,81) o lucro fica entre $1.454,87 e $1.460,67;
 *   - a tela do SharkScope, para os MESMOS 122 torneios (ITM, finalizações e
 *     vitórias idênticos), mostra $19,16. Para chegar nesse valor a cotação
 *     precisaria ser 2,12; o investimento exigiria 4,01 e os prêmios 18,49 —
 *     três taxas diferentes para a mesma moeda, o que é impossível;
 *   - a divergência não é só monetária: a média de participantes do arquivo é
 *     520 e a tela mostra 392 (participantes não dependem de câmbio);
 *   - controle: a conta GGNetwork também tem 129 torneios em CNY e bate EXATO
 *     (-$3.611 dos dois lados) com o mesmo método de conversão. Ou seja, o
 *     método está certo; o problema é específico do export do WPT Global.
 *
 * Enquanto a origem não for corrigida, é melhor não importar do que importar um
 * número em que o jogador não pode confiar. Para reativar, basta remover a
 * entrada desta lista — nenhum outro código precisa mudar.
 */

export interface QuarantinedSite {
  /** Casa o nome da rede como o parser produz (case-insensitive). */
  match: RegExp;
  /** Rótulo exibido ao jogador. */
  label: string;
  /** Motivo curto, mostrado no relatório do import. */
  reason: string;
}

export const QUARANTINED_SITES: readonly QuarantinedSite[] = Object.freeze([
  Object.freeze({
    match: /^\s*wpt\b/i,
    label: "WPT Global",
    reason:
      "O export do WPT Global está inconsistente na origem: os valores da própria planilha não fecham com os números exibidos pelo SharkScope (o mesmo conjunto de torneios aparece com lucro e participantes diferentes). Enquanto isso não for corrigido, esses torneios não são importados para não contaminar seu dashboard.",
  }),
]);

/** Devolve a entrada de quarentena da rede, ou null quando a rede está liberada. */
export function findQuarantinedSite(site: unknown): QuarantinedSite | null {
  if (site === null || site === undefined) return null;
  const s = String(site).trim();
  if (s === "") return null;
  for (const entry of QUARANTINED_SITES) {
    if (entry.match.test(s)) return entry;
  }
  return null;
}

export function isQuarantinedSite(site: unknown): boolean {
  return findQuarantinedSite(site) !== null;
}

export interface QuarantineSplit<T> {
  /** Linhas liberadas para gravação. */
  allowed: T[];
  /** Linhas retidas, agrupadas por rede. */
  quarantined: T[];
  /** `{ "WPT Global": 122 }` — para o relatório do import. */
  bySite: Record<string, number>;
  /** Motivo por rede, na ordem em que apareceram. */
  reasons: Array<{ site: string; reason: string }>;
}

/**
 * Separa as linhas de redes em quarentena. PURA.
 * `getSite` permite reusar tanto com ParsedTournament quanto com rows de INSERT.
 */
export function splitQuarantined<T>(
  rows: readonly T[],
  getSite: (row: T) => unknown,
): QuarantineSplit<T> {
  const allowed: T[] = [];
  const quarantined: T[] = [];
  const bySite: Record<string, number> = {};
  const reasons: Array<{ site: string; reason: string }> = [];

  for (const row of rows ?? []) {
    const entry = findQuarantinedSite(getSite(row));
    if (!entry) {
      allowed.push(row);
      continue;
    }
    quarantined.push(row);
    bySite[entry.label] = (bySite[entry.label] ?? 0) + 1;
    if (!reasons.some((r) => r.site === entry.label)) {
      reasons.push({ site: entry.label, reason: entry.reason });
    }
  }

  return { allowed, quarantined, bySite, reasons };
}
