// =============================================================================
// Servico de CRUD para Study Tabs
// Regras de negocio para criacao, atualizacao e delecao de abas de estudo.
// =============================================================================

interface StudyTabStorage {
  getStudyTabById: (id: string) => Promise<any | null>;
  createStudyTab: (tab: any) => Promise<any>;
  updateStudyTab: (id: string, data: any) => Promise<any>;
  deleteStudyTab: (id: string) => Promise<void>;
  getStudyTabsByThemeId: (themeId: string) => Promise<any[]>;
  updateStudyTheme: (id: string, data: any) => Promise<any>;
}

export class StudyTabsService {
  constructor(private storage: StudyTabStorage) {}

  async createTab(data: {
    themeId: string;
    name: string;
    content?: any[];
    isDefault?: boolean;
    sortOrder?: number;
  }): Promise<any> {
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const existingTabs = await this.storage.getStudyTabsByThemeId(data.themeId);
      sortOrder = existingTabs ? existingTabs.length : 0;
    }

    return this.storage.createStudyTab({
      themeId: data.themeId,
      name: data.name,
      content: data.content ?? [],
      isDefault: data.isDefault ?? false,
      sortOrder,
    });
  }

  async deleteTab(tabId: string): Promise<void> {
    const tab = await this.storage.getStudyTabById(tabId);
    if (!tab) {
      throw new Error('Tab not found');
    }
    if (tab.isDefault) {
      throw new Error('Cannot delete default tab (aba padrao)');
    }
    await this.storage.deleteStudyTab(tabId);
  }

  async updateTabContent(tabId: string, content: any[]): Promise<any> {
    const tab = await this.storage.getStudyTabById(tabId);
    if (!tab) {
      throw new Error('Tab not found');
    }

    const result = await this.storage.updateStudyTab(tabId, { content });

    await this.storage.updateStudyTheme(tab.themeId, {
      updatedAt: new Date(),
    });

    return result;
  }
}
