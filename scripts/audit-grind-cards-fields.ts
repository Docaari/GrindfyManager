/**
 * Audit fields populating /grind cards. One-shot diagnostic.
 *
 * Run: npx tsx --env-file=.env scripts/audit-grind-cards-fields.ts
 */
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  const pool = new Pool({ connectionString: url });

  const userPlatformId = process.argv[2] ?? 'USER-0005';

  console.log(`\n=== AUDIT GRIND CARDS — user ${userPlatformId} ===\n`);

  // 1. session_tournaments fieldSize distribution
  const fieldSizeStats = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(field_size) FILTER (WHERE field_size > 0)::int AS with_field_size,
      MIN(field_size) FILTER (WHERE field_size > 0) AS min_fs,
      MAX(field_size) FILTER (WHERE field_size > 0) AS max_fs,
      ROUND(AVG(field_size) FILTER (WHERE field_size > 0)::numeric, 1) AS mean_fs,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY field_size) FILTER (WHERE field_size > 0) AS median_fs,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY field_size) FILTER (WHERE field_size > 0) AS p90_fs,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY field_size) FILTER (WHERE field_size > 0) AS p99_fs
    FROM session_tournaments
    WHERE user_id = $1
    `,
    [userPlatformId],
  );
  console.log('SESSION_TOURNAMENTS fieldSize stats:');
  console.table(fieldSizeStats.rows);

  // 2. Top outliers (fieldSize > 50k)
  const outliers = await pool.query(
    `
    SELECT id, name, site, field_size, position, prize, result
    FROM session_tournaments
    WHERE user_id = $1 AND field_size > 50000
    ORDER BY field_size DESC
    LIMIT 20
    `,
    [userPlatformId],
  );
  console.log(`\nOUTLIERS fieldSize > 50000 (${outliers.rowCount} rows):`);
  console.table(outliers.rows);

  // 3. fieldSize buckets
  const buckets = await pool.query(
    `
    SELECT
      CASE
        WHEN field_size IS NULL OR field_size = 0 THEN '0_or_null'
        WHEN field_size < 100 THEN '1-99'
        WHEN field_size < 1000 THEN '100-999'
        WHEN field_size < 10000 THEN '1000-9999'
        WHEN field_size < 50000 THEN '10000-49999'
        WHEN field_size < 100000 THEN '50000-99999'
        ELSE '100000+'
      END AS bucket,
      COUNT(*)::int AS count,
      MIN(field_size)::int AS min_in_bucket,
      MAX(field_size)::int AS max_in_bucket
    FROM session_tournaments
    WHERE user_id = $1
    GROUP BY 1
    ORDER BY MIN(field_size) NULLS FIRST
    `,
    [userPlatformId],
  );
  console.log('\nfieldSize BUCKETS:');
  console.table(buckets.rows);

  // 4. Add-on counts
  const addOnStats = await pool.query(
    `
    SELECT
      type,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE addon_taken = true)::int AS with_addon_taken,
      COUNT(*) FILTER (WHERE allows_addon = true)::int AS with_allows_addon
    FROM session_tournaments
    WHERE user_id = $1
    GROUP BY type
    ORDER BY total DESC
    `,
    [userPlatformId],
  );
  console.log('\nADD-ON breakdown by type:');
  console.table(addOnStats.rows);

  // 5. reentries + rebuys
  const reentryStats = await pool.query(
    `
    SELECT
      SUM(reentries)::int AS sum_reentries,
      SUM(rebuys)::int AS sum_rebuys,
      SUM(reentries + rebuys)::int AS sum_both,
      COUNT(*) FILTER (WHERE reentries > 0)::int AS with_reentries,
      COUNT(*) FILTER (WHERE rebuys > 0)::int AS with_rebuys
    FROM session_tournaments
    WHERE user_id = $1
    `,
    [userPlatformId],
  );
  console.log('\nREENTRIES / REBUYS:');
  console.table(reentryStats.rows);

  // 6. Maior resultado top 10
  const topPrizes = await pool.query(
    `
    SELECT id, name, site, position, result, prize, type
    FROM session_tournaments
    WHERE user_id = $1 AND COALESCE(NULLIF(result, '0')::numeric, NULLIF(prize, '0')::numeric, 0) > 0
    ORDER BY COALESCE(NULLIF(result, '0')::numeric, NULLIF(prize, '0')::numeric, 0) DESC
    LIMIT 10
    `,
    [userPlatformId],
  );
  console.log('\nTOP 10 PRIZES (raw native):');
  console.table(topPrizes.rows);

  // 6b. tournaments (regular) fieldSize distribution
  const regularStats = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE field_size IS NOT NULL AND field_size > 0)::int AS with_field_size,
      MIN(field_size) FILTER (WHERE field_size > 0) AS min_fs,
      MAX(field_size) FILTER (WHERE field_size > 0) AS max_fs,
      ROUND(AVG(field_size) FILTER (WHERE field_size > 0)::numeric, 1) AS mean_fs,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY field_size) FILTER (WHERE field_size > 0) AS median_fs,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY field_size) FILTER (WHERE field_size > 0) AS p90_fs,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY field_size) FILTER (WHERE field_size > 0) AS p99_fs
    FROM tournaments
    WHERE user_id = $1 AND grind_session_id IS NOT NULL
    `,
    [userPlatformId],
  );
  console.log('\nTOURNAMENTS (regular, sessions registradas) fieldSize stats:');
  console.table(regularStats.rows);

  // 6c. Status distribution session_tournaments — endpoint filter relevance
  const statusStats = await pool.query(
    `
    SELECT
      status,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE position IS NOT NULL AND position > 0)::int AS with_position,
      COUNT(*) FILTER (WHERE NULLIF(result, '0')::numeric > 0)::int AS with_result,
      COUNT(*) FILTER (WHERE addon_taken = true)::int AS with_addon
    FROM session_tournaments
    WHERE user_id = $1
    GROUP BY status
    ORDER BY total DESC
    `,
    [userPlatformId],
  );
  console.log('\nSESSION_TOURNAMENTS status distribution + filters:');
  console.table(statusStats.rows);

  // 6d. Tournaments table reach by addon_taken
  const tableSample = await pool.query(
    `
    SELECT type, COUNT(*)::int AS total
    FROM tournaments
    WHERE user_id = $1 AND grind_session_id IS NOT NULL
    GROUP BY type
    ORDER BY total DESC
    `,
    [userPlatformId],
  );
  console.log('\nTOURNAMENTS table (regular, with grind_session_id):');
  console.table(tableSample.rows);

  // 7. session.duration distribution
  const durationStats = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_sessions,
      COUNT(*) FILTER (WHERE duration > 0)::int AS with_duration,
      MIN(duration) FILTER (WHERE duration > 0) AS min_dur,
      MAX(duration) FILTER (WHERE duration > 0) AS max_dur,
      ROUND(AVG(duration) FILTER (WHERE duration > 0)::numeric, 1) AS mean_dur
    FROM grind_sessions
    WHERE user_id = $1
    `,
    [userPlatformId],
  );
  console.log('\nSESSION.duration stats (minutes):');
  console.table(durationStats.rows);

  // 8. KPI expected values (only finished session_tournaments)
  const kpiQuery = await pool.query(
    `
    WITH ft AS (
      SELECT *
      FROM session_tournaments
      WHERE user_id = $1
        AND status = 'finished'
    )
    SELECT
      COUNT(DISTINCT id)::int AS total_registros,
      SUM(reentries + rebuys)::int AS total_reentradas_rebuys,
      COUNT(*) FILTER (WHERE NULLIF(result, '0')::numeric > 0)::int AS itm_count,
      COUNT(*)::int AS total_finished,
      COUNT(*) FILTER (WHERE position > 0 AND position <= 9)::int AS fts,
      COUNT(*) FILTER (WHERE position = 1)::int AS cravadas,
      COUNT(*) FILTER (WHERE addon_taken = true)::int AS addon_taken_count,
      COUNT(*) FILTER (WHERE type = 'Add-on')::int AS type_addon_count,
      COUNT(*) FILTER (WHERE addon_taken = true OR type = 'Add-on')::int AS bucket_addon_v23
    FROM ft
    `,
    [userPlatformId],
  );
  console.log('\nKPI expected values (finished session_tournaments only):');
  console.table(kpiQuery.rows);

  // 9. Site distribution
  const siteStats = await pool.query(
    `
    SELECT site, COUNT(*)::int AS total
    FROM session_tournaments
    WHERE user_id = $1 AND status = 'finished'
    GROUP BY site
    ORDER BY total DESC
    `,
    [userPlatformId],
  );
  console.log('\nSITE distribution (finished):');
  console.table(siteStats.rows);

  // 10. tournament_library + tournament_templates fieldSize coverage
  const libStats = await pool.query(
    `
    SELECT
      'tournament_library' AS source,
      COUNT(*)::int AS total,
      COUNT(field_size)::int AS with_fs,
      ROUND(AVG(field_size)::numeric, 1) AS mean_fs,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY field_size) AS median_fs,
      MIN(field_size) AS min_fs,
      MAX(field_size) AS max_fs
    FROM tournament_library
    WHERE user_id = $1 AND deleted_at IS NULL
    UNION ALL
    SELECT
      'tournament_templates' AS source,
      COUNT(*)::int AS total,
      COUNT(avg_field_size)::int AS with_fs,
      ROUND(AVG(avg_field_size)::numeric, 1) AS mean_fs,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_field_size) AS median_fs,
      MIN(avg_field_size) AS min_fs,
      MAX(avg_field_size) AS max_fs
    FROM tournament_templates
    WHERE user_id = $1
    UNION ALL
    SELECT
      'tournaments (regular)' AS source,
      COUNT(*)::int AS total,
      COUNT(field_size)::int AS with_fs,
      ROUND(AVG(field_size)::numeric, 1) AS mean_fs,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY field_size) AS median_fs,
      MIN(field_size) AS min_fs,
      MAX(field_size) AS max_fs
    FROM tournaments
    WHERE user_id = $1 AND grind_session_id IS NULL
    `,
    [userPlatformId],
  );
  console.log('\nFIELDSIZE coverage across tables:');
  console.table(libStats.rows);

  // 11b. session_tournaments guaranteed coverage
  const gtdStats = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE NULLIF(guaranteed, '0')::numeric > 0)::int AS with_gtd,
      COUNT(*) FILTER (WHERE NULLIF(guaranteed, '0')::numeric > 0
                       AND NULLIF(buy_in, '0')::numeric > 0)::int AS with_gtd_buyin,
      ROUND(AVG(NULLIF(guaranteed, '0')::numeric / NULLIF(buy_in, '0')::numeric)
            FILTER (WHERE NULLIF(guaranteed, '0')::numeric > 0
                     AND NULLIF(buy_in, '0')::numeric > 0), 1) AS mean_gtd_over_buyin,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY NULLIF(guaranteed, '0')::numeric / NULLIF(buy_in, '0')::numeric
      ) FILTER (WHERE NULLIF(guaranteed, '0')::numeric > 0
                 AND NULLIF(buy_in, '0')::numeric > 0) AS median_gtd_over_buyin
    FROM session_tournaments
    WHERE user_id = $1 AND status = 'finished'
    `,
    [userPlatformId],
  );
  console.log('\nSESSION_TOURNAMENTS guaranteed/buyIn coverage (founder formula):');
  console.table(gtdStats.rows);

  // 11. JOIN session_tournaments to tournament_library by name+site
  const joinStats = await pool.query(
    `
    SELECT
      COUNT(*)::int AS finished,
      COUNT(lib.field_size)::int AS matched_lib_fs,
      ROUND(AVG(lib.field_size)::numeric, 1) AS mean_matched,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lib.field_size) AS median_matched
    FROM session_tournaments st
    LEFT JOIN tournament_library lib
      ON lib.user_id = st.user_id
      AND LOWER(lib.name) = LOWER(st.name)
      AND LOWER(lib.site) = LOWER(st.site)
      AND lib.deleted_at IS NULL
    WHERE st.user_id = $1 AND st.status = 'finished'
    `,
    [userPlatformId],
  );
  console.log('\nJOIN session_tournaments x tournament_library:');
  console.table(joinStats.rows);

  await pool.end();
  console.log('\n=== END AUDIT ===\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
