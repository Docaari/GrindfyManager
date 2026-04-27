// =============================================================================
// Coach Usage — Sprint Coach-1 / RF-01
// Calculo de custo por mensagem + persistencia de metricas de token.
//
// Precos publicos Anthropic (USD por 1M tokens):
//   claude-sonnet-4-6:            input $3    | output $15  | cache_read $0.30  | cache_write $3.75
//   claude-haiku-4-5-20251001:    input $1    | output $5   | cache_read $0.10  | cache_write $1.25
//   claude-opus-4-7 (fallback):   input $15   | output $75  (sem cache pricing publico nesta sprint)
// =============================================================================

import { db } from './db';
import { chatMessages } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface UsageInput {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

interface ModelPricing {
  input: number;       // $ por 1M
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
  'claude-sonnet-4-5-20250514': {
    // Mantem mesma tabela (familia Sonnet) para graceful fallback
    input: 3.0,
    output: 15.0,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
  'claude-haiku-4-5-20251001': {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.10,
    cacheWrite: 1.25,
  },
  'claude-3-5-haiku-20241022': {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.10,
    cacheWrite: 1.25,
  },
  'claude-opus-4-7': {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.50,
    cacheWrite: 18.75,
  },
};

// =============================================================================
// estimateCost — calcula custo em USD para um usage snapshot
// =============================================================================

export function estimateCost(usage: UsageInput, model: string): number {
  if (!usage || typeof usage !== 'object') return 0;

  const input = Number(usage.input_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  const cacheWrite = Number(usage.cache_creation_input_tokens || 0);
  const cacheRead = Number(usage.cache_read_input_tokens || 0);

  if (input === 0 && output === 0 && cacheWrite === 0 && cacheRead === 0) return 0;

  const pricing = PRICING[model];
  if (!pricing) {
    // Modelo desconhecido → graceful 0 (documentado no teste)
    return 0;
  }

  const cost =
    (input * pricing.input +
      cacheWrite * pricing.cacheWrite +
      cacheRead * pricing.cacheRead +
      output * pricing.output) /
    1_000_000;

  return cost;
}

// Alias compat — spec menciona calculateMessageCost
export const calculateMessageCost = estimateCost;

// =============================================================================
// recordMessageUsage — persiste tokens + latencia em chatMessages
// =============================================================================

export async function recordMessageUsage(
  messageId: string,
  usage: UsageInput | null | undefined,
  model: string,
  latencyMs: number,
): Promise<void> {
  // Se todos os campos de usage sao null/undefined, skip UPDATE para nao
  // gravar 0 mascarando erros de stream (issue HIGH #3).
  const hasAnyUsage =
    usage != null && (
      usage.input_tokens != null ||
      usage.output_tokens != null ||
      usage.cache_creation_input_tokens != null ||
      usage.cache_read_input_tokens != null
    );

  if (!hasAnyUsage) {
    // Log para visibilidade — sem gravar 0s enganosos.
    console.log('[coachUsage] no usage recorded for message', messageId, 'model', model);
    return;
  }

  try {
    await db.update(chatMessages)
      .set({
        inputTokens: usage!.input_tokens != null ? Number(usage!.input_tokens) : null,
        outputTokens: usage!.output_tokens != null ? Number(usage!.output_tokens) : null,
        cacheCreationInputTokens:
          usage!.cache_creation_input_tokens != null ? Number(usage!.cache_creation_input_tokens) : null,
        cacheReadInputTokens:
          usage!.cache_read_input_tokens != null ? Number(usage!.cache_read_input_tokens) : null,
        model,
        latencyMs: Number.isFinite(latencyMs) ? Math.round(latencyMs) : null,
      })
      .where(eq(chatMessages.id, messageId));
  } catch (err) {
    // Nao critico — log e continua (metricas sao secundarias ao chat)
    console.error('[coachUsage] recordMessageUsage failed:', (err as Error).message);
  }
}
