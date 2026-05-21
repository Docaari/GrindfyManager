/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint D / Grind Live + Tickets cluster
 *   RF-03.3 Coach AI context block `buildTicketsContext`
 *
 * Spec: Docs/specs/sprint-grind-live-cluster.md §RF-03.3
 * ADR:  Docs/architecture/decisions/185-tickets-coach-context-block-keyword-triggered.md
 *
 * Cenarios cobertos:
 *   1) 0 tickets ativos -> `buildTicketsContext` retorna `null` (early return,
 *      lesson #11) — independente de gate keyword/surface.
 *   2) `shouldInject` por keyword (case-insensitive): `ticket`, `satelite`,
 *      `grade`, `selecionar torneio` (4 keywords da spec, ADR-185 §2.5).
 *   3) `shouldInject` por keyword com normalizacao NFKD — `satélite` casa
 *      `satelite` (acento removido).
 *   4) `shouldInject` por surface — `tournament-selector` e `grade-planner`
 *      auto-triggam mesmo sem keyword.
 *   5) Sem keyword + sem surface relevante -> retorna `null` (mesmo com
 *      tickets ativos).
 *   6) Format do bloco — total + top-3 sort por `expiresAt` ASC (NULLs por
 *      ultimo).
 *   7) Mais de 3 tickets — limita top-3.
 *   8) Sem `storage.getActiveTicketsByUser` (modulo nao expoe) -> retorna
 *      `null` (defensive).
 *
 * Lessons aplicadas:
 *   - #11 default minimo (nao injeta bloco vazio).
 *   - #36 storage mock parcial sem importar `@shared/schema`.
 *   - #28 vi.mock por path exato (`../../server/storage`).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

afterEach(() => {
  vi.resetModules();
});

function mockStorage(tickets: any[] | null) {
  vi.doMock('../../server/storage', () => ({
    storage: {
      getActiveTicketsByUser: tickets === null
        ? undefined
        : vi.fn(async () => tickets),
    },
  }));
}

const NOW = new Date('2026-05-22T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Cenario 1 — 0 tickets ativos
// ---------------------------------------------------------------------------
describe('buildTicketsContext — 0 tickets', () => {
  it('retorna null quando user nao tem tickets ativos (mesmo com keyword)', async () => {
    mockStorage([]);
    const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
    const block = await buildTicketsContext({
      userId: 'USER-AA',
      recentUserText: 'tenho ticket?',
    });
    expect(block).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cenario 2 + 3 — Gate por keyword
// ---------------------------------------------------------------------------
describe('buildTicketsContext — keyword gate', () => {
  const ticket = {
    id: 't-1',
    sourceName: 'Sunday Million',
    valueUsd: '215',
    expiresAt: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'available',
  };

  it.each([
    ['ticket', 'meu ticket esta valendo?'],
    ['satelite', 'rodei o satelite ontem'],
    ['grade', 'minha grade da semana'],
    ['selecionar torneio', 'me ajuda a selecionar torneio'],
  ])('keyword "%s" triggera injecao', async (_k, text) => {
    mockStorage([ticket]);
    const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
    const block = await buildTicketsContext({
      userId: 'USER-A',
      recentUserText: text,
    });
    expect(block).not.toBeNull();
    expect(block!.ticketCount).toBe(1);
  });

  it('normaliza NFKD — "satélite" casa "satelite"', async () => {
    mockStorage([ticket]);
    const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
    const block = await buildTicketsContext({
      userId: 'USER-A',
      recentUserText: 'tenho satélite pro WSOP',
    });
    expect(block).not.toBeNull();
  });

  it('case-insensitive', async () => {
    mockStorage([ticket]);
    const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
    const block = await buildTicketsContext({
      userId: 'USER-A',
      recentUserText: 'MINHA GRADE da semana',
    });
    expect(block).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cenario 4 — Gate por surface
// ---------------------------------------------------------------------------
describe('buildTicketsContext — surface gate', () => {
  const ticket = {
    id: 't-1',
    sourceName: 'Sunday Million',
    valueUsd: '215',
    expiresAt: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'available',
  };

  it.each(['tournament-selector', 'grade-planner'])(
    'surface=%s -> injeta mesmo sem keyword',
    async (surface) => {
      mockStorage([ticket]);
      const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
      const block = await buildTicketsContext({
        userId: 'USER-A',
        recentUserText: 'ola',
        pageContext: { surface },
      });
      expect(block).not.toBeNull();
    },
  );

  it('surface=home + sem keyword -> NAO injeta', async () => {
    mockStorage([ticket]);
    const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
    const block = await buildTicketsContext({
      userId: 'USER-A',
      recentUserText: 'ola',
      pageContext: { surface: 'home' },
    });
    expect(block).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cenario 5 — Sem keyword + sem surface relevante
// ---------------------------------------------------------------------------
describe('buildTicketsContext — no trigger', () => {
  it('com tickets mas sem keyword e sem surface gate -> null', async () => {
    mockStorage([
      {
        id: 't-1',
        sourceName: 'X',
        valueUsd: '10',
        expiresAt: null,
        status: 'available',
      },
    ]);
    const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
    const block = await buildTicketsContext({
      userId: 'USER-A',
      recentUserText: 'como esta meu mental?',
    });
    expect(block).toBeNull();
  });

  it('sem recentUserText e sem pageContext -> null', async () => {
    mockStorage([
      {
        id: 't-1',
        sourceName: 'X',
        valueUsd: '10',
        expiresAt: null,
        status: 'available',
      },
    ]);
    const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
    const block = await buildTicketsContext({ userId: 'USER-A' });
    expect(block).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cenario 6 + 7 — Format do bloco e ordem
// ---------------------------------------------------------------------------
describe('buildTicketsContext — format', () => {
  it('top-3 sort por expiresAt ASC (NULLs por ultimo) + total', async () => {
    const tickets = [
      { id: 't-A', sourceName: 'A', valueUsd: '50', expiresAt: new Date(NOW.getTime() + 10 * 86_400_000).toISOString(), status: 'available' },
      { id: 't-B', sourceName: 'B', valueUsd: '100', expiresAt: new Date(NOW.getTime() + 1 * 86_400_000).toISOString(), status: 'available' },
      { id: 't-C', sourceName: 'C', valueUsd: '25', expiresAt: null, status: 'available' },
      { id: 't-D', sourceName: 'D', valueUsd: '5', expiresAt: new Date(NOW.getTime() + 3 * 86_400_000).toISOString(), status: 'available' },
    ];
    mockStorage(tickets);
    const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
    const block = await buildTicketsContext({
      userId: 'USER-A',
      recentUserText: 'minha grade',
    });
    expect(block).not.toBeNull();
    expect(block!.ticketCount).toBe(4);
    expect(block!.totalValueUsd).toBeCloseTo(180, 2);
    // top-3: B (1d), D (3d), A (10d) — C (null) sai fora
    const lines = block!.text.split('\n');
    // Ordem dos itens no bloco
    const itemLines = lines.filter((l) => l.startsWith('- '));
    expect(itemLines.length).toBe(3);
    expect(itemLines[0]).toContain('B');
    expect(itemLines[1]).toContain('D');
    expect(itemLines[2]).toContain('A');
    expect(itemLines.join('\n')).not.toContain(' C ');
  });

  it('mais de 3 tickets — limita lista a 3 itens', async () => {
    const tickets = Array.from({ length: 5 }).map((_, i) => ({
      id: `t-${i}`,
      sourceName: `T${i}`,
      valueUsd: '10',
      expiresAt: new Date(NOW.getTime() + (i + 1) * 86_400_000).toISOString(),
      status: 'available',
    }));
    mockStorage(tickets);
    const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
    const block = await buildTicketsContext({
      userId: 'USER-A',
      recentUserText: 'tenho ticket',
    });
    expect(block).not.toBeNull();
    const itemLines = block!.text.split('\n').filter((l) => l.startsWith('- '));
    expect(itemLines.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Cenario 8 — storage sem getActiveTicketsByUser
// ---------------------------------------------------------------------------
describe('buildTicketsContext — storage missing', () => {
  it('defensive — retorna null se storage.getActiveTicketsByUser undefined', async () => {
    mockStorage(null); // simula ausencia do metodo
    const { buildTicketsContext } = await import('../../server/coach/contextBuilders/buildTicketsContext');
    const block = await buildTicketsContext({
      userId: 'USER-A',
      recentUserText: 'tenho ticket',
    });
    expect(block).toBeNull();
  });
});
