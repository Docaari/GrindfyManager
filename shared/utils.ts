export function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampBreakFeedback(body: Record<string, unknown>): {
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
} {
  const fields = ['foco', 'energia', 'confianca', 'inteligenciaEmocional', 'interferencias'] as const;
  const result: Record<string, number> = {};

  for (const field of fields) {
    const raw = body[field];
    const parsed = parseInt(String(raw), 10);
    const value = isNaN(parsed) ? 5 : parsed;
    result[field] = clampValue(value, 0, 10);
  }

  return result as {
    foco: number;
    energia: number;
    confianca: number;
    inteligenciaEmocional: number;
    interferencias: number;
  };
}
