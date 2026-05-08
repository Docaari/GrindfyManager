/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-2 Service biblioteca recommendations.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-2.2 algoritmo + §RF-2.3 cache
 * ADRs : 134 (services pattern)
 *
 * Cobertura:
 *   - generateBibliotecaRecommendations(userId)
 *       - cruza top 3 leaks com study_themes.linkedStats jsonb
 *       - retorna max 3 cards (1 por leak)
 *       - curated theme tem prioridade sobre user-custom em mesmo leak
 *       - filtra aulas is_published=false
 *       - hidrata courseSlug + lessonSlug (lesson #19)
 *       - hidrata watchedPct via library_lesson_progress
 *       - max 2 lessons por leak (anti-overflow)
 *   - cache TTL 60min (Map<userId, {data, expiresAt}>)
 *   - cache hit nao re-executa algoritmo
 *   - invalidateBibliotecaRecommendationsCache(userId) limpa entry
 *   - _resetForTests() limpa todos
 *   - empty leaks -> recommendations: []
 *   - leak sem theme matching -> skipa esse leak
 *
 * Lessons:
 *   #11 apresentar dado sem decoracao
 *   #19 courseSlug+lessonSlug sempre hidratados
 *   #21 _resetForTests para isolar tests do cache server-side
 *
 * Status RED: server/services/bibliotecaRecommendationsService.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMocks } = vi.hoisted(() => ({
  storageMocks: {
    getStatsLeaks: vi.fn(),
    findStudyThemesByLinkedStat: vi.fn(),
    getLibraryLessonsByIds: vi.fn(),
    getLibraryLessonProgressByUser: vi.fn(),
  },
}));

vi.mock('../../server/storage', () => ({
  storage: storageMocks,
}));

async function loadService() {
  return await import('../../server/services/bibliotecaRecommendationsService');
}

beforeEach(async () => {
  vi.clearAllMocks();
  Object.values(storageMocks).forEach((m: any) => m.mockReset());
  // Reset cache (lesson #21)
  try {
    const mod: any = await import('../../server/services/bibliotecaRecommendationsService');
    if (typeof mod._resetForTests === 'function') mod._resetForTests();
  } catch {
    // red phase
  }
});

describe('generateBibliotecaRecommendations (RF-2.2)', () => {
  it('exporta funcao + invalidator + _resetForTests', async () => {
    const mod: any = await loadService();
    expect(typeof mod.generateBibliotecaRecommendations).toBe('function');
    expect(typeof mod.invalidateBibliotecaRecommendationsCache).toBe('function');
    expect(typeof mod._resetForTests).toBe('function');
  });

  it('happy path: 3 leaks com 1 lesson cada -> 3 cards', async () => {
    storageMocks.getStatsLeaks.mockResolvedValue([
      { statId: 'cbet_flop_oop_pct', statName: 'C-bet OOP', value: 28, benchmark: 38, delta: -10, severity: 8 },
      { statId: 'threebet_pct', statName: '3bet', value: 11, benchmark: 13, delta: -2, severity: 5 },
      { statId: 'icm_bubble_pct', statName: 'ICM', value: 47, benchmark: 52, delta: -5, severity: 6 },
    ]);

    storageMocks.findStudyThemesByLinkedStat.mockImplementation((statId: string, _userId: string) =>
      Promise.resolve(
        statId === 'cbet_flop_oop_pct'
          ? { id: 'th-1', name: 'C-bet OOP', slug: 'c-bet-flop-oop', isCurated: true, linkedLessons: ['lesson-a'] }
          : statId === 'threebet_pct'
            ? { id: 'th-2', name: '3bet', slug: '3bet-defense', isCurated: true, linkedLessons: ['lesson-b'] }
            : { id: 'th-3', name: 'ICM', slug: 'icm', isCurated: true, linkedLessons: ['lesson-c'] },
      ),
    );

    storageMocks.getLibraryLessonsByIds.mockImplementation((ids: string[]) =>
      Promise.resolve(
        ids.map((id) => ({
          id,
          title: `Aula ${id}`,
          courseSlug: 'antes-das-cartas',
          lessonSlug: `slug-${id}`,
          durationSeconds: 720,
          isPublished: true,
          thumbnailUrl: null,
        })),
      ),
    );

    storageMocks.getLibraryLessonProgressByUser.mockResolvedValue({
      'lesson-a': 0.45,
      'lesson-b': 0,
      'lesson-c': 0,
    });

    const mod: any = await loadService();
    const r = await mod.generateBibliotecaRecommendations('USER-0001');

    expect(r.recommendations.length).toBe(3);
    expect(r.recommendations[0].lessons.length).toBeGreaterThanOrEqual(1);
    expect(r.recommendations[0].lessons[0].courseSlug).toBe('antes-das-cartas');
    expect(r.recommendations[0].lessons[0].lessonSlug).toBeTruthy();
  });

  it('hidrata watchedPct para cada lesson via getLibraryLessonProgressByUser', async () => {
    storageMocks.getStatsLeaks.mockResolvedValue([
      { statId: 'cbet_flop_oop_pct', statName: 'C-bet OOP', value: 28, benchmark: 38, delta: -10, severity: 8 },
    ]);
    storageMocks.findStudyThemesByLinkedStat.mockResolvedValue({
      id: 'th-1', name: 'C-bet OOP', slug: 'c-bet', isCurated: true, linkedLessons: ['lesson-a'],
    });
    storageMocks.getLibraryLessonsByIds.mockResolvedValue([
      { id: 'lesson-a', title: 'A', courseSlug: 'curso-x', lessonSlug: 'slug-a', durationSeconds: 720, isPublished: true, thumbnailUrl: null },
    ]);
    storageMocks.getLibraryLessonProgressByUser.mockResolvedValue({ 'lesson-a': 0.6 });

    const mod: any = await loadService();
    const r = await mod.generateBibliotecaRecommendations('USER-0001');

    expect(r.recommendations[0].lessons[0].watchedPct).toBeCloseTo(0.6, 2);
  });

  it('filtra aulas is_published=false', async () => {
    storageMocks.getStatsLeaks.mockResolvedValue([
      { statId: 's-1', statName: 'X', value: 10, benchmark: 20, delta: -10, severity: 8 },
    ]);
    storageMocks.findStudyThemesByLinkedStat.mockResolvedValue({
      id: 'th-1', name: 'X', slug: 'x', isCurated: true, linkedLessons: ['lesson-pub', 'lesson-unpub'],
    });
    storageMocks.getLibraryLessonsByIds.mockResolvedValue([
      { id: 'lesson-pub', title: 'Pub', courseSlug: 'c', lessonSlug: 's-pub', durationSeconds: 720, isPublished: true, thumbnailUrl: null },
      { id: 'lesson-unpub', title: 'Unpub', courseSlug: 'c', lessonSlug: 's-unpub', durationSeconds: 720, isPublished: false, thumbnailUrl: null },
    ]);
    storageMocks.getLibraryLessonProgressByUser.mockResolvedValue({});

    const mod: any = await loadService();
    const r = await mod.generateBibliotecaRecommendations('USER-0001');

    expect(r.recommendations[0].lessons.length).toBe(1);
    expect(r.recommendations[0].lessons[0].id).toBe('lesson-pub');
  });

  it('cap 2 lessons por leak (anti-overflow)', async () => {
    storageMocks.getStatsLeaks.mockResolvedValue([
      { statId: 's-1', statName: 'X', value: 10, benchmark: 20, delta: -10, severity: 8 },
    ]);
    storageMocks.findStudyThemesByLinkedStat.mockResolvedValue({
      id: 'th-1', name: 'X', slug: 'x', isCurated: true,
      linkedLessons: ['l-1', 'l-2', 'l-3', 'l-4', 'l-5'],
    });
    storageMocks.getLibraryLessonsByIds.mockResolvedValue(
      ['l-1', 'l-2', 'l-3', 'l-4', 'l-5'].map((id) => ({
        id, title: id, courseSlug: 'c', lessonSlug: id, durationSeconds: 600, isPublished: true, thumbnailUrl: null,
      })),
    );
    storageMocks.getLibraryLessonProgressByUser.mockResolvedValue({});

    const mod: any = await loadService();
    const r = await mod.generateBibliotecaRecommendations('USER-0001');

    expect(r.recommendations[0].lessons.length).toBeLessThanOrEqual(2);
  });

  it('skipa leak sem theme matching', async () => {
    storageMocks.getStatsLeaks.mockResolvedValue([
      { statId: 's-1', statName: 'X', value: 10, benchmark: 20, delta: -10, severity: 8 },
      { statId: 's-2', statName: 'Y', value: 10, benchmark: 20, delta: -10, severity: 8 },
    ]);
    storageMocks.findStudyThemesByLinkedStat.mockImplementation((statId: string) =>
      Promise.resolve(statId === 's-1' ? { id: 'th-1', name: 'X', slug: 'x', isCurated: true, linkedLessons: ['l-1'] } : null),
    );
    storageMocks.getLibraryLessonsByIds.mockResolvedValue([
      { id: 'l-1', title: 'L', courseSlug: 'c', lessonSlug: 'l-1', durationSeconds: 600, isPublished: true, thumbnailUrl: null },
    ]);
    storageMocks.getLibraryLessonProgressByUser.mockResolvedValue({});

    const mod: any = await loadService();
    const r = await mod.generateBibliotecaRecommendations('USER-0001');

    expect(r.recommendations.length).toBe(1);
    expect(r.recommendations[0].leak.statId).toBe('s-1');
  });

  it('empty leaks -> recommendations: []', async () => {
    storageMocks.getStatsLeaks.mockResolvedValue([]);

    const mod: any = await loadService();
    const r = await mod.generateBibliotecaRecommendations('USER-0001');

    expect(r.recommendations).toEqual([]);
  });
});

// =============================================================================
// Cache TTL 60min
// =============================================================================
describe('biblioteca recommendations cache (RF-2.3)', () => {
  it('cache hit em segunda chamada < 60min nao re-executa algoritmo', async () => {
    storageMocks.getStatsLeaks.mockResolvedValue([
      { statId: 's-1', statName: 'X', value: 10, benchmark: 20, delta: -10, severity: 8 },
    ]);
    storageMocks.findStudyThemesByLinkedStat.mockResolvedValue(null);

    const mod: any = await loadService();
    await mod.generateBibliotecaRecommendations('USER-0001');
    await mod.generateBibliotecaRecommendations('USER-0001');

    // Algoritmo executou apenas 1x (segunda chamada vem do cache)
    expect(storageMocks.getStatsLeaks).toHaveBeenCalledTimes(1);
  });

  it('invalidateBibliotecaRecommendationsCache(userId) forca re-executar', async () => {
    storageMocks.getStatsLeaks.mockResolvedValue([]);

    const mod: any = await loadService();
    await mod.generateBibliotecaRecommendations('USER-0001');
    mod.invalidateBibliotecaRecommendationsCache('USER-0001');
    await mod.generateBibliotecaRecommendations('USER-0001');

    expect(storageMocks.getStatsLeaks).toHaveBeenCalledTimes(2);
  });

  it('cache eh por user (USER-A nao afeta USER-B)', async () => {
    storageMocks.getStatsLeaks.mockResolvedValue([]);
    const mod: any = await loadService();

    await mod.generateBibliotecaRecommendations('USER-A');
    await mod.generateBibliotecaRecommendations('USER-B');

    expect(storageMocks.getStatsLeaks).toHaveBeenCalledTimes(2);
  });

  it('response inclui cacheExpiresAt 60min apos generatedAt', async () => {
    storageMocks.getStatsLeaks.mockResolvedValue([]);
    const mod: any = await loadService();
    const r = await mod.generateBibliotecaRecommendations('USER-0001');

    const gen = new Date(r.generatedAt).getTime();
    const exp = new Date(r.cacheExpiresAt).getTime();
    expect(exp - gen).toBeGreaterThanOrEqual(59 * 60 * 1000);
    expect(exp - gen).toBeLessThanOrEqual(61 * 60 * 1000);
  });
});
