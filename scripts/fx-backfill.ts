/**
 * Sprint FX-1 RF-08: backfill 90 dias historicos.
 *
 * Uso:
 *   tsx scripts/fx-backfill.ts                       # default 90 dias
 *   tsx scripts/fx-backfill.ts --days=30
 *   tsx scripts/fx-backfill.ts --from=2026-01-01 --to=2026-04-30
 *
 * Pipeline:
 *   1. frankfurter timeseries cobre BRL+EUR de uma vez (ECB rates).
 *   2. BCB PTAX timeseries sobrepoe BRL com source 'bcb_ptax' (preferido).
 *   3. Insert batch via fxRatesPersistence.upsertDailyRates.
 *   4. Throttle 200ms entre paginas (R5).
 *   5. Idempotente — re-run no mesmo range = no-op via ON CONFLICT.
 *
 * Exit 0 sucesso, 1 falha critica.
 */

import { fetchTimeseries as frankfurterTimeseries } from "../server/services/fx/adapters/frankfurterAdapter";
import { fetchTimeseriesBrl } from "../server/services/fx/adapters/bcbPtaxAdapter";
import { upsertDailyRates } from "../server/services/fx/fxRatesPersistence";
import type { FxRow } from "../server/services/fx/adapters/types";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv: string[]): {
  days?: number;
  from?: string;
  to?: string;
} {
  const out: any = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--(\w+)=(.+)$/);
    if (!m) continue;
    if (m[1] === "days") out.days = Number(m[2]);
    else if (m[1] === "from") out.from = m[2];
    else if (m[1] === "to") out.to = m[2];
  }
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeRange(args: ReturnType<typeof parseArgs>): {
  from: string;
  to: string;
} {
  if (args.from && args.to) return { from: args.from, to: args.to };
  const days = args.days ?? 90;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  return { from: isoDate(from), to: isoDate(to) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const { from, to } = computeRange(args);

  console.info(`[fx/backfill] range=${from}..${to}`);

  // Build by-date map. BCB BRL preferido sobre frankfurter BRL (sobrepoe).
  const byDate = new Map<string, Map<string, FxRow>>();

  // 1. frankfurter (ECB) cobre BRL + EUR.
  let frankfurterRows: FxRow[] = [];
  try {
    frankfurterRows = await frankfurterTimeseries(from, to, ["BRL", "EUR"]);
    console.info(
      `[fx/backfill] frankfurter ok: ${frankfurterRows.length} rows`,
    );
  } catch (err: any) {
    console.error("[fx/backfill] frankfurter failed:", err?.message);
  }
  await sleep(200);

  for (const r of frankfurterRows) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Map());
    byDate.get(r.date)!.set(r.currency, r);
  }

  // 2. BCB PTAX BRL — sobrepoe.
  try {
    const bcbRows = await fetchTimeseriesBrl(from, to);
    console.info(`[fx/backfill] bcb_ptax ok: ${bcbRows.length} rows`);
    for (const r of bcbRows) {
      if (!byDate.has(r.date)) byDate.set(r.date, new Map());
      byDate.get(r.date)!.set(r.currency, r); // sobrepoe BRL frankfurter
    }
  } catch (err: any) {
    console.warn("[fx/backfill] bcb_ptax failed (frankfurter cobre BRL):", err?.message);
  }

  // 3. Upsert por dia.
  let totalInserted = 0;
  let totalSkipped = 0;
  const sortedDates = [...byDate.keys()].sort();
  for (const date of sortedDates) {
    const rows = [...byDate.get(date)!.values()];
    try {
      const result = await upsertDailyRates(date, rows);
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
      const summary = rows
        .map((r) => `${r.currency}=${r.ratePerUsd.toFixed(4)} (${r.source})`)
        .join(", ");
      console.info(`[fx/backfill] ${date}: ${summary}`);
    } catch (err: any) {
      console.error(`[fx/backfill] upsert ${date} failed:`, err?.message);
    }
    await sleep(200);
  }

  console.info(
    `[fx/backfill] done — days=${sortedDates.length} inserted=${totalInserted} skipped=${totalSkipped}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[fx/backfill] fatal:", err);
    process.exit(1);
  });
