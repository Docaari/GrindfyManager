import { describe, it, expect } from 'vitest';
import {
  insertSessionTournamentSchema,
  insertPlannedTournamentSchema,
} from '../../../shared/schema';

// =============================================================================
// Testes de Caracterizacao: Schemas Zod de Session Tournaments
// Documentam o comportamento ATUAL das validacoes.
// Todos devem PASSAR com o codigo existente.
// =============================================================================

// ---------------------------------------------------------------------------
// insertSessionTournamentSchema
// ---------------------------------------------------------------------------

describe('insertSessionTournamentSchema', () => {
  const validSessionTournament = {
    userId: 'USER-0001',
    sessionId: 'session-001',
    site: 'GGPoker',
    buyIn: '22.00',
  };

  it('deve aceitar torneio de sessao com campos obrigatorios minimos', () => {
    const result = insertSessionTournamentSchema.safeParse(validSessionTournament);
    expect(result.success).toBe(true);
  });

  it('deve aceitar torneio de sessao com todos os campos opcionais', () => {
    const data = {
      ...validSessionTournament,
      name: '$22 Bounty Hunters',
      time: '19:00',
      guaranteed: '50000.00',
      rebuys: 2,
      result: '150.00',
      position: 5,
      bounty: '25.00',
      prize: '200.00',
      fieldSize: 500,
      status: 'finished',
      startTime: '2025-01-20T19:00:00.000Z',
      endTime: '2025-01-20T23:00:00.000Z',
      fromPlannedTournament: true,
      plannedTournamentId: 'pt-001',
      type: 'PKO',
      speed: 'Normal',
      category: 'PKO',
      prioridade: 1,
    };

    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar torneio sem userId', () => {
    const { userId, ...data } = validSessionTournament;
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem sessionId', () => {
    const { sessionId, ...data } = validSessionTournament;
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem site', () => {
    const { site, ...data } = validSessionTournament;
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem buyIn', () => {
    const { buyIn, ...data } = validSessionTournament;
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar status "upcoming" (padrao)', () => {
    const data = { ...validSessionTournament, status: 'upcoming' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar status "registered"', () => {
    const data = { ...validSessionTournament, status: 'registered' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar status "active"', () => {
    const data = { ...validSessionTournament, status: 'active' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar status "finished"', () => {
    const data = { ...validSessionTournament, status: 'finished' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar tipo "Vanilla"', () => {
    const data = { ...validSessionTournament, type: 'Vanilla' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar tipo "PKO"', () => {
    const data = { ...validSessionTournament, type: 'PKO' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar tipo "Mystery"', () => {
    const data = { ...validSessionTournament, type: 'Mystery' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar speed "Normal"', () => {
    const data = { ...validSessionTournament, speed: 'Normal' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar speed "Turbo"', () => {
    const data = { ...validSessionTournament, speed: 'Turbo' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar speed "Hyper"', () => {
    const data = { ...validSessionTournament, speed: 'Hyper' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar prioridade 1 (Alta)', () => {
    const data = { ...validSessionTournament, prioridade: 1 };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar prioridade 2 (Media)', () => {
    const data = { ...validSessionTournament, prioridade: 2 };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar prioridade 3 (Baixa)', () => {
    const data = { ...validSessionTournament, prioridade: 3 };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar fieldSize como number', () => {
    const data = { ...validSessionTournament, fieldSize: 1500 };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar fieldSize como string numerica e converter para number', () => {
    const data = { ...validSessionTournament, fieldSize: '1500' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fieldSize).toBe(1500);
    }
  });

  it('deve aceitar fieldSize como null', () => {
    const data = { ...validSessionTournament, fieldSize: null };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar position como number', () => {
    const data = { ...validSessionTournament, position: 15 };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar position como string numerica e converter para number', () => {
    const data = { ...validSessionTournament, position: '15' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.position).toBe(15);
    }
  });

  it('deve aceitar position como null', () => {
    const data = { ...validSessionTournament, position: null };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar rebuys como number', () => {
    const data = { ...validSessionTournament, rebuys: 3 };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar rebuys como string numerica e converter para number', () => {
    const data = { ...validSessionTournament, rebuys: '2' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rebuys).toBe(2);
    }
  });

  it('deve aceitar startTime como string ISO', () => {
    const data = { ...validSessionTournament, startTime: '2025-01-20T19:00:00.000Z' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar startTime como null', () => {
    const data = { ...validSessionTournament, startTime: null };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar endTime como string ISO', () => {
    const data = { ...validSessionTournament, endTime: '2025-01-20T23:00:00.000Z' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar endTime como null', () => {
    const data = { ...validSessionTournament, endTime: null };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar fromPlannedTournament como boolean', () => {
    const data = { ...validSessionTournament, fromPlannedTournament: true };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar bounty como string decimal', () => {
    const data = { ...validSessionTournament, bounty: '50.00' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar time como string de horario', () => {
    const data = { ...validSessionTournament, time: '19:30' };
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertPlannedTournamentSchema
// ---------------------------------------------------------------------------

describe('insertPlannedTournamentSchema', () => {
  const validPlanned = {
    userId: 'USER-0001',
    dayOfWeek: 1,
    site: 'GGPoker',
    time: '19:00',
    type: 'PKO',
    speed: 'Normal',
    name: '$22 Bounty Hunters',
    buyIn: '22.00',
  };

  it('deve aceitar torneio planejado com campos obrigatorios', () => {
    const result = insertPlannedTournamentSchema.safeParse(validPlanned);
    expect(result.success).toBe(true);
  });

  it('deve aceitar torneio planejado com campos opcionais', () => {
    const data = {
      ...validPlanned,
      profile: 'B',
      guaranteed: '50000.00',
      templateId: 'tmpl-001',
      status: 'upcoming',
      rebuys: 0,
      result: '0',
      bounty: '0',
      position: null,
      sessionId: null,
      prioridade: 1,
      isActive: true,
    };

    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar torneio planejado sem userId', () => {
    const { userId, ...data } = validPlanned;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio planejado sem dayOfWeek', () => {
    const { dayOfWeek, ...data } = validPlanned;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio planejado sem site', () => {
    const { site, ...data } = validPlanned;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio planejado sem time', () => {
    const { time, ...data } = validPlanned;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio planejado sem type', () => {
    const { type, ...data } = validPlanned;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio planejado sem speed', () => {
    const { speed, ...data } = validPlanned;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio planejado sem name', () => {
    const { name, ...data } = validPlanned;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio planejado sem buyIn', () => {
    const { buyIn, ...data } = validPlanned;
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar dayOfWeek de 0 (domingo) a 6 (sabado)', () => {
    for (let day = 0; day <= 6; day++) {
      const data = { ...validPlanned, dayOfWeek: day };
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it('deve aceitar profile A, B ou C', () => {
    for (const profile of ['A', 'B', 'C']) {
      const data = { ...validPlanned, profile };
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it('deve transformar startTime string em Date quando fornecido', () => {
    const data = { ...validPlanned, startTime: '2025-01-20T19:00:00.000Z' };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success && result.data.startTime) {
      expect(result.data.startTime).toBeInstanceOf(Date);
    }
  });

  it('deve aceitar startTime como undefined sem erro', () => {
    const data = { ...validPlanned, startTime: undefined };
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar prioridade 1, 2 ou 3', () => {
    for (const prio of [1, 2, 3]) {
      const data = { ...validPlanned, prioridade: prio };
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });
});
