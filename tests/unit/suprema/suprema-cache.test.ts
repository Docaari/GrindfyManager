import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Testes TDD: Cache com TTL para respostas da API Suprema Poker
//
// A classe/funcao SupremaCache ainda NAO existe. O Implementer vai cria-la em:
//   server/supremaCache.ts (ou server/suprema/cache.ts)
//
// O cache usa Map<string, { data, timestamp }> com TTL de 1 hora (3600000ms).
// Chave = data no formato YYYY-MM-DD.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import da classe que AINDA NAO EXISTE — sera criada pelo Implementer
// ---------------------------------------------------------------------------
import { SupremaCache } from '../../../server/supremaCache';

// ---------------------------------------------------------------------------
// Dados de teste
// ---------------------------------------------------------------------------
const sampleTournaments = [
  { id: 1, name: 'Torneio A', buyin: 22, guaranteed: 10000 },
  { id: 2, name: 'Torneio B', buyin: 55, guaranteed: 25000 },
];

const otherTournaments = [
  { id: 3, name: 'Torneio C', buyin: 109, guaranteed: 50000 },
];

// =============================================================================
// TESTES
// =============================================================================

describe('SupremaCache', () => {
  let cache: InstanceType<typeof SupremaCache>;

  beforeEach(() => {
    cache = new SupremaCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Cache miss
  // -------------------------------------------------------------------------
  it('deve retornar undefined para chave nao existente (cache miss)', () => {
    const result = cache.get('2026-03-19');
    expect(result).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 2. Cache hit
  // -------------------------------------------------------------------------
  it('deve retornar dados armazenados para mesma chave (cache hit)', () => {
    cache.set('2026-03-19', sampleTournaments);
    const result = cache.get('2026-03-19');
    expect(result).toEqual(sampleTournaments);
  });

  // -------------------------------------------------------------------------
  // 3. Cache expire
  // -------------------------------------------------------------------------
  it('deve retornar undefined apos TTL de 1 hora expirar', () => {
    cache.set('2026-03-19', sampleTournaments);

    // Avanca 59 minutos — ainda deve estar no cache
    vi.advanceTimersByTime(59 * 60 * 1000);
    expect(cache.get('2026-03-19')).toEqual(sampleTournaments);

    // Avanca mais 2 minutos (total 61 min) — cache expirado
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(cache.get('2026-03-19')).toBeUndefined();
  });

  it('deve expirar exatamente apos 3600000ms (1 hora)', () => {
    cache.set('2026-03-19', sampleTournaments);

    // Exatamente 1 hora — depende da implementacao se <= ou <
    // A spec diz "cacheadas por 1 hora", entao apos 1h exata deve expirar
    vi.advanceTimersByTime(3600000);
    expect(cache.get('2026-03-19')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 4. Keys diferentes = caches separados
  // -------------------------------------------------------------------------
  it('deve manter caches separados para datas diferentes', () => {
    cache.set('2026-03-19', sampleTournaments);
    cache.set('2026-03-20', otherTournaments);

    expect(cache.get('2026-03-19')).toEqual(sampleTournaments);
    expect(cache.get('2026-03-20')).toEqual(otherTournaments);
  });

  it('deve expirar caches de datas diferentes independentemente', () => {
    cache.set('2026-03-19', sampleTournaments);

    // 30 minutos depois, adiciona outra data
    vi.advanceTimersByTime(30 * 60 * 1000);
    cache.set('2026-03-20', otherTournaments);

    // 31 minutos depois (61 total para a primeira, 31 para a segunda)
    vi.advanceTimersByTime(31 * 60 * 1000);

    // Primeira expirou, segunda ainda valida
    expect(cache.get('2026-03-19')).toBeUndefined();
    expect(cache.get('2026-03-20')).toEqual(otherTournaments);
  });

  // -------------------------------------------------------------------------
  // 5. Cache clear
  // -------------------------------------------------------------------------
  it('deve limpar todo o cache quando clear() e chamado', () => {
    cache.set('2026-03-19', sampleTournaments);
    cache.set('2026-03-20', otherTournaments);

    cache.clear();

    expect(cache.get('2026-03-19')).toBeUndefined();
    expect(cache.get('2026-03-20')).toBeUndefined();
  });
});
