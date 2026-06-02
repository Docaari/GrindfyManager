/**
 * Verify (read-only) do sprint torneios-library-grouping na conta coin@coin.com.
 * NAO escreve dado de torneio. Prova a pipeline: agrupamento 6-dim + read-side
 * type/speed + Top 3. Se coin nao tem torneios, roda um demo sintetico in-memory
 * via groupTournaments (sem DB write).
 *
 * Run: npx tsx --env-file=.env scripts/verify-torneios-coin.ts
 */
import { db } from "../server/db";
import { users, tournaments } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { storage } from "../server/storage";
import { groupTournaments } from "../server/services/libraryGrouping";
import { computeTop3 } from "../client/src/lib/libraryTop3";

async function main() {
  const [coin] = await db.select().from(users).where(eq(users.email, "coin@coin.com"));
  if (!coin) {
    console.log("coin@coin.com NAO existe — rode scripts/create-coin-user.ts primeiro.");
  } else {
    console.log("coin:", coin.userPlatformId, coin.email, coin.subscriptionPlan);
    const tcount = await db
      .select()
      .from(tournaments)
      .where(and(eq(tournaments.userId, coin.userPlatformId), isNull(tournaments.grindSessionId)));
    console.log(`coin historico (grind_session_id IS NULL): ${tcount.length} torneios`);

    if (tcount.length > 0) {
      const fams: any[] = await (storage as any).getTournamentLibrary(coin.userPlatformId, "all", {});
      console.log(`\nFamilias: ${fams.length}`);
      for (const f of fams.slice(0, 8)) {
        console.log(
          `  · ${f.groupName} | vol=${f.volume} type=${f.category} speed=${f.speed} field=${f.fieldBucket} time=${f.timeBin} avgProfit=${f.avgProfit} pph=${f.profitPerTableHour}`,
        );
      }
      const top3 = computeTop3(fams as any);
      console.log(`\nTOP 3:`);
      top3.forEach((c, i) =>
        console.log(`  ${i + 1}. ${c.groupName} blend=${c.blendScore.toFixed(3)} vol=${c.volume} roi=${c.roi}% avgProfit=${c.avgProfit}`),
      );
    } else {
      console.log("(coin sem historico — importe CSV pra ver Top 3 real na aba Torneios)");
    }
  }

  // Demo sintetico in-memory (sem DB) provando agrupamento 6-dim + read-side.
  console.log("\n=== DEMO SINTETICO (in-memory, sem DB) ===");
  const sample = [
    { id: "1", site: "CoinPoker", buyIn: "22", type: "Vanilla", category: "Vanilla", name: "Mega Sat to Main", datePlayed: new Date(Date.UTC(2026, 0, 1, 12, 0)), fieldSize: 300, prize: "40", reentries: 0, finalTable: false, position: 50 },
    { id: "2", site: "CoinPoker", buyIn: "22", type: "Vanilla", category: "Vanilla", name: "Daily Hyper Bounty", datePlayed: new Date(Date.UTC(2026, 0, 1, 21, 0)), fieldSize: 80, prize: "0", reentries: 0, finalTable: false, position: 60 },
    { id: "3", site: "CoinPoker", buyIn: "22", type: "PKO", category: "PKO", name: "Bounty Builder", datePlayed: new Date(Date.UTC(2026, 0, 1, 12, 30)), fieldSize: 300, prize: "100", reentries: 0, finalTable: true, position: 3 },
  ];
  const fams = groupTournaments(sample);
  for (const f of fams) {
    console.log(`  fam ${f.familyKey}  -> type=${f.type} speed=${f.speed} field=${f.fieldBucket} time=${f.timeBin}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
