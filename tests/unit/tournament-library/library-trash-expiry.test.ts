import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Logica de Expiracao da Lixeira da Biblioteca
//
// A funcao getExpiredTrashItems AINDA NAO EXISTE.
// O Implementer vai cria-la em:
//   shared/library-trash.ts (ou server/library-trash.ts)
//
// Regras de expiracao (da spec):
// - Lixeira expira em 7 dias (configuravel via maxAgeDays)
// - Item com deletedAt ha mais de maxAgeDays -> expirado (incluir)
// - Item com deletedAt ha menos de maxAgeDays -> valido (excluir)
// - Item com deletedAt ha exatamente maxAgeDays -> expirado (incluir, no limite)
// - Lista vazia -> array vazio
//
// Modo: TDD — todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import da funcao que AINDA NAO EXISTE — sera criada pelo Implementer
// ---------------------------------------------------------------------------
import { getExpiredTrashItems } from '../../../shared/library-trash';

// ---------------------------------------------------------------------------
// Tipos para os testes
// ---------------------------------------------------------------------------
interface TrashItem {
  id: string;
  name: string;
  deletedAt: Date;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function makeTrashItem(overrides: Partial<TrashItem> & { deletedAt: Date }): TrashItem {
  return {
    id: 'lib-001',
    name: 'Torneio na Lixeira',
    userId: 'USER-0001',
    site: 'GGPoker',
    buyIn: '22.00',
    ...overrides,
  };
}

// =============================================================================
// getExpiredTrashItems
// =============================================================================

describe('getExpiredTrashItems', () => {

  // -------------------------------------------------------------------------
  // Expiracao basica
  // -------------------------------------------------------------------------

  it('deve incluir item com deletedAt ha 8 dias quando maxAge=7', () => {
    const trash = [
      makeTrashItem({ id: 'lib-old', deletedAt: daysAgo(8) }),
    ];

    const result = getExpiredTrashItems(trash, 7);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('lib-old');
  });

  it('deve excluir item com deletedAt ha 6 dias quando maxAge=7', () => {
    const trash = [
      makeTrashItem({ id: 'lib-recent', deletedAt: daysAgo(6) }),
    ];

    const result = getExpiredTrashItems(trash, 7);

    expect(result).toHaveLength(0);
  });

  it('deve incluir item com deletedAt ha exatamente 7 dias quando maxAge=7 (no limite)', () => {
    const trash = [
      makeTrashItem({ id: 'lib-exact', deletedAt: daysAgo(7) }),
    ];

    const result = getExpiredTrashItems(trash, 7);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('lib-exact');
  });

  // -------------------------------------------------------------------------
  // Filtragem mista
  // -------------------------------------------------------------------------

  it('deve filtrar corretamente mistura de expirados e validos', () => {
    const trash = [
      makeTrashItem({ id: 'lib-expired-1', name: 'Expirado 1', deletedAt: daysAgo(10) }),
      makeTrashItem({ id: 'lib-valid-1', name: 'Valido 1', deletedAt: daysAgo(3) }),
      makeTrashItem({ id: 'lib-expired-2', name: 'Expirado 2', deletedAt: daysAgo(8) }),
      makeTrashItem({ id: 'lib-valid-2', name: 'Valido 2', deletedAt: daysAgo(1) }),
      makeTrashItem({ id: 'lib-exact', name: 'No Limite', deletedAt: daysAgo(7) }),
    ];

    const result = getExpiredTrashItems(trash, 7);

    expect(result).toHaveLength(3);
    expect(result.map((t) => t.id)).toContain('lib-expired-1');
    expect(result.map((t) => t.id)).toContain('lib-expired-2');
    expect(result.map((t) => t.id)).toContain('lib-exact');
    expect(result.map((t) => t.id)).not.toContain('lib-valid-1');
    expect(result.map((t) => t.id)).not.toContain('lib-valid-2');
  });

  // -------------------------------------------------------------------------
  // Lista vazia
  // -------------------------------------------------------------------------

  it('deve retornar array vazio quando lista de trash esta vazia', () => {
    const result = getExpiredTrashItems([], 7);
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Todos expirados
  // -------------------------------------------------------------------------

  it('deve retornar todos quando todos estao expirados', () => {
    const trash = [
      makeTrashItem({ id: 'lib-1', deletedAt: daysAgo(30) }),
      makeTrashItem({ id: 'lib-2', deletedAt: daysAgo(14) }),
      makeTrashItem({ id: 'lib-3', deletedAt: daysAgo(8) }),
    ];

    const result = getExpiredTrashItems(trash, 7);

    expect(result).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Nenhum expirado
  // -------------------------------------------------------------------------

  it('deve retornar array vazio quando nenhum esta expirado', () => {
    const trash = [
      makeTrashItem({ id: 'lib-1', deletedAt: daysAgo(1) }),
      makeTrashItem({ id: 'lib-2', deletedAt: daysAgo(3) }),
      makeTrashItem({ id: 'lib-3', deletedAt: daysAgo(5) }),
    ];

    const result = getExpiredTrashItems(trash, 7);

    expect(result).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // maxAgeDays diferente de 7
  // -------------------------------------------------------------------------

  it('deve respeitar maxAgeDays customizado (30 dias)', () => {
    const trash = [
      makeTrashItem({ id: 'lib-1', deletedAt: daysAgo(31) }),
      makeTrashItem({ id: 'lib-2', deletedAt: daysAgo(29) }),
    ];

    const result = getExpiredTrashItems(trash, 30);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('lib-1');
  });

  it('deve respeitar maxAgeDays = 1 (expiracao rapida)', () => {
    const trash = [
      makeTrashItem({ id: 'lib-1', deletedAt: daysAgo(2) }),
      makeTrashItem({ id: 'lib-2', deletedAt: daysAgo(0.5) }),
    ];

    const result = getExpiredTrashItems(trash, 1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('lib-1');
  });

  // -------------------------------------------------------------------------
  // Item deletado agora (ha 0 dias)
  // -------------------------------------------------------------------------

  it('deve excluir item deletado agora (ha 0 dias)', () => {
    const trash = [
      makeTrashItem({ id: 'lib-now', deletedAt: new Date() }),
    ];

    const result = getExpiredTrashItems(trash, 7);

    expect(result).toHaveLength(0);
  });
});
