import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Mapeamento de campos da API Pokerbyte para formato Grindfy
//
// A funcao mapSupremaTournament ainda NAO existe. O Implementer vai cria-la em:
//   server/supremaMapper.ts (ou server/suprema/mapper.ts)
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Interface da API externa (Pokerbyte) — documentada na spec
// ---------------------------------------------------------------------------
interface PokerbyteTournament {
  id: number;
  liga: number;
  ligaName: string;
  name: string;
  date: string;           // "YYYY-MM-DD HH:mm:ss"
  guaranteed: number;
  buyin: number;
  late: number;
  status: string;
  tournament: number;
  moneyPrefix: string;
  stack: number;
  temponivelmMeta: number;
  type: string;            // "NLH" ou "PLO5"
  maxPl: number;
  isKO: number;            // 0 = Vanilla, 1 = PKO
}

// ---------------------------------------------------------------------------
// Interface esperada do resultado mapeado (Grindfy planned tournament shape)
// ---------------------------------------------------------------------------
interface MappedSupremaTournament {
  externalId: string;
  name: string;
  site: string;
  time: string;            // "HH:mm"
  buyIn: string;           // decimal como string
  guaranteed: string;      // decimal como string
  type: string;            // "Vanilla" | "PKO"
  speed: string;           // "Normal" | "Turbo" | "Hyper"
  dayOfWeek: number;       // 0-6 (0=domingo)
  status: string;
  prioridade: number;
  startTime: Date;
}

// ---------------------------------------------------------------------------
// Import da funcao que AINDA NAO EXISTE — sera criada pelo Implementer
// ---------------------------------------------------------------------------
import { mapSupremaTournament } from '../../../server/supremaMapper';

// ---------------------------------------------------------------------------
// Factory helper para criar torneio Pokerbyte valido
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
// TESTES
// =============================================================================

describe('mapSupremaTournament', () => {

  // -------------------------------------------------------------------------
  // 1. Campos basicos
  // -------------------------------------------------------------------------
  describe('campos basicos', () => {
    it('deve mapear name diretamente sem transformacao', () => {
      const input = makePokerbyteTournament({ name: 'Super Tuesday $109' });
      const result = mapSupremaTournament(input);
      expect(result.name).toBe('Super Tuesday $109');
    });

    it('deve mapear buyIn como string decimal', () => {
      const input = makePokerbyteTournament({ buyin: 22 });
      const result = mapSupremaTournament(input);
      expect(result.buyIn).toBe('22');
    });

    it('deve mapear guaranteed como string decimal', () => {
      const input = makePokerbyteTournament({ guaranteed: 50000 });
      const result = mapSupremaTournament(input);
      expect(result.guaranteed).toBe('50000');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Site fixo
  // -------------------------------------------------------------------------
  it('deve mapear site fixo como "Suprema"', () => {
    const input = makePokerbyteTournament();
    const result = mapSupremaTournament(input);
    expect(result.site).toBe('Suprema');
  });

  // -------------------------------------------------------------------------
  // 3. Mapeamento de tipo (isKO)
  // -------------------------------------------------------------------------
  describe('mapeamento de tipo (isKO)', () => {
    it('deve mapear isKO=0 como type "Vanilla"', () => {
      const input = makePokerbyteTournament({ isKO: 0 });
      const result = mapSupremaTournament(input);
      expect(result.type).toBe('Vanilla');
    });

    it('deve mapear isKO=1 como type "PKO"', () => {
      const input = makePokerbyteTournament({ isKO: 1 });
      const result = mapSupremaTournament(input);
      expect(result.type).toBe('PKO');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Mapeamento de speed (temponivelmMeta)
  // -------------------------------------------------------------------------
  describe('mapeamento de speed (temponivelmMeta)', () => {
    it('deve mapear temponivelmMeta <= 6 como speed "Hyper"', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 5 });
      const result = mapSupremaTournament(input);
      expect(result.speed).toBe('Hyper');
    });

    it('deve mapear temponivelmMeta = 6 como speed "Hyper" (limite exato)', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 6 });
      const result = mapSupremaTournament(input);
      expect(result.speed).toBe('Hyper');
    });

    it('deve mapear temponivelmMeta <= 10 (e > 6) como speed "Turbo"', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 8 });
      const result = mapSupremaTournament(input);
      expect(result.speed).toBe('Turbo');
    });

    it('deve mapear temponivelmMeta = 10 como speed "Turbo" (limite exato)', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 10 });
      const result = mapSupremaTournament(input);
      expect(result.speed).toBe('Turbo');
    });

    it('deve mapear temponivelmMeta > 10 como speed "Normal"', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 15 });
      const result = mapSupremaTournament(input);
      expect(result.speed).toBe('Normal');
    });

    it('deve mapear temponivelmMeta = 0 como speed "Normal"', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: 0 });
      const result = mapSupremaTournament(input);
      expect(result.speed).toBe('Normal');
    });

    it('deve mapear temponivelmMeta null como speed "Normal"', () => {
      const input = makePokerbyteTournament({ temponivelmMeta: null as any });
      const result = mapSupremaTournament(input);
      expect(result.speed).toBe('Normal');
    });
  });

  // -------------------------------------------------------------------------
  // 5. externalId
  // -------------------------------------------------------------------------
  it('deve gerar externalId com formato "suprema-{id}"', () => {
    const input = makePokerbyteTournament({ id: 98765 });
    const result = mapSupremaTournament(input);
    expect(result.externalId).toBe('suprema-98765');
  });

  // -------------------------------------------------------------------------
  // 6. Horario de inicio (time)
  // -------------------------------------------------------------------------
  describe('extracao de horario', () => {
    it('deve extrair HH:mm do campo date "YYYY-MM-DD HH:MM:SS"', () => {
      const input = makePokerbyteTournament({ date: '2026-03-19 19:30:00' });
      const result = mapSupremaTournament(input);
      expect(result.time).toBe('19:30');
    });

    it('deve extrair horario corretamente para meia-noite', () => {
      const input = makePokerbyteTournament({ date: '2026-03-20 00:05:00' });
      const result = mapSupremaTournament(input);
      expect(result.time).toBe('00:05');
    });

    it('deve converter date para objeto Date em startTime', () => {
      const input = makePokerbyteTournament({ date: '2026-03-19 19:30:00' });
      const result = mapSupremaTournament(input);
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.startTime.getHours()).toBe(19);
      expect(result.startTime.getMinutes()).toBe(30);
    });
  });

  // -------------------------------------------------------------------------
  // 7. buyIn como string
  // -------------------------------------------------------------------------
  describe('conversao de buyIn para string', () => {
    it('deve converter buyIn inteiro para string', () => {
      const input = makePokerbyteTournament({ buyin: 100 });
      const result = mapSupremaTournament(input);
      expect(typeof result.buyIn).toBe('string');
      expect(result.buyIn).toBe('100');
    });

    it('deve converter buyIn decimal para string', () => {
      const input = makePokerbyteTournament({ buyin: 5.5 });
      const result = mapSupremaTournament(input);
      expect(typeof result.buyIn).toBe('string');
      expect(result.buyIn).toBe('5.5');
    });

    it('deve converter buyIn zero (freeroll) para string "0"', () => {
      const input = makePokerbyteTournament({ buyin: 0 });
      const result = mapSupremaTournament(input);
      expect(result.buyIn).toBe('0');
    });
  });

  // -------------------------------------------------------------------------
  // 8. guaranteed como string
  // -------------------------------------------------------------------------
  it('deve converter guaranteed para string', () => {
    const input = makePokerbyteTournament({ guaranteed: 100000 });
    const result = mapSupremaTournament(input);
    expect(typeof result.guaranteed).toBe('string');
    expect(result.guaranteed).toBe('100000');
  });

  // -------------------------------------------------------------------------
  // 9. Campos null/undefined
  // -------------------------------------------------------------------------
  describe('tratamento de campos null/undefined', () => {
    it('deve tratar buyin null sem crashar', () => {
      const input = makePokerbyteTournament({ buyin: null as any });
      expect(() => mapSupremaTournament(input)).not.toThrow();
      const result = mapSupremaTournament(input);
      expect(result.buyIn).toBe('0');
    });

    it('deve tratar guaranteed null retornando "0"', () => {
      const input = makePokerbyteTournament({ guaranteed: null as any });
      expect(() => mapSupremaTournament(input)).not.toThrow();
      const result = mapSupremaTournament(input);
      expect(result.guaranteed).toBe('0');
    });

    it('deve tratar name undefined sem crashar', () => {
      const input = makePokerbyteTournament({ name: undefined as any });
      expect(() => mapSupremaTournament(input)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 10. type NLH/PLO5 (informativo, nao afeta campo type)
  // -------------------------------------------------------------------------
  it('nao deve alterar mapeamento de type por causa do campo type (NLH)', () => {
    const input = makePokerbyteTournament({ type: 'NLH', isKO: 0 });
    const result = mapSupremaTournament(input);
    // type no Grindfy vem de isKO, nao do campo type da API
    expect(result.type).toBe('Vanilla');
  });

  it('nao deve alterar mapeamento de type por causa do campo type (PLO5)', () => {
    const input = makePokerbyteTournament({ type: 'PLO5', isKO: 1 });
    const result = mapSupremaTournament(input);
    expect(result.type).toBe('PKO');
  });

  // -------------------------------------------------------------------------
  // 11. dayOfWeek derivado da data
  // -------------------------------------------------------------------------
  describe('calculo de dayOfWeek', () => {
    it('deve calcular dayOfWeek a partir da data (quinta-feira = 4)', () => {
      // 2026-03-19 e quinta-feira
      const input = makePokerbyteTournament({ date: '2026-03-19 19:30:00' });
      const result = mapSupremaTournament(input);
      expect(result.dayOfWeek).toBe(4); // quinta-feira
    });

    it('deve calcular dayOfWeek para domingo (= 0)', () => {
      // 2026-03-22 e domingo
      const input = makePokerbyteTournament({ date: '2026-03-22 15:00:00' });
      const result = mapSupremaTournament(input);
      expect(result.dayOfWeek).toBe(0);
    });

    it('deve calcular dayOfWeek para sabado (= 6)', () => {
      // 2026-03-21 e sabado
      const input = makePokerbyteTournament({ date: '2026-03-21 20:00:00' });
      const result = mapSupremaTournament(input);
      expect(result.dayOfWeek).toBe(6);
    });
  });

  // -------------------------------------------------------------------------
  // 12. Campos fixos (status, prioridade)
  // -------------------------------------------------------------------------
  it('deve definir status como "upcoming"', () => {
    const input = makePokerbyteTournament();
    const result = mapSupremaTournament(input);
    expect(result.status).toBe('upcoming');
  });

  it('deve definir prioridade como 2 (Media)', () => {
    const input = makePokerbyteTournament();
    const result = mapSupremaTournament(input);
    expect(result.prioridade).toBe(2);
  });
});
