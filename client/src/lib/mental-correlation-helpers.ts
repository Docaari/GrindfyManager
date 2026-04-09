// =============================================================================
// FP-13: Correlacao metricas mentais com ROI
// =============================================================================

interface SessionWithROI {
  id: string;
  date: string;
  totalBuyIn: number;
  totalPrize: number;
  profitLoss: number;
}

interface BreakFeedback {
  sessionId: string;
  foco: number;       // 0-10
  energia: number;    // 0-10
  confianca: number;  // 0-10
}

interface MentalCorrelation {
  roiHighFocus: number | null;
  roiLowFocus: number | null;
  roiHighEnergy: number | null;
  roiLowEnergy: number | null;
  roiHighConfidence: number | null;
  roiLowConfidence: number | null;
  sampleSize: number;
  insufficient: boolean;
}

/**
 * Verifica se ha dados suficientes para correlacao (min 5 sessoes com feedback).
 */
export function hasEnoughDataForCorrelation(sessions: SessionWithROI[], feedbacks: BreakFeedback[]): boolean {
  const sessionIdsWithFeedback = new Set(feedbacks.map((f) => f.sessionId));
  const sessionsWithFeedback = sessions.filter((s) => sessionIdsWithFeedback.has(s.id));
  return sessionsWithFeedback.length >= 5;
}

/**
 * Calcula correlacao entre metricas mentais e ROI.
 * Retorna insufficient: true se menos de 5 sessoes com feedback.
 */
export function calculateMentalCorrelation(sessions: SessionWithROI[], feedbacks: BreakFeedback[]): MentalCorrelation {
  // Group feedbacks by session
  const feedbacksBySession = new Map<string, BreakFeedback[]>();
  for (const f of feedbacks) {
    const arr = feedbacksBySession.get(f.sessionId) || [];
    arr.push(f);
    feedbacksBySession.set(f.sessionId, arr);
  }

  // Build session data with average mental metrics
  const sessionData: Array<{
    session: SessionWithROI;
    avgFoco: number;
    avgEnergia: number;
    avgConfianca: number;
    roi: number;
  }> = [];

  for (const session of sessions) {
    const fbs = feedbacksBySession.get(session.id);
    if (!fbs || fbs.length === 0) continue;

    const avgFoco = fbs.reduce((a, f) => a + f.foco, 0) / fbs.length;
    const avgEnergia = fbs.reduce((a, f) => a + f.energia, 0) / fbs.length;
    const avgConfianca = fbs.reduce((a, f) => a + f.confianca, 0) / fbs.length;
    const roi = session.totalBuyIn > 0
      ? ((session.totalPrize - session.totalBuyIn) / session.totalBuyIn) * 100
      : 0;

    sessionData.push({ session, avgFoco, avgEnergia, avgConfianca, roi });
  }

  if (sessionData.length < 5) {
    return {
      roiHighFocus: null,
      roiLowFocus: null,
      roiHighEnergy: null,
      roiLowEnergy: null,
      roiHighConfidence: null,
      roiLowConfidence: null,
      sampleSize: sessionData.length,
      insufficient: true,
    };
  }

  function avgROI(items: Array<{ roi: number }>): number | null {
    if (items.length === 0) return null;
    return items.reduce((a, i) => a + i.roi, 0) / items.length;
  }

  const highFocus = sessionData.filter((d) => d.avgFoco >= 7);
  const lowFocus = sessionData.filter((d) => d.avgFoco < 5);
  const highEnergy = sessionData.filter((d) => d.avgEnergia >= 7);
  const lowEnergy = sessionData.filter((d) => d.avgEnergia < 5);
  const highConf = sessionData.filter((d) => d.avgConfianca >= 7);
  const lowConf = sessionData.filter((d) => d.avgConfianca < 5);

  return {
    roiHighFocus: avgROI(highFocus),
    roiLowFocus: avgROI(lowFocus),
    roiHighEnergy: avgROI(highEnergy),
    roiLowEnergy: avgROI(lowEnergy),
    roiHighConfidence: avgROI(highConf),
    roiLowConfidence: avgROI(lowConf),
    sampleSize: sessionData.length,
    insufficient: false,
  };
}

/**
 * Formata texto de insight de correlacao para tooltip/card.
 */
export function formatCorrelationInsight(type: 'foco' | 'energia' | 'confianca', highROI: number, lowROI: number): string {
  return `Seu ROI e ${highROI}% quando ${type} >= 7, vs ${lowROI}% quando ${type} < 5`;
}
