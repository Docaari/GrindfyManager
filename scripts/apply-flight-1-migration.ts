/**
 * MULTI-PASS:
 *   1. Aplica migration 0029_add_tournament_series.sql (idempotente)
 *   2. Back-fill 4 flights do founder (USER-0005):
 *      - OSS Flight              -> Day 2: 2026-05-03 15:05 BRT (UTC-3)
 *      - Mystery Mini D1         -> Day 2: 2026-05-10 16:30 BRT
 *      - Mystery Million Stage 1 -> Day 2: 2026-05-03 15:30 BRT
 *      - Zodiac Phase            -> Day 2: 2026-05-03 09:30 BRT
 *   Pra cada: cria tournament_series + tournament Day 1 historico (bagged)
 *   + planned_tournament Day 2 (linkado).
 *
 * Uso: npx tsx --env-file=.env scripts/apply-flight-1-migration.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface FlightSpec {
  seriesName: string; // tournament_series.name
  day1Name: string; // tournament historico Day 1 name
  site: string; // network
  day2Utc: string; // ISO UTC
}

const FOUNDER_EMAIL = "ricardo.agnolo@hotmail.com";

const FLIGHTS: FlightSpec[] = [
  { seriesName: "OSS Flight", day1Name: "OSS Flight (Day 1)", site: "YaPoker", day2Utc: "2026-05-03T18:05:00Z" },
  { seriesName: "Mystery Mini", day1Name: "Mystery Mini D1", site: "ChampionPoker", day2Utc: "2026-05-10T19:30:00Z" },
  { seriesName: "Mystery Million", day1Name: "Mystery Million Stage 1", site: "GGNetwork", day2Utc: "2026-05-03T18:30:00Z" },
  { seriesName: "Zodiac", day1Name: "Zodiac Phase", site: "GGNetwork", day2Utc: "2026-05-03T12:30:00Z" },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[apply-flight-1] DATABASE_URL ausente");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    // === Pass 1: aplicar migration 0029 ===
    const sqlPath = resolve(__dirname, "..", "migrations", "0029_add_tournament_series.sql");
    const sql = readFileSync(sqlPath, "utf-8");
    console.log(`[pass1] applying ${sqlPath} (${sql.length} bytes)`);
    await client.query(sql);
    console.log("[pass1] OK migration aplicada");

    // === Pass 2: validacao schema ===
    for (const t of ["tournament_series"]) {
      const r = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1) as exists;`,
        [t],
      );
      console.log(`[pass2] table ${t}: ${r.rows[0]?.exists}`);
    }
    for (const c of [
      ["tournaments", "series_id"],
      ["tournaments", "bagged_at"],
      ["planned_tournaments", "series_id"],
      ["user_settings", "reports_expand_flight_series"],
    ]) {
      const r = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = $1 AND column_name = $2) as exists;`,
        [c[0], c[1]],
      );
      console.log(`[pass2] ${c[0]}.${c[1]}: ${r.rows[0]?.exists}`);
    }

    // === Pass 3: encontrar founder ===
    const userRes = await client.query(
      `SELECT user_platform_id FROM users WHERE email = $1;`,
      [FOUNDER_EMAIL],
    );
    if (userRes.rows.length === 0) {
      console.error(`[pass3] founder nao encontrado: ${FOUNDER_EMAIL}`);
      process.exit(1);
    }
    const userId = userRes.rows[0].user_platform_id;
    console.log(`[pass3] founder userId = ${userId}`);

    // === Pass 4: back-fill 4 flights ===
    let okCount = 0;
    let skipCount = 0;
    const results: any[] = [];

    for (const spec of FLIGHTS) {
      console.log(`\n--- ${spec.day1Name} ---`);

      // Idempotencia: usa serie existente OU cria nova.
      const existing = await client.query(
        `SELECT id FROM tournament_series WHERE user_id = $1 AND name = $2 AND network = $3 LIMIT 1;`,
        [userId, spec.seriesName, spec.site],
      );
      let seriesId: string;
      if (existing.rows.length > 0) {
        seriesId = existing.rows[0].id;
        console.log(`  reusing existing series ${seriesId}`);
      } else {
        seriesId = nanoid(21);
        await client.query(
          `INSERT INTO tournament_series
             (id, user_id, name, network, total_day1s, day2_datetime, day2_status, stack_mode, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 1, $5, 'pending', 'single', NOW(), NOW());`,
          [seriesId, userId, spec.seriesName, spec.site, spec.day2Utc],
        );
        console.log(`  created series ${seriesId}`);
      }

      // Idempotencia: ja existe Day 1 linkado a essa serie?
      const day1Existing = await client.query(
        `SELECT id FROM tournaments WHERE user_id = $1 AND series_id = $2 AND bagged_at IS NOT NULL LIMIT 1;`,
        [userId, seriesId],
      );
      const day2Existing = await client.query(
        `SELECT id FROM planned_tournaments WHERE user_id = $1 AND series_id = $2 LIMIT 1;`,
        [userId, seriesId],
      );
      if (day1Existing.rows.length > 0 && day2Existing.rows.length > 0) {
        console.log(`  ALREADY complete (Day1 + Day2 linkados) — skipping`);
        skipCount += 1;
        results.push({ label: spec.day1Name, status: "skipped-complete", seriesId });
        continue;
      }

      // Cria tournament Day 1 historico (founder ja jogou hoje + baggou)
      let day1Id: string;
      if (day1Existing.rows.length > 0) {
        day1Id = day1Existing.rows[0].id;
        console.log(`  reusing existing Day 1 ${day1Id}`);
      } else {
        day1Id = nanoid(21);
        await client.query(
          `INSERT INTO tournaments
             (id, user_id, name, site, buy_in, prize, position,
              date_played, format, category, speed, type,
              series_id, bagged_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, '0', '0', NULL,
                   NOW(), 'MTT', 'Vanilla', 'Normal', 'Vanilla',
                   $5, NOW(), NOW(), NOW());`,
          [day1Id, userId, spec.day1Name, spec.site, seriesId],
        );
        console.log(`  created tournament Day 1 ${day1Id} (bagged_at = NOW)`);
      }

      // Cria planned_tournament Day 2 (idempotente)
      if (day2Existing.rows.length > 0) {
        console.log(`  reusing existing planned Day 2 ${day2Existing.rows[0].id}`);
        okCount += 1;
        results.push({
          label: spec.day1Name,
          status: "completed",
          seriesId,
          tournamentId: day1Id,
          plannedId: day2Existing.rows[0].id,
          day2Utc: spec.day2Utc,
        });
        continue;
      }
      const plannedId = nanoid(21);
      const day2 = new Date(spec.day2Utc);
      const dayOfWeek = day2.getUTCDay();
      const hh = String(day2.getUTCHours()).padStart(2, "0");
      const mm = String(day2.getUTCMinutes()).padStart(2, "0");
      const time = `${hh}:${mm}`;
      await client.query(
        `INSERT INTO planned_tournaments
           (id, user_id, day_of_week, time, site, type, speed, name, buy_in, status, start_time, series_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'Vanilla', 'Normal', $6, '0', 'upcoming', $7, $8, NOW(), NOW());`,
        [
          plannedId,
          userId,
          dayOfWeek,
          time,
          spec.site,
          `${spec.seriesName} — Day 2`,
          spec.day2Utc,
          seriesId,
        ],
      );
      console.log(`  created planned Day 2 ${plannedId} (dow=${dayOfWeek}, time=${time} UTC)`);

      okCount += 1;
      results.push({
        label: spec.day1Name,
        status: "ok",
        seriesId,
        tournamentId: day1Id,
        plannedId,
        day2Utc: spec.day2Utc,
      });
    }

    console.log("\n============================================================");
    console.log(`SUMMARY: ${okCount} OK / ${skipCount} skipped (total ${FLIGHTS.length})`);
    console.log("============================================================");
    results.forEach((r) => console.log(JSON.stringify(r)));

    // === Pass 5: validacao final ===
    console.log("\n--- DB validation ---");
    const seriesQ = await client.query(
      `SELECT id, name, day2_datetime, total_day1s, stack_mode, day2_status
         FROM tournament_series WHERE user_id = $1 ORDER BY day2_datetime ASC;`,
      [userId],
    );
    console.log(`tournament_series count: ${seriesQ.rows.length}`);
    seriesQ.rows.forEach((r) =>
      console.log(`  ${r.id} | ${r.name} | day2=${r.day2_datetime} | mode=${r.stack_mode} | status=${r.day2_status}`),
    );

    const plannedQ = await client.query(
      `SELECT pt.id, pt.name, pt.start_time, pt.day_of_week, pt.time, pt.site, pt.series_id, ts.name as series_name
         FROM planned_tournaments pt
         LEFT JOIN tournament_series ts ON pt.series_id = ts.id
        WHERE pt.user_id = $1 AND pt.series_id IS NOT NULL
        ORDER BY pt.start_time ASC;`,
      [userId],
    );
    console.log(`\nplanned_tournaments com series_id: ${plannedQ.rows.length}`);
    plannedQ.rows.forEach((r) =>
      console.log(`  ${r.id} | ${r.name} | start=${r.start_time} | dow=${r.day_of_week} | time=${r.time} | series=${r.series_name}`),
    );

    const baggedQ = await client.query(
      `SELECT t.id, t.name, t.bagged_at, t.series_id, ts.name as series_name
         FROM tournaments t
         LEFT JOIN tournament_series ts ON t.series_id = ts.id
        WHERE t.user_id = $1 AND t.bagged_at IS NOT NULL
        ORDER BY t.bagged_at DESC LIMIT 10;`,
      [userId],
    );
    console.log(`\ntournaments bagged: ${baggedQ.rows.length}`);
    baggedQ.rows.forEach((r) =>
      console.log(`  ${r.id} | ${r.name} | bagged=${r.bagged_at} | series=${r.series_name}`),
    );
  } catch (err: any) {
    console.error("[apply-flight-1] FAILED:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
