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
  // Sprint AI-1A / RF-06 — perfil estruturado de IA para o bloco STATIC.
  getStructuredProfile?: (userId: string) => Promise<any | null>;
}

/**
 * Sprint AI-2A / RF-07 — bloco DINAMICO "## Upload Recente" injetado quando o
 * storage tem upload de stats < 24h (best-effort). Funcao auxiliar local
 * (nao exportada) reusada pelo branch principal + branch shortcut.
 */
async function buildRecentUploadBlock(userId: string): Promise<string | null> {
  try {
    const mod = await import("./storage");
    const s: any = (mod as any).storage;
    const recent = await s?.getRecentStatsUpload?.(userId, 24);
    if (!recent || !recent.uploadedAt) return null;
    const when = new Date(recent.uploadedAt as any).toISOString();
    const topStats = (recent.statsExtracted ?? [])
      .slice(0, 5)
      .map((st: any) => `${st.statId}=${st.value}`)
      .join(", ");
    return `\n## Upload Recente:\nTimestamp: ${when}\nTop stats: ${topStats || "(none)"}\n`;
  } catch (err) {
    console.error("coach_context.recent_upload.error", { userId, err });
    return null;
  }
}

export async function assembleContext(
  input: ContextInput | { userId: string; pageContext?: any },
  dataLoaders?: DataLoaders,
): Promise<{ system: SystemBlock[] | string; messages: Array<{ role: string; content: string }> }> {
  // Sprint AI-2A / RF-07 — shortcut quando chamado sem dataLoaders (apenas para
  // context "leve" ex: testes do OCR bridge). Retorna systemParts com bloco
  // upload recente quando disponivel.
  if (!dataLoaders) {
    const userId = (input as any).userId;
    const block = userId ? await buildRecentUploadBlock(userId) : null;
    const systemParts: string[] = [];
    if (block) systemParts.push(block);
    return { system: systemParts.length > 0 ? systemParts.join("\n") : "", systemParts, messages: [] } as any;
  }

  const { coachType, userId, message, sessionId } = input as ContextInput;

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
    structuredProfileData,
  ] = await Promise.all([
    dataLoaders.getAiProfile ? dataLoaders.getAiProfile(userId).catch(() => null) : Promise.resolve(null),
    dataLoaders.getActiveGrind ? dataLoaders.getActiveGrind(userId).catch(() => null) : Promise.resolve(null),
    dataLoaders.getRecentBreakFeedbacks ? dataLoaders.getRecentBreakFeedbacks(userId).catch(() => []) : Promise.resolve([]),
    dataLoaders.getDetectedLeaks ? dataLoaders.getDetectedLeaks(userId).catch(() => []) : Promise.resolve([]),
    dataLoaders.getWeeklyPlan ? dataLoaders.getWeeklyPlan(userId).catch(() => null) : Promise.resolve(null),
    dataLoaders.getStudyProgress ? dataLoaders.getStudyProgress(userId).catch(() => []) : Promise.resolve([]),
    dataLoaders.getPageContext ? dataLoaders.getPageContext(userId, sessionId).catch(() => null) : Promise.resolve(null),
    dataLoaders.getStructuredProfile ? dataLoaders.getStructuredProfile(userId).catch(() => null) : Promise.resolve(null),
  ]);

  // 3. [DEAD CODE — TODO cleanup] O array `systemParts` abaixo (e as queries
  // inline que o alimentam, ate ~linha 189) NAO sao mais usados: o system prompt
  // final vem de `buildSystemArray(...)` (RF-08, ADR-019), que recebe os mesmos
  // dados via os loaders `dataLoaders.get*` providos pelo /api/coach/chat. Mantido
  // por enquanto pra reduzir risco; remover quando confirmado que todos os callers
  // passam os loaders novos. (Custo: ~8 queries DB desperdicadas por chat.)
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

  // AI-1C / RF-08 (ADR-161) — follow-ups abertos: lista os ultimos relatorios
  // recentes (weekly/daily/monthly) ainda nao lidos / nao dispensados + suas
  // suggestions. Permite ao agente fechar o loop sobre o que ja sugeriu.
  // Best-effort — falha de leitura nao quebra o context.
  try {
    const recentReports = (await (storage as any).listReportsForUser?.({ userId, limit: 3 })) ?? [];
    const openLines: string[] = [];
    for (const r of Array.isArray(recentReports) ? recentReports : []) {
      if (r?.dismissedAt) continue;
      const content = r?.content ?? {};
      const type = content?.reportType ?? r?.reportType ?? "report";
      const period = content?.periodStart ?? r?.periodStart ?? "";
      const headerLine = content?.header?.summaryLine ?? "";
      const recommended = content?.nextWeekPlan?.recommendedAction ?? null;
      const activeFoci = content?.followUp?.activeLeakFocus
        ?.map?.((f: any) => f.label || f.code)
        .filter(Boolean)
        .slice(0, 3) ?? [];
      const goals = content?.followUp?.goalsInProgress
        ?.map?.((g: any) => g.texto)
        .filter(Boolean)
        .slice(0, 3) ?? [];
      const bits: string[] = [`[${type} ${period}] ${headerLine}`.trim()];
      if (recommended) bits.push(`Ação sugerida: ${recommended}`);
      if (activeFoci.length) bits.push(`Focos ativos: ${activeFoci.join(", ")}`);
      if (goals.length) bits.push(`Metas em progresso: ${goals.join(", ")}`);
      if (r?.readAt) bits.push(`(jogador ja leu)`);
      openLines.push("- " + bits.join(" | "));
    }
    if (openLines.length > 0) {
      systemParts.push(
        `\n## Follow-ups abertos (relatorios recentes — feche o loop quando apropriado):\n${openLines.join("\n")}`,
      );
    }
  } catch { /* graceful degradation */ }

  // Coach AI UX Overhaul (#8) — compromissos abertos do jogador (accountability).
  // O agente deve cobrar/checar quando relevante (fechar o loop do que ele mesmo
  // se comprometeu). Best-effort — falha nao quebra o context.
  try {
    const open = (await (storage as any).listOpenCoachCommitments?.(userId, 5)) ?? [];
    const lines = (Array.isArray(open) ? open : [])
      .map((c: any) => `- "${String(c?.text ?? "").slice(0, 140)}" (ate ${c?.dueDate})`)
      .filter(Boolean);
    if (lines.length > 0) {
      systemParts.push(
        `\n## Compromissos abertos do jogador (cobre/cheque quando fizer sentido):\n${lines.join("\n")}`,
      );
    }
  } catch { /* graceful degradation */ }

  // ADR-241 — Metas & Relatorio do dia. O agente ve as metas ativas + se o
  // jogador ja preencheu o relatorio do dia (calendario de metas) p/ cobrar a
  // medida de direcao com linguagem A4 (sem culpa) e SEM P&L (RF-06).
  // Best-effort — falha de leitura nao quebra o context.
  try {
    const today = new Date();
    const ymd = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    const [goalsRes, wigsRes, todayLog] = await Promise.all([
      Promise.resolve((storage as any).listGoals?.(userId, { status: "active" })).catch(() => []),
      Promise.resolve((storage as any).listActiveWigs?.(userId)).catch(() => []),
      Promise.resolve((storage as any).getGoalDailyLog?.(userId, ymd)).catch(() => null),
    ]);
    const measures = (Array.isArray(goalsRes) ? goalsRes : []).slice(0, 5);
    const wigs = (Array.isArray(wigsRes) ? wigsRes : []).slice(0, 2);
    if (measures.length > 0 || wigs.length > 0) {
      const lines: string[] = [];
      for (const w of wigs) lines.push(`- [WIG] ${w.title}`);
      for (const m of measures) {
        const cad = m.cadence ? ` (${m.cadence})` : "";
        lines.push(`- [medida] ${m.title}${cad} — alvo ${m.targetValue ?? "?"} ${m.unit ?? ""}`.trim());
      }
      const reported = todayLog ? "JA preencheu o relatorio de hoje" : "AINDA NAO preencheu o relatorio de hoje";
      systemParts.push(
        `\n## Metas & Relatorio do dia (cobre a medida de direcao com linguagem A4, sem culpa; NUNCA mostre P&L):\n` +
          `${lines.join("\n")}\n${reported}. Use a tool log_daily_goal_report para registrar o relatorio do dia quando o jogador pedir.`,
      );
    }
  } catch { /* graceful degradation */ }

  // Coach AI UX Overhaul (#10) — benchmark vs populacao. Quando ha intel de pool
  // BR seeded, sinaliza ao agente que ele pode comparar o jogador ao field via a
  // tool query_pool_intelligence (gancho de retencao do nicho MTT).
  try {
    const pool = await (storage as any).queryTournamentPoolIntelligence?.({});
    const poolRows = pool?.rows ?? [];
    if (Array.isArray(poolRows) && poolRows.length > 0) {
      systemParts.push(
        `\n## Benchmark vs field (BR): ha intel de pool de ${poolRows.length} torneio(s) disponivel. ` +
          `Quando o jogador perguntar "como estou vs o field/populacao", use a tool ` +
          `query_pool_intelligence e compare ITM%/ROI dele com o field — com fonte e N.`,
      );
    }
  } catch { /* graceful degradation */ }

  // Sprint D / RF-03.3 (ADR-185) — bloco DINAMICO de tickets ativos. Gated
  // por keyword (ticket/satelite/grade/selecionar torneio) OR surface
  // (tournament-selector | grade-planner). Best-effort — falha vira null.
  let ticketsContextData: any = null;
  try {
    const { buildTicketsContext } = await import("./coach/contextBuilders/buildTicketsContext");
    ticketsContextData = await buildTicketsContext({
      userId,
      recentUserText: message,
      pageContext: pageContextData ?? undefined,
    });
  } catch (err) {
    console.error("coach_context.tickets_context.error", { userId, err });
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
      userProfile: userProfile ?? null,
      aiProfile: aiProfileText ?? null,
      statsSnapshot: stats ?? null,
      lastSummary: lastSummary ?? null,
      structuredProfile: structuredProfileData ?? null,
    },
    {
      activeGrind: activeGrindData ?? null,
      breakFeedbacks: Array.isArray(breakFeedbacksData) ? breakFeedbacksData : [],
      leaks: Array.isArray(detectedLeaksData) ? detectedLeaksData : [],
      weeklyPlan: weeklyPlanData ?? null,
      studyProgress: Array.isArray(studyProgressData) ? studyProgressData : [],
      pageContext: pageContextData ?? undefined,
      ticketsContext: ticketsContextData ?? null,
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

    const [roiBySite, roiByBuyin, roiByCategory, roiBySpeed, roiByDay, library, savedHl] = await Promise.all([
      storage.getAnalyticsBySite(userId, 'all'),
      storage.getAnalyticsByBuyinRange(userId, 'all'),
      storage.getAnalyticsByCategory(userId, 'all'),
      storage.getAnalyticsBySpeed(userId, 'all'),
      storage.getAnalyticsByDayOfWeek(userId, 'all'),
      storage.getTournamentLibrary(userId, 'all'),
      storage.listSavedHighlights(userId).catch(() => []),
    ]);

    // Fase 6: familias que o jogador SALVOU como destaque = sinal de intencao
    // (o que ele quer priorizar na grade). Shape enxuto pro prompt.
    const savedHighlights = (savedHl || []).map((h: any) => ({
      groupName: h.groupName,
      site: h.site,
      reasons: Array.isArray(h.reasons) ? h.reasons.map((r: any) => r.label) : [],
    }));

    // Separate top and worst templates from library. Projetar shape ENXUTO:
    // pos-Fase-1 cada item de familia carrega tournaments[] + specifics[] (cada
    // um com tournaments[]) — embutir isso no prompt do Coach inflaria tokens.
    const leanTemplate = (g: any) => ({
      groupName: g.groupName,
      site: g.site,
      category: g.category,
      roi: g.roi,
      volume: g.volume,
      avgBuyin: g.avgBuyin,
      confidenceGrade: g.confidenceGrade,
    });
    const sorted = (library || []).sort((a: any, b: any) => (b.roi || 0) - (a.roi || 0));
    const topTemplates = sorted.slice(0, 5).map(leanTemplate);
    const worstTemplates = sorted.slice(-5).reverse().map(leanTemplate);

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
      savedHighlights,
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
      savedHighlights: [],
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

    // Load study cards, study sessions, coaching insights.
    // Wave B (Fase 3 perf): Promise.all paralelo (3 selects independentes).
    // Cada select wrapeado em catch isolado para preservar graceful degradation
    // por-query — se 1 explode, os outros 2 ainda voltam.
    const [cards, sessions, insights] = await Promise.all([
      (db.select().from(studyCards).where(eq(studyCards.userId, userId)) as Promise<any[]>)
        .catch(() => [] as any[]),
      (db.select().from(studySessions).where(eq(studySessions.userId, userId)) as Promise<any[]>)
        .catch(() => [] as any[]),
      (db.select().from(coachingInsights).where(eq(coachingInsights.userId, userId)) as Promise<any[]>)
        .catch(() => [] as any[]),
    ]);
    // bigHits eh populado por bloco posterior (preserve TS hoisting + escopo).
    let bigHits: any[] = [];

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
