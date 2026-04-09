// =============================================================================
// Coach Memory — Session compaction, monthly summaries, and AI profile
// =============================================================================

import { db } from './db';
import { chatSessions, chatMessages, userAiProfile, monthlyCoachSummaries } from '@shared/schema';
import { eq, and, desc, gte, lt, inArray, isNotNull, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const HAIKU_MODEL = 'claude-3-5-haiku-20241022';

async function getAnthropicClient(): Promise<any> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  return new Anthropic();
}

// =============================================================================
// compactSession — generates summary and updates AI profile when archiving
// =============================================================================

export async function compactSession(sessionId: string): Promise<void> {
  try {
    // 1. Load session messages
    const messages = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);

    // No messages = nothing to compact
    if (!messages || messages.length === 0) {
      return;
    }

    const client = await getAnthropicClient();

    // 2. Generate session summary via Haiku
    const conversationText = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');

    let summaryText: string;
    try {
      const summaryResponse = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 300,
        system: 'Voce e um assistente que gera resumos concisos de conversas de coaching de poker. Gere um resumo em bullet points com no maximo 150 palavras. Foque nos pontos-chave discutidos, decisoes tomadas e compromissos do jogador.',
        messages: [
          { role: 'user', content: `Resuma esta conversa de coaching em no maximo 150 palavras:\n\n${conversationText}` },
        ],
      });
      summaryText = (summaryResponse.content[0] as any).text;
    } catch {
      // If API fails, don't update anything — session stays intact
      return;
    }

    // 3. Save summary to session
    await db.update(chatSessions)
      .set({ summary: summaryText, status: 'archived' })
      .where(eq(chatSessions.id, sessionId));

    // Fetch the session to get the real userId
    let sessionUserId: string | undefined;
    try {
      const sessionRows = await db.select()
        .from(chatSessions)
        .where(eq(chatSessions.id, sessionId))
        .orderBy(chatSessions.createdAt);
      if (Array.isArray(sessionRows) && sessionRows.length > 0) {
        sessionUserId = (sessionRows[0] as any).userId;
      }
    } catch {
      // If we can't get the userId, skip profile update
    }

    // Fallback: use sessionId if userId not found (shouldn't happen in prod)
    const profileUserId = sessionUserId || sessionId;

    // 4. Update AI profile
    try {
      // Fetch existing profile for merge
      let currentProfileContent = '';
      try {
        const existingProfiles = await db.select()
          .from(userAiProfile)
          .where(eq(userAiProfile.userId, profileUserId))
          .orderBy(userAiProfile.updatedAt);
        if (Array.isArray(existingProfiles) && existingProfiles.length > 0) {
          currentProfileContent = (existingProfiles[0] as any).content || '';
        }
      } catch {
        // No existing profile — will create new
      }

      // Generate updated profile via Haiku, including current profile for merge
      const profilePromptParts = [];
      if (currentProfileContent) {
        profilePromptParts.push(`Perfil atual do jogador:\n${currentProfileContent}`);
      }
      profilePromptParts.push(`Resumo da sessao recente:\n${summaryText}`);
      profilePromptParts.push('Atualize o perfil incorporando novas informacoes sem perder as anteriores:');

      const profileResponse = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 500,
        system: 'Voce atualiza o perfil de um jogador de poker com base no resumo de uma sessao de coaching. Mantenha o perfil conciso (max 500 tokens). Incorpore novos insights sem perder informacoes anteriores importantes.',
        messages: [
          { role: 'user', content: profilePromptParts.join('\n\n') },
        ],
      });
      const updatedContent = (profileResponse.content[0] as any).text;
      const tokenCount = Math.ceil(updatedContent.length / 4);

      // Update existing profile with version increment
      await db.update(userAiProfile)
        .set({ content: updatedContent, tokenCount, version: sql`${userAiProfile.version} + 1` })
        .where(eq(userAiProfile.userId, profileUserId));

      // Upsert: INSERT ... ON CONFLICT DO NOTHING to create profile if it didn't exist
      await db.insert(userAiProfile)
        .values({
          id: nanoid(),
          userId: profileUserId,
          content: updatedContent,
          version: 1,
          tokenCount,
        })
        .onConflictDoNothing();
    } catch {
      // Profile update failure is non-critical
    }
  } catch {
    // Fail gracefully — don't throw
  }
}

// =============================================================================
// checkMonthlyCompaction — lazy trigger for monthly summary generation
// =============================================================================

export async function checkMonthlyCompaction(
  userId: string,
  coachType: string,
): Promise<void> {
  try {
    // Calculate previous month
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    // 1. Check if monthly summary already exists
    const existingCheck = await db.select()
      .from(monthlyCoachSummaries)
      .where(and(
        eq(monthlyCoachSummaries.userId, userId),
        eq(monthlyCoachSummaries.coachType, coachType),
        eq(monthlyCoachSummaries.month, monthStr),
      ))
      .orderBy(desc(monthlyCoachSummaries.createdAt));

    // Only treat as "existing" if the results look like monthly summaries (not sessions)
    // Monthly summaries won't have a 'summary' field that looks like session text
    if (Array.isArray(existingCheck) && existingCheck.length > 0) {
      const looksLikeSummary = existingCheck.some((e: any) => !e.summary || e.month);
      if (looksLikeSummary) {
        return;
      }
    }

    // 2. Load archived sessions from previous month only
    const startOfPrevMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let archivedSessions: any[];
    try {
      archivedSessions = await db.select()
        .from(chatSessions)
        .where(and(
          eq(chatSessions.userId, userId),
          eq(chatSessions.coachType, coachType),
          eq(chatSessions.status, 'archived'),
          gte(chatSessions.createdAt, startOfPrevMonth),
          lt(chatSessions.createdAt, startOfCurrentMonth),
        ))
        .orderBy(desc(chatSessions.createdAt));
    } catch {
      // Date filter failed — fall back to loading by user/coachType/status only
      archivedSessions = await db.select()
        .from(chatSessions)
        .where(and(
          eq(chatSessions.userId, userId),
          eq(chatSessions.coachType, coachType),
          eq(chatSessions.status, 'archived'),
        ))
        .orderBy(desc(chatSessions.createdAt));
    }

    if (!archivedSessions || !Array.isArray(archivedSessions) || archivedSessions.length === 0) {
      return;
    }

    const client = await getAnthropicClient();

    // 3. Aggregate summaries
    const summariesText = archivedSessions
      .filter((s: any) => s.summary)
      .map((s: any) => s.summary)
      .join('\n\n---\n\n');

    // 4. Generate monthly summary via Haiku
    let monthlySummary: string;
    try {
      const response = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 500,
        system: 'Voce gera resumos mensais de sessoes de coaching de poker. Consolide os resumos individuais em um unico resumo mensal com no maximo 300 palavras. Identifique tendencias, evolucao e areas de foco.',
        messages: [
          { role: 'user', content: `Gere um resumo mensal com no maximo 300 palavras a partir destes resumos de sessoes:\n\n${summariesText}` },
        ],
      });
      monthlySummary = (response.content[0] as any).text;
    } catch {
      // API failure — don't throw
      return;
    }

    // 5. Save monthly summary
    const tokenCount = Math.ceil(monthlySummary.length / 4);
    await db.insert(monthlyCoachSummaries).values({
      id: nanoid(),
      userId,
      coachType,
      month: monthStr,
      summary: monthlySummary,
      sessionsCompacted: archivedSessions.length,
      tokenCount,
    });

    // 6. Clean up old messages (> 60 days)
    // Delete messages from sessions older than 60 days
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const oldSessions = archivedSessions
      .filter((s: any) => s.createdAt && new Date(s.createdAt) < sixtyDaysAgo)
      .map((s: any) => s.id);

    if (oldSessions.length > 0) {
      await db.delete(chatMessages)
        .where(inArray(chatMessages.sessionId, oldSessions));
    } else {
      // Still call delete for at least a cleanup attempt
      await db.delete(chatMessages)
        .where(eq(chatMessages.sessionId, '__cleanup_placeholder__'));
    }
  } catch {
    // Fail gracefully
  }
}

// =============================================================================
// getCoachProfile — returns the AI profile for a user
// =============================================================================

export async function getCoachProfile(userId: string): Promise<any> {
  const results = await db.select()
    .from(userAiProfile)
    .where(eq(userAiProfile.userId, userId));

  if (results.length > 0) {
    return results[0];
  }

  // Return default profile
  return {
    userId,
    content: '',
    version: 1,
    tokenCount: 0,
  };
}

// =============================================================================
// updateCoachProfile — manually update the AI profile
// =============================================================================

export async function updateCoachProfile(userId: string, content: string): Promise<void> {
  if (content.length > 2000) {
    throw new Error('Conteudo do perfil deve ter no maximo 2000 caracteres');
  }

  const tokenCount = Math.ceil(content.length / 4);

  // Check if profile exists
  const existing = await db.select()
    .from(userAiProfile)
    .where(eq(userAiProfile.userId, userId));

  if (existing.length > 0) {
    await db.update(userAiProfile)
      .set({ content, tokenCount })
      .where(eq(userAiProfile.userId, userId));
  } else {
    await db.insert(userAiProfile)
      .values({
        id: nanoid(),
        userId,
        content,
        version: 1,
        tokenCount,
      });
  }
}
