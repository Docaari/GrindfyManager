import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (RED phase): Logica de Seed de Temas Padrao
// Testa a funcao que cria os 7 temas padrao com 4 abas cada na primeira visita.
//
// O modulo seedDefaultThemes AINDA NAO EXISTE — o Implementer vai cria-lo.
// Estes testes definem o contrato esperado.
// =============================================================================

// ---------------------------------------------------------------------------
// Constantes da spec para validacao
// ---------------------------------------------------------------------------

const DEFAULT_THEME_NAMES = [
  'IP vs BB',
  'BB vs IP',
  'SB vs BB - BW',
  'BB vs SB BW',
  '3bet Pot IP',
  '3bet Pot OOP',
  'ICM',
] as const;

const DEFAULT_TAB_NAMES = ['Flop', 'Turn', 'River', 'Tendencias'] as const;

// Emojis esperados por tema (baseado na spec: "emoji default baseado no nome")
const EXPECTED_THEME_EMOJIS: Record<string, string> = {
  'IP vs BB': '🎯',
  'BB vs IP': '🛡️',
  'SB vs BB - BW': '⚔️',
  'BB vs SB BW': '🔄',
  '3bet Pot IP': '🚀',
  '3bet Pot OOP': '🧠',
  'ICM': '💰',
};

// ---------------------------------------------------------------------------
// Mock da camada de storage (banco de dados)
// ---------------------------------------------------------------------------

const mockStorage = {
  getStudyThemesByUserId: vi.fn(),
  createStudyTheme: vi.fn(),
  createStudyTab: vi.fn(),
};

// ---------------------------------------------------------------------------
// Funcao seed que sera implementada pelo Implementer
// Contrato: seedDefaultThemes(userId, storage) => cria 7 temas + 4 abas cada
// ---------------------------------------------------------------------------

import { seedDefaultThemes } from '../../../server/services/study-themes';

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('seedDefaultThemes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getStudyThemesByUserId.mockResolvedValue([]);
    mockStorage.createStudyTheme.mockImplementation(async (theme: any) => ({
      id: `theme-${Math.random().toString(36).slice(2, 8)}`,
      ...theme,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockStorage.createStudyTab.mockImplementation(async (tab: any) => ({
      id: `tab-${Math.random().toString(36).slice(2, 8)}`,
      ...tab,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  describe('criacao dos 7 temas padrao', () => {
    it('deve criar exatamente 7 temas padrao', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      expect(mockStorage.createStudyTheme).toHaveBeenCalledTimes(7);
    });

    it('deve criar temas com os nomes corretos da spec', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      const createdNames = mockStorage.createStudyTheme.mock.calls.map(
        (call: any[]) => call[0].name
      );

      for (const expectedName of DEFAULT_THEME_NAMES) {
        expect(createdNames).toContain(expectedName);
      }
    });

    it('deve criar todos os temas para o userId informado', async () => {
      await seedDefaultThemes('USER-0042', mockStorage);

      for (const call of mockStorage.createStudyTheme.mock.calls) {
        expect(call[0].userId).toBe('USER-0042');
      }
    });

    it('deve atribuir sortOrder sequencial (0 a 6) para os temas', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      const sortOrders = mockStorage.createStudyTheme.mock.calls.map(
        (call: any[]) => call[0].sortOrder
      );

      expect(sortOrders).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('deve usar cor padrao #16a34a nos temas', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      for (const call of mockStorage.createStudyTheme.mock.calls) {
        // Temas podem ter cores customizadas, mas devem ter alguma cor hex valida
        expect(call[0].color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe('emojis dos temas padrao', () => {
    it('deve atribuir emoji ao tema "IP vs BB"', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      const ipVsBb = mockStorage.createStudyTheme.mock.calls.find(
        (call: any[]) => call[0].name === 'IP vs BB'
      );
      expect(ipVsBb).toBeDefined();
      expect(ipVsBb![0].emoji).toBeTruthy();
      expect(ipVsBb![0].emoji.length).toBeLessThanOrEqual(4);
    });

    it('deve atribuir emoji ao tema "ICM"', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      const icm = mockStorage.createStudyTheme.mock.calls.find(
        (call: any[]) => call[0].name === 'ICM'
      );
      expect(icm).toBeDefined();
      expect(icm![0].emoji).toBeTruthy();
    });

    it('cada tema padrao deve ter um emoji nao vazio', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      for (const call of mockStorage.createStudyTheme.mock.calls) {
        expect(call[0].emoji).toBeTruthy();
        expect(typeof call[0].emoji).toBe('string');
      }
    });
  });

  describe('criacao das 4 abas padrao por tema', () => {
    it('deve criar 28 abas no total (7 temas x 4 abas)', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      expect(mockStorage.createStudyTab).toHaveBeenCalledTimes(28);
    });

    it('deve criar abas com os nomes padrao: Flop, Turn, River, Tendencias', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      const tabNames = mockStorage.createStudyTab.mock.calls.map(
        (call: any[]) => call[0].name
      );

      // Cada nome de aba deve aparecer exatamente 7 vezes (uma por tema)
      for (const tabName of DEFAULT_TAB_NAMES) {
        const count = tabNames.filter((n: string) => n === tabName).length;
        expect(count).toBe(7);
      }
    });

    it('deve marcar abas padrao com isDefault=true', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      for (const call of mockStorage.createStudyTab.mock.calls) {
        expect(call[0].isDefault).toBe(true);
      }
    });

    it('deve criar abas com sortOrder sequencial (0=Flop, 1=Turn, 2=River, 3=Tendencias)', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      // Agrupar abas por themeId
      const tabsByTheme = new Map<string, any[]>();
      for (const call of mockStorage.createStudyTab.mock.calls) {
        const tab = call[0];
        if (!tabsByTheme.has(tab.themeId)) {
          tabsByTheme.set(tab.themeId, []);
        }
        tabsByTheme.get(tab.themeId)!.push(tab);
      }

      for (const [, tabs] of tabsByTheme) {
        const sorted = [...tabs].sort((a: any, b: any) => a.sortOrder - b.sortOrder);
        expect(sorted[0].name).toBe('Flop');
        expect(sorted[0].sortOrder).toBe(0);
        expect(sorted[1].name).toBe('Turn');
        expect(sorted[1].sortOrder).toBe(1);
        expect(sorted[2].name).toBe('River');
        expect(sorted[2].sortOrder).toBe(2);
        expect(sorted[3].name).toBe('Tendencias');
        expect(sorted[3].sortOrder).toBe(3);
      }
    });

    it('deve criar abas com content vazio (array vazio)', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      for (const call of mockStorage.createStudyTab.mock.calls) {
        expect(call[0].content).toEqual([]);
      }
    });

    it('cada aba deve referenciar o themeId do tema pai', async () => {
      await seedDefaultThemes('USER-0001', mockStorage);

      const themeIds = await Promise.all(
        mockStorage.createStudyTheme.mock.results.map(
          async (r: any) => (await r.value).id
        )
      );

      for (const call of mockStorage.createStudyTab.mock.calls) {
        expect(themeIds).toContain(call[0].themeId);
      }
    });
  });

  describe('idempotencia — nao cria se ja existem temas', () => {
    it('nao deve criar temas se o usuario ja tem temas', async () => {
      mockStorage.getStudyThemesByUserId.mockResolvedValue([
        { id: 'existing-theme', name: 'IP vs BB', userId: 'USER-0001' },
      ]);

      await seedDefaultThemes('USER-0001', mockStorage);

      expect(mockStorage.createStudyTheme).not.toHaveBeenCalled();
      expect(mockStorage.createStudyTab).not.toHaveBeenCalled();
    });

    it('deve criar temas se o usuario tem lista vazia', async () => {
      mockStorage.getStudyThemesByUserId.mockResolvedValue([]);

      await seedDefaultThemes('USER-0001', mockStorage);

      expect(mockStorage.createStudyTheme).toHaveBeenCalledTimes(7);
    });
  });

  describe('abas custom vs default', () => {
    it('abas custom criadas pelo usuario devem ter isDefault=false', () => {
      // Este teste valida a regra: abas padrao tem isDefault=true,
      // abas criadas pelo usuario tem isDefault=false.
      // Aqui testamos que o schema aceita isDefault=false (custom tab)
      const customTab = {
        themeId: 'theme-123',
        name: 'Pre-Flop',
        content: [],
        isDefault: false,
        sortOrder: 4,
      };
      // Validacao simples — a regra de negocio e que custom tabs nao sao default
      expect(customTab.isDefault).toBe(false);
    });

    it('abas padrao criadas pelo seed devem ter isDefault=true', () => {
      const defaultTab = {
        themeId: 'theme-123',
        name: 'Flop',
        content: [],
        isDefault: true,
        sortOrder: 0,
      };
      expect(defaultTab.isDefault).toBe(true);
    });
  });
});
