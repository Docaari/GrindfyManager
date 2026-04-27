import { describe, it, expect } from 'vitest';
import { insertSessionTournamentSchema } from '../../../shared/schema';
import {
  calculateSessionStats,
} from '../../../client/src/components/grind-session-live/calculateSessionStats';

// =============================================================================
// Testes TDD: Add-on UX (Spec 2)
//
// Foco: logica de UI pura do botao ADD-ON no TournamentCard e handlers.
// Sem React Testing Library (projeto ainda nao configura RTL).
// Testamos os helpers puros, payload de mutation, estado do botao.
//
// Arquivos-alvo:
//   - client/src/components/grind-session-live/helpers.ts
//     (formatAddOnCost e buildAddOnMutationPayload - a criar)
//   - client/src/components/grind-session-live/TournamentCard.tsx
//     (estado do botao - pure logic via derive function)
//
// Modo: TDD - helpers nao existem.
// =============================================================================

// Helpers criados pelo Implementer em helpers.ts
import {
  formatAddOnCost,
  buildAddOnMutationPayload,
  getAddOnButtonState,
  countAddOnsPaid,
  resolveAddonReaPayload,
} from '../../../client/src/components/grind-session-live/helpers';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
function makeTournament(overrides: Partial<any> = {}): any {
  return {
    id: 't-001',
    userId: 'USER-0001',
    sessionId: 'session-001',
    site: 'PokerStars',
    name: 'Big $22',
    buyIn: '22.00',
    rebuys: 0,
    allowsAddOn: false,
    addOnCost: null,
    addOnTaken: false,
    status: 'registered',
    ...overrides,
  };
}

// ===========================================================================
// formatAddOnCost helper
// ===========================================================================

describe('formatAddOnCost helper', () => {
  it('deve retornar addOnCost sem decimais quando .00', () => {
    const t = makeTournament({ addOnCost: '22.00' });
    expect(formatAddOnCost(t)).toBe('22');
  });

  it('deve preservar decimais quando nao zero', () => {
    const t = makeTournament({ addOnCost: '22.50' });
    expect(formatAddOnCost(t)).toBe('22.50');
  });

  it('deve usar buyIn como fallback quando addOnCost=null', () => {
    const t = makeTournament({ addOnCost: null, buyIn: '11.00' });
    expect(formatAddOnCost(t)).toBe('11');
  });

  it('deve retornar "0" quando nem addOnCost nem buyIn existem', () => {
    const t = makeTournament({ addOnCost: null, buyIn: null });
    expect(formatAddOnCost(t)).toBe('0');
  });

  it('deve aceitar addOnCost como number', () => {
    const t = makeTournament({ addOnCost: 33 });
    expect(formatAddOnCost(t)).toBe('33');
  });
});

// ===========================================================================
// buildAddOnMutationPayload - shape do request PUT
// ===========================================================================

describe('buildAddOnMutationPayload', () => {
  it('deve construir payload com addOnTaken=true quando value=true', () => {
    const payload = buildAddOnMutationPayload('t-001', true);
    expect(payload.id).toBe('t-001');
    expect(payload.data.addOnTaken).toBe(true);
  });

  it('deve construir payload com addOnTaken=false quando value=false (desfazer)', () => {
    const payload = buildAddOnMutationPayload('t-001', false);
    expect(payload.data.addOnTaken).toBe(false);
  });

  it('deve preservar addOnCost se enviado', () => {
    const payload = buildAddOnMutationPayload('t-001', true, '15.50');
    expect(payload.data.addOnCost).toBe('15.50');
  });

  it('NAO deve incluir addOnCost quando undefined', () => {
    const payload = buildAddOnMutationPayload('t-001', true);
    expect(payload.data.addOnCost).toBeUndefined();
  });
});

// ===========================================================================
// Estado do botao ADD-ON (visibility, disabled, variant, label)
// ===========================================================================

describe('getAddOnButtonState - card RegisteredCard', () => {
  it('nao renderiza botao quando allowsAddOn=false', () => {
    const t = makeTournament({ allowsAddOn: false, status: 'registered' });
    const state = getAddOnButtonState(t, false);
    expect(state.visible).toBe(false);
  });

  it('renderiza botao verde "+ Add-on" quando allowsAddOn=true e addOnTaken=false', () => {
    const t = makeTournament({
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: false,
      status: 'registered',
    });
    const state = getAddOnButtonState(t, false);
    expect(state.visible).toBe(true);
    expect(state.variant).toBe('default');
    expect(state.label).toMatch(/add-on/i);
  });

  it('renderiza botao dourado "Add-on $X pago" quando addOnTaken=true', () => {
    const t = makeTournament({
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: true,
      status: 'registered',
    });
    const state = getAddOnButtonState(t, false);
    expect(state.visible).toBe(true);
    expect(state.variant).toBe('paid');
    expect(state.label).toMatch(/pago/i);
    expect(state.label).toContain('22');
  });

  it('botao disabled quando mutation em flight (isPending=true)', () => {
    const t = makeTournament({
      allowsAddOn: true,
      addOnCost: '22.00',
      status: 'registered',
    });
    const state = getAddOnButtonState(t, true);
    expect(state.disabled).toBe(true);
  });

  it('botao enabled quando isPending=false', () => {
    const t = makeTournament({
      allowsAddOn: true,
      addOnCost: '22.00',
      status: 'registered',
    });
    const state = getAddOnButtonState(t, false);
    expect(state.disabled).toBe(false);
  });

  it('botao NAO renderiza quando status=upcoming', () => {
    const t = makeTournament({
      allowsAddOn: true,
      addOnCost: '22.00',
      status: 'upcoming',
    });
    const state = getAddOnButtonState(t, false);
    expect(state.visible).toBe(false);
  });

  it('botao NAO renderiza quando status=finished', () => {
    const t = makeTournament({
      allowsAddOn: true,
      addOnCost: '22.00',
      status: 'finished',
    });
    const state = getAddOnButtonState(t, false);
    expect(state.visible).toBe(false);
  });

  // Invariante I1 (ADR-014, fix 2026-04-27): addOnCost null/0 nao deve
  // permitir botao mesmo com allowsAddOn=true. Antes do fix, getAddOnButtonState
  // divergia de canAddOn em state-machine.ts e mostrava botao com cost null,
  // gerando POST com addOnCost undefined que server rejeitava.
  it('botao NAO renderiza quando allowsAddOn=true mas addOnCost=null', () => {
    const t = makeTournament({
      allowsAddOn: true,
      addOnCost: null,
      status: 'registered',
    });
    const state = getAddOnButtonState(t, false);
    expect(state.visible).toBe(false);
  });

  it('botao NAO renderiza quando addOnCost=0 (string)', () => {
    const t = makeTournament({
      allowsAddOn: true,
      addOnCost: '0',
      status: 'registered',
    });
    const state = getAddOnButtonState(t, false);
    expect(state.visible).toBe(false);
  });

  it('botao NAO renderiza quando addOnCost vazio', () => {
    const t = makeTournament({
      allowsAddOn: true,
      addOnCost: '',
      status: 'registered',
    });
    const state = getAddOnButtonState(t, false);
    expect(state.visible).toBe(false);
  });
});

// ===========================================================================
// KPI "Add-ons Pagos" no SessionDashboard
// ===========================================================================

describe('countAddOnsPaid - KPI SessionDashboard', () => {
  it('retorna 0 quando sessao vazia', () => {
    const result = countAddOnsPaid([]);
    expect(result.count).toBe(0);
    expect(result.total).toBe(0);
  });

  it('retorna 0 quando nenhum torneio tem addOnTaken=true', () => {
    const tournaments = [
      makeTournament({ allowsAddOn: true, addOnTaken: false }),
      makeTournament({ allowsAddOn: false }),
    ];
    const result = countAddOnsPaid(tournaments);
    expect(result.count).toBe(0);
    expect(result.total).toBe(0);
  });

  it('conta apenas torneios com addOnTaken=true', () => {
    const tournaments = [
      makeTournament({
        allowsAddOn: true,
        addOnCost: '22.00',
        addOnTaken: true,
      }),
      makeTournament({
        allowsAddOn: true,
        addOnCost: '10.00',
        addOnTaken: false,
      }),
      makeTournament({
        allowsAddOn: true,
        addOnCost: '55.00',
        addOnTaken: true,
      }),
    ];
    const result = countAddOnsPaid(tournaments);
    expect(result.count).toBe(2);
    expect(result.total).toBeCloseTo(77, 2);
  });

  it('soma corretamente addOnCost string e number', () => {
    const tournaments = [
      makeTournament({ addOnCost: '22.50', addOnTaken: true, allowsAddOn: true }),
      makeTournament({ addOnCost: 11, addOnTaken: true, allowsAddOn: true }),
    ];
    const result = countAddOnsPaid(tournaments);
    expect(result.total).toBeCloseTo(33.5, 2);
  });

  it('trata addOnCost=null com addOnTaken=true como 0 (defensivo)', () => {
    const tournaments = [
      makeTournament({ addOnCost: null, addOnTaken: true, allowsAddOn: true }),
    ];
    const result = countAddOnsPaid(tournaments);
    expect(result.count).toBe(1);
    expect(result.total).toBe(0);
  });
});

// ===========================================================================
// AddTournamentDialog: payload com flags quando checkbox marcado
// ===========================================================================

describe('AddTournamentDialog - submit payload', () => {
  // Aqui simulamos o shape do formulario sendo submetido.
  // O dialog propriamente dito e um componente React - teste via schema Zod
  // garante que o payload que o dialog monta e aceito pelo backend.

  it('payload com allowsAddOn=true e addOnCost default=buyIn deve passar Zod', () => {
    const payload = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsAddOn: true,
      addOnCost: '22.00', // pre-populado com buyIn
    };
    const result = insertSessionTournamentSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('payload com allowsAddOn=false omite addOnCost no DB', () => {
    const payload = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsAddOn: false,
    };
    const result = insertSessionTournamentSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// resolveAddonReaPayload — fix B1+B2 (2026-04-27)
//
// Garante que addTournamentMutation no Live page nao perca flags addon/reentry
// quando user passa pelo modal "Adicionar Torneio". Espelha autodetect
// server-side em grade-planner.ts.
// ===========================================================================

describe('resolveAddonReaPayload - autodetect Plus/ReA pelo nome', () => {
  it('nome "Plus" sem flags explicitas -> allowsAddOn=true, addOnCost=buyIn', () => {
    const out = resolveAddonReaPayload({ name: 'Sunday Plus', buyIn: '15' });
    expect(out.allowsAddOn).toBe(true);
    expect(out.addOnCost).toBe('15');
    expect(out.allowsReentry).toBe(false);
  });

  it('nome "Re-Entry" sem flags explicitas -> allowsReentry=true', () => {
    const out = resolveAddonReaPayload({ name: 'Big Re-Entry $100', buyIn: '100' });
    expect(out.allowsReentry).toBe(true);
    expect(out.allowsAddOn).toBe(false);
  });

  it('user explicit allowsAddOn=true overrides regex (mesmo nome neutro)', () => {
    const out = resolveAddonReaPayload({
      name: 'Daily $5', buyIn: '5', allowsAddOn: true, addOnCost: '3',
    });
    expect(out.allowsAddOn).toBe(true);
    expect(out.addOnCost).toBe('3');
  });

  it('user explicit allowsAddOn=false respeitado mesmo se nome bate regex', () => {
    const out = resolveAddonReaPayload({
      name: 'Sunday Plus Freeroll', buyIn: '0', allowsAddOn: false,
    });
    expect(out.allowsAddOn).toBe(false);
    expect(out.addOnCost).toBe(null);
  });

  it('allowsAddOn=true sem cost explicito + sem buyIn -> addOnCost=null', () => {
    const out = resolveAddonReaPayload({ name: 'Plus', allowsAddOn: true });
    expect(out.allowsAddOn).toBe(true);
    expect(out.addOnCost).toBe(null);
  });

  it('allowsAddOn=false forca addOnCost=null mesmo se cost foi enviado', () => {
    const out = resolveAddonReaPayload({
      name: 'Daily', buyIn: '10', allowsAddOn: false, addOnCost: '10',
    });
    expect(out.addOnCost).toBe(null);
  });

  it('nome vazio + site/type -> compoe nome para detector', () => {
    const out = resolveAddonReaPayload({
      name: '', site: 'Suprema', type: 'Plus', buyIn: '15',
    });
    expect(out.allowsAddOn).toBe(true);
    expect(out.addOnCost).toBe('15');
  });

  it('cost explicito nao-numerico cai pra buyIn', () => {
    const out = resolveAddonReaPayload({
      name: 'Plus', buyIn: '15', allowsAddOn: true, addOnCost: '',
    });
    expect(out.addOnCost).toBe('15');
  });

  it('maxReentries propagado quando fornecido', () => {
    const out = resolveAddonReaPayload({
      name: 'Re-Entry', buyIn: '20', allowsReentry: true, maxReentries: 3,
    });
    expect(out.maxReentries).toBe(3);
  });

  it('maxReentries=null quando nao fornecido', () => {
    const out = resolveAddonReaPayload({
      name: 'Re-Entry', buyIn: '20', allowsReentry: true,
    });
    expect(out.maxReentries).toBe(null);
  });

  // Regressao do bug do founder (2026-04-27): torneio "Plus" Suprema
  // adicionado manualmente pelo Live nao ganhava flag no DB.
  it('regressao bug founder: Plus Suprema R$15 manual -> flags propagadas', () => {
    const out = resolveAddonReaPayload({
      name: 'Plus',
      site: 'Suprema',
      type: 'Vanilla',
      buyIn: '15',
    });
    expect(out.allowsAddOn).toBe(true);
    expect(out.addOnCost).toBe('15');
  });
});

// ===========================================================================
// Edge cases Spec 2 §7
// ===========================================================================

describe('Add-on UX - edge cases Spec 2', () => {
  it('caso 6 Spec 2: addOnTaken + reentries=2, buyIn=5.50 -> investimento=22.00', () => {
    const tournaments = [
      {
        id: 't-001',
        sessionId: 's-001',
        userId: 'USER-0001',
        site: 'PokerStars',
        buyIn: '5.50',
        rebuys: 0,
        reentries: 2,
        allowsAddOn: true,
        addOnCost: '5.50',
        addOnTaken: true,
        allowsReentry: true,
        maxReentries: 3,
        result: '0',
        prize: '0',
        bounty: '0',
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null);
    // 5.50 * (1+0+2) + 5.50 = 22
    expect(stats.totalInvestido).toBeCloseTo(22, 2);
  });

  it('caso 1 Spec 2: addOnCost=null, usuario clica -> fallback buyIn 0 no calculo', () => {
    const tournaments = [
      {
        id: 't-001',
        sessionId: 's-001',
        userId: 'USER-0001',
        site: 'PokerStars',
        buyIn: '22.00',
        rebuys: 0,
        reentries: 0,
        allowsAddOn: true,
        addOnCost: null,
        addOnTaken: true, // forcado via backend permissivo ou legado
        result: '0',
        status: 'finished',
      },
    ];
    const stats = calculateSessionStats(tournaments, [], {}, null);
    // addOnCost null parseia em 0, entao investimento = 22
    expect(stats.totalInvestido).toBeCloseTo(22, 2);
  });
});
