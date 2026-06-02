import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint Fase C #4 — RF-04: storage.getTiltTypeDistribution
//
// Spec: Docs/specs/sprint-fase-c-4-tilt-tipado-2026-06-02.md (RF-04)
// ADR : Docs/architecture/decisions/232-fase-c-4-tilt-tipado-7-tipos-antidoto.md (D-4/D-5)
//
// Status RED: storage.getTiltTypeDistribution NAO existe ainda. Implementer
// espelha getAbGameDistribution (server/storage.ts:8289): scan cooldown_logs
// (completedAt!=null AND startedAt>=cutoff) lendo tiltSelfAssessment jsonb +
// agregacao JS.
//
// Shape esperado (ADR TiltTypeDistribution):
//   {
//     period: '7d'|'30d'|'90d';
//     totalAssessments: number;   // cool-downs com tilt declarado (feltTilt>0 || keptTilting>0)
//     typedCount: number;         // subset com tiltType nao-null e valido (SO explicito — D-4)
//     dominant: TiltTypeId|null;  // maior count; null se typedCount===0 OU empate no topo
//     distribution: Array<{ tiltType; count; sharePct }>; // desc; sharePct = count/typedCount
//     dataSufficiency: 'ok'|'low';// 'low' quando typedCount < 3
//   }
//
// SHAPE REAL do row scaneado (lesson #3): { tiltSelfAssessment } jsonb com
//   { feltTilt, keptTilting, presence, triggers[], action, tiltType? }
//   (shared/schema.ts:3549 TiltSelfAssessment + delta RF-02 tiltType).
//
// D-4 TRAVADO: conta SO tiltType explicito (NAO deriva heuristica pros legados).
// R5/PII: action/notas NUNCA na resposta.
//
// Lessons: #3 (shape real), #8 (presenca individual, nao length), #9 (degrade
// sem crash), #30 (.test.ts = node).
// =============================================================================

vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return { ...actual, relations: actual.relations ?? vi.fn(() => ({})) };
});

type Row = Record<string, any>;

const dbState = vi.hoisted(() => ({
  cooldownRows: [] as Row[],
}));

vi.mock('../../../server/db', () => {
  const make = () => vi.fn(() => chain);
  const chain: any = {};
  chain.select = make();
  chain.from = make();
  chain.where = make();
  chain.groupBy = make();
  chain.orderBy = make();
  chain.limit = make();
  chain.then = (resolve: any) =>
    Promise.resolve(dbState.cooldownRows).then(resolve);
  return { db: chain, pool: {} };
});

import { storage } from '../../../server/storage';

// Shape REAL do tilt_self_assessment jsonb (lesson #3) — feltTilt/keptTilting/
// presence/triggers/action/tiltType. action incluido de proposito p/ assert PII.
function row(tilt: Partial<{
  feltTilt: number;
  keptTilting: number;
  presence: number;
  triggers: string[];
  action: string;
  tiltType: string | null;
}> | null | undefined): Row {
  return { tiltSelfAssessment: tilt };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.cooldownRows = [];
});

// ===========================================================================
// Shape / existencia
// ===========================================================================

describe('storage.getTiltTypeDistribution — shape', () => {
  it('eh uma funcao exportada', () => {
    expect(typeof storage.getTiltTypeDistribution).toBe('function');
  });

  it('janela vazia -> 200-like, distribution [], dominant null, dataSufficiency low', async () => {
    dbState.cooldownRows = [];
    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');
    expect(out).toMatchObject({
      period: '30d',
      totalAssessments: 0,
      typedCount: 0,
      dominant: null,
      distribution: [],
      dataSufficiency: 'low',
    });
  });

  it.each(['7d', '30d', '90d'] as const)('period=%s ecoa no retorno', async (p) => {
    dbState.cooldownRows = [];
    const out = await storage.getTiltTypeDistribution('USER-0001', p);
    expect(out.period).toBe(p);
  });
});

// ===========================================================================
// Happy path — RF-04 criterio: 5 injustice + 2 revenge
// ===========================================================================

describe('storage.getTiltTypeDistribution — happy path', () => {
  it('5 injustice + 2 revenge (typedCount 7) -> dominant injustice, share ~71.4', async () => {
    dbState.cooldownRows = [
      ...Array(5).fill(null).map(() =>
        row({ feltTilt: 7, keptTilting: 3, triggers: ['cooler'], action: 'x', tiltType: 'injustice' }),
      ),
      ...Array(2).fill(null).map(() =>
        row({ feltTilt: 6, keptTilting: 2, triggers: ['briga-interpessoal'], action: 'y', tiltType: 'revenge' }),
      ),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');

    expect(out.totalAssessments).toBe(7);
    expect(out.typedCount).toBe(7);
    expect(out.dominant).toBe('injustice');
    expect(out.dataSufficiency).toBe('ok');

    const inj = out.distribution.find((d) => d.tiltType === 'injustice');
    const rev = out.distribution.find((d) => d.tiltType === 'revenge');
    expect(inj?.count).toBe(5);
    expect(rev?.count).toBe(2);
    // sharePct = count/typedCount; injustice 5/7 ≈ 0.714 (aceita pct 71.4 ou fracao 0.714)
    expect(inj!.sharePct).toBeGreaterThan(0.70);
    expect(inj!.sharePct).toBeLessThan(0.72);
  });

  it('distribution ordenada desc por count', async () => {
    dbState.cooldownRows = [
      ...Array(4).fill(null).map(() => row({ feltTilt: 5, keptTilting: 1, triggers: [], tiltType: 'injustice' })),
      ...Array(3).fill(null).map(() => row({ feltTilt: 5, keptTilting: 1, triggers: [], tiltType: 'revenge' })),
      ...Array(1).fill(null).map(() => row({ feltTilt: 5, keptTilting: 1, triggers: [], tiltType: 'mistake' })),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');

    for (let i = 1; i < out.distribution.length; i++) {
      expect(out.distribution[i - 1].count).toBeGreaterThanOrEqual(out.distribution[i].count);
    }
    expect(out.distribution[0].tiltType).toBe('injustice');
  });
});

// ===========================================================================
// sharePct sobre typedCount (NUNCA totalAssessments) — RF-04
// ===========================================================================

describe('storage.getTiltTypeDistribution — sharePct sobre typedCount', () => {
  it('mix tipado/legado: sharePct usa typedCount como denominador, nao totalAssessments', async () => {
    dbState.cooldownRows = [
      // 3 tipados: 2 injustice, 1 revenge
      row({ feltTilt: 6, keptTilting: 2, triggers: [], action: 'a', tiltType: 'injustice' }),
      row({ feltTilt: 6, keptTilting: 2, triggers: [], action: 'b', tiltType: 'injustice' }),
      row({ feltTilt: 6, keptTilting: 2, triggers: [], action: 'c', tiltType: 'revenge' }),
      // 2 legados com tilt declarado mas sem tiltType
      row({ feltTilt: 5, keptTilting: 1, triggers: [], action: 'd' }),
      row({ feltTilt: 4, keptTilting: 0, triggers: [], action: 'e', tiltType: null }),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');

    expect(out.totalAssessments).toBe(5); // todos com tilt declarado
    expect(out.typedCount).toBe(3);        // so os 3 com tiltType valido
    const inj = out.distribution.find((d) => d.tiltType === 'injustice');
    // 2/3, NAO 2/5
    expect(inj!.sharePct).toBeGreaterThan(0.66);
    expect(inj!.sharePct).toBeLessThan(0.67);
  });
});

// ===========================================================================
// D-4 — conta SO explicito (legados NAO derivados pela heuristica)
// ===========================================================================

describe('storage.getTiltTypeDistribution — D-4: SO tiltType explicito', () => {
  it('legados (sem tiltType) com triggers mapeaveis NAO entram na distribution', async () => {
    dbState.cooldownRows = [
      // teria heuristica 'injustice' (cooler) mas NAO tem tiltType -> nao conta typed
      row({ feltTilt: 7, keptTilting: 3, triggers: ['cooler'], action: 'x' }),
      row({ feltTilt: 7, keptTilting: 3, triggers: ['downswing'], action: 'y' }),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');

    expect(out.totalAssessments).toBe(2);
    expect(out.typedCount).toBe(0);
    expect(out.distribution).toEqual([]);
    expect(out.dominant).toBeNull();
    expect(out.dataSufficiency).toBe('low');
  });

  it('tiltType invalido no jsonb (corrompido) NAO conta em typedCount', async () => {
    dbState.cooldownRows = [
      row({ feltTilt: 6, keptTilting: 2, triggers: [], tiltType: 'lixo_invalido' as any }),
      row({ feltTilt: 6, keptTilting: 2, triggers: [], tiltType: 'injustice' }),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');

    expect(out.totalAssessments).toBe(2);
    expect(out.typedCount).toBe(1); // so o injustice valido
    expect(out.dominant).toBe('injustice');
  });
});

// ===========================================================================
// totalAssessments — so cool-downs com tilt declarado
// ===========================================================================

describe('storage.getTiltTypeDistribution — totalAssessments (tilt declarado)', () => {
  it('feltTilt:0 && keptTilting:0 NAO conta em totalAssessments', async () => {
    dbState.cooldownRows = [
      row({ feltTilt: 0, keptTilting: 0, presence: 8, triggers: [], action: '' }), // sem tilt
      row({ feltTilt: 0, keptTilting: 0, triggers: [], tiltType: 'injustice' }),   // sem tilt mesmo com tiltType
      row({ feltTilt: 5, keptTilting: 0, triggers: [], tiltType: 'mistake' }),     // tem tilt
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');

    // so a 3a linha tem tilt declarado
    expect(out.totalAssessments).toBe(1);
    // a 2a linha tem tiltType mas feltTilt/keptTilting zero -> nao conta como typed (sem tilt a tipificar)
    expect(out.typedCount).toBe(1);
    expect(out.dominant).toBe('mistake');
  });

  it('feltTilt>0 OU keptTilting>0 conta (qualquer um dos dois)', async () => {
    dbState.cooldownRows = [
      row({ feltTilt: 3, keptTilting: 0, triggers: [], tiltType: 'injustice' }),
      row({ feltTilt: 0, keptTilting: 4, triggers: [], tiltType: 'revenge' }),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');
    expect(out.totalAssessments).toBe(2);
    expect(out.typedCount).toBe(2);
  });
});

// ===========================================================================
// dominant — empate no topo -> null
// ===========================================================================

describe('storage.getTiltTypeDistribution — dominant empate', () => {
  it('3 injustice / 3 mistake (empate no topo) -> dominant null', async () => {
    dbState.cooldownRows = [
      ...Array(3).fill(null).map(() => row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'injustice' })),
      ...Array(3).fill(null).map(() => row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'mistake' })),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');

    expect(out.typedCount).toBe(6);
    expect(out.dominant).toBeNull(); // empate no topo
    expect(out.dataSufficiency).toBe('ok'); // typedCount 6 >= 3
  });

  it('dominante claro quando NAO ha empate no topo', async () => {
    dbState.cooldownRows = [
      ...Array(4).fill(null).map(() => row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'injustice' })),
      ...Array(3).fill(null).map(() => row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'mistake' })),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');
    expect(out.dominant).toBe('injustice');
  });
});

// ===========================================================================
// dataSufficiency — typedCount < 3 -> low
// ===========================================================================

describe('storage.getTiltTypeDistribution — dataSufficiency', () => {
  it('typedCount 2 -> dataSufficiency low', async () => {
    dbState.cooldownRows = [
      row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'injustice' }),
      row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'revenge' }),
    ];
    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');
    expect(out.typedCount).toBe(2);
    expect(out.dataSufficiency).toBe('low');
  });

  it('typedCount exatamente 3 -> dataSufficiency ok', async () => {
    dbState.cooldownRows = [
      row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'injustice' }),
      row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'injustice' }),
      row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'revenge' }),
    ];
    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');
    expect(out.typedCount).toBe(3);
    expect(out.dataSufficiency).toBe('ok');
  });
});

// ===========================================================================
// Degrade (lesson #9) — tiltSelfAssessment null/ausente/malformado
// ===========================================================================

describe('storage.getTiltTypeDistribution — degrade (lesson #9)', () => {
  it('tiltSelfAssessment null/undefined/ausente ignorado sem crash', async () => {
    dbState.cooldownRows = [
      row(null),
      row(undefined),
      { /* sem tiltSelfAssessment */ },
      row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'injustice' }),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');

    expect(out.totalAssessments).toBe(1);
    expect(out.typedCount).toBe(1);
    expect(out.dominant).toBe('injustice');
  });

  it('tiltSelfAssessment nao-objeto (string/numero) ignorado', async () => {
    dbState.cooldownRows = [
      { tiltSelfAssessment: 'corrompido' },
      { tiltSelfAssessment: 42 },
      row({ feltTilt: 6, keptTilting: 1, triggers: [], tiltType: 'mistake' }),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');
    expect(out.totalAssessments).toBe(1);
    expect(out.typedCount).toBe(1);
  });
});

// ===========================================================================
// PII (R5) — action/notas/texto livre NUNCA na resposta
// ===========================================================================

describe('storage.getTiltTypeDistribution — privacidade (R5)', () => {
  it('resposta serializada NAO contem o texto livre de action', async () => {
    const segredo = 'tomei tilt depois de uma bad beat horrivel na bolha do high roller';
    dbState.cooldownRows = [
      row({ feltTilt: 8, keptTilting: 6, triggers: ['cooler'], action: segredo, tiltType: 'injustice' }),
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');
    const serialized = JSON.stringify(out);

    expect(serialized).not.toContain(segredo);
    expect(serialized).not.toContain('action');
  });

  it('resposta nao expoe a chave "action" mesmo com dados', async () => {
    dbState.cooldownRows = [
      row({ feltTilt: 7, keptTilting: 2, triggers: [], action: 'algo privado', tiltType: 'revenge' }),
    ];
    const out: any = await storage.getTiltTypeDistribution('USER-0001', '30d');
    expect(Object.prototype.hasOwnProperty.call(out, 'action')).toBe(false);
    for (const d of out.distribution) {
      expect(Object.prototype.hasOwnProperty.call(d, 'action')).toBe(false);
    }
  });
});

// ===========================================================================
// Edge — todos legados (typedCount 0 mas totalAssessments > 0)
// ===========================================================================

describe('storage.getTiltTypeDistribution — todos legados', () => {
  it('todos sem tiltType -> typedCount 0, distribution [], totalAssessments reflete tilt declarado', async () => {
    dbState.cooldownRows = [
      row({ feltTilt: 5, keptTilting: 2, triggers: ['cooler'], action: 'a' }),
      row({ feltTilt: 6, keptTilting: 0, triggers: ['downswing'], action: 'b' }),
      row({ feltTilt: 0, keptTilting: 0, triggers: [], action: '' }), // sem tilt -> nao conta
    ];

    const out = await storage.getTiltTypeDistribution('USER-0001', '30d');

    expect(out.totalAssessments).toBe(2);
    expect(out.typedCount).toBe(0);
    expect(out.distribution).toEqual([]);
    expect(out.dominant).toBeNull();
    expect(out.dataSufficiency).toBe('low');
  });
});
