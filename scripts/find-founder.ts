/**
 * Pos-Migration 0030 + Founder feedback:
 * Marca planneds Day 1 (originais, recorrentes, dow=6) dos 4 flights como
 * COMPLETED + linka ao series. Founder veria status "upcoming" antes; agora
 * vai ver "completed" indicando que passou pra Day 2.
 *
 * Uso: npx tsx --env-file=.env scripts/find-founder.ts
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

    // === FIX profile_states ===
    // Founder reportou que torneios sumiram da grade-planner. Causa:
    // getSessionTournamentsByDay default activeProfile='A' quando profile_states
    // nao tem row pra (user, dow). Planneds founder estao em profile='B'.
    // Solucao: garantir que profile_states tem entries pra todos os 7 dias = 'B'.
    const { nanoid: nanoidFix } = await import("nanoid");
    for (let dow = 0; dow < 7; dow++) {
      const exists = await client.query(
        `SELECT id FROM profile_states WHERE user_id = $1 AND day_of_week = $2 LIMIT 1;`,
        [userId, dow],
      );
      if (exists.rows.length === 0) {
        const psId = nanoidFix(21);
        await client.query(
          `INSERT INTO profile_states (id, user_id, day_of_week, active_profile, created_at, updated_at)
           VALUES ($1, $2, $3, 'B', NOW(), NOW());`,
          [psId, userId, dow],
        );
        console.log(`profile_states INSERTED dow=${dow} active_profile=B (id=${psId})`);
      } else {
        console.log(`profile_states OK dow=${dow}`);
      }
    }

    // === STEP 0a: REVERTER status='completed' nos Day 1 (founder esperava 'upcoming') ===
    // Founder usa grade-planner pra ver torneios planejados. status='completed'
    // pode disparar comportamento diferente (filter, badge, etc) na UI.
    // Reverter pra 'upcoming' e usar bagged_at no tournament historico (ja feito).
    const revertCompleted = await client.query(
      `UPDATE planned_tournaments
          SET status = 'upcoming', updated_at = NOW()
        WHERE user_id = $1 AND day_of_week = 6 AND status = 'completed'
        RETURNING id, name;`,
      [userId],
    );
    if (revertCompleted.rowCount && revertCompleted.rowCount > 0) {
      console.log(`reverted ${revertCompleted.rowCount} planneds Day 1 status -> upcoming`);
    }

    // === STEP 0: Marcar planneds Day 1 originais como COMPLETED + linkar a serie ===
    // Founder feedback 2026-05-03: vê 4 flights jogados sábado dow=6 ainda com
    // status=upcoming. Atualiza pra status=completed + seriesId pra refletir
    // "passou pra Day 2".
    const day1Patterns: Record<string, string> = {
      "OSS Flight": "OSS Flight",
      "Mystery Mini": "Mystery Mini D1",
      "Mystery Million": "Mystery Million Stage 1",
      "Zodiac": "Zodiac Phase",
    };
    for (const [seriesName, day1NamePattern] of Object.entries(day1Patterns)) {
      const seriesQ = await client.query(
        `SELECT id FROM tournament_series WHERE user_id = $1 AND name = $2 LIMIT 1;`,
        [userId, seriesName],
      );
      if (seriesQ.rows.length === 0) continue;
      const seriesId = seriesQ.rows[0].id;
      const upd = await client.query(
        `UPDATE planned_tournaments
            SET series_id = $1, updated_at = NOW()
          WHERE user_id = $2
            AND name = $3
            AND day_of_week = 6
            AND series_id IS NULL
          RETURNING id, name, day_of_week, time, profile, status;`,
        [seriesId, userId, day1NamePattern],
      );
      if (upd.rowCount && upd.rowCount > 0) {
        console.log(`linked ${upd.rowCount} Day 1 planneds to series ${day1NamePattern}:`);
        upd.rows.forEach((r) =>
          console.log(`  ${r.id} | ${r.name} | profile=${r.profile} | dow=${r.day_of_week} time=${r.time} | status=${r.status}`),
        );
      }
    }

    // Normaliza: pra cada (série), garante exatamente 1 planned Day 2 por profile A e B.
    // DELETE only Day 2 planneds (mantém Day 1 originais marcados como completed).
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

      // DELETE somente Day 2 planneds (name LIKE '%Day 2'), preservando Day 1 originais.
      const del = await client.query(
        `DELETE FROM planned_tournaments
          WHERE user_id = $1 AND series_id = $2 AND name ILIKE '%Day 2'
        RETURNING id;`,
        [userId, seriesId],
      );
      if (del.rowCount && del.rowCount > 0) {
        console.log(`  deleted ${del.rowCount} Day 2 planneds for ${fix.seriesName}`);
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
