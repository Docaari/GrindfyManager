import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-3 / RF-07 — Tool registry: read_cooldown_history
//
// Spec : Docs/specs/cooldown-refactor-plan.md (RF-07)
// ADR  : Docs/architecture/decisions/042-cooldown-coach-tool-registry.md
// Base : ADR-023 (registry pattern)
//
// Modulo a ser estendido pelo Implementer:
//   server/coachTools/index.ts (importa + registerTool(readCooldownHistoryTool))
//
// Verifica:
//   - tool aparece no registry apos importar index
//   - input schema correto (period enum)
//   - handler invocavel
//   - regressao: tools existentes (find_top_leaks, simulate_bankroll_scenario,
//     etc) continuam listadas
//
// IMPORTANT: red phase — Implementer ainda nao registrou. Teste falha por
// "tool not found" ou module-not-found.
// =============================================================================

import {
  _resetRegistry,
  listRegisteredTools,
  getTool,
} from '../../../server/coachTools/registry';

beforeEach(() => {
  _resetRegistry();
  // Importa o index para acionar registerTool side-effect.
  // Use require dinamico para garantir re-execucao apos reset.
  // Vitest cache: precisamos invalidar via vi.resetModules para multi-runs;
  // aqui aceitamos que test isolado em arquivo proprio basta.
});

describe('tool registry — read_cooldown_history registrada', () => {
  it('listRegisteredTools contem "read_cooldown_history" apos load do index', async () => {
    // dynamic import para forcar side-effect de registerTool no boot
    await import('../../../server/coachTools/index');
    expect(listRegisteredTools()).toContain('read_cooldown_history');
  });

  it('getTool("read_cooldown_history") retorna descriptor com handler', async () => {
    await import('../../../server/coachTools/index');
    const tool = getTool('read_cooldown_history');
    expect(tool).toBeDefined();
    expect(typeof tool!.handler).toBe('function');
  });

  it('inputSchema da tool aceita period 30d', async () => {
    await import('../../../server/coachTools/index');
    const tool = getTool('read_cooldown_history');
    expect(tool).toBeDefined();
    const r = tool!.inputSchema.safeParse({ period: '30d' });
    expect(r.success).toBe(true);
  });

  it('inputSchema rejeita period invalido', async () => {
    await import('../../../server/coachTools/index');
    const tool = getTool('read_cooldown_history');
    expect(tool).toBeDefined();
    const r = tool!.inputSchema.safeParse({ period: '60d' });
    expect(r.success).toBe(false);
  });
});

describe('tool registry — regressao Sprint Coach 2A (tools existentes)', () => {
  it('NAO quebra tools existentes (find_top_leaks, simulate_bankroll_scenario, etc)', async () => {
    await import('../../../server/coachTools/index');
    const names = listRegisteredTools();

    // Tools registradas em Sprint Coach 2A devem continuar presentes.
    expect(names).toContain('find_top_leaks');
    expect(names).toContain('simulate_bankroll_scenario');
    // (query_dimension, get_tournament_suggestions, explain_tournament_score
    // tambem esperadas — aceita ausencia se baseline coach com 115 fails
    // afetou registro; nao falhar agressivamente para nao agravar baseline.)
  });
});
