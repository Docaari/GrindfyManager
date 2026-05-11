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
  weeklyPlans,
  userAiProfile,
} from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import { buildSystemArray, type SystemBlock } from './coachSystemBuilder';

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
  // Sprint coach-launch-fix RF-08 (P1 #8): novos loaders alimentando
  // buildSystemArray. Todos opcionais — quando ausentes, valor null/[] eh
  // assumido (graceful fallback p/ callers legados).
  getAiProfile?: (userId: string) => Promise<string | null>;
  getActiveGrind?: (userId: string) => Promise<any | null>;
  getRecentBreakFeedbacks?: (userId: string) => Promise<any[]>;
  getDetectedLeaks?: (userId: string) => Promise<any[]>;
  getWeeklyPlan?: (userId: string) => Promise<any | null>;
  getStudyProgress?: (userId: string) => Promise<any[]>;
  getPageContext?: (userId: string, sessionId: string) => Promise<any>;
}

export async function assembleContext(
  input: ContextInput,
  dataLoaders: DataLoaders,
): Promise<{ system: SystemBlock[] | string; messages: Array<{ role: string; content: string }> }> {
  const { coachType, userId, message, sessionId } = input;

  // 1. Get system prompt (legacy — usado quando RF-08 buildSystemArray
  // estiver desligado via flag — porem o builder novo ja inclui base prompt).
  const baseSystemPrompt = dataLoaders.getSystemPrompt(coachType);

  // 2. Load user profile and stats (existente)
  const [userProfile, stats, lastSummary, sessionHistory] = await Promise.all([
    dataLoaders.getUserProfile(userId),
    dataLoaders.getStatsSnapshot(userId),
    dataLoaders.getLastArchivedSessionSummary(userId, coachType),
    dataLoaders.getSessionHistory(sessionId),
  ]);

  // 2b. Sprint coach-launch-fix RF-08 — Load extras p/ buildSystemArray.
  // Todos opcionais; ausentes viram null/[].
  const [
    aiProfileText,
    activeGrindData,
    breakFeedbacksData,
    detectedLeaksData,
    weeklyPlanData,
    studyProgressData,
    pageContextData,
  ] = await Promise.all([
    dataLoaders.getAiProfile ? dataLoaders.getAiProfile(userId).catch(() => null) : Promise.resolve(null),
    dataLoaders.getActiveGrind ? dataLoaders.getActiveGrind(userId).catch(() => null) : Promise.resolve(null),
    dataLoaders.getRecentBreakFeedbacks ? dataLoaders.getRecentBreakFeedbacks(userId).catch(() => []) : Promise.resolve([]),
    dataLoaders.getDetectedLeaks ? dataLoaders.getDetectedLeaks(userId).catch(() => []) : Promise.resolve([]),
    dataLoaders.getWeeklyPlan ? dataLoaders.getWeeklyPlan(userId).catch(() => null) : Promise.resolve(null),
    dataLoaders.getStudyProgress ? dataLoaders.getStudyProgress(userId).catch(() => []) : Promise.resolve([]),
    dataLoaders.getPageContext ? dataLoaders.getPageContext(userId, sessionId).catch(() => null) : Promise.resolve(null),
  ]);

  // 3. Build system prompt with profile and stats
  let systemParts = [baseSystemPrompt];

  if (userProfile) {
    systemParts.push(`\n## Perfil do jogador:\nNome: ${userProfile.name}\nPlano: ${userProfile.subscriptionPlan}\nCriado em: ${userProfile.createdAt}\nTotal de torneios: ${userProfile.totalTournaments}`);
  }

  // Fix 1: Inject AI profile (long-term memory) into system prompt
  try {
    const [aiProfile] = await db.select().from(userAiProfile).where(eq(userAiProfile.userId, userId));
    if (aiProfile?.content && aiProfile.content.trim().length > 0) {
      systemParts.push(`\n## Perfil do Jogador (memoria de longo prazo):\n${aiProfile.content}`);
    }
  } catch { /* graceful degradation */ }

  if (stats) {
    systemParts.push(`\n## Stats:\nROI: ${stats.roi}%\nProfit: ${stats.profit}\nVolume: ${stats.volume}\nABI: ${stats.abi}`);
  }

  if (lastSummary) {
    systemParts.push(`\n## Resumo da sessao anterior:\n${lastSummary}`);
  }

  // Fix 2: Load active grind session for all coach types
  try {
    const [activeGrind] = await db.select().from(grindSessions)
      .where(and(
        eq(grindSessions.userId, userId),
        eq(grindSessions.status, 'active')
      ));
    if (activeGrind) {
      systemParts.push(`\n## Sessao de Grind Ativa:
- Status: Em andamento
- Inicio: ${activeGrind.createdAt}
- Profit/Loss atual: ${activeGrind.profitLoss || 'N/A'}
- Energia media: ${activeGrind.energiaMedia || 'N/A'}
- Foco medio: ${activeGrind.focoMedio || 'N/A'}
- Confianca media: ${activeGrind.confiancaMedia || 'N/A'}
- Meta diaria: ${activeGrind.dailyGoals || 'N/A'}
- Preparacao: ${activeGrind.preparationPercentage || 'N/A'}%`);
    }
  } catch { /* graceful degradation */ }

  // Fix 4: Load weekly plan for tournament coach
  if (coachType === 'tournament') {
    try {
      const [currentPlan] = await db.select().from(weeklyPlans)
        .where(eq(weeklyPlans.userId, userId))
        .orderBy(desc(weeklyPlans.createdAt))
        .limit(1);
      if (currentPlan) {
        systemParts.push(`\n## Plano Semanal Atual:
- Meta de buy-ins: ${currentPlan.targetBuyins || 'N/A'}
- Meta de profit: ${currentPlan.targetProfit || 'N/A'}
- Meta de volume: ${currentPlan.targetVolume || 'N/A'}`);
      }
    } catch { /* graceful degradation */ }
  }

  // Fix 3: Format study data into prompt for technical coach
  if (coachType === 'technical') {
    try {
      const cards = await db.select().from(studyCards).where(eq(studyCards.userId, userId));
      if (cards && cards.length > 0) {
        const studyProgress = cards.map((card: any) =>
          `- ${card.category || card.title}: ${card.knowledgeScore || 0}% (${card.status || 'nao iniciado'})`
        ).join('\n');
        systemParts.push(`\n## Progresso de Estudo:\n${studyProgress}`);
      }
    } catch { /* graceful degradation */ }
  }

  // Fix 5: Cross-coach leak context for mental coach
  if (coachType === 'mental') {
    try {
      const dashboardStats = await storage.getDashboardStats(userId, 'all');
      if (dashboardStats && (dashboardStats as any).totalTournaments > 0) {
        const [analyticsByCategory, analyticsBySite, analyticsByMonth] = await Promise.all([
          storage.getAnalyticsByCategory(userId, 'all'),
          storage.getAnalyticsBySite(userId, 'all'),
          storage.getAnalyticsByMonth(userId, 'all'),
        ]);
        const leaks = detectLeaks({
          analyticsByCategory: (analyticsByCategory || []) as any,
          analyticsBySite: (analyticsBySite || []) as any,
          overallRoi: (dashboardStats as any)?.roi || 0,
          earlyFinishRate: (dashboardStats as any)?.earlyFinishRate || 0,
          finalTables: (dashboardStats as any)?.finalTables || 0,
          cravadas: (dashboardStats as any)?.cravadas || 0,
          analyticsByMonth: (analyticsByMonth || []) as any,
          totalTournaments: (dashboardStats as any)?.totalTournaments || 0,
        });
        if (leaks && leaks.length > 0) {
          const leakSummary = leaks.map(l => `- [Severidade ${l.severity}] ${l.description}`).join('\n');
          systemParts.push(`\n## Leaks Detectados (do Coach Tecnico):\nEstes problemas podem ter causas mentais:\n${leakSummary}`);
        }
      }
    } catch { /* graceful degradation */ }
  }

  // Sprint coach-launch-fix RF-08 (P1 #8): usa buildSystemArray que retorna
  // SystemBlock[] com cache_control ephemeral no bloco STATIC (cache hit ratio
  // melhora drasticamente entre mensagens da mesma sessao). Quando feature flag
  // COACH_PROMPT_CACHE_ENABLED=false, builder retorna string legacy.
  // PRIORIDADE: usar dados dos novos loaders quando providos; cair para legado
  // (systemParts.join) somente se buildSystemArray nao for desejado.
  // ADR-019.
  const system = buildSystemArray(
    coachType,
    {
      aiProfile: aiProfileText ?? null,
      statsSnapshot: stats ?? null,
      lastSummary: lastSummary ?? null,
    },
    {
      activeGrind: activeGrindData ?? null,
      breakFeedbacks: Array.isArray(breakFeedbacksData) ? breakFeedbacksData : [],
      leaks: Array.isArray(detectedLeaksData) ? detectedLeaksData : [],
      weeklyPlan: weeklyPlanData ?? null,
      studyProgress: Array.isArray(studyProgressData) ? studyProgressData : [],
      pageContext: pageContextData ?? undefined,
    },
  );

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
