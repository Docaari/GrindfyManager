import { describe, it, expect } from 'vitest';
import {
  insertPlannedTournamentSchema,
  insertWeeklyPlanSchema,
  insertActiveDaySchema,
  insertProfileStateSchema,
} from '../../../shared/schema';

// =============================================================================
// Testes de Caracterizacao: Schemas Zod do Grade Planner
// Documentam o comportamento ATUAL das validacoes.
// Todos devem PASSAR com o codigo existente.
// =============================================================================

// ---------------------------------------------------------------------------
// insertPlannedTournamentSchema
// ---------------------------------------------------------------------------

describe('insertPlannedTournamentSchema', () => {
  const validTournament = {
    userId: 'USER-0001',
    dayOfWeek: 1, // Monday
    profile: 'A',
    site: 'PokerStars',
    time: '19:00',
    type: 'PKO',
    speed: 'Normal',
    name: 'Daily $22 PKO',
    buyIn: '22.00',
  };

  // --- Happy path ---

  it('deve aceitar torneio planejado com todos os campos obrigatorios', () => {
    const result = insertPlannedTournamentSchema.safeParse(validTournament);
    expect(result.success).toBe(true);
  });

  it('deve aceitar torneio com todos os campos opcionais preenchidos', () => {
    const data = {
      ...validTournament,
      guaranteed: '50000.00',
      templateId: 'template-001',
      status: 'upcoming',
      startTime: '2025-01-20T19:00:00.000Z',
      rebuys: 1,
      result: '150.00',
      bounty: '25.00',
      position: 5,
      sessionId: 'session-001',
      prioridade: 1,
      isActive: true,
    };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve transformar startTime string em Date object', () => {
    const data = {
      ...validTournament,
      startTime: '2025-01-20T19:00:00.000Z',
    };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startTime).toBeInstanceOf(Date);
    }
  });

  it('deve aceitar startTime como undefined', () => {
    const result = insertPlannedTournamentSchema.safeParse(validTournament);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startTime).toBeUndefined();
    }
  });

  // --- Perfis A, B, C ---

  it('deve aceitar profile "A"', () => {
    const data = { ...validTournament, profile: 'A' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar profile "B"', () => {
    const data = { ...validTournament, profile: 'B' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar profile "C"', () => {
    const data = { ...validTournament, profile: 'C' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Dias da semana (0-6) ---

  it('deve aceitar dayOfWeek 0 (domingo)', () => {
    const data = { ...validTournament, dayOfWeek: 0 };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar dayOfWeek 6 (sabado)', () => {
    const data = { ...validTournament, dayOfWeek: 6 };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Tipos de torneio ---

  it('deve aceitar type "Vanilla"', () => {
    const data = { ...validTournament, type: 'Vanilla' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar type "PKO"', () => {
    const data = { ...validTournament, type: 'PKO' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar type "Mystery"', () => {
    const data = { ...validTournament, type: 'Mystery' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Velocidades ---

  it('deve aceitar speed "Normal"', () => {
    const data = { ...validTournament, speed: 'Normal' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar speed "Turbo"', () => {
    const data = { ...validTournament, speed: 'Turbo' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar speed "Hyper"', () => {
    const data = { ...validTournament, speed: 'Hyper' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Prioridades ---

  it('deve aceitar prioridade 1 (Alta)', () => {
    const data = { ...validTournament, prioridade: 1 };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar prioridade 2 (Media - default)', () => {
    const data = { ...validTournament, prioridade: 2 };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar prioridade 3 (Baixa)', () => {
    const data = { ...validTournament, prioridade: 3 };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Status ---

  it('deve aceitar status "upcoming"', () => {
    const data = { ...validTournament, status: 'upcoming' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar status "registered"', () => {
    const data = { ...validTournament, status: 'registered' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar status "active"', () => {
    const data = { ...validTournament, status: 'active' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar status "finished"', () => {
    const data = { ...validTournament, status: 'finished' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Campos opcionais numericos ---

  it('deve aceitar rebuys como 0', () => {
    const data = { ...validTournament, rebuys: 0 };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar result como decimal string', () => {
    const data = { ...validTournament, result: '500.50' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar bounty como decimal string', () => {
    const data = { ...validTournament, bounty: '75.00' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar position como integer', () => {
    const data = { ...validTournament, position: 1 };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar guaranteed como decimal string', () => {
    const data = { ...validTournament, guaranteed: '100000.00' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar isActive como boolean false', () => {
    const data = { ...validTournament, isActive: false };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar templateId como referencia a biblioteca', () => {
    const data = { ...validTournament, templateId: 'tmpl-abc123' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar sessionId para vincular a sessao de grind', () => {
    const data = { ...validTournament, sessionId: 'session-xyz' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Validacao de campos obrigatorios ---

  it('deve rejeitar torneio sem userId', () => {
    const { userId, ...data } = validTournament;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem dayOfWeek', () => {
    const { dayOfWeek, ...data } = validTournament;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem site', () => {
    const { site, ...data } = validTournament;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem time', () => {
    const { time, ...data } = validTournament;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem type', () => {
    const { type, ...data } = validTournament;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem speed', () => {
    const { speed, ...data } = validTournament;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem name', () => {
    const { name, ...data } = validTournament;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem buyIn', () => {
    const { buyIn, ...data } = validTournament;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // --- Edge case: buyIn como string ---

  it('deve aceitar buyIn como string decimal', () => {
    const data = { ...validTournament, buyIn: '55.00' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar buyIn como "0"', () => {
    const data = { ...validTournament, buyIn: '0' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Edge case: profile default ---

  it('deve aceitar torneio sem profile (usa default "A" do schema)', () => {
    const { profile, ...data } = validTournament;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertWeeklyPlanSchema
// ---------------------------------------------------------------------------

describe('insertWeeklyPlanSchema', () => {
  const validPlan = {
    userId: 'USER-0001',
    weekStart: new Date('2025-01-20T00:00:00.000Z'),
  };

  // --- Happy path ---

  it('deve aceitar plano semanal com campos obrigatorios (userId e weekStart)', () => {
    const result = insertWeeklyPlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it('deve aceitar plano com todos os campos opcionais preenchidos', () => {
    const data = {
      ...validPlan,
      title: 'Semana de volume alto',
      description: 'Foco em PKO e torneios turbo',
      targetBuyins: '1000.00',
      targetProfit: '500.00',
      targetVolume: 50,
      isActive: true,
    };
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar weekStart como Date object', () => {
    const data = { ...validPlan, weekStart: new Date('2025-02-03T00:00:00.000Z') };
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar weekStart como string ISO (requer Date object)', () => {
    const data = { ...validPlan, weekStart: '2025-01-20T00:00:00.000Z' };
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // --- Campos opcionais ---

  it('deve aceitar title como string', () => {
    const data = { ...validPlan, title: 'Semana de grind pesado' };
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar description como texto longo', () => {
    const data = {
      ...validPlan,
      description: 'Plano detalhado para a semana com foco em volume e mesas finais',
    };
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar targetBuyins como decimal string', () => {
    const data = { ...validPlan, targetBuyins: '2500.00' };
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar targetProfit como decimal string', () => {
    const data = { ...validPlan, targetProfit: '1200.50' };
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar targetVolume como integer', () => {
    const data = { ...validPlan, targetVolume: 100 };
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar targetVolume como 0', () => {
    const data = { ...validPlan, targetVolume: 0 };
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar isActive como false', () => {
    const data = { ...validPlan, isActive: false };
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Campos obrigatorios ---

  it('deve rejeitar plano sem userId', () => {
    const { userId, ...data } = validPlan;
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar plano sem weekStart', () => {
    const { weekStart, ...data } = validPlan;
    const result = insertWeeklyPlanSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// insertActiveDaySchema
// ---------------------------------------------------------------------------

describe('insertActiveDaySchema', () => {
  const validActiveDay = {
    userId: 'USER-0001',
    dayOfWeek: 1, // Monday
  };

  // --- Happy path ---

  it('deve aceitar dia ativo com campos obrigatorios (userId e dayOfWeek)', () => {
    const result = insertActiveDaySchema.safeParse(validActiveDay);
    expect(result.success).toBe(true);
  });

  it('deve aceitar dia ativo com isActive true', () => {
    const data = { ...validActiveDay, isActive: true };
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar dia ativo com isActive false', () => {
    const data = { ...validActiveDay, isActive: false };
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Dias da semana (0-6) ---

  it('deve aceitar dayOfWeek 0 (domingo)', () => {
    const data = { ...validActiveDay, dayOfWeek: 0 };
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar dayOfWeek 1 (segunda)', () => {
    const data = { ...validActiveDay, dayOfWeek: 1 };
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar dayOfWeek 2 (terca)', () => {
    const data = { ...validActiveDay, dayOfWeek: 2 };
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar dayOfWeek 3 (quarta)', () => {
    const data = { ...validActiveDay, dayOfWeek: 3 };
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar dayOfWeek 4 (quinta)', () => {
    const data = { ...validActiveDay, dayOfWeek: 4 };
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar dayOfWeek 5 (sexta)', () => {
    const data = { ...validActiveDay, dayOfWeek: 5 };
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar dayOfWeek 6 (sabado)', () => {
    const data = { ...validActiveDay, dayOfWeek: 6 };
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Campos obrigatorios ---

  it('deve rejeitar dia ativo sem userId', () => {
    const { userId, ...data } = validActiveDay;
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar dia ativo sem dayOfWeek', () => {
    const { dayOfWeek, ...data } = validActiveDay;
    const result = insertActiveDaySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // --- Edge case: isActive default ---

  it('deve aceitar dia ativo sem isActive (usa default true do schema)', () => {
    const result = insertActiveDaySchema.safeParse(validActiveDay);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertProfileStateSchema
// ---------------------------------------------------------------------------

describe('insertProfileStateSchema', () => {
  const validProfileState = {
    userId: 'USER-0001',
    dayOfWeek: 1, // Monday
  };

  // --- Happy path ---

  it('deve aceitar profile state com campos obrigatorios (userId e dayOfWeek)', () => {
    const result = insertProfileStateSchema.safeParse(validProfileState);
    expect(result.success).toBe(true);
  });

  it('deve aceitar profile state com activeProfile "A"', () => {
    const data = { ...validProfileState, activeProfile: 'A' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar profile state com activeProfile "B"', () => {
    const data = { ...validProfileState, activeProfile: 'B' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar profile state com activeProfile "C"', () => {
    const data = { ...validProfileState, activeProfile: 'C' };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar profile state com activeProfile null (todos inativos)', () => {
    const data = { ...validProfileState, activeProfile: null };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar profile state sem activeProfile (campo opcional)', () => {
    const result = insertProfileStateSchema.safeParse(validProfileState);
    expect(result.success).toBe(true);
  });

  // --- Dias da semana (0-6) ---

  it('deve aceitar dayOfWeek 0 (domingo)', () => {
    const data = { ...validProfileState, dayOfWeek: 0 };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar dayOfWeek 6 (sabado)', () => {
    const data = { ...validProfileState, dayOfWeek: 6 };
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // --- Campos obrigatorios ---

  it('deve rejeitar profile state sem userId', () => {
    const { userId, ...data } = validProfileState;
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar profile state sem dayOfWeek', () => {
    const { dayOfWeek, ...data } = validProfileState;
    const result = insertProfileStateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
