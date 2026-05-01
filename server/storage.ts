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
  type Ticket,
  cooldownLogs,
  starredHands,
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
  type HudLayout,
  type InsertHudLayout,
  type UpdateHudLayout,
  type HudStatSnapshot,
  type InsertHudStatSnapshot,
  studyThemes,
  studyTabs,
  studyThemeSpotLinks,
  type StudyTheme,
  type StudyThemeSpotLink,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, gte, lte, lt, sql, like, not, inArray, gt, isNotNull, isNull, count, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { normalizeTournamentTypePayload } from "./storage/normalizeTournamentTypePayload";

// Utility function to build period conditions with custom date range support
function buildPeriodCondition(period: string, filters: any) {
  const conditions: any[] = [];



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
  getGrindSessions(userId: string): Promise<GrindSession[]>;
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
  getDashboardStats(userId: string, period?: string, filters?: any): Promise<any>;
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

  // Break feedback operations
  getBreakFeedbacks(userId: string, sessionId?: string): Promise<BreakFeedback[]>;
  createBreakFeedback(feedback: InsertBreakFeedback): Promise<BreakFeedback>;
  deleteBreakFeedback(id: string): Promise<void>;

  // Session tournament operations
  getSessionTournaments(userId: string, sessionId?: string): Promise<SessionTournament[]>;
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
    sessionId: string;
    sessionTournamentId: string;
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
  }): Promise<StarredHand>;
  getStarredHand(id: string, userId: string): Promise<any | null>;
  listStarredHands(userId: string, filter?: { sessionId?: string; type?: string; period?: "7d" | "30d" | "all" }): Promise<any[]>;
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
    filter?: { reviewLater?: string; sessionId?: string; limit?: number; offset?: number },
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

  // Sprint F3 — Stats Analyzer (ADR-051)
  getHudLayouts(userId: string): Promise<HudLayout[]>;
  getHudLayout(id: string, userId: string): Promise<HudLayout | undefined>;
  createHudLayout(input: InsertHudLayout): Promise<HudLayout>;
  updateHudLayout(
    id: string,
    userId: string,
    patch: UpdateHudLayout,
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
}

export interface BankrollSnapshotsFilters {
  from?: Date | string;
  to?: Date | string;
  reason?: string[];
  limit?: number;
  offset?: number;
}

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

    // Para ordenação por profit, usar apenas filtro de userId sem outros filtros
    let queryConditions: any[] = baseConditions;
    if (sortBy === 'profit-high' || sortBy === 'profit-low') {
      // Manter apenas filtro de userId, remover período e outros filtros
      queryConditions = [eq(tournaments.userId, userId)];
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
  async findExistingTournamentsByFields(userId: string, tournamentsToCheck: Array<{ name: string; datePlayed: Date | null; buyIn: number }>): Promise<Set<string>> {
    if (tournamentsToCheck.length === 0) return new Set();

    const BATCH_SIZE = 500;
    const existingKeys = new Set<string>();

    for (let i = 0; i < tournamentsToCheck.length; i += BATCH_SIZE) {
      const batch = tournamentsToCheck.slice(i, i + BATCH_SIZE);
      // Build OR conditions for each tournament in the batch
      const conditions = batch
        .filter(t => t.datePlayed !== null)
        .map(t =>
          and(
            eq(tournaments.name, t.name.trim()),
            eq(tournaments.datePlayed, t.datePlayed!),
            sql`ABS(CAST(${tournaments.buyIn} AS DECIMAL) - ${t.buyIn}) < 0.01`
          )
        );

      if (conditions.length === 0) continue;

      const rows = await db
        .select({
          name: tournaments.name,
          datePlayed: tournaments.datePlayed,
          buyIn: tournaments.buyIn,
        })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.userId, userId),
            or(...conditions)
          )
        );

      for (const row of rows) {
        const key = `${row.name}|${row.datePlayed?.toISOString()}|${row.buyIn}`;
        existingKeys.add(key);
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
      const values = batch.map(t => ({ ...t, id: nanoid() }));

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
  async getGrindSessions(userId: string): Promise<GrindSession[]> {
    return await db
      .select()
      .from(grindSessions)
      .where(eq(grindSessions.userId, userId))
      .orderBy(desc(grindSessions.date));
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
    const [upsertedSettings] = await db
      .insert(userSettings)
      .values({ ...settings, id: nanoid() })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          ...settings,
          updatedAt: new Date(),
        },
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

  async getDashboardStats(userId: string, period = "30d", filters: any = {}): Promise<any> {
    // Check if profile-based filtering is enabled
    if (filters.profileBased) {
      return this.getPlannedTournamentsDashboardStats(userId, period, filters);
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
      
      stats = await db
        .select({
          // Contagem: Quantidade de torneios
          count: sql<number>`COUNT(*)`,

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

          // ABI: Buy-in médio (Stake Médio) - rounded to 2 decimal places
          avgBuyin: sql<number>`ROUND(AVG(CAST(${tournaments.buyIn} AS DECIMAL)), 2)`,

          // ITM: Quantidade que ficou na premiação (prize > 0)
          itmCount: sql<number>`SUM(CASE WHEN CAST(${tournaments.prize} AS DECIMAL) > 0 THEN 1 ELSE 0 END)`,

          // FTs: Final Tables (posição >= 1 AND <= 9, números válidos apenas)
          finalTablesCount: sql<number>`SUM(CASE WHEN ${tournaments.position} >= 1 AND ${tournaments.position} <= 9 AND ${tournaments.position} IS NOT NULL THEN 1 ELSE 0 END)`,

          // Cravadas: 1º lugar (posição = 1)
          firstPlaceCount: sql<number>`SUM(CASE WHEN ${tournaments.position} = 1 THEN 1 ELSE 0 END)`,

          // Média de participantes - will be calculated separately with median for most sites
          avgFieldSize: sql<number>`ROUND(AVG(CASE WHEN ${tournaments.fieldSize} >= 15 AND ${tournaments.fieldSize} IS NOT NULL THEN CAST(${tournaments.fieldSize} AS DECIMAL) ELSE NULL END), 0)`,

          // Finalização Precoce: eliminado cedo, ficou entre os últimos 10% do field (posição alta = saiu cedo)
          // position/fieldSize >= 90% significa que o jogador terminou em posição ruim (ex: 900/1000 = 90%)
          earlyFinishCount: sql<number>`SUM(CASE WHEN ${tournaments.fieldSize} IS NOT NULL AND ${tournaments.fieldSize} > 0 AND ${tournaments.fieldSize} >= 15 AND ${tournaments.position} IS NOT NULL AND ${tournaments.position} > 0 AND (CAST(${tournaments.position} AS DECIMAL) / CAST(${tournaments.fieldSize} AS DECIMAL)) * 100 >= 90 THEN 1 ELSE 0 END)`,

          // Finalização Tardia: ficou até o final, entre os 10% melhores do field (posição baixa = deep run)
          // position/fieldSize <= 10% significa que o jogador terminou em posição boa (ex: 50/1000 = 5%)
          lateFinishCount: sql<number>`SUM(CASE WHEN ${tournaments.fieldSize} IS NOT NULL AND ${tournaments.fieldSize} > 0 AND ${tournaments.fieldSize} >= 15 AND ${tournaments.position} IS NOT NULL AND ${tournaments.position} > 0 AND (CAST(${tournaments.position} AS DECIMAL) / CAST(${tournaments.fieldSize} AS DECIMAL)) * 100 <= 10 THEN 1 ELSE 0 END)`,

          // Big Hit: Maior premiação registrada
          biggestPrize: sql<number>`MAX(CAST(${tournaments.prize} AS DECIMAL))`,

          // Stake Range: menor e maior buy-in (ignorando valores muito baixos e freerolls)
          minBuyin: sql<number>`MIN(CASE WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 5 THEN CAST(${tournaments.buyIn} AS DECIMAL) ELSE NULL END)`,
          maxBuyin: sql<number>`MAX(CASE WHEN CAST(${tournaments.buyIn} AS DECIMAL) >= 5 THEN CAST(${tournaments.buyIn} AS DECIMAL) ELSE NULL END)`,

          // Dias Jogados: Quantidade de dias únicos com registros
          daysPlayed: sql<number>`COUNT(DISTINCT DATE(${tournaments.datePlayed}))`,

          // Heads-Up: Estatísticas específicas para heads-up (field_size = 2)
          headsUpTotal: sql<number>`SUM(CASE WHEN ${tournaments.fieldSize} = 2 THEN 1 ELSE 0 END)`,
          headsUpWins: sql<number>`SUM(CASE WHEN ${tournaments.fieldSize} = 2 AND ${tournaments.position} = 1 THEN 1 ELSE 0 END)`,
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
    // 3. ABI: Buy-in médio do torneio
    const abi = Number(result.avgBuyin || 0);

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

    // Buscar todos os valores de fieldSize válidos para calcular mediana
    const fieldSizeValues = await db
      .select({ fieldSize: tournaments.fieldSize })
      .from(tournaments)
      .where(and(
        whereCondition,
        gte(tournaments.fieldSize, 15),
        isNotNull(tournaments.fieldSize)
      ))
      .orderBy(tournaments.fieldSize);

    let avgFieldSize = 0;

    // Calcular mediana do field size (método mais preciso para todos os sites)
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

    const baseConditions = [eq(tournaments.userId, userId)];

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
    const baseConditions = [eq(tournaments.userId, userId)];

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
    
    const whereCondition = dayOfWeek !== undefined
      ? and(eq(plannedTournaments.userId, userId), eq(plannedTournaments.dayOfWeek, dayOfWeek))
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
      activities: Array.isArray(session.activities) ? session.activities : (session.activities !== undefined && session.activities !== null ? [session.activities as string] : []),
      insights: Array.isArray(session.insights) ? session.insights : (session.insights !== undefined && session.insights !== null ? [session.insights as string] : [])
    };

    const [newSession] = await db
      .insert(studySessions)
      .values(sessionData as typeof studySessions.$inferInsert)
      .returning();
    return newSession;
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

  // Delete all events in a recurring series
  async deleteRecurringEventSeries(parentEventId: string): Promise<void> {
    await db.delete(calendarEvents).where(eq(calendarEvents.parentEventId, parentEventId));
    await db.delete(calendarEvents).where(eq(calendarEvents.id, parentEventId));
  }

  // Update all events in a recurring series
  async updateRecurringEventSeries(parentEventId: string, event: Partial<InsertCalendarEvent>): Promise<void> {
    await db
      .update(calendarEvents)
      .set({ ...event, updatedAt: new Date() })
      .where(eq(calendarEvents.parentEventId, parentEventId));

    await db
      .update(calendarEvents)
      .set({ ...event, updatedAt: new Date() })
      .where(eq(calendarEvents.id, parentEventId));
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
        await db
          .delete(uploadHistory)
          .where(
            and(
              eq(uploadHistory.userId, uploadRecord.userId),
              sql`${uploadHistory.id} IN (${toDelete.map(r => `'${r.id}'`).join(', ')})`
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
    const result: any = await runner.execute(
      sql`SELECT * FROM wallets WHERE id = ${walletId} AND user_id = ${userId} FOR UPDATE`,
    );
    const rows = Array.isArray(result) ? result : result.rows ?? [];
    if (rows.length === 0) return null;
    return rows[0] as Wallet;
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
        sql`SELECT id, site, buy_in, result, bounty, rebuys, add_on_taken, add_on_cost, status
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
      addOnTaken: !!(r.add_on_taken ?? r.addOnTaken),
      addOnCost: parseFloat(String(r.add_on_cost ?? r.addOnCost ?? "0")) || 0,
      status: r.status,
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
    filter: { sessionId?: string; type?: string; period?: "7d" | "30d" | "all" } = {},
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
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
    const offset = Math.max(0, filter.offset ?? 0);

    const conditions: any[] = [
      eq(starredHands.userId, userId),
      eq(starredHands.status, "pending"),
    ];
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

    const items = await db
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
        // Tournament join (RF-04: response inclui dados do torneio)
        tournamentName: sessionTournaments.name,
        tournamentSite: sessionTournaments.site,
        tournamentBuyIn: sessionTournaments.buyIn,
      })
      .from(starredHands)
      .leftJoin(sessionTournaments, eq(starredHands.sessionTournamentId, sessionTournaments.id))
      .where(and(...conditions))
      .orderBy(desc(starredHands.pastedAt))
      .limit(limit)
      .offset(offset);

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

    // Aggregate session_tournaments JOIN grind_sessions on sessionId, filter
    // status='completed' (and completedAt >= sinceDate when set, < untilDate
    // for previous-period window — Implementer Round UX #3).
    const conditions: any[] = [
      eq(sessionTournaments.userId, userId),
      eq(grindSessions.status, "completed"),
    ];
    if (sinceDate) {
      conditions.push(gte(grindSessions.date, sinceDate));
    }
    if (untilDate) {
      conditions.push(lt(grindSessions.date, untilDate));
    }

    const rows = await db
      .select({
        site: sessionTournaments.site,
        sessionsCount: sql<number>`COUNT(DISTINCT ${grindSessions.id})::int`,
        tournamentsCount: sql<number>`COUNT(${sessionTournaments.id})::int`,
        investedNative: sql<string>`COALESCE(SUM(
          CAST(${sessionTournaments.buyIn} AS DECIMAL)
          + CAST(COALESCE(${sessionTournaments.rebuys}, 0) AS DECIMAL) * CAST(${sessionTournaments.buyIn} AS DECIMAL)
        ), 0)::text`,
        profitNative: sql<string>`COALESCE(SUM(
          CAST(COALESCE(${sessionTournaments.result}, '0') AS DECIMAL)
          + CAST(COALESCE(${sessionTournaments.bounty}, '0') AS DECIMAL)
          - CAST(${sessionTournaments.buyIn} AS DECIMAL)
          - CAST(COALESCE(${sessionTournaments.rebuys}, 0) AS DECIMAL) * CAST(${sessionTournaments.buyIn} AS DECIMAL)
        ), 0)::text`,
      })
      .from(sessionTournaments)
      .innerJoin(grindSessions, eq(sessionTournaments.sessionId, grindSessions.id))
      .where(and(...conditions))
      .groupBy(sessionTournaments.site)
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
  ): Promise<HudLayout | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(hudLayouts)
        .where(and(eq(hudLayouts.id, id), eq(hudLayouts.userId, userId)));
      if (!existing) return undefined;
      if (patch.isDefault === true && !existing.isDefault) {
        await tx
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
      const [row] = await tx
        .update(hudLayouts)
        .set(updateData)
        .where(and(eq(hudLayouts.id, id), eq(hudLayouts.userId, userId)))
        .returning();
      return row;
    });
  }

  async deleteHudLayout(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(hudLayouts)
      .where(and(eq(hudLayouts.id, id), eq(hudLayouts.userId, userId)))
      .returning({ id: hudLayouts.id });
    return result.length > 0;
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

    const heatmap: Array<{ date: string; active: boolean }> = [];
    const lastActivity = row?.lastActivity ?? null;
    const lastActiveStart = lastActivity
      ? new Date(
          new Date(lastActivity).getFullYear(),
          new Date(lastActivity).getMonth(),
          new Date(lastActivity).getDate(),
        ).getTime()
      : 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      heatmap.push({
        date: d.toISOString().slice(0, 10),
        active: lastActiveStart >= start && lastActiveStart < start + 86400000,
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
    const [row] = await db
      .select({
        days: users.studyStreakDays,
        lastActivity: users.lastStudyActivityAt,
      })
      .from(users)
      .where(eq(users.userPlatformId, userId))
      .limit(1);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const prevDays = Number(row?.days ?? 0);
    const prevActivity = row?.lastActivity ? new Date(row.lastActivity) : null;
    const prevStart = prevActivity
      ? new Date(prevActivity.getFullYear(), prevActivity.getMonth(), prevActivity.getDate()).getTime()
      : 0;

    if (prevStart === todayStart) {
      return {
        days: prevDays,
        last_activity_at: prevActivity!.toISOString(),
        bumped: false,
      };
    }

    const diffDays = prevStart > 0 ? Math.round((todayStart - prevStart) / 86400000) : null;
    const newDays = diffDays === 1 ? prevDays + 1 : 1;

    await db
      .update(users)
      .set({
        studyStreakDays: newDays,
        lastStudyActivityAt: now,
      })
      .where(eq(users.userPlatformId, userId));

    return {
      days: newDays,
      last_activity_at: now.toISOString(),
      bumped: true,
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
// Tests que dependiam dos IDs fixture (tkt-1, etc.) declaram seu proprio
// vi.mock('../../../server/db', ...) com Drizzle-shape fake backed por Map.