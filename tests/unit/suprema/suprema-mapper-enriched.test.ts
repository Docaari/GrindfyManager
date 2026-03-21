import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Mapeamento de campos ENRIQUECIDOS da API Pokerbyte
//
// Expande o mapper existente (mapSupremaTournament) com 5 novos campos:
//   lateRegMinutes, startingStack, maxPlayers, gameType, blindLevelMinutes
//
// A funcao mapSupremaTournament sera ATUALIZADA pelo Implementer em:
//   server/supremaMapper.ts
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Interface da API externa (Pokerbyte) — campos relevantes para enriquecimento
// ---------------------------------------------------------------------------
interface PokerbyteTournament {
  id: number;
  liga: number;
  ligaName: string;
  name: string;
  date: string;
  guaranteed: number;
  buyin: number;
  late: number;
  status: string;
  tournament: number;
  moneyPrefix: string;
  stack: number;
  temponivelmMeta: number;
  type: string;
  maxPl: number;
  isKO: number;
}

// ---------------------------------------------------------------------------
// Interface esperada do resultado mapeado COM campos enriquecidos
// ---------------------------------------------------------------------------
interface MappedSupremaTournamentEnriched {
  externalId: string;
  name: string;
  site: string;
  time: string;
  buyIn: string;
  guaranteed: string;
  type: string;
  speed: string;
  dayOfWeek: number;
  status: string;
  prioridade: number;
  startTime: Date;
  // Campos enriquecidos (novos)
  lateRegMinutes: number | null;
  startingStack: number | null;
  maxPlayers: number | null;
  gameType: string | null;
  blindLevelMinutes: number | null;
}

// ---------------------------------------------------------------------------
// Import da funcao que sera ATUALIZADA pelo Implementer
// ---------------------------------------------------------------------------
import { mapSupremaTournament } from '../../../server/supremaMapper';

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------
function makePokerbyteTournament(overrides: Partial<PokerbyteTournament> = {}): PokerbyteTournament {
  return {
    id: 12345,
    liga: 106,
    ligaName: 'Suprema Poker',
    name: 'Daily $22 PKO',
    date: '2026-03-19 19:30:00',
    guaranteed: 50000,
    buyin: 22,
    late: 60,
    status: 'scheduled',
    tournament: 99001,
    moneyPrefix: 'R$',
    stack: 10000,
    temponivelmMeta: 12,
    type: 'NLH',
    maxPl: 500,
    isKO: 1,
    ...overrides,
  };
}

// =============================================================================
// TESTES — Campos Enriquecidos (RF-03)
// =============================================================================

describe('mapSupremaTournament — campos enriquecidos', () => {

  // -------------------------------------------------------------------------
  // 1. Happy path: todos os campos enriquecidos presentes e validos
  // -------------------------------------------------------------------------
  it('deve mapear todos os 5 campos enriquecidos quando API retorna valores validos', () => {
    const input = makePokerbyteTournament({
      late: 60,
      stack: 10000,
      maxPl: 500,
      type: 'NLH',
      temponivelmMeta: 12,
    });
    const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;

    expect(result.lateRegMinutes).toBe(60);
    expect(result.startingStack).toBe(10000);
    expect(result.maxPlayers).toBe(500);
    expect(result.gameType).toBe('NLH');
    expect(result.blindLevelMinutes).toBe(12);
  });

  // -------------------------------------------------------------------------
  // 2. lateRegMinutes — mapeamento do campo "late"
  // -------------------------------------------------------------------------
  describe('lateRegMinutes (campo late da API)', () => {
    it('deve mapear late=60 para lateRegMinutes=60', () => {
      const input = makePokerbyteTournament({ late: 60 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.lateRegMinutes).toBe(60);
    });

    it('deve mapear late=120 para lateRegMinutes=120', () => {
      const input = makePokerbyteTournament({ late: 120 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.lateRegMinutes).toBe(120);
    });

    it('deve mapear late=0 para lateRegMinutes=null (zero nao faz sentido)', () => {
      const input = makePokerbyteTournament({ late: 0 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.lateRegMinutes).toBeNull();
    });

    it('deve mapear late=null para lateRegMinutes=null', () => {
      const input = makePokerbyteTournament({ late: null as any });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.lateRegMinutes).toBeNull();
    });

    it('deve mapear late=undefined para lateRegMinutes=null', () => {
      const input = makePokerbyteTournament({ late: undefined as any });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.lateRegMinutes).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 3. startingStack — mapeamento do campo "stack"
  // -------------------------------------------------------------------------
  describe('startingStack (campo stack da API)', () => {
    it('deve mapear stack=10000 para startingStack=10000', () => {
      const input = makePokerbyteTournament({ stack: 10000 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.startingStack).toBe(10000);
    });

    it('deve mapear stack=5000 para startingStack=5000', () => {
      const input = makePokerbyteTournament({ stack: 5000 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.startingStack).toBe(5000);
    });

    it('deve mapear stack=0 para startingStack=null (zero nao faz sentido)', () => {
      const input = makePokerbyteTournament({ stack: 0 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.startingStack).toBeNull();
    });

    it('deve mapear stack=null para startingStack=null', () => {
      const input = makePokerbyteTournament({ stack: null as any });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.startingStack).toBeNull();
    });

    it('deve mapear stack=undefined para startingStack=null', () => {
      const input = makePokerbyteTournament({ stack: undefined as any });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.startingStack).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 4. maxPlayers — mapeamento do campo "maxPl"
  // -------------------------------------------------------------------------
  describe('maxPlayers (campo maxPl da API)', () => {
    it('deve mapear maxPl=500 para maxPlayers=500', () => {
      const input = makePokerbyteTournament({ maxPl: 500 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.maxPlayers).toBe(500);
    });

    it('deve mapear maxPl=0 para maxPlayers=null (zero nao faz sentido)', () => {
      const input = makePokerbyteTournament({ maxPl: 0 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.maxPlayers).toBeNull();
    });

    it('deve mapear maxPl=null para maxPlayers=null', () => {
      const input = makePokerbyteTournament({ maxPl: null as any });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.maxPlayers).toBeNull();
    });

    it('deve mapear maxPl=undefined para maxPlayers=null', () => {
      const input = makePokerbyteTournament({ maxPl: undefined as any });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.maxPlayers).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 5. gameType — mapeamento do campo "type"
  // -------------------------------------------------------------------------
  describe('gameType (campo type da API)', () => {
    it('deve mapear type="NLH" para gameType="NLH"', () => {
      const input = makePokerbyteTournament({ type: 'NLH' });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.gameType).toBe('NLH');
    });

    it('deve mapear type="PLO5" para gameType="PLO"', () => {
      const input = makePokerbyteTournament({ type: 'PLO5' });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.gameType).toBe('PLO');
    });

    it('deve mapear type="OUTRO" para gameType=null (tipo desconhecido)', () => {
      const input = makePokerbyteTournament({ type: 'OUTRO' });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.gameType).toBeNull();
    });

    it('deve mapear type="" para gameType=null (string vazia)', () => {
      const input = makePokerbyteTournament({ type: '' });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.gameType).toBeNull();
    });

    it('deve mapear type=null para gameType=null', () => {
      const input = makePokerbyteTournament({ type: null as any });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.gameType).toBeNull();
    });

    it('deve mapear type=undefined para gameType=null', () => {
      const input = makePokerbyteTournament({ type: undefined as any });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.gameType).toBeNull();
    });

    it('deve mapear type="plo5" (lowercase) para gameType=null (case-sensitive)', () => {
      const input = makePokerbyteTournament({ type: 'plo5' });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      // A API retorna exatamente "PLO5" ou "NLH" — lowercase e tipo desconhecido
      expect(result.gameType).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 6. blindLevelMinutes — mapeamento do campo "temponivelmMeta"
  // -------------------------------------------------------------------------
  describe('blindLevelMinutes (campo temponivelmMeta da API)', () => {
    it('deve mapear temponivelmMeta=12 para blindLevelMinutes=12', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 12 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.blindLevelMinutes).toBe(12);
    });

    it('deve mapear temponivelmMeta=8 para blindLevelMinutes=8', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 8 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.blindLevelMinutes).toBe(8);
    });

    it('deve mapear temponivelmMeta=0 para blindLevelMinutes=null (zero nao faz sentido)', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 0 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.blindLevelMinutes).toBeNull();
    });

    it('deve mapear temponivelmMeta=null para blindLevelMinutes=null', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: null as any });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.blindLevelMinutes).toBeNull();
    });

    it('deve preservar blindLevelMinutes ALEM de derivar speed (nao sao mutuamente exclusivos)', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 12 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      // blindLevelMinutes preserva o valor original
      expect(result.blindLevelMinutes).toBe(12);
      // speed continua sendo derivado normalmente
      expect(result.speed).toBe('Normal');
    });

    it('deve derivar speed="Turbo" E preservar blindLevelMinutes=8', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 8 });
      const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;
      expect(result.blindLevelMinutes).toBe(8);
      expect(result.speed).toBe('Turbo');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Todos os campos enriquecidos null (torneio sem dados)
  // -------------------------------------------------------------------------
  it('deve retornar todos os campos enriquecidos como null quando API envia zeros/nulls', () => {
    const input = makePokerbyteTournament({
      late: 0,
      stack: 0,
      maxPl: 0,
      type: null as any,
      temponivelmMeta: 0,
    });
    const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;

    expect(result.lateRegMinutes).toBeNull();
    expect(result.startingStack).toBeNull();
    expect(result.maxPlayers).toBeNull();
    expect(result.gameType).toBeNull();
    expect(result.blindLevelMinutes).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 8. Campos enriquecidos nao afetam campos basicos existentes
  // -------------------------------------------------------------------------
  it('deve manter mapeamento de campos basicos intacto com campos enriquecidos', () => {
    const input = makePokerbyteTournament({
      late: 60,
      stack: 10000,
      maxPl: 500,
      type: 'PLO5',
      temponivelmMeta: 12,
      isKO: 1,
      buyin: 22,
    });
    const result = mapSupremaTournament(input) as MappedSupremaTournamentEnriched;

    // Campos basicos inalterados
    expect(result.site).toBe('Suprema');
    expect(result.type).toBe('PKO'); // type vem de isKO, nao do campo type
    expect(result.buyIn).toBe('22');
    expect(result.speed).toBe('Normal');
    expect(result.status).toBe('upcoming');
    expect(result.prioridade).toBe(2);
  });
});
