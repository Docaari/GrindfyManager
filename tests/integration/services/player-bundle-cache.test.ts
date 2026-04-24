import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: server/services/playerBundle.ts (cache)
//
// Servico unico expoe:
//   getOrLoad(userId, lookbackDays) -> Promise<PlayerAnalyticsBundle>
//   invalidate(userId) -> void
//
// Decisao Q3: invalidate chamado diretamente pelo upload handler (Opcao A).
// =============================================================================

import { playerBundleCache } from '../../../server/services/playerBundle';
import { storage } from '../../../server/storage';

vi.mock('../../../server/storage', () => ({
  storage: {
    getAnalyticsBySite: vi.fn().mockResolvedValue([]),
    // CRITICAL #1: playerBundle agora chama getAnalyticsByBuyinRangeV2 (labels do BUYIN_BUCKETS).
    // O metodo legado e mantido para o dashboard; deixamos ambos no mock para compatibilidade.
    getAnalyticsByBuyinRange: vi.fn().mockResolvedValue([]),
    getAnalyticsByBuyinRangeV2: vi.fn().mockResolvedValue([]),
    getAnalyticsByCategory: vi.fn().mockResolvedValue([]),
    getAnalyticsBySpeed: vi.fn().mockResolvedValue([]),
    getAnalyticsByDayOfWeek: vi.fn().mockResolvedValue([]),
    getAnalyticsByTimeOfDay: vi.fn().mockResolvedValue([]),
    // CRITICAL #2: playerBundle agora chama getAnalyticsByFieldSize (FIELD_BUCKETS labels).
    getAnalyticsByField: vi.fn().mockResolvedValue([]),
    getAnalyticsByFieldSize: vi.fn().mockResolvedValue([]),
    countTournaments: vi.fn().mockResolvedValue(200),
    getOverallRoi: vi.fn().mockResolvedValue(12),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Reset cache antes de cada teste — Implementer expoe __reset() para testes
  if (typeof (playerBundleCache as any).__resetForTest === 'function') {
    (playerBundleCache as any).__resetForTest();
  }
});

describe('playerBundleCache - getOrLoad', () => {
  it('primeira chamada faz load do storage (cache miss)', async () => {
    await playerBundleCache.getOrLoad('USER-0001', 180);
    expect(storage.getAnalyticsBySite).toHaveBeenCalled();
    expect(storage.getAnalyticsByTimeOfDay).toHaveBeenCalled();
  });

  it('segunda chamada com mesmos params nao re-consulta storage (cache hit)', async () => {
    await playerBundleCache.getOrLoad('USER-0001', 180);
    (storage.getAnalyticsBySite as any).mockClear();
    await playerBundleCache.getOrLoad('USER-0001', 180);
    expect(storage.getAnalyticsBySite).not.toHaveBeenCalled();
  });

  it('chamadas com lookbackDays diferentes sao caches independentes', async () => {
    await playerBundleCache.getOrLoad('USER-0001', 180);
    (storage.getAnalyticsBySite as any).mockClear();
    await playerBundleCache.getOrLoad('USER-0001', 90);
    expect(storage.getAnalyticsBySite).toHaveBeenCalled();
  });

  it('chamadas para users diferentes sao caches independentes', async () => {
    await playerBundleCache.getOrLoad('USER-0001', 180);
    (storage.getAnalyticsBySite as any).mockClear();
    await playerBundleCache.getOrLoad('USER-0002', 180);
    expect(storage.getAnalyticsBySite).toHaveBeenCalled();
  });
});

describe('playerBundleCache - invalidate (Q3)', () => {
  it('invalidate(userId) zera entrada do user', async () => {
    await playerBundleCache.getOrLoad('USER-0001', 180);
    playerBundleCache.invalidate('USER-0001');
    (storage.getAnalyticsBySite as any).mockClear();
    await playerBundleCache.getOrLoad('USER-0001', 180);
    expect(storage.getAnalyticsBySite).toHaveBeenCalled();
  });

  it('invalidate(userId) NAO afeta cache de outro user', async () => {
    await playerBundleCache.getOrLoad('USER-0001', 180);
    await playerBundleCache.getOrLoad('USER-0002', 180);
    playerBundleCache.invalidate('USER-0001');
    (storage.getAnalyticsBySite as any).mockClear();
    await playerBundleCache.getOrLoad('USER-0002', 180); // hit
    expect(storage.getAnalyticsBySite).not.toHaveBeenCalled();
  });

  it('invalidate remove TODAS as entradas do user (varios lookbackDays)', async () => {
    await playerBundleCache.getOrLoad('USER-0001', 180);
    await playerBundleCache.getOrLoad('USER-0001', 90);
    playerBundleCache.invalidate('USER-0001');
    (storage.getAnalyticsBySite as any).mockClear();
    await playerBundleCache.getOrLoad('USER-0001', 180);
    await playerBundleCache.getOrLoad('USER-0001', 90);
    expect(storage.getAnalyticsBySite).toHaveBeenCalledTimes(2);
  });
});

describe('playerBundleCache - TTL 5min', () => {
  it.todo('apos 5min, entrada vence e proxima chamada recarrega');
  // TTL real precisaria de fake timers + clock; deixar para Implementer validar
  // em teste manual ou fake timer dedicado.
});

describe('playerBundleCache - normalizacao de moeda integrada (Q2)', () => {
  it.todo('historico de buy-ins em BRL passa por currencyNormalizer antes de agregar buckets');
  // Depende de fixture com mistura de moedas; usa normalizer.test.ts como base.
});
