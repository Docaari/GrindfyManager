// =============================================================================
// Seed de Temas Padrao para Estudos V2
// Cria 7 temas padrao com 4 abas cada na primeira visita do usuario.
// =============================================================================

const DEFAULT_THEMES = [
  { name: 'IP vs BB', emoji: '🎯' },
  { name: 'BB vs IP', emoji: '🛡️' },
  { name: 'SB vs BB - BW', emoji: '⚔️' },
  { name: 'BB vs SB BW', emoji: '🔄' },
  { name: '3bet Pot IP', emoji: '🚀' },
  { name: '3bet Pot OOP', emoji: '🧠' },
  { name: 'ICM', emoji: '💰' },
] as const;

const DEFAULT_TAB_NAMES = ['Flop', 'Turn', 'River', 'Tendencias'] as const;

const DEFAULT_COLOR = '#16a34a';

interface StudyThemeStorage {
  getStudyThemesByUserId: (userId: string) => Promise<any[]>;
  createStudyTheme: (theme: any) => Promise<any>;
  createStudyTab: (tab: any) => Promise<any>;
}

export async function seedDefaultThemes(
  userId: string,
  storage: StudyThemeStorage
): Promise<void> {
  const existingThemes = await storage.getStudyThemesByUserId(userId);
  if (existingThemes.length > 0) {
    return;
  }

  for (let i = 0; i < DEFAULT_THEMES.length; i++) {
    const themeDef = DEFAULT_THEMES[i];
    const createdTheme = await storage.createStudyTheme({
      userId,
      name: themeDef.name,
      emoji: themeDef.emoji,
      color: DEFAULT_COLOR,
      sortOrder: i,
    });

    for (let j = 0; j < DEFAULT_TAB_NAMES.length; j++) {
      await storage.createStudyTab({
        themeId: createdTheme.id,
        name: DEFAULT_TAB_NAMES[j],
        content: [],
        isDefault: true,
        sortOrder: j,
      });
    }
  }
}
