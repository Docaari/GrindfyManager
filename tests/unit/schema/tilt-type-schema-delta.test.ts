import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint Fase C #4 — RF-02: tiltSelfAssessmentSchema ganha tiltType (SEM migration)
//
// Spec: Docs/specs/sprint-fase-c-4-tilt-tipado-2026-06-02.md (RF-02 + Modelos de Dados)
// ADR : Docs/architecture/decisions/232-fase-c-4-tilt-tipado-7-tipos-antidoto.md (Schema)
//
// Delta esperado (schema.ts:3857):
//   tiltSelfAssessmentSchema ganha `tiltType: tiltTypeSchema.nullable().optional()`
//   (lesson #7 — nullable+optional, back-compat com registros legados sem o campo).
//
// O campo vive DENTRO do jsonb tilt_self_assessment ja existente — nenhum ALTER
// TABLE, nenhuma tabela nova. Mudanca Zod-only.
//
// Status RED: tiltType ainda nao existe no schema -> parse com tiltType valido
// retorna objeto SEM a chave (.strip default do Zod) OU rejeita; testes que
// asseguram presenca de tiltType no parsed object falham ate o campo ser adicionado.
//
// Lessons: #7 (nullable+optional p/ adicao gradual), #30 (.test.ts = node).
// =============================================================================

import { tiltSelfAssessmentSchema } from '../../../shared/schema';

const BASE = {
  feltTilt: 6,
  keptTilting: 4,
  presence: 7,
  triggers: ['cooler'],
  action: 'respirar e trocar de mesa',
};

// ---------------------------------------------------------------------------
// Back-compat (lesson #7) — registro legado sem tiltType continua valido
// ---------------------------------------------------------------------------

describe('tiltSelfAssessmentSchema — back-compat (sem tiltType)', () => {
  it('parse de registro legado (sem tiltType) continua valido', () => {
    expect(() => tiltSelfAssessmentSchema.parse({ ...BASE })).not.toThrow();
  });

  it('parse sem tiltType NAO injeta tiltType nem rejeita (back-compat)', () => {
    const parsed: any = tiltSelfAssessmentSchema.parse({ ...BASE });
    // optional: pode ser ausente; nunca deve ser um valor invalido fabricado
    expect(parsed.tiltType === undefined || parsed.tiltType === null).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Aceita tiltType valido
// ---------------------------------------------------------------------------

describe('tiltSelfAssessmentSchema — tiltType valido', () => {
  it('aceita tiltType="injustice" e o preserva no parsed', () => {
    const parsed: any = tiltSelfAssessmentSchema.parse({ ...BASE, tiltType: 'injustice' });
    expect(parsed.tiltType).toBe('injustice');
  });

  it.each([
    'running_bad',
    'injustice',
    'hate_losing',
    'mistake',
    'entitlement',
    'revenge',
    'desperation',
  ] as const)('aceita tiltType="%s"', (id) => {
    const parsed: any = tiltSelfAssessmentSchema.parse({ ...BASE, tiltType: id });
    expect(parsed.tiltType).toBe(id);
  });

  it('aceita tiltType=null (nullable — jogador nao tipificou)', () => {
    const parsed: any = tiltSelfAssessmentSchema.parse({ ...BASE, tiltType: null });
    expect(parsed.tiltType).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rejeita tiltType invalido
// ---------------------------------------------------------------------------

describe('tiltSelfAssessmentSchema — tiltType invalido', () => {
  it('rejeita tiltType="foo" (fora do enum)', () => {
    expect(() => tiltSelfAssessmentSchema.parse({ ...BASE, tiltType: 'foo' })).toThrow();
  });

  it('rejeita tiltType="winners_tilt" (fora de escopo)', () => {
    expect(() => tiltSelfAssessmentSchema.parse({ ...BASE, tiltType: 'winners_tilt' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Campos pre-existentes continuam validados (nao regredir)
// ---------------------------------------------------------------------------

describe('tiltSelfAssessmentSchema — campos existentes intactos', () => {
  it('rejeita feltTilt fora de 0-10 mesmo com tiltType valido', () => {
    expect(() =>
      tiltSelfAssessmentSchema.parse({ ...BASE, feltTilt: 11, tiltType: 'injustice' }),
    ).toThrow();
  });

  it('rejeita action > 500 chars', () => {
    expect(() =>
      tiltSelfAssessmentSchema.parse({ ...BASE, action: 'x'.repeat(501) }),
    ).toThrow();
  });

  it('rejeita trigger fora do enum TILT_TRIGGERS', () => {
    expect(() =>
      tiltSelfAssessmentSchema.parse({ ...BASE, triggers: ['nao-existe'] }),
    ).toThrow();
  });
});
