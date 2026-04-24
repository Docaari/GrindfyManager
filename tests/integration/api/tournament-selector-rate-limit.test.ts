import { describe, it, expect } from 'vitest';

// =============================================================================
// HIGH #6 — Rate limiter (30 req/min) no /api/tournament-selector
//
// Como o handler isolado nao passa por Express middleware, testamos a config
// do rate-limiter por inspecao do modulo. Um teste e2e completo via supertest
// fica para Sprint 2 (configurar app de teste full-stack).
// =============================================================================

describe('HIGH #6: rate limiter configuration', () => {
  it('o modulo do tournament-selector exporta registerTournamentSelectorRoutes', async () => {
    const mod = await import('../../../server/routes/tournament-selector');
    expect(typeof mod.registerTournamentSelectorRoutes).toBe('function');
  });

  it('a rota /api/tournament-selector e registrada com middleware antes do handler (verificacao indireta)', async () => {
    // Capturamos as chamadas a app.get para verificar que ha um middleware extra
    // entre requireAuth e o handler — esse middleware e o rate limiter.
    const calls: any[] = [];
    const fakeApp: any = {
      get: (path: string, ...args: any[]) => {
        calls.push({ path, middlewares: args });
      },
    };
    const mod = await import('../../../server/routes/tournament-selector');
    mod.registerTournamentSelectorRoutes(fakeApp);

    const route = calls.find((c) => c.path === '/api/tournament-selector');
    expect(route).toBeDefined();
    // [requireAuth, selectorRateLimit, handler] = 3 middlewares (handler conta)
    expect(route!.middlewares.length).toBeGreaterThanOrEqual(3);
  });
});
