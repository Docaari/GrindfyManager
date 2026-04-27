import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

// =============================================================================
// Sprint Coach-2A / RF-02 — Tool Registry Pattern
//
// Modulo a ser criado pelo Implementer:
//   server/coachTools/registry.ts
//
// Exporta:
//   - interface CoachTool<I, O> e ToolContext
//   - function registerTool(tool: CoachTool)  -> throw 'tool_already_registered' se duplicada
//   - function getTool(name: string)
//   - function exportToolsForAnthropic(tier: CoachTier): AnthropicToolSchema[]
//   - function listRegisteredTools(): string[]
//   - function _resetRegistry() para testes
//
// Referencia: ADR-023, spec RF-02 #1, #2.
// =============================================================================

import {
  registerTool,
  getTool,
  exportToolsForAnthropic,
  listRegisteredTools,
  _resetRegistry,
  type CoachTool,
} from '../../../server/coachTools/registry';

const dummyHandler = async () => ({ ok: true });

function makeTool(overrides: Partial<CoachTool<any, any>> = {}): CoachTool<any, any> {
  return {
    name: 'dummy_tool',
    description: 'tool de teste',
    inputSchema: z.object({ foo: z.string() }),
    handler: dummyHandler,
    requiresConfirmation: false,
    auditLevel: 'log',
    ...overrides,
  } as any;
}

beforeEach(() => {
  _resetRegistry();
});

describe('registerTool', () => {
  it('registra tool nova com sucesso', () => {
    registerTool(makeTool({ name: 'tool_a' }));
    expect(listRegisteredTools()).toContain('tool_a');
  });

  it('throw "tool_already_registered" quando tenta registrar nome duplicado', () => {
    registerTool(makeTool({ name: 'tool_a' }));
    expect(() => registerTool(makeTool({ name: 'tool_a' }))).toThrowError(
      /tool_already_registered/,
    );
  });
});

describe('getTool', () => {
  it('retorna tool registrada por nome', () => {
    const tool = makeTool({ name: 'lookup_me' });
    registerTool(tool);
    expect(getTool('lookup_me')?.name).toBe('lookup_me');
  });

  it('retorna undefined para nome desconhecido', () => {
    expect(getTool('inexistente')).toBeUndefined();
  });
});

describe('exportToolsForAnthropic', () => {
  it('tier free retorna [] (free nao recebe tools — RF-04 #6)', () => {
    registerTool(makeTool({ name: 'tool_a' }));
    expect(exportToolsForAnthropic('free' as any)).toEqual([]);
  });

  it('tier pro recebe tools com gateByTier undefined ou contendo "pro"', () => {
    registerTool(makeTool({ name: 'tool_universal' /* gateByTier undefined */ }));
    registerTool(makeTool({ name: 'tool_pro_only', gateByTier: ['pro'] } as any));
    registerTool(makeTool({ name: 'tool_premium_only', gateByTier: ['premium'] } as any));

    const exported = exportToolsForAnthropic('pro' as any);
    const names = exported.map((t: any) => t.name);
    expect(names).toContain('tool_universal');
    expect(names).toContain('tool_pro_only');
    expect(names).not.toContain('tool_premium_only');
  });

  it('tier admin recebe TODAS as tools registradas', () => {
    registerTool(makeTool({ name: 't_universal' }));
    registerTool(makeTool({ name: 't_pro', gateByTier: ['pro'] } as any));
    registerTool(makeTool({ name: 't_premium', gateByTier: ['premium'] } as any));
    const exported = exportToolsForAnthropic('admin' as any);
    const names = exported.map((t: any) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['t_universal', 't_pro', 't_premium']),
    );
  });

  it('retorna shape Anthropic { name, description, input_schema } (input_schema = JSON Schema, nao Zod)', () => {
    registerTool(
      makeTool({
        name: 'shape_check',
        description: 'desc',
        inputSchema: z.object({ foo: z.string() }),
      }),
    );
    const exported = exportToolsForAnthropic('pro' as any);
    const tool = exported.find((t: any) => t.name === 'shape_check') as any;
    expect(tool).toBeDefined();
    expect(typeof tool.description).toBe('string');
    expect(tool.input_schema).toBeDefined();
    // JSON Schema: deve ter `type` ou `properties`, NAO conter funcoes de Zod
    expect(typeof tool.input_schema).toBe('object');
    expect(typeof (tool.input_schema as any).safeParse).toBe('undefined');
  });
});
