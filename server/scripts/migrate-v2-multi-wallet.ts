/**
 * Sprint Bankroll-2 Migration: cria default wallet "Banca Padrao USD" para
 * usuarios v1 e backfill walletId em snapshots existentes.
 *
 * Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-08)
 * ADR-035: snapshots ja sao audit trail v1; NAO criar wallet_transactions.
 *
 * Uso:
 *   tsx server/scripts/migrate-v2-multi-wallet.ts                  # apply
 *   BANKROLL_V2_DRY_RUN=true tsx server/scripts/migrate-v2-multi-wallet.ts
 */

import { storage } from "../storage";
import { nanoid } from "nanoid";

interface V2MigrationResult {
  migrated: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
}

function parseDecimal(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
}

export async function runV2Migration(opts: { dryRun?: boolean } = {}): Promise<V2MigrationResult> {
  const dryRun = opts.dryRun ?? process.env.BANKROLL_V2_DRY_RUN === "true";

  const candidates = await storage.listUsersForV2Migration();
  const result: V2MigrationResult = { migrated: 0, skipped: 0, errors: 0, dryRun };

  for (const u of candidates) {
    try {
      // Cada usuario em sua propria transacao — limita raio de explosao.
      const r = await storage.transaction(async (tx: any) => {
        const settings = await tx.selectUserSettingsForUpdate(u.userId);
        if (!settings) {
          return { skip: true, reason: "no_settings" };
        }
        if (settings.bankrollV2Migrated) {
          return { skip: true, reason: "already_migrated" };
        }
        const existing = await tx.listWalletsByUser(u.userId, { includeArchived: true });
        if (existing.length > 0) {
          // Defesa em profundidade: marca migrated, nao cria wallet.
          if (!dryRun) await tx.setUserBankrollV2Migrated(u.userId, true);
          return { skip: true, reason: "wallets_exist_marked" };
        }

        const amount = parseDecimal(settings.bankrollAmount);
        if (!settings.bankrollAmount || amount <= 0) {
          return { skip: true, reason: "no_v1_bankroll" };
        }

        if (dryRun) {
          console.info("v2_migration_plan", {
            userId: u.userId,
            walletId: `(would create) wlt_${nanoid(6)}`,
            originalAmount: amount,
            wouldCreate: true,
          });
          return { skip: false, dry: true };
        }

        const wallet = await tx.createWallet({
          userId: u.userId,
          name: "Banca Padrao USD",
          platform: "GenericUSD",
          nativeCurrency: "USD",
          balance: String(amount),
          status: "active",
          isShotPocket: false,
        });
        const snapshotsBackfilled = await tx.backfillSnapshotsWalletId(u.userId, wallet.id);
        await tx.setUserBankrollV2Migrated(u.userId, true);

        console.info("v2_migration_applied", {
          userId: u.userId,
          walletId: wallet.id,
          snapshotsBackfilled,
          originalAmount: amount,
        });
        return { skip: false, walletId: wallet.id };
      });

      if (r.skip) result.skipped += 1;
      else result.migrated += 1;
    } catch (err) {
      result.errors += 1;
      console.error("v2_migration_error", { userId: u.userId, error: String(err) });
    }
  }

  console.info("v2_migration_complete", result);
  return result;
}

if (require.main === module) {
  runV2Migration().then((r) => {
    process.exit(r.errors > 0 ? 1 : 0);
  }).catch((err) => {
    console.error("v2_migration_fatal", err);
    process.exit(2);
  });
}
