// =============================================================================
// scripts/library-upload-bloco-a.ts — Sprint Biblioteca-2 / RF-10.
//
// Uploads dos 9 episodios do Bloco A "Antes das Cartas":
//   - 9 .m4a (audio comprimido) em compressed/
//   - 9 .html (artigos ricos) na raiz da pasta do curso
//   - 9 .jpeg (capas) em Capas/
// Monta CSV manifest runtime + chama POST /api/admin/library/import-manifest.
//
// Idempotente: rerun salta lessons ja existentes via skipExistingSlugs.
// Resume em falha: erro num episodio nao quebra batch (importer reporta errors[]).
//
// Flags:
//   --admin-token=<JWT>
//   --base-url=<URL>
//   --course-folder=<PATH>   default: pasta raiz Bloco A
//   --dry-run                gera CSV + lista files, nao envia
// =============================================================================

import { promises as fs } from "fs";
import path from "path";

// -----------------------------------------------------------------------------
// LESSONS — 9 episodios do Bloco A (canonico, hardcoded por design).
// -----------------------------------------------------------------------------

export interface BlocoALesson {
  episode: string;        // "A1" ... "A9"
  slug: string;
  title: string;
  displayOrder: number;
}

export const LESSONS: BlocoALesson[] = [
  { episode: "A1", slug: "a1-mentalidade-fixa-vs-crescimento", title: "Mentalidade Fixa vs Crescimento", displayOrder: 1 },
  { episode: "A2", slug: "a2-tilt-controle-emocional", title: "Tilt e Controle Emocional", displayOrder: 2 },
  { episode: "A3", slug: "a3-consciencia-corporal", title: "Consciencia Corporal", displayOrder: 3 },
  { episode: "A4", slug: "a4-rotinas-pre-sessao", title: "Rotinas Pre-Sessao", displayOrder: 4 },
  { episode: "A5", slug: "a5-foco-atencao", title: "Foco e Atencao Sustentada", displayOrder: 5 },
  { episode: "A6", slug: "a6-resiliencia-bad-beats", title: "Resiliencia em Bad Beats", displayOrder: 6 },
  { episode: "A7", slug: "a7-disciplina-bankroll", title: "Disciplina de Bankroll", displayOrder: 7 },
  { episode: "A8", slug: "a8-decisao-vs-resultado", title: "Decisao vs Resultado", displayOrder: 8 },
  { episode: "A9", slug: "a9-pos-sessao-aprendizado", title: "Pos-Sessao e Aprendizado", displayOrder: 9 },
];

// Backward-compat alias (test-writer mencionou ambos os nomes).
export const BLOCO_A_LESSONS = LESSONS;

// -----------------------------------------------------------------------------
// buildBlocoAManifestCsv — gera CSV runtime do manifest.
// -----------------------------------------------------------------------------

const HEADER = [
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

export interface BuildManifestOptions {
  /** Slugs ja existentes na biblioteca (skip pra idempotencia). */
  skipExistingSlugs?: string[];
}

function csvField(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildBlocoAManifestCsv(opts: BuildManifestOptions = {}): string {
  const skip = new Set(opts.skipExistingSlugs ?? []);
  const lines: string[] = [];
  lines.push(HEADER.join(","));
  // Course row
  lines.push(
    [
      "course",
      "antes-das-cartas",
      csvField("00 - Antes das Cartas"),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "1",
    ].join(","),
  );
  // Module row
  lines.push(
    [
      "module",
      "antes-das-cartas",
      "",
      "bloco-a",
      csvField("Bloco A — Fundamentos Mentais"),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "1",
    ].join(","),
  );
  // Lesson rows (skip existing)
  for (const l of LESSONS) {
    if (skip.has(l.slug)) continue;
    lines.push(
      [
        "lesson",
        "antes-das-cartas",
        "",
        "bloco-a",
        "",
        l.slug,
        csvField(l.title),
        "",
        "performance_mental",
        csvField("mindset"),
        `${l.episode}.html`,
        `${l.episode}.m4a`,
        "",
        `${l.episode}.jpeg`,
        String(l.displayOrder),
      ].join(","),
    );
  }
  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// CLI runner
// -----------------------------------------------------------------------------

interface UploadOptions {
  adminToken: string;
  baseUrl: string;
  courseFolder: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): UploadOptions {
  const get = (flag: string, fallback: string) => {
    const a = argv.find((x) => x.startsWith(`--${flag}=`));
    return a ? a.split("=").slice(1).join("=") : fallback;
  };
  const has = (flag: string) => argv.includes(`--${flag}`);
  return {
    adminToken: get("admin-token", process.env.GRINDFY_ADMIN_TOKEN ?? ""),
    baseUrl: get("base-url", process.env.GRINDFY_BASE_URL ?? "http://localhost:3000"),
    courseFolder: get(
      "course-folder",
      process.env.GRINDFY_BLOCO_A_FOLDER ??
        path.join(
          process.env.USERPROFILE ?? process.env.HOME ?? ".",
          "OneDrive",
          "Desktop",
          "A anatomia de um Spot",
          "00 - Antes das Cartas",
          "Bloco A - Fundamentos Mentais",
        ),
    ),
    dryRun: has("dry-run"),
  };
}

async function loadFiles(folder: string): Promise<Array<{ name: string; mime: string; buffer: Buffer }>> {
  const files: Array<{ name: string; mime: string; buffer: Buffer }> = [];
  for (const l of LESSONS) {
    const ep = l.episode;
    const tryPaths = [
      { rel: `${ep}.html`, mime: "text/html" },
      { rel: `compressed/${ep}.m4a`, mime: "audio/mp4" },
      { rel: `Capas/${ep}.jpeg`, mime: "image/jpeg" },
    ];
    for (const t of tryPaths) {
      const abs = path.join(folder, t.rel);
      try {
        const buffer = await fs.readFile(abs);
        files.push({ name: path.basename(t.rel), mime: t.mime, buffer });
      } catch {
        // skip missing — importer reports error per file.
      }
    }
  }
  return files;
}

async function uploadManifest(opts: UploadOptions): Promise<void> {
  const csv = buildBlocoAManifestCsv({});
  const files = await loadFiles(opts.courseFolder);
  if (opts.dryRun) {
    // eslint-disable-next-line no-console
    console.log("[dry-run] manifest CSV:");
    // eslint-disable-next-line no-console
    console.log(csv);
    // eslint-disable-next-line no-console
    console.log(`[dry-run] would upload ${files.length} files.`);
    return;
  }
  const FormData =
    typeof globalThis.FormData !== "undefined" ? globalThis.FormData : null;
  const Blob = typeof globalThis.Blob !== "undefined" ? globalThis.Blob : null;
  if (!FormData || !Blob) {
    throw new Error("FormData/Blob not available (Node >= 18 required).");
  }
  const fd = new FormData();
  fd.append(
    "manifest",
    new Blob([new Uint8Array(Buffer.from(csv, "utf8"))], { type: "text/csv" }),
    "manifest.csv",
  );
  for (const f of files) {
    fd.append("files", new Blob([new Uint8Array(f.buffer)], { type: f.mime }), f.name);
  }
  const csrfRes = await fetch(`${opts.baseUrl}/api/csrf-token`, { method: "GET" });
  const setCookie = csrfRes.headers.get("set-cookie") ?? "";
  const csrfMatch = /grindfy_csrf_token=([^;]+)/.exec(setCookie);
  const csrf = csrfMatch?.[1] ?? "";
  const url = `${opts.baseUrl}/api/admin/library/import-manifest`;
  const headers: Record<string, string> = {
    cookie: `grindfy_csrf_token=${csrf}`,
    "x-csrf-token": csrf,
  };
  if (opts.adminToken) headers.authorization = `Bearer ${opts.adminToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: fd as any,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`import-manifest failed: ${res.status} ${body}`);
  }
  const json: any = await res.json().catch(() => ({}));
  // eslint-disable-next-line no-console
  console.log(
    `[OK] import done. modules=${json.modulesCreated}, lessons=${json.lessonsCreated}, errors=${json.errors?.length ?? 0}`,
  );
  if (json.errors?.length) {
    // eslint-disable-next-line no-console
    console.warn("[WARN] errors during import:", json.errors);
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /library-upload-bloco-a\.ts$/.test(process.argv[1] ?? "");
if (isDirectRun) {
  uploadManifest(parseArgs(process.argv.slice(2))).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
