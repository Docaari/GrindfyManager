import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-0B / RF-05 — buildPageContextSection ganha 5 case's novos:
//   bankroll, estudos, stats, biblioteca, upload.
// Spec: Docs/specs/sprint-ai-0b.md §RF-05 (formatters em cada §RF-05.x)
// ADR-149 §2.4 + §5 (item 6).
//
// Cada `case` emite cabecalho fixo `## Contexto da pagina atual` + `Rota: <route>`
// + as linhas dos campos PRESENTES (campo ausente -> sem linha). Rotas originais
// continuam funcionando (regressao).
//
// Lessons: #14/#26 (await import).
// =============================================================================

import { buildPageContextSection } from '../../../server/coachPageContext';

const HEADER = '## Contexto da pagina atual';

describe('buildPageContextSection — route bankroll', () => {
  // Sprint AI-0B fix (reviewer MEDIUM): activeTab usa keys REAIS do
  // WalletActivityPanel ('results' | 'movements'). Antes: 'movimentacoes'.
  it('inclui cabecalho + Rota: bankroll + linhas dos campos presentes', () => {
    const out = buildPageContextSection({
      route: 'bankroll',
      walletsCount: 3,
      selectedWalletId: 'WALLET-abc',
      activeTab: 'movements',
      dateRange: '30d',
    } as any);
    expect(out).toContain(HEADER);
    expect(out).toMatch(/Rota:\s*bankroll/);
    expect(out).toMatch(/3/);            // walletsCount
    expect(out).toContain('WALLET-abc'); // selectedWalletId
    expect(out).toContain('movements');
    expect(out).toContain('30d');
  });

  it('campos ausentes nao geram linha (so route + os fornecidos)', () => {
    const out = buildPageContextSection({ route: 'bankroll', walletsCount: 2 } as any);
    expect(out).toMatch(/Rota:\s*bankroll/);
    expect(out).toMatch(/2/);
    expect(out).not.toMatch(/movements|relatorios|snapshots/);
  });
});

describe('buildPageContextSection — route estudos', () => {
  it('inclui cabecalho + Rota: estudos + campos presentes', () => {
    const out = buildPageContextSection({
      route: 'estudos',
      activeThemesCount: 4,
      spotsDueCount: 12,
      studyStreakDays: 4,
      focusedThemeId: 'THEME-xyz',
    } as any);
    expect(out).toContain(HEADER);
    expect(out).toMatch(/Rota:\s*estudos/);
    expect(out).toMatch(/4/);  // activeThemesCount or streak
    expect(out).toMatch(/12/); // spotsDueCount
    expect(out).toContain('THEME-xyz');
  });

  it('shape minimo { route: estudos } -> so cabecalho + rota', () => {
    const out = buildPageContextSection({ route: 'estudos' } as any);
    expect(out).toContain(HEADER);
    expect(out).toMatch(/Rota:\s*estudos/);
  });
});

describe('buildPageContextSection — route stats', () => {
  // Sprint AI-0B fix (reviewer MEDIUM): selectedStatGroup eh HudGroupId real
  // (catalogo Stats-V2) — ex 'threebet'. Antes: 'Preflop' (inexistente).
  it('inclui cabecalho + Rota: stats + campos presentes', () => {
    const out = buildPageContextSection({
      route: 'stats',
      hasSnapshot: true,
      latestSnapshotId: 'SNAP-123',
      latestSnapshotStatsCount: 217,
      compareMode: true,
      selectedStatGroup: 'threebet',
    } as any);
    expect(out).toContain(HEADER);
    expect(out).toMatch(/Rota:\s*stats/);
    expect(out).toContain('SNAP-123');
    expect(out).toMatch(/217/);
    expect(out).toContain('threebet');
  });
});

describe('buildPageContextSection — route biblioteca', () => {
  it('inclui cabecalho + Rota: biblioteca + campos presentes', () => {
    const out = buildPageContextSection({
      route: 'biblioteca',
      view: 'lesson',
      courseSlug: 'antes-das-cartas',
      lessonSlug: 'o-que-e-icm',
      filterSites: ['GGPoker', 'PokerStars'],
      filterDaysOfWeek: [1, 5],
    } as any);
    expect(out).toContain(HEADER);
    expect(out).toMatch(/Rota:\s*biblioteca/);
    expect(out).toContain('antes-das-cartas');
    expect(out).toContain('o-que-e-icm');
    expect(out).toContain('GGPoker');
  });
});

describe('buildPageContextSection — route upload', () => {
  it('inclui cabecalho + Rota: upload + campos presentes', () => {
    const out = buildPageContextSection({
      route: 'upload',
      lastImportAt: '2026-05-03',
      lastImportNetwork: 'WPN',
      lastImportTournamentsCount: 142,
      daysSinceLastImport: 8,
      pendingFile: true,
    } as any);
    expect(out).toContain(HEADER);
    expect(out).toMatch(/Rota:\s*upload/);
    expect(out).toContain('WPN');
    expect(out).toMatch(/142/);
    expect(out).toMatch(/8/);
  });
});

describe('buildPageContextSection — regressao das rotas originais', () => {
  it('grade-planner continua produzindo cabecalho + Rota: grade-planner', () => {
    const out = buildPageContextSection({ route: 'grade-planner', day: 3, profile: 'A' } as any);
    expect(out).toContain(HEADER);
    expect(out).toMatch(/Rota:\s*grade-planner/);
  });

  it('dashboard continua produzindo cabecalho + Rota: dashboard', () => {
    const out = buildPageContextSection({ route: 'dashboard', dateRange: '90d' } as any);
    expect(out).toContain(HEADER);
    expect(out).toMatch(/Rota:\s*dashboard/);
  });

  it('coach-ai continua produzindo cabecalho + Rota: coach-ai', () => {
    const out = buildPageContextSection({ route: 'coach-ai', activeCoachType: 'technical' } as any);
    expect(out).toContain(HEADER);
    expect(out).toMatch(/Rota:\s*coach-ai/);
  });
});

describe('buildPageContextSection — exhaustividade (todas as 10 rotas produzem output nao-vazio)', () => {
  const SAMPLES: Record<string, any> = {
    'grade-planner': { route: 'grade-planner' },
    'grind-live': { route: 'grind-live' },
    dashboard: { route: 'dashboard' },
    'coach-ai': { route: 'coach-ai' },
    'cooldown-log': {
      route: 'cooldown-log',
      cooldownLogId: 'CL-1',
      sessionId: 'S-1',
      mode: 'quick',
      blocksCompleted: [],
      completedAt: null,
      starredHandsCount: 0,
    },
    bankroll: { route: 'bankroll' },
    estudos: { route: 'estudos' },
    stats: { route: 'stats' },
    biblioteca: { route: 'biblioteca' },
    upload: { route: 'upload' },
  };

  for (const [route, sample] of Object.entries(SAMPLES)) {
    it(`route '${route}' -> output contem o cabecalho`, () => {
      const out = buildPageContextSection(sample);
      expect(out).toContain(HEADER);
      expect(out).toMatch(new RegExp(`Rota:\\s*${route.replace(/[-]/g, '\\-')}`));
    });
  }
});
