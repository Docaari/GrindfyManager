/**
 * Cron de purge de spot screenshots — Sprint F2 (RF-06).
 *
 * Spec: Docs/specs/sprint-f2-spot-screenshots.md (RF-06)
 * ADR : Docs/architecture/decisions/053-spot-screenshots-cron.md
 *
 * Funcao pura `purgeSpotScreenshots()` retorna `PurgeSummary` para telemetria.
 * Scheduler eh agendado por `registerSpotScreenshotsCron()` (lazy-loaded
 * `node-cron` para que ambientes de teste nao precisem da dep instalada).
 *
 * Idempotencia eh garantida pelos criterios SQL em `storage.listSpotsForPurge`:
 *   - kind='discarded' : todas rows com status='discarded'
 *   - kind='expired'   : status='pending' AND expiresAt < NOW()
 *                         AND reviewedAt IS NULL AND reviewLater=false
 *
 * Re-execucao eh segura: rows ja deletadas somem do criterio.
 */

import { storage } from "../storage";
import { spotStorage } from "../lib/spotStorage";

export interface PurgeSummary {
  purgedCount: number;
  errorCount: number;
  durationMs: number;
}

interface PurgeRow {
  id: string;
  imageUrl?: string | null;
}

/**
 * Funcao pura: percorre rows discarded + expired, apaga arquivo + row.
 *
 * Erro handling (lesson #9):
 *   - ENOENT em unlink: log warn, prossegue (arquivo ja sumiu eh OK).
 *   - Outros erros (DB, EACCES): log error + errorCount++.
 *   - Try/catch GRANULAR por row — 1 erro nao trava o loop inteiro.
 */
export async function purgeSpotScreenshots(): Promise<PurgeSummary> {
  const start = Date.now();
  let purgedCount = 0;
  let errorCount = 0;

  const [discardedResult, expiredResult] = await Promise.allSettled([
    storage.listSpotsForPurge({ kind: "discarded" }),
    storage.listSpotsForPurge({ kind: "expired" }),
  ]);

  let discarded: PurgeRow[] = [];
  let expired: PurgeRow[] = [];

  if (discardedResult.status === "fulfilled") {
    discarded = discardedResult.value ?? [];
  } else {
    console.error("spot.purge.list_discarded.error", {
      err: discardedResult.reason?.message ?? discardedResult.reason,
    });
  }
  if (expiredResult.status === "fulfilled") {
    expired = expiredResult.value ?? [];
  } else {
    console.error("spot.purge.list_expired.error", {
      err: expiredResult.reason?.message ?? expiredResult.reason,
    });
  }

  for (const row of [...discarded, ...expired]) {
    try {
      // Apaga arquivo do storage. ENOENT eh nao-fatal (arquivo ja sumiu).
      if (row.imageUrl) {
        try {
          await spotStorage.delete(row.imageUrl);
        } catch (err: any) {
          if (err?.code === "ENOENT") {
            console.warn("spot.purge.unlink_enoent", { id: row.id });
            // Prossegue — row ainda deve ser deletada.
          } else {
            // Outros erros de filesystem propagam para log+counter abaixo.
            throw err;
          }
        }
      }
      // Apaga row do banco.
      await storage.deleteStarredHand(row.id);
      purgedCount++;
    } catch (err: any) {
      errorCount++;
      console.error("spot.purge.error", { id: row.id, err: err?.message ?? err });
    }
  }

  const summary: PurgeSummary = {
    purgedCount,
    errorCount,
    durationMs: Date.now() - start,
  };

  // Sprint F2 W4 (RF-Telemetria): emit estruturado para dashboards (saude do cron).
  // Coexiste com `console.info("spot.purge.summary", ...)` em registerSpotScreenshotsCron.
  console.info("spot.expired_purged", summary);

  return summary;
}

/**
 * Agenda o cron diario de purge. Chama `purgeSpotScreenshots()` no horario
 * configurado via env `SPOT_PURGE_CRON` (default '0 4 * * *' = 04:00).
 *
 * Lazy-load do `node-cron` permite que ambientes sem a dep instalada (CI minimo,
 * testes unit) nao crashem. Em prod, dep eh esperada em package.json.
 */
export async function registerSpotScreenshotsCron(): Promise<void> {
  const schedule = process.env.SPOT_PURGE_CRON ?? "0 4 * * *";
  try {
    // dynamic import via variavel — evita TS resolver staticamente o modulo
    // quando node-cron nao esta instalado (ex: ambiente de teste minimo).
    const moduleName = "node-cron";
    const cronModule: any = await import(/* @vite-ignore */ moduleName);
    const cron = cronModule.default ?? cronModule;
    cron.schedule(schedule, async () => {
      try {
        const summary = await purgeSpotScreenshots();
        console.info("spot.purge.summary", summary);
      } catch (err: any) {
        console.error("spot.purge.cron.tick.error", { err: err?.message ?? err });
      }
    });
    console.info("spot.purge.cron.registered", { schedule });
  } catch (err: any) {
    // Ambiente sem node-cron (ex: vitest). Log warning, nao crash.
    console.warn("spot.purge.cron.register_skipped", {
      reason: err?.message ?? err,
      hint: "node-cron nao instalado — purge nao agendado neste processo",
    });
  }
}
