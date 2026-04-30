#!/usr/bin/env node
// One-shot retroativo: corrige currency dos torneios criados hoje (default 'USD'
// quando site eh iPoker/Suprema/PS.ES/PPoker) e recomputa profit/abi/roi das
// grind_sessions completadas hoje aplicando a logica nova de FX.
//
// Uso: node scripts/fix-today-currency-and-stats.mjs [--dry-run]
//
// Lessons-learned ref: docs/architecture/lessons-learned.md (2026-04-30 FX).

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const SITE_TO_CURRENCY = {
  Suprema: 'BRL',
  SupremaPoker: 'BRL',
  PPoker: 'BRL',
  iPoker: 'EUR',
  'PS.ES': 'EUR',
};

const NON_USD_SITES = Object.keys(SITE_TO_CURRENCY);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL nao definido em .env');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log(`[${DRY_RUN ? 'DRY-RUN' : 'EXEC'}] Iniciando ajuste retroativo (today)...`);
    await client.query('BEGIN');

    // 1. tournaments (CSV imports)
    const tournamentsRes = await client.query(
      `SELECT id, site, currency FROM tournaments
       WHERE date_played::date = CURRENT_DATE
         AND currency = 'USD'
         AND site = ANY($1::text[])`,
      [NON_USD_SITES],
    );
    console.log(`tournaments com currency='USD' incorreto hoje: ${tournamentsRes.rows.length}`);
    for (const row of tournamentsRes.rows) {
      const newCcy = SITE_TO_CURRENCY[row.site];
      if (!newCcy) continue;
      console.log(`  tournament ${row.id} (${row.site}): USD -> ${newCcy}`);
      if (!DRY_RUN) {
        await client.query(`UPDATE tournaments SET currency = $1 WHERE id = $2`, [newCcy, row.id]);
      }
    }

    // 2. tournament_library
    const libRes = await client.query(
      `SELECT id, site, currency FROM tournament_library
       WHERE created_at::date = CURRENT_DATE
         AND currency = 'USD'
         AND site = ANY($1::text[])`,
      [NON_USD_SITES],
    );
    console.log(`tournament_library com currency='USD' incorreto hoje: ${libRes.rows.length}`);
    for (const row of libRes.rows) {
      const newCcy = SITE_TO_CURRENCY[row.site];
      if (!newCcy) continue;
      console.log(`  library ${row.id} (${row.site}): USD -> ${newCcy}`);
      if (!DRY_RUN) {
        await client.query(`UPDATE tournament_library SET currency = $1 WHERE id = $2`, [newCcy, row.id]);
      }
    }

    // 3. grind_sessions completadas hoje: recompute profit/abiMed/roi.
    // Usa session_tournaments (sem currency col, deriva via site) + user
    // exchange_rates atual. Native currency-aware via SITE_TO_CURRENCY.
    const sessionsRes = await client.query(
      `SELECT id, user_id, profit, abi_med, roi
       FROM grind_sessions
       WHERE date::date = CURRENT_DATE
         AND status = 'completed'`,
    );
    console.log(`grind_sessions completadas hoje: ${sessionsRes.rows.length}`);

    for (const session of sessionsRes.rows) {
      const userSettingsRes = await client.query(
        `SELECT exchange_rates FROM user_settings WHERE user_id = $1`,
        [session.user_id],
      );
      const stored = userSettingsRes.rows[0]?.exchange_rates ?? {};
      const rates = {
        BRL: stored.BRL > 0 ? stored.BRL : 5.0,
        EUR: stored.EUR > 0 ? stored.EUR : 0.92,
        CNY: stored.CNY > 0 ? stored.CNY : 7.20,
        ...stored,
      };

      const stRes = await client.query(
        `SELECT site, buy_in, rebuys, reentries, result, bounty, prize,
                addon_taken, addon_cost
         FROM session_tournaments
         WHERE session_id = $1
           AND status IN ('finished', 'completed', 'registered')`,
        [session.id],
      );

      let totalInvestedUSD = 0;
      let profitUSD = 0;
      let count = 0;

      for (const t of stRes.rows) {
        const ccy = SITE_TO_CURRENCY[t.site] || 'USD';
        const rate = ccy === 'USD' ? 1 : rates[ccy];
        if (!rate || rate <= 0) {
          console.warn(`  session ${session.id}: rate ausente para ${ccy}; pulando torneio`);
          continue;
        }
        const buyIn = parseFloat(t.buy_in) || 0;
        const rebuys = parseInt(t.rebuys ?? 0) || 0;
        const reentries = parseInt(t.reentries ?? 0) || 0;
        const addOnTaken = Boolean(t.addon_taken);
        const addOnCost = parseFloat(t.addon_cost ?? 0) || 0;
        const invested = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0);
        const result = parseFloat(t.result ?? 0) || 0;
        const bounty = parseFloat(t.bounty ?? 0) || 0;
        const profit = result + bounty - invested;
        totalInvestedUSD += invested / rate;
        profitUSD += profit / rate;
        count += 1;
      }

      const abiMed = count > 0 ? totalInvestedUSD / count : 0;
      const roi = totalInvestedUSD > 0 ? (profitUSD / totalInvestedUSD) * 100 : 0;

      console.log(
        `  session ${session.id}: profit ${session.profit} -> ${profitUSD.toFixed(2)} USD; abiMed ${session.abi_med} -> ${abiMed.toFixed(2)} USD; roi ${session.roi} -> ${roi.toFixed(2)}%`,
      );

      if (!DRY_RUN) {
        await client.query(
          `UPDATE grind_sessions
           SET profit = $1, abi_med = $2, roi = $3, updated_at = NOW()
           WHERE id = $4`,
          [profitUSD.toFixed(2), abiMed.toFixed(2), roi.toFixed(2), session.id],
        );
      }
    }

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('DRY-RUN: rollback aplicado, nenhuma escrita persistida.');
    } else {
      await client.query('COMMIT');
      console.log('Commit aplicado.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro: rollback aplicado.', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
