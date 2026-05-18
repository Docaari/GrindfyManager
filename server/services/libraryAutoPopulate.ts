// =============================================================================
// libraryAutoPopulate
//
// Garante que TODO torneio adicionado ao grade (planned_tournaments) tenha uma
// entrada correspondente em tournament_library. Disparado de dentro de
// storage.createPlannedTournament para cobrir todos os call sites — incluindo
// os que nao passam pelo handler de rota (Tournament Series Day 2, coach tool
// register_tournament_in_grade).
//
// Dedup por (userId, name, site, buyIn, time) contra ativos + trashed.
// Idempotente — pode rodar varias vezes pro mesmo planned.
// =============================================================================

import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { plannedTournaments, tournamentLibrary } from "@shared/schema";

export interface PlannedLike {
  id?: string | null;
  userId: string;
  name?: string | null;
  site?: string | null;
  buyIn?: string | number | null;
  guaranteed?: string | number | null;
  time?: string | null;
  type?: string | null;
  speed?: string | null;
  fieldSize?: number | null;
  dayOfWeek?: number | null;
  currency?: string | null;
  allowsAddOn?: boolean | null;
  addOnCost?: string | number | null;
  allowsReentry?: boolean | null;
  maxReentries?: number | null;
  lateRegMinutes?: number | null;
  registrationTime?: string | null;
  libraryTemplateId?: string | null;
}

/** Linha minima de tournament_library relevante para a decisao de dedup. */
export interface LibraryDedupRow {
  id: string;
  time: string | null;
  deletedAt: Date | null;
}

export type LibraryAction =
  | { action: "skip" }
  | { action: "link"; templateId: string }
  | { action: "create" };

/**
 * Decisao pura de dedup. `candidates` ja vem filtrado por
 * (userId, name, site, buyIn) — aqui so casamos o `time` e o estado deletedAt.
 *
 * - planned ja linkado (libraryTemplateId) → skip
 * - sem userId/name/site → skip (dado insuficiente)
 * - match ativo → link (planned aponta pro template existente)
 * - match trashed → skip (respeita exclusao deliberada do user)
 * - sem match → create
 */
export function decideLibraryAction(
  planned: PlannedLike,
  candidates: LibraryDedupRow[],
): LibraryAction {
  if (planned.libraryTemplateId) return { action: "skip" };
  if (!planned.userId || !planned.name || !planned.site) return { action: "skip" };

  const timeStr = planned.time ?? null;
  const matches = candidates.filter((row) => (row.time ?? null) === timeStr);
  // Match ativo tem prioridade — independe da ordem dos rows da query.
  const active = matches.find((m) => !m.deletedAt);
  if (active) return { action: "link", templateId: active.id };
  // So restou match trashed → respeita a exclusao deliberada do user.
  if (matches.length > 0) return { action: "skip" };
  return { action: "create" };
}

/**
 * Garante a entrada de biblioteca para um planned. Retorna o templateId
 * vinculado (existente ou recem-criado), ou null quando nada foi feito.
 */
export async function ensureLibraryEntryForPlanned(
  planned: PlannedLike,
): Promise<string | null> {
  if (planned.libraryTemplateId) return planned.libraryTemplateId;
  if (!planned.userId || !planned.name || !planned.site) return null;

  const buyInStr = String(planned.buyIn ?? "0");
  const timeStr = planned.time ?? null;

  const candidates = await db
    .select({
      id: tournamentLibrary.id,
      time: tournamentLibrary.time,
      deletedAt: tournamentLibrary.deletedAt,
    })
    .from(tournamentLibrary)
    .where(
      and(
        eq(tournamentLibrary.userId, planned.userId),
        eq(tournamentLibrary.name, planned.name),
        eq(tournamentLibrary.site, planned.site),
        eq(tournamentLibrary.buyIn, buyInStr),
      ),
    );

  const decision = decideLibraryAction(planned, candidates);
  if (decision.action === "skip") return null;

  if (decision.action === "link") {
    if (planned.id) {
      await db
        .update(plannedTournaments)
        .set({ libraryTemplateId: decision.templateId })
        .where(eq(plannedTournaments.id, planned.id));
    }
    return decision.templateId;
  }

  // action === "create"
  const templateId = nanoid();
  await db.insert(tournamentLibrary).values({
    id: templateId,
    userId: planned.userId,
    name: planned.name,
    site: planned.site,
    buyIn: buyInStr,
    guaranteed: planned.guaranteed != null ? String(planned.guaranteed) : null,
    time: timeStr,
    type: planned.type ?? null,
    speed: planned.speed ?? null,
    fieldSize: planned.fieldSize ?? null,
    source: "manual",
    dayOfWeek: typeof planned.dayOfWeek === "number" ? planned.dayOfWeek : null,
    currency: planned.currency ?? "USD",
    allowsAddOn: planned.allowsAddOn ?? false,
    addOnCost: planned.addOnCost != null ? String(planned.addOnCost) : null,
    allowsReentry: planned.allowsReentry ?? false,
    maxReentries: planned.maxReentries ?? null,
    lateRegMinutes: planned.lateRegMinutes ?? null,
    registrationTime: planned.registrationTime ?? null,
  });

  if (planned.id) {
    await db
      .update(plannedTournaments)
      .set({ libraryTemplateId: templateId })
      .where(eq(plannedTournaments.id, planned.id));
  }
  return templateId;
}

/**
 * Wrapper fire-and-forget. Nunca lanca — falha aqui NAO pode quebrar o create
 * do planned tournament que disparou. Use este nos call sites de runtime.
 */
export function ensureLibraryEntryForPlannedSafe(planned: PlannedLike): void {
  Promise.resolve()
    .then(() => ensureLibraryEntryForPlanned(planned))
    .catch((err) => {
      console.error(
        "libraryAutoPopulate: ensureLibraryEntryForPlanned failed for user",
        planned?.userId,
        err,
      );
    });
}
