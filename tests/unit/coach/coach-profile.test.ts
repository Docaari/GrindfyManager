import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: Perfil IA do Jogador (AI Profile endpoints)
//
// Testa os endpoints GET/PUT /api/coach/profile e o compartilhamento
// do perfil entre os 3 coaches.
// Endpoints alvo: server/routes/coach.ts (AINDA NAO EXISTE)
//
// Todos devem FALHAR (red phase) — Implementer criara os endpoints.
// =============================================================================

// Mock do banco de dados
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    query: vi.fn(),
  },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  sql: vi.fn(),
}));

// Mock do schema
vi.mock('@shared/schema', () => ({
  userAiProfile: { id: 'user_ai_profile.id', userId: 'user_ai_profile.userId', content: 'user_ai_profile.content', version: 'user_ai_profile.version', tokenCount: 'user_ai_profile.tokenCount' },
}));

// Mock do nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-nanoid-id'),
}));

// Importacao do modulo que o Implementer vai criar
// Estas funcoes serao usadas internamente pelos endpoints
import {
  getCoachProfile,
  updateCoachProfile,
} from '../../../server/coachMemory';

import { db } from '../../../server/db';

const TEST_USER_ID = 'USER-0001';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const existingProfile = {
  id: 'profile-001',
  userId: TEST_USER_ID,
  content: '- Objetivo: chegar a $50 ABI\n- Estilo: tight-aggressive\n- Leak: tilt em PKOs',
  version: 3,
  tokenCount: 35,
  updatedAt: new Date('2026-04-01'),
};

// ---------------------------------------------------------------------------
// Setup mocks
// ---------------------------------------------------------------------------
function setupGetProfileMock(profile: any | null) {
  const mockFrom = vi.fn().mockReturnThis();
  const mockWhere = vi.fn().mockResolvedValue(profile ? [profile] : []);

  vi.mocked(db.select).mockReturnValue({
    from: mockFrom,
    where: mockWhere,
  } as any);
}

function setupUpdateProfileMock() {
  const mockUpdateSet = vi.fn().mockReturnThis();
  const mockUpdateWhere = vi.fn().mockResolvedValue([existingProfile]);

  vi.mocked(db.update).mockReturnValue({
    set: mockUpdateSet,
    where: mockUpdateWhere,
  } as any);

  return { mockUpdateSet, mockUpdateWhere };
}

// ---------------------------------------------------------------------------
// GET /api/coach/profile — getCoachProfile
// ---------------------------------------------------------------------------
describe('getCoachProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar perfil do usuario quando existe', async () => {
    setupGetProfileMock(existingProfile);

    const result = await getCoachProfile(TEST_USER_ID);

    expect(result).toBeDefined();
    expect(result.userId).toBe(TEST_USER_ID);
    expect(result.content).toContain('$50 ABI');
  });

  it('deve retornar perfil vazio/default quando nao existe', async () => {
    setupGetProfileMock(null);

    const result = await getCoachProfile(TEST_USER_ID);

    expect(result).toBeDefined();
    expect(result.content).toBe('');
    expect(result.version).toBe(1);
  });

  it('perfil deve ser compartilhado entre os 3 coaches (nao depende de coachType)', async () => {
    setupGetProfileMock(existingProfile);

    // O mesmo perfil deve ser retornado independente de qual coach esta pedindo
    const resultMental = await getCoachProfile(TEST_USER_ID);
    const resultTournament = await getCoachProfile(TEST_USER_ID);
    const resultTechnical = await getCoachProfile(TEST_USER_ID);

    // Todos retornam o mesmo perfil (mesmo userId)
    expect(resultMental.userId).toBe(resultTournament.userId);
    expect(resultTournament.userId).toBe(resultTechnical.userId);
  });

  it('deve retornar campos necessarios: content, version, tokenCount', async () => {
    setupGetProfileMock(existingProfile);

    const result = await getCoachProfile(TEST_USER_ID);

    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('version');
    expect(result).toHaveProperty('tokenCount');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/coach/profile — updateCoachProfile
// ---------------------------------------------------------------------------
describe('updateCoachProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve atualizar perfil manualmente com conteudo valido', async () => {
    const { mockUpdateSet } = setupUpdateProfileMock();

    const newContent = '- Objetivo: migrar para $100 ABI\n- Estilo: LAG';
    await updateCoachProfile(TEST_USER_ID, newContent);

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        content: newContent,
      })
    );
  });

  it('deve rejeitar conteudo acima de 2000 caracteres', async () => {
    const tooLongContent = 'x'.repeat(2001);

    await expect(
      updateCoachProfile(TEST_USER_ID, tooLongContent)
    ).rejects.toThrow();
  });

  it('deve aceitar conteudo vazio (limpar perfil)', async () => {
    setupUpdateProfileMock();

    await expect(
      updateCoachProfile(TEST_USER_ID, '')
    ).resolves.not.toThrow();
  });

  it('deve aceitar conteudo com exatamente 2000 caracteres', async () => {
    setupUpdateProfileMock();
    const maxContent = 'x'.repeat(2000);

    await expect(
      updateCoachProfile(TEST_USER_ID, maxContent)
    ).resolves.not.toThrow();
  });

  it('deve criar perfil se nao existia ao atualizar', async () => {
    // Mock: perfil nao existe
    const mockFrom = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue([]);
    vi.mocked(db.select).mockReturnValue({
      from: mockFrom,
      where: mockWhere,
    } as any);

    // Mock: insert
    const mockInsertValues = vi.fn().mockResolvedValue([]);
    vi.mocked(db.insert).mockReturnValue({
      values: mockInsertValues,
      onConflictDoUpdate: vi.fn().mockResolvedValue([]),
    } as any);

    await updateCoachProfile(TEST_USER_ID, 'Novo perfil');

    expect(mockInsertValues).toHaveBeenCalled();
  });

  it('perfil max 500 tokens / 2000 chars (validacao no service)', async () => {
    // O servico deve validar o tamanho antes de salvar
    const content2001 = 'a'.repeat(2001);

    await expect(
      updateCoachProfile(TEST_USER_ID, content2001)
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Compartilhamento cross-coach
// ---------------------------------------------------------------------------
describe('Compartilhamento cross-coach do perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('atualizacao via Coach Mental deve ser visivel para Coach Tecnico', async () => {
    // Atualizar perfil
    setupUpdateProfileMock();
    await updateCoachProfile(TEST_USER_ID, '- Leak: tilt em PKOs (visto pelo coach mental)');

    // Buscar perfil (que seria acessado pelo coach tecnico)
    setupGetProfileMock({
      ...existingProfile,
      content: '- Leak: tilt em PKOs (visto pelo coach mental)',
    });

    const result = await getCoachProfile(TEST_USER_ID);
    expect(result.content).toContain('tilt em PKOs');
  });

  it('perfil e unico por usuario (1:1), nao por coach', async () => {
    setupGetProfileMock(existingProfile);

    // Nao importa qual coach pede — retorna o mesmo perfil
    // A funcao getCoachProfile NAO recebe coachType como parametro
    const result = await getCoachProfile(TEST_USER_ID);
    expect(result.userId).toBe(TEST_USER_ID);
  });
});
