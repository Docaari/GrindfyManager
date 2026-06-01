// statAnalysisImageStorage — Sprint EST-3 (ADR-222 / D-3 / Q-OPEN-7)
//
// Storage de imagem DEDICADO para os prints de stat_analysis (jogada + solucao
// GTO). Reusa LocalFsSpotImageStorage (ADR-057) mas com root SEPARADO
// `private-uploads/stat-analysis` — NAO o singleton spotImageStorage cujo root
// eh `private-uploads/spots`. Justificativa (D-3): isolamento de dominio +
// segregacao fisica do copyright GTO + limpeza por cron dedicada.
//
// Key layout: <userId>/<sessionId>/<nanoid>.<ext> (entryId/slot ficam no DB,
// na entry: playImageKey/solutionImageKey).

import { type SpotImageStorage } from "../spotImageStorage/local";
import { createSpotImageStorage } from "../spotImageStorage";

// Reusa a factory parametrizada do spotImageStorage (mesma selecao de backend),
// so trocando o root para segregar fisicamente os prints GTO (D-3).
export function createStatAnalysisImageStorage(): SpotImageStorage {
  return createSpotImageStorage("private-uploads/stat-analysis");
}

// Singleton — instanciado uma vez no boot do servidor.
export const statImageStorage: SpotImageStorage = createStatAnalysisImageStorage();

/**
 * Rollback de imagem ja persistida via statImageStorage (apos put bem-sucedido
 * mas antes do DB confirmar). Best-effort: idempotente em ENOENT, no-op para
 * key null (D-6).
 */
export async function rollbackStatImage(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await statImageStorage.delete(key);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      console.warn("rollbackStatImage failed", { key, err: err?.message });
    }
  }
}
