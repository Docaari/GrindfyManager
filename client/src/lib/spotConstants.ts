/**
 * Sprint F2 — constantes compartilhadas entre componentes do feature spot-screenshots.
 *
 * Source of truth para evitar drift silencioso em strings cross-file.
 */

export const SPOT_DRAG_MIME = "application/x-spot-id";

export function getSpotImageUrl(spotId: string): string {
  return `/api/starred-hands/${spotId}/image`;
}
