import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (RED phase): Logica de CRUD para Study Tabs
// Testa as regras de negocio para criacao, atualizacao e delecao de abas.
//
// Os servicos/funcoes testados AINDA NAO EXISTEM — o Implementer vai cria-los.
// =============================================================================

// ---------------------------------------------------------------------------
// Mock da camada de storage
// ---------------------------------------------------------------------------

const mockStorage = {
  getStudyTabById: vi.fn(),
  createStudyTab: vi.fn(),
  updateStudyTab: vi.fn(),
  deleteStudyTab: vi.fn(),
  getStudyTabsByThemeId: vi.fn(),
  updateStudyTheme: vi.fn(),
};

// ---------------------------------------------------------------------------
// Servico que sera implementado pelo Implementer
// Contrato esperado baseado na spec:
// ---------------------------------------------------------------------------

import { StudyTabsService } from '../../../server/services/study-tabs';

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('StudyTabsService', () => {
  let service: StudyTabsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StudyTabsService(mockStorage);

    mockStorage.createStudyTab.mockImplementation(async (tab: any) => ({
      id: 'tab-new-123',
      ...tab,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  describe('createTab', () => {
    it('deve criar aba customizada com nome valido', async () => {
      const result = await service.createTab({
        themeId: 'theme-001',
        name: 'Pre-Flop',
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Pre-Flop');
      expect(result.themeId).toBe('theme-001');
      expect(mockStorage.createStudyTab).toHaveBeenCalledOnce();
    });

    it('deve criar aba com isDefault=false por padrao (aba customizada)', async () => {
      const result = await service.createTab({
        themeId: 'theme-001',
        name: 'Minha Aba',
      });

      expect(result.isDefault).toBe(false);
    });

    it('deve criar aba com content vazio por padrao', async () => {
      const result = await service.createTab({
        themeId: 'theme-001',
        name: 'Nova Aba',
      });

      expect(result.content).toEqual([]);
    });

    it('deve calcular sortOrder baseado nas abas existentes do tema', async () => {
      mockStorage.getStudyTabsByThemeId.mockResolvedValue([
        { id: '1', sortOrder: 0 },
        { id: '2', sortOrder: 1 },
        { id: '3', sortOrder: 2 },
        { id: '4', sortOrder: 3 },
      ]);

      const result = await service.createTab({
        themeId: 'theme-001',
        name: 'Quinta Aba',
      });

      // Deve ser colocada apos as abas existentes
      expect(result.sortOrder).toBe(4);
    });
  });

  describe('deleteTab', () => {
    it('deve rejeitar delecao de aba padrao (isDefault=true)', async () => {
      mockStorage.getStudyTabById.mockResolvedValue({
        id: 'tab-flop',
        name: 'Flop',
        isDefault: true,
        themeId: 'theme-001',
      });

      await expect(service.deleteTab('tab-flop')).rejects.toThrow();
    });

    it('deve permitir delecao de aba customizada (isDefault=false)', async () => {
      mockStorage.getStudyTabById.mockResolvedValue({
        id: 'tab-custom',
        name: 'Minha Aba',
        isDefault: false,
        themeId: 'theme-001',
      });
      mockStorage.deleteStudyTab.mockResolvedValue(undefined);

      await expect(service.deleteTab('tab-custom')).resolves.not.toThrow();
      expect(mockStorage.deleteStudyTab).toHaveBeenCalledWith('tab-custom');
    });

    it('deve rejeitar delecao de aba "Flop" (padrao)', async () => {
      mockStorage.getStudyTabById.mockResolvedValue({
        id: 'tab-flop',
        name: 'Flop',
        isDefault: true,
        themeId: 'theme-001',
      });

      await expect(service.deleteTab('tab-flop')).rejects.toThrow(
        /padrao|default|cannot delete/i
      );
    });

    it('deve rejeitar delecao de aba "Tendencias" (padrao)', async () => {
      mockStorage.getStudyTabById.mockResolvedValue({
        id: 'tab-tend',
        name: 'Tendencias',
        isDefault: true,
        themeId: 'theme-001',
      });

      await expect(service.deleteTab('tab-tend')).rejects.toThrow(
        /padrao|default|cannot delete/i
      );
    });

    it('deve lancar erro se aba nao existe', async () => {
      mockStorage.getStudyTabById.mockResolvedValue(null);

      await expect(service.deleteTab('tab-nonexistent')).rejects.toThrow();
    });
  });

  describe('updateTabContent', () => {
    it('deve salvar content como JSON array (formato BlockNote)', async () => {
      const content = [
        { id: '1', type: 'paragraph', content: [{ type: 'text', text: 'Analise do spot' }] },
      ];

      mockStorage.getStudyTabById.mockResolvedValue({
        id: 'tab-001',
        themeId: 'theme-001',
        content: [],
      });
      mockStorage.updateStudyTab.mockResolvedValue({
        id: 'tab-001',
        content,
        updatedAt: new Date(),
      });

      const result = await service.updateTabContent('tab-001', content);

      expect(result.content).toEqual(content);
      expect(mockStorage.updateStudyTab).toHaveBeenCalledWith(
        'tab-001',
        expect.objectContaining({ content })
      );
    });

    it('deve aceitar content vazio (array vazio) para limpar aba', async () => {
      mockStorage.getStudyTabById.mockResolvedValue({
        id: 'tab-001',
        themeId: 'theme-001',
        content: [{ id: '1', type: 'paragraph' }],
      });
      mockStorage.updateStudyTab.mockResolvedValue({
        id: 'tab-001',
        content: [],
        updatedAt: new Date(),
      });

      const result = await service.updateTabContent('tab-001', []);

      expect(result.content).toEqual([]);
    });

    it('deve atualizar updatedAt do tema pai ao salvar conteudo da aba', async () => {
      const content = [{ id: '1', type: 'paragraph', content: [] }];

      mockStorage.getStudyTabById.mockResolvedValue({
        id: 'tab-001',
        themeId: 'theme-001',
        content: [],
      });
      mockStorage.updateStudyTab.mockResolvedValue({
        id: 'tab-001',
        content,
        updatedAt: new Date(),
      });
      mockStorage.updateStudyTheme.mockResolvedValue({
        id: 'theme-001',
        updatedAt: new Date(),
      });

      await service.updateTabContent('tab-001', content);

      // Deve atualizar o updatedAt do tema pai
      expect(mockStorage.updateStudyTheme).toHaveBeenCalledWith(
        'theme-001',
        expect.objectContaining({
          updatedAt: expect.any(Date),
        })
      );
    });

    it('deve lancar erro se aba nao existe', async () => {
      mockStorage.getStudyTabById.mockResolvedValue(null);

      await expect(
        service.updateTabContent('tab-nonexistent', [])
      ).rejects.toThrow();
    });

    it('deve preservar blocos complexos com toggles aninhados', async () => {
      const complexContent = [
        {
          id: '1',
          type: 'toggle',
          props: { title: 'Board AKx rainbow' },
          children: [
            { id: '2', type: 'image', props: { url: '/uploads/study-images/range.png' } },
            { id: '3', type: 'paragraph', content: [{ type: 'text', text: 'Check 60%, Bet 40%' }] },
            {
              id: '4',
              type: 'toggle',
              props: { title: 'Turn K' },
              children: [
                { id: '5', type: 'paragraph', content: [{ type: 'text', text: 'Double barrel 55%' }] },
              ],
            },
          ],
        },
      ];

      mockStorage.getStudyTabById.mockResolvedValue({
        id: 'tab-001',
        themeId: 'theme-001',
        content: [],
      });
      mockStorage.updateStudyTab.mockResolvedValue({
        id: 'tab-001',
        content: complexContent,
        updatedAt: new Date(),
      });

      const result = await service.updateTabContent('tab-001', complexContent);

      expect(result.content).toEqual(complexContent);
      // Verifica que a estrutura aninhada foi preservada
      expect(result.content[0].children).toHaveLength(3);
      expect(result.content[0].children[2].children).toHaveLength(1);
    });
  });
});
