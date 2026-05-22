// Sprint Mini Player 2 (ADR-190) — Drizzle storage for spotify_tokens.
// Lesson #36: schema importado lazy com fallback placeholder se schema falhar
// ao carregar em contextos de teste com mocks parciais.

import { eq, sql } from "drizzle-orm";
import { db } from "../db";

export interface SpotifyTokenRow {
  userId: string;
  refreshTokenEncrypted: string;
  refreshTokenIv: string;
  refreshTokenAuthTag: string;
  accessTokenHash: string | null;
  expiresAt: Date | null;
  scopes: string[];
  displayName: string | null;
  displayNameHash: string | null;
  spotifyUserId: string | null;
  connectedAt: Date;
  disconnectedAt: Date | null;
  lastRefreshAt: Date | null;
  refreshFailureCount: number;
}

export interface UpsertSpotifyTokenInput {
  userId: string;
  refreshTokenEncrypted: string;
  refreshTokenIv: string;
  refreshTokenAuthTag: string;
  accessTokenHash?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  displayName?: string | null;
  displayNameHash?: string | null;
  spotifyUserId?: string | null;
}

async function loadTable(): Promise<any> {
  try {
    const mod: any = await import("@shared/schema");
    if (mod?.spotifyTokens) return mod.spotifyTokens;
  } catch (err) {
    // HIGH-8: em prod, o placeholder mascara um problema real de schema.
    // Em test (NODE_ENV='test') aceitamos pra permitir mocks parciais
    // de drizzle-orm que nao incluem `relations`.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "spotifyTokensStorage: @shared/schema.spotifyTokens nao carregou — schema incompleto?",
      );
    }
    // eslint-disable-next-line no-console
    console.warn("spotifyTokensStorage.loadTable.fallback", { err });
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "spotifyTokensStorage: @shared/schema.spotifyTokens ausente em prod",
    );
  }
  // Placeholder column refs — drizzle-orm mocks ignoram args em from/where.
  return {
    userId: { name: "user_id" },
    refreshTokenEncrypted: { name: "refresh_token_encrypted" },
    refreshTokenIv: { name: "refresh_token_iv" },
    refreshTokenAuthTag: { name: "refresh_token_auth_tag" },
    accessTokenHash: { name: "access_token_hash" },
    expiresAt: { name: "expires_at" },
    scopes: { name: "scopes" },
    displayName: { name: "display_name" },
    displayNameHash: { name: "display_name_hash" },
    spotifyUserId: { name: "spotify_user_id" },
    connectedAt: { name: "connected_at" },
    disconnectedAt: { name: "disconnected_at" },
    lastRefreshAt: { name: "last_refresh_at" },
    refreshFailureCount: { name: "refresh_failure_count" },
    updatedAt: { name: "updated_at" },
  };
}

export async function getSpotifyToken(
  userId: string,
): Promise<SpotifyTokenRow | null> {
  const table = await loadTable();
  try {
    const result: any = await (db as any)
      .select()
      .from(table)
      .where(eq(table.userId, userId));
    const rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) return null;
    return rows[0] as SpotifyTokenRow;
  } catch (err) {
    console.error("spotify_tokens.get.error", { userId, err });
    return null;
  }
}

export async function upsertSpotifyToken(
  input: UpsertSpotifyTokenInput,
): Promise<void> {
  const table = await loadTable();
  const now = new Date();
  const values: any = {
    userId: input.userId,
    refreshTokenEncrypted: input.refreshTokenEncrypted,
    refreshTokenIv: input.refreshTokenIv,
    refreshTokenAuthTag: input.refreshTokenAuthTag,
    accessTokenHash: input.accessTokenHash ?? null,
    expiresAt: input.expiresAt ?? null,
    scopes: input.scopes ?? [],
    displayName: input.displayName ?? null,
    displayNameHash: input.displayNameHash ?? null,
    spotifyUserId: input.spotifyUserId ?? null,
    connectedAt: now,
    disconnectedAt: null,
    refreshFailureCount: 0,
    updatedAt: now,
  };
  await (db as any)
    .insert(table)
    .values(values)
    .onConflictDoUpdate({
      target: table.userId,
      set: {
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        refreshTokenIv: input.refreshTokenIv,
        refreshTokenAuthTag: input.refreshTokenAuthTag,
        accessTokenHash: input.accessTokenHash ?? null,
        expiresAt: input.expiresAt ?? null,
        scopes: input.scopes ?? [],
        displayName: input.displayName ?? null,
        displayNameHash: input.displayNameHash ?? null,
        spotifyUserId: input.spotifyUserId ?? null,
        disconnectedAt: null,
        refreshFailureCount: 0,
        updatedAt: now,
      },
    });
}

export async function markSpotifyDisconnected(
  userId: string,
  _reason: string,
): Promise<void> {
  const table = await loadTable();
  await (db as any)
    .update(table)
    .set({ disconnectedAt: new Date(), updatedAt: new Date() })
    .where(eq(table.userId, userId));
}

/**
 * HIGH-2: race-condition fix — retorna o novo count via RETURNING para o
 * handler decidir "atingiu 3 → disconnect" sem ler row.refreshFailureCount
 * separadamente (que pode estar stale entre 2 requisicoes concorrentes).
 */
export async function incrementRefreshFailureCount(
  userId: string,
): Promise<number> {
  const table = await loadTable();
  try {
    const result: any = await (db as any)
      .update(table)
      .set({
        refreshFailureCount: sql`${table.refreshFailureCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(table.userId, userId))
      .returning({
        refreshFailureCount: table.refreshFailureCount,
      });
    const rows = Array.isArray(result) ? result : [];
    const next = rows[0]?.refreshFailureCount;
    return typeof next === "number" ? next : NaN;
  } catch (err) {
    console.error("spotify_tokens.increment_failure.error", { userId, err });
    return NaN;
  }
}

export async function resetRefreshFailureCount(
  userId: string,
): Promise<void> {
  const table = await loadTable();
  await (db as any)
    .update(table)
    .set({ refreshFailureCount: 0, updatedAt: new Date() })
    .where(eq(table.userId, userId));
}

export async function updateRefreshSuccess(
  userId: string,
  input: { expiresAt: Date; accessTokenHash?: string | null },
): Promise<void> {
  const table = await loadTable();
  await (db as any)
    .update(table)
    .set({
      expiresAt: input.expiresAt,
      accessTokenHash: input.accessTokenHash ?? null,
      lastRefreshAt: new Date(),
      refreshFailureCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(table.userId, userId));
}
