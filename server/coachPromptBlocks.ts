// =============================================================================
// Coach Prompt Blocks — Sprint Cooldown-3 / RF-07
//
// Spec : Docs/specs/cooldown-refactor-plan.md (RF-07)
// ADR  : Docs/architecture/decisions/042-cooldown-coach-tool-registry.md
// Cache: ADR-019 — bloco STATIC cacheable (deterministico para mesmo dataset).
//
// buildCooldownPromptBlock(userId) agrega ultimas 5 sessoes de cool-down via
// storage Sprint 2 e retorna string sanitizada (sem notes/cGame/action) com
// budget <= ~300 tokens (~1500 chars).
// =============================================================================

// -----------------------------------------------------------------------------
// Constantes
// -----------------------------------------------------------------------------

const MAX_LESSON_TOKENS = 5;
const MAX_STARRED_TYPES = 3;
const MAX_BLOCK_LENGTH = 1400; // safety abaixo do limite 1500 chars

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '0%';
  return `${(n * 100).toFixed(0)}%`;
}

function fmtRoi(n: number): string {
  if (!Number.isFinite(n)) return '0%';
  return `${(n * 100).toFixed(1)}%`;
}

function topN<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

// -----------------------------------------------------------------------------
// API publica
// -----------------------------------------------------------------------------

/**
 * Constroi bloco de prompt sumarizando rituais de cool-down recentes.
 * Determinismo: mesma input dataset -> mesma string (sem timestamps/random).
 * Vazio: usuario sem cool-downs -> string vazia.
 */
export async function buildCooldownPromptBlock(
  userId: string,
): Promise<string> {
  // Pull dataset (paralelo). Periodo padrao: 30d. Reusa storage Sprint 2.
  let compliance: { total: number; completed: number; complianceRate: number };
  let starred: Array<{ type: string; count: number }>;
  let lessons: Array<{ token: string; count: number }>;
  let impact: {
    withCooldown: { avgRoi: number };
    withoutCooldown: { avgRoi: number };
    delta: number;
  };

  try {
    // Lazy import — evita TDZ em testes que mockam server/storage com closure.
    const { storage } = await import('./storage');
    [compliance, starred, lessons, impact] = await Promise.all([
      storage.getCooldownComplianceMetrics(userId, '30d'),
      storage.getStarredHandsDistribution(userId, '30d'),
      storage.getTopLessons(userId, '30d'),
      storage.getCooldownImpactMetrics(userId, '30d'),
    ]);
  } catch (err) {
    // lessons-learned #9: log antes de fallback silencioso.
    // eslint-disable-next-line no-console
    console.error('[buildCooldownPromptBlock] storage error', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }

  // Empty path — usuario sem cool-downs no periodo.
  if ((compliance?.total ?? 0) === 0 && (compliance?.completed ?? 0) === 0) {
    return '';
  }

  const parts: string[] = [];
  parts.push('## Rituais de cool-down recentes (30d)');

  const cdCount = Number(compliance.completed) || 0;
  const totalSessions = Number(compliance.total) || 0;
  parts.push(
    `- Compliance: ${cdCount}/${totalSessions} sessoes com cool-down (${fmtPct(
      compliance.complianceRate,
    )}).`,
  );

  // Top starred types
  if (Array.isArray(starred) && starred.length > 0) {
    const top = topN(
      [...starred].sort((a, b) => (b.count || 0) - (a.count || 0)),
      MAX_STARRED_TYPES,
    );
    const fmt = top
      .map((s) => `${s.type} (${s.count})`)
      .join(', ');
    parts.push(`- Tipos de mao destacados: ${fmt}.`);
  }

  // Top lessons (tokens — sem texto livre).
  if (Array.isArray(lessons) && lessons.length > 0) {
    const top = topN(lessons, MAX_LESSON_TOKENS).map((l) => l.token);
    parts.push(`- Licoes recorrentes (tokens): ${top.join(', ')}.`);
  }

  // Impact delta (apenas se ha grupo controle).
  const withCount = compliance.completed;
  const withoutCount = Math.max(0, compliance.total - compliance.completed);
  if (withCount > 0 && withoutCount > 0) {
    const delta = Number(impact?.delta ?? 0);
    const sign = delta >= 0 ? 'positiva' : 'negativa';
    parts.push(
      `- Impact em ROI (com vs sem cool-down): delta ${fmtRoi(delta)} ` +
        `(diferenca ${sign}; com=${fmtRoi(impact.withCooldown.avgRoi)}, ` +
        `sem=${fmtRoi(impact.withoutCooldown.avgRoi)}).`,
    );
  }

  const out = parts.join('\n');
  return truncate(out, MAX_BLOCK_LENGTH);
}
