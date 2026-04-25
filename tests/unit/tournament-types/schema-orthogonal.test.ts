import { describe, it, expect } from 'vitest';
import {
  insertTournamentSchema,
  insertPlannedTournamentSchema,
} from '../../../shared/schema';

// =============================================================================
// Testes TDD - Sprint 1 - Refinements Ortogonais
// Fonte: Docs/specs/tournament-types-extension-and-manual-add-fix.md
//        ADR-031 (modelo ortogonal type + isFlight + isLive)
//        Schema delta RF-03 (campos novos satellite*, flight*, package*).
//
// Estes testes verificam que os refinements Zod cobrem corretamente:
//   - Type primario mutex (4 valores).
//   - Campos satellite* SO quando type=Satellite.
//   - Campos flight*    SO quando isFlight=true.
//   - Campos package*   SO quando isLive=true.
//   - flightDay regex valida + obrigatorio quando isFlight=true.
//   - satelliteRewardType enum (4 valores).
//   - Refinements existentes (add-on/re-entry) NAO regridem.
//
// Schema atual (shared/schema.ts) ainda nao tem esses campos nem refinements.
// Todos os testes devem FALHAR ate que o implementer adicione campos +
// superRefine.
// =============================================================================

// ---------------------------------------------------------------------------
// Fixture base de tournament valido (instancia / historico)
// ---------------------------------------------------------------------------

function makeValidTournament(overrides: any = {}) {
  return {
    userId: 'USER-0001',
    name: 'Daily $22 PKO',
    buyIn: '22.00',
    site: 'PokerStars',
    format: 'MTT',
    speed: 'Normal',
    datePlayed: new Date('2026-04-25T19:00:00Z'),
    type: 'Vanilla',
    category: 'Vanilla',
    isFlight: false,
    isLive: false,
    ...overrides,
  };
}

function makeValidPlanned(overrides: any = {}) {
  return {
    userId: 'USER-0001',
    dayOfWeek: 1,
    profile: 'A',
    site: 'PokerStars',
    time: '19:00',
    type: 'Vanilla',
    speed: 'Normal',
    name: 'Daily $22',
    buyIn: '22.00',
    isFlight: false,
    isLive: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Type primario - enum estrito (RF-02 / D14)
// ---------------------------------------------------------------------------

describe('insertTournamentSchema - type enum estrito', () => {
  it('aceita type=Vanilla', () => {
    const r = insertTournamentSchema.safeParse(makeValidTournament({ type: 'Vanilla' }));
    expect(r.success).toBe(true);
  });

  it('aceita type=PKO', () => {
    const r = insertTournamentSchema.safeParse(makeValidTournament({ type: 'PKO' }));
    expect(r.success).toBe(true);
  });

  it('aceita type=Mystery', () => {
    const r = insertTournamentSchema.safeParse(makeValidTournament({ type: 'Mystery' }));
    expect(r.success).toBe(true);
  });

  it('aceita type=Satellite (com fields satellite minimos)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'Satellite',
        satelliteRewardType: 'cash',
        prize: '0',
        satelliteTargetName: 'WSOP Main',
      })
    );
    expect(r.success).toBe(true);
  });

  it('rejeita type=Flight (Flight virou modificador)', () => {
    const r = insertTournamentSchema.safeParse(makeValidTournament({ type: 'Flight' }));
    expect(r.success).toBe(false);
  });

  it('rejeita type=Live', () => {
    const r = insertTournamentSchema.safeParse(makeValidTournament({ type: 'Live' }));
    expect(r.success).toBe(false);
  });

  it('rejeita type=InvalidType', () => {
    const r = insertTournamentSchema.safeParse(makeValidTournament({ type: 'InvalidType' }));
    expect(r.success).toBe(false);
  });

  it('rejeita type=vanilla (case-sensitive)', () => {
    const r = insertTournamentSchema.safeParse(makeValidTournament({ type: 'vanilla' }));
    expect(r.success).toBe(false);
  });
});

describe('insertPlannedTournamentSchema - type enum estrito', () => {
  it('aceita type=Vanilla, PKO, Mystery, Satellite', () => {
    for (const t of ['Vanilla', 'PKO', 'Mystery', 'Satellite']) {
      const overrides: any = { type: t };
      if (t === 'Satellite') {
        overrides.satelliteRewardType = 'ticket';
        overrides.satelliteTicketValue = '109';
        overrides.satelliteTargetName = 'WSOP';
      }
      const r = insertPlannedTournamentSchema.safeParse(makeValidPlanned(overrides));
      expect(r.success).toBe(true);
    }
  });

  it('rejeita type=Flight', () => {
    const r = insertPlannedTournamentSchema.safeParse(makeValidPlanned({ type: 'Flight' }));
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Refinement: campos satellite* SO quando type=Satellite
// ---------------------------------------------------------------------------

describe('refinement satellite ortogonal', () => {
  it('rejeita type=Vanilla com satelliteTicketValue populado', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ type: 'Vanilla', satelliteTicketValue: '109' })
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('satelliteTicketValue'))).toBe(true);
    }
  });

  it('rejeita type=PKO com satelliteRewardType populado', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ type: 'PKO', satelliteRewardType: 'ticket' })
    );
    expect(r.success).toBe(false);
  });

  it('rejeita type=Mystery com satelliteTargetTemplateId populado', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ type: 'Mystery', satelliteTargetTemplateId: 'tpl_1' })
    );
    expect(r.success).toBe(false);
  });

  it('aceita type=Satellite com rewardType=ticket + ticket value + target', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'Satellite',
        satelliteRewardType: 'ticket',
        prize: '50',
        satelliteTicketValue: '109',
        satelliteTargetTemplateId: 'tpl_1',
      })
    );
    expect(r.success).toBe(true);
  });

  // Sprint 2 (RF-04 RELAXADO) - obsolescencia intencional dos 2 cases abaixo:
  // O refinement estrito que rejeitava Satellite sem rewardType / sem target
  // foi removido (founder original definiu "tudo opcional de registrar"; ROI
  // parcial enquanto target nao for adicionado). A nova expectativa "aceita
  // Satellite SEM rewardType / SEM target" e validada em
  // tests/unit/schema/satellite-refinement-relaxed.test.ts (Sprint 2).
  it.skip('rejeita type=Satellite SEM rewardType (Sprint 1; relaxado em Sprint 2)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ type: 'Satellite', satelliteTargetName: 'X' })
    );
    expect(r.success).toBe(false);
  });

  it.skip('rejeita type=Satellite sem target template AND sem target name (Sprint 1; relaxado em Sprint 2)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'Satellite',
        satelliteRewardType: 'cash',
        prize: '50',
        satelliteTargetTemplateId: null,
        satelliteTargetName: null,
      })
    );
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// satelliteRewardType - enum (4 valores)
// ---------------------------------------------------------------------------

describe('satelliteRewardType enum', () => {
  it('aceita ticket, package, cash, mixed', () => {
    for (const rt of ['ticket', 'package', 'cash', 'mixed'] as const) {
      const overrides: any = {
        type: 'Satellite',
        satelliteRewardType: rt,
        satelliteTargetName: 'X',
        prize: '0',
      };
      if (rt === 'ticket') overrides.satelliteTicketValue = '109';
      if (rt === 'package') {
        overrides.prize = '5000';
        overrides.packageBuyIn = '10000';
      }
      if (rt === 'mixed') {
        overrides.prize = '50';
        overrides.satelliteTicketValue = '109';
        overrides.satelliteExtraCash = '50';
      }
      const r = insertTournamentSchema.safeParse(makeValidTournament(overrides));
      expect(r.success).toBe(true);
    }
  });

  it('rejeita rewardType invalido', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'Satellite',
        satelliteRewardType: 'invalid_reward',
        satelliteTargetName: 'X',
      })
    );
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Refinement: campos flight* SO quando isFlight=true
// ---------------------------------------------------------------------------

describe('refinement flight ortogonal', () => {
  it('rejeita isFlight=false com flightDay populado', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ isFlight: false, flightDay: '1A' })
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('flightDay') || p.includes('flight'))).toBe(true);
    }
  });

  it('rejeita isFlight=false com flightAdvanced=true', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ isFlight: false, flightAdvanced: true })
    );
    expect(r.success).toBe(false);
  });

  it('rejeita isFlight=true SEM flightDay', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ isFlight: true })
    );
    expect(r.success).toBe(false);
  });

  it('aceita isFlight=true com Day 1A + advanced=true (prize=0)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'PKO',
        isFlight: true,
        flightDay: '1A',
        flightAdvanced: true,
        prize: '0',
        position: null,
      })
    );
    expect(r.success).toBe(true);
  });

  it('aceita isFlight=true com Day Final + position + prize', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'Vanilla',
        isFlight: true,
        flightDay: 'Final',
        position: 5,
        prize: '1500',
      })
    );
    expect(r.success).toBe(true);
  });

  it('rejeita Day 1A sem flightAdvanced', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'PKO',
        isFlight: true,
        flightDay: '1A',
        flightAdvanced: null,
        prize: '0',
      })
    );
    expect(r.success).toBe(false);
  });

  it('rejeita Day Final sem position', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'Vanilla',
        isFlight: true,
        flightDay: 'Final',
        position: null,
        prize: '0',
      })
    );
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// flightDay regex
// ---------------------------------------------------------------------------

describe('flightDay regex', () => {
  const validValues = ['1A', '1B', '1C', '1D', '1E', '2', '3', 'Day 1', 'Day 2', 'Final'];
  const invalidValues = ['xyz', '1@', 'Day-1', '  Day 1  ', 'random', '1AA'];

  for (const v of validValues) {
    it(`aceita flightDay="${v}"`, () => {
      const overrides: any = {
        type: 'PKO',
        isFlight: true,
        flightDay: v,
      };
      // fields condicionais para flight day pattern
      if (/^\d+[A-Z]$/.test(v)) {
        overrides.flightAdvanced = true;
        overrides.prize = '0';
        overrides.position = null;
      } else {
        overrides.position = 5;
        overrides.prize = '100';
      }
      const r = insertTournamentSchema.safeParse(makeValidTournament(overrides));
      expect(r.success).toBe(true);
    });
  }

  for (const v of invalidValues) {
    it(`rejeita flightDay="${v}"`, () => {
      const r = insertTournamentSchema.safeParse(
        makeValidTournament({
          type: 'PKO',
          isFlight: true,
          flightDay: v,
          flightAdvanced: true,
          prize: '0',
        })
      );
      expect(r.success).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Refinement: campos package* SO quando isLive=true
// ---------------------------------------------------------------------------

describe('refinement package (isLive) ortogonal', () => {
  it('rejeita isLive=false com packageBuyIn populado', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ isLive: false, packageBuyIn: '100' })
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('package'))).toBe(true);
    }
  });

  it('rejeita isLive=false com packageAccommodation populado', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ isLive: false, packageAccommodation: '500' })
    );
    expect(r.success).toBe(false);
  });

  it('rejeita isLive=false com packageNotes populado', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ isLive: false, packageNotes: 'Hospedagem 3 dias' })
    );
    expect(r.success).toBe(false);
  });

  it('aceita isLive=true sem nenhum package field (todos opcionais)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ type: 'Vanilla', isLive: true, buyIn: '1000' })
    );
    expect(r.success).toBe(true);
  });

  it('aceita isLive=true com package fields parciais', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'Vanilla',
        isLive: true,
        buyIn: '1000',
        packageAccommodation: '500',
        packageTravel: '300',
        prize: '5000',
      })
    );
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Combinacoes ortogonais (matriz parcial — Sprint 1)
// ---------------------------------------------------------------------------

describe('combinacoes ortogonais validas', () => {
  it('Satellite + isFlight=true + isLive=true (PKO+Flight+Live nao valido — esse e satellite)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'Satellite',
        isFlight: true,
        isLive: true,
        flightDay: '1A',
        flightAdvanced: true,
        prize: '0',
        satelliteRewardType: 'ticket',
        satelliteTicketValue: '109',
        satelliteTargetName: 'WSOP Main',
      })
    );
    expect(r.success).toBe(true);
  });

  it('PKO + isFlight=true (Day Final) + isLive=true', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'PKO',
        isFlight: true,
        isLive: true,
        flightDay: 'Final',
        position: 3,
        prize: '50000',
        buyIn: '10000',
        packageAccommodation: '2000',
      })
    );
    expect(r.success).toBe(true);
  });

  it('Vanilla puro (sem modificadores) — happy path basico', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({ type: 'Vanilla', isFlight: false, isLive: false })
    );
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Backwards compat: refinements add-on/re-entry NAO regridem (RF-02 nota)
// ---------------------------------------------------------------------------

describe('refinements add-on/re-entry continuam funcionando', () => {
  it('rejeita addOnTaken=true sem allowsAddOn=true (regra ADR-014 #1)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        addOnTaken: true,
        allowsAddOn: false,
      })
    );
    expect(r.success).toBe(false);
  });

  it('rejeita addOnTaken=true com addOnCost <= 0 (regra ADR-014 #2)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        addOnTaken: true,
        allowsAddOn: true,
        addOnCost: '0',
      })
    );
    expect(r.success).toBe(false);
  });

  it('rejeita reentries > 0 sem allowsReentry (regra ADR-014 #3)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        reentries: 2,
        allowsReentry: false,
      })
    );
    expect(r.success).toBe(false);
  });

  it('rejeita reentries > maxReentries (regra ADR-014 #4)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        reentries: 5,
        allowsReentry: true,
        maxReentries: 2,
      })
    );
    expect(r.success).toBe(false);
  });

  it('rejeita maxReentries negativo (regra ADR-014 #5)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        allowsReentry: true,
        maxReentries: -1,
      })
    );
    expect(r.success).toBe(false);
  });

  it('rejeita reentries negativo (regra ADR-014 #6)', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        allowsReentry: true,
        reentries: -1,
      })
    );
    expect(r.success).toBe(false);
  });

  it('aceita combinacao add-on/re-entry valida + isFlight=true', () => {
    const r = insertTournamentSchema.safeParse(
      makeValidTournament({
        type: 'PKO',
        isFlight: true,
        flightDay: '1A',
        flightAdvanced: true,
        prize: '0',
        allowsAddOn: true,
        addOnCost: '5',
        addOnTaken: true,
        allowsReentry: true,
        maxReentries: 2,
        reentries: 1,
      })
    );
    expect(r.success).toBe(true);
  });
});
