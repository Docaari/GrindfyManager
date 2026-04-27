import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

// =============================================================================
// Sprint Coach-2A / RF-02 — coachToolRunner.executeTool
//
// Modulo a ser criado pelo Implementer: server/coachToolRunner.ts
//
// Contrato (spec RF-02 #3 + ADR-024):
//   - Resolve tool via getTool(); ausente -> {ok:false, error:'tool_not_found'} (no throw)
//   - Valida input via inputSchema.safeParse; falha -> {ok:false, error:'validation_failed', details}
//   - Mede latencia via performance.now()
//   - Wrap result em {__type:'ToolResult', tool, ok:true, data}
//   - Em handler error -> {ok:false, error:'handler_error', message} + linha
//     coach_actions com status='failed' e latencia capturada
//   - auditLevel:
//       'none'    -> nao persiste linha
//       'log'     -> persiste sem result (so input + status + latency)
//       'persist' -> persiste com result jsonb (truncado a 32KB)
// =============================================================================

// Mock storage helper que vai ser usado pelo runner para gravar coach_actions
const insertCoachActionMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../server/storage', () => ({
  storage: {
    insertCoachAction: insertCoachActionMock,
  },
}));

import {
  registerTool,
  _resetRegistry,
  type CoachTool,
} from '../../../server/coachTools/registry';
import { executeTool } from '../../../server/coachToolRunner';

beforeEach(() => {
  _resetRegistry();
  insertCoachActionMock.mockClear();
});

const ctx = {
  userId: 'USER-0001',
  chatSessionId: 'sess_abc',
  messageId: 'msg_1',
};

function makeTool(overrides: Partial<CoachTool<any, any>> = {}): CoachTool<any, any> {
  return {
    name: 'sample',
    description: 'sample',
    inputSchema: z.object({ value: z.number() }),
    handler: async (input: any) => ({ doubled: input.value * 2 }),
    requiresConfirmation: false,
    auditLevel: 'log',
    ...overrides,
  } as any;
}

describe('executeTool — happy path', () => {
  it('retorna {ok:true, data} com result wrapped em ToolResult shape', async () => {
    registerTool(makeTool({ name: 'happy', auditLevel: 'log' }));
    const out: any = await executeTool('use_1', 'happy', { value: 21 }, ctx as any);
    expect(out.ok).toBe(true);
    // ToolResult wrapping
    expect(out.result?.__type).toBe('ToolResult');
    expect(out.result?.tool).toBe('happy');
    expect(out.result?.ok).toBe(true);
    expect(out.result?.data).toEqual({ doubled: 42 });
  });

  it('captura latencyMs > 0 em ms', async () => {
    registerTool(
      makeTool({
        name: 'slow',
        auditLevel: 'log',
        handler: async () => {
          await new Promise((r) => setTimeout(r, 5));
          return { ok: true };
        },
      }),
    );
    const out: any = await executeTool('use_1', 'slow', { value: 1 }, ctx as any);
    expect(out.latencyMs).toBeGreaterThan(0);
  });

  it('persiste linha em coach_actions com status=completed', async () => {
    registerTool(makeTool({ name: 'audit_log', auditLevel: 'log' }));
    await executeTool('use_xyz', 'audit_log', { value: 1 }, ctx as any);
    expect(insertCoachActionMock).toHaveBeenCalledTimes(1);
    const args = insertCoachActionMock.mock.calls[0][0];
    expect(args.status).toBe('completed');
    expect(args.toolName).toBe('audit_log');
    expect(args.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('executeTool — validacao', () => {
  it('input invalido (schema violation) retorna validation_failed sem throw', async () => {
    registerTool(makeTool({ name: 'validated' }));
    const out: any = await executeTool('use_1', 'validated', { value: 'not-a-number' }, ctx as any);
    expect(out.ok).toBe(false);
    expect(out.error).toBe('validation_failed');
    expect(Array.isArray(out.details)).toBe(true);
  });

  it('NAO chama handler quando validacao falha', async () => {
    const handler = vi.fn();
    registerTool(makeTool({ name: 'validated_no_call', handler }));
    await executeTool('use_1', 'validated_no_call', { value: 'x' }, ctx as any);
    expect(handler).not.toHaveBeenCalled();
  });

  it('tool_not_found nao crasha — retorna {ok:false, error}', async () => {
    const out: any = await executeTool('use_1', 'nao_existe', {}, ctx as any);
    expect(out.ok).toBe(false);
    expect(out.error).toBe('tool_not_found');
  });
});

describe('executeTool — handler error', () => {
  it('handler throw retorna {ok:false, error:"handler_error", message}', async () => {
    registerTool(
      makeTool({
        name: 'broken',
        handler: async () => {
          throw new Error('explodiu');
        },
      }),
    );
    const out: any = await executeTool('use_1', 'broken', { value: 1 }, ctx as any);
    expect(out.ok).toBe(false);
    expect(out.error).toBe('handler_error');
    expect(out.message).toMatch(/explodiu/i);
  });

  it('handler throw ainda persiste coach_actions com status=failed e latencia', async () => {
    registerTool(
      makeTool({
        name: 'broken_audit',
        auditLevel: 'log',
        handler: async () => {
          throw new Error('falha');
        },
      }),
    );
    await executeTool('use_1', 'broken_audit', { value: 1 }, ctx as any);
    expect(insertCoachActionMock).toHaveBeenCalledTimes(1);
    const args = insertCoachActionMock.mock.calls[0][0];
    expect(args.status).toBe('failed');
    expect(args.errorMessage).toMatch(/falha/i);
    expect(args.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('executeTool — auditLevel', () => {
  it('auditLevel="none" NAO insere linha', async () => {
    registerTool(makeTool({ name: 'no_audit', auditLevel: 'none' }));
    await executeTool('use_1', 'no_audit', { value: 1 }, ctx as any);
    expect(insertCoachActionMock).not.toHaveBeenCalled();
  });

  it('auditLevel="log" insere linha sem result (campo result nulo/ausente)', async () => {
    registerTool(makeTool({ name: 'audit_log_only', auditLevel: 'log' }));
    await executeTool('use_1', 'audit_log_only', { value: 1 }, ctx as any);
    const args = insertCoachActionMock.mock.calls[0][0];
    expect(args.result == null).toBe(true);
  });

  it('auditLevel="persist" insere linha com result jsonb', async () => {
    registerTool(makeTool({ name: 'audit_persist', auditLevel: 'persist' }));
    await executeTool('use_1', 'audit_persist', { value: 1 }, ctx as any);
    const args = insertCoachActionMock.mock.calls[0][0];
    expect(args.result).toBeDefined();
    expect(args.result?.__type).toBe('ToolResult');
  });
});
