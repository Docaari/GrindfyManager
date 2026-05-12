// =============================================================================
// Fase 3 Wave G — Load test (autocannon).
//
// Valida que a plataforma aguenta ~100 usuarios concorrentes sem degradar,
// pos Waves A-F (indexes, query fixes, pool tuning, cron locks, home cache,
// frontend bundle).
//
// Pre-requisito: server rodando codigo NOVO (Waves A-F merged).
//   - dev:  npm run dev                  (porta 3000)
//   - prod: npx vite build && npx esbuild server/index.ts --platform=node \
//           --packages=external --bundle --format=esm --outdir=dist && \
//           NODE_ENV=production node dist/index.js
//
// Uso:
//   node scripts/load/run-loadtest.mjs                  # todos os cenarios
//   node scripts/load/run-loadtest.mjs --scenario=home  # so 1 cenario
//   BASE_URL=http://localhost:3001 node scripts/load/run-loadtest.mjs
//
// Cenarios autenticados precisam de um JWT. O script tenta gerar um
// automaticamente lendo DATABASE_URL + JWT_SECRET de .env e pegando o
// primeiro usuario ativo do DB. Override via LOADTEST_TOKEN env.
//
// IMPORTANTE: nao roda upload real (multipart pesado) — esse cenario fica
// como TODO documentado. Coach tambem nao chama Anthropic real.
// =============================================================================

import fs from "fs";
import autocannon from "autocannon";
import pg from "pg";
import jwt from "jsonwebtoken";

// ----------------------------------------------------------------------------
// Config
// ----------------------------------------------------------------------------
function loadEnv() {
  if (!fs.existsSync(".env")) return {};
  return Object.fromEntries(
    fs
      .readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return i === -1 ? [l, ""] : [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}
const env = { ...loadEnv(), ...process.env };
const BASE_URL = env.BASE_URL || "http://localhost:3000";
const argScenario = process.argv.find((a) => a.startsWith("--scenario="))?.split("=")[1];

// ----------------------------------------------------------------------------
// JWT — gerar token de teste se LOADTEST_TOKEN nao setado
// ----------------------------------------------------------------------------
async function resolveToken() {
  if (env.LOADTEST_TOKEN) return env.LOADTEST_TOKEN;
  if (!env.DATABASE_URL || !env.JWT_SECRET) {
    console.warn(
      "[loadtest] sem LOADTEST_TOKEN e sem DATABASE_URL/JWT_SECRET — cenarios autenticados serao pulados.",
    );
    return null;
  }
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT id, user_platform_id, email FROM users
       WHERE (status IS NULL OR status = 'active') ORDER BY created_at ASC LIMIT 1`,
    );
    if (!rows[0]) {
      console.warn("[loadtest] nenhum usuario ativo no DB — pulando cenarios autenticados.");
      return null;
    }
    const u = rows[0];
    const token = jwt.sign(
      { userId: u.id, userPlatformId: u.user_platform_id, email: u.email, type: "access" },
      env.JWT_SECRET,
      { expiresIn: "30m" },
    );
    console.log(`[loadtest] token gerado para ${u.user_platform_id} (${u.email})`);
    return token;
  } finally {
    await pool.end();
  }
}

// ----------------------------------------------------------------------------
// Cenarios
// ----------------------------------------------------------------------------
function buildScenarios(token) {
  const authHeaders = token ? { authorization: `Bearer ${token}` } : null;
  const all = [
    {
      name: "health",
      desc: "GET /api/health (liveness, sem auth) - sanity check + warmup",
      auth: false,
      cfg: { url: `${BASE_URL}/api/health`, connections: 50, duration: 10 },
    },
    {
      name: "ready",
      desc: "GET /api/ready (readiness + DB ping, sem auth)",
      auth: false,
      cfg: { url: `${BASE_URL}/api/ready`, connections: 30, duration: 10 },
    },
    {
      name: "home",
      desc: "GET /api/home/overview (~20 subqueries fanout + cache TTL 30s) - 100 users concorrentes",
      auth: true,
      cfg: { url: `${BASE_URL}/api/home/overview`, connections: 100, duration: 30 },
    },
    {
      name: "dashboard",
      desc: "GET /api/dashboard/quick-stats (agregacoes tournaments) - 100 users",
      auth: true,
      cfg: { url: `${BASE_URL}/api/dashboard/quick-stats`, connections: 100, duration: 20 },
    },
    {
      name: "library",
      desc: "GET /api/tournament-library (filtros + paginacao) - 50 users",
      auth: true,
      cfg: { url: `${BASE_URL}/api/tournament-library`, connections: 50, duration: 20 },
    },
  ];
  for (const s of all) {
    if (s.auth && authHeaders) s.cfg.headers = authHeaders;
  }
  return all;
}

// ----------------------------------------------------------------------------
// Runner
// ----------------------------------------------------------------------------
function runOne(scenario) {
  return new Promise((resolve) => {
    const line = "=".repeat(72);
    console.log(`\n${line}\n[${scenario.name}] ${scenario.desc}\n${line}`);
    const instance = autocannon(scenario.cfg, (err, result) => {
      if (err) {
        console.error(`[${scenario.name}] erro:`, err.message);
        return resolve({ name: scenario.name, error: err.message });
      }
      resolve({
        name: scenario.name,
        reqPerSec: result.requests.average,
        latencyP50: result.latency.p50,
        latencyP95: result.latency.p97_5, // autocannon expoe p97_5, nao p95 exato
        latencyP99: result.latency.p99,
        latencyMax: result.latency.max,
        non2xx: result.non2xx,
        errors: result.errors,
        timeouts: result.timeouts,
      });
    });
    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function main() {
  const token = await resolveToken();
  const scenarios = buildScenarios(token).filter((s) => {
    if (argScenario && s.name !== argScenario) return false;
    if (s.auth && !token) {
      console.warn(`[loadtest] pulando "${s.name}" - sem token.`);
      return false;
    }
    return true;
  });

  if (scenarios.length === 0) {
    console.error("[loadtest] nenhum cenario para rodar.");
    process.exit(1);
  }

  const results = [];
  for (const s of scenarios) {
    results.push(await runOne(s));
  }

  // Sumario + heuristica de pass/fail (budget: p95 < 2s, zero erro/timeout/non-2xx)
  const hr = "#".repeat(72);
  console.log(`\n${hr}\nSUMARIO\n${hr}`);
  let failed = false;
  for (const r of results) {
    if (r.error) {
      console.log(`  [${r.name}] ERRO: ${r.error}`);
      failed = true;
      continue;
    }
    const flags = [];
    if (r.latencyP95 > 2000) flags.push(`p95=${r.latencyP95}ms > 2000ms`);
    if (r.non2xx > 0) flags.push(`${r.non2xx} respostas non-2xx`);
    if (r.errors > 0) flags.push(`${r.errors} erros`);
    if (r.timeouts > 0) flags.push(`${r.timeouts} timeouts`);
    const status = flags.length ? `[!] ${flags.join("; ")}` : "[OK]";
    console.log(
      `  [${r.name}] ${r.reqPerSec.toFixed(0)} req/s | p50=${r.latencyP50}ms p95=${r.latencyP95}ms p99=${r.latencyP99}ms max=${r.latencyMax}ms | ${status}`,
    );
    if (flags.length) failed = true;
  }
  console.log(`${hr}\n`);

  if (failed) {
    console.log("[loadtest] [!] algum cenario degradou - investigar bottleneck (DB pool? CPU? mem?).");
    process.exitCode = 1;
  } else {
    console.log("[loadtest] [OK] todos os cenarios dentro do budget (p95 < 2s, zero erro).");
  }
}

main().catch((err) => {
  console.error("[loadtest] falha fatal:", err);
  process.exit(1);
});
