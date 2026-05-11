import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Wave C (Fase 3 perf):
// - `max` configuravel via DB_POOL_MAX (default 25). Home dispara ~20 subqueries
//   paralelas via Promise.allSettled; 100 users x 20 = 2000 queries enfileiradas.
//   `max: 10` era bottleneck obvio. 25 da headroom mas fica abaixo do cap do
//   Neon free (~100 conns/compute) com folga pra outros processos (suprema sync,
//   crons, drizzle-kit).
// - `connectionTimeoutMillis: 2000` faz falha aparecer rapido (antes esperava
//   10s e segurava handler na UI).
// - `statement_timeout: 15000` via options string — runaway query nao prende
//   pool indefinidamente. Aplicado server-side na conexao (PG nativo).
// - `keepAlive: true` evita Cloudflare/Neon dropar TCP idle silenciosamente.
// - Em prod, DATABASE_URL DEVE apontar para endpoint `-pooler.neon.tech` (PgBouncer).
//   Migrations (drizzle-kit push) devem usar endpoint direto via DATABASE_URL_UNPOOLED.
const poolMaxRaw = Number(process.env.DB_POOL_MAX);
const POOL_MAX = Number.isFinite(poolMaxRaw) && poolMaxRaw > 0 ? poolMaxRaw : 25;

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  keepAlive: true,
  // statement_timeout enforced no Postgres server por conexao (15s default).
  // ADR-pendente Wave C: review se algum endpoint legitimo precisa >15s
  // (export/PDF? OCR sync? — atual nao tem).
  options: "-c statement_timeout=15000",
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

// Log pool errors to prevent silent connection failures
pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err.message);
});

export const db = drizzle({ client: pool, schema });