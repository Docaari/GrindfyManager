// mdaImageStorage — Sprint MDA-1 (ADR-230 / D-2)
//
// Storage de imagem DEDICADO para os prints de MDA (stats da populacao). Reusa
// LocalFsSpotImageStorage (ADR-057) com root SEPARADO `private-uploads/mda` —
// NAO o singleton spotImageStorage (root `private-uploads/spots`), NAO o
// stat-analysis. Justificativa (D-2): isolamento de dominio + segregacao fisica
// do copyright (stats da populacao).
//
// Key layout: <userId>/<readId>/<nanoid>.<ext> (imageId/caption ficam no DB, no
// array jsonb `images`). O `readId` viaja no campo `sessionId` do put().

import { type SpotImageStorage } from "../spotImageStorage/local";
import { createSpotImageStorage } from "../spotImageStorage";

export function createMdaImageStorage(): SpotImageStorage {
  return createSpotImageStorage("private-uploads/mda");
}

// Singleton — instanciado uma vez no boot do servidor.
export const mdaImageStorage: SpotImageStorage = createMdaImageStorage();

/**
 * Rollback de imagem ja persistida via mdaImageStorage (apos put bem-sucedido
 * mas antes do DB confirmar). Best-effort: idempotente em ENOENT, no-op para
 * key null (D-2).
 */
export async function rollbackMdaImage(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await mdaImageStorage.delete(key);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      console.warn("rollbackMdaImage failed", { key, err: err?.message });
    }
  }
}
