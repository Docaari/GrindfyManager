// LocalFsSpotImageStorage — Sprint Spot-Screenshots (ADR-057)
//
// Layout: <root>/<userId>/<sessionId>/<nanoid21>.<ext>
// Key persistida em DB: path relativo a root (neutro entre LocalFs / S3).
// Defesa em profundidade: bloqueia path traversal em userId/sessionId/key.

import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { extFromMime, type SpotImageMime } from "./mime";

const ALLOWED_EXTS = new Set(["png", "jpeg", "webp"]);

function rejectIfTraversal(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`invalid ${label}`);
  }
  if (
    value.includes("..") ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throw new Error(`invalid ${label}: path-unsafe characters`);
  }
}

function validateKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("invalid key");
  }
  if (key.includes("..") || key.startsWith("/") || key.includes("\\")) {
    throw new Error("invalid key: path traversal blocked");
  }
}

export interface SpotImageStorage {
  put(input: {
    userId: string;
    sessionId: string;
    ext: string;
    buffer: Buffer;
    mime: string;
  }): Promise<{ key: string; size: number }>;
  get(key: string): Promise<{ buffer: Buffer; mime: string } | null>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
}

export interface LocalFsOptions {
  root: string;
}

export class LocalFsSpotImageStorage implements SpotImageStorage {
  private readonly root: string;

  constructor(options: LocalFsOptions) {
    this.root = options.root;
  }

  async put(input: {
    userId: string;
    sessionId: string;
    ext: string;
    buffer: Buffer;
    mime: string;
  }): Promise<{ key: string; size: number }> {
    const { userId, sessionId, ext, buffer } = input;
    rejectIfTraversal(userId, "userId");
    rejectIfTraversal(sessionId, "sessionId");
    if (!ALLOWED_EXTS.has(ext)) {
      throw new Error(`invalid ext: ${ext} not in whitelist (png/jpeg/webp)`);
    }
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("invalid buffer");
    }

    const id = nanoid(21);
    const filename = `${id}.${ext}`;
    const dir = path.join(this.root, userId, sessionId);
    const absPath = path.join(dir, filename);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absPath, buffer);

    return {
      key: `${userId}/${sessionId}/${filename}`,
      size: buffer.length,
    };
  }

  async get(key: string): Promise<{ buffer: Buffer; mime: string } | null> {
    validateKey(key);
    const absPath = path.join(this.root, key);
    try {
      const buffer = await fs.readFile(absPath);
      const mime = mimeFromKey(key);
      return { buffer, mime };
    } catch (err: any) {
      if (err?.code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<boolean> {
    validateKey(key);
    const absPath = path.join(this.root, key);
    try {
      await fs.unlink(absPath);
      return true;
    } catch (err: any) {
      if (err?.code === "ENOENT") return false;
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
}

function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpeg" || ext === "jpg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}
