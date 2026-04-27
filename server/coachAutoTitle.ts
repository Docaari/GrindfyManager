// =============================================================================
// Coach Auto-Title — Sprint Coach-1 Frontend UX / RF-19
//
// Apos 2-3 mensagens em uma sessao com titulo padrao (truncate de 50 chars
// da primeira mensagem do usuario), chamar Haiku em background para gerar um
// titulo curto (<= 40 chars) que resume melhor a conversa.
//
// Comportamento:
//   - Se sessao nao existe: noop (graceful).
//   - Se sessao tem titulo "customizado" (diferente de truncate(firstMsg, 50)
//     OU comprimento curto que nao e um truncate puro): noop.
//   - Se Haiku falhar: noop (NAO afeta o stream principal).
//   - Titulo final e clampado a 40 chars.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-19)
// =============================================================================

import { db } from './db';
import { chatSessions, chatMessages } from '@shared/schema';
import { eq, asc } from 'drizzle-orm';
import { sanitize } from './coachSafetyPrompts';

const MAX_TITLE_LENGTH = 40;
const DEFAULT_TRUNCATE_LENGTH = 50;

function getModel(): string {
  return process.env.COACH_AUTOTITLE_MODEL || 'claude-haiku-4-5-20251001';
}

async function getAnthropicClient(): Promise<any> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default as any;
  // Tolerante a mocks (vi.fn() em vitest 4 nao e construtivel por padrao)
  try {
    return new Anthropic();
  } catch {
    return Anthropic();
  }
}

/**
 * Decide se o titulo atual da sessao parece ser o "padrao" (truncate de 50 chars
 * da primeira mensagem do usuario) — caso em que vale a pena gerar um titulo
 * melhor via Haiku. Se o titulo parecer customizado, retornamos false.
 */
function isDefaultTitle(currentTitle: string | null | undefined, firstUserMessage: string | null | undefined): boolean {
  if (!currentTitle || currentTitle.length === 0) return true;
  if (!firstUserMessage) return false;
  const expectedDefault = firstUserMessage.substring(0, DEFAULT_TRUNCATE_LENGTH);
  // Comparacao exata: o handleCoachChat seta title = message.substring(0, 50)
  return currentTitle === expectedDefault;
}

/**
 * Gera um titulo curto via Haiku (<= 40 chars) e atualiza chat_sessions.title.
 *
 * Fire-and-forget: chamadores devem invocar sem await ou com .catch(()=>{}).
 */
export async function generateAutoTitle(sessionId: string): Promise<void> {
  try {
    // 1. Carrega a sessao
    const sessionRows = await db.select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (!sessionRows || sessionRows.length === 0) return;
    const session: any = sessionRows[0];

    // 2. Carrega primeiras 3 mensagens (em ordem cronologica)
    const messageRows = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt))
      .limit(3);

    if (!messageRows || messageRows.length === 0) return;

    // 3. Verifica se o titulo atual e o "padrao" (truncate da primeira msg do user)
    const firstUserMsg = messageRows.find((m: any) => m.role === 'user');
    if (!isDefaultTitle(session.title, firstUserMsg?.content)) {
      // Titulo customizado: noop
      return;
    }

    // 4. Monta prompt com primeiras mensagens
    //
    // MEDIUM-4 — Sanitize defense-in-depth contra prompt injection no auto-title.
    // Mesmo que o Haiku ja seja instruido a apenas gerar um titulo curto, o
    // conteudo do usuario passa por sanitize() para neutralizar padroes
    // conhecidos ("ignore as instrucoes anteriores", "reveal system prompt",
    // etc.) antes de chegar ao modelo.
    const conversationText = messageRows
      .map((m: any) => `${m.role}: ${sanitize(m.content)}`)
      .join('\n');

    let generated: string;
    try {
      const client = await getAnthropicClient();
      const response = await client.messages.create({
        model: getModel(),
        max_tokens: 60,
        system:
          'Voce gera titulos curtos (maximo 40 caracteres) que resumem conversas de coaching de poker em portugues brasileiro. Responda APENAS com o titulo, sem aspas, sem prefixos.',
        messages: [
          {
            role: 'user',
            content: `Gere um titulo de no maximo 40 caracteres em portugues brasileiro resumindo esta conversa de poker:\n\n${conversationText}`,
          },
        ],
      });

      const block = response?.content?.[0];
      generated = block?.text || '';
    } catch (err) {
      // Falha na API: graceful — nao afeta nada
      console.log('[coachAutoTitle] API failed for session', sessionId, (err as Error).message);
      return;
    }

    if (!generated || typeof generated !== 'string' || generated.trim().length === 0) {
      return;
    }

    // 5. Limpa e clampa a 40 chars
    const cleaned = generated
      .trim()
      .replace(/^["']|["']$/g, '') // remove aspas no inicio/fim
      .substring(0, MAX_TITLE_LENGTH);

    if (cleaned.length === 0) return;

    // 6. Atualiza no DB
    try {
      await db.update(chatSessions)
        .set({ title: cleaned })
        .where(eq(chatSessions.id, sessionId));
    } catch (err) {
      console.log('[coachAutoTitle] DB update failed', sessionId, (err as Error).message);
    }
  } catch {
    // Fail gracefully — nao afeta o fluxo principal.
  }
}
