#!/usr/bin/env node
// Diagnostico: lista session_tournaments completados/registered hoje + valores
// de buy-in/result/bounty/rebuys/reentries/addOnTaken/addOnCost por moeda.
// Tambem mostra grind_sessions e calcula profit/investido USD esperado.

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SITE_TO_CCY = {
  Suprema: 'BRL',
  SupremaPoker: 'BRL',
  PPoker: 'BRL',
  iPoker: 'EUR',
  'PS.ES': 'EUR',
};

function parseDecimal(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const c = await pool.connect();
try {
  // Sessoes hoje (qualquer status)
  const sessions = await c.query(
    `SELECT id, user_id, status, profit, abi_med, roi, date, end_time
     FROM grind_sessions
     WHERE date::date = CURRENT_DATE
     ORDER BY date DESC`,
  );
  console.log(`\n=== grind_sessions hoje: ${sessions.rows.length} ===`);
  for (const s of sessions.rows) {
    console.log(`  ${s.id}  status=${s.status}  profit=${s.profit}  abi=${s.abi_med}  roi=${s.roi}`);
  }

  // Torneios session_tournaments hoje (qualquer status)
  const sts = await c.query(
    `SELECT st.id, st.session_id, st.site, st.name, st.buy_in, st.guaranteed,
            st.rebuys, st.reentries, st.result, st.bounty, st.prize, st.position,
            st.addon_taken, st.addon_cost, st.status, st.created_at
     FROM session_tournaments st
     WHERE created_at::date = CURRENT_DATE
     ORDER BY created_at`,
  );
  console.log(`\n=== session_tournaments hoje: ${sts.rows.length} ===`);
  for (const t of sts.rows) {
    const ccy = SITE_TO_CCY[t.site] || 'USD';
    const buyIn = parseDecimal(t.buy_in);
    const rebuys = parseInt(t.rebuys ?? 0) || 0;
    const reentries = parseInt(t.reentries ?? 0) || 0;
    const addOnTaken = Boolean(t.addon_taken);
    const addOnCost = parseDecimal(t.addon_cost);
    const invested = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0);
    const result = parseDecimal(t.result);
    const prize = parseDecimal(t.prize);
    const bounty = parseDecimal(t.bounty);
    const effectivePrize = result > 0 ? result : prize;
    const profit = effectivePrize + bounty - invested;
    console.log(
      `  [${ccy}] ${t.site.padEnd(10)}  status=${(t.status||'').padEnd(11)}  buy=${buyIn}  rebuys=${rebuys}  re=${reentries}  addOn=${addOnTaken?addOnCost:0}  result=${result}  prize=${prize}  bounty=${bounty}  invested=${invested}  profit=${profit}  ${t.name}`,
    );
  }

  // Agregacao por moeda
  console.log(`\n=== Agregacao por moeda (status terminal: registered/active/finished/completed) ===`);
  const TERMINAL = new Set(['registered', 'active', 'finished', 'completed']);
  const agg = {};
  for (const t of sts.rows) {
    if (!TERMINAL.has(t.status)) continue;
    const ccy = SITE_TO_CCY[t.site] || 'USD';
    const buyIn = parseDecimal(t.buy_in);
    const rebuys = parseInt(t.rebuys ?? 0) || 0;
    const reentries = parseInt(t.reentries ?? 0) || 0;
    const addOnTaken = Boolean(t.addon_taken);
    const addOnCost = parseDecimal(t.addon_cost);
    const invested = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0);
    const result = parseDecimal(t.result);
    const prize = parseDecimal(t.prize);
    const bounty = parseDecimal(t.bounty);
    const effectivePrize = result > 0 ? result : prize;
    const profit = effectivePrize + bounty - invested;
    if (!agg[ccy]) agg[ccy] = { invested: 0, profit: 0, count: 0 };
    agg[ccy].invested += invested;
    agg[ccy].profit += profit;
    agg[ccy].count += 1;
  }
  for (const [ccy, v] of Object.entries(agg)) {
    console.log(`  ${ccy}: count=${v.count}  invested=${v.invested.toFixed(2)}  profit=${v.profit.toFixed(2)}`);
  }
} finally {
  c.release();
  await pool.end();
}
