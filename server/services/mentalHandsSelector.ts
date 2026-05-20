// =============================================================================
// mentalHandsSelector — Sprint AI-2B / RF-06 (ADR-171)
//
// selectTopHighlights(handsList, n=3) — prioriza diversidade de emoção +
// recência. Determinístico, sem LLM.
// =============================================================================

export function selectTopHighlights<T extends { emotion?: string | null; occurredAt?: any }>(
  hands: T[],
  topN = 3,
): T[] {
  if (!Array.isArray(hands) || hands.length === 0) return [];
  // Ordenar por occurredAt DESC.
  const sorted = [...hands].sort((a, b) => {
    const at = new Date((a as any)?.occurredAt ?? 0).getTime();
    const bt = new Date((b as any)?.occurredAt ?? 0).getTime();
    return bt - at;
  });
  const out: T[] = [];
  const seenEmotions = new Set<string>();
  // 1ª passada: maximiza diversidade.
  for (const h of sorted) {
    if (out.length >= topN) break;
    const em = String((h as any)?.emotion ?? "");
    if (!seenEmotions.has(em)) {
      out.push(h);
      seenEmotions.add(em);
    }
  }
  // 2ª passada: completa com restos (mesma emoção).
  for (const h of sorted) {
    if (out.length >= topN) break;
    if (!out.includes(h)) out.push(h);
  }
  return out;
}
