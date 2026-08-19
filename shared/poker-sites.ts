/**
 * Vocabulario canonico de sites/redes de poker + rake padrao de MTT.
 *
 * Dois problemas resolvidos aqui:
 *
 * 1. O MESMO site aparece com nomes diferentes conforme a origem. A grade
 *    (planned_tournaments.site) e escrita a mao pelo jogador ("GGPoker"); o
 *    historico (tournaments.site) vem do parser de CSV ("GGNetwork"). Comparar
 *    por string crua faz o casamento grade x biblioteca falhar em silencio —
 *    o ROI cai para um nivel menos especifico sem ninguem perceber.
 *
 * 2. Rake de MTT nao existe em `tournaments.rake_pct` (100% NULL no dado real:
 *    nenhum parser preenche). Sem um default por site, a simulacao roda com
 *    rake 0% e SUPERESTIMA o resultado. Os valores abaixo sao aproximacoes das
 *    estruturas publicadas para buy-ins baixos/medios ($10-$200) e ficam
 *    EDITAVEIS na tela — nao sao contrato, sao ponto de partida.
 */

/** Rake usado quando o site nao esta na tabela (aproximacao conservadora). */
export const DEFAULT_MTT_RAKE_PCT = 9;

/**
 * Aliases -> chave canonica. Chave em minusculo, sem pontuacao/espacos.
 * Adicionar alias novo aqui e o suficiente: matcher e rake leem daqui.
 */
const SITE_ALIASES: Record<string, string> = {
  // WPN / Americas Cardroom
  wpn: "wpn",
  acr: "wpn",
  americascardroom: "wpn",
  blackchip: "wpn",
  blackchippoker: "wpn",
  winningpokernetwork: "wpn",
  // GG
  gg: "gg",
  ggpoker: "gg",
  ggnetwork: "gg",
  natural8: "gg",
  // PokerStars
  pokerstars: "pokerstars",
  stars: "pokerstars",
  ps: "pokerstars",
  // PartyPoker
  party: "partypoker",
  partypoker: "partypoker",
  // 888
  "888": "888poker",
  "888poker": "888poker",
  // iPoker
  ipoker: "ipoker",
  ipokernetwork: "ipoker",
  // Chico
  chico: "chico",
  chiconetwork: "chico",
  betonline: "chico",
  tigergaming: "chico",
  sportsbetting: "chico",
  // Bodog / Ignition (Bodog network)
  bodog: "bodog",
  bovada: "bodog",
  ignition: "bodog",
  // CoinPoker
  coin: "coinpoker",
  coinpoker: "coinpoker",
  // Revolution
  revolution: "revolution",
  revolutionnetwork: "revolution",
  // WPT Global
  wpt: "wptglobal",
  wptglobal: "wptglobal",
  // Winamax
  winamax: "winamax",
  // Suprema
  suprema: "suprema",
  supremapoker: "suprema",
};

/**
 * Rake de MTT (percent do buy-in total) por site canonico. Faixa low/mid.
 * Fontes: estruturas publicadas dos rooms + comparativos publicos 2026
 * (PokerStars ~9-11% ate ~$75; GGPoker ladder 9%->5%; CoinPoker 8%).
 */
const MTT_RAKE_PCT: Record<string, number> = {
  wpn: 9,
  gg: 9,
  pokerstars: 9,
  partypoker: 10,
  "888poker": 10,
  ipoker: 10,
  chico: 9,
  bodog: 10,
  coinpoker: 8,
  revolution: 10,
  wptglobal: 9,
  winamax: 9,
  suprema: 9,
};

/** Normaliza o nome do site para a chave canonica da rede. */
export function canonicalSiteKey(site: unknown): string {
  const raw = (site ?? "").toString().toLowerCase();
  const squashed = raw.replace(/[^a-z0-9]/g, "");
  if (!squashed) return "";
  if (SITE_ALIASES[squashed]) return SITE_ALIASES[squashed];
  // Casamento por prefixo/conteudo: "ggpoker br", "wpn - acr", "888 poker".
  for (const alias of Object.keys(SITE_ALIASES)) {
    if (alias.length >= 3 && squashed.includes(alias)) return SITE_ALIASES[alias];
  }
  return squashed;
}

/** Dois nomes de site apontam para a mesma rede? */
export function isSameSite(a: unknown, b: unknown): boolean {
  const ka = canonicalSiteKey(a);
  const kb = canonicalSiteKey(b);
  return ka !== "" && ka === kb;
}

/** Rake de MTT (percent) do site; DEFAULT_MTT_RAKE_PCT quando desconhecido. */
export function mttRakePctForSite(site: unknown): number {
  const key = canonicalSiteKey(site);
  return MTT_RAKE_PCT[key] ?? DEFAULT_MTT_RAKE_PCT;
}

/** O rake veio da tabela por site (true) ou do default generico (false)? */
export function hasKnownRake(site: unknown): boolean {
  return MTT_RAKE_PCT[canonicalSiteKey(site)] !== undefined;
}
