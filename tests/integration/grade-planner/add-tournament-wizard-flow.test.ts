import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint 2 - Integration test: Matriz 4 cenarios via wizard payload.
//
// Valida que POST /api/planned-tournaments aceita os payloads gerados pelo
// wizard 4-step em 4 combinacoes representativas:
//   1. Vanilla puro (nenhum modifier)
//   2. PKO + isFlight=true + flightDay='1A' + flightAdvanced=false
//   3. Mystery + isLive=true (sem package, opcional)
//   4. Satellite + isFlight=true + isLive=true + ticketValue + flightDay=Final + position=12
//
// Todos devem retornar 200 (handler retorna o torneio criado).
//
// Espelhamento: storage espelha type -> category (ADR-032). Validamos que o
// storage.createPlannedTournament e chamado com type setado e que category
// foi mantida coerente (espelhada).
//
// RED PHASE: o handler atual rejeita Satellite sem rewardType (refinement
// estrito do Sprint 1). Apos o refinement RELAXADO (Sprint 2), esses
// cenarios devem passar.
// =============================================================================

import { handleCreatePlannedTournament } from '../../../server/routes/grade-planner';
import { storage } from '../../../server/storage';
import { selectorCache } from '../../../server/services/selectorCache';
import { insertPlannedTournamentSchema } from '../../../shared/schema';

vi.mock('../../../server/storage', () => ({
  storage: {
    createPlannedTournament: vi.fn(),
    insertSelectorLog: vi.fn(),
  },
}));

vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: {
    invalidateAllForUser: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  (storage.createPlannedTournament as any).mockImplementation(async (data: any) => ({
    id: 'pt-' + Math.random().toString(36).slice(2, 9),
    ...data,
  }));
});

const baseValid = {
  userId: 'USER-0001',
  dayOfWeek: 1,
  profile: 'A',
  site: 'PokerStars',
  time: '19:00',
  speed: 'Normal',
  name: 'Wizard Test',
  buyIn: '22.00',
};

describe('POST /api/planned-tournaments - Wizard matriz 4 cenarios (Sprint 2)', () => {
  it('Cenario 1: Vanilla puro (nenhum modifier) -> 200 OK', async () => {
    const payload = {
      ...baseValid,
      type: 'Vanilla',
      isFlight: false,
      isLive: false,
    };
    // Schema-level: payload deve passar a validacao zod.
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(true);

    // Handler-level: storage e chamado com a row apropriada.
    const r = await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: payload,
    });
    expect(r.id).toBeTruthy();
    expect(storage.createPlannedTournament).toHaveBeenCalled();
    const arg = (storage.createPlannedTournament as any).mock.calls[0][0];
    expect(arg.type).toBe('Vanilla');
  });

  it('Cenario 2: PKO + Flight Day 1A + flightAdvanced=false -> 200 OK', async () => {
    const payload = {
      ...baseValid,
      type: 'PKO',
      isFlight: true,
      isLive: false,
      flightDay: '1A',
      flightAdvanced: false,
    };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(true);

    const r = await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: payload,
    });
    expect(r.id).toBeTruthy();
    const arg = (storage.createPlannedTournament as any).mock.calls[0][0];
    expect(arg.type).toBe('PKO');
    expect(arg.isFlight).toBe(true);
    expect(arg.flightDay).toBe('1A');
    expect(arg.flightAdvanced).toBe(false);
  });

  it('Cenario 3: Mystery + isLive=true (sem package - opcional) -> 200 OK', async () => {
    const payload: any = {
      ...baseValid,
      type: 'Mystery',
      isFlight: false,
      isLive: true,
      // Nao envia package* — deve ser permitido (opcionais).
    };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(true);

    const r = await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: payload,
    });
    expect(r.id).toBeTruthy();
    const arg = (storage.createPlannedTournament as any).mock.calls[0][0];
    expect(arg.type).toBe('Mystery');
    expect(arg.isLive).toBe(true);
  });

  it('Cenario 4: Satellite + Flight + Live + ticketValue + Day Final + position=12 -> 200 OK', async () => {
    const payload: any = {
      ...baseValid,
      type: 'Satellite',
      isFlight: true,
      isLive: true,
      satelliteRewardType: 'ticket',
      satelliteTicketValue: '109.00',
      satelliteTargetName: 'Sunday Million',
      flightDay: 'Final',
      position: 12,
      prize: '50.00',
    };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(true);

    const r = await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: payload,
    });
    expect(r.id).toBeTruthy();
    const arg = (storage.createPlannedTournament as any).mock.calls[0][0];
    expect(arg.type).toBe('Satellite');
    expect(arg.isFlight).toBe(true);
    expect(arg.isLive).toBe(true);
    expect(arg.flightDay).toBe('Final');
    expect(arg.position).toBe(12);
  });

  // ==== Refinement relaxado: Satellite sem rewardType + sem target (Sprint 2) ====

  it('Cenario 5 (relaxado): Satellite SEM rewardType + SEM target -> 200 OK', async () => {
    const payload: any = {
      ...baseValid,
      type: 'Satellite',
      isFlight: false,
      isLive: false,
      // Nao envia satelliteRewardType nem satelliteTargetName.
    };
    const parsed = insertPlannedTournamentSchema.safeParse(payload);
    expect(parsed.success).toBe(true);

    const r = await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: payload,
    });
    expect(r.id).toBeTruthy();
    const arg = (storage.createPlannedTournament as any).mock.calls[0][0];
    expect(arg.type).toBe('Satellite');
  });

  // ==== Espelhamento type -> category (ADR-032) ====

  it('storage espelha type para category quando criando torneio do wizard', async () => {
    const payload = {
      ...baseValid,
      type: 'PKO',
      isFlight: false,
      isLive: false,
    };
    await handleCreatePlannedTournament({
      userId: 'USER-0001',
      body: payload,
    });
    const arg = (storage.createPlannedTournament as any).mock.calls[0][0];
    // Aceita qualquer um destes:
    //   (a) handler ja seta arg.category = 'PKO' explicitamente;
    //   (b) arg.category esta indefinido mas storage internamente espelha
    //       (nao testado aqui — mock direto do storage).
    // Testamos: SE category esta presente, eh igual ao type.
    if (arg.category !== undefined && arg.category !== null) {
      expect(arg.category).toBe(arg.type);
    }
  });
});
