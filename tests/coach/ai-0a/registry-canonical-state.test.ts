import { describe, it, expect, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-0A — RF-01..13: registry canonico pos-AI-0A
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-01..13, Cenarios de Teste Derivados)
// ADRs : 145 (estado canonico do registry), 146 (write tools confirm v1),
//        147 (read tool service extraction)
// Diagrama: Docs/architecture/diagrams/coach-ai-0a/seq-read-tool-citable.mermaid
//
// Modos: TDD red-phase. As 5 read tools "estrela" estao hoje como stubs/ausentes
// e os 7 handlers de Coach-2B (6 write + verify_leak_progress) NAO estao
// registrados em server/coachTools/index.ts. Os testes abaixo FALHAM ate o
// implementer religar tudo.
//
// Lessons aplicadas:
//   - #8: validar PRESENCA individual de cada tool, NUNCA length absoluta do array.
//   - #14/#26: usar `await import(...)`.
//   - #5/#35: nao instanciamos SDK aqui (handlers de tool nao usam `new`).
// =============================================================================

import {
  _resetRegistry,
  listRegisteredTools,
  getTool,
  exportToolsForAnthropic,
} from '../../../server/coachTools/registry';

// Tools canonicas do ADR-145 §1 (17 tools + 1 alias deprecado = 18 entradas).
const READ_TOOLS_PREEXISTING = [
  'read_cooldown_history',
  'read_user_hud_stats',
  'read_user_bankroll_history',
  'read_theme_with_linked_stats_and_spots',
  'recommend_lesson',
] as const;

const ALIAS_DEPRECATED = 'read_theme_with_linked_spots';

const READ_TOOLS_RELIGADAS = [
  'query_dimension',
  'find_top_leaks',
  'get_tournament_suggestions',
  'explain_tournament_score',
  'simulate_bankroll_scenario',
  'verify_leak_progress', // handler de Coach-2B, NAO e write
] as const;

const WRITE_TOOLS = [
  'register_tournament_in_grade',
  'record_wallet_transaction',
  'start_grind_session',
  'log_session_completed',
  'log_leak_focus',
  'log_study_session',
] as const;

beforeEach(() => {
  _resetRegistry();
});

describe('AI-0A · registry canonico — presenca individual de cada tool (lesson #8)', () => {
  it('todas as 5 read tools pre-existentes continuam registradas', async () => {
    await import('../../../server/coachTools/index');
    const names = listRegisteredTools();
    for (const t of READ_TOOLS_PREEXISTING) {
      expect(names, `tool pre-existente ${t} deve estar registrada`).toContain(t);
    }
  });

  it('alias deprecado read_theme_with_linked_spots continua registrado (1 sprint de transicao)', async () => {
    await import('../../../server/coachTools/index');
    expect(listRegisteredTools()).toContain(ALIAS_DEPRECATED);
  });

  it('as 5 read tools "estrela" + verify_leak_progress estao registradas (RF-01..05, RF-12)', async () => {
    await import('../../../server/coachTools/index');
    const names = listRegisteredTools();
    for (const t of READ_TOOLS_RELIGADAS) {
      expect(names, `read tool ${t} deve estar registrada`).toContain(t);
    }
  });

  it('as 6 write tools de Coach-2B estao registradas (RF-06..11)', async () => {
    await import('../../../server/coachTools/index');
    const names = listRegisteredTools();
    for (const t of WRITE_TOOLS) {
      expect(names, `write tool ${t} deve estar registrada`).toContain(t);
    }
  });
});

describe('AI-0A · stubs removidos (RF-02, RF-05, RF-13)', () => {
  it('find_top_leaks nao e mais stub (__stub undefined)', async () => {
    await import('../../../server/coachTools/index');
    const tool = getTool('find_top_leaks');
    expect(tool).toBeDefined();
    expect(tool!.__stub).toBeUndefined();
  });

  it('simulate_bankroll_scenario nao e mais stub (__stub undefined)', async () => {
    await import('../../../server/coachTools/index');
    const tool = getTool('simulate_bankroll_scenario');
    expect(tool).toBeDefined();
    expect(tool!.__stub).toBeUndefined();
  });

  it('find_top_leaks handler nao retorna code:not_implemented', async () => {
    await import('../../../server/coachTools/index');
    const tool = getTool('find_top_leaks')!;
    // Handler real chama detectLeaks — sem storage real, mas o ponto e que
    // NAO existe mais o stubHandler que retorna { code:'not_implemented' }
    // de forma incondicional. Verificamos via inspecao da fn (heuristica leve).
    const src = tool.handler.toString();
    expect(src).not.toMatch(/not_implemented/);
    expect(src).not.toMatch(/baseline handler pending/);
  });

  it('query_dimension / get_tournament_suggestions / explain_tournament_score nao sao stubs', async () => {
    await import('../../../server/coachTools/index');
    for (const name of ['query_dimension', 'get_tournament_suggestions', 'explain_tournament_score']) {
      const tool = getTool(name);
      expect(tool, `${name} deve existir`).toBeDefined();
      expect(tool!.__stub, `${name} nao deve ser stub`).toBeUndefined();
    }
  });
});

describe('AI-0A · coachTools array exportado (RF-13 — presenca individual, nao length)', () => {
  it('coachTools array contem cada tool canonica + alias (lesson #8 — sem length absoluta)', async () => {
    const mod: any = await import('../../../server/coachTools/index');
    expect(Array.isArray(mod.coachTools)).toBe(true);
    const exportedNames = mod.coachTools.map((t: any) => t?.name);
    for (const t of [
      ...READ_TOOLS_PREEXISTING,
      ALIAS_DEPRECATED,
      ...READ_TOOLS_RELIGADAS,
      ...WRITE_TOOLS,
    ]) {
      expect(exportedNames, `coachTools array deve incluir ${t}`).toContain(t);
    }
  });

  it('coachTools array nao contem nenhuma entrada __stub', async () => {
    const mod: any = await import('../../../server/coachTools/index');
    for (const t of mod.coachTools) {
      expect(t?.__stub, `${t?.name} nao deve estar marcada como stub`).toBeFalsy();
    }
  });
});

describe('AI-0A · index.ts limpo de stubs (RF-13)', () => {
  it('codigo-fonte de coachTools/index.ts nao menciona __stub / stubHandler / not_implemented', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'server/coachTools/index.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/__stub/);
    expect(src).not.toMatch(/stubHandler/);
    expect(src).not.toMatch(/not_implemented/);
  });

  it('interface CoachTool e o filtro defensivo __stub continuam existindo (custo zero)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const registrySrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/coachTools/registry.ts'),
      'utf8',
    );
    const routeSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'server/routes/coach.ts'),
      'utf8',
    );
    // O flag __stub permanece DEFINIDO na interface (ADR-145 §3).
    expect(registrySrc).toMatch(/__stub\s*\??:/);
    // O filtro defensivo no route permanece.
    expect(routeSrc).toMatch(/__stub/);
  });
});

describe('AI-0A · gating de tier (RNF — read tools = Pro+, write tools = Pro+)', () => {
  it('exportToolsForAnthropic("free") === []', async () => {
    await import('../../../server/coachTools/index');
    expect(exportToolsForAnthropic('free')).toEqual([]);
  });

  it('exportToolsForAnthropic("pro") inclui as 5 read tools religadas + as 6 write tools', async () => {
    await import('../../../server/coachTools/index');
    const names = exportToolsForAnthropic('pro').map((t) => t.name);
    for (const t of [...READ_TOOLS_RELIGADAS, ...WRITE_TOOLS]) {
      expect(names, `pro deve receber ${t}`).toContain(t);
    }
  });

  it('exportToolsForAnthropic("admin") inclui tudo (admin recebe todas)', async () => {
    await import('../../../server/coachTools/index');
    const names = exportToolsForAnthropic('admin').map((t) => t.name);
    for (const t of [
      ...READ_TOOLS_PREEXISTING,
      ALIAS_DEPRECATED,
      ...READ_TOOLS_RELIGADAS,
      ...WRITE_TOOLS,
    ]) {
      expect(names, `admin deve receber ${t}`).toContain(t);
    }
  });

  it('cada tool religada/registrada tem gateByTier = [pro, premium, admin]', async () => {
    await import('../../../server/coachTools/index');
    for (const name of [...READ_TOOLS_RELIGADAS, ...WRITE_TOOLS]) {
      const tool = getTool(name);
      expect(tool, `${name} deve existir`).toBeDefined();
      expect(tool!.gateByTier, `${name}.gateByTier`).toEqual(
        expect.arrayContaining(['pro', 'premium', 'admin']),
      );
      expect(tool!.gateByTier).not.toContain('free');
    }
  });
});

describe('AI-0A · requiresConfirmation por tipo (RF-06..12, ADR-146)', () => {
  it('todas as 6 write tools tem requiresConfirmation === true', async () => {
    await import('../../../server/coachTools/index');
    for (const name of WRITE_TOOLS) {
      const tool = getTool(name)!;
      expect(tool, `${name}`).toBeDefined();
      expect(tool.requiresConfirmation, `${name}.requiresConfirmation`).toBe(true);
    }
  });

  it('todas as read tools (religadas + verify_leak_progress) tem requiresConfirmation falsy', async () => {
    await import('../../../server/coachTools/index');
    for (const name of READ_TOOLS_RELIGADAS) {
      const tool = getTool(name)!;
      expect(tool, `${name}`).toBeDefined();
      expect(tool.requiresConfirmation, `${name}.requiresConfirmation`).toBeFalsy();
    }
  });

  it('record_wallet_transaction tem confirmationLevel === "strict" (RF-07, ADR-146)', async () => {
    await import('../../../server/coachTools/index');
    const tool: any = getTool('record_wallet_transaction')!;
    expect(tool).toBeDefined();
    expect(tool.confirmationLevel).toBe('strict');
  });

  it('as outras write tools tem confirmationLevel "standard" ou ausente (default standard)', async () => {
    await import('../../../server/coachTools/index');
    for (const name of WRITE_TOOLS) {
      if (name === 'record_wallet_transaction') continue;
      const tool: any = getTool(name)!;
      const level = tool.confirmationLevel;
      expect(
        level === undefined || level === 'standard',
        `${name}.confirmationLevel deve ser undefined ou "standard", got ${level}`,
      ).toBe(true);
    }
  });

  it('write tools tem auditLevel === "persist" (ADR-146)', async () => {
    await import('../../../server/coachTools/index');
    for (const name of WRITE_TOOLS) {
      const tool = getTool(name)!;
      expect(tool.auditLevel, `${name}.auditLevel`).toBe('persist');
    }
  });

  it('verify_leak_progress e read (handler, NAO executeConfirmed) e auditLevel log', async () => {
    await import('../../../server/coachTools/index');
    const tool: any = getTool('verify_leak_progress')!;
    expect(tool).toBeDefined();
    expect(tool.requiresConfirmation).toBeFalsy();
    expect(tool.auditLevel).toBe('log');
    expect(typeof tool.handler).toBe('function');
    expect(tool.executeConfirmed).toBeUndefined();
  });
});

describe('AI-0A · edge — registry consistente apos reset / re-import (lesson registry core)', () => {
  it('_resetRegistry() em beforeEach mantem todas as tools core visiveis', async () => {
    await import('../../../server/coachTools/index');
    _resetRegistry();
    const names = listRegisteredTools();
    for (const t of [...READ_TOOLS_RELIGADAS, ...WRITE_TOOLS]) {
      expect(names, `${t} deve sobreviver a _resetRegistry`).toContain(t);
    }
  });

  it('importar coachTools/index duas vezes nao quebra (safeRegister silencia duplicata)', async () => {
    await import('../../../server/coachTools/index');
    await import('../../../server/coachTools/index');
    const names = listRegisteredTools();
    // Sem excecao + tools ainda la.
    expect(names).toContain('query_dimension');
    expect(names).toContain('register_tournament_in_grade');
  });
});
