// =============================================================================
// Coach Context — Assembles context for Claude API calls
// Also contains specialized context loaders for each coach type
// =============================================================================

import { db } from './db';
import { storage } from './storage';
import { detectLeaks } from './coachLeakDetection';
import {
  breakFeedbacks,
  preparationLogs,
  grindSessions,
  plannedTournaments,
  profileStates,
  studyCards,
  studySessions,
  coachingInsights,
} from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

// =============================================================================
// assembleContext — builds the full Claude API messages array
// =============================================================================

interface ContextInput {
  coachType: 'mental' | 'tournament' | 'technical';
  userId: string;
  message: string;
  sessionId: string;
}

interface DataLoaders {
  getUserProfile: (userId: string) => Promise<any>;
  getStatsSnapshot: (userId: string) => Promise<any>;
  getLastArchivedSessionSummary: (userId: string, coachType: string) => Promise<string | null>;
  getSessionHistory: (sessionId: string) => Promise<Array<{ role: string; content: string }>>;
  getSystemPrompt: (coachType: string) => string;
}

export async function assembleContext(
  input: ContextInput,
  dataLoaders: DataLoaders,
): Promise<{ system: string; messages: Array<{ role: string; content: string }> }> {
  const { coachType, userId, message, sessionId } = input;

  // 1. Get system prompt
  const baseSystemPrompt = dataLoaders.getSystemPrompt(coachType);

  // 2. Load user profile and stats
  const [userProfile, stats, lastSummary, sessionHistory] = await Promise.all([
    dataLoaders.getUserProfile(userId),
    dataLoaders.getStatsSnapshot(userId),
    dataLoaders.getLastArchivedSessionSummary(userId, coachType),
    dataLoaders.getSessionHistory(sessionId),
  ]);

  // 3. Build system prompt with profile and stats
  let systemParts = [baseSystemPrompt];

  if (userProfile) {
    systemParts.push(`\n## Perfil do jogador:\nNome: ${userProfile.name}\nPlano: ${userProfile.subscriptionPlan}\nCriado em: ${userProfile.createdAt}\nTotal de torneios: ${userProfile.totalTournaments}`);
  }

  if (stats) {
    systemParts.push(`\n## Stats:\nROI: ${stats.roi}%\nProfit: ${stats.profit}\nVolume: ${stats.volume}\nABI: ${stats.abi}`);
  }

  if (lastSummary) {
    systemParts.push(`\n## Resumo da sessao anterior:\n${lastSummary}`);
  }

  const system = systemParts.join('\n');

  // 4. Build messages array: history + current message
  const messages: Array<{ role: string; content: string }> = [];

  // Add session history (limited to last 20 messages)
  if (sessionHistory && sessionHistory.length > 0) {
    const trimmedHistory = sessionHistory.slice(-20);
    for (const msg of trimmedHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add current user message as last
  messages.push({ role: 'user', content: message });

  return { system, messages };
}

// =============================================================================
// buildMentalContext — loads data specific to the mental coach
// =============================================================================

export async function buildMentalContext(userId: string): Promise<any> {
  try {
    const [feedbacks, prepLogs, sessions] = await Promise.all([
      db.select().from(breakFeedbacks).where(eq(breakFeedbacks.userId, userId)).orderBy(desc(breakFeedbacks.sessionId)).limit(10).catch(() => []),
      db.select().from(preparationLogs).where(eq(preparationLogs.userId, userId)).orderBy(desc(preparationLogs.sessionId)).limit(5).catch(() => []),
      db.select().from(grindSessions).where(eq(grindSessions.userId, userId)).orderBy(desc(grindSessions.id)).limit(10).catch(() => []),
    ]);

    return {
      breakFeedbacks: feedbacks || [],
      preparationLogs: prepLogs || [],
      grindSessions: sessions || [],
      mentalCorrelation: undefined, // computed on demand if data exists
    };
  } catch {
    return {
      breakFeedbacks: [],
      preparationLogs: [],
      grindSessions: [],
      mentalCorrelation: undefined,
    };
  }
}

// =============================================================================
// buildTournamentContext — loads data specific to the tournament coach
// =============================================================================

export async function buildTournamentContext(userId: string): Promise<any> {
  try {
    const dashboardStats = await storage.getDashboardStats(userId, 'all');

    // If user has no tournaments, return empty context
    if (!dashboardStats || (dashboardStats as any).totalTournaments === 0) {
      return {
        dashboardStats: dashboardStats || { totalTournaments: 0, roi: 0, profit: '0', abi: 0, itmPercent: 0 },
        roiBySite: [],
        roiByBuyin: [],
        roiByCategory: [],
        roiBySpeed: [],
        roiByDay: [],
        topTemplates: [],
        worstTemplates: [],
        plannedTournaments: [],
        profileStates: [],
      };
    }

    const [roiBySite, roiByBuyin, roiByCategory, roiBySpeed, roiByDay, library] = await Promise.all([
      storage.getAnalyticsBySite(userId, 'all'),
      storage.getAnalyticsByBuyinRange(userId, 'all'),
      storage.getAnalyticsByCategory(userId, 'all'),
      storage.getAnalyticsBySpeed(userId, 'all'),
      storage.getAnalyticsByDayOfWeek(userId, 'all'),
      storage.getTournamentLibrary(userId, 'all'),
    ]);

    // Separate top and worst templates from library
    const sorted = (library || []).sort((a: any, b: any) => (b.roi || 0) - (a.roi || 0));
    const topTemplates = sorted.slice(0, 5);
    const worstTemplates = sorted.slice(-5).reverse();

    // Load planned tournaments and profile states
    let planned: any[] = [];
    let profiles: any[] = [];
    try {
      planned = await db.select().from(plannedTournaments).where(eq(plannedTournaments.userId, userId));
      profiles = await db.select().from(profileStates).where(eq(profileStates.userId, userId));
    } catch {
      // graceful degradation
    }

    return {
      dashboardStats: dashboardStats || { totalTournaments: 0, roi: 0, profit: '0', abi: 0, itmPercent: 0 },
      roiBySite: roiBySite || [],
      roiByBuyin: roiByBuyin || [],
      roiByCategory: roiByCategory || [],
      roiBySpeed: roiBySpeed || [],
      roiByDay: roiByDay || [],
      topTemplates: topTemplates || [],
      worstTemplates: worstTemplates || [],
      plannedTournaments: planned,
      profileStates: profiles,
    };
  } catch {
    return {
      dashboardStats: { totalTournaments: 0, roi: 0, profit: '0', abi: 0, itmPercent: 0 },
      roiBySite: [],
      roiByBuyin: [],
      roiByCategory: [],
      roiBySpeed: [],
      roiByDay: [],
      topTemplates: [],
      worstTemplates: [],
      plannedTournaments: [],
      profileStates: [],
    };
  }
}

// =============================================================================
// buildTechnicalContext — loads data specific to the technical coach
// =============================================================================

export async function buildTechnicalContext(userId: string): Promise<any> {
  try {
    const [dashboardStats, ftAnalytics, analyticsByField, analyticsByMonth, analyticsByCategory, analyticsBySite] = await Promise.all([
      storage.getDashboardStats(userId, 'all'),
      storage.getFinalTableAnalytics(userId, 'all'),
      storage.getAnalyticsByField(userId, 'all'),
      storage.getAnalyticsByMonth(userId, 'all'),
      storage.getAnalyticsByCategory(userId, 'all'),
      storage.getAnalyticsBySite(userId, 'all'),
    ]);

    // Load study cards, study sessions, coaching insights
    let cards: any[] = [];
    let sessions: any[] = [];
    let insights: any[] = [];
    let bigHits: any[] = [];

    try {
      cards = await db.select().from(studyCards).where(eq(studyCards.userId, userId));
    } catch { /* graceful */ }
    try {
      sessions = await db.select().from(studySessions).where(eq(studySessions.userId, userId));
    } catch { /* graceful */ }
    try {
      insights = await db.select().from(coachingInsights).where(eq(coachingInsights.userId, userId));
    } catch { /* graceful */ }

    // Compute early/late finish rates from dashboard stats if available
    const earlyFinishRate = (dashboardStats as any)?.earlyFinishRate || 0;
    const lateFinishRate = (dashboardStats as any)?.lateFinishRate || 0;

    // Detect leaks
    let detectedLeaks: any[] = [];
    try {
      detectedLeaks = detectLeaks({
        analyticsByCategory: analyticsByCategory || [],
        analyticsBySite: analyticsBySite || [],
        overallRoi: (dashboardStats as any)?.roi || 0,
        earlyFinishRate,
        finalTables: (dashboardStats as any)?.finalTables || 0,
        cravadas: (dashboardStats as any)?.cravadas || 0,
        analyticsByMonth: analyticsByMonth || [],
        totalTournaments: (dashboardStats as any)?.totalTournaments || 0,
      });
    } catch { /* graceful */ }

    return {
      dashboardStats: dashboardStats || {},
      finalTableAnalytics: ftAnalytics || {},
      earlyFinishRate,
      lateFinishRate,
      analyticsByField: analyticsByField || [],
      analyticsByMonth: analyticsByMonth || [],
      studyCards: cards,
      studySessions: sessions,
      bigHits: bigHits,
      coachingInsights: insights,
      detectedLeaks,
    };
  } catch {
    return {
      dashboardStats: {},
      finalTableAnalytics: {},
      earlyFinishRate: 0,
      lateFinishRate: 0,
      analyticsByField: [],
      analyticsByMonth: [],
      studyCards: [],
      studySessions: [],
      bigHits: [],
      coachingInsights: [],
      detectedLeaks: [],
    };
  }
}
