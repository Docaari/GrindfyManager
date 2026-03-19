// =============================================================================
// Cores de badges/tags para sites, categorias e velocidades de torneios
//
// IMPORTANTE: Existem 3 esquemas de cores neste projeto:
// 1. Hex colors para graficos (chartColors.ts) - usado por AnalyticsCharts, ProfitChart
// 2. Solid bg classes (este arquivo) - usado por GradePlanner, NewTournamentPlanningDialog, etc.
// 3. GrindSessionLive tem esquema proprio (NAO consolidar aqui)
// =============================================================================

// ---------------------------------------------------------------------------
// Esquema "planner" — usado por GradePlanner e NewTournamentPlanningDialog
// Solid bg colors para indicadores pequenos (dots, badges sem dark mode)
// ---------------------------------------------------------------------------

const PLANNER_SITE_COLORS: Record<string, string> = {
  "PokerStars": "bg-red-600",
  "PartyPoker": "bg-orange-600",
  "888poker": "bg-blue-600",
  "GGPoker": "bg-red-800",
  "WPN": "bg-green-800",
  "iPoker": "bg-orange-400",
  "CoinPoker": "bg-pink-600",
  "Chico": "bg-white",
  "Revolution": "bg-pink-800",
  "Bodog": "bg-red-400"
};

const PLANNER_TYPE_COLORS: Record<string, string> = {
  "Vanilla": "bg-blue-600",
  "PKO": "bg-orange-600",
  "Mystery": "bg-green-600"
};

const PLANNER_SPEED_COLORS: Record<string, string> = {
  "Normal": "bg-green-600",
  "Turbo": "bg-yellow-600",
  "Hyper": "bg-red-600"
};

export const getPlannerSiteColor = (site: string): string => {
  return PLANNER_SITE_COLORS[site] || "bg-gray-600";
};

export const getPlannerTypeColor = (type: string): string => {
  return PLANNER_TYPE_COLORS[type] || "bg-gray-600";
};

export const getPlannerSpeedColor = (speed: string): string => {
  return PLANNER_SPEED_COLORS[speed] || "bg-gray-600";
};

// ---------------------------------------------------------------------------
// Esquema "table" — usado por TournamentTable e TemplateCard
// Switch-based com lowercase matching, inclui text color
// ---------------------------------------------------------------------------

export const getTableSiteColor = (site: string): string => {
  switch (site.toLowerCase()) {
    case "pokerstars":
    case "ps":
      return "bg-red-600";
    case "partypoker":
      return "bg-blue-600";
    case "888poker":
    case "888":
      return "bg-orange-600";
    case "ggpoker":
    case "gg":
      return "bg-green-600";
    case "wpn":
      return "bg-purple-600";
    case "chico":
      return "bg-yellow-600";
    case "coinpoker":
      return "bg-indigo-600";
    default:
      return "bg-gray-600";
  }
};

export const getTableTypeColor = (type: string): string => {
  switch (type?.toLowerCase()) {
    case 'vanilla':
      return 'bg-blue-600 text-white';
    case 'pko':
      return 'bg-orange-600 text-white';
    case 'mystery':
      return 'bg-pink-600 text-white';
    default:
      return 'bg-gray-600 text-white';
  }
};

export const getTableSpeedColor = (speed: string): string => {
  switch (speed?.toLowerCase()) {
    case 'normal':
      return 'bg-green-600 text-white';
    case 'turbo':
      return 'bg-yellow-600 text-black';
    case 'hyper':
      return 'bg-red-600 text-white';
    default:
      return 'bg-gray-600 text-white';
  }
};

// ---------------------------------------------------------------------------
// Esquema "library" — usado por TournamentLibraryNew
// Badge style com dark mode support
// ---------------------------------------------------------------------------

const LIBRARY_SITE_COLORS: Record<string, string> = {
  'PokerStars': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'GGNetwork': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'WPN': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'Bodog': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  '888poker': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'PartyPoker': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'Coin': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
};

const LIBRARY_CATEGORY_COLORS: Record<string, string> = {
  'Mystery': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'PKO': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'Bounty': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'Vanilla': 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
};

const LIBRARY_SPEED_COLORS: Record<string, string> = {
  'Hyper': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'Turbo': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Normal': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
};

export const getLibrarySiteColor = (site: string): string => {
  return LIBRARY_SITE_COLORS[site] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

export const getLibraryCategoryColor = (category: string): string => {
  return LIBRARY_CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

export const getLibrarySpeedColor = (speed: string): string => {
  return LIBRARY_SPEED_COLORS[speed] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};
