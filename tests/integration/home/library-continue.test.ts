/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1-5 — RF-28 (B2 endpoint /api/library/continue).
 *
 * Spec : Docs/specs/home-reform-1-5.md §RF-28, §11.2, §RNF-1.5-1
 *
 * Status RED: handler `handleLibraryContinue` NAO existe ainda.
 * Modulo esperado: server/routes/library-continue.ts (D1.5-12).
 *
 * Lessons aplicadas:
 *   #3   shape REAL — mocks refletem retorno de storage.ts
 *   #5   vi.fn() OK aqui (sem `new` envolvido)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — storage helpers consumidos pelo handler
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getContinueWatching: vi.fn(),
    getLibraryEntitlement: vi.fn(),
    hasLibraryAccess: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    headers: {} as Record<string, string>,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  res.setHeader = (key: string, value: string) => {
    res.headers[key.toLowerCase()] = value;
    return res;
  };
  res.set = res.setHeader;
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: user has access
  (storage.hasLibraryAccess as any).mockResolvedValue(true);
  (storage.getContinueWatching as any).mockResolvedValue([]);
});

// =============================================================================
// Auth — RF-28
// =============================================================================

describe('GET /api/library/continue — auth', () => {
  it('rejeita request sem userPlatformId (401)', async () => {
    const { handleLibraryContinue } = await import('../../../server/routes/library-continue');
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await handleLibraryContinue(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('aceita request autenticado (200)', async () => {
    const { handleLibraryContinue } = await import('../../../server/routes/library-continue');
    const req = makeReq();
    const res = makeRes();
    await handleLibraryContinue(req, res);
    expect(res.statusCode).toBe(200);
  });
});

// =============================================================================
// Entitlement check — RF-28 / RNF-1.5-8
// =============================================================================

describe('GET /api/library/continue — entitlement', () => {
  it('user sem entitlement => { items: [], hasAccess: false }', async () => {
    (storage.hasLibraryAccess as any).mockResolvedValue(false);
    const { handleLibraryContinue } = await import('../../../server/routes/library-continue');
    const req = makeReq();
    const res = makeRes();
    await handleLibraryContinue(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.hasAccess).toBe(false);
    expect(res.body.items).toEqual([]);
  });

  it('user com entitlement mas sem lessons em progresso => { items: [], hasAccess: true }', async () => {
    (storage.hasLibraryAccess as any).mockResolvedValue(true);
    (storage.getContinueWatching as any).mockResolvedValue([]);
    const { handleLibraryContinue } = await import('../../../server/routes/library-continue');
    const req = makeReq();
    const res = makeRes();
    await handleLibraryContinue(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.hasAccess).toBe(true);
    expect(res.body.items).toEqual([]);
  });
});

// =============================================================================
// Limit + ordem por updatedAt DESC
// =============================================================================

describe('GET /api/library/continue — limit & ordering', () => {
  it('limit=3 (default) retorna ate 3 lessons', async () => {
    const five = Array.from({ length: 5 }).map((_, i) => ({
      lessonId: `L${i + 1}`,
      lessonTitle: `Lesson ${i + 1}`,
      courseTitle: 'Course',
      moduleTitle: 'Module',
      coverImageUrl: null,
      format: 'video',
      lastPositionSeconds: 60,
      totalDurationSeconds: 600,
      progressPct: 10,
      remainingSeconds: 540,
      updatedAt: new Date(Date.now() - i * 60_000).toISOString(),
    }));
    // Backend pode filtrar; aqui o mock ja retorna so 3 (storage applies LIMIT)
    (storage.getContinueWatching as any).mockResolvedValue(five.slice(0, 3));
    const { handleLibraryContinue } = await import('../../../server/routes/library-continue');
    const req = makeReq();
    const res = makeRes();
    await handleLibraryContinue(req, res);
    expect(res.body.items.length).toBeLessThanOrEqual(3);
  });

  it('?limit=5 retorna ate 5 lessons', async () => {
    const five = Array.from({ length: 5 }).map((_, i) => ({
      lessonId: `L${i + 1}`,
      lessonTitle: `Lesson ${i + 1}`,
      courseTitle: 'Course',
      moduleTitle: 'Module',
      coverImageUrl: null,
      format: 'video',
      lastPositionSeconds: 60,
      totalDurationSeconds: 600,
      progressPct: 10,
      remainingSeconds: 540,
      updatedAt: new Date(Date.now() - i * 60_000).toISOString(),
    }));
    (storage.getContinueWatching as any).mockResolvedValue(five);
    const { handleLibraryContinue } = await import('../../../server/routes/library-continue');
    const req = makeReq({ query: { limit: '5' } });
    const res = makeRes();
    await handleLibraryContinue(req, res);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
  });

  it('limit invalido (>10 ou negativo) => clamp/erro 400 (Zod) ou cap em 10', async () => {
    const { handleLibraryContinue } = await import('../../../server/routes/library-continue');
    const req = makeReq({ query: { limit: '999' } });
    const res = makeRes();
    await handleLibraryContinue(req, res);
    // Aceita 200 com cap interno OU 400 (validacao Zod)
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200 && Array.isArray(res.body.items)) {
      expect(res.body.items.length).toBeLessThanOrEqual(10);
    }
  });
});

// =============================================================================
// Schema da resposta — RF-28
// =============================================================================

describe('GET /api/library/continue — response shape', () => {
  it('inclui items array + hasAccess boolean', async () => {
    const { handleLibraryContinue } = await import('../../../server/routes/library-continue');
    const req = makeReq();
    const res = makeRes();
    await handleLibraryContinue(req, res);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('hasAccess');
    expect(typeof res.body.hasAccess).toBe('boolean');
  });

  it('cada item tem lessonId, lessonTitle, format, lastPositionSeconds, progressPct', async () => {
    (storage.getContinueWatching as any).mockResolvedValue([
      {
        lessonId: 'L1',
        lessonTitle: 'GTO 3',
        courseTitle: 'GTO',
        moduleTitle: 'Mod 3',
        coverImageUrl: null,
        format: 'video',
        lastPositionSeconds: 600,
        totalDurationSeconds: 1000,
        progressPct: 60,
        remainingSeconds: 400,
        updatedAt: '2026-05-02T10:00:00Z',
      },
    ]);
    const { handleLibraryContinue } = await import('../../../server/routes/library-continue');
    const req = makeReq();
    const res = makeRes();
    await handleLibraryContinue(req, res);
    expect(res.body.items.length).toBe(1);
    const item = res.body.items[0];
    expect(item).toHaveProperty('lessonId');
    expect(item).toHaveProperty('lessonTitle');
    expect(item).toHaveProperty('format');
    expect(item).toHaveProperty('lastPositionSeconds');
    expect(item).toHaveProperty('progressPct');
  });
});

// =============================================================================
// Cache header — RF-28 / D1.5-12
// =============================================================================

describe('GET /api/library/continue — Cache-Control', () => {
  it('seta Cache-Control: private, max-age=60', async () => {
    const { handleLibraryContinue } = await import('../../../server/routes/library-continue');
    const req = makeReq();
    const res = makeRes();
    await handleLibraryContinue(req, res);
    const header = res.headers['cache-control'];
    expect(header).toBeDefined();
    expect(String(header)).toMatch(/private/i);
    expect(String(header)).toMatch(/max-age=60/);
  });
});
