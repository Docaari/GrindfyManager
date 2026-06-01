/**
 * /api/mda-reads — Sprint MDA-1 (ADR-230).
 *
 * Spec : Docs/specs/sprint-mda-1-2026-06-01.md (RF-03 / RF-04)
 * ADR  : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md
 *
 * MDA = card de referencia da tendencia da populacao (exploit do field),
 * tagueado a N temas (N:N), com prints privados. Reusa a infra de imagem do
 * EST-3 (ADR-057 / createSpotImageStorage) com root dedicado private-uploads/mda.
 *
 * Endpoints:
 *   POST   /api/mda-reads                       cria read + tags
 *   GET    /api/mda-reads/by-theme?themeId=      reads do tema (keys->URLs)
 *   GET    /api/mda-reads/:id/images/:imageId    serve print privado (ownership)
 *   POST   /api/mda-reads/:id/images             upload print (multer 5MB, magic)
 *   DELETE /api/mda-reads/:id/images/:imageId    remove print (best-effort delete)
 *   GET    /api/mda-reads/:id                    detalhe (campos + URLs + themeIds)
 *   PATCH  /api/mda-reads/:id                    edita + re-tagueia (diff)
 *   DELETE /api/mda-reads/:id                    soft delete + best-effort delete
 *
 * Handlers no padrao handleX(req, res, injectedStorage?) com lazy import em prod
 * (lesson #34). Validacao Zod ANTES de I/O. Sub-paths de imagem registrados
 * ANTES do :id generico (habito anti-colisao). Imagens PRIVADAS — cross-user
 * retorna 404 (nao 403), nao vaza existencia.
 */

import type { Express, Response, Request } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { requireAuth } from "../auth";
import { insertMdaReadSchema, patchMdaReadSchema } from "@shared/mda";
import { isValidStatId } from "../coach/statId";
import { detectMimeFromBuffer, extFromMime } from "../services/spotImageStorage/mime";
import { mdaImageStorage } from "../services/mdaImageStorage";

const MDA_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (D-2)
const MDA_MAX_IMAGES = 8;

async function getStore(injectedStorage?: any): Promise<any> {
  if (injectedStorage) return injectedStorage;
  const mod = await import("../storage");
  return (mod as any).storage;
}

// Mapeia o array `images` (keys CRUS) para URLs servíveis; key crua NAO vaza.
function imageUrl(readId: string, imageId: string): string {
  return `/api/mda-reads/${readId}/images/${imageId}`;
}

// Delete best-effort direto no storage de imagem (idempotente em ENOENT). Os
// testes asseguram que a operacao principal nunca falha por causa do cleanup.
async function bestEffortDelete(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await mdaImageStorage.delete(key);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      console.warn("[mda] bestEffortDelete failed", { key, err: err?.message });
    }
  }
}

function mapImagesToUrls(readId: string, images: any[] | undefined): any[] {
  if (!Array.isArray(images)) return [];
  return images.map((img: any) => ({
    id: img.id,
    url: imageUrl(readId, img.id),
    caption: img.caption ?? "",
  }));
}

// =============================================================================
// POST /api/mda-reads
// =============================================================================

export async function handleCreateMdaRead(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = await getStore(injectedStorage);
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const parsed = insertMdaReadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", issues: parsed.error.issues });
      return;
    }
    const body = parsed.data;

    // statId (quando presente) — catalog id OU custom_*.
    if (body.statId && !isValidStatId(body.statId)) {
      res.status(400).json({ error: "INVALID_STAT_ID", message: "statId invalido" });
      return;
    }

    // Ownership dos temas — todos devem pertencer ao user.
    const themes = await Promise.all(
      body.themeIds.map((id: string) => store.getStudyThemeById(id)),
    );
    for (const theme of themes) {
      if (!theme || theme.userId !== userId) {
        res.status(403).json({ error: "THEME_FORBIDDEN", message: "Tema nao pertence ao user" });
        return;
      }
    }

    const created = await store.createMdaRead({ userId, ...body });
    res.status(201).json(created);
  } catch (err) {
    console.error("[handleCreateMdaRead] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// GET /api/mda-reads/by-theme?themeId=
// =============================================================================

export async function handleListMdaReadsByTheme(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = await getStore(injectedStorage);
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const themeId = typeof req?.query?.themeId === "string" ? req.query.themeId : "";
    if (!themeId) {
      res.status(400).json({ error: "MISSING_THEME_ID", message: "themeId obrigatorio" });
      return;
    }
    // Ownership do tema — 404 (nao 403) p/ nao vazar existencia.
    const theme = await store.getStudyThemeById(themeId);
    if (!theme || theme.userId !== userId) {
      res.status(404).json({ message: "Tema nao encontrado" });
      return;
    }
    const reads = await store.getMdaReadsByTheme(userId, themeId);
    const mapped = (Array.isArray(reads) ? reads : []).map((r: any) => ({
      ...r,
      images: mapImagesToUrls(r.id, r.images),
    }));
    res.status(200).json(mapped);
  } catch (err) {
    console.error("[handleListMdaReadsByTheme] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// GET /api/mda-reads/:id
// =============================================================================

export async function handleGetMdaRead(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = await getStore(injectedStorage);
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const id = String(req?.params?.id ?? "");
    const read = await store.getMdaReadById(id, userId);
    if (!read) {
      res.status(404).json({ message: "MDA nao encontrado" });
      return;
    }
    res.status(200).json({
      ...read,
      images: mapImagesToUrls(read.id, read.images),
    });
  } catch (err) {
    console.error("[handleGetMdaRead] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// PATCH /api/mda-reads/:id
// =============================================================================

export async function handleUpdateMdaRead(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = await getStore(injectedStorage);
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const id = String(req?.params?.id ?? "");
    const parsed = patchMdaReadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", issues: parsed.error.issues });
      return;
    }
    const patch = parsed.data;

    if (patch.statId && !isValidStatId(patch.statId)) {
      res.status(400).json({ error: "INVALID_STAT_ID", message: "statId invalido" });
      return;
    }

    // Re-tagueio: ownership dos novos temas.
    if (Array.isArray(patch.themeIds)) {
      const themes = await Promise.all(
        patch.themeIds.map((tid: string) => store.getStudyThemeById(tid)),
      );
      for (const theme of themes) {
        if (!theme || theme.userId !== userId) {
          res.status(403).json({ error: "THEME_FORBIDDEN", message: "Tema nao pertence ao user" });
          return;
        }
      }
    }

    const updated = await store.updateMdaRead(id, userId, patch);
    if (!updated) {
      res.status(404).json({ message: "MDA nao encontrado" });
      return;
    }
    res.status(200).json(updated);
  } catch (err) {
    console.error("[handleUpdateMdaRead] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// DELETE /api/mda-reads/:id — soft delete + best-effort cleanup de prints
// =============================================================================

export async function handleDeleteMdaRead(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = await getStore(injectedStorage);
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const id = String(req?.params?.id ?? "");
    const result = await store.softDeleteMdaRead(id, userId);
    if (!result) {
      res.status(404).json({ message: "MDA nao encontrado" });
      return;
    }
    // Cleanup best-effort dos prints — falha de delete nao derruba a operacao.
    const keys: string[] = Array.isArray(result.keys) ? result.keys : [];
    for (const key of keys) {
      await bestEffortDelete(key);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[handleDeleteMdaRead] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// POST /api/mda-reads/:id/images — upload print
// =============================================================================

export async function handleUploadMdaReadImage(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = await getStore(injectedStorage);
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const readId = String(req?.params?.id ?? "");
    const file = req?.file;
    if (!file || !Buffer.isBuffer(file.buffer)) {
      res.status(400).json({ code: "invalid_mime", message: "Arquivo obrigatorio" });
      return;
    }
    if (typeof file.size === "number" && file.size > MDA_MAX_FILE_SIZE) {
      res.status(413).json({ code: "file_too_large", message: "Imagem maior que 5MB" });
      return;
    }
    // MIME por magic bytes (source of truth — ignora Content-Type).
    const detectedMime = detectMimeFromBuffer(file.buffer);
    if (!detectedMime) {
      res.status(400).json({ code: "invalid_mime", message: "Formato invalido. Aceitos: PNG, JPEG, WebP" });
      return;
    }

    // Ownership (404 — nao confirma existencia, NAO 403).
    const read = await store.getMdaReadById(readId, userId);
    if (!read) {
      res.status(404).json({ error: "NOT_FOUND", message: "MDA nao encontrado" });
      return;
    }
    const existing = Array.isArray(read.images) ? read.images : [];
    if (existing.length >= MDA_MAX_IMAGES) {
      res.status(409).json({ error: "TOO_MANY_IMAGES", message: "Maximo de 8 prints" });
      return;
    }

    // Persiste imagem (root dedicado). Layout <userId>/<readId>/<nanoid>.<ext>.
    const ext = extFromMime(detectedMime);
    let putResult: { key: string; size: number };
    try {
      putResult = await mdaImageStorage.put({
        userId,
        sessionId: readId,
        ext,
        buffer: file.buffer,
        mime: detectedMime,
      });
    } catch (err: any) {
      console.error("[handleUploadMdaReadImage] put failed", err);
      res.status(500).json({ message: "Erro ao salvar imagem" });
      return;
    }

    // Atualiza array jsonb; em falha, rollback da key orfa (D-2).
    let added: any;
    try {
      const imageId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      added = await store.addMdaReadImage(readId, userId, {
        id: imageId,
        key: putResult.key,
        caption: "",
      });
    } catch (err: any) {
      await bestEffortDelete(putResult.key);
      console.error("[handleUploadMdaReadImage] addMdaReadImage failed", err);
      res.status(500).json({ message: "Erro ao registrar imagem" });
      return;
    }
    if (!added) {
      await bestEffortDelete(putResult.key);
      res.status(404).json({ error: "NOT_FOUND", message: "MDA nao encontrado" });
      return;
    }

    res.status(201).json({ id: added.id, url: imageUrl(readId, added.id) });
  } catch (err) {
    console.error("[handleUploadMdaReadImage] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// GET /api/mda-reads/:id/images/:imageId — serve print privado
// =============================================================================

export async function handleServeMdaReadImage(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = await getStore(injectedStorage);
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const readId = String(req?.params?.id ?? "");
    const imageId = String(req?.params?.imageId ?? "");
    const key = await store.getMdaReadImageKey(readId, userId, imageId);
    // 404 (nao 403) — cobre cross-user (null) + imageId inexistente.
    if (!key) {
      res.status(404).json({ message: "Imagem nao encontrada" });
      return;
    }
    const result = await mdaImageStorage.get(key);
    if (!result) {
      res.status(404).json({ message: "Imagem nao encontrada" });
      return;
    }
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.end(result.buffer);
  } catch (err) {
    console.error("[handleServeMdaReadImage] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// DELETE /api/mda-reads/:id/images/:imageId — remove print
// =============================================================================

export async function handleDeleteMdaReadImage(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  const store = await getStore(injectedStorage);
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const readId = String(req?.params?.id ?? "");
    const imageId = String(req?.params?.imageId ?? "");
    const result = await store.removeMdaReadImage(readId, userId, imageId);
    if (!result) {
      res.status(404).json({ message: "MDA nao encontrado" });
      return;
    }
    // Best-effort delete do storage — falha nao derruba a operacao principal.
    if (result.oldKey) {
      await bestEffortDelete(result.oldKey);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[handleDeleteMdaReadImage] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// Multer + rate limit + error handler
// =============================================================================

const mdaImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MDA_MAX_FILE_SIZE },
});

const mdaCreateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
});

const mdaImageUploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
});

// Wrapper: multer limits.fileSize aborta o stream e chama next(MulterError) ANTES
// do handler — sem este wrapper o error handler global devolveria 500 no lugar do
// 413 que o RF-04 exige (espelha study-sessions.ts:statMulterErrorHandler).
function mdaMulterErrorHandler(
  upload: multer.Multer,
  field: string,
): (req: any, res: Response, next: any) => void {
  return (req, res, next) => {
    upload.single(field)(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ code: "file_too_large", message: "Imagem maior que 5MB" });
          return;
        }
        res.status(400).json({ code: "invalid_mime", message: err?.message ?? "Erro de upload" });
        return;
      }
      next();
    });
  };
}

export function registerMdaRoutes(app: Express): void {
  // Sub-paths fixos / de 2+ segmentos registrados ANTES do :id generico (habito
  // anti-colisao). Wrapper (req,res)=>handler(req,res) impede que o `next` do
  // Express vaze como o 3o arg injectedStorage (lesson #34).
  app.post(
    "/api/mda-reads",
    requireAuth,
    mdaCreateLimit,
    (req: Request, res: Response) => handleCreateMdaRead(req, res),
  );
  app.get(
    "/api/mda-reads/by-theme",
    requireAuth,
    (req: Request, res: Response) => handleListMdaReadsByTheme(req, res),
  );
  app.post(
    "/api/mda-reads/:id/images",
    requireAuth,
    mdaImageUploadLimiter,
    mdaMulterErrorHandler(mdaImageUpload, "file"),
    (req: Request, res: Response) => handleUploadMdaReadImage(req, res),
  );
  app.get(
    "/api/mda-reads/:id/images/:imageId",
    requireAuth,
    (req: Request, res: Response) => handleServeMdaReadImage(req, res),
  );
  app.delete(
    "/api/mda-reads/:id/images/:imageId",
    requireAuth,
    (req: Request, res: Response) => handleDeleteMdaReadImage(req, res),
  );
  // :id generico por ultimo.
  app.get("/api/mda-reads/:id", requireAuth, (req: Request, res: Response) => handleGetMdaRead(req, res));
  app.patch("/api/mda-reads/:id", requireAuth, (req: Request, res: Response) => handleUpdateMdaRead(req, res));
  app.delete("/api/mda-reads/:id", requireAuth, (req: Request, res: Response) => handleDeleteMdaRead(req, res));
}
