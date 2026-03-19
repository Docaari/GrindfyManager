import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Testes TDD: Tratamento de erros na chamada a API Suprema Poker
//
// A funcao fetchSupremaTournaments ainda NAO existe. O Implementer vai cria-la em:
//   server/supremaService.ts (ou server/suprema/service.ts)
//
// A funcao faz fetch para:
//   GET https://api.pokerbyte.com.br/mtt/list/106/all/{date}/guaranteed/desc
// Com timeout de 10 segundos.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import da funcao que AINDA NAO EXISTE — sera criada pelo Implementer
// ---------------------------------------------------------------------------
import { fetchSupremaTournaments } from '../../../server/supremaService';

// ---------------------------------------------------------------------------
// Mock do fetch global
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Dados de resposta valida para reutilizacao
// ---------------------------------------------------------------------------
const validApiResponse = [
  {
    id: 1,
    liga: 106,
    ligaName: 'Suprema Poker',
    name: 'Daily $22',
    date: '2026-03-19 19:00:00',
    guaranteed: 10000,
    buyin: 22,
    late: 60,
    status: 'scheduled',
    tournament: 9001,
    moneyPrefix: 'R$',
    stack: 10000,
    temponivelmMeta: 12,
    type: 'NLH',
    maxPl: 500,
    isKO: 0,
  },
];

// =============================================================================
// TESTES
// =============================================================================

describe('fetchSupremaTournaments — tratamento de erros', () => {

  // -------------------------------------------------------------------------
  // 1. API retorna 500 — erro tratado com mensagem
  // -------------------------------------------------------------------------
  it('deve lancar erro com mensagem descritiva quando API retorna 500', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchSupremaTournaments('2026-03-19'))
      .rejects
      .toThrow(/Nao foi possivel conectar a API da Suprema Poker/i);
  });

  // -------------------------------------------------------------------------
  // 2. API retorna 404 — erro tratado
  // -------------------------------------------------------------------------
  it('deve lancar erro com mensagem descritiva quando API retorna 404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(fetchSupremaTournaments('2026-03-19'))
      .rejects
      .toThrow(/Nao foi possivel conectar a API da Suprema Poker/i);
  });

  // -------------------------------------------------------------------------
  // 3. API retorna JSON invalido — erro tratado
  // -------------------------------------------------------------------------
  it('deve lancar erro quando API retorna JSON invalido', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    });

    await expect(fetchSupremaTournaments('2026-03-19'))
      .rejects
      .toThrow();
  });

  // -------------------------------------------------------------------------
  // 4. API timeout (demora > 10s) — erro tratado
  // -------------------------------------------------------------------------
  it('deve lancar erro quando API demora mais de 10 segundos (timeout)', async () => {
    // Simula fetch que nunca resolve (sera abortado pelo AbortController)
    mockFetch.mockImplementation(() =>
      new Promise((_, reject) => {
        setTimeout(() => reject(new DOMException('The operation was aborted', 'AbortError')), 11000);
      })
    );

    // A funcao deve usar AbortController com timeout de 10s
    // e converter AbortError na mensagem padrao
    await expect(fetchSupremaTournaments('2026-03-19'))
      .rejects
      .toThrow(/Nao foi possivel conectar a API da Suprema Poker|timeout/i);
  }, 15000);

  // -------------------------------------------------------------------------
  // 5. API retorna array vazio — retorna lista vazia sem erro
  // -------------------------------------------------------------------------
  it('deve retornar array vazio quando API retorna lista vazia', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });

    const result = await fetchSupremaTournaments('2026-03-19');
    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 6. Campo obrigatorio faltando — torneio ignorado, nao crasha
  // -------------------------------------------------------------------------
  it('deve ignorar torneio com campo obrigatorio faltando sem crashar', async () => {
    const responseWithBadItem = [
      // Torneio valido
      validApiResponse[0],
      // Torneio com name faltando (campo obrigatorio)
      {
        id: 2,
        liga: 106,
        ligaName: 'Suprema Poker',
        // name: FALTANDO
        date: '2026-03-19 20:00:00',
        guaranteed: 5000,
        buyin: 11,
        late: 30,
        status: 'scheduled',
        tournament: 9002,
        moneyPrefix: 'R$',
        stack: 10000,
        temponivelmMeta: 8,
        type: 'NLH',
        maxPl: 300,
        isKO: 1,
      },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(responseWithBadItem),
    });

    const result = await fetchSupremaTournaments('2026-03-19');
    // Deve retornar apenas o torneio valido, ignorando o incompleto
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Cenario de sucesso (baseline) — API retorna dados validos
  // -------------------------------------------------------------------------
  it('deve retornar torneios mapeados quando API responde com sucesso', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validApiResponse),
    });

    const result = await fetchSupremaTournaments('2026-03-19');
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('id', 1);
    expect(result[0]).toHaveProperty('name', 'Daily $22');
  });

  // -------------------------------------------------------------------------
  // Verifica que fetch e chamado com URL correta
  // -------------------------------------------------------------------------
  it('deve chamar a URL correta da API Pokerbyte com a data fornecida', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });

    await fetchSupremaTournaments('2026-03-19');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.pokerbyte.com.br/mtt/list/106/all/2026-03-19/guaranteed/desc',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });

  // -------------------------------------------------------------------------
  // Verifica que fetch nao faz chamada de rede real
  // -------------------------------------------------------------------------
  it('deve usar fetch mockado (nao faz chamada real)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });

    await fetchSupremaTournaments('2026-03-19');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
