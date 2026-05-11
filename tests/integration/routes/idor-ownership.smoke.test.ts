/**
 * Launch Fase 2 — Wave 2: IDOR sweep regression tests.
 *
 * For each endpoint that mutates a resource by :id, verify:
 *   - the owning user can mutate it (2xx),
 *   - a *different* authenticated user gets 404 (not a silent cross-tenant write).
 *
 * Strategy: real Express + supertest, auth middleware mocked (the test user is
 * chosen per-request via the `x-test-user` header), `storage` mocked, and a small
 * chainable `db` stub for the handlers that touch Drizzle directly (study notes/
 * materials joins, notifications).
 *
 * Endpoints covered (audit 2026-05-11, P0 IDOR list):
 *   1. PUT/PATCH/DELETE /api/tournaments/:id
 *   2. PUT /api/planned-tournaments/:id
 *   3. PATCH/DELETE /api/study-cards/:id  (+ /:id/materials, /:id/notes sub-resources)
 *   4. DELETE /api/study-notes/:id  +  DELETE /api/study-materials/:id
 *   5. PUT/DELETE /api/calendar-categories/:id  +  PUT/DELETE /api/calendar-events/:id
 *   6. PUT /api/coaching-insights/:id
 *   7. POST /api/notifications/:id/mark-read
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const OWNER = 'USER-OWNER';
const ATTACKER = 'USER-ATTACKER';

// ---------------------------------------------------------------------------
// auth — test user comes from the `x-test-user` header (defaults to OWNER).
// ---------------------------------------------------------------------------
vi.mock('../../../server/auth', async () => {
  const actual = await vi.importActual<any>('../../../server/auth');
  return {
    ...actual,
    requireAuth: (req: Request, _res: Response, next: NextFunction) => {
      const platformId = (req.headers['x-test-user'] as string) || OWNER;
      (req as any).user = {
        id: platformId, // studies module uses req.user.id
        userPlatformId: platformId,
        subscriptionPlan: 'admin',
        permissions: [],
      };
      next();
    },
    requirePermission: () => (req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { id: OWNER, userPlatformId: OWNER, permissions: ['admin_full'] };
      next();
    },
  };
});

// ---------------------------------------------------------------------------
// chainable db stub — `db.select(...).from(...).innerJoin(...).where(...)` is a
// thenable resolving to a controllable row array; `db.delete(...).where(...)` and
// `db.update(...).set(...).where(...).returning(...)` resolve to controllable arrays.
// ---------------------------------------------------------------------------
const dbState = {
  selectRows: [] as any[],
  updateReturning: [] as any[],
};
function thenable(getRows: () => any[]) {
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    set: () => chain,
    values: () => chain,
    returning: () => thenable(() => dbState.updateReturning),
    then: (resolve: (v: any[]) => any) => resolve(getRows()),
  };
  return chain;
}
const dbMock = {
  select: () => thenable(() => dbState.selectRows),
  delete: () => thenable(() => []),
  update: () => thenable(() => []),
  insert: () => thenable(() => []),
};
vi.mock('../../../server/db', () => ({ db: dbMock, pool: {} }));

// ---------------------------------------------------------------------------
// storage mock
// ---------------------------------------------------------------------------
const storageMock = {
  // tournaments
  getTournament: vi.fn(),
  updateTournament: vi.fn(async (id: string, data: any) => ({ id, ...data })),
  deleteTournament: vi.fn(async () => undefined),
  // planned tournaments
  getPlannedTournament: vi.fn(),
  updatePlannedTournament: vi.fn(async (id: string, data: any) => ({ id, ...data })),
  deletePlannedTournament: vi.fn(async () => undefined),
  // study cards
  getStudyCard: vi.fn(),
  updateStudyCard: vi.fn(async (id: string, data: any) => ({ id, ...data })),
  deleteStudyCard: vi.fn(async () => undefined),
  getStudyMaterials: vi.fn(async () => []),
  createStudyMaterial: vi.fn(async (data: any) => ({ id: 'mat_new', ...data })),
  getStudyNotes: vi.fn(async () => []),
  createStudyNote: vi.fn(async (data: any) => ({ id: 'note_new', ...data })),
  // calendar
  getCalendarCategories: vi.fn(async () => []),
  updateCalendarCategory: vi.fn(async (id: string, data: any) => ({ id, ...data })),
  deleteCalendarCategory: vi.fn(async () => undefined),
  getCalendarEvents: vi.fn(async () => []),
  updateCalendarEvent: vi.fn(async (id: string, data: any) => ({ id, ...data })),
  deleteCalendarEvent: vi.fn(async () => undefined),
  updateRecurringEventSeries: vi.fn(async () => undefined),
  deleteRecurringEventSeries: vi.fn(async () => undefined),
  // coaching insights
  getCoachingInsight: vi.fn(),
  updateCoachingInsight: vi.fn(async (id: string, data: any) => ({ id, ...data })),
  // misc no-ops referenced by route modules during registration / unrelated handlers
  getUserSettings: vi.fn(async () => ({})),
};
vi.mock('../../../server/storage', () => ({ storage: storageMock, getSitePerformanceData: vi.fn() }));

// notification service uses the mocked `db` directly via markAsRead's update().returning()
import { storage } from '../../../server/storage';

async function buildApp() {
  const { registerTournamentRoutes } = await import('../../../server/routes/tournaments');
  const { registerGradePlannerRoutes } = await import('../../../server/routes/grade-planner');
  const { registerStudiesRoutes } = await import('../../../server/routes/studies');
  const { registerCalendarRoutes } = await import('../../../server/routes/calendar');
  const { registerMiscRoutes } = await import('../../../server/routes/misc');
  const { registerNotificationRoutes } = await import('../../../server/routes/notifications');
  const app = express();
  app.use(express.json());
  registerTournamentRoutes(app as any);
  registerGradePlannerRoutes(app as any);
  registerStudiesRoutes(app as any);
  registerCalendarRoutes(app as any);
  registerMiscRoutes(app as any);
  registerNotificationRoutes(app as any);
  return app;
}

const asOwner = (r: request.Test) => r.set('x-test-user', OWNER);
const asAttacker = (r: request.Test) => r.set('x-test-user', ATTACKER);

beforeEach(() => {
  vi.clearAllMocks();
  dbState.selectRows = [];
  dbState.updateReturning = [];
  storageMock.getUserSettings.mockResolvedValue({} as any);
});

describe('Wave 2 — IDOR ownership enforcement', () => {
  // -------------------------------------------------------------------------
  // 1. tournaments
  // -------------------------------------------------------------------------
  describe('PUT/PATCH/DELETE /api/tournaments/:id', () => {
    it('owner can update', async () => {
      storageMock.getTournament.mockResolvedValue({ id: 't1', userId: OWNER } as any);
      const app = await buildApp();
      const res = await asOwner(request(app).put('/api/tournaments/t1')).send({ name: 'x' });
      expect(res.status).toBe(200);
      expect(storageMock.updateTournament).toHaveBeenCalled();
    });
    it('attacker gets 404 and no write happens', async () => {
      storageMock.getTournament.mockResolvedValue({ id: 't1', userId: OWNER } as any);
      const app = await buildApp();
      const res = await asAttacker(request(app).patch('/api/tournaments/t1')).send({ name: 'pwn' });
      expect(res.status).toBe(404);
      expect(storageMock.updateTournament).not.toHaveBeenCalled();
    });
    it('attacker cannot delete someone else tournament', async () => {
      storageMock.getTournament.mockResolvedValue({ id: 't1', userId: OWNER } as any);
      const app = await buildApp();
      const res = await asAttacker(request(app).delete('/api/tournaments/t1'));
      expect(res.status).toBe(404);
      expect(storageMock.deleteTournament).not.toHaveBeenCalled();
    });
    it('caller-supplied userId in body is ignored', async () => {
      storageMock.getTournament.mockResolvedValue({ id: 't1', userId: OWNER } as any);
      const app = await buildApp();
      await asOwner(request(app).put('/api/tournaments/t1')).send({ name: 'x', userId: ATTACKER });
      const [, payload] = storageMock.updateTournament.mock.calls[0] as any[];
      expect(payload).not.toHaveProperty('userId');
    });
  });

  // -------------------------------------------------------------------------
  // 2. planned tournaments
  // -------------------------------------------------------------------------
  describe('PUT /api/planned-tournaments/:id', () => {
    it('owner can update', async () => {
      storageMock.getPlannedTournament.mockResolvedValue({ id: 'p1', userId: OWNER } as any);
      const app = await buildApp();
      const res = await asOwner(request(app).put('/api/planned-tournaments/p1')).send({ name: 'x' });
      expect(res.status).toBe(200);
      expect(storageMock.updatePlannedTournament).toHaveBeenCalled();
    });
    it('attacker gets 404, no write', async () => {
      storageMock.getPlannedTournament.mockResolvedValue({ id: 'p1', userId: OWNER } as any);
      const app = await buildApp();
      const res = await asAttacker(request(app).put('/api/planned-tournaments/p1')).send({ name: 'pwn' });
      expect(res.status).toBe(404);
      expect(storageMock.updatePlannedTournament).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. study cards (+ sub-resources)
  // -------------------------------------------------------------------------
  describe('PATCH/DELETE /api/study-cards/:id', () => {
    it('owner can patch (getStudyCard returns the owned row)', async () => {
      storageMock.getStudyCard.mockResolvedValue({ id: 'c1', userId: OWNER } as any);
      const app = await buildApp();
      const res = await asOwner(request(app).patch('/api/study-cards/c1')).send({ title: 'x' });
      expect(res.status).toBe(200);
      expect(storageMock.updateStudyCard).toHaveBeenCalled();
    });
    it('attacker gets 404 (getStudyCard scoped by userId returns nothing)', async () => {
      // getStudyCard(id, userId) is scoped — for the attacker it returns undefined.
      storageMock.getStudyCard.mockImplementation(async (_id: string, uid: string) =>
        uid === OWNER ? ({ id: 'c1', userId: OWNER } as any) : undefined);
      const app = await buildApp();
      const res = await asAttacker(request(app).delete('/api/study-cards/c1'));
      expect(res.status).toBe(404);
      expect(storageMock.deleteStudyCard).not.toHaveBeenCalled();
    });
    it('GET /:id/materials 404s when card not owned', async () => {
      storageMock.getStudyCard.mockImplementation(async (_id: string, uid: string) =>
        uid === OWNER ? ({ id: 'c1', userId: OWNER } as any) : undefined);
      const app = await buildApp();
      const res = await asAttacker(request(app).get('/api/study-cards/c1/materials'));
      expect(res.status).toBe(404);
      expect(storageMock.getStudyMaterials).not.toHaveBeenCalled();
    });
    it('POST /:id/notes 404s when card not owned', async () => {
      storageMock.getStudyCard.mockImplementation(async (_id: string, uid: string) =>
        uid === OWNER ? ({ id: 'c1', userId: OWNER } as any) : undefined);
      const app = await buildApp();
      const res = await asAttacker(request(app).post('/api/study-cards/c1/notes')).send({ content: 'pwn' });
      expect(res.status).toBe(404);
      expect(storageMock.createStudyNote).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. study notes / materials DELETE (joins through study_cards via db mock)
  // -------------------------------------------------------------------------
  describe('DELETE /api/study-notes/:id & /api/study-materials/:id', () => {
    it('owner can delete a note (join finds the row)', async () => {
      dbState.selectRows = [{ id: 'n1' }]; // join returns a row -> owned
      const app = await buildApp();
      const res = await asOwner(request(app).delete('/api/study-notes/n1'));
      expect(res.status).toBe(200);
    });
    it('attacker gets 404 when join finds nothing', async () => {
      dbState.selectRows = []; // join returns no row -> not owned / not found
      const app = await buildApp();
      const res = await asAttacker(request(app).delete('/api/study-materials/m1'));
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // 5. calendar categories / events
  // -------------------------------------------------------------------------
  describe('PUT/DELETE /api/calendar-categories/:id', () => {
    it('owner can update (category in their list)', async () => {
      storageMock.getCalendarCategories.mockResolvedValue([{ id: 'cat1' }] as any);
      const app = await buildApp();
      const res = await asOwner(request(app).put('/api/calendar-categories/cat1')).send({ name: 'x' });
      expect(res.status).toBe(200);
      expect(storageMock.updateCalendarCategory).toHaveBeenCalled();
    });
    it('attacker gets 404 (category not in their list)', async () => {
      storageMock.getCalendarCategories.mockResolvedValue([] as any);
      const app = await buildApp();
      const res = await asAttacker(request(app).delete('/api/calendar-categories/cat1'));
      expect(res.status).toBe(404);
      expect(storageMock.deleteCalendarCategory).not.toHaveBeenCalled();
    });
  });
  describe('PUT/DELETE /api/calendar-events/:id', () => {
    it('owner can update single event', async () => {
      storageMock.getCalendarEvents.mockResolvedValue([{ id: 'ev1', parentEventId: null }] as any);
      const app = await buildApp();
      const res = await asOwner(request(app).put('/api/calendar-events/ev1')).send({ title: 'x' });
      expect(res.status).toBe(200);
      expect(storageMock.updateCalendarEvent).toHaveBeenCalled();
    });
    it('attacker gets 404 and no delete', async () => {
      storageMock.getCalendarEvents.mockResolvedValue([] as any);
      const app = await buildApp();
      const res = await asAttacker(request(app).delete('/api/calendar-events/ev1'));
      expect(res.status).toBe(404);
      expect(storageMock.deleteCalendarEvent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 6. coaching insights
  // -------------------------------------------------------------------------
  describe('PUT /api/coaching-insights/:id', () => {
    it('owner can update', async () => {
      storageMock.getCoachingInsight.mockResolvedValue({ id: 'i1', userId: OWNER } as any);
      const app = await buildApp();
      const res = await asOwner(request(app).put('/api/coaching-insights/i1')).send({ title: 'x' });
      expect(res.status).toBe(200);
      expect(storageMock.updateCoachingInsight).toHaveBeenCalled();
    });
    it('attacker gets 404, no write', async () => {
      storageMock.getCoachingInsight.mockResolvedValue({ id: 'i1', userId: OWNER } as any);
      const app = await buildApp();
      const res = await asAttacker(request(app).put('/api/coaching-insights/i1')).send({ title: 'pwn' });
      expect(res.status).toBe(404);
      expect(storageMock.updateCoachingInsight).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 7. notifications mark-read
  // -------------------------------------------------------------------------
  describe('POST /api/notifications/:id/mark-read', () => {
    it('owner mark-read succeeds (update.returning yields a row)', async () => {
      dbState.updateReturning = [{ id: 'notif1' }];
      const app = await buildApp();
      const res = await asOwner(request(app).post('/api/notifications/notif1/mark-read')).send({});
      expect(res.status).toBe(200);
    });
    it('attacker gets 404 (scoped update touched no row)', async () => {
      dbState.updateReturning = [];
      const app = await buildApp();
      const res = await asAttacker(request(app).post('/api/notifications/notif1/mark-read')).send({});
      expect(res.status).toBe(404);
    });
  });
});
