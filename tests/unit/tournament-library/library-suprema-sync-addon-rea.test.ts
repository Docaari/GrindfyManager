import { describe, it, expect } from 'vitest';
import { processSupremaSync } from '../../../shared/library-suprema-sync';

// =============================================================================
// Testes TDD: Suprema sync deve popular flags Plus/ReA (Spec 1 §4.5)
//
// A API da Suprema pode trazer "reentry: true/false" como flag explicita.
// O implementer deve:
//   - Mapear campo reentry da Suprema -> allowsReentry na library
//   - Usar regex no nome para detectar Plus (Suprema nao tem flag explicita)
//   - Preservar source='suprema' e externalId
//
// Dedup por externalId continua funcionando.
//
// Modo: TDD - processSupremaSync atual NAO retorna allowsAddOn/allowsReentry.
// =============================================================================

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

interface SupremaTournament {
  id: number;
  name: string;
  buyin: number;
  guaranteed: number;
  date: string;
  isKO: number;
  temponivelmMeta: number;
  [key: string]: any;
}

function makeSupremaTournament(overrides: Partial<SupremaTournament> = {}): SupremaTournament {
  return {
    id: 12345,
    liga: 106,
    ligaName: 'Suprema Poker',
    name: 'Daily $22',
    date: '2026-03-21 19:30:00',
    guaranteed: 50000,
    buyin: 22,
    late: 60,
    status: 'scheduled',
    tournament: 99001,
    moneyPrefix: 'R$',
    stack: 10000,
    temponivelmMeta: 12,
    type: 'NLH',
    maxPl: 500,
    isKO: 1,
    ...overrides,
  };
}

// ===========================================================================
// Deteccao de Plus (regex no nome, porque Suprema nao tem flag explicita)
// ===========================================================================

describe('processSupremaSync - deteccao de Plus no nome', () => {
  it('deve setar allowsAddOn=true quando nome Suprema contem "Plus"', () => {
    const suprema = [
      makeSupremaTournament({ id: 1, name: 'Big Sunday Plus $22' }),
    ];
    const result = processSupremaSync(suprema, []);
    expect(result).toHaveLength(1);
    expect((result[0] as any).allowsAddOn).toBe(true);
  });

  it('deve setar addOnCost=buyIn como default quando Plus detectado', () => {
    const suprema = [
      makeSupremaTournament({ id: 1, name: 'Plus Championship $55', buyin: 55 }),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsAddOn).toBe(true);
    const addOnCost = (result[0] as any).addOnCost;
    expect(addOnCost).not.toBeNull();
    // Default = buyIn (pode estar como string ou number)
    expect(parseFloat(String(addOnCost))).toBe(55);
  });

  it('deve setar allowsAddOn=false quando nome NAO contem Plus', () => {
    const suprema = [makeSupremaTournament({ id: 1, name: 'Daily $22' })];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
  });

  it('NAO deve detectar Plus em "Surplus" (falso positivo)', () => {
    const suprema = [
      makeSupremaTournament({ id: 1, name: 'Surplus Sunday $22' }),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
  });

  it('NAO deve detectar Plus em "APlusArena" (colado)', () => {
    const suprema = [
      makeSupremaTournament({ id: 1, name: 'APlusArena Sunday $22' }),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
  });
});

// ===========================================================================
// Deteccao de ReA - via flag reentry da API OU regex no nome
// ===========================================================================

describe('processSupremaSync - deteccao de Re-Entry', () => {
  it('deve setar allowsReentry=true quando API Suprema envia reentry=true', () => {
    const suprema = [
      makeSupremaTournament({
        id: 1,
        name: 'Sunday Grind $55',
        reentry: true,
      } as any),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('deve setar allowsReentry=false quando API Suprema envia reentry=false', () => {
    const suprema = [
      makeSupremaTournament({
        id: 1,
        name: 'Sunday Grind $55',
        reentry: false,
      } as any),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsReentry ?? false).toBe(false);
  });

  it('fallback: deve detectar via nome quando API nao envia flag', () => {
    const suprema = [
      makeSupremaTournament({
        id: 1,
        name: 'Re-Entry Masters $22',
        // sem campo reentry
      }),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('fallback: nome com "ReA" dispara deteccao', () => {
    const suprema = [
      makeSupremaTournament({ id: 1, name: 'Bounty Builder ReA $55' }),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('precedencia: API reentry=true prevalece mesmo se nome nao casar', () => {
    const suprema = [
      makeSupremaTournament({
        id: 1,
        name: 'Daily $22', // sem pattern no nome
        reentry: true,
      } as any),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('NAO deve detectar ReA em "Really Good" (falso positivo)', () => {
    const suprema = [
      makeSupremaTournament({ id: 1, name: 'Really Good Saturday $22' }),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsReentry ?? false).toBe(false);
  });
});

// ===========================================================================
// Mapeamento de maxReentries
// ===========================================================================

describe('processSupremaSync - maxReentries', () => {
  it('deve mapear maxReentries da API quando fornecido', () => {
    const suprema = [
      makeSupremaTournament({
        id: 1,
        name: 'Daily $22',
        reentry: true,
        maxReentries: 3,
      } as any),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).maxReentries).toBe(3);
  });

  it('deve setar maxReentries=null quando API nao fornece (ilimitado)', () => {
    const suprema = [
      makeSupremaTournament({ id: 1, name: 'Re-Entry Masters', reentry: true } as any),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).maxReentries ?? null).toBeNull();
  });
});

// ===========================================================================
// Dedup respeita novos campos (externalId ainda governa)
// ===========================================================================

describe('processSupremaSync - dedup preserva externalId', () => {
  it('dedup por externalId continua funcionando mesmo com flags novas', () => {
    const suprema = [
      makeSupremaTournament({ id: 1, name: 'Plus $22' }),
    ];
    const existing = [
      {
        id: 'lib-001',
        name: 'Plus $22',
        site: 'Suprema',
        buyIn: '22.00',
        externalId: 'suprema-1',
        deletedAt: null,
        userId: 'USER-0001',
      },
    ];
    const result = processSupremaSync(suprema, existing);
    expect(result).toHaveLength(0); // ja existe, nao importa de novo
  });

  it('novos torneios (externalId diferente) sao importados com flags', () => {
    const suprema = [
      makeSupremaTournament({ id: 2, name: 'Plus Sunday $22' }),
    ];
    const existing = [
      {
        id: 'lib-001',
        name: 'Other',
        site: 'Suprema',
        buyIn: '22.00',
        externalId: 'suprema-1',
        deletedAt: null,
        userId: 'USER-0001',
      },
    ];
    const result = processSupremaSync(suprema, existing);
    expect(result).toHaveLength(1);
    expect((result[0] as any).allowsAddOn).toBe(true);
  });
});

// ===========================================================================
// Combinacoes
// ===========================================================================

describe('processSupremaSync - combinacoes Plus + ReA', () => {
  it('nome com Plus + reentry=true -> ambas flags setadas', () => {
    const suprema = [
      makeSupremaTournament({
        id: 1,
        name: 'Plus Sunday $22',
        reentry: true,
      } as any),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsAddOn).toBe(true);
    expect((result[0] as any).allowsReentry).toBe(true);
  });

  it('torneio PKO + Plus: allowsAddOn=true e type=PKO', () => {
    const suprema = [
      makeSupremaTournament({
        id: 1,
        name: 'PKO Plus $22',
        isKO: 1,
      }),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsAddOn).toBe(true);
    expect(result[0].type).toBe('PKO');
  });

  it('torneio sem Plus nem ReA: flags default false/null', () => {
    const suprema = [
      makeSupremaTournament({ id: 1, name: 'Daily $22', isKO: 0 }),
    ];
    const result = processSupremaSync(suprema, []);
    expect((result[0] as any).allowsAddOn ?? false).toBe(false);
    expect((result[0] as any).allowsReentry ?? false).toBe(false);
  });
});
