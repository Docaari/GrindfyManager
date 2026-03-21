import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Importacao de Torneios do Grind-Live para Biblioteca
//
// A funcao extractImportableTournaments AINDA NAO EXISTE.
// O Implementer vai cria-la em:
//   shared/library-import.ts (ou server/library-import.ts)
//
// Regras de importacao (da spec):
// - Extrair campos relevantes dos session_tournaments: name, site, buyIn,
//   guaranteed, time, type, speed
// - Remover duplicatas contra existentes (ativos + lixeira) via
//   filterNewTournaments de library-dedup.ts
// - Agrupar por sessionId
// - Retornar array com source='grind-live'
// - Torneio sem name usa fallback "Torneio $buyIn $site"
// - Torneio com buyIn=0 (freeroll) incluido normalmente
//
// Modo: TDD — todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import da funcao que AINDA NAO EXISTE — sera criada pelo Implementer
// ---------------------------------------------------------------------------
import { extractImportableTournaments } from '../../../shared/library-import';

// ---------------------------------------------------------------------------
// Tipos para os testes (baseados em session_tournaments + tournament_library)
// ---------------------------------------------------------------------------
interface SessionTournament {
  id: string;
  sessionId: string;
  userId: string;
  name: string | null;
  site: string;
  buyIn: string;
  guaranteed: string | null;
  time: string | null;
  type: string | null;
  speed: string | null;
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
function makeSessionTournament(overrides: Partial<SessionTournament> = {}): SessionTournament {
  return {
    id: 'st-001',
    sessionId: 'session-001',
    userId: 'USER-0001',
    name: 'Daily $22 PKO',
    site: 'GGPoker',
    buyIn: '22.00',
    guaranteed: '50000.00',
    time: '20:00',
    type: 'PKO',
    speed: 'Normal',
    ...overrides,
  };
}

function makeExistingLibrary(overrides: Partial<ExistingLibraryItem> = {}): ExistingLibraryItem {
  return {
    id: 'lib-001',
    name: 'Existing Tournament',
    site: 'PokerStars',
    buyIn: '55.00',
    externalId: null,
    deletedAt: null,
    userId: 'USER-0001',
    ...overrides,
  };
}

// =============================================================================
// Extracao de campos relevantes
// =============================================================================

describe('extractImportableTournaments', () => {

  describe('extracao de campos', () => {

    it('deve extrair name, site, buyIn, guaranteed, time, type, speed do session tournament', () => {
      const sessions = [
        makeSessionTournament({
          name: 'Daily $22 PKO',
          site: 'GGPoker',
          buyIn: '22.00',
          guaranteed: '50000.00',
          time: '20:00',
          type: 'PKO',
          speed: 'Normal',
        }),
      ];
      const result = extractImportableTournaments(sessions, []);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Daily $22 PKO');
      expect(result[0].site).toBe('GGPoker');
      expect(result[0].buyIn).toBe('22.00');
      expect(result[0].guaranteed).toBe('50000.00');
      expect(result[0].time).toBe('20:00');
      expect(result[0].type).toBe('PKO');
      expect(result[0].speed).toBe('Normal');
    });

    it('deve setar source como "grind-live" em todos os torneios extraidos', () => {
      const sessions = [
        makeSessionTournament({ name: 'T1' }),
        makeSessionTournament({ id: 'st-002', name: 'T2' }),
      ];
      const result = extractImportableTournaments(sessions, []);

      expect(result.every((t) => t.source === 'grind-live')).toBe(true);
    });

    it('deve setar externalId como null (grind-live nao tem externalId)', () => {
      const sessions = [makeSessionTournament()];
      const result = extractImportableTournaments(sessions, []);

      expect(result[0].externalId).toBeNull();
    });
  });

  // ===========================================================================
  // Deduplicacao
  // ===========================================================================

  describe('deduplicacao contra biblioteca existente', () => {

    it('deve remover torneios que ja existem na biblioteca ativa (por name+site+buyIn)', () => {
      const sessions = [
        makeSessionTournament({ name: 'Daily $22 PKO', site: 'GGPoker', buyIn: '22.00' }),
      ];
      const existing = [
        makeExistingLibrary({ name: 'Daily $22 PKO', site: 'GGPoker', buyIn: '22.00', deletedAt: null }),
      ];

      const result = extractImportableTournaments(sessions, existing);
      expect(result).toHaveLength(0);
    });

    it('deve remover torneios que ja existem na lixeira (deletedAt != null)', () => {
      const sessions = [
        makeSessionTournament({ name: 'Old Tournament', site: 'PokerStars', buyIn: '55.00' }),
      ];
      const existing = [
        makeExistingLibrary({
          name: 'Old Tournament',
          site: 'PokerStars',
          buyIn: '55.00',
          deletedAt: new Date(),
        }),
      ];

      const result = extractImportableTournaments(sessions, existing);
      expect(result).toHaveLength(0);
    });

    it('deve manter torneios que nao existem na biblioteca', () => {
      const sessions = [
        makeSessionTournament({ name: 'Novo Torneio', site: 'GGPoker', buyIn: '33.00' }),
      ];
      const existing = [
        makeExistingLibrary({ name: 'Outro Torneio', site: 'GGPoker', buyIn: '22.00' }),
      ];

      const result = extractImportableTournaments(sessions, existing);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Novo Torneio');
    });

    it('deve ser case-insensitive na comparacao de name para dedup', () => {
      const sessions = [
        makeSessionTournament({ name: 'DAILY $22 PKO', site: 'GGPoker', buyIn: '22.00' }),
      ];
      const existing = [
        makeExistingLibrary({ name: 'daily $22 pko', site: 'GGPoker', buyIn: '22.00' }),
      ];

      const result = extractImportableTournaments(sessions, existing);
      expect(result).toHaveLength(0);
    });

    it('deve manter torneio com mesmo nome mas site diferente', () => {
      const sessions = [
        makeSessionTournament({ name: 'Daily $22', site: 'PokerStars', buyIn: '22.00' }),
      ];
      const existing = [
        makeExistingLibrary({ name: 'Daily $22', site: 'GGPoker', buyIn: '22.00' }),
      ];

      const result = extractImportableTournaments(sessions, existing);
      expect(result).toHaveLength(1);
    });

    it('deve manter torneio com mesmo nome e site mas buyIn diferente', () => {
      const sessions = [
        makeSessionTournament({ name: 'Daily PKO', site: 'GGPoker', buyIn: '55.00' }),
      ];
      const existing = [
        makeExistingLibrary({ name: 'Daily PKO', site: 'GGPoker', buyIn: '22.00' }),
      ];

      const result = extractImportableTournaments(sessions, existing);
      expect(result).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Fallback de name
  // ===========================================================================

  describe('fallback de name', () => {

    it('deve usar fallback "Torneio $buyIn $site" quando name e null', () => {
      const sessions = [
        makeSessionTournament({ name: null, site: 'GGPoker', buyIn: '22.00' }),
      ];
      const result = extractImportableTournaments(sessions, []);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Torneio $22.00 GGPoker');
    });

    it('deve usar fallback quando name e string vazia', () => {
      const sessions = [
        makeSessionTournament({ name: '', site: 'PokerStars', buyIn: '55.00' }),
      ];
      const result = extractImportableTournaments(sessions, []);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Torneio $55.00 PokerStars');
    });
  });

  // ===========================================================================
  // Freeroll (buyIn = 0)
  // ===========================================================================

  describe('freeroll (buyIn = 0)', () => {

    it('deve incluir torneio com buyIn=0 (freeroll) normalmente', () => {
      const sessions = [
        makeSessionTournament({ name: 'Freeroll Sunday', buyIn: '0', site: 'PokerStars' }),
      ];
      const result = extractImportableTournaments(sessions, []);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Freeroll Sunday');
      expect(result[0].buyIn).toBe('0');
    });

    it('deve usar fallback para freeroll sem nome', () => {
      const sessions = [
        makeSessionTournament({ name: null, buyIn: '0', site: 'GGPoker' }),
      ];
      const result = extractImportableTournaments(sessions, []);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Torneio $0 GGPoker');
    });
  });

  // ===========================================================================
  // Sessao sem torneios novos
  // ===========================================================================

  describe('sessao sem torneios novos', () => {

    it('deve retornar array vazio quando todos torneios ja existem', () => {
      const sessions = [
        makeSessionTournament({ name: 'T1', site: 'GGPoker', buyIn: '22.00' }),
        makeSessionTournament({ id: 'st-002', name: 'T2', site: 'PokerStars', buyIn: '55.00' }),
      ];
      const existing = [
        makeExistingLibrary({ name: 'T1', site: 'GGPoker', buyIn: '22.00' }),
        makeExistingLibrary({ name: 'T2', site: 'PokerStars', buyIn: '55.00' }),
      ];

      const result = extractImportableTournaments(sessions, existing);
      expect(result).toHaveLength(0);
    });

    it('deve retornar array vazio quando input esta vazio', () => {
      const result = extractImportableTournaments([], []);
      expect(result).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Deduplicacao interna (torneios repetidos entre sessoes)
  // ===========================================================================

  describe('deduplicacao interna entre sessoes', () => {

    it('deve remover duplicatas internas quando mesmo torneio aparece em varias sessoes', () => {
      const sessions = [
        makeSessionTournament({
          id: 'st-001',
          sessionId: 'session-001',
          name: 'Daily $22 PKO',
          site: 'GGPoker',
          buyIn: '22.00',
        }),
        makeSessionTournament({
          id: 'st-002',
          sessionId: 'session-002',
          name: 'Daily $22 PKO',
          site: 'GGPoker',
          buyIn: '22.00',
        }),
      ];

      const result = extractImportableTournaments(sessions, []);

      // Mesmo torneio em 2 sessoes diferentes deve resultar em apenas 1 importacao
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Daily $22 PKO');
    });
  });

  // ===========================================================================
  // Multiplos torneios de sessoes diferentes
  // ===========================================================================

  describe('multiplos torneios validos', () => {

    it('deve retornar todos torneios novos de diferentes sessoes', () => {
      const sessions = [
        makeSessionTournament({
          id: 'st-001',
          sessionId: 'session-001',
          name: 'T1',
          site: 'GGPoker',
          buyIn: '22.00',
        }),
        makeSessionTournament({
          id: 'st-002',
          sessionId: 'session-001',
          name: 'T2',
          site: 'PokerStars',
          buyIn: '55.00',
        }),
        makeSessionTournament({
          id: 'st-003',
          sessionId: 'session-002',
          name: 'T3',
          site: 'Suprema',
          buyIn: '11.00',
        }),
      ];

      const result = extractImportableTournaments(sessions, []);
      expect(result).toHaveLength(3);
    });

    it('deve filtrar apenas os duplicados mantendo os novos', () => {
      const sessions = [
        makeSessionTournament({ id: 'st-001', name: 'Existente', site: 'GGPoker', buyIn: '22.00' }),
        makeSessionTournament({ id: 'st-002', name: 'Novo 1', site: 'GGPoker', buyIn: '33.00' }),
        makeSessionTournament({ id: 'st-003', name: 'Novo 2', site: 'PokerStars', buyIn: '55.00' }),
      ];
      const existing = [
        makeExistingLibrary({ name: 'Existente', site: 'GGPoker', buyIn: '22.00' }),
      ];

      const result = extractImportableTournaments(sessions, existing);
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name)).toContain('Novo 1');
      expect(result.map((t) => t.name)).toContain('Novo 2');
    });
  });
});
