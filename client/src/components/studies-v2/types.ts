export interface StudyTheme {
  id: string;
  userId: string;
  name: string;
  color: string;
  emoji: string;
  isFavorite: boolean;
  sortOrder: number;
  tabCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudyTab {
  id: string;
  themeId: string;
  name: string;
  content: any[]; // BlockNote JSON blocks
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_THEME_COLORS = [
  '#16a34a', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'
];

export const NOTE_TEMPLATES = [
  {
    name: 'Analise de Board',
    blocks: [
      { type: 'heading', content: 'Board Texture' },
      { type: 'paragraph', content: '' },
      { type: 'heading', content: 'Range Analysis' },
      { type: 'paragraph', content: '' },
      { type: 'heading', content: 'Frequencias' },
      { type: 'paragraph', content: '' },
      { type: 'heading', content: 'Takeaway' },
      { type: 'paragraph', content: '' },
    ]
  },
  {
    name: 'Spot Review',
    blocks: [
      { type: 'heading', content: 'Situacao' },
      { type: 'paragraph', content: '' },
      { type: 'heading', content: 'Decisao' },
      { type: 'paragraph', content: '' },
      { type: 'heading', content: 'Resultado Solver' },
      { type: 'paragraph', content: '' },
    ]
  }
];
