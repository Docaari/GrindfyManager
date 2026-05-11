/**
 * Sprint Spot-Anki-Reentry-3 — RF-2.3 cron materializeDrillDifficultSpotsCron.
 *
 * Spec : Docs/specs/spot-anki-reentry-3.md §RF-2.3
 * ADRs : 137 (cap 5/dia), 138 (relax FK), 139 (initial state)
 * Pattern : reusa structure de Sprint News-3 / FX-1.
 *
 * Schedule:        '0 6 * * *'  (06:00 UTC, default)
 * Janela:          7 dias (study_sessions_v2 mode='drill_gto').
 * Cap:             5 cards source='drill_gto_difficult_spot' / user / dia.
 * Idempotency:     hash md5(session_id || context).
 * Per-user error:  try/catch isolado — falha em USER-A NAO trava USER-B.
 */

import cron from "node-cron";
import { createHash } from "crypto";
import { withAdvisoryLock } from "../lib/advisoryLock";
import { storage } from "../storage";
import { computeInitialState } from "../services/spotReentry/srsAlgorithm";

const CRON_EXPR = "0 6 * * *";
const PACING_MS = 200; // pacing entre spots para evitar burst
const DAILY_CAP = 5;

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function materializeForUser(
  userId: string,
  now: Date,
): Promise<{ created: number; skipped: number; errors: number }> {
  let created = 0;
  let skipped = 0;
  let errors = 0;

  const todayStart = startOfUtcDay(now);
  const createdToday = await (storage as any).countDrillCardsCreatedToday(
    userId,
    todayStart,
  );
  let remainingCap = DAILY_CAP - Number(createdToday ?? 0);
  if (remainingCap <= 0) {
    return { created, skipped, errors };
  }

  const sessions = await (storage as any).getRecentDrillSessions(userId, now);
  if (!Array.isArray(sessions)) return { created, skipped, errors };

  for (const session of sessions) {
    const items = Array.isArray(session.difficultSpots)
      ? session.difficultSpots
      : [];
    for (const item of items) {
      if (remainingCap <= 0) {
        return { created, skipped, errors };
      }
      try {
        const ctx = String(item?.context ?? "");
        const note = String(item?.note ?? "");
        const hash = md5(`${session.id}|${ctx}`);

        const existing = await (storage as any).findStarredHandByDrillHash(
          userId,
          hash,
        );

        let spotRow: { id: string } | null = existing ?? null;
        if (spotRow) {
          // Already a starred_hand for this hash: skip if it has active card.
          const active = await (storage as any).getActiveReentryCardForSpot(
            userId,
            spotRow.id,
          );
          if (active) {
            skipped += 1;
            continue;
          }
        } else {
          const newSpot = await (storage as any).createDrillStarredHand({
            userId,
            hash,
            context: ctx,
            note,
          });
          spotRow = newSpot ?? null;
        }
        if (!spotRow) {
          skipped += 1;
          continue;
        }

        const initial = computeInitialState({
          source: "drill_gto_difficult_spot",
        });
        const card = await (storage as any).createSpotReentryCard({
          userId,
          spotId: spotRow.id,
          source: "drill_gto_difficult_spot",
          intervalDays: initial.intervalDays,
          easeFactor: initial.easeFactor,
          nextReviewAt: initial.nextReviewAt,
        });
        if (card) {
          created += 1;
          remainingCap -= 1;
        } else {
          skipped += 1;
        }
      } catch (innerErr: any) {
        errors += 1;
        console.error(
          "[cron/drill_materialize] item error",
          JSON.stringify({
            userId,
            sessionId: session.id,
            err: innerErr?.message ?? String(innerErr),
          }),
        );
      }
      // Pacing entre spots para evitar burst de inserts.
      if (PACING_MS > 0) await sleep(PACING_MS);
    }
  }

  return { created, skipped, errors };
}

/**
 * Manual run handle (also called by the cron scheduler).
 */
export async function runMaterializeDrillDifficultSpots(): Promise<{
  totalCreated: number;
  totalSkipped: number;
  totalErrors: number;
}> {
  const now = new Date();
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  let users: Array<{ userPlatformId: string }> = [];
  try {
    users = await (storage as any).listAllUsers();
  } catch (err: any) {
    console.error(
      "[cron/drill_materialize] listAllUsers failed",
      JSON.stringify({ err: err?.message ?? String(err) }),
    );
    return { totalCreated, totalSkipped, totalErrors: 1 };
  }

  for (const u of users ?? []) {
    const userId = u.userPlatformId;
    try {
      const r = await materializeForUser(userId, now);
      totalCreated += r.created;
      totalSkipped += r.skipped;
      totalErrors += r.errors;
    } catch (err: any) {
      totalErrors += 1;
      console.error(
        "[cron/drill_materialize] user error",
        JSON.stringify({ userId, err: err?.message ?? String(err) }),
      );
    }
  }

  console.info(
    "[cron/drill_materialize] cron_drill_materialize_done",
    JSON.stringify({
      count_created: totalCreated,
      count_skipped: totalSkipped,
      errors: totalErrors,
      timestamp: now.toISOString(),
    }),
  );

  return { totalCreated, totalSkipped, totalErrors };
}

/**
 * Registers the cron at 06:00 UTC.
 */
export async function registerMaterializeDrillDifficultSpotsCron(): Promise<void> {
  cron.schedule(
    CRON_EXPR,
    () => {
      // Wave D (ADR-144): advisory lock — cap diario de 5 spots/user eh racy
      // cross-replica sem guard (cada replica le contagem antes do insert).
      withAdvisoryLock(
        "cron:drill-materialize",
        runMaterializeDrillDifficultSpots,
      ).catch((err) => {
        console.error(
          "[cron/drill_materialize] top-level fail",
          err?.message ?? err,
        );
      });
    },
    { timezone: "UTC" },
  );
  console.info("[cron/drill_materialize] registered", { expr: CRON_EXPR });
}
