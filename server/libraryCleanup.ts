/**
 * Library Cleanup Job
 * Permanently deletes tournament_library entries that have been in the trash for over 7 days.
 */

import { db } from "./db";
import { tournamentLibrary } from "@shared/schema";
import { isNotNull, lte, and } from "drizzle-orm";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const RETENTION_DAYS = 7;

async function runLibraryCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const deleted = await db
      .delete(tournamentLibrary)
      .where(
        and(
          isNotNull(tournamentLibrary.deletedAt),
          lte(tournamentLibrary.deletedAt, cutoff)
        )
      )
      .returning({ id: tournamentLibrary.id });

    if (deleted.length > 0) {
      console.log(`[LibraryCleanup] Permanently deleted ${deleted.length} trashed tournament(s)`);
    }
  } catch (error: any) {
    console.error("[LibraryCleanup] Error:", error.message);
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startLibraryCleanup(): void {
  if (intervalId) return;
  console.log("[LibraryCleanup] Job started (interval: 1 hour)");
  // Wave D (ADR-144): advisory lock — DELETE idempotente mas N replicas
  // hammering com escaneamento da mesma tabela eh waste.
  intervalId = setInterval(async () => {
    try {
      const { withAdvisoryLock } = await import("./lib/advisoryLock");
      await withAdvisoryLock("cron:library-cleanup", runLibraryCleanup);
    } catch (err: any) {
      console.error("[LibraryCleanup] tick error", err?.message ?? err);
    }
  }, CLEANUP_INTERVAL_MS);
}

export function stopLibraryCleanup(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
