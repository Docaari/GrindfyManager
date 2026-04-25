import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint 2 - RF-04 RELAXADO (MEDIUM #1 do review manual)
//
// Sprint 1 implementou refinement estrito que rejeita Satellite SEM:
//   - satelliteRewardType
//   - satelliteTargetTemplateId OR satelliteTargetName
//
// Sprint 2 RELAXA: founder original definiu "tudo opcional de ser registrado".
// Player pode criar Satellite com apenas o tipo, e preencher target/rewardType
// depois (ROI parcial ate la).
//
// Esses testes RED PHASE falham hoje porque:
//   - applyOrthogonalRefinements rejeita Satellite sem rewardType (linhas 1162-1180).
//   - Apos relaxar, esses casos devem retornar success:true.
//
// O que CONTINUA sendo rejeitado:
//   - Tipo nao-Satellite com campos satellite* populados (orthogonality).
//   - flightDay invalido quando isFlight=true.
//   - flightAdvanced quando flightDay nao eh Day 1 letter.
//   - package* fora de escopo (isLive=false e nao satelite-package).
// =============================================================================

import { insertTournamentSchema } from '../../../shared/schema';

const baseTournament = {
  userId: 'USER-0001',
  site: 'PokerStars',
  name: 'Sat WCOOP $11',
  buyIn: '11.00',
  type: 'Vanilla' as const,
  speed: 'Normal',
  category: 'Vanilla',
  format: 'MTT',
  prize: '0',
  position: null,
  fieldSize: null,
  datePlayed: new Date('2026-04-25'),
};

describe('insertTournamentSchema - Satellite refinement RELAXADO (Sprint 2)', () => {
  it('aceita Satellite SEM satelliteRewardType (relaxado)', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'Satellite',
      // Nao enviamos satelliteRewardType nem target.
    });
    expect(result.success).toBe(true);
  });

  it('aceita Satellite SEM target (templateId ou name) - relaxado', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'Satellite',
      satelliteRewardType: 'ticket',
      // Sem satelliteTargetTemplateId nem satelliteTargetName.
    });
    expect(result.success).toBe(true);
  });

  it('aceita Satellite COM rewardType e target preenchidos (caso ideal)', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'Satellite',
      satelliteRewardType: 'ticket',
      satelliteTargetName: 'Sunday Million',
    });
    expect(result.success).toBe(true);
  });

  it('aceita Satellite SO com rewardType (sem target) - relaxado', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'Satellite',
      satelliteRewardType: 'cash',
    });
    expect(result.success).toBe(true);
  });

  it('aceita Satellite COM apenas target (sem rewardType) - relaxado', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'Satellite',
      satelliteTargetName: 'Sunday Storm',
    });
    expect(result.success).toBe(true);
  });

  // ==== Orthogonality preservada (continuam rejeitados) ====

  it('REJEITA tipo Vanilla com satelliteRewardType populado', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'Vanilla',
      satelliteRewardType: 'ticket',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.path.join('.'));
      expect(issues).toContain('satelliteRewardType');
    }
  });

  it('REJEITA tipo PKO com satelliteTargetName populado', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'PKO',
      satelliteTargetName: 'Algum torneio',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.path.join('.'));
      expect(issues).toContain('satelliteTargetName');
    }
  });

  it('REJEITA tipo Mystery com satelliteTicketValue populado', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'Mystery',
      satelliteTicketValue: '50.00',
    });
    expect(result.success).toBe(false);
  });

  // ==== Flight refinement preservado ====

  it('REJEITA isFlight=true sem flightDay', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'Vanilla',
      isFlight: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.path.join('.'));
      expect(issues).toContain('flightDay');
    }
  });

  it('REJEITA flightDay invalido quando isFlight=true', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'PKO',
      isFlight: true,
      flightDay: 'lixo123',
    });
    expect(result.success).toBe(false);
  });

  it('aceita flightDay valido quando isFlight=true (Day 1A) com flightAdvanced', () => {
    const result = insertTournamentSchema.safeParse({
      ...baseTournament,
      type: 'PKO',
      isFlight: true,
      flightDay: '1A',
      flightAdvanced: false,
    });
    expect(result.success).toBe(true);
  });
});
