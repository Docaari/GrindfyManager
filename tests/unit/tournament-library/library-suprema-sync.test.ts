import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Suprema Auto-Sync para Biblioteca de Torneios
//
// A funcao processSupremaSync AINDA NAO EXISTE.
// O Implementer vai cria-la em:
//   shared/library-suprema-sync.ts (ou server/library-suprema-sync.ts)
//
// Regras de sync (da spec):
// - Mapear campos Suprema para tournament_library:
//   name, site="Suprema", buyIn, guaranteed, time, type (PKO/Vanilla),
//   speed (Normal/Turbo/Hyper), source='suprema', externalId="suprema-{id}"
// - Remover duplicatas por externalId contra existentes (ativos + lixeira)
// - Retornar array de novos torneios prontos para insercao
// - Array vazio da API -> retorna array vazio
// - Todos ja existem -> retorna array vazio
//
// Modo: TDD — todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import da funcao que AINDA NAO EXISTE — sera criada pelo Implementer
// ---------------------------------------------------------------------------
import { processSupremaSync } from '../../../shared/library-suprema-sync';

// ---------------------------------------------------------------------------
// Tipos para os testes
// ---------------------------------------------------------------------------
interface SupremaTournament {
  id: number;
  name: string;
  buyin: number;
  guaranteed: number;
  date: string; // "YYYY-MM-DD HH:mm:ss"
  isKO: number; // 0 = Vanilla, 1 = PKO
  temponivelmMeta: number;
  [key: string]: any;
}

interface ExistingLibraryItem {
  name: string;
  site: string;
  buyIn: string;
  externalId: string | null;
  deletedAt: Date | null;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
function makeSupremaTournament(overrides: Partial<SupremaTournament> = {}): SupremaTournament {
  return {
    id: 12345,
    liga: 106,
    ligaName: 'Suprema Poker',
    name: 'Daily $22 PKO',
    date: '2026-03-21 19:30:00',
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

function makeExistingLibrary(overrides: Partial<ExistingLibraryItem> = {}): ExistingLibraryItem {
  return {
    id: 'lib-001',
    name: 'Existing Tournament',
    site: 'Suprema',
    buyIn: '55.00',
    externalId: null,
    deletedAt: null,
    userId: 'USER-0001',
    ...overrides,
  };
}

// =============================================================================
// Mapeamento de campos
// =============================================================================

describe('processSupremaSync', () => {

  describe('mapeamento de campos', () => {

    it('deve mapear name diretamente', () => {
      const suprema = [makeSupremaTournament({ name: 'Super Tuesday $109' })];
      const result = processSupremaSync(suprema, []);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Super Tuesday $109');
    });

    it('deve setar site como "Suprema"', () => {
      const suprema = [makeSupremaTournament()];
      const result = processSupremaSync(suprema, []);

      expect(result[0].site).toBe('Suprema');
    });

    it('deve mapear buyin como string para buyIn', () => {
      const suprema = [makeSupremaTournament({ buyin: 22 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].buyIn).toBe('22');
    });

    it('deve mapear guaranteed como string', () => {
      const suprema = [makeSupremaTournament({ guaranteed: 100000 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].guaranteed).toBe('100000');
    });

    it('deve extrair time no formato HH:mm do campo date', () => {
      const suprema = [makeSupremaTournament({ date: '2026-03-21 20:30:00' })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].time).toBe('20:30');
    });

    it('deve setar source como "suprema"', () => {
      const suprema = [makeSupremaTournament()];
      const result = processSupremaSync(suprema, []);

      expect(result[0].source).toBe('suprema');
    });

    it('deve gerar externalId com formato "suprema-{id}"', () => {
      const suprema = [makeSupremaTournament({ id: 98765 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].externalId).toBe('suprema-98765');
    });
  });

  // ===========================================================================
  // Mapeamento de type (isKO)
  // ===========================================================================

  describe('mapeamento de type (isKO)', () => {

    it('deve mapear isKO=0 como type "Vanilla"', () => {
      const suprema = [makeSupremaTournament({ isKO: 0 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].type).toBe('Vanilla');
    });

    it('deve mapear isKO=1 como type "PKO"', () => {
      const suprema = [makeSupremaTournament({ isKO: 1 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].type).toBe('PKO');
    });
  });

  // ===========================================================================
  // Mapeamento de speed (temponivelmMeta)
  // ===========================================================================

  describe('mapeamento de speed (temponivelmMeta)', () => {

    it('deve mapear temponivelmMeta <= 6 como speed "Hyper"', () => {
      const suprema = [makeSupremaTournament({ temponivelmMeta: 5 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].speed).toBe('Hyper');
    });

    it('deve mapear temponivelmMeta = 6 como speed "Hyper" (limite exato)', () => {
      const suprema = [makeSupremaTournament({ temponivelmMeta: 6 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].speed).toBe('Hyper');
    });

    it('deve mapear temponivelmMeta entre 7 e 10 como speed "Turbo"', () => {
      const suprema = [makeSupremaTournament({ temponivelmMeta: 8 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].speed).toBe('Turbo');
    });

    it('deve mapear temponivelmMeta = 10 como speed "Turbo" (limite exato)', () => {
      const suprema = [makeSupremaTournament({ temponivelmMeta: 10 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].speed).toBe('Turbo');
    });

    it('deve mapear temponivelmMeta > 10 como speed "Normal"', () => {
      const suprema = [makeSupremaTournament({ temponivelmMeta: 15 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].speed).toBe('Normal');
    });

    it('deve mapear temponivelmMeta = 12 como speed "Normal"', () => {
      const suprema = [makeSupremaTournament({ temponivelmMeta: 12 })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].speed).toBe('Normal');
    });
  });

  // ===========================================================================
  // Deduplicacao por externalId
  // ===========================================================================

  describe('deduplicacao por externalId', () => {

    it('deve remover torneio que ja existe na biblioteca ativa (por externalId)', () => {
      const suprema = [makeSupremaTournament({ id: 100 })];
      const existing = [
        makeExistingLibrary({ externalId: 'suprema-100', deletedAt: null }),
      ];

      const result = processSupremaSync(suprema, existing);
      expect(result).toHaveLength(0);
    });

    it('deve remover torneio que ja existe na lixeira (por externalId)', () => {
      const suprema = [makeSupremaTournament({ id: 200 })];
      const existing = [
        makeExistingLibrary({ externalId: 'suprema-200', deletedAt: new Date() }),
      ];

      const result = processSupremaSync(suprema, existing);
      expect(result).toHaveLength(0);
    });

    it('deve manter torneio com externalId que nao existe nos existentes', () => {
      const suprema = [makeSupremaTournament({ id: 300 })];
      const existing = [
        makeExistingLibrary({ externalId: 'suprema-100' }),
        makeExistingLibrary({ externalId: 'suprema-200' }),
      ];

      const result = processSupremaSync(suprema, existing);
      expect(result).toHaveLength(1);
      expect(result[0].externalId).toBe('suprema-300');
    });

    it('deve filtrar apenas os duplicados mantendo os novos', () => {
      const suprema = [
        makeSupremaTournament({ id: 100, name: 'Existente' }),
        makeSupremaTournament({ id: 200, name: 'Novo 1' }),
        makeSupremaTournament({ id: 300, name: 'Novo 2' }),
      ];
      const existing = [
        makeExistingLibrary({ externalId: 'suprema-100' }),
      ];

      const result = processSupremaSync(suprema, existing);
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name)).toContain('Novo 1');
      expect(result.map((t) => t.name)).toContain('Novo 2');
    });
  });

  // ===========================================================================
  // Cenarios de array vazio
  // ===========================================================================

  describe('cenarios de array vazio', () => {

    it('deve retornar array vazio quando API retorna array vazio', () => {
      const result = processSupremaSync([], []);
      expect(result).toHaveLength(0);
    });

    it('deve retornar array vazio quando todos torneios ja existem', () => {
      const suprema = [
        makeSupremaTournament({ id: 100 }),
        makeSupremaTournament({ id: 200 }),
      ];
      const existing = [
        makeExistingLibrary({ externalId: 'suprema-100' }),
        makeExistingLibrary({ externalId: 'suprema-200' }),
      ];

      const result = processSupremaSync(suprema, existing);
      expect(result).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Todos novos (sem existentes)
  // ===========================================================================

  describe('todos novos', () => {

    it('deve retornar todos quando nao ha existentes na biblioteca', () => {
      const suprema = [
        makeSupremaTournament({ id: 100, name: 'T1' }),
        makeSupremaTournament({ id: 200, name: 'T2' }),
        makeSupremaTournament({ id: 300, name: 'T3' }),
      ];

      const result = processSupremaSync(suprema, []);
      expect(result).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Freeroll (buyin = 0)
  // ===========================================================================

  describe('freeroll', () => {

    it('deve incluir torneio com buyin=0 (freeroll)', () => {
      const suprema = [makeSupremaTournament({ id: 500, buyin: 0, name: 'Freeroll Suprema' })];
      const result = processSupremaSync(suprema, []);

      expect(result).toHaveLength(1);
      expect(result[0].buyIn).toBe('0');
      expect(result[0].name).toBe('Freeroll Suprema');
    });
  });

  // ===========================================================================
  // Horario meia-noite
  // ===========================================================================

  describe('horario edge case', () => {

    it('deve extrair horario correto para meia-noite', () => {
      const suprema = [makeSupremaTournament({ date: '2026-03-22 00:05:00' })];
      const result = processSupremaSync(suprema, []);

      expect(result[0].time).toBe('00:05');
    });
  });
});
