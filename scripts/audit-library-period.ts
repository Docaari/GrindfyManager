/**
 * Probe READ-ONLY da Biblioteca de Torneios — janela de periodo x piso de exibicao.
 *
 * Nasceu do bug reportado pelo founder em 2026-08-19: o filtro "Ultimos 6M" da
 * Biblioteca exibia apenas GGNetwork e CoinPoker, sumindo com WPN, Chico,
 * PokerStars, PartyPoker e 888Poker — que TEM historico dentro da janela.
 *
 * Prova duas camadas empilhadas:
 *   1. a tela manda period='180d', que NAO existe no switch de
 *      getTournamentStorage e cai no default de 30 dias;
 *   2. com a janela encolhida, quase nenhuma familia de 6 dimensoes atinge
 *      FAMILY_GROUP_FLOOR, e o piso apaga os sites que sobraram.
 *
 * Uso:  npx tsx --env-file=.env scripts/audit-library-period.ts [USER-XXXX]
 * NAO escreve nada. Somente SELECT.
 */
import { storage } from "../server/storage";
import { FAMILY_GROUP_FLOOR, MIN_GROUP_VISIBLE } from "../shared/library-grades";

const USER = process.argv[2] ?? "USER-0005";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function bySite(families: any[]) {
  const m = new Map<string, { fams: number; vol: number }>();
  for (const f of families) {
    const site = String(f.site ?? "(sem site)");
    const cur = m.get(site) ?? { fams: 0, vol: 0 };
    cur.fams += 1;
    cur.vol += Number(f.volume) || 0;
    m.set(site, cur);
  }
  return [...m.entries()].sort((a, b) => b[1].vol - a[1].vol);
}

function print(label: string, families: any[]) {
  const rows = bySite(families);
  const total = rows.reduce((s, [, v]) => s + v.vol, 0);
  console.log(`--- ${label}`);
  console.log(
    `    ${families.length} familias visiveis, ${rows.length} sites, ${total} torneios agrupados`,
  );
  for (const [site, v] of rows) {
    console.log(
      `      ${site.padEnd(14)} ${String(v.fams).padStart(4)} familias  ${String(v.vol).padStart(6)} torneios`,
    );
  }
  console.log("");
}

async function main() {
  console.log(
    `\n=== Biblioteca de Torneios — ${USER} (piso=${FAMILY_GROUP_FLOOR}, lowConfidence<${MIN_GROUP_VISIBLE}) ===\n`,
  );

  // O que a tela entrega HOJE ao clicar "Ultimos 6M".
  print(
    `O QUE A TELA ENTREGA HOJE em "Ultimos 6M" (period='180d')`,
    await storage.getTournamentLibrary(USER, "180d", {}),
  );

  // A janela de 180 dias de verdade, por caminho que o storage entende
  // (buildFilters le `dateRange.from`, NAO `dateFrom` — nao confundir com o
  // `filters.dateFrom` do buildPeriodCondition, que e outra funcao).
  const janela180 = { dateRange: { from: daysAgo(180) } };
  print(
    `O QUE "Ultimos 6M" DEVERIA ENTREGAR (dateRange.from = hoje-180d)`,
    await storage.getTournamentLibrary(USER, "all", janela180),
  );

  // Isola o efeito do PISO: mesma janela, sem esconder familia pequena.
  print(
    `Mesma janela de 180d, SEM o piso de exibicao`,
    await storage.getTournamentLibrary(USER, "all", janela180, undefined, {
      includeBelowFloor: true,
    }),
  );

  // Isola o efeito da JANELA: os 30 dias que o codigo realmente aplica.
  print(
    `Janela de 30d (a que o codigo aplica hoje), SEM o piso`,
    await storage.getTournamentLibrary(USER, "30d", {}, undefined, {
      includeBelowFloor: true,
    }),
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
