// =============================================================================
// shared/library-categories.ts — Sprint Biblioteca-1 / D13
//
// Spec: Docs/specs/biblioteca-spec-1.md D13 + RF-01.1.4
//
// Categorias da Biblioteca ficam HARD-CODED em codigo (nao tabela DB no MVP).
// Tabela `library_categories` so existe se founder pedir UI admin (fora de
// escopo da Spec 1). Cada categoria tem id (snake_case) + label PT-BR + cor +
// icone (lucide-react name).
//
// Lessons referenciam `categoryId` obrigatorio (validado via Zod refine).
// Coach tool `recommend_lesson` usa o mesmo enum como input `leakTopic`.
// =============================================================================

export const LIBRARY_CATEGORY_IDS = [
  'performance_mental',
  'preflop',
  'postflop',
  'multiway',
  'icm_pre',
  'icm_pos',
  'final_table',
  'exploits',
  'special_formats',
] as const;

export type LibraryCategoryId = (typeof LIBRARY_CATEGORY_IDS)[number];

export interface LibraryCategory {
  id: LibraryCategoryId;
  label: string; // PT-BR
  color: string; // tailwind class fragment ou hex
  icon: string; // lucide-react icon name
}

export const LIBRARY_CATEGORIES: LibraryCategory[] = [
  {
    id: 'performance_mental',
    label: 'Performance Mental',
    color: '#a78bfa', // violet-400
    icon: 'Brain',
  },
  {
    id: 'preflop',
    label: 'Preflop',
    color: '#22d3ee', // cyan-400
    icon: 'Layers',
  },
  {
    id: 'postflop',
    label: 'Postflop',
    color: '#34d399', // emerald-400
    icon: 'Target',
  },
  {
    id: 'multiway',
    label: 'Multiway',
    color: '#f59e0b', // amber-500
    icon: 'Users',
  },
  {
    id: 'icm_pre',
    label: 'ICM Pre-Bolha',
    color: '#fb7185', // rose-400
    icon: 'TrendingUp',
  },
  {
    id: 'icm_pos',
    label: 'ICM Pos-Bolha',
    color: '#f472b6', // pink-400
    icon: 'TrendingDown',
  },
  {
    id: 'final_table',
    label: 'Mesa Final',
    color: '#facc15', // yellow-400
    icon: 'Trophy',
  },
  {
    id: 'exploits',
    label: 'Exploits',
    color: '#fb923c', // orange-400
    icon: 'Zap',
  },
  {
    id: 'special_formats',
    label: 'Formatos Especiais',
    color: '#94a3b8', // slate-400
    icon: 'Sparkles',
  },
];

export function isValidLibraryCategoryId(value: unknown): value is LibraryCategoryId {
  return typeof value === 'string' && (LIBRARY_CATEGORY_IDS as readonly string[]).includes(value);
}

export function getLibraryCategory(id: string): LibraryCategory | undefined {
  return LIBRARY_CATEGORIES.find((c) => c.id === id);
}
