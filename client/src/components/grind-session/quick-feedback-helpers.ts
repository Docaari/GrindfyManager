// Quick feedback helpers — pure functions for distributing quick feedback (FP-07 RF-03)

interface BreakFeedbackValues {
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
}

interface BreakFeedbackRecord {
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
  [key: string]: any;
}

const FIELDS: (keyof BreakFeedbackValues)[] = [
  'foco',
  'energia',
  'confianca',
  'inteligenciaEmocional',
  'interferencias',
];

const DEFAULT_AVERAGE = 5;

/**
 * Calculates historical averages for the 5 mental fields.
 * Returns default (5,5,5,5,5) when no feedbacks provided.
 */
export function getHistoricalAverages(breakFeedbacks: BreakFeedbackRecord[]): BreakFeedbackValues {
  if (breakFeedbacks.length === 0) {
    return {
      foco: DEFAULT_AVERAGE,
      energia: DEFAULT_AVERAGE,
      confianca: DEFAULT_AVERAGE,
      inteligenciaEmocional: DEFAULT_AVERAGE,
      interferencias: DEFAULT_AVERAGE,
    };
  }

  const count = breakFeedbacks.length;
  const result: any = {};
  for (const field of FIELDS) {
    const sum = breakFeedbacks.reduce((acc, fb) => acc + fb[field], 0);
    result[field] = Math.round(sum / count);
  }
  return result as BreakFeedbackValues;
}

/**
 * Distributes a single overall score (0-10) into 5 fields,
 * proportionally based on historical averages.
 * If no history (null) or all-zero history, distributes uniformly.
 * All values are clamped to [0, 10] and rounded to integers.
 */
export function distributeQuickFeedback(
  overallScore: number,
  historicalAverages: BreakFeedbackValues | null,
): BreakFeedbackValues {
  // Uniform distribution when no history
  if (historicalAverages === null) {
    const v = Math.min(10, Math.max(0, Math.round(overallScore)));
    return { foco: v, energia: v, confianca: v, inteligenciaEmocional: v, interferencias: v };
  }

  // Calculate average of historical values
  const avg =
    FIELDS.reduce((sum, f) => sum + historicalAverages[f], 0) / FIELDS.length;

  // If average is 0 (all zeros), fall back to uniform
  if (avg === 0) {
    const v = Math.min(10, Math.max(0, Math.round(overallScore)));
    return { foco: v, energia: v, confianca: v, inteligenciaEmocional: v, interferencias: v };
  }

  // Proportional distribution
  const result: any = {};
  for (const field of FIELDS) {
    const proportion = historicalAverages[field] / avg;
    const raw = overallScore * proportion;
    result[field] = Math.min(10, Math.max(0, Math.round(raw)));
  }
  return result as BreakFeedbackValues;
}
