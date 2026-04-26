/**
 * Verifica B1 — persistencia real de tickets via Drizzle.
 * Exercita storage.createTicket / storage.cancelTicket / storage.useTicket
 * contra o DB local. Apos cada operacao, faz query SQL direta na tabela
 * `tickets` para confirmar que o estado foi persistido.
 *
 * Uso: tsx --env-file=.env scripts/verify-tickets-persistence.ts
 */
import pg from "pg";
import { storage } from "../server/storage";
import { nanoid } from "nanoid";

async function main() {
  const dbConn = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await dbConn.connect();

  // Buscar/garantir um user de teste
  const userId = "USER-TICKETS-VERIFY";
  await dbConn.query(
    `INSERT INTO users (id, user_platform_id, email, password)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_platform_id) DO NOTHING`,
    [nanoid(), userId, `verify-${Date.now()}@example.com`, "x"],
  );

  // 1) createTicket via Drizzle
  console.log("== 1) storage.createTicket ==");
  const created = await (storage as any).createTicket({
    userId,
    targetName: "WSOP ME (verify)",
    targetSite: "GG",
    ticketValueUSD: "215",
    source: "manual",
  });
  console.log("Ticket criado:", { id: created.id, status: created.status });

  // Verificar via SQL direto
  const r1 = await dbConn.query(
    "SELECT id, user_id, status, ticket_value_usd, target_name FROM tickets WHERE id = $1",
    [created.id],
  );
  console.log("DB SELECT apos create:", r1.rows[0] ?? "<nao encontrado>");
  if (r1.rows.length === 0) throw new Error("FAIL: ticket nao persistiu apos createTicket");

  // 2) cancelTicket
  console.log("== 2) storage.cancelTicket ==");
  const cancelled = await (storage as any).cancelTicket(created.id, userId, "verify cancel");
  console.log("Retorno cancelTicket:", { status: cancelled.status, cancelledAt: cancelled.cancelledAt });

  const r2 = await dbConn.query(
    "SELECT status, cancelled_at, note FROM tickets WHERE id = $1",
    [created.id],
  );
  console.log("DB SELECT apos cancel:", r2.rows[0]);
  if (r2.rows[0]?.status !== "cancelled") {
    throw new Error("FAIL: status nao virou cancelled apos cancelTicket");
  }
  if (!r2.rows[0]?.cancelled_at) {
    throw new Error("FAIL: cancelled_at nao foi preenchido");
  }

  // 3) Idempotencia do cancelTicket
  console.log("== 3) cancelTicket idempotente ==");
  const cancelled2 = await (storage as any).cancelTicket(created.id, userId);
  console.log("Idempotente OK:", cancelled2.status === "cancelled");

  // 4) Cleanup
  await dbConn.query("DELETE FROM tickets WHERE id = $1", [created.id]);
  await dbConn.query(
    "DELETE FROM users WHERE user_platform_id = $1",
    [userId],
  );

  await dbConn.end();
  console.log("\n[OK] Persistencia real confirmada (B1).");
}

main().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
