/**
 * diff-sharkscope-csv — ADR-243.
 *
 * Compara um export do SharkScope com o que está gravado no banco, linha a linha,
 * e aponta exatamente onde os dois divergem. Serve para auditar qualquer suspeita
 * de "o número do dashboard não bate com o do SharkScope" sem ficar no chute.
 *
 * O que ele responde:
 *   1. linhas do CSV que NAO estão no banco (import perdeu / dedup comeu)
 *   2. linhas do banco que NAO estão no CSV (export mudou / linha órfã)
 *   3. linhas presentes nos dois com VALOR diferente (buy-in, prêmio, lucro,
 *      posição, participantes, moeda) — com o delta de cada campo
 *   4. o agregado: lucro/investimento do CSV vs do banco, e quanto cada uma das
 *      três causas acima contribui para a diferença
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/diff-sharkscope-csv.ts <arquivo.csv> --user=USER-0005
 *   npx tsx --env-file=.env scripts/diff-sharkscope-csv.ts <arquivo.csv> --user=USER-0005 --site="WPT Global"
 *   npx tsx --env-file=.env scripts/diff-sharkscope-csv.ts <arquivo.csv> --user=USER-0005 --nick=Dowkali
 *
 * Somente leitura: nunca escreve no banco.
 */

import fs from "fs";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { PokerCSVParser } from "../server/csvParser";
import { applyHistoricalFxToBatch } from "../server/services/fx/historicalFxResolver";

interface Args {
  file: string;
  user: string;
  site: string | null;
  nick: string | null;
  /** Diferença mínima (USD) para reportar um campo monetário. */
  tolerance: number;
}

function parseArgs(argv: string[]): Args {
  const rest = argv.slice(2);
  const file = rest.find((a) => !a.startsWith("--")) ?? "";
  const get = (name: string) => {
    const hit = rest.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    file,
    user: get("user") ?? "",
    site: get("site"),
    nick: get("nick"),
    tolerance: Number(get("tolerance") ?? "0.01"),
  };
}

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file || !args.user) {
    console.error(
      "uso: npx tsx --env-file=.env scripts/diff-sharkscope-csv.ts <arquivo.csv> --user=USER-XXXX [--site=..] [--nick=..]",
    );
    process.exit(1);
  }
  if (!fs.existsSync(args.file)) {
    console.error(`arquivo nao encontrado: ${args.file}`);
    process.exit(1);
  }

  // ---- lado CSV: passa pelo MESMO pipeline do import (parser + câmbio por data)
  const content = fs.readFileSync(args.file, "utf-8");
  const { tournaments: parsedRaw, report } = await PokerCSVParser.parseCSVDetailed(
    content,
    args.user,
    { BRL: 5.0, CNY: 7.2, EUR: 0.92 },
  );
  const fx = await applyHistoricalFxToBatch(parsedRaw as any[]);
  let csvRows = fx.tournaments as any[];

  if (args.site) csvRows = csvRows.filter((t) => String(t.site) === args.site);
  if (args.nick) csvRows = csvRows.filter((t) => String(t.playerNick ?? "") === args.nick);

  console.log(
    `[diff] CSV: ${report.rowsInFile} linhas lidas, ${report.parsedCount} parseadas, ` +
      `${report.rejected.length} rejeitadas -> ${csvRows.length} apos filtro`,
  );

  // ---- lado banco
  const where: any[] = [sql`user_id = ${args.user}`, sql`grind_session_id IS NULL`];
  if (args.site) where.push(sql`site = ${args.site}`);
  if (args.nick) where.push(sql`player_nick = ${args.nick}`);
  const whereSql = where.reduce((acc, cur, i) => (i === 0 ? cur : sql`${acc} AND ${cur}`));

  const dbRaw: any = await db.execute(sql`
    SELECT tournament_id, name, site, player_nick, currency, date_played,
           buy_in, prize, gross_prize, position, field_size, reentries
    FROM tournaments WHERE ${whereSql}
  `);
  const dbRows = (Array.isArray(dbRaw) ? dbRaw : dbRaw?.rows ?? []) as any[];
  console.log(`[diff] banco: ${dbRows.length} torneios no mesmo escopo\n`);

  // ---- indexa por id externo (o SharkScope sempre traz `ID do Jogo`)
  const byIdCsv = new Map<string, any>();
  for (const t of csvRows) {
    const id = String(t.tournamentId ?? "").trim();
    if (id) byIdCsv.set(id, t);
  }
  const byIdDb = new Map<string, any>();
  for (const r of dbRows) {
    const id = String(r.tournament_id ?? "").trim();
    if (id) byIdDb.set(id, r);
  }

  const onlyCsv: any[] = [];
  const onlyDb: any[] = [];
  const mismatches: Array<{
    id: string; name: string; campo: string;
    csv: number | string; banco: number | string; delta: number;
  }> = [];

  for (const [id, t] of byIdCsv) {
    if (!byIdDb.has(id)) {
      onlyCsv.push(t);
      continue;
    }
    const r = byIdDb.get(id);
    const cmp: Array<[string, number, number]> = [
      ["buy_in", money(t.buyIn), money(r.buy_in)],
      ["lucro", money(t.prize), money(r.prize)],
      ["premio_bruto", money(t.grossPrize), money(r.gross_prize)],
      ["posicao", Number(t.position ?? 0), Number(r.position ?? 0)],
      ["participantes", Number(t.fieldSize ?? 0), Number(r.field_size ?? 0)],
      ["reentradas", Number(t.reentries ?? 0), Number(r.reentries ?? 0)],
    ];
    for (const [campo, a, b] of cmp) {
      const delta = a - b;
      const limite =
        campo === "posicao" || campo === "participantes" || campo === "reentradas"
          ? 0
          : args.tolerance;
      if (Math.abs(delta) > limite) {
        mismatches.push({ id, name: String(t.name).slice(0, 45), campo, csv: a, banco: b, delta });
      }
    }
    if (String(t.currency) !== String(r.currency)) {
      mismatches.push({
        id, name: String(t.name).slice(0, 45), campo: "moeda",
        csv: String(t.currency), banco: String(r.currency), delta: 0,
      });
    }
  }
  for (const [id, r] of byIdDb) if (!byIdCsv.has(id)) onlyDb.push(r);

  // ---- agregados
  const sum = (rows: any[], get: (r: any) => number) => rows.reduce((a, r) => a + get(r), 0);
  const csvProfit = sum(csvRows, (t) => money(t.prize));
  const dbProfit = sum(dbRows, (r) => money(r.prize));
  const csvInvest = sum(csvRows, (t) => money(t.buyIn) * (1 + Number(t.reentries ?? 0)));
  const dbInvest = sum(dbRows, (r) => money(r.buy_in) * (1 + Number(r.reentries ?? 0)));

  console.log("================ AGREGADO ================");
  console.log(
    `torneios     CSV ${String(csvRows.length).padStart(6)}   banco ${String(dbRows.length).padStart(6)}   delta ${csvRows.length - dbRows.length}`,
  );
  console.log(
    `lucro        CSV ${fmt(csvProfit).padStart(12)}   banco ${fmt(dbProfit).padStart(12)}   delta ${fmt(csvProfit - dbProfit)}`,
  );
  console.log(
    `investido    CSV ${fmt(csvInvest).padStart(12)}   banco ${fmt(dbInvest).padStart(12)}   delta ${fmt(csvInvest - dbInvest)}`,
  );

  console.log("\n================ CAUSAS ================");
  const lucroOnlyCsv = sum(onlyCsv, (t) => money(t.prize));
  const lucroOnlyDb = sum(onlyDb, (r) => money(r.prize));
  const lucroMismatch = mismatches
    .filter((m) => m.campo === "lucro")
    .reduce((a, m) => a + m.delta, 0);
  console.log(`1) so no CSV (faltam no banco): ${onlyCsv.length} linhas, lucro ${fmt(lucroOnlyCsv)}`);
  console.log(`2) so no banco (nao estao no CSV): ${onlyDb.length} linhas, lucro ${fmt(lucroOnlyDb)}`);
  console.log(
    `3) valor divergente: ${mismatches.filter((m) => m.campo === "lucro").length} linhas, soma dos deltas ${fmt(lucroMismatch)}`,
  );
  console.log(
    `   (1) + (3) - (2) = ${fmt(lucroOnlyCsv + lucroMismatch - lucroOnlyDb)}  <- deve fechar com o delta de lucro acima`,
  );

  if (onlyCsv.length > 0) {
    console.log("\n---- so no CSV (amostra 15) ----");
    console.table(
      onlyCsv.slice(0, 15).map((t) => ({
        id: t.tournamentId,
        nome: String(t.name).slice(0, 40),
        data: t.datePlayed?.toISOString?.().slice(0, 16),
        buyin: money(t.buyIn).toFixed(2),
        lucro: money(t.prize).toFixed(2),
      })),
    );
  }
  if (onlyDb.length > 0) {
    console.log("\n---- so no banco (amostra 15) ----");
    console.table(
      onlyDb.slice(0, 15).map((r) => ({
        id: r.tournament_id,
        nome: String(r.name).slice(0, 40),
        data: new Date(r.date_played).toISOString().slice(0, 16),
        buyin: money(r.buy_in).toFixed(2),
        lucro: money(r.prize).toFixed(2),
      })),
    );
  }
  if (mismatches.length > 0) {
    console.log("\n---- divergencias de valor (maiores 25) ----");
    console.table(
      mismatches
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 25)
        .map((m) => ({
          id: m.id,
          nome: m.name,
          campo: m.campo,
          csv: typeof m.csv === "number" ? m.csv.toFixed(2) : m.csv,
          banco: typeof m.banco === "number" ? m.banco.toFixed(2) : m.banco,
          delta: typeof m.delta === "number" ? m.delta.toFixed(2) : m.delta,
        })),
    );
  }
  if (onlyCsv.length === 0 && onlyDb.length === 0 && mismatches.length === 0) {
    console.log("\nOK: CSV e banco identicos no escopo analisado.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[diff] falhou:", err);
    process.exit(1);
  });
