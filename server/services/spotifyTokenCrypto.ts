// Sprint Mini Player 2 (ADR-190) — AES-256-GCM helpers for spotify refresh_token.
//
// Key: env var SPOTIFY_TOKEN_ENCRYPTION_KEY (64 hex chars = 32 bytes).
// IV: 12 bytes random per token.
// Auth tag: 16 bytes.
// Boot fail (throw) if key missing or wrong length.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function getKey(): Buffer {
  const raw = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SPOTIFY_TOKEN_ENCRYPTION_KEY ausente — Sprint Mini Player 2 (ADR-190) exige env var setada (32 bytes hex).",
    );
  }
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `SPOTIFY_TOKEN_ENCRYPTION_KEY com tamanho invalido: esperado ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars), recebeu ${buf.length} bytes.`,
    );
  }
  return buf;
}

export function encryptRefreshToken(plaintext: string): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("hex"),
    authTag: tag.toString("hex"),
  };
}

export function decryptRefreshToken(row: {
  refreshTokenEncrypted: string;
  refreshTokenIv: string;
  refreshTokenAuthTag: string;
}): string {
  const key = getKey();
  const iv = Buffer.from(row.refreshTokenIv, "hex");
  const tag = Buffer.from(row.refreshTokenAuthTag, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(row.refreshTokenEncrypted, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
