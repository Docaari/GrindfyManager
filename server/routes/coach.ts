// =============================================================================
// Coach Routes — AI Coach endpoints
// =============================================================================

import type { Express } from "express";
import { requireAuth } from "../auth";
import { nanoid } from "nanoid";
import { db } from "../db";
import {
  chatSessions,
  chatMessages,
  userAiProfile,
  monthlyCoachSummaries,
} from "@shared/schema";
import { eq, and, desc, ne, asc, gte, sql } from "drizzle-orm";
import { getCoachProfile } from "../coachMemory";

const VALID_COACH_TYPES = ['mental', 'tournament', 'technical'];

// Sprint coach-launch-fix (P0 #4): modelo Anthropic configuravel via env
// COACH_CHAT_MODEL. Default = claude-sonnet-4-6 (modelo atual em CLAUDE.md).
// O modelo `claude-sonnet-4-5-20250514` mencionado no codigo legado NAO EXISTE.
function getChatModel(): string {
  const env = process.env.COACH_CHAT_MODEL || process.env.COACH_MODEL;
  if (env && env.trim().length > 0) return env.trim();
  return 'claude-sonnet-4-6';
}

// Sprint coach-launch-fix (P0 #4): max_tokens padrao 2048 (era 1024).
// Override via COACH_MAX_TOKENS.
function getMaxTokens(): number {
  const env = process.env.COACH_MAX_TOKENS;
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 2048;
}

// Sprint Coach Sprint 0 + Coach-2B — imports lazy via dynamic import nos handlers
// para preservar testabilidade (mocks resolvidos via vi.mock no test file).

// =============================================================================
// Exported handlers (for unit testing)
// =============================================================================

export async function handleCoachChat(req: any, res: any, coachStorage: any): Promise<void> {
  // Auth check
  if (!req.user) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }

  const userId = req.user.userPlatformId;

  // Validate input inline (avoids mock issues with imported schema)
  const { coachType, message, sessionId } = req.body || {};

  if (!coachType || !VALID_COACH_TYPES.includes(coachType)) {
    res.status(400).json({ message: 'coachType invalido' });
    return;
  }

  if (!message || typeof message !== 'string' || message.length === 0 || message.length > 2000) {
    res.status(400).json({ message: 'Mensagem invalida' });
    return;
  }

  if (sessionId !== undefined && typeof sessionId !== 'string') {
    res.status(400).json({ message: 'sessionId invalido' });
    return;
  }

  // Sprint AI-0B / RF-04 — page context (opcional). Se presente, valida via
  // sanitizePageContext (discriminated union strict + scrub de injection); se
  // invalido -> 400 validation_failed (field: pageContext); ausente -> segue.
  let sanitizedPageContext: any = undefined;
  const rawPageContext = (req.body || {}).pageContext;
  if (rawPageContext !== undefined && rawPageContext !== null) {
    try {
      const { sanitizePageContext } = await import('../coachPageContext');
      const sanitized = sanitizePageContext(rawPageContext);
      if (!sanitized) {
        res.status(400).json({ error: 'validation_failed', field: 'pageContext' });
        return;
      }
      sanitizedPageContext = sanitized;
    } catch (err) {
      console.error('[coach.chat] pageContext sanitize failed', err);
      res.status(400).json({ error: 'validation_failed', field: 'pageContext' });
      return;
    }
  }

  // Sprint coach-launch-fix (P0 #1): tier gate. Resolve tier do usuario.
  // Storage pode injetar resolveUserTier (testes integrados); fallback para
  // helper coachAccess em producao.
  // Sprint AI-0B / RF-06 (ADR-148): NAO ha mais 403 tier_locked por coachType —
  // o agente eh unico; todo tier autenticado tem acesso. O tier so afeta rate
  // limit (abaixo) + tools (free => []).
  let tier: string = 'free';
  try {
    if (typeof (coachStorage as any).resolveUserTier === 'function') {
      tier = await (coachStorage as any).resolveUserTier(req.user);
    } else {
      const { resolveUserTier } = await import('../coachAccess');
      tier = await resolveUserTier(req.user);
    }
  } catch (err) {
    console.error('[coach.chat] resolveUserTier failed', err);
  }

  // Sprint coach-launch-fix RF-04 — rate limit por tier (10/50/200/Infinity).
  // Conta msgs nas ultimas 24h (rolling window). countUserMessagesInLastHour
  // permanece como fallback p/ compat (legacy storages).
  // Sprint AI-0B (reviewer LOW): upgradeTo do 429 vem de getUpgradeForRateLimit
  // (fonte unica em coachAccess) — nao mais inline.
  let limit: number = 10;
  let resolveUpgradeForRateLimit: (t: string) => 'pro' | 'premium' | null = (t) =>
    t === 'free' ? 'pro' : t === 'pro' ? 'premium' : null;
  try {
    const { getRateLimitForPlan, getUpgradeForRateLimit } = await import('../coachAccess');
    limit = getRateLimitForPlan(tier);
    if (typeof getUpgradeForRateLimit === 'function') resolveUpgradeForRateLimit = getUpgradeForRateLimit;
  } catch { /* fallback 10 + inline upgrade */ }

  let msgCount = 0;
  if (typeof (coachStorage as any).countUserMessagesInLastDay === 'function') {
    msgCount = await (coachStorage as any).countUserMessagesInLastDay(userId);
  } else if (typeof (coachStorage as any).countUserMessagesInLastHour === 'function') {
    msgCount = await (coachStorage as any).countUserMessagesInLastHour(userId);
  }

  if (Number.isFinite(limit) && msgCount >= limit) {
    // Rate limit headers + body com upgradeTo p/ UI.
    const upgradeTo: string | null = resolveUpgradeForRateLimit(tier);

    let resetAtIso: string | null = null;
    try {
      if (typeof (coachStorage as any).getOldestUserMessageInWindow === 'function') {
        const oldest = await (coachStorage as any).getOldestUserMessageInWindow(userId);
        if (oldest?.createdAt) {
          const ms = typeof oldest.createdAt === 'string'
            ? new Date(oldest.createdAt).getTime()
            : oldest.createdAt instanceof Date
              ? oldest.createdAt.getTime()
              : Date.now();
          resetAtIso = new Date(ms + 24 * 3600 * 1000).toISOString();
        }
      }
    } catch { /* noop */ }
    if (!resetAtIso) resetAtIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    try { res.setHeader('X-RateLimit-Limit', String(limit)); } catch { /* noop */ }
    try { res.setHeader('X-RateLimit-Remaining', '0'); } catch { /* noop */ }
    try { res.setHeader('X-RateLimit-Reset', resetAtIso); } catch { /* noop */ }
    res.status(429).json({
      code: 'rate_limited',
      limit,
      used: msgCount,
      currentPlan: tier,
      upgradeTo,
      resetAt: resetAtIso,
      message: `Limite de ${limit} mensagens em 24h atingido. Tente novamente mais tarde.`,
    });
    return;
  }

  // Session validation
  let activeSessionId = sessionId;

  if (sessionId) {
    // Validate existing session
    const session = await coachStorage.getSession(sessionId);
    if (!session) {
      res.status(404).json({ message: 'Sessao nao encontrada' });
      return;
    }
    if (session.userId !== userId) {
      res.status(403).json({ message: 'Acesso negado a esta sessao' });
      return;
    }
    if (session.coachType !== coachType) {
      res.status(400).json({ message: 'CoachType da sessao nao corresponde ao request' });
      return;
    }
  } else {
    // Archive any existing active session and create new one
    await coachStorage.archiveActiveSession(userId, coachType);
    const newSession = await coachStorage.createSession({
      userId,
      coachType,
    });
    activeSessionId = newSession.id;
  }

  // Save user message
  const userTokenCount = Math.ceil(message.length / 4);
  // Sprint coach-launch-fix RF-04 (TOCTOU): se storage expoe
  // reserveMessageSlotAndSaveUserMessage (insert + count atomico), usa-o e
  // captura erro de concorrencia para devolver 429. Fallback: saveMessage.
  if (typeof (coachStorage as any).reserveMessageSlotAndSaveUserMessage === 'function') {
    try {
      await (coachStorage as any).reserveMessageSlotAndSaveUserMessage({
        userId,
        sessionId: activeSessionId,
        role: 'user',
        content: message,
        tokenCount: userTokenCount,
        limit,
      });
    } catch (err: any) {
      if (err?.code === 'RATE_LIMIT') {
        try { res.setHeader('X-RateLimit-Limit', String(limit)); } catch { /* noop */ }
        try { res.setHeader('X-RateLimit-Remaining', '0'); } catch { /* noop */ }
        let resetAtIso2 = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        try { res.setHeader('X-RateLimit-Reset', resetAtIso2); } catch { /* noop */ }
        const upgradeTo: string | null = resolveUpgradeForRateLimit(tier);
        res.status(429).json({
          code: 'rate_limited',
          limit,
          currentPlan: tier,
          upgradeTo,
          resetAt: resetAtIso2,
          message: `Limite de ${limit} mensagens em 24h atingido (TOCTOU race).`,
        });
        return;
      }
      throw err;
    }
  } else {
    await coachStorage.saveMessage({
      sessionId: activeSessionId,
      role: 'user',
      content: message,
      tokenCount: userTokenCount,
    });
  }

  // Auto-generate title from first message if new session
  const existingMessages = await coachStorage.getSessionMessages(activeSessionId);
  if (!sessionId || (existingMessages && existingMessages.length <= 1)) {
    const title = message.substring(0, 50);
    await coachStorage.updateSessionTitle(activeSessionId, title);
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Sprint coach-launch-fix (P0 #5 + P0 #6): rastreio de abort + estado para
  // garantir que erros nao gerem mensagem fake como historico.
  let aborted = false;
  let streamFinished = false;
  let stream: any = null;
  let lastError: any = null;
  let assistantContent = '';
  const startedAt = Date.now();
  const model = getChatModel();
  const maxTokens = getMaxTokens();

  // Sprint coach-launch-fix (P0 #5): listener de disconnect.
  if (req && typeof req.on === 'function') {
    req.on('close', () => {
      if (!streamFinished) {
        aborted = true;
        try { stream?.controller?.abort?.(); } catch { /* noop */ }
      }
    });
  }

  // Sprint coach-launch-fix (P0 #2): tools wiring + (P0 #3): usage tracking
  // capturado dos eventos do stream.
  let usageData: any = null;
  const toolUseEvents: Array<any> = [];

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    // Lesson #5: vi.fn() nao eh constructor em strict mode — testes que mockam
    // SDK via mockImplementation(() => ({...})) quebram com `new`. Try/catch
    // com fallback para chamada direta (factory) cobre ambos producao + tests.
    let anthropicClient: any;
    try {
      anthropicClient = new (Anthropic as any)({ apiKey: process.env.ANTHROPIC_API_KEY });
    } catch {
      anthropicClient = (Anthropic as any)({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    // Build context for the coach
    const { assembleContext } = await import('../coachContext');
    // Sprint AI-0B / RF-01+RF-03 (ADR-148): agente unico — o "system prompt
    // legacy" deixa de ser por-coach. getSystemPrompt retorna o base unico
    // (GRINDFY_AI_BASE) — usado apenas como fallback string pelo buildSystemArray
    // quando COACH_PROMPT_CACHE_ENABLED=false; o caminho real eh o bloco STATIC.
    const { getGrindfyAiBasePrompt } = await import('../coachSystemBuilder');
    const getSystemPrompt = (_ct: string) => getGrindfyAiBasePrompt();

    // Sprint coach-launch-fix (P1 #8): assembleContext agora retorna
    // SystemBlock[] com cache_control via buildSystemArray.
    // Sprint AI-0B / RF-02: getWeeklyPlan + getStudyProgress + getPageContext
    // alimentados para todo coachType (contexto completo, sem gate por coach).
    const context = await assembleContext(
      { coachType, userId, message, sessionId: activeSessionId },
      {
        getUserProfile: async (uid: string) => await coachStorage.getUserProfile?.(uid) || null,
        getStatsSnapshot: async (uid: string) => await coachStorage.getUserStats?.(uid) || null,
        getLastArchivedSessionSummary: async (uid: string, ct: string) =>
          await coachStorage.getLastArchivedSessionSummary?.(uid, ct) || null,
        getSessionHistory: async (sid: string) => {
          const msgs = await coachStorage.getSessionMessages(sid);
          return (msgs || []).map((m: any) => ({ role: m.role, content: m.content }));
        },
        getSystemPrompt,
        getAiProfile: coachStorage.getAiProfileContent
          ? async (uid: string) => await coachStorage.getAiProfileContent(uid)
          : undefined,
        getActiveGrind: coachStorage.getActiveGrind
          ? async (uid: string) => await coachStorage.getActiveGrind(uid)
          : undefined,
        getRecentBreakFeedbacks: coachStorage.getRecentBreakFeedbacks
          ? async (uid: string) => await coachStorage.getRecentBreakFeedbacks(uid)
          : undefined,
        getDetectedLeaks: coachStorage.getDetectedLeaks
          ? async (uid: string) => await coachStorage.getDetectedLeaks(uid)
          : undefined,
        getWeeklyPlan: coachStorage.getWeeklyPlan
          ? async (uid: string) => await coachStorage.getWeeklyPlan(uid)
          : undefined,
        getStudyProgress: coachStorage.getStudyProgress
          ? async (uid: string) => await coachStorage.getStudyProgress(uid)
          : undefined,
        // Sprint AI-0B / RF-04: page context ja sanitizado (whitelist Zod +
        // scrub). undefined quando o body nao trouxe pageContext.
        getPageContext: sanitizedPageContext !== undefined
          ? async () => sanitizedPageContext
          : undefined,
      },
    );

    // Sprint coach-launch-fix (P0 #2): expor tools por tier.
    // Importacoes encapsuladas em try/catch porque side-effect import de
    // coachTools/index pode quebrar quando schemas mockados em testes nao
    // exportam todas as tabelas (graceful fallback: sem tools).
    let tools: any[] = [];
    try {
      // Side-effect import garante registro das tools no registry singleton.
      try {
        await import('../coachTools/index');
      } catch (sideErr) {
        console.error('[coach.chat] tool registry side-import failed', sideErr);
      }
      const { exportToolsForAnthropic, getTool } = await import('../coachTools/registry');
      tools = exportToolsForAnthropic(tier as any);
      // MEDIUM-1: filtrar stubs em producao para evitar que o LLM chame
      // handlers not_implemented. Em dev/test deixa passar.
      if (process.env.NODE_ENV === 'production') {
        tools = tools.filter((t: any) => {
          const def: any = getTool(t.name);
          return def && !def.__stub;
        });
      }
    } catch (toolErr) {
      console.error('[coach.chat] tool export failed', toolErr);
      tools = [];
    }

    const streamArgs: any = {
      model,
      max_tokens: maxTokens,
      system: context.system,
      messages: context.messages as any,
    };
    if (tools && tools.length > 0) {
      streamArgs.tools = tools;
    }

    if (process.env.COACH_DEBUG) {
      console.log('[coach.chat DEBUG] before stream', { tools: tools?.length, sysType: Array.isArray(streamArgs.system) ? 'array' : typeof streamArgs.system });
    }
    stream = anthropicClient.messages.stream(streamArgs);

    for await (const event of stream) {
      if (aborted) break;

      // P0 #3: capturar usage do message_start (input + cache tokens).
      if (event.type === 'message_start') {
        const u = (event as any).message?.usage;
        if (u) {
          usageData = {
            input_tokens: u.input_tokens ?? null,
            output_tokens: u.output_tokens ?? 0,
            cache_creation_input_tokens: u.cache_creation_input_tokens ?? null,
            cache_read_input_tokens: u.cache_read_input_tokens ?? null,
          };
        }
        continue;
      }

      // P0 #3: capturar output tokens finais do message_delta.
      if (event.type === 'message_delta') {
        const u = (event as any).usage;
        if (u && usageData) {
          if (u.output_tokens != null) usageData.output_tokens = u.output_tokens;
          if (u.input_tokens != null) usageData.input_tokens = u.input_tokens;
        } else if (u) {
          usageData = {
            input_tokens: u.input_tokens ?? null,
            output_tokens: u.output_tokens ?? 0,
            cache_creation_input_tokens: u.cache_creation_input_tokens ?? null,
            cache_read_input_tokens: u.cache_read_input_tokens ?? null,
          };
        }
        continue;
      }

      if (event.type === 'message_stop') {
        // Anthropic SDK as vezes anexa final usage em message_stop.
        const u = (event as any).message?.usage ?? (event as any).usage;
        if (u && usageData) {
          if (u.output_tokens != null) usageData.output_tokens = u.output_tokens;
        }
        continue;
      }

      if (event.type === 'content_block_delta' && (event.delta as any).type === 'text_delta') {
        const chunk = (event.delta as any).text;
        assistantContent += chunk;
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
        continue;
      }

      // P0 #2: tool_use events (content_block_start com type=tool_use).
      if (
        event.type === 'content_block_start' &&
        (event as any).content_block?.type === 'tool_use'
      ) {
        const cb = (event as any).content_block;
        toolUseEvents.push({
          name: cb.name,
          id: cb.id,
          input: cb.input,
        });
        continue;
      }
    }

    streamFinished = true;
  } catch (streamError: any) {
    lastError = streamError;
    if (!aborted) {
      // Send error via SSE — SOMENTE se nao foi abort do client.
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', message: streamError?.message || 'Erro ao processar resposta' })}\n\n`);
      } catch { /* response ja fechada */ }
    }
  }

  // Sprint coach-launch-fix (P0 #2): processar tool_use events colhidos.
  // Para tools com requiresConfirmation=true criar coach_action pendente +
  // emitir SSE 'tool_pending'. Para tools sem confirmacao executar imediato.
  if (!aborted && toolUseEvents.length > 0) {
    try {
      const { getTool } = await import('../coachTools/registry');
      for (const tu of toolUseEvents) {
        const tool: any = getTool(tu.name);
        if (!tool) continue;

        if (tool.requiresConfirmation) {
          // Cria coach_action pendente.
          try {
            if ((coachStorage as any).createCoachAction) {
              const action = await (coachStorage as any).createCoachAction({
                userId,
                chatSessionId: activeSessionId,
                toolName: tu.name,
                input: tu.input,
                status: 'pending',
              });
              try {
                res.write(`data: ${JSON.stringify({
                  type: 'tool_pending',
                  toolName: tu.name,
                  actionId: action?.id ?? null,
                })}\n\n`);
              } catch { /* noop */ }
            }
          } catch (err) {
            console.error('[coach.chat] createCoachAction failed', { tool: tu.name, err });
          }
        } else {
          // Executar imediato.
          try {
            const ctx = {
              userId,
              userPlatformId: userId,
              chatSessionId: activeSessionId,
              messageId: tu.id,
            };
            const out = await tool.handler(tu.input, ctx);
            try {
              res.write(`data: ${JSON.stringify({
                type: 'tool_result',
                toolName: tu.name,
                ok: out?.ok !== false,
                data: out?.data ?? null,
              })}\n\n`);
            } catch { /* noop */ }
          } catch (err: any) {
            console.error('[coach.chat] tool handler failed', { tool: tu.name, err });
            try {
              res.write(`data: ${JSON.stringify({
                type: 'tool_result',
                toolName: tu.name,
                ok: false,
                error: err?.message || 'tool_failed',
              })}\n\n`);
            } catch { /* noop */ }
          }
        }
      }
    } catch (err) {
      console.error('[coach.chat] tool processing loop failed', err);
    }
  }

  // Sprint coach-launch-fix (P0 #6 + P1 #13): try/finally garante save+end
  // mesmo em erro. Mensagem fake (assistantContent default) eh marcada como
  // errored via metadata para nao confundir historico.
  let savedMsg: any = null;
  try {
    if (aborted) {
      // Em abort do client: NAO salvar mensagem fake. Apenas finalizar.
      res.end?.();
      return;
    }

    // Sempre salvar mensagem (mesmo se vazio) para estado consistente.
    const isErrored = !!lastError;
    const finalContent = assistantContent || (isErrored
      ? 'Desculpe, ocorreu um erro ao processar sua mensagem.'
      : '');

    const saveArgs: any = {
      sessionId: activeSessionId,
      role: 'assistant',
      content: finalContent,
      // P0 #3: tokens reais do stream (quando disponivel) sobre estimativa fake.
      tokenCount: usageData?.output_tokens ?? Math.ceil(finalContent.length / 4),
      // Sprint coach-launch-fix RF-04 P1 #6: marcar errored em metadata
      // para que UI/historico saibam que esta resposta foi degradada.
      metadata: isErrored
        ? { errored: true, errorCode: lastError?.code || 'stream_error' }
        : undefined,
      // MEDIUM-8 (prompt-caching test): saveMessage NAO carrega usage; recebe
      // apenas model + latencyMs. recordUsage faz UPDATE separado.
      model,
      latencyMs: Date.now() - startedAt,
    };
    savedMsg = await coachStorage.saveMessage(saveArgs);

    // P0 #3: persistir usage via recordUsage(messageId, usage, model, latencyMs).
    if (usageData && (coachStorage as any).recordUsage) {
      try {
        await (coachStorage as any).recordUsage(
          savedMsg?.id ?? null,
          usageData,
          model,
          Date.now() - startedAt,
        );
      } catch (err) {
        console.error('[coach.chat] recordUsage failed', err);
      }
    }

    // Sprint coach-launch-fix RF-04 P1 #6: errorMessage na sessao quando
    // aplicavel (para UI sinalizar sessao degradada).
    if (isErrored && (coachStorage as any).updateSessionError) {
      try {
        await (coachStorage as any).updateSessionError(activeSessionId, lastError?.message || 'stream_error');
      } catch { /* noop */ }
    }

    // Update session token count
    const totalTokens = (usageData?.input_tokens ?? userTokenCount) + (usageData?.output_tokens ?? Math.ceil(finalContent.length / 4));
    try {
      await coachStorage.updateSessionTokenCount(activeSessionId, totalTokens);
    } catch { /* noop */ }

    // Send done event
    const messageId = savedMsg?.id || nanoid();
    try {
      res.write(`data: ${JSON.stringify({ type: 'done', messageId, sessionId: activeSessionId })}\n\n`);
    } catch { /* noop */ }
  } catch (saveErr) {
    console.error('[coach.chat] save phase failed', saveErr);
  } finally {
    try { res.end?.(); } catch { /* noop */ }
  }
}

export async function handleListSessions(req: any, res: any, coachStorage: any): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }

  const coachType = req.query.coachType;
  if (!coachType || !VALID_COACH_TYPES.includes(coachType)) {
    res.status(400).json({ message: 'coachType invalido' });
    return;
  }

  const sessions = await coachStorage.listSessions(req.user.userPlatformId, coachType);
  res.json(sessions);
}

export async function handleGetSessionMessages(req: any, res: any, coachStorage: any): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }

  const sessionId = req.params.id;

  // Validate session ownership
  const session = await coachStorage.getSession(sessionId);
  if (!session) {
    res.status(404).json({ message: 'Sessao nao encontrada' });
    return;
  }
  if (session.userId !== req.user.userPlatformId) {
    res.status(403).json({ message: 'Acesso negado' });
    return;
  }

  // Parse pagination
  let limit = parseInt(req.query.limit || '50', 10);
  let offset = parseInt(req.query.offset || '0', 10);
  if (limit > 100) limit = 100;
  if (limit < 1) limit = 50;
  if (offset < 0) offset = 0;

  const [messages, total] = await Promise.all([
    coachStorage.getSessionMessages(sessionId, limit, offset),
    coachStorage.countSessionMessages(sessionId),
  ]);

  res.json({ messages, total, limit, offset });
}

export async function handleArchiveSession(req: any, res: any, coachStorage: any): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }

  const sessionId = req.params.id;

  const session = await coachStorage.getSession(sessionId);
  if (!session) {
    res.status(404).json({ message: 'Sessao nao encontrada' });
    return;
  }
  if (session.userId !== req.user.userPlatformId) {
    res.status(403).json({ message: 'Acesso negado' });
    return;
  }
  if (session.status === 'archived') {
    res.status(409).json({ message: 'Sessao ja esta arquivada' });
    return;
  }

  await coachStorage.archiveSession(sessionId);
  res.json({ message: 'Sessao arquivada com sucesso', id: sessionId });
}

export async function handleDeleteSession(req: any, res: any, coachStorage: any): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }

  const sessionId = req.params.id;

  const session = await coachStorage.getSession(sessionId);
  if (!session) {
    res.status(404).json({ message: 'Sessao nao encontrada' });
    return;
  }
  if (session.userId !== req.user.userPlatformId) {
    res.status(403).json({ message: 'Acesso negado' });
    return;
  }

  await coachStorage.deleteSession(sessionId);
  res.json({ message: 'Sessao removida com sucesso', id: sessionId });
}

// =============================================================================
// Route registration
// =============================================================================

// =============================================================================
// Real coachStorage implementation using Drizzle
// =============================================================================

function createCoachStorage() {
  return {
    async getSession(sessionId: string) {
      const results = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId));
      return results.length > 0 ? results[0] : null;
    },

    async createSession(data: { userId: string; coachType: string }) {
      const id = nanoid();
      const values = { id, userId: data.userId, coachType: data.coachType, status: 'active' as const };
      await db.insert(chatSessions).values(values);
      return { ...values, tokenCount: 0, messageCount: 0 };
    },

    async archiveActiveSession(userId: string, coachType: string) {
      await db.update(chatSessions)
        .set({ status: 'archived' })
        .where(and(
          eq(chatSessions.userId, userId),
          eq(chatSessions.coachType, coachType),
          eq(chatSessions.status, 'active'),
        ));
    },

    async saveMessage(data: { sessionId: string; role: string; content: string; tokenCount: number }) {
      const id = nanoid();
      await db.insert(chatMessages).values({ id, ...data });
      return { id, ...data };
    },

    async updateSessionTokenCount(sessionId: string, additionalTokens: number) {
      await db.update(chatSessions)
        .set({ tokenCount: sql`COALESCE(${chatSessions.tokenCount}, 0) + ${additionalTokens}` })
        .where(eq(chatSessions.id, sessionId));
    },

    async updateSessionTitle(sessionId: string, title: string) {
      await db.update(chatSessions)
        .set({ title })
        .where(eq(chatSessions.id, sessionId));
    },

    async getSessionMessages(sessionId: string, limit = 50, offset = 0) {
      return await db.select().from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(asc(chatMessages.createdAt))
        .limit(limit)
        .offset(offset);
    },

    async countSessionMessages(sessionId: string) {
      const result = await db.select({ count: sql`count(*)` })
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId));
      return Number(result[0]?.count || 0);
    },

    async countUserMessagesInLastHour(userId: string) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      // Count messages from user's sessions only (JOIN with chatSessions)
      const result = await db.select({ count: sql`count(*)` })
        .from(chatMessages)
        .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
        .where(and(
          eq(chatSessions.userId, userId),
          eq(chatMessages.role, 'user'),
          gte(chatMessages.createdAt, oneHourAgo),
        ));
      return Number(result[0]?.count || 0);
    },

    async listSessions(userId: string, coachType: string) {
      return await db.select({
        id: chatSessions.id,
        coachType: chatSessions.coachType,
        title: chatSessions.title,
        status: chatSessions.status,
        tokenCount: chatSessions.tokenCount,
        messageCount: chatSessions.messageCount,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
      }).from(chatSessions)
        .where(and(
          eq(chatSessions.userId, userId),
          eq(chatSessions.coachType, coachType),
          ne(chatSessions.status, 'deleted'),
        ))
        .orderBy(desc(chatSessions.updatedAt));
    },

    async archiveSession(sessionId: string) {
      await db.update(chatSessions)
        .set({ status: 'archived' })
        .where(eq(chatSessions.id, sessionId));
    },

    async deleteSession(sessionId: string) {
      await db.update(chatSessions)
        .set({ status: 'deleted' })
        .where(eq(chatSessions.id, sessionId));
    },

    async getUserProfile(userId: string) {
      return await getCoachProfile(userId);
    },

    async getUserStats(userId: string) {
      const { storage } = await import('../storage');
      return await storage.getDashboardStats(userId, 'all');
    },

    async getLastArchivedSessionSummary(userId: string, coachType: string) {
      const results = await db.select({ summary: chatSessions.summary })
        .from(chatSessions)
        .where(and(
          eq(chatSessions.userId, userId),
          eq(chatSessions.coachType, coachType),
          eq(chatSessions.status, 'archived'),
        ))
        .orderBy(desc(chatSessions.updatedAt))
        .limit(1);
      return results.length > 0 ? results[0].summary : null;
    },

    async getMonthlySummaries(userId: string, coachType: string) {
      return await db.select()
        .from(monthlyCoachSummaries)
        .where(and(
          eq(monthlyCoachSummaries.userId, userId),
          eq(monthlyCoachSummaries.coachType, coachType),
        ))
        .orderBy(desc(monthlyCoachSummaries.month));
    },
  };
}

export function registerCoachRoutes(app: Express): void {
  const coachStorage = createCoachStorage();

  // POST /api/coach/chat — streaming chat
  app.post('/api/coach/chat', requireAuth, async (req: any, res: any) => {
    try {
      await handleCoachChat(req, res, coachStorage);
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ message: error.message || 'Erro interno' });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Erro interno do servidor' })}\n\n`);
        res.end();
      }
    }
  });

  // GET /api/coach/sessions
  app.get('/api/coach/sessions', requireAuth, async (req: any, res: any) => {
    try {
      await handleListSessions(req, res, coachStorage);
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Erro interno' });
    }
  });

  // GET /api/coach/sessions/:id/messages
  app.get('/api/coach/sessions/:id/messages', requireAuth, async (req: any, res: any) => {
    try {
      await handleGetSessionMessages(req, res, coachStorage);
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Erro interno' });
    }
  });

  // POST /api/coach/sessions/:id/archive
  app.post('/api/coach/sessions/:id/archive', requireAuth, async (req: any, res: any) => {
    try {
      await handleArchiveSession(req, res, coachStorage);
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Erro interno' });
    }
  });

  // DELETE /api/coach/sessions/:id
  app.delete('/api/coach/sessions/:id', requireAuth, async (req: any, res: any) => {
    try {
      await handleDeleteSession(req, res, coachStorage);
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Erro interno' });
    }
  });

  // GET /api/coach/profile
  app.get('/api/coach/profile', requireAuth, async (req: any, res: any) => {
    try {
      const userId = req.user?.userPlatformId;
      if (!userId) {
        res.status(401).json({ message: 'Nao autenticado' });
        return;
      }
      const profile = await getCoachProfile(userId);
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Erro interno' });
    }
  });

  // PUT /api/coach/profile
  app.put('/api/coach/profile', requireAuth, async (req: any, res: any) => {
    try {
      const userId = req.user?.userPlatformId;
      if (!userId) {
        res.status(401).json({ message: 'Nao autenticado' });
        return;
      }
      const { content } = req.body || {};
      if (typeof content !== 'string') {
        res.status(400).json({ message: 'Conteudo invalido' });
        return;
      }
      const { updateCoachProfile } = await import('../coachMemory');
      await updateCoachProfile(userId, content);
      res.json({ message: 'Perfil atualizado com sucesso' });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Erro ao atualizar perfil' });
    }
  });

  // GET /api/coach/monthly-summaries
  app.get('/api/coach/monthly-summaries', requireAuth, async (req: any, res: any) => {
    try {
      const userId = req.user?.userPlatformId;
      if (!userId) {
        res.status(401).json({ message: 'Nao autenticado' });
        return;
      }
      const coachType = req.query.coachType;
      if (!coachType || !VALID_COACH_TYPES.includes(coachType)) {
        res.status(400).json({ message: 'coachType invalido' });
        return;
      }
      const summaries = await coachStorage.getMonthlySummaries(userId, coachType);
      res.json(summaries);
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Erro interno' });
    }
  });

  // ---------------------------------------------------------------------------
  // Sprint Coach Sprint 0 — Preferences + Audit
  // ---------------------------------------------------------------------------
  app.get('/api/coach/preferences', requireAuth, async (req: any, res: any) => {
    await handleGetCoachPreferences(req, res);
  });
  app.put('/api/coach/preferences', requireAuth, async (req: any, res: any) => {
    await handlePutCoachPreferences(req, res);
  });
  app.get('/api/coach/audit', requireAuth, async (req: any, res: any) => {
    await handleGetCoachAudit(req, res);
  });
  app.post('/api/coach/audit/:id/dismiss', requireAuth, async (req: any, res: any) => {
    await handlePostCoachAuditDismiss(req, res);
  });
  app.post('/api/coach/audit/export', requireAuth, async (req: any, res: any) => {
    await handlePostCoachAuditExport(req, res);
  });

  // ---------------------------------------------------------------------------
  // Sprint Coach-2B — Actions confirm/cancel/undo
  // ---------------------------------------------------------------------------
  app.get('/api/coach/actions/:id', requireAuth, async (req: any, res: any) => {
    await handleGetCoachAction(req, res);
  });
  app.post('/api/coach/actions/:id/confirm', requireAuth, async (req: any, res: any) => {
    await handlePostCoachActionConfirm(req, res);
  });
  app.post('/api/coach/actions/:id/cancel', requireAuth, async (req: any, res: any) => {
    await handlePostCoachActionCancel(req, res);
  });
  app.post('/api/coach/actions/:id/undo', requireAuth, async (req: any, res: any) => {
    await handlePostCoachActionUndo(req, res);
  });
}

// =============================================================================
// Sprint Coach Sprint 0 — handlers (preferences + audit)
// =============================================================================

function buildPrefsResponse(prefs: any, timezone: string) {
  return {
    nudges: {
      bSnapshot: prefs.nudgeBSnapshot,
      bLeak: prefs.nudgeBLeak,
      bStudy: prefs.nudgeBStudy,
      bVolume: prefs.nudgeBVolume,
      bGrade: prefs.nudgeBGrade,
      bDownswing: prefs.nudgeBDownswing,
      bLife: prefs.nudgeBLife,
      bMental: prefs.nudgeBMental,
    },
    quietHours: {
      startHour: prefs.quietHoursStart,
      endHour: prefs.quietHoursEnd,
      timezone,
    },
    frequencyCap: {
      perDay: prefs.maxNudgesPerDay,
      perHour: prefs.maxNudgesPerHour,
    },
    channels: {
      inApp: prefs.channelInApp,
      email: prefs.channelEmail,
      push: prefs.channelPush,
    },
    coachTone: prefs.coachTone,
    updatedAt: prefs.updatedAt
      ? (prefs.updatedAt instanceof Date
          ? prefs.updatedAt.toISOString()
          : String(prefs.updatedAt))
      : new Date().toISOString(),
  };
}

export async function handleGetCoachPreferences(req: any, res: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Nao autenticado' });
      return;
    }
    const { getCoachPreferences } = await import('../storage/coachPreferences');
    const { storage } = await import('../storage');
    const prefs = await getCoachPreferences(userId);
    const tz = await (storage as any).getUserTimezone?.(userId).catch(() => null) || 'America/Sao_Paulo';
    res.status(200).json(buildPrefsResponse(prefs, tz || 'America/Sao_Paulo'));
  } catch (err: any) {
    console.error('coach.preferences.get.error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

export async function handlePutCoachPreferences(req: any, res: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Nao autenticado' });
      return;
    }
    const { updateCoachPreferencesSchema } = await import('@shared/schema');
    const parsed = updateCoachPreferencesSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({
        message: 'validation_failed',
        details: parsed.error.issues,
      });
      return;
    }
    const { upsertCoachPreferences } = await import('../storage/coachPreferences');
    const { storage } = await import('../storage');
    const prefs = await upsertCoachPreferences(userId, parsed.data as any);
    const tz = await (storage as any).getUserTimezone?.(userId).catch(() => null) || 'America/Sao_Paulo';
    res.status(200).json(buildPrefsResponse(prefs, tz));
  } catch (err: any) {
    console.error('coach.preferences.put.error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

function parseAuditQuery(query: any): { ok: true; opts: any } | { ok: false } {
  const opts: any = {};
  const t = query?.type;
  if (typeof t === 'string' && t.length > 0) opts.type = t;
  if (typeof query?.category === 'string') opts.category = query.category;
  if (typeof query?.cursor === 'string') opts.cursor = query.cursor;
  let limit = 20;
  if (query?.limit !== undefined) {
    const n = Number(query.limit);
    if (Number.isFinite(n)) limit = Math.max(1, Math.min(100, Math.floor(n)));
  }
  opts.limit = limit;
  if (query?.dateFrom) opts.dateFrom = String(query.dateFrom);
  if (query?.dateTo) opts.dateTo = String(query.dateTo);
  if (opts.dateFrom && opts.dateTo && opts.dateFrom > opts.dateTo) {
    return { ok: false };
  }
  return { ok: true, opts };
}

export async function handleGetCoachAudit(req: any, res: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Nao autenticado' });
      return;
    }
    const parsed = parseAuditQuery(req.query || {});
    if (!parsed.ok) {
      res.status(400).json({ message: 'validation_failed' });
      return;
    }
    const { storage } = await import('../storage');
    const result = await (storage as any).listCoachAudit(userId, parsed.opts);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('coach.audit.get.error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

export async function handlePostCoachAuditDismiss(req: any, res: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Nao autenticado' });
      return;
    }
    const { id } = req.params || {};
    if (!id) {
      res.status(400).json({ message: 'invalid_id' });
      return;
    }
    const { storage } = await import('../storage');
    const item = await (storage as any).getCoachAuditById(id);
    if (!item) {
      res.status(404).json({ message: 'Acao nao encontrada' });
      return;
    }
    if (item.userId !== userId) {
      res.status(403).json({ message: 'Acesso negado' });
      return;
    }
    await (storage as any).updateNudgeLogStatus(id, 'dismissed', {
      dismissedAt: new Date(),
    });
    res.status(200).json({ id, status: 'dismissed' });
  } catch (err: any) {
    console.error('coach.audit.dismiss.error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

export async function handlePostCoachAuditExport(req: any, res: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Nao autenticado' });
      return;
    }
    const { storage } = await import('../storage');
    const result = await (storage as any).listCoachAudit(userId, { limit: 5000 });
    res.status(200).json(result);
  } catch (err: any) {
    console.error('coach.audit.export.error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

// =============================================================================
// Sprint coach-launch-fix RF-04.4 — GET /api/coach/limits
//
// Retorna estado atual de rate limit + acessibilidade de coaches por tier,
// para alimentar UI (LimitCounter + UpgradeCoachModal).
// =============================================================================

const COACH_LIMITS_BY_TIER: Record<string, number | 'unlimited'> = {
  free: 10,
  pro: 50,
  premium: 200,
  admin: 'unlimited',
};

// Sprint AI-0B / RF-06 (ADR-148): nao ha mais gate por coachType — todo tier
// tem acesso ao agente unico. accessibleCoaches mantido por back-compat de UI
// (as 3 "lentes" estao todas disponiveis para todo tier).
const ALL_LENSES = ['mental', 'tournament', 'technical'];
const COACH_ACCESS_BY_TIER: Record<string, string[]> = {
  free: ALL_LENSES,
  pro: ALL_LENSES,
  premium: ALL_LENSES,
  admin: ALL_LENSES,
};

export async function handleGetCoachLimits(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }

  // Permitir injecao de storage para testabilidade. Em producao, importa lazy.
  let store: any = injectedStorage;
  if (!store) {
    try {
      const { resolveUserTier } = await import('../coachAccess');
      const { storage: realStorage } = await import('../storage');
      store = {
        resolveUserTier: async (u: any) => await resolveUserTier(u),
        countUserMessagesInLastDay: async (uid: string) =>
          await (realStorage as any).countCoachMessagesInLastDay?.(uid) ?? 0,
        getOldestUserMessageInWindow: async (uid: string) =>
          await (realStorage as any).getOldestCoachMessageInWindow?.(uid) ?? null,
      };
    } catch (err) {
      console.error('[coach.limits] storage init failed', err);
      res.status(500).json({ message: 'Erro interno' });
      return;
    }
  }

  try {
    const tier = await store.resolveUserTier(req.user);
    const used = (await store.countUserMessagesInLastDay(req.user.userPlatformId)) ?? 0;
    const oldest = await store.getOldestUserMessageInWindow(req.user.userPlatformId);

    const dailyLimit = COACH_LIMITS_BY_TIER[tier] ?? 10;
    const accessibleCoaches = COACH_ACCESS_BY_TIER[tier] ?? ['mental'];

    let remaining: number | 'unlimited';
    let resetAt: string | null;
    if (dailyLimit === 'unlimited') {
      remaining = 'unlimited';
      resetAt = null;
    } else {
      remaining = Math.max(0, dailyLimit - used);
      // Reset = createdAt do mais antigo + 24h. Se nenhuma msg, agora + 24h.
      if (oldest?.createdAt) {
        const oldestMs =
          typeof oldest.createdAt === 'string'
            ? new Date(oldest.createdAt).getTime()
            : oldest.createdAt instanceof Date
              ? oldest.createdAt.getTime()
              : Date.now();
        resetAt = new Date(oldestMs + 24 * 3600 * 1000).toISOString();
      } else {
        resetAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      }
    }

    res.status(200).json({
      plan: tier,
      dailyLimit,
      used,
      remaining,
      resetAt,
      accessibleCoaches,
    });
  } catch (err: any) {
    console.error('[coach.limits] error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

// =============================================================================
// Sprint coach-launch-fix RF-02 — Message feedback (thumbs up/down + admin stats)
// =============================================================================

const FEEDBACK_VALUES = new Set(['up', 'down']);

export async function handlePostMessageFeedback(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }
  const userId = req.user.userPlatformId;
  const messageId = req.params?.id;
  if (!messageId) {
    res.status(400).json({ message: 'message id obrigatorio' });
    return;
  }

  let store: any = injectedStorage;
  if (!store) {
    try {
      const { storage: realStorage } = await import('../storage');
      store = realStorage;
    } catch {
      res.status(500).json({ message: 'Erro interno' });
      return;
    }
  }

  try {
    // 1) Carregar message + session.
    const message = await store.getMessage(messageId);
    if (!message) {
      res.status(404).json({ message: 'Mensagem nao encontrada' });
      return;
    }
    const session = await store.getSession(message.sessionId);
    if (!session) {
      res.status(404).json({ message: 'Sessao nao encontrada' });
      return;
    }

    // 2) Ownership ANTES de role check (information disclosure prevention).
    if (session.userId !== userId) {
      res.status(403).json({ message: 'Acesso negado' });
      return;
    }

    // 3) Role check (apenas messages do assistant).
    if (message.role !== 'assistant') {
      res.status(400).json({ message: 'Apenas mensagens do coach (nao do usuario) aceitam feedback' });
      return;
    }

    // 4) Validate body.
    const { feedback, comment } = req.body || {};
    if (!FEEDBACK_VALUES.has(feedback)) {
      res.status(400).json({ message: 'feedback deve ser "up" ou "down"' });
      return;
    }
    if (comment !== undefined && comment !== null) {
      if (typeof comment !== 'string') {
        res.status(400).json({ message: 'comment deve ser string' });
        return;
      }
      if (comment.length > 500) {
        res.status(400).json({ message: 'comment deve ter no maximo 500 caracteres' });
        return;
      }
    }

    // 5) Insert feedback (storage detecta duplicatas via UNIQUE).
    const result = await store.insertFeedback({
      messageId,
      userId,
      feedback,
      comment: comment ?? null,
    });

    if (result?.alreadyExists) {
      res.status(409).json({
        message: 'Feedback ja existe para esta mensagem. Use DELETE + POST para alterar.',
      });
      return;
    }

    res.status(201).json(result);
  } catch (err: any) {
    console.error('[coach.feedback.post] error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

export async function handleDeleteMessageFeedback(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }
  const userId = req.user.userPlatformId;
  const messageId = req.params?.id;
  if (!messageId) {
    res.status(400).json({ message: 'message id obrigatorio' });
    return;
  }

  let store: any = injectedStorage;
  if (!store) {
    try {
      const { storage: realStorage } = await import('../storage');
      store = realStorage;
    } catch {
      res.status(500).json({ message: 'Erro interno' });
      return;
    }
  }

  try {
    const message = await store.getMessage(messageId);
    if (!message) {
      res.status(404).json({ message: 'Mensagem nao encontrada' });
      return;
    }
    const session = await store.getSession(message.sessionId);
    if (!session) {
      res.status(404).json({ message: 'Sessao nao encontrada' });
      return;
    }
    if (session.userId !== userId) {
      res.status(403).json({ message: 'Acesso negado' });
      return;
    }

    const result = await store.deleteFeedback({ messageId, userId });
    if (!result?.deleted) {
      res.status(404).json({ message: 'Feedback nao encontrado' });
      return;
    }
    res.status(200).json({ deleted: true });
  } catch (err: any) {
    console.error('[coach.feedback.delete] error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

export async function handleGetFeedbackStats(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }
  if (!isAdminUser(req.user)) {
    res.status(403).json({ message: 'Acesso negado' });
    return;
  }

  let store: any = injectedStorage;
  if (!store) {
    try {
      const { storage: realStorage } = await import('../storage');
      store = realStorage;
    } catch {
      res.status(500).json({ message: 'Erro interno' });
      return;
    }
  }

  try {
    const opts: any = { topDownLimit: 10 };
    const ct = req.query?.coachType;
    if (ct && typeof ct === 'string') opts.coachType = ct;

    const data = await store.getFeedbackStats(opts);
    res.status(200).json(data);
  } catch (err: any) {
    console.error('[coach.feedback.stats] error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

// =============================================================================
// Sprint coach-launch-fix RF-14 — GET /api/admin/coach/cost-metrics (admin)
// =============================================================================

function isAdminUser(user: any): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.subscriptionPlan === 'admin';
}

export async function handleGetCostMetrics(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }
  if (!isAdminUser(req.user)) {
    res.status(403).json({ message: 'Acesso negado' });
    return;
  }

  // Parse + validate days param.
  const rawDays = req.query?.days;
  let days = 7;
  if (rawDays !== undefined && rawDays !== '') {
    const n = Number(rawDays);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 90) {
      res.status(400).json({ message: 'days deve ser inteiro entre 1 e 90' });
      return;
    }
    days = n;
  }

  let store: any = injectedStorage;
  if (!store) {
    try {
      const { storage: realStorage } = await import('../storage');
      store = realStorage;
    } catch (err) {
      console.error('[coach.cost-metrics] storage init failed', err);
      res.status(500).json({ message: 'Erro interno' });
      return;
    }
  }

  try {
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 3600 * 1000);
    const data = await store.getCostMetrics({ days });

    const totalMessages = data?.totalMessages ?? 0;
    const totalCost = data?.totalCost ?? 0;
    const avgCostPerMessage = totalMessages > 0 ? totalCost / totalMessages : 0;

    res.status(200).json({
      period: {
        from: from.toISOString(),
        to: now.toISOString(),
        days,
      },
      totalMessages,
      totalCost,
      avgCostPerMessage,
      cacheHitRate: data?.cacheHitRate ?? 0,
      byCoachType: data?.byCoachType ?? {},
      byModel: data?.byModel ?? {},
      byDay: data?.byDay ?? [],
    });
  } catch (err: any) {
    console.error('[coach.cost-metrics] error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

// =============================================================================
// Sprint Coach-2B — Actions handlers
// =============================================================================

export async function handleGetCoachAction(req: any, res: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Nao autenticado' });
      return;
    }
    const { id } = req.params || {};
    if (!id) {
      res.status(400).json({ message: 'invalid_id' });
      return;
    }
    const { getCoachActionForUser } = await import('../coachToolRunner');
    const out = await getCoachActionForUser(id, { userPlatformId: userId });
    if (!out.ok) {
      res.status(out.status).json({ message: out.code });
      return;
    }
    res.status(200).json(out.action);
  } catch (err: any) {
    console.error('coach.action.get.error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

export async function handlePostCoachActionConfirm(req: any, res: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Nao autenticado' });
      return;
    }
    const { id } = req.params || {};
    if (!id) {
      res.status(400).json({ message: 'invalid_id' });
      return;
    }
    const { confirmCoachAction } = await import('../coachToolRunner');
    const out = await confirmCoachAction(id, { userPlatformId: userId });
    if (!out.ok) {
      res.status(out.status).json({ message: out.code, details: out.details });
      return;
    }
    res.status(200).json({
      id,
      status: 'completed',
      payloadAfter: out.payloadAfter,
      affectedEntityType: out.affectedEntityType,
      affectedEntityId: out.affectedEntityId,
      undoExpiresAt: out.undoExpiresAt instanceof Date
        ? out.undoExpiresAt.toISOString()
        : out.undoExpiresAt,
    });
  } catch (err: any) {
    console.error('coach.action.confirm.error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

export async function handlePostCoachActionCancel(req: any, res: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Nao autenticado' });
      return;
    }
    const { id } = req.params || {};
    if (!id) {
      res.status(400).json({ message: 'invalid_id' });
      return;
    }
    const { cancelCoachAction } = await import('../coachToolRunner');
    const out = await cancelCoachAction(id, { userPlatformId: userId });
    if (!out.ok) {
      res.status(out.status).json({ message: out.code });
      return;
    }
    res.status(200).json({ id, status: 'expired' });
  } catch (err: any) {
    console.error('coach.action.cancel.error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}

export async function handlePostCoachActionUndo(req: any, res: any): Promise<void> {
  try {
    const userId = req.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Nao autenticado' });
      return;
    }
    const { id } = req.params || {};
    if (!id) {
      res.status(400).json({ message: 'invalid_id' });
      return;
    }
    const { undoCoachAction } = await import('../coachToolRunner');
    const out = await undoCoachAction(id, { userPlatformId: userId });
    if (!out.ok) {
      res.status(out.status).json({ message: out.code });
      return;
    }
    res.status(200).json({
      id,
      status: 'undone',
      reversedEntityType: out.reversedEntityType,
      reversedEntityId: out.reversedEntityId,
    });
  } catch (err: any) {
    console.error('coach.action.undo.error', { err });
    res.status(500).json({ message: 'Erro interno' });
  }
}
