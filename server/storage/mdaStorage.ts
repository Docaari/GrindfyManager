// server/storage/mdaStorage.ts — Sprint MDA-1 (ADR-230 / D-1/D-3/D-4)
//
// CRUD do MDA (card de referencia) + junction N:N idempotente + CRUD de imagens
// jsonb. Attach-pattern: importado por server/storage.ts (no fim) que chama
// attachMdaStorage(storage). Exposto via (storage as any).x.
//
// Robustez:
//   - createMdaRead usa db.transaction quando disponivel; fallback gentil quando
//     indisponivel (lesson #32 — detection typeof db.transaction === 'function').
//   - diff de tags idempotente: append UNIQUE-aware (ON CONFLICT DO NOTHING),
//     remove via DELETE na junction (espelha appendStatToThemes/removeStatFromThemes,
//     lesson #33).
//   - normaliza images gerando id via nanoid quando faltar.

import { db } from "../db";
import { nanoid } from "nanoid";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { mdaReads, mdaReadThemes } from "@shared/schema";

const MAX_IMAGES = 8;
const MAX_THEMES = 20;

interface MdaImageInput {
  id?: string;
  key: string;
  caption?: string;
}

interface CreateMdaReadInput {
  userId: string;
  title: string;
  spotContext?: string | null;
  filters?: string | null;
  tendencyText?: string | null;
  statId?: string | null;
  images?: MdaImageInput[] | null;
  themeIds: string[];
}

function normalizeImages(images?: MdaImageInput[] | null): { id: string; key: string; caption: string }[] {
  if (!Array.isArray(images)) return [];
  return images.map((img) => ({
    id: img.id ?? nanoid(),
    key: img.key,
    caption: img.caption ?? "",
  }));
}

function rowExecToList(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.rows)) return result.rows;
  return [];
}

async function insertTags(
  exec: any,
  mdaReadId: string,
  userId: string,
  themeIds: string[],
): Promise<void> {
  for (const themeId of themeIds) {
    // Idempotente: UNIQUE (mda_read_id, theme_id) absorve duplicata.
    await exec.execute(
      sql`
        INSERT INTO mda_read_themes (mda_read_id, theme_id, user_id, created_at)
        VALUES (${mdaReadId}, ${themeId}, ${userId}, NOW())
        ON CONFLICT (mda_read_id, theme_id) DO NOTHING
      ` as any,
    );
  }
}

export async function createMdaRead(input: CreateMdaReadInput): Promise<any> {
  const themeIds = Array.isArray(input.themeIds) ? input.themeIds : [];
  // Defense in depth (lesson #7/#8) — schema ja valida na rota.
  if (themeIds.length < 1) {
    throw new Error("MDA_THEMES_REQUIRED: themeIds min 1");
  }
  if (themeIds.length > MAX_THEMES) {
    throw new Error("MDA_THEMES_TOO_MANY: max 20");
  }
  const images = normalizeImages(input.images);
  if (images.length > MAX_IMAGES) {
    throw new Error("MDA_IMAGES_TOO_MANY: max 8");
  }

  const id = nanoid();
  const readValues = {
    id,
    userId: input.userId,
    title: input.title,
    spotContext: input.spotContext ?? null,
    filters: input.filters ?? null,
    tendencyText: input.tendencyText ?? null,
    statId: input.statId ?? null,
    images: images.length > 0 ? images : null,
  };

  const runner = async (exec: any) => {
    const inserted = await exec.insert(mdaReads).values(readValues).returning();
    const read = Array.isArray(inserted) ? inserted[0] : inserted;
    await insertTags(exec, id, input.userId, themeIds);
    return { ...(read ?? readValues), themeIds };
  };

  // lesson #32: fallback gentil quando db.transaction indisponivel.
  if (db && typeof (db as any).transaction === "function") {
    return await (db as any).transaction(async (tx: any) => runner(tx));
  }
  return await runner(db);
}

// Busca o row do read via query-builder (resolve `rows` no mock; row real no prod).
async function fetchReadRow(id: string, userId: string): Promise<any | null> {
  const rows: any[] = await db
    .select()
    .from(mdaReads)
    .where(and(eq(mdaReads.id, id), eq(mdaReads.userId, userId), isNull(mdaReads.deletedAt)))
    .limit(1);
  return (Array.isArray(rows) ? rows[0] : rows) ?? null;
}

export async function getMdaReadById(id: string, userId: string): Promise<any | null> {
  const read = await fetchReadRow(id, userId);
  if (!read) return null;
  const tagResult: any = await db.execute(
    sql`SELECT theme_id AS "themeId" FROM mda_read_themes WHERE mda_read_id = ${id} AND user_id = ${userId}` as any,
  );
  const themeIds = rowExecToList(tagResult).map((r: any) => r.themeId ?? r.theme_id);
  return normalizeReadRow(read, themeIds);
}

export async function getMdaReadsByTheme(userId: string, themeId: string): Promise<any[]> {
  const rows: any[] = await db
    .select()
    .from(mdaReads)
    .innerJoin(mdaReadThemes, eq(mdaReadThemes.mdaReadId, mdaReads.id))
    .where(
      and(
        eq(mdaReadThemes.userId, userId),
        eq(mdaReadThemes.themeId, themeId),
        isNull(mdaReads.deletedAt),
      ),
    )
    .orderBy(desc(mdaReads.createdAt));
  const list = Array.isArray(rows) ? rows : [];
  // O innerJoin real retorna { mda_reads: {...}, mda_read_themes: {...} }; o mock
  // retorna o row flat. Tolera ambos.
  return list.map((r: any) => normalizeReadRow(r.mda_reads ?? r.mdaReads ?? r));
}

// Normaliza shape do row (camel/snake) preservando keys CRUS das imagens.
function normalizeReadRow(r: any, themeIds?: string[]): any {
  const out: any = {
    id: r.id,
    userId: r.userId ?? r.user_id,
    title: r.title,
    spotContext: r.spotContext ?? r.spot_context ?? null,
    filters: r.filters ?? null,
    tendencyText: r.tendencyText ?? r.tendency_text ?? null,
    statId: r.statId ?? r.stat_id ?? null,
    images: Array.isArray(r.images) ? r.images : [],
    createdAt: r.createdAt ?? r.created_at,
    updatedAt: r.updatedAt ?? r.updated_at,
    deletedAt: r.deletedAt ?? r.deleted_at ?? null,
  };
  if (themeIds) out.themeIds = themeIds;
  return out;
}

interface PatchMdaReadInput {
  title?: string;
  spotContext?: string | null;
  filters?: string | null;
  tendencyText?: string | null;
  statId?: string | null;
  images?: MdaImageInput[] | null;
  themeIds?: string[];
}

export async function updateMdaRead(
  id: string,
  userId: string,
  patch: PatchMdaReadInput,
): Promise<any | null> {
  // MEDIUM-3: read inexistente -> null ANTES de qualquer escrita de tag (evita
  // linhas orfas na junction em PATCH 404).
  const existing = await fetchReadRow(id, userId);
  if (!existing) return null;

  // Merge de campos (so os presentes no patch, exceto themeIds que é tag diff).
  const setClauses: any[] = [];
  if (patch.title !== undefined) setClauses.push(sql`title = ${patch.title}`);
  if (patch.spotContext !== undefined) setClauses.push(sql`spot_context = ${patch.spotContext ?? null}`);
  if (patch.filters !== undefined) setClauses.push(sql`filters = ${patch.filters ?? null}`);
  if (patch.tendencyText !== undefined) setClauses.push(sql`tendency_text = ${patch.tendencyText ?? null}`);
  if (patch.statId !== undefined) setClauses.push(sql`stat_id = ${patch.statId ?? null}`);
  if (patch.images !== undefined) {
    const imgs = normalizeImages(patch.images);
    // LOW-1: defense-in-depth cap 8 (espelha createMdaRead).
    if (imgs.length > MAX_IMAGES) {
      throw new Error("MDA_IMAGES_TOO_MANY: max 8");
    }
    setClauses.push(sql`images = ${JSON.stringify(imgs)}::jsonb`);
  }
  setClauses.push(sql`updated_at = NOW()`);

  // MEDIUM-2: envolve UPDATE de campos + DELETE/INSERT de tags em transacao
  // (fallback gentil quando db.transaction indisponivel — lesson #32).
  const runner = async (exec: any) => {
    await exec.execute(
      sql`
        UPDATE mda_reads
        SET ${sql.join(setClauses, sql`, `)}
        WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
      ` as any,
    );

    // Diff de tags idempotente (D-3): themeIds substitui o conjunto.
    if (Array.isArray(patch.themeIds)) {
      const desired = patch.themeIds;
      const currentResult: any = await exec.execute(
        sql`SELECT theme_id AS "themeId" FROM mda_read_themes WHERE mda_read_id = ${id} AND user_id = ${userId}` as any,
      );
      const current = rowExecToList(currentResult).map((r: any) => r.themeId ?? r.theme_id);
      const toRemove = current.filter((t: string) => !desired.includes(t));
      const toAdd = desired.filter((t: string) => !current.includes(t));
      // Remove tags ausentes.
      if (toRemove.length > 0) {
        await exec.execute(
          sql`
            DELETE FROM mda_read_themes
            WHERE mda_read_id = ${id} AND user_id = ${userId}
              AND theme_id IN (${sql.join(toRemove.map((t: string) => sql`${t}`), sql`, `)})
          ` as any,
        );
      }
      // Append novas (idempotente — UNIQUE absorve).
      await insertTags(exec, id, userId, toAdd);
    }
  };

  if (db && typeof (db as any).transaction === "function") {
    await (db as any).transaction(async (tx: any) => runner(tx));
  } else {
    await runner(db);
  }

  return await getMdaReadById(id, userId);
}

export async function addMdaReadImage(
  id: string,
  userId: string,
  image: { id: string; key: string; caption?: string },
): Promise<any | null> {
  const read = await getMdaReadById(id, userId);
  if (!read) return null;
  const newImg = { id: image.id, key: image.key, caption: image.caption ?? "" };
  const next = [...(read.images ?? []), newImg];
  await db.execute(
    sql`
      UPDATE mda_reads
      SET images = ${JSON.stringify(next)}::jsonb, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    ` as any,
  );
  return newImg;
}

export async function removeMdaReadImage(
  id: string,
  userId: string,
  imageId: string,
): Promise<{ oldKey: string | null } | null> {
  const read = await getMdaReadById(id, userId);
  if (!read) return null;
  const images = read.images ?? [];
  const target = images.find((img: any) => img.id === imageId);
  if (!target) return { oldKey: null };
  const next = images.filter((img: any) => img.id !== imageId);
  await db.execute(
    sql`
      UPDATE mda_reads
      SET images = ${JSON.stringify(next)}::jsonb, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    ` as any,
  );
  return { oldKey: target.key ?? null };
}

export async function getMdaReadImageKey(
  id: string,
  userId: string,
  imageId: string,
): Promise<string | null> {
  const read = await getMdaReadById(id, userId);
  if (!read) return null;
  const target = (read.images ?? []).find((img: any) => img.id === imageId);
  return target?.key ?? null;
}

export async function softDeleteMdaRead(
  id: string,
  userId: string,
): Promise<{ keys: string[] } | null> {
  const read = await getMdaReadById(id, userId);
  if (!read) return null;
  const keys = (read.images ?? []).map((img: any) => img.key).filter(Boolean);
  await db.execute(
    sql`
      UPDATE mda_reads
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    ` as any,
  );
  return { keys };
}

export function attachMdaStorage(storage: any): void {
  if (typeof storage.createMdaRead !== "function") storage.createMdaRead = createMdaRead;
  if (typeof storage.getMdaReadById !== "function") storage.getMdaReadById = getMdaReadById;
  if (typeof storage.getMdaReadsByTheme !== "function") storage.getMdaReadsByTheme = getMdaReadsByTheme;
  if (typeof storage.updateMdaRead !== "function") storage.updateMdaRead = updateMdaRead;
  if (typeof storage.addMdaReadImage !== "function") storage.addMdaReadImage = addMdaReadImage;
  if (typeof storage.removeMdaReadImage !== "function") storage.removeMdaReadImage = removeMdaReadImage;
  if (typeof storage.getMdaReadImageKey !== "function") storage.getMdaReadImageKey = getMdaReadImageKey;
  if (typeof storage.softDeleteMdaRead !== "function") storage.softDeleteMdaRead = softDeleteMdaRead;
}
