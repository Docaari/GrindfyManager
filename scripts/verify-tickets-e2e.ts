/**
 * Verifica B1 — caminho completo route → service → storage → DB.
 * Chama os handlers de routes/tickets.ts diretamente com req/res fake.
 *
 * Uso: tsx --env-file=.env scripts/verify-tickets-e2e.ts
 */
import pg from "pg";
import { nanoid } from "nanoid";
import {
  handlePostTicket,
  handlePatchCancelTicket,
  handleGetTickets,
} from "../server/routes/tickets";

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: "USER-TICKETS-E2E" },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

async function main() {
  const dbConn = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await dbConn.connect();
  const userId = "USER-TICKETS-E2E";
  await dbConn.query(
    `INSERT INTO users (id, user_platform_id, email, password)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_platform_id) DO NOTHING`,
    [nanoid(), userId, `e2e-${Date.now()}@example.com`, "x"],
  );

  // 1) POST /api/tickets (manual)
  console.log("== POST /api/tickets (manual, sem extraCash) ==");
  const postRes = makeRes();
  await handlePostTicket(
    makeReq({
      body: {
        targetName: "Sunday Storm (e2e)",
        targetSite: "PokerStars",
        ticketValueUSD: 109,
        source: "manual",
      },
    }) as any,
    postRes,
  );
  console.log("status:", postRes.statusCode, "body:", JSON.stringify(postRes.body).substring(0, 200));
  if (postRes.statusCode !== 201) throw new Error("POST falhou");
  const ticketId = postRes.body?.ticket?.id;

  // SQL: row criada na tabela
  const r1 = await dbConn.query(
    "SELECT id, status, target_name, ticket_value_usd FROM tickets WHERE id = $1",
    [ticketId],
  );
  console.log("DB SELECT apos POST:", r1.rows[0]);
  if (r1.rows.length !== 1) throw new Error("FAIL: ticket nao persistiu");

  // 2) GET /api/tickets
  console.log("\n== GET /api/tickets ==");
  const getRes = makeRes();
  await handleGetTickets(makeReq() as any, getRes);
  console.log(
    "status:",
    getRes.statusCode,
    "count:",
    getRes.body?.tickets?.length,
  );

  // 3) PATCH /api/tickets/:id/cancel
  console.log("\n== PATCH /api/tickets/:id/cancel ==");
  const patchRes = makeRes();
  await handlePatchCancelTicket(
    makeReq({
      params: { id: ticketId },
      body: { note: "cancelled via e2e script" },
    }) as any,
    patchRes,
  );
  console.log("status:", patchRes.statusCode, "ticket:", patchRes.body?.ticket?.status);
  if (patchRes.statusCode !== 200) throw new Error("PATCH falhou");

  const r2 = await dbConn.query(
    "SELECT status, cancelled_at FROM tickets WHERE id = $1",
    [ticketId],
  );
  console.log("DB SELECT apos PATCH:", r2.rows[0]);
  if (r2.rows[0]?.status !== "cancelled")
    throw new Error("FAIL: ticket nao virou cancelled");

  // Cleanup
  await dbConn.query("DELETE FROM tickets WHERE id = $1", [ticketId]);
  await dbConn.query("DELETE FROM users WHERE user_platform_id = $1", [userId]);
  await dbConn.end();
  console.log("\n[OK] E2E route → service → storage → DB confirmado.");
}

main().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
