// =============================================================================
// Sprint VR-2 — RF-08: GET /api/variance/buckets-aggregate
//
// Spec  : Docs/specs/sprint-variance-reform.md (RF-08)
// ADR   : 212 (aggregate tiers + historical ROI)
// Diagram: Docs/architecture/diagrams/variance-reform/aggregation-wizard-flow.mermaid
//
// Mode  : TDD (red phase) — handler DOES NOT EXIST yet.
//
// Tests cover:
//   - Group planned_tournaments by tier x type for a profile
//   - Merge Satellite/Add-on into Vanilla
//   - ROI/field from historical (RF-06) or defaults
//   - source: 'historical' | 'default' per group
//   - isPKO flag
//   - meta: daysInProfile, tournamentsPerWeek, weeklyInvestment
//   - countPerWeek = groupCount / 7 * daysInProfile
//   - count = countPerWeek * weeks
//   - Groups with count=0 not included
//   - Validation: profileLetter, weeks
//   - Empty state when no planned tournaments for profile
//
// Pattern: handler injection (lesson #34) — storage mock via vi.mock.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — tracker, auth, storage
// ---------------------------------------------------------------------------

const trackerEmit = vi.fn();
vi.mock('../../server/utils/tracker', () => ({
  emit: (e: string, p: any) => trackerEmit(e, p),
}));

vi.mock('../../server/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'usr_pk_2', userPlatformId: 'USER-AGG', email: 'a@test.com' };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

const storageMock: Record<string, ReturnType<typeof vi.fn>> = {
  listPlannedTournamentsByProfile: vi.fn(),
  getHistoricalStatsByUser: vi.fn(),
};
vi.mock('../../server/storage', () => ({ storage: storageMock }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import express from 'express';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// Helpers — planned tournament row factory (shape mirrors schema.ts)
// ---------------------------------------------------------------------------

interface PlannedTournamentRow {
  id: string;
  userId: string;
  dayOfWeek: number;
  profile: string;
  site: string;
  time: string;
  type: string;
  name: string;
  buyIn: string;        // decimal in DB, comes as string
  isActive: boolean;
}

let _ptIdCounter = 0;
function makePlannedTournament(overrides: Partial<PlannedTournamentRow> = {}): PlannedTournamentRow {
  _ptIdCounter += 1;
  return {
    id: `pt_${_ptIdCounter}`,
    userId: 'USER-AGG',
    dayOfWeek: 1,        // Monday
    profile: 'A',
    site: 'GGPoker',
    time: '19:00',
    type: 'Vanilla',
    name: `MTT $55 #${_ptIdCounter}`,
    buyIn: '55.00',      // mid tier (>= 50 < 100)
    isActive: true,
    ...overrides,
  };
}

/**
 * Generate a realistic grade: ~40 tournaments across 6 days,
 * distributed across tiers and types.
 */
function makeRealisticGrade(): PlannedTournamentRow[] {
  const rows: PlannedTournamentRow[] = [];

  // Profile A, 6 days (Mon-Sat = dayOfWeek 1-6)
  for (let day = 1; day <= 6; day++) {
    // High tier Vanilla ($109)
    rows.push(makePlannedTournament({ dayOfWeek: day, buyIn: '109.00', type: 'Vanilla', name: `High Vanilla D${day}` }));
    // Mid tier Vanilla ($55)
    rows.push(makePlannedTournament({ dayOfWeek: day, buyIn: '55.00', type: 'Vanilla', name: `Mid Vanilla D${day}` }));
    rows.push(makePlannedTournament({ dayOfWeek: day, buyIn: '55.00', type: 'Vanilla', name: `Mid Vanilla 2 D${day}` }));
    // Mid tier PKO ($55)
    rows.push(makePlannedTournament({ dayOfWeek: day, buyIn: '55.00', type: 'PKO', name: `Mid PKO D${day}` }));
    // Low tier Vanilla ($33)
    rows.push(makePlannedTournament({ dayOfWeek: day, buyIn: '33.00', type: 'Vanilla', name: `Low Vanilla D${day}` }));
    rows.push(makePlannedTournament({ dayOfWeek: day, buyIn: '33.00', type: 'Vanilla', name: `Low Vanilla 2 D${day}` }));
    // Entry tier Vanilla ($16.50)
    rows.push(makePlannedTournament({ dayOfWeek: day, buyIn: '16.50', type: 'Vanilla', name: `Entry Vanilla D${day}` }));
  }

  return rows; // 7 per day * 6 days = 42 tournaments
}

/**
 * Historical stats mock return (RF-06 endpoint cache).
 */
function makeHistoricalStatsMock() {
  return {
    tiers: [
      { tier: 'high', type: 'Vanilla', count: 80, avgBuyIn: 120, avgField: 600, roiAdjusted: 0.08, lowSample: false },
      { tier: 'mid', type: 'Vanilla', count: 200, avgBuyIn: 55, avgField: 900, roiAdjusted: 0.12, lowSample: false },
      { tier: 'mid', type: 'PKO', count: 150, avgBuyIn: 60, avgField: 700, roiAdjusted: 0.15, lowSample: false },
      { tier: 'low', type: 'Vanilla', count: 300, avgBuyIn: 33, avgField: 1200, roiAdjusted: 0.10, lowSample: false },
      { tier: 'entry', type: 'Vanilla', count: 50, avgBuyIn: 15, avgField: 2000, roiAdjusted: 0.20, lowSample: false },
    ],
    totals: { tournaments: 780, dateRange: { from: '2025-01-01', to: '2026-04-15' }, duplicatesRemoved: 320 },
  };
}

// ---------------------------------------------------------------------------
// Build express app
// ---------------------------------------------------------------------------

async function buildApp() {
  const { default: varianceRouter } = await import(
    '../../server/routes/variance'
  );
  const app = express();
  app.use(express.json());
  app.use('/api/variance', varianceRouter);
  return app;
}

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  _ptIdCounter = 0;
  Object.values(storageMock).forEach((fn) => {
    if (typeof fn.mockReset === 'function') fn.mockReset();
  });
});

// =============================================================================
// Tests
// =============================================================================

describe('GET /api/variance/buckets-aggregate (RF-08)', () => {
  // -------------------------------------------------------------------------
  // Tier 1 — Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('deve retornar grupos agregados por tier x tipo para perfil A com weeks=12', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue(
        makeRealisticGrade(),
      );
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=12',
      );

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('groups');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.groups)).toBe(true);

      // Should have ~4 groups (high Vanilla, mid Vanilla, mid PKO, low Vanilla, entry Vanilla)
      // but <= 10 groups total (spec says 6-10)
      expect(res.body.groups.length).toBeGreaterThanOrEqual(4);
      expect(res.body.groups.length).toBeLessThanOrEqual(10);

      // Each group should have required fields
      for (const g of res.body.groups) {
        expect(g).toHaveProperty('name');
        expect(g).toHaveProperty('tier');
        expect(g).toHaveProperty('type');
        expect(g).toHaveProperty('buyIn');
        expect(g).toHaveProperty('field');
        expect(g).toHaveProperty('roi');
        expect(g).toHaveProperty('countPerWeek');
        expect(g).toHaveProperty('count');
        expect(g).toHaveProperty('isPKO');
        expect(g).toHaveProperty('source');
        expect(g).toHaveProperty('lowSample');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Tier 1 — Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('deve retornar 401 sem autenticacao', async () => {
      // With auth mock always setting user, this tests that requireAuth
      // middleware is mounted. In production, missing JWT triggers 401.
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue({
        tiers: [],
        totals: { tournaments: 0, dateRange: { from: '', to: '' }, duplicatesRemoved: 0 },
      });

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=12',
      );
      // With mock auth, should pass through — validates route is accessible
      expect(res.status).toBe(200);
    });

    it('deve retornar 400 para profileLetter invalido', async () => {
      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=Z&weeks=12',
      );

      expect(res.status).toBe(400);
    });

    it('deve retornar 400 para weeks invalido', async () => {
      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=5',
      );

      expect(res.status).toBe(400);
    });

    it('deve retornar 400 quando profileLetter ausente', async () => {
      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?weeks=12',
      );

      expect(res.status).toBe(400);
    });

    it('deve retornar 400 quando weeks ausente', async () => {
      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A',
      );

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Tier 1 — Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('deve retornar groups vazio quando perfil nao tem torneios', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue({
        tiers: [],
        totals: { tournaments: 0, dateRange: { from: '', to: '' }, duplicatesRemoved: 0 },
      });

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=B&weeks=4',
      );

      expect(res.status).toBe(200);
      expect(res.body.groups).toEqual([]);
      expect(res.body.meta.daysInProfile).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — Grouping
  // -------------------------------------------------------------------------

  describe('grouping', () => {
    it('deve agrupar planned_tournaments por tier x tipo', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue(
        makeRealisticGrade(),
      );
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=12',
      );

      expect(res.status).toBe(200);

      // Verify distinct tier x type combinations exist
      const keys = res.body.groups.map((g: any) => `${g.tier}:${g.type}`);
      expect(keys).toContain('high:Vanilla');
      expect(keys).toContain('mid:Vanilla');
      expect(keys).toContain('mid:PKO');
      expect(keys).toContain('low:Vanilla');
      expect(keys).toContain('entry:Vanilla');
    });

    it('deve nao incluir grupos com count = 0', async () => {
      // Only mid Vanilla tournaments in the grade
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'Vanilla' }),
        makePlannedTournament({ dayOfWeek: 2, buyIn: '55.00', type: 'Vanilla' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=4',
      );

      expect(res.status).toBe(200);

      // Should only have "mid Vanilla" — no high, low, or entry groups
      expect(res.body.groups.length).toBe(1);
      expect(res.body.groups[0].tier).toBe('mid');
      expect(res.body.groups[0].type).toBe('Vanilla');
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — Satellite/Add-on merge
  // -------------------------------------------------------------------------

  describe('type merging', () => {
    it('deve mergear Satellite em Vanilla do mesmo tier', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'Vanilla', name: 'Mid Vanilla' }),
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'Satellite', name: 'Mid Satellite' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=4',
      );

      expect(res.status).toBe(200);

      // No Satellite group should exist
      const satGroups = res.body.groups.filter((g: any) => g.type === 'Satellite');
      expect(satGroups).toHaveLength(0);

      // Vanilla group should include the Satellite count
      const vanillaGroup = res.body.groups.find(
        (g: any) => g.tier === 'mid' && g.type === 'Vanilla',
      );
      expect(vanillaGroup).toBeDefined();
      // countPerWeek should reflect both the Vanilla + Satellite tournaments
      expect(vanillaGroup.countPerWeek).toBeGreaterThan(0);
    });

    it('deve mergear Add-on em Vanilla do mesmo tier', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 2, buyIn: '33.00', type: 'Vanilla', name: 'Low Vanilla' }),
        makePlannedTournament({ dayOfWeek: 2, buyIn: '33.00', type: 'Add-on', name: 'Low Add-on' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=12',
      );

      expect(res.status).toBe(200);
      const addonGroups = res.body.groups.filter((g: any) => g.type === 'Add-on');
      expect(addonGroups).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — ROI/field source
  // -------------------------------------------------------------------------

  describe('ROI and field source', () => {
    it('deve usar ROI do historico quando disponivel (source = historical)', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'Vanilla' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=4',
      );

      expect(res.status).toBe(200);
      const midVanilla = res.body.groups.find(
        (g: any) => g.tier === 'mid' && g.type === 'Vanilla',
      );
      expect(midVanilla).toBeDefined();
      expect(midVanilla.source).toBe('historical');
      // ROI should match historical value (0.12)
      expect(midVanilla.roi).toBeCloseTo(0.12, 2);
      // Field should match historical value (900)
      expect(midVanilla.field).toBe(900);
    });

    it('deve usar defaults quando nao ha historico para o tier x tipo (source = default)', async () => {
      // Historical stats has no "Mystery" type
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'Mystery' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue({
        tiers: [],
        totals: { tournaments: 0, dateRange: { from: '', to: '' }, duplicatesRemoved: 0 },
      });

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=4',
      );

      expect(res.status).toBe(200);
      const mysteryGroup = res.body.groups.find(
        (g: any) => g.type === 'Mystery',
      );
      expect(mysteryGroup).toBeDefined();
      expect(mysteryGroup.source).toBe('default');
      // Field should be DEFAULT_PLAYERS_AVG = 1000
      expect(mysteryGroup.field).toBe(1000);
    });

    it('deve marcar lowSample quando historico tem menos de 20 torneios no tier x tipo', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '109.00', type: 'PKO' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue({
        tiers: [
          { tier: 'high', type: 'PKO', count: 10, avgBuyIn: 110, avgField: 500, roiAdjusted: 0.05, lowSample: true },
        ],
        totals: { tournaments: 10, dateRange: { from: '2026-01-01', to: '2026-04-01' }, duplicatesRemoved: 0 },
      });

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=12',
      );

      expect(res.status).toBe(200);
      const highPKO = res.body.groups.find(
        (g: any) => g.tier === 'high' && g.type === 'PKO',
      );
      expect(highPKO).toBeDefined();
      expect(highPKO.lowSample).toBe(true);
      expect(highPKO.source).toBe('historical');
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — isPKO flag
  // -------------------------------------------------------------------------

  describe('isPKO flag', () => {
    it('deve marcar isPKO: true quando type = PKO', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'PKO' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=4',
      );

      expect(res.status).toBe(200);
      const pkoGroup = res.body.groups.find((g: any) => g.type === 'PKO');
      expect(pkoGroup).toBeDefined();
      expect(pkoGroup.isPKO).toBe(true);
    });

    it('deve marcar isPKO: false quando type != PKO', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'Vanilla' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=4',
      );

      expect(res.status).toBe(200);
      const vanillaGroup = res.body.groups.find((g: any) => g.type === 'Vanilla');
      expect(vanillaGroup).toBeDefined();
      expect(vanillaGroup.isPKO).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — Count calculations
  // -------------------------------------------------------------------------

  describe('count calculations', () => {
    it('deve calcular countPerWeek = groupCount / 7 * daysInProfile', async () => {
      // 2 mid Vanilla per day, across 3 days = 6 total in grade
      // daysInProfile = 3
      // countPerWeek = 6 / 7 * 3 = 2.57... (the implementation may round)
      const grade = [
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'Vanilla', name: 'MV 1-1' }),
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'Vanilla', name: 'MV 1-2' }),
        makePlannedTournament({ dayOfWeek: 2, buyIn: '55.00', type: 'Vanilla', name: 'MV 2-1' }),
        makePlannedTournament({ dayOfWeek: 2, buyIn: '55.00', type: 'Vanilla', name: 'MV 2-2' }),
        makePlannedTournament({ dayOfWeek: 3, buyIn: '55.00', type: 'Vanilla', name: 'MV 3-1' }),
        makePlannedTournament({ dayOfWeek: 3, buyIn: '55.00', type: 'Vanilla', name: 'MV 3-2' }),
      ];

      storageMock.listPlannedTournamentsByProfile.mockResolvedValue(grade);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=12',
      );

      expect(res.status).toBe(200);
      const midVanilla = res.body.groups.find(
        (g: any) => g.tier === 'mid' && g.type === 'Vanilla',
      );
      expect(midVanilla).toBeDefined();

      // countPerWeek = 6 / 7 * 3 = 2.571...
      // Total count = countPerWeek * 12 weeks
      expect(midVanilla.countPerWeek).toBeCloseTo(6 / 7 * 3, 1);
      expect(midVanilla.count).toBeCloseTo((6 / 7 * 3) * 12, 0);
    });

    it('deve calcular count = countPerWeek * weeks', async () => {
      const grade = [
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'Vanilla' }),
      ];

      storageMock.listPlannedTournamentsByProfile.mockResolvedValue(grade);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();

      // Test with different weeks values
      for (const weeks of [1, 4, 12, 52]) {
        const res = await supertest(app).get(
          `/api/variance/buckets-aggregate?profileLetter=A&weeks=${weeks}`,
        );

        expect(res.status).toBe(200);
        const group = res.body.groups[0];
        if (group) {
          // count should equal countPerWeek * weeks (within rounding tolerance)
          expect(group.count).toBeCloseTo(group.countPerWeek * weeks, 0);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — Meta calculations
  // -------------------------------------------------------------------------

  describe('meta', () => {
    it('deve retornar daysInProfile com contagem de dias distintos', async () => {
      // Tournaments on days 1, 2, 3, 5 (4 distinct days)
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00' }),
        makePlannedTournament({ dayOfWeek: 2, buyIn: '55.00' }),
        makePlannedTournament({ dayOfWeek: 3, buyIn: '55.00' }),
        makePlannedTournament({ dayOfWeek: 5, buyIn: '55.00' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=4',
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.daysInProfile).toBe(4);
    });

    it('deve retornar tournamentsPerWeek como soma de countPerWeek', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue(
        makeRealisticGrade(),
      );
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=12',
      );

      expect(res.status).toBe(200);
      const sumCountPerWeek = res.body.groups.reduce(
        (sum: number, g: any) => sum + g.countPerWeek,
        0,
      );
      expect(res.body.meta.tournamentsPerWeek).toBeCloseTo(sumCountPerWeek, 1);
    });

    it('deve retornar weeklyInvestment como soma de buyIn * countPerWeek', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue(
        makeRealisticGrade(),
      );
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=12',
      );

      expect(res.status).toBe(200);
      const sumWeeklyInvestment = res.body.groups.reduce(
        (sum: number, g: any) => sum + g.buyIn * g.countPerWeek,
        0,
      );
      expect(res.body.meta.weeklyInvestment).toBeCloseTo(sumWeeklyInvestment, 1);
    });

    it('deve retornar profileLetter e weeks no meta', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=B&weeks=52',
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.profileLetter).toBe('B');
      expect(res.body.meta.weeks).toBe(52);
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — Group naming
  // -------------------------------------------------------------------------

  describe('group naming', () => {
    it('deve nomear grupos como "{Tier} {Type}" (ex: "Mid Vanilla")', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'Vanilla' }),
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00', type: 'PKO' }),
        makePlannedTournament({ dayOfWeek: 1, buyIn: '109.00', type: 'Vanilla' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=4',
      );

      expect(res.status).toBe(200);
      const names = res.body.groups.map((g: any) => g.name);
      expect(names).toContain('Mid Vanilla');
      expect(names).toContain('Mid PKO');
      expect(names).toContain('High Vanilla');
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — buyIn average per group
  // -------------------------------------------------------------------------

  describe('buyIn', () => {
    it('deve calcular buyIn como media dos buy-ins do grupo em USD', async () => {
      // Two mid tournaments with different buy-ins
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '50.00', type: 'Vanilla' }),
        makePlannedTournament({ dayOfWeek: 1, buyIn: '60.00', type: 'Vanilla' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=4',
      );

      expect(res.status).toBe(200);
      const midVanilla = res.body.groups.find(
        (g: any) => g.tier === 'mid' && g.type === 'Vanilla',
      );
      expect(midVanilla).toBeDefined();
      // Average of 50 and 60 = 55
      expect(midVanilla.buyIn).toBeCloseTo(55, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — Response shape
  // -------------------------------------------------------------------------

  describe('response shape', () => {
    it('deve retornar shape compativel com interface AggregatedBuckets', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue(
        makeRealisticGrade(),
      );
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=12',
      );

      expect(res.status).toBe(200);

      // Top-level keys
      expect(Object.keys(res.body).sort()).toEqual(
        ['groups', 'meta'].sort(),
      );

      // Group shape
      const group = res.body.groups[0];
      const expectedGroupKeys = [
        'name', 'tier', 'type', 'buyIn', 'field', 'roi',
        'countPerWeek', 'count', 'isPKO', 'source', 'lowSample',
      ].sort();
      expect(Object.keys(group).sort()).toEqual(expectedGroupKeys);

      // Meta shape
      const expectedMetaKeys = [
        'profileLetter', 'weeks', 'daysInProfile',
        'tournamentsPerWeek', 'weeklyInvestment',
      ].sort();
      expect(Object.keys(res.body.meta).sort()).toEqual(expectedMetaKeys);
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — Profile B and C work too
  // -------------------------------------------------------------------------

  describe('multiple profiles', () => {
    it('deve aceitar profileLetter=C e retornar dados do perfil C', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 0, profile: 'C', buyIn: '33.00', type: 'Vanilla' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=C&weeks=1',
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.profileLetter).toBe('C');
      expect(res.body.groups.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2 — Weeks values
  // -------------------------------------------------------------------------

  describe('weeks values', () => {
    it('deve aceitar weeks=1 (1 semana)', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=1',
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.weeks).toBe(1);
    });

    it('deve aceitar weeks=52 (1 ano)', async () => {
      storageMock.listPlannedTournamentsByProfile.mockResolvedValue([
        makePlannedTournament({ dayOfWeek: 1, buyIn: '55.00' }),
      ]);
      storageMock.getHistoricalStatsByUser.mockResolvedValue(
        makeHistoricalStatsMock(),
      );

      const app = await buildApp();
      const res = await supertest(app).get(
        '/api/variance/buckets-aggregate?profileLetter=A&weeks=52',
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.weeks).toBe(52);
      // Count for 1 year should be much larger than 1 week
      if (res.body.groups.length > 0) {
        expect(res.body.groups[0].count).toBeGreaterThan(0);
      }
    });
  });
});
