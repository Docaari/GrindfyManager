import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: CRUD da Biblioteca de Torneios (storage layer)
//
// As funcoes de storage AINDA NAO EXISTEM.
// O Implementer vai cria-las em:
//   server/storage.ts (ou server/storage/tournament-library.ts)
//
// Como os testes unitarios do projeto testam funcoes puras e schemas
// (sem mock de banco), estes testes validam a LOGICA das operacoes
// de storage usando funcoes utilitarias que encapsulam as regras de negocio.
//
// Modo: TDD — todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports das funcoes que AINDA NAO EXISTEM — serao criadas pelo Implementer
// ---------------------------------------------------------------------------
import {
  createLibraryTournament,
  getLibraryTournaments,
  getLibraryTournament,
  updateLibraryTournament,
  trashLibraryTournament,
  restoreLibraryTournament,
  deleteLibraryTournament,
  getLibraryTrash,
  cleanupExpiredTrash,
} from '../../../server/storage';

// ---------------------------------------------------------------------------
// Tipos para os testes
// ---------------------------------------------------------------------------
import type { TournamentLibrary, InsertTournamentLibrary } from '../../../shared/schema';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
function makeInsertData(overrides: Partial<InsertTournamentLibrary> = {}): InsertTournamentLibrary {
  return {
    userId: 'USER-0001',
    name: 'Daily $22 PKO',
    site: 'GGPoker',
    buyIn: '22.00',
    source: 'manual',
    ...overrides,
  };
}

// =============================================================================
// createLibraryTournament
// =============================================================================

describe('createLibraryTournament', () => {

  it('deve criar torneio com dados validos e retornar com id gerado', async () => {
    const data = makeInsertData();
    const result = await createLibraryTournament(data);

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
  });

  it('deve retornar torneio com timestamps createdAt e updatedAt', async () => {
    const data = makeInsertData();
    const result = await createLibraryTournament(data);

    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  it('deve preservar source informado (manual)', async () => {
    const data = makeInsertData({ source: 'manual' });
    const result = await createLibraryTournament(data);

    expect(result.source).toBe('manual');
  });

  it('deve preservar source informado (suprema)', async () => {
    const data = makeInsertData({ source: 'suprema', externalId: 'suprema-123' });
    const result = await createLibraryTournament(data);

    expect(result.source).toBe('suprema');
    expect(result.externalId).toBe('suprema-123');
  });

  it('deve preservar source informado (grind-live)', async () => {
    const data = makeInsertData({ source: 'grind-live' });
    const result = await createLibraryTournament(data);

    expect(result.source).toBe('grind-live');
  });

  it('deve criar torneio com deletedAt null (ativo por padrao)', async () => {
    const data = makeInsertData();
    const result = await createLibraryTournament(data);

    expect(result.deletedAt).toBeNull();
  });

  it('deve preservar campos opcionais quando informados', async () => {
    const data = makeInsertData({
      guaranteed: '50000.00',
      time: '20:00',
      type: 'PKO',
      speed: 'Turbo',
      fieldSize: 1500,
    });
    const result = await createLibraryTournament(data);

    expect(result.guaranteed).toBe('50000.00');
    expect(result.time).toBe('20:00');
    expect(result.type).toBe('PKO');
    expect(result.speed).toBe('Turbo');
    expect(result.fieldSize).toBe(1500);
  });
});

// =============================================================================
// getLibraryTournaments
// =============================================================================

describe('getLibraryTournaments', () => {

  it('deve retornar apenas torneios ativos (deletedAt IS NULL) do usuario', async () => {
    // Setup: criar torneios ativos e na lixeira
    const userId = 'USER-0001';
    await createLibraryTournament(makeInsertData({ userId, name: 'Ativo 1' }));
    await createLibraryTournament(makeInsertData({ userId, name: 'Ativo 2' }));
    const trashed = await createLibraryTournament(makeInsertData({ userId, name: 'Na Lixeira' }));
    await trashLibraryTournament(trashed.id);

    const result = await getLibraryTournaments(userId);

    expect(result.length).toBe(2);
    expect(result.every((t) => t.deletedAt === null)).toBe(true);
    expect(result.map((t) => t.name)).toContain('Ativo 1');
    expect(result.map((t) => t.name)).toContain('Ativo 2');
    expect(result.map((t) => t.name)).not.toContain('Na Lixeira');
  });

  it('deve retornar array vazio quando usuario nao tem torneios', async () => {
    const result = await getLibraryTournaments('USER-9999');
    expect(result).toEqual([]);
  });

  it('deve nao retornar torneios de outros usuarios', async () => {
    await createLibraryTournament(makeInsertData({ userId: 'USER-0001', name: 'Meu Torneio' }));
    await createLibraryTournament(makeInsertData({ userId: 'USER-0002', name: 'Torneio do Outro' }));

    const result = await getLibraryTournaments('USER-0001');

    expect(result.every((t) => t.userId === 'USER-0001')).toBe(true);
    expect(result.map((t) => t.name)).not.toContain('Torneio do Outro');
  });
});

// =============================================================================
// getLibraryTournament
// =============================================================================

describe('getLibraryTournament', () => {

  it('deve retornar torneio por id', async () => {
    const created = await createLibraryTournament(makeInsertData({ name: 'Torneio Unico' }));
    const result = await getLibraryTournament(created.id);

    expect(result).toBeDefined();
    expect(result!.id).toBe(created.id);
    expect(result!.name).toBe('Torneio Unico');
  });

  it('deve retornar null/undefined quando id nao existe', async () => {
    const result = await getLibraryTournament('nao-existe-id');
    expect(result).toBeFalsy();
  });
});

// =============================================================================
// updateLibraryTournament
// =============================================================================

describe('updateLibraryTournament', () => {

  it('deve atualizar campos e retornar torneio atualizado', async () => {
    const created = await createLibraryTournament(makeInsertData({ name: 'Original' }));
    const result = await updateLibraryTournament(created.id, { name: 'Atualizado' });

    expect(result).toBeDefined();
    expect(result!.name).toBe('Atualizado');
  });

  it('deve atualizar buyIn', async () => {
    const created = await createLibraryTournament(makeInsertData({ buyIn: '22.00' }));
    const result = await updateLibraryTournament(created.id, { buyIn: '55.00' });

    expect(result!.buyIn).toBe('55.00');
  });

  it('deve atualizar type e speed', async () => {
    const created = await createLibraryTournament(makeInsertData({ type: 'Vanilla', speed: 'Normal' }));
    const result = await updateLibraryTournament(created.id, { type: 'PKO', speed: 'Turbo' });

    expect(result!.type).toBe('PKO');
    expect(result!.speed).toBe('Turbo');
  });

  it('deve manter campos nao atualizados inalterados', async () => {
    const created = await createLibraryTournament(makeInsertData({
      name: 'Torneio',
      site: 'GGPoker',
      buyIn: '22.00',
    }));
    const result = await updateLibraryTournament(created.id, { name: 'Novo Nome' });

    expect(result!.name).toBe('Novo Nome');
    expect(result!.site).toBe('GGPoker');
    expect(result!.buyIn).toBe('22.00');
  });
});

// =============================================================================
// trashLibraryTournament (soft delete)
// =============================================================================

describe('trashLibraryTournament', () => {

  it('deve setar deletedAt com timestamp atual (soft delete)', async () => {
    const created = await createLibraryTournament(makeInsertData());
    expect(created.deletedAt).toBeNull();

    const result = await trashLibraryTournament(created.id);

    expect(result).toBeDefined();
    expect(result!.deletedAt).toBeDefined();
    expect(result!.deletedAt).not.toBeNull();
    expect(result!.deletedAt).toBeInstanceOf(Date);
  });

  it('deve remover torneio da listagem ativa apos soft delete', async () => {
    const userId = 'USER-0001';
    const created = await createLibraryTournament(makeInsertData({ userId }));
    await trashLibraryTournament(created.id);

    const actives = await getLibraryTournaments(userId);
    expect(actives.map((t) => t.id)).not.toContain(created.id);
  });
});

// =============================================================================
// restoreLibraryTournament
// =============================================================================

describe('restoreLibraryTournament', () => {

  it('deve setar deletedAt para null (restaurar da lixeira)', async () => {
    const created = await createLibraryTournament(makeInsertData());
    await trashLibraryTournament(created.id);

    const result = await restoreLibraryTournament(created.id);

    expect(result).toBeDefined();
    expect(result!.deletedAt).toBeNull();
  });

  it('deve torneio voltar a aparecer na listagem ativa apos restauracao', async () => {
    const userId = 'USER-0001';
    const created = await createLibraryTournament(makeInsertData({ userId, name: 'Restaurado' }));
    await trashLibraryTournament(created.id);
    await restoreLibraryTournament(created.id);

    const actives = await getLibraryTournaments(userId);
    expect(actives.map((t) => t.name)).toContain('Restaurado');
  });
});

// =============================================================================
// deleteLibraryTournament (hard delete)
// =============================================================================

describe('deleteLibraryTournament', () => {

  it('deve remover torneio permanentemente do banco', async () => {
    const created = await createLibraryTournament(makeInsertData());
    await deleteLibraryTournament(created.id);

    const result = await getLibraryTournament(created.id);
    expect(result).toBeFalsy();
  });

  it('deve nao aparecer na lixeira apos delete permanente', async () => {
    const userId = 'USER-0001';
    const created = await createLibraryTournament(makeInsertData({ userId }));
    await trashLibraryTournament(created.id);
    await deleteLibraryTournament(created.id);

    const trash = await getLibraryTrash(userId);
    expect(trash.map((t) => t.id)).not.toContain(created.id);
  });
});

// =============================================================================
// getLibraryTrash
// =============================================================================

describe('getLibraryTrash', () => {

  it('deve retornar apenas torneios com deletedAt preenchido', async () => {
    const userId = 'USER-0001';
    await createLibraryTournament(makeInsertData({ userId, name: 'Ativo' }));
    const toTrash = await createLibraryTournament(makeInsertData({ userId, name: 'Lixeira' }));
    await trashLibraryTournament(toTrash.id);

    const result = await getLibraryTrash(userId);

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Lixeira');
    expect(result[0].deletedAt).not.toBeNull();
  });

  it('deve retornar array vazio quando lixeira esta vazia', async () => {
    const result = await getLibraryTrash('USER-9999');
    expect(result).toEqual([]);
  });

  it('deve nao retornar lixeira de outros usuarios', async () => {
    const t1 = await createLibraryTournament(makeInsertData({ userId: 'USER-0001', name: 'Meu Lixo' }));
    const t2 = await createLibraryTournament(makeInsertData({ userId: 'USER-0002', name: 'Lixo Alheio' }));
    await trashLibraryTournament(t1.id);
    await trashLibraryTournament(t2.id);

    const result = await getLibraryTrash('USER-0001');

    expect(result.every((t) => t.userId === 'USER-0001')).toBe(true);
    expect(result.map((t) => t.name)).not.toContain('Lixo Alheio');
  });
});

// =============================================================================
// cleanupExpiredTrash
// =============================================================================

describe('cleanupExpiredTrash', () => {

  it('deve deletar torneios na lixeira ha mais de N dias', async () => {
    const userId = 'USER-0001';
    const old = await createLibraryTournament(makeInsertData({ userId, name: 'Antigo' }));
    await trashLibraryTournament(old.id);
    // Simular deletedAt ha 8 dias atras
    await updateLibraryTournament(old.id, {
      deletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    } as any);

    const recent = await createLibraryTournament(makeInsertData({ userId, name: 'Recente' }));
    await trashLibraryTournament(recent.id);

    const deleted = await cleanupExpiredTrash(7);

    expect(deleted).toBeGreaterThanOrEqual(1);

    // Torneio antigo foi removido
    const oldResult = await getLibraryTournament(old.id);
    expect(oldResult).toBeFalsy();

    // Torneio recente permanece na lixeira
    const recentResult = await getLibraryTournament(recent.id);
    expect(recentResult).toBeDefined();
  });

  it('deve retornar 0 quando nao ha itens expirados', async () => {
    const deleted = await cleanupExpiredTrash(7);
    expect(deleted).toBe(0);
  });
});
