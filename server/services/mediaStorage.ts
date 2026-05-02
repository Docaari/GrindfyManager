// =============================================================================
// MediaStorage — abstracao generica de storage de assets binarios.
// Sprint Biblioteca-1 / RF-02 (ADR-071).
//
// Cobre: spots images, library audio M4A, library covers e qualquer asset
// futuro (Coach AI vision, comunidade, etc).
//
// Surface (4 metodos):
//   put({ scope, userId?, ext, buffer, mime }) -> { key, size }
//   get(key) -> { buffer, mime } | null
//   delete(key) -> void   (idempotente)
//   exists(key) -> boolean
//
// Layout FS (local backend):
//   <root>/<scope>/<userId?>/<nanoid21>.<ext>
//   Sem userId, layout vira <root>/<scope>/<nanoid21>.<ext> (capas globais).
//
// Env aliasing (ADR-071):
//   MEDIA_STORAGE_BACKEND=local|s3|mux  (preferred)
//   SPOT_IMAGE_STORAGE_BACKEND=...      (deprecated, alias com warn)
//
// Defesa:
//   - Path traversal bloqueado em scope, userId e key (`.`/`..`/`\\`/leading `/`).
//   - Buffer obrigatorio (rejeita string).
// =============================================================================

import { promises as fs, createReadStream, type ReadStream } from "fs";
import path from "path";
import { nanoid } from "nanoid";

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type MediaBackend = "local" | "s3" | "mux";

export interface MediaPutInput {
  scope: string;
  userId?: string;
  ext: string;
  buffer: Buffer;
  mime: string;
}

export interface MediaPutResult {
  key: string;
  size: number;
}

export interface MediaRangeRequest {
  start: number;
  end: number;
}

export interface MediaStreamResult {
  stream: ReadStream;
  mime: string;
  size: number;
  /** Range subset (echoes input when range requested). */
  start: number;
  end: number;
  totalSize: number;
}

/**
 * F6: marker retornado por `openReadStream` quando o caller pediu um Range
 * fora dos limites (start > totalSize - 1). O handler HTTP traduz isso em
 * 416 + header `Content-Range: bytes * /<totalSize>`. Mantemos como union
 * separada para nao quebrar consumers que so esperam MediaStreamResult.
 */
export interface MediaRangeOutOfBoundsResult {
  outOfRange: true;
  totalSize: number;
}

export interface MediaStorage {
  put(input: MediaPutInput): Promise<MediaPutResult>;
  get(key: string): Promise<{ buffer: Buffer; mime: string } | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /**
   * Open a read stream for the asset. When `range` is provided returns the
   * subset; otherwise streams the entire file. Returns null when key missing.
   * F6: returns `{ outOfRange: true, totalSize }` when the requested
   * `range.start` is beyond `totalSize - 1` so callers can emit HTTP 416.
   */
  openReadStream(
    key: string,
    range?: MediaRangeRequest,
  ): Promise<MediaStreamResult | MediaRangeOutOfBoundsResult | null>;
}

export interface CreateMediaStorageOptions {
  /** Override do root. Default: `uploads/` resolvido a partir do CWD. */
  root?: string;
  /** Override explicito do backend (testes). Default: resolveMediaBackend(). */
  backend?: MediaBackend;
}

// -----------------------------------------------------------------------------
// Env resolution
// -----------------------------------------------------------------------------

export function resolveMediaBackend(): MediaBackend {
  const newer = process.env.MEDIA_STORAGE_BACKEND;
  if (newer && (newer === "local" || newer === "s3" || newer === "mux")) {
    return newer;
  }
  const legacy = process.env.SPOT_IMAGE_STORAGE_BACKEND;
  if (legacy) {
    // eslint-disable-next-line no-console
    console.warn(
      "[mediaStorage] SPOT_IMAGE_STORAGE_BACKEND is deprecated, use MEDIA_STORAGE_BACKEND",
    );
    if (legacy === "local" || legacy === "s3" || legacy === "mux") {
      return legacy;
    }
  }
  return "local";
}

// -----------------------------------------------------------------------------
// Validation helpers (defense in depth)
// -----------------------------------------------------------------------------

function isUnsafe(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) return true;
  if (value.includes("..")) return true;
  if (value.includes("\\")) return true;
  if (value.startsWith("/")) return true;
  return false;
}

function validateScope(scope: string): void {
  if (typeof scope !== "string" || scope.length === 0) {
    throw new Error("invalid scope");
  }
  if (scope.includes("..") || scope.includes("\\") || scope.startsWith("/")) {
    throw new Error("invalid scope: path traversal blocked");
  }
}

function validateUserId(userId: string): void {
  // userId nao deve conter slash nem path-segments — trafega como folder name.
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("invalid userId");
  }
  if (
    userId.includes("..") ||
    userId.includes("\\") ||
    userId.includes("/") ||
    userId.startsWith(".")
  ) {
    throw new Error("invalid userId: path traversal blocked");
  }
}

function validateKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("invalid key");
  }
  if (key.includes("..") || key.includes("\\") || key.startsWith("/")) {
    throw new Error("invalid key: path traversal blocked");
  }
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  html: "text/html",
};

function mimeFromExt(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

// -----------------------------------------------------------------------------
// Local backend (FS)
// -----------------------------------------------------------------------------

class LocalMediaStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async put(input: MediaPutInput): Promise<MediaPutResult> {
    const { scope, userId, ext, buffer } = input;
    validateScope(scope);
    if (userId !== undefined) validateUserId(userId);
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("invalid buffer: must be Buffer instance");
    }
    if (typeof ext !== "string" || ext.length === 0 || isUnsafe(ext)) {
      throw new Error("invalid ext");
    }

    const id = nanoid(21);
    const filename = `${id}.${ext}`;
    const relParts = userId ? [scope, userId, filename] : [scope, filename];
    const key = relParts.join("/");
    const absDir = path.join(this.root, ...relParts.slice(0, -1));
    const absPath = path.join(this.root, ...relParts);
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(absPath, buffer);
    return { key, size: buffer.length };
  }

  async get(key: string): Promise<{ buffer: Buffer; mime: string } | null> {
    validateKey(key);
    const absPath = path.join(this.root, key);
    try {
      const buffer = await fs.readFile(absPath);
      const ext = key.split(".").pop() ?? "";
      return { buffer, mime: mimeFromExt(ext) };
    } catch (err: any) {
      if (err?.code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    validateKey(key);
    const absPath = path.join(this.root, key);
    try {
      await fs.unlink(absPath);
    } catch (err: any) {
      if (err?.code === "ENOENT") return; // idempotente
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    validateKey(key);
    const absPath = path.join(this.root, key);
    try {
      await fs.access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  async openReadStream(
    key: string,
    range?: MediaRangeRequest,
  ): Promise<MediaStreamResult | MediaRangeOutOfBoundsResult | null> {
    validateKey(key);
    const absPath = path.join(this.root, key);
    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch (err: any) {
      if (err?.code === "ENOENT") return null;
      throw err;
    }
    const totalSize = stat.size;
    // F6: detect Range request inteiramente fora dos limites do arquivo
    // (start >= totalSize). Caller traduz para HTTP 416. Empty file
    // (totalSize === 0) com range sempre eh out-of-range.
    if (range !== undefined) {
      if (totalSize === 0 || range.start >= totalSize) {
        return { outOfRange: true, totalSize };
      }
    }
    const start = Math.max(0, range?.start ?? 0);
    const end = Math.min(totalSize - 1, range?.end ?? totalSize - 1);
    const stream = createReadStream(absPath, { start, end });
    const ext = key.split(".").pop() ?? "";
    return {
      stream,
      mime: mimeFromExt(ext),
      size: end - start + 1,
      start,
      end,
      totalSize,
    };
  }
}

// -----------------------------------------------------------------------------
// S3 backend stub — preserva contract de erro do ADR-057 ate deploy real.
// -----------------------------------------------------------------------------

class S3MediaStorage implements MediaStorage {
  async put(_input: MediaPutInput): Promise<MediaPutResult> {
    throw new Error(
      "S3MediaStorage nao implementado nesta fase. Use MEDIA_STORAGE_BACKEND=local.",
    );
  }
  async get(_key: string): Promise<{ buffer: Buffer; mime: string } | null> {
    throw new Error(
      "S3MediaStorage nao implementado nesta fase. Use MEDIA_STORAGE_BACKEND=local.",
    );
  }
  async delete(_key: string): Promise<void> {
    throw new Error(
      "S3MediaStorage nao implementado nesta fase. Use MEDIA_STORAGE_BACKEND=local.",
    );
  }
  async exists(_key: string): Promise<boolean> {
    throw new Error(
      "S3MediaStorage nao implementado nesta fase. Use MEDIA_STORAGE_BACKEND=local.",
    );
  }
  async openReadStream(
    _key: string,
    _range?: MediaRangeRequest,
  ): Promise<MediaStreamResult | MediaRangeOutOfBoundsResult | null> {
    throw new Error(
      "S3MediaStorage nao implementado nesta fase. Use MEDIA_STORAGE_BACKEND=local.",
    );
  }
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

export function createMediaStorage(opts: CreateMediaStorageOptions = {}): MediaStorage {
  // Quando caller passa `root` explicito, sempre usa LocalMediaStorage —
  // root so faz sentido em FS. Permite testes injetarem tmpdir sem precisar
  // resetar env vars antes do new.
  if (opts.root) {
    return new LocalMediaStorage(opts.root);
  }
  const backend = opts.backend ?? resolveMediaBackend();
  if (backend === "s3") return new S3MediaStorage();
  if (backend === "mux") {
    throw new Error(
      "MEDIA_STORAGE_BACKEND=mux invalido — Mux usa muxMediaProvider separado (ADR-072).",
    );
  }
  return new LocalMediaStorage(path.resolve("uploads"));
}

// -----------------------------------------------------------------------------
// Storage scope constants — Reviewer rejeita string literal direta.
// Re-export from shared single source of truth (avoid duplication drift).
// -----------------------------------------------------------------------------

export { STORAGE_SCOPES } from "../../shared/library-storage-scopes";
