/**
 * Sprint Spot-Anki-Reentry-3 — RF-4 enrich Coach session_insights.spotsToReview
 * with reentry annotations (reentryCandidate, reentryAlreadyActive, reentryReason).
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-4.1
 * ADR : 140 (shape extension via campos opcionais — backwards compat).
 *
 * Stateless enrichment computado a cada GET (NAO persistido em jsonb).
 * N+1 mitigation: 2 batch queries (`getStarredHandsByIds`, `getActiveReentryCardsBySpotIds`).
 */

import { storage } from "../../storage";

export type SpotToReviewItem = {
  spotId: string;
  label: string;
  suggestedAction: "add_insight" | "link_theme" | "review_later";
  // Sprint 3 RF-4 — adicoes opcionais (no breaking change ADR-140).
  reentryCandidate?: boolean;
  reentryAlreadyActive?: boolean;
  reentryReason?: string;
};

/**
 * Annotates each `spotsToReview` item with reentry candidacy fields.
 *
 * - `reentryAlreadyActive`: TRUE se ja tem `spot_reentry_cards` ativo (archived_at IS NULL).
 * - `reentryCandidate`: TRUE se algum dos:
 *   * `decisionCorrect === false`
 *   * `confidenceLevel !== null && confidenceLevel <= 2`
 *   * `insight !== null && !reentryAlreadyActive`
 * - `reentryReason`: string user-facing (PT-BR).
 */
export async function enrichSpotsToReviewWithReentry(
  items: SpotToReviewItem[],
  userId: string,
): Promise<SpotToReviewItem[]> {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const spotIds = items.map((i) => i.spotId);
  const [spots, activeCards] = await Promise.all([
    (storage as any).getStarredHandsByIds(spotIds),
    (storage as any).getActiveReentryCardsBySpotIds(userId, spotIds),
  ]);

  const spotsById = new Map<string, any>(
    (spots as any[]).map((s) => [s.id, s]),
  );
  const activeBySpotId = new Set<string>(
    (activeCards as any[]).map((c) => c.spotId),
  );

  return items.map((item) => {
    const spot = spotsById.get(item.spotId);
    if (!spot) {
      // Spot nao encontrado em starred_hands. Retorna item original.
      return item;
    }

    const reentryAlreadyActive = activeBySpotId.has(item.spotId);
    let reentryCandidate = false;
    let reentryReason: string | undefined;

    if (spot.decisionCorrect === false) {
      reentryCandidate = true;
      reentryReason = "Decisao errada";
    } else if (
      spot.confidenceLevel !== null &&
      spot.confidenceLevel !== undefined &&
      spot.confidenceLevel <= 2
    ) {
      reentryCandidate = true;
      reentryReason = `Baixa confianca (${spot.confidenceLevel}/5)`;
    } else if (
      spot.insight !== null &&
      spot.insight !== undefined &&
      !reentryAlreadyActive
    ) {
      reentryCandidate = true;
      reentryReason = "Tem insight, falta reentry";
    }

    return {
      ...item,
      reentryCandidate,
      reentryAlreadyActive,
      reentryReason,
    };
  });
}
