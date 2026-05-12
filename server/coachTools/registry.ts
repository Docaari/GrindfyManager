// =============================================================================
// Coach Tool Registry — Sprint Coach-2A (RF-02) + Sprint Cooldown-3 (RF-07)
//
// ADR-023: Tool registry pattern (lookup por nome, gating por tier).
// ADR-042: Sprint Cooldown-3 — read_cooldown_history registrada via index.ts.
//
// Design:
//   - registerTool(tool, { core: true }) — usado por server/coachTools/index.ts
//     no boot. Tools "core" sao restauradas apos _resetRegistry() para que
//     suite de testes (que reseta entre `it`s) continue enxergando-as quando
//     o modulo ja foi carregado uma vez via import side-effect.
//   - registerTool(tool) — sem flag core, comportamento padrao do Sprint 2A:
//     throw em duplicata.
//   - _resetRegistry() — limpa entradas mas restaura "core" cache para
//     compat com tests que dependem do side-effect de import.
// =============================================================================

import type { ZodTypeAny } from 'zod';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface ToolContext {
  userId: string;
  chatSessionId: string;
  messageId: string;
  [k: string]: any;
}

export interface CoachTool<I = any, O = any> {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
  requiresConfirmation?: boolean;
  auditLevel?: 'none' | 'log' | 'persist';
  gateByTier?: Array<'free' | 'pro' | 'premium' | 'admin'>;
  // ADR-146: write tools que mexem em dinheiro marcam confirmationLevel='strict'
  // (flag em memoria no descriptor — NAO persistida em coach_actions na v1).
  // Tools sem a flag sao tratadas como 'standard'.
  confirmationLevel?: 'standard' | 'strict';
  // Write tool contract (Coach-2B / ADR-083): handlers de write tools expoem
  // executeConfirmed/fetchPayloadBefore/undo em vez de (alem de) handler.
  // Tipados como any aqui — o coachToolRunner faz o cast/dispatch.
  executeConfirmed?: (input: any, ctx: any, tx: any) => Promise<any>;
  fetchPayloadBefore?: (input: any, ctx: any, tx: any) => Promise<any>;
  undo?: (payloadBefore: any, payloadAfter: any, ctx: any, tx: any) => Promise<any>;
  // MEDIUM-1 reviewer Sprint Cooldown-3 / ADR-145 §3: o flag __stub permanece
  // DEFINIDO na interface (custo zero) e o route mantem o filtro defensivo,
  // mesmo que pos-AI-0A nao haja mais nenhuma tool stub registrada.
  __stub?: boolean;
}

// -----------------------------------------------------------------------------
// Estado interno
// -----------------------------------------------------------------------------

const registry = new Map<string, CoachTool>();
const coreTools = new Map<string, CoachTool>();

// -----------------------------------------------------------------------------
// API publica
// -----------------------------------------------------------------------------

export function registerTool(
  tool: CoachTool,
  opts?: { core?: boolean },
): void {
  if (registry.has(tool.name)) {
    throw new Error(`tool_already_registered: ${tool.name}`);
  }
  registry.set(tool.name, tool);
  if (opts?.core) {
    coreTools.set(tool.name, tool);
  }
}

export function getTool(name: string): CoachTool | undefined {
  return registry.get(name);
}

export function listRegisteredTools(): string[] {
  return Array.from(registry.keys());
}

export function _resetRegistry(): void {
  registry.clear();
  // Re-register core tools (used by Sprint Cooldown-3 tool-registry test:
  // ele faz `_resetRegistry()` em beforeEach mas espera que o `await import`
  // — cached pelo loader — ainda observe os tools listados).
  for (const [name, tool] of coreTools.entries()) {
    registry.set(name, tool);
  }
}

/**
 * Exporta tools no formato esperado pela API Anthropic (JSON Schema, gated by tier).
 * Sprint Coach-2A / RF-04 #6 — free nao recebe tools.
 */
export function exportToolsForAnthropic(
  tier: 'free' | 'pro' | 'premium' | 'admin',
): Array<{ name: string; description: string; input_schema: any }> {
  if (tier === 'free') return [];

  const out: Array<{ name: string; description: string; input_schema: any }> = [];
  for (const tool of registry.values()) {
    if (tier !== 'admin') {
      // Filter by gateByTier if defined; admin recebe tudo.
      if (tool.gateByTier && !tool.gateByTier.includes(tier)) {
        continue;
      }
    }
    out.push({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchemaShallow(tool.inputSchema),
    });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Helper: conversao Zod -> JSON Schema (shallow, suficiente para Anthropic).
// Apenas estrutura minima (type/properties) para nao expor metodos do Zod.
// -----------------------------------------------------------------------------

function zodToJsonSchemaShallow(schema: ZodTypeAny): any {
  // Heuristica minima: extrai shape se for ZodObject; caso contrario retorna
  // { type: 'object' }. Nao reusa converters externos para manter zero deps.
  const def: any = (schema as any)?._def;
  if (def?.typeName === 'ZodObject' && typeof def.shape === 'function') {
    const shape = def.shape();
    const properties: any = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodFieldToJsonSchema(val as any);
      const innerDef: any = (val as any)?._def;
      if (innerDef?.typeName !== 'ZodOptional' && innerDef?.typeName !== 'ZodDefault') {
        required.push(key);
      }
    }
    return { type: 'object', properties, required };
  }
  return { type: 'object' };
}

function zodFieldToJsonSchema(field: any): any {
  const def = field?._def;
  if (!def) return {};
  switch (def.typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodArray':
      return { type: 'array' };
    case 'ZodOptional':
      return zodFieldToJsonSchema(def.innerType);
    case 'ZodDefault':
      return zodFieldToJsonSchema(def.innerType);
    default:
      return {};
  }
}
