/**
 * Calcula a distribuicao percentual de um array de strings.
 * Valores arredondados com Math.round.
 */
export function calculateDistribution(items: string[]): Record<string, number> {
  if (items.length === 0) return {};

  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item] = (counts[item] || 0) + 1;
  }

  const total = items.length;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(counts)) {
    result[key] = Math.round((count / total) * 100);
  }

  return result;
}
