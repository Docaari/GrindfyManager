// server/storage/premiumLibraryStorage.ts — Biblioteca Premium curada (ADR-240)
//
// CRUD da vitrine GLOBAL de familias promovidas por curadores + painel cross-user.
// Attach-pattern: importado por server/storage.ts (no fim) que chama
// attachPremiumLibraryStorage(storage). Exposto via (storage as any).x.
//
// Contrato: Docs/architecture/diagrams/premium-library/storage-contract.md
//
// Robustez:
//   - injectedDb como ultimo arg (lesson #34) — testavel sem vi.mock('../db').
//   - promotePremiumHighlight retorna objeto DISCRIMINADO { ok, ... } — NAO lanca
//     no conflito UNIQUE (pg 23505); o handler decide o 409 (lesson #9: loga antes).
//   - listPremiumHighlights retorna [] em erro de DB (lesson #9).
//   - getSavedHighlightByIdAnyUser NAO escopa por owner (curador ve de todos) —
//     o guard requireGranularPermission e a unica barreira (anti-IDOR).

import { db as realDb } from "../db";
import { nanoid } from "nanoid";
import { and, desc, eq } from "drizzle-orm";
import {
  premiumLibraryHighlights,
  savedTournamentHighlights,
  users,
} from "@shared/schema";

function first<T>(rows: any): T | null {
  if (!rows) return null;
  if (Array.isArray(rows)) return (rows[0] as T) ?? null;
  if (Array.isArray(rows.rows)) return (rows.rows[0] as T) ?? null;
  return null;
}

function toList(rows: any): any[] {
  if (!rows) return [];
  if (Array.isArray(rows)) return rows;
  if (Array.isArray(rows.rows)) return rows.rows;
  return [];
}

interface PromoteInput {
  site: string;
  familyKey: string;
  groupName?: string | null;
  buyInTier?: string | null;
  type?: string | null;
  metrics?: any;
  reasons?: any;
  source?: "library" | "import";
  curatedBy: string;
  sourceUserId?: string | null;
  sourceHighlightId?: string | null;
}

export async function listPremiumHighlights(
  site?: string,
  injectedDb?: any,
): Promise<any[]> {
  const db = injectedDb ?? realDb;
  try {
    const condition = site ? eq(premiumLibraryHighlights.site, site) : undefined;
    const rows = await db
      .select()
      .from(premiumLibraryHighlights)
      .where(condition)
      .orderBy(desc(premiumLibraryHighlights.createdAt));
    return toList(rows);
  } catch (err) {
    console.error("[premiumLibraryStorage] listPremiumHighlights failed:", err);
    return [];
  }
}

export async function getPremiumHighlight(
  id: string,
  injectedDb?: any,
): Promise<any | null> {
  const db = injectedDb ?? realDb;
  const rows = await db
    .select()
    .from(premiumLibraryHighlights)
    .where(eq(premiumLibraryHighlights.id, id))
    .limit(1);
  return first(rows);
}

export async function promotePremiumHighlight(
  input: PromoteInput,
  injectedDb?: any,
): Promise<{ ok: true; row: any } | { ok: false; conflict: "already_in_premium" }> {
  const db = injectedDb ?? realDb;
  const values = {
    id: nanoid(),
    site: input.site,
    familyKey: input.familyKey,
    groupName: input.groupName ?? null,
    buyInTier: input.buyInTier ?? null,
    type: input.type ?? null,
    metrics: input.metrics ?? null,
    reasons: input.reasons ?? null,
    source: input.source ?? "library",
    curatedBy: input.curatedBy,
    sourceUserId: input.sourceUserId ?? null,
    sourceHighlightId: input.sourceHighlightId ?? null,
  };
  try {
    const inserted = await db
      .insert(premiumLibraryHighlights)
      .values(values)
      .returning();
    const row = first(inserted) ?? values;
    return { ok: true, row };
  } catch (err: any) {
    // Conflito UNIQUE(family_key) — corrida entre dois curadores. NAO lanca.
    if (err?.code === "23505") {
      return { ok: false, conflict: "already_in_premium" };
    }
    // Erro real de DB: loga antes de propagar (lesson #9).
    console.error("[premiumLibraryStorage] promotePremiumHighlight failed:", err);
    throw err;
  }
}

export async function removePremiumHighlight(
  id: string,
  injectedDb?: any,
): Promise<boolean> {
  const db = injectedDb ?? realDb;
  const deleted = await db
    .delete(premiumLibraryHighlights)
    .where(eq(premiumLibraryHighlights.id, id))
    .returning();
  return toList(deleted).length > 0;
}

interface ListAllParams {
  site?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export async function listAllUserHighlights(
  params: ListAllParams,
  injectedDb?: any,
): Promise<{ items: any[]; total: number }> {
  const db = injectedDb ?? realDb;
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  try {
    const filters: any[] = [];
    if (params.site) filters.push(eq(savedTournamentHighlights.site, params.site));
    if (params.userId) filters.push(eq(savedTournamentHighlights.userId, params.userId));
    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const joined = await db
      .select({
        id: savedTournamentHighlights.id,
        userId: savedTournamentHighlights.userId,
        username: users.username,
        email: users.email,
        site: savedTournamentHighlights.site,
        familyKey: savedTournamentHighlights.familyKey,
        groupName: savedTournamentHighlights.groupName,
        buyInTier: savedTournamentHighlights.buyInTier,
        type: savedTournamentHighlights.type,
        metrics: savedTournamentHighlights.metrics,
        reasons: savedTournamentHighlights.reasons,
        source: savedTournamentHighlights.source,
        createdAt: savedTournamentHighlights.createdAt,
      })
      .from(savedTournamentHighlights)
      .innerJoin(users, eq(users.userPlatformId, savedTournamentHighlights.userId))
      .where(whereClause)
      .orderBy(desc(savedTournamentHighlights.createdAt))
      .limit(limit)
      .offset(offset);

    const rows = toList(joined);

    // Set de familyKeys ja na premium para derivar alreadyInPremium.
    const premiumRows = await db
      .select({ familyKey: premiumLibraryHighlights.familyKey })
      .from(premiumLibraryHighlights);
    const premiumSet = new Set(
      toList(premiumRows).map((r: any) => r.familyKey ?? r.family_key),
    );

    const items = rows.map((r: any) => ({
      id: r.id,
      userId: r.userId ?? r.user_id,
      username: r.username ?? null,
      email: r.email,
      site: r.site,
      familyKey: r.familyKey ?? r.family_key,
      groupName: r.groupName ?? r.group_name ?? null,
      buyInTier: r.buyInTier ?? r.buy_in_tier ?? null,
      type: r.type ?? null,
      metrics: r.metrics ?? null,
      reasons: r.reasons ?? null,
      source: r.source ?? null,
      createdAt: r.createdAt ?? r.created_at ?? null,
      alreadyInPremium: premiumSet.has(r.familyKey ?? r.family_key),
    }));

    // TODO(premium-library MEDIUM, ADR-240/reviewer): `total` = tamanho da pagina,
    // NAO o count(*) absoluto dos filtros. Latente — o PremiumCuratorPanel carrega
    // so a 1a pagina (50) e nao consome `total`/nao pagina. Antes de adicionar
    // "proxima pagina", trocar por um SELECT count(*) separado com o mesmo
    // whereClause (sem limit/offset), senao a paginacao trava silenciosa em 50.
    return { items, total: items.length };
  } catch (err) {
    console.error("[premiumLibraryStorage] listAllUserHighlights failed:", err);
    return { items: [], total: 0 };
  }
}

export async function getSavedHighlightByIdAnyUser(
  sourceHighlightId: string,
  injectedDb?: any,
): Promise<any | null> {
  const db = injectedDb ?? realDb;
  // SEM escopo de owner (curador ve de qualquer conta) — guard e a unica barreira.
  const rows = await db
    .select()
    .from(savedTournamentHighlights)
    .where(eq(savedTournamentHighlights.id, sourceHighlightId))
    .limit(1);
  return first(rows);
}

export function attachPremiumLibraryStorage(storage: any): void {
  if (typeof storage.listPremiumHighlights !== "function") storage.listPremiumHighlights = listPremiumHighlights;
  if (typeof storage.getPremiumHighlight !== "function") storage.getPremiumHighlight = getPremiumHighlight;
  if (typeof storage.promotePremiumHighlight !== "function") storage.promotePremiumHighlight = promotePremiumHighlight;
  if (typeof storage.removePremiumHighlight !== "function") storage.removePremiumHighlight = removePremiumHighlight;
  if (typeof storage.listAllUserHighlights !== "function") storage.listAllUserHighlights = listAllUserHighlights;
  if (typeof storage.getSavedHighlightByIdAnyUser !== "function") storage.getSavedHighlightByIdAnyUser = getSavedHighlightByIdAnyUser;
}
