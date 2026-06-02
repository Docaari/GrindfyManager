// =============================================================================
// Coach AI-1A Routes — Sprint AI-1A (onboarding + level estimate + anti-fadiga
// telemetry endpoints + admin freeze).
//
// Handlers exportados aqui sao re-exportados de server/routes/coach.ts para os
// testes (que importam de '../routes/coach').
//
// Padrao lesson #34: handleX(req, res, injectedStorage?). Em prod, sem
// injectedStorage -> monta um aggregate via os modulos reais (lazy import).
// =============================================================================

import { z } from "zod";
import type { NudgeCategory } from "../coach/nudgeEngine";

const NUDGE_CATEGORIES = [
  "B-SNAPSHOT",
  "B-LEAK",
  "B-STUDY",
  "B-VOLUME",
  "B-GRADE",
  "B-DOWNSWING",
  "B-LIFE",
  "B-MENTAL",
] as const;

const TOM_ENUM = ["gentle", "balanced", "direct"] as const;
const NIVEL_ENUM = [
  "sem_dados",
  "iniciando",
  "micro_ascensao",
  "mid_consistente",
  "high_stakes",
  "recreativo_serio",
] as const;
const PERFIL_DECLARADO_ENUM = ["recreativo_serio", "semi_pro", "pro"] as const;

// -----------------------------------------------------------------------------
// Aggregate storage para os handlers (prod). injectedStorage tem precedencia.
// -----------------------------------------------------------------------------
async function resolveOnboardingStorage(injectedStorage?: any): Promise<any> {
  if (injectedStorage) return injectedStorage;
  const { storage } = await import("../storage");
  const { getCoachPreferences, upsertCoachPreferences } = await import("../storage/coachPreferences");
  const { getAiStructuredProfile, updateAiStructuredProfile, isStructuredProfileEmpty } = await import(
    "../storage/aiStructuredProfile"
  );
  return {
    getAiStructuredProfile,
    updateAiStructuredProfile,
    isStructuredProfileEmpty,
    getCoachPreferences,
    upsertCoachPreferences,
    getUploadHistory: (uid: string) => (storage as any).getUploadHistory?.(uid) ?? [],
    getDashboardStats: (uid: string, period: string) => (storage as any).getDashboardStats(uid, period),
    getAnalyticsBySite: (uid: string, period?: string) => (storage as any).getAnalyticsBySite(uid, period ?? "all"),
    getUser: (id: string) => (storage as any).getUser(id),
    // telemetry
    listNudgeLog: (uid: string, opts: any) => (storage as any).listNudgeLog(uid, opts),
    getNudgeLogById: (id: string) => (storage as any).getNudgeLogById(id),
    updateNudgeLogStatus: (id: string, status: string, extra: any) =>
      (storage as any).updateNudgeLogStatus(id, status, extra),
    checkAndFreezeCategory: (uid: string, cat: any) => (storage as any).checkAndFreezeCategory(uid, cat),
    // #2 — 1o insight: criar sessao de chat + mensagem de boas-vindas no complete.
    createChatSession: (input: any) => (storage as any).createChatSession(input),
    insertChatMessage: (input: any) => (storage as any).insertChatMessage(input),
  };
}

// #2 — primeiro insight personalizado pos-onboarding (deterministico, sem LLM
// pra ser instantaneo e confiavel). Referencia o que o jogador acabou de contar
// + oferece acoes concretas (tools), criando o "aha moment" no pico de atencao.
const NIVEL_LABEL: Record<string, string> = {
  sem_dados: "comecando",
  iniciando: "iniciante",
  micro_ascensao: "micro em ascensao",
  mid_consistente: "mid consistente",
  high_stakes: "high stakes",
  recreativo_serio: "recreativo serio",
};

function buildOnboardingFirstMessage(profile: any): string {
  const lines: string[] = [];
  lines.push("Show, configurei teu perfil!");
  const nivel = profile?.nivel ? (NIVEL_LABEL[String(profile.nivel)] ?? String(profile.nivel)) : null;
  if (nivel) lines.push(`Pelo que me contou, teu nivel ta em **${nivel}**.`);
  const foco = typeof profile?.focoDoMes === "string" ? profile.focoDoMes.trim() : "";
  if (foco) lines.push(`Teu foco do mes: **${foco}**.`);
  const metas = Array.isArray(profile?.metas)
    ? profile.metas.map((m: any) => String(m?.texto ?? "").trim()).filter(Boolean).slice(0, 3)
    : [];
  if (metas.length) lines.push(`Tuas metas: ${metas.join("; ")}.`);
  lines.push("");
  lines.push("Ja da pra comecar agora — eu nao so respondo, eu **ajo** sobre teus dados. Posso:");
  lines.push("- puxar teus **3 maiores leaks** agora");
  lines.push("- **montar tua grade** da semana");
  lines.push("- analisar tua **variancia** do mes");
  lines.push("");
  lines.push("Por onde quer comecar?");
  return lines.join("\n");
}

function reqUserId(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

function isAdminUser(user: any): boolean {
  if (!user) return false;
  return user.role === "admin" || user.subscriptionPlan === "admin";
}

// =============================================================================
// Level estimate input loader
// =============================================================================
async function buildLevelEstimate(req: any, store: any): Promise<any> {
  const { estimatePlayerLevel } = await import("../coach/playerLevel");
  const userId = reqUserId(req);
  const userInternalId = req?.user?.id ?? userId;

  const statsAll = (await store.getDashboardStats(userId, "all")) ?? {};
  const stats90 = (await store.getDashboardStats(userId, "90d")) ?? {};
  const bySite = (await store.getAnalyticsBySite(userId, "all")) ?? [];
  let userRow: any = null;
  try {
    userRow = await store.getUser(userInternalId);
  } catch {
    userRow = null;
  }

  const countAll = Number(statsAll.count ?? 0);
  const buyinsAll = Number(statsAll.totalBuyins ?? 0);
  const profitAll = Number(statsAll.totalProfit ?? 0);
  const count90 = Number(stats90.count ?? 0);
  const buyins90 = Number(stats90.totalBuyins ?? 0);
  const profit90 = Number(stats90.totalProfit ?? 0);

  // ABI em USD (lesson #6 — getDashboardStats ja retorna em USD nesse contexto).
  const abiUSD = countAll > 0 && buyinsAll > 0 ? buyinsAll / countAll : null;
  const roiAllTime = buyinsAll > 0 ? (profitAll / buyinsAll) * 100 : null;
  const roiLast90d = buyins90 > 0 ? (profit90 / buyins90) * 100 : null;

  const distinctNetworks = Array.isArray(bySite) ? bySite.length : 0;

  let accountAgeMonths = 0;
  const createdAt = userRow?.createdAt ? new Date(userRow.createdAt) : null;
  if (createdAt && Number.isFinite(createdAt.getTime())) {
    accountAgeMonths = Math.max(0, (Date.now() - createdAt.getTime()) / (30 * 24 * 3600 * 1000));
  }
  const subscriptionPlan = userRow?.subscriptionPlan ?? req?.user?.subscriptionPlan ?? "free";

  return estimatePlayerLevel({
    abiUSD,
    volumeAllTime: countAll,
    volumeLast90d: count90,
    roiAllTime,
    roiLast90d,
    distinctNetworks,
    accountAgeMonths,
    subscriptionPlan,
  });
}

// =============================================================================
// GET /api/coach/level-estimate
// =============================================================================
export async function handleGetLevelEstimate(req: any, res: any, injectedStorage?: any): Promise<void> {
  if (!req?.user || !reqUserId(req)) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const estimate = await buildLevelEstimate(req, store);
    res.status(200).json(estimate);
  } catch (err: any) {
    console.error("coach.level_estimate.error", { err });
    res.status(200).json({
      nivel: "sem_dados",
      confidence: "low",
      humanLabel: "ainda sem dados suficientes",
      evidence: { abiUSD: null, volumeAllTime: 0, volumeLast90d: 0, roiAllTime: null, distinctNetworks: 0, accountAgeMonths: 0 },
      note: "nao consegui carregar seus dados agora — tente de novo em instantes",
    });
  }
}

// =============================================================================
// Onboarding — schemas
// =============================================================================
const onboardingMetaPatchSchema = z.object({
  id: z.string().optional(),
  texto: z.string().max(200).optional(),
  prazo: z.enum(["mes", "trimestre"]).nullable().optional(),
});

// PATCH body — campos parciais de qualquer step. step opcional 1..6. {skip:true} alternativo.
const patchOnboardingSchema = z
  .object({
    skip: z.boolean().optional(),
    step: z.number().int().min(1).max(6).optional(),
    mode: z.enum(["full", "light"]).optional(),
    perfilDeclarado: z.enum(PERFIL_DECLARADO_ENUM).optional(),
    stakesTipico: z.string().optional(),
    volumeTipicoMes: z.number().int().min(0).optional(),
    tempoJogaSerioMeses: z.number().int().min(0).optional(),
    redesPrincipais: z.array(z.string()).optional(),
    nivel: z.enum(NIVEL_ENUM).optional(),
    nivelConfirmado: z.boolean().optional(),
    metas: z.array(onboardingMetaPatchSchema).optional(),
    focoDoMes: z.string().max(200).optional(),
    tomPreferido: z.enum(TOM_ENUM).optional(),
  })
  .strict();

const completeOnboardingSchema = z
  .object({
    tomPreferido: z.enum(TOM_ENUM),
    metas: z.array(onboardingMetaPatchSchema).max(3).optional(),
    focoDoMes: z.string().max(200).optional(),
    perfilDeclarado: z.enum(PERFIL_DECLARADO_ENUM).optional(),
    stakesTipico: z.string().optional(),
    volumeTipicoMes: z.number().int().min(0).optional(),
    tempoJogaSerioMeses: z.number().int().min(0).optional(),
    redesPrincipais: z.array(z.string()).optional(),
    nivel: z.enum(NIVEL_ENUM).optional(),
    nivelConfirmado: z.boolean().optional(),
    nudges: z
      .object({
        bSnapshot: z.boolean().optional(),
        bLeak: z.boolean().optional(),
        bStudy: z.boolean().optional(),
        bVolume: z.boolean().optional(),
        bGrade: z.boolean().optional(),
        bDownswing: z.boolean().optional(),
        bLife: z.boolean().optional(),
        bMental: z.boolean().optional(),
      })
      .optional(),
    quietHours: z.object({ startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(0).max(23) }).optional(),
  })
  .strict();

function clampStr(s: any, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function clampRedes(redes: string[]): string[] {
  return redes
    .filter((r) => typeof r === "string")
    .slice(0, 10)
    .map((r) => (r.length > 50 ? r.slice(0, 50) : r));
}

function buildMetas(rawMetas: any[] | undefined): any[] | undefined {
  if (!Array.isArray(rawMetas)) return undefined;
  const now = new Date().toISOString();
  return rawMetas.slice(0, 3).map((m: any, i: number) => ({
    id: typeof m?.id === "string" && m.id.length > 0 ? m.id : `meta-${Date.now()}-${i}`,
    texto: clampStr(m?.texto, 200) ?? "",
    prazo: m?.prazo === "mes" || m?.prazo === "trimestre" ? m.prazo : null,
    criadaEm: now,
    origem: "onboarding" as const,
  }));
}

// =============================================================================
// GET /api/coach/onboarding
// =============================================================================
export async function handleGetOnboarding(req: any, res: any, injectedStorage?: any): Promise<void> {
  const userId = reqUserId(req);
  if (!req?.user || !userId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const profile = await store.getAiStructuredProfile(userId);
    const completed = profile?.onboardingCompletedAt != null;

    let hasImport = false;
    try {
      const stats = (await store.getDashboardStats(userId, "all")) ?? {};
      if (Number(stats.count ?? 0) > 0) hasImport = true;
      if (!hasImport) {
        const hist = (await store.getUploadHistory(userId)) ?? [];
        if (Array.isArray(hist) && hist.length > 0) hasImport = true;
      }
    } catch {
      hasImport = false;
    }

    let mode: "full" | "light" | null = null;
    if (!completed) {
      mode = profile?.onboardingDraft?.mode ?? "full";
    }

    let levelEstimate: any = null;
    try {
      levelEstimate = await buildLevelEstimate(req, store);
    } catch {
      levelEstimate = null;
    }

    res.status(200).json({
      completed,
      mode,
      draft: profile?.onboardingDraft ?? null,
      structuredProfile: profile,
      levelEstimate,
      hasImport,
    });
  } catch (err: any) {
    console.error("coach.onboarding.get.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// PATCH /api/coach/onboarding — persistencia incremental por step / skip
// =============================================================================
export async function handlePatchOnboarding(req: any, res: any, injectedStorage?: any): Promise<void> {
  const userId = reqUserId(req);
  if (!req?.user || !userId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  const parsed = patchOnboardingSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: "validation_failed", details: parsed.error.issues });
    return;
  }
  const body = parsed.data;
  try {
    const store = await resolveOnboardingStorage(injectedStorage);

    if (body.skip === true) {
      const out = await store.updateAiStructuredProfile(userId, { onboardingSkippedAt: new Date().toISOString() });
      res.status(200).json({ structuredProfile: out });
      return;
    }

    const delta: any = {};
    if (body.perfilDeclarado !== undefined) delta.perfilDeclarado = body.perfilDeclarado;
    if (body.stakesTipico !== undefined) delta.stakesTipico = clampStr(body.stakesTipico, 50);
    if (body.volumeTipicoMes !== undefined) delta.volumeTipicoMes = body.volumeTipicoMes;
    if (body.tempoJogaSerioMeses !== undefined) delta.tempoJogaSerioMeses = body.tempoJogaSerioMeses;
    if (body.redesPrincipais !== undefined) delta.redesPrincipais = clampRedes(body.redesPrincipais);
    if (body.nivel !== undefined) delta.nivel = body.nivel;
    if (body.nivelConfirmado !== undefined) delta.nivelConfirmado = body.nivelConfirmado;
    if (body.nivel !== undefined || body.nivelConfirmado !== undefined) delta.nivelEstimadoEm = new Date().toISOString();
    if (body.metas !== undefined) delta.metas = buildMetas(body.metas);
    if (body.focoDoMes !== undefined) {
      delta.focoDoMes = clampStr(body.focoDoMes, 200);
      delta.focoDoMesDefinidoEm = new Date().toISOString();
    }
    if (body.tomPreferido !== undefined) delta.tomPreferido = body.tomPreferido;

    // onboardingDraft.step (sempre que vier step ou mode)
    if (body.step !== undefined || body.mode !== undefined) {
      const cur = await store.getAiStructuredProfile(userId);
      delta.onboardingDraft = {
        step: body.step ?? cur?.onboardingDraft?.step ?? 1,
        mode: body.mode ?? cur?.onboardingDraft?.mode ?? "full",
        startedAt: cur?.onboardingDraft?.startedAt ?? new Date().toISOString(),
      };
    }

    const out = await store.updateAiStructuredProfile(userId, delta);
    res.status(200).json({ structuredProfile: out });
  } catch (err: any) {
    console.error("coach.onboarding.patch.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// POST /api/coach/onboarding/complete
// =============================================================================
export async function handleCompleteOnboarding(req: any, res: any, injectedStorage?: any): Promise<void> {
  const userId = reqUserId(req);
  if (!req?.user || !userId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  const parsed = completeOnboardingSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: "validation_failed", details: parsed.error.issues });
    return;
  }
  const body = parsed.data;
  try {
    const store = await resolveOnboardingStorage(injectedStorage);

    // 1. Grava campos do perfil estruturado.
    const profileDelta: any = {
      tomPreferido: body.tomPreferido,
    };
    if (body.metas !== undefined) profileDelta.metas = buildMetas(body.metas);
    if (body.focoDoMes !== undefined) {
      profileDelta.focoDoMes = clampStr(body.focoDoMes, 200);
      profileDelta.focoDoMesDefinidoEm = new Date().toISOString();
    }
    if (body.perfilDeclarado !== undefined) profileDelta.perfilDeclarado = body.perfilDeclarado;
    if (body.stakesTipico !== undefined) profileDelta.stakesTipico = clampStr(body.stakesTipico, 50);
    if (body.volumeTipicoMes !== undefined) profileDelta.volumeTipicoMes = body.volumeTipicoMes;
    if (body.tempoJogaSerioMeses !== undefined) profileDelta.tempoJogaSerioMeses = body.tempoJogaSerioMeses;
    if (body.redesPrincipais !== undefined) profileDelta.redesPrincipais = clampRedes(body.redesPrincipais);
    if (body.nivel !== undefined) profileDelta.nivel = body.nivel;
    if (body.nivelConfirmado !== undefined) profileDelta.nivelConfirmado = body.nivelConfirmado;
    await store.updateAiStructuredProfile(userId, profileDelta);

    // 2. Espelha tom + grava prefs de nudge + quiet hours (RF-09).
    const prefsDelta: any = { coachTone: body.tomPreferido };
    if (body.nudges) {
      const n = body.nudges;
      if (n.bSnapshot !== undefined) prefsDelta.nudgeBSnapshot = n.bSnapshot;
      if (n.bLeak !== undefined) prefsDelta.nudgeBLeak = n.bLeak;
      if (n.bStudy !== undefined) prefsDelta.nudgeBStudy = n.bStudy;
      if (n.bVolume !== undefined) prefsDelta.nudgeBVolume = n.bVolume;
      if (n.bGrade !== undefined) prefsDelta.nudgeBGrade = n.bGrade;
      if (n.bDownswing !== undefined) prefsDelta.nudgeBDownswing = n.bDownswing;
      if (n.bLife !== undefined) prefsDelta.nudgeBLife = n.bLife;
      if (n.bMental !== undefined) prefsDelta.nudgeBMental = n.bMental;
    }
    if (body.quietHours) {
      prefsDelta.quietHoursStart = body.quietHours.startHour;
      prefsDelta.quietHoursEnd = body.quietHours.endHour;
    }
    const preferences = await store.upsertCoachPreferences(userId, prefsDelta);

    // 3. Finaliza onboarding (depois de gravar tom — o profileDelta acima ja tem tomPreferido,
    // mas precisamos garantir que a call final NAO tenha tomPreferido diferente; redundante OK).
    const finalProfile = await store.updateAiStructuredProfile(userId, {
      tomPreferido: body.tomPreferido,
      onboardingCompletedAt: new Date().toISOString(),
      onboardingVersion: 1,
      onboardingDraft: null,
    });

    // #2 — aha moment: cria a 1a sessao de chat ja com um insight personalizado
    // (best-effort — falha aqui NAO falha o onboarding).
    let chatSessionId: string | null = null;
    try {
      const session = await store.createChatSession?.({
        userId,
        coachType: "technical",
        title: "Bem-vindo ao Grindfy AI",
      });
      chatSessionId = session?.id ?? null;
      if (chatSessionId) {
        await store.insertChatMessage?.({
          chatSessionId,
          role: "assistant",
          content: buildOnboardingFirstMessage(finalProfile),
        });
      }
    } catch (err) {
      console.error("coach.onboarding.first_insight.error", { userId, err });
      chatSessionId = null;
    }

    res.status(200).json({ structuredProfile: finalProfile, preferences, chatSessionId });
  } catch (err: any) {
    console.error("coach.onboarding.complete.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// #9 — "O que o Coach sabe de voce": GET/PUT do perfil estruturado editavel.
// Expoe os campos seguros do aiStructuredProfile (o que alimenta o contexto do
// agente). Da transparencia + controle ao jogador (confianca = coach que lembra).
// =============================================================================
const structuredProfilePatchSchema = z
  .object({
    tomPreferido: z.enum(TOM_ENUM).optional(),
    focoDoMes: z.string().max(200).nullable().optional(),
    metas: z.array(onboardingMetaPatchSchema).max(3).optional(),
    stakesTipico: z.string().max(50).nullable().optional(),
    volumeTipicoMes: z.number().int().min(0).nullable().optional(),
    perfilDeclarado: z.enum(PERFIL_DECLARADO_ENUM).nullable().optional(),
    redesPrincipais: z.array(z.string()).optional(),
    padroesConhecidos: z.array(z.string().max(200)).max(10).optional(),
    nivel: z.enum(NIVEL_ENUM).optional(),
    nivelConfirmado: z.boolean().optional(),
  })
  .strict();

export async function handleGetStructuredProfile(req: any, res: any, injectedStorage?: any): Promise<void> {
  const userId = reqUserId(req);
  if (!req?.user || !userId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const profile = await store.getAiStructuredProfile(userId);
    res.status(200).json({ structuredProfile: profile });
  } catch (err) {
    console.error("coach.structured_profile.get.error", { userId, err });
    res.status(500).json({ message: "Erro interno" });
  }
}

export async function handlePutStructuredProfile(req: any, res: any, injectedStorage?: any): Promise<void> {
  const userId = reqUserId(req);
  if (!req?.user || !userId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  const parsed = structuredProfilePatchSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: "validation_failed", details: parsed.error.issues });
    return;
  }
  const body = parsed.data;
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const delta: any = {};
    if (body.tomPreferido !== undefined) delta.tomPreferido = body.tomPreferido;
    if (body.focoDoMes !== undefined) {
      delta.focoDoMes = body.focoDoMes == null ? null : clampStr(body.focoDoMes, 200);
      delta.focoDoMesDefinidoEm = new Date().toISOString();
    }
    if (body.metas !== undefined) delta.metas = buildMetas(body.metas);
    if (body.stakesTipico !== undefined) delta.stakesTipico = body.stakesTipico == null ? null : clampStr(body.stakesTipico, 50);
    if (body.volumeTipicoMes !== undefined) delta.volumeTipicoMes = body.volumeTipicoMes;
    if (body.perfilDeclarado !== undefined) delta.perfilDeclarado = body.perfilDeclarado;
    if (body.redesPrincipais !== undefined) delta.redesPrincipais = clampRedes(body.redesPrincipais);
    if (body.padroesConhecidos !== undefined) delta.padroesConhecidos = body.padroesConhecidos.slice(0, 10);
    if (body.nivel !== undefined) delta.nivel = body.nivel;
    if (body.nivelConfirmado !== undefined) delta.nivelConfirmado = body.nivelConfirmado;
    // tom espelhado nas prefs (paridade com o onboarding).
    if (body.tomPreferido !== undefined) {
      try { await store.upsertCoachPreferences(userId, { coachTone: body.tomPreferido }); } catch (e) { console.error("coach.structured_profile.tone_mirror.error", { userId, e }); }
    }
    const updated = await store.updateAiStructuredProfile(userId, delta);
    res.status(200).json({ structuredProfile: updated });
  } catch (err) {
    console.error("coach.structured_profile.put.error", { userId, err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// Anti-fadiga telemetry endpoints
// =============================================================================
function categoryFromNudge(row: any): NudgeCategory | null {
  const c = row?.category;
  return (NUDGE_CATEGORIES as readonly string[]).includes(c) ? (c as NudgeCategory) : null;
}

async function loadNudgeAndOwner(req: any, res: any, store: any): Promise<any | null> {
  const userId = reqUserId(req);
  const id = req?.params?.id;
  if (!id) {
    res.status(400).json({ message: "invalid_id" });
    return null;
  }
  let row: any;
  try {
    row = await store.getNudgeLogById(id);
  } catch {
    row = undefined;
  }
  if (!row || row.userId !== userId) {
    res.status(404).json({ message: "not_found" });
    return null;
  }
  return row;
}

// GET /api/coach/nudges
export async function handleGetNudges(req: any, res: any, injectedStorage?: any): Promise<void> {
  const userId = reqUserId(req);
  if (!req?.user || !userId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const q = req.query || {};
    const opts: any = {};
    if (typeof q.status === "string" && q.status.length > 0) opts.status = q.status;
    if (typeof q.category === "string" && q.category.length > 0) opts.category = q.category;
    if (q.limit !== undefined) {
      const n = Number(q.limit);
      if (Number.isFinite(n)) opts.limit = Math.max(1, Math.min(200, Math.floor(n)));
    }
    const nudges = (await store.listNudgeLog(userId, opts)) ?? [];
    res.status(200).json({ nudges });
  } catch (err: any) {
    console.error("coach.nudges.list.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// POST /api/coach/nudges/:id/dismiss
export async function handleNudgeDismiss(req: any, res: any, injectedStorage?: any): Promise<void> {
  if (!req?.user || !reqUserId(req)) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const row = await loadNudgeAndOwner(req, res, store);
    if (!row) return;
    const cat = categoryFromNudge(row);
    if (row.status !== "dismissed") {
      await store.updateNudgeLogStatus(row.id, "dismissed", { dismissedAt: new Date() });
    }
    if (cat) {
      try {
        await store.checkAndFreezeCategory(reqUserId(req), cat);
      } catch (err) {
        console.error("coach.nudge.dismiss.freeze_check.error", { err });
      }
    }
    res.status(200).json({ nudge: { ...row, status: "dismissed" } });
  } catch (err: any) {
    console.error("coach.nudge.dismiss.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// POST /api/coach/nudges/:id/snooze
const snoozeBodySchema = z.object({ duration: z.enum(["short", "long"]) }).strict();
export async function handleNudgeSnooze(req: any, res: any, injectedStorage?: any): Promise<void> {
  if (!req?.user || !reqUserId(req)) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  const parsed = snoozeBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: "validation_failed", details: parsed.error.issues });
    return;
  }
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const row = await loadNudgeAndOwner(req, res, store);
    if (!row) return;
    const ms = parsed.data.duration === "short" ? 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
    const snoozeUntil = new Date(Date.now() + ms);
    await store.updateNudgeLogStatus(row.id, "snoozed", { snoozeUntil });
    res.status(200).json({ nudge: { ...row, status: "snoozed", snoozeUntil } });
  } catch (err: any) {
    console.error("coach.nudge.snooze.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// POST /api/coach/nudges/:id/engage
export async function handleNudgeEngage(req: any, res: any, injectedStorage?: any): Promise<void> {
  if (!req?.user || !reqUserId(req)) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const row = await loadNudgeAndOwner(req, res, store);
    if (!row) return;
    if (row.status !== "engaged") {
      await store.updateNudgeLogStatus(row.id, "engaged", { engagedAt: new Date() });
    }
    res.status(200).json({ nudge: { ...row, status: "engaged" } });
  } catch (err: any) {
    console.error("coach.nudge.engage.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

const CATEGORY_TO_TOGGLE: Record<string, string> = {
  "B-SNAPSHOT": "nudgeBSnapshot",
  "B-LEAK": "nudgeBLeak",
  "B-STUDY": "nudgeBStudy",
  "B-VOLUME": "nudgeBVolume",
  "B-GRADE": "nudgeBGrade",
  "B-DOWNSWING": "nudgeBDownswing",
  "B-LIFE": "nudgeBLife",
  "B-MENTAL": "nudgeBMental",
};

// POST /api/coach/nudges/:id/unsubscribe
export async function handleNudgeUnsubscribe(req: any, res: any, injectedStorage?: any): Promise<void> {
  const userId = reqUserId(req);
  if (!req?.user || !userId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const row = await loadNudgeAndOwner(req, res, store);
    if (!row) return;
    if (row.status !== "unsubscribed") {
      await store.updateNudgeLogStatus(row.id, "unsubscribed", { dismissedAt: new Date() });
    }
    const cat = categoryFromNudge(row);
    let preferences: any = null;
    if (cat) {
      const toggle = CATEGORY_TO_TOGGLE[cat];
      preferences = await store.upsertCoachPreferences(userId, { [toggle]: false } as any);
      try {
        await store.checkAndFreezeCategory(userId, cat);
      } catch (err) {
        console.error("coach.nudge.unsubscribe.freeze_check.error", { err });
      }
    }
    res.status(200).json({ nudge: { ...row, status: "unsubscribed" }, preferences });
  } catch (err: any) {
    console.error("coach.nudge.unsubscribe.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// POST /api/coach/preferences/unfreeze
const unfreezeBodySchema = z.object({ category: z.enum(NUDGE_CATEGORIES) }).strict();
export async function handleUnfreezeCategory(req: any, res: any, injectedStorage?: any): Promise<void> {
  const userId = reqUserId(req);
  if (!req?.user || !userId) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  const parsed = unfreezeBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: "validation_failed", details: parsed.error.issues });
    return;
  }
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const prefs = await store.getCoachPreferences(userId);
    const frozenCategories: Record<string, any> = { ...(prefs?.frozenCategories || {}) };
    delete frozenCategories[parsed.data.category];
    const preferences = await store.upsertCoachPreferences(userId, { frozenCategories } as any);
    res.status(200).json({ preferences });
  } catch (err: any) {
    console.error("coach.preferences.unfreeze.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

// =============================================================================
// POST /api/admin/coach/freeze-category — admin
// =============================================================================
const adminFreezeBodySchema = z
  .object({
    userId: z.string().min(1),
    category: z.enum(NUDGE_CATEGORIES),
    action: z.enum(["freeze", "unfreeze"]),
  })
  .strict();

export async function handleAdminFreezeCategory(req: any, res: any, injectedStorage?: any): Promise<void> {
  if (!req?.user) {
    res.status(401).json({ message: "Nao autenticado" });
    return;
  }
  if (!isAdminUser(req.user)) {
    res.status(403).json({ message: "Acesso negado" });
    return;
  }
  const parsed = adminFreezeBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: "validation_failed", details: parsed.error.issues });
    return;
  }
  const { userId, category, action } = parsed.data;
  try {
    const store = await resolveOnboardingStorage(injectedStorage);
    const prefs = await store.getCoachPreferences(userId);
    const frozenCategories: Record<string, any> = { ...(prefs?.frozenCategories || {}) };
    if (action === "freeze") {
      frozenCategories[category] = { frozenAt: new Date().toISOString(), reason: "admin" };
    } else {
      delete frozenCategories[category];
    }
    const updated = await store.upsertCoachPreferences(userId, { frozenCategories } as any);
    res.status(200).json({ ok: true, frozenCategories: updated?.frozenCategories ?? frozenCategories });
  } catch (err: any) {
    console.error("coach.admin.freeze_category.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}
