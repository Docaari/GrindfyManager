#!/usr/bin/env node
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = async (sql) => (await c.query(sql)).rows;
const check = async (label, sql, expect) => {
  const rows = await q(sql);
  const ok = expect(rows);
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) console.log('     rows:', JSON.stringify(rows));
};
await check('tournament_selector_logs table',
  `SELECT to_regclass('public.tournament_selector_logs') AS t`,
  (r) => r[0].t === 'tournament_selector_logs');
await check('idx_tsl_user_created',
  `SELECT 1 FROM pg_indexes WHERE indexname='idx_tsl_user_created'`,
  (r) => r.length === 1);
await check('idx_tsl_event_created',
  `SELECT 1 FROM pg_indexes WHERE indexname='idx_tsl_event_created'`,
  (r) => r.length === 1);
await check('planned_tournaments.library_template_id',
  `SELECT 1 FROM information_schema.columns WHERE table_name='planned_tournaments' AND column_name='library_template_id'`,
  (r) => r.length === 1);
await check('user_settings.bankroll_amount',
  `SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='bankroll_amount'`,
  (r) => r.length === 1);
await check('user_settings.bankroll_rule',
  `SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='bankroll_rule'`,
  (r) => r.length === 1);
await check('tournament_library.day_of_week',
  `SELECT 1 FROM information_schema.columns WHERE table_name='tournament_library' AND column_name='day_of_week'`,
  (r) => r.length === 1);
await check('tournament_library.currency',
  `SELECT 1 FROM information_schema.columns WHERE table_name='tournament_library' AND column_name='currency'`,
  (r) => r.length === 1);
await c.end();
