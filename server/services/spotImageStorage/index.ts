// SpotImageStorage factory + singleton — Sprint Spot-Screenshots (ADR-057)
//
// Backend selection via env `SPOT_IMAGE_STORAGE_BACKEND` (default: local).
// S3SpotImageStorage NAO implementado nesta fase — interface pronta.

import path from "path";
import { LocalFsSpotImageStorage, type SpotImageStorage } from "./local";

export type { SpotImageStorage } from "./local";
export { LocalFsSpotImageStorage } from "./local";
export { detectMimeFromBuffer, extFromMime } from "./mime";
export type { SpotImageMime } from "./mime";

// Sprint Spot-Screenshots: root em `private-uploads/spots` (NAO `uploads/spots`).
// Justificativa: studies-v2.ts:639 monta `app.use("/uploads", express.static("uploads"))`
// para servir imagens de estudos. Colocar spots em `uploads/spots` os exporia via
// GET /uploads/spots/<key> bypassando o ownership check de RF-10. F2 ja resolveu
// com private-uploads/. Reutilizamos o padrao — D7 especificou layout, nao root.
// `rootSubdir` permite singletons dedicados por dominio sem clonar o
// boilerplate de selecao de backend (EST-3 reusa para `private-uploads/stat-analysis`).
export function createSpotImageStorage(rootSubdir = "private-uploads/spots"): SpotImageStorage {
  const backend = process.env.SPOT_IMAGE_STORAGE_BACKEND ?? "local";
  if (backend === "s3") {
    throw new Error(
      "S3SpotImageStorage nao implementado nesta fase. Use SPOT_IMAGE_STORAGE_BACKEND=local.",
    );
  }
  return new LocalFsSpotImageStorage({
    root: path.resolve(rootSubdir),
  });
}

// Singleton — instanciado uma vez no boot do servidor.
export const spotImageStorage: SpotImageStorage = createSpotImageStorage();
