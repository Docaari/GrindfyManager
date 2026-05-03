/**
 * SMOKE TEST + audit final Sprint Flight-1.
 * - Valida tournament_series + Day 2 planneds estao corretos no DB.
 * - Garante 1 entry por profile (A + B) por serie.
 * - Audita series + bagged tournaments.
 *
 * Uso: npx tsx --env-file=.env scripts/find-founder.ts
 *
 * Idempotente: rodar varias vezes nao duplica nada.
 */
import { Pool } from "pg";

const FOUNDER_EMAIL = "ricardo.agnolo@hotmail.com";

// (seriesName, day2BrtIso) — time gravado em BRT (UTC-3), startTime fica UTC.
const BRT_FIXES: Array<{ seriesName: string; day2BrtIso: string }> = [
  { seriesName: "OSS Flight", day2BrtIso: "2026-05-03T15:05:00" },
  { seriesName: "Mystery Mini", day2BrtIso: "2026-05-10T16:30:00" },
  { seriesName: "Mystery Million", day2BrtIso: "2026-05-03T15:30:00" },
  { seriesName: "Zodiac", day2BrtIso: "2026-05-03T09:30:00" },
];

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const userRes = await client.query(
      `SELECT user_platform_id FROM users WHERE email = $1;`,
      [FOUNDER_EMAIL],
    );
    const userId = userRes.rows[0].user_platform_id;
    console.log(`founder userId = ${userId}`);

    // Normaliza: pra cada (série), garante exatamente 1 planned por profile A e B.
    // DELETE all + INSERT 2 (idempotente em re-runs).
    const { nanoid } = await import("nanoid");
    for (const fix of BRT_FIXES) {
      const brt = new Date(fix.day2BrtIso);
      const dow = brt.getDay();
      const hh = String(brt.getHours()).padStart(2, "0");
      const mm = String(brt.getMinutes()).padStart(2, "0");
      const time = `${hh}:${mm}`;
      const day2Utc = new Date(`${fix.day2BrtIso}-03:00`).toISOString();

      const seriesRow = await client.query(
        `SELECT id, network FROM tournament_series WHERE user_id = $1 AND name = $2 LIMIT 1;`,
        [userId, fix.seriesName],
      );
      if (seriesRow.rows.length === 0) continue;
      const seriesId = seriesRow.rows[0].id;
      const network = seriesRow.rows[0].network;

      // DELETE todos planneds dessa série (qualquer profile)
      const del = await client.query(
        `DELETE FROM planned_tournaments WHERE user_id = $1 AND series_id = $2 RETURNING id;`,
        [userId, seriesId],
      );
      if (del.rowCount && del.rowCount > 0) {
        console.log(`  deleted ${del.rowCount} pre-existing planneds for ${fix.seriesName}`);
      }

      // INSERT 1 por profile (A + B)
      for (const targetProfile of ["A", "B"]) {
        const newId = nanoid(21);
        await client.query(
          `INSERT INTO planned_tournaments
             (id, user_id, day_of_week, time, profile, site, type, speed, name, buy_in, status, start_time, series_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'Vanilla', 'Normal', $7, '0', 'upcoming', $8, $9, NOW(), NOW());`,
          [newId, userId, dow, time, targetProfile, network, `${fix.seriesName} — Day 2`, day2Utc, seriesId],
        );
        console.log(`  created profile=${targetProfile} for ${fix.seriesName} (id=${newId})`);
      }
    }

    // Audit final
    console.log("\n=== AUDIT planned Day 2 (founder, COM profile) ===");
    const planneds = await client.query(
      `SELECT pt.id, pt.name, pt.day_of_week, pt.time, pt.profile, pt.start_time, ts.name as series_name
         FROM planned_tournaments pt
         LEFT JOIN tournament_series ts ON pt.series_id = ts.id
        WHERE pt.user_id = $1 AND pt.series_id IS NOT NULL
        ORDER BY ts.day2_datetime ASC, pt.profile ASC;`,
      [userId],
    );
    planneds.rows.forEach((r) =>
      console.log(`  ${r.id} | ${r.name} | profile=${r.profile} | dow=${r.day_of_week} time=${r.time} | start=${r.start_time}`),
    );

    console.log("\n=== AUDIT series ===");
    const series = await client.query(
      `SELECT id, name, network, day2_datetime, day2_status, total_day1s, stack_mode
         FROM tournament_series WHERE user_id = $1 ORDER BY day2_datetime ASC;`,
      [userId],
    );
    series.rows.forEach((r) =>
      console.log(`  ${r.id} | ${r.name} | net=${r.network} | day2=${r.day2_datetime} | status=${r.day2_status}`),
    );

    console.log("\n=== AUDIT bagged tournaments ===");
    const bagged = await client.query(
      `SELECT t.id, t.name, t.bagged_at, ts.name as series_name
         FROM tournaments t
         LEFT JOIN tournament_series ts ON t.series_id = ts.id
        WHERE t.user_id = $1 AND t.bagged_at IS NOT NULL
        ORDER BY t.bagged_at DESC;`,
      [userId],
    );
    bagged.rows.forEach((r) =>
      console.log(`  ${r.id} | ${r.name} | bagged=${r.bagged_at} | series=${r.series_name}`),
    );

    // Other users que talvez tenham os mesmos torneios
    console.log("\n=== OTHER users with matching planned (NOT linked yet) ===");
    const others = await client.query(
      `SELECT user_id, COUNT(*)::int as cnt
         FROM planned_tournaments
        WHERE name ILIKE ANY (ARRAY['%OSS%Flight%', '%Mystery%Mini%', '%Mystery%Million%Stage%', '%Zodiac%Phase%'])
          AND series_id IS NULL
        GROUP BY user_id
        ORDER BY cnt DESC;`,
    );
    others.rows.forEach((r) =>
      console.log(`  user=${r.user_id} | ${r.cnt} planneds nao linkados`),
    );

    // Profile states schema check
    console.log("\n=== PROFILE STATES schema ===");
    const psSchema = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'profile_states' ORDER BY ordinal_position;`,
    );
    psSchema.rows.forEach((r) => console.log(`  ${r.column_name}: ${r.data_type}`));

    console.log("\n=== PROFILE STATES founder ===");
    const psData = await client.query(
      `SELECT * FROM profile_states WHERE user_id = $1 LIMIT 5;`,
      [userId],
    );
    console.log(`rows: ${psData.rowCount}`);
    psData.rows.forEach((r) => console.log("  " + JSON.stringify(r)));

    // Schema planned_tournaments
    console.log("\n=== PLANNED schema ===");
    const ptSchema = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'planned_tournaments' ORDER BY ordinal_position;`,
    );
    ptSchema.rows.forEach((r) => console.log(`  ${r.column_name}: ${r.data_type}`));

    // Recurring planneds founder com profile
    console.log("\n=== founder ALL planneds matching keywords (com profile) ===");
    const recur = await client.query(
      `SELECT name, day_of_week, time, site, profile, series_id IS NOT NULL as linked
         FROM planned_tournaments
        WHERE user_id = $1
          AND name ILIKE ANY (ARRAY['%OSS%Flight%', '%Mystery%Mini%', '%Mystery%Million%Stage%', '%Zodiac%Phase%'])
        ORDER BY name, day_of_week, time, profile;`,
      [userId],
    );
    recur.rows.forEach((r) =>
      console.log(`  ${r.name} | dow=${r.day_of_week} | time=${r.time} | site=${r.site} | profile=${r.profile} | linked=${r.linked ? "YES" : "no"}`),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main();
