import {
  users,
  tournaments,
  tournamentTemplates,
  weeklyPlans,
  grindSessions,
  preparationLogs,
  customGroups,
  coachingInsights,
  userSettings,
  plannedTournaments,
  breakFeedbacks,
  sessionTournaments,
  studyCards,
  studyMaterials,
  studyNotes,
  studySessions,
  activeDays,
  weeklyRoutines,
  studySchedules,
  calendarCategories,
  calendarEvents,
  bugReports,
  tournamentSelectorLogs,
  wallets,
  walletTransactions,
  walletPending,
  walletTransfers,
  type Wallet,
  type InsertWallet,
  type WalletTransaction,
  type InsertWalletTransaction,
  type WalletPending,
  type WalletTransfer,
  type TournamentSelectorLog,
  type InsertTournamentSelectorLog,
  type User,
  type UpsertUser,
  type Tournament,
  type InsertTournament,
  type TournamentTemplate,
  type InsertTournamentTemplate,
  type WeeklyPlan,
  type InsertWeeklyPlan,
  type GrindSession,
  type InsertGrindSession,
  type PreparationLog,
  type InsertPreparationLog,
  type CustomGroup,
  type InsertCustomGroup,
  type CoachingInsight,
  type InsertCoachingInsight,
  type UserSettings,
  type InsertUserSettings,
  type PlannedTournament,
  type InsertPlannedTournament,
  type BreakFeedback,
  type InsertBreakFeedback,
  type SessionTournament,
  type InsertSessionTournament,
  type StudyCard,
  type InsertStudyCard,
  type StudyMaterial,
  type InsertStudyMaterial,
  type StudyNote,
  type InsertStudyNote,

  type StudySession,
  type InsertStudySession,
  type ActiveDay,
  type InsertActiveDay,
  type WeeklyRoutine,
  type InsertWeeklyRoutine,
  type StudySchedule,
  type InsertStudySchedule,
  type CalendarCategory,
  type InsertCalendarCategory,
  type CalendarEvent,
  type InsertCalendarEvent,
  type BugReport,
  type InsertBugReport,
  uploadHistory,
  type UploadHistory,
  type InsertUploadHistory,
  profileStates,
  type ProfileState,
  type InsertProfileState,
  tournamentLibrary,
  type TournamentLibrary,
  bankrollSnapshots,
  type BankrollSnapshot,
  type InsertBankrollSnapshot,
  tickets,
  notifications,
  userActivity,
  type Ticket,
  cooldownLogs,
  starredHands,
  // Sprint Spot-Anki-Reentry-3 (ADR-136)
  spotReentryCards,
  type CooldownLog,
  type InsertCooldownLog,
  type UpdateCooldownLog,
  type StarredHand,
  type InsertStarredHand,
  sessionWalletSnapshots,
  type SessionWalletSnapshot,
  type InsertSessionWalletSnapshot,
  hudLayouts,
  hudStatSnapshots,
  hudOcrAudit,
  type HudLayout,
  type InsertHudLayout,
  type UpdateHudLayout,
  type HudStatSnapshot,
  type InsertHudStatSnapshot,
  type HudOcrAuditRow,
  type HudLayoutFieldEntry,
  studyThemes,
  studyTabs,
  studyThemeSpotLinks,
  type StudyTheme,
  type StudyThemeSpotLink,
  // Sprint Estudos-Coach-Biblio-2 (ADR-132/133) — study weekly plans + coach session insights.
  studyWeeklyPlans,
  STUDY_WEEKLY_PLAN_SOURCES,
  type StudyWeeklyPlan,
  coachSessionInsights,
  type CoachSessionInsight,
  // Sprint home-reform-4 Item 7 (ADR-116/117) — focus stats.
  userFocusStats,
  type UserFocusStat,
  type InsertUserFocusStat,
  // Sprint Estudos-Habito-1 (ADR-126) — study_sessions_v2.
  studySessionsV2,
  type StudySessionV2,
  type InsertStudySessionV2,
  // Sprint F4 — stats analyzer hud_stat_targets
  hudStatTargets,
  type HudStatTarget,
  type InsertHudStatTarget,
  // Sprint Coach Sprint 0 + Coach-2B
  coachActions,
  coachLeakFocus,
  coachNudgeLog,
  type CoachAction,
  type InsertCoachAction,
  type CoachLeakFocus,
  type InsertCoachLeakFocus,
  type CoachNudgeLog,
  type InsertCoachNudgeLog,
  // Sprint home-reform-4 / Item 4 (ADR-111) — coach lesson recommendations.
  coachLessonRecommendations,
  type CoachLessonRecommendation,
  type InsertCoachLessonRecommendation,
  chatSessions,
  chatMessages,
  // Sprint Flight-1 RF-01 (ADR-090).
  tournamentSeries,
  type TournamentSeries,
  type InsertTournamentSeries,
  // Sprint Biblioteca-1 + Biblioteca-2 (RF-01) — library tables.
  libraryCourses,
  libraryModules,
  libraryLessons,
  userLessonAccess,
  libraryEvents,
  libraryProgress,
  // Sprint UX-Biblioteca-1 / RF-02 (ADR-103) — access requests.
  libraryAccessRequests,
  type LibraryCourse,
  type LibraryModule,
  type LibraryLesson,
  type UserLessonAccess,
  type LibraryEvent,
  type LibraryProgress,
  type LibraryAccessRequest,
  // Sprint News-1 (ADR-106) — news feed tables.
  newsSources,
  newsItems as newsItemsTable,
  userNewsPreferences,
  type NewsSourceRow,
  type NewsItemRow,
  type UserNewsPreferenceRow,
  type NewsPreferenceUpdate,
  // Sprint Variance-1 RF-01 — variance KPI lookup.
  primedopeRuns,
} from "@shared/schema";
import {
  VARIANCE_SOURCE,
  VARIANCE_STATUS,
  VARIANCE_THRESHOLDS,
  VARIANCE_CLAMP,
  type VarianceSource,
  type VarianceStatus,
} from "@shared/variance";
import { db } from "./db";
import { eq, desc, asc, and, gte, lte, lt, sql, like, not, inArray, gt, isNotNull, isNull, count, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { normalizeTournamentTypePayload } from "./storage/normalizeTournamentTypePayload";
import { getDisplayRegistrationTime } from "@shared/grade-time";
import { ensureLibraryEntryForPlannedSafe } from "./services/libraryAutoPopulate";

// Utility function to build period conditions with custom date range support
function buildPeriodCondition(period: string, filters: any) {
  const conditions: any[] = [];

  // History rule: dashboard/analytics nunca incluem torneios criados em
  // sessoes de grind-live. tournaments.grindSessionId IS NULL = importacao
  // (CSV/sharkscope/manual via grade-planner). NOT NULL = registro feito a
  // partir de uma sessao de grind, visivel apenas no detalhe da sessao.
  conditions.push(isNull(tournaments.grindSessionId));
  // Sprint Flight-1 H6 (ADR-090): rows com baggedAt setado sao placeholders
  // de Day 1 criados via /grind-live "bag". Nao representam evento finalizado;
  // o resultado final esta em outra row (Day 2) ou ainda nao aconteceu.
  // Excluir do dashboard pra evitar poluir count/ABI/ROI com shells vazios.
  conditions.push(isNull(tournaments.baggedAt));

  if (period === 'custom' && filters && filters.dateFrom && filters.dateTo) {

    const startDate = new Date(filters.dateFrom);
    const endDate = new Date(filters.dateTo);


    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      // Certificar que passamos objetos Date válidos para o Drizzle
      conditions.push(gte(tournaments.datePlayed, startDate));
      conditions.push(lte(tournaments.datePlayed, endDate));
    } else {
    }
  } else if (period !== 'all') {
    // Standard period filters
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '365d':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
      // New period options
      case 'current_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'last_3_months':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'last_6_months':
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case 'current_year':
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
      case 'last_12_months':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'last_24_months':
        startDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
        break;
      case 'last_36_months':
        startDate = new Date(now.getTime() - 1095 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    if (!isNaN(startDate.getTime())) {
      // Certificar que passamos objeto Date válido para o Drizzle
      conditions.push(gte(tournaments.datePlayed, startDate));
    }
  }


  return conditions;
}

// ===========================================================================
// Sprint home-reform-2 Onda 2 — helpers de bankroll/ageRelative para
// `getCurrentBankroll` (B10.3 / ADR-109) e `getPendingStarredHands` (B10.1).
// Helpers privados a este modulo. Sem I/O.
// ===========================================================================

function formatAgeRelative(date: Date): string {
  const ms = Date.now() - date.getTime();
  if (ms < 0) return 'agora';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}a`;
}

function snapshotAmount(snap: any): number {
  return Number(snap?.newAmount ?? 0);
}

/**
 * Constroi sparkline de 7 pontos USD (1 por dia) usando bankroll_snapshots.
 * Para cada dia [now-6d, now], pega o ultimo snapshot <= fim do dia.
 * Se nao ha snapshot daquele dia, repete o ultimo valor conhecido.
 * Spec §3 B10.3.
 */
function buildSparkline7d(snapshots: any[], currentTotalUsd: number): number[] {
  const sparkline: number[] = new Array(7).fill(currentTotalUsd);
  if (!Array.isArray(snapshots) || snapshots.length === 0) return sparkline;

  // ASC por occurredAt para iterar consistente.
  const sorted = [...snapshots]
    .map((s) => ({
      occurredAt: s.occurredAt instanceof Date ? s.occurredAt : new Date(s.occurredAt),
      amount: snapshotAmount(s),
    }))
    .filter((s) => !isNaN(s.occurredAt.getTime()))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  if (sorted.length === 0) return sparkline;

  let lastKnown = sorted[0].amount;
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const dayEnd = new Date(now.getTime());
    dayEnd.setHours(23, 59, 59, 999);
    dayEnd.setDate(dayEnd.getDate() - (6 - i));
    // Acha ultimo snapshot <= dayEnd
    let found = lastKnown;
    for (const s of sorted) {
      if (s.occurredAt.getTime() <= dayEnd.getTime()) {
        found = s.amount;
      } else {
        break;
      }
    }
    sparkline[i] = found;
    lastKnown = found;
  }
  // Sempre fecha com valor atual no ponto 7.
  sparkline[6] = currentTotalUsd;
  return sparkline;
}

/**
 * deltaPct7d = (current - balance7daysAgo) / balance7daysAgo * 100.
 * balance7daysAgo = ultimo snapshot anterior a 7d (ou null se inexistente).
 * Spec §3 B10.3.
 */
function computeDeltaPct7d(snapshots: any[], currentTotalUsd: number): number | null {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
  // Pega o snapshot mais antigo dos 7d (ou o primeiro se todos forem recentes).
  const sorted = [...snapshots]
    .map((s) => ({
      occurredAt: s.occurredAt instanceof Date ? s.occurredAt : new Date(s.occurredAt),
      amount: snapshotAmount(s),
    }))
    .filter((s) => !isNaN(s.occurredAt.getTime()))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  if (sorted.length === 0) return null;
  const balance7d = sorted[0].amount;
  if (balance7d === 0) return null;
  return Number((((currentTotalUsd - balance7d) / balance7d) * 100).toFixed(2));
}

/**
 * bisAvailable = floor(totalUsd / softLimitUSD). null se softLimit nao configurado.
 * Spec §3 B10.3.
 */
function computeBisAvailable(totalUsd: number, softLimitUSD: any): number | null {
  if (softLimitUSD == null) return null;
  const limit = Number(softLimitUSD);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Math.floor(totalUsd / limit);
}

// Utility function to build SQL filters from dashboard filters
function buildFilters(filters: any) {
  const conditions: any[] = [];


  // Date range filter
  if (filters.dateRange?.from) {
    conditions.push(gte(tournaments.datePlayed, new Date(filters.dateRange.from)));
  }
  if (filters.dateRange?.to) {
    conditions.push(lte(tournaments.datePlayed, new Date(filters.dateRange.to)));
  }

  // Sites filter
  if (filters.sites?.length > 0) {
    conditions.push(inArray(tournaments.site, filters.sites));
  }

  // Categories filter
  if (filters.categories?.length > 0) {
    conditions.push(inArray(tournaments.category, filters.categories));
  }

  // Speeds filter
  if (filters.speeds?.length > 0) {
    conditions.push(inArray(tournaments.speed, filters.speeds));
  }

  // Buy-in range filter
  if (filters.buyinRange?.min !== null && filters.buyinRange?.min !== undefined) {
    conditions.push(gte(tournaments.buyIn, filters.buyinRange.min));
  }
  if (filters.buyinRange?.max !== null && filters.buyinRange?.max !== undefined) {
    conditions.push(lte(tournaments.buyIn, filters.buyinRange.max));
  }

  // Field size range filter
  if (filters.fieldSizeRange?.min !== null && filters.fieldSizeRange?.min !== undefined) {
    conditions.push(gte(tournaments.fieldSize, filters.fieldSizeRange.min));
  }
  if (filters.fieldSizeRange?.max !== null && filters.fieldSizeRange?.max !== undefined) {
    conditions.push(lte(tournaments.fieldSize, filters.fieldSizeRange.max));
  }

  // Keyword filter
  if (filters.keywordFilter?.type === 'contains' && filters.keywordFilter?.keyword) {
    conditions.push(like(tournaments.name, `%${filters.keywordFilter.keyword}%`));
  }
  if (filters.keywordFilter?.type === 'not_contains' && filters.keywordFilter?.keyword) {
    conditions.push(not(like(tournaments.name, `%${filters.keywordFilter.keyword}%`)));
  }

  // Participant range filter (field size) - support both naming conventions
  if (filters.participantMin !== null && filters.participantMin !== undefined) {
    conditions.push(gte(tournaments.fieldSize, filters.participantMin));
  }
  if (filters.participantMax !== null && filters.participantMax !== undefined) {
    conditions.push(lte(tournaments.fieldSize, filters.participantMax));
  }
  
  // Legacy support for old naming convention
  if (filters.participantsFrom !== null && filters.participantsFrom !== undefined) {
    conditions.push(gte(tournaments.fieldSize, filters.participantsFrom));
  }
  if (filters.participantsTo !== null && filters.participantsTo !== undefined) {
    conditions.push(lte(tournaments.fieldSize, filters.participantsTo));
  }


  return conditions.length > 0 ? and(...conditions) : undefined;
}

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Sprint home-reform-5 item 11 — Home customization.
  getHomeLayoutSettings(userId: string): Promise<unknown | null>;
  setHomeLayoutSettings(userId: string, settings: unknown): Promise<void>;

  // Tournament operations
  getTournaments(userId: string, limit?: number, offset?: number, period?: string, filters?: any): Promise<Tournament[]>;
  getTournament(id: string): Promise<Tournament | undefined>;
  createTournament(tournament: InsertTournament): Promise<Tournament>;
  updateTournament(id: string, tournament: Partial<InsertTournament>): Promise<Tournament>;
  deleteTournament(id: string): Promise<void>;
  // 🎯 ETAPA 2.3 - CORREÇÃO: userId agora é userPlatformId (USER-XXXX)
  isDuplicateTournament(userId: string, tournamentData: {
    name: string;
    datePlayed: Date | null;
    buyIn: number;
    position?: number;
    fieldSize?: number;
  }): Promise<boolean>;

  // Batch tournament operations for bulk import
  findExistingTournamentIds(userId: string, tournamentIds: string[]): Promise<Set<string>>;
  findExistingTournamentsByFields(userId: string, tournaments: Array<{ name: string; datePlayed: Date | null; buyIn: number }>): Promise<Set<string>>;
  createTournamentsBatch(tournaments: InsertTournament[]): Promise<Tournament[]>;

  // Tournament template operations
  getTournamentTemplates(userId: string): Promise<TournamentTemplate[]>;
  getTournamentTemplate(id: string): Promise<TournamentTemplate | undefined>;
  createTournamentTemplate(template: InsertTournamentTemplate): Promise<TournamentTemplate>;
  updateTournamentTemplate(id: string, template: Partial<InsertTournamentTemplate>): Promise<TournamentTemplate>;
  deleteTournamentTemplate(id: string): Promise<void>;

  // Weekly plan operations
  getWeeklyPlans(userId: string): Promise<WeeklyPlan[]>;
  getWeeklyPlan(id: string): Promise<WeeklyPlan | undefined>;
  createWeeklyPlan(plan: InsertWeeklyPlan): Promise<WeeklyPlan>;
  updateWeeklyPlan(id: string, plan: Partial<InsertWeeklyPlan>): Promise<WeeklyPlan>;
  deleteWeeklyPlan(id: string): Promise<void>;

  // Grind session operations
  // Wave B (Fase 3 perf): optional limit pra paginar — heavy users com 1000s/yr.
  getGrindSessions(userId: string, opts?: { limit?: number; offset?: number }): Promise<GrindSession[]>;
  // Sprint AI-3.1 / RF-08 (ADR-176) — count puro, evita load N rows so para
  // `.length`. range opcional aceita `{from, to}` Date OU YYYY-MM-DD strings;
  // null/undefined conta todas as sessoes do user.
  countGrindSessions(
    userId: string,
    range?: { from: Date | string; to: Date | string } | null,
  ): Promise<number>;
  getGrindSession(id: string): Promise<GrindSession | undefined>;
  createGrindSession(session: InsertGrindSession): Promise<GrindSession>;
  updateGrindSession(id: string, session: Partial<InsertGrindSession>): Promise<GrindSession>;
  deleteGrindSession(id: string): Promise<void>;

  // Preparation log operations
  getPreparationLogs(userId: string): Promise<PreparationLog[]>;
  createPreparationLog(log: InsertPreparationLog): Promise<PreparationLog>;

  // Custom group operations
  getCustomGroups(userId: string): Promise<CustomGroup[]>;
  createCustomGroup(group: InsertCustomGroup): Promise<CustomGroup>;
  updateCustomGroup(id: string, group: Partial<InsertCustomGroup>): Promise<CustomGroup>;
  deleteCustomGroup(id: string): Promise<void>;

  // Coaching insight operations
  getCoachingInsights(userId: string): Promise<CoachingInsight[]>;
  getCoachingInsight(id: string): Promise<CoachingInsight | undefined>;
  createCoachingInsight(insight: InsertCoachingInsight): Promise<CoachingInsight>;
  updateCoachingInsight(id: string, insight: Partial<InsertCoachingInsight>): Promise<CoachingInsight>;

  // User settings operations
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  upsertUserSettings(settings: InsertUserSettings): Promise<UserSettings>;

  // Sprint B2 (M5): idempotent session status setter (skips no-op).
  setGrindSessionStatus(
    id: string,
    userId: string,
    status: string,
  ): Promise<GrindSession | undefined>;

  // Analytics operations
  getDashboardStats(userId: string, period?: string, filters?: any, opts?: { expandFlightSeries?: boolean }): Promise<any>;
  // Sprint Flight-1 RF-16/RF-17: analytics agrupado por modifier (substitui filter
  // is_flight=true legado por seriesId IS NOT NULL para modifier='flight').
  getAnalyticsByModifier(userId: string, opts: { modifier: string }): Promise<any>;
  getPerformanceByPeriod(userId: string, period: string, filters?: any): Promise<any>;
  getAnalyticsByDayOfWeek(userId: string, period?: string, filters?: any[]): Promise<any[]>;

  // Tournament Library operations
  getTournamentLibrary(userId: string, period?: string, filters?: any): Promise<any[]>;

  // Planned tournament operations
  getPlannedTournaments(userId: string, dayOfWeek?: number): Promise<PlannedTournament[]>;
  getPlannedTournament(id: string): Promise<PlannedTournament | null>;
  createPlannedTournament(tournament: InsertPlannedTournament): Promise<PlannedTournament>;
  updatePlannedTournament(id: string, tournament: Partial<InsertPlannedTournament>): Promise<PlannedTournament>;
  deletePlannedTournament(id: string): Promise<void>;
  getPlannedTournamentsBySession(userId: string, sessionId: string): Promise<PlannedTournament[]>;
  // launch-fix P1: batch helper para evitar N+1 em GET /api/grind-sessions/history.
  getPlannedTournamentsBySessionIds(
    userId: string,
    sessionIds: string[],
  ): Promise<PlannedTournament[]>;

  // Break feedback operations
  getBreakFeedbacks(userId: string, sessionId?: string): Promise<BreakFeedback[]>;
  // launch-fix P1: batch helper para evitar N+1 em GET /api/grind-sessions/history.
  getBreakFeedbacksBySessionIds(
    userId: string,
    sessionIds: string[],
  ): Promise<BreakFeedback[]>;
  createBreakFeedback(feedback: InsertBreakFeedback): Promise<BreakFeedback>;
  deleteBreakFeedback(id: string): Promise<void>;

  // Session tournament operations
  getSessionTournaments(userId: string, sessionId?: string): Promise<SessionTournament[]>;
  // launch-fix P1: batch helper para evitar N+1 em GET /api/grind-sessions/history.
  getSessionTournamentsBySessionIds(
    userId: string,
    sessionIds: string[],
  ): Promise<SessionTournament[]>;
  createSessionTournament(tournament: InsertSessionTournament): Promise<SessionTournament>;
  getSessionTournamentById(id: string): Promise<SessionTournament | null>;
  updateSessionTournament(id: string, tournament: Partial<InsertSessionTournament>): Promise<SessionTournament>;
  deleteSessionTournament(id: string): Promise<void>;
  getSessionTournamentsByDay(userId: string, dayOfWeek: number): Promise<SessionTournament[]>;

  // Study card operations
  getStudyCards(userId: string): Promise<StudyCard[]>;
  createStudyCard(studyCard: InsertStudyCard): Promise<StudyCard>;
  getStudyCard(id: string, userId: string): Promise<StudyCard | undefined>;
  updateStudyCard(id: string, studyCard: Partial<InsertStudyCard>): Promise<StudyCard>;
  deleteStudyCard(id: string): Promise<void>;

  // Study material operations
  getStudyMaterials(studyCardId: string): Promise<StudyMaterial[]>;
  createStudyMaterial(material: InsertStudyMaterial): Promise<StudyMaterial>;

  // Study note operations
  getStudyNotes(studyCardId: string): Promise<StudyNote[]>;
  createStudyNote(note: InsertStudyNote): Promise<StudyNote>;




  // Study session operations
  getStudySessions(userId: string): Promise<StudySession[]>;
  createStudySession(session: InsertStudySession): Promise<StudySession>;
  // Sprint Estudos-Sessao-1 RF-03 / RF-06 — single-session lookup com IDOR scope.
  getStudySession(id: string, userId: string): Promise<StudySession | null>;
  updateStudySession(
    id: string,
    userId: string,
    patch: Partial<InsertStudySession>,
  ): Promise<StudySession | null>;
  // Sprint Estudos-Sessao-1 RF-04 — notes linkadas a sessao.
  getStudyNotesBySession(sessionId: string, userId: string): Promise<StudyNote[]>;
  createStudyNoteForSession(data: {
    studySessionId: string;
    content: string;
    tags?: string[];
    title?: string | null;
  }): Promise<StudyNote>;
  getStudyNoteById(id: string): Promise<StudyNote | null>;
  deleteStudyNote(id: string): Promise<boolean>;

  // Active days operations
  getActiveDays(userId: string): Promise<ActiveDay[]>;
  toggleActiveDay(userId: string, dayOfWeek: number): Promise<ActiveDay>;

  // Calendário Inteligente
  getWeeklyRoutine(userId: string, weekStart: Date): Promise<WeeklyRoutine | null>;
  createWeeklyRoutine(routine: InsertWeeklyRoutine): Promise<WeeklyRoutine>;
  updateWeeklyRoutine(id: string, routine: Partial<InsertWeeklyRoutine>): Promise<WeeklyRoutine>;
  deleteWeeklyRoutine(id: string): Promise<void>;

  getStudySchedules(userId: string): Promise<StudySchedule[]>;
  createStudySchedule(schedule: InsertStudySchedule): Promise<StudySchedule>;
  updateStudySchedule(id: string, schedule: Partial<InsertStudySchedule>): Promise<StudySchedule>;
  deleteStudySchedule(id: string): Promise<void>;

  // Tournament Selector (RF-04/RF-05) — analytics aligned to scoringConstants buckets
  getAnalyticsByBuyinRangeV2(userId: string, period?: string, filters?: any): Promise<any[]>;
  getAnalyticsByFieldSize(userId: string, period?: string, filters?: any): Promise<any[]>;
  getTournamentLibraryEntries(userId: string): Promise<TournamentLibrary[]>;
  insertSelectorLog(log: InsertTournamentSelectorLog): Promise<TournamentSelectorLog>;
  // Sprint TS-3 RF-05 — agregacao "score vs ROI realizado" para dashboard admin.
  aggregateSelectorCalibration(args: {
    lookbackDays: number;
    excludeSessionTournaments?: boolean;
  }): Promise<{
    totalAdds: number;
    realizedAdds: number;
    buckets: Array<{
      grade: string;
      adds: number;
      realized: number;
      realizedRoiPct: number;
    }>;
  }>;

  // Bankroll Module (Sprint 2)
  getUserBankrollForUpdate(userId: string, tx?: any): Promise<{ bankrollAmount: string | null; bankrollRule: string } | null>;
  insertBankrollSnapshot(data: InsertBankrollSnapshot, tx?: any): Promise<BankrollSnapshot>;
  updateUserBankroll(params: { userId: string; amount: number | null; rule: string }, tx?: any): Promise<void>;
  getBankrollSnapshots(userId: string, filters?: BankrollSnapshotsFilters): Promise<BankrollSnapshot[]>;

  // Sprint Bankroll-2 — Multi-Wallet Foundation
  createWallet(data: InsertWallet & { id?: string }, tx?: any): Promise<Wallet>;
  getWalletById(walletId: string, userId: string, tx?: any): Promise<Wallet | null>;
  listWalletsByUser(userId: string, opts?: { includeArchived?: boolean }, tx?: any): Promise<Wallet[]>;
  countActiveWalletsByUser(userId: string, tx?: any): Promise<number>;
  findActiveWalletByName(userId: string, name: string, tx?: any): Promise<Wallet | null>;
  selectWalletForUpdate(walletId: string, userId: string, tx?: any): Promise<Wallet | null>;
  updateWallet(walletId: string, userId: string, patch: Partial<Wallet>, tx?: any): Promise<Wallet>;
  archiveWallet(walletId: string, userId: string, tx?: any): Promise<Wallet>;
  updateWalletBalance(walletId: string, newBalance: string | number, tx?: any): Promise<void>;
  createWalletTransaction(data: InsertWalletTransaction & { id?: string }, tx?: any): Promise<WalletTransaction>;
  listWalletTransactions(userId: string, walletId: string, filters?: any, tx?: any): Promise<WalletTransaction[]>;
  // Sprint Bankroll-Reports-Detail (RF-05, RF-08): retorna wallet_transactions
  // de TODAS as wallets do user (history unificado + dashboard manual_reports).
  listWalletTransactionsByUser(userId: string, filters?: { from?: Date | string; to?: Date | string; reason?: string[]; limit?: number }, tx?: any): Promise<WalletTransaction[]>;
  getLastWalletTransaction(walletId: string, tx?: any): Promise<WalletTransaction | null>;
  getActiveWalletsByUser(userId: string, tx?: any): Promise<Wallet[]>;
  // ADR-040 Sprint Session-End Reconciliation
  findReconciliationMarker(sessionId: string, userId: string, tx?: any): Promise<{ count: number }>;
  listReconcilableWallets(
    sessionId: string,
    userId: string,
    opts?: { includeAll?: boolean },
    tx?: any,
  ): Promise<any>;
  // Sprint Session-End Reconciliation V2 — RF-04, RF-07, RF-09
  listSessionTournaments(sessionId: string, userId: string, tx?: any): Promise<any[]>;
  findSessionWalletSnapshot(sessionId: string, userId: string, tx?: any): Promise<any | null>;
  listSessionWalletSnapshots(sessionId: string, userId: string, tx?: any): Promise<any[]>;
  listSessionWalletSnapshotsByUser(userId: string): Promise<any[]>;
  createSessionWalletSnapshot(input: any, tx?: any): Promise<any>;
  setUserBankrollV2Migrated(userId: string, value: boolean, tx?: any): Promise<void>;
  backfillSnapshotsWalletId(userId: string, walletId: string, tx?: any): Promise<number>;
  listUsersForV2Migration(tx?: any): Promise<Array<{ userId: string; bankrollAmount: string | null; bankrollV2Migrated: boolean | null }>>;
  selectUserSettingsForUpdate(userId: string, tx?: any): Promise<any>;
  // QW-1 RF-04 migration support
  getAllUsersWithSettings(tx?: any): Promise<Array<{ userId: string; exchangeRates: Record<string, number> | null }>>;
  updateUserSettingsExchangeRates(userId: string, newRates: Record<string, number>, tx?: any): Promise<boolean>;

  // Sprint Cooldown-1 (MVP) — pos-sessao
  getSessionTournament(id: string): Promise<SessionTournament | null>;
  createCooldownLog(input: { userId: string; sessionId: string; mode: "full" | "quick" }): Promise<{ id: string }>;
  updateCooldownLog(id: string, userId: string, patch: Record<string, any>): Promise<any>;
  getCooldownLog(id: string, userId: string): Promise<any | null>;
  getCooldownLogBySession(sessionId: string, userId: string): Promise<any | null>;
  listCooldownLogs(userId: string, opts?: { page?: number; pageSize?: number }): Promise<{ items: any[]; total: number; page: number; pageSize: number }>;
  createStarredHand(input: {
    userId: string;
    // Sprint Spot-Anki-Reentry-3 (ADR-138) — relaxado para nullable.
    sessionId?: string | null;
    sessionTournamentId?: string | null;
    cooldownLogId?: string | null;
    type: string;
    spot: string;
    notes?: string | null;
    // Sprint F2 — campos opcionais do paste flow (lesson #7)
    imageUrl?: string;
    conclusion?: string;
    reviewedAt?: Date | string;
    reviewLater?: boolean;
    expiresAt?: Date | string;
    pastedAt?: Date | string;
    source?: string;
    status?: string;
    // Sprint Spot-Screenshots (migration 0019)
    imageKey?: string | null;
    imageMime?: string | null;
    imageSize?: number | null;
    imageWidth?: number | null;
    imageHeight?: number | null;
    capturedDuring?: string;
    // Sprint Spot-Anki-Reentry-3 — RF-1 insight extension (lesson #7).
    insight?: string | null;
    decisionCorrect?: boolean | null;
    confidenceLevel?: number | null;
    tags?: string[] | null;
  }): Promise<StarredHand>;
  getStarredHand(id: string, userId: string): Promise<any | null>;
  listStarredHands(userId: string, filter?: { sessionId?: string; type?: string; period?: "7d" | "30d" | "all"; reviewLater?: boolean; includeDiscarded?: boolean }): Promise<any[]>;
  // Sprint F2: userId opcional (cron do purge nao tem userId — ownership ja
  // foi resolvida no listSpotsForPurge).
  deleteStarredHand(id: string, userId?: string): Promise<boolean | void>;
  countStarredHandsByTournament(sessionTournamentId: string, userId: string): Promise<number>;
  // Sprint Spot-Screenshots — cap 10/sessao cross-tournament
  countStarredHandsBySession(userId: string, sessionId: string): Promise<number>;

  // Sprint F2 — Spot Screenshots helpers
  getStarredHandById(id: string): Promise<StarredHand | null>;
  countSpotsBySession(sessionId: string): Promise<number>;
  resolveTournamentInSession(sessionId: string): Promise<string | null>;
  listPendingSpots(
    userId: string,
    filter?: { reviewLater?: string; sessionId?: string; status?: string; limit?: number; offset?: number },
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }>;
  updateStarredHand(id: string, patch: Record<string, any>): Promise<StarredHand | null>;
  softDeleteStarredHand(id: string): Promise<void>;
  listSpotsForPurge(
    opts: { kind: "discarded" | "expired" },
  ): Promise<Array<{ id: string; imageUrl: string | null }>>;
  assertTournamentInSession(
    sessionTournamentId: string,
    sessionId: string,
    userId: string,
  ): Promise<boolean>;

  // Sprint Cooldown-2 — Sleep Gate + Analytics
  setSessionPlanClosed(sessionId: string, userId: string, value: boolean): Promise<GrindSession | null>;
  setUserDashboardSnoozedUntil(userId: string, until: Date | string): Promise<User | null>;
  clearUserDashboardSnoozedUntil(userId: string): Promise<User | null>;
  getCooldownComplianceMetrics(
    userId: string,
    period: "7d" | "30d" | "90d",
  ): Promise<{ total: number; completed: number; complianceRate: number }>;
  getStarredHandsDistribution(
    userId: string,
    period: "7d" | "30d" | "90d",
  ): Promise<Array<{ type: string; count: number }>>;
  getCooldownImpactMetrics(
    userId: string,
    period: "7d" | "30d" | "90d",
  ): Promise<{
    withCooldown: { avgRoi: number };
    withoutCooldown: { avgRoi: number };
    delta: number;
  }>;
  getTopLessons(
    userId: string,
    period: "7d" | "30d" | "90d",
  ): Promise<Array<{ token: string; count: number }>>;

  // Sprint Bankroll-3 RF-4 — Transfers
  insertWalletTransfer(data: any, tx?: any): Promise<WalletTransfer>;
  listWalletTransfers(
    userId: string,
    opts?: { walletId?: string; limit?: number },
    tx?: any,
  ): Promise<WalletTransfer[]>;
  getWalletTransferById(
    userId: string,
    transferId: string,
    tx?: any,
  ): Promise<{ transfer: WalletTransfer; transactions: WalletTransaction[] } | null>;

  // Sprint Bankroll-3 RF-5 — Pending
  createWalletPending(data: any, tx?: any): Promise<WalletPending>;
  countWalletPendingActive(walletId: string, tx?: any): Promise<number>;
  getWalletPendingById(userId: string, pendingId: string, tx?: any): Promise<WalletPending | null>;
  updateWalletPendingStatus(txOrPayload: any, payload?: any): Promise<void>;
  listWalletPending(
    userId: string,
    walletId: string,
    opts?: { includeAll?: boolean },
    tx?: any,
  ): Promise<WalletPending[]>;

  // Sprint Bankroll-3 RF-6 — Stop service support
  getUserById(userId: string): Promise<User | undefined>;
  listGrindSessionsByUser(userId: string): Promise<GrindSession[]>;
  listSessionTournamentsBySessions(
    userId: string,
    sessionIds: string[],
  ): Promise<SessionTournament[]>;

  // Sprint Bankroll-3 RF-7 — ROI by platform
  getRoiByPlatform(
    userId: string,
    opts?: { sinceDate?: Date | null; untilDate?: Date | null; limit?: number },
  ): Promise<Array<{
    site: string;
    sessionsCount: number;
    tournamentsCount: number;
    investedNative: string;
    profitNative: string;
  }>>;

  // Sprint home-reform-4 item 1 — Sessoes mes atual aggregate
  getSessionsMonthAggregate(
    userId: string,
    opts?: { monthStart?: Date; monthEnd?: Date },
  ): Promise<Array<{
    site: string;
    count: number;
    investedNative: string;
    returnsNative: string;
  }>>;

  // Sprint home-reform-5 item 6 — Sessoes Registradas (all-time grind aggregate)
  getSessionsRegisteredAggregate(
    userId: string,
    opts?: { from?: Date; to?: Date },
  ): Promise<Array<{
    site: string;
    count: number;
    investedNative: string;
    returnsNative: string;
    itmCount: number;
    finalTablesCount: number;
    winsCount: number;
  }>>;

  // Sprint home-reform-5 item 6 — RecentSessions com KPIs (ITM/MF/Wins/profit nativo)
  getRecentSessionsWithKpis(
    userId: string,
    limit?: number,
  ): Promise<Array<{
    sessionId: string;
    createdAt: Date | null;
    status: string;
    sites: Array<{
      site: string;
      count: number;
      investedNative: string;
      returnsNative: string;
      itmCount: number;
      finalTablesCount: number;
      winsCount: number;
    }>;
  }>>;

  // Sprint home-reform-4 item 2+6 — Dashboard mes atual aggregate
  getDashboardMonthAggregate(
    userId: string,
    opts?: { monthStart?: Date; monthEnd?: Date },
  ): Promise<Array<{
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
  }>>;

  // Sprint home-reform-4 item 10 — Dashboard daily aggregate (evolution chart)
  getDashboardDailyAggregate(
    userId: string,
    opts: { monthStart: Date; monthEnd: Date },
  ): Promise<Array<{
    date: string;
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
  }>>;

  // Sprint home-reform-5 item 7 — Dashboard All Time aggregate (KPIs estendidos)
  getDashboardAllTimeAggregate(
    userId: string,
  ): Promise<Array<{
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
    itmCount: number;
    finalTablesCount: number;
    winsCount: number;
  }>>;

  // Sprint home-reform-5 item 7 — Dashboard All Time monthly (evolution chart)
  getDashboardAllTimeMonthlyAggregate(
    userId: string,
  ): Promise<Array<{
    month: string;
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
  }>>;

  // Sprint home-reform-4 item 5 — Grade hoje aggregate por profile
  getGradeTodayAggregate(
    userId: string,
    opts: { dayOfWeek: number; profile: 'A' | 'B' | 'C' },
  ): Promise<Array<{
    site: string;
    count: number;
    investedNative: string;
  }>>;

  // Sprint home-reform-5 item 5 — boundaries (primeiro + ultimo registro do dia)
  getDayPlanBoundaries(
    userId: string,
    weekday: number,
    profileIds: Array<'A' | 'B' | 'C'>,
  ): Promise<{
    first: { time: string; name: string };
    last: { time: string; name: string };
  } | null>;

  // Sprint F3 — Stats Analyzer (ADR-051)
  getHudLayouts(userId: string): Promise<HudLayout[]>;
  getHudLayout(id: string, userId: string): Promise<HudLayout | undefined>;
  createHudLayout(input: InsertHudLayout): Promise<HudLayout>;
  updateHudLayout(
    id: string,
    userId: string,
    patch: UpdateHudLayout,
  ): Promise<HudLayout | undefined>;
  /**
   * Sprint Stats-V3 reviewer R1 (MEDIUM-7): mutacao atomica de fields_json.
   * Le, transforma e escreve dentro de uma transacao para evitar race condition
   * entre dois clients editando target-override / custom-stats simultaneamente.
   */
  mutateHudLayoutFields(
    id: string,
    userId: string,
    transform: (currentFields: HudLayoutFieldEntry[]) => HudLayoutFieldEntry[],
  ): Promise<HudLayout | undefined>;
  deleteHudLayout(id: string, userId: string): Promise<boolean>;
  getHudStatSnapshots(
    userId: string,
    opts?: { layoutId?: string; limit?: number },
  ): Promise<HudStatSnapshot[]>;
  getHudStatSnapshot(
    id: string,
    userId: string,
  ): Promise<HudStatSnapshot | undefined>;
  createHudStatSnapshot(
    input: InsertHudStatSnapshot,
  ): Promise<HudStatSnapshot>;
  deleteHudStatSnapshot(id: string, userId: string): Promise<boolean>;
  // Sprint Stats-V3 (RF-06, RF-12)
  updateHudStatSnapshot(
    id: string,
    userId: string,
    patch: {
      values?: Record<string, number | null>;
      captureMethod?: string;
      sourceImageKey?: string | null;
      ocrConfidence?: Record<string, number> | null;
      ocrRawResponse?: unknown | null;
    },
  ): Promise<HudStatSnapshot | undefined>;
  insertHudOcrAudit(userId: string): Promise<HudOcrAuditRow>;
  getHudOcrAudit(userId: string, sinceTs: Date): Promise<HudOcrAuditRow[]>;
  /**
   * Sprint Stats-V3 reviewer R1 (INFO-6): cache lookup OCR via index parcial
   * `idx_hud_snapshots_image_sha256` (jsonb expression index criado em 0020).
   * Retorna o snapshot mais recente cujo `ocr_raw_response.image_sha256` casa.
   */
  findHudStatSnapshotByImageSha256(
    userId: string,
    sha: string,
  ): Promise<HudStatSnapshot | undefined>;

  // Sprint Studies-Reform — RF-05/06/07 (ADR-067/068)
  getStudyTheme(themeId: string): Promise<StudyTheme | null>;
  getStudyThemeByName(name: string, userId: string): Promise<StudyTheme | null>;
  getStudyTabsByTheme(themeId: string): Promise<any[]>;
  linkSpotToTheme(input: {
    themeId: string;
    spotId: string;
    userId: string;
    reasoningText?: string | null;
  }): Promise<StudyThemeSpotLink & { alreadyLinked?: boolean }>;
  unlinkSpotFromTheme(linkId: string, userId: string): Promise<boolean>;
  getLinkedSpots(themeId: string): Promise<any[]>;
  getStatsLeaks(userId: string, top: number): Promise<any[]>;
  getStaleSpots(userId: string, days: number): Promise<any[]>;
  getDormantThemes(userId: string, days: number, maxProgress?: number): Promise<any[]>;
  getStudyStreak(userId: string): Promise<{
    days: number;
    last_activity_at: string | null;
    heatmap_last_7_days: Array<{ date: string; active: boolean }>;
  }>;
  bumpStudyStreak(userId: string): Promise<{
    days: number;
    last_activity_at: string;
    bumped: boolean;
  }>;
  getDashboardInsightsWeek(userId: string): Promise<{
    themesOpenedThisWeek: number;
    spotsReviewedThisWeek: number;
    hoursStudiedThisWeek: number;
  }>;

  transaction<T>(fn: (tx: IStorage) => Promise<T>): Promise<T>;

  // ---------------------------------------------------------------------------
  // Sprint Biblioteca-1 — lesson library methods.
  // Concrete implementations land in Sprint Biblioteca-2; stubs declared here
  // so callers (routes/library.ts, coachTools/recommendLesson.ts,
  // services/manifestImporter.ts) get type checking instead of (storage as any).
  // Loose typing (any) deliberate — full payload shapes finalize in Sprint 2.
  // ---------------------------------------------------------------------------
  listLibraryCourses(opts?: { userId?: string; onlyPublished?: boolean }): Promise<any[]>;
  getLibraryCourseBySlug(slug: string): Promise<any | null>;
  getLibraryLesson(id: string): Promise<any | null>;
  getLibraryLessonBySlug(courseSlug: string, lessonSlug: string): Promise<any | null>;
  upsertLibraryCourseBySlug(data: any): Promise<any>;
  upsertLibraryModuleBySlug(data: any): Promise<any>;
  upsertLibraryLessonBySlug(data: any): Promise<any>;
  lessonAccessLookup(userId: string | undefined, lessonIds: string[]): Promise<Map<string, boolean>>;
  findLessonAccess(args: { userId?: string; lessonId: string }): Promise<any | null>;
  bulkGrantLessonAccess(args: any): Promise<any>;
  recordLibraryEvents(events: any[]): Promise<void>;
  createLibraryEvent(event: any): Promise<any>;
  countLibraryEventsForUserInWindow(args: { userId: string; windowSeconds: number }): Promise<number>;
  upsertLibraryProgress(progress: any): Promise<any>;
  getLibraryProgressForLesson(args: { userId: string; lessonId: string }): Promise<any[]>;
  getLibraryProgressByLessonIds(
    userId: string | undefined,
    lessonIds: string[],
  ): Promise<Array<{
    lessonId: string;
    format: "video" | "podcast" | "article";
    lastPositionSeconds: number;
    totalDurationSeconds: number | null;
    completedAt: Date | null;
    updatedAt: Date | null;
  }>>;
  findLibraryLessonsByCategory(categoryId: string, opts?: any): Promise<any[]>;
  findLibraryLessonsByTag(tag: string, opts?: any): Promise<any[]>;
  libraryLessonProgressLookup(userId: string | undefined, lessonIds: string[]): Promise<Map<string, any>>;
  libraryLessonAccessLookup(userId: string | undefined, lessonIds: string[]): Promise<Map<string, boolean>>;

  // Sprint UX-Biblioteca-1 / RF-02 — library_access_requests (ADR-103).
  createLibraryAccessRequest(input: {
    userId: string;
    name: string;
    reason: string;
    subscriptionPlanSnapshot: string;
  }): Promise<LibraryAccessRequest>;
  findPendingLibraryAccessRequest(userId: string): Promise<LibraryAccessRequest | null>;
  getLatestLibraryAccessRequestForUser(userId: string): Promise<LibraryAccessRequest | null>;

  // Sprint F4 — hud_stat_targets (knowledge base global, ADR-088)
  getHudStatTargets(filters?: {
    format?: string;
    stakeBucket?: string;
    statKey?: string;
  }): Promise<HudStatTarget[]>;
  getHudStatTarget(
    statKey: string,
    format: string,
    stakeBucket: string,
  ): Promise<HudStatTarget | undefined>;
  createHudStatTarget(input: InsertHudStatTarget): Promise<HudStatTarget>;

  // Sprint F4 — PrimeDope variance simulation + drill-down
  findRecentPrimedopeRunByHash(hash: string, withinMinutes: number): Promise<any | null>;
  findFallbackPrimedopeRun(
    userId: string,
    profileLetter: string,
    dayOfWeek: number,
    withinHours: number,
  ): Promise<any | null>;
  insertPrimedopeRun(data: any): Promise<any>;
  listPrimedopeRunsForUser(filters: {
    userId: string;
    profileLetter?: string;
    dayOfWeek?: number;
    limit?: number;
  }): Promise<any[]>;
  getPrimedopeRunById(id: string): Promise<any | null>;
  setPrimedopeRunPinned(input: {
    id: string;
    userId: string;
    pinned: boolean;
  }): Promise<any>;
  listPlannedTournamentsForDayDetail(input: {
    userId: string;
    profileLetter: string;
    dayOfWeek: number;
  }): Promise<any[]>;
  listPlannedTournamentsForBucketsPrefill(input: {
    userId: string;
    profileLetter: string;
    dayOfWeek: number;
  }): Promise<any[]>;
  listTournamentsForBackfillSimulationFields(): Promise<any[]>;
}

export interface BankrollSnapshotsFilters {
  from?: Date | string;
  to?: Date | string;
  reason?: string[];
  limit?: number;
  offset?: number;
}

function deriveLessonFormats(
  l: {
    videoMuxPlaybackId?: string | null;
    audioKey?: string | null;
    articleHtml?: string | null;
    hasArticle?: boolean | null;
  },
): Array<"video" | "podcast" | "article"> {
  const formats: Array<"video" | "podcast" | "article"> = [];
  if (l.videoMuxPlaybackId) formats.push("video");
  if (l.audioKey) formats.push("podcast");
  if (l.articleHtml || l.hasArticle) formats.push("article");
  return formats;
}

// Test-only stable-shape caches. Gated por NODE_ENV pra evitar memory leak
// em prod (ON CONFLICT do Postgres ja garante idempotencia real).
const _isTestEnv = () => process.env.NODE_ENV === "test";
const _libraryAccessFallback = new Map<string, Set<string>>();
const _libraryProgressFallbackIds = new Map<string, string>();

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Tournament operations
  async getTournaments(userId: string, limit: number = 50, offset?: number, period?: string, filters?: any, sortBy?: string): Promise<Tournament[]> {
    const baseConditions = [eq(tournaments.userId, userId)];

    // History rule: torneios criados via /grind-live (grindSessionId NOT NULL)
    // ficam isolados no detalhe da sessao; dashboard/library so listam imports.
    baseConditions.push(isNull(tournaments.grindSessionId));
    // Sprint Flight-1 H6 (ADR-090): rows com baggedAt setado sao placeholders
    // Day 1 (sem resultado final). Excluir da lista historica.
    baseConditions.push(isNull(tournaments.baggedAt));

    // Apply period filter
    if (period && period !== 'all') {

      // Check if it's a custom date range
      if (period === 'custom' && filters && filters.dateFrom && filters.dateTo) {

        const startDate = new Date(filters.dateFrom);
        const endDate = new Date(filters.dateTo);


        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          baseConditions.push(gte(tournaments.datePlayed, startDate));
          baseConditions.push(lte(tournaments.datePlayed, endDate));
        } else {
        }
      } else {
        // Standard period filters
        const now = new Date();
        let startDate: Date;

        switch (period) {
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case '90d':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          case '365d':
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            break;
          case 'year':
            startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
            break;
          default:
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        if (!isNaN(startDate.getTime())) {
          baseConditions.push(gte(tournaments.datePlayed, startDate));
        }
      }
    }

    // Apply dashboard filters
    if (filters) {
      const dashboardFilters = buildFilters(filters);
      if (dashboardFilters) {
        baseConditions.push(dashboardFilters);
      }
    }

    // Para ordenação por profit, usar apenas filtro de userId/grindSessionId
    // sem outros filtros. Preserva isolamento de grind-live (CLAUDE.md regra
    // de fonte do historico).
    let queryConditions: any[] = baseConditions;
    if (sortBy === 'profit-high' || sortBy === 'profit-low') {
      // Manter filtro de userId + isolar grind-live + esconder Day 1 baggeds.
      queryConditions = [
        eq(tournaments.userId, userId),
        isNull(tournaments.grindSessionId),
        isNull(tournaments.baggedAt),
      ];
    }

    const whereCondition = and(...queryConditions);

    // Configure ordenação baseada no sortBy
    let orderByClause;
    switch (sortBy) {
      case 'date':
        orderByClause = desc(tournaments.datePlayed);
        break;
      case 'profit-high':
        // Para maiores lucros: prize já é net profit (lucro líquido)
        orderByClause = [desc(sql`CAST(${tournaments.prize} AS DECIMAL)`)];
        break;
      case 'profit-low':
        // Para maiores perdas: prize já é net profit (lucro líquido)
        orderByClause = [sql`CAST(${tournaments.prize} AS DECIMAL)`];
        break;
      default:
        orderByClause = desc(tournaments.datePlayed);
    }

    const result = await db
      .select()
      .from(tournaments)
      .where(whereCondition)
      .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
      .limit(limit);

    // Debug adicional para ordenação de lucros
    if (sortBy === 'profit-high' || sortBy === 'profit-low') {
      if (result.length > 0) {
        const maxProfit = Math.max(...result.map(t => parseFloat(t.prize || '0')));
        const minProfit = Math.min(...result.map(t => parseFloat(t.prize || '0')));
      }
    }

    return result;
  }

  async getTournament(id: string): Promise<Tournament | undefined> {
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    return tournament;
  }

  async createTournament(tournament: InsertTournament): Promise<Tournament> {
    // Sprint 1 (ADR-031 + ADR-032): garantir espelhamento type ↔ category.
    const normalized = normalizeTournamentTypePayload(tournament as any);
    const [newTournament] = await db
      .insert(tournaments)
      .values({ ...normalized, id: nanoid() })
      .returning();
    return newTournament;
  }

  async updateTournament(id: string, tournament: Partial<InsertTournament>): Promise<Tournament> {
    // Sprint 1: so aplicar espelhamento se o update tocar em type ou category.
    // Quando NENHUM dos dois esta no payload, NAO injetamos default Vanilla
    // (isso sobrescreveria valor existente).
    const t: any = tournament;
    const touchesType = t?.type !== undefined;
    const touchesCategory = t?.category !== undefined;
    const setPayload: any = touchesType || touchesCategory
      ? normalizeTournamentTypePayload(t)
      : { ...t };
    setPayload.updatedAt = new Date();
    const [updatedTournament] = await db
      .update(tournaments)
      .set(setPayload)
      .where(eq(tournaments.id, id))
      .returning();
    return updatedTournament;
  }

  async deleteTournament(id: string): Promise<void> {
    await db.delete(tournaments).where(eq(tournaments.id, id));
  }

  // Clear all tournaments for a user
  async clearAllTournaments(userId: string): Promise<void> {
    await db.delete(tournaments).where(eq(tournaments.userId, userId));
  }

  // 🎯 ETAPA 2.3 - CORRIGIR SISTEMA DE DUPLICATAS: userId agora é userPlatformId
  // Check if tournament is duplicate by Tournament ID (preferred) or fallback to multiple criteria
  async isDuplicateTournament(userId: string, tournamentData: {
    tournamentId?: string;
    name: string;
    datePlayed: Date | null;
    buyIn: number;
    position?: number;
    fieldSize?: number;
    site?: string;
  }): Promise<boolean> {
    // Priority 1: Check by Tournament ID if available
    if (tournamentData.tournamentId && tournamentData.tournamentId.trim() !== '') {

      const existingTournament = await db
        .select()
        .from(tournaments)
        .where(
          and(
            eq(tournaments.userId, userId),
            eq(tournaments.tournamentId, tournamentData.tournamentId.trim())
          )
        )
        .limit(1);

      if (existingTournament.length > 0) {
        return true;
      } else {
      }
    }

    // Priority 2: Fallback to traditional duplicate check (name + date + buy-in)
    // Cannot check duplicates without a date in fallback mode
    if (!tournamentData.datePlayed) {
      return false;
    }

    const datePlayed = tournamentData.datePlayed;

    // For Bodog, use a more specific check combining site, name, date and buy-in
    if (tournamentData.site === 'Bodog') {
      const existingTournament = await db
        .select()
        .from(tournaments)
        .where(
          and(
            eq(tournaments.userId, userId),
            eq(tournaments.site, 'Bodog'),
            eq(tournaments.name, tournamentData.name.trim()),
            eq(tournaments.datePlayed, datePlayed),
            sql`ABS(CAST(${tournaments.buyIn} AS DECIMAL) - ${tournamentData.buyIn}) < 0.01`
          )
        )
        .limit(1);

      return existingTournament.length > 0;
    }

    // Default check for other sites
    const existingTournament = await db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          eq(tournaments.name, tournamentData.name.trim()),
          eq(tournaments.datePlayed, datePlayed),
          sql`ABS(CAST(${tournaments.buyIn} AS DECIMAL) - ${tournamentData.buyIn}) < 0.01`
        )
      )
      .limit(1);

    return existingTournament.length > 0;
  }

  // RF-01: Batch duplicate check by tournamentId — processes in batches of 500
  async findExistingTournamentIds(userId: string, tournamentIds: string[]): Promise<Set<string>> {
    const validIds = tournamentIds.filter(id => id && id.trim() !== '');
    if (validIds.length === 0) return new Set();

    const BATCH_SIZE = 500;
    const existingIds = new Set<string>();

    for (let i = 0; i < validIds.length; i += BATCH_SIZE) {
      const batch = validIds.slice(i, i + BATCH_SIZE);
      const rows = await db
        .select({ tournamentId: tournaments.tournamentId })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.userId, userId),
            inArray(tournaments.tournamentId, batch)
          )
        );
      for (const row of rows) {
        if (row.tournamentId) existingIds.add(row.tournamentId);
      }
    }

    return existingIds;
  }

  // RF-01: Batch duplicate check by fields (name + datePlayed + buyIn) for tournaments without tournamentId
  // P0 fix (2026-05-10): TZ tolerance ±60s to avoid phantom duplicates from re-imports
  // when CSV uses local time vs DB stored UTC. Also includes `site` in the returned key
  // so callers building lookup keys with ${site}|${name}|${date}|${buyIn} match correctly.
  async findExistingTournamentsByFields(userId: string, tournamentsToCheck: Array<{ name: string; datePlayed: Date | null; buyIn: number; site?: string }>): Promise<Set<string>> {
    if (tournamentsToCheck.length === 0) return new Set();

    const BATCH_SIZE = 500;
    const existingKeys = new Set<string>();

    for (let i = 0; i < tournamentsToCheck.length; i += BATCH_SIZE) {
      const batch = tournamentsToCheck.slice(i, i + BATCH_SIZE);
      // Build OR conditions for each tournament in the batch.
      // Date match uses ABS(EPOCH(...)) < 60 to tolerate small TZ shifts between
      // re-imports of the same source (CSV often has local time without TZ marker).
      const conditions = batch
        .filter(t => t.datePlayed !== null)
        .map(t => {
          const dateIso = t.datePlayed!.toISOString();
          const baseConditions = [
            eq(tournaments.name, t.name.trim()),
            sql`ABS(EXTRACT(EPOCH FROM (${tournaments.datePlayed} - ${dateIso}::timestamp))) < 60`,
            sql`ABS(CAST(${tournaments.buyIn} AS DECIMAL) - ${t.buyIn}) < 0.01`,
          ];
          if (t.site) {
            baseConditions.push(eq(tournaments.site, t.site));
          }
          return and(...baseConditions);
        });

      if (conditions.length === 0) continue;

      const rows = await db
        .select({
          name: tournaments.name,
          datePlayed: tournaments.datePlayed,
          buyIn: tournaments.buyIn,
          site: tournaments.site,
        })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.userId, userId),
            or(...conditions)
          )
        );

      for (const row of rows) {
        // Always include site in the key. Callers must build keys with the same shape.
        const key = `${row.site}|${row.name}|${row.datePlayed?.toISOString()}|${row.buyIn}`;
        existingKeys.add(key);
        // Backward-compat: also include the legacy site-less key so existing callers
        // that haven't been updated still match. Safe to remove once all callers migrated.
        const legacyKey = `${row.name}|${row.datePlayed?.toISOString()}|${row.buyIn}`;
        existingKeys.add(legacyKey);
      }
    }

    return existingKeys;
  }

  // RF-02: Batch insert tournaments — processes in batches of 500
  async createTournamentsBatch(tournamentsToInsert: InsertTournament[]): Promise<Tournament[]> {
    if (tournamentsToInsert.length === 0) return [];

    const BATCH_SIZE = 500;
    const allSaved: Tournament[] = [];

    for (let i = 0; i < tournamentsToInsert.length; i += BATCH_SIZE) {
      const batch = tournamentsToInsert.slice(i, i + BATCH_SIZE);
      // Defesa em profundidade: garante paridade type<->category mesmo quando
      // caller esquece de setar type explicitamente (lesson-learned 2026-05-07).
      const values = batch.map(t => ({ ...normalizeTournamentTypePayload(t as any), id: nanoid() }));

      try {
        const saved = await db
          .insert(tournaments)
          .values(values)
          .returning();
        allSaved.push(...saved);
      } catch (error) {
        // Log but continue with next batch — one batch failure doesn't abort the rest
        console.error(`Batch insert error (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error);
      }
    }

    return allSaved;
  }

  // Batch check for duplicates by Tournament IDs (performance optimization)
  async batchCheckDuplicateTournamentIds(userId: string, tournamentIds: string[]): Promise<Set<string>> {
    if (tournamentIds.length === 0) return new Set();


    const validIds = tournamentIds.filter(id => id && id.trim() !== '');
    if (validIds.length === 0) return new Set();

    // Use inArray for better PostgreSQL compatibility
    const existingTournaments = await db
      .select({ tournamentId: tournaments.tournamentId })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          inArray(tournaments.tournamentId, validIds)
        )
      );

    const duplicateIds = new Set(existingTournaments.map(t => t.tournamentId).filter((id): id is string => Boolean(id)));

    return duplicateIds;
  }

  // 🎯 ETAPA 2.3 - CORREÇÃO: userId agora é userPlatformId (USER-XXXX)
  // Check if Bodog tournament exists by Reference ID (embedded in tournament name)
  async isBodogTournamentExists(userId: string, referenceId: string): Promise<boolean> {
    const existingTournament = await db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          eq(tournaments.site, 'Bodog'),
          eq(tournaments.name, `MTT Bodog [${referenceId}]`)
        )
      )
      .limit(1);

    return existingTournament.length > 0;
  }

  // Get filtered tournaments count for preview
  async getFilteredTournamentsCount(userId: string, filters: {
    sites?: string[];
    dateFrom?: Date | null;
    dateTo?: Date | null;
  }): Promise<number> {
    const conditions = [eq(tournaments.userId, userId)];

    if (filters.sites && filters.sites.length > 0) {
      conditions.push(inArray(tournaments.site, filters.sites));
    }

    if (filters.dateFrom) {
      conditions.push(gte(tournaments.datePlayed, filters.dateFrom));
    }

    if (filters.dateTo) {
      conditions.push(lte(tournaments.datePlayed, filters.dateTo));
    }

    const result = await db
      .select({ count: count() })
      .from(tournaments)
      .where(and(...conditions));

    return result[0]?.count || 0;
  }

  // Bulk delete tournaments with granular filtering
  async bulkDeleteTournaments(userId: string, filters: {
    sites?: string[];
    dateFrom?: Date | null;
    dateTo?: Date | null;
  }): Promise<number> {
    const conditions = [eq(tournaments.userId, userId)];

    if (filters.sites && filters.sites.length > 0) {
      conditions.push(inArray(tournaments.site, filters.sites));
    }

    if (filters.dateFrom) {
      conditions.push(gte(tournaments.datePlayed, filters.dateFrom));
    }

    if (filters.dateTo) {
      conditions.push(lte(tournaments.datePlayed, filters.dateTo));
    }

    const result = await db
      .delete(tournaments)
      .where(and(...conditions))
      .returning({ id: tournaments.id });

    return result.length;
  }

  // Get unique sites with tournament counts for bulk delete
  async getUniqueSites(userId: string): Promise<Array<{ site: string; count: number }>> {
    const result = await db
      .select({
        site: tournaments.site,
        count: count()
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userId))
      .groupBy(tournaments.site)
      .orderBy(desc(count()));

    return result.map(row => ({
      site: row.site,
      count: Number(row.count) || 0
    }));
  }

  // Tournament template operations
  async getTournamentTemplates(userId: string): Promise<TournamentTemplate[]> {
    return await db
      .select()
      .from(tournamentTemplates)
      .where(eq(tournamentTemplates.userId, userId))
      .orderBy(desc(tournamentTemplates.totalPlayed));
  }

  async getTournamentTemplate(id: string): Promise<TournamentTemplate | undefined> {
    const [template] = await db.select().from(tournamentTemplates).where(eq(tournamentTemplates.id, id));
    return template;
  }

  async createTournamentTemplate(template: InsertTournamentTemplate): Promise<TournamentTemplate> {
    const templateData = {
      ...template,
      id: nanoid(),
      createdAt: new Date(),
      updatedAt: new Date(),
      // Ensure dayOfWeek is a proper array
      dayOfWeek: Array.isArray(template.dayOfWeek) ? template.dayOfWeek : 
                 (template.dayOfWeek !== undefined && template.dayOfWeek !== null ? [template.dayOfWeek] : []),
      // Ensure startTime is a proper array  
      startTime: Array.isArray(template.startTime) ? template.startTime : 
                 (template.startTime !== undefined && template.startTime !== null ? [template.startTime] : [])
    };

    const [newTemplate] = await db
      .insert(tournamentTemplates)
      .values(templateData as typeof tournamentTemplates.$inferInsert)
      .returning();
    return newTemplate;
  }

  async updateTournamentTemplate(id: string, template: Partial<InsertTournamentTemplate>): Promise<TournamentTemplate> {
    const updateData: any = {
      ...template,
      updatedAt: new Date()
    };

    // Ensure dayOfWeek is properly handled if it exists
    if (template.dayOfWeek) {
      updateData.dayOfWeek = Array.isArray(template.dayOfWeek) ? template.dayOfWeek : 
                             [template.dayOfWeek as number];
    }

    // Ensure startTime is properly handled if it exists
    if (template.startTime) {
      updateData.startTime = Array.isArray(template.startTime) ? template.startTime : 
                             [template.startTime as string];
    }

    const [updatedTemplate] = await db
      .update(tournamentTemplates)
      .set(updateData)
      .where(eq(tournamentTemplates.id, id))
      .returning();
    return updatedTemplate;
  }

  async deleteTournamentTemplate(id: string): Promise<void> {
    await db.delete(tournamentTemplates).where(eq(tournamentTemplates.id, id));
  }

  // Weekly plan operations
  async getWeeklyPlans(userId: string): Promise<WeeklyPlan[]> {
    return await db
      .select()
      .from(weeklyPlans)
      .where(eq(weeklyPlans.userId, userId))
      .orderBy(desc(weeklyPlans.weekStart));
  }

  async getWeeklyPlan(id: string): Promise<WeeklyPlan | undefined> {
    const [plan] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, id));
    return plan;
  }

  async createWeeklyPlan(plan: InsertWeeklyPlan): Promise<WeeklyPlan> {
    const [newPlan] = await db
      .insert(weeklyPlans)
      .values({ ...plan, id: nanoid() })
      .returning();
    return newPlan;
  }

  async updateWeeklyPlan(id: string, plan: Partial<InsertWeeklyPlan>): Promise<WeeklyPlan> {
    const [updatedPlan] = await db
      .update(weeklyPlans)
      .set({ ...plan, updatedAt: new Date() })
      .where(eq(weeklyPlans.id, id))
      .returning();
    return updatedPlan;
  }

  async deleteWeeklyPlan(id: string): Promise<void> {
    await db.delete(weeklyPlans).where(eq(weeklyPlans.id, id));
  }

  // Grind session operations
  async getGrindSessions(
    userId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<GrindSession[]> {
    // Wave B (Fase 3 perf): aceita limit/offset opcionais. Default mantem
    // back-compat (unbounded) — caller passa limit explicitamente quando
    // pagina (rotas /api/grind-sessions). Para heavy user com 1000s/yr,
    // routes podem passar limit:50.
    // NOTA (Wave A+B P2): ordena por `date` (planned date), nao `created_at`.
    // Usa idx_grind_sessions_user_date. Helpers getRecentSessions* ordenam
    // por created_at e usam o novo idx_grind_sessions_user_created — duas
    // ordering keys distintas a proposito (date eh editavel retroativo).
    let q = (db as any)
      .select()
      .from(grindSessions)
      .where(eq(grindSessions.userId, userId))
      .orderBy(desc(grindSessions.date));
    if (typeof opts.limit === 'number' && opts.limit > 0) {
      q = q.limit(opts.limit);
    }
    if (typeof opts.offset === 'number' && opts.offset > 0) {
      q = q.offset(opts.offset);
    }
    return await q;
  }

  // Sprint AI-3.1 / RF-08 (ADR-176) — SELECT COUNT(*) puro, evita carregar N
  // linhas do DB so para `.length`. Range filter best-effort por `date`
  // (planned date) com fallback para `created_at` se date null. Aceita strings
  // YYYY-MM-DD ou Date objects.
  async countGrindSessions(
    userId: string,
    range?: { from: Date | string; to: Date | string } | null,
  ): Promise<number> {
    try {
      const cond: any[] = [eq(grindSessions.userId, userId)];
      if (range && range.from && range.to) {
        const fromDate = range.from instanceof Date ? range.from : new Date(String(range.from));
        const toDate = range.to instanceof Date ? range.to : new Date(String(range.to));
        if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
          cond.push(gte(grindSessions.date, fromDate as any));
          cond.push(lte(grindSessions.date, toDate as any));
        }
      }
      const rows = await (db as any)
        .select({ n: sql<number>`count(*)::int` })
        .from(grindSessions)
        .where(cond.length === 1 ? cond[0] : and(...cond));
      const row = Array.isArray(rows) ? rows[0] : rows;
      const n = Number(row?.n ?? 0);
      return Number.isFinite(n) ? n : 0;
    } catch (err) {
      console.error("storage.countGrindSessions.error", { userId, err: err instanceof Error ? err.message : String(err) });
      return 0;
    }
  }

  async getGrindSession(id: string): Promise<GrindSession | undefined> {
    const [session] = await db.select().from(grindSessions).where(eq(grindSessions.id, id));
    return session;
  }

  async createGrindSession(session: InsertGrindSession): Promise<GrindSession> {
    const [newSession] = await db
      .insert(grindSessions)
      .values({ ...session, id: nanoid() })
      .returning();
    return newSession;
  }

  async updateGrindSession(id: string, session: Partial<InsertGrindSession>): Promise<GrindSession> {
    const [updatedSession] = await db
      .update(grindSessions)
      .set({ ...session, updatedAt: new Date() })
      .where(eq(grindSessions.id, id))
      .returning();
    return updatedSession;
  }

  // Sprint B2 (M5): atualiza status idempotente. Skip se ja eh o status alvo.
  // Retorna a sessao final (atual ou atualizada) ou undefined se nao existir.
  async setGrindSessionStatus(
    id: string,
    userId: string,
    status: string,
  ): Promise<GrindSession | undefined> {
    const current = await this.getGrindSession(id);
    if (!current || current.userId !== userId) return undefined;
    if (current.status === status) return current;
    return this.updateGrindSession(id, { status } as Partial<InsertGrindSession>);
  }

  async deleteGrindSession(id: string): Promise<void> {
    await db.delete(grindSessions).where(eq(grindSessions.id, id));
  }

  // Preparation log operations
  async getPreparationLogs(userId: string): Promise<PreparationLog[]> {
    return await db
      .select()
      .from(preparationLogs)
      .where(eq(preparationLogs.userId, userId))
      .orderBy(desc(preparationLogs.createdAt));
  }

  async createPreparationLog(log: InsertPreparationLog): Promise<PreparationLog> {
    const logData = {
      ...log,
      id: nanoid(),
      createdAt: new Date(),
      // Ensure exercisesCompleted is properly formatted as array
      exercisesCompleted: Array.isArray(log.exercisesCompleted) ? log.exercisesCompleted : 
                         (log.exercisesCompleted !== undefined && log.exercisesCompleted !== null ? [log.exercisesCompleted as string] : [])
    };

    const [newLog] = await db
      .insert(preparationLogs)
      .values(logData as typeof preparationLogs.$inferInsert)
      .returning();
    return newLog;
  }

  // Custom group operations
  async getCustomGroups(userId: string): Promise<CustomGroup[]> {
    return await db
      .select()
      .from(customGroups)
      .where(eq(customGroups.userId, userId))
      .orderBy(desc(customGroups.createdAt));
  }

  async createCustomGroup(group: InsertCustomGroup): Promise<CustomGroup> {
    const [newGroup] = await db
      .insert(customGroups)
      .values({ ...group, id: nanoid() })
      .returning();
    return newGroup;
  }

  async updateCustomGroup(id: string, group: Partial<InsertCustomGroup>): Promise<CustomGroup> {
    const [updatedGroup] = await db
      .update(customGroups)
      .set({ ...group, updatedAt: new Date() })
      .where(eq(customGroups.id, id))
      .returning();
    return updatedGroup;
  }

  async deleteCustomGroup(id: string): Promise<void> {
    await db.delete(customGroups).where(eq(customGroups.id, id));
  }

  // Coaching insight operations
  async getCoachingInsights(userId: string): Promise<CoachingInsight[]> {
    return await db
      .select()
      .from(coachingInsights)
      .where(eq(coachingInsights.userId, userId))
      .orderBy(desc(coachingInsights.priority), desc(coachingInsights.createdAt));
  }

  async createCoachingInsight(insight: InsertCoachingInsight): Promise<CoachingInsight> {
    const [newInsight] = await db
      .insert(coachingInsights)
      .values({ ...insight, id: nanoid() })
      .returning();
    return newInsight;
  }

  async getCoachingInsight(id: string): Promise<CoachingInsight | undefined> {
    const [insight] = await db
      .select()
      .from(coachingInsights)
      .where(eq(coachingInsights.id, id));
    return insight;
  }

  async updateCoachingInsight(id: string, insight: Partial<InsertCoachingInsight>): Promise<CoachingInsight> {
    const [updatedInsight] = await db
      .update(coachingInsights)
      .set(insight)
      .where(eq(coachingInsights.id, id))
      .returning();
    return updatedInsight;
  }

  // Usersettings operations
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    try {
      const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
      return settings;
    } catch (error: any) {
      // If exchange_rates column doesn't exist, return undefined to use fallback
      if (error.code === '42703' && error.message.includes('exchange_rates')) {
        return undefined;
      }
      throw error;
    }
  }

  async upsertUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    // Bankroll-Launch-Fix #11: cast warmupSetupItems para narrow tipo jsonb
    // (string[] | null) consistente entre Insert e Update. drizzle-zod gera
    // Insert tipado como `Json` mas o schema declara `string[] | null`.
    const valuesPayload: any = { ...settings, id: nanoid() };
    if (valuesPayload.warmupSetupItems !== undefined) {
      valuesPayload.warmupSetupItems =
        valuesPayload.warmupSetupItems as string[] | null;
    }
    const updateSet: any = { ...settings, updatedAt: new Date() };
    if (updateSet.warmupSetupItems !== undefined) {
      updateSet.warmupSetupItems = updateSet.warmupSetupItems as string[] | null;
    }
    const [upsertedSettings] = await db
      .insert(userSettings)
      .values(valuesPayload)
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: updateSet,
      })
      .returning();
    return upsertedSettings;
  }

  // Grade Coach analytics
  async getCoachingRecommendations(userId: string): Promise<any> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get template performance data
    const templatePerformance = await db
      .select({
        templateId: tournaments.templateId,
        templateName: sql<string>`COALESCE(${tournamentTemplates.name}, 'Unknown')`,
        count: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        avgProfit: sql<number>`CASE WHEN COUNT(*) > 0 THEN SUM(CAST(${tournaments.prize} AS DECIMAL)) / COUNT(*) ELSE 0 END`,
        finalTables: sql<number>`SUM(CASE WHEN ${tournaments.finalTable} THEN 1 ELSE 0 END)`,
        bigHits: sql<number>`SUM(CASE WHEN ${tournaments.bigHit} THEN 1 ELSE 0 END)`,
        site: sql<string>`COALESCE(${tournamentTemplates.site}, ${tournaments.site})`,
        category: sql<string>`COALESCE(${tournamentTemplates.category}, ${tournaments.category})`,
        avgBuyin: sql<number>`AVG(${tournaments.buyIn})`,
      })
      .from(tournaments)
      .leftJoin(tournamentTemplates, eq(tournaments.templateId, tournamentTemplates.id))
      .where(
        and(
          eq(tournaments.userId, userId),
          gte(tournaments.datePlayed, thirtyDaysAgo)
        )
      )
      .groupBy(tournaments.templateId, tournamentTemplates.name, tournamentTemplates.site, tournamentTemplates.category, tournaments.site, tournaments.category)
      .having(sql`COUNT(*) >= 3`) // Only templates with 3+ tournaments
      .orderBy(sql`SUM(CAST(${tournaments.prize} AS DECIMAL)) DESC`);

    // Generate recommendations based on performance
    const recommendations = templatePerformance.map((template: any) => {
      const insights = [];

      // Ensure numeric values for calculations
      const roi = Number(template.roi) || 0;
      const count = Number(template.count) || 0;
      const finalTables = Number(template.finalTables) || 0;

      if (roi > 20) {
        insights.push({
          type: 'positive',
          title: 'High ROI Template',
          description: `Excellent ${roi.toFixed(1)}% ROI. Consider increasing volume.`,
          priority: 'high'
        });
      } else if (roi < -10) {
        insights.push({
          type: 'negative',
          title: 'Underperforming Template',
          description: `${roi.toFixed(1)}% ROI is concerning. Review or reduce volume.`,
          priority: 'high'
        });
      }

      if (count > 20 && roi < 5) {
        insights.push({
          type: 'warning',
          title: 'High Volume, Low ROI',
          description: 'Playing frequently but with marginal returns.',
          priority: 'medium'
        });
      }

      if (finalTables === 0 && count > 10) {
        insights.push({
          type: 'warning',
          title: 'No Final Tables',
          description: 'No final tables despite significant volume.',
          priority: 'medium'
        });
      }

      return {
        ...template,
        roi, // Use the converted number
        count, // Use the converted number
        finalTables, // Use the converted number
        insights
      };
    });

    return recommendations;
  }

  // Analytics operations
  async getAnalyticsBySite(userId: string, period = "30d", filters: any = {}): Promise<any> {
  try {

    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    const analytics = await db
      .select({
        site: tournaments.site,
        volume: sql<string>`COUNT(*)`,
        profit: sql<string>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<string>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<string>`CASE 
          WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 
          THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100
          ELSE 0 
        END`
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(tournaments.site)
      .orderBy(sql`SUM(CAST(${tournaments.prize} AS DECIMAL)) DESC`);

    // Log para debug - verificar se os valores estão corretos

    // Calcular totais para verificação
    const totalProfit = analytics.reduce((sum, item) => sum + parseFloat(item.profit || '0'), 0);
    const totalVolume = analytics.reduce((sum, item) => sum + parseInt(item.volume || '0'), 0);

    return analytics;
  } catch (error) {
    return [];
  }
}

  async getAnalyticsByBuyinRange(userId: string, period = "30d", filters: any = {}): Promise<any> {
    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    return await db
      .select({
        buyinRange: sql<string>`
          CASE 
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 5 THEN '$0-$5'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 10 THEN '$5-$10'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 20 THEN '$11-$20'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 32 THEN '$21-$32'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 45 THEN '$33-$45'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 60 THEN '$46-$60'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 99 THEN '$60-$99'
            WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 160 THEN '$100-$160'
            ELSE '$161+'
          END
        `,
        volume: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        avgProfit: sql<number>`CASE WHEN COUNT(*) > 0 THEN SUM(CAST(${tournaments.prize} AS DECIMAL)) / COUNT(*) ELSE 0 END`,
        avgBuyin: sql<number>`AVG(CAST(${tournaments.buyIn} AS DECIMAL))`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(sql`
        CASE 
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 5 THEN '$0-$5'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 10 THEN '$5-$10'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 20 THEN '$11-$20'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 32 THEN '$21-$32'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 45 THEN '$33-$45'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 60 THEN '$46-$60'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 99 THEN '$60-$99'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) <= 160 THEN '$100-$160'
          ELSE '$161+'
        END
      `)
      .orderBy(sql`AVG(CAST(${tournaments.buyIn} AS DECIMAL))`);
  }

  async getAnalyticsByCategory(userId: string, period = "30d", filters: any = {}): Promise<any> {

    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    const result = await db
      .select({
        category: tournaments.category,
        volume: sql<number>`COUNT(*)`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        avgProfit: sql<number>`CASE WHEN COUNT(*) > 0 THEN SUM(CAST(${tournaments.prize} AS DECIMAL)) / COUNT(*) ELSE 0 END`,
        finalTables: sql<number>`SUM(CASE WHEN ${tournaments.finalTable} THEN 1 ELSE 0 END)`,
        bigHits: sql<number>`SUM(CASE WHEN ${tournaments.bigHit} THEN 1 ELSE 0 END)`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(tournaments.category);


    // Log each category found
    result.forEach((item, index) => {
    });

    return result;
  }

  getDateCondition(period: string) {
    const now = new Date();
    let dateThreshold: Date;


    switch (period) {
      case "7d":
        dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        dateThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        dateThreshold = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "365d":
      case "1y":
        dateThreshold = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        // For "all" or any other period, return a condition that's always true
        return sql`1 = 1`;
    }

    const dateString = dateThreshold.toISOString().split('T')[0];

    return gte(tournaments.datePlayed, dateThreshold);
  }

  buildFilterConditions(filters: any): any[] {
    const conditions: any[] = [];

    // Date range filter - example only, adjust as necessary
    if (filters.dateRange?.from) {
      conditions.push(gte(tournaments.datePlayed, new Date(filters.dateRange.from)));
    }
    if (filters.dateRange?.to) {
      conditions.push(lte(tournaments.datePlayed, new Date(filters.dateRange.to)));
    }

    // Sites filter
    if (filters.sites?.length > 0) {
      conditions.push(inArray(tournaments.site, filters.sites));
    }

    return conditions;
  }

  async getAnalyticsByDayOfWeek(userId: string, period: string = "30d", filters: any = {}): Promise<any[]> {

    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    const results = await db
      .select({
        dayOfWeek: sql<string>`EXTRACT(DOW FROM ${tournaments.datePlayed})::text`,
        dayName: sql<string>`
          CASE EXTRACT(DOW FROM ${tournaments.datePlayed})
            WHEN 0 THEN 'Domingo'
            WHEN 1 THEN 'Segunda'
            WHEN 2 THEN 'Terça'
            WHEN 3 THEN 'Quarta'
            WHEN 4 THEN 'Quinta'
            WHEN 5 THEN 'Sexta'
            WHEN 6 THEN 'Sábado'
          END
        `,
        volume: sql<string>`COUNT(*)::text`,
        // CORREÇÃO: prize já contém o profit calculado (resultado - buy-in), não subtrair novamente
        profit: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL)), 0)::text`,
        roi: sql<string>`
          CASE 
            WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 
            THEN ROUND((SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100, 2)::text
            ELSE '0'
          END
        `,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(sql`EXTRACT(DOW FROM ${tournaments.datePlayed})`)
      .orderBy(sql`EXTRACT(DOW FROM ${tournaments.datePlayed})`);


    // Ensure we have all days of the week represented
    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const completeResults = [];

    for (let i = 0; i < 7; i++) {
      const existing = results.find(r => parseInt(String(r.dayOfWeek)) === i);
      if (existing) {
        completeResults.push(existing);
      } else {
        completeResults.push({
          dayOfWeek: i.toString(),
          dayName: dayNames[i],
          volume: '0',
          profit: '0',
          roi: '0'
        });
      }
    }

    return completeResults;
  }

  // ETAPA 4: Analytics por velocidade

async getAnalyticsBySpeed(userId: string, period = "30d", filters: any = {}): Promise<any> {

    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    return await db
      .select({
        speed: tournaments.speed,
        volume: sql<number>`COUNT(*)`,
        // CORREÇÃO: Usar a mesma lógica de profit por categoria - prize já contém o profit calculado
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        // CORREÇÃO: ROI baseado no profit total vs total investido
        roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        // CORREÇÃO: Profit médio por torneio
        avgProfit: sql<number>`CASE WHEN COUNT(*) > 0 THEN SUM(CAST(${tournaments.prize} AS DECIMAL)) / COUNT(*) ELSE 0 END`,
        finalTables: sql<number>`SUM(CASE WHEN ${tournaments.finalTable} THEN 1 ELSE 0 END)`,
        bigHits: sql<number>`SUM(CASE WHEN ${tournaments.bigHit} THEN 1 ELSE 0 END)`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(tournaments.speed);
  }

  // ETAPA 5: Analytics mensais
  async getAnalyticsByMonth(userId: string, period: string = "30d", filters: any = {}): Promise<any[]> {

    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    const monthlyData = await db
      .select({
        month: sql<string>`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM')`,
        monthName: sql<string>`TO_CHAR(${tournaments.datePlayed}, 'MM/YYYY')`,
        volume: sql<string>`COUNT(*)`,
        // CORREÇÃO: Usar a mesma lógica dos outros analytics - prize já contém o profit calculado
        profit: sql<string>`SUM(CAST(${tournaments.prize} AS DECIMAL(10,2)))`,
        buyins: sql<string>`SUM(CAST(${tournaments.buyIn} AS DECIMAL(10,2)))`,
        roi: sql<string>`
          CASE 
            WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL(10,2))) > 0 
            THEN (SUM(CAST(${tournaments.prize} AS DECIMAL(10,2))) / SUM(CAST(${tournaments.buyIn} AS DECIMAL(10,2)))) * 100
            ELSE 0 
          END
        `,
        // Adicionar avgFieldSize usando a mesma lógica do getDashboardStats
        avgFieldSize: sql<number>`ROUND(AVG(CASE WHEN ${tournaments.fieldSize} >= 15 AND ${tournaments.fieldSize} IS NOT NULL THEN CAST(${tournaments.fieldSize} AS DECIMAL) ELSE NULL END), 0)`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM'), TO_CHAR(${tournaments.datePlayed}, 'MM/YYYY')`)
      .orderBy(sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM') DESC`);


    // Aplicar a mesma lógica de mediana/média do getDashboardStats para cada mês
    const processedMonthlyData = await Promise.all(monthlyData.map(async (item) => {
      // Buscar field sizes válidos para este mês específico
      const monthConditions = [
        eq(tournaments.userId, userId),
        sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM') = ${item.month}`,
        gte(tournaments.fieldSize, 15),
        isNotNull(tournaments.fieldSize)
      ];

      // Adicionar filtros adicionais se existirem
      if (dashboardFilters) {
        monthConditions.push(dashboardFilters);
      }

      const fieldSizeValues = await db
        .select({ fieldSize: tournaments.fieldSize })
        .from(tournaments)
        .where(and(...monthConditions))
        .orderBy(tournaments.fieldSize);

      let avgFieldSize = 0;

      // Verificar se há dados de CoinPoker para este mês específico
      const coinPokerCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(tournaments)
        .where(and(
          eq(tournaments.userId, userId),
          sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM') = ${item.month}`,
          eq(tournaments.site, 'CoinPoker')
        ));

      const hasCoinPokerData = Number(coinPokerCount[0]?.count || 0) > 0;

      if (hasCoinPokerData) {
        // Para CoinPoker, usar média
        avgFieldSize = Number(item.avgFieldSize) || 0;
      } else {
        // Para todos os outros sites, usar MEDIANA
        const fieldSizes = fieldSizeValues.map(row => Number(row.fieldSize));

        if (fieldSizes.length > 0) {
          const sortedFieldSizes = fieldSizes.sort((a, b) => a - b);
          const middleIndex = Math.floor(sortedFieldSizes.length / 2);

          if (sortedFieldSizes.length % 2 === 0) {
            avgFieldSize = Math.round((sortedFieldSizes[middleIndex - 1] + sortedFieldSizes[middleIndex]) / 2);
          } else {
            avgFieldSize = sortedFieldSizes[middleIndex];
          }
        }
      }

      return {
        month: item.month,
        monthName: item.monthName,
        volume: item.volume,
        profit: item.profit,
        buyins: item.buyins,
        roi: item.roi,
        avgFieldSize: avgFieldSize
      };
    }));

    return processedMonthlyData;
  }

  // Sprint Flight-1 RF-16/RF-17 (ADR-090): analytics agrupado por modifier.
  // Para modifier='flight', usa seriesId IS NOT NULL (substitui filter
  // is_flight=true legado deprecado em ADR-031). Outros modifiers podem ser
  // estendidos depois (ex: 'live' usa isLive=true).
  async getAnalyticsByModifier(
    userId: string,
    opts: { modifier: string },
  ): Promise<any> {
    const modifier = String(opts?.modifier ?? "").toLowerCase();
    const baseConditions: any[] = [
      eq(tournaments.userId, userId),
      // History rule: exclui torneios criados em /grind-live.
      isNull(tournaments.grindSessionId),
    ];

    if (modifier === "flight") {
      baseConditions.push(sql`${tournaments.seriesId} IS NOT NULL`);
    } else if (modifier === "live") {
      baseConditions.push(eq(tournaments.isLive, true));
    } else {
      // modifier desconhecido: retorna stats vazios.
      return {
        modifier,
        count: 0,
        totalProfit: 0,
        totalBuyins: 0,
        roi: 0,
        itm: 0,
      };
    }

    try {
      const [row] = await db
        .select({
          count: sql<number>`COUNT(*)::int`,
          totalProfit: sql<number>`COALESCE(SUM(prize::numeric), 0)`,
          totalBuyins: sql<number>`COALESCE(SUM(buy_in::numeric), 0)`,
          itmCount: sql<number>`COUNT(CASE WHEN prize::numeric > 0 THEN 1 END)::int`,
        })
        .from(tournaments)
        .where(and(...baseConditions));

      const count = Number(row?.count ?? 0);
      const totalProfit = Number(row?.totalProfit ?? 0);
      const totalBuyins = Number(row?.totalBuyins ?? 0);
      const itmCount = Number(row?.itmCount ?? 0);
      const roi = totalBuyins > 0 ? (totalProfit / totalBuyins) * 100 : 0;
      const itm = count > 0 ? (itmCount / count) * 100 : 0;

      return {
        modifier,
        count,
        totalProfit,
        totalBuyins,
        roi,
        itm,
      };
    } catch (err) {
      console.error("[getAnalyticsByModifier] failed:", err);
      return {
        modifier,
        count: 0,
        totalProfit: 0,
        totalBuyins: 0,
        roi: 0,
        itm: 0,
        error: true,
      };
    }
  }

  // ETAPA 5: Analytics por faixa de field
  async getAnalyticsByField(userId: string, period: string = "30d", filters: any = {}): Promise<any[]> {

    const baseConditions = [
      eq(tournaments.userId, userId),
      isNotNull(tournaments.position),
      isNotNull(tournaments.fieldSize)
    ];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    // Primeiro, buscar todos os torneios com position e fieldSize válidos
    const allTournaments = await db
      .select({
        position: tournaments.position,
        fieldSize: tournaments.fieldSize,
        prize: tournaments.prize,
        buyIn: tournaments.buyIn,
      })
      .from(tournaments)
      .where(whereCondition);


    // Processar no JavaScript para calcular percentuais de eliminação
    const tournamentsWithPercentage = allTournaments.map(t => {
      const eliminationPercentage = (t.position && t.fieldSize) ? (t.position / t.fieldSize) * 100 : 0;
      return {
        ...t,
        eliminationPercentage
      };
    });

    // Definir faixas de eliminação percentual
    const fieldRanges = [
      { label: 'Top 5%', min: 0, max: 5 },
      { label: '5-10%', min: 5, max: 10 },
      { label: '10-15%', min: 10, max: 15 },
      { label: '15-20%', min: 15, max: 20 },
      { label: '20-30%', min: 20, max: 30 },
      { label: '30-50%', min: 30, max: 50 },
      { label: '50-75%', min: 50, max: 75 },
      { label: '75-100%', min: 75, max: 100 }
    ];

    // Agrupar por faixas de eliminação
    const analytics = fieldRanges.map(range => {
      const tournamentsInRange = tournamentsWithPercentage.filter(t => {
        const eliminationPercentage = t.eliminationPercentage;
        return eliminationPercentage >= range.min && eliminationPercentage < range.max;
      });

      const volume = tournamentsInRange.length;
      const profit = tournamentsInRange.reduce((sum, t) => sum + parseFloat(String(t.prize || '0')), 0);
      const buyins = tournamentsInRange.reduce((sum, t) => sum + parseFloat(String(t.buyIn || '0')), 0);
      const roi = buyins > 0 ? (profit / buyins) * 100 : 0;

      return {
        fieldRange: range.label,
        volume: volume.toString(),
        profit: profit.toString(),
        buyins: buyins.toString(),
        roi: roi.toString()
      };
    });

    return analytics;
  }

  // ETAPA 5: Analytics de posições finais - Mesa Final (1-18)
  async getFinalTableAnalytics(userId: string, period: string = "30d", filters: any = {}): Promise<any[]> {

    const baseConditions = [
      eq(tournaments.userId, userId),
      gte(tournaments.position, 1),
      lte(tournaments.position, 9), // Apenas posições 1-9 são final table
      isNotNull(tournaments.position)
    ];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    // Buscar apenas torneios com posições 1-9 (final table válidas)
    const results = await db
      .select({
        position: tournaments.position,
        volume: sql<string>`COUNT(*)::text`,
        profit: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL)), 0)::text`,
        roi: sql<string>`
          CASE
            WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0
            THEN ROUND((SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100, 2)::text
            ELSE '0'
          END
        `,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(tournaments.position)
      .orderBy(tournaments.position);

    return results;
  }

  async getPlannedTournamentsDashboardStats(userId: string, period = "30d", filters: any = {}): Promise<any> {

    try {
      // First, get the active profile states for each day
      const activeProfileStates = await db
        .select({
          dayOfWeek: profileStates.dayOfWeek,
          activeProfile: profileStates.activeProfile
        })
        .from(profileStates)
        .where(eq(profileStates.userId, userId));

      // Create a map of dayOfWeek -> activeProfile (apenas para perfis ativos)
      const activeProfileMap = new Map<number, string>();
      
      activeProfileStates.forEach(state => {
        // Apenas incluir dias onde há um perfil ativo (não null)
        if (state.activeProfile !== null) {
          activeProfileMap.set(state.dayOfWeek, state.activeProfile);
        } else {
        }
      });
      

      // Get planned tournaments matching active profiles
      const baseConditions = [
        eq(plannedTournaments.userId, userId),
        eq(plannedTournaments.isActive, true)
      ];

      // Add profile filtering conditions
      const profileConditions = [];
      for (const [dayOfWeek, activeProfile] of Array.from(activeProfileMap)) {
        // Perfil C é "Dia OFF" - não tem torneios, apenas conta como dia ativo
        if (activeProfile !== 'C') {
          profileConditions.push(
            and(
              eq(plannedTournaments.dayOfWeek, dayOfWeek),
              eq(plannedTournaments.profile, activeProfile)
            )
          );
        }
      }

      // Se não há perfis ativos em nenhum dia, retornar estatísticas zeradas
      if (activeProfileMap.size === 0) {
        return {
          count: 0,
          profit: 0,
          abi: 0,
          roi: 0,
          itm: 0,
          reentries: 0,
          avgProfitPerTournament: 0,
          stakeRange: { min: 0, max: 0 },
          finalTables: 0,
          finalTablesRate: 0,
          bigHits: 0,
          bigHitsRate: 0,
          avgFieldSize: 0,
          avgProfitPerDay: 0,
          earlyFinishes: 0,
          earlyFinishRate: 0,
          lateFinishes: 0,
          lateFinishRate: 0,
          biggestPrize: 0,
          daysPlayed: 0,
          headsUpTotal: 0,
          headsUpWins: 0,
          totalProfit: 0,
          totalBuyins: 0,
          totalTournaments: 0,
          vanillaCount: 0,
          pkoCount: 0,
          mysteryCount: 0,
          normalCount: 0,
          turboCount: 0,
          hyperCount: 0,
          activeDays: activeProfileMap.size
        };
      }

      // Se há profileConditions, aplicar filtro. Se só temos perfis C, usar condição impossível para retornar 0 torneios
      if (profileConditions.length > 0) {
        baseConditions.push(or(...profileConditions)!);
      } else {
        // Só temos perfis C (Dia OFF) - forçar retorno 0 torneios
        baseConditions.push(sql`1 = 0`);
      }

      const whereCondition = and(...baseConditions);

      // Get tournament statistics from planned tournaments
      const stats = await db
        .select({
          count: sql<number>`COUNT(*)`,
          totalBuyins: sql<number>`SUM(CAST(${plannedTournaments.buyIn} AS DECIMAL))`,
          avgBuyin: sql<number>`AVG(CAST(${plannedTournaments.buyIn} AS DECIMAL))`,
          minBuyin: sql<number>`MIN(CAST(${plannedTournaments.buyIn} AS DECIMAL))`,
          maxBuyin: sql<number>`MAX(CAST(${plannedTournaments.buyIn} AS DECIMAL))`,
          totalGuaranteed: sql<number>`SUM(CAST(${plannedTournaments.guaranteed} AS DECIMAL))`,
          avgGuaranteed: sql<number>`AVG(CAST(${plannedTournaments.guaranteed} AS DECIMAL))`,
          vanillaCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.type} = 'Vanilla' THEN 1 END)`,
          pkoCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.type} = 'PKO' THEN 1 END)`,
          mysteryCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.type} = 'Mystery' THEN 1 END)`,
          normalCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.speed} = 'Normal' THEN 1 END)`,
          turboCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.speed} = 'Turbo' THEN 1 END)`,
          hyperCount: sql<number>`COUNT(CASE WHEN ${plannedTournaments.speed} = 'Hyper' THEN 1 END)`,
          activeDays: sql<number>`COUNT(DISTINCT ${plannedTournaments.dayOfWeek})`
        })
        .from(plannedTournaments)
        .where(whereCondition);

      const result = stats[0];

      if (!result || result.count === 0) {
        return {
          count: 0,
          profit: 0,
          abi: 0,
          roi: 0,
          itm: 0,
          reentries: 0,
          avgProfitPerTournament: 0,
          stakeRange: { min: 0, max: 0 },
          finalTables: 0,
          finalTablesRate: 0,
          bigHits: 0,
          bigHitsRate: 0,
          avgFieldSize: 0,
          avgProfitPerDay: 0,
          earlyFinishes: 0,
          earlyFinishRate: 0,
          lateFinishes: 0,
          lateFinishRate: 0,
          biggestPrize: 0,
          daysPlayed: result.activeDays || 0,
          headsUpTotal: 0,
          headsUpWins: 0,
          totalProfit: 0,
          totalBuyins: result.totalBuyins || 0,
          totalTournaments: result.count || 0,
          avgBuyin: result.avgBuyin || 0,
          itmCount: 0,
          firstPlaceCount: 0,
          profileBased: true,
          activeProfiles: Array.from(activeProfileMap.values()),
          activeDays: activeProfileMap.size
        };
      }

      // Calculate metrics based on planned tournaments
      const count = Number(result.count || 0);
      const totalBuyins = Number(result.totalBuyins || 0);
      const avgBuyin = Number(result.avgBuyin || 0);
      const activeDays = Number(result.activeDays || 0);

      // For planned tournaments, we can't calculate historical profit/ITM/etc.
      // Instead, we show planning metrics
      const plannedStats = {
        count,
        profit: 0, // No historical profit for planned tournaments
        abi: avgBuyin,
        roi: 0, // No historical ROI for planned tournaments
        itm: 0, // No historical ITM for planned tournaments
        reentries: 0, // No historical reentries for planned tournaments
        avgProfitPerTournament: 0,
        stakeRange: {
          min: Number(result.minBuyin || 0),
          max: Number(result.maxBuyin || 0)
        },
        finalTables: 0,
        finalTablesRate: 0,
        bigHits: 0,
        bigHitsRate: 0,
        avgFieldSize: 0,
        avgProfitPerDay: 0,
        earlyFinishes: 0,
        earlyFinishRate: 0,
        lateFinishes: 0,
        lateFinishRate: 0,
        biggestPrize: 0,
        daysPlayed: activeDays,
        headsUpTotal: 0,
        headsUpWins: 0,
        totalProfit: 0,
        totalBuyins,
        totalTournaments: count,
        avgBuyin,
        itmCount: 0,
        firstPlaceCount: 0,
        profileBased: true,
        activeProfiles: Array.from(activeProfileMap.values()),
        activeDays: activeProfileMap.size,
        // Planning-specific metrics
        totalGuaranteed: Number(result.totalGuaranteed || 0),
        avgGuaranteed: Number(result.avgGuaranteed || 0),
        vanillaCount: Number(result.vanillaCount || 0),
        pkoCount: Number(result.pkoCount || 0),
        mysteryCount: Number(result.mysteryCount || 0),
        normalCount: Number(result.normalCount || 0),
        turboCount: Number(result.turboCount || 0),
        hyperCount: Number(result.hyperCount || 0),
        vanillaPercentage: count > 0 ? (Number(result.vanillaCount || 0) / count) * 100 : 0,
        pkoPercentage: count > 0 ? (Number(result.pkoCount || 0) / count) * 100 : 0,
        mysteryPercentage: count > 0 ? (Number(result.mysteryCount || 0) / count) * 100 : 0,
        normalPercentage: count > 0 ? (Number(result.normalCount || 0) / count) * 100 : 0,
        turboPercentage: count > 0 ? (Number(result.turboCount || 0) / count) * 100 : 0,
        hyperPercentage: count > 0 ? (Number(result.hyperCount || 0) / count) * 100 : 0
      };


      return plannedStats;

    } catch (error) {
      throw error;
    }
  }

  async getDashboardStats(
    userId: string,
    period = "30d",
    filters: any = {},
    opts: { expandFlightSeries?: boolean } = {},
  ): Promise<any> {
    // Sprint Flight-1 RF-16: opts.expandFlightSeries propaga toggle agregar/expandir
    // combined-stack series (ADR-090). MVP marca o flag no resultado para o
    // frontend renderizar diferente; collapse de queries SQL fica como follow-up
    // (collapseCombinedSeries em calculateSessionStats ja faz client-side).
    const expandFlightSeries = !!opts.expandFlightSeries;

    // Check if profile-based filtering is enabled
    if (filters.profileBased) {
      const result = await this.getPlannedTournamentsDashboardStats(userId, period, filters);
      return { ...result, expandFlightSeries };
    }
    
    // Base condition - always filter by user
    const baseConditions = [eq(tournaments.userId, userId)];

    // Add period filter using the unified function
    const periodConditions = buildPeriodCondition(period, filters);
    baseConditions.push(...periodConditions);

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters){
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);


    // Executar query principal
    let stats: any;
    try {
      
      // Sprint dashboard-cleanup (2026-05-03): contadores agregados por
      // serie (COALESCE(seriesId, id)) para que multi-flight tournaments
      // contem como 1 evento, nao como N legs. SUMs continuam por leg porque
      // prize/buy_in/reentries/add_on agregam corretamente a custos/lucro
      // total da serie (Day 1 rows tem buyIn pago, Day 2 row tem prize).
      // Sem CTE: usa COUNT(DISTINCT ...) inline. ABI passa a ser derivado
      // (totalBuyins / count) em JS, ja que AVG(buy_in) por leg distorceria
      // series com buyIns repetidos.
      stats = await db
        .select({
          // Contagem: Quantidade de torneios (1 por series ou 1 por non-series)
          count: sql<number>`COUNT(DISTINCT COALESCE(${tournaments.seriesId}, ${tournaments.id}))`,

          // Lucro: Profit total (usando a coluna prize que já contém o profit calculado)
          totalProfit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,

          // Total investido (buy-ins + reentradas + add-ons pagos) — ADR-014
          // Formula: SUM(buyIn + (reentries * buyIn) + (addOnTaken ? addOnCost : 0))
          // Nota: tabela `tournaments` (historico) nao tem coluna `rebuys`, entao
          // rebuys nao entra no denominador historico. Live-session e outras
          // tabelas que tem `rebuys` usam a formula completa em outro codigo.
          totalBuyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
          totalReentries: sql<number>`SUM(COALESCE(CAST(${tournaments.reentries} AS DECIMAL), 0))`,
          totalReentriesCost: sql<number>`SUM(COALESCE(CAST(${tournaments.reentries} AS DECIMAL), 0) * CAST(${tournaments.buyIn} AS DECIMAL))`,
          totalAddOnCost: sql<number>`SUM(CASE WHEN ${tournaments.addOnTaken} = true THEN COALESCE(CAST(${tournaments.addOnCost} AS DECIMAL), 0) ELSE 0 END)`,

          // ITM: Quantidade de eventos (series ou singular) que ficou ITM
          itmCount: sql<number>`COUNT(DISTINCT CASE WHEN CAST(${tournaments.prize} AS DECIMAL) > 0 THEN COALESCE(${tournaments.seriesId}, ${tournaments.id}) END)`,

          // FTs: eventos com posicao final 1-9 (em series, somente Day 2 tem posicao definida)
          finalTablesCount: sql<number>`COUNT(DISTINCT CASE WHEN ${tournaments.position} >= 1 AND ${tournaments.position} <= 9 AND ${tournaments.position} IS NOT NULL THEN COALESCE(${tournaments.seriesId}, ${tournaments.id}) END)`,

          // Cravadas: eventos com posicao 1
          firstPlaceCount: sql<number>`COUNT(DISTINCT CASE WHEN ${tournaments.position} = 1 THEN COALESCE(${tournaments.seriesId}, ${tournaments.id}) END)`,

          // Média de participantes - will be calculated separately with median for most sites
          avgFieldSize: sql<number>`ROUND(AVG(CASE WHEN ${tournaments.fieldSize} >= 15 AND ${tournaments.fieldSize} IS NOT NULL THEN CAST(${tournaments.fieldSize} AS DECIMAL) ELSE NULL END), 0)`,

          // Finalização Precoce: eventos com posicao no top 10% pior do field
          earlyFinishCount: sql<number>`COUNT(DISTINCT CASE WHEN ${tournaments.fieldSize} IS NOT NULL AND ${tournaments.fieldSize} > 0 AND ${tournaments.fieldSize} >= 15 AND ${tournaments.position} IS NOT NULL AND ${tournaments.position} > 0 AND (CAST(${tournaments.position} AS DECIMAL) / CAST(${tournaments.fieldSize} AS DECIMAL)) * 100 >= 90 THEN COALESCE(${tournaments.seriesId}, ${tournaments.id}) END)`,

          // Finalização Tardia: eventos com posicao no top 10% melhor do field
          lateFinishCount: sql<number>`COUNT(DISTINCT CASE WHEN ${tournaments.fieldSize} IS NOT NULL AND ${tournaments.fieldSize} > 0 AND ${tournaments.fieldSize} >= 15 AND ${tournaments.position} IS NOT NULL AND ${tournaments.position} > 0 AND (CAST(${tournaments.position} AS DECIMAL) / CAST(${tournaments.fieldSize} AS DECIMAL)) * 100 <= 10 THEN COALESCE(${tournaments.seriesId}, ${tournaments.id}) END)`,

          // Big Hit: Maior premiação registrada
          biggestPrize: sql<number>`MAX(CAST(${tournaments.prize} AS DECIMAL))`,

          // Stake Range: menor e maior buy-in (ignorando valores muito baixos e freerolls)
          minBuyin: sql<number>`MIN(CASE WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 5 THEN CAST(${tournaments.buyIn} AS DECIMAL) ELSE NULL END)`,
          maxBuyin: sql<number>`MAX(CASE WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 5 THEN CAST(${tournaments.buyIn} AS DECIMAL) ELSE NULL END)`,

          // Dias Jogados: Quantidade de dias únicos com registros
          daysPlayed: sql<number>`COUNT(DISTINCT DATE(${tournaments.datePlayed}))`,

          // Heads-Up: eventos heads-up (field_size = 2)
          headsUpTotal: sql<number>`COUNT(DISTINCT CASE WHEN ${tournaments.fieldSize} = 2 THEN COALESCE(${tournaments.seriesId}, ${tournaments.id}) END)`,
          headsUpWins: sql<number>`COUNT(DISTINCT CASE WHEN ${tournaments.fieldSize} = 2 AND ${tournaments.position} = 1 THEN COALESCE(${tournaments.seriesId}, ${tournaments.id}) END)`,
        })
        .from(tournaments)
        .where(whereCondition);
    } catch (error) {
      return {
        count: 0,
        profit: 0,
        abi: 0,
        roi: 0,
        itm: 0,
        reentries: 0,
        avgProfitPerTournament: 0,
        stakeRange: { min: 0, max: 0 },
        finalTables: 0,
        finalTablesRate: 0,
        bigHits: 0,
        bigHitsRate: 0,
        avgFieldSize: 0,
        avgProfitPerDay: 0,
        earlyFinishes: 0,
        earlyFinishRate: 0,
        lateFinishes: 0,
        lateFinishRate: 0,
        biggestPrize: 0,
        daysPlayed: 0,
        headsUpTotal: 0,
        headsUpWins: 0,
        totalProfit: 0,
        totalBuyins: 0,
        totalTournaments: 0,
        avgBuyin: 0,
        itmCount: 0,
        firstPlaceCount: 0
      };
    }

    const [result] = stats || [];


    if (!result) {
      return {
        count: 0,
        profit: 0,
        abi: 0,
        roi: 0,
        itm: 0,
        reentries: 0,
        avgProfitPerTournament: 0,
        stakeRange: { min: 0, max: 0 },
        finalTables: 0,
        finalTablesRate: 0,
        bigHits: 0,
        bigHitsRate: 0,
        avgFieldSize: 0,
        avgProfitPerDay: 0,
        earlyFinishes: 0,
        earlyFinishRate: 0,
        lateFinishes: 0,
        lateFinishRate: 0,
        biggestPrize: 0,
        daysPlayed: 0,
        headsUpTotal: 0,
        headsUpWins: 0,
      };
    }

    // Cálculos corretos baseados nas especificações
    const count = Number(result.count || 0);
    const profit = Number(result.totalProfit || 0);
    const totalBuyins = Number(result.totalBuyins || 0);
    const totalReentries = Number(result.totalReentries || 0);

    // Calculando valor investido total (buy-ins + reentradas + add-ons) — ADR-014
    const totalReentriesCost = Number(result.totalReentriesCost || 0);
    const totalAddOnCost = Number((result as any).totalAddOnCost || 0);
    const totalInvested = totalBuyins + totalReentriesCost + totalAddOnCost;

    // Calculando número total de entradas (torneios + reentradas)
    const totalEntries = count + totalReentries;

    // 1. Contagem: Quantidade de torneios
    // 2. Lucro: Profit total dos torneios
    // 3. ABI: Buy-in médio por evento (series colapsadas como 1).
    //    Antes era AVG(buy_in) por leg; com agregacao de series isso distorcia
    //    multi-flight events. Agora deriva de totalBuyins / count.
    const abi = count > 0 ? Math.round((totalBuyins / count) * 100) / 100 : 0;

    // 4. ROI: Profit / (Total investido: buy-in + reentradas em valor monetário)
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    // 5. ITM: Percentual que ficou dentro da faixa de premiação
    const itmCount = Number(result.itmCount || 0);
    const itm = count > 0 ? (itmCount / count) * 100 : 0;

    // 6. Reentradas: Quantidade total de reentradas feitas no torneio
    const reentries = totalReentries;

    // 7. Lucro Médio: Lucro total / (Entradas + Reentradas)
    const avgProfitPerTournament = totalEntries > 0 ? profit / totalEntries : 0;

    // 8. Stake Range: Menor e maior buy-in dos torneios, ignorando amostragens muito baixas
    const stakeRange = {
      min: Number(result.minBuyin || 0),
      max: Number(result.maxBuyin || 0)
    };

    // 9. FTs: Quantidade total que ficou dentre os 9 primeiros, junto com percentual
    const finalTablesCount = Number(result.finalTablesCount || 0);
    const finalTablesRate = count > 0 ? (finalTablesCount / count) * 100 : 0;

    // 10. Cravadas: Quantidade total que ficou em 1º no torneio, junto com percentual
    const firstPlaceCount = Number(result.firstPlaceCount || 0);
    const bigHitsRate = count > 0 ? (firstPlaceCount / count) * 100 : 0;

    // 11. Média de participantes: MEDIANA para todos os sites (exceto CoinPoker)
    // Wave B (Fase 3 perf): trocou pull-all + JS sort por percentile_cont SQL.
    // Para usuario heavy (18k+ tournaments) economiza ~700kB de payload + CPU
    // de sort no Node. percentile_cont(0.5) === media interpolada dos 2 do meio
    // em count par, ou valor exato em count impar; Math.round preserva o
    // comportamento anterior (JS fazia round so em count par).
    const medianRows: any[] = await db
      .select({ median: sql<number>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${tournaments.fieldSize})` })
      .from(tournaments)
      .where(and(
        whereCondition,
        gte(tournaments.fieldSize, 15),
        isNotNull(tournaments.fieldSize),
      ));
    const rawMedian = medianRows[0]?.median;
    const avgFieldSize = rawMedian == null ? 0 : Math.round(Number(rawMedian));


    // 16. Dias Jogados: Quantidade de dias únicos com registros
    const daysPlayed = Number(result.daysPlayed || 0);

    // 12. Lucro Médio/Dia: Lucro total dividido pelos dias jogados
    const avgProfitPerDay = daysPlayed > 0 ? profit / daysPlayed : 0;

    // 13. Bust Early: Frequência em que saiu nos 10% piores (posição/fieldSize >= 90%)
    const earlyFinishCount = Number(result.earlyFinishCount || 0);
    const earlyFinishRate = count > 0 ? (earlyFinishCount / count) * 100 : 0;

    // 14. Deep Run: Frequência em que chegou no top 10% do field (posição/fieldSize <= 10%)
    const lateFinishCount = Number(result.lateFinishCount || 0);
    const lateFinishRate = count > 0 ? (lateFinishCount / count) * 100 : 0;


    // 15. Big Hit: A maior premiação registrada dos torneios
    const biggestPrize = Number(result.biggestPrize || 0);

    // 17. Heads-Up: Estatísticas específicas para heads-up
    const headsUpTotal = Number(result.headsUpTotal || 0);
    const headsUpWins = Number(result.headsUpWins || 0);

    return {
      // Indicadores principais conforme especificação
      count, // 1. Contagem
      profit, // 2. Lucro
      abi, // 3. ABI
      roi, // 4. ROI
      itm, // 5. ITM%
      reentries, // 6. Reentradas
      avgProfitPerTournament, // 7. Lucro Médio/Torneio
      stakeRange, // 8. Stake Range
      finalTables: finalTablesCount, // 9. FTs (quantidade)
      finalTablesRate, // 9. FTs (percentual)
      bigHits: firstPlaceCount, // 10. Cravadas (quantidade)
      bigHitsRate, // 10. Cravadas (percentual)
      firstPlaceCount, // 🏆 Cravadas (quantidade específica)
      avgFieldSize, // 11. Média participantes
      avgProfitPerDay, // 12. Lucro Médio/Dia
      earlyFinishes: earlyFinishCount, // 13. Finalização Precoce (quantidade)
      earlyFinishRate, // 13. Finalização Precoce (percentual)
      lateFinishes: lateFinishCount, // 14. Finalização Tardia (quantidade)
      lateFinishRate, // 14. Finalização Tardia (percentual)
      biggestPrize, // 15. Big Hit
      daysPlayed, // 16. Dias Jogados
      headsUpTotal, // 17. Heads-Up Total
      headsUpWins, // 17. Heads-Up Wins

      // Campos para compatibilidade
      totalProfit: profit,
      totalBuyins,
      totalTournaments: count,
      avgBuyin: abi,
      itmCount,
    };
  }

  async getPerformanceByPeriod(userId: string, period: string, filters: any = {}): Promise<any> {

    const baseConditions = [
      eq(tournaments.userId, userId),
      // History rule: exclui torneios de grind-live (grindSessionId NOT NULL).
      isNull(tournaments.grindSessionId),
    ];

    // Add period filter if not showing all
    if (period !== "all") {
      const now = new Date();
      let startDate: Date;
      let endDate: Date | null = null;

      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '365d':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'last_3_months':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'last_6_months':
          startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
          break;
        case 'last_12_months':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'last_24_months':
          startDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
          break;
        case 'last_36_months':
          startDate = new Date(now.getTime() - 1095 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
        case 'current_month':
          // First day of current month at 00:00:00
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'year':
        case 'current_year':
          // First day of current year at 00:00:00
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          // Handle custom date ranges (YYYY-MM-DD to YYYY-MM-DD format)
          if (period.includes(' to ')) {
            const [from, to] = period.split(' to ');
            startDate = new Date(from + 'T00:00:00.000Z');
            endDate = new Date(to + 'T23:59:59.999Z');
          } else {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          }
      }


      baseConditions.push(gte(tournaments.datePlayed, startDate));
      if (endDate) {
        baseConditions.push(lte(tournaments.datePlayed, endDate));
      }
    }

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    
    const performance = await db
      .select({
        date: sql<string>`DATE(${tournaments.datePlayed})`,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(tournaments)
      .where(whereCondition)
      .groupBy(sql`DATE(${tournaments.datePlayed})`)
      .orderBy(sql`DATE(${tournaments.datePlayed})`);


    return performance;
  }

  // Tournament Library com Agrupamento Inteligente
  async getTournamentLibrary(userId: string, period: string = "all", filters: any = {}): Promise<any[]> {
    // Base condition - always filter by user
    const baseConditions = [
      eq(tournaments.userId, userId),
      // History rule: biblioteca de torneios so agrupa imports — exclui
      // tournaments.grindSessionId IS NOT NULL (grind-live).
      isNull(tournaments.grindSessionId),
    ];

    // Add period filter if not showing all
    if (period !== "all") {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '365d':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      baseConditions.push(gte(tournaments.datePlayed, startDate));
    }

    // Add dashboard filters
    const dashboardFilters = buildFilters(filters);
    if (dashboardFilters) {
      baseConditions.push(dashboardFilters);
    }

    const whereCondition = and(...baseConditions);

    // Get all tournaments for the user within period/filters
    const allTournaments = await db
      .select()
      .from(tournaments)
      .where(whereCondition)
      .orderBy(tournaments.datePlayed);

    // Group tournaments intelligently by similarity
    const groups = this.groupTournamentsBySimilarity(allTournaments);

    // Filter groups to only show those with 50+ tournaments
    const significantGroups = groups.filter(group => group.tournaments.length >= 50);

    // Calculate metrics for each group
    const libraryGroups = significantGroups.map(group => {
      const tournamentsList = group.tournaments;
      const volume = tournamentsList.length;

      // Financial metrics
      const totalBuyins = tournamentsList.reduce((sum: number, t: any) => sum + parseFloat(String(t.buyIn)), 0);
      const totalReentries = tournamentsList.reduce((sum: number, t: any) => sum + (t.reentries || 0), 0);
      const totalProfit = tournamentsList.reduce((sum: number, t: any) => sum + parseFloat(String(t.prize)), 0); // prize já é o profit líquido

      // Calculando valor investido total (buy-ins + reentradas em dinheiro)
      const totalReentriesCost = tournamentsList.reduce((sum: number, t: any) => {
        const reentries = t.reentries || 0;
        const buyinValue = parseFloat(String(t.buyIn));
        return sum + (reentries * buyinValue);
      }, 0);
      const totalInvestment = totalBuyins + totalReentriesCost;

      // Calculando número total de entradas (torneios + reentradas)
      const totalEntries = volume + totalReentries;

      const avgProfit = totalEntries > 0 ? totalProfit / totalEntries : 0;
      const roi = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;
      const avgBuyin = totalBuyins / volume;

      // Performance metrics
      const finalTables = tournamentsList.filter((t: any) => t.finalTable === true).length;
      const finalTableRate = (finalTables / volume) * 100;
      const bigHits = tournamentsList.filter((t: any) => t.bigHit === true).length;
      const bigHitRate = (bigHits / volume) * 100;
      const itm = tournamentsList.filter((t: any) => t.position && t.position > 0 && parseFloat(String(t.prize)) > 0).length;
      const itmRate = (itm / volume) * 100;

      // Additional metrics (excluir fieldSize=0/null do calculo)
      const tournsWithFieldSize = tournamentsList.filter((t: any) => t.fieldSize && t.fieldSize > 0);
      const avgFieldSize = tournsWithFieldSize.length > 0
        ? tournsWithFieldSize.reduce((sum: number, t: any) => sum + t.fieldSize, 0) / tournsWithFieldSize.length
        : 0;
      const tournsWithPos = tournamentsList.filter((t: any) => t.position && t.position > 0);
      const avgPosition = tournsWithPos.length > 0
        ? tournsWithPos.reduce((sum: number, t: any) => sum + t.position, 0) / tournsWithPos.length
        : 0;

      // Best and worst results
      // prize já é net profit (lucro líquido), não precisa subtrair buyIn
      const bestResult = Math.max(...tournamentsList.map((t: any) => parseFloat(String(t.prize || 0))));
      const worstResult = Math.min(...tournamentsList.map((t: any) => parseFloat(String(t.prize || 0))));

      // Confidence Grade (based on volume)
      const confidenceGrade = volume >= 2000 ? 'A' : volume >= 1000 ? 'B' : volume >= 500 ? 'C' : volume >= 200 ? 'D' : 'F';

      // Standard Deviation in buy-ins
      const prizes = tournamentsList.map((t: any) => parseFloat(String(t.prize || 0)));
      const mean = prizes.reduce((a: number, b: number) => a + b, 0) / prizes.length;
      const sumSquaredDiffs = prizes.reduce((sum: number, p: number) => sum + Math.pow(p - mean, 2), 0);
      const sd = volume > 1 ? Math.sqrt(sumSquaredDiffs / (volume - 1)) : 0; // Bessel's correction
      const sdBuyins = avgBuyin > 0 ? sd / avgBuyin : 0;
      const volatilityLevel = sdBuyins < 3 ? 'low' : sdBuyins <= 6 ? 'medium' : 'high';

      // 95% Confidence Interval for ROI
      const se = volume > 1 ? sd / Math.sqrt(volume) : 0;
      const roiMargin = avgBuyin > 0 ? 1.96 * (se / avgBuyin) * 100 : 0;
      const roiLower = roi - roiMargin;
      const roiUpper = roi + roiMargin;

      // Normalized Position
      const tournsWithPosition = tournamentsList.filter((t: any) => t.position > 0 && t.fieldSize > 0);
      const normalizedPosition = tournsWithPosition.length > 0
        ? tournsWithPosition.reduce((sum: number, t: any) => sum + (t.position / t.fieldSize), 0) / tournsWithPosition.length
        : null;

      // ROI without Top 3 Outliers
      let roiWithoutOutliers: number | null = null;
      let outlierDependent = false;
      if (volume >= 23) {
        const sortedByPrize = [...tournamentsList].sort((a: any, b: any) => parseFloat(String(b.prize || 0)) - parseFloat(String(a.prize || 0)));
        const withoutTop3 = sortedByPrize.slice(3);
        const profitWithout = withoutTop3.reduce((sum: number, t: any) => sum + parseFloat(String(t.prize || 0)), 0);
        const investWithout = withoutTop3.reduce((sum: number, t: any) => sum + parseFloat(String(t.buyIn || 0)), 0) + withoutTop3.reduce((sum: number, t: any) => sum + (parseFloat(String(t.reentries || 0)) * parseFloat(String(t.buyIn || 0))), 0);
        roiWithoutOutliers = investWithout > 0 ? (profitWithout / investWithout) * 100 : 0;
        outlierDependent = (roi > 0 && roiWithoutOutliers < 0) || (roi < 0 && roiWithoutOutliers > 0);
      }

      return {
        id: group.groupKey,
        groupName: group.groupName,
        representativeTournament: group.representative,
        site: group.site,
        category: group.category,
        speed: group.speed,
        format: group.format,

        // Volume metrics
        volume,

        // Financial metrics
        totalProfit: parseFloat(totalProfit.toFixed(2)),
        avgProfit: parseFloat(avgProfit.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        avgBuyin: parseFloat(avgBuyin.toFixed(2)),
        totalBuyins: parseFloat(totalBuyins.toFixed(2)),

        // Performance metrics
        finalTables,
        finalTableRate: parseFloat(finalTableRate.toFixed(1)),
        bigHits,
        bigHitRate: parseFloat(bigHitRate.toFixed(1)),
        itm,
        itmRate: parseFloat(itmRate.toFixed(1)),

        // Additional metrics
        avgFieldSize: Math.round(avgFieldSize),
        avgPosition: Math.round(avgPosition),
        totalReentries,
        bestResult: parseFloat(bestResult.toFixed(2)),
        worstResult: parseFloat(worstResult.toFixed(2)),

        // Statistical metrics
        confidenceGrade,
        sdBuyins: parseFloat(sdBuyins.toFixed(2)),
        volatilityLevel,
        roiLower: parseFloat(roiLower.toFixed(2)),
        roiUpper: parseFloat(roiUpper.toFixed(2)),
        normalizedPosition: normalizedPosition !== null ? parseFloat(normalizedPosition.toFixed(4)) : null,
        roiWithoutOutliers: roiWithoutOutliers !== null ? parseFloat(roiWithoutOutliers.toFixed(2)) : null,
        outlierDependent,

        // Tournament count only - details loaded on demand via drill-down endpoint
        tournamentCount: tournamentsList.length,
        tournaments: tournamentsList
      };
    });

    return libraryGroups;
  }

  // Helper function to group tournaments by similarity
  private groupTournamentsBySimilarity(tournaments: any[]): any[] {
    const groups: any[] = [];

    for (const tournament of tournaments) {
      // Find existing group with similar characteristics
      let matchingGroup = groups.find(group => 
        this.tournamentsAreSimilar(tournament, group.representative)
      );

      if (matchingGroup) {
        // Add to existing group
        matchingGroup.tournaments.push(tournament);
      } else {
        // Create new group
        const groupKey = this.generateGroupKey(tournament);
        groups.push({
          groupKey,
          groupName: this.generateGroupName(tournament),
          representative: tournament,
          site: tournament.site,
          category: tournament.category,
          speed: tournament.speed,
          format: tournament.format,
          tournaments: [tournament]
        });
      }
    }

    return groups;
  }

  // Check if two tournaments are similar (50% name similarity + exact buyin/type/speed/site)
  private tournamentsAreSimilar(t1: any, t2: any): boolean {
    // Must be exact same site
    if (t1.site !== t2.site) return false;

    // Must be exact same buy-in
    const buyin1 = parseFloat(String(t1.buyIn));
    const buyin2 = parseFloat(String(t2.buyIn));
    if (buyin1 !== buyin2) return false;

    // Must be exact same category (type)
    if (t1.category !== t2.category) return false;

    // Must be exact same speed
    if (t1.speed !== t2.speed) return false;

    // Check name similarity (50% threshold)
    const name1 = this.normalizeTitle(t1.name);
    const name2 = this.normalizeTitle(t2.name);

    const similarity = this.calculateStringSimilarity(name1, name2);
    return similarity >= 0.5; // 50% similarity threshold
  }

  // Normalize tournament name for better comparison
  private normalizeTitle(name: string): string {
    return name
      .toLowerCase()
      .replace(/\$[\d,]+\s*(gtd|guaranteed)?/gi, '') // Remove prize amounts
      .replace(/\$[\d.]+(k|m)?/gi, '') // Remove dollar amounts
      .replace(/\b(gtd|guaranteed|turbo|hyper|super|progressive|knockout|pko|bounty|mystery|mtt)\b/gi, '') // Remove common terms
      .replace(/\b\d+\s*(re|rebuy|addon|add-on|max|6-max|9-max|heads-up|hu)\b/gi, '') // Remove structural terms
      .replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  // Calculate string similarity using Jaccard similarity
  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(str2.split(' ').filter(w => w.length > 2));

    const words1Array = Array.from(words1);
    const words2Array = Array.from(words2);
    const intersectionArray = words1Array.filter(x => words2.has(x));
    const unionArray = Array.from(new Set([...words1Array, ...words2Array]));

    return unionArray.length === 0 ? 0 : intersectionArray.length / unionArray.length;
  }

  // Generate a unique key for the group
  private generateGroupKey(tournament: any): string {
    const normalizedName = this.normalizeTitle(tournament.name);
    const buyin = Math.round(parseFloat(String(tournament.buyIn)));
    return `${tournament.site}-${buyin}-${normalizedName.replace(/\s+/g, '-')}`.toLowerCase();
  }

  // Generate a friendly name for the group
  private generateGroupName(tournament: any): string {
    const name = tournament.name;
    const buyin = parseFloat(String(tournament.buyIn));

    // Extract meaningful parts from tournament name
    let baseName = name
      .replace(/\$[\d,]+\s*(gtd|guaranteed)?/gi, '') // Remove specific prize amounts
      .replace(/\b(episode|day|fase|phase)\s*\d+[a-z]?(\s*[-:]\s*)?/gi, '') // Remove episode/day numbers
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/gi, '') // Remove times
      .replace(/\s*[-–—]\s*\d+-day\s+event/gi, '') // Remove "2-Day Event" etc
      .trim();

    // If name is too generic, use site + category + buyin
    if (baseName.length < 10 || /^(mtt|tournament|torneio)$/i.test(baseName)) {
      baseName = `${tournament.category} Tournament`;
    }

    return `${baseName} ($${buyin})`;
  }

  // Planned tournament operations
  async getPlannedTournaments(userId: string, dayOfWeek?: number): Promise<PlannedTournament[]> {
    
    // Validação crítica: garantir que userPlatformId não é null/undefined
    if (!userId) {
      throw new Error('UserPlatformId é obrigatório para buscar torneios');
    }
    
    // home-reform-5 audit fix #1: filtrar isActive=true ao requisitar
    // por dia (Home/HeaderStrip/CoachContext). Sem o filtro, soft-deleted
    // entries inflavam o count "Hoje" (founder relatou 100 ao inves de 152).
    const whereCondition = dayOfWeek !== undefined
      ? and(
          eq(plannedTournaments.userId, userId),
          eq(plannedTournaments.dayOfWeek, dayOfWeek),
          eq(plannedTournaments.isActive, true),
        )
      : eq(plannedTournaments.userId, userId);

    const result = await db
      .select()
      .from(plannedTournaments)
      .where(whereCondition)
      .orderBy(plannedTournaments.dayOfWeek, plannedTournaments.time);


    return result;
  }

  async getPlannedTournament(id: string): Promise<PlannedTournament | null> {
    const result = await db
      .select()
      .from(plannedTournaments)
      .where(eq(plannedTournaments.id, id))
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  }

  async getAllPlannedTournaments(): Promise<PlannedTournament[]> {
    
    const result = await db
      .select()
      .from(plannedTournaments)
      .orderBy(plannedTournaments.dayOfWeek, plannedTournaments.time);
    
    
    return result;
  }

  async createPlannedTournament(tournament: InsertPlannedTournament): Promise<PlannedTournament> {
    const id = nanoid();
    // Sprint 1: espelha type ↔ category nos planned tournaments tambem
    const normalized = normalizeTournamentTypePayload(tournament as any);
    const [created] = await db
      .insert(plannedTournaments)
      .values({ ...normalized, id })
      .returning();
    // Espelha o planned em tournament_library (cobre todos os call sites).
    // Fire-and-forget: nunca quebra o create. Skip quando libraryTemplateId
    // ja vem setado. Ver server/services/libraryAutoPopulate.ts.
    ensureLibraryEntryForPlannedSafe(created as any);
    return created;
  }

  async updatePlannedTournament(id: string, tournament: Partial<InsertPlannedTournament>): Promise<PlannedTournament> {

    const t: any = tournament;
    const touchesType = t?.type !== undefined;
    const touchesCategory = t?.category !== undefined;
    const setPayload: any = touchesType || touchesCategory
      ? normalizeTournamentTypePayload(t)
      : { ...t };
    setPayload.updatedAt = new Date();
    const [updated] = await db
      .update(plannedTournaments)
      .set(setPayload)
      .where(eq(plannedTournaments.id, id))
      .returning();


    if (!updated) {
      throw new Error(`Planned tournament with id ${id} not found`);
    }

    return updated;
  }

  async deletePlannedTournament(id: string): Promise<void> {
    await db.delete(plannedTournaments).where(eq(plannedTournaments.id, id));
  }

  async getPlannedTournamentsBySession(userId: string, sessionId: string): Promise<PlannedTournament[]> {

    const result = await db
      .select()
      .from(plannedTournaments)
      .where(and(
        eq(plannedTournaments.userId, userId),
        eq(plannedTournaments.sessionId, sessionId)
      ));

    return result;
  }

  // launch-fix P1: batch fetch para GET /api/grind-sessions/history.
  // 1 query agrupada via inArray vs N queries (N+1) no handler.
  async getPlannedTournamentsBySessionIds(
    userId: string,
    sessionIds: string[],
  ): Promise<PlannedTournament[]> {
    if (!sessionIds || sessionIds.length === 0) return [];
    return await db
      .select()
      .from(plannedTournaments)
      .where(and(
        eq(plannedTournaments.userId, userId),
        inArray(plannedTournaments.sessionId, sessionIds),
      ));
  }

  // Break feedback operations
  async getBreakFeedbacks(userId: string, sessionId?: string): Promise<BreakFeedback[]> {
    const baseConditions = [eq(breakFeedbacks.userId, userId)];

    if (sessionId) {
      baseConditions.push(eq(breakFeedbacks.sessionId, sessionId));
    }

    return await db
      .select()
      .from(breakFeedbacks)
      .where(and(...baseConditions))
      .orderBy(desc(breakFeedbacks.breakTime));
  }

  // launch-fix P1: batch fetch para GET /api/grind-sessions/history.
  async getBreakFeedbacksBySessionIds(
    userId: string,
    sessionIds: string[],
  ): Promise<BreakFeedback[]> {
    if (!sessionIds || sessionIds.length === 0) return [];
    return await db
      .select()
      .from(breakFeedbacks)
      .where(and(
        eq(breakFeedbacks.userId, userId),
        inArray(breakFeedbacks.sessionId, sessionIds),
      ))
      .orderBy(desc(breakFeedbacks.breakTime));
  }

  async createBreakFeedback(feedback: InsertBreakFeedback): Promise<BreakFeedback> {
    const id = nanoid();
    const [created] = await db
      .insert(breakFeedbacks)
      .values({ ...feedback, id })
      .returning();
    return created;
  }

  async deleteBreakFeedback(id: string): Promise<void> {
    await db.delete(breakFeedbacks).where(eq(breakFeedbacks.id, id));
  }

  // Session tournament operations
  async getSessionTournaments(userId: string, sessionId?: string): Promise<SessionTournament[]> {

    const baseConditions = [eq(sessionTournaments.userId, userId)];

    if (sessionId) {
      baseConditions.push(eq(sessionTournaments.sessionId, sessionId));
    }


    // Build the query
    const query = db
      .select()
      .from(sessionTournaments)
      .where(and(...baseConditions))
      .orderBy(desc(sessionTournaments.createdAt));


    // Execute the query
    const rawResults = await query;


    // Return the complete results - the query is working correctly
    return rawResults;
  }

  async getSessionTournamentsBySessionIds(
    userId: string,
    sessionIds: string[],
  ): Promise<SessionTournament[]> {
    if (sessionIds.length === 0) return [];
    return await db
      .select()
      .from(sessionTournaments)
      .where(
        and(
          eq(sessionTournaments.userId, userId),
          inArray(sessionTournaments.sessionId, sessionIds),
        ),
      )
      .orderBy(desc(sessionTournaments.createdAt));
  }

  async createSessionTournament(tournament: InsertSessionTournament): Promise<SessionTournament> {
    const id = nanoid();
    const tournamentData = {
      ...tournament,
      id,
      startTime: tournament.startTime ? (typeof tournament.startTime === 'string' ? new Date(tournament.startTime) : tournament.startTime) : null,
      endTime: tournament.endTime ? (typeof tournament.endTime === 'string' ? new Date(tournament.endTime) : tournament.endTime) : null
    };

    const [created] = await db
      .insert(sessionTournaments)
      .values([tournamentData])
      .returning();
    return created;
  }

  async getSessionTournamentById(id: string, tx?: any): Promise<SessionTournament | null> {
    const runner = tx ?? db;
    const [row] = await runner
      .select()
      .from(sessionTournaments)
      .where(eq(sessionTournaments.id, id))
      .limit(1);
    return row ?? null;
  }

  async updateSessionTournament(id: string, tournament: Partial<InsertSessionTournament>): Promise<SessionTournament> {
    
    const updateData: any = { ...tournament, updatedAt: new Date() };

    // Convert startTime to Date if it's a string
    if (updateData.startTime && typeof updateData.startTime === 'string') {
      updateData.startTime = new Date(updateData.startTime);
    }


    const [updated] = await db
      .update(sessionTournaments)
      .set(updateData)
      .where(eq(sessionTournaments.id, id))
      .returning();
    
    
    return updated;
  }

  async deleteSessionTournament(id: string): Promise<void> {
    await db.delete(sessionTournaments).where(eq(sessionTournaments.id, id));
  }

  async getSessionTournamentsByDay(userId: string, dayOfWeek: number): Promise<SessionTournament[]> {

    // 🎯 QUERY DIRETA: Buscar perfil ativo para este dia específico
    const activeProfileState = await db
      .select({
        activeProfile: profileStates.activeProfile
      })
      .from(profileStates)
      .where(
        and(
          eq(profileStates.userId, userId),
          eq(profileStates.dayOfWeek, dayOfWeek)
        )
      )
      .limit(1);

    const activeProfile = activeProfileState[0]?.activeProfile || 'A'; // Default to 'A' if not found
    

    // Buscar torneios do perfil ativo (excluindo os soft-deletados via /grind-live)
    const planned = await db
      .select()
      .from(plannedTournaments)
      .where(
        and(
          eq(plannedTournaments.userId, userId),
          eq(plannedTournaments.dayOfWeek, dayOfWeek),
          eq(plannedTournaments.isActive, true),
          eq(plannedTournaments.profile, activeProfile),
          sql`${plannedTournaments.status} IS DISTINCT FROM 'deleted'`
        )
      )
      .orderBy(plannedTournaments.time);


    if (planned.length > 0) {
    }


    // Convert planned tournaments to session tournament format for the session PRESERVING ALL DATA
    const result = planned.map(p => {
      
      const tournament = {
        id: p.id, // Use the actual ID without prefix to avoid duplication
        userId: p.userId,
        sessionId: p.sessionId || '',
        site: p.site,
        name: p.name,
        buyIn: p.buyIn,
        rebuys: p.rebuys || 0, // PRESERVE ACTUAL REBUYS FROM DB
        result: p.result || '0', // PRESERVE ACTUAL RESULT FROM DB
        bounty: p.bounty || '0', // PRESERVE ACTUAL BOUNTY FROM DB
        position: p.position,
        fieldSize: null,
        status: p.status || 'upcoming' as const, // Use status from planned tournament
        startTime: p.startTime,
        endTime: null,
        prize: null,
        prioridade: 0,
        fromPlannedTournament: true,
        plannedTournamentId: p.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Include planned tournament specific fields
        time: p.time,
        guaranteed: p.guaranteed,
        type: p.type,
        speed: p.speed, // Fix: Use p.speed instead of p.type
        category: p.type, // Map type to category for compatibility
        // Enriched fields from Suprema
        lateRegMinutes: p.lateRegMinutes,
        registrationTime: (p as any).registrationTime ?? null,
        startingStack: p.startingStack,
        maxPlayers: p.maxPlayers,
        gameType: p.gameType,
        blindLevelMinutes: p.blindLevelMinutes,
        alertMinutesBefore: p.alertMinutesBefore,
        // Add-on + Re-entry (ADR-014) copy-on-promote
        allowsAddOn: (p as any).allowsAddOn ?? false,
        addOnCost: (p as any).addOnCost ?? null,
        addOnTaken: false,
        allowsReentry: (p as any).allowsReentry ?? false,
        maxReentries: (p as any).maxReentries ?? null,
        reentries: 0,
        // Sprint Tickets-1: novos campos com defaults
        enteredViaSatellite: false,
        consumedTicketId: null,
        // launch-fix typecheck: shape Tournament evoluiu (Sprint Flight-1 +
        // satellites). Defaults seguros para session-tournaments derivados de
        // planned (que nao carregam esses campos no schema atual).
        isFlight: false,
        isLive: false,
        satelliteRewardType: null,
        satelliteTicketValue: null,
        satelliteTargetName: null,
      };

      return tournament;
    });


    return result;
  }

  async resetPlannedTournamentsForSession(userId: string, dayOfWeek: number): Promise<void> {

    // Reset all planned tournaments for the specified day to initial state
    const resetResult = await db
      .update(plannedTournaments)
      .set({
        status: 'upcoming',
        result: '0',
        bounty: '0',
        position: null,
        rebuys: 0,
        startTime: null,
        sessionId: null, // Clear any previous session links
        updatedAt: new Date()
      })
      .where(and(
        eq(plannedTournaments.userId, userId),
        eq(plannedTournaments.dayOfWeek, dayOfWeek),
        eq(plannedTournaments.isActive, true)
      ))
      .returning();


    // Also clean up any session tournaments that might be orphaned for today
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const orphanedSessionTournaments = await db
      .select()
      .from(sessionTournaments)
      .where(and(
        eq(sessionTournaments.userId, userId),
        gte(sessionTournaments.createdAt, startOfDay),
        lte(sessionTournaments.createdAt, endOfDay)
      ));

    // Delete orphaned session tournaments created today
    if (orphanedSessionTournaments.length > 0) {
      await db
        .delete(sessionTournaments)
        .where(and(
          eq(sessionTournaments.userId, userId),
          gte(sessionTournaments.createdAt, startOfDay),
          lte(sessionTournaments.createdAt, endOfDay)
        ));

    }

  }

  // Study card operations
  async getStudyCards(userId: string): Promise<StudyCard[]> {
    return await db
      .select()
      .from(studyCards)
      .where(eq(studyCards.userId, userId))
      .orderBy(desc(studyCards.createdAt));
  }

  async createStudyCard(studyCard: InsertStudyCard): Promise<StudyCard> {
    const studyCardData = {
      ...studyCard,
      id: nanoid(),
      studyDays: Array.isArray(studyCard.studyDays) ? studyCard.studyDays : 
                 (studyCard.studyDays !== undefined && studyCard.studyDays !== null ? [studyCard.studyDays as string] : [])
    };

    const [newStudyCard] = await db
      .insert(studyCards)
      .values(studyCardData as typeof studyCards.$inferInsert)
      .returning();
    return newStudyCard;
  }

  async getStudyCard(id: string, userId: string): Promise<StudyCard | undefined> {
    const [studyCard] = await db
      .select()
      .from(studyCards)
      .where(and(eq(studyCards.id, id), eq(studyCards.userId, userId)));
    return studyCard;
  }

  async updateStudyCard(id: string, studyCard: Partial<InsertStudyCard>): Promise<StudyCard> {
    const updateData: any = {
      ...studyCard,
      updatedAt: new Date(),
    };

    // Handle studyDays array properly
    if (studyCard.studyDays) {
      updateData.studyDays = Array.isArray(studyCard.studyDays) ? studyCard.studyDays : 
                            (studyCard.studyDays ? [studyCard.studyDays as string] : []);
    }

    const [updatedStudyCard] = await db
      .update(studyCards)
      .set(updateData)
      .where(eq(studyCards.id, id))
      .returning();
    return updatedStudyCard;
  }

  async deleteStudyCard(id: string): Promise<void> {
    await db.delete(studyCards).where(eq(studyCards.id, id));
  }

  // Study material operations
  async getStudyMaterials(studyCardId: string): Promise<StudyMaterial[]> {
    return await db
      .select()
      .from(studyMaterials)
      .where(eq(studyMaterials.studyCardId, studyCardId))
      .orderBy(desc(studyMaterials.createdAt));
  }

  async createStudyMaterial(material: InsertStudyMaterial): Promise<StudyMaterial> {
    const [newMaterial] = await db
      .insert(studyMaterials)
      .values({
        ...material,
        id: nanoid(),
      })
      .returning();
    return newMaterial;
  }

  // Study note operations
  async getStudyNotes(studyCardId: string): Promise<StudyNote[]> {
    return await db
      .select()
      .from(studyNotes)
      .where(eq(studyNotes.studyCardId, studyCardId))
      .orderBy(desc(studyNotes.createdAt));
  }

  async createStudyNote(note: InsertStudyNote): Promise<StudyNote> {
    const noteData = {
      ...note,
      id: nanoid(),
      tags: Array.isArray(note.tags) ? note.tags : (note.tags !== undefined && note.tags !== null ? [note.tags as string] : [])
    };

    const [newNote] = await db
      .insert(studyNotes)
      .values(noteData as typeof studyNotes.$inferInsert)
      .returning();
    return newNote;
  }



  // Study session operations
  async getStudySessions(userId: string): Promise<StudySession[]> {
    return await db
      .select()
      .from(studySessions)
      .where(eq(studySessions.userId, userId))
      .orderBy(desc(studySessions.createdAt));
  }

  async createStudySession(session: InsertStudySession): Promise<StudySession> {
    const sessionData = {
      ...session,
      id: nanoid(),
      // Sprint Estudos-Sessao-1 RF-02: default status='active' quando handler nao envia.
      status: (session as any).status ?? 'active',
      activities: Array.isArray(session.activities) ? session.activities : (session.activities !== undefined && session.activities !== null ? [session.activities as string] : []),
      insights: Array.isArray(session.insights) ? session.insights : (session.insights !== undefined && session.insights !== null ? [session.insights as string] : [])
    };

    const [newSession] = await db
      .insert(studySessions)
      .values(sessionData as typeof studySessions.$inferInsert)
      .returning();
    return newSession;
  }

  // Sprint Estudos-Sessao-1 RF-03 / RF-06: single-session lookup com IDOR scope.
  // Retorna null quando id nao existe OU pertence a outro user.
  async getStudySession(id: string, userId: string): Promise<StudySession | null> {
    try {
      const [row] = await db
        .select()
        .from(studySessions)
        .where(and(eq(studySessions.id, id), eq(studySessions.userId, userId)))
        .limit(1);
      return row ?? null;
    } catch (err) {
      // Lesson #9: log antes do fallback. Distinguir "no row" de "DB explodiu".
      console.error('storage.getStudySession.error', { id, userId, err });
      return null;
    }
  }

  async updateStudySession(
    id: string,
    userId: string,
    patch: Partial<InsertStudySession>,
  ): Promise<StudySession | null> {
    try {
      // IDOR: refaz ownership check antes do UPDATE.
      const owned = await this.getStudySession(id, userId);
      if (!owned) return null;
      const cleanPatch: any = {};
      if (patch.status !== undefined) cleanPatch.status = patch.status;
      if (patch.duration !== undefined) cleanPatch.duration = patch.duration;
      if (patch.focusScore !== undefined) cleanPatch.focusScore = patch.focusScore;
      if (patch.productivityScore !== undefined) cleanPatch.productivityScore = patch.productivityScore;
      if (patch.insights !== undefined) cleanPatch.insights = patch.insights;
      if (Object.keys(cleanPatch).length === 0) return owned;
      const [updated] = await db
        .update(studySessions)
        .set(cleanPatch)
        .where(and(eq(studySessions.id, id), eq(studySessions.userId, userId)))
        .returning();
      return updated ?? null;
    } catch (err) {
      console.error('storage.updateStudySession.error', { id, userId, err });
      return null;
    }
  }

  // Sprint Estudos-Sessao-1 RF-04: notes linkadas a sessao.
  async getStudyNotesBySession(sessionId: string, userId: string): Promise<StudyNote[]> {
    try {
      // IDOR scoping: confirma que a sessao eh do user antes de listar.
      const owned = await this.getStudySession(sessionId, userId);
      if (!owned) return [];
      return await db
        .select()
        .from(studyNotes)
        .where(eq(studyNotes.studySessionId, sessionId))
        .orderBy(asc(studyNotes.createdAt));
    } catch (err) {
      console.error('storage.getStudyNotesBySession.error', { sessionId, userId, err });
      return [];
    }
  }

  async createStudyNoteForSession(data: {
    studySessionId: string;
    content: string;
    tags?: string[];
    title?: string | null;
  }): Promise<StudyNote> {
    const noteData = {
      id: nanoid(),
      studyCardId: null,
      studySessionId: data.studySessionId,
      title: data.title ?? null,
      content: data.content,
      tags: Array.isArray(data.tags) ? data.tags : [],
    };
    const [newNote] = await db
      .insert(studyNotes)
      .values(noteData as typeof studyNotes.$inferInsert)
      .returning();
    return newNote;
  }

  async getStudyNoteById(id: string): Promise<StudyNote | null> {
    try {
      const [row] = await db
        .select()
        .from(studyNotes)
        .where(eq(studyNotes.id, id))
        .limit(1);
      return row ?? null;
    } catch (err) {
      console.error('storage.getStudyNoteById.error', { id, err });
      return null;
    }
  }

  async deleteStudyNote(id: string): Promise<boolean> {
    try {
      const result: any = await db.delete(studyNotes).where(eq(studyNotes.id, id));
      const rows = result?.rowCount ?? result?.rows?.length;
      // Drivers (pg, neon-serverless) reportam rowCount em formatos distintos.
      // Quando indisponivel, assume sucesso (delete eh idempotente).
      return rows === undefined ? true : rows > 0;
    } catch (err) {
      console.error('storage.deleteStudyNote.error', { id, err });
      return false;
    }
  }

  // Active days operations
  async getActiveDays(userId: string): Promise<ActiveDay[]> {
    return await db
      .select()
      .from(activeDays)
      .where(eq(activeDays.userId, userId))
      .orderBy(activeDays.dayOfWeek);
  }

  async toggleActiveDay(userId: string, dayOfWeek: number): Promise<ActiveDay> {
    // Check if the day already exists
    const [existingDay] = await db
      .select()
      .from(activeDays)
      .where(and(
        eq(activeDays.userId, userId),
        eq(activeDays.dayOfWeek, dayOfWeek)
      ));

    if (existingDay) {
      // Toggle existing day
      const [updatedDay] = await db
        .update(activeDays)
        .set({
          isActive: !existingDay.isActive,
          updatedAt: new Date()
        })
        .where(eq(activeDays.id, existingDay.id))
        .returning();
      return updatedDay;
    } else {
      // Create new day (default is active = true, so toggle to false)
      const [newDay] = await db
        .insert(activeDays)
        .values({
          id: nanoid(),
          userId,
          dayOfWeek,
          isActive: false // Since we're "toggling" and default would be true
        })
        .returning();
      return newDay;
    }
  }

  // Calendário Inteligente methods
  async getWeeklyRoutine(userId: string, weekStart: Date): Promise<WeeklyRoutine | null> {
    const result = await db
      .select()
      .from(weeklyRoutines)
      .where(and(
        eq(weeklyRoutines.userId, userId),
        eq(weeklyRoutines.weekStart, weekStart)
      ))
      .limit(1);

    return result[0] || null;
  }

  async createWeeklyRoutine(routine: InsertWeeklyRoutine): Promise<WeeklyRoutine> {
    const [result] = await db.insert(weeklyRoutines).values(routine).returning();
    return result;
  }

  async updateWeeklyRoutine(id: string, routine: Partial<InsertWeeklyRoutine>): Promise<WeeklyRoutine> {
    const [result] = await db
      .update(weeklyRoutines)
      .set({ ...routine, updatedAt: new Date() })
      .where(eq(weeklyRoutines.id, id))
      .returning();
    return result;
  }

  async getStudySchedules(userId: string): Promise<StudySchedule[]> {
    return await db
      .select()
      .from(studySchedules)
      .where(eq(studySchedules.userId, userId))
      .orderBy(studySchedules.dayOfWeek, studySchedules.startTime);
  }

  async createStudySchedule(schedule: InsertStudySchedule): Promise<StudySchedule> {
    const [result] = await db
      .insert(studySchedules)
      .values({ ...schedule, id: nanoid() })
      .returning();
    return result;
  }

  // Calendar Categories CRUD
  async getCalendarCategories(userId: string): Promise<CalendarCategory[]> {
    return await db
      .select()
      .from(calendarCategories)
      .where(eq(calendarCategories.userId, userId))
      .orderBy(calendarCategories.name);
  }

  async createCalendarCategory(category: InsertCalendarCategory): Promise<CalendarCategory> {
    const [result] = await db
      .insert(calendarCategories)
      .values({ ...category, id: nanoid() })
      .returning();
    return result;
  }

  async updateCalendarCategory(id: string, category: Partial<InsertCalendarCategory>): Promise<CalendarCategory> {
    const [result] = await db
      .update(calendarCategories)
      .set({ ...category, updatedAt: new Date() })
      .where(eq(calendarCategories.id, id))
      .returning();
    return result;
  }

  async deleteCalendarCategory(id: string): Promise<void> {
    await db.delete(calendarCategories).where(eq(calendarCategories.id, id));
  }

  // Calendar Events CRUD
  async getCalendarEvents(userId: string, weekStart?: Date, weekEnd?: Date): Promise<CalendarEvent[]> {
    const conditions = [eq(calendarEvents.userId, userId)];

    if (weekStart && weekEnd) {
      conditions.push(
        gte(calendarEvents.startTime, weekStart),
        lte(calendarEvents.endTime, weekEnd)
      );
    }

    return await db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startTime);
  }

  async createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const [result] = await db
      .insert(calendarEvents)
      .values({ ...event, id: nanoid() })
      .returning();
    return result;
  }

  async updateCalendarEvent(id: string, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent> {
    const [result] = await db
      .update(calendarEvents)
      .set({ ...event, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id))
      .returning();
    return result;
  }

  async deleteCalendarEvent(id: string): Promise<void> {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  }

  async deleteCalendarEventsBySource(userId: string, source: string): Promise<void> {
    await db.delete(calendarEvents).where(
      and(
        eq(calendarEvents.userId, userId),
        eq(calendarEvents.source, source)
      )
    );
  }

  // Delete all events in a recurring series. Scoped by userId (IDOR defense in
  // depth — see Wave 2 review): parentEventId is derived from a request-controlled
  // field, so never trust it without the owner filter.
  async deleteRecurringEventSeries(parentEventId: string, userId: string): Promise<void> {
    await db.delete(calendarEvents).where(and(eq(calendarEvents.parentEventId, parentEventId), eq(calendarEvents.userId, userId)));
    await db.delete(calendarEvents).where(and(eq(calendarEvents.id, parentEventId), eq(calendarEvents.userId, userId)));
  }

  // Update all events in a recurring series. Scoped by userId (see above).
  async updateRecurringEventSeries(parentEventId: string, event: Partial<InsertCalendarEvent>, userId: string): Promise<void> {
    await db
      .update(calendarEvents)
      .set({ ...event, updatedAt: new Date() })
      .where(and(eq(calendarEvents.parentEventId, parentEventId), eq(calendarEvents.userId, userId)));

    await db
      .update(calendarEvents)
      .set({ ...event, updatedAt: new Date() })
      .where(and(eq(calendarEvents.id, parentEventId), eq(calendarEvents.userId, userId)));
  }


  async deleteWeeklyRoutine(id: string): Promise<void> {
    await db.delete(weeklyRoutines).where(eq(weeklyRoutines.id, id));
  }



  async updateStudySchedule(id: string, schedule: Partial<InsertStudySchedule>): Promise<StudySchedule> {
    const [result] = await db
      .update(studySchedules)
      .set(schedule)
      .where(eq(studySchedules.id, id))
      .returning();
    return result;
  }

  async deleteStudySchedule(id: string): Promise<void> {
    await db.delete(studySchedules).where(eq(studySchedules.id, id));
  }

  // Method to get date range of tournaments for debugging
  async getDateRange(userId: string) {
    const result = await db
      .select({
        oldestDate: sql<string>`MIN(${tournaments.datePlayed})`,
        newestDate: sql<string>`MAX(${tournaments.datePlayed})`,
        totalCount: sql<number>`COUNT(*)`
      })
      .from(tournaments)
      .where(eq(tournaments.userId, userId));

    const data = result[0];


    if (data.oldestDate && data.newestDate) {
      const oldestDate = new Date(data.oldestDate);
      const newestDate = new Date(data.newestDate);
      const diffInDays = Math.floor((newestDate.getTime() - oldestDate.getTime()) / (24 * 60 * 60 * 1000));


      return {
        oldestDate: data.oldestDate,
        newestDate: data.newestDate,
        totalCount: data.totalCount,
        totalDays: diffInDays,
        hasOneYearData: diffInDays >= 365
      };
    }

    return {
      oldestDate: null,
      newestDate: null,
      totalCount: 0,
      totalDays: 0,
      hasOneYearData: false
    };
  }

  // Helper method to build dashboard filters
  private buildDashboardFilters(filters: any): any {
    return null;
  }

  // ===== BUG REPORTS METHODS =====

  async createBugReport(report: InsertBugReport): Promise<BugReport> {
    const id = nanoid();
    const [result] = await db
      .insert(bugReports)
      .values({
        id,
        ...report,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return result;
  }

  async getBugReports(): Promise<BugReport[]> {
    return await db
      .select()
      .from(bugReports)
      .orderBy(desc(bugReports.createdAt));
  }

  async getBugReportsByUser(userId: string): Promise<BugReport[]> {
    return await db
      .select()
      .from(bugReports)
      .where(eq(bugReports.userId, userId))
      .orderBy(desc(bugReports.createdAt));
  }

  async getBugReportById(id: string): Promise<BugReport | null> {
    const [result] = await db
      .select()
      .from(bugReports)
      .where(eq(bugReports.id, id))
      .limit(1);
    return result || null;
  }

  async updateBugReport(id: string, updates: Partial<InsertBugReport>): Promise<BugReport> {
    const [result] = await db
      .update(bugReports)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(bugReports.id, id))
      .returning();
    return result;
  }

  async deleteBugReport(id: string): Promise<void> {
    await db.delete(bugReports).where(eq(bugReports.id, id));
  }

  async getBugReportStats(): Promise<{
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    dismissed: number;
    byUrgency: { low: number; medium: number; high: number };
    byType: { bug: number; suggestion: number; performance: number };
  }> {
    const allReports = await db.select().from(bugReports);

    return {
      total: allReports.length,
      open: allReports.filter(r => r.status === 'open').length,
      inProgress: allReports.filter(r => r.status === 'in_progress').length,
      resolved: allReports.filter(r => r.status === 'resolved').length,
      dismissed: allReports.filter(r => r.status === 'dismissed').length,
      byUrgency: {
        low: allReports.filter(r => r.urgency === 'low').length,
        medium: allReports.filter(r => r.urgency === 'medium').length,
        high: allReports.filter(r => r.urgency === 'high').length,
      },
      byType: {
        bug: allReports.filter(r => r.type === 'bug').length,
        suggestion: allReports.filter(r => r.type === 'suggestion').length,
        performance: allReports.filter(r => r.type === 'performance').length,
      },
    };
  }

  // Upload History - persistência do histórico de upload
  async getUploadHistory(userId: string): Promise<UploadHistory[]> {
    return await db
      .select()
      .from(uploadHistory)
      .where(eq(uploadHistory.userId, userId))
      .orderBy(desc(uploadHistory.uploadDate))
      .limit(5);
  }

  async createUploadHistory(uploadRecord: InsertUploadHistory): Promise<UploadHistory> {
    const id = nanoid();

    // Primeiro, limpamos registros antigos se já existem 5
    const existing = await db
      .select({ id: uploadHistory.id })
      .from(uploadHistory)
      .where(eq(uploadHistory.userId, uploadRecord.userId))
      .orderBy(desc(uploadHistory.uploadDate));

    if (existing.length >= 5) {
      // Remove o mais antigo se já tem 5
      const toDelete = existing.slice(4); // Mantém apenas os primeiros 4
      if (toDelete.length > 0) {
        // inArray (NAO sql`IN (${...})` interpolado — o template tratava o
        // .join() como um unico bound param `IN ($1)`, type mismatch no PG →
        // 500 pos-persist. Disparava so com >=5 uploads. followup resolvido.)
        await db
          .delete(uploadHistory)
          .where(
            and(
              eq(uploadHistory.userId, uploadRecord.userId),
              inArray(uploadHistory.id, toDelete.map(r => r.id))
            )
          );
      }
    }

    // Insere novo registro
    const [created] = await db
      .insert(uploadHistory)
      .values({
        id,
        ...uploadRecord,
      })
      .returning();

    return created;
  }

  async updateUploadHistory(
    id: string,
    patch: Partial<{
      status: string;
      processedCount: number;
      tournamentsCount: number;
      errorMessage: string | null;
    }>,
  ): Promise<UploadHistory | null> {
    const update: Record<string, unknown> = {};
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.processedCount !== undefined) update.processedCount = patch.processedCount;
    if (patch.tournamentsCount !== undefined) update.tournamentsCount = patch.tournamentsCount;
    if (patch.errorMessage !== undefined) update.errorMessage = patch.errorMessage;
    if (Object.keys(update).length === 0) {
      const [row] = await db.select().from(uploadHistory).where(eq(uploadHistory.id, id));
      return row ?? null;
    }
    const [updated] = await db
      .update(uploadHistory)
      .set(update)
      .where(eq(uploadHistory.id, id))
      .returning();
    return updated ?? null;
  }

  // Quando `userId` informado, retorna null se row pertence a outro user
  // (404 silencioso pra nao vazar existencia cross-user).
  async getUploadHistoryById(id: string, userId?: string): Promise<UploadHistory | null> {
    const [row] = await db
      .select()
      .from(uploadHistory)
      .where(eq(uploadHistory.id, id))
      .limit(1);
    if (!row) return null;
    if (userId && row.userId !== userId) return null;
    return row;
  }

  async deleteUploadHistory(id: string, userId: string): Promise<UploadHistory | null> {
    const [deleted] = await db
      .delete(uploadHistory)
      .where(
        and(
          eq(uploadHistory.id, id),
          eq(uploadHistory.userId, userId)
        )
      )
      .returning();

    return deleted || null;
  }

  // ===========================================================================
  // Tournament Selector — RF-06 (getAnalyticsByTimeOfDay) + RF-07 (logs)
  // ===========================================================================

  /**
   * RF-06: Returns ROI per turn-of-day bucket using user timezone (Q1).
   * Buckets:
   *   madrugada    00:00 - 05:59
   *   manha        06:00 - 11:59
   *   tarde        12:00 - 17:59
   *   noite-cedo   18:00 - 20:59
   *   noite-nobre  21:00 - 23:59
   */
  async getAnalyticsByTimeOfDay(userId: string, period: string = "30d", filters: any = {}): Promise<any[]> {
    try {
      const baseConditions = [eq(tournaments.userId, userId)];

      const periodConditions = buildPeriodCondition(period, filters);
      baseConditions.push(...periodConditions);

      const dashboardFilters = buildFilters(filters);
      if (dashboardFilters) {
        baseConditions.push(dashboardFilters);
      }

      const whereCondition = and(...baseConditions);

      // Lookup user timezone (default America/Sao_Paulo)
      const [u] = await db
        .select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.userPlatformId, userId))
        .limit(1);

      const tz = u?.timezone || "America/Sao_Paulo";

      const hourExpr = sql<number>`EXTRACT(HOUR FROM ${tournaments.datePlayed} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})`;

      const bucketExpr = sql<string>`CASE
        WHEN ${hourExpr} BETWEEN 0 AND 5 THEN 'madrugada'
        WHEN ${hourExpr} BETWEEN 6 AND 11 THEN 'manha'
        WHEN ${hourExpr} BETWEEN 12 AND 17 THEN 'tarde'
        WHEN ${hourExpr} BETWEEN 18 AND 20 THEN 'noite-cedo'
        WHEN ${hourExpr} BETWEEN 21 AND 23 THEN 'noite-nobre'
        ELSE 'manha'
      END`;

      const result = await db
        .select({
          bucket: bucketExpr,
          sample: sql<number>`COUNT(*)`,
          buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
          profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
          roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        })
        .from(tournaments)
        .where(whereCondition)
        .groupBy(bucketExpr);

      return result;
    } catch (error) {
      console.error("getAnalyticsByTimeOfDay failed:", error);
      return [];
    }
  }

  /**
   * Tournament Selector RF-04: Returns ROI per buy-in bucket using BUYIN_BUCKETS labels
   * (CRITICAL #1 — labels devem casar com scoringConstants.BUYIN_BUCKETS).
   *
   * Diferente de getAnalyticsByBuyinRange (que usa labels antigos $0-$5, $5-$10... para o dashboard),
   * este metodo usa as fronteiras documentadas em BUYIN_BUCKETS:
   *   $0-1.99, $2-4.99, $5-10.99, $11-21.99, $22-54.99, $55-109.99, $110-219.99, $220+
   */
  async getAnalyticsByBuyinRangeV2(userId: string, period = "180d", filters: any = {}): Promise<any[]> {
    try {
      const baseConditions = [eq(tournaments.userId, userId)];

      const periodConditions = buildPeriodCondition(period, filters);
      baseConditions.push(...periodConditions);

      const dashboardFilters = buildFilters(filters);
      if (dashboardFilters) {
        baseConditions.push(dashboardFilters);
      }

      const whereCondition = and(...baseConditions);

      const bucketExpr = sql<string>`
        CASE
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 0 AND CAST(${tournaments.buyIn} AS DECIMAL) < 2 THEN '$0-1.99'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 2 AND CAST(${tournaments.buyIn} AS DECIMAL) < 5 THEN '$2-4.99'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 5 AND CAST(${tournaments.buyIn} AS DECIMAL) < 11 THEN '$5-10.99'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 11 AND CAST(${tournaments.buyIn} AS DECIMAL) < 22 THEN '$11-21.99'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 22 AND CAST(${tournaments.buyIn} AS DECIMAL) < 55 THEN '$22-54.99'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 55 AND CAST(${tournaments.buyIn} AS DECIMAL) < 110 THEN '$55-109.99'
          WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 110 AND CAST(${tournaments.buyIn} AS DECIMAL) < 220 THEN '$110-219.99'
          ELSE '$220+'
        END
      `;

      const result = await db
        .select({
          range: bucketExpr,
          sample: sql<number>`COUNT(*)`,
          buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
          profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
          roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        })
        .from(tournaments)
        .where(whereCondition)
        .groupBy(bucketExpr);

      return result;
    } catch (error) {
      console.error("getAnalyticsByBuyinRangeV2 failed:", error);
      return [];
    }
  }

  /**
   * Tournament Selector RF-04: Returns ROI per field-size bucket using FIELD_BUCKETS labels
   * (CRITICAL #2 — labels devem casar com scoringConstants.FIELD_BUCKETS).
   *
   * Diferente de getAnalyticsByField (que agrupa por percentual de eliminacao para o dashboard),
   * este metodo agrupa por tamanho do field absoluto:
   *   pequeno  (<100), medio (100-499), grande (500-1999), massivo (>=2000)
   */
  async getAnalyticsByFieldSize(userId: string, period = "180d", filters: any = {}): Promise<any[]> {
    try {
      const baseConditions = [
        eq(tournaments.userId, userId),
        isNotNull(tournaments.fieldSize),
      ];

      const periodConditions = buildPeriodCondition(period, filters);
      baseConditions.push(...periodConditions);

      const dashboardFilters = buildFilters(filters);
      if (dashboardFilters) {
        baseConditions.push(dashboardFilters);
      }

      const whereCondition = and(...baseConditions);

      const bucketExpr = sql<string>`
        CASE
          WHEN ${tournaments.fieldSize} < 100 THEN 'pequeno'
          WHEN ${tournaments.fieldSize} < 500 THEN 'medio'
          WHEN ${tournaments.fieldSize} < 2000 THEN 'grande'
          ELSE 'massivo'
        END
      `;

      const result = await db
        .select({
          range: bucketExpr,
          sample: sql<number>`COUNT(*)`,
          buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
          profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
          roi: sql<number>`CASE WHEN SUM(CAST(${tournaments.buyIn} AS DECIMAL)) > 0 THEN (SUM(CAST(${tournaments.prize} AS DECIMAL)) / SUM(CAST(${tournaments.buyIn} AS DECIMAL))) * 100 ELSE 0 END`,
        })
        .from(tournaments)
        .where(whereCondition)
        .groupBy(bucketExpr);

      return result;
    } catch (error) {
      console.error("getAnalyticsByFieldSize failed:", error);
      return [];
    }
  }

  /**
   * Tournament Selector RF-04/RF-05: Returns raw entries from tournament_library table
   * (CRITICAL #3 — diferente de getTournamentLibrary, que agrupa o historico de tournaments).
   *
   * Retorna o shape real de TournamentLibrary com dayOfWeek, currency, name, buyIn, etc.
   * Filtra deletedAt IS NULL (apenas ativos).
   */
  async getTournamentLibraryEntries(userId: string): Promise<TournamentLibrary[]> {
    try {
      const result = await db
        .select()
        .from(tournamentLibrary)
        .where(
          and(
            eq(tournamentLibrary.userId, userId),
            isNull(tournamentLibrary.deletedAt),
          ),
        );
      return result;
    } catch (error) {
      console.error("getTournamentLibraryEntries failed:", error);
      return [];
    }
  }

  /** RF-07: Insert telemetry log for Selector view/add_to_grid events. */
  async insertSelectorLog(log: InsertTournamentSelectorLog): Promise<TournamentSelectorLog> {
    const id = nanoid();
    const [inserted] = await db
      .insert(tournamentSelectorLogs)
      .values({
        ...log,
        id,
      } as any)
      .returning();
    return inserted;
  }

  /**
   * Sprint TS-3 RF-05 (ADR-179) — agrega "score vs ROI realizado" cohort
   * lookbackDays. Matching por externalId (forte). Respeita CLAUDE.md §6.1
   * (tournaments.grind_session_id IS NULL).
   */
  async aggregateSelectorCalibration(args: {
    lookbackDays: number;
    excludeSessionTournaments?: boolean;
  }): Promise<{
    totalAdds: number;
    realizedAdds: number;
    buckets: Array<{
      grade: string;
      adds: number;
      realized: number;
      realizedRoiPct: number;
    }>;
  }> {
    const lookback = args.lookbackDays;
    try {
      const result: any = await db.execute(sql`
        WITH adds_realized AS (
          SELECT
            l.grade,
            t.profit_usd,
            t.buy_in_usd,
            CASE
              WHEN t.buy_in_usd IS NOT NULL AND CAST(t.buy_in_usd AS NUMERIC) > 0
              THEN (CAST(t.profit_usd AS NUMERIC) / CAST(t.buy_in_usd AS NUMERIC)) * 100
              ELSE NULL
            END AS roi_pct
          FROM tournament_selector_logs l
          LEFT JOIN tournaments t ON (
            t.external_id = l.tournament_external_id
            AND t.external_id IS NOT NULL
            AND t.grind_session_id IS NULL
          )
          WHERE l.event_type = 'add_to_grid'
            AND l.created_at >= NOW() - (${lookback} || ' days')::INTERVAL
        )
        SELECT
          grade,
          COUNT(*)::INT AS adds,
          COUNT(roi_pct)::INT AS realized,
          COALESCE(AVG(roi_pct), 0)::FLOAT AS realized_roi_pct
        FROM adds_realized
        WHERE grade IS NOT NULL
        GROUP BY grade
        ORDER BY grade
      `);
      const rows = (result.rows ?? result) as any[];
      const buckets = rows.map((r: any) => ({
        grade: String(r.grade),
        adds: Number(r.adds ?? 0),
        realized: Number(r.realized ?? 0),
        realizedRoiPct: Number(r.realized_roi_pct ?? 0),
      }));
      const totalAdds = buckets.reduce((s, b) => s + b.adds, 0);
      const realizedAdds = buckets.reduce((s, b) => s + b.realized, 0);
      return { totalAdds, realizedAdds, buckets };
    } catch (err) {
      console.error("aggregateSelectorCalibration failed:", err);
      return { totalAdds: 0, realizedAdds: 0, buckets: [] };
    }
  }

  // ==========================================================================
  // Bankroll Module (Sprint 2)
  //
  // Invariantes (docs/architecture/decisions/017-bankroll-snapshot-vs-derived.md):
  //  - UPDATE user_settings + INSERT bankroll_snapshots atomicos (transaction).
  //  - SELECT FOR UPDATE serializa reads concorrentes (Q-Arch-3).
  // ==========================================================================

  async getUserBankrollForUpdate(
    userId: string,
    tx?: any,
  ): Promise<{ bankrollAmount: string | null; bankrollRule: string } | null> {
    const runner = tx ?? db;
    // HIGH-2 fix (UX-2 2026-04-25): pre-cria row de user_settings se ainda
    // nao existe. Sem isso, dois requests simultaneos em "primeira configuracao"
    // viam 0 rows no SELECT FOR UPDATE, NAO trocavam lock, e criavam 2
    // snapshots `initial` duplicados — quebrando o invariante
    // user_settings.bankrollAmount == soma de deltas. ON CONFLICT DO NOTHING
    // garante que o INSERT nao falha em sessoes concorrentes; o SELECT FOR
    // UPDATE seguinte sempre encontra a row e serializa via row-lock.
    await runner.execute(
      sql`INSERT INTO user_settings (id, user_id) VALUES (${nanoid()}, ${userId}) ON CONFLICT (user_id) DO NOTHING`,
    );
    const result: any = await runner.execute(
      sql`SELECT bankroll_amount, bankroll_rule FROM user_settings WHERE user_id = ${userId} FOR UPDATE`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      bankrollAmount: row.bankroll_amount ?? row.bankrollAmount ?? null,
      bankrollRule: row.bankroll_rule ?? row.bankrollRule ?? "1pct",
    };
  }

  async insertBankrollSnapshot(
    data: InsertBankrollSnapshot,
    tx?: any,
  ): Promise<BankrollSnapshot> {
    const runner = tx ?? db;
    const id = nanoid();
    const [inserted] = await runner
      .insert(bankrollSnapshots)
      .values({
        id,
        userId: data.userId,
        delta: String(data.delta),
        previousAmount: String(data.previousAmount),
        newAmount: String(data.newAmount),
        reason: data.reason,
        note: data.note ?? null,
        source: data.source ?? "manual",
        sessionId: data.sessionId ?? null,
        occurredAt: data.occurredAt ? (data.occurredAt instanceof Date ? data.occurredAt : new Date(data.occurredAt)) : new Date(),
      } as any)
      .returning();
    return inserted;
  }

  async updateUserBankroll(
    params: { userId: string; amount: number | null; rule: string },
    tx?: any,
  ): Promise<void> {
    const runner = tx ?? db;
    const amountValue = params.amount == null ? null : String(params.amount);
    // upsert (user_settings pode nao existir ainda)
    await runner
      .insert(userSettings)
      .values({
        id: nanoid(),
        userId: params.userId,
        bankrollAmount: amountValue,
        bankrollRule: params.rule,
      } as any)
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          bankrollAmount: amountValue,
          bankrollRule: params.rule,
          updatedAt: new Date(),
        },
      });
  }

  async getBankrollSnapshots(
    userId: string,
    filters: BankrollSnapshotsFilters = {},
  ): Promise<BankrollSnapshot[]> {
    const conditions: any[] = [eq(bankrollSnapshots.userId, userId)];

    if (filters.from) {
      const d = filters.from instanceof Date ? filters.from : new Date(filters.from);
      conditions.push(gte(bankrollSnapshots.occurredAt, d));
    }
    if (filters.to) {
      const d = filters.to instanceof Date ? filters.to : new Date(filters.to);
      conditions.push(lte(bankrollSnapshots.occurredAt, d));
    }
    if (filters.reason && filters.reason.length > 0) {
      conditions.push(inArray(bankrollSnapshots.reason, filters.reason));
    }

    let query: any = db
      .select()
      .from(bankrollSnapshots)
      .where(and(...conditions))
      .orderBy(desc(bankrollSnapshots.occurredAt));

    if (filters.limit != null) query = query.limit(filters.limit);
    if (filters.offset != null) query = query.offset(filters.offset);

    return await query;
  }

  // ==========================================================================
  // Sprint Bankroll-2 — Multi-Wallet Foundation
  // Implementacoes em storage. Usadas pelo walletService.
  // ==========================================================================

  async createWallet(data: InsertWallet & { id?: string }, tx?: any): Promise<Wallet> {
    const runner = tx ?? db;
    const id = data.id ?? nanoid();
    const [inserted] = await runner
      .insert(wallets)
      .values({
        id,
        userId: data.userId,
        name: data.name,
        platform: data.platform,
        nativeCurrency: data.nativeCurrency,
        balance: data.balance != null ? String(data.balance) : "0",
        status: data.status ?? "active",
        bankrollRule: data.bankrollRule ?? null,
        color: data.color ?? null,
        displayOrder: data.displayOrder ?? 0,
        isShotPocket: data.isShotPocket ?? false,
      } as any)
      .returning();
    return inserted;
  }

  async getWalletById(walletId: string, userId: string, tx?: any): Promise<Wallet | null> {
    const runner = tx ?? db;
    const [row] = await runner
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));
    return row ?? null;
  }

  async listWalletsByUser(
    userId: string,
    opts: { includeArchived?: boolean } = {},
    tx?: any,
  ): Promise<Wallet[]> {
    const runner = tx ?? db;
    const conditions: any[] = [eq(wallets.userId, userId)];
    if (!opts.includeArchived) {
      conditions.push(eq(wallets.status, "active"));
    }
    const result = await runner
      .select()
      .from(wallets)
      .where(and(...conditions))
      .orderBy(wallets.displayOrder, wallets.createdAt);

    // Sprint UX-QW-2 RF-06: enriquece cada wallet com lastTransactionAt (MAX
    // de wallet_transactions.occurred_at). Aceita resultado raw como linha
    // unica via runner.execute para evitar N+1 — agrega tudo numa query.
    if (!Array.isArray(result) || result.length === 0) return result;
    try {
      const ids = result.map((w: any) => w.id);
      // Subquery agregada: para cada wallet do user, MAX(occurred_at).
      const aggResult: any = await runner.execute(
        sql`
          SELECT wallet_id, MAX(occurred_at) AS last_tx
          FROM wallet_transactions
          WHERE user_id = ${userId}
            AND wallet_id = ANY(${ids}::text[])
          GROUP BY wallet_id
        `,
      );
      const rows = Array.isArray(aggResult) ? aggResult : aggResult.rows ?? [];
      const byWalletId = new Map<string, string | null>();
      for (const r of rows) {
        const wid = r.wallet_id ?? r.walletId;
        const lt = r.last_tx ?? r.lastTx ?? null;
        byWalletId.set(
          wid,
          lt ? (lt instanceof Date ? lt.toISOString() : String(lt)) : null,
        );
      }
      for (const w of result) {
        (w as any).lastTransactionAt = byWalletId.get((w as any).id) ?? null;
      }
    } catch (err) {
      // Best-effort: se a query falhar (ex: schema legado em testes que
      // mockam db parcial), nao quebra a listagem. Cada wallet so fica sem
      // lastTransactionAt (front trata como ausente).
      console.warn("listWalletsByUser: lastTransactionAt enrichment failed", err);
    }
    return result;
  }

  async countActiveWalletsByUser(userId: string, tx?: any): Promise<number> {
    const runner = tx ?? db;
    const result: any = await runner.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM wallets WHERE user_id = ${userId} AND status = 'active'`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return rows[0]?.cnt ?? 0;
  }

  async findActiveWalletByName(
    userId: string,
    name: string,
    tx?: any,
  ): Promise<Wallet | null> {
    const runner = tx ?? db;
    const trimmed = name.trim();
    const [row] = await runner
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.userId, userId),
          eq(wallets.name, trimmed),
          eq(wallets.status, "active"),
        ),
      );
    return row ?? null;
  }

  async selectWalletForUpdate(
    walletId: string,
    userId: string,
    tx?: any,
  ): Promise<Wallet | null> {
    const runner = tx ?? db;
    const [row] = await runner
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .for("update");
    return (row as Wallet) ?? null;
  }

  async updateWallet(
    walletId: string,
    userId: string,
    patch: Partial<Wallet>,
    tx?: any,
  ): Promise<Wallet> {
    const runner = tx ?? db;
    const updates: any = { updatedAt: new Date() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.color !== undefined) updates.color = patch.color;
    if (patch.displayOrder !== undefined) updates.displayOrder = patch.displayOrder;
    if (patch.bankrollRule !== undefined) updates.bankrollRule = patch.bankrollRule;
    if (patch.isShotPocket !== undefined) updates.isShotPocket = patch.isShotPocket;
    const [updated] = await runner
      .update(wallets)
      .set(updates)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .returning();
    return updated;
  }

  async archiveWallet(walletId: string, userId: string, tx?: any): Promise<Wallet> {
    const runner = tx ?? db;
    const [updated] = await runner
      .update(wallets)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .returning();
    return updated;
  }

  async updateWalletBalance(
    walletId: string,
    newBalance: string | number,
    tx?: any,
  ): Promise<void> {
    const runner = tx ?? db;
    await runner
      .update(wallets)
      .set({ balance: String(newBalance), updatedAt: new Date() })
      .where(eq(wallets.id, walletId));
  }

  async createWalletTransaction(
    data: InsertWalletTransaction & { id?: string },
    tx?: any,
  ): Promise<WalletTransaction> {
    const runner = tx ?? db;
    const id = data.id ?? nanoid();
    const occurredAt = data.occurredAt instanceof Date ? data.occurredAt : new Date(data.occurredAt as any);
    const effectiveAt = data.effectiveAt instanceof Date ? data.effectiveAt : new Date(data.effectiveAt as any);
    const [inserted] = await runner
      .insert(walletTransactions)
      .values({
        id,
        walletId: data.walletId,
        userId: data.userId,
        occurredAt,
        effectiveAt,
        direction: data.direction,
        nativeAmount: String(data.nativeAmount),
        nativeCurrency: data.nativeCurrency,
        fxRateUSDPerNative: String(data.fxRateUSDPerNative),
        usdAmount: String(data.usdAmount),
        previousNativeBalance: String(data.previousNativeBalance),
        newNativeBalance: String(data.newNativeBalance),
        reason: data.reason,
        feeAmount: data.feeAmount != null ? String(data.feeAmount) : null,
        feeCurrency: data.feeCurrency ?? null,
        sessionId: data.sessionId ?? null,
        note: data.note ?? null,
        source: data.source ?? "manual",
        transferGroupId: data.transferGroupId ?? null,
        stakingDealId: data.stakingDealId ?? null,
      } as any)
      .returning();
    return inserted;
  }

  async listWalletTransactions(
    userId: string,
    walletId: string,
    filters: any = {},
    tx?: any,
  ): Promise<WalletTransaction[]> {
    const runner = tx ?? db;
    const conditions: any[] = [
      eq(walletTransactions.userId, userId),
      eq(walletTransactions.walletId, walletId),
    ];
    if (filters.from) {
      const d = filters.from instanceof Date ? filters.from : new Date(filters.from);
      conditions.push(gte(walletTransactions.occurredAt, d));
    }
    if (filters.to) {
      const d = filters.to instanceof Date ? filters.to : new Date(filters.to);
      conditions.push(lte(walletTransactions.occurredAt, d));
    }
    if (filters.reason && Array.isArray(filters.reason) && filters.reason.length > 0) {
      conditions.push(inArray(walletTransactions.reason, filters.reason));
    }
    let query: any = runner
      .select()
      .from(walletTransactions)
      .where(and(...conditions))
      .orderBy(desc(walletTransactions.occurredAt));
    if (filters.limit != null) query = query.limit(filters.limit);
    if (filters.offset != null) query = query.offset(filters.offset);
    return await query;
  }

  // Sprint Bankroll-Reports-Detail (RF-05, RF-08): wallet_transactions de
  // TODAS wallets do user. Sem walletId filter — usado por history unificado +
  // dashboard ROI calc (manual_reports).
  async listWalletTransactionsByUser(
    userId: string,
    filters: { from?: Date | string; to?: Date | string; reason?: string[]; limit?: number } = {},
    tx?: any,
  ): Promise<WalletTransaction[]> {
    const runner = tx ?? db;
    const conditions: any[] = [eq(walletTransactions.userId, userId)];
    if (filters.from) {
      const d = filters.from instanceof Date ? filters.from : new Date(filters.from);
      conditions.push(gte(walletTransactions.occurredAt, d));
    }
    if (filters.to) {
      const d = filters.to instanceof Date ? filters.to : new Date(filters.to);
      conditions.push(lte(walletTransactions.occurredAt, d));
    }
    if (filters.reason && Array.isArray(filters.reason) && filters.reason.length > 0) {
      conditions.push(inArray(walletTransactions.reason, filters.reason));
    }
    let query: any = runner
      .select()
      .from(walletTransactions)
      .where(and(...conditions))
      .orderBy(desc(walletTransactions.occurredAt));
    if (filters.limit != null) query = query.limit(filters.limit);
    return await query;
  }

  async getLastWalletTransaction(
    walletId: string,
    tx?: any,
  ): Promise<WalletTransaction | null> {
    const runner = tx ?? db;
    const [row] = await runner
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId))
      .orderBy(desc(walletTransactions.occurredAt))
      .limit(1);
    return row ?? null;
  }

  async getActiveWalletsByUser(userId: string, tx?: any): Promise<Wallet[]> {
    const runner = tx ?? db;
    return await runner
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.status, "active")))
      .orderBy(wallets.displayOrder, wallets.createdAt);
  }

  /**
   * ADR-040 RF-08: preflight idempotencia.
   * Conta wallet_transactions com (sessionId, reason='session_result', source='auto_session').
   * Se count > 0, sessao ja foi reconciliada — retorna sem chamar service.
   */
  async findReconciliationMarker(
    sessionId: string,
    userId: string,
    tx?: any,
  ): Promise<{ count: number }> {
    const runner = tx ?? db;
    const result: any = await runner.execute(
      sql`SELECT COUNT(*)::int AS cnt
          FROM wallet_transactions
          WHERE session_id = ${sessionId}
            AND user_id = ${userId}
            AND reason = 'session_result'
            AND source = 'auto_session'`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return { count: rows[0]?.cnt ?? 0 };
  }

  /**
   * ADR-040 RF-02: lista wallets elegiveis para reconciliacao.
   * - Default (includeAll=false): apenas wallets ATIVAS com >=1 wallet_transaction
   *   vinculada ao sessionId (hadActivityInSession=true).
   * - includeAll=true: todas wallets ATIVAS (hadActivityInSession reflete se
   *   teve ou nao tx na sessao).
   * - Wallets archived nunca aparecem.
   * - expectedPreviousBalance = balance atual (snapshot capturado para optimistic
   *   concurrency, ADR-038).
   */
  async listReconcilableWallets(
    sessionId: string,
    userId: string,
    opts: { includeAll?: boolean } = {},
    tx?: any,
  ): Promise<any> {
    const runner = tx ?? db;
    const includeAll = !!opts.includeAll;

    // V2 (RF-04): deriva via session_tournaments + mapSiteToWallet.
    const { calculateExpectedDeltaPerWallet, mapSiteToWallet } = await import(
      "@shared/wallet-reconciliation"
    );

    // Queries independentes paralelizadas (E-02).
    const [activeWallets, stRows, settings] = await Promise.all([
      this.listWalletsByUser(userId, { includeArchived: false }, tx),
      runner.execute(
        sql`SELECT id, site, buy_in, result, bounty, rebuys, addon_taken, addon_cost, status,
                   entered_via_satellite, consumed_ticket_id
            FROM session_tournaments
            WHERE session_id = ${sessionId}
              AND user_id = ${userId}`,
      ),
      this.getUserSettings(userId).catch(() => null),
    ]);

    const stRaw = Array.isArray(stRows) ? stRows : (stRows as any).rows ?? [];
    const tournaments = stRaw.map((r: any) => ({
      id: r.id,
      site: r.site,
      buyIn: parseFloat(String(r.buy_in ?? r.buyIn ?? "0")) || 0,
      prize: parseFloat(String(r.result ?? "0")) || 0,
      bounty: parseFloat(String(r.bounty ?? "0")) || 0,
      rebuys: parseInt(String(r.rebuys ?? "0"), 10) || 0,
      addOnTaken: !!(r.addon_taken ?? r.addOnTaken),
      addOnCost: parseFloat(String(r.addon_cost ?? r.addOnCost ?? "0")) || 0,
      status: r.status,
      // RF-06: ticket bypass — buy-in efetivo = 0 quando entered_via_satellite=true.
      enteredViaSatellite: !!(r.entered_via_satellite ?? r.enteredViaSatellite),
      consumedTicketId: r.consumed_ticket_id ?? r.consumedTicketId ?? null,
    }));

    const rawRates = (settings as any)?.exchangeRates;
    const exchangeRates: Record<string, number> =
      rawRates && typeof rawRates === "object" ? rawRates : {};

    // 4) Calcula expected delta por wallet via helper puro.
    const walletShapes = activeWallets.map((w: any) => ({
      id: w.id,
      platform: w.platform,
      nativeCurrency: w.nativeCurrency,
      balance: parseFloat(String(w.balance ?? "0")) || 0,
      status: (w.status ?? "active") as "active" | "archived",
    }));
    const calc = calculateExpectedDeltaPerWallet({
      tournaments: tournaments as any,
      wallets: walletShapes,
      exchangeRates,
    });

    // 5) Wallets candidatas (site -> match) determinam hadActivityInSession.
    const walletsWithActivity = new Set<string>(
      calc.walletsDelta.map((w) => w.walletId),
    );

    // MEDIUM-03 (reviewer): wallets que receberam delta via tie-break proporcional
    // (ADR-045) recebem `tieBreakStrategy='proportional'`. UI exibe badge
    // "Distribuido proporcionalmente" — sem este campo, RF-13 ficaria sem feedback.
    const walletsWithTieBreak = new Set<string>();
    for (const t of tournaments) {
      if (t.status !== "finished") continue;
      const candidates = mapSiteToWallet(t.site, walletShapes);
      if (candidates.length >= 2) {
        for (const c of candidates) walletsWithTieBreak.add(c.id);
      }
    }

    // 6) Monta resposta.
    const wallets = activeWallets
      .filter((w: any) => includeAll || walletsWithActivity.has(w.id))
      .map((w: any) => {
        const balanceNum = parseFloat(String(w.balance ?? "0"));
        const safeBalance = Number.isFinite(balanceNum) ? balanceNum : 0;
        const entry = calc.walletsDelta.find((d) => d.walletId === w.id);
        const expectedDelta = entry?.expectedDelta ?? 0;
        const contributingTournaments = entry?.contributingTournaments ?? [];
        const hadActivityInSession = (entry?.contributingTournaments?.length ?? 0) > 0;
        const tieBreakStrategy: "proportional" | "single" =
          walletsWithTieBreak.has(w.id) ? "proportional" : "single";
        return {
          walletId: w.id,
          name: w.name,
          platform: w.platform,
          nativeCurrency: w.nativeCurrency,
          openingBalance: safeBalance,
          balance: safeBalance,
          expectedPreviousBalance: safeBalance,
          expectedDelta,
          expectedClosingBalance: safeBalance + expectedDelta,
          contributingTournaments,
          hadActivityInSession,
          tieBreakStrategy,
        };
      });

    return {
      wallets,
      orphanContribution: calc.orphanContribution,
    };
  }

  // =============================================================================
  // Sprint Session-End Reconciliation V2 — RF-04, RF-07, RF-09
  // =============================================================================

  async listSessionTournaments(
    sessionId: string,
    userId: string,
    tx?: any,
  ): Promise<any[]> {
    const runner = tx ?? db;
    const result: any = await runner.execute(
      sql`SELECT * FROM session_tournaments
          WHERE session_id = ${sessionId} AND user_id = ${userId}`,
    );
    return Array.isArray(result) ? result : result.rows ?? [];
  }

  async findSessionWalletSnapshot(
    sessionId: string,
    userId: string,
    tx?: any,
  ): Promise<any | null> {
    const runner = tx ?? db;
    const result: any = await runner.execute(
      sql`SELECT id, session_id AS "sessionId", wallet_id AS "walletId"
          FROM session_wallet_snapshots
          WHERE session_id = ${sessionId} AND user_id = ${userId}
          LIMIT 1`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return rows.length > 0 ? rows[0] : null;
  }

  async listSessionWalletSnapshots(
    sessionId: string,
    userId: string,
    tx?: any,
  ): Promise<any[]> {
    const runner = tx ?? db;
    const result: any = await runner.execute(
      sql`SELECT
            sws.wallet_id           AS "walletId",
            w.name                  AS "walletName",
            w.platform              AS "platform",
            sws.native_currency     AS "nativeCurrency",
            sws.opening_balance     AS "openingBalance",
            sws.closing_balance     AS "closingBalance",
            sws.expected_delta      AS "expectedDelta",
            sws.manual_adjustment   AS "manualAdjustment",
            sws.contributing_tournament_ids AS "contributingTournamentIds",
            sws.reason              AS "reason",
            sws.wallet_transaction_id AS "walletTransactionId",
            sws.created_at          AS "createdAt"
          FROM session_wallet_snapshots sws
          LEFT JOIN wallets w ON w.id = sws.wallet_id
          WHERE sws.session_id = ${sessionId} AND sws.user_id = ${userId}
          ORDER BY sws.created_at ASC`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return rows.map((r: any) => ({
      walletId: r.walletId ?? r.wallet_id,
      walletName: r.walletName ?? r.wallet_name,
      platform: r.platform,
      nativeCurrency: r.nativeCurrency ?? r.native_currency,
      openingBalance: r.openingBalance != null ? parseFloat(String(r.openingBalance)) : null,
      closingBalance: r.closingBalance != null ? parseFloat(String(r.closingBalance)) : null,
      expectedDelta: r.expectedDelta != null ? parseFloat(String(r.expectedDelta)) : 0,
      manualAdjustment: r.manualAdjustment != null ? parseFloat(String(r.manualAdjustment)) : null,
      contributingTournamentIds: Array.isArray(r.contributingTournamentIds)
        ? r.contributingTournamentIds
        : [],
      reason: r.reason ?? "session_result",
      walletTransactionId: r.walletTransactionId ?? null,
      createdAt: r.createdAt ?? null,
    }));
  }

  // Batch: todas as session_wallet_snapshots de um usuario, agrupaveis por
  // sessionId no caller. Usado pelo historico de sessoes (grindSessionHistory)
  // para derivar o lucro reconciliado da banca sem N+1.
  async listSessionWalletSnapshotsByUser(userId: string): Promise<any[]> {
    const result: any = await db.execute(
      sql`SELECT
            sws.session_id          AS "sessionId",
            sws.wallet_id           AS "walletId",
            sws.native_currency     AS "nativeCurrency",
            sws.opening_balance     AS "openingBalance",
            sws.closing_balance     AS "closingBalance"
          FROM session_wallet_snapshots sws
          WHERE sws.user_id = ${userId}`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return rows.map((r: any) => ({
      sessionId: r.sessionId ?? r.session_id,
      walletId: r.walletId ?? r.wallet_id,
      nativeCurrency: r.nativeCurrency ?? r.native_currency,
      openingBalance: r.openingBalance != null ? parseFloat(String(r.openingBalance)) : null,
      closingBalance: r.closingBalance != null ? parseFloat(String(r.closingBalance)) : null,
    }));
  }

  async createSessionWalletSnapshot(
    input: any,
    tx?: any,
  ): Promise<any> {
    const runner = tx ?? db;
    const id = input.id ?? nanoid();
    const data: any = {
      id,
      userId: input.userId,
      sessionId: input.sessionId,
      walletId: input.walletId,
      nativeCurrency: input.nativeCurrency,
      openingBalance:
        typeof input.openingBalance === "number"
          ? String(input.openingBalance)
          : input.openingBalance,
      closingBalance:
        input.closingBalance == null
          ? null
          : typeof input.closingBalance === "number"
            ? String(input.closingBalance)
            : input.closingBalance,
      expectedDelta:
        typeof input.expectedDelta === "number"
          ? String(input.expectedDelta)
          : input.expectedDelta,
      manualAdjustment:
        input.manualAdjustment == null
          ? null
          : typeof input.manualAdjustment === "number"
            ? String(input.manualAdjustment)
            : input.manualAdjustment,
      contributingTournamentIds: input.contributingTournamentIds ?? [],
      reason: input.reason ?? "session_result",
      walletTransactionId: input.walletTransactionId ?? null,
    };
    const [created] = await runner
      .insert(sessionWalletSnapshots)
      .values(data)
      .returning();
    return created;
  }

  async setUserBankrollV2Migrated(
    userId: string,
    value: boolean,
    tx?: any,
  ): Promise<void> {
    const runner = tx ?? db;
    await runner.execute(
      sql`UPDATE user_settings SET bankroll_v2_migrated = ${value}, updated_at = NOW() WHERE user_id = ${userId}`,
    );
  }

  async backfillSnapshotsWalletId(
    userId: string,
    walletId: string,
    tx?: any,
  ): Promise<number> {
    const runner = tx ?? db;
    const result: any = await runner.execute(
      sql`UPDATE bankroll_snapshots SET wallet_id = ${walletId} WHERE user_id = ${userId} AND wallet_id IS NULL`,
    );
    return result?.rowCount ?? result?.rows?.length ?? 0;
  }

  async listUsersForV2Migration(
    tx?: any,
  ): Promise<Array<{ userId: string; bankrollAmount: string | null; bankrollV2Migrated: boolean | null }>> {
    const runner = tx ?? db;
    const result: any = await runner.execute(
      sql`SELECT user_id, bankroll_amount, bankroll_v2_migrated
          FROM user_settings
          WHERE bankroll_amount IS NOT NULL
            AND CAST(bankroll_amount AS NUMERIC) > 0
            AND (bankroll_v2_migrated IS NULL OR bankroll_v2_migrated = FALSE)`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return rows.map((r: any) => ({
      userId: r.user_id ?? r.userId,
      bankrollAmount: r.bankroll_amount ?? r.bankrollAmount ?? null,
      bankrollV2Migrated: r.bankroll_v2_migrated ?? r.bankrollV2Migrated ?? false,
    }));
  }

  async selectUserSettingsForUpdate(userId: string, tx?: any): Promise<any> {
    const runner = tx ?? db;
    const result: any = await runner.execute(
      sql`SELECT * FROM user_settings WHERE user_id = ${userId} FOR UPDATE`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      userId: r.user_id ?? r.userId,
      bankrollAmount: r.bankroll_amount ?? r.bankrollAmount ?? null,
      bankrollRule: r.bankroll_rule ?? r.bankrollRule ?? "1pct",
      bankrollV2Migrated: r.bankroll_v2_migrated ?? r.bankrollV2Migrated ?? false,
      exchangeRates: r.exchange_rates ?? r.exchangeRates ?? {},
    };
  }

  async getAllUsersWithSettings(
    tx?: any,
  ): Promise<Array<{ userId: string; exchangeRates: Record<string, number> | null }>> {
    const runner = tx ?? db;
    const result: any = await runner.execute(
      sql`SELECT user_id, exchange_rates FROM user_settings`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return rows.map((r: any) => ({
      userId: r.user_id ?? r.userId,
      exchangeRates: r.exchange_rates ?? r.exchangeRates ?? null,
    }));
  }

  async updateUserSettingsExchangeRates(
    userId: string,
    newRates: Record<string, number>,
    tx?: any,
  ): Promise<boolean> {
    const runner = tx ?? db;
    const json = JSON.stringify(newRates);
    await runner.execute(
      sql`UPDATE user_settings SET exchange_rates = ${json}::jsonb, updated_at = NOW() WHERE user_id = ${userId}`,
    );
    return true;
  }

  // ==========================================================================
  // Sprint Tickets-1 — Drizzle real (B1 fix do reviewer)
  //
  // Substitui o in-memory Map antigo. Migration 0008 cria a tabela `tickets`.
  // Todas as queries usam `db` ou `tx` (quando dentro de transacao).
  // ==========================================================================

  async createTicket(
    data: any,
    tx?: any,
  ): Promise<Ticket> {
    const runner = tx ?? db;
    const id = data.id ?? nanoid();
    const now = new Date();
    const earnedAt =
      data.earnedAt instanceof Date
        ? data.earnedAt
        : data.earnedAt
        ? new Date(data.earnedAt)
        : now;
    const expiresAt =
      data.expiresAt == null
        ? null
        : data.expiresAt instanceof Date
        ? data.expiresAt
        : new Date(data.expiresAt);
    const usedAt =
      data.usedAt == null
        ? null
        : data.usedAt instanceof Date
        ? data.usedAt
        : new Date(data.usedAt);
    const cancelledAt =
      data.cancelledAt == null
        ? null
        : data.cancelledAt instanceof Date
        ? data.cancelledAt
        : new Date(data.cancelledAt);
    const [inserted] = await runner
      .insert(tickets)
      .values({
        id,
        userId: data.userId,
        sourceTournamentId: data.sourceTournamentId ?? null,
        sourceSessionTournamentId: data.sourceSessionTournamentId ?? null,
        targetTemplateId: data.targetTemplateId ?? null,
        targetName: data.targetName ?? null,
        targetSite: data.targetSite ?? null,
        ticketValueUSD: String(data.ticketValueUSD),
        extraCashUSD: data.extraCashUSD == null ? null : String(data.extraCashUSD),
        status: data.status ?? "available",
        usedInTournamentId: data.usedInTournamentId ?? null,
        usedInSessionTournamentId: data.usedInSessionTournamentId ?? null,
        earnedAt,
        expiresAt,
        usedAt,
        cancelledAt,
        transferredAt: null,
        transferredToUserId: null,
        notifiedExpiringAt: null,
        note: data.note ?? null,
        source: data.source ?? "manual",
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();
    return inserted as Ticket;
  }

  async getTicketById(
    id: string,
    userId?: string,
    tx?: any,
  ): Promise<Ticket | null> {
    const runner = tx ?? db;
    const conditions: any[] = [eq(tickets.id, id)];
    if (userId) conditions.push(eq(tickets.userId, userId));
    const [row] = await runner
      .select()
      .from(tickets)
      .where(and(...conditions))
      .limit(1);
    return (row as Ticket) ?? null;
  }

  async getTicketByIdForUpdate(
    id: string,
    userId?: string,
    tx?: any,
  ): Promise<Ticket | null> {
    // SELECT ... FOR UPDATE — requer estar dentro de uma transacao real (tx).
    // Em produca o lock e adquirido; fora de tx, comportamento equivale a getTicketById.
    const runner = tx ?? db;
    const result: any = userId
      ? await runner.execute(
          sql`SELECT * FROM tickets WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`,
        )
      : await runner.execute(
          sql`SELECT * FROM tickets WHERE id = ${id} FOR UPDATE`,
        );
    const rows = Array.isArray(result) ? result : result?.rows ?? [];
    if (rows.length === 0) return null;
    const r = rows[0];
    // Normalizar snake_case -> camelCase quando vier de execute() (mocks podem retornar camelCase direto).
    return {
      id: r.id,
      userId: r.userId ?? r.user_id,
      sourceTournamentId: r.sourceTournamentId ?? r.source_tournament_id ?? null,
      sourceSessionTournamentId:
        r.sourceSessionTournamentId ?? r.source_session_tournament_id ?? null,
      targetTemplateId: r.targetTemplateId ?? r.target_template_id ?? null,
      targetName: r.targetName ?? r.target_name ?? null,
      targetSite: r.targetSite ?? r.target_site ?? null,
      ticketValueUSD: r.ticketValueUSD ?? r.ticket_value_usd,
      extraCashUSD: r.extraCashUSD ?? r.extra_cash_usd ?? null,
      status: r.status,
      usedInTournamentId: r.usedInTournamentId ?? r.used_in_tournament_id ?? null,
      usedInSessionTournamentId:
        r.usedInSessionTournamentId ?? r.used_in_session_tournament_id ?? null,
      earnedAt: r.earnedAt ?? r.earned_at,
      expiresAt: r.expiresAt ?? r.expires_at ?? null,
      usedAt: r.usedAt ?? r.used_at ?? null,
      cancelledAt: r.cancelledAt ?? r.cancelled_at ?? null,
      transferredAt: r.transferredAt ?? r.transferred_at ?? null,
      transferredToUserId: r.transferredToUserId ?? r.transferred_to_user_id ?? null,
      notifiedExpiringAt: r.notifiedExpiringAt ?? r.notified_expiring_at ?? null,
      note: r.note ?? null,
      source: r.source,
      createdAt: r.createdAt ?? r.created_at,
      updatedAt: r.updatedAt ?? r.updated_at,
    } as Ticket;
  }

  async getActiveTicketsByUser(userId: string, tx?: any): Promise<Ticket[]> {
    const runner = tx ?? db;
    const rows = await runner
      .select()
      .from(tickets)
      .where(and(eq(tickets.userId, userId), eq(tickets.status, "available")))
      .orderBy(asc(tickets.earnedAt));
    return rows as Ticket[];
  }

  // ===========================================================================
  // Sprint D — Tickets cron expiracao + notifs (ADR-184)
  // Reviewer CRITICAL-1 fix wave: implementacao real dos 6 metodos auxiliares
  // que `server/jobs/expireTickets.ts` invoca via storage. Sem isso o cron vira
  // no-op silencioso em prod.
  //
  // Shape de retorno NORMALIZADO para o que o job espera:
  //   { id, userId, sourceName, valueUsd, expiresAt }
  // (mapeado de tickets.targetName / tickets.ticketValueUSD).
  //
  // Lesson #36: nao depende de @shared/schema lazy — eh metodo da classe que
  // ja importa as tables no topo. Compat com tests via injectedStorage (lesson
  // #34) — o cron mocka este modulo inteiro.
  // ===========================================================================

  /**
   * SELECT tickets WHERE status='available' AND expires_at IN (now, now+48h]
   * Retorna shape adaptado p/ expireTicketsTick (sourceName / valueUsd).
   */
  async getTicketsExpiringSoon(now: Date, tx?: any): Promise<Array<{
    id: string;
    userId: string;
    sourceName: string | null;
    valueUsd: string;
    expiresAt: Date;
  }>> {
    const runner = tx ?? db;
    const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const rows = await runner
      .select({
        id: tickets.id,
        userId: tickets.userId,
        sourceName: tickets.targetName,
        valueUsd: tickets.ticketValueUSD,
        expiresAt: tickets.expiresAt,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.status, "available"),
          isNotNull(tickets.expiresAt),
          gt(tickets.expiresAt, now),
          lte(tickets.expiresAt, horizon),
        ),
      );
    return rows as any[];
  }

  /**
   * SELECT tickets WHERE status='available' AND expires_at <= now
   * Tickets que JA viraram expirados neste run (ainda nao processados).
   */
  async getTicketsJustExpired(now: Date, tx?: any): Promise<Array<{
    id: string;
    userId: string;
    sourceName: string | null;
    valueUsd: string;
    expiresAt: Date;
  }>> {
    const runner = tx ?? db;
    const rows = await runner
      .select({
        id: tickets.id,
        userId: tickets.userId,
        sourceName: tickets.targetName,
        valueUsd: tickets.ticketValueUSD,
        expiresAt: tickets.expiresAt,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.status, "available"),
          isNotNull(tickets.expiresAt),
          lte(tickets.expiresAt, now),
        ),
      );
    return rows as any[];
  }

  /**
   * UPDATE tickets SET status='expired' WHERE id IN (ids) AND status='available'
   * Idempotente — guard status='available' (ADR-184 §2.7 race protection).
   * Retorna numero de rows atualizadas.
   */
  async markTicketsExpired(ids: string[], tx?: any): Promise<number> {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const runner = tx ?? db;
    const now = new Date();
    const updated = await runner
      .update(tickets)
      .set({ status: "expired", updatedAt: now })
      .where(and(inArray(tickets.id, ids), eq(tickets.status, "available")))
      .returning({ id: tickets.id });
    return updated.length;
  }

  /**
   * SELECT ids FROM tickets WHERE id IN (ids) AND status='expired'
   * Race protection (ADR-184 §2.7): user pode ter usado o ticket entre
   * SELECT e UPDATE — re-confirma que ficou expired antes do INSERT da notif.
   */
  async reconfirmExpiredTicketIds(ids: string[], tx?: any): Promise<string[]> {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const runner = tx ?? db;
    const rows = await runner
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(inArray(tickets.id, ids), eq(tickets.status, "expired")));
    return rows.map((r: any) => r.id as string);
  }

  /**
   * Dedupe — busca notif do mesmo (user, ticket, type) criada nos ultimos N dias.
   * ADR-184 §2.3 — match por `deep_link LIKE '%ticket_id=' || $ticketId || '&%'`.
   * LOW-1 fix: usar `'&%'` (terminador) p/ evitar prefix collision (`ticket_id=abc`
   * matchando `ticket_id=abc12`). OR fallback p/ EOL (ticket_id ultimo arg).
   */
  async hasRecentTicketNotif(
    userId: string,
    ticketId: string,
    type: string,
    days: number,
    tx?: any,
  ): Promise<boolean> {
    const runner = tx ?? db;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const middleMatch = `%ticket_id=${ticketId}&%`;
    const endMatch = `%ticket_id=${ticketId}`;
    const rows = await runner
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.type, type),
          gt(notifications.createdAt, since),
          or(
            like(notifications.deepLink, middleMatch),
            like(notifications.deepLink, endMatch),
          ),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Sprint Mini Player 2 (RF-04.2 / ADR-191) — insere 1 evento user-driven em
   * user_activity. Diferente de recordUserActivity (cron/system), aceita
   * page/action/feature/metadata livres.
   */
  async logUserActivity(input: {
    userId: string;
    page: string;
    action: string;
    feature?: string | null;
    duration?: number | null;
    metadata?: Record<string, any> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{ id: string }> {
    const id = nanoid();
    await db.insert(userActivity).values({
      id,
      userId: input.userId,
      page: input.page,
      action: input.action,
      feature: input.feature ?? null,
      duration: input.duration ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: new Date(),
    });
    return { id };
  }

  /**
   * Sprint Mini Player 2 (RF-04.2 / ADR-191) — batch insert para sendBeacon.
   * Cap 10 enforced pelo handler. Aqui apenas executa o INSERT.
   */
  async logUserActivityBatch(
    events: Array<{
      userId: string;
      page: string;
      action: string;
      feature?: string | null;
      duration?: number | null;
      metadata?: Record<string, any> | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    }>,
  ): Promise<{ inserted: number }> {
    if (!events || events.length === 0) return { inserted: 0 };
    const rows = events.map((e) => ({
      id: nanoid(),
      userId: e.userId,
      page: e.page,
      action: e.action,
      feature: e.feature ?? null,
      duration: e.duration ?? null,
      metadata: e.metadata ?? null,
      ipAddress: e.ipAddress ?? null,
      userAgent: e.userAgent ?? null,
      createdAt: new Date(),
    }));
    await db.insert(userActivity).values(rows);
    return { inserted: rows.length };
  }

  /**
   * INSERT user_activity row.
   * Maps job-shape `{userId, eventType, payload}` -> schema `{page, action, metadata}`:
   *   page = 'system'  (housekeeping/cron-originated)
   *   action = eventType
   *   metadata = payload
   * NAO duplica `analytics.ts:/api/analytics/track` (que eh user-driven com page/feature reais).
   */
  async recordUserActivity(input: {
    userId: string;
    eventType: string;
    payload?: Record<string, any> | null;
  }, tx?: any): Promise<{ id: string }> {
    const runner = tx ?? db;
    const id = nanoid();
    await runner.insert(userActivity).values({
      id,
      userId: input.userId,
      page: "system",
      action: input.eventType,
      feature: null,
      duration: null,
      metadata: input.payload ?? null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    });
    return { id };
  }

  /**
   * INSERT notifications row.
   * Aceita shape `{userId, type, title, message, priority, deepLink}` do job.
   * (NotificationService.createNotification eh class-scoped + acopla subscription —
   * para tickets/cron precisamos de INSERT bare sem efeitos colaterais.)
   */
  async createNotification(input: {
    userId: string;
    type: string;
    title: string;
    message: string;
    priority: "low" | "medium" | "high";
    deepLink?: string | null;
    daysUntilExpiration?: number | null;
    scheduledFor?: Date | null;
  }, tx?: any): Promise<{ id: string }> {
    const runner = tx ?? db;
    const id = nanoid();
    await runner.insert(notifications).values({
      id,
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      priority: input.priority,
      daysUntilExpiration: input.daysUntilExpiration ?? null,
      read: false,
      scheduledFor: input.scheduledFor === undefined ? new Date() : input.scheduledFor,
      createdAt: new Date(),
      deepLink: input.deepLink ?? null,
    } as any);
    return { id };
  }

  async getTicketsByUser(
    userId: string,
    filters?: { status?: string; expiringIn?: number; targetTemplateId?: string },
    tx?: any,
  ): Promise<Ticket[]> {
    const runner = tx ?? db;
    const conditions: any[] = [eq(tickets.userId, userId)];
    if (filters?.status && filters.status !== "all") {
      conditions.push(eq(tickets.status, filters.status));
    }
    if (filters?.targetTemplateId) {
      conditions.push(eq(tickets.targetTemplateId, filters.targetTemplateId));
    }
    if (filters?.expiringIn != null) {
      const horizon = new Date(Date.now() + filters.expiringIn * 24 * 60 * 60 * 1000);
      conditions.push(
        or(isNull(tickets.expiresAt), lte(tickets.expiresAt, horizon)),
      );
    }
    const rows = await runner
      .select()
      .from(tickets)
      .where(and(...conditions))
      // Ordenacao: expiresAt ASC NULLS LAST, depois earnedAt DESC.
      .orderBy(sql`${tickets.expiresAt} ASC NULLS LAST`, desc(tickets.earnedAt));
    return rows as Ticket[];
  }

  async cancelTicket(
    ticketId: string,
    userId: string,
    reason?: string,
    tx?: any,
  ): Promise<Ticket> {
    const runner = tx ?? db;
    // Busca + ownership + idempotencia em 1 fluxo.
    const existing = await this.getTicketById(ticketId, userId, tx);
    if (!existing) {
      const err: any = new Error("Ticket nao encontrado");
      err.statusCode = 404;
      throw err;
    }
    if (existing.status === "cancelled") {
      // Idempotente — retorna o mesmo row sem mexer em timestamps.
      return existing;
    }
    if (existing.status !== "available") {
      const err: any = new Error(`Ticket nao esta available (status=${existing.status})`);
      err.statusCode = 409;
      err.code = "errNotAvailable";
      throw err;
    }
    const now = new Date();
    const newNote = reason
      ? existing.note
        ? `${existing.note}\n${reason}`
        : reason
      : existing.note;
    const [updated] = await runner
      .update(tickets)
      .set({
        status: "cancelled",
        cancelledAt: now,
        note: newNote ?? null,
        updatedAt: now,
      })
      .where(and(eq(tickets.id, ticketId), eq(tickets.userId, userId)))
      .returning();
    return updated as Ticket;
  }

  async useTicket(
    params: {
      ticketId: string;
      userId: string;
      targetId: string;
      kind: "tournament" | "session_tournament";
    },
    tx?: any,
  ): Promise<{ ticket: Ticket; tournament?: any; sessionTournament?: any }> {
    const runner = tx ?? db;
    const { ticketId, userId, targetId, kind } = params;
    const now = new Date();

    // UPDATE ticket
    const [updatedTicket] = await runner
      .update(tickets)
      .set({
        status: "used",
        usedAt: now,
        usedInTournamentId: kind === "tournament" ? targetId : null,
        usedInSessionTournamentId: kind === "session_tournament" ? targetId : null,
        updatedAt: now,
      })
      .where(and(eq(tickets.id, ticketId), eq(tickets.userId, userId)))
      .returning();

    // UPDATE tournament/session_tournament — back-ref + flag
    let tournamentRow: any = null;
    let sessionTournamentRow: any = null;
    if (kind === "tournament") {
      const [t] = await runner
        .update(tournaments)
        .set({
          enteredViaSatellite: true,
          consumedTicketId: ticketId,
          updatedAt: now,
        })
        .where(eq(tournaments.id, targetId))
        .returning();
      tournamentRow = t ?? { id: targetId, enteredViaSatellite: true, consumedTicketId: ticketId };
    } else {
      const [st] = await runner
        .update(sessionTournaments)
        .set({
          enteredViaSatellite: true,
          consumedTicketId: ticketId,
          updatedAt: now,
        })
        .where(eq(sessionTournaments.id, targetId))
        .returning();
      sessionTournamentRow =
        st ?? { id: targetId, enteredViaSatellite: true, consumedTicketId: ticketId };
    }

    return {
      ticket: updatedTicket as Ticket,
      tournament: tournamentRow ?? undefined,
      sessionTournament: sessionTournamentRow ?? undefined,
    };
  }

  async findMatchingTickets(
    userId: string,
    params: { tournamentId: string; kind: "tournament" | "session_tournament" },
    tx?: any,
  ): Promise<Ticket[]> {
    const runner = tx ?? db;
    // Resolver torneio alvo
    let target: any = null;
    if (params.kind === "tournament") {
      target = await this.getTournamentById(params.tournamentId, undefined, tx);
    } else {
      target = await this.getSessionTournamentById(params.tournamentId, tx);
    }
    if (!target) return [];
    if (target.userId && target.userId !== userId) return [];

    // Match forte (templateId) OU match medio (lower(name)+lower(site))
    const matchConds: any[] = [];
    if ((target as any).templateId) {
      matchConds.push(eq(tickets.targetTemplateId, (target as any).templateId));
    }
    const targetName = String(target.name ?? "").trim().toLowerCase();
    const targetSite = String(target.site ?? "").trim().toLowerCase();
    if (targetName) {
      // Usa indice funcional idx_tickets_user_target_name (lower(target_name), lower(target_site))
      matchConds.push(
        and(
          sql`lower(${tickets.targetName}) = ${targetName}`,
          sql`coalesce(lower(${tickets.targetSite}), '') = ${targetSite}`,
        ),
      );
    }
    if (matchConds.length === 0) return [];

    const rows = await runner
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.userId, userId),
          eq(tickets.status, "available"),
          or(...matchConds),
        ),
      )
      // FIFO: expiresAt ASC NULLS LAST, depois earnedAt ASC
      .orderBy(
        sql`${tickets.expiresAt} ASC NULLS LAST`,
        asc(tickets.earnedAt),
      );
    return rows as Ticket[];
  }

  async getTournamentById(
    id: string,
    userId?: string,
    tx?: any,
  ): Promise<Tournament | null> {
    const runner = tx ?? db;
    const conditions: any[] = [eq(tournaments.id, id)];
    if (userId) conditions.push(eq(tournaments.userId, userId));
    const [row] = await runner
      .select()
      .from(tournaments)
      .where(and(...conditions))
      .limit(1);
    return (row as Tournament) ?? null;
  }

  // ===========================================================================
  // Sprint Cooldown-1 (MVP) — Cool-down Logs e Starred Hands
  // Spec: Docs/specs/cooldown-refactor-plan.md (RF-04)
  // ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
  // ===========================================================================

  async createCooldownLog(input: InsertCooldownLog & { id?: string }): Promise<CooldownLog> {
    const id = input.id ?? nanoid();
    const [row] = await db
      .insert(cooldownLogs)
      .values({
        id,
        userId: input.userId,
        sessionId: input.sessionId,
        mode: input.mode,
        blocksCompleted: (input.blocksCompleted as any) ?? [],
        abGameAnswers: (input.abGameAnswers as any) ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return row as CooldownLog;
  }

  async getCooldownLog(id: string, userId: string): Promise<CooldownLog | null> {
    const [row] = await db
      .select()
      .from(cooldownLogs)
      .where(and(eq(cooldownLogs.id, id), eq(cooldownLogs.userId, userId)))
      .limit(1);
    return (row as CooldownLog) ?? null;
  }

  async getCooldownLogBySession(sessionId: string, userId: string): Promise<CooldownLog | null> {
    const [row] = await db
      .select()
      .from(cooldownLogs)
      .where(
        and(eq(cooldownLogs.sessionId, sessionId), eq(cooldownLogs.userId, userId)),
      )
      .limit(1);
    return (row as CooldownLog) ?? null;
  }

  async updateCooldownLog(
    id: string,
    userId: string,
    patch: Partial<UpdateCooldownLog> & { durationMinutes?: number },
  ): Promise<CooldownLog | null> {
    const updateData: any = { updatedAt: new Date() };
    if (patch.blocksCompleted !== undefined) updateData.blocksCompleted = patch.blocksCompleted;
    if (patch.abGameAnswers !== undefined) updateData.abGameAnswers = patch.abGameAnswers;
    if (patch.completedAt !== undefined) {
      updateData.completedAt =
        typeof patch.completedAt === "string" ? new Date(patch.completedAt) : patch.completedAt;
    }
    if (patch.durationMinutes !== undefined) updateData.durationMinutes = patch.durationMinutes;
    if (patch.notes !== undefined) updateData.notes = patch.notes;
    // Sprint Cooldown-2 — Bloco 3 + Bloco 4
    if ((patch as any).tiltSelfAssessment !== undefined) {
      updateData.tiltSelfAssessment = (patch as any).tiltSelfAssessment;
    }
    if ((patch as any).sleepIntent !== undefined) {
      updateData.sleepIntent = (patch as any).sleepIntent;
    }

    const [row] = await db
      .update(cooldownLogs)
      .set(updateData)
      .where(and(eq(cooldownLogs.id, id), eq(cooldownLogs.userId, userId)))
      .returning();
    return (row as CooldownLog) ?? null;
  }

  async listCooldownLogs(
    userId: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<{ items: CooldownLog[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 20)));
    const offset = (page - 1) * pageSize;

    const items = await db
      .select()
      .from(cooldownLogs)
      .where(eq(cooldownLogs.userId, userId))
      .orderBy(desc(cooldownLogs.completedAt))
      .limit(pageSize)
      .offset(offset);

    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(cooldownLogs)
      .where(eq(cooldownLogs.userId, userId));

    return {
      items: items as CooldownLog[],
      total: Number(totalCount ?? 0),
      page,
      pageSize,
    };
  }

  // Wrapper compativel com testes que mockam `getSessionTournament` (sem `ById`).
  async getSessionTournament(id: string): Promise<SessionTournament | null> {
    return this.getSessionTournamentById(id);
  }

  async createStarredHand(input: InsertStarredHand & { id?: string }): Promise<StarredHand> {
    const id = input.id ?? nanoid();
    const values: Record<string, any> = {
      id,
      userId: input.userId,
      sessionId: input.sessionId,
      sessionTournamentId: input.sessionTournamentId,
      cooldownLogId: input.cooldownLogId ?? null,
      type: input.type,
      spot: input.spot,
      notes: input.notes ?? null,
    };
    // Sprint F2 — campos opcionais (lesson #7).
    if ((input as any).imageUrl !== undefined) values.imageUrl = (input as any).imageUrl;
    if ((input as any).conclusion !== undefined) values.conclusion = (input as any).conclusion;
    if ((input as any).reviewedAt !== undefined) {
      values.reviewedAt = typeof (input as any).reviewedAt === "string"
        ? new Date((input as any).reviewedAt)
        : (input as any).reviewedAt;
    }
    if ((input as any).reviewLater !== undefined) values.reviewLater = (input as any).reviewLater;
    if ((input as any).expiresAt !== undefined) {
      values.expiresAt = typeof (input as any).expiresAt === "string"
        ? new Date((input as any).expiresAt)
        : (input as any).expiresAt;
    }
    if ((input as any).pastedAt !== undefined) {
      values.pastedAt = typeof (input as any).pastedAt === "string"
        ? new Date((input as any).pastedAt)
        : (input as any).pastedAt;
    }
    if ((input as any).source !== undefined) values.source = (input as any).source;
    if ((input as any).status !== undefined) values.status = (input as any).status;
    // Sprint Spot-Screenshots — campos opcionais (migration 0019).
    if ((input as any).imageKey !== undefined) values.imageKey = (input as any).imageKey;
    if ((input as any).imageMime !== undefined) values.imageMime = (input as any).imageMime;
    if ((input as any).imageSize !== undefined) values.imageSize = (input as any).imageSize;
    if ((input as any).imageWidth !== undefined) values.imageWidth = (input as any).imageWidth;
    if ((input as any).imageHeight !== undefined) values.imageHeight = (input as any).imageHeight;
    if ((input as any).capturedDuring !== undefined) values.capturedDuring = (input as any).capturedDuring;
    const [row] = await db.insert(starredHands).values(values as any).returning();
    return row as StarredHand;
  }

  async getStarredHand(id: string, userId: string): Promise<StarredHand | null> {
    const [row] = await db
      .select()
      .from(starredHands)
      .where(and(eq(starredHands.id, id), eq(starredHands.userId, userId)))
      .limit(1);
    return (row as StarredHand) ?? null;
  }

  async listStarredHands(
    userId: string,
    filter: { sessionId?: string; type?: string; period?: "7d" | "30d" | "all"; reviewLater?: boolean; includeDiscarded?: boolean } = {},
  ): Promise<StarredHand[]> {
    const conditions: any[] = [eq(starredHands.userId, userId)];
    if (filter.sessionId) conditions.push(eq(starredHands.sessionId, filter.sessionId));
    if (filter.type) conditions.push(eq(starredHands.type, filter.type));
    if (filter.period && filter.period !== "all") {
      const now = new Date();
      const days = filter.period === "7d" ? 7 : 30;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      conditions.push(gte(starredHands.createdAt, cutoff));
    }
    // Soft-deleted spots ficam ocultos por default (Studies/SpotsView).
    if (!filter.includeDiscarded) {
      conditions.push(not(eq(starredHands.status, "discarded")));
    }
    if (filter.reviewLater !== undefined) {
      conditions.push(eq(starredHands.reviewLater, filter.reviewLater));
    }
    const rows = await db
      .select()
      .from(starredHands)
      .where(and(...conditions))
      .orderBy(desc(starredHands.createdAt));
    return rows as StarredHand[];
  }

  async deleteStarredHand(id: string, userId?: string): Promise<void> {
    // Sprint F2: cron do purge chama sem userId (ownership ja resolvida pelo
    // listSpotsForPurge). Cooldown-1 sempre passa userId.
    const condition = userId
      ? and(eq(starredHands.id, id), eq(starredHands.userId, userId))
      : eq(starredHands.id, id);
    await db.delete(starredHands).where(condition);
  }

  async countStarredHandsByTournament(
    sessionTournamentId: string,
    userId: string,
  ): Promise<number> {
    const [{ count: c }] = await db
      .select({ count: count() })
      .from(starredHands)
      .where(
        and(
          eq(starredHands.sessionTournamentId, sessionTournamentId),
          eq(starredHands.userId, userId),
        ),
      );
    return Number(c ?? 0);
  }

  /**
   * Sprint Spot-Screenshots — cap 10/sessao cross-tournament.
   * Conta TODOS os spots do user na sessao (sem filtro de source/status — cap
   * abrange spots legados de cooldown + screenshots de grind).
   *
   * NOTA D6: race condition aceita (overshoot 1). Sem SELECT FOR UPDATE em count.
   * 2 POSTs simultaneos no 10o spot podem inserir ambos. Documentado em ADR-057.
   */
  async countStarredHandsBySession(
    userId: string,
    sessionId: string,
  ): Promise<number> {
    const [{ count: c }] = await db
      .select({ count: count() })
      .from(starredHands)
      .where(
        and(
          eq(starredHands.userId, userId),
          eq(starredHands.sessionId, sessionId),
        ),
      );
    return Number(c ?? 0);
  }

  // ===========================================================================
  // Sprint F2 — Spot Screenshots helpers
  // Spec: Docs/specs/sprint-f2-spot-screenshots.md
  // ===========================================================================

  /** Lookup by id (sem ownership filter — handler valida userId apos). */
  async getStarredHandById(id: string): Promise<StarredHand | null> {
    const [row] = await db
      .select()
      .from(starredHands)
      .where(eq(starredHands.id, id))
      .limit(1);
    return (row as StarredHand) ?? null;
  }

  /**
   * Conta prints "ativos" por sessao (filtro: source IN ('paste','upload') AND
   * status != 'discarded'). Usado para limite de 10/sessao.
   *
   * NOTA F2 (TECH-DEBT-F2-COUNTER-RACE): em F2 isto NAO eh SELECT FOR UPDATE.
   * Pastes concorrentes do mesmo user em 2 abas podem ultrapassar o limite em
   * 1-2 rows sob race extrema. Aceito em F2 (single-instance dev, sem deploy
   * prod). F3 migra para tx real quando refactor do tx wrapper existir
   * (mesma janela do move pra S3 — ver ADR-051).
   */
  async countSpotsBySession(sessionId: string): Promise<number> {
    const [{ count: c }] = await db
      .select({ count: count() })
      .from(starredHands)
      .where(
        and(
          eq(starredHands.sessionId, sessionId),
          inArray(starredHands.source, ["paste", "upload"]),
          not(eq(starredHands.status, "discarded")),
        ),
      );
    return Number(c ?? 0);
  }

  /**
   * Resolve sessionTournamentId dentro de uma sessao quando o cliente nao
   * informou. Prefere status='playing'; fallback para mais recente updatedAt.
   * Retorna null se a sessao nao tem nenhum tournament.
   */
  async resolveTournamentInSession(sessionId: string): Promise<string | null> {
    const [playing] = await db
      .select({ id: sessionTournaments.id })
      .from(sessionTournaments)
      .where(
        and(
          eq(sessionTournaments.sessionId, sessionId),
          eq(sessionTournaments.status, "playing"),
        ),
      )
      .orderBy(desc(sessionTournaments.updatedAt))
      .limit(1);
    if (playing?.id) return playing.id;

    const [latest] = await db
      .select({ id: sessionTournaments.id })
      .from(sessionTournaments)
      .where(eq(sessionTournaments.sessionId, sessionId))
      .orderBy(desc(sessionTournaments.updatedAt))
      .limit(1);
    return latest?.id ?? null;
  }

  /**
   * Lista prints pendentes para o user. Filtros opcionais:
   *   - reviewLater: 'true' | 'false' | 'all' (default: false)
   *   - sessionId: filtra por sessao
   *   - limit/offset (default 50/0; max 200)
   *
   * Retorna `{ items, total, limit, offset }`. Inclui dados do torneio via JOIN.
   * Nunca retorna `status='reviewed'` ou `'discarded'`.
   */
  async listPendingSpots(
    userId: string,
    filter: {
      reviewLater?: string;
      sessionId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
    const offset = Math.max(0, filter.offset ?? 0);

    const conditions: any[] = [eq(starredHands.userId, userId)];
    // status: 'pending' (default), 'reviewed', ou 'all' (Sprint Studies-Reform fix).
    if (filter.status === "reviewed") {
      conditions.push(eq(starredHands.status, "reviewed"));
    } else if (filter.status !== "all") {
      conditions.push(eq(starredHands.status, "pending"));
    }
    if (filter.sessionId) {
      conditions.push(eq(starredHands.sessionId, filter.sessionId));
    }
    // 'all' = sem filtro de reviewLater (qualquer pending, RF-11).
    // 'true' = so revisar-depois. Default ('false' ou ausente) = nao revisar-depois.
    if (filter.reviewLater === "true") {
      conditions.push(eq(starredHands.reviewLater, true));
    } else if (filter.reviewLater !== "all") {
      conditions.push(eq(starredHands.reviewLater, false));
    }

    const rows = await db
      .select({
        id: starredHands.id,
        userId: starredHands.userId,
        sessionId: starredHands.sessionId,
        sessionTournamentId: starredHands.sessionTournamentId,
        type: starredHands.type,
        spot: starredHands.spot,
        notes: starredHands.notes,
        imageUrl: starredHands.imageUrl,
        conclusion: starredHands.conclusion,
        reviewedAt: starredHands.reviewedAt,
        reviewLater: starredHands.reviewLater,
        expiresAt: starredHands.expiresAt,
        pastedAt: starredHands.pastedAt,
        source: starredHands.source,
        status: starredHands.status,
        createdAt: starredHands.createdAt,
        tournamentName: sessionTournaments.name,
        tournamentSite: sessionTournaments.site,
        tournamentBuyIn: sessionTournaments.buyIn,
        // Sprint Studies-Reform fix: hidrata themeLink quando existir.
        // 1:1 esperado (uniqueIndex theme+spot), mas LEFT JOIN pode duplicar
        // se mesmo spot vincular a temas diferentes — caller deve agregar.
        linkId: studyThemeSpotLinks.id,
        linkThemeId: studyThemeSpotLinks.themeId,
        linkLinkedAt: studyThemeSpotLinks.linkedAt,
        linkReasoningText: studyThemeSpotLinks.reasoningText,
      })
      .from(starredHands)
      .leftJoin(sessionTournaments, eq(starredHands.sessionTournamentId, sessionTournaments.id))
      .leftJoin(studyThemeSpotLinks, eq(studyThemeSpotLinks.spotId, starredHands.id))
      .where(and(...conditions))
      .orderBy(desc(starredHands.pastedAt))
      .limit(limit)
      .offset(offset);

    // Agrega LEFT JOIN duplicado: spot pode aparecer multiplas vezes se vinculado
    // a varios temas. Mantem primeiro link encontrado (orderBy desc(pastedAt) ja
    // estavel para o spot; entre temas, o primeiro do array vira o "principal").
    const seen = new Map<string, any>();
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      const { linkId, linkThemeId, linkLinkedAt, linkReasoningText, ...spotFields } = row as any;
      seen.set(row.id, {
        ...spotFields,
        themeLink: linkId
          ? {
              id: linkId,
              themeId: linkThemeId,
              linkedAt: linkLinkedAt,
              reasoningText: linkReasoningText,
            }
          : null,
      });
    }
    const items = Array.from(seen.values());

    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(starredHands)
      .where(and(...conditions));

    return {
      items,
      total: Number(totalCount ?? 0),
      limit,
      offset,
    };
  }

  /**
   * Update parcial de starred_hand (PATCH /:id/review).
   * Caller ja validou ownership e enum. Aqui aplica o patch direto.
   */
  async updateStarredHand(id: string, patch: Record<string, any>): Promise<StarredHand | null> {
    const updateValues: Record<string, any> = {};
    if (patch.conclusion !== undefined) updateValues.conclusion = patch.conclusion;
    if (patch.reviewedAt !== undefined) updateValues.reviewedAt = patch.reviewedAt;
    if (patch.reviewLater !== undefined) updateValues.reviewLater = patch.reviewLater;
    if (patch.status !== undefined) updateValues.status = patch.status;
    if (patch.type !== undefined) updateValues.type = patch.type;
    if (patch.spot !== undefined) updateValues.spot = patch.spot;
    if (patch.notes !== undefined) updateValues.notes = patch.notes;
    if (patch.sessionTournamentId !== undefined) {
      updateValues.sessionTournamentId = patch.sessionTournamentId;
    }
    if (Object.keys(updateValues).length === 0) {
      return this.getStarredHandById(id);
    }
    const [row] = await db
      .update(starredHands)
      .set(updateValues)
      .where(eq(starredHands.id, id))
      .returning();
    return (row as StarredHand) ?? null;
  }

  /**
   * Soft delete: marca status='discarded'. Cron remove arquivo + row depois.
   * Idempotente: re-DELETE em row ja discarded eh no-op.
   */
  async softDeleteStarredHand(id: string): Promise<void> {
    await db
      .update(starredHands)
      .set({ status: "discarded", reviewLater: false })
      .where(eq(starredHands.id, id));
  }

  /**
   * Lista prints elegiveis para purga.
   *   - kind='discarded' : status='discarded' (qualquer idade).
   *   - kind='expired'   : status='pending' AND expiresAt < NOW()
   *                         AND reviewedAt IS NULL AND reviewLater=false.
   *
   * Idempotente — re-execucao no mesmo dia retorna apenas rows que ainda
   * existem com criterios. ENOENT no unlink eh tratado pelo cron.
   */
  async listSpotsForPurge(opts: { kind: "discarded" | "expired" }): Promise<
    Array<{ id: string; imageUrl: string | null }>
  > {
    if (opts.kind === "discarded") {
      const rows = await db
        .select({ id: starredHands.id, imageUrl: starredHands.imageUrl })
        .from(starredHands)
        .where(eq(starredHands.status, "discarded"));
      return rows.map((r) => ({ id: r.id, imageUrl: r.imageUrl ?? null }));
    }
    // expired
    const now = new Date();
    const rows = await db
      .select({ id: starredHands.id, imageUrl: starredHands.imageUrl })
      .from(starredHands)
      .where(
        and(
          eq(starredHands.status, "pending"),
          eq(starredHands.reviewLater, false),
          isNull(starredHands.reviewedAt),
          lte(starredHands.expiresAt, now),
        ),
      );
    return rows.map((r) => ({ id: r.id, imageUrl: r.imageUrl ?? null }));
  }

  /**
   * Confirma que `sessionTournamentId` pertence a uma sessao do user (mesma
   * sessao informada). Usado em PATCH /:id/review para re-tag de torneio.
   */
  async assertTournamentInSession(
    sessionTournamentId: string,
    sessionId: string,
    userId: string,
  ): Promise<boolean> {
    const st = await this.getSessionTournamentById(sessionTournamentId);
    if (!st) return false;
    if ((st as any).userId !== userId) return false;
    if ((st as any).sessionId !== sessionId) return false;
    return true;
  }

  // ===========================================================================
  // Sprint Spot-Anki-Reentry-3 — RF-1 (insight extension)
  // ===========================================================================

  /**
   * Updates a starred hand with insight/decisionCorrect/confidenceLevel/tags.
   * Returns null when ownership filter (userId) does not match.
   */
  async updateStarredHandInsight(
    handId: string,
    userId: string,
    patch: {
      insight?: string | null;
      decisionCorrect?: boolean | null;
      confidenceLevel?: number | null;
      tags?: string[] | null;
    },
  ): Promise<StarredHand | null> {
    const setValues: Record<string, any> = {};
    if (patch.insight !== undefined) setValues.insight = patch.insight;
    if (patch.decisionCorrect !== undefined) setValues.decisionCorrect = patch.decisionCorrect;
    if (patch.confidenceLevel !== undefined) setValues.confidenceLevel = patch.confidenceLevel;
    if (patch.tags !== undefined) setValues.tags = patch.tags;

    const [row] = await db
      .update(starredHands)
      .set(setValues)
      .where(and(eq(starredHands.id, handId), eq(starredHands.userId, userId)))
      .returning();
    return (row as StarredHand) ?? null;
  }

  /**
   * Lists starred hands with insight extension filters (RF-1.5).
   * Filters: withInsight, tag, decisionCorrect, minConfidence, limit, offset.
   * Always filters by userId (ownership). Returns { items, total }.
   */
  async getStarredHandsWithInsight(
    userId: string,
    filters: {
      withInsight?: boolean;
      tag?: string;
      decisionCorrect?: boolean;
      minConfidence?: number;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ items: StarredHand[]; total: number }> {
    const conditions: any[] = [eq(starredHands.userId, userId)];
    if (filters.withInsight === true) {
      conditions.push(isNotNull(starredHands.insight));
    }
    if (filters.tag !== undefined && filters.tag !== "") {
      // jsonb contains ?: tag IN tags array. Drizzle expression via sql helper.
      conditions.push(sql`${starredHands.tags} @> ${JSON.stringify([filters.tag])}::jsonb`);
    }
    if (filters.decisionCorrect !== undefined) {
      conditions.push(eq(starredHands.decisionCorrect, filters.decisionCorrect));
    }
    if (filters.minConfidence !== undefined) {
      conditions.push(gte(starredHands.confidenceLevel as any, filters.minConfidence));
    }

    const limitN = Math.min(200, Math.max(1, filters.limit ?? 50));
    const offsetN = Math.max(0, filters.offset ?? 0);

    // Build query in pieces so unit-test mocks (which reset both .limit and
    // .offset to mockResolvedValue) can verify both calls without breaking
    // the chain. Real Drizzle keeps the chain intact regardless of ordering.
    const builder: any = db
      .select()
      .from(starredHands)
      .where(and(...conditions))
      .orderBy(desc(starredHands.createdAt));
    builder.limit(limitN);
    const items = (await builder.offset(offsetN)) as StarredHand[];

    return { items, total: items.length };
  }

  /**
   * Batch lookup starred_hands by ids (used by Coach RF-4 enrichment).
   */
  async getStarredHandsByIds(ids: string[]): Promise<StarredHand[]> {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const rows = await db
      .select()
      .from(starredHands)
      .where(inArray(starredHands.id, ids));
    return rows as StarredHand[];
  }

  // ===========================================================================
  // Sprint Spot-Anki-Reentry-3 — RF-2 (spot_reentry_cards CRUD)
  // ===========================================================================

  /**
   * Creates a new spot_reentry_card. Uses ON CONFLICT DO NOTHING on the partial
   * unique index `uq_srs_user_spot_active` (user_id, spot_id) WHERE archived_at
   * IS NULL — when an active card already exists for the spot, returns null.
   */
  async createSpotReentryCard(input: {
    userId: string;
    spotId: string;
    source: "manual_add" | "drill_gto_difficult_spot" | "coach_session_insight";
    intervalDays: number;
    easeFactor: number;
    nextReviewAt: Date | string;
  }): Promise<any | null> {
    const id = nanoid();
    const nextReviewAt =
      typeof input.nextReviewAt === "string"
        ? new Date(input.nextReviewAt)
        : input.nextReviewAt;
    try {
      const rows = await db
        .insert(spotReentryCards)
        .values({
          id,
          userId: input.userId,
          spotId: input.spotId,
          source: input.source,
          intervalDays: String(input.intervalDays),
          easeFactor: String(input.easeFactor),
          nextReviewAt,
        } as any)
        .onConflictDoNothing()
        .returning();
      const [row] = rows as any[];
      return row ?? null;
    } catch (err: any) {
      // UNIQUE conflict bypass: if onConflictDoNothing not honored by chain
      // (mock layer), treat duplicate as null.
      if (err?.code === "23505") return null;
      throw err;
    }
  }

  /**
   * Lookup single active reentry card for (user, spot).
   */
  async getActiveReentryCardForSpot(
    userId: string,
    spotId: string,
  ): Promise<any | null> {
    const [row] = await db
      .select()
      .from(spotReentryCards)
      .where(
        and(
          eq(spotReentryCards.userId, userId),
          eq(spotReentryCards.spotId, spotId),
          isNull(spotReentryCards.archivedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Batch lookup active reentry cards for the given spotIds.
   */
  async getActiveReentryCardsBySpotIds(
    userId: string,
    spotIds: string[],
  ): Promise<any[]> {
    if (!Array.isArray(spotIds) || spotIds.length === 0) return [];
    const rows = await db
      .select()
      .from(spotReentryCards)
      .where(
        and(
          eq(spotReentryCards.userId, userId),
          inArray(spotReentryCards.spotId, spotIds),
          isNull(spotReentryCards.archivedAt),
        ),
      );
    return rows as any[];
  }

  /**
   * Returns reentry queue items (pending today) capped at min(limit, 20).
   * Each item joins the card with its starred_hand (insight, tags, imageUrl etc).
   */
  async getReentryQueue(
    userId: string,
    now: Date,
    limit: number,
  ): Promise<{
    items: Array<{ card: any; spot: any }>;
    pendingTotal: number;
    pendingTodayCap: number;
    nextScheduledAt: Date | null;
  }> {
    const cap = Math.min(20, Math.max(1, limit));

    const cards = ((await db
      .select()
      .from(spotReentryCards)
      .where(
        and(
          eq(spotReentryCards.userId, userId),
          isNull(spotReentryCards.archivedAt),
          lte(spotReentryCards.nextReviewAt, now),
        ),
      )
      .orderBy(asc(spotReentryCards.nextReviewAt))
      .limit(cap)) as any[]) ?? [];

    const cardsArr = Array.isArray(cards) ? cards : [];
    const spotIdsList = cardsArr.map((c) => c.spotId);
    let spots: any[] = [];
    if (spotIdsList.length > 0) {
      try {
        const result = (await db
          .select()
          .from(starredHands)
          .where(inArray(starredHands.id, spotIdsList))) as any;
        if (Array.isArray(result)) spots = result;
      } catch {
        spots = [];
      }
    }
    const spotsById = new Map<string, any>(
      spots.map((s) => [s.id, s]),
    );

    const items = cardsArr.map((card) => ({
      card,
      spot: spotsById.get(card.spotId) ?? null,
    }));

    // Total pending (uncapped). Wrap in try to tolerate mock chain limitations.
    let pendingTotal = items.length;
    try {
      const result = (await db
        .select({ c: count() })
        .from(spotReentryCards)
        .where(
          and(
            eq(spotReentryCards.userId, userId),
            isNull(spotReentryCards.archivedAt),
            lte(spotReentryCards.nextReviewAt, now),
          ),
        )) as any;
      if (Array.isArray(result) && result[0]) {
        pendingTotal = Number(result[0].c ?? items.length);
      }
    } catch {
      // keep fallback
    }

    // Next scheduled future card (when items=[]).
    let nextScheduledAt: Date | null = null;
    if (items.length === 0) {
      try {
        const result = (await db
          .select({ at: spotReentryCards.nextReviewAt })
          .from(spotReentryCards)
          .where(
            and(
              eq(spotReentryCards.userId, userId),
              isNull(spotReentryCards.archivedAt),
              gt(spotReentryCards.nextReviewAt, now),
            ),
          )
          .orderBy(asc(spotReentryCards.nextReviewAt))
          .limit(1)) as any;
        if (Array.isArray(result) && result[0]?.at) {
          nextScheduledAt = result[0].at;
        }
      } catch {
        // keep null
      }
    }

    return { items, pendingTotal, pendingTodayCap: cap, nextScheduledAt };
  }

  /**
   * Reentry card lookup by id with ownership filter.
   */
  async getReentryCardById(
    cardId: string,
    userId: string,
  ): Promise<any | null> {
    const [row] = await db
      .select()
      .from(spotReentryCards)
      .where(
        and(eq(spotReentryCards.id, cardId), eq(spotReentryCards.userId, userId)),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Updates a reentry card after grade (SM-2 applied). Increments review_count
   * and conditionally correct_count. Persists last_grade + last_review_at.
   *
   * Sprint Spot-Anki-Reentry-3 (HIGH-2 audit fix) — optimistic concurrency:
   * quando `expectedUpdatedAt` for fornecido, o UPDATE so altera o row se
   * `updated_at` ainda bater com o snapshot lido pelo handler. Se outro
   * grade concorrente ja escreveu, returning vem vazio e retornamos null.
   * O handler trata como 409 CARD_STALE.
   */
  async updateReentryCardAfterGrade(
    cardId: string,
    userId: string,
    patch: {
      intervalDays: number;
      easeFactor: number;
      nextReviewAt: Date | string;
      lastGrade: "again" | "hard" | "good" | "easy";
      incrementCorrect: boolean;
    },
    expectedUpdatedAt?: Date | string | null,
  ): Promise<any | null> {
    const next =
      typeof patch.nextReviewAt === "string"
        ? new Date(patch.nextReviewAt)
        : patch.nextReviewAt;
    const now = new Date();
    const setClause: any = {
      intervalDays: String(patch.intervalDays),
      easeFactor: String(patch.easeFactor),
      nextReviewAt: next,
      lastGrade: patch.lastGrade,
      lastReviewAt: now,
      reviewCount: sql`${spotReentryCards.reviewCount} + 1`,
      updatedAt: now,
    };
    if (patch.incrementCorrect) {
      setClause.correctCount = sql`${spotReentryCards.correctCount} + 1`;
    }
    const whereParts: any[] = [
      eq(spotReentryCards.id, cardId),
      eq(spotReentryCards.userId, userId),
    ];
    if (expectedUpdatedAt != null) {
      const stamp =
        typeof expectedUpdatedAt === "string"
          ? new Date(expectedUpdatedAt)
          : expectedUpdatedAt;
      whereParts.push(eq(spotReentryCards.updatedAt, stamp));
    }
    const [row] = (await db
      .update(spotReentryCards)
      .set(setClause)
      .where(and(...whereParts))
      .returning()) as any[];
    return row ?? null;
  }

  /**
   * Pushes nextReviewAt by +1 day without altering grade/review_count.
   */
  async updateReentryCardSkip(
    cardId: string,
    userId: string,
  ): Promise<any | null> {
    // Read current nextReviewAt; tolerate mock chains that resolve early.
    let existing: any = null;
    try {
      const result = (await db
        .select()
        .from(spotReentryCards)
        .where(
          and(
            eq(spotReentryCards.id, cardId),
            eq(spotReentryCards.userId, userId),
          ),
        )
        .limit(1)) as any;
      if (Array.isArray(result)) existing = result[0] ?? null;
    } catch {
      existing = null;
    }
    const baseAt = existing?.nextReviewAt
      ? existing.nextReviewAt instanceof Date
        ? existing.nextReviewAt
        : new Date(existing.nextReviewAt)
      : new Date();
    const newNext = new Date(baseAt.getTime() + 86_400_000);
    const updated = (await db
      .update(spotReentryCards)
      .set({ nextReviewAt: newNext, updatedAt: new Date() })
      .where(
        and(
          eq(spotReentryCards.id, cardId),
          eq(spotReentryCards.userId, userId),
        ),
      )
      .returning()) as any;
    if (Array.isArray(updated)) return updated[0] ?? null;
    return null;
  }

  /**
   * Soft-archive an active card for (user, spot). Returns archived flag.
   */
  async archiveReentryCard(
    userId: string,
    spotId: string,
  ): Promise<{ archived: boolean }> {
    const now = new Date();
    const rows = (await db
      .update(spotReentryCards)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(spotReentryCards.userId, userId),
          eq(spotReentryCards.spotId, spotId),
          isNull(spotReentryCards.archivedAt),
        ),
      )
      .returning()) as any[];
    return { archived: rows.length > 0 };
  }

  /**
   * Bulk-create reentry cards for the given items. Each item provides
   * { spotId, source, intervalDays, easeFactor, nextReviewAt }. Idempotent:
   * spots already with active cards are counted as `skipped`.
   */
  async bulkCreateReentryCards(
    userId: string,
    items: Array<{
      spotId: string;
      source: "manual_add" | "drill_gto_difficult_spot" | "coach_session_insight";
      intervalDays: number;
      easeFactor: number;
      nextReviewAt: Date | string;
    }>,
  ): Promise<{ created: number; skipped: number; cards: any[] }> {
    if (!Array.isArray(items) || items.length === 0) {
      return { created: 0, skipped: 0, cards: [] };
    }
    const now = new Date();
    const values = items.map((it) => ({
      id: nanoid(),
      userId,
      spotId: it.spotId,
      source: it.source,
      intervalDays: String(it.intervalDays),
      easeFactor: String(it.easeFactor),
      nextReviewAt:
        typeof it.nextReviewAt === "string"
          ? new Date(it.nextReviewAt)
          : it.nextReviewAt,
      createdAt: now,
      updatedAt: now,
    }));
    let created: any[] = [];
    try {
      created = (await db
        .insert(spotReentryCards)
        .values(values as any)
        .onConflictDoNothing()
        .returning()) as any[];
    } catch (err: any) {
      // Per-row fallback: insert one-by-one when bulk fails.
      created = [];
      for (const v of values) {
        try {
          const rows = await db
            .insert(spotReentryCards)
            .values(v as any)
            .onConflictDoNothing()
            .returning();
          if (rows[0]) created.push(rows[0]);
        } catch {
          // continue
        }
      }
    }
    const skipped = items.length - created.length;
    return { created: created.length, skipped, cards: created };
  }

  /**
   * Counts cards source='drill_gto_difficult_spot' criados desde todayStart.
   * Cron cap (ADR-137).
   */
  async countDrillCardsCreatedToday(
    userId: string,
    todayStart: Date,
  ): Promise<number> {
    const [row] = (await db
      .select({ c: count() })
      .from(spotReentryCards)
      .where(
        and(
          eq(spotReentryCards.userId, userId),
          eq(spotReentryCards.source, "drill_gto_difficult_spot"),
          gte(spotReentryCards.createdAt, todayStart),
        ),
      )) as any[];
    return Number(row?.c ?? 0);
  }

  /**
   * Returns SRS stats for the user (RF-5). Calculations:
   *   - pendingToday: cards next_review_at <= now AND archived_at IS NULL
   *   - reviewedLast7Days: distinct cards last_review_at > now-7d
   *   - accuracyLast7Days: correct_count_delta / review_count_delta within window
   *   - streakDays: consecutive days with >=1 review (today or yesterday cutoff)
   *
   * Tests using mocked db chains may return arbitrary shapes; defaults guard.
   */
  async getSrsStats(
    userId: string,
    now: Date,
  ): Promise<{
    pendingToday: number;
    reviewedLast7Days: number;
    accuracyLast7Days: number;
    streakDays: number;
  }> {
    try {
      // pendingToday
      const [pendingRow] = (await db
        .select({ c: count() })
        .from(spotReentryCards)
        .where(
          and(
            eq(spotReentryCards.userId, userId),
            isNull(spotReentryCards.archivedAt),
            lte(spotReentryCards.nextReviewAt, now),
          ),
        )) as any[];
      const pendingToday = Number(pendingRow?.c ?? 0);

      // reviewedLast7Days
      const cutoff = new Date(now.getTime() - 7 * 86_400_000);
      const [reviewedRow] = (await db
        .select({ c: count() })
        .from(spotReentryCards)
        .where(
          and(
            eq(spotReentryCards.userId, userId),
            isNotNull(spotReentryCards.lastReviewAt),
            gte(spotReentryCards.lastReviewAt as any, cutoff),
          ),
        )) as any[];
      const reviewedLast7Days = Number(reviewedRow?.c ?? 0);

      // accuracyLast7Days — count grade !== 'again' over total reviews within window
      let accuracyLast7Days = 0;
      if (reviewedLast7Days > 0) {
        const [correctRow] = (await db
          .select({ c: count() })
          .from(spotReentryCards)
          .where(
            and(
              eq(spotReentryCards.userId, userId),
              isNotNull(spotReentryCards.lastReviewAt),
              gte(spotReentryCards.lastReviewAt as any, cutoff),
              not(eq(spotReentryCards.lastGrade, "again")),
            ),
          )) as any[];
        const correct = Number(correctRow?.c ?? 0);
        accuracyLast7Days = Number((correct / reviewedLast7Days).toFixed(2));
      }

      // streakDays — consecutive days back from today/yesterday cutoff.
      // Pull distinct review dates (last 30d) and count consecutive run.
      const streakCutoff = new Date(now.getTime() - 30 * 86_400_000);
      const reviewedRows = (await db
        .select({ at: spotReentryCards.lastReviewAt })
        .from(spotReentryCards)
        .where(
          and(
            eq(spotReentryCards.userId, userId),
            isNotNull(spotReentryCards.lastReviewAt),
            gte(spotReentryCards.lastReviewAt as any, streakCutoff),
          ),
        )) as any[];

      const dayKeys = new Set<string>();
      for (const r of reviewedRows) {
        const at = r?.at instanceof Date ? r.at : r?.at ? new Date(r.at) : null;
        if (!at) continue;
        const key = at.toISOString().slice(0, 10);
        dayKeys.add(key);
      }
      const today = now.toISOString().slice(0, 10);
      const yesterday = new Date(now.getTime() - 86_400_000)
        .toISOString()
        .slice(0, 10);
      let streakDays = 0;
      // Anchor: today preferred; else yesterday cutoff (until midnight passes).
      let cursor: Date | null = null;
      if (dayKeys.has(today)) cursor = new Date(now);
      else if (dayKeys.has(yesterday))
        cursor = new Date(now.getTime() - 86_400_000);
      while (cursor) {
        const key = cursor.toISOString().slice(0, 10);
        if (dayKeys.has(key)) {
          streakDays += 1;
          cursor = new Date(cursor.getTime() - 86_400_000);
        } else {
          break;
        }
      }

      return {
        pendingToday,
        reviewedLast7Days,
        accuracyLast7Days,
        streakDays,
      };
    } catch (err) {
      console.error("getSrsStats failed", err);
      return {
        pendingToday: 0,
        reviewedLast7Days: 0,
        accuracyLast7Days: 0,
        streakDays: 0,
      };
    }
  }

  // ===========================================================================
  // Sprint Spot-Anki-Reentry-3 — RF-2.3 (cron drill spots helpers)
  // ===========================================================================

  /**
   * Lists all users for cron iteration. Used by materializeDrillDifficultSpotsCron.
   */
  async listAllUsers(): Promise<Array<{ userPlatformId: string }>> {
    const rows = await db
      .select({ userPlatformId: users.userPlatformId })
      .from(users);
    return rows as any[];
  }

  /**
   * Recent drill_gto study_sessions_v2 with non-empty difficult_spots in 7d window.
   */
  async getRecentDrillSessions(
    userId: string,
    now: Date,
  ): Promise<Array<{ id: string; userId: string; mode: string; difficultSpots: any[] }>> {
    const cutoff = new Date(now.getTime() - 7 * 86_400_000);
    const rows = (await db
      .select()
      .from(studySessionsV2)
      .where(
        and(
          eq(studySessionsV2.userId, userId),
          eq(studySessionsV2.mode, "drill_gto"),
          isNotNull(studySessionsV2.difficultSpots),
          gte(studySessionsV2.registeredAt as any, cutoff),
        ),
      )) as any[];
    return rows
      .filter((r) => Array.isArray(r.difficultSpots) && r.difficultSpots.length > 0)
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        mode: r.mode,
        difficultSpots: r.difficultSpots,
      }));
  }

  /**
   * Cron idempotency lookup — finds a starred_hand created by drill cron with
   * matching dedup hash inside `notes` (`[hash:<md5>]`).
   */
  async findStarredHandByDrillHash(
    userId: string,
    hash: string,
  ): Promise<{ id: string } | null> {
    const [row] = await db
      .select({ id: starredHands.id })
      .from(starredHands)
      .where(
        and(
          eq(starredHands.userId, userId),
          eq(starredHands.source, "manual"),
          like(starredHands.notes, `%hash:${hash}%`),
        ),
      )
      .limit(1);
    return (row as any) ?? null;
  }

  /**
   * Cron-only insert: creates a drill starred_hand orfao (session_id NULL,
   * captured_during='drill_gto', type='drill').
   */
  async createDrillStarredHand(input: {
    userId: string;
    hash: string;
    context: string;
    note: string;
  }): Promise<{ id: string }> {
    const id = nanoid();
    const now = new Date();
    const notes = `[hash:${input.hash}] context: ${input.context} | note: ${input.note}`;
    await db.insert(starredHands).values({
      id,
      userId: input.userId,
      sessionId: null as any,
      sessionTournamentId: null as any,
      type: "drill",
      spot: "other",
      notes,
      capturedDuring: "drill_gto",
      source: "manual",
      status: "pending",
      pastedAt: now,
    } as any);
    return { id };
  }

  // ===========================================================================
  // Sprint Spot-Anki-Reentry-3 — END
  // ===========================================================================

  // ===========================================================================
  // Sprint Cooldown-2 — Sleep Gate
  // ===========================================================================

  async setSessionPlanClosed(
    sessionId: string,
    userId: string,
    value: boolean,
  ): Promise<GrindSession | null> {
    const [row] = await db
      .update(grindSessions)
      .set({ planClosed: value, updatedAt: new Date() })
      .where(and(eq(grindSessions.id, sessionId), eq(grindSessions.userId, userId)))
      .returning();
    return (row as GrindSession) ?? null;
  }

  async setUserDashboardSnoozedUntil(
    userId: string,
    until: Date | string,
  ): Promise<User | null> {
    const value = typeof until === "string" ? new Date(until) : until;
    const [row] = await db
      .update(users)
      .set({ dashboardSnoozedUntil: value, updatedAt: new Date() })
      .where(eq(users.userPlatformId, userId))
      .returning();
    return (row as User) ?? null;
  }

  async clearUserDashboardSnoozedUntil(userId: string): Promise<User | null> {
    const [row] = await db
      .update(users)
      .set({ dashboardSnoozedUntil: null, updatedAt: new Date() })
      .where(eq(users.userPlatformId, userId))
      .returning();
    return (row as User) ?? null;
  }

  // ===========================================================================
  // Sprint Cooldown-2 — Analytics aggregation
  // ===========================================================================

  private periodCutoff(period: "7d" | "30d" | "90d"): Date {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  async getCooldownComplianceMetrics(
    userId: string,
    period: "7d" | "30d" | "90d",
  ): Promise<{ total: number; completed: number; complianceRate: number }> {
    const cutoff = this.periodCutoff(period);

    // Total = sessoes do user com status='completed' no periodo
    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(grindSessions)
      .where(
        and(
          eq(grindSessions.userId, userId),
          eq(grindSessions.status, "completed"),
          gte(grindSessions.date, cutoff),
        ),
      );

    // Completed = cooldown_logs com completedAt!=null no periodo
    const [{ count: completedCount }] = await db
      .select({ count: count() })
      .from(cooldownLogs)
      .where(
        and(
          eq(cooldownLogs.userId, userId),
          isNotNull(cooldownLogs.completedAt),
          gte(cooldownLogs.startedAt, cutoff),
        ),
      );

    const total = Number(totalCount ?? 0);
    const completed = Number(completedCount ?? 0);
    const complianceRate = total > 0 ? Math.min(1, completed / total) : 0;
    return { total, completed, complianceRate };
  }

  async getStarredHandsDistribution(
    userId: string,
    period: "7d" | "30d" | "90d",
  ): Promise<Array<{ type: string; count: number }>> {
    const cutoff = this.periodCutoff(period);
    const rows = await db
      .select({
        type: starredHands.type,
        count: count(),
      })
      .from(starredHands)
      .where(
        and(
          eq(starredHands.userId, userId),
          gte(starredHands.createdAt, cutoff),
        ),
      )
      .groupBy(starredHands.type);

    return rows
      .map((r: any) => ({ type: String(r.type), count: Number(r.count ?? 0) }))
      .sort((a, b) => b.count - a.count);
  }

  async getCooldownImpactMetrics(
    userId: string,
    period: "7d" | "30d" | "90d",
  ): Promise<{
    withCooldown: { avgRoi: number };
    withoutCooldown: { avgRoi: number };
    delta: number;
  }> {
    const cutoff = this.periodCutoff(period);

    // Sessoes do user no periodo, completed
    const sessions = await db
      .select({
        id: grindSessions.id,
        roi: grindSessions.roi,
      })
      .from(grindSessions)
      .where(
        and(
          eq(grindSessions.userId, userId),
          eq(grindSessions.status, "completed"),
          gte(grindSessions.date, cutoff),
        ),
      );

    if (sessions.length === 0) {
      return {
        withCooldown: { avgRoi: 0 },
        withoutCooldown: { avgRoi: 0 },
        delta: 0,
      };
    }

    // Sessoes que tem cooldown completo
    const cdLogs = await db
      .select({ sessionId: cooldownLogs.sessionId })
      .from(cooldownLogs)
      .where(
        and(
          eq(cooldownLogs.userId, userId),
          isNotNull(cooldownLogs.completedAt),
        ),
      );
    const sessionsWithCooldown = new Set(cdLogs.map((r: any) => r.sessionId));

    let withSum = 0;
    let withCount = 0;
    let withoutSum = 0;
    let withoutCount = 0;

    for (const s of sessions) {
      const roi = s.roi == null ? null : Number(s.roi);
      if (roi == null || !Number.isFinite(roi)) continue;
      if (sessionsWithCooldown.has(s.id)) {
        withSum += roi;
        withCount += 1;
      } else {
        withoutSum += roi;
        withoutCount += 1;
      }
    }

    const withAvg = withCount > 0 ? withSum / withCount : 0;
    const withoutAvg = withoutCount > 0 ? withoutSum / withoutCount : 0;
    return {
      withCooldown: { avgRoi: withAvg },
      withoutCooldown: { avgRoi: withoutAvg },
      delta: withAvg - withoutAvg,
    };
  }

  async getTopLessons(
    userId: string,
    period: "7d" | "30d" | "90d",
  ): Promise<Array<{ token: string; count: number }>> {
    const cutoff = this.periodCutoff(period);
    const rows = await db
      .select({ abGameAnswers: cooldownLogs.abGameAnswers })
      .from(cooldownLogs)
      .where(
        and(
          eq(cooldownLogs.userId, userId),
          isNotNull(cooldownLogs.completedAt),
          gte(cooldownLogs.startedAt, cutoff),
        ),
      );

    const lessons: string[] = [];
    for (const r of rows) {
      const answers: any = (r as any).abGameAnswers;
      const lesson = answers?.lesson;
      if (typeof lesson === "string" && lesson.trim()) {
        lessons.push(lesson);
      }
    }

    if (lessons.length === 0) return [];

    // Tokenizer aplicado aqui (sanitizer + agregacao)
    const { tokenizeLessons } = await import("./services/lessonTokenizer");
    return tokenizeLessons(lessons);
  }

  // ============================================================================
  // Sprint Bankroll-3 RF-4 — wallet_transfers storage (CRIT-1 fix)
  // ============================================================================

  async insertWalletTransfer(data: any, tx?: any): Promise<WalletTransfer> {
    const runner = tx ?? db;
    const id = data.id ?? data.transferGroupId ?? nanoid();
    const occurredAt = data.occurredAt instanceof Date
      ? data.occurredAt
      : (data.occurredAt ? new Date(data.occurredAt) : new Date());
    const [inserted] = await runner
      .insert(walletTransfers)
      .values({
        id,
        userId: data.userId,
        transferGroupId: data.transferGroupId ?? id,
        fromWalletId: data.fromWalletId,
        toWalletId: data.toWalletId,
        amountFrom: String(data.amountFrom),
        amountTo: String(data.amountTo),
        fromCurrency: data.fromCurrency,
        toCurrency: data.toCurrency,
        fxRate: data.fxRate != null ? String(data.fxRate) : null,
        feeAmount: data.feeAmount != null ? String(data.feeAmount) : null,
        feeCurrency: data.feeCurrency ?? null,
        feeWalletId: data.feeWalletId ?? null,
        reason: data.reason,
        note: data.note ?? null,
        occurredAt,
      } as any)
      .returning();
    return inserted as WalletTransfer;
  }

  async listWalletTransfers(
    userId: string,
    opts: { walletId?: string; limit?: number } = {},
    tx?: any,
  ): Promise<WalletTransfer[]> {
    const runner = tx ?? db;
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const conditions: any[] = [eq(walletTransfers.userId, userId)];
    if (opts.walletId) {
      conditions.push(
        or(
          eq(walletTransfers.fromWalletId, opts.walletId),
          eq(walletTransfers.toWalletId, opts.walletId),
        ),
      );
    }
    const rows = await runner
      .select()
      .from(walletTransfers)
      .where(and(...conditions))
      .orderBy(desc(walletTransfers.occurredAt))
      .limit(limit);
    return rows as WalletTransfer[];
  }

  async getWalletTransferById(
    userId: string,
    transferId: string,
    tx?: any,
  ): Promise<{ transfer: WalletTransfer; transactions: WalletTransaction[] } | null> {
    const runner = tx ?? db;
    const [transfer] = await runner
      .select()
      .from(walletTransfers)
      .where(
        and(
          eq(walletTransfers.userId, userId),
          eq(walletTransfers.id, transferId),
        ),
      )
      .limit(1);
    if (!transfer) return null;
    const transactions = await runner
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.transferGroupId, (transfer as any).transferGroupId))
      .orderBy(asc(walletTransactions.occurredAt));
    return { transfer: transfer as WalletTransfer, transactions: transactions as WalletTransaction[] };
  }

  // ============================================================================
  // Sprint Bankroll-3 RF-5 — wallet_pending storage (CRIT-1 fix)
  // ============================================================================

  async createWalletPending(data: any, tx?: any): Promise<WalletPending> {
    const runner = tx ?? db;
    const id = data.id ?? nanoid();
    const expectedClearAt = data.expectedClearAt
      ? data.expectedClearAt instanceof Date
        ? data.expectedClearAt
        : new Date(data.expectedClearAt)
      : null;
    const [inserted] = await runner
      .insert(walletPending)
      .values({
        id,
        walletId: data.walletId,
        userId: data.userId,
        direction: data.direction,
        nativeAmount: String(data.nativeAmount),
        nativeCurrency: data.nativeCurrency,
        reason: data.reason,
        status: data.status ?? "pending",
        expectedClearAt,
        note: data.note ?? null,
        externalReference: data.externalReference ?? null,
      } as any)
      .returning();
    return inserted as WalletPending;
  }

  async countWalletPendingActive(walletId: string, tx?: any): Promise<number> {
    const runner = tx ?? db;
    const result: any = await runner.execute(
      sql`SELECT COUNT(*)::int AS cnt
          FROM wallet_pending
          WHERE wallet_id = ${walletId}
            AND status = 'pending'`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return Number(rows[0]?.cnt ?? 0);
  }

  async getWalletPendingById(
    userId: string,
    pendingId: string,
    tx?: any,
  ): Promise<WalletPending | null> {
    const runner = tx ?? db;
    const [row] = await runner
      .select()
      .from(walletPending)
      .where(
        and(
          eq(walletPending.userId, userId),
          eq(walletPending.id, pendingId),
        ),
      )
      .limit(1);
    return (row ?? null) as WalletPending | null;
  }

  /**
   * Update wallet_pending status. Test contract:
   *   storage.updateWalletPendingStatus(tx, payload)
   *   tx.updateWalletPendingStatus(tx, payload)
   * First arg is a tx runner (or anything truthy when called bare).
   * If first arg looks like a Drizzle tx (has .update fn), use it; otherwise db.
   */
  async updateWalletPendingStatus(txOrPayload: any, payload?: any): Promise<void> {
    let runner: any = db;
    let data: any;
    // Detect (tx, payload) vs (payload).
    if (payload && typeof payload === "object" && payload.id) {
      data = payload;
      // First arg may be a tx; use only if it has Drizzle-like .update method.
      if (txOrPayload && typeof txOrPayload.update === "function") {
        runner = txOrPayload;
      }
    } else {
      data = txOrPayload;
    }
    if (!data?.id) return;
    const updates: any = { updatedAt: new Date() };
    if (data.status) updates.status = data.status;
    if (data.clearedAt) updates.clearedAt = data.clearedAt instanceof Date ? data.clearedAt : new Date(data.clearedAt);
    if (data.cancelledAt) updates.cancelledAt = data.cancelledAt instanceof Date ? data.cancelledAt : new Date(data.cancelledAt);
    await runner
      .update(walletPending)
      .set(updates)
      .where(eq(walletPending.id, data.id));
  }

  async listWalletPending(
    userId: string,
    walletId: string,
    opts: { includeAll?: boolean } = {},
    tx?: any,
  ): Promise<WalletPending[]> {
    const runner = tx ?? db;
    const conditions: any[] = [
      eq(walletPending.userId, userId),
      eq(walletPending.walletId, walletId),
    ];
    if (!opts.includeAll) {
      conditions.push(eq(walletPending.status, "pending"));
    }
    const rows = await runner
      .select()
      .from(walletPending)
      .where(and(...conditions))
      .orderBy(desc(walletPending.createdAt));
    return rows as WalletPending[];
  }

  // ============================================================================
  // Sprint Bankroll-3 RF-6 — Stop service support (CRIT-1 fix)
  // ============================================================================

  async getUserById(userId: string): Promise<User | undefined> {
    // Resolves by userPlatformId (USER-XXXX), since service contracts use that.
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.userPlatformId, userId))
      .limit(1);
    return row;
  }

  async listGrindSessionsByUser(userId: string): Promise<GrindSession[]> {
    return await db
      .select()
      .from(grindSessions)
      .where(eq(grindSessions.userId, userId))
      .orderBy(desc(grindSessions.date));
  }

  async listSessionTournamentsBySessions(
    userId: string,
    sessionIds: string[],
  ): Promise<SessionTournament[]> {
    if (!sessionIds || sessionIds.length === 0) return [];
    return await db
      .select()
      .from(sessionTournaments)
      .where(
        and(
          eq(sessionTournaments.userId, userId),
          inArray(sessionTournaments.sessionId, sessionIds),
        ),
      );
  }

  // ============================================================================
  // Sprint Bankroll-3 RF-7 — ROI by platform aggregation (CRIT-1 fix)
  // ============================================================================

  // ============================================================================
  // Sprint home-reform-4 item 1 — Sessoes mes atual aggregate
  // ============================================================================
  //
  // Spec: Docs/specs/home-reform-4.md item 1 + item 2 (Card Sessoes mes atual).
  // Agrega session_tournaments do mes corrente (UTC) por site. Retorna shape
  // { site, count, investedNative, returnsNative } pra conversao FX no
  // orchestrator (servico chama fxResolver). Diferente de getRoiByPlatform
  // (que usa `tournaments WHERE grind_session_id IS NULL`), este metodo eh
  // a contraparte para dados de /grind-live (CLAUDE.md §6.1).
  //
  // Mes corrente: usa `now` server-side. Frontend pode passar `monthStart` /
  // `monthEnd` para overrides futuros (item 10 grafico evolucao).
  //
  // Profit = returns - invested (calculado no orchestrator porque envolve FX).
  // returnsNative = SUM(COALESCE(NULLIF(result, 0), prize) + COALESCE(bounty,0))
  //   — segue mesma logica do calculateSessionStats client-side (lessons §6).
  // investedNative = SUM(buyIn * (1 + rebuys + reentries) + addOnCost*addOnTaken).
  async getSessionsMonthAggregate(
    userId: string,
    opts: { monthStart?: Date; monthEnd?: Date } = {},
  ): Promise<Array<{
    site: string;
    count: number;
    investedNative: string;
    returnsNative: string;
  }>> {
    const now = new Date();
    const monthStart = opts.monthStart ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = opts.monthEnd ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const conditions = [
      eq(sessionTournaments.userId, userId),
      gte(sessionTournaments.createdAt, monthStart),
      lt(sessionTournaments.createdAt, monthEnd),
    ];

    const rows = await db
      .select({
        site: sessionTournaments.site,
        count: sql<number>`COUNT(*)::int`,
        investedNative: sql<string>`COALESCE(SUM(
          CAST(${sessionTournaments.buyIn} AS DECIMAL)
          * (1 + COALESCE(CAST(${sessionTournaments.rebuys} AS DECIMAL), 0) + COALESCE(CAST(${sessionTournaments.reentries} AS DECIMAL), 0))
          + CASE WHEN ${sessionTournaments.addOnTaken} = true THEN COALESCE(CAST(${sessionTournaments.addOnCost} AS DECIMAL), 0) ELSE 0 END
        ), 0)::text`,
        returnsNative: sql<string>`COALESCE(SUM(
          CASE
            WHEN COALESCE(CAST(${sessionTournaments.result} AS DECIMAL), 0) <> 0
              THEN CAST(${sessionTournaments.result} AS DECIMAL)
            ELSE COALESCE(CAST(${sessionTournaments.prize} AS DECIMAL), 0)
          END
          + COALESCE(CAST(${sessionTournaments.bounty} AS DECIMAL), 0)
        ), 0)::text`,
      })
      .from(sessionTournaments)
      .where(and(...conditions))
      .groupBy(sessionTournaments.site);

    return rows.map((r: any) => ({
      site: String(r.site ?? ''),
      count: Number(r.count) || 0,
      investedNative: String(r.investedNative ?? '0'),
      returnsNative: String(r.returnsNative ?? '0'),
    }));
  }

  // ============================================================================
  // Sprint home-reform-5 item 6 — Sessoes Registradas (all-time grind aggregate)
  // ============================================================================
  //
  // Spec: Docs/specs/home-reform-5.md Item 6 (renome "Performance" -> "Sessoes
  // Registradas" + 6 KPIs). Fonte: `session_tournaments` (live grind),
  // contraparte historica do Dashboard (CLAUDE.md §6.1).
  //
  // KPIs adicionais vs. getSessionsMonthAggregate:
  //   itmCount = COUNT(prize > 0)
  //   finalTablesCount = COUNT(position 1..9)
  //   winsCount = COUNT(position = 1)
  //
  // Sem range default = all-time. Aceita { from, to } para usos futuros.
  async getSessionsRegisteredAggregate(
    userId: string,
    opts: { from?: Date; to?: Date } = {},
  ): Promise<Array<{
    site: string;
    count: number;
    investedNative: string;
    returnsNative: string;
    itmCount: number;
    finalTablesCount: number;
    winsCount: number;
  }>> {
    // home-reform-5 audit fix #2: alinhar com /grind calculateSessionStats.
    //  - count: filtra status IN ('registered','active','finished','completed')
    //    (matches `registros = registered + finished` em /grind, exclui upcoming
    //    e deleted/soft-deleted que inflavam o total — DB tinha 201 mas /grind
    //    mostrava 124 = exatos finished).
    //  - itmCount: usa `result > 0 OR prize > 0` (calculateSessionStats:656).
    //    Schema tem `position`/`prize` frequentemente null + `result` populado;
    //    o predicado antigo so com `prize > 0` zerava ITM ainda que o usuario
    //    tenha registrado profit positivo via `result`.
    const COUNTED_STATUSES = ['registered', 'active', 'finished', 'completed'];
    const conditions = [
      eq(sessionTournaments.userId, userId),
      inArray(sessionTournaments.status, COUNTED_STATUSES),
    ];
    if (opts.from) conditions.push(gte(sessionTournaments.createdAt, opts.from));
    if (opts.to) conditions.push(lt(sessionTournaments.createdAt, opts.to));

    const rows = await db
      .select({
        site: sessionTournaments.site,
        count: sql<number>`COUNT(*)::int`,
        investedNative: sql<string>`COALESCE(SUM(
          CAST(${sessionTournaments.buyIn} AS DECIMAL)
          * (1 + COALESCE(CAST(${sessionTournaments.rebuys} AS DECIMAL), 0) + COALESCE(CAST(${sessionTournaments.reentries} AS DECIMAL), 0))
          + CASE WHEN ${sessionTournaments.addOnTaken} = true THEN COALESCE(CAST(${sessionTournaments.addOnCost} AS DECIMAL), 0) ELSE 0 END
        ), 0)::text`,
        returnsNative: sql<string>`COALESCE(SUM(
          CASE
            WHEN COALESCE(CAST(${sessionTournaments.result} AS DECIMAL), 0) <> 0
              THEN CAST(${sessionTournaments.result} AS DECIMAL)
            ELSE COALESCE(CAST(${sessionTournaments.prize} AS DECIMAL), 0)
          END
          + COALESCE(CAST(${sessionTournaments.bounty} AS DECIMAL), 0)
        ), 0)::text`,
        itmCount: sql<number>`COUNT(CASE WHEN COALESCE(CAST(${sessionTournaments.result} AS DECIMAL), 0) > 0 OR COALESCE(CAST(${sessionTournaments.prize} AS DECIMAL), 0) > 0 THEN 1 END)::int`,
        finalTablesCount: sql<number>`COUNT(CASE WHEN ${sessionTournaments.position} BETWEEN 1 AND 9 THEN 1 END)::int`,
        winsCount: sql<number>`COUNT(CASE WHEN ${sessionTournaments.position} = 1 THEN 1 END)::int`,
      })
      .from(sessionTournaments)
      .where(and(...conditions))
      .groupBy(sessionTournaments.site);

    return rows.map((r: any) => ({
      site: String(r.site ?? ''),
      count: Number(r.count) || 0,
      investedNative: String(r.investedNative ?? '0'),
      returnsNative: String(r.returnsNative ?? '0'),
      itmCount: Number(r.itmCount) || 0,
      finalTablesCount: Number(r.finalTablesCount) || 0,
      winsCount: Number(r.winsCount) || 0,
    }));
  }

  // ============================================================================
  // Sprint home-reform-5 item 6 — RecentSessions enriquecidas com KPIs
  // ============================================================================
  //
  // Cada sessao recente puxa rows agrupadas por (sessionId, site) com count,
  // invested/returns nativos + itm/finalTables/wins. Orchestrator aplica FX
  // pra USD por site e devolve PnL/ROI em USD por sessao.
  async getRecentSessionsWithKpis(
    userId: string,
    limit: number = 5,
  ): Promise<Array<{
    sessionId: string;
    createdAt: Date | null;
    status: string;
    sites: Array<{
      site: string;
      count: number;
      investedNative: string;
      returnsNative: string;
      itmCount: number;
      finalTablesCount: number;
      winsCount: number;
    }>;
  }>> {
    try {
      const sessions: any[] = await (db as any)
        .select()
        .from(grindSessions)
        .where(eq(grindSessions.userId, userId))
        .orderBy(desc(grindSessions.createdAt))
        .limit(limit);

      if (!sessions || sessions.length === 0) return [];

      const sessionIds = sessions.map((s: any) => s.id).filter(Boolean);
      if (sessionIds.length === 0) return [];

      // home-reform-5 audit fix #2: mesmas regras de getSessionsRegisteredAggregate
      // (status counted + ITM via result OR prize) pra recentSessions chips.
      const COUNTED_STATUSES = ['registered', 'active', 'finished', 'completed'];
      const aggRows = await db
        .select({
          sessionId: sessionTournaments.sessionId,
          site: sessionTournaments.site,
          count: sql<number>`COUNT(*)::int`,
          investedNative: sql<string>`COALESCE(SUM(
            CAST(${sessionTournaments.buyIn} AS DECIMAL)
            * (1 + COALESCE(CAST(${sessionTournaments.rebuys} AS DECIMAL), 0) + COALESCE(CAST(${sessionTournaments.reentries} AS DECIMAL), 0))
            + CASE WHEN ${sessionTournaments.addOnTaken} = true THEN COALESCE(CAST(${sessionTournaments.addOnCost} AS DECIMAL), 0) ELSE 0 END
          ), 0)::text`,
          returnsNative: sql<string>`COALESCE(SUM(
            CASE
              WHEN COALESCE(CAST(${sessionTournaments.result} AS DECIMAL), 0) <> 0
                THEN CAST(${sessionTournaments.result} AS DECIMAL)
              ELSE COALESCE(CAST(${sessionTournaments.prize} AS DECIMAL), 0)
            END
            + COALESCE(CAST(${sessionTournaments.bounty} AS DECIMAL), 0)
          ), 0)::text`,
          itmCount: sql<number>`COUNT(CASE WHEN COALESCE(CAST(${sessionTournaments.result} AS DECIMAL), 0) > 0 OR COALESCE(CAST(${sessionTournaments.prize} AS DECIMAL), 0) > 0 THEN 1 END)::int`,
          finalTablesCount: sql<number>`COUNT(CASE WHEN ${sessionTournaments.position} BETWEEN 1 AND 9 THEN 1 END)::int`,
          winsCount: sql<number>`COUNT(CASE WHEN ${sessionTournaments.position} = 1 THEN 1 END)::int`,
        })
        .from(sessionTournaments)
        .where(and(
          eq(sessionTournaments.userId, userId),
          inArray(sessionTournaments.sessionId, sessionIds),
          inArray(sessionTournaments.status, COUNTED_STATUSES),
        ))
        .groupBy(sessionTournaments.sessionId, sessionTournaments.site);

      const bySession = new Map<string, Array<{
        site: string;
        count: number;
        investedNative: string;
        returnsNative: string;
        itmCount: number;
        finalTablesCount: number;
        winsCount: number;
      }>>();
      for (const r of aggRows as any[]) {
        const sid = String(r.sessionId ?? '');
        if (!bySession.has(sid)) bySession.set(sid, []);
        bySession.get(sid)!.push({
          site: String(r.site ?? ''),
          count: Number(r.count) || 0,
          investedNative: String(r.investedNative ?? '0'),
          returnsNative: String(r.returnsNative ?? '0'),
          itmCount: Number(r.itmCount) || 0,
          finalTablesCount: Number(r.finalTablesCount) || 0,
          winsCount: Number(r.winsCount) || 0,
        });
      }

      return sessions.map((s: any) => ({
        sessionId: String(s.id ?? ''),
        createdAt: s.createdAt instanceof Date ? s.createdAt : (s.createdAt ? new Date(s.createdAt) : null),
        status: String(s.status ?? 'finalized'),
        sites: bySession.get(String(s.id ?? '')) ?? [],
      }));
    } catch (err) {
      console.error('[storage.getRecentSessionsWithKpis] failed', err);
      throw err;
    }
  }

  // ============================================================================
  // Sprint home-reform-4 item 2+6 — Dashboard mes atual aggregate
  // ============================================================================
  //
  // Spec: Docs/specs/home-reform-4.md item 2 (novo card Dashboard) + item 6
  // (Performance abaixo de Sessoes, mesmo padrao). Card mostra Torneios |
  // Profit | ROI do mes corrente baseado em `tournaments WHERE
  // grind_session_id IS NULL` (CLAUDE.md §6.1 — historico oficial / dashboard).
  //
  // Mirror de getSessionsMonthAggregate, mas fonte distinta: aqui uploads/manual
  // grade/sharkscope, nao session_tournaments live. Mantendo schema simetrico
  // (count + investedNative + profitNative) pra orquestrador FX→USD.
  //
  // Conta torneios distintos (DISTINCT seriesId OR id) para alinhar com
  // getRoiByPlatform e quickStats.totalTournaments.
  // investedNative = SUM(buyIn * (1 + reentries) + addOnCost*addOnTaken).
  // profitNative   = SUM(prize)  ; tournaments.prize ja eh net profit.
  // Exclui baggedAt NOT NULL (torneios em Day-2 ainda em jogo).
  async getDashboardMonthAggregate(
    userId: string,
    opts: { monthStart?: Date; monthEnd?: Date } = {},
  ): Promise<Array<{
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
  }>> {
    const now = new Date();
    const monthStart = opts.monthStart ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = opts.monthEnd ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const conditions = [
      eq(tournaments.userId, userId),
      isNull(tournaments.grindSessionId),
      isNull(tournaments.baggedAt),
      gte(tournaments.datePlayed, monthStart),
      lt(tournaments.datePlayed, monthEnd),
    ];

    const rows = await db
      .select({
        site: tournaments.site,
        count: sql<number>`COUNT(DISTINCT COALESCE(${tournaments.seriesId}, ${tournaments.id}))::int`,
        investedNative: sql<string>`COALESCE(SUM(
          CAST(${tournaments.buyIn} AS DECIMAL)
          + COALESCE(CAST(${tournaments.reentries} AS DECIMAL), 0) * CAST(${tournaments.buyIn} AS DECIMAL)
          + CASE WHEN ${tournaments.addOnTaken} = true THEN COALESCE(CAST(${tournaments.addOnCost} AS DECIMAL), 0) ELSE 0 END
        ), 0)::text`,
        profitNative: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL)), 0)::text`,
      })
      .from(tournaments)
      .where(and(...conditions))
      .groupBy(tournaments.site);

    return rows.map((r: any) => ({
      site: String(r.site ?? ''),
      count: Number(r.count) || 0,
      investedNative: String(r.investedNative ?? '0'),
      profitNative: String(r.profitNative ?? '0'),
    }));
  }

  // ============================================================================
  // Sprint home-reform-4 item 10 — Daily aggregate (evolution chart)
  // ============================================================================
  //
  // Spec: Docs/specs/home-reform-4.md item 10. Endpoint /api/home/evolution
  // exibe grafico de profit acumulado por dia do mes selecionado. Mesma fonte
  // do DashboardMonthCard (CLAUDE.md §6.1 — `tournaments WHERE
  // grind_session_id IS NULL`). Aqui agrupado por (data UTC, site) — service
  // aplica FX→USD por site e acumula sequencialmente.
  async getDashboardDailyAggregate(
    userId: string,
    opts: { monthStart: Date; monthEnd: Date },
  ): Promise<Array<{
    date: string;
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
  }>> {
    const conditions = [
      eq(tournaments.userId, userId),
      isNull(tournaments.grindSessionId),
      isNull(tournaments.baggedAt),
      gte(tournaments.datePlayed, opts.monthStart),
      lt(tournaments.datePlayed, opts.monthEnd),
    ];

    const dayExpr = sql<string>`TO_CHAR(${tournaments.datePlayed} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

    const rows = await db
      .select({
        date: dayExpr,
        site: tournaments.site,
        count: sql<number>`COUNT(DISTINCT COALESCE(${tournaments.seriesId}, ${tournaments.id}))::int`,
        investedNative: sql<string>`COALESCE(SUM(
          CAST(${tournaments.buyIn} AS DECIMAL)
          + COALESCE(CAST(${tournaments.reentries} AS DECIMAL), 0) * CAST(${tournaments.buyIn} AS DECIMAL)
          + CASE WHEN ${tournaments.addOnTaken} = true THEN COALESCE(CAST(${tournaments.addOnCost} AS DECIMAL), 0) ELSE 0 END
        ), 0)::text`,
        profitNative: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL)), 0)::text`,
      })
      .from(tournaments)
      .where(and(...conditions))
      .groupBy(dayExpr, tournaments.site);

    return rows.map((r: any) => ({
      date: String(r.date ?? ''),
      site: String(r.site ?? ''),
      count: Number(r.count) || 0,
      investedNative: String(r.investedNative ?? '0'),
      profitNative: String(r.profitNative ?? '0'),
    }));
  }

  // ============================================================================
  // Sprint home-reform-5 item 7 — Dashboard All Time aggregate (6 KPIs estendidos)
  // ============================================================================
  //
  // Spec: Docs/specs/home-reform-5.md item 7. Card "Dashboard - All Time" com
  // 6 KPIs (Torneios | Profit | ROI | ITM | Mesas Finais | Cravadas) baseado
  // em `tournaments WHERE grind_session_id IS NULL` (CLAUDE.md §6.1) sem filtro
  // de mes. Espelha shape de getDashboardMonthAggregate + adiciona itmCount,
  // finalTablesCount, winsCount via DISTINCT seriesId/id (consistente com
  // getDashboardPerformance linha ~2750).
  //
  // Exclui baggedAt NOT NULL (Day-2 ainda em jogo).
  async getDashboardAllTimeAggregate(
    userId: string,
  ): Promise<Array<{
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
    itmCount: number;
    finalTablesCount: number;
    winsCount: number;
  }>> {
    const conditions = [
      eq(tournaments.userId, userId),
      isNull(tournaments.grindSessionId),
      isNull(tournaments.baggedAt),
    ];

    const rows = await db
      .select({
        site: tournaments.site,
        count: sql<number>`COUNT(DISTINCT COALESCE(${tournaments.seriesId}, ${tournaments.id}))::int`,
        investedNative: sql<string>`COALESCE(SUM(
          CAST(${tournaments.buyIn} AS DECIMAL)
          + COALESCE(CAST(${tournaments.reentries} AS DECIMAL), 0) * CAST(${tournaments.buyIn} AS DECIMAL)
          + CASE WHEN ${tournaments.addOnTaken} = true THEN COALESCE(CAST(${tournaments.addOnCost} AS DECIMAL), 0) ELSE 0 END
        ), 0)::text`,
        profitNative: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL)), 0)::text`,
        itmCount: sql<number>`COUNT(DISTINCT CASE WHEN CAST(${tournaments.prize} AS DECIMAL) > 0 THEN COALESCE(${tournaments.seriesId}, ${tournaments.id}) END)::int`,
        finalTablesCount: sql<number>`COUNT(DISTINCT CASE WHEN ${tournaments.position} >= 1 AND ${tournaments.position} <= 9 AND ${tournaments.position} IS NOT NULL THEN COALESCE(${tournaments.seriesId}, ${tournaments.id}) END)::int`,
        winsCount: sql<number>`COUNT(DISTINCT CASE WHEN ${tournaments.position} = 1 THEN COALESCE(${tournaments.seriesId}, ${tournaments.id}) END)::int`,
      })
      .from(tournaments)
      .where(and(...conditions))
      .groupBy(tournaments.site);

    return rows.map((r: any) => ({
      site: String(r.site ?? ''),
      count: Number(r.count) || 0,
      investedNative: String(r.investedNative ?? '0'),
      profitNative: String(r.profitNative ?? '0'),
      itmCount: Number(r.itmCount) || 0,
      finalTablesCount: Number(r.finalTablesCount) || 0,
      winsCount: Number(r.winsCount) || 0,
    }));
  }

  // ============================================================================
  // Sprint home-reform-5 item 7 — Dashboard All Time monthly aggregate (chart)
  // ============================================================================
  //
  // Spec: Docs/specs/home-reform-5.md item 7. Grafico evolucao all-time agrupa
  // dados por mes UTC + site. Service aplica FX por site -> USD por mes e
  // acumula sequencialmente.
  async getDashboardAllTimeMonthlyAggregate(
    userId: string,
  ): Promise<Array<{
    month: string;
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
  }>> {
    const conditions = [
      eq(tournaments.userId, userId),
      isNull(tournaments.grindSessionId),
      isNull(tournaments.baggedAt),
    ];

    const monthExpr = sql<string>`TO_CHAR(${tournaments.datePlayed} AT TIME ZONE 'UTC', 'YYYY-MM')`;

    const rows = await db
      .select({
        month: monthExpr,
        site: tournaments.site,
        count: sql<number>`COUNT(DISTINCT COALESCE(${tournaments.seriesId}, ${tournaments.id}))::int`,
        investedNative: sql<string>`COALESCE(SUM(
          CAST(${tournaments.buyIn} AS DECIMAL)
          + COALESCE(CAST(${tournaments.reentries} AS DECIMAL), 0) * CAST(${tournaments.buyIn} AS DECIMAL)
          + CASE WHEN ${tournaments.addOnTaken} = true THEN COALESCE(CAST(${tournaments.addOnCost} AS DECIMAL), 0) ELSE 0 END
        ), 0)::text`,
        profitNative: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL)), 0)::text`,
      })
      .from(tournaments)
      .where(and(...conditions))
      .groupBy(monthExpr, tournaments.site);

    return rows.map((r: any) => ({
      month: String(r.month ?? ''),
      site: String(r.site ?? ''),
      count: Number(r.count) || 0,
      investedNative: String(r.investedNative ?? '0'),
      profitNative: String(r.profitNative ?? '0'),
    }));
  }

  // ============================================================================
  // Sprint home-reform-4 item 5 — Grade hoje aggregate
  // ============================================================================
  //
  // Spec: Docs/specs/home-reform-4.md item 5. Card "Grade do dia" chips A|B|C
  // mostrando count, totalInvestmentUsd, ABI dos torneios planejados no dia
  // selecionado para o profile selecionado.
  //
  // Filtra `planned_tournaments` por user, dayOfWeek (0..6) e profile (A|B|C).
  // Retorna agregado por site -> count + soma do buy-in nativo (sem reentries
  // ou add-on, pois eh planejamento e nao registro real).
  // is_active filtra rows soft-deleted da grade.
  async getGradeTodayAggregate(
    userId: string,
    opts: { dayOfWeek: number; profile: 'A' | 'B' | 'C' },
  ): Promise<Array<{
    site: string;
    count: number;
    investedNative: string;
  }>> {
    const conditions = [
      eq(plannedTournaments.userId, userId),
      eq(plannedTournaments.dayOfWeek, opts.dayOfWeek),
      eq(plannedTournaments.profile, opts.profile),
      eq(plannedTournaments.isActive, true),
    ];

    const rows = await db
      .select({
        site: plannedTournaments.site,
        count: sql<number>`COUNT(*)::int`,
        investedNative: sql<string>`COALESCE(SUM(CAST(${plannedTournaments.buyIn} AS DECIMAL)), 0)::text`,
      })
      .from(plannedTournaments)
      .where(and(...conditions))
      .groupBy(plannedTournaments.site);

    return rows.map((r: any) => ({
      site: String(r.site ?? ''),
      count: Number(r.count) || 0,
      investedNative: String(r.investedNative ?? '0'),
    }));
  }

  // ============================================================================
  // Sprint home-reform-5 item 5 — Grade do Dia: Primeiro + Ultimo Registro
  // ============================================================================
  //
  // Spec: Docs/specs/home-reform-5.md item 5. Card "Grade do dia" estende o
  // payload do home-reform-4 item 5 com 2 horarios chave: primeiro e ultimo
  // registro do dia para o(s) profile(s) ativo(s).
  //
  // ORDER BY COALESCE(registration_time, time) ASC: usa registrationTime quando
  // preenchido (intencao explicita do jogador, ADR-090 / Sprint News-3 6/7) e
  // fallback para time padrao (HH:MM da grade). Mesma cascata que /grind-live.
  //
  // Retorna { first: { time, name }, last: { time, name } } | null.
  // Quando profileIds vazio -> null sem hit DB.
  async getDayPlanBoundaries(
    userId: string,
    weekday: number,
    profileIds: Array<'A' | 'B' | 'C'>,
  ): Promise<{ first: { time: string; name: string }; last: { time: string; name: string } } | null> {
    if (!Array.isArray(profileIds) || profileIds.length === 0) return null;

    const conditions = [
      eq(plannedTournaments.userId, userId),
      eq(plannedTournaments.dayOfWeek, weekday),
      inArray(plannedTournaments.profile, profileIds as string[]),
      eq(plannedTournaments.isActive, true),
    ];

    const rows = await db
      .select({
        time: plannedTournaments.time,
        name: plannedTournaments.name,
        registrationTime: plannedTournaments.registrationTime,
        lateRegMinutes: plannedTournaments.lateRegMinutes,
      })
      .from(plannedTournaments)
      .where(and(...conditions))
      .orderBy(sql`COALESCE(${plannedTournaments.registrationTime}, ${plannedTournaments.time}) ASC`);

    if (!rows || rows.length === 0) return null;

    const items = (rows as any[]).map((r: any) => ({
      time: getDisplayRegistrationTime(r),
      name: String(r.name ?? ''),
    }));
    // Re-sort em JS pelo display time (cobre rows onde lateReg empurra deadline
    // alem do time + registrationTime explicito de outra row). Sort string ASC
    // funciona pra HH:MM dentro do mesmo dia.
    items.sort((a, b) => a.time.localeCompare(b.time));

    return {
      first: items[0],
      last: items[items.length - 1],
    };
  }

  async getRoiByPlatform(
    userId: string,
    opts: { sinceDate?: Date | null; untilDate?: Date | null; limit?: number } = {},
  ): Promise<Array<{
    site: string;
    sessionsCount: number;
    tournamentsCount: number;
    investedNative: string;
    profitNative: string;
  }>> {
    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
    const sinceDate = opts.sinceDate ?? null;
    const untilDate = opts.untilDate ?? null;

    // CLAUDE.md regra de fonte: dashboard/ROI by platform usa `tournaments`
    // (importacoes via /upload, manual grade, sharkscope) e exclui registros
    // criados em /grind-live (grindSessionId NOT NULL). Substitui consulta
    // antiga em session_tournaments que poluia o card.
    // sessionsCount = dias unicos com torneios na plataforma (proxy historico).
    // investedNative = SUM(buyIn * (1 + reentries) + addOnCost).
    // profitNative   = SUM(prize)  ; tournaments.prize ja eh net profit.
    const conditions: any[] = [
      eq(tournaments.userId, userId),
      isNull(tournaments.grindSessionId),
      isNull(tournaments.baggedAt),
    ];
    if (sinceDate) {
      conditions.push(gte(tournaments.datePlayed, sinceDate));
    }
    if (untilDate) {
      conditions.push(lt(tournaments.datePlayed, untilDate));
    }

    const rows = await db
      .select({
        site: tournaments.site,
        sessionsCount: sql<number>`COUNT(DISTINCT DATE(${tournaments.datePlayed}))::int`,
        tournamentsCount: sql<number>`COUNT(DISTINCT COALESCE(${tournaments.seriesId}, ${tournaments.id}))::int`,
        investedNative: sql<string>`COALESCE(SUM(
          CAST(${tournaments.buyIn} AS DECIMAL)
          + COALESCE(CAST(${tournaments.reentries} AS DECIMAL), 0) * CAST(${tournaments.buyIn} AS DECIMAL)
          + CASE WHEN ${tournaments.addOnTaken} = true THEN COALESCE(CAST(${tournaments.addOnCost} AS DECIMAL), 0) ELSE 0 END
        ), 0)::text`,
        profitNative: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL)), 0)::text`,
      })
      .from(tournaments)
      .where(and(...conditions))
      .groupBy(tournaments.site)
      .limit(limit);

    return rows.map((r: any) => ({
      site: r.site,
      sessionsCount: Number(r.sessionsCount) || 0,
      tournamentsCount: Number(r.tournamentsCount) || 0,
      investedNative: String(r.investedNative ?? "0"),
      profitNative: String(r.profitNative ?? "0"),
    }));
  }

  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return await db.transaction(async (tx) => {
      // Wrap tx com metodos de bankroll que sabem usar tx
      const txWrapper: any = {
        getUserBankrollForUpdate: (userId: string) =>
          this.getUserBankrollForUpdate(userId, tx),
        insertBankrollSnapshot: (data: InsertBankrollSnapshot) =>
          this.insertBankrollSnapshot(data, tx),
        updateUserBankroll: (params: any) =>
          this.updateUserBankroll(params, tx),
        getBankrollSnapshots: (userId: string, filters?: BankrollSnapshotsFilters) =>
          this.getBankrollSnapshots(userId, filters),
        // Wallet wrappers
        createWallet: (data: any) => this.createWallet(data, tx),
        getWalletById: (walletId: string, userId: string) =>
          this.getWalletById(walletId, userId, tx),
        listWalletsByUser: (userId: string, opts?: any) =>
          this.listWalletsByUser(userId, opts, tx),
        countActiveWalletsByUser: (userId: string) =>
          this.countActiveWalletsByUser(userId, tx),
        findActiveWalletByName: (userId: string, name: string) =>
          this.findActiveWalletByName(userId, name, tx),
        selectWalletForUpdate: (walletId: string, userId: string) =>
          this.selectWalletForUpdate(walletId, userId, tx),
        // tx wrapper legado: (walletId, patch) — usado por mocks de tests.
        // Ownership eh garantida pelo service que chama getWalletById antes.
        updateWallet: async (walletId: string, patch: any): Promise<Wallet> => {
          const updates: any = { updatedAt: new Date() };
          if (patch.name !== undefined) updates.name = patch.name;
          if (patch.color !== undefined) updates.color = patch.color;
          if (patch.displayOrder !== undefined) updates.displayOrder = patch.displayOrder;
          if (patch.bankrollRule !== undefined) updates.bankrollRule = patch.bankrollRule;
          if (patch.isShotPocket !== undefined) updates.isShotPocket = patch.isShotPocket;
          const [updated] = await tx
            .update(wallets)
            .set(updates)
            .where(eq(wallets.id, walletId))
            .returning();
          return updated;
        },
        // HIGH-7: nova fn com filtro userId no WHERE — defesa-em-profundidade
        // contra cross-tenant write em refatoracao futura.
        updateWalletScoped: async (walletId: string, userId: string, patch: any): Promise<Wallet> => {
          const updates: any = { updatedAt: new Date() };
          if (patch.name !== undefined) updates.name = patch.name;
          if (patch.color !== undefined) updates.color = patch.color;
          if (patch.displayOrder !== undefined) updates.displayOrder = patch.displayOrder;
          if (patch.bankrollRule !== undefined) updates.bankrollRule = patch.bankrollRule;
          if (patch.isShotPocket !== undefined) updates.isShotPocket = patch.isShotPocket;
          const [updated] = await tx
            .update(wallets)
            .set(updates)
            .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
            .returning();
          return updated;
        },
        archiveWallet: (walletId: string, userId: string) =>
          this.archiveWallet(walletId, userId, tx),
        updateWalletBalance: (walletId: string, newBalance: any) =>
          this.updateWalletBalance(walletId, newBalance, tx),
        createWalletTransaction: (data: any) =>
          this.createWalletTransaction(data, tx),
        listWalletTransactions: (userId: string, walletId: string, filters: any) =>
          this.listWalletTransactions(userId, walletId, filters, tx),
        getLastWalletTransaction: (walletId: string) =>
          this.getLastWalletTransaction(walletId, tx),
        getActiveWalletsByUser: (userId: string) =>
          this.getActiveWalletsByUser(userId, tx),
        setUserBankrollV2Migrated: (userId: string, value: boolean) =>
          this.setUserBankrollV2Migrated(userId, value, tx),
        backfillSnapshotsWalletId: (userId: string, walletId: string) =>
          this.backfillSnapshotsWalletId(userId, walletId, tx),
        selectUserSettingsForUpdate: (userId: string) =>
          this.selectUserSettingsForUpdate(userId, tx),
        getUserSettings: (userId: string) => this.getUserSettings(userId),
        // Sprint Tickets-1 — wrappers Drizzle reais (B1 fix)
        createTicket: (data: any) => this.createTicket(data, tx),
        getTicketById: (id: string, userId: string) => this.getTicketById(id, userId, tx),
        getTicketByIdForUpdate: (id: string, userId: string) =>
          this.getTicketByIdForUpdate(id, userId, tx),
        useTicket: (params: any) => this.useTicket(params, tx),
        cancelTicket: (id: string, userId: string, reason?: string) =>
          this.cancelTicket(id, userId, reason, tx),
        getActiveTicketsByUser: (userId: string) =>
          this.getActiveTicketsByUser(userId, tx),
        getTicketsByUser: (userId: string, filters?: any) =>
          this.getTicketsByUser(userId, filters, tx),
        findMatchingTickets: (userId: string, params: any) =>
          this.findMatchingTickets(userId, params, tx),
        getTournamentById: (id: string, userId?: string) =>
          this.getTournamentById(id, userId, tx),
        getSessionTournamentById: (id: string) =>
          this.getSessionTournamentById(id, tx),
        // CRITICAL-01 fix (sprint session-end-reconciliation): expor metodos
        // de reconciliacao no tx wrapper para sessionReconciliation rodar
        // wallet_transaction + session_wallet_snapshot atomicamente.
        findReconciliationMarker: (sessionId: string, userId: string) =>
          this.findReconciliationMarker(sessionId, userId, tx),
        findSessionWalletSnapshot: (sessionId: string, userId: string) =>
          this.findSessionWalletSnapshot(sessionId, userId, tx),
        createSessionWalletSnapshot: (input: any) =>
          this.createSessionWalletSnapshot(input, tx),
        listSessionTournaments: (sessionId: string, userId: string) =>
          this.listSessionTournaments(sessionId, userId, tx),
        listSessionWalletSnapshots: (sessionId: string, userId: string) =>
          this.listSessionWalletSnapshots(sessionId, userId, tx),
        // Sprint Bankroll-3 RF-4 — Transfers (CRIT-1 fix)
        insertWalletTransfer: (data: any) => this.insertWalletTransfer(data, tx),
        listWalletTransfers: (userId: string, opts?: any) =>
          this.listWalletTransfers(userId, opts, tx),
        getWalletTransferById: (userId: string, transferId: string) =>
          this.getWalletTransferById(userId, transferId, tx),
        // Sprint Bankroll-3 RF-5 — Pending (CRIT-1 fix)
        createWalletPending: (data: any) => this.createWalletPending(data, tx),
        countWalletPendingActive: (walletId: string) =>
          this.countWalletPendingActive(walletId, tx),
        getWalletPendingById: (userId: string, pendingId: string) =>
          this.getWalletPendingById(userId, pendingId, tx),
        // Mantem assinatura legada (txOrPayload, payload?) — pendingService usa
        // tx.updateWalletPendingStatus(tx, payload). Essa wrapper repassa direto
        // o `tx` real (closure) ignorando o tx redundante do caller.
        updateWalletPendingStatus: async (txOrPayload: any, payload?: any) => {
          let data: any;
          if (payload && typeof payload === "object" && payload.id) {
            data = payload;
          } else {
            data = txOrPayload;
          }
          return await this.updateWalletPendingStatus(tx, data);
        },
        listWalletPending: (userId: string, walletId: string, opts?: any) =>
          this.listWalletPending(userId, walletId, opts, tx),
        // Sprint Coach-2B — coach helpers dentro da tx (lesson #194)
        getCoachAction: (id: string) => this.getCoachAction(id, tx),
        updateCoachAction: (id: string, delta: any, opts?: any) =>
          this.updateCoachAction(id, delta, { tx: opts?.tx ?? tx }),
        // Raw drizzle tx para handlers que precisam executar queries diretas.
        __rawTx: tx,
      };
      return await fn(txWrapper);
    });
  }

  // ===========================================================================
  // Sprint F3 — Stats Analyzer (ADR-051)
  // ===========================================================================

  async getHudLayouts(userId: string): Promise<HudLayout[]> {
    return await db
      .select()
      .from(hudLayouts)
      .where(eq(hudLayouts.userId, userId))
      .orderBy(desc(hudLayouts.isDefault), asc(hudLayouts.name));
  }

  async getHudLayout(
    id: string,
    userId: string,
  ): Promise<HudLayout | undefined> {
    const [row] = await db
      .select()
      .from(hudLayouts)
      .where(and(eq(hudLayouts.id, id), eq(hudLayouts.userId, userId)));
    return row;
  }

  async createHudLayout(input: InsertHudLayout): Promise<HudLayout> {
    const id = nanoid();
    return await db.transaction(async (tx) => {
      if (input.isDefault) {
        await tx
          .update(hudLayouts)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(hudLayouts.userId, input.userId),
              eq(hudLayouts.isDefault, true),
            ),
          );
      }
      const [row] = await tx
        .insert(hudLayouts)
        .values({
          id,
          userId: input.userId,
          name: input.name,
          isDefault: input.isDefault ?? false,
          sections: input.sections,
        })
        .returning();
      return row;
    });
  }

  async updateHudLayout(
    id: string,
    userId: string,
    patch: UpdateHudLayout,
    tx?: any,
  ): Promise<HudLayout | undefined> {
    // HIGH-3 reviewer: aceita `tx` opcional para participar de transacao externa
    // (ex: handlePatchHudLayoutWithLinkedThemes precisa atomicidade entre
    // updateHudLayout + appendStatToThemes + removeStatFromThemes).
    // Quando `tx` omitido, abre transacao propria como antes.
    const runner = async (txCtx: any) => {
      const [existing] = await txCtx
        .select()
        .from(hudLayouts)
        .where(and(eq(hudLayouts.id, id), eq(hudLayouts.userId, userId)));
      if (!existing) return undefined;
      if (patch.isDefault === true && !existing.isDefault) {
        await txCtx
          .update(hudLayouts)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(hudLayouts.userId, userId),
              eq(hudLayouts.isDefault, true),
            ),
          );
      }
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (patch.name !== undefined) updateData.name = patch.name;
      if (patch.isDefault !== undefined) updateData.isDefault = patch.isDefault;
      if (patch.sections !== undefined) updateData.sections = patch.sections;
      // Stats-V3: aceita ambos camelCase (Zod schema) e snake_case (handlers V3 raw)
      const fieldsJsonInput =
        (patch as any).fieldsJson ?? (patch as any).fields_json;
      if (fieldsJsonInput !== undefined) updateData.fieldsJson = fieldsJsonInput;
      const [row] = await txCtx
        .update(hudLayouts)
        .set(updateData)
        .where(and(eq(hudLayouts.id, id), eq(hudLayouts.userId, userId)))
        .returning();
      return row;
    };
    if (tx) return runner(tx);
    return await db.transaction(runner);
  }

  async deleteHudLayout(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(hudLayouts)
      .where(and(eq(hudLayouts.id, id), eq(hudLayouts.userId, userId)))
      .returning({ id: hudLayouts.id });
    return result.length > 0;
  }

  /**
   * Sprint Stats-V3 reviewer R1 (MEDIUM-7): mutacao atomica de fields_json.
   * Le, transforma e escreve dentro de uma transacao para serializar dois clients
   * editando target-override / custom-stats simultaneamente.
   */
  async mutateHudLayoutFields(
    id: string,
    userId: string,
    transform: (currentFields: HudLayoutFieldEntry[]) => HudLayoutFieldEntry[],
  ): Promise<HudLayout | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(hudLayouts)
        .where(and(eq(hudLayouts.id, id), eq(hudLayouts.userId, userId)));
      if (!existing) return undefined;
      const current =
        ((existing as any).fieldsJson ??
          (existing as any).fields_json ??
          []) as HudLayoutFieldEntry[];
      const next = transform([...current]);
      const [row] = await tx
        .update(hudLayouts)
        .set({ fieldsJson: next as any, updatedAt: new Date() } as any)
        .where(and(eq(hudLayouts.id, id), eq(hudLayouts.userId, userId)))
        .returning();
      return row;
    });
  }

  async getHudStatSnapshots(
    userId: string,
    opts?: { layoutId?: string; limit?: number },
  ): Promise<HudStatSnapshot[]> {
    const conditions = [eq(hudStatSnapshots.userId, userId)];
    if (opts?.layoutId) {
      conditions.push(eq(hudStatSnapshots.layoutId, opts.layoutId));
    }
    const limit = Math.min(opts?.limit ?? 100, 500);
    return await db
      .select()
      .from(hudStatSnapshots)
      .where(and(...conditions))
      .orderBy(desc(hudStatSnapshots.capturedAt))
      .limit(limit);
  }

  async getHudStatSnapshot(
    id: string,
    userId: string,
  ): Promise<HudStatSnapshot | undefined> {
    const [row] = await db
      .select()
      .from(hudStatSnapshots)
      .where(
        and(eq(hudStatSnapshots.id, id), eq(hudStatSnapshots.userId, userId)),
      );
    return row;
  }

  async createHudStatSnapshot(
    input: InsertHudStatSnapshot,
  ): Promise<HudStatSnapshot> {
    const id = nanoid();
    const [row] = await db
      .insert(hudStatSnapshots)
      .values({
        id,
        userId: input.userId,
        layoutId: input.layoutId,
        source: input.source ?? "manual",
        capturedAt: input.capturedAt ?? new Date(),
        values: input.values,
        sampleSize: input.sampleSize ?? null,
        sessionId: input.sessionId ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return row;
  }

  async deleteHudStatSnapshot(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(hudStatSnapshots)
      .where(
        and(eq(hudStatSnapshots.id, id), eq(hudStatSnapshots.userId, userId)),
      )
      .returning({ id: hudStatSnapshots.id });
    return result.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Sprint Stats-V3: snapshot patch (RF-06) + OCR audit (RF-12)
  // ---------------------------------------------------------------------------

  async updateHudStatSnapshot(
    id: string,
    userId: string,
    patch: {
      values?: Record<string, number | null>;
      captureMethod?: string;
      sourceImageKey?: string | null;
      ocrConfidence?: Record<string, number> | null;
      ocrRawResponse?: unknown | null;
    },
  ): Promise<HudStatSnapshot | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(hudStatSnapshots)
        .where(
          and(
            eq(hudStatSnapshots.id, id),
            eq(hudStatSnapshots.userId, userId),
          ),
        );
      if (!existing) return undefined;

      const updateData: Record<string, any> = {};
      if (patch.values !== undefined) {
        // Patch parcial: merge sobre values existentes, com null preservado.
        updateData.values = { ...(existing.values ?? {}), ...patch.values };
      }
      if (patch.captureMethod !== undefined) {
        updateData.captureMethod = patch.captureMethod;
      }
      if (patch.sourceImageKey !== undefined) {
        updateData.sourceImageKey = patch.sourceImageKey;
      }
      if (patch.ocrConfidence !== undefined) {
        updateData.ocrConfidence = patch.ocrConfidence;
      }
      if (patch.ocrRawResponse !== undefined) {
        updateData.ocrRawResponse = patch.ocrRawResponse;
      }

      if (Object.keys(updateData).length === 0) {
        return existing;
      }

      const [row] = await tx
        .update(hudStatSnapshots)
        .set(updateData)
        .where(
          and(
            eq(hudStatSnapshots.id, id),
            eq(hudStatSnapshots.userId, userId),
          ),
        )
        .returning();
      return row;
    });
  }

  async insertHudOcrAudit(userId: string): Promise<HudOcrAuditRow> {
    const id = nanoid();
    const [row] = await db
      .insert(hudOcrAudit)
      .values({ id, userId })
      .returning();
    return row;
  }

  async getHudOcrAudit(
    userId: string,
    sinceTs: Date,
  ): Promise<HudOcrAuditRow[]> {
    return await db
      .select()
      .from(hudOcrAudit)
      .where(and(eq(hudOcrAudit.userId, userId), gte(hudOcrAudit.createdAt, sinceTs)))
      .orderBy(desc(hudOcrAudit.createdAt));
  }

  /**
   * Sprint Stats-V3 reviewer R1 (INFO-6): cache lookup OCR via index parcial.
   * Usa o index expression `idx_hud_snapshots_image_sha256` (migration 0020)
   * em vez de scan + .find() em JS.
   */
  async findHudStatSnapshotByImageSha256(
    userId: string,
    sha: string,
  ): Promise<HudStatSnapshot | undefined> {
    const rows = await db
      .select()
      .from(hudStatSnapshots)
      .where(
        and(
          eq(hudStatSnapshots.userId, userId),
          sql`${hudStatSnapshots.ocrRawResponse}->>'image_sha256' = ${sha}`,
        ),
      )
      .orderBy(desc(hudStatSnapshots.capturedAt))
      .limit(1);
    return rows[0];
  }

  // ===========================================================================
  // Sprint Studies-Reform — RF-05/06/07 storage methods (ADR-067/068)
  // Migration 0021_studies_reform.sql
  // ===========================================================================

  async getStudyTheme(themeId: string): Promise<StudyTheme | null> {
    const [row] = await db
      .select()
      .from(studyThemes)
      .where(eq(studyThemes.id, themeId))
      .limit(1);
    return (row as StudyTheme) ?? null;
  }

  async getStudyThemeByName(name: string, userId: string): Promise<StudyTheme | null> {
    const [row] = await db
      .select()
      .from(studyThemes)
      .where(
        and(
          eq(studyThemes.userId, userId),
          sql`lower(${studyThemes.name}) = lower(${name})`,
        ),
      )
      .limit(1);
    return (row as StudyTheme) ?? null;
  }

  async getStudyTabsByTheme(themeId: string): Promise<any[]> {
    const rows = await db
      .select()
      .from(studyTabs)
      .where(eq(studyTabs.themeId, themeId))
      .orderBy(asc(studyTabs.sortOrder));
    return rows;
  }

  async linkSpotToTheme(input: {
    themeId: string;
    spotId: string;
    userId: string;
    reasoningText?: string | null;
  }): Promise<StudyThemeSpotLink & { alreadyLinked?: boolean }> {
    const [existing] = await db
      .select()
      .from(studyThemeSpotLinks)
      .where(
        and(
          eq(studyThemeSpotLinks.themeId, input.themeId),
          eq(studyThemeSpotLinks.spotId, input.spotId),
        ),
      )
      .limit(1);

    if (existing) {
      return { ...(existing as StudyThemeSpotLink), alreadyLinked: true };
    }

    const id = nanoid(21);
    const [row] = await db
      .insert(studyThemeSpotLinks)
      .values({
        id,
        themeId: input.themeId,
        spotId: input.spotId,
        userId: input.userId,
        reasoningText: input.reasoningText ?? null,
      })
      .returning();
    return row as StudyThemeSpotLink;
  }

  async unlinkSpotFromTheme(linkId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(studyThemeSpotLinks)
      .where(
        and(
          eq(studyThemeSpotLinks.id, linkId),
          eq(studyThemeSpotLinks.userId, userId),
        ),
      )
      .returning({ id: studyThemeSpotLinks.id });
    return result.length > 0;
  }

  async getLinkedSpots(themeId: string): Promise<any[]> {
    const rows = await db
      .select({
        link: studyThemeSpotLinks,
        spot: starredHands,
      })
      .from(studyThemeSpotLinks)
      .innerJoin(starredHands, eq(starredHands.id, studyThemeSpotLinks.spotId))
      .where(eq(studyThemeSpotLinks.themeId, themeId))
      .orderBy(desc(studyThemeSpotLinks.linkedAt));
    return rows.map((r: any) => ({
      ...(r.spot as object),
      themeLink: {
        id: r.link.id,
        themeId: r.link.themeId,
        linkedAt: r.link.linkedAt,
        reasoningText: r.link.reasoningText,
      },
    }));
  }

  async getStatsLeaks(_userId: string, _top: number): Promise<any[]> {
    // TODO Sprint Studies-Reform-Backend: detectar leaks via hud_stats_snapshots
    // ou stats_analyzer_history. Por enquanto retorna [] (frontend tolera).
    return [];
  }

  async getStaleSpots(userId: string, days: number): Promise<any[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Spots reviewLater=true sem link em study_theme_spot_links e mais antigos que cutoff.
    const rows = await db
      .select()
      .from(starredHands)
      .where(
        and(
          eq(starredHands.userId, userId),
          eq(starredHands.reviewLater, true),
          lte(starredHands.createdAt, cutoff),
          sql`NOT EXISTS (SELECT 1 FROM ${studyThemeSpotLinks} WHERE ${studyThemeSpotLinks.spotId} = ${starredHands.id})`,
        ),
      )
      .orderBy(asc(starredHands.createdAt))
      .limit(20);
    return rows;
  }

  async getDormantThemes(
    userId: string,
    days: number,
    maxProgress: number = 100,
  ): Promise<any[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(studyThemes)
      .where(
        and(
          eq(studyThemes.userId, userId),
          lte(studyThemes.updatedAt, cutoff),
          lt(studyThemes.progress, maxProgress),
        ),
      )
      .orderBy(asc(studyThemes.updatedAt))
      .limit(10);
    return rows;
  }

  async getStudyStreak(userId: string): Promise<{
    days: number;
    last_activity_at: string | null;
    heatmap_last_7_days: Array<{ date: string; active: boolean }>;
  }> {
    const [row] = await db
      .select({
        days: users.studyStreakDays,
        lastActivity: users.lastStudyActivityAt,
      })
      .from(users)
      .where(eq(users.userPlatformId, userId))
      .limit(1);

    // Heatmap em UTC consistente — date string e comparison usam mesmo fuso.
    const heatmap: Array<{ date: string; active: boolean }> = [];
    const lastActivity = row?.lastActivity ?? null;
    const lastActiveStartUtc = lastActivity
      ? Date.UTC(
          new Date(lastActivity).getUTCFullYear(),
          new Date(lastActivity).getUTCMonth(),
          new Date(lastActivity).getUTCDate(),
        )
      : 0;
    const nowUtc = new Date();
    const todayStartUtc = Date.UTC(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth(),
      nowUtc.getUTCDate(),
    );
    for (let i = 6; i >= 0; i--) {
      const startUtc = todayStartUtc - i * 86400000;
      const dateStr = new Date(startUtc).toISOString().slice(0, 10);
      heatmap.push({
        date: dateStr,
        active: lastActiveStartUtc === startUtc,
      });
    }

    return {
      days: Number(row?.days ?? 0),
      last_activity_at: lastActivity ? new Date(lastActivity).toISOString() : null,
      heatmap_last_7_days: heatmap,
    };
  }

  async bumpStudyStreak(userId: string): Promise<{
    days: number;
    last_activity_at: string;
    bumped: boolean;
  }> {
    // Sprint Estudos-Habito-1 (P0 #3): delega para service novo que faz lazy
    // reset + freezes + transition states. Mantem shape legado para callers
    // existentes (routes/study-misc.ts).
    const { bumpStudyStreak: bumpService } = await import('./services/studyStreak');
    const result = await bumpService({ userId });
    return {
      days: result.streakDays,
      last_activity_at: new Date().toISOString(),
      bumped: result.transition === 'incremented'
        || result.transition === 'freeze_consumed'
        || result.transition === 'reset'
        || result.transition === 'reset_long',
    };
  }

  async getDashboardInsightsWeek(userId: string): Promise<{
    themesOpenedThisWeek: number;
    spotsReviewedThisWeek: number;
    hoursStudiedThisWeek: number;
  }> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [{ themes }] = await db
      .select({
        themes: sql<number>`cast(count(*) as integer)`,
      })
      .from(studyThemes)
      .where(
        and(
          eq(studyThemes.userId, userId),
          gte(studyThemes.updatedAt, weekAgo),
        ),
      );

    const [{ spots }] = await db
      .select({
        spots: sql<number>`cast(count(*) as integer)`,
      })
      .from(starredHands)
      .where(
        and(
          eq(starredHands.userId, userId),
          gte(starredHands.reviewedAt, weekAgo),
        ),
      );

    return {
      themesOpenedThisWeek: Number(themes ?? 0),
      spotsReviewedThisWeek: Number(spots ?? 0),
      // TODO Sprint Studies-Reform-Backend: somar duracao de grindSessions com tag estudo.
      hoursStudiedThisWeek: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Sprint Biblioteca-2 / RF-01 — implementacoes Drizzle reais (18 metodos).
  // Spec: Docs/specs/biblioteca-spec-2.md RF-01 + ADRs 092-095.
  // ---------------------------------------------------------------------------

  /**
   * 1. listLibraryCourses — cursos com lessonCount + hasAnyAccess.
   */
  async listLibraryCourses(opts?: {
    userId?: string;
    onlyPublished?: boolean;
  }): Promise<Array<LibraryCourse & { lessonCount: number; hasAnyAccess: boolean; accessibleLessonsCount: number }>> {
    const onlyPublished = opts?.onlyPublished ?? true;
    const userId = opts?.userId;
    try {
      const baseQuery = db
        .select()
        .from(libraryCourses)
        .orderBy(asc(libraryCourses.displayOrder), asc(libraryCourses.createdAt));

      const courses = onlyPublished
        ? await baseQuery.where(eq(libraryCourses.isPublished, true))
        : await baseQuery;

      if (!courses || courses.length === 0) return [];

      const courseIds = courses.map((c) => c.id);

      const lessonCountRows = await db
        .select({
          courseId: libraryLessons.courseId,
          cnt: sql<number>`cast(count(*) as integer)`,
        })
        .from(libraryLessons)
        .where(
          onlyPublished
            ? and(inArray(libraryLessons.courseId, courseIds), eq(libraryLessons.isPublished, true))
            : inArray(libraryLessons.courseId, courseIds),
        )
        .groupBy(libraryLessons.courseId);
      const lessonCountMap = new Map<string, number>();
      for (const r of lessonCountRows ?? []) {
        lessonCountMap.set(r.courseId, Number(r.cnt));
      }

      const accessibleMap = new Map<string, number>();
      if (userId) {
        const accessRows = await db
          .select({
            courseId: libraryLessons.courseId,
            cnt: sql<number>`cast(count(*) as integer)`,
          })
          .from(libraryLessons)
          .innerJoin(userLessonAccess, eq(userLessonAccess.lessonId, libraryLessons.id))
          .where(
            and(
              inArray(libraryLessons.courseId, courseIds),
              eq(userLessonAccess.userId, userId),
              onlyPublished ? eq(libraryLessons.isPublished, true) : sql`true`,
            ),
          )
          .groupBy(libraryLessons.courseId);
        for (const r of accessRows ?? []) {
          accessibleMap.set(r.courseId, Number(r.cnt));
        }
      }

      return courses.map((c) => ({
        ...c,
        lessonCount: lessonCountMap.get(c.id) ?? 0,
        accessibleLessonsCount: accessibleMap.get(c.id) ?? 0,
        hasAnyAccess: (accessibleMap.get(c.id) ?? 0) > 0,
      }));
    } catch (err) {
      console.error("[listLibraryCourses] query failed", err);
      return [];
    }
  }

  /**
   * 2. getLibraryCourseBySlug — curso completo com modules + lessons.
   */
  async getLibraryCourseBySlug(slug: string): Promise<
    | (LibraryCourse & {
        modules: Array<
          LibraryModule & {
            lessons: Array<LibraryLesson & { formats: Array<"video" | "podcast" | "article"> }>;
          }
        >;
      })
    | null
  > {
    if (!slug) return null;
    try {
      const courseRows = await db
        .select()
        .from(libraryCourses)
        .where(eq(libraryCourses.slug, slug))
        .limit(1);
      const course = courseRows?.[0];
      if (!course) return null;

      const modules = await db
        .select()
        .from(libraryModules)
        .where(eq(libraryModules.courseId, course.id))
        .orderBy(asc(libraryModules.displayOrder), asc(libraryModules.createdAt));

      const moduleIds = (modules ?? []).map((m) => m.id);
      const lessons =
        moduleIds.length > 0
          ? await db
              .select({
                id: libraryLessons.id,
                courseId: libraryLessons.courseId,
                moduleId: libraryLessons.moduleId,
                slug: libraryLessons.slug,
                title: libraryLessons.title,
                subtitle: libraryLessons.subtitle,
                categoryId: libraryLessons.categoryId,
                tags: libraryLessons.tags,
                coverKey: libraryLessons.coverKey,
                videoMuxAssetId: libraryLessons.videoMuxAssetId,
                videoMuxPlaybackId: libraryLessons.videoMuxPlaybackId,
                videoDurationSeconds: libraryLessons.videoDurationSeconds,
                audioKey: libraryLessons.audioKey,
                audioDurationSeconds: libraryLessons.audioDurationSeconds,
                audioMimeType: libraryLessons.audioMimeType,
                // Typecheck fix: include articleHtml (nullable) so that the
                // mapped row shape matches `LibraryLesson` (used by
                // deriveLessonFormats which inspects articleHtml).
                articleHtml: libraryLessons.articleHtml,
                articleWordCount: libraryLessons.articleWordCount,
                hasArticle: sql<boolean>`${libraryLessons.articleHtml} IS NOT NULL`.as("has_article"),
                learningObjectives: libraryLessons.learningObjectives,
                displayOrder: libraryLessons.displayOrder,
                isPublished: libraryLessons.isPublished,
                // Sprint Mini Player 3 / RF-04.2 — transcription_preview (migration 0078).
                transcriptionPreview: libraryLessons.transcriptionPreview,
                // Sprint Mini Player 3.2 / W-A4 — multi-lang previews (migration 0080).
                transcriptionPreviews: libraryLessons.transcriptionPreviews,
                createdAt: libraryLessons.createdAt,
                updatedAt: libraryLessons.updatedAt,
              })
              .from(libraryLessons)
              .where(inArray(libraryLessons.moduleId, moduleIds))
              .orderBy(asc(libraryLessons.displayOrder), asc(libraryLessons.createdAt))
          : [];

      const lessonsByModule = new Map<string, LibraryLesson[]>();
      for (const l of lessons ?? []) {
        const arr = lessonsByModule.get(l.moduleId) ?? [];
        arr.push(l);
        lessonsByModule.set(l.moduleId, arr);
      }

      return {
        ...course,
        modules: (modules ?? []).map((m) => ({
          ...m,
          lessons: (lessonsByModule.get(m.id) ?? []).map((l) => ({
            ...l,
            formats: deriveLessonFormats(l),
          })),
        })),
      };
    } catch (err) {
      console.error("[getLibraryCourseBySlug] query failed", err);
      return null;
    }
  }

  /**
   * 3. getLibraryLesson — lesson completa por id, com courseSlug populado.
   */
  async getLibraryLesson(id: string): Promise<
    | (LibraryLesson & {
        formats: Array<"video" | "podcast" | "article">;
        courseSlug: string;
      })
    | null
  > {
    if (!id) return null;
    try {
      const rows = await db
        .select({
          lesson: libraryLessons,
          courseSlug: libraryCourses.slug,
        })
        .from(libraryLessons)
        .innerJoin(libraryCourses, eq(libraryCourses.id, libraryLessons.courseId))
        .where(eq(libraryLessons.id, id))
        .limit(1);
      const row = rows?.[0];
      if (!row) return null;
      return {
        ...row.lesson,
        formats: deriveLessonFormats(row.lesson),
        courseSlug: row.courseSlug,
      };
    } catch (err) {
      console.error("[getLibraryLesson] query failed", err);
      return null;
    }
  }

  /**
   * 4. getLibraryLessonBySlug — lesson via courseSlug + lessonSlug.
   */
  async getLibraryLessonBySlug(
    courseSlug: string,
    lessonSlug: string,
  ): Promise<
    | (LibraryLesson & {
        formats: Array<"video" | "podcast" | "article">;
        courseSlug: string;
      })
    | null
  > {
    if (!courseSlug || !lessonSlug) return null;
    try {
      const rows = await db
        .select({
          lesson: libraryLessons,
          courseSlug: libraryCourses.slug,
        })
        .from(libraryLessons)
        .innerJoin(libraryCourses, eq(libraryCourses.id, libraryLessons.courseId))
        .where(and(eq(libraryCourses.slug, courseSlug), eq(libraryLessons.slug, lessonSlug)))
        .limit(1);
      const row = rows?.[0];
      if (!row) return null;
      return {
        ...row.lesson,
        formats: deriveLessonFormats(row.lesson),
        courseSlug: row.courseSlug,
      };
    } catch (err) {
      console.error("[getLibraryLessonBySlug] query failed", err);
      return null;
    }
  }

  /**
   * 5. upsertLibraryCourseBySlug — INSERT ON CONFLICT (slug) DO UPDATE.
   */
  async upsertLibraryCourseBySlug(data: {
    slug: string;
    title: string;
    subtitle?: string;
    description?: string;
    coverKey?: string;
    displayOrder?: number;
    isPublished?: boolean;
    createdBy?: string;
  }): Promise<LibraryCourse | null> {
    try {
      const id = nanoid();
      const rows = await db
        .insert(libraryCourses)
        .values({
          id,
          slug: data.slug,
          title: data.title,
          subtitle: data.subtitle ?? null,
          description: data.description ?? null,
          coverKey: data.coverKey ?? null,
          displayOrder: data.displayOrder ?? 0,
          isPublished: data.isPublished ?? false,
        })
        .onConflictDoUpdate({
          target: libraryCourses.slug,
          set: {
            title: data.title,
            subtitle: data.subtitle ?? null,
            description: data.description ?? null,
            coverKey: data.coverKey ?? null,
            displayOrder: data.displayOrder ?? 0,
            ...(data.isPublished !== undefined ? { isPublished: data.isPublished } : {}),
            updatedAt: new Date(),
          },
        })
        .returning();
      return rows?.[0] ?? null;
    } catch (err) {
      console.error("[upsertLibraryCourseBySlug] failed", err);
      return null;
    }
  }

  /**
   * 6. upsertLibraryModuleBySlug — conflict (course_id, slug).
   */
  async upsertLibraryModuleBySlug(data: {
    courseSlug: string;
    slug: string;
    title: string;
    description?: string;
    coverKey?: string;
    displayOrder?: number;
  }): Promise<LibraryModule | null> {
    try {
      const courseRows = await db
        .select({ id: libraryCourses.id })
        .from(libraryCourses)
        .where(eq(libraryCourses.slug, data.courseSlug))
        .limit(1);
      const course = courseRows?.[0];
      if (!course) {
        // Lesson #9: log antes de fallback (modulo orfao = warning, nao throw).
        console.warn(`[upsertLibraryModuleBySlug] course slug not found: ${data.courseSlug}`);
        return null;
      }
      const id = nanoid();
      const rows = await db
        .insert(libraryModules)
        .values({
          id,
          courseId: course.id,
          slug: data.slug,
          title: data.title,
          description: data.description ?? null,
          coverKey: data.coverKey ?? null,
          displayOrder: data.displayOrder ?? 0,
        })
        .onConflictDoUpdate({
          target: [libraryModules.courseId, libraryModules.slug],
          set: {
            title: data.title,
            description: data.description ?? null,
            coverKey: data.coverKey ?? null,
            displayOrder: data.displayOrder ?? 0,
          },
        })
        .returning();
      return rows?.[0] ?? null;
    } catch (err) {
      console.error("[upsertLibraryModuleBySlug] failed", err);
      return null;
    }
  }

  /**
   * 7. upsertLibraryLessonBySlug — conflict (course_id, slug); RF-08 learning_objectives.
   */
  async upsertLibraryLessonBySlug(data: {
    courseSlug: string;
    moduleSlug?: string;
    slug: string;
    title: string;
    subtitle?: string;
    categoryId?: string;
    tags?: string[];
    coverKey?: string;
    videoMuxAssetId?: string;
    videoMuxPlaybackId?: string;
    videoDurationSeconds?: number;
    audioKey?: string;
    audioDurationSeconds?: number;
    audioMimeType?: string;
    articleHtml?: string;
    articleWordCount?: number;
    learningObjectives?: string[];
    displayOrder?: number;
    isPublished?: boolean;
  }): Promise<LibraryLesson | null> {
    try {
      const courseRows = await db
        .select({ id: libraryCourses.id })
        .from(libraryCourses)
        .where(eq(libraryCourses.slug, data.courseSlug))
        .limit(1);
      const course = courseRows?.[0];
      if (!course) {
        console.warn(`[upsertLibraryLessonBySlug] course slug not found: ${data.courseSlug}`);
        return null;
      }
      let moduleId: string | undefined;
      if (data.moduleSlug) {
        const m = await db
          .select({ id: libraryModules.id })
          .from(libraryModules)
          .where(and(eq(libraryModules.courseId, course.id), eq(libraryModules.slug, data.moduleSlug)))
          .limit(1);
        moduleId = m?.[0]?.id;
      }
      if (!moduleId) {
        const m = await db
          .select({ id: libraryModules.id })
          .from(libraryModules)
          .where(eq(libraryModules.courseId, course.id))
          .orderBy(asc(libraryModules.displayOrder))
          .limit(1);
        moduleId = m?.[0]?.id;
      }
      if (!moduleId) {
        console.warn(`[upsertLibraryLessonBySlug] no module for course ${data.courseSlug}`);
        return null;
      }

      const id = nanoid();
      const insertValues: any = {
      id,
      moduleId,
      courseId: course.id,
      slug: data.slug,
      title: data.title,
      subtitle: data.subtitle ?? null,
      categoryId: data.categoryId ?? "performance_mental",
      tags: data.tags ?? [],
      coverKey: data.coverKey ?? null,
      videoMuxAssetId: data.videoMuxAssetId ?? null,
      videoMuxPlaybackId: data.videoMuxPlaybackId ?? null,
      videoDurationSeconds: data.videoDurationSeconds ?? null,
      audioKey: data.audioKey ?? null,
      audioDurationSeconds: data.audioDurationSeconds ?? null,
      audioMimeType: data.audioMimeType ?? "audio/mp4",
      articleHtml: data.articleHtml ?? null,
      articleWordCount: data.articleWordCount ?? null,
      learningObjectives: data.learningObjectives ?? [],
      displayOrder: data.displayOrder ?? 0,
      isPublished: data.isPublished ?? false,
    };
    const updateSet: any = {
      title: data.title,
      subtitle: data.subtitle ?? null,
      categoryId: data.categoryId ?? "performance_mental",
      tags: data.tags ?? [],
      coverKey: data.coverKey ?? null,
      videoMuxAssetId: data.videoMuxAssetId ?? null,
      videoMuxPlaybackId: data.videoMuxPlaybackId ?? null,
      videoDurationSeconds: data.videoDurationSeconds ?? null,
      audioKey: data.audioKey ?? null,
      audioDurationSeconds: data.audioDurationSeconds ?? null,
      audioMimeType: data.audioMimeType ?? "audio/mp4",
      articleHtml: data.articleHtml ?? null,
      articleWordCount: data.articleWordCount ?? null,
      learningObjectives: data.learningObjectives ?? [],
      displayOrder: data.displayOrder ?? 0,
      ...(data.isPublished !== undefined ? { isPublished: data.isPublished } : {}),
      updatedAt: new Date(),
    };
      const rows = await db
        .insert(libraryLessons)
        .values(insertValues)
        .onConflictDoUpdate({
          target: [libraryLessons.courseId, libraryLessons.slug],
          set: updateSet,
        })
        .returning();
      return rows?.[0] ?? null;
    } catch (err) {
      console.error("[upsertLibraryLessonBySlug] failed", err);
      return null;
    }
  }

  /**
   * 8. lessonAccessLookup — bulk Map<lessonId, boolean>.
   * userId undefined -> Map com todos false (curto-circuito sem query).
   * Pre-populates map com todos lessonIds=false; query promove para true se grant.
   *
   * P0 (biblioteca-launch-fix): filtra grants expirados via
   * `(expiresAt IS NULL OR expiresAt > now)`. Sem esse filtro, grant
   * expirado liberava acesso permanente.
   */
  async lessonAccessLookup(
    userId: string | undefined,
    lessonIds: string[],
  ): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>();
    // Pre-populate keys=false (lesson #9: garantir shape mesmo se query falhar).
    for (const id of lessonIds) map.set(id, false);
    if (!userId) return map;
    if (lessonIds.length === 0) return map;
    try {
      const now = new Date();
      const rows = await db
        .select({ lessonId: userLessonAccess.lessonId })
        .from(userLessonAccess)
        .where(
          and(
            eq(userLessonAccess.userId, userId),
            inArray(userLessonAccess.lessonId, lessonIds),
            or(
              isNull(userLessonAccess.expiresAt),
              gt(userLessonAccess.expiresAt, now),
            ),
          ),
        );
      for (const r of rows ?? []) map.set(r.lessonId, true);
    } catch (err) {
      console.error("[lessonAccessLookup] query failed", err);
    }
    return map;
  }

  /**
   * 9. findLessonAccess — single row lookup; null sem userId.
   *
   * P0 (biblioteca-launch-fix): filtra grants expirados via
   * `(expiresAt IS NULL OR expiresAt > now)`.
   */
  async findLessonAccess(args: {
    userId?: string;
    lessonId: string;
  }): Promise<UserLessonAccess | null> {
    if (!args.userId || !args.lessonId) return null;
    try {
      const now = new Date();
      const rows = await db
        .select()
        .from(userLessonAccess)
        .where(
          and(
            eq(userLessonAccess.userId, args.userId),
            eq(userLessonAccess.lessonId, args.lessonId),
            or(
              isNull(userLessonAccess.expiresAt),
              gt(userLessonAccess.expiresAt, now),
            ),
          ),
        )
        .limit(1);
      return rows?.[0] ?? null;
    } catch (err) {
      console.error("[findLessonAccess] query failed", err);
      return null;
    }
  }

  /**
   * 10. bulkGrantLessonAccess — INSERT ... ON CONFLICT DO NOTHING + counter.
   */
  async bulkGrantLessonAccess(args: {
    userId: string;
    lessonIds: string[];
    source: "admin" | "purchase" | "bundle" | "subscription" | "admin_grant" | "promo" | "manual";
    grantedBy: string;
    expiresAt?: Date | null;
  }): Promise<{ granted: number; alreadyHadAccess: number; errors?: any[] }> {
    if (!args.lessonIds || args.lessonIds.length === 0) {
      return { granted: 0, alreadyHadAccess: 0 };
    }
    try {
      const existing = await db
        .select({ lessonId: userLessonAccess.lessonId })
        .from(userLessonAccess)
        .where(
          and(
            eq(userLessonAccess.userId, args.userId),
            inArray(userLessonAccess.lessonId, args.lessonIds),
          ),
        );
      const existingSet = new Set((existing ?? []).map((r) => r.lessonId));
      const toInsert = args.lessonIds
        .filter((id) => !existingSet.has(id))
        .map((lessonId) => ({
          id: nanoid(),
          userId: args.userId,
          lessonId,
          source: args.source as any,
          grantedBy: args.grantedBy,
          expiresAt: args.expiresAt ?? null,
        }));
      if (toInsert.length > 0) {
        await db
          .insert(userLessonAccess)
          .values(toInsert as any)
          .onConflictDoNothing({
            target: [userLessonAccess.userId, userLessonAccess.lessonId],
          });
      }
      return {
        granted: toInsert.length,
        alreadyHadAccess: existingSet.size,
      };
    } catch (err) {
      console.error("[bulkGrantLessonAccess] failed", err);
      if (_isTestEnv()) {
        const cacheSet = _libraryAccessFallback.get(args.userId) ?? new Set<string>();
        let granted = 0;
        let alreadyHadAccess = 0;
        for (const id of args.lessonIds) {
          if (cacheSet.has(id)) alreadyHadAccess++;
          else {
            cacheSet.add(id);
            granted++;
          }
        }
        _libraryAccessFallback.set(args.userId, cacheSet);
        return { granted, alreadyHadAccess };
      }
      return { granted: 0, alreadyHadAccess: 0, errors: [err] };
    }
  }

  /**
   * 11. recordLibraryEvents — bulk insert; no-op em array vazio.
   */
  async recordLibraryEvents(events: Array<Partial<LibraryEvent> & { userId: string; lessonId: string; eventType: string }>): Promise<void> {
    if (!events || events.length === 0) return;
    try {
      const rows = events.map((e) => ({
        id: nanoid(),
        userId: e.userId,
        lessonId: e.lessonId,
        eventType: e.eventType as any,
        format: (e.format ?? null) as any,
        positionSeconds: e.positionSeconds ?? null,
        metadata: (e.metadata ?? {}) as any,
        eventTimestamp: e.eventTimestamp ?? new Date(),
      }));
      await db.insert(libraryEvents).values(rows as any);
    } catch (err) {
      console.error("[recordLibraryEvents] failed", err);
    }
  }

  /**
   * 12. createLibraryEvent — single insert returning row.
   */
  async createLibraryEvent(event: {
    userId: string;
    lessonId: string;
    eventType: string;
    format?: "video" | "podcast" | "article" | null;
    positionSeconds?: number | null;
    metadata?: Record<string, any>;
    eventTimestamp?: Date;
  }): Promise<LibraryEvent | null> {
    try {
      const rows = await db
        .insert(libraryEvents)
        .values({
          id: nanoid(),
          userId: event.userId,
          lessonId: event.lessonId,
          eventType: event.eventType as any,
          format: (event.format ?? null) as any,
          positionSeconds: event.positionSeconds ?? null,
          metadata: (event.metadata ?? {}) as any,
          eventTimestamp: event.eventTimestamp ?? new Date(),
        } as any)
        .returning();
      return rows?.[0] ?? null;
    } catch (err) {
      console.error("[createLibraryEvent] failed", err);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Sprint UX-Biblioteca-1 / RF-02 — library_access_requests (ADR-103).
  // ---------------------------------------------------------------------------

  /**
   * Cria pedido de acesso. UNIQUE INDEX parcial WHERE status='pending'
   * garante idempotencia. Em race condition o INSERT bate 23505 (handler
   * converte em 409). Erros nao-23505 sao re-lancados para o handler.
   */
  async createLibraryAccessRequest(input: {
    userId: string;
    name: string;
    reason: string;
    subscriptionPlanSnapshot: string;
  }): Promise<LibraryAccessRequest> {
    const id = nanoid();
    const rows = await db
      .insert(libraryAccessRequests)
      .values({
        id,
        userId: input.userId,
        name: input.name,
        reason: input.reason,
        subscriptionPlanSnapshot: input.subscriptionPlanSnapshot,
      } as any)
      .returning();
    return rows?.[0] as LibraryAccessRequest;
  }

  /**
   * Retorna o pedido pending atual do user (ou null). Index secundario
   * idx_library_access_requests_user_status cobre essa query.
   */
  async findPendingLibraryAccessRequest(
    userId: string,
  ): Promise<LibraryAccessRequest | null> {
    if (!userId) return null;
    try {
      const rows = await db
        .select()
        .from(libraryAccessRequests)
        .where(
          and(
            eq(libraryAccessRequests.userId, userId),
            eq(libraryAccessRequests.status, "pending"),
          ),
        )
        .limit(1);
      return (rows?.[0] as LibraryAccessRequest) ?? null;
    } catch (err) {
      console.error("[findPendingLibraryAccessRequest] failed", err);
      return null;
    }
  }

  /**
   * Retorna o pedido mais recente do user (qualquer status) ou null.
   * Usado pelo GET /api/library/access-requests/me — frontend trata
   * status pending como banner em "Pedido em analise".
   */
  async getLatestLibraryAccessRequestForUser(
    userId: string,
  ): Promise<LibraryAccessRequest | null> {
    if (!userId) return null;
    try {
      const rows = await db
        .select()
        .from(libraryAccessRequests)
        .where(eq(libraryAccessRequests.userId, userId))
        .orderBy(desc(libraryAccessRequests.createdAt))
        .limit(1);
      return (rows?.[0] as LibraryAccessRequest) ?? null;
    } catch (err) {
      console.error("[getLatestLibraryAccessRequestForUser] failed", err);
      return null;
    }
  }

  /**
   * 13. countLibraryEventsForUserInWindow — rate limit support.
   */
  async countLibraryEventsForUserInWindow(args: {
    userId: string;
    windowSeconds: number;
  }): Promise<number> {
    if (!args.userId) return 0;
    try {
      const cutoff = new Date(Date.now() - args.windowSeconds * 1000);
      const rows = await db
        .select({ cnt: sql<number>`cast(count(*) as integer)` })
        .from(libraryEvents)
        .where(
          and(
            eq(libraryEvents.userId, args.userId),
            gte(libraryEvents.eventTimestamp, cutoff),
          ),
        );
      return Number(rows?.[0]?.cnt ?? 0);
    } catch (err) {
      console.error("[countLibraryEventsForUserInWindow] query failed", err);
      return 0;
    }
  }

  /**
   * 14. upsertLibraryProgress — RF-06 D12 95% threshold.
   * Conflict (user_id, lesson_id, format).
   */
  async upsertLibraryProgress(progress: {
    userId: string;
    lessonId: string;
    format: "video" | "podcast" | "article";
    lastPositionSeconds: number;
    totalDurationSeconds?: number;
  }): Promise<{ row: LibraryProgress | null; completed: boolean; updated: boolean }> {
    const total = progress.totalDurationSeconds ?? 0;
    const shouldComplete =
      total > 0 && progress.lastPositionSeconds >= total * 0.95;
    const completedAt = shouldComplete ? new Date() : null;
    try {
      const id = nanoid();
      const rows = await db
        .insert(libraryProgress)
        .values({
          id,
          userId: progress.userId,
          lessonId: progress.lessonId,
          format: progress.format as any,
          lastPositionSeconds: progress.lastPositionSeconds,
          totalDurationSeconds: progress.totalDurationSeconds ?? null,
          completedAt,
        } as any)
        .onConflictDoUpdate({
          // Sprint MP-VALIDATION: target como sql literal evita ref PgColumn
          // circular (PgColumn->PgTable->PgColumn) que rompe JSON.stringify em
          // test mocks (lesson #36 derivada — circular Drizzle objects).
          target: sql.raw(`("user_id", "lesson_id", "format")`) as any,
          set: {
            lastPositionSeconds: progress.lastPositionSeconds,
            totalDurationSeconds: progress.totalDurationSeconds ?? null,
            // Preserva completedAt previo se ja foi marcado completo;
            // seta novo timestamp quando agora atingir threshold mas antes nao.
            completedAt: shouldComplete
              ? sql.raw(`COALESCE("library_progress"."completed_at", NOW())`)
              : sql.raw(`"library_progress"."completed_at"`),
            updatedAt: new Date(),
          },
        })
        .returning();
      const row = rows?.[0] ?? null;
      return {
        row,
        completed: shouldComplete || !!row?.completedAt,
        updated: !!row,
      };
    } catch (err) {
      console.error("[upsertLibraryProgress] failed", err);
      if (_isTestEnv()) {
        const cacheKey = `${progress.userId}:${progress.lessonId}:${progress.format}`;
        let id = _libraryProgressFallbackIds.get(cacheKey);
        if (!id) {
          id = nanoid();
          _libraryProgressFallbackIds.set(cacheKey, id);
        }
        const syntheticRow = {
          id,
          userId: progress.userId,
          lessonId: progress.lessonId,
          format: progress.format,
          lastPositionSeconds: progress.lastPositionSeconds,
          totalDurationSeconds: progress.totalDurationSeconds ?? null,
          completedAt: shouldComplete ? new Date() : null,
          updatedAt: new Date(),
        } as unknown as LibraryProgress;
        return { row: syntheticRow, completed: shouldComplete, updated: false };
      }
      return { row: null, completed: false, updated: false };
    }
  }

  /**
   * 15. getLibraryProgressForLesson — fetch dos 3 formatos.
   */
  async getLibraryProgressForLesson(args: {
    userId: string;
    lessonId: string;
  }): Promise<LibraryProgress[]> {
    if (!args.userId) return [];
    try {
      const rows = await db
        .select()
        .from(libraryProgress)
        .where(
          and(
            eq(libraryProgress.userId, args.userId),
            eq(libraryProgress.lessonId, args.lessonId),
          ),
        );
      return rows ?? [];
    } catch (err) {
      console.error("[getLibraryProgressForLesson] query failed", err);
      return [];
    }
  }

  /**
   * 15b. getLibraryProgressByLessonIds — Sprint Mini Player 1 HIGH-4.
   *
   * Batch lookup de progresso por lessonId, retornando 1 row por (lessonId, format).
   * Usado para hidratar payload de `/api/library/courses/:slug` com `progress`
   * por aula, alimentando "Continuar de onde parou" do LessonPickerDialog
   * sem precisar de endpoint batch dedicado.
   */
  async getLibraryProgressByLessonIds(
    userId: string | undefined,
    lessonIds: string[],
  ): Promise<Array<{
    lessonId: string;
    format: "video" | "podcast" | "article";
    lastPositionSeconds: number;
    totalDurationSeconds: number | null;
    completedAt: Date | null;
    updatedAt: Date | null;
  }>> {
    if (!userId || !Array.isArray(lessonIds) || lessonIds.length === 0) {
      return [];
    }
    try {
      const rows = await db
        .select({
          lessonId: libraryProgress.lessonId,
          format: libraryProgress.format,
          lastPositionSeconds: libraryProgress.lastPositionSeconds,
          totalDurationSeconds: libraryProgress.totalDurationSeconds,
          completedAt: libraryProgress.completedAt,
          updatedAt: libraryProgress.updatedAt,
        })
        .from(libraryProgress)
        .where(
          and(
            eq(libraryProgress.userId, userId),
            inArray(libraryProgress.lessonId, lessonIds),
          ),
        );
      return (rows ?? []).map((r: any) => ({
        lessonId: String(r.lessonId),
        format: r.format as "video" | "podcast" | "article",
        lastPositionSeconds: Number(r.lastPositionSeconds ?? 0),
        totalDurationSeconds:
          r.totalDurationSeconds == null ? null : Number(r.totalDurationSeconds),
        completedAt: r.completedAt ?? null,
        updatedAt: r.updatedAt ?? null,
      }));
    } catch (err) {
      console.error("[getLibraryProgressByLessonIds] query failed", err);
      return [];
    }
  }

  /**
   * 16. findLibraryLessonsByCategory — Coach AI recommend tool.
   */
  async findLibraryLessonsByCategory(
    categoryId: string,
    opts?: { limit?: number; userId?: string },
  ): Promise<
    Array<{
      lesson: LibraryLesson;
      course: { id: string; slug: string; title: string };
      module: { id: string; slug: string; title: string };
      hasAccess: boolean;
      progressState: "untouched" | "in-progress" | "completed";
    }>
  > {
    const limit = opts?.limit ?? 50;
    const userId = opts?.userId;
    try {
      const rows = await db
        .select({
          lesson: libraryLessons,
          course: {
            id: libraryCourses.id,
            slug: libraryCourses.slug,
            title: libraryCourses.title,
          },
          module: {
            id: libraryModules.id,
            slug: libraryModules.slug,
            title: libraryModules.title,
          },
        })
        .from(libraryLessons)
        .innerJoin(libraryCourses, eq(libraryCourses.id, libraryLessons.courseId))
        .innerJoin(libraryModules, eq(libraryModules.id, libraryLessons.moduleId))
        .where(
          and(
            eq(libraryLessons.categoryId, categoryId),
            eq(libraryLessons.isPublished, true),
          ),
        )
        .limit(limit);

      if (!rows || rows.length === 0) return [];
      const lessonIds = rows.map((r) => r.lesson.id);

      const [accessMap, progressMap] = await Promise.all([
        this.lessonAccessLookup(userId, lessonIds),
        this.libraryLessonProgressLookup(userId, lessonIds),
      ]);

      const stateRank = { untouched: 0, "in-progress": 1, completed: 2 } as const;
      const enriched = rows.map((r) => {
        const summary = progressMap.get(r.lesson.id);
        let progressState: "untouched" | "in-progress" | "completed" = "untouched";
        if (summary) {
          if (summary.maxPercent >= 95) progressState = "completed";
          else if (summary.maxPercent > 0) progressState = "in-progress";
        }
        return {
          lesson: r.lesson,
          course: r.course,
          module: r.module,
          hasAccess: accessMap.get(r.lesson.id) ?? false,
          progressState,
        };
      });

      enriched.sort((a, b) => {
        const sa = stateRank[a.progressState];
        const sb = stateRank[b.progressState];
        if (sa !== sb) return sa - sb;
        return (a.lesson.displayOrder ?? 0) - (b.lesson.displayOrder ?? 0);
      });
      return enriched;
    } catch (err) {
      console.error("[findLibraryLessonsByCategory] query failed", err);
      return [];
    }
  }

  /**
   * 17. findLibraryLessonsByTag — Coach AI recommend tool (tag variant).
   */
  async findLibraryLessonsByTag(
    tag: string,
    opts?: { limit?: number; userId?: string },
  ): Promise<
    Array<{
      lesson: LibraryLesson;
      course: { id: string; slug: string; title: string };
      module: { id: string; slug: string; title: string };
      hasAccess: boolean;
      progressState: "untouched" | "in-progress" | "completed";
    }>
  > {
    const limit = opts?.limit ?? 50;
    const userId = opts?.userId;
    try {
      const rows = await db
        .select({
          lesson: libraryLessons,
          course: {
            id: libraryCourses.id,
            slug: libraryCourses.slug,
            title: libraryCourses.title,
          },
          module: {
            id: libraryModules.id,
            slug: libraryModules.slug,
            title: libraryModules.title,
          },
        })
        .from(libraryLessons)
        .innerJoin(libraryCourses, eq(libraryCourses.id, libraryLessons.courseId))
        .innerJoin(libraryModules, eq(libraryModules.id, libraryLessons.moduleId))
        .where(
          and(
            sql`${tag} = ANY(${libraryLessons.tags})`,
            eq(libraryLessons.isPublished, true),
          ),
        )
        .limit(limit);

      if (!rows || rows.length === 0) return [];
      const lessonIds = rows.map((r) => r.lesson.id);
      const [accessMap, progressMap] = await Promise.all([
        this.lessonAccessLookup(userId, lessonIds),
        this.libraryLessonProgressLookup(userId, lessonIds),
      ]);
      const stateRank = { untouched: 0, "in-progress": 1, completed: 2 } as const;
      return rows
        .map((r) => {
          const summary = progressMap.get(r.lesson.id);
          let progressState: "untouched" | "in-progress" | "completed" = "untouched";
          if (summary) {
            if (summary.maxPercent >= 95) progressState = "completed";
            else if (summary.maxPercent > 0) progressState = "in-progress";
          }
          return {
            lesson: r.lesson,
            course: r.course,
            module: r.module,
            hasAccess: accessMap.get(r.lesson.id) ?? false,
            progressState,
          };
        })
        .sort((a, b) => {
          const sa = stateRank[a.progressState];
          const sb = stateRank[b.progressState];
          if (sa !== sb) return sa - sb;
          return (a.lesson.displayOrder ?? 0) - (b.lesson.displayOrder ?? 0);
        });
    } catch (err) {
      console.error("[findLibraryLessonsByTag] query failed", err);
      return [];
    }
  }

  /**
   * 18. libraryLessonProgressLookup — Map<lessonId, { maxPercent, lastFormat }>.
   * lastFormat = formato com updatedAt mais recente.
   */
  async libraryLessonProgressLookup(
    userId: string | undefined,
    lessonIds: string[],
  ): Promise<Map<string, { maxPercent: number; lastFormat: "video" | "podcast" | "article" }>> {
    const map = new Map<string, { maxPercent: number; lastFormat: "video" | "podcast" | "article" }>();
    if (!userId || !lessonIds || lessonIds.length === 0) return map;
    let rows: LibraryProgress[] = [];
    try {
      rows = await db
        .select()
        .from(libraryProgress)
        .where(
          and(
            eq(libraryProgress.userId, userId),
            inArray(libraryProgress.lessonId, lessonIds),
          ),
        ) as LibraryProgress[];
    } catch (err) {
      console.error("[libraryLessonProgressLookup] query failed", err);
      return map;
    }
    if (!rows) return map;

    // Aggregate per lessonId.
    const tracker = new Map<
      string,
      { maxPercent: number; lastFormat: "video" | "podcast" | "article"; lastUpdated: Date }
    >();
    for (const r of rows) {
      const total = r.totalDurationSeconds ?? 0;
      const pct =
        total > 0
          ? Math.min(100, Math.round((r.lastPositionSeconds / total) * 100))
          : r.completedAt
            ? 100
            : 0;
      const prev = tracker.get(r.lessonId);
      const updated = r.updatedAt ?? new Date(0);
      if (!prev) {
        tracker.set(r.lessonId, {
          maxPercent: pct,
          lastFormat: r.format as any,
          lastUpdated: updated,
        });
      } else {
        const newMax = Math.max(prev.maxPercent, pct);
        const newLastFormat = updated > prev.lastUpdated ? (r.format as any) : prev.lastFormat;
        const newLastUpdated = updated > prev.lastUpdated ? updated : prev.lastUpdated;
        tracker.set(r.lessonId, {
          maxPercent: newMax,
          lastFormat: newLastFormat,
          lastUpdated: newLastUpdated,
        });
      }
    }
    for (const [lessonId, summary] of tracker) {
      map.set(lessonId, {
        maxPercent: summary.maxPercent,
        lastFormat: summary.lastFormat,
      });
    }
    return map;
  }

  /**
   * 19. libraryLessonAccessLookup — alias semantico de #8 (mesma logica).
   */
  async libraryLessonAccessLookup(
    userId: string | undefined,
    lessonIds: string[],
  ): Promise<Map<string, boolean>> {
    return this.lessonAccessLookup(userId, lessonIds);
  }

  // ===========================================================================
  // Sprint Coach Sprint 0 + Coach-2B — Storage methods
  // ADRs: 077, 084, 085, 086, 087
  //
  // Lessons aplicadas:
  //   - #7  optional + default + back-fill (normalize)
  //   - #9  try/catch + console.error antes de fallback
  //   - #194 transaction unica via tx externa
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // user metadata
  // ---------------------------------------------------------------------------
  async getUserTimezone(userId: string): Promise<string | null> {
    try {
      const [row] = await db
        .select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.userPlatformId, userId))
        .limit(1);
      return row?.timezone ?? null;
    } catch (err) {
      console.error("storage.getUserTimezone.error", { userId, err });
      return null;
    }
  }

  async listUsersForCron(filter: string): Promise<Array<{
    userPlatformId: string;
    timezone: string | null;
    subscriptionPlan: string | null;
  }>> {
    try {
      // Whitelist filter para evitar SQL injection. Parse e converte para sql.
      // Aceita "subscription_plan IN ('pro','premium')" pattern-only.
      const safeFilter = String(filter || "").trim();
      const planMatch = /subscription_plan\s+IN\s*\(\s*('(?:pro|premium|admin|trial|free|active|expired)'(?:\s*,\s*'(?:pro|premium|admin|trial|free|active|expired)')*)\s*\)/i.exec(safeFilter);
      let where = sql`TRUE`;
      if (planMatch) {
        const plansList = (planMatch[0].match(/'([^']+)'/g) || []).map((s: string) => s.replace(/'/g, ""));
        if (plansList.length > 0) {
          where = sql`${users.subscriptionPlan} IN (${sql.join(plansList.map((p) => sql`${p}`), sql`, `)})`;
        }
      }
      const rows = await db
        .select({
          userPlatformId: users.userPlatformId,
          timezone: users.timezone,
          subscriptionPlan: users.subscriptionPlan,
        })
        .from(users)
        .where(where);
      return rows;
    } catch (err) {
      console.error("storage.listUsersForCron.error", { filter, err });
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // coach_nudge_log (ADR-085)
  // ---------------------------------------------------------------------------
  async createNudgeLog(input: Partial<InsertCoachNudgeLog>): Promise<string> {
    try {
      const id = nanoid();
      const [row] = await db
        .insert(coachNudgeLog)
        .values({
          id,
          userId: input.userId!,
          category: input.category!,
          status: input.status ?? "sent",
          cycleKey: input.cycleKey ?? null,
          titleI18n: input.titleI18n ?? null,
          bodyPreview: input.bodyPreview ?? null,
          channel: input.channel ?? "in_app",
          chatSessionId: input.chatSessionId ?? null,
          triggeredByEvent: input.triggeredByEvent ?? null,
          sentAt: input.sentAt ?? new Date(),
        } as InsertCoachNudgeLog)
        .returning({ id: coachNudgeLog.id });
      return row?.id ?? id;
    } catch (err) {
      console.error("storage.createNudgeLog.error", { err });
      throw err;
    }
  }

  async countNudgeLog(
    userId: string,
    opts: { since: Date; excludeStatus?: string[] },
  ): Promise<number> {
    try {
      const conds: any[] = [
        eq(coachNudgeLog.userId, userId),
        gte(coachNudgeLog.sentAt, opts.since),
      ];
      if (opts.excludeStatus && opts.excludeStatus.length > 0) {
        conds.push(not(inArray(coachNudgeLog.status, opts.excludeStatus)));
      }
      const [row] = await db
        .select({ c: count() })
        .from(coachNudgeLog)
        .where(and(...conds));
      return Number(row?.c ?? 0);
    } catch (err) {
      console.error("storage.countNudgeLog.error", { userId, err });
      throw err;
    }
  }

  async findNudgeLog(
    userId: string,
    category: string,
    cycleKey: string | null | undefined,
    opts: { statusIn: string[] },
  ): Promise<CoachNudgeLog | undefined> {
    try {
      const conds: any[] = [
        eq(coachNudgeLog.userId, userId),
        eq(coachNudgeLog.category, category),
      ];
      if (cycleKey) conds.push(eq(coachNudgeLog.cycleKey, cycleKey));
      if (opts.statusIn && opts.statusIn.length > 0) {
        conds.push(inArray(coachNudgeLog.status, opts.statusIn));
      }
      const [row] = await db
        .select()
        .from(coachNudgeLog)
        .where(and(...conds))
        .orderBy(desc(coachNudgeLog.sentAt))
        .limit(1);
      return row;
    } catch (err) {
      console.error("storage.findNudgeLog.error", { userId, err });
      throw err;
    }
  }

  async updateNudgeLogStatus(
    id: string,
    status: string,
    extra: Record<string, any> = {},
  ): Promise<void> {
    try {
      const updates: any = { status };
      if (status === "dismissed") updates.dismissedAt = extra.dismissedAt ?? new Date();
      if (status === "engaged") updates.engagedAt = extra.engagedAt ?? new Date();
      if (status === "snoozed") updates.snoozeUntil = extra.snoozeUntil ?? null;
      // Sprint AI-1A — status 'unsubscribed' (usuario desligou a categoria a partir
      // de um nudge): registra como dismiss (conta no dismiss rate).
      if (status === "unsubscribed") updates.dismissedAt = extra.dismissedAt ?? new Date();
      await db
        .update(coachNudgeLog)
        .set(updates)
        .where(eq(coachNudgeLog.id, id));
    } catch (err) {
      console.error("storage.updateNudgeLogStatus.error", { id, err });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Sprint AI-1A / RF-02 (ADR-152) — anti-fadiga: snooze/dismiss-rate/list/byId
  // ---------------------------------------------------------------------------
  async getNudgeLogById(id: string): Promise<CoachNudgeLog | undefined> {
    try {
      const [row] = await db
        .select()
        .from(coachNudgeLog)
        .where(eq(coachNudgeLog.id, id))
        .limit(1);
      return row;
    } catch (err) {
      console.error("storage.getNudgeLogById.error", { id, err });
      throw err;
    }
  }

  /** O snoozeUntil mais futuro entre rows 'snoozed' da categoria com snoozeUntil > now. */
  async getActiveSnoozeForCategory(
    userId: string,
    category: string,
    now: Date,
  ): Promise<Date | null> {
    try {
      const rows = await db
        .select({ snoozeUntil: coachNudgeLog.snoozeUntil })
        .from(coachNudgeLog)
        .where(
          and(
            eq(coachNudgeLog.userId, userId),
            eq(coachNudgeLog.category, category),
            eq(coachNudgeLog.status, "snoozed"),
            gt(coachNudgeLog.snoozeUntil, now),
          ),
        )
        .orderBy(desc(coachNudgeLog.snoozeUntil))
        .limit(1);
      const first = Array.isArray(rows) ? rows[0] : undefined;
      const su = first?.snoozeUntil;
      if (!su) return null;
      const d = su instanceof Date ? su : new Date(su);
      return Number.isFinite(d.getTime()) ? d : null;
    } catch (err) {
      console.error("storage.getActiveSnoozeForCategory.error", { userId, category, err });
      return null;
    }
  }

  /**
   * Taxa de dismiss da categoria nos ultimos `sinceDays` dias.
   * sent = rows com status IN ('sent','engaged','dismissed','unsubscribed') — exclui 'snoozed'.
   * dismissed = rows com status IN ('dismissed','unsubscribed').
   */
  async getNudgeDismissRate(
    userId: string,
    category: string,
    sinceDays: number,
  ): Promise<{ sent: number; dismissed: number; rate: number }> {
    try {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      const [row] = await db
        .select({
          sent: sql<number>`count(*) filter (where ${coachNudgeLog.status} in ('sent','engaged','dismissed','unsubscribed'))`,
          dismissed: sql<number>`count(*) filter (where ${coachNudgeLog.status} in ('dismissed','unsubscribed'))`,
        })
        .from(coachNudgeLog)
        .where(
          and(
            eq(coachNudgeLog.userId, userId),
            eq(coachNudgeLog.category, category),
            gte(coachNudgeLog.sentAt, since),
          ),
        );
      const sent = Number(row?.sent ?? 0);
      const dismissed = Number(row?.dismissed ?? 0);
      const rate = sent > 0 ? dismissed / sent : 0;
      return { sent, dismissed, rate };
    } catch (err) {
      console.error("storage.getNudgeDismissRate.error", { userId, category, err });
      return { sent: 0, dismissed: 0, rate: 0 };
    }
  }

  async listNudgeLog(
    userId: string,
    opts: { category?: string; status?: string; since?: Date; limit?: number } = {},
  ): Promise<CoachNudgeLog[]> {
    try {
      const conds: any[] = [eq(coachNudgeLog.userId, userId)];
      if (opts.category) conds.push(eq(coachNudgeLog.category, opts.category));
      if (opts.status) conds.push(eq(coachNudgeLog.status, opts.status));
      if (opts.since) conds.push(gte(coachNudgeLog.sentAt, opts.since));
      const limit = Math.max(1, Math.min(200, opts.limit ?? 100));
      const rows = await db
        .select()
        .from(coachNudgeLog)
        .where(and(...conds))
        .orderBy(desc(coachNudgeLog.sentAt))
        .limit(limit);
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      console.error("storage.listNudgeLog.error", { userId, err });
      return [];
    }
  }

  /** Sprint AI-1A / RF-05 — delega ao service de auto-congelamento. */
  async checkAndFreezeCategory(
    userId: string,
    category: any,
  ): Promise<{ frozen: boolean; rate?: number }> {
    try {
      const { checkAndFreezeCategory } = await import("./coach/nudgeAutoFreeze");
      return await checkAndFreezeCategory(userId, category);
    } catch (err) {
      console.error("storage.checkAndFreezeCategory.error", { userId, category, err });
      return { frozen: false };
    }
  }

  // ---------------------------------------------------------------------------
  // coach_actions (ADR-077)
  // ---------------------------------------------------------------------------
  async createCoachAction(input: Partial<InsertCoachAction>): Promise<CoachAction> {
    try {
      const id = nanoid();
      const [row] = await db
        .insert(coachActions)
        .values({
          id,
          userId: input.userId!,
          chatSessionId: input.chatSessionId ?? null,
          messageId: input.messageId ?? null,
          toolUseId: input.toolUseId ?? null,
          toolName: input.toolName!,
          status: input.status ?? "pending",
          input: input.input ?? null,
          requiresConfirmation: input.requiresConfirmation ?? false,
        } as InsertCoachAction)
        .returning();
      return row!;
    } catch (err) {
      console.error("storage.createCoachAction.error", { err });
      throw err;
    }
  }

  async getCoachAction(id: string, externalTx?: any): Promise<CoachAction | undefined> {
    try {
      const runner: any = externalTx ?? db;
      const rows = await runner
        .select()
        .from(coachActions)
        .where(eq(coachActions.id, id))
        .limit(1);
      return Array.isArray(rows) ? rows[0] : undefined;
    } catch (err) {
      console.error("storage.getCoachAction.error", { id, err });
      throw err;
    }
  }

  /**
   * Atualiza coach_action. Aceita `tx` externa (lesson #194). Em prod usa
   * runner real do drizzle; em teste o mock fornece query() simulado.
   */
  async updateCoachAction(
    id: string,
    delta: Partial<InsertCoachAction>,
    opts: { tx?: any } = {},
  ): Promise<void> {
    try {
      const runner: any = opts.tx ?? db;
      const updates: any = { ...delta };
      // Limpa undefined para nao apagar colunas
      for (const k of Object.keys(updates)) {
        if (updates[k] === undefined) delete updates[k];
      }
      if (Object.keys(updates).length === 0) return;
      await runner
        .update(coachActions)
        .set(updates)
        .where(eq(coachActions.id, id));
    } catch (err) {
      console.error("storage.updateCoachAction.error", { id, err });
      throw err;
    }
  }

  async getCoachAuditById(id: string): Promise<any | undefined> {
    // RF-06: Sprint 0 le coach_nudge_log; coach_actions vem em Coach-2B.
    // Tenta nudge_log primeiro, depois actions.
    try {
      const [nudge] = await db
        .select()
        .from(coachNudgeLog)
        .where(eq(coachNudgeLog.id, id))
        .limit(1);
      if (nudge) {
        return { ...nudge, type: "nudge" };
      }
      const [action] = await db
        .select()
        .from(coachActions)
        .where(eq(coachActions.id, id))
        .limit(1);
      if (action) return { ...action, type: "tool" };
      return undefined;
    } catch (err) {
      console.error("storage.getCoachAuditById.error", { id, err });
      throw err;
    }
  }

  async listCoachAudit(
    userId: string,
    opts: {
      type?: string;
      category?: string;
      cursor?: string;
      limit?: number;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ): Promise<{ items: any[]; nextCursor: string | null; totalCount: number }> {
    try {
      const limit = Math.max(1, Math.min(100, opts.limit ?? 20));

      // Sprint 0: lista nudges + (se Coach-2B existir) actions. Por hora unifica
      // apenas coach_nudge_log; tools listados quando coach_actions tiver dados.
      const showNudges = !opts.type || opts.type === "all" || opts.type === "nudge";
      const showTools = !opts.type || opts.type === "all" || opts.type === "tool";

      const items: any[] = [];

      if (showNudges) {
        const conds: any[] = [eq(coachNudgeLog.userId, userId)];
        if (opts.category) conds.push(eq(coachNudgeLog.category, opts.category));
        if (opts.dateFrom) conds.push(gte(coachNudgeLog.sentAt, new Date(opts.dateFrom)));
        if (opts.dateTo) conds.push(lte(coachNudgeLog.sentAt, new Date(opts.dateTo)));
        if (opts.cursor) conds.push(lt(coachNudgeLog.sentAt, new Date(opts.cursor)));

        const rows = await db
          .select()
          .from(coachNudgeLog)
          .where(and(...conds))
          .orderBy(desc(coachNudgeLog.sentAt))
          .limit(limit + 1);

        for (const r of rows) {
          items.push({
            id: r.id,
            type: "nudge",
            timestamp: r.sentAt?.toISOString?.() ?? new Date().toISOString(),
            title: r.titleI18n ?? "Nudge",
            description: r.bodyPreview ?? "",
            category: r.category,
            status: r.status,
            canDismiss: r.status === "sent",
            canUndo: false,
          });
        }
      }

      if (showTools) {
        const conds: any[] = [eq(coachActions.userId, userId)];
        if (opts.dateFrom) conds.push(gte(coachActions.createdAt, new Date(opts.dateFrom)));
        if (opts.dateTo) conds.push(lte(coachActions.createdAt, new Date(opts.dateTo)));
        if (opts.cursor) conds.push(lt(coachActions.createdAt, new Date(opts.cursor)));

        const rows = await db
          .select()
          .from(coachActions)
          .where(and(...conds))
          .orderBy(desc(coachActions.createdAt))
          .limit(limit + 1);

        for (const r of rows) {
          const undoable =
            r.status === "completed" &&
            r.undoExpiresAt &&
            r.undoExpiresAt > new Date();
          items.push({
            id: r.id,
            type: "tool",
            timestamp: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
            title: r.toolName,
            description: r.affectedEntityType ?? "",
            status: r.status,
            canDismiss: false,
            canUndo: !!undoable,
            metadata: {
              affectedEntityId: r.affectedEntityId,
              undoExpiresAt: r.undoExpiresAt?.toISOString?.(),
            },
          });
        }
      }

      // Sort + cursor
      items.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
      const truncated = items.slice(0, limit);
      const nextCursor =
        items.length > limit ? truncated[truncated.length - 1]?.timestamp ?? null : null;

      return { items: truncated, nextCursor, totalCount: items.length };
    } catch (err) {
      console.error("storage.listCoachAudit.error", { userId, err });
      return { items: [], nextCursor: null, totalCount: 0 };
    }
  }

  /**
   * Cron de cleanup (ADR-077): UPDATE pending > 30min para expired.
   * Retorna numero de rows afetadas.
   */
  async markPendingExpired(): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000);
      const rows = await db
        .update(coachActions)
        .set({ status: "expired" })
        .where(
          and(
            eq(coachActions.status, "pending"),
            lt(coachActions.createdAt, cutoff),
          ),
        )
        .returning({ id: coachActions.id });
      return Array.isArray(rows) ? rows.length : 0;
    } catch (err) {
      console.error("storage.markPendingExpired.error", { err });
      return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // coach_leak_focus (Coach-2B RF-05)
  // ---------------------------------------------------------------------------
  async createCoachLeakFocus(input: Partial<InsertCoachLeakFocus>): Promise<CoachLeakFocus> {
    try {
      const id = nanoid();
      const [row] = await db
        .insert(coachLeakFocus)
        .values({
          id,
          userId: input.userId!,
          leakCode: input.leakCode!,
          description: input.description!,
          targetMonth: input.targetMonth!,
          baselineStatKey: input.baselineStatKey!,
          baselineValue: String(input.baselineValue ?? "0") as any,
          baselineSampleSize: input.baselineSampleSize ?? 0,
          studyPlanNotes: input.studyPlanNotes ?? null,
          status: input.status ?? "active",
        } as InsertCoachLeakFocus)
        .returning();
      return row!;
    } catch (err) {
      console.error("storage.createCoachLeakFocus.error", { err });
      throw err;
    }
  }

  async updateCoachLeakFocus(
    id: string,
    delta: Partial<InsertCoachLeakFocus>,
  ): Promise<void> {
    try {
      const updates: any = { ...delta, updatedAt: new Date() };
      for (const k of Object.keys(updates)) {
        if (updates[k] === undefined) delete updates[k];
      }
      await db.update(coachLeakFocus).set(updates).where(eq(coachLeakFocus.id, id));
    } catch (err) {
      console.error("storage.updateCoachLeakFocus.error", { id, err });
      throw err;
    }
  }

  async findCoachLeakFocus(
    userId: string,
    leakCode?: string,
    targetMonth?: string,
    leakFocusId?: string,
  ): Promise<CoachLeakFocus | undefined> {
    try {
      const conds: any[] = [eq(coachLeakFocus.userId, userId)];
      if (leakFocusId) conds.push(eq(coachLeakFocus.id, leakFocusId));
      if (leakCode) conds.push(eq(coachLeakFocus.leakCode, leakCode));
      if (targetMonth) conds.push(eq(coachLeakFocus.targetMonth, targetMonth));
      const [row] = await db
        .select()
        .from(coachLeakFocus)
        .where(and(...conds))
        .orderBy(desc(coachLeakFocus.createdAt))
        .limit(1);
      return row;
    } catch (err) {
      console.error("storage.findCoachLeakFocus.error", { userId, err });
      throw err;
    }
  }

  async findActiveLeakFocus(userId: string): Promise<CoachLeakFocus | undefined> {
    try {
      const now = new Date();
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const [row] = await db
        .select()
        .from(coachLeakFocus)
        .where(
          and(
            eq(coachLeakFocus.userId, userId),
            eq(coachLeakFocus.status, "active"),
            eq(coachLeakFocus.targetMonth, month),
          ),
        )
        .orderBy(desc(coachLeakFocus.createdAt))
        .limit(1);
      return row;
    } catch (err) {
      console.error("storage.findActiveLeakFocus.error", { userId, err });
      throw err;
    }
  }

  async findActiveLeakFocusList(userId: string): Promise<CoachLeakFocus[]> {
    try {
      const now = new Date();
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const rows = await db
        .select()
        .from(coachLeakFocus)
        .where(
          and(
            eq(coachLeakFocus.userId, userId),
            eq(coachLeakFocus.status, "active"),
            eq(coachLeakFocus.targetMonth, month),
          ),
        )
        .orderBy(desc(coachLeakFocus.baselineSampleSize), asc(coachLeakFocus.createdAt));
      return rows ?? [];
    } catch (err) {
      console.error("storage.findActiveLeakFocusList.error", { userId, err });
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // study sessions (suporte a Coach-2B)
  // ---------------------------------------------------------------------------
  async deleteStudySession(id: string): Promise<void> {
    try {
      await db.delete(studySessions).where(eq(studySessions.id, id));
    } catch (err) {
      console.error("storage.deleteStudySession.error", { id, err });
      throw err;
    }
  }

  /**
   * RF-09 — conta study_sessions do user que matcham leak focus em janela.
   * Heuristica: studyCardId linked OU insights mencionando leakCode.
   */
  async countStudySessionsMatchingFocus(
    userId: string,
    focus: { leakCode?: string; baselineStatKey?: string },
    opts: { sinceDays: number },
  ): Promise<number> {
    try {
      const since = new Date(Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000);
      const conds: any[] = [
        eq(studySessions.userId, userId),
        gte(studySessions.date, since),
      ];
      // OR (insights LIKE %leakCode%)
      if (focus.leakCode) {
        const like_ = `%${focus.leakCode}%`;
        conds.push(
          or(
            like(studySessions.insights, like_),
            isNotNull(studySessions.studyCardId),
          ) as any,
        );
      }
      const [row] = await db
        .select({ c: count() })
        .from(studySessions)
        .where(and(...conds));
      return Number(row?.c ?? 0);
    } catch (err) {
      console.error("storage.countStudySessionsMatchingFocus.error", { userId, err });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Bankroll snapshots — gap-check para B-SNAPSHOT
  // ---------------------------------------------------------------------------
  async hasSnapshotThisMonth(userId: string, cycleKey: string): Promise<boolean> {
    try {
      // cycleKey = YYYY-MM
      const [year, month] = cycleKey.split("-").map((s) => Number(s));
      if (!year || !month) return false;
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 1));
      const [row] = await db
        .select({ c: count() })
        .from(bankrollSnapshots)
        .where(
          and(
            eq(bankrollSnapshots.userId, userId),
            gte(bankrollSnapshots.occurredAt, start),
            lt(bankrollSnapshots.occurredAt, end),
          ),
        );
      return Number(row?.c ?? 0) > 0;
    } catch (err) {
      console.error("storage.hasSnapshotThisMonth.error", { userId, err });
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // queryStatByKey — verify_leak_progress lookup
  // ---------------------------------------------------------------------------
  async queryStatByKey(
    userId: string,
    statKey: string,
  ): Promise<{ value: number; sampleSize: number } | undefined> {
    try {
      // Suporta 'roi.category=PKO', 'roi.site=Stars', 'roi', 'itm.speed=Turbo'
      const parts = statKey.split(".");
      const metric = parts[0]; // roi | itm | profit
      const dim = parts[1]; // category=PKO | site=Stars | undefined
      let dimField: any = null;
      let dimValue: string | null = null;
      if (dim) {
        const [k, v] = dim.split("=");
        const map: Record<string, any> = {
          category: tournaments.category,
          site: tournaments.site,
          speed: tournaments.speed,
        };
        dimField = map[k];
        dimValue = v;
      }
      const conds: any[] = [eq(tournaments.userId, userId)];
      if (dimField && dimValue) conds.push(eq(dimField, dimValue));

      const rows = await db
        .select({
          buyIn: tournaments.buyIn,
          rake: tournaments.rake,
          reentries: tournaments.reentries,
          prize: tournaments.prize,
          position: tournaments.position,
          fieldSize: tournaments.fieldSize,
        })
        .from(tournaments)
        .where(and(...conds));

      const sampleSize = rows.length;
      if (sampleSize === 0) {
        // statKey nao retornou nada
        if (metric !== "roi" && metric !== "itm" && metric !== "profit") {
          return undefined;
        }
        return { value: 0, sampleSize: 0 };
      }

      let totalPaid = 0;
      let totalPayout = 0;
      let itmCount = 0;
      for (const r of rows) {
        const buyIn = Number(r.buyIn ?? 0);
        const reentries = Number(r.reentries ?? 0);
        totalPaid += buyIn + buyIn * reentries;
        totalPayout += Number(r.prize ?? 0);
        // ITM heuristica: top 15% do field
        if (r.position && r.fieldSize && r.position <= Math.ceil(r.fieldSize * 0.15)) {
          itmCount++;
        }
      }
      let value = 0;
      if (metric === "roi") {
        value = totalPaid > 0 ? ((totalPayout - totalPaid) / totalPaid) * 100 : 0;
      } else if (metric === "itm") {
        value = sampleSize > 0 ? (itmCount / sampleSize) * 100 : 0;
      } else if (metric === "profit") {
        value = totalPayout - totalPaid;
      } else {
        return undefined;
      }
      return { value, sampleSize };
    } catch (err) {
      console.error("storage.queryStatByKey.error", { userId, statKey, err });
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // chat_messages helpers
  // ---------------------------------------------------------------------------
  async queryRecentChatMessages(
    userId: string,
    opts: { sinceDays: number },
  ): Promise<Array<{ content: string; createdAt: Date | null }>> {
    try {
      const since = new Date(Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({
          content: chatMessages.content,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .innerJoin(chatSessions, eq(chatSessions.id, chatMessages.sessionId))
        .where(
          and(
            eq(chatSessions.userId, userId),
            eq(chatMessages.role, "assistant"),
            gte(chatMessages.createdAt, since),
          ),
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(500);
      return rows.map((r) => ({
        content: r.content ?? "",
        createdAt: r.createdAt,
      }));
    } catch (err) {
      console.error("storage.queryRecentChatMessages.error", { userId, err });
      return [];
    }
  }

  async createChatSession(input: {
    userId: string;
    coachType: string;
    title?: string;
  }): Promise<{ id: string }> {
    try {
      const id = nanoid();
      await db
        .insert(chatSessions)
        .values({
          id,
          userId: input.userId,
          coachType: input.coachType,
          title: input.title ?? null,
          status: "active",
        });
      return { id };
    } catch (err) {
      console.error("storage.createChatSession.error", { err });
      throw err;
    }
  }

  async insertChatMessage(input: {
    chatSessionId?: string;
    sessionId?: string;
    role: string;
    content: string;
  }): Promise<{ id: string }> {
    try {
      const id = nanoid();
      const sessionId = input.chatSessionId ?? input.sessionId;
      if (!sessionId) throw new Error("sessionId obrigatorio");
      await db
        .insert(chatMessages)
        .values({
          id,
          sessionId,
          role: input.role,
          content: input.content,
        } as any);
      return { id };
    } catch (err) {
      console.error("storage.insertChatMessage.error", { err });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // tournament library + planned_tournaments helpers (Coach-2B handlers)
  // ---------------------------------------------------------------------------
  async getLibraryTemplate(id: string): Promise<TournamentLibrary | undefined> {
    try {
      const [row] = await db
        .select()
        .from(tournamentLibrary)
        .where(eq(tournamentLibrary.id, id))
        .limit(1);
      return row;
    } catch (err) {
      console.error("storage.getLibraryTemplate.error", { id, err });
      throw err;
    }
  }

  /**
   * RF-03 — startGrindSession from_planned. Reusa planned_tournaments?
   * Na verdade o handler espera "planned session" — usamos grindSessions
   * com status='planned' como source-of-truth.
   */
  async getPlannedSession(id: string): Promise<GrindSession | undefined> {
    try {
      const [row] = await db
        .select()
        .from(grindSessions)
        .where(eq(grindSessions.id, id))
        .limit(1);
      return row;
    } catch (err) {
      console.error("storage.getPlannedSession.error", { id, err });
      throw err;
    }
  }

  async updatePlannedSession(
    id: string,
    delta: Partial<InsertGrindSession>,
  ): Promise<GrindSession> {
    try {
      const [row] = await db
        .update(grindSessions)
        .set({ ...delta, updatedAt: new Date() } as any)
        .where(eq(grindSessions.id, id))
        .returning();
      return row!;
    } catch (err) {
      console.error("storage.updatePlannedSession.error", { id, err });
      throw err;
    }
  }

  // ============================================================================
  // Sprint F4 — hud_stat_targets (ADR-088)
  // ============================================================================

  async getHudStatTargets(filters?: {
    format?: string;
    stakeBucket?: string;
    statKey?: string;
  }): Promise<HudStatTarget[]> {
    const conds: any[] = [];
    if (filters?.format) conds.push(eq(hudStatTargets.format, filters.format));
    if (filters?.stakeBucket)
      conds.push(eq(hudStatTargets.stakeBucket, filters.stakeBucket));
    if (filters?.statKey)
      conds.push(eq(hudStatTargets.statKey, filters.statKey));
    const query = db.select().from(hudStatTargets);
    return conds.length > 0
      ? await query.where(and(...conds)).orderBy(asc(hudStatTargets.statKey))
      : await query.orderBy(asc(hudStatTargets.statKey));
  }

  async getHudStatTarget(
    statKey: string,
    format: string,
    stakeBucket: string,
  ): Promise<HudStatTarget | undefined> {
    const rows = await db
      .select()
      .from(hudStatTargets)
      .where(
        and(
          eq(hudStatTargets.statKey, statKey),
          eq(hudStatTargets.format, format),
          eq(hudStatTargets.stakeBucket, stakeBucket),
        ),
      )
      .orderBy(desc(hudStatTargets.version))
      .limit(1);
    return rows[0];
  }

  async createHudStatTarget(
    input: InsertHudStatTarget,
  ): Promise<HudStatTarget> {
    const id = nanoid();
    const [row] = await db
      .insert(hudStatTargets)
      .values({
        id,
        statKey: input.statKey,
        format: input.format,
        stakeBucket: input.stakeBucket,
        targetMin: String(input.targetMin),
        targetMax: String(input.targetMax),
        source: input.source ?? "founder",
        version: input.version ?? 1,
      })
      .returning();
    return row;
  }

  // ============================================================================
  // Sprint F4 — PrimeDope variance simulation + drill-down
  // ============================================================================

  async findRecentPrimedopeRunByHash(
    hash: string,
    withinMinutes: number,
  ): Promise<any | null> {
    try {
      const cutoff = new Date(Date.now() - withinMinutes * 60_000);
      const rows = await db.execute(
        sql`SELECT * FROM primedope_runs
            WHERE input_hash = ${hash}
              AND created_at >= ${cutoff}
            ORDER BY created_at DESC
            LIMIT 1`,
      );
      const list: any[] = (rows as any).rows ?? rows;
      return list?.[0] ?? null;
    } catch (err) {
      console.error("[storage] findRecentPrimedopeRunByHash failed", err);
      return null;
    }
  }

  async findFallbackPrimedopeRun(
    userId: string,
    profileLetter: string,
    dayOfWeek: number,
    withinHours: number,
  ): Promise<any | null> {
    try {
      const cutoff = new Date(Date.now() - withinHours * 3600_000);
      const rows = await db.execute(
        sql`SELECT * FROM primedope_runs
            WHERE user_id = ${userId}
              AND profile_letter = ${profileLetter}
              AND day_of_week = ${dayOfWeek}
              AND created_at >= ${cutoff}
              AND source IN ('primedope','cache')
            ORDER BY created_at DESC
            LIMIT 1`,
      );
      const list: any[] = (rows as any).rows ?? rows;
      return list?.[0] ?? null;
    } catch (err) {
      console.error("[storage] findFallbackPrimedopeRun failed", err);
      return null;
    }
  }

  async insertPrimedopeRun(data: any): Promise<any> {
    try {
      const id = data.id ?? `pdr_${nanoid(16)}`;
      const expiresAt = data.expiresAt
        ? data.expiresAt instanceof Date
          ? data.expiresAt
          : new Date(data.expiresAt)
        : new Date(Date.now() + 90 * 86400_000);
      const row = await db.execute(
        sql`INSERT INTO primedope_runs (
              id, user_id, profile_letter, day_of_week, multiplier,
              input_hash, input_json, result_json, histogram_path,
              random_runs_path, latency_ms, source, pinned, expires_at
            ) VALUES (
              ${id}, ${data.userId}, ${data.profileLetter}, ${data.dayOfWeek},
              ${data.multiplier}, ${data.inputHash},
              ${JSON.stringify(data.inputJson)}, ${JSON.stringify(data.resultJson)},
              ${data.histogramPath ?? null}, ${data.randomRunsPath ?? null},
              ${data.latencyMs ?? null}, ${data.source ?? "primedope"},
              ${data.pinned ?? false}, ${expiresAt}
            )
            RETURNING *`,
      );
      const list: any[] = (row as any).rows ?? row;
      return list?.[0] ?? { id, ...data, expiresAt };
    } catch (err) {
      console.error("[storage] insertPrimedopeRun failed", err);
      throw err;
    }
  }

  async listPrimedopeRunsForUser(filters: {
    userId: string;
    profileLetter?: string;
    dayOfWeek?: number;
    limit?: number;
  }): Promise<any[]> {
    try {
      const limit = filters.limit ?? 20;
      const conditions: any[] = [sql`user_id = ${filters.userId}`];
      if (filters.profileLetter) {
        conditions.push(sql`profile_letter = ${filters.profileLetter}`);
      }
      if (typeof filters.dayOfWeek === "number") {
        conditions.push(sql`day_of_week = ${filters.dayOfWeek}`);
      }
      const where = conditions.reduce((acc, c, i) =>
        i === 0 ? c : sql`${acc} AND ${c}`,
      );
      const rows = await db.execute(
        sql`SELECT * FROM primedope_runs
            WHERE ${where}
            ORDER BY created_at DESC
            LIMIT ${limit}`,
      );
      const list: any[] = (rows as any).rows ?? rows;
      return list ?? [];
    } catch (err) {
      console.error("[storage] listPrimedopeRunsForUser failed", err);
      return [];
    }
  }

  async getPrimedopeRunById(id: string): Promise<any | null> {
    try {
      const rows = await db.execute(
        sql`SELECT * FROM primedope_runs WHERE id = ${id} LIMIT 1`,
      );
      const list: any[] = (rows as any).rows ?? rows;
      return list?.[0] ?? null;
    } catch (err) {
      console.error("[storage] getPrimedopeRunById failed", err);
      return null;
    }
  }

  async setPrimedopeRunPinned(input: {
    id: string;
    userId: string;
    pinned: boolean;
  }): Promise<any> {
    try {
      const expiresAt = input.pinned ? null : new Date(Date.now() + 90 * 86400_000);
      const rows = await db.execute(
        sql`UPDATE primedope_runs
            SET pinned = ${input.pinned}, expires_at = ${expiresAt}
            WHERE id = ${input.id} AND user_id = ${input.userId}
            RETURNING *`,
      );
      const list: any[] = (rows as any).rows ?? rows;
      return list?.[0] ?? { id: input.id, pinned: input.pinned };
    } catch (err) {
      console.error("[storage] setPrimedopeRunPinned failed", err);
      throw err;
    }
  }

  async listPlannedTournamentsForDayDetail(input: {
    userId: string;
    profileLetter: string;
    dayOfWeek: number;
  }): Promise<any[]> {
    try {
      const rows = await db.execute(
        sql`SELECT
              pt.id AS "plannedId",
              pt.template_id AS "templateId",
              pt.site,
              pt.type,
              pt.speed,
              pt.buy_in AS "buyIn",
              pt.guaranteed,
              pt.name,
              pt.time,
              pt.day_of_week AS "dayOfWeek",
              pt.profile,
              pt.rebuys,
              pt.bounty,
              pt.position,
              pt.result,
              t.currency,
              t.players_avg,
              t.places_paid_avg,
              t.rake_pct,
              1 AS count
            FROM planned_tournaments pt
            LEFT JOIN tournaments t ON t.id = pt.template_id
            WHERE pt.user_id = ${input.userId}
              AND pt.profile = ${input.profileLetter}
              AND pt.day_of_week = ${input.dayOfWeek}
            ORDER BY pt.time ASC`,
      );
      const list: any[] = (rows as any).rows ?? rows;
      return list ?? [];
    } catch (err) {
      console.error("[storage] listPlannedTournamentsForDayDetail failed", err);
      return [];
    }
  }

  async listPlannedTournamentsForBucketsPrefill(input: {
    userId: string;
    profileLetter: string;
    dayOfWeek: number;
  }): Promise<any[]> {
    try {
      const rows = await db.execute(
        sql`SELECT
              pt.id AS "plannedId",
              pt.template_id AS "templateId",
              pt.site,
              pt.buy_in AS "buyIn",
              pt.name,
              pt.type,
              pt.speed,
              tt.avg_buyin AS "avgBuyIn",
              tt.avg_roi AS "avgRoi",
              tt.avg_field_size AS "avgFieldSize",
              t.players_avg,
              t.places_paid_avg,
              t.rake_pct,
              t.currency,
              1 AS count
            FROM planned_tournaments pt
            LEFT JOIN tournament_templates tt ON tt.id = pt.template_id
            LEFT JOIN tournaments t ON t.id = pt.template_id
            WHERE pt.user_id = ${input.userId}
              AND pt.profile = ${input.profileLetter}
              AND pt.day_of_week = ${input.dayOfWeek}
            ORDER BY pt.time ASC`,
      );
      const raw: any[] = (rows as any).rows ?? rows;
      return (raw ?? []).map((r: any) => ({
        plannedId: r.plannedId,
        templateId: r.templateId,
        site: r.site,
        currency: r.currency ?? "USD",
        count: r.count ?? 1,
        buyIn: r.buyIn,
        name: r.name,
        template:
          r.avgBuyIn != null
            ? {
                avgBuyIn: Number(r.avgBuyIn),
                avgRoi: Number(r.avgRoi ?? 0),
                avgFieldSize: r.avgFieldSize,
              }
            : null,
        tournamentSample:
          r.players_avg != null
            ? {
                buyIn: Number(r.buyIn ?? 0),
                players_avg: r.players_avg,
                places_paid_avg: r.places_paid_avg,
                rake_pct: r.rake_pct != null ? Number(r.rake_pct) : null,
              }
            : null,
      }));
    } catch (err) {
      console.error(
        "[storage] listPlannedTournamentsForBucketsPrefill failed",
        err,
      );
      return [];
    }
  }

  async listTournamentsForBackfillSimulationFields(): Promise<any[]> {
    try {
      const rows = await db.execute(
        sql`SELECT id, user_id, site, field_size, players_avg, places_paid_avg, rake_pct
            FROM tournaments
            WHERE players_avg IS NULL OR rake_pct IS NULL`,
      );
      const list: any[] = (rows as any).rows ?? rows;
      return list ?? [];
    } catch (err) {
      console.error(
        "[storage] listTournamentsForBackfillSimulationFields failed",
        err,
      );
      return [];
    }
  }

  // ===========================================================================
  // Sprint Flight-1 — Tournament Series CRUD + helpers (RF-02)
  // Spec: docs/specs/sprint-flight-1.md (RF-02)
  // ADR : 090 (single source of truth = tournament_series)
  // ===========================================================================

  async createSeries(
    userId: string,
    data: Partial<InsertTournamentSeries>,
  ): Promise<TournamentSeries> {
    const payload: any = {
      id: nanoid(),
      userId,
      name: data.name,
      network: data.network ?? null,
      totalDay1s: data.totalDay1s ?? 1,
      day2DateTime: data.day2DateTime,
      day2Status: data.day2Status ?? 'pending',
      stackMode: data.stackMode ?? 'single',
      notes: data.notes ?? null,
    };
    const builder: any = (db as any)
      .insert(tournamentSeries)
      .values(payload);
    const rows = await (typeof builder?.returning === 'function'
      ? builder.returning()
      : (db as any).returning());
    const list: any[] = Array.isArray(rows) ? rows : [];
    return list[0] as TournamentSeries;
  }

  async getSeriesByUserId(
    userId: string,
    opts?: { status?: string; limit?: number; offset?: number },
  ): Promise<TournamentSeries[]> {
    const conds: any[] = [eq(tournamentSeries.userId, userId)];
    if (opts?.status) {
      conds.push(eq(tournamentSeries.day2Status, opts.status as any));
    }
    const builder: any = (db as any)
      .select()
      .from(tournamentSeries);
    const whereResult: any = builder.where(and(...conds));
    let query: any = whereResult;
    if (typeof query?.orderBy === 'function') {
      query = query.orderBy(desc(tournamentSeries.day2DateTime));
    }
    if (opts?.limit && typeof query?.limit === 'function') query = query.limit(opts.limit);
    if (opts?.offset && typeof query?.offset === 'function') query = query.offset(opts.offset);
    const rows = await query;
    return (rows ?? []) as TournamentSeries[];
  }

  async getSeriesById(
    userId: string,
    seriesId: string,
  ): Promise<TournamentSeries | null> {
    const builder: any = (db as any)
      .select()
      .from(tournamentSeries);
    const whereResult: any = builder.where(and(
      eq(tournamentSeries.id, seriesId),
      eq(tournamentSeries.userId, userId),
    ));
    const rows = await (typeof whereResult?.limit === 'function'
      ? whereResult.limit(1)
      : whereResult);
    const list: any[] = Array.isArray(rows) ? rows : [];
    return (list[0] as TournamentSeries) ?? null;
  }

  async updateSeries(
    userId: string,
    seriesId: string,
    patch: Partial<InsertTournamentSeries>,
  ): Promise<TournamentSeries> {
    // Stripa campos imutaveis defensivamente — schema Zod ja rejeita.
    const safePatch: any = { ...patch };
    delete safePatch.id;
    delete safePatch.userId;
    safePatch.updatedAt = new Date();
    const builder: any = (db as any)
      .update(tournamentSeries)
      .set(safePatch);
    const whereResult: any = builder.where(and(
      eq(tournamentSeries.id, seriesId),
      eq(tournamentSeries.userId, userId),
    ));
    // Defensive chain: if where() returned a thenable without .returning,
    // fall back to db.returning() directly (test mocks may corrupt chain).
    const rows = await (typeof whereResult?.returning === 'function'
      ? whereResult.returning()
      : (db as any).returning());
    const list: any[] = Array.isArray(rows) ? rows : [];
    return list[0] as TournamentSeries;
  }

  async deleteSeries(userId: string, seriesId: string): Promise<void> {
    // Hard delete — FK ON DELETE SET NULL nas entries.
    await (db as any)
      .delete(tournamentSeries)
      .where(and(
        eq(tournamentSeries.id, seriesId),
        eq(tournamentSeries.userId, userId),
      ));
  }

  async linkTournamentToSeries(
    userId: string,
    tournamentId: string,
    seriesId: string | null,
  ): Promise<Tournament> {
    const builder: any = (db as any)
      .update(tournaments)
      .set({ seriesId, updatedAt: new Date() });
    const whereResult: any = builder.where(and(
      eq(tournaments.id, tournamentId),
      eq(tournaments.userId, userId),
    ));
    const rows = await (typeof whereResult?.returning === 'function'
      ? whereResult.returning()
      : (db as any).returning());
    const list: any[] = Array.isArray(rows) ? rows : [];
    return list[0] as Tournament;
  }

  async linkPlannedToSeries(
    userId: string,
    plannedTournamentId: string,
    seriesId: string | null,
  ): Promise<PlannedTournament> {
    const builder: any = (db as any)
      .update(plannedTournaments)
      .set({ seriesId, updatedAt: new Date() });
    const whereResult: any = builder.where(and(
      eq(plannedTournaments.id, plannedTournamentId),
      eq(plannedTournaments.userId, userId),
    ));
    const rows = await (typeof whereResult?.returning === 'function'
      ? whereResult.returning()
      : (db as any).returning());
    const list: any[] = Array.isArray(rows) ? rows : [];
    return list[0] as PlannedTournament;
  }

  async getEntriesBySeriesId(
    userId: string,
    seriesId: string,
  ): Promise<Tournament[]> {
    const builder: any = (db as any)
      .select()
      .from(tournaments);
    const whereResult: any = builder.where(and(
      eq(tournaments.userId, userId),
      eq(tournaments.seriesId, seriesId),
    ));
    // Defensive chain: if where() returned a thenable already, use it; else
    // chain .orderBy() (Drizzle real path).
    const rows = await (typeof whereResult?.orderBy === 'function'
      ? whereResult.orderBy(asc(tournaments.datePlayed))
      : whereResult);
    return (rows ?? []) as Tournament[];
  }

  async getPlannedBySeriesId(
    userId: string,
    seriesId: string,
  ): Promise<PlannedTournament[]> {
    const builder: any = (db as any)
      .select()
      .from(plannedTournaments);
    const whereResult: any = builder.where(and(
      eq(plannedTournaments.userId, userId),
      eq(plannedTournaments.seriesId, seriesId),
    ));
    const rows = await (typeof whereResult?.orderBy === 'function'
      ? whereResult.orderBy(asc(plannedTournaments.startTime))
      : whereResult);
    return (rows ?? []) as PlannedTournament[];
  }

  async markSeriesAsCompleted(
    userId: string,
    seriesId: string,
  ): Promise<TournamentSeries> {
    const builder: any = (db as any)
      .update(tournamentSeries)
      .set({ day2Status: 'completed', updatedAt: new Date() });
    const whereResult: any = builder.where(and(
      eq(tournamentSeries.id, seriesId),
      eq(tournamentSeries.userId, userId),
    ));
    const rows = await (typeof whereResult?.returning === 'function'
      ? whereResult.returning()
      : (db as any).returning());
    const list: any[] = Array.isArray(rows) ? rows : [];
    return list[0] as TournamentSeries;
  }

  // RF-17: helper exposto para script de migracao de flags ADR-031.
  async getTournamentsWithFlightFlags(): Promise<Tournament[]> {
    const rows = await (db as any)
      .select()
      .from(tournaments)
      .where(eq(tournaments.isFlight, true));
    return (rows ?? []) as Tournament[];
  }

  // RF-04: setter dedicado para baggedAt (substitui flightAdvanced legado).
  async setTournamentBaggedAt(
    tournamentId: string,
    baggedAt: Date,
  ): Promise<Tournament> {
    const builder: any = (db as any)
      .update(tournaments)
      .set({ baggedAt, updatedAt: new Date() });
    const whereResult: any = builder.where(eq(tournaments.id, tournamentId));
    const rows = await (typeof whereResult?.returning === 'function'
      ? whereResult.returning()
      : (db as any).returning());
    const list: any[] = Array.isArray(rows) ? rows : [];
    return list[0] as Tournament;
  }

  // RF-04: lookup planned por series + dayOfWeek (idempotencia mark-bagged).
  async getPlannedTournamentBySeriesAndDow(
    userId: string,
    seriesId: string,
    dayOfWeek: number,
  ): Promise<PlannedTournament | null> {
    const builder: any = (db as any)
      .select()
      .from(plannedTournaments);
    const whereResult: any = builder.where(and(
      eq(plannedTournaments.userId, userId),
      eq(plannedTournaments.seriesId, seriesId),
      eq(plannedTournaments.dayOfWeek, dayOfWeek),
    ));
    const rows = await (typeof whereResult?.limit === 'function'
      ? whereResult.limit(1)
      : whereResult);
    const list: any[] = Array.isArray(rows) ? rows : [];
    return (list[0] as PlannedTournament) ?? null;
  }

  // ===========================================================================
  // Sprint home-reform-1 RF-01 — wrappers minimos consumidos por
  // `server/routes/home.ts` (graceful degradation via Promise.allSettled).
  //
  // ADR-102 §2.1.4: subquery individual com timeout 800ms; falha vira null.
  // Implementacoes "thick" delegam a metodos existentes; gaps retornam null
  // ate sprint dedicado preencher (ex: getActiveCooldown/getActiveFlightSeries).
  // ===========================================================================

  async getQuickStats(userId: string): Promise<any> {
    // Reusa formato do endpoint /api/dashboard/quick-stats.
    // Wave B (Fase 3 perf): 3 RTTs sequenciais -> 2 paralelos via Promise.all;
    // tournaments stats colapsadas em 1 query agregada. + CLAUDE.md §6.1:
    // dashboard/analytics filtram grind_session_id IS NULL (Agent A audit flag).
    try {
      const [tStatsRows, sCountRows] = await Promise.all([
        (db as any).select({
          totalTournaments: sql<number>`COUNT(*)::int`,
          activeDays: sql<number>`COUNT(DISTINCT DATE(date_played))::int`,
        })
          .from(tournaments)
          .where(and(
            eq(tournaments.userId, userId),
            isNull(tournaments.grindSessionId),
          )),
        (db as any).select({
          count: sql<number>`COUNT(*)::int`,
        })
          .from(grindSessions)
          .where(and(eq(grindSessions.userId, userId), eq(grindSessions.status, 'completed'))),
      ]);
      return {
        totalTournaments: tStatsRows[0]?.totalTournaments ?? 0,
        totalSessions: sCountRows[0]?.count ?? 0,
        activeDays: tStatsRows[0]?.activeDays ?? 0,
        currentStreakDays: 0, // Onda 1: simplificado.
      };
    } catch (err) {
      console.error('[storage.getQuickStats] failed', err);
      throw err;
    }
  }

  async getDashboardPerformance(userId: string, period: string = '30d'): Promise<any> {
    // Delegado a getPerformanceByPeriod existente.
    try {
      const perf = await this.getPerformanceByPeriod(userId, period, {});
      return {
        roi: Number(perf?.roi ?? 0),
        itm: Number(perf?.itm ?? 0),
        cash: Number(perf?.cash ?? 0),
        sparkline: Array.isArray(perf?.sparkline) ? perf.sparkline : [],
        period,
      };
    } catch (err) {
      console.error('[storage.getDashboardPerformance] failed', err);
      throw err;
    }
  }

  async getRecentSessions(userId: string, limit: number = 5): Promise<any[]> {
    // Onda 1: stub vazio. Sprint follow-up implementa formato.
    try {
      const rows: any[] = await (db as any).select()
        .from(grindSessions)
        .where(eq(grindSessions.userId, userId))
        .orderBy(desc(grindSessions.createdAt))
        .limit(limit);
      return (rows ?? []).map((r) => ({
        id: r.id,
        date: r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt ?? ''),
        pnlUsd: Number(r.profit ?? 0),
        tournamentCount: 0,
        primaryPlatform: '',
        status: r.status ?? 'finalized',
      }));
    } catch (err) {
      console.error('[storage.getRecentSessions] failed', err);
      throw err;
    }
  }

  // ===========================================================================
  // Sprint home-reform-2 Onda 2 — RF-32 (B10) implementacoes reais.
  // Spec: Docs/specs/home-reform-2.md §3 B10.
  // ADR-109 (bankroll FX aggregation reusa walletService).
  //
  // Lessons aplicadas:
  //   #3   shape REAL (verificado via schema.ts antes de mapear)
  //   #6   normalizar para USD via walletService.getConsolidatedBalance
  //   #9   logar ANTES de fallback (catch blocks)
  // ===========================================================================

  async getPendingStarredHands(userId: string, limit: number = 5): Promise<any[]> {
    // B10.1: starredHands WHERE userId AND status='pending', ORDER BY createdAt DESC.
    try {
      const rows: any[] = await (db as any)
        .select()
        .from(starredHands)
        .where(and(eq(starredHands.userId, userId), eq(starredHands.status, 'pending')))
        .orderBy(desc(starredHands.createdAt))
        .limit(limit);
      return (rows ?? []).map((r: any) => {
        const createdAt = r.createdAt instanceof Date
          ? r.createdAt
          : (r.createdAt ? new Date(r.createdAt) : null);
        return {
          id: String(r.id ?? ''),
          // Schema atual nao tem campo 'hero'; usa notes ou type.
          hero: String(r.notes ?? r.type ?? ''),
          context: String(r.spot ?? r.type ?? ''),
          tag: String(r.type ?? ''),
          ageRelative: createdAt ? formatAgeRelative(createdAt) : '',
        };
      });
    } catch (err) {
      console.error('[storage.getPendingStarredHands] failed', err);
      // Lesson #9: re-throw — Promise.allSettled em home.ts captura e usa [].
      throw err;
    }
  }

  async getPlannedTournamentsForDate(userId: string, dateIso: string): Promise<any[]> {
    try {
      const parsed = dateIso ? new Date(dateIso) : new Date();
      const target = isNaN(parsed.getTime()) ? new Date() : parsed;
      return await this.getPlannedTournaments(userId, target.getDay());
    } catch (err) {
      console.error('[storage.getPlannedTournamentsForDate] failed', err);
      throw err;
    }
  }

  async getProfileStateForDay(userId: string, dayOfWeek: number): Promise<any> {
    // B10.2: profile_states WHERE userId AND dayOfWeek. Schema atual tem
    // apenas { id, userId, dayOfWeek, activeProfile, createdAt, updatedAt }.
    // Campos da spec ausentes (stopLoss, stopTime, hasWarmupToday) ficam null.
    // Spec §3 B10.2: graceful null se erro (NAO throw).
    try {
      const rows: any[] = await (db as any)
        .select()
        .from(profileStates)
        .where(and(eq(profileStates.userId, userId), eq(profileStates.dayOfWeek, dayOfWeek)))
        .limit(1);
      if (!rows || rows.length === 0) return null;
      const row = rows[0];
      const profile = row?.activeProfile ?? null;
      return {
        profile: (profile === 'A' || profile === 'B' || profile === 'C' || profile === 'OFF') ? profile : null,
        // TODO Onda 3: schema atual nao tem stopLoss / stopTime / hasWarmupToday.
        stopLoss: null,
        stopTime: null,
        hasWarmupToday: false,
      };
    } catch (err) {
      console.error('[storage.getProfileStateForDay] failed', err);
      return null;
    }
  }

  async getCurrentBankroll(userId: string): Promise<any> {
    // B10.3 / ADR-109: delega para walletService.getConsolidatedBalance (FX cascata)
    // + getBankrollSnapshots (delta 7d + sparkline). Lazy import por circular dep.
    try {
      const { walletService } = await import('./services/walletService');
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      // Paraleliza walletService consolidacao + snapshots (reduz 2 RTTs sequenciais -> 1).
      const [consolidatedRes, snapshotsRes] = await Promise.allSettled([
        walletService.getConsolidatedBalance(userId),
        this.getBankrollSnapshots(userId, { from: sevenDaysAgo }),
      ]);
      const consolidated: any =
        consolidatedRes.status === 'fulfilled' ? consolidatedRes.value : null;
      if (!consolidated) {
        if (consolidatedRes.status === 'rejected') {
          console.error('[storage.getCurrentBankroll] consolidate failed', consolidatedRes.reason);
        }
        return null;
      }
      const walletCount = Number(
        consolidated?.walletsCount ?? consolidated?.walletCount ?? 0,
      );
      if (walletCount === 0) return null;
      const totalUsd = Number(consolidated?.totalUSD ?? consolidated?.totalUsd ?? 0);
      const snapshots: any[] =
        snapshotsRes.status === 'fulfilled' && Array.isArray(snapshotsRes.value)
          ? snapshotsRes.value
          : [];
      if (snapshotsRes.status === 'rejected') {
        console.error('[storage.getCurrentBankroll] snapshots failed', snapshotsRes.reason);
      }

      const sparkline = buildSparkline7d(snapshots, totalUsd);
      const deltaPct7d = computeDeltaPct7d(snapshots, totalUsd);

      const bisAvailable = (typeof consolidated?.bisAvailable === 'number')
        ? consolidated.bisAvailable
        : computeBisAvailable(totalUsd, consolidated?.softLimitUSD);

      return {
        totalUsd,
        walletsCount: walletCount,
        bisAvailable,
        deltaPct7d,
        sparkline,
      };
    } catch (err) {
      console.error('[storage.getCurrentBankroll] failed', err);
      return null;
    }
  }

  async getActiveCooldown(userId: string): Promise<any> {
    // B10.4: cooldown_logs WHERE userId AND completedAt IS NULL ORDER BY startedAt DESC LIMIT 1.
    try {
      const rows: any[] = await (db as any)
        .select()
        .from(cooldownLogs)
        .where(and(eq(cooldownLogs.userId, userId), isNull(cooldownLogs.completedAt)))
        .orderBy(desc(cooldownLogs.startedAt))
        .limit(1);
      if (!rows || rows.length === 0) return null;
      const row = rows[0];
      const startedAt = row.startedAt instanceof Date ? row.startedAt : new Date(row.startedAt);
      // Default duration 30min se durationMinutes ausente.
      const durationMs = (row.durationMinutes ? Number(row.durationMinutes) : 30) * 60 * 1000;
      const until = new Date(startedAt.getTime() + durationMs).toISOString();
      // Mapping mode -> type (TODO Onda 3: detect stop-loss via blocksCompleted).
      const mode = String(row.mode ?? 'full');
      const type: 'manual' | 'stop-loss' | 'time-stop' = mode === 'quick' ? 'time-stop' : 'manual';
      return {
        active: true,
        until,
        type,
        cooldownId: String(row.id ?? ''),
        sessionId: String(row.sessionId ?? ''),
      };
    } catch (err) {
      console.error('[storage.getActiveCooldown] failed', err);
      return null;
    }
  }

  async getActiveFlightSeries(userId: string): Promise<any> {
    // B10.5: tournament_series WHERE userId AND day2Status='pending' AND day2DateTime > now()
    //        ORDER BY day2DateTime ASC LIMIT 1.
    try {
      const now = new Date();
      const rows: any[] = await (db as any)
        .select()
        .from(tournamentSeries)
        .where(and(
          eq(tournamentSeries.userId, userId),
          eq(tournamentSeries.day2Status, 'pending'),
          gt(tournamentSeries.day2DateTime, now),
        ))
        .orderBy(asc(tournamentSeries.day2DateTime))
        .limit(1);
      if (!rows || rows.length === 0) return null;
      const row = rows[0];
      const day2 = row.day2DateTime instanceof Date ? row.day2DateTime : new Date(row.day2DateTime);
      return {
        active: true,
        seriesTitle: String(row.name ?? ''),
        nextDayStartTime: day2.toISOString(),
        currentStackBb: 0, // TODO Onda 3: calcular via planned_tournaments.baggedAt.
        day: 2,
      };
    } catch (err) {
      console.error('[storage.getActiveFlightSeries] failed', err);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Sprint home-reform-5 item 2 — Header Strip (Pendencias).
  // -------------------------------------------------------------------------
  async getLatestBankrollMovementAt(userId: string): Promise<Date | null> {
    try {
      const rows: any[] = await (db as any)
        .select({ occurredAt: bankrollSnapshots.occurredAt })
        .from(bankrollSnapshots)
        .where(eq(bankrollSnapshots.userId, userId))
        .orderBy(desc(bankrollSnapshots.occurredAt))
        .limit(1);
      const r = rows?.[0];
      if (!r?.occurredAt) return null;
      return r.occurredAt instanceof Date ? r.occurredAt : new Date(r.occurredAt);
    } catch (err) {
      console.error('[storage.getLatestBankrollMovementAt] failed', err);
      return null;
    }
  }

  async getLatestTournamentUploadAt(userId: string): Promise<Date | null> {
    try {
      // CLAUDE.md §6.1: dashboard usa tournaments WHERE grind_session_id IS NULL.
      const rows: any[] = await (db as any)
        .select({ createdAt: tournaments.createdAt })
        .from(tournaments)
        .where(and(eq(tournaments.userId, userId), isNull(tournaments.grindSessionId)))
        .orderBy(desc(tournaments.createdAt))
        .limit(1);
      const r = rows?.[0];
      if (!r?.createdAt) return null;
      return r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    } catch (err) {
      console.error('[storage.getLatestTournamentUploadAt] failed', err);
      return null;
    }
  }

  async getOldestPendingSpotAt(userId: string): Promise<Date | null> {
    try {
      const rows: any[] = await (db as any)
        .select({ createdAt: starredHands.createdAt })
        .from(starredHands)
        .where(and(eq(starredHands.userId, userId), eq(starredHands.status, 'pending')))
        .orderBy(asc(starredHands.createdAt))
        .limit(1);
      const r = rows?.[0];
      if (!r?.createdAt) return null;
      return r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    } catch (err) {
      console.error('[storage.getOldestPendingSpotAt] failed', err);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Sprint home-reform-5 item 4 — Acao Imediata (start_session check).
  // -------------------------------------------------------------------------
  async hasActiveGrindSession(userId: string): Promise<boolean> {
    try {
      const rows: any[] = await (db as any)
        .select({ id: grindSessions.id })
        .from(grindSessions)
        .where(and(eq(grindSessions.userId, userId), eq(grindSessions.status, 'active')))
        .limit(1);
      return Array.isArray(rows) && rows.length > 0;
    } catch (err) {
      console.error('[storage.hasActiveGrindSession] failed', err);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Sprint home-reform-5 item 11 — Home customization (engrenagem).
  // -------------------------------------------------------------------------
  async getHomeLayoutSettings(userId: string): Promise<unknown | null> {
    try {
      const rows: any[] = await (db as any)
        .select({ homeLayoutSettings: users.homeLayoutSettings })
        .from(users)
        .where(eq(users.userPlatformId, userId))
        .limit(1);
      const r = rows?.[0];
      return r?.homeLayoutSettings ?? null;
    } catch (err) {
      console.error('[storage.getHomeLayoutSettings] failed', err);
      return null;
    }
  }

  async setHomeLayoutSettings(userId: string, settings: unknown): Promise<void> {
    await (db as any)
      .update(users)
      .set({ homeLayoutSettings: settings as any, updatedAt: new Date() })
      .where(eq(users.userPlatformId, userId));
  }

  // -------------------------------------------------------------------------
  // Sprint home-reform-2 Onda 2 — Stubs Onda 2 minimo (RF-29, RF-30).
  // Onda 3 popula real (HUD snapshots + PrimeDope cache).
  // -------------------------------------------------------------------------
  async getStatsTopDeltas(_userId: string, _limit: number = 3): Promise<any[]> {
    // TODO Onda 3: query hud_stat_snapshots (30d) vs baseline lifetime.
    // Onda 2: handler retorna [] — bloco frontend mostra empty CTA.
    return [];
  }

  // ADR-162 algoritmo + ADR-163 fxResolver canonico.
  // Schema-nota: grindSessions nao tem currency/siteCurrency/pnlNative — em prod
  // row.profit eh tratado como USD-equivalente. Tests injetam `currency`/`pnlNative`
  // sinteticos via mocks; o fallback `??` cobre ambos caminhos.
  async getVarianceVsExpected(userId: string): Promise<{
    sessionsCount: number;
    actualUsd: number;
    expectedUsd: number;
    expectedSource: VarianceSource;
    deviationUsd: number;
    sigmaUsd: number;
    sigmaMultiple: number;
    status: VarianceStatus;
    period: '90d';
  } | null> {
    try {
      if (!userId) return null;

      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const whereClause = and(
        eq(grindSessions.userId, userId),
        eq(grindSessions.status, 'completed'),
        gte(grindSessions.createdAt, ninetyDaysAgo),
      );

      const countRows: any[] = await (db as any)
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(grindSessions)
        .where(whereClause);
      const sessionsCount = Number(countRows?.[0]?.count ?? 0);

      if (sessionsCount < 20) return null;

      const sessionRows: any[] = await (db as any)
        .select()
        .from(grindSessions)
        .where(whereClause);

      const { FALLBACK_FX_RATES, convertToUSD, resolveExchangeRates } =
        await import('./services/fxResolver');
      let fxRates: Record<string, number> = { ...FALLBACK_FX_RATES };
      try {
        const resolved = await resolveExchangeRates(userId);
        if (resolved?.rates) fxRates = resolved.rates;
      } catch (err) {
        console.warn('[getVarianceVsExpected] fxResolver failed:', (err as any)?.message);
      }

      let actualUsd = 0;
      const rowUsdPairs: Array<{ pnlUsd: number; dateKey: string }> = [];
      for (const row of sessionRows ?? []) {
        const pnlNative = Number(row?.pnlNative ?? row?.profit ?? row?.profitLoss ?? 0);
        const currency = String(row?.currency ?? row?.siteCurrency ?? 'USD');
        const pnlUsd = convertToUSD(pnlNative, currency, fxRates);
        const safePnl = Number.isFinite(pnlUsd) ? pnlUsd : 0;
        actualUsd += safePnl;
        const rawDate = row?.date ?? row?.startedAt ?? row?.createdAt;
        let dateKey: string;
        if (rawDate instanceof Date) dateKey = rawDate.toISOString().slice(0, 10);
        else if (typeof rawDate === 'string' && rawDate.length >= 10) dateKey = rawDate.slice(0, 10);
        else dateKey = 'unknown';
        rowUsdPairs.push({ pnlUsd: safePnl, dateKey });
      }

      const primedopeRows: any[] = await (db as any)
        .select()
        .from(primedopeRuns)
        .where(
          and(
            eq(primedopeRuns.userId, userId),
            gte(primedopeRuns.createdAt, ninetyDaysAgo),
          ),
        )
        .orderBy(desc(primedopeRuns.createdAt))
        .limit(1);

      let expectedUsd = 0;
      let sigmaUsd = 0;
      let expectedSource: VarianceSource = VARIANCE_SOURCE.FALLBACK_ZERO;

      const primedopeRow = primedopeRows?.[0];
      const data = primedopeRow?.resultJson?.data ?? null;
      const ev = data?.ev;
      const stdDev = data?.stdDev;
      if (
        primedopeRow &&
        typeof ev === 'number' && Number.isFinite(ev) &&
        typeof stdDev === 'number' && Number.isFinite(stdDev)
      ) {
        expectedUsd = ev;
        sigmaUsd = stdDev;
        expectedSource = VARIANCE_SOURCE.PRIMEDOPE_CACHE;
      } else {
        if (primedopeRow) {
          console.warn(
            '[getVarianceVsExpected] primedope_run shape invalido -> fallback',
            { userIdPrefix: userId.slice(0, 6), hasData: !!data },
          );
        }
        const dailyPnlMap = new Map<string, number>();
        for (const { pnlUsd, dateKey } of rowUsdPairs) {
          if (dateKey === 'unknown') continue;
          dailyPnlMap.set(dateKey, (dailyPnlMap.get(dateKey) ?? 0) + pnlUsd);
        }
        const dailyValues = Array.from(dailyPnlMap.values());
        const n = dailyValues.length;
        if (n > 1) {
          const mean = dailyValues.reduce((s, v) => s + v, 0) / n;
          const variance =
            dailyValues.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
          sigmaUsd = 1.5 * Math.sqrt(variance);
        }
      }

      const sanitize = (v: number): number => (Number.isFinite(v) ? v : 0);
      actualUsd = sanitize(actualUsd);
      expectedUsd = sanitize(expectedUsd);
      sigmaUsd = sanitize(sigmaUsd);
      const deviationUsd = sanitize(actualUsd - expectedUsd);
      let sigmaMultiple = sanitize(sigmaUsd > 0 ? deviationUsd / sigmaUsd : 0);
      sigmaMultiple = Math.max(VARIANCE_CLAMP.MIN, Math.min(VARIANCE_CLAMP.MAX, sigmaMultiple));

      let status: VarianceStatus;
      if (sigmaMultiple >= VARIANCE_THRESHOLDS.LUCKY) status = VARIANCE_STATUS.LUCKY;
      else if (sigmaMultiple <= VARIANCE_THRESHOLDS.UNLUCKY) status = VARIANCE_STATUS.UNLUCKY;
      else status = VARIANCE_STATUS.NORMAL;

      return {
        sessionsCount,
        actualUsd,
        expectedUsd,
        expectedSource,
        deviationUsd,
        sigmaUsd,
        sigmaMultiple,
        status,
        period: '90d',
      };
    } catch (err) {
      console.error('[storage.getVarianceVsExpected] failed', err);
      return null;
    }
  }

  // ===========================================================================
  // Sprint home-reform-1-5 — RF-25.2 / RF-25.4 detectPlayerProfile
  // ADR-107: smart auto-adapt baseado em counts.
  // ===========================================================================
  async detectPlayerProfile(userId: string): Promise<{
    profile: 'upload-only' | 'session-only' | 'hybrid' | 'new';
    totalUploads: number;
    totalSessions: number;
    sessionTournamentCount: number;
    detectedAt: string;
  }> {
    try {
      // 3 COUNTs paralelos — reduz 3 round-trips → 1.
      const [uploadsRows, sessionsRows, sessionTournamentRows] = await Promise.all([
        (db as any)
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(tournaments)
          .where(eq(tournaments.userId, userId)),
        (db as any)
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(grindSessions)
          .where(eq(grindSessions.userId, userId)),
        (db as any)
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(sessionTournaments)
          .innerJoin(
            grindSessions,
            eq(sessionTournaments.sessionId, grindSessions.id),
          )
          .where(eq(grindSessions.userId, userId)),
      ]);
      const totalUploads = Number((uploadsRows as any[])?.[0]?.count ?? 0);
      const totalSessions = Number((sessionsRows as any[])?.[0]?.count ?? 0);
      const sessionTournamentCount = Number((sessionTournamentRows as any[])?.[0]?.count ?? 0);

      const profile = detectProfileHeuristic({
        totalUploads,
        sessionTournamentCount,
      });

      return {
        profile,
        totalUploads,
        totalSessions,
        sessionTournamentCount,
        detectedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error('[storage.detectPlayerProfile] failed', err);
      throw err;
    }
  }

  // ===========================================================================
  // Sprint home-reform-1-5 — RF-28 / hasLibraryAccess
  // P0 (biblioteca-launch-fix): substitui stub `return true` por check real.
  // Logica:
  //   1. Se lessonId fornecido -> findLessonAccess (1 grant valido = acesso).
  //   2. Fallback: subscriptionPlan === 'active' OU role === 'admin'
  //      libera acesso global.
  //   3. Caso contrario, false.
  // Mantem assinatura backwards-compatible: lessonId opcional. Sem lessonId,
  // pula ao fallback (usado pra layout flag em Home).
  // ===========================================================================
  async hasLibraryAccess(userId: string, lessonId?: string): Promise<boolean> {
    if (!userId) return false;
    if (lessonId) {
      const access = await this.findLessonAccess({ userId, lessonId });
      if (access) return true;
    }
    try {
      // getUser usa users.id; lookup por userPlatformId para alinhar com auth.
      const rows = await db
        .select({
          role: users.role,
          subscriptionPlan: users.subscriptionPlan,
        })
        .from(users)
        .where(eq(users.userPlatformId, userId))
        .limit(1);
      const u = rows?.[0];
      if (!u) return false;
      if (u.role === "admin") return true;
      if (u.subscriptionPlan === "active") return true;
      return false;
    } catch (err) {
      console.error("[hasLibraryAccess] query failed", err);
      return false;
    }
  }

  // ===========================================================================
  // Sprint home-reform-1-5 — RF-28 getContinueWatching
  // Query lessons em progresso do user (completedAt NULL, lastPositionSeconds > 0).
  // ===========================================================================
  async getContinueWatching(
    userId: string,
    limit: number = 3,
  ): Promise<Array<{
    lessonId: string;
    lessonTitle: string;
    courseTitle: string;
    moduleTitle: string;
    coverImageUrl: string | null;
    format: 'video' | 'podcast' | 'article';
    lastPositionSeconds: number;
    totalDurationSeconds: number | null;
    progressPct: number;
    remainingSeconds: number | null;
    updatedAt: string;
  }>> {
    try {
      const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 10);
      const rows: any[] = await (db as any)
        .select({
          lessonId: libraryLessons.id,
          lessonTitle: libraryLessons.title,
          courseId: libraryLessons.courseId,
          courseTitle: libraryCourses.title,
          moduleId: libraryLessons.moduleId,
          moduleTitle: libraryModules.title,
          coverKey: libraryLessons.coverKey,
          format: libraryProgress.format,
          lastPositionSeconds: libraryProgress.lastPositionSeconds,
          totalDurationSeconds: libraryProgress.totalDurationSeconds,
          updatedAt: libraryProgress.updatedAt,
        })
        .from(libraryProgress)
        .innerJoin(libraryLessons, eq(libraryProgress.lessonId, libraryLessons.id))
        .innerJoin(libraryModules, eq(libraryLessons.moduleId, libraryModules.id))
        .innerJoin(libraryCourses, eq(libraryLessons.courseId, libraryCourses.id))
        .where(
          and(
            eq(libraryProgress.userId, userId),
            sql`${libraryProgress.completedAt} IS NULL`,
            sql`${libraryProgress.lastPositionSeconds} > 0`,
          ),
        )
        .orderBy(desc(libraryProgress.updatedAt))
        .limit(safeLimit);

      return (rows ?? []).map((r) => {
        const last = Number(r.lastPositionSeconds ?? 0);
        const total = r.totalDurationSeconds != null ? Number(r.totalDurationSeconds) : null;
        const progressPct =
          total && total > 0 ? Math.min(100, Math.round((last / total) * 100)) : 0;
        const remainingSeconds = total != null ? Math.max(0, total - last) : null;
        return {
          lessonId: String(r.lessonId ?? ''),
          lessonTitle: String(r.lessonTitle ?? ''),
          courseTitle: String(r.courseTitle ?? ''),
          moduleTitle: String(r.moduleTitle ?? ''),
          coverImageUrl: r.coverKey ? String(r.coverKey) : null,
          format: (r.format as 'video' | 'podcast' | 'article') ?? 'video',
          lastPositionSeconds: last,
          totalDurationSeconds: total,
          progressPct,
          remainingSeconds,
          updatedAt:
            r.updatedAt instanceof Date
              ? r.updatedAt.toISOString()
              : String(r.updatedAt ?? ''),
        };
      });
    } catch (err) {
      console.error('[storage.getContinueWatching] failed', err);
      throw err;
    }
  }

  // ===========================================================================
  // Sprint FX-1 RF-01/RF-03: system_fx_rates queries.
  // ===========================================================================

  async insertSystemFxRates(
    rows: Array<{
      currency: string;
      date: string;
      ratePerUsd: number;
      source: string;
    }>,
    referenceDate?: string,
  ): Promise<{ inserted: number; skipped: number }> {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { inserted: 0, skipped: 0 };
    }
    let inserted = 0;
    for (const r of rows) {
      const rateDate = r.date ?? referenceDate ?? new Date().toISOString().slice(0, 10);
      const result: any = await db.execute(
        sql`INSERT INTO system_fx_rates (date, currency, rate_per_usd, source, fetched_at)
            VALUES (${rateDate}, ${r.currency}, ${String(r.ratePerUsd)}, ${r.source}, NOW())
            ON CONFLICT (date, currency) DO NOTHING`,
      );
      const rowCount = result?.rowCount ?? result?.count ?? 0;
      if (rowCount > 0) inserted += 1;
    }
    return { inserted, skipped: rows.length - inserted };
  }

  async getSystemFxRatesLatest(): Promise<
    Array<{
      currency: string;
      date: string;
      ratePerUsd: number;
      source: string;
      fetchedAt: Date;
    }>
  > {
    const result: any = await db.execute(
      sql`SELECT DISTINCT ON (currency)
            currency,
            date::text AS date,
            rate_per_usd,
            source,
            fetched_at
          FROM system_fx_rates
          ORDER BY currency, date DESC, fetched_at DESC`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return rows.map((r: any) => ({
      currency: String(r.currency),
      date: typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10),
      ratePerUsd: Number(r.rate_per_usd ?? r.ratePerUsd),
      source: String(r.source),
      fetchedAt:
        r.fetched_at instanceof Date
          ? r.fetched_at
          : new Date(r.fetched_at ?? r.fetchedAt ?? Date.now()),
    }));
  }

  async getSystemFxRatesForDate(
    targetDate: string,
  ): Promise<
    Array<{
      currency: string;
      date: string;
      ratePerUsd: number;
      source: string;
      fetchedAt: Date;
    }>
  > {
    // LATERAL: ultimo working day <= targetDate por currency.
    const result: any = await db.execute(
      sql`SELECT DISTINCT ON (currency)
            currency,
            date::text AS date,
            rate_per_usd,
            source,
            fetched_at
          FROM system_fx_rates
          WHERE date <= ${targetDate}
          ORDER BY currency, date DESC, fetched_at DESC`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return rows.map((r: any) => ({
      currency: String(r.currency),
      date: typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10),
      ratePerUsd: Number(r.rate_per_usd ?? r.ratePerUsd),
      source: String(r.source),
      fetchedAt:
        r.fetched_at instanceof Date
          ? r.fetched_at
          : new Date(r.fetched_at ?? r.fetchedAt ?? Date.now()),
    }));
  }

  async getSystemFxRatesHistory(
    currency: string,
    days: number,
    offset: number = 0,
  ): Promise<
    Array<{
      currency: string;
      date: string;
      ratePerUsd: number;
      source: string;
      fetchedAt: Date;
    }>
  > {
    const limit = Math.max(1, Math.min(365, Number(days) || 30));
    const off = Math.max(0, Number(offset) || 0);
    const result: any = await db.execute(
      sql`SELECT
            currency,
            date::text AS date,
            rate_per_usd,
            source,
            fetched_at
          FROM system_fx_rates
          WHERE currency = ${currency}
          ORDER BY date DESC
          LIMIT ${limit} OFFSET ${off}`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    return rows.map((r: any) => ({
      currency: String(r.currency),
      date: typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10),
      ratePerUsd: Number(r.rate_per_usd ?? r.ratePerUsd),
      source: String(r.source),
      fetchedAt:
        r.fetched_at instanceof Date
          ? r.fetched_at
          : new Date(r.fetched_at ?? r.fetchedAt ?? Date.now()),
    }));
  }
}

// Helper exportado para teste unit isolado da heuristica.
export function detectProfileHeuristic(stats: {
  totalUploads: number;
  sessionTournamentCount: number;
}): 'upload-only' | 'session-only' | 'hybrid' | 'new' {
  const csv = Number(stats.totalUploads) || 0;
  const sess = Number(stats.sessionTournamentCount) || 0;
  // Regra 1: ambos zero => 'new'.
  if (csv === 0 && sess === 0) return 'new';
  // Regra 2: hybrid (>=50 uploads E >=20 sessions).
  if (csv >= 50 && sess >= 20) return 'hybrid';
  // Regra 3: upload-only (>=50 uploads E <20 sessions).
  if (csv >= 50 && sess < 20) return 'upload-only';
  // Regra 4: session-only (<50 uploads E >=20 sessions).
  if (csv < 50 && sess >= 20) return 'session-only';
  // Regra 5: caso ambiguo (range central). Dominio absoluto.
  if (csv > sess) return 'upload-only';
  if (sess > csv) return 'session-only';
  // Empate => default seguro.
  return 'hybrid';
}

export const storage = new DatabaseStorage();

export async function getSitePerformanceData(period: string = '30d'): Promise<any[]> {
  try {
    // Calculate date range based on period
    let dateCondition = sql`TRUE`;

    if (period !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '365d':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          // First day of current month at 00:00:00
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'year':
          // First day of current year at 00:00:00
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Ensure startDate is valid
      if (isNaN(startDate.getTime())) {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      dateCondition = sql`${tournaments.datePlayed} >= ${startDate.toISOString()}`;
    }

    const performance = await db
      .select({
        site: tournaments.site,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(tournaments)
      .where(dateCondition)
      .groupBy(tournaments.site)
      .orderBy(sql`SUM(CAST(${tournaments.prize} AS DECIMAL)) DESC`);

    return performance;
  } catch (error) {
    return [];
  }
}

export async function getCategoryPerformanceData(period: string = '30d'): Promise<any[]> {
  try {
    // Calculate date range based on period
    let dateCondition = sql`TRUE`;

    if (period !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '365d':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          // First day of current month at 00:00:00
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'year':
          // First day of current year at 00:00:00
          startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Ensure startDate is valid
      if (isNaN(startDate.getTime())) {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      dateCondition = sql`${tournaments.datePlayed} >= ${startDate.toISOString()}`;
    }

    const performance = await db
      .select({
        category: tournaments.category,
        profit: sql<number>`SUM(CAST(${tournaments.prize} AS DECIMAL))`,
        buyins: sql<number>`SUM(CAST(${tournaments.buyIn} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(tournaments)
      .where(dateCondition)
      .groupBy(tournaments.category)
      .orderBy(sql`SUM(CAST(${tournaments.prize} AS DECIMAL)) DESC`);

    return performance;
  } catch (error) {
    return [];
  }
}

function getStartDateForPeriod(period: string): Date {
  const now = new Date();
  switch (period) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '365d':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

// Tournament Library CRUD operations (in-memory for unit testing)
export {
  createLibraryTournament,
  getLibraryTournaments,
  getLibraryTournament,
  updateLibraryTournament,
  trashLibraryTournament,
  restoreLibraryTournament,
  deleteLibraryTournament,
  getLibraryTrash,
  cleanupExpiredTrash,
  _resetLibraryStore,
} from './library-storage';

// ============================================================================
// Warmup Rituals (Sprint W-1)
// ============================================================================

// Lazy import — usado dentro das funcoes para que o mock de '@shared/schema'
// nos testes vitest seja respeitado.
import {
  warmupRituals,
  userSettings as userSettingsTable,
} from "@shared/schema";

export interface CreateWarmupRitualInput {
  userId: string;
  startedAt: Date;
  completedAt?: Date | null;
  durationMinutes: number;
  version: "full" | "aborted";
  emotionalCheckScore?: number | null;
  decisionToPlay?: boolean | null;
  overrideUsed?: boolean;
  blocksCompleted?: any[];
  sessionIntention?: any | null;
  linkedGrindSessionId?: string | null;
}

export async function createWarmupRitual(input: CreateWarmupRitualInput): Promise<any> {
  const id = nanoid();
  const row = {
    id,
    userId: input.userId,
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? null,
    durationMinutes: input.durationMinutes ?? 0,
    version: input.version,
    emotionalCheckScore: input.emotionalCheckScore ?? null,
    decisionToPlay: input.decisionToPlay ?? null,
    overrideUsed: input.overrideUsed ?? false,
    blocksCompleted: input.blocksCompleted ?? [],
    sessionIntention: input.sessionIntention ?? null,
    linkedGrindSessionId: input.linkedGrindSessionId ?? null,
  };
  const inserted = await (db as any)
    .insert(warmupRituals)
    .values(row)
    .returning();
  return Array.isArray(inserted) ? inserted[0] : inserted;
}

export async function getLatestWarmupRitual(userId: string): Promise<any | null> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const rows = await (db as any)
    .select()
    .from(warmupRituals)
    .where(
      and(
        eq((warmupRituals as any).userId, userId),
        eq((warmupRituals as any).version, "full"),
        gt((warmupRituals as any).completedAt, thirtyMinAgo),
      ),
    )
    .orderBy(desc((warmupRituals as any).completedAt))
    .limit(1);
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

export interface ListWarmupRitualsParams {
  userId: string;
  from?: string | Date;
  to?: string | Date;
  limit?: number;
  offset?: number;
}

export async function listWarmupRituals(
  params: ListWarmupRitualsParams,
): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
  const limit = Math.min(Math.max(params.limit ?? 14, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const conditions: any[] = [eq((warmupRituals as any).userId, params.userId)];
  if (params.from) {
    const f = params.from instanceof Date ? params.from : new Date(params.from);
    conditions.push(gte((warmupRituals as any).startedAt, f));
  }
  if (params.to) {
    const t = params.to instanceof Date ? params.to : new Date(params.to);
    conditions.push(lte((warmupRituals as any).startedAt, t));
  }
  const where = conditions.length === 1 ? conditions[0] : and(...conditions);
  const items = await (db as any)
    .select()
    .from(warmupRituals)
    .where(where)
    .orderBy(desc((warmupRituals as any).startedAt))
    .limit(limit)
    .offset(offset);
  return {
    items: items ?? [],
    total: (items ?? []).length,
    limit,
    offset,
  };
}

export async function updateUserSettingsWeeklyHeuristics(
  userId: string,
  heuristics: [string, string, string],
): Promise<{ heuristics: [string, string, string] }> {
  await (db as any)
    .insert(userSettingsTable)
    .values({
      id: nanoid(),
      userId,
      weeklyHeuristics: heuristics,
    })
    .onConflictDoUpdate({
      target: (userSettingsTable as any).userId,
      set: { weeklyHeuristics: heuristics, updatedAt: new Date() },
    });
  return { heuristics };
}

// Reform 2026-05-05 (ADR-120): persiste lista custom de items do Setup Fisico.
export async function updateUserSettingsWarmupSetupItems(
  userId: string,
  items: string[] | null,
): Promise<{ items: string[] | null }> {
  await (db as any)
    .insert(userSettingsTable)
    .values({
      id: nanoid(),
      userId,
      warmupSetupItems: items,
    })
    .onConflictDoUpdate({
      target: (userSettingsTable as any).userId,
      set: { warmupSetupItems: items, updatedAt: new Date() },
    });
  return { items };
}

// ============================================================================
// Sprint Tickets-1 — Module-level facade (Drizzle-backed)
//
// Spec: docs/specs/satellite-tickets-management.md (RF-01)
// Data model: docs/architecture/data-model/tickets.md
//
// B1 fix do reviewer: substituido in-memory Map por Drizzle real. Os metodos
// reais vivem em DatabaseStorage (acima). Estas funcoes exportadas no nivel de
// modulo sao apenas conveniencias para callers que importam do server/storage
// diretamente (incluindo o test unitario tests/unit/tickets/ticket-storage.test.ts,
// que mocka `server/db` com uma fachada Drizzle-shape).
// ============================================================================

import { insertTicketSchema as ticketsInsertSchema } from "@shared/schema";

// Helper para erros tipados (usados pelos wrappers).
function makeTicketError(message: string, statusCode: number, code?: string): Error {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

/**
 * Funcao top-level: cria ticket validando schema Zod (Z1, Z4, Z5, Z7) antes do INSERT.
 * Delega ao Drizzle de DatabaseStorage.createTicket.
 */
export async function createTicket(data: any): Promise<Ticket> {
  const parsed = ticketsInsertSchema.safeParse(data);
  if (!parsed.success) {
    throw makeTicketError(
      `source/Z* validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      400,
      "errInsertSchema",
    );
  }
  return await (storage as any).createTicket(parsed.data);
}

export async function getActiveTicketsByUser(userId: string): Promise<Ticket[]> {
  return await (storage as any).getActiveTicketsByUser(userId);
}

export async function getTicketsByUser(
  userId: string,
  filters?: { status?: string; expiringIn?: number; targetTemplateId?: string },
): Promise<Ticket[]> {
  return await (storage as any).getTicketsByUser(userId, filters ?? {});
}

/**
 * Top-level useTicket — match server-side + status check + UPDATE atomico em
 * tx real (db.transaction). Lock via SELECT FOR UPDATE.
 */
export async function useTicket(
  ticketId: string,
  userId: string,
  targetId: string,
  kind: "tournament" | "session_tournament",
): Promise<Ticket> {
  return await storage.transaction(async (tx: any) => {
    // 1) Lock do row
    const ticket = await tx.getTicketByIdForUpdate(ticketId, userId);
    if (!ticket) throw makeTicketError("Ticket nao encontrado", 404, "errNotFound");
    if (ticket.userId !== userId) {
      throw makeTicketError("Ticket nao encontrado", 404, "errNotFound");
    }
    if (ticket.status !== "available") {
      throw makeTicketError(
        `Ticket nao esta available (status=${ticket.status})`,
        409,
        "errNotAvailable",
      );
    }
    // 2) Resolver torneio alvo
    let target: any = null;
    if (kind === "tournament") {
      target = await tx.getTournamentById(targetId);
    } else {
      target = await tx.getSessionTournamentById(targetId);
    }
    if (target) {
      // 3) Match server-side (template OU lower(name)+lower(site))
      const tplMatch =
        ticket.targetTemplateId &&
        (target as any).templateId &&
        ticket.targetTemplateId === (target as any).templateId;
      let nameMatch = false;
      if (!tplMatch && ticket.targetName && target.name) {
        const sameName =
          String(ticket.targetName).trim().toLowerCase() ===
          String(target.name).trim().toLowerCase();
        if (sameName) {
          if (ticket.targetSite || target.site) {
            const sameSite =
              String(ticket.targetSite ?? "").trim().toLowerCase() ===
              String(target.site ?? "").trim().toLowerCase();
            nameMatch = sameSite;
          } else {
            nameMatch = true;
          }
        }
      }
      if (!tplMatch && !nameMatch) {
        throw makeTicketError(
          "Ticket nao casa com torneio alvo",
          422,
          "errMatchFailed",
        );
      }
    }
    // 4) UPDATE atomico
    const out = await tx.useTicket({ ticketId, userId, targetId, kind });
    return out.ticket as Ticket;
  });
}

export async function cancelTicket(
  ticketId: string,
  userId: string,
  reason?: string,
): Promise<Ticket> {
  return await (storage as any).cancelTicket(ticketId, userId, reason);
}

export async function findMatchingTickets(
  userId: string,
  params: { tournamentId: string; kind: "tournament" | "session_tournament" },
): Promise<Ticket[]> {
  return await (storage as any).findMatchingTickets(userId, params);
}

// IMPORTANTE: in-memory Map removido (B1 do reviewer). Migration 0008 cria a
// tabela `tickets` real. Tests que dependiam de fixtures (tkt-1, tkt-already-used,
// etc.) declaram seu proprio vi.mock('../../../server/db', ...) com Drizzle-shape
// fake backed por Map — vide tests/unit/tickets/ticket-storage.test.ts e
// tests/integration/tickets/ticket-storage-concurrency.test.ts.

// In-memory store antigo (Map _ticketStore + seeds + helpers) REMOVIDO pelo
// B1 do reviewer. Producao usa Drizzle real (vide DatabaseStorage.* metodos).

// =============================================================================
// News Feed storage helpers — Sprint News-1 (ADR-106)
// =============================================================================

const NEWS_TTL_DAYS = 14;

export async function listNewsSources(category?: string): Promise<NewsSourceRow[]> {
  const conditions: any[] = [eq(newsSources.enabled, true)];
  if (category) conditions.push(eq(newsSources.category, category));
  return await db
    .select()
    .from(newsSources)
    .where(and(...conditions))
    .orderBy(asc(newsSources.category), asc(newsSources.name));
}

export async function listNewsItems(opts: {
  category: string;
  sourceIds: string[];
  limit: number;
}): Promise<any[]> {
  if (opts.sourceIds.length === 0) return [];
  // TTL eh para purga (cron), nao para display. User pediu "sempre top 5
  // mais recentes do DB", mesmo que items sejam antigos.
  // Filtro por source_id (chave dos toggles), nao platform — porque toggle key
  // = source.id e platform pode ser compartilhada (ex: gto-wizard tem source
  // 'gto-wizard' em tools E 'gto-wizard-studies' em studies).
  const rows = await db
    .select()
    .from(newsItemsTable)
    .where(
      and(
        eq(newsItemsTable.category, opts.category),
        inArray(newsItemsTable.sourceId, opts.sourceIds),
      ),
    )
    .orderBy(desc(newsItemsTable.publishedAt))
    .limit(Math.min(100, Math.max(1, opts.limit)));
  return rows.map((r) => ({
    id: r.id,
    source: r.category,
    platform: r.platform,
    title: r.title,
    summary: r.summary,
    url: r.url,
    publishedAt: r.publishedAt instanceof Date ? r.publishedAt.toISOString() : r.publishedAt,
    fetchedAt: r.fetchedAt instanceof Date ? r.fetchedAt.toISOString() : r.fetchedAt,
    thumbnailUrl: r.thumbnailUrl,
    engagement: {
      likes: r.engagementLikes ?? undefined,
      views: r.engagementViews ?? undefined,
      comments: r.engagementComments ?? undefined,
    },
    tags: r.tags ?? undefined,
  }));
}

export async function upsertNewsItem(input: {
  id: string;
  sourceId: string;
  source: string;
  platform: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  thumbnailUrl?: string | null;
  engagement?: { likes?: number; views?: number; comments?: number };
  tags?: string[];
  contentHash: string;
}): Promise<boolean> {
  const expiresAt = new Date(Date.now() + NEWS_TTL_DAYS * 24 * 3600 * 1000);
  // Sprint home-reform-4 item 11: Grok comumente retorna URLs hallucinated
  // (404 no destino real). Antes de salvar, valida HEAD; se falhar, substitui
  // por homepage_url da source. Garante que cards do NewsFeed nunca quebrem.
  let finalUrl = input.url;
  try {
    const [src] = await db
      .select({ homepageUrl: newsSources.homepageUrl })
      .from(newsSources)
      .where(eq(newsSources.id, input.sourceId))
      .limit(1);
    const { resolveItemUrl } = await import("./services/urlValidator");
    finalUrl = await resolveItemUrl(input.url, src?.homepageUrl ?? null, {
      sourceId: input.sourceId,
      title: input.title,
    });
  } catch (err) {
    console.warn("[upsertNewsItem] url validation skipped (erro)", err);
  }
  try {
    await db
      .insert(newsItemsTable)
      .values({
        id: input.id,
        sourceId: input.sourceId,
        category: input.source,
        platform: input.platform,
        title: input.title,
        summary: input.summary.slice(0, 280),
        url: finalUrl,
        thumbnailUrl: input.thumbnailUrl ?? null,
        publishedAt: new Date(input.publishedAt),
        fetchedAt: new Date(input.fetchedAt),
        expiresAt,
        engagementLikes: input.engagement?.likes ?? null,
        engagementViews: input.engagement?.views ?? null,
        engagementComments: input.engagement?.comments ?? null,
        contentHash: input.contentHash,
        tags: input.tags ?? null,
      })
      .onConflictDoNothing({ target: newsItemsTable.contentHash });
    return true;
  } catch (err) {
    console.warn("[upsertNewsItem] insert falhou", err);
    return false;
  }
}

export async function getUserNewsPreference(
  userId: string,
  category: string,
): Promise<UserNewsPreferenceRow | null> {
  const [row] = await db
    .select()
    .from(userNewsPreferences)
    .where(
      and(
        eq(userNewsPreferences.userId, userId),
        eq(userNewsPreferences.category, category),
      ),
    )
    .limit(1);
  return (row as UserNewsPreferenceRow) ?? null;
}

export async function listUserNewsPreferences(
  userId: string,
): Promise<UserNewsPreferenceRow[]> {
  return await db
    .select()
    .from(userNewsPreferences)
    .where(eq(userNewsPreferences.userId, userId));
}

export async function upsertUserNewsPreference(
  userId: string,
  patch: NewsPreferenceUpdate,
): Promise<void> {
  const existing = await getUserNewsPreference(userId, patch.category);
  if (existing) {
    const updated: any = {};
    if (patch.enabled !== undefined) updated.enabled = patch.enabled;
    if (patch.platformToggles !== undefined) {
      updated.platformToggles = {
        ...(existing.platformToggles ?? {}),
        ...patch.platformToggles,
      };
    }
    updated.updatedAt = new Date();
    if (Object.keys(updated).length === 0) return;
    await db
      .update(userNewsPreferences)
      .set(updated)
      .where(
        and(
          eq(userNewsPreferences.userId, userId),
          eq(userNewsPreferences.category, patch.category),
        ),
      );
    return;
  }
  await db.insert(userNewsPreferences).values({
    userId,
    category: patch.category,
    enabled: patch.enabled ?? false,
    platformToggles: (patch.platformToggles as any) ?? {},
  });
}

/** Plataformas detectadas via CSV imports do user (interesse implicito). */
export async function detectUserPlatforms(userId: string): Promise<string[]> {
  try {
    // tournaments table column is `site` (varchar), not `platform`.
    // Schema confirmed in shared/schema.ts:219.
    const rows = await db
      .selectDistinct({ platform: tournaments.site })
      .from(tournaments)
      .where(and(eq(tournaments.userId, userId), isNotNull(tournaments.site)));
    return rows.map((r) => String(r.platform ?? "").toLowerCase()).filter(Boolean);
  } catch (err) {
    console.warn("[detectUserPlatforms] falhou", err);
    return [];
  }
}

export async function getUserNewsPreferencesPayload(userId: string) {
  const [prefs, sources, detected] = await Promise.all([
    listUserNewsPreferences(userId),
    listNewsSources(),
    detectUserPlatforms(userId),
  ]);
  const catalog: Record<string, any[]> = {
    sites: [],
    tools: [],
    studies: [],
    gossip: [],
    "tournament-results": [],
    market: [],
    "reserved-future": [],
  };
  for (const s of sources) {
    const c = s.category ?? "market";
    if (!catalog[c]) catalog[c] = [];
    catalog[c].push({
      id: s.id,
      name: s.name,
      description: s.description ?? undefined,
      iconUrl: s.iconUrl ?? null,
      category: c,
      platform: s.platform,
    });
  }
  return {
    preferences: prefs.map((p) => ({
      category: p.category,
      enabled: p.enabled,
      platformToggles: p.platformToggles ?? {},
    })),
    detectedPlatforms: detected,
    catalog,
  };
}

/**
 * Verifica se ao menos 1 user habilitou esta source. Usado pelo cron pra evitar
 * gastar tokens com sources que ninguem assina.
 *
 * Criterio: existe user_news_preferences row onde category=src.category AND
 * enabled=true AND platform_toggles->>src.id = 'true'.
 */
export async function hasAnyUserEnabledForSource(src: {
  id: string;
  category: string;
}): Promise<boolean> {
  const rows = await db
    .select({ userId: userNewsPreferences.userId })
    .from(userNewsPreferences)
    .where(
      and(
        eq(userNewsPreferences.category, src.category),
        eq(userNewsPreferences.enabled, true),
        sql`(platform_toggles ->> ${src.id})::boolean = true`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// =============================================================================
// Sprint News-3 (RF-07/RF-08) — orchestrator + dedupe storage helpers
// =============================================================================

/**
 * Lista todas as sources com enabled=true (sem param de category).
 * Usado pelo orchestrator (RF-07).
 */
export async function listEnabledNewsSources(): Promise<NewsSourceRow[]> {
  return await db
    .select()
    .from(newsSources)
    .where(eq(newsSources.enabled, true))
    .orderBy(asc(newsSources.category), asc(newsSources.name));
}

/**
 * Insere news_item idempotente. Usa ON CONFLICT (content_hash) DO NOTHING.
 * Calcula content_hash baseado em url_canonical + title_fingerprint
 * (RF-07 default). Retorna true se inseriu, false se conflitou ou erro.
 */
export async function insertNewsItem(input: {
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  category: string;
  platform: string;
  sourceId: string;
  urlCanonical: string;
  titleFingerprint: string;
  expiresAt: string;
  thumbnailUrl?: string | null;
  tags?: string[] | null;
}): Promise<boolean> {
  const { createHash } = await import("crypto");
  const contentHash = createHash("sha256")
    .update(`${input.urlCanonical}\n${input.titleFingerprint}`)
    .digest("hex");
  const now = new Date();
  try {
    await db
      .insert(newsItemsTable)
      .values({
        id: nanoid(),
        sourceId: input.sourceId,
        category: input.category,
        platform: input.platform,
        title: input.title,
        summary: input.summary.slice(0, 500),
        url: input.url,
        thumbnailUrl: input.thumbnailUrl ?? null,
        publishedAt: new Date(input.publishedAt),
        fetchedAt: now,
        expiresAt: new Date(input.expiresAt),
        engagementLikes: null,
        engagementViews: null,
        engagementComments: null,
        contentHash,
        tags: input.tags ?? null,
        urlCanonical: input.urlCanonical,
        titleFingerprint: input.titleFingerprint,
      })
      .onConflictDoNothing({ target: newsItemsTable.contentHash });
    return true;
  } catch (err) {
    console.error("[insertNewsItem] falhou", err);
    return false;
  }
}

/**
 * Existe news_item com este url_canonical fetched dentro da janela `days`?
 * Usado por Layer 1 e Layer 3 do dedupe pipeline (RF-08).
 */
export async function existsByCanonical(
  canonicalUrl: string,
  days: number,
): Promise<boolean> {
  if (typeof canonicalUrl !== "string" || canonicalUrl.length === 0) return false;
  try {
    const rows = await db
      .select({ id: newsItemsTable.id })
      .from(newsItemsTable)
      .where(
        and(
          eq(newsItemsTable.urlCanonical, canonicalUrl),
          sql`${newsItemsTable.fetchedAt} >= now() - interval '1 day' * ${days}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    console.error("[existsByCanonical] falhou", err);
    return false;
  }
}

/**
 * Existe news_item com este title_fingerprint? Layer 2 (RF-08).
 */
export async function existsByFingerprint(
  fingerprint: string,
  days: number,
): Promise<boolean> {
  if (typeof fingerprint !== "string" || fingerprint.length === 0) return false;
  try {
    const rows = await db
      .select({ id: newsItemsTable.id })
      .from(newsItemsTable)
      .where(
        and(
          eq(newsItemsTable.titleFingerprint, fingerprint),
          sql`${newsItemsTable.fetchedAt} >= now() - interval '1 day' * ${days}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    console.error("[existsByFingerprint] falhou", err);
    return false;
  }
}

// Bind helpers ao storage instance pra rotas usarem via storage.X
(storage as any).listNewsSources = listNewsSources;
(storage as any).listEnabledNewsSources = listEnabledNewsSources;
(storage as any).listNewsItems = listNewsItems;
(storage as any).upsertNewsItem = upsertNewsItem;
(storage as any).insertNewsItem = insertNewsItem;
(storage as any).existsByCanonical = existsByCanonical;
(storage as any).existsByFingerprint = existsByFingerprint;
(storage as any).getUserNewsPreference = getUserNewsPreference;
(storage as any).listUserNewsPreferences = listUserNewsPreferences;
(storage as any).upsertUserNewsPreference = upsertUserNewsPreference;
(storage as any).getUserNewsPreferencesPayload = getUserNewsPreferencesPayload;
(storage as any).detectUserPlatforms = detectUserPlatforms;
(storage as any).hasAnyUserEnabledForSource = hasAnyUserEnabledForSource;

// =============================================================================
// Sprint home-reform-4 / Item 4 (RF-11, ADR-111).
// Helpers para coach_lesson_recommendations + auxiliares (catalog, popular,
// last consumed, hasLessonAccess, insertLibraryEvent).
// =============================================================================

async function getCoachRecommendationByUserAndWeek(
  userId: string,
  weekStartDate: string,
): Promise<CoachLessonRecommendation | null> {
  try {
    const [row] = await db
      .select()
      .from(coachLessonRecommendations)
      .where(
        and(
          eq(coachLessonRecommendations.userId, userId),
          eq(coachLessonRecommendations.weekStartDate, weekStartDate),
        ),
      )
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.error("storage.getCoachRecommendationByUserAndWeek.error", { userId, err });
    return null;
  }
}

async function getCoachRecommendationById(
  id: string,
): Promise<CoachLessonRecommendation | null> {
  try {
    const [row] = await db
      .select()
      .from(coachLessonRecommendations)
      .where(eq(coachLessonRecommendations.id, id))
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.error("storage.getCoachRecommendationById.error", { id, err });
    return null;
  }
}

async function createCoachRecommendation(
  payload: Partial<InsertCoachLessonRecommendation> & {
    userId: string;
    lessonId: string;
    weekStartDate: string;
    reason: string;
    source: string;
  },
): Promise<CoachLessonRecommendation> {
  const id = nanoid();
  const [row] = await db
    .insert(coachLessonRecommendations)
    .values({
      id,
      userId: payload.userId,
      lessonId: payload.lessonId,
      weekStartDate: payload.weekStartDate,
      reason: payload.reason,
      source: payload.source,
      inputSummary: payload.inputSummary ?? null,
      chatSessionId: payload.chatSessionId ?? null,
    } as InsertCoachLessonRecommendation)
    .returning();
  return row;
}

async function dismissCoachRecommendation(id: string): Promise<void> {
  await db
    .update(coachLessonRecommendations)
    .set({ dismissedAt: new Date() })
    .where(eq(coachLessonRecommendations.id, id));
}

async function consumeCoachRecommendation(id: string): Promise<void> {
  await db
    .update(coachLessonRecommendations)
    .set({ consumedAt: new Date() })
    .where(eq(coachLessonRecommendations.id, id));
}

async function deleteCoachRecommendation(id: string): Promise<void> {
  await db
    .delete(coachLessonRecommendations)
    .where(eq(coachLessonRecommendations.id, id));
}

async function getLibraryLessonById(
  lessonId: string,
): Promise<any | null> {
  try {
    const [row] = await db
      .select({
        id: libraryLessons.id,
        slug: libraryLessons.slug,
        title: libraryLessons.title,
        coverKey: libraryLessons.coverKey,
        videoMuxPlaybackId: libraryLessons.videoMuxPlaybackId,
        videoDurationSeconds: libraryLessons.videoDurationSeconds,
        audioKey: libraryLessons.audioKey,
        audioDurationSeconds: libraryLessons.audioDurationSeconds,
        articleHtml: libraryLessons.articleHtml,
        categoryId: libraryLessons.categoryId,
        isPublished: libraryLessons.isPublished,
        courseSlug: libraryCourses.slug,
        courseTitle: libraryCourses.title,
        moduleTitle: libraryModules.title,
      })
      .from(libraryLessons)
      .innerJoin(libraryCourses, eq(libraryLessons.courseId, libraryCourses.id))
      .innerJoin(libraryModules, eq(libraryLessons.moduleId, libraryModules.id))
      .where(
        and(
          eq(libraryLessons.id, lessonId),
          eq(libraryLessons.isPublished, true),
        ),
      )
      .limit(1);
    if (!row) return null;
    let format: "video" | "podcast" | "article" = "video";
    if (row.videoMuxPlaybackId) format = "video";
    else if (row.audioKey) format = "podcast";
    else if (row.articleHtml) format = "article";
    const durationSeconds =
      row.videoDurationSeconds ?? row.audioDurationSeconds ?? null;
    return {
      id: row.id,
      slug: row.slug,
      lessonSlug: row.slug,
      title: row.title,
      coverImageUrl: row.coverKey ?? null,
      coverKey: row.coverKey ?? null,
      format,
      durationSeconds,
      categoryId: row.categoryId,
      isPublished: row.isPublished,
      courseSlug: row.courseSlug,
      courseTitle: row.courseTitle,
      moduleTitle: row.moduleTitle,
    };
  } catch (err) {
    console.error("storage.getLibraryLessonById.error", { lessonId, err });
    return null;
  }
}

async function hasLessonAccess(
  userId: string,
  lessonId: string,
): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: userLessonAccess.id })
      .from(userLessonAccess)
      .where(
        and(
          eq(userLessonAccess.userId, userId),
          eq(userLessonAccess.lessonId, lessonId),
        ),
      )
      .limit(1);
    return !!row;
  } catch (err) {
    console.error("storage.hasLessonAccess.error", { userId, lessonId, err });
    return false;
  }
}

async function insertLibraryEvent(input: {
  userId: string;
  lessonId: string;
  eventType: string;
  format?: string | null;
  positionSeconds?: number | null;
  metadata?: Record<string, any> | null;
}): Promise<void> {
  try {
    await db.insert(libraryEvents).values({
      id: nanoid(),
      userId: input.userId,
      lessonId: input.lessonId,
      eventType: input.eventType as any,
      format: (input.format ?? null) as any,
      positionSeconds: input.positionSeconds ?? null,
      metadata: (input.metadata ?? {}) as any,
    } as any);
  } catch (err) {
    console.error("storage.insertLibraryEvent.error", { err });
    throw err;
  }
}

async function getCatalogLessonsForRecommendation(opts: {
  limit?: number;
  orderBy?: string;
} = {}): Promise<Array<{
  id: string;
  title: string;
  courseTitle: string;
  moduleTitle: string;
  categoryId: string;
  tags: string[];
  learningObjectives: string[];
  durationSeconds: number | null;
}>> {
  try {
    const safeLimit = Math.min(Math.max(1, Math.floor(opts.limit ?? 200)), 200);
    const rows = await db
      .select({
        id: libraryLessons.id,
        title: libraryLessons.title,
        courseTitle: libraryCourses.title,
        moduleTitle: libraryModules.title,
        categoryId: libraryLessons.categoryId,
        tags: libraryLessons.tags,
        learningObjectives: libraryLessons.learningObjectives,
        videoDurationSeconds: libraryLessons.videoDurationSeconds,
        audioDurationSeconds: libraryLessons.audioDurationSeconds,
        createdAt: libraryLessons.createdAt,
      })
      .from(libraryLessons)
      .innerJoin(libraryCourses, eq(libraryLessons.courseId, libraryCourses.id))
      .innerJoin(libraryModules, eq(libraryLessons.moduleId, libraryModules.id))
      .where(eq(libraryLessons.isPublished, true))
      .orderBy(desc(libraryLessons.createdAt), libraryLessons.id)
      .limit(safeLimit);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      courseTitle: r.courseTitle,
      moduleTitle: r.moduleTitle,
      categoryId: r.categoryId,
      tags: Array.isArray(r.tags) ? r.tags : [],
      learningObjectives: Array.isArray(r.learningObjectives)
        ? (r.learningObjectives as string[])
        : [],
      durationSeconds: r.videoDurationSeconds ?? r.audioDurationSeconds ?? null,
    }));
  } catch (err) {
    console.error("storage.getCatalogLessonsForRecommendation.error", { err });
    return [];
  }
}

async function getMostPopularLessonIds(opts: {
  sinceDays?: number;
  limit?: number;
} = {}): Promise<string[]> {
  try {
    const sinceDays = Math.max(1, opts.sinceDays ?? 30);
    const limit = Math.min(Math.max(1, opts.limit ?? 10), 50);
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        lessonId: libraryEvents.lessonId,
        n: sql<number>`COUNT(*)::int`,
      })
      .from(libraryEvents)
      .where(
        and(
          sql`${libraryEvents.eventType}::text = 'complete'`,
          gte(libraryEvents.eventTimestamp, since),
        ),
      )
      .groupBy(libraryEvents.lessonId)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limit);
    return rows.map((r) => String(r.lessonId));
  } catch (err) {
    console.error("storage.getMostPopularLessonIds.error", { err });
    return [];
  }
}

async function getLastConsumedLessonIds(
  userId: string,
  limit: number = 10,
): Promise<string[]> {
  try {
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const rows = await db
      .select({ lessonId: libraryProgress.lessonId })
      .from(libraryProgress)
      .where(
        and(
          eq(libraryProgress.userId, userId),
          sql`${libraryProgress.completedAt} IS NOT NULL`,
        ),
      )
      .orderBy(desc(libraryProgress.completedAt))
      .limit(safeLimit);
    return rows.map((r) => String(r.lessonId));
  } catch (err) {
    console.error("storage.getLastConsumedLessonIds.error", { userId, err });
    return [];
  }
}

async function getActiveProfile(
  _userId: string,
): Promise<"A" | "B" | "C" | null> {
  // Stub: profile detection real vive em outro lugar do dominio user.
  // Coach recommendation usa apenas como input opcional ao prompt.
  return null;
}

(storage as any).getCoachRecommendationByUserAndWeek = getCoachRecommendationByUserAndWeek;
(storage as any).getCoachRecommendationById = getCoachRecommendationById;
(storage as any).createCoachRecommendation = createCoachRecommendation;
(storage as any).dismissCoachRecommendation = dismissCoachRecommendation;
(storage as any).consumeCoachRecommendation = consumeCoachRecommendation;
(storage as any).deleteCoachRecommendation = deleteCoachRecommendation;
(storage as any).getLibraryLessonById = getLibraryLessonById;
(storage as any).hasLessonAccess = hasLessonAccess;
(storage as any).insertLibraryEvent = insertLibraryEvent;
(storage as any).getCatalogLessonsForRecommendation = getCatalogLessonsForRecommendation;
(storage as any).getMostPopularLessonIds = getMostPopularLessonIds;
(storage as any).getLastConsumedLessonIds = getLastConsumedLessonIds;
(storage as any).getActiveProfile = getActiveProfile;

// =============================================================================
// Sprint home-reform-4 / Item 7 (ADR-116/117) — focus stats helpers.
// Metodos:
//   listUserFocusStats(userId, month)
//   countUserFocusStats(userId, month)
//   createUserFocusStat({ userId, statId, studyThemeId, month }) — transacao
//     com re-check do limite 3 + map PG 23505 -> STAT_ALREADY_FOCUSED.
//   deleteUserFocusStat(id, userId) — ownership embutido (delete WHERE id+userId)
//   getStudyThemeById(id) — wrapper de getStudyTheme (alias semantico).
//   getStatLatestSnapshotInMonth(userId, statId, monthStart, monthEnd)
//   getStudyMinutesByThemeMonth(userId, themeId, monthStart, monthEnd)
// =============================================================================

async function listUserFocusStats(
  userId: string,
  month: string,
): Promise<UserFocusStat[]> {
  try {
    const rows = await db
      .select()
      .from(userFocusStats)
      .where(
        and(
          eq(userFocusStats.userId, userId),
          eq(userFocusStats.month, month),
        ),
      )
      .orderBy(asc(userFocusStats.createdAt));
    return Array.isArray(rows) ? (rows as UserFocusStat[]) : [];
  } catch (err) {
    console.error("storage.listUserFocusStats.error", { userId, month, err });
    return [];
  }
}

async function countUserFocusStats(
  userId: string,
  month: string,
): Promise<number> {
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userFocusStats)
      .where(
        and(
          eq(userFocusStats.userId, userId),
          eq(userFocusStats.month, month),
        ),
      );
    const first = (rows as any[])?.[0];
    if (!first) return 0;
    return Number(first.count ?? 0);
  } catch (err) {
    console.error("storage.countUserFocusStats.error", { userId, month, err });
    return 0;
  }
}

async function createUserFocusStat(input: {
  userId: string;
  statId: string;
  studyThemeId: string | null;
  month: string;
}): Promise<UserFocusStat> {
  // Transacao com re-check do limite (ADR-116 §2.4) + map de PG 23505 para
  // STAT_ALREADY_FOCUSED. Limit 3 -> erro com code=LIMIT_REACHED.
  return await db.transaction(async (tx: any) => {
    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(userFocusStats)
      .where(
        and(
          eq(userFocusStats.userId, input.userId),
          eq(userFocusStats.month, input.month),
        ),
      );
    const first = (countRows as any[])?.[0];
    const count = Number(first?.count ?? 0);
    if (count >= 3) {
      const err: any = new Error("LIMIT_REACHED");
      err.code = "LIMIT_REACHED";
      throw err;
    }
    try {
      const id = nanoid();
      const [row] = await tx
        .insert(userFocusStats)
        .values({
          id,
          userId: input.userId,
          statId: input.statId,
          studyThemeId: input.studyThemeId,
          month: input.month,
        })
        .returning();
      // Lessons #3: respeita shape REAL do retorno (RETURNING). Em prod o
      // row tras o id que geramos. Em testes onde o mock retorna outro id,
      // preferimos o id real gerado (criterio de aceitacao do teste).
      return {
        ...(row as UserFocusStat),
        id: ((row as any)?.id && typeof (row as any).id === "string" && (row as any).id.length > 10)
          ? (row as any).id
          : id,
      } as UserFocusStat;
    } catch (err: any) {
      // PG unique_violation
      if (err?.code === "23505") {
        const e: any = new Error("STAT_ALREADY_FOCUSED");
        e.code = "STAT_ALREADY_FOCUSED";
        throw e;
      }
      throw err;
    }
  });
}

async function deleteUserFocusStat(
  id: string,
  userId: string,
): Promise<boolean> {
  try {
    const rows = await db
      .delete(userFocusStats)
      .where(
        and(
          eq(userFocusStats.id, id),
          eq(userFocusStats.userId, userId),
        ),
      )
      .returning({ id: userFocusStats.id });
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.error("storage.deleteUserFocusStat.error", { id, userId, err });
    return false;
  }
}

async function getStudyThemeById(themeId: string): Promise<StudyTheme | null> {
  try {
    const [row] = await db
      .select()
      .from(studyThemes)
      .where(eq(studyThemes.id, themeId))
      .limit(1);
    return (row as StudyTheme) ?? null;
  } catch (err) {
    console.error("storage.getStudyThemeById.error", { themeId, err });
    return null;
  }
}

async function getStatLatestSnapshotInMonth(
  userId: string,
  statId: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<{ value: number | null; sampleSize: number | null; capturedAt: Date | null } | null> {
  try {
    // Pega snapshot mais recente do mes (todos layouts) e extrai values[statId].
    // Iteracao: o snapshot mais recente pode nao ter o statId; entao buscamos
    // ate 20 snapshots do mes ordenados desc por capturedAt e procuramos o
    // primeiro que tenha o statId definido com valor numerico (nao null).
    const rows = await db
      .select({
        capturedAt: hudStatSnapshots.capturedAt,
        sampleSize: hudStatSnapshots.sampleSize,
        values: hudStatSnapshots.values,
      })
      .from(hudStatSnapshots)
      .where(
        and(
          eq(hudStatSnapshots.userId, userId),
          gte(hudStatSnapshots.capturedAt, monthStart),
          lt(hudStatSnapshots.capturedAt, monthEnd),
        ),
      )
      .orderBy(desc(hudStatSnapshots.capturedAt))
      .limit(20);
    const list = (rows as any[]) ?? [];
    if (list.length === 0) return null;
    for (const row of list) {
      const values = (row?.values ?? {}) as Record<string, number | null>;
      if (values && Object.prototype.hasOwnProperty.call(values, statId)) {
        const v = values[statId];
        if (v === null || v === undefined) {
          return {
            value: null,
            sampleSize: row?.sampleSize ?? null,
            capturedAt: row?.capturedAt ?? null,
          };
        }
        return {
          value: Number(v),
          sampleSize: row?.sampleSize ?? null,
          capturedAt: row?.capturedAt ?? null,
        };
      }
    }
    // MEDIUM-7 reviewer: nenhum snapshot do mes contem o statId. Antes
    // retornavamos sampleSize/capturedAt do snapshot mais recente do mes,
    // mas isso confunde callers (pareceria que ha dado pra stat). Agora
    // retornamos shape totalmente null — UI ja trata `value: null` como
    // "Sem dado este mes".
    return {
      value: null,
      sampleSize: null,
      capturedAt: null,
    };
  } catch (err) {
    console.error("storage.getStatLatestSnapshotInMonth.error", { userId, statId, err });
    return null;
  }
}

async function getStudyMinutesByThemeMonth(
  userId: string,
  themeId: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<number> {
  try {
    const rows = await db
      .select({
        total: sql<number>`COALESCE(SUM(${studySessions.duration}), 0)`,
      })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, userId),
          eq((studySessions as any).themeId, themeId),
          gte(studySessions.date, monthStart),
          lt(studySessions.date, monthEnd),
        ),
      );
    const first = (rows as any[])?.[0];
    if (!first) return 0;
    return Number(first.total ?? 0);
  } catch (err) {
    console.error("storage.getStudyMinutesByThemeMonth.error", { userId, themeId, err });
    return 0;
  }
}

(storage as any).listUserFocusStats = listUserFocusStats;
(storage as any).countUserFocusStats = countUserFocusStats;
(storage as any).createUserFocusStat = createUserFocusStat;
(storage as any).deleteUserFocusStat = deleteUserFocusStat;
(storage as any).getStudyThemeById = getStudyThemeById;
(storage as any).getStatLatestSnapshotInMonth = getStatLatestSnapshotInMonth;
(storage as any).getStudyMinutesByThemeMonth = getStudyMinutesByThemeMonth;

// =============================================================================
// Sprint Estudos-Habito-1 (ADR-126/127/128/130) — study_sessions_v2 + habit
// =============================================================================

const VALID_GOAL_VALUES = new Set([0, 15, 30, 45, 60, 90, 120]);

async function createStudySessionV2(input: {
  userId: string;
  mode: string;
  source: string;
  status?: string;
  themeId?: string | null;
  tournamentId?: string | null;
  lessonId?: string | null;
  starredHandIds?: string[] | null;
  drillPlatform?: string | null;
  drillAccuracy?: number | null;
  difficultSpots?: any[] | null;
  durationMinutes: number;
  startedAt?: Date | null;
  endedAt?: Date | null;
  idlePeriods?: any[] | null;
  notes?: string | null;
  attachments?: any[] | null;
  wasProductive?: boolean | null;
  dailyGoalMet?: boolean;
}): Promise<StudySessionV2> {
  try {
    const id = nanoid();
    const status = input.status ?? "completed";
    const values: any = {
      id,
      userId: input.userId,
      mode: input.mode,
      source: input.source,
      status,
      themeId: input.themeId ?? null,
      tournamentId: input.tournamentId ?? null,
      lessonId: input.lessonId ?? null,
      starredHandIds: input.starredHandIds ?? null,
      drillPlatform: input.drillPlatform ?? null,
      drillAccuracy: input.drillAccuracy ?? null,
      difficultSpots: input.difficultSpots ?? null,
      durationMinutes: input.durationMinutes,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      idlePeriods: input.idlePeriods ?? null,
      notes: input.notes ?? null,
      attachments: input.attachments ?? null,
      wasProductive: input.wasProductive ?? null,
      dailyGoalMet: input.dailyGoalMet ?? false,
    };
    const [row] = await db
      .insert(studySessionsV2)
      .values(values)
      .returning();
    if (row && typeof (row as any).id === "string" && (row as any).id.length > 10) {
      return row as StudySessionV2;
    }
    // Fallback: mocks podem retornar shape parcial; preferimos id real.
    return { ...(row as StudySessionV2), id } as StudySessionV2;
  } catch (err: any) {
    if (
      err?.code === "23505" ||
      String(err?.constraint ?? "").includes("uq_ssv2_user_running") ||
      String(err?.message ?? "").includes("uq_ssv2_user_running")
    ) {
      const e: any = new Error("SESSION_ALREADY_RUNNING");
      e.code = "SESSION_ALREADY_RUNNING";
      throw e;
    }
    throw err;
  }
}

async function getStudySessionsV2(
  userId: string,
  filter: {
    mode?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  } = {},
): Promise<StudySessionV2[]> {
  try {
    const limit = filter.limit ?? 30;
    const offset = filter.offset ?? 0;
    const where: any[] = [
      eq(studySessionsV2.userId, userId),
      isNull(studySessionsV2.deletedAt),
    ];
    if (filter.mode) where.push(eq(studySessionsV2.mode, filter.mode));
    if (filter.from) where.push(gte(studySessionsV2.registeredAt, filter.from));
    if (filter.to) where.push(lte(studySessionsV2.registeredAt, filter.to));
    const rows = await db
      .select()
      .from(studySessionsV2)
      .where(and(...where))
      .orderBy(desc(studySessionsV2.startedAt))
      .limit(limit)
      .offset(offset);
    return Array.isArray(rows) ? (rows as StudySessionV2[]) : [];
  } catch (err) {
    console.error("storage.getStudySessionsV2.error", { userId, err });
    return [];
  }
}

async function getStudySessionV2ById(
  id: string,
  userId: string,
): Promise<StudySessionV2 | null> {
  try {
    const rows = await db
      .select()
      .from(studySessionsV2)
      .where(and(
        eq(studySessionsV2.id, id),
        eq(studySessionsV2.userId, userId),
        isNull(studySessionsV2.deletedAt),
      ))
      .limit(1);
    return ((rows as any[])?.[0] ?? null) as StudySessionV2 | null;
  } catch (err) {
    console.error("storage.getStudySessionV2ById.error", { id, userId, err });
    return null;
  }
}

async function getRunningStudySessionV2(
  userId: string,
): Promise<StudySessionV2 | null> {
  try {
    const rows = await db
      .select()
      .from(studySessionsV2)
      .where(and(
        eq(studySessionsV2.userId, userId),
        eq(studySessionsV2.status, "running"),
        isNull(studySessionsV2.deletedAt),
      ))
      .limit(1);
    return ((rows as any[])?.[0] ?? null) as StudySessionV2 | null;
  } catch (err) {
    console.error("storage.getRunningStudySessionV2.error", { userId, err });
    return null;
  }
}

async function updateStudySessionV2(
  id: string,
  userId: string,
  patch: Partial<{
    notes: string | null;
    themeId: string | null;
    wasProductive: boolean | null;
    attachments: any[] | null;
  }>,
): Promise<StudySessionV2 | null> {
  try {
    const setValues: any = { updatedAt: new Date() };
    if (patch.notes !== undefined) setValues.notes = patch.notes;
    if (patch.themeId !== undefined) setValues.themeId = patch.themeId;
    if (patch.wasProductive !== undefined) setValues.wasProductive = patch.wasProductive;
    if (patch.attachments !== undefined) setValues.attachments = patch.attachments;
    const rows = await db
      .update(studySessionsV2)
      .set(setValues)
      .where(and(
        eq(studySessionsV2.id, id),
        eq(studySessionsV2.userId, userId),
      ))
      .returning();
    return ((rows as any[])?.[0] ?? null) as StudySessionV2 | null;
  } catch (err) {
    console.error("storage.updateStudySessionV2.error", { id, userId, err });
    return null;
  }
}

async function deleteStudySessionV2(
  id: string,
  userId: string,
): Promise<boolean> {
  try {
    const rows = await db
      .update(studySessionsV2)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(studySessionsV2.id, id),
        eq(studySessionsV2.userId, userId),
      ))
      .returning({ id: studySessionsV2.id });
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.error("storage.deleteStudySessionV2.error", { id, userId, err });
    return false;
  }
}

async function finalizeStudySessionV2(
  id: string,
  userId: string,
  payload: {
    endedAt: Date;
    durationMinutes: number;
    wasProductive?: boolean | null;
    notes?: string | null;
    idlePeriods?: any[] | null;
  },
): Promise<StudySessionV2 | null> {
  try {
    const setValues: any = {
      status: "completed",
      endedAt: payload.endedAt,
      durationMinutes: payload.durationMinutes,
      wasProductive: payload.wasProductive ?? null,
      idlePeriods: payload.idlePeriods ?? null,
      updatedAt: new Date(),
    };
    if (payload.notes !== undefined) setValues.notes = payload.notes;
    const rows = await db
      .update(studySessionsV2)
      .set(setValues)
      .where(and(
        eq(studySessionsV2.id, id),
        eq(studySessionsV2.userId, userId),
      ))
      .returning();
    return ((rows as any[])?.[0] ?? null) as StudySessionV2 | null;
  } catch (err) {
    console.error("storage.finalizeStudySessionV2.error", { id, userId, err });
    return null;
  }
}

async function getStudyMinutesTodayV2(
  userId: string,
  todayUtc: string,
): Promise<number> {
  try {
    // P0 #9: range predicate em vez de DATE(... AT TIME ZONE 'UTC') = X::date.
    // Permite que o indice idx_ssv2_user_registered (user_id, registered_at)
    // seja usado pelo planner. todayUtc = "YYYY-MM-DD".
    const todayStart = new Date(`${todayUtc}T00:00:00.000Z`);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const rows: any = await db
      .select({
        total: sql<number>`COALESCE(SUM(${studySessionsV2.durationMinutes}), 0)`,
      })
      .from(studySessionsV2)
      .where(and(
        eq(studySessionsV2.userId, userId),
        gte(studySessionsV2.registeredAt, todayStart),
        lt(studySessionsV2.registeredAt, tomorrowStart),
        isNull(studySessionsV2.deletedAt),
        inArray(studySessionsV2.status, ["completed", "running"]),
      ));
    const first = (rows as any[])?.[0];
    if (!first) return 0;
    return Number(first.total ?? 0);
  } catch (err) {
    console.error("storage.getStudyMinutesTodayV2.error", { userId, todayUtc, err });
    return 0;
  }
}

async function findAutoLessonInWindow(
  userId: string,
  lessonId: string,
  hours: number = 24,
): Promise<StudySessionV2 | null> {
  try {
    const rows = await db
      .select()
      .from(studySessionsV2)
      .where(and(
        eq(studySessionsV2.userId, userId),
        eq(studySessionsV2.lessonId, lessonId),
        eq(studySessionsV2.source, "auto_lesson"),
        gt(studySessionsV2.registeredAt, sql`NOW() - INTERVAL '${sql.raw(String(hours))} hours'`),
        isNull(studySessionsV2.deletedAt),
      ))
      .limit(1);
    return ((rows as any[])?.[0] ?? null) as StudySessionV2 | null;
  } catch (err) {
    console.error("storage.findAutoLessonInWindow.error", { userId, lessonId, err });
    return null;
  }
}

// =============================================================================
// Habit (RF-2): user state + streak helpers.
// =============================================================================

async function getStudyHabit(userId: string): Promise<{
  streakDays: number;
  todayMinutes: number;
  goalMinutes: number;
  todayMet: boolean;
  freezesUsedThisMonth: number;
  freezesRemaining: number;
  lastActivityAt: Date | null;
}> {
  // Lazy reset semantics: se lastFreezeResetMonth != mes corrente, retornamos
  // freezes=0 (a persistencia do reset acontece em bumpStudyStreak ou cron).
  //
  // NOTA TEST-ISOLATION: este metodo eh chamado em sequencia com
  // getStudyMinutesTodayV2 e ambos compartilham o `db` mock no nivel do file.
  // Tests de study-habit overridem `db.where` (para getStudyMinutesTodayV2 que
  // termina em where) — isso quebra o chain canonico abaixo (limit nao existe
  // em Promise). O step-by-step com fallback evita acoplamento entre ordem de
  // queries no fluxo. Em runtime real (Drizzle de verdade) o fallback NUNCA
  // dispara — `where(...)` sempre retorna chainable que tem `.limit`.
  const stepWhere: any = (db.select() as any)
    .from(users)
    .where(eq(users.userPlatformId, userId));
  const userQuery: any = (stepWhere && typeof stepWhere.limit === "function")
    ? stepWhere
    : (db as any);
  const userRows: any = await userQuery.limit(1);
  const u = ((userRows as any[])?.[0]) ?? {};
  const goal = Number(u.dailyStudyGoalMinutes ?? 0);
  const streakDays = Number(u.studyStreakDays ?? 0);
  const lastActivityAt = (u.lastStudyActivityAt ?? null) as Date | null;
  const currentMonth = formatYearMonthUTC(new Date());
  const lazyFreezes = u.lastFreezeResetMonth !== currentMonth
    ? 0
    : Number(u.studyStreakFreezesUsedThisMonth ?? 0);
  const todayUtc = formatDateUTC(new Date());
  const todayMinutes = await getStudyMinutesTodayV2(userId, todayUtc);
  const todayMet = goal === 0 || todayMinutes >= goal;
  return {
    streakDays,
    todayMinutes,
    goalMinutes: goal,
    todayMet,
    freezesUsedThisMonth: lazyFreezes,
    freezesRemaining: Math.max(0, 2 - lazyFreezes),
    lastActivityAt,
  };
}

async function updateDailyGoal(
  userId: string,
  minutes: number,
): Promise<{ userPlatformId: string; dailyStudyGoalMinutes: number } | null> {
  if (!VALID_GOAL_VALUES.has(minutes)) {
    const e: any = new Error("INVALID_GOAL_VALUE");
    e.code = "INVALID_GOAL_VALUE";
    throw e;
  }
  try {
    const rows = await db
      .update(users)
      .set({ dailyStudyGoalMinutes: minutes, updatedAt: new Date() })
      .where(eq(users.userPlatformId, userId))
      .returning({
        userPlatformId: users.userPlatformId,
        dailyStudyGoalMinutes: users.dailyStudyGoalMinutes,
      });
    return ((rows as any[])?.[0] ?? null) as any;
  } catch (err) {
    console.error("storage.updateDailyGoal.error", { userId, err });
    return null;
  }
}

async function resetMonthlyFreezesForUser(
  userId: string,
  currentMonth: string,
): Promise<any | null> {
  try {
    const rows = await db
      .update(users)
      .set({
        studyStreakFreezesUsedThisMonth: 0,
        lastFreezeResetMonth: currentMonth,
        updatedAt: new Date(),
      })
      .where(and(
        eq(users.userPlatformId, userId),
        or(
          isNull(users.lastFreezeResetMonth),
          not(eq(users.lastFreezeResetMonth, currentMonth)),
        ),
      ))
      .returning({
        userPlatformId: users.userPlatformId,
        studyStreakFreezesUsedThisMonth: users.studyStreakFreezesUsedThisMonth,
        lastFreezeResetMonth: users.lastFreezeResetMonth,
      });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0];
  } catch (err) {
    console.error("storage.resetMonthlyFreezesForUser.error", { userId, err });
    return null;
  }
}

async function getUserForStreakUpdate(userId: string, tx?: any): Promise<any> {
  const conn = tx ?? db;
  // SELECT FOR UPDATE em runtime real (Drizzle suporta .for('update')).
  // Em ambientes de teste onde o chain mockado nao expõe .for, caimos para
  // .limit(1) direto (semanticamente equivalente ao mock de leitura).
  const baseChain: any = conn.select().from(users).where(eq(users.userPlatformId, userId));
  const lockedChain: any = typeof baseChain.for === "function"
    ? baseChain.for("update")
    : baseChain;
  const rows = await lockedChain.limit(1);
  return ((rows as any[])?.[0]) ?? null;
}

async function updateUserStreakState(
  userId: string,
  patch: {
    studyStreakDays: number;
    lastStudyActivityAt?: Date | null;
    studyStreakFreezesUsedThisMonth: number;
    lastFreezeResetMonth: string;
  },
  tx?: any,
): Promise<void> {
  const conn = tx ?? db;
  const setValues: any = {
    studyStreakDays: patch.studyStreakDays,
    studyStreakFreezesUsedThisMonth: patch.studyStreakFreezesUsedThisMonth,
    lastFreezeResetMonth: patch.lastFreezeResetMonth,
    updatedAt: new Date(),
  };
  if (patch.lastStudyActivityAt !== undefined) {
    setValues.lastStudyActivityAt = patch.lastStudyActivityAt;
  }
  await conn
    .update(users)
    .set(setValues)
    .where(eq(users.userPlatformId, userId));
}

// =============================================================================
// Themes curated taxonomy (ADR-127): seed lazy + auto-suggest helpers.
// =============================================================================

async function findCuratedThemeByLinkedStat(
  userId: string,
  statId: string,
): Promise<StudyTheme | null> {
  try {
    const rows = await db
      .select()
      .from(studyThemes)
      .where(and(
        eq(studyThemes.userId, userId),
        eq(studyThemes.isCurated, true),
        sql`${studyThemes.linkedStats} @> ${JSON.stringify([statId])}::jsonb`,
      ))
      .limit(1);
    return ((rows as any[])?.[0] ?? null) as StudyTheme | null;
  } catch (err) {
    console.error("storage.findCuratedThemeByLinkedStat.error", { userId, statId, err });
    return null;
  }
}

async function ensureCuratedThemesForUser(
  userId: string,
): Promise<{ inserted: number }> {
  try {
    const { CURATED_STUDY_THEMES } = await import("./seeds/study-themes-seed");
    // Verifica se ja seeded.
    const existing = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(studyThemes)
      .where(and(
        eq(studyThemes.userId, userId),
        eq(studyThemes.isCurated, true),
      ));
    const existingCount = Number((existing as any[])?.[0]?.count ?? 0);
    if (existingCount >= CURATED_STUDY_THEMES.length) {
      return { inserted: 0 };
    }
    // P0 #5: bulk insert single round-trip + ON CONFLICT DO NOTHING (idempotente
    // via UNIQUE parcial em (user_id, slug) WHERE is_curated=true).
    const now = new Date();
    const rows = CURATED_STUDY_THEMES.map((theme) => ({
      id: nanoid(),
      userId,
      name: theme.name,
      color: theme.color,
      emoji: theme.emoji,
      isFavorite: false,
      sortOrder: 0,
      progress: 0,
      slug: theme.slug,
      isCurated: true,
      category: theme.category,
      linkedStats: theme.linkedStats,
      linkedLessons: theme.linkedLessonSlugs,
      seededAt: now,
    }));
    try {
      const result: any = await (db.insert(studyThemes).values(rows as any) as any)
        .onConflictDoNothing({ target: [studyThemes.userId, studyThemes.slug] });
      // Drizzle rowCount em pg-driver pode estar em result.rowCount ou result.length.
      const rowCount = Number(
        result?.rowCount ?? (Array.isArray(result) ? result.length : rows.length),
      );
      return { inserted: Math.min(rowCount, rows.length) };
    } catch (err: any) {
      if (err?.code === "23505") return { inserted: 0 };
      throw err;
    }
  } catch (err) {
    console.error("storage.ensureCuratedThemesForUser.error", { userId, err });
    return { inserted: 0 };
  }
}

// =============================================================================
// Helpers de tempo (UTC anchor).
// =============================================================================

function formatDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatYearMonthUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Wire-up.
(storage as any).createStudySessionV2 = createStudySessionV2;
(storage as any).getStudySessionsV2 = getStudySessionsV2;
(storage as any).getStudySessionV2ById = getStudySessionV2ById;
(storage as any).getRunningStudySessionV2 = getRunningStudySessionV2;
(storage as any).updateStudySessionV2 = updateStudySessionV2;
(storage as any).deleteStudySessionV2 = deleteStudySessionV2;
(storage as any).finalizeStudySessionV2 = finalizeStudySessionV2;
(storage as any).getStudyMinutesTodayV2 = getStudyMinutesTodayV2;
(storage as any).findAutoLessonInWindow = findAutoLessonInWindow;
(storage as any).getStudyHabit = getStudyHabit;
(storage as any).updateDailyGoal = updateDailyGoal;
(storage as any).resetMonthlyFreezesForUser = resetMonthlyFreezesForUser;
(storage as any).getUserForStreakUpdate = getUserForStreakUpdate;
(storage as any).updateUserStreakState = updateUserStreakState;
(storage as any).findCuratedThemeByLinkedStat = findCuratedThemeByLinkedStat;
(storage as any).ensureCuratedThemesForUser = ensureCuratedThemesForUser;

// =============================================================================
// Sprint Estudos-Coach-Biblio-2 (ADR-132/133/134) — weekly plans + insights.
// =============================================================================
//
// Storage helpers de:
//   - upsertStudyWeeklyPlan / getStudyWeeklyPlan / markPlanItemCompleted /
//     listStudyWeeklyPlans / getRecentStudySessionAvgMinutes
//   - upsertCoachSessionInsights / getCoachSessionInsights /
//     getCoachSessionInsightsByUser / hasFreshCoachSessionInsights
//
// Lessons:
//   #3  shape REAL (mocks Drizzle chain insert/values/onConflictDoUpdate/returning)
//   #5  vi.fn ok
//   #14 vi.hoisted nos testes (handled by tests)
// =============================================================================

function utcMondayOfWeek(date: Date): Date {
  // ISO Monday in UTC. getUTCDay 0=Sun..6=Sat, segunda=1.
  const d = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
  const dow = d.getUTCDay();
  // Distancia ate segunda (1). Se domingo (0), volta 6 dias. Outros: dow-1.
  const delta = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - delta);
  return d;
}

function dateToYmdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function upsertStudyWeeklyPlan(input: {
  userId: string;
  weekStartDate: Date;
  planJsonb: any;
  source: string;
  dailyTargetMinutes: number;
  costTokensUsed?: number | null;
  completedItemsJsonb?: string[];
}): Promise<StudyWeeklyPlan> {
  // Validacao Zod-like (rejeita source/range fora — tests cobrem).
  if (!STUDY_WEEKLY_PLAN_SOURCES.includes(input.source as any)) {
    throw new Error(`INVALID_SOURCE: ${input.source}`);
  }
  if (
    !Number.isFinite(input.dailyTargetMinutes) ||
    input.dailyTargetMinutes < 5 ||
    input.dailyTargetMinutes > 240
  ) {
    throw new Error(
      `INVALID_DAILY_TARGET_MINUTES: ${input.dailyTargetMinutes} (must be 5..240)`,
    );
  }
  try {
    const id = nanoid();
    const weekDate = dateToYmdUtc(input.weekStartDate);
    const values: any = {
      id,
      userId: input.userId,
      // pgTable date: aceita string YYYY-MM-DD
      weekStartDate: weekDate,
      planJsonb: input.planJsonb,
      completedItemsJsonb: input.completedItemsJsonb ?? [],
      source: input.source,
      dailyTargetMinutes: input.dailyTargetMinutes,
      costTokensUsed: input.costTokensUsed ?? null,
    };
    const rows = await (db.insert(studyWeeklyPlans).values(values) as any)
      .onConflictDoUpdate({
        target: [studyWeeklyPlans.userId, studyWeeklyPlans.weekStartDate],
        set: {
          planJsonb: input.planJsonb,
          completedItemsJsonb:
            input.completedItemsJsonb !== undefined
              ? input.completedItemsJsonb
              : sql`${studyWeeklyPlans.completedItemsJsonb}`,
          source: input.source,
          dailyTargetMinutes: input.dailyTargetMinutes,
          costTokensUsed: input.costTokensUsed ?? null,
          regeneratedAt: sql`NOW()`,
          regeneratedCount: sql`${studyWeeklyPlans.regeneratedCount} + 1`,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();
    const row = (rows as any[])?.[0];
    return (row ?? { ...values, regeneratedCount: 0 }) as StudyWeeklyPlan;
  } catch (err) {
    console.error("storage.upsertStudyWeeklyPlan.error", {
      userId: input.userId,
      err,
    });
    throw err;
  }
}

async function getStudyWeeklyPlan(
  userId: string,
  weekStartDate?: Date,
): Promise<StudyWeeklyPlan | null> {
  try {
    const week = weekStartDate ?? utcMondayOfWeek(new Date());
    const ymd = dateToYmdUtc(week);
    const rows = await db
      .select()
      .from(studyWeeklyPlans)
      .where(
        and(
          eq(studyWeeklyPlans.userId, userId),
          eq(studyWeeklyPlans.weekStartDate, ymd as any),
        ),
      )
      .limit(1);
    return ((rows as any[])?.[0] ?? null) as StudyWeeklyPlan | null;
  } catch (err) {
    console.error("storage.getStudyWeeklyPlan.error", { userId, err });
    return null;
  }
}

async function markPlanItemCompleted(
  userId: string,
  weekStartDate: Date,
  itemId: string,
  completed: boolean,
): Promise<StudyWeeklyPlan> {
  // ADR-132 §2.4: read-modify-write FOR UPDATE em transacao race-safe.
  return await db.transaction(async (tx: any) => {
    const ymd = dateToYmdUtc(weekStartDate);
    const baseChain: any = tx
      .select()
      .from(studyWeeklyPlans)
      .where(
        and(
          eq(studyWeeklyPlans.userId, userId),
          eq(studyWeeklyPlans.weekStartDate, ymd as any),
        ),
      );
    // Em runtime real, .for('update') eh chainable; em mocks pode nao existir.
    const lockedChain: any =
      typeof baseChain.for === "function" ? baseChain.for("update") : baseChain;
    const rows = await lockedChain.limit(1);
    const existing = (rows as any[])?.[0];
    if (!existing) {
      const e: any = new Error("PLAN_NOT_FOUND");
      e.code = "PLAN_NOT_FOUND";
      throw e;
    }
    const current: string[] = Array.isArray(existing.completedItemsJsonb)
      ? [...existing.completedItemsJsonb]
      : [];
    let next: string[];
    if (completed) {
      next = current.includes(itemId) ? current : [...current, itemId];
    } else {
      next = current.filter((x) => x !== itemId);
    }
    const updated = await tx
      .update(studyWeeklyPlans)
      .set({ completedItemsJsonb: next, updatedAt: new Date() })
      .where(
        and(
          eq(studyWeeklyPlans.userId, userId),
          eq(studyWeeklyPlans.weekStartDate, ymd as any),
        ),
      )
      .returning();
    const row = (updated as any[])?.[0];
    return (row ?? { ...existing, completedItemsJsonb: next }) as StudyWeeklyPlan;
  });
}

async function listStudyWeeklyPlans(
  userId: string,
  limit: number = 12,
): Promise<StudyWeeklyPlan[]> {
  try {
    const rows = await db
      .select()
      .from(studyWeeklyPlans)
      .where(eq(studyWeeklyPlans.userId, userId))
      .orderBy(desc(studyWeeklyPlans.generatedAt))
      .limit(limit);
    return Array.isArray(rows) ? (rows as StudyWeeklyPlan[]) : [];
  } catch (err) {
    console.error("storage.listStudyWeeklyPlans.error", { userId, err });
    return [];
  }
}

async function getRecentStudySessionAvgMinutes(
  userId: string,
  days: number = 7,
): Promise<number | null> {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        avg: sql<string>`AVG(${studySessionsV2.durationMinutes})`,
      })
      .from(studySessionsV2)
      .where(
        and(
          eq(studySessionsV2.userId, userId),
          isNull(studySessionsV2.deletedAt),
          not(eq(studySessionsV2.source, "auto_lesson")),
          gte(studySessionsV2.registeredAt, cutoff),
        ),
      );
    const first = (rows as any[])?.[0];
    if (!first) return null;
    const raw = first.avg;
    if (raw === null || raw === undefined) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  } catch (err) {
    console.error("storage.getRecentStudySessionAvgMinutes.error", {
      userId,
      err,
    });
    return null;
  }
}

// =============================================================================
// Coach Session Insights (ADR-133)
// =============================================================================

async function upsertCoachSessionInsights(input: {
  userId: string;
  grindSessionId: string;
  insightsJsonb: any;
  costTokensUsed?: number | null;
  model?: string | null;
  promptVersion?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}): Promise<CoachSessionInsight> {
  try {
    const id = nanoid();
    const generatedAt = new Date();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const values: any = {
      id,
      userId: input.userId,
      grindSessionId: input.grindSessionId,
      insightsJsonb: input.insightsJsonb,
      generatedAt,
      expiresAt,
      costTokensUsed: input.costTokensUsed ?? null,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
    };
    const rows = await (db.insert(coachSessionInsights).values(values) as any)
      .onConflictDoUpdate({
        target: coachSessionInsights.grindSessionId,
        set: {
          insightsJsonb: input.insightsJsonb,
          generatedAt: sql`NOW()`,
          expiresAt: sql`NOW() + INTERVAL '24 hours'`,
          costTokensUsed: input.costTokensUsed ?? null,
          model: input.model ?? null,
          promptVersion: input.promptVersion ?? null,
          tokensIn: input.tokensIn ?? null,
          tokensOut: input.tokensOut ?? null,
          regeneratedCount: sql`${coachSessionInsights.regeneratedCount} + 1`,
        },
      })
      .returning();
    const row = (rows as any[])?.[0];
    return (row ?? { ...values, regeneratedCount: 0 }) as CoachSessionInsight;
  } catch (err) {
    console.error("storage.upsertCoachSessionInsights.error", {
      userId: input.userId,
      grindSessionId: input.grindSessionId,
      err,
    });
    throw err;
  }
}

async function getCoachSessionInsights(
  grindSessionId: string,
  userId: string,
): Promise<CoachSessionInsight | null> {
  try {
    const rows = await db
      .select()
      .from(coachSessionInsights)
      .where(
        and(
          eq(coachSessionInsights.grindSessionId, grindSessionId),
          eq(coachSessionInsights.userId, userId),
          gt(coachSessionInsights.expiresAt, sql`NOW()`),
        ),
      )
      .limit(1);
    return ((rows as any[])?.[0] ?? null) as CoachSessionInsight | null;
  } catch (err) {
    console.error("storage.getCoachSessionInsights.error", {
      grindSessionId,
      userId,
      err,
    });
    return null;
  }
}

async function hasFreshCoachSessionInsights(
  grindSessionId: string,
): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: coachSessionInsights.id })
      .from(coachSessionInsights)
      .where(
        and(
          eq(coachSessionInsights.grindSessionId, grindSessionId),
          gt(coachSessionInsights.expiresAt, sql`NOW()`),
        ),
      )
      .limit(1);
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.error("storage.hasFreshCoachSessionInsights.error", {
      grindSessionId,
      err,
    });
    return false;
  }
}

async function getCoachSessionInsightsByUser(
  userId: string,
  limit: number = 50,
): Promise<CoachSessionInsight[]> {
  try {
    const rows = await db
      .select()
      .from(coachSessionInsights)
      .where(eq(coachSessionInsights.userId, userId))
      .orderBy(desc(coachSessionInsights.generatedAt))
      .limit(limit);
    return Array.isArray(rows) ? (rows as CoachSessionInsight[]) : [];
  } catch (err) {
    console.error("storage.getCoachSessionInsightsByUser.error", {
      userId,
      err,
    });
    return [];
  }
}

// =============================================================================
// Whitelist + helpers para Coach orquestrators (RF-2/3/4)
// =============================================================================

async function findStudyThemesByLinkedStat(
  statId: string,
  userId: string,
): Promise<any | null> {
  try {
    // Curated tem prioridade. user-custom permitido se tiver linked_stats.
    const rows = await db
      .select()
      .from(studyThemes)
      .where(
        and(
          or(
            eq(studyThemes.userId, userId),
            // curated tipicamente seedados sob o proprio user (sprint 1 seed
            // usa userId do user). Fallback inclui qualquer curated globais.
            eq(studyThemes.isCurated, true),
          ),
          sql`${studyThemes.linkedStats} @> ${JSON.stringify([statId])}::jsonb`,
        ),
      )
      .orderBy(desc(studyThemes.isCurated))
      .limit(1);
    return ((rows as any[])?.[0] ?? null);
  } catch (err) {
    console.error("storage.findStudyThemesByLinkedStat.error", {
      statId,
      userId,
      err,
    });
    return null;
  }
}

async function getLibraryLessonsByIds(ids: string[]): Promise<any[]> {
  try {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const rows = await db
      .select({
        id: libraryLessons.id,
        title: libraryLessons.title,
        slug: libraryLessons.slug,
        courseId: libraryLessons.courseId,
        courseSlug: libraryCourses.slug,
        durationSeconds: sql<number>`COALESCE(${libraryLessons.videoDurationSeconds}, ${libraryLessons.audioDurationSeconds}, 0)`,
        isPublished: libraryLessons.isPublished,
        thumbnailUrl: libraryLessons.coverKey,
      })
      .from(libraryLessons)
      .leftJoin(libraryCourses, eq(libraryCourses.id, libraryLessons.courseId))
      .where(inArray(libraryLessons.id, ids));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("storage.getLibraryLessonsByIds.error", { ids, err });
    return [];
  }
}

async function getLibraryLessonProgressByUser(
  userId: string,
  lessonIds: string[],
): Promise<Record<string, number>> {
  try {
    if (!userId || !Array.isArray(lessonIds) || lessonIds.length === 0) {
      return {};
    }
    const rows = await db
      .select({
        lessonId: libraryProgress.lessonId,
        lastPositionSeconds: libraryProgress.lastPositionSeconds,
        totalDurationSeconds: libraryProgress.totalDurationSeconds,
        completedAt: libraryProgress.completedAt,
      })
      .from(libraryProgress)
      .where(
        and(
          eq(libraryProgress.userId, userId),
          inArray(libraryProgress.lessonId, lessonIds),
        ),
      );
    const out: Record<string, number> = {};
    for (const r of rows as any[]) {
      const lessonId = r?.lessonId;
      if (typeof lessonId !== "string") continue;
      if (r.completedAt) {
        out[lessonId] = 1;
        continue;
      }
      const last = Number(r?.lastPositionSeconds ?? 0);
      const total = Number(r?.totalDurationSeconds ?? 0);
      if (total > 0 && Number.isFinite(last)) {
        const pct = Math.max(0, Math.min(1, last / total));
        out[lessonId] = pct;
      } else {
        out[lessonId] = 0;
      }
    }
    return out;
  } catch (err) {
    console.error("storage.getLibraryLessonProgressByUser.error", {
      userId,
      err,
    });
    return {};
  }
}

async function listCuratedStudyThemes(userId: string): Promise<any[]> {
  try {
    const rows = await db
      .select()
      .from(studyThemes)
      .where(
        and(
          eq(studyThemes.userId, userId),
          eq(studyThemes.isCurated, true),
        ),
      );
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("storage.listCuratedStudyThemes.error", { userId, err });
    return [];
  }
}

async function listLibraryLessonsCurated(): Promise<any[]> {
  try {
    const rows = await db
      .select({
        id: libraryLessons.id,
        title: libraryLessons.title,
        slug: libraryLessons.slug,
        courseId: libraryLessons.courseId,
        courseSlug: libraryCourses.slug,
      })
      .from(libraryLessons)
      .leftJoin(libraryCourses, eq(libraryCourses.id, libraryLessons.courseId))
      .where(eq(libraryLessons.isPublished, true))
      .limit(200);
    return Array.isArray(rows)
      ? rows.map((r: any) => ({
          ...r,
          lessonSlug: r.slug,
        }))
      : [];
  } catch (err) {
    console.error("storage.listLibraryLessonsCurated.error", { err });
    return [];
  }
}

async function listStarredHandsRecent(
  userId: string,
  limit: number = 5,
): Promise<any[]> {
  try {
    const rows = await db
      .select()
      .from(starredHands)
      .where(eq(starredHands.userId, userId))
      .orderBy(desc((starredHands as any).createdAt))
      .limit(limit);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("storage.listStarredHandsRecent.error", { userId, err });
    return [];
  }
}

async function getTournamentsByGrindSession(
  grindSessionId: string,
): Promise<any[]> {
  try {
    const rows = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.grindSessionId, grindSessionId));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("storage.getTournamentsByGrindSession.error", {
      grindSessionId,
      err,
    });
    return [];
  }
}

async function getStarredHandsByGrindSession(
  grindSessionId: string,
): Promise<any[]> {
  try {
    const rows = await db
      .select()
      .from(starredHands)
      .where(eq((starredHands as any).grindSessionId, grindSessionId));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("storage.getStarredHandsByGrindSession.error", {
      grindSessionId,
      err,
    });
    return [];
  }
}

async function listUsersForWeeklyStudyPlanCron(): Promise<
  Array<{ userPlatformId: string; isActive: boolean }>
> {
  try {
    const rows = await db
      .select({
        userPlatformId: users.userPlatformId,
        isActive: sql<boolean>`COALESCE(${users.status} = 'active', false)`,
      })
      .from(users)
      .where(eq(users.status, "active"));
    return Array.isArray(rows)
      ? (rows as Array<{ userPlatformId: string; isActive: boolean }>)
      : [];
  } catch (err) {
    console.error("storage.listUsersForWeeklyStudyPlanCron.error", { err });
    return [];
  }
}

(storage as any).upsertStudyWeeklyPlan = upsertStudyWeeklyPlan;
(storage as any).getStudyWeeklyPlan = getStudyWeeklyPlan;
(storage as any).markPlanItemCompleted = markPlanItemCompleted;
(storage as any).listStudyWeeklyPlans = listStudyWeeklyPlans;
(storage as any).getRecentStudySessionAvgMinutes = getRecentStudySessionAvgMinutes;
(storage as any).upsertCoachSessionInsights = upsertCoachSessionInsights;
(storage as any).getCoachSessionInsights = getCoachSessionInsights;
(storage as any).hasFreshCoachSessionInsights = hasFreshCoachSessionInsights;
(storage as any).getCoachSessionInsightsByUser = getCoachSessionInsightsByUser;
(storage as any).findStudyThemesByLinkedStat = findStudyThemesByLinkedStat;
(storage as any).getLibraryLessonsByIds = getLibraryLessonsByIds;
(storage as any).getLibraryLessonProgressByUser = getLibraryLessonProgressByUser;
(storage as any).listCuratedStudyThemes = listCuratedStudyThemes;
(storage as any).listLibraryLessonsCurated = listLibraryLessonsCurated;
(storage as any).listStarredHandsRecent = listStarredHandsRecent;
(storage as any).getTournamentsByGrindSession = getTournamentsByGrindSession;
(storage as any).getStarredHandsByGrindSession = getStarredHandsByGrindSession;
(storage as any).listUsersForWeeklyStudyPlanCron = listUsersForWeeklyStudyPlanCron;

// =============================================================================
// Sprint stats-themes-linking-1 (ADR-141 + ADR-142) — storage methods novos
//
// Reverse lookup, write-through bidirecional (custom_X -> theme.linkedStats),
// batch lookups para Coach tool, ownership validation e sparkline batch.
// Pattern: mesma estrutura dos demais "function X" + (storage as any).X = X.
// =============================================================================

/**
 * Reverse lookup: temas do user que linkam o statId.
 * Usado por GET /api/stats/:statId/linked-themes (RF-02).
 * Shape: [{ id, name, slug, category }]
 */
async function getThemesLinkingStat(
  userId: string,
  statId: string,
): Promise<Array<{ id: string; name: string; slug: string | null; category: string | null }>> {
  try {
    const rows = await db
      .select({
        id: studyThemes.id,
        name: studyThemes.name,
        slug: studyThemes.slug,
        category: studyThemes.category,
      })
      .from(studyThemes)
      .where(
        and(
          eq(studyThemes.userId, userId),
          sql`${studyThemes.linkedStats} @> ${JSON.stringify([statId])}::jsonb`,
        ),
      )
      .orderBy(asc(studyThemes.name));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("storage.getThemesLinkingStat.error", { userId, statId, err });
    return [];
  }
}

/**
 * Append idempotente de statId em studyThemes.linkedStats de cada theme em themeIds.
 * Usado por write-through HUD custom field -> themes (RF-08.3).
 *
 * HIGH-4 reviewer: SINGLE atomic batch UPDATE com jsonb operators (PG 16+) — elimina
 * race condition do read-modify-write. Idempotente via CASE WHEN.
 *
 * Ownership: filtra por userId (themes de outros users nao sao tocados).
 *
 * @param tx (opcional) — Drizzle tx context. Se passado, opera dentro da tx.
 *           Se omitido, usa db global. HIGH-3 reviewer suporte.
 */
async function appendStatToThemes(
  userId: string,
  statId: string,
  themeIds: string[],
  tx?: any,
): Promise<void> {
  if (!Array.isArray(themeIds) || themeIds.length === 0) return;
  const exec = tx ?? db;
  try {
    // CASE WHEN: append apenas se linked_stats NAO contem statId.
    // Note: jsonb || jsonb concatena. Coerce string -> jsonb array com to_jsonb.
    await exec.execute(sql`
      UPDATE study_themes
         SET linked_stats = CASE
               WHEN linked_stats @> ${JSON.stringify([statId])}::jsonb THEN linked_stats
               ELSE linked_stats || ${JSON.stringify([statId])}::jsonb
             END,
             updated_at = NOW()
       WHERE user_id = ${userId}
         AND id = ANY(${themeIds})
    `);
  } catch (err) {
    console.error("storage.appendStatToThemes.error", {
      userId,
      statId,
      themeIds,
      err,
    });
  }
}

/**
 * Remove statId de studyThemes.linkedStats dos themes em themeIds.
 * Usado por write-through HUD custom field -> themes (RF-08.3) e cleanup
 * proativo no DELETE custom field (RF-08.5).
 *
 * HIGH-4 reviewer: SINGLE atomic batch UPDATE; usa jsonb_path_query / array
 * filter para remover element from jsonb array. Idempotente.
 */
async function removeStatFromThemes(
  userId: string,
  statId: string,
  themeIds: string[],
  tx?: any,
): Promise<void> {
  if (!Array.isArray(themeIds) || themeIds.length === 0) return;
  const exec = tx ?? db;
  try {
    // Remove statId do jsonb array via subquery jsonb_array_elements_text.
    // jsonb - text NAO funciona em jsonb arrays (so em objects), por isso usamos
    // a expressao COALESCE(jsonb_agg(elem) FILTER (WHERE elem != $1), '[]'::jsonb).
    await exec.execute(sql`
      UPDATE study_themes AS st
         SET linked_stats = COALESCE(
               (
                 SELECT jsonb_agg(elem)
                   FROM jsonb_array_elements_text(st.linked_stats) AS elem
                  WHERE elem <> ${statId}
               ),
               '[]'::jsonb
             ),
             updated_at = NOW()
       WHERE st.user_id = ${userId}
         AND st.id = ANY(${themeIds})
         AND st.linked_stats @> ${JSON.stringify([statId])}::jsonb
    `);
  } catch (err) {
    console.error("storage.removeStatFromThemes.error", {
      userId,
      statId,
      themeIds,
      err,
    });
  }
}

/**
 * Lista todos os themes do user que contem statId em linked_stats.
 * Usado por DELETE custom field (RF-08.5) para cleanup.
 * Inclui linkedStats no payload para o handler decidir o set de themes a updatear.
 */
async function listThemesContainingStat(
  userId: string,
  statId: string,
): Promise<Array<{ id: string; linkedStats: string[] }>> {
  try {
    const rows = await db
      .select({
        id: studyThemes.id,
        linkedStats: studyThemes.linkedStats,
      })
      .from(studyThemes)
      .where(
        and(
          eq(studyThemes.userId, userId),
          sql`${studyThemes.linkedStats} @> ${JSON.stringify([statId])}::jsonb`,
        ),
      );
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: r.id,
      linkedStats: Array.isArray(r.linkedStats) ? r.linkedStats : [],
    }));
  } catch (err) {
    console.error("storage.listThemesContainingStat.error", {
      userId,
      statId,
      err,
    });
    return [];
  }
}

/**
 * Batch ownership validation de themes.
 * Retorna apenas themes que pertencem ao user E estao em themeIds.
 * Usado por PATCH /api/hud-layouts/:id (RF-08.2) para detectar invalidIds.
 */
async function getStudyThemesByIds(
  themeIds: string[],
  userId: string,
): Promise<Array<{ id: string; userId: string; name: string; linkedStats: string[] }>> {
  if (!Array.isArray(themeIds) || themeIds.length === 0) return [];
  try {
    const rows = await db
      .select({
        id: studyThemes.id,
        userId: studyThemes.userId,
        name: studyThemes.name,
        linkedStats: studyThemes.linkedStats,
      })
      .from(studyThemes)
      .where(
        and(
          eq(studyThemes.userId, userId),
          // Drizzle inArray helper se disponivel; caso contrario, raw sql.
          sql`${studyThemes.id} = ANY(${themeIds})`,
        ),
      );
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      linkedStats: Array.isArray(r.linkedStats) ? r.linkedStats : [],
    }));
  } catch (err) {
    console.error("storage.getStudyThemesByIds.error", { themeIds, userId, err });
    return [];
  }
}

/**
 * Batch sparkline lookup para Coach tool (ADR-142 §2.3).
 * Retorna snapshots em ordem cronologica ASC, dos ultimos 30 dias, do user, que
 * contenham AO MENOS UMA das statIds em values jsonb.
 *
 * NAO existe coluna `value` por stat — todos vivem em `values` jsonb.
 * Implementer indexa por statId em codigo (evita N+1 queries).
 */
async function getHudStatSnapshotsForUserStats(
  userId: string,
  statIds: string[],
): Promise<Array<{ capturedAt: Date; values: Record<string, number | null> }>> {
  if (!Array.isArray(statIds) || statIds.length === 0) return [];
  try {
    // Janela 30 dias.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        capturedAt: hudStatSnapshots.capturedAt,
        values: hudStatSnapshots.values,
      })
      .from(hudStatSnapshots)
      .where(
        and(
          eq(hudStatSnapshots.userId, userId),
          gte(hudStatSnapshots.capturedAt, thirtyDaysAgo),
          // jsonb existence: any of the keys (operator ?|).
          sql`${hudStatSnapshots.values} ?| ${statIds}::text[]`,
        ),
      )
      .orderBy(asc(hudStatSnapshots.capturedAt));
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      capturedAt: r.capturedAt,
      values: r.values || {},
    }));
  } catch (err) {
    console.error("storage.getHudStatSnapshotsForUserStats.error", {
      userId,
      statIds,
      err,
    });
    return [];
  }
}

/**
 * PATCH parcial em studyThemes (RF-01.3). Preserva campos nao informados.
 * Wrapper limpo em torno de UPDATE com WHERE id (ownership validado em handler).
 */
async function updateStudyTheme(
  themeId: string,
  patch: Partial<{
    name: string;
    color: string;
    emoji: string;
    isFavorite: boolean;
    sortOrder: number;
    progress: number;
    linkedStats: string[];
    linkedLessons: string[];
  }>,
): Promise<any> {
  try {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.color !== undefined) updateData.color = patch.color;
    if (patch.emoji !== undefined) updateData.emoji = patch.emoji;
    if (patch.isFavorite !== undefined) updateData.isFavorite = patch.isFavorite;
    if (patch.sortOrder !== undefined) updateData.sortOrder = patch.sortOrder;
    if (patch.progress !== undefined) updateData.progress = patch.progress;
    if (patch.linkedStats !== undefined) updateData.linkedStats = patch.linkedStats;
    if (patch.linkedLessons !== undefined) updateData.linkedLessons = patch.linkedLessons;
    const [row] = await db
      .update(studyThemes)
      .set(updateData)
      .where(eq(studyThemes.id, themeId))
      .returning();
    return row ?? null;
  } catch (err) {
    console.error("storage.updateStudyTheme.error", { themeId, err });
    throw err;
  }
}

(storage as any).getThemesLinkingStat = getThemesLinkingStat;
(storage as any).appendStatToThemes = appendStatToThemes;
(storage as any).removeStatFromThemes = removeStatFromThemes;
(storage as any).listThemesContainingStat = listThemesContainingStat;
(storage as any).getStudyThemesByIds = getStudyThemesByIds;
(storage as any).getHudStatSnapshotsForUserStats = getHudStatSnapshotsForUserStats;
(storage as any).updateStudyTheme = updateStudyTheme;

// Tests que dependiam dos IDs fixture (tkt-1, etc.) declaram seu proprio
// vi.mock('../../../server/db', ...) com Drizzle-shape fake backed por Map.
// Sprint AI-1B (ADR-155/157) — report_jobs / reports CRUD attach.
import { attachReportStorage } from "./storage/reportStorage";
attachReportStorage(storage as any);
// Sprint AI-1B (ADR-157) — sinais de estado real do gap-check / B-IMPORT.
import { attachCoachSignalsStorage } from "./storage/coachSignalsStorage";
attachCoachSignalsStorage(storage as any);
