/**
 * revalue-historical-fx — ADR-243.
 *
 * Re-valoriza torneios em moeda estrangeira usando a cotacao da DATA de cada
 * torneio, SEM reimportar CSV. So e possivel porque o import passou a gravar
 * `fx_rate_used` + `buy_in_native`/`prize_native`: dividir de volta e reaplicar
 * a taxa historica e exato.
 *
 * Linhas anteriores a Migration 0097 nao tem `fx_rate_used`. Para elas o script
 * usa `--assume-rate` (a taxa flat que o import da epoca aplicou) para chegar ao
 * valor nativo. Sem `--assume-rate`, essas linhas sao PULADAS (nunca chuta).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/revalue-historical-fx.ts                  # dry-run, todos
 *   npx tsx --env-file=.env scripts/revalue-historical-fx.ts --user=USER-0005
 *   npx tsx --env-file=.env scripts/revalue-historical-fx.ts --assume-rate=CNY:7.2,EUR:0.92
 *   npx tsx --env-file=.env scripts/revalue-historical-fx.ts --apply          # grava
 *
 * Reversivel: `--apply` grava tambem `fx_rate_used`/`fx_rate_date`/`fx_source`,
 * entao rodar de novo (ou com outra fonte de cotacao) reconverte a partir do
 * valor nativo, sem acumular erro.
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";
import {
  buildHistoricalFxTable,
  applyHistoricalFx,
} from "../server/services/fx/historicalFxResolver";

interface Args {
  apply: boolean;
  user: string | null;
  assumeRate: Record<string, number>;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { apply: false, user: null, assumeRate: {} };
  for (const a of argv.slice(2)) {
    if (a === "--apply") out.apply = true;
    else if (a.startsWith("--user=")) out.user = a.slice("--user=".length).trim();
    else if (a.startsWith("--assume-rate=")) {
      for (const pair of a.slice("--assume-rate=".length).split(",")) {
        const [ccy, rate] = pair.split(":");
        const n = Number(rate);
        if (ccy && Number.isFinite(n) && n > 0) out.assumeRate[ccy.toUpperCase()] = n;
      }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(
    `[revalue-fx] modo=${args.apply ? "APPLY" : "DRY-RUN"} user=${args.user ?? "TODOS"} assumeRate=${JSON.stringify(args.assumeRate)}`,
  );

  const whereUser = args.user ? sql`AND user_id = ${args.user}` : sql``;
  const res: any = await db.execute(sql`
    SELECT id, user_id, currency, date_played, buy_in, prize, rake, gross_prize,
           bounty_prize, prize_pool, converted_to_usd, fx_rate_used
    FROM tournaments
    WHERE currency IS NOT NULL AND currency <> 'USD'
    ${whereUser}
    ORDER BY date_played ASC
  `);
  const raw = Array.isArray(res) ? res : (res?.rows ?? []);
  console.log(`[revalue-fx] linhas em moeda estrangeira: ${raw.length}`);
  if (raw.length === 0) return;

  const num = (v: any) => (v === null || v === undefined ? null : Number(v));

  const skipped: Record<string, number> = {};
  const rows = raw
    .map((r: any) => {
      const ccy = String(r.currency).toUpperCase();
      // Taxa que produziu o valor atual. Sem ela nao da para voltar ao nativo.
      const known = num(r.fx_rate_used);
      const assumed = args.assumeRate[ccy];
      const flat = known && known > 0 ? known : assumed;
      if (!flat) {
        skipped[ccy] = (skipped[ccy] ?? 0) + 1;
        return null;
      }
      return {
        id: r.id,
        userId: r.user_id,
        currency: ccy,
        datePlayed: new Date(r.date_played),
        buyIn: num(r.buy_in) ?? 0,
        prize: num(r.prize) ?? 0,
        rake: num(r.rake),
        grossPrize: num(r.gross_prize),
        bountyPrize: num(r.bounty_prize),
        prizePool: num(r.prize_pool),
        convertedToUSD: true,
        fxRateUsed: flat,
      };
    })
    .filter(Boolean) as any[];

  if (Object.keys(skipped).length > 0) {
    console.log(
      `[revalue-fx] PULADAS (sem fx_rate_used e sem --assume-rate): ${JSON.stringify(skipped)}`,
    );
  }
  if (rows.length === 0) return;

  const currencies = [...new Set(rows.map((r) => r.currency))];
  const dates = rows.map((r) => r.datePlayed.toISOString().slice(0, 10)).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  console.log(`[revalue-fx] moedas=${currencies.join(",")} janela=${minDate}..${maxDate}`);

  const index = await buildHistoricalFxTable({ currencies, minDate, maxDate, fetchMissing: true });
  const coverage = [...index.entries()].map(([c, list]) => `${c}:${list.length}d`).join(" ");
  console.log(`[revalue-fx] cotacoes disponiveis -> ${coverage || "NENHUMA"}`);

  const { tournaments, applied, bySource } = applyHistoricalFx(rows, index);
  console.log(`[revalue-fx] re-valorizaveis: ${applied}/${rows.length} ${JSON.stringify(bySource)}`);

  // Impacto agregado por moeda (o que muda no lucro do jogador).
  const impact: Record<string, { before: number; after: number; n: number }> = {};
  for (let i = 0; i < rows.length; i++) {
    const before = rows[i];
    const after = tournaments[i] as any;
    if (after === before) continue;
    const k = before.currency;
    impact[k] = impact[k] ?? { before: 0, after: 0, n: 0 };
    impact[k].before += before.prize;
    impact[k].after += after.prize;
    impact[k].n++;
  }
  for (const [ccy, v] of Object.entries(impact)) {
    console.log(
      `[revalue-fx] ${ccy}: ${v.n} linhas | lucro antes $${v.before.toFixed(2)} -> depois $${v.after.toFixed(2)} (delta $${(v.after - v.before).toFixed(2)})`,
    );
  }

  if (!args.apply) {
    console.log("[revalue-fx] DRY-RUN — nada gravado. Rode com --apply para persistir.");
    return;
  }

  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const t = tournaments[i] as any;
    if (t === rows[i] || !t.fxRateDate) continue;
    await db.execute(sql`
      UPDATE tournaments SET
        buy_in = ${String(t.buyIn)},
        prize = ${String(t.prize)},
        rake = ${t.rake === null || t.rake === undefined ? null : String(t.rake)},
        gross_prize = ${t.grossPrize === null || t.grossPrize === undefined ? null : String(t.grossPrize)},
        bounty_prize = ${t.bountyPrize === null || t.bountyPrize === undefined ? null : String(t.bountyPrize)},
        prize_pool = ${t.prizePool === null || t.prizePool === undefined ? null : String(t.prizePool)},
        buy_in_native = ${String(t.buyInNative)},
        prize_native = ${String(t.prizeNative)},
        converted_to_usd = true,
        fx_rate_used = ${String(t.fxRateUsed)},
        fx_source = ${t.fxSource},
        fx_rate_date = ${t.fxRateDate},
        updated_at = now()
      WHERE id = ${t.id}
    `);
    updated++;
    if (updated % 250 === 0) console.log(`[revalue-fx] ...${updated} gravadas`);
  }
  console.log(`[revalue-fx] CONCLUIDO — ${updated} linhas gravadas.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[revalue-fx] FALHOU:", err);
    process.exit(1);
  });
