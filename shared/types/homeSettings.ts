/**
 * Home customization — Sprint home-reform-5 item 11.
 *
 * Spec: Docs/specs/home-reform-5.md item 11 (engrenagem) + item 8 (flag).
 *
 * Persistido em `users.home_layout_settings` (JSONB, migration 0047).
 * Shape unico para back-end e front-end. Defaults aplicados em runtime
 * (server/services/homeSettings.ts) — coluna NULL = todos toggles ON.
 */

export type HomeSectionKey =
  | 'headerStrip'
  | 'coach'
  | 'immediateAction'
  | 'gradeToday'
  | 'sessionsRegistered'
  | 'dashboard'
  | 'performance'
  | 'studies'
  | 'news';

export interface HomeVisibilitySettings {
  headerStrip: boolean;
  coach: boolean;
  immediateAction: boolean;
  gradeToday: boolean;
  sessionsRegistered: boolean;
  dashboard: boolean;
  performance: boolean;
  studies: boolean;
  news: boolean;
}

/**
 * Sprint Estudos-Habito-1 (ADR-129) — visibility granular cross-product
 * para FocusStatsBar.
 */
export interface FocusStatsVisibility {
  home: boolean;
  grindLive: boolean;
  coach: boolean;
  estudos: boolean;
  statsAnalyzer: boolean;
}

export const FOCUS_STATS_PLACEMENTS: (keyof FocusStatsVisibility)[] = [
  "home",
  "grindLive",
  "coach",
  "estudos",
  "statsAnalyzer",
];

export const DEFAULT_FOCUS_STATS_VISIBILITY: FocusStatsVisibility = {
  home: true,
  grindLive: true,
  coach: true,
  estudos: true,
  statsAnalyzer: true,
};

export interface HomeLayoutSettings {
  visibility: HomeVisibilitySettings;
  /** Item 8 absorvido: card "Sessoes Registradas" lê de session_tournaments quando true. */
  performanceFromGrind: boolean;
  /** Sprint Estudos-Habito-1 (RF-4.2 / ADR-129). */
  focusStatsVisibility: FocusStatsVisibility;
}

export const HOME_VISIBILITY_KEYS: HomeSectionKey[] = [
  'headerStrip',
  'coach',
  'immediateAction',
  'gradeToday',
  'sessionsRegistered',
  'dashboard',
  'performance',
  'studies',
  'news',
];

export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  headerStrip: 'Header (Banca / Hoje / ROI / Pendencias)',
  coach: 'Pergunte ao Coach',
  immediateAction: 'Acao Imediata',
  gradeToday: 'Grade do Dia',
  sessionsRegistered: 'Sessoes Registradas',
  dashboard: 'Dashboard - All Time',
  performance: 'Performance (deltas + variancia)',
  studies: 'Estudos',
  news: 'Noticias, Estudos e Atualizacoes',
};

export const DEFAULT_HOME_LAYOUT_SETTINGS: HomeLayoutSettings = {
  visibility: {
    headerStrip: true,
    coach: true,
    immediateAction: true,
    gradeToday: true,
    sessionsRegistered: true,
    dashboard: true,
    performance: true,
    studies: true,
    news: true,
  },
  performanceFromGrind: true,
  focusStatsVisibility: { ...DEFAULT_FOCUS_STATS_VISIBILITY },
};
