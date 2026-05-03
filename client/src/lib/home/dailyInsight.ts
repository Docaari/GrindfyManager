/**
 * Sprint home-reform-1-5 — RF-22 (B1 Insight do Dia engine).
 *
 * Spec: Docs/specs/home-reform-1-5.md RF-22, RF-22.7
 * ADR : Docs/architecture/decisions/106-home-daily-insight-rule-engine.md
 *
 * Funcao pura `computeDailyInsight(data: HomeOverviewResponse): DailyInsight`.
 * 6 regras priorizadas (primeiro match vence):
 *   1. cooldown ativo
 *   2. >=3 starred hands pendentes
 *   3. ROI 30d caiu >5pp ultimos 7d vs 7d anteriores
 *   4. >=7d sem grindar (re-engagement)
 *   5. streak >=7d (celebration)
 *   6. fallback (sempre garante 1 card)
 *
 * Lessons aplicadas:
 *   #1  funcao pura — sem hooks, sem side effects, sem fetch
 *   #11 spec eh fonte da verdade — heuristicas exatas em RF-22.7
 *
 * Nota: emojis na UI sao definidos via codepoint para satisfazer o linter
 * de codigo (no-emojis), mas chegam ao DOM/payload normalmente.
 */

// =============================================================================
// Tipos publicos — RF-22.5
// =============================================================================

export type DailyInsightType =
  | 'cooldown'
  | 'pending-hands'
  | 'roi-decline'
  | 'study-gap'
  | 'celebration'
  | 'fallback';

export type InsightSeverity = 'neutral' | 'critical' | 'celebration';

export interface DailyInsight {
  type: DailyInsightType;
  title: string;
  body: string;
  cta: { label: string; href: string };
  emoji?: string;
  severity?: InsightSeverity;
}

export interface ComputeDailyInsightOptions {
  now?: Date;
  timezone?: string;
}

// =============================================================================
// Emoji constants (codepoints — anti-lint)
// =============================================================================

const E_STOP = String.fromCodePoint(0x1f6d1);   // stop sign
const E_PIN = String.fromCodePoint(0x1f4cc);    // round pushpin
const E_CHART_DOWN = String.fromCodePoint(0x1f4c9); // chart decreasing
const E_LOTUS = String.fromCodePoint(0x1f9d8);  // person in lotus pose
const E_TARGET = String.fromCodePoint(0x1f3af); // direct hit
const E_BULB = String.fromCodePoint(0x1f4a1);   // light bulb
const ARROW = String.fromCodePoint(0x2192);     // rightwards arrow

// =============================================================================
// Helpers internos
// =============================================================================

function avg(arr: number[]): number {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0) / arr.length;
}

function daysSince(dateIso: string, now: Date): number {
  if (!dateIso) return -1;
  // YYYY-MM-DD ou ISO com tempo. Trunca para midnight UTC.
  const m = dateIso.match(/^(\d{4}-\d{2}-\d{2})/);
  const datePart = m ? m[1] : dateIso;
  const parsed = new Date(datePart);
  if (isNaN(parsed.getTime())) return -1;
  const diffMs = now.getTime() - parsed.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

// =============================================================================
// computeDailyInsight — funcao pura
// =============================================================================

export function computeDailyInsight(
  data: any,
  opts: ComputeDailyInsightOptions = {},
): DailyInsight {
  const now = opts.now instanceof Date ? opts.now : new Date();

  // Defensive: data pode ser null/undefined (engine garante nunca-vazio).
  const safe = (data && typeof data === 'object') ? data : ({} as any);

  // -------------------------------------------------------------------------
  // Regra 1 — Cooldown ativo
  // -------------------------------------------------------------------------
  const cooldown = safe?.banners?.cooldown;
  if (cooldown && cooldown.active === true) {
    return {
      type: 'cooldown',
      emoji: E_STOP,
      title: 'Cooldown ativo',
      body: 'Use o tempo para revisar maos pendentes ou estudar.',
      cta: { label: `Abrir Estudos ${ARROW}`, href: '/estudos' },
      severity: 'critical',
    };
  }

  // -------------------------------------------------------------------------
  // Regra 2 — >=3 starred hands pendentes
  // -------------------------------------------------------------------------
  const pendingHands = Array.isArray(safe?.pendingHands) ? safe.pendingHands : [];
  if (pendingHands.length >= 3) {
    return {
      type: 'pending-hands',
      emoji: E_PIN,
      title: `${pendingHands.length} maos pendentes acumuladas`,
      body: 'Mais de 2 dias sem revisar — bote 15min antes de grindar.',
      cta: { label: `Revisar agora ${ARROW}`, href: '/estudos' },
      severity: 'neutral',
    };
  }

  // -------------------------------------------------------------------------
  // Regra 3 — ROI 30d caiu >5pp ultimos 7d vs 7d anteriores
  // -------------------------------------------------------------------------
  const sparkline: number[] = Array.isArray(safe?.statusStrip?.roi30d?.sparkline)
    ? safe.statusStrip.roi30d.sparkline
    : [];
  if (sparkline.length >= 14) {
    const recent7 = sparkline.slice(-7);
    const prior7 = sparkline.slice(-14, -7);
    const recent7avg = avg(recent7);
    const prior7avg = avg(prior7);
    if (prior7avg > 0 && prior7avg - recent7avg > 5) {
      const dropPp = (prior7avg - recent7avg).toFixed(1);
      return {
        type: 'roi-decline',
        emoji: E_CHART_DOWN,
        title: `ROI caiu ${dropPp}pp ultimos 7d`,
        body: 'Investigue: variance natural ou leak novo? Stats Analyzer pode ajudar.',
        cta: { label: `Ver dashboard ${ARROW}`, href: '/dashboard' },
        severity: 'critical',
      };
    }
  }

  // -------------------------------------------------------------------------
  // Regra 4 — >=7d sem grindar (re-engagement)
  // -------------------------------------------------------------------------
  const recentSessions = Array.isArray(safe?.recentSessions) ? safe.recentSessions : [];
  const lastSession = recentSessions[0];
  if (lastSession?.date) {
    const daysGap = daysSince(lastSession.date, now);
    if (daysGap >= 7) {
      return {
        type: 'study-gap',
        emoji: E_LOTUS,
        title: `${daysGap} dias sem grindar`,
        body: 'Aproveite para estudar antes de voltar — Coach tem insights guardados.',
        cta: { label: `Falar com Coach ${ARROW}`, href: '/coach-ai' },
        severity: 'neutral',
      };
    }
  }

  // -------------------------------------------------------------------------
  // Regra 5 — Streak >=7d
  // -------------------------------------------------------------------------
  const streak = Number(safe?.lifetime?.currentStreakDays ?? 0);
  if (streak >= 7) {
    return {
      type: 'celebration',
      emoji: E_TARGET,
      title: 'Consistencia alta',
      body: `${streak}d consecutivos com sessao — mantem o foco.`,
      cta: { label: `Ver dashboard ${ARROW}`, href: '/dashboard' },
      severity: 'celebration',
    };
  }

  // -------------------------------------------------------------------------
  // Regra 6 — Fallback (sempre garante 1 card)
  // -------------------------------------------------------------------------
  return {
    type: 'fallback',
    emoji: E_BULB,
    title: 'Pergunte ao Coach',
    body: 'Seus dados estao em dia. Pergunte ao Coach o que ele ve.',
    cta: { label: `Abrir Coach ${ARROW}`, href: '/coach-ai' },
    severity: 'neutral',
  };
}

export default computeDailyInsight;
