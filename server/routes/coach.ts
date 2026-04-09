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
const RATE_LIMIT_PER_HOUR = 30;

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

  // Rate limiting
  const msgCount = await coachStorage.countUserMessagesInLastHour(userId);
  if (msgCount >= RATE_LIMIT_PER_HOUR) {
    res.status(429).json({ message: `Limite de ${RATE_LIMIT_PER_HOUR} mensagens por hora atingido. Tente novamente mais tarde.` });
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
  await coachStorage.saveMessage({
    sessionId: activeSessionId,
    role: 'user',
    content: message,
    tokenCount: userTokenCount,
  });

  // Auto-generate title from first message if new session
  const existingMessages = await coachStorage.getSessionMessages(activeSessionId);
  // existingMessages check: if this was the first message (only user msg saved so far)
  if (!sessionId || (existingMessages && existingMessages.length <= 1)) {
    const title = message.substring(0, 50);
    await coachStorage.updateSessionTitle(activeSessionId, title);
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Stream response from Claude API
  let assistantContent = '';
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Build context for the coach
    const { assembleContext } = await import('../coachContext');
    const { getMentalPrompt, getTournamentPrompt, getTechnicalPrompt } = await import('../coachPrompts');
    const { buildMentalContext, buildTournamentContext, buildTechnicalContext } = await import('../coachContext');

    // Load specialized context based on coach type
    let specializedContext: any = {};
    if (coachType === 'mental') {
      specializedContext = await buildMentalContext(userId);
    } else if (coachType === 'tournament') {
      specializedContext = await buildTournamentContext(userId);
    } else if (coachType === 'technical') {
      specializedContext = await buildTechnicalContext(userId);
    }

    // Get system prompt
    const getSystemPrompt = (ct: string) => {
      if (ct === 'mental') return getMentalPrompt(specializedContext);
      if (ct === 'tournament') return getTournamentPrompt(specializedContext);
      return getTechnicalPrompt(specializedContext);
    };

    // Assemble full context
    const context = await assembleContext(
      { coachType, userId, message, sessionId: activeSessionId },
      {
        getUserProfile: async (uid: string) => await coachStorage.getUserProfile?.(uid) || null,
        getStatsSnapshot: async (uid: string) => await coachStorage.getUserStats?.(uid) || null,
        getLastArchivedSessionSummary: async (uid: string, ct: string) => await coachStorage.getLastArchivedSessionSummary?.(uid, ct) || null,
        getSessionHistory: async (sid: string) => {
          const msgs = await coachStorage.getSessionMessages(sid);
          return (msgs || []).map((m: any) => ({ role: m.role, content: m.content }));
        },
        getSystemPrompt,
      },
    );

    // Stream from Claude API
    const stream = anthropicClient.messages.stream({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 1024,
      system: context.system,
      messages: context.messages as any,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && (event.delta as any).type === 'text_delta') {
        const chunk = (event.delta as any).text;
        assistantContent += chunk;
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
      }
    }
  } catch (streamError: any) {
    // Send error via SSE
    res.write(`data: ${JSON.stringify({ type: 'error', message: streamError?.message || 'Erro ao processar resposta' })}\n\n`);
    if (!assistantContent) {
      assistantContent = 'Desculpe, ocorreu um erro ao processar sua mensagem.';
    }
  }

  // Save assistant message
  const assistantTokenCount = Math.ceil(assistantContent.length / 4);
  const savedMsg = await coachStorage.saveMessage({
    sessionId: activeSessionId,
    role: 'assistant',
    content: assistantContent,
    tokenCount: assistantTokenCount,
  });

  // Update session token count
  await coachStorage.updateSessionTokenCount(activeSessionId, userTokenCount + assistantTokenCount);

  // Send done event
  const messageId = savedMsg?.id || nanoid();
  res.write(`data: ${JSON.stringify({ type: 'done', messageId })}\n\n`);
  res.end();
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
}
