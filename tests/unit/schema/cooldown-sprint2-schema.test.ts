import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — Schema delta
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-03 Sprint 2)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
//
// Sprint 2 adiciona AO schema existente:
//   - grindSessions.planClosed (boolean default false)
//   - users.dashboardSnoozedUntil (timestamp nullable)
//   - tiltSelfAssessmentSchema (Zod, ate aqui ja existe TiltSelfAssessment type
//     mas NAO existe Zod schema validador exportado)
//   - sleepGateInputSchema (Zod novo p/ payload PATCH do Bloco 4)
//
// Status esperado: TODOS FALHAM por exports inexistentes.
// =============================================================================

import {
  grindSessions,
  users,
  tiltSelfAssessmentSchema,
  sleepGateInputSchema,
  type TiltSelfAssessment,
} from '../../../shared/schema';

// ---------------------------------------------------------------------------
// grindSessions.planClosed (Sprint 2)
// ---------------------------------------------------------------------------

describe('grindSessions schema delta - planClosed', () => {
  it('expoe coluna planClosed', () => {
    expect((grindSessions as any).planClosed).toBeDefined();
  });

  it('planClosed e um column object Drizzle (tem name property)', () => {
    const col: any = (grindSessions as any).planClosed;
    // Drizzle columns tem .name = nome SQL
    expect(col?.name ?? col?.config?.name).toBeTruthy();
  });

  it('planClosed mapeia para coluna SQL "plan_closed"', () => {
    const col: any = (grindSessions as any).planClosed;
    const name = col?.name ?? col?.config?.name;
    expect(String(name)).toBe('plan_closed');
  });
});

// ---------------------------------------------------------------------------
// users.dashboardSnoozedUntil (Sprint 2)
// ---------------------------------------------------------------------------

describe('users schema delta - dashboardSnoozedUntil', () => {
  it('expoe coluna dashboardSnoozedUntil', () => {
    expect((users as any).dashboardSnoozedUntil).toBeDefined();
  });

  it('dashboardSnoozedUntil mapeia para "dashboard_snoozed_until"', () => {
    const col: any = (users as any).dashboardSnoozedUntil;
    const name = col?.name ?? col?.config?.name;
    expect(String(name)).toBe('dashboard_snoozed_until');
  });

  it('dashboardSnoozedUntil e nullable (sem notNull)', () => {
    const col: any = (users as any).dashboardSnoozedUntil;
    // Drizzle: column.notNull eh false (ou undefined) quando nullable
    const isNotNull = col?.notNull === true || col?.config?.notNull === true;
    expect(isNotNull).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tiltSelfAssessmentSchema (Zod) - Sprint 2
// ---------------------------------------------------------------------------

describe('tiltSelfAssessmentSchema - Zod validacao', () => {
  it('exporta tiltSelfAssessmentSchema', () => {
    expect(tiltSelfAssessmentSchema).toBeDefined();
    expect(typeof (tiltSelfAssessmentSchema as any).parse).toBe('function');
  });

  it('aceita payload completo valido', () => {
    const payload: TiltSelfAssessment = {
      feltTilt: 5,
      keptTilting: 3,
      presence: 7,
      triggers: ['cooler', 'downswing'],
      action: 'respirar antes de pagar river',
    };
    expect(() => tiltSelfAssessmentSchema.parse(payload)).not.toThrow();
  });

  it('aceita feltTilt = 0 (boundary inferior inclusivo)', () => {
    const payload = {
      feltTilt: 0,
      keptTilting: 0,
      presence: 0,
      triggers: [],
      action: '',
    };
    expect(() => tiltSelfAssessmentSchema.parse(payload)).not.toThrow();
  });

  it('aceita feltTilt = 10 (boundary superior inclusivo)', () => {
    const payload = {
      feltTilt: 10,
      keptTilting: 10,
      presence: 10,
      triggers: ['cooler'],
      action: 'evitar fold em ICM ruim',
    };
    expect(() => tiltSelfAssessmentSchema.parse(payload)).not.toThrow();
  });

  it('rejeita feltTilt = 11 (acima do max)', () => {
    expect(() =>
      tiltSelfAssessmentSchema.parse({
        feltTilt: 11,
        keptTilting: 0,
        presence: 0,
        triggers: [],
        action: '',
      }),
    ).toThrow();
  });

  it('rejeita feltTilt = -1', () => {
    expect(() =>
      tiltSelfAssessmentSchema.parse({
        feltTilt: -1,
        keptTilting: 0,
        presence: 0,
        triggers: [],
        action: '',
      }),
    ).toThrow();
  });

  it('rejeita keptTilting nao-numerico', () => {
    expect(() =>
      tiltSelfAssessmentSchema.parse({
        feltTilt: 5,
        keptTilting: 'muito',
        presence: 5,
        triggers: [],
        action: '',
      } as any),
    ).toThrow();
  });

  it('rejeita trigger fora do enum (ex: "tedio" nao e valido)', () => {
    expect(() =>
      tiltSelfAssessmentSchema.parse({
        feltTilt: 5,
        keptTilting: 5,
        presence: 5,
        triggers: ['tedio'],
        action: '',
      }),
    ).toThrow();
  });

  it('aceita todos os triggers do enum (cooler, slowroll, big-bluff-fail, downswing, distracao, fome, sono, briga-interpessoal, outro)', () => {
    const allTriggers = [
      'cooler',
      'slowroll',
      'big-bluff-fail',
      'downswing',
      'distracao',
      'fome',
      'sono',
      'briga-interpessoal',
      'outro',
    ];
    expect(() =>
      tiltSelfAssessmentSchema.parse({
        feltTilt: 5,
        keptTilting: 5,
        presence: 5,
        triggers: allTriggers,
        action: 'todos',
      }),
    ).not.toThrow();
  });

  it('rejeita action > 500 chars (limite Spec)', () => {
    expect(() =>
      tiltSelfAssessmentSchema.parse({
        feltTilt: 5,
        keptTilting: 5,
        presence: 5,
        triggers: [],
        action: 'A'.repeat(501),
      }),
    ).toThrow();
  });

  it('aceita action vazia (string vazia)', () => {
    expect(() =>
      tiltSelfAssessmentSchema.parse({
        feltTilt: 5,
        keptTilting: 5,
        presence: 5,
        triggers: [],
        action: '',
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// sleepGateInputSchema (Zod) - Sprint 2
// ---------------------------------------------------------------------------

describe('sleepGateInputSchema - Zod validacao', () => {
  it('exporta sleepGateInputSchema', () => {
    expect(sleepGateInputSchema).toBeDefined();
    expect(typeof (sleepGateInputSchema as any).parse).toBe('function');
  });

  it('aceita {sleepIntent: true, planClosed: true}', () => {
    expect(() =>
      sleepGateInputSchema.parse({ sleepIntent: true, planClosed: true }),
    ).not.toThrow();
  });

  it('aceita {sleepIntent: false} (planClosed opcional/false)', () => {
    expect(() =>
      sleepGateInputSchema.parse({ sleepIntent: false }),
    ).not.toThrow();
  });

  it('rejeita sleepIntent ausente', () => {
    expect(() => sleepGateInputSchema.parse({} as any)).toThrow();
  });

  it('rejeita sleepIntent string em vez de boolean', () => {
    expect(() =>
      sleepGateInputSchema.parse({ sleepIntent: 'sim' } as any),
    ).toThrow();
  });
});
