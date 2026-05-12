import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-01 — Perfil estruturado JSONB: funcoes puras
//
// Modulo alvo (NAO existe ainda): server/storage/aiStructuredProfile.ts
//   export function normalizeAiStructuredProfile(raw: any): AiStructuredProfile
//   export function isStructuredProfileEmpty(profile: any): boolean
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-01 + "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/151-ai-structured-profile-jsonb.md
//
// Estas funcoes sao PURAS — sem DB/env/Date. (getAiStructuredProfile /
// updateAiStructuredProfile com DB sao testadas em ai-structured-profile-storage.test.ts)
// =============================================================================

describe('normalizeAiStructuredProfile — null / {} -> default minimo', () => {
  it('null -> { schemaVersion: 1 }', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const out = normalizeAiStructuredProfile(null);
    expect(out.schemaVersion).toBe(1);
  });

  it('{} -> { schemaVersion: 1 }', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const out = normalizeAiStructuredProfile({});
    expect(out.schemaVersion).toBe(1);
  });

  it('undefined -> { schemaVersion: 1 }', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const out = normalizeAiStructuredProfile(undefined);
    expect(out.schemaVersion).toBe(1);
  });

  it('back-fill schemaVersion quando ausente em objeto com dados', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const out = normalizeAiStructuredProfile({ tomPreferido: 'direct' });
    expect(out.schemaVersion).toBe(1);
    expect(out.tomPreferido).toBe('direct');
  });
});

describe('normalizeAiStructuredProfile — clamps', () => {
  it('metas de 5 elementos -> clampado a 3', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const out = normalizeAiStructuredProfile({
      metas: [1, 2, 3, 4, 5].map(n => ({ id: `m${n}`, texto: `meta ${n}`, criadaEm: '2026-05-12T00:00:00Z', origem: 'onboarding' })),
    });
    expect(Array.isArray(out.metas)).toBe(true);
    expect(out.metas!.length).toBe(3);
  });

  it('texto de meta > 200 chars -> truncado a 200', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const longText = 'x'.repeat(300);
    const out = normalizeAiStructuredProfile({
      metas: [{ id: 'a', texto: longText, criadaEm: '2026-05-12T00:00:00Z', origem: 'onboarding' }],
    });
    expect(out.metas![0].texto.length).toBeLessThanOrEqual(200);
  });

  it('focoDoMes > 200 chars -> truncado a 200', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const out = normalizeAiStructuredProfile({ focoDoMes: 'y'.repeat(400) });
    expect((out.focoDoMes || '').length).toBeLessThanOrEqual(200);
  });

  it('padroesConhecidos de 15 -> clampado a 10, cada um truncado a 120', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const out = normalizeAiStructuredProfile({
      padroesConhecidos: Array.from({ length: 15 }, () => 'z'.repeat(200)),
    });
    expect(out.padroesConhecidos!.length).toBe(10);
    expect(out.padroesConhecidos!.every(p => p.length <= 120)).toBe(true);
  });

  it('redesPrincipais de 15 -> clampado a 10, cada uma truncada a 50', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const out = normalizeAiStructuredProfile({
      redesPrincipais: Array.from({ length: 15 }, () => 'w'.repeat(80)),
    });
    expect(out.redesPrincipais!.length).toBe(10);
    expect(out.redesPrincipais!.every(r => r.length <= 50)).toBe(true);
  });

  it('stakesTipico > 50 chars -> truncado a 50', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const out = normalizeAiStructuredProfile({ stakesTipico: '$'.repeat(80) });
    expect((out.stakesTipico || '').length).toBeLessThanOrEqual(50);
  });
});

describe('normalizeAiStructuredProfile — versionamento lazy', () => {
  it('schemaVersion ja presente (>= 1) -> mantido (v1: sem conversao)', async () => {
    const { normalizeAiStructuredProfile } = await import('../../../server/storage/aiStructuredProfile');
    const out = normalizeAiStructuredProfile({ schemaVersion: 1, tomPreferido: 'gentle' });
    expect(out.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(out.tomPreferido).toBe('gentle');
  });
});

describe('isStructuredProfileEmpty', () => {
  it('{ schemaVersion: 1 } -> true', async () => {
    const { isStructuredProfileEmpty } = await import('../../../server/storage/aiStructuredProfile');
    expect(isStructuredProfileEmpty({ schemaVersion: 1 })).toBe(true);
  });

  it('null -> true', async () => {
    const { isStructuredProfileEmpty } = await import('../../../server/storage/aiStructuredProfile');
    expect(isStructuredProfileEmpty(null)).toBe(true);
  });

  it('{ schemaVersion: 1, tomPreferido: "direct" } -> false', async () => {
    const { isStructuredProfileEmpty } = await import('../../../server/storage/aiStructuredProfile');
    expect(isStructuredProfileEmpty({ schemaVersion: 1, tomPreferido: 'direct' })).toBe(false);
  });

  it('com metas nao-vazias -> false', async () => {
    const { isStructuredProfileEmpty } = await import('../../../server/storage/aiStructuredProfile');
    expect(isStructuredProfileEmpty({
      schemaVersion: 1,
      metas: [{ id: 'a', texto: 'sair do breakeven', criadaEm: '2026-05-12T00:00:00Z', origem: 'onboarding' }],
    })).toBe(false);
  });

  it('com metas vazias ([]) -> true (array vazio nao conta)', async () => {
    const { isStructuredProfileEmpty } = await import('../../../server/storage/aiStructuredProfile');
    expect(isStructuredProfileEmpty({ schemaVersion: 1, metas: [] })).toBe(true);
  });

  it('com focoDoMes -> false', async () => {
    const { isStructuredProfileEmpty } = await import('../../../server/storage/aiStructuredProfile');
    expect(isStructuredProfileEmpty({ schemaVersion: 1, focoDoMes: 'defesa de 3bet' })).toBe(false);
  });

  it('com onboardingCompletedAt -> false', async () => {
    const { isStructuredProfileEmpty } = await import('../../../server/storage/aiStructuredProfile');
    expect(isStructuredProfileEmpty({ schemaVersion: 1, onboardingCompletedAt: '2026-05-12T00:00:00Z' })).toBe(false);
  });

  it('com nivel estimado mas nivelConfirmado false -> ainda true (so nivel confirmado conta)', async () => {
    const { isStructuredProfileEmpty } = await import('../../../server/storage/aiStructuredProfile');
    expect(isStructuredProfileEmpty({ schemaVersion: 1, nivel: 'mid_consistente', nivelConfirmado: false })).toBe(true);
  });

  it('com nivelConfirmado true -> false', async () => {
    const { isStructuredProfileEmpty } = await import('../../../server/storage/aiStructuredProfile');
    expect(isStructuredProfileEmpty({ schemaVersion: 1, nivel: 'mid_consistente', nivelConfirmado: true })).toBe(false);
  });

  it('apenas onboardingDraft preenchido (wizard em andamento, sem campos finais) -> ainda true', async () => {
    const { isStructuredProfileEmpty } = await import('../../../server/storage/aiStructuredProfile');
    expect(isStructuredProfileEmpty({ schemaVersion: 1, onboardingDraft: { step: 2, mode: 'full', startedAt: '2026-05-12T00:00:00Z' } })).toBe(true);
  });
});
