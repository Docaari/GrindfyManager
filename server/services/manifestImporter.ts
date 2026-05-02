// =============================================================================
// manifestImporter — Sprint Biblioteca-1 / RF-11.
//
// Parser CSV manifest + importador idempotente de cursos/modulos/aulas.
// Caps: 50MB total payload, 100 rows. Erros nao-fatais sao retornados em
// `errors[]`; erros fatais lancam exception (caller transforma em 400/413).
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-11
// Diagrama: flow-batch-upload-manifest.mermaid
// =============================================================================

import { storage } from "../storage";
import { createMediaStorage } from "./mediaStorage";
import { createMuxProvider } from "./muxMediaProvider";
import { sanitizeArticleHtml } from "./htmlSanitizer";
import { isValidLibraryCategoryId } from "../../shared/library-categories";
import { STORAGE_SCOPES } from "../../shared/library-storage-scopes";

const MAX_ROWS = 100;
const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;

export interface ManifestRow {
  type: "course" | "module" | "lesson";
  course_slug: string;
  course_title?: string;
  module_slug?: string;
  module_title?: string;
  lesson_slug?: string;
  lesson_title?: string;
  subtitle?: string;
  category_id?: string;
  tags?: string[];
  article_filename?: string;
  audio_filename?: string;
  video_filename?: string;
  cover_filename?: string;
  display_order?: number;
}

export interface ManifestParseResult {
  rows: ManifestRow[];
  errors: Array<{ row?: number; reason: string }>;
}

// -----------------------------------------------------------------------------
// CSV parser — formato fixo com 15 colunas ordenadas conforme spec RF-11.
// -----------------------------------------------------------------------------

const HEADER_KEYS = [
  "type",
  "course_slug",
  "course_title",
  "module_slug",
  "module_title",
  "lesson_slug",
  "lesson_title",
  "subtitle",
  "category_id",
  "tags",
  "article_filename",
  "audio_filename",
  "video_filename",
  "cover_filename",
  "display_order",
] as const;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

export function parseManifestCsv(csvText: string): ManifestParseResult {
  const errors: Array<{ row?: number; reason: string }> = [];
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 1) {
    return { rows: [], errors: [{ reason: "empty CSV" }] };
  }

  const headerCols = splitCsvLine(lines[0]).map((c) => c.trim());
  // Validacao header — precisa ter pelo menos as colunas obrigatorias.
  const missingHeaders = HEADER_KEYS.filter((k) => !headerCols.includes(k));
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      errors: [{ reason: `CSV malformed: missing headers ${missingHeaders.join(",")}` }],
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > MAX_ROWS) {
    errors.push({ reason: `cap exceeded: max ${MAX_ROWS} rows allowed` });
  }

  const rows: ManifestRow[] = [];
  const slugSeenPerCourse = new Map<string, Set<string>>();

  for (let i = 0; i < dataLines.length; i++) {
    const cells = splitCsvLine(dataLines[i]);
    const obj: any = {};
    headerCols.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });

    const type = obj.type as ManifestRow["type"];
    if (type !== "course" && type !== "module" && type !== "lesson") {
      errors.push({ row: i + 2, reason: `invalid type: ${type}` });
      continue;
    }

    const row: ManifestRow = {
      type,
      course_slug: obj.course_slug,
      course_title: obj.course_title || undefined,
      module_slug: obj.module_slug || undefined,
      module_title: obj.module_title || undefined,
      lesson_slug: obj.lesson_slug || undefined,
      lesson_title: obj.lesson_title || undefined,
      subtitle: obj.subtitle || undefined,
      category_id: obj.category_id || undefined,
      tags: obj.tags
        ? String(obj.tags)
            .split(",")
            .map((t: string) => t.trim().toLowerCase())
            .filter(Boolean)
        : [],
      article_filename: obj.article_filename || undefined,
      audio_filename: obj.audio_filename || undefined,
      video_filename: obj.video_filename || undefined,
      cover_filename: obj.cover_filename || undefined,
      display_order: obj.display_order ? Number(obj.display_order) : undefined,
    };

    // Detecta slug duplicado dentro do mesmo curso (lesson) — fatal.
    if (type === "lesson" && row.lesson_slug) {
      const set = slugSeenPerCourse.get(row.course_slug) ?? new Set<string>();
      if (set.has(row.lesson_slug)) {
        errors.push({
          row: i + 2,
          reason: `duplicate lesson_slug "${row.lesson_slug}" in course ${row.course_slug}`,
        });
      } else {
        set.add(row.lesson_slug);
        slugSeenPerCourse.set(row.course_slug, set);
      }
    }

    // Categoria invalida — nao-fatal (linha vai pra errors mas nao explode).
    if (type === "lesson" && row.category_id && !isValidLibraryCategoryId(row.category_id)) {
      errors.push({
        row: i + 2,
        reason: `invalid category_id "${row.category_id}"`,
      });
    }

    rows.push(row);
  }

  return { rows, errors };
}

// -----------------------------------------------------------------------------
// importManifest — runner idempotente que faz upsert por slug.
// -----------------------------------------------------------------------------

export interface ManifestFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

export interface ImportManifestInput {
  csv: string;
  files: ManifestFile[];
  adminUserId: string;
}

export interface ImportManifestResult {
  courseId?: string;
  modulesCreated: number;
  lessonsCreated: number;
  errors: Array<{ row?: number; reason: string }>;
}

function findFile(files: ManifestFile[], name: string): ManifestFile | null {
  if (!name) return null;
  // Match por originalname termina com path do manifest (ex: "Bloco A/A1.html").
  const norm = name.replace(/\\/g, "/").trim();
  const tail = norm.split("/").pop() ?? norm;
  return (
    files.find((f) => f.originalname === norm) ??
    files.find((f) => f.originalname === tail) ??
    files.find((f) => f.originalname.endsWith(norm)) ??
    null
  );
}

/**
 * F19: build O(1) lookup index for files by originalname (full path + tail).
 * findFileFromIndex prefers exact match, falls back to tail, then suffix.
 * Reduces N*M scanning to N*1 lookups when manifest references many files.
 */
function buildFileIndex(files: ManifestFile[]): {
  exact: Map<string, ManifestFile>;
  tail: Map<string, ManifestFile>;
} {
  const exact = new Map<string, ManifestFile>();
  const tail = new Map<string, ManifestFile>();
  for (const f of files) {
    if (!exact.has(f.originalname)) exact.set(f.originalname, f);
    const t = f.originalname.split("/").pop() ?? f.originalname;
    if (!tail.has(t)) tail.set(t, f);
  }
  return { exact, tail };
}

function findFileFromIndex(
  index: { exact: Map<string, ManifestFile>; tail: Map<string, ManifestFile> },
  files: ManifestFile[],
  name: string,
): ManifestFile | null {
  if (!name) return null;
  const norm = name.replace(/\\/g, "/").trim();
  const t = norm.split("/").pop() ?? norm;
  // Exact match first.
  const hitExact = index.exact.get(norm);
  if (hitExact) return hitExact;
  // Tail match (handles "Bloco A/A1.html" -> "A1.html" upload).
  const hitTail = index.tail.get(t);
  if (hitTail) return hitTail;
  // Suffix scan as last resort (rare).
  return files.find((f) => f.originalname.endsWith(norm)) ?? null;
}

export async function importManifest(input: ImportManifestInput): Promise<ImportManifestResult> {
  const { csv, files, adminUserId } = input;
  const totalSize = files.reduce((acc, f) => acc + (f.buffer?.length ?? 0), 0);
  if (totalSize > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `payload too_large: ${totalSize} bytes exceeds cap of ${MAX_PAYLOAD_BYTES} (50MB)`,
    );
  }

  const parsed = parseManifestCsv(csv);
  const errors = [...parsed.errors];

  // Erros fatais no parse (header missing, slug duplicate) levantam.
  const fatalParseErrors = parsed.errors.filter((e) =>
    /malformed|duplicate|cap exceeded/i.test(e.reason),
  );
  if (fatalParseErrors.length > 0 && parsed.rows.length === 0) {
    throw new Error(`CSV fatal: ${fatalParseErrors.map((e) => e.reason).join("; ")}`);
  }

  const mediaStorage = createMediaStorage();
  const muxProvider = createMuxProvider();
  const fileIndex = buildFileIndex(files);
  const find = (name: string) => findFileFromIndex(fileIndex, files, name);

  let courseId: string | undefined;
  let modulesCreated = 0;
  let lessonsCreated = 0;
  let currentModuleByCourse = new Map<string, string>(); // moduleSlug -> moduleId

  for (const row of parsed.rows) {
    try {
      if (row.type === "course") {
        // F2: faz upload do cover ANTES do upsert para capturar a key e
        // persistir em coverKey. Se upsert falhar depois, fazemos cleanup.
        let coverKey: string | undefined;
        if (row.cover_filename) {
          const f = find(row.cover_filename);
          if (f) {
            const ext = (f.originalname.split(".").pop() ?? "jpg").toLowerCase();
            const result = await mediaStorage.put({
              scope: STORAGE_SCOPES.LIBRARY_COVERS,
              ext,
              buffer: f.buffer,
              mime: f.mimetype,
            });
            coverKey = result.key;
          } else {
            errors.push({ reason: `cover not found: ${row.cover_filename}` });
          }
        }

        try {
          const upserted = await storage.upsertLibraryCourseBySlug({
            slug: row.course_slug,
            title: row.course_title ?? row.course_slug,
            displayOrder: row.display_order ?? 0,
            createdBy: adminUserId,
            coverKey,
          });
          courseId = upserted?.id;
        } catch (upsertErr) {
          // F2: cleanup do asset orfao se upsert falhar.
          if (coverKey) {
            await mediaStorage.delete(coverKey).catch(() => {});
          }
          throw upsertErr;
        }
        continue;
      }

      if (row.type === "module") {
        const moduleSlug = row.module_slug ?? "";
        // F2: cover do modulo (mesma logica do course).
        let coverKey: string | undefined;
        if (row.cover_filename) {
          const f = find(row.cover_filename);
          if (f) {
            const ext = (f.originalname.split(".").pop() ?? "jpg").toLowerCase();
            const result = await mediaStorage.put({
              scope: STORAGE_SCOPES.LIBRARY_COVERS,
              ext,
              buffer: f.buffer,
              mime: f.mimetype,
            });
            coverKey = result.key;
          } else {
            errors.push({ reason: `cover not found: ${row.cover_filename}` });
          }
        }

        try {
          const upserted = await storage.upsertLibraryModuleBySlug({
            courseSlug: row.course_slug,
            slug: moduleSlug,
            title: row.module_title ?? moduleSlug,
            displayOrder: row.display_order ?? 0,
            coverKey,
          });
          if (upserted?.id) {
            currentModuleByCourse.set(`${row.course_slug}/${moduleSlug}`, upserted.id);
            modulesCreated++;
          }
        } catch (upsertErr) {
          if (coverKey) {
            await mediaStorage.delete(coverKey).catch(() => {});
          }
          throw upsertErr;
        }
        continue;
      }

      if (row.type === "lesson") {
        const lessonSlug = row.lesson_slug ?? "";
        if (row.category_id && !isValidLibraryCategoryId(row.category_id)) {
          // ja registrado em parse; skip
          continue;
        }

        // Sanitize HTML (sync, no I/O)
        let articleHtml: string | undefined;
        let articleWordCount: number | undefined;
        if (row.article_filename) {
          const f = find(row.article_filename);
          if (f) {
            const sanitized = sanitizeArticleHtml(f.buffer.toString("utf8"));
            articleHtml = sanitized.clean;
            articleWordCount = sanitized.wordCount;
          } else {
            errors.push({
              reason: `article file not found: ${row.article_filename}`,
            });
          }
        }

        // Audio + Video + Cover uploads em paralelo (F18 + F2) — independentes.
        const audioFile = row.audio_filename
          ? find(row.audio_filename)
          : null;
        const videoFile = row.video_filename
          ? find(row.video_filename)
          : null;
        const coverFile = row.cover_filename
          ? find(row.cover_filename)
          : null;

        const audioPromise: Promise<string | undefined> = (async () => {
          if (!row.audio_filename) return undefined;
          if (!audioFile) {
            errors.push({ reason: `audio file not found: ${row.audio_filename}` });
            return undefined;
          }
          const ext = (audioFile.originalname.split(".").pop() ?? "m4a").toLowerCase();
          const result = await mediaStorage.put({
            scope: STORAGE_SCOPES.LIBRARY_AUDIO,
            ext,
            buffer: audioFile.buffer,
            mime: audioFile.mimetype,
          });
          return result.key;
        })();

        const videoPromise: Promise<{ assetId?: string; playbackId?: string }> = (async () => {
          if (!row.video_filename) return {};
          if (!videoFile) {
            errors.push({ reason: `video file not found: ${row.video_filename}` });
            return {};
          }
          try {
            const upload = await muxProvider.uploadAsset({
              fileBuffer: videoFile.buffer,
              mimeType: videoFile.mimetype,
            });
            return { assetId: upload.assetId, playbackId: upload.playbackId };
          } catch (err) {
            errors.push({
              reason: `mux upload failed: ${err instanceof Error ? err.message : String(err)}`,
            });
            return {};
          }
        })();

        // F2: cover key da lesson (capturada igual course/module).
        const coverPromise: Promise<string | undefined> = (async () => {
          if (!row.cover_filename) return undefined;
          if (!coverFile) {
            errors.push({ reason: `cover not found: ${row.cover_filename}` });
            return undefined;
          }
          const ext = (coverFile.originalname.split(".").pop() ?? "jpg").toLowerCase();
          const result = await mediaStorage.put({
            scope: STORAGE_SCOPES.LIBRARY_COVERS,
            ext,
            buffer: coverFile.buffer,
            mime: coverFile.mimetype,
          });
          return result.key;
        })();

        const [audioKey, videoUpload, coverKey] = await Promise.all([
          audioPromise,
          videoPromise,
          coverPromise,
        ]);
        const videoMuxAssetId = videoUpload.assetId;
        const videoMuxPlaybackId = videoUpload.playbackId;

        try {
          await storage.upsertLibraryLessonBySlug({
            courseSlug: row.course_slug,
            moduleSlug: row.module_slug,
            slug: lessonSlug,
            title: row.lesson_title ?? lessonSlug,
            subtitle: row.subtitle,
            categoryId: row.category_id ?? "performance_mental",
            tags: row.tags ?? [],
            articleHtml,
            articleWordCount,
            audioKey,
            coverKey,
            videoMuxAssetId,
            videoMuxPlaybackId,
            displayOrder: row.display_order ?? 0,
            isPublished: false,
          });
        } catch (upsertErr) {
          // F2: cleanup do asset orfao se upsert falhar (audio + cover; video
          // ja vive no Mux e fica orfao mas eh mais raro/ok).
          if (audioKey) await mediaStorage.delete(audioKey).catch(() => {});
          if (coverKey) await mediaStorage.delete(coverKey).catch(() => {});
          throw upsertErr;
        }
        lessonsCreated++;
        continue;
      }
    } catch (err) {
      // Log para diagnostico (lesson #9 — log antes do fallback).
      console.error("[manifestImporter] row failed", err);
      errors.push({
        reason: `row import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return {
    courseId,
    modulesCreated,
    lessonsCreated,
    errors,
  };
}
