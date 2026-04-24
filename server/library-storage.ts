/**
 * Library Storage — in-memory CRUD operations for tournament library
 *
 * Used for unit testing. The real database implementation would use Drizzle ORM.
 * These functions are re-exported from server/storage.ts.
 */

import { nanoid } from 'nanoid';
import type { TournamentLibrary, InsertTournamentLibrary } from '@shared/schema';

// In-memory store
let store: TournamentLibrary[] = [];

/**
 * Reset the in-memory store. Used by test setup.
 */
export function _resetLibraryStore(): void {
  store = [];
}

export async function createLibraryTournament(
  data: InsertTournamentLibrary
): Promise<TournamentLibrary> {
  const now = new Date();
  const tournament: TournamentLibrary = {
    id: nanoid(),
    userId: data.userId,
    name: data.name,
    site: data.site,
    buyIn: data.buyIn,
    guaranteed: data.guaranteed ?? null,
    time: data.time ?? null,
    type: data.type ?? null,
    speed: data.speed ?? null,
    fieldSize: data.fieldSize ?? null,
    source: data.source ?? 'manual',
    externalId: data.externalId ?? null,
    deletedAt: data.deletedAt ?? null,
    // Tournament Selector fields (RF-04/RF-05)
    dayOfWeek: (data as any).dayOfWeek ?? null,
    currency: (data as any).currency ?? 'USD',
    allowsAddOn: (data as any).allowsAddOn ?? false,
    addOnCost: (data as any).addOnCost ?? null,
    allowsReentry: (data as any).allowsReentry ?? false,
    maxReentries: (data as any).maxReentries ?? null,
    createdAt: now,
    updatedAt: now,
  };

  store.push(tournament);
  return tournament;
}

export async function getLibraryTournaments(
  userId: string
): Promise<TournamentLibrary[]> {
  return store.filter((t) => t.userId === userId && t.deletedAt === null);
}

export async function getLibraryTournament(
  id: string
): Promise<TournamentLibrary | undefined> {
  return store.find((t) => t.id === id);
}

export async function updateLibraryTournament(
  id: string,
  data: Partial<InsertTournamentLibrary & { deletedAt?: Date | null }>
): Promise<TournamentLibrary | undefined> {
  const index = store.findIndex((t) => t.id === id);
  if (index === -1) return undefined;

  const existing = store[index];
  const updated: TournamentLibrary = {
    ...existing,
    ...data,
    id: existing.id,
    updatedAt: new Date(),
  };

  store[index] = updated;
  return updated;
}

export async function trashLibraryTournament(
  id: string
): Promise<TournamentLibrary | undefined> {
  return updateLibraryTournament(id, { deletedAt: new Date() } as any);
}

export async function restoreLibraryTournament(
  id: string
): Promise<TournamentLibrary | undefined> {
  return updateLibraryTournament(id, { deletedAt: null } as any);
}

export async function deleteLibraryTournament(
  id: string
): Promise<void> {
  store = store.filter((t) => t.id !== id);
}

export async function getLibraryTrash(
  userId: string
): Promise<TournamentLibrary[]> {
  return store.filter((t) => t.userId === userId && t.deletedAt !== null);
}

export async function cleanupExpiredTrash(
  maxAgeDays: number
): Promise<number> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const toDelete = store.filter(
    (t) => t.deletedAt !== null && t.deletedAt.getTime() <= cutoff
  );
  const count = toDelete.length;

  store = store.filter(
    (t) => !(t.deletedAt !== null && t.deletedAt.getTime() <= cutoff)
  );

  return count;
}
