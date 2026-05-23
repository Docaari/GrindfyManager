import 'dotenv/config';
import { Pool } from 'pg';

const SESSION_ID = '-Lm6ElbAdKRM7D0EQNrf2';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const before = await c.query(
      `SELECT id, user_id, status, start_time, end_time FROM grind_sessions WHERE id = $1`,
      [SESSION_ID],
    );
    if (before.rowCount === 0) {
      console.error('Session not found.');
      return;
    }
    console.log('BEFORE:', before.rows[0]);

    const pending = await c.query(
      `SELECT id, name, status FROM session_tournaments WHERE session_id = $1 AND status = 'registered'`,
      [SESSION_ID],
    );
    console.log('Pending session_tournaments:', pending.rowCount);

    await c.query('BEGIN');
    if (pending.rowCount && pending.rowCount > 0) {
      await c.query(
        `UPDATE session_tournaments
           SET status = 'finished', result = '0', bounty = '0', position = NULL, end_time = NOW()
         WHERE session_id = $1 AND status = 'registered'`,
        [SESSION_ID],
      );
    }
    await c.query(
      `UPDATE grind_sessions
         SET status = 'completed', end_time = NOW(), final_notes = COALESCE(final_notes, '') || E'\n[kill] sessao morta sem reconcile (teste).'
       WHERE id = $1`,
      [SESSION_ID],
    );
    await c.query('COMMIT');

    const after = await c.query(
      `SELECT id, status, end_time FROM grind_sessions WHERE id = $1`,
      [SESSION_ID],
    );
    console.log('AFTER:', after.rows[0]);

    const snaps = await c.query(
      `SELECT COUNT(*)::int AS n FROM session_wallet_snapshots WHERE session_id = $1`,
      [SESSION_ID],
    );
    console.log('session_wallet_snapshots criados pra essa sessao:', snaps.rows[0].n);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('ERROR:', e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
}

main();
