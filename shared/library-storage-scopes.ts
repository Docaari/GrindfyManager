// =============================================================================
// shared/library-storage-scopes.ts — Sprint Biblioteca-1 / ADR-071.
//
// Constantes de scopes para mediaStorage. Codigo NUNCA hardcoda strings de
// scope — usa estas constantes. Reviewer rejeita PR com string literal.
// =============================================================================

export const STORAGE_SCOPES = {
  SPOTS: "spots",
  LIBRARY_AUDIO: "library/audio",
  LIBRARY_COVERS: "library/covers",
  LIBRARY_ARTICLE_ASSETS: "library/article-assets",
} as const;

export type StorageScope = (typeof STORAGE_SCOPES)[keyof typeof STORAGE_SCOPES];
