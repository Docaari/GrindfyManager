/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Fase D #8 — Painel BRM/RoR ao vivo
 *
 * Spec : Docs/specs/sprint-fase-d-brm-ror-2026-06-02.md (RF-02, RF-04)
 * ADR  : 236 (D-3 classifyRiskOfRuin, D-4 resolveDataSufficiency)
 *
 * Cobertura: helpers PUROS (zero I/O, zero mock — literais só).
 *   - classifyRiskOfRuin: thresholds 5/15, boundaries, null.
 *   - resolveDataSufficiency: no_bankroll precede tudo, 0/1/199/200.
 *   - Constantes nomeadas exportadas (ROR_THRESHOLD_HEALTHY=5,
 *     ROR_THRESHOLD_WARNING=15, SAMPLE_THRESHOLD_OK=200).
 *
 * Status RED: server/services/bankrollHealth.ts NAO existe ainda.
 *             O await import() falha → loadModule() retorna null → asserts quebram.
 *
 * Lessons: helpers puros vivem em .test.ts (projeto server/node) sem mock.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Dynamic import (lesson #14/#26 — await import, NAO require)
// ---------------------------------------------------------------------------
async function loadModule(): Promise<any | null> {
  try {
    return await import('../../server/services/bankrollHealth');
  } catch {
    return null;
  }
}

// =============================================================================
// classifyRiskOfRuin (RF-04 / D-3)
// =============================================================================
describe('classifyRiskOfRuin (RF-04 / ADR-236 D-3)', () => {
  it('exporta as constantes de threshold nomeadas (5 e 15)', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.ROR_THRESHOLD_HEALTHY).toBe(5);
    expect(mod.ROR_THRESHOLD_WARNING).toBe(15);
  });

  it('pct=null → retorna null (nao classifica)', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(null)).toBeNull();
  });

  it('pct=0 → healthy', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(0).classification).toBe('healthy');
  });

  it('pct=4.99 → healthy (logo abaixo de 5)', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(4.99).classification).toBe('healthy');
  });

  it('pct=2 → healthy', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(2).classification).toBe('healthy');
  });

  it('boundary: pct exatamente 5 → warning (inclusivo no limite inferior)', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(5).classification).toBe('warning');
  });

  it('pct=10 → warning', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(10).classification).toBe('warning');
  });

  it('boundary: pct exatamente 15 → warning (inclusivo no limite superior)', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(15).classification).toBe('warning');
  });

  it('boundary: pct=15.01 → risky (logo acima de 15)', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(15.01).classification).toBe('risky');
  });

  it('pct=25 → risky', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(25).classification).toBe('risky');
  });

  it('pct=50 → risky', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(50).classification).toBe('risky');
  });

  it('pct=100 (RoR extremo) → risky', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(100).classification).toBe('risky');
  });

  it('cada classificacao nao-null traz label + suggestion textuais', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    for (const pct of [0, 5, 25]) {
      const r = mod.classifyRiskOfRuin(pct);
      expect(typeof r.label).toBe('string');
      expect(r.label.length).toBeGreaterThan(0);
      expect(typeof r.suggestion).toBe('string');
      expect(r.suggestion.length).toBeGreaterThan(0);
    }
  });

  it('labels PT-BR esperadas por classificacao', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.classifyRiskOfRuin(2).label).toBe('Saudável');
    expect(mod.classifyRiskOfRuin(10).label).toBe('Atenção');
    expect(mod.classifyRiskOfRuin(25).label).toBe('Arriscado');
  });
});

// =============================================================================
// resolveDataSufficiency (RF-02 / D-4)
// =============================================================================
describe('resolveDataSufficiency (RF-02 / ADR-236 D-4)', () => {
  it('exporta SAMPLE_THRESHOLD_OK = 200', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.SAMPLE_THRESHOLD_OK).toBe(200);
  });

  it('no_bankroll precede tudo: banca<=0 com sample alto → no_bankroll', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.resolveDataSufficiency(500, 0)).toBe('no_bankroll');
  });

  it('no_bankroll: banca negativa (qualquer sample) → no_bankroll', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.resolveDataSufficiency(1000, -50)).toBe('no_bankroll');
  });

  it('no_bankroll: banca null (qualquer sample) → no_bankroll', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    // bankrollUsd null: deve ser tratado como ausencia de banca, nao crash.
    expect(mod.resolveDataSufficiency(300, null as any)).toBe('no_bankroll');
  });

  it('sample 0 + banca>0 → none', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.resolveDataSufficiency(0, 5000)).toBe('none');
  });

  it('sample 1 + banca>0 → low (limite inferior do low)', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.resolveDataSufficiency(1, 5000)).toBe('low');
  });

  it('sample 50 + banca>0 → low', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.resolveDataSufficiency(50, 5000)).toBe('low');
  });

  it('sample 199 + banca>0 → low (limite superior do low)', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.resolveDataSufficiency(199, 5000)).toBe('low');
  });

  it('boundary: sample exatamente 200 + banca>0 → ok', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.resolveDataSufficiency(200, 5000)).toBe('ok');
  });

  it('sample 500 + banca>0 → ok', async () => {
    const mod = await loadModule();
    expect(mod).not.toBeNull();
    expect(mod.resolveDataSufficiency(500, 5000)).toBe('ok');
  });
});
