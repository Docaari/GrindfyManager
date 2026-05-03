// =============================================================================
// server/routes/library-register.ts — Sprint Biblioteca-1.
//
// Wire-up das rotas publicas + admin da Biblioteca em Express. Importado por
// server/routes/index.ts via registerLibraryRoutes(app).
// =============================================================================

import type { Express, NextFunction, Request, Response } from "express";
import multer, { MulterError } from "multer";
import { requireAuth, requirePermission } from "../auth";
import {
  handleListLibraryCourses,
  handleGetLibraryCourse,
  handleGetLibraryLesson,
  handleGetLibraryLessonBySlug,
  handleGetLibraryProgress,
  handlePatchLibraryProgress,
  handleCreateLibraryEvent,
  // Sprint Biblioteca-2 / RF-03 + RF-04 + RF-11
  handleGetArticleBundle,
  handleGetArticleStyles,
  handleGetArticleScripts,
  handleAdminUploadStaticAsset,
} from "./library";
import { handleAdminGrantAccess } from "./adminLibrary";
import { createMediaStorage } from "../services/mediaStorage";
import { createMuxProvider } from "../services/muxMediaProvider";
import { importManifest } from "../services/manifestImporter";
import { storage } from "../storage";
import { LIBRARY_ASSETS_URL_PREFIX } from "../../shared/library-format-helpers";

// F4: scopes publicos servidos pelo endpoint generico /api/library/assets/*.
// Audio (library/audio/) tem endpoint dedicado com access check
// (/api/library/lessons/:id/audio). Outros scopes nao-publicos -> 403.
const PUBLIC_ASSET_PREFIXES = ["library/covers/", "spots/"] as const;
function isPublicAssetKey(key: string): boolean {
  return PUBLIC_ASSET_PREFIXES.some((p) => key.startsWith(p));
}

// F1: limits para prevenir OOM/DoS via upload nao-controlado.
// Manifest CSV (1) + ate 200 assets = 201 files. Cada file ate 50MB; field
// auxiliar (text fields) ate 1MB. Total payload ainda gated por
// MAX_PAYLOAD_BYTES no manifestImporter (50MB total).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB por arquivo
    files: 201, // 1 manifest CSV + 200 assets max
    fieldSize: 1 * 1024 * 1024, // 1MB por field
  },
});

// F1: error handler dedicado para Multer — traduz LIMIT_* em 413 com mensagem
// PT-BR clara (mensagens user-facing em portugues; codigo/log em ingles).
function multerErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: "Arquivo excede o limite de 50MB. Reduza o tamanho e tente novamente.",
        code: err.code,
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(413).json({
        message: "Limite de 201 arquivos por upload excedido (1 manifesto + 200 assets).",
        code: err.code,
      });
    }
    if (err.code === "LIMIT_FIELD_VALUE") {
      return res.status(413).json({
        message: "Campo de formulario excede o limite de 1MB.",
        code: err.code,
      });
    }
    // Fallback generico para outros LIMIT_* (LIMIT_PART_COUNT, LIMIT_FIELD_COUNT, etc).
    return res.status(413).json({
      message: "Limite de upload excedido.",
      code: err.code,
    });
  }
  return next(err);
}

export function registerLibraryRoutes(app: Express) {
  // Catalogo publico (RF-05)
  app.get("/api/library/courses", requireAuth, handleListLibraryCourses);
  app.get("/api/library/courses/:slug", requireAuth, handleGetLibraryCourse);
  // by-slug must be registered BEFORE :id to avoid "by-slug" being captured as id.
  app.get(
    "/api/library/lessons/by-slug/:courseSlug/:lessonSlug",
    requireAuth,
    handleGetLibraryLessonBySlug,
  );
  app.get("/api/library/lessons/:id", requireAuth, handleGetLibraryLesson);

  // Sprint Biblioteca-2 / RF-04: Article bundle endpoint.
  app.get(
    "/api/library/lessons/:id/article-bundle",
    requireAuth,
    handleGetArticleBundle,
  );

  // Sprint Biblioteca-2 / RF-03: Static asset endpoints (publicos, cache 30d).
  app.get("/api/library/static/article-styles.css", handleGetArticleStyles);
  app.get("/api/library/static/article-scripts.js", handleGetArticleScripts);

  // Eventos + progress (RF-06)
  app.post("/api/library/events", requireAuth, handleCreateLibraryEvent);
  app.get(
    "/api/library/lessons/:id/progress",
    requireAuth,
    handleGetLibraryProgress,
  );
  app.patch(
    "/api/library/lessons/:id/progress",
    requireAuth,
    handlePatchLibraryProgress,
  );

  // Audio stream (D9): serve M4A com Range. Bloqueio: 401 sem grant.
  app.get(
    "/api/library/lessons/:id/audio",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const lessonId = req.params.id;
        const userId = (req as any).user?.userPlatformId;
        const access = await storage.findLessonAccess({ userId, lessonId });
        if (!access) return res.status(401).json({ message: "access_denied" });
        const lesson = await storage.getLibraryLesson(lessonId);
        if (!lesson?.audioKey) {
          return res.status(404).json({ message: "audio_not_found" });
        }
        const ms = createMediaStorage();

        // Parse Range header: "bytes=0-499" or "bytes=500-".
        const rangeHeader = req.headers.range;
        let range: { start: number; end: number } | undefined;
        if (typeof rangeHeader === "string") {
          const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : Number.MAX_SAFE_INTEGER;
            range = { start, end };
          }
        }

        const result = await ms.openReadStream(lesson.audioKey, range);
        if (!result) return res.status(404).json({ message: "audio_not_found" });

        // F6: Range fora dos limites -> 416 Requested Range Not Satisfiable
        // com header `Content-Range: bytes * /<totalSize>`.
        if ("outOfRange" in result) {
          res.status(416).set("Content-Range", `bytes */${result.totalSize}`).end();
          return;
        }

        res.set("Content-Type", result.mime);
        res.set("Accept-Ranges", "bytes");
        res.set("Cache-Control", "private, max-age=3600");
        res.set("Content-Length", String(result.size));

        if (range) {
          res.status(206);
          res.set(
            "Content-Range",
            `bytes ${result.start}-${result.end}/${result.totalSize}`,
          );
        } else {
          res.status(200);
        }
        result.stream.pipe(res);
      } catch (err) {
        console.error("[library audio] error", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "internal_error" });
        }
      }
    },
  );

  // Asset generico (capas, imagens artigo).
  // F4: restringe a scopes PUBLICOS apenas. Audio precisa do endpoint
  // dedicado com access check. Outros scopes (privados) -> 403.
  app.get(
    `${LIBRARY_ASSETS_URL_PREFIX}*`,
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const fullPath = (req.params as any)[0] ?? "";
        // F4: bloqueio explicito de audio neste endpoint generico — direciona
        // para o endpoint com access check.
        if (fullPath.startsWith("library/audio/")) {
          return res.status(403).json({
            message: "access_denied",
            hint: "Use /api/library/lessons/:id/audio (com access check).",
          });
        }
        if (!isPublicAssetKey(fullPath)) {
          return res.status(403).json({ message: "access_denied" });
        }
        const ms = createMediaStorage();
        const got = await ms.get(fullPath);
        if (!got) return res.status(404).json({ message: "asset_not_found" });
        res.set("Content-Type", got.mime);
        res.set("Cache-Control", "public, max-age=604800");
        res.send(got.buffer);
      } catch (err) {
        console.error("[library asset] error", err);
        res.status(500).json({ message: "internal_error" });
      }
    },
  );

  // Mux signed URL (RF-03)
  app.get(
    "/api/library/lessons/:id/playback-token",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const lessonId = req.params.id;
        const userId = (req as any).user?.userPlatformId;
        const access = await storage.findLessonAccess({ userId, lessonId });
        if (!access) return res.status(401).json({ message: "access_denied" });
        const lesson = await storage.getLibraryLesson(lessonId);
        if (!lesson) return res.status(404).json({ message: "lesson_not_found" });
        if (!lesson.videoMuxPlaybackId) {
          return res.status(404).json({ message: "lesson_no_video" });
        }
        if (!process.env.MUX_TOKEN_ID || !process.env.MUX_SIGNING_KEY) {
          return res.status(503).json({ message: "mux_not_configured" });
        }
        const provider = createMuxProvider();
        const token = await provider.createPlaybackToken({
          playbackId: lesson.videoMuxPlaybackId,
          userPlatformId: userId,
        });
        res.status(200).json(token);
      } catch (err) {
        console.error("[playback-token] error", err);
        res.status(500).json({ message: "internal_error" });
      }
    },
  );

  // Admin (RF-04 + RF-11)
  app.post(
    "/api/admin/library/grant-access",
    requireAuth,
    requirePermission("admin_full"),
    handleAdminGrantAccess,
  );

  // Sprint Biblioteca-2 / RF-11: upload de static asset (CSS/JS).
  // Multer: single file (5MB cap razoavel; CSS/JS sao pequenos).
  const staticAssetUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
      fieldSize: 1 * 1024 * 1024,
    },
  });
  app.post(
    "/api/admin/library/static-asset",
    requireAuth,
    requirePermission("admin_full"),
    (req: Request, res: Response, next: NextFunction) => {
      const mw = staticAssetUpload.single("file");
      mw(req, res, (err: any) => {
        if (err) return multerErrorHandler(err, req, res, next);
        next();
      });
    },
    handleAdminUploadStaticAsset,
  );

  app.post(
    "/api/admin/library/import-manifest",
    requireAuth,
    requirePermission("admin_full"),
    // F1: wrap multer middleware para capturar MulterError e traduzir em 413.
    (req: Request, res: Response, next: NextFunction) => {
      const mw = upload.fields([
        { name: "manifest", maxCount: 1 },
        { name: "files", maxCount: 200 },
      ]);
      mw(req, res, (err: any) => {
        if (err) return multerErrorHandler(err, req, res, next);
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const files = (req as any).files ?? {};
        const manifestFile = (files.manifest ?? [])[0];
        const filesArr = files.files ?? [];
        if (!manifestFile) {
          return res.status(400).json({ message: "manifest_required" });
        }
        const csv = manifestFile.buffer.toString("utf8");
        const adminUserId = (req as any).user?.userPlatformId;
        const result = await importManifest({
          csv,
          files: filesArr.map((f: any) => ({
            fieldname: f.fieldname,
            originalname: f.originalname,
            mimetype: f.mimetype,
            buffer: f.buffer,
          })),
          adminUserId,
        });
        res.status(200).json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/payload|too_large|cap/i.test(msg)) {
          return res.status(413).json({ message: msg });
        }
        if (/CSV fatal|malformed/i.test(msg)) {
          return res.status(400).json({ message: msg });
        }
        console.error("[import-manifest] error", err);
        res.status(500).json({ message: "internal_error" });
      }
    },
  );
}
