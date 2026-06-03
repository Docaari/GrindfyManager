// =============================================================================
// studyLeaksService — fonte unica de deteccao de leaks para o modulo Estudos.
//
// Antes, a logica de gather + detectLeaks vivia inline em
// `GET /api/study/suggestions` (studies-v2.ts) e os endpoints
// `GET /api/dashboard/leaks/active` + `/study-snapshots` (study-misc.ts) eram
// stubs `[]` — o botao "Sugerir temas baseado em leaks" do StatsView ficava
// PERMANENTEMENTE desabilitado (HIGH-1 da auditoria). Este service consolida o
// gather para os dois consumidores reusarem detectLeaks (mesma fonte do Coach).
//
// Ownership: o caller passa o userId (userPlatformId) ja autenticado.
// =============================================================================

import { storage } from "../storage";
import { db } from "../db";
import { studySessions } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { detectLeaks, type Leak } from "../coachLeakDetection";

const DAY_MS = 1000 * 60 * 60 * 24;

// Mapeia o tipo de leak -> topico de estudo sugerido (espelha o helper do client).
export function mapLeakToStudyTopic(leak: { type: string; data?: any }): string {
  if (leak.type === "roi_by_format") {
    const speed = leak.data?.speed;
    const category = leak.data?.category;
    if (speed === "Turbo" || speed === "Hyper") return "ICM e Push/Fold em Turbo";
    if (category === "PKO") return "Estrategia PKO e Bounty";
    return "Game Selection e Analise de Formato";
  }
  if (leak.type === "weak_site") return "Adaptacao Multi-Site";
  if (leak.type === "early_bust") return "Jogo Early Game e Sobrevivencia";
  if (leak.type === "low_ft_conversion") return "Final Table Play e ICM";
  if (leak.type === "declining_trend") return "Revisao de Estrategia e Volume";
  if (leak.type === "insufficient_volume") return "Disciplina de Volume e Grind";
  if (leak.type === "no_study") return "Rotina de Estudo e Evolucao";
  return "Estudo Geral de Poker";
}

// Coleta os analytics do jogador e roda detectLeaks. Retorna [] quando o jogador
// ainda nao tem torneios importados (nada a analisar — mesma guarda do suggestions).
export async function gatherUserLeaks(userId: string): Promise<Leak[]> {
  const [dashboardStats, analyticsByCategory, analyticsBySite, analyticsByMonth] =
    await Promise.all([
      storage.getDashboardStats(userId, "all"),
      storage.getAnalyticsByCategory(userId, "all"),
      storage.getAnalyticsBySite(userId, "all"),
      storage.getAnalyticsByMonth(userId, "all"),
    ]);

  const totalTournaments = (dashboardStats as any)?.count || 0;
  if (totalTournaments === 0) return [];

  // Sinal do leak `no_study` — dias desde a ultima sessao de estudo.
  let lastStudySessionDays: number | undefined;
  try {
    const [lastSession] = await db
      .select({ date: studySessions.date })
      .from(studySessions)
      .where(eq(studySessions.userId, userId))
      .orderBy(desc(studySessions.date))
      .limit(1);
    lastStudySessionDays = lastSession
      ? Math.floor((Date.now() - new Date(lastSession.date).getTime()) / DAY_MS)
      : 999; // nunca estudou
  } catch {
    /* graceful — segue sem o sinal no_study */
  }

  return detectLeaks({
    analyticsByCategory: analyticsByCategory || [],
    analyticsBySite: analyticsBySite || [],
    overallRoi: (dashboardStats as any)?.roi || 0,
    earlyFinishRate: (dashboardStats as any)?.earlyFinishRate || 0,
    finalTables: (dashboardStats as any)?.finalTables || 0,
    cravadas: (dashboardStats as any)?.firstPlaceCount || 0,
    analyticsByMonth: analyticsByMonth || [],
    totalTournaments,
    lastStudySessionDays,
  });
}
