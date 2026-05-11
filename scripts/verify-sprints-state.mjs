import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const tables = [
  "study_sessions_v2",
  "study_themes",
  "user_focus_stats",
  "study_weekly_plans",
  "coach_session_insights",
  "spot_reentry_cards",
];

const cols = {
  users: ["daily_study_goal_minutes", "study_streak_freezes_used_this_month", "last_freeze_reset_month"],
  starred_hands: ["insight", "decision_correct", "confidence_level", "tags"],
};

console.log("== TABLES ==");
for (const t of tables) {
  const r = await c.query(
    "SELECT to_regclass($1) AS x",
    [`public.${t}`]
  );
  console.log(`${t.padEnd(30)} ${r.rows[0].x ? "OK" : "MISSING"}`);
}

console.log("\n== COLUMNS ==");
for (const [tab, list] of Object.entries(cols)) {
  for (const col of list) {
    const r = await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2",
      [tab, col]
    );
    console.log(`${tab}.${col}`.padEnd(50), r.rowCount ? "OK" : "MISSING");
  }
}

console.log("\n== STARRED_HANDS NULLABILITY ==");
const r = await c.query(
  "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='starred_hands' AND column_name IN ('session_id','session_tournament_id')"
);
for (const row of r.rows) {
  console.log(`starred_hands.${row.column_name}`.padEnd(50), `nullable=${row.is_nullable}`);
}

console.log("\n== CURATED THEMES SEED ==");
const seedR = await c.query(
  "SELECT COUNT(*) FROM study_themes WHERE is_curated = true"
);
console.log(`curated themes count: ${seedR.rows[0].count}`);

await c.end();
