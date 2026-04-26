/**
 * QW-1 Migration: Inverter convencao de exchangeRates de "USD por unidade" (legacy)
 * para "unidades por 1 USD" (ADR-033).
 *
 * Spec: Docs/specs/bankroll-v2-qw1-fix-exchange-rates.md (RF-04)
 *
 * Heuristica conservadora — so inverte fiat majors com rate < 1.0 (suspeita legacy).
 * Cripto (BTC/ETH) com rate < 1 e CORRETO na nova convencao — nao tocar.
 *
 * Uso:
 *   tsx server/scripts/migrate-qw1-fx-convention.ts                 # apply
 *   BANKROLL_QW1_DRY_RUN=true tsx server/scripts/migrate-qw1-fx-convention.ts
 *
 * Rollback: ler logs estruturados (oldRate snapshots) e re-aplicar manualmente.
 */

import { storage } from "../storage";

// Fiat majors sujeitos a inversao quando rate < 1.0.
const FIAT_MAJORS = new Set([
  "BRL",
  "EUR",
  "GBP",
  "CNY",
  "JPY",
  "ARS",
  "MXN",
  "CAD",
  "AUD",
  "CHF",
]);
const CRYPTO_OK_BELOW_1 = new Set(["BTC", "ETH"]);
const STABLE_AT_1 = new Set(["USDT", "USD"]);

interface MigrationResult {
  applied: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
}

/**
 * Decide para cada moeda se inverte ou nao, segundo heuristica RF-04.
 * Retorna o objeto de novos rates (somente moedas alteradas) ou null se nao
 * ha mudanca a fazer.
 */
function planRateInversion(
  rates: Record<string, number>,
): { newRates: Record<string, number>; changed: Array<{ ccy: string; oldRate: number; newRate: number }> } | null {
  const newRates: Record<string, number> = { ...rates };
  const changed: Array<{ ccy: string; oldRate: number; newRate: number }> = [];

  for (const [ccy, rate] of Object.entries(rates)) {
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    if (STABLE_AT_1.has(ccy)) continue; // USD/USDT a 1.0 e correto em ambas convencoes
    if (CRYPTO_OK_BELOW_1.has(ccy)) continue; // BTC=0.000015 e CORRETO na nova
    if (FIAT_MAJORS.has(ccy)) {
      if (rate < 1.0) {
        const newRate = Number((1 / rate).toFixed(4));
        newRates[ccy] = newRate;
        changed.push({ ccy, oldRate: rate, newRate });
      }
      // rate >= 1.0 -> assumir ja na nova convencao, nao tocar (idempotente)
    }
    // Outras chaves (XYZ, custom): log + nao tocar (RF-04 regra 5).
  }

  if (changed.length === 0) return null;
  return { newRates, changed };
}

export async function runMigration(opts: { dryRun?: boolean } = {}): Promise<MigrationResult> {
  const dryRun =
    opts.dryRun ?? process.env.BANKROLL_QW1_DRY_RUN === "true";

  const users = await storage.getAllUsersWithSettings();
  const result: MigrationResult = { applied: 0, skipped: 0, errors: 0, dryRun };

  for (const u of users) {
    try {
      const rates = u.exchangeRates;
      if (!rates || typeof rates !== "object") {
        result.skipped += 1;
        continue;
      }
      const keys = Object.keys(rates);
      if (keys.length === 0) {
        result.skipped += 1;
        continue;
      }
      // Log defensivo para chaves desconhecidas (RF-04 regra 5).
      for (const key of keys) {
        if (
          !STABLE_AT_1.has(key) &&
          !CRYPTO_OK_BELOW_1.has(key) &&
          !FIAT_MAJORS.has(key)
        ) {
          console.info("qw1_unknown_currency_skipped", {
            userId: u.userId,
            currency: key,
            rate: (rates as any)[key],
          });
        }
      }

      const plan = planRateInversion(rates as Record<string, number>);
      if (!plan) {
        result.skipped += 1;
        continue;
      }

      // Snapshot pre-update (rollback prep).
      console.info("qw1_pre_migration_snapshot", {
        userId: u.userId,
        before: rates,
        plannedChanges: plan.changed,
      });

      if (dryRun) {
        console.info("qw1_dry_run_plan", {
          userId: u.userId,
          before: rates,
          after: plan.newRates,
          changes: plan.changed,
        });
        result.applied += 1; // contador de "would apply" em dry-run
        continue;
      }

      await storage.updateUserSettingsExchangeRates(u.userId, plan.newRates);
      for (const c of plan.changed) {
        console.info("qw1_migration_applied", {
          userId: u.userId,
          currency: c.ccy,
          oldRate: c.oldRate,
          newRate: c.newRate,
        });
      }
      result.applied += 1;
    } catch (err) {
      result.errors += 1;
      console.error("qw1_migration_error", { userId: u.userId, error: String(err) });
    }
  }

  console.info("qw1_migration_complete", result);
  return result;
}

// CLI entry-point quando executado diretamente.
if (require.main === module) {
  runMigration().then((r) => {
    process.exit(r.errors > 0 ? 1 : 0);
  }).catch((err) => {
    console.error("qw1_migration_fatal", err);
    process.exit(2);
  });
}
