import { describe, it, expect } from 'vitest';
import {
  calculateSessionStats,
} from '../../../client/src/components/grind-session-live/calculateSessionStats';

// =============================================================================
// Testes TDD: Re-entry Flow (Spec 3)
//
// Foco: logica pura de fila de modais, handlers de reentry, acumulacao,
// KPI "Entradas Totais".
//
// Arquivos-alvo (serao criados pelo implementer):
//   - client/src/components/grind-session-live/ReentryConfirmDialog.tsx
//   - client/src/pages/GrindSessionLive.tsx (handlers e state reentryQueue)
//   - client/src/components/grind-session-live/calculateSessionStats.ts
//     (totalEntries no SessionStats)
//   - server/routes/grind-sessions.ts (transicao finished->registered)
//
// Modo: TDD - helpers nao existem.
// =============================================================================

// Helpers criados pelo Implementer em helpers.ts
import {
  buildReentryPayload,
  buildBustPayload,
  shouldShowReentryModal,
  isReentryAtMax,
  accumulateReentryFields,
  pushToQueue,
  shiftQueue,
  currentQueueItem,
  type ReentryQueueState as QueueState,
} from '../../../client/src/components/grind-session-live/helpers';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
function makeTournament(overrides: Partial<any> = {}): any {
  return {
    id: 't-001',
    userId: 'USER-0001',
    sessionId: 'session-001',
    site: 'PokerStars',
    name: 'Re-Entry Masters $22',
    buyIn: '22.00',
    rebuys: 0,
    reentries: 0,
    allowsAddOn: false,
    addOnCost: null,
    addOnTaken: false,
    allowsReentry: true,
    maxReentries: 3,
    status: 'registered',
    prize: '0',
    bounty: '0',
    position: null,
    endTime: null,
    ...overrides,
  };
}

// ===========================================================================
// shouldShowReentryModal - decisao de abrir modal pos GG
// ===========================================================================

describe('shouldShowReentryModal', () => {
  it('retorna true quando allowsReentry=true e reentries < maxReentries', () => {
    const t = makeTournament({
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
    });
    expect(shouldShowReentryModal(t)).toBe(true);
  });

  it('retorna true quando maxReentries=null (ilimitado)', () => {
    const t = makeTournament({
      allowsReentry: true,
      maxReentries: null,
      reentries: 10,
    });
    expect(shouldShowReentryModal(t)).toBe(true);
  });

  it('retorna false quando allowsReentry=false', () => {
    const t = makeTournament({ allowsReentry: false });
    expect(shouldShowReentryModal(t)).toBe(false);
  });

  it('retorna false quando reentries >= maxReentries (limite atingido)', () => {
    const t = makeTournament({
      allowsReentry: true,
      maxReentries: 3,
      reentries: 3,
    });
    expect(shouldShowReentryModal(t)).toBe(false);
  });

  it('retorna false quando maxReentries=0 (edge: ReA=true mas sem re-entries)', () => {
    const t = makeTournament({
      allowsReentry: true,
      maxReentries: 0,
      reentries: 0,
    });
    expect(shouldShowReentryModal(t)).toBe(false);
  });
});

// ===========================================================================
// isReentryAtMax - botao "Sim, re-entrar" disabled?
// ===========================================================================

describe('isReentryAtMax', () => {
  it('retorna true quando reentries == maxReentries', () => {
    const t = makeTournament({
      allowsReentry: true,
      maxReentries: 3,
      reentries: 3,
    });
    expect(isReentryAtMax(t)).toBe(true);
  });

  it('retorna false quando reentries < maxReentries', () => {
    const t = makeTournament({
      allowsReentry: true,
      maxReentries: 3,
      reentries: 2,
    });
    expect(isReentryAtMax(t)).toBe(false);
  });

  it('retorna false quando maxReentries=null (ilimitado)', () => {
    const t = makeTournament({
      allowsReentry: true,
      maxReentries: null,
      reentries: 100,
    });
    expect(isReentryAtMax(t)).toBe(false);
  });
});

// ===========================================================================
// buildReentryPayload - PUT body para re-entrar
// ===========================================================================

describe('buildReentryPayload', () => {
  it('incrementa reentries em 1 e seta status=registered', () => {
    const t = makeTournament({ reentries: 0, status: 'finished' });
    const payload = buildReentryPayload(t);
    expect(payload.id).toBe(t.id);
    expect(payload.data.reentries).toBe(1);
    expect(payload.data.status).toBe('registered');
  });

  it('seta endTime=null para limpar tentativa anterior', () => {
    const t = makeTournament({
      reentries: 0,
      status: 'finished',
      endTime: '2026-04-23T20:00:00Z',
    });
    const payload = buildReentryPayload(t);
    expect(payload.data.endTime).toBeNull();
  });

  it('NAO envia prize/bounty/position (frontend v1 nao envia)', () => {
    const t = makeTournament({
      reentries: 0,
      status: 'finished',
      prize: '10',
      bounty: '2',
      position: 42,
    });
    const payload = buildReentryPayload(t);
    expect(payload.data.prize).toBeUndefined();
    expect(payload.data.bounty).toBeUndefined();
    expect(payload.data.position).toBeUndefined();
  });

  it('incrementa de 2 para 3 corretamente', () => {
    const t = makeTournament({
      reentries: 2,
      maxReentries: 5,
      status: 'finished',
    });
    const payload = buildReentryPayload(t);
    expect(payload.data.reentries).toBe(3);
  });
});

// ===========================================================================
// buildBustPayload - "Nao, GG definitivo" no modal
// ===========================================================================

describe('buildBustPayload (applyFinishWithRegistrationData)', () => {
  it('seta status=finished sem mexer em reentries', () => {
    const t = makeTournament({ reentries: 0, status: 'registered' });
    const payload = buildBustPayload(t);
    expect(payload.data.status).toBe('finished');
    expect(payload.data.reentries).toBeUndefined();
  });

  it('aplica prize/bounty/position do registrationData quando fornecido', () => {
    const t = makeTournament({ status: 'registered' });
    const regData = { prize: '100', bounty: '25', position: '3' };
    const payload = buildBustPayload(t, regData);
    expect(parseFloat(payload.data.result ?? payload.data.prize)).toBe(100);
    expect(parseFloat(payload.data.bounty)).toBe(25);
    expect(payload.data.position).toBe(3);
  });

  it('zera result/bounty/position quando registrationData vazio', () => {
    const t = makeTournament({ status: 'registered' });
    const payload = buildBustPayload(t, {});
    // implementer decide: result='0' e position=null
    expect(parseFloat(payload.data.result ?? '0')).toBe(0);
    expect(payload.data.position ?? null).toBeNull();
  });
});

// ===========================================================================
// accumulateReentryFields (RD-1 backend)
// ===========================================================================

describe('accumulateReentryFields - decisao C (RD-1)', () => {
  it('soma prize de tentativa anterior com nova', () => {
    const r = accumulateReentryFields(
      { prize: '10', bounty: '2', position: 42 },
      { prize: '50', bounty: '5' }
    );
    expect(parseFloat(r.prize)).toBe(60);
    expect(parseFloat(r.bounty)).toBe(7);
  });

  it('escolhe melhor position (min) quando ambos existem', () => {
    const r = accumulateReentryFields(
      { prize: '0', bounty: '0', position: 42 },
      { position: 3 }
    );
    expect(r.position).toBe(3);
  });

  it('preserva position existente quando novo e null', () => {
    const r = accumulateReentryFields(
      { prize: '0', bounty: '0', position: 42 },
      { position: null }
    );
    expect(r.position).toBe(42);
  });

  it('usa novo quando existing e null', () => {
    const r = accumulateReentryFields(
      { prize: '0', bounty: '0', position: null },
      { position: 58 }
    );
    expect(r.position).toBe(58);
  });

  it('ambos null resultam em null', () => {
    const r = accumulateReentryFields(
      { prize: '0', bounty: '0', position: null },
      { position: null }
    );
    expect(r.position).toBeNull();
  });

  it('nenhum prize novo preserva existing (v1 frontend nao envia)', () => {
    const r = accumulateReentryFields(
      { prize: '10', bounty: '2', position: 42 },
      {}
    );
    expect(parseFloat(r.prize)).toBe(10);
    expect(parseFloat(r.bounty)).toBe(2);
    expect(r.position).toBe(42);
  });

  it('acumulacao preserva posicao 3 ao longo de 3 re-entries (melhor de todas)', () => {
    let acc = { prize: '0', bounty: '0', position: null as number | null };
    acc = accumulateReentryFields(acc, { position: 42 });
    expect(acc.position).toBe(42);
    acc = accumulateReentryFields(acc, { position: 3 });
    expect(acc.position).toBe(3);
    acc = accumulateReentryFields(acc, { position: 58 });
    expect(acc.position).toBe(3);
  });
});

// ===========================================================================
// Fila de modais (RD-2 FIFO)
// ===========================================================================

describe('reentryQueue - fila FIFO multi-tabling', () => {
  it('queue vazia: currentQueueItem retorna null', () => {
    const q = { items: [] };
    expect(currentQueueItem(q)).toBeNull();
  });

  it('push: adiciona ao fim da fila', () => {
    const q = { items: [] };
    const t1 = makeTournament({ id: 't-A' });
    const q1 = pushToQueue(q, t1);
    expect(q1.items.length).toBe(1);
    expect(q1.items[0].id).toBe('t-A');
  });

  it('3 pushes seguidos preservam ordem FIFO', () => {
    let q: QueueState = { items: [] };
    q = pushToQueue(q, makeTournament({ id: 'A' }));
    q = pushToQueue(q, makeTournament({ id: 'B' }));
    q = pushToQueue(q, makeTournament({ id: 'C' }));
    expect(q.items.map((t) => t.id)).toEqual(['A', 'B', 'C']);
    expect(currentQueueItem(q).id).toBe('A');
  });

  it('shift: remove primeiro e avanca fila', () => {
    let q: QueueState = { items: [] };
    q = pushToQueue(q, makeTournament({ id: 'A' }));
    q = pushToQueue(q, makeTournament({ id: 'B' }));
    q = shiftQueue(q);
    expect(q.items.map((t) => t.id)).toEqual(['B']);
    expect(currentQueueItem(q).id).toBe('B');
  });

  it('shift em fila vazia nao quebra', () => {
    const q = { items: [] };
    const result = shiftQueue(q);
    expect(result.items.length).toBe(0);
  });

  it('cenario multi-tabling: 3 GGs simultaneos -> 3 modais sequenciais', () => {
    let q: QueueState = { items: [] };
    // 3 GGs em sequencia
    q = pushToQueue(q, makeTournament({ id: 'A' }));
    q = pushToQueue(q, makeTournament({ id: 'B' }));
    q = pushToQueue(q, makeTournament({ id: 'C' }));
    expect(currentQueueItem(q).id).toBe('A');
    // Usuario responde A
    q = shiftQueue(q);
    expect(currentQueueItem(q).id).toBe('B');
    // Usuario responde B
    q = shiftQueue(q);
    expect(currentQueueItem(q).id).toBe('C');
    // Usuario responde C
    q = shiftQueue(q);
    expect(currentQueueItem(q)).toBeNull();
  });

  it('push preserva snapshot do torneio (nao referencia mutavel)', () => {
    const t = makeTournament({ id: 'A', reentries: 0 });
    let q: QueueState = { items: [] };
    q = pushToQueue(q, t);
    // mutate externo
    t.reentries = 5;
    // queue deve ter snapshot, nao referencia
    expect(q.items[0].reentries).toBe(0);
  });
});

// ===========================================================================
// KPI "Entradas Totais" (Spec 3 §4.3)
// ===========================================================================

describe('totalEntries no SessionStats', () => {
  function makeT(overrides: any) {
    return {
      id: 't-' + Math.random().toString(36).slice(2, 8),
      sessionId: 'session-001',
      userId: 'USER-0001',
      site: 'PokerStars',
      buyIn: '22.00',
      rebuys: 0,
      reentries: 0,
      status: 'finished',
      result: '0',
      prize: '0',
      bounty: '0',
      ...overrides,
    };
  }

  it('totalEntries = volume quando todos os torneios tem reentries=0', () => {
    const tournaments = [
      makeT({ reentries: 0 }),
      makeT({ reentries: 0 }),
      makeT({ reentries: 0 }),
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null);
    expect((stats as any).totalEntries).toBe(3);
  });

  it('totalEntries = volume + sum(reentries)', () => {
    const tournaments = [
      makeT({ reentries: 2, allowsReentry: true }),
      makeT({ reentries: 1, allowsReentry: true }),
      makeT({ reentries: 0 }),
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null);
    // volume = 3, reentries totais = 3, total entries = 6
    expect((stats as any).totalEntries).toBe(6);
  });

  it('totalEntries >= volume sempre (sanity check)', () => {
    const tournaments = [
      makeT({ reentries: 5, allowsReentry: true }),
      makeT({ reentries: 0 }),
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null);
    expect((stats as any).totalEntries).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// Fluxo de GG em torneio nao-ReA (regressao: sem modal)
// ===========================================================================

describe('GG em torneio nao-ReA - regressao', () => {
  it('shouldShowReentryModal retorna false para torneio regular', () => {
    const t = makeTournament({
      name: 'Super Tuesday',
      allowsReentry: false,
      maxReentries: null,
    });
    expect(shouldShowReentryModal(t)).toBe(false);
  });

  it('buildBustPayload funciona igual para torneio regular', () => {
    const t = makeTournament({
      allowsReentry: false,
      status: 'registered',
    });
    const payload = buildBustPayload(t, { prize: '100' });
    expect(payload.data.status).toBe('finished');
  });
});

// ===========================================================================
// Fluxo de re-entry preservando Plus (Spec 2 + 3 crossover)
// ===========================================================================

describe('Re-entry + Add-on crossover (Spec 3 §7 caso 2)', () => {
  it('re-entry preserva addOnTaken=true (v1: add-on e flag unica por torneio)', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: true,
    });
    const payload = buildReentryPayload(t);
    // payload nao inclui addOnTaken (PUT parcial), valor no DB preservado
    expect(payload.data.addOnTaken).toBeUndefined();
  });

  it('calculateSessionStats soma add-on apenas uma vez mesmo com reentries=2', () => {
    const tournaments = [
      {
        id: 't-001',
        sessionId: 's',
        userId: 'USER-0001',
        site: 'PokerStars',
        buyIn: '5.50',
        rebuys: 0,
        reentries: 2,
        allowsReentry: true,
        allowsAddOn: true,
        addOnCost: '5.50',
        addOnTaken: true, // pago 1x so
        status: 'finished',
        result: '0',
        prize: '0',
        bounty: '0',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null);
    // 5.50 * (1+0+2) + 5.50 = 22 (nao 22 + 5.50*2)
    expect(stats.totalInvestido).toBeCloseTo(22, 2);
  });
});

// ===========================================================================
// Rebuy continua independente de re-entry (Spec 3 §7 caso 1)
// ===========================================================================

describe('Rebuy vs Re-entry - independencia', () => {
  it('REBUY em torneio ReA nao toca em reentries', () => {
    const tournaments = [
      {
        id: 't-001',
        sessionId: 's',
        userId: 'USER-0001',
        site: 'PokerStars',
        buyIn: '22.00',
        rebuys: 2,
        reentries: 1,
        allowsReentry: true,
        status: 'finished',
        result: '0',
        prize: '0',
        bounty: '0',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null);
    // 22 * (1+2+1) = 88
    expect(stats.totalInvestido).toBeCloseTo(88, 2);
  });
});
