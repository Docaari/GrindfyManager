/**
 * SpotStorage — abstracao de storage para spot screenshots (Sprint F2).
 *
 * ADR : Docs/architecture/decisions/051-spot-screenshots-storage.md
 *
 * Em F2 a implementacao eh disco local (LocalDiskSpotStorage). Em F3 a interface
 * permite trocar para S3/R2 sem alterar handlers/cron — apenas a impl muda.
 *
 * Path no disco: <repoRoot>/uploads/spot-screenshots/<nanoid>.<ext>
 * imageUrl em DB: path relativo "/uploads/spot-screenshots/<file>"
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { nanoid } from "nanoid";

export interface SpotStorageSaveResult {
  /** Path relativo armazenado em starred_hands.imageUrl. Ex: /uploads/spot-screenshots/abc.png */
  key: string;
  /** Path absoluto no disco (so disponivel em LocalDiskSpotStorage). */
  absolutePath?: string;
}

export interface SpotStorageHealth {
  ok: boolean;
  details: string;
}

export interface SpotStorage {
  /**
   * Persiste o buffer no storage backing. Retorna o path relativo (key) que
   * sera armazenado em `starred_hands.imageUrl`.
   */
  save(buffer: Buffer, ext: string): Promise<SpotStorageSaveResult>;

  /**
   * Le o conteudo do storage. Pode ser usado para servir bytes via stream.
   */
  getReadStream(key: string): Promise<NodeJS.ReadableStream>;

  /**
   * Apaga o arquivo do storage. ENOENT eh aceitavel pelo caller (cron).
   */
  delete(key: string): Promise<void>;

  /**
   * Confirma se o storage esta disponivel (dir existe / bucket acessivel).
   */
  healthCheck(): Promise<SpotStorageHealth>;
}

// =============================================================================
// LocalDiskSpotStorage — F2 default
// =============================================================================

/**
 * Diretorio fisico onde os arquivos sao salvos. **Fora** de `uploads/` para
 * evitar exposicao acidental via `app.use("/uploads", express.static(...))`
 * registrado por `studies-v2.ts`. Sem isso, qualquer um com um filename
 * conseguiria baixar prints de outros jogadores via path direto, neutralizando
 * o ownership middleware do ADR-052 (CRITICAL flagged em pre-merge review).
 */
export const SPOT_UPLOADS_DIR = path.resolve("private-uploads/spot-screenshots");

/**
 * URL prefix em `starred_hands.imageUrl`. Eh um identificador logico — NAO
 * resolve para path filesystem servivel por express.static (esta em
 * `private-uploads/` no disco). Acesso EXCLUSIVAMENTE via
 * `GET /api/starred-hands/:id/image` (ADR-052 ownership middleware).
 */
export const SPOT_URL_PREFIX = "/uploads/spot-screenshots";

/**
 * Resolve um path absoluto a partir do imageUrl relativo armazenado em DB.
 * Util para handlers (sendFile) e cron (unlink).
 */
export function resolveSpotPath(imageUrl: string): string {
  // Defensive: extrai apenas o filename (path.basename) para evitar traversal.
  // imageUrl esperado: "/uploads/spot-screenshots/<nanoid>.<ext>"
  const filename = path.basename(imageUrl);
  return path.join(SPOT_UPLOADS_DIR, filename);
}

class LocalDiskSpotStorage implements SpotStorage {
  private uploadsDir: string;
  private dirEnsured = false;

  constructor(uploadsDir: string = SPOT_UPLOADS_DIR) {
    this.uploadsDir = uploadsDir;
  }

  private async ensureDir(): Promise<void> {
    if (this.dirEnsured) return;
    await fs.mkdir(this.uploadsDir, { recursive: true });
    this.dirEnsured = true;
  }

  async save(buffer: Buffer, ext: string): Promise<SpotStorageSaveResult> {
    await this.ensureDir();
    const cleanExt = ext.startsWith(".") ? ext.slice(1) : ext;
    const filename = `${nanoid(16)}.${cleanExt}`;
    const absolutePath = path.join(this.uploadsDir, filename);
    await fs.writeFile(absolutePath, buffer);
    return {
      key: `${SPOT_URL_PREFIX}/${filename}`,
      absolutePath,
    };
  }

  async getReadStream(key: string): Promise<NodeJS.ReadableStream> {
    const absolutePath = resolveSpotPath(key);
    return fsSync.createReadStream(absolutePath);
  }

  async delete(key: string): Promise<void> {
    if (!key) return;
    const absolutePath = resolveSpotPath(key);
    await fs.unlink(absolutePath);
  }

  async healthCheck(): Promise<SpotStorageHealth> {
    try {
      await this.ensureDir();
      await fs.access(this.uploadsDir, fsSync.constants.R_OK | fsSync.constants.W_OK);
      return { ok: true, details: `Local disk OK at ${this.uploadsDir}` };
    } catch (err: any) {
      this.dirEnsured = false;
      return { ok: false, details: `Local disk error: ${err?.message ?? err}` };
    }
  }
}

// Singleton export — handlers e cron consomem so a interface.
export const spotStorage: SpotStorage = new LocalDiskSpotStorage();
