import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint Fase C #4 — Tilt tipado (7 tipos) + antidoto
//   RF-01: Catalogo estatico dos 7 tipos (shared/tilt-types.ts)
//   RF-02: Heuristica pura suggestTiltType
//
// Spec: Docs/specs/sprint-fase-c-4-tilt-tipado-2026-06-02.md
// ADR : Docs/architecture/decisions/232-fase-c-4-tilt-tipado-7-tipos-antidoto.md
//
// Status RED: shared/tilt-types.ts NAO existe ainda. Imports falham.
//
// Lessons:
//   #8  — valida PRESENCA INDIVIDUAL dos 7 ids, NAO length absoluta.
//   #10 — heuristica unica (shared) servindo client+server (DRY).
//   #30 — .test.ts roda no projeto server (node), zero mock, literais.
//
// Conteudo dos antidotos = literal do curso D1 §2.4 + §15.1 — test-writer/
// implementer NAO inventam. Aqui assertamos SENTINELAS (palavras-chave do curso),
// nao o texto integral, para nao acoplar ao wording exato.
// =============================================================================

import {
  TILT_TYPE_IDS,
  tiltTypeSchema,
  TILT_TYPE_CATALOG,
  getTiltType,
  isValidTiltType,
  suggestTiltType,
  type TiltTypeId,
  type TiltTypeMeta,
} from '../../../shared/tilt-types';

import { TILT_TRIGGERS } from '../../../shared/schema';

// ---------------------------------------------------------------------------
// RF-01 — TILT_TYPE_IDS (presenca individual, lesson #8)
// ---------------------------------------------------------------------------

describe('shared/tilt-types — TILT_TYPE_IDS', () => {
  // Lesson #8: validar presenca individual, nao length absoluta.
  const expectedIds = [
    'running_bad',
    'injustice',
    'hate_losing',
    'mistake',
    'entitlement',
    'revenge',
    'desperation',
  ] as const;

  it.each(expectedIds)('inclui o tipo "%s"', (id) => {
    expect(TILT_TYPE_IDS).toContain(id);
  });

  it('nao inclui winners_tilt (fora de escopo — "+1" do curso)', () => {
    expect(TILT_TYPE_IDS as readonly string[]).not.toContain('winners_tilt');
    expect(TILT_TYPE_IDS as readonly string[]).not.toContain('winner_tilt');
  });

  it('cada id e unico (sem duplicatas)', () => {
    const unique = new Set(TILT_TYPE_IDS as readonly string[]);
    expect(unique.size).toBe((TILT_TYPE_IDS as readonly string[]).length);
  });
});

// ---------------------------------------------------------------------------
// RF-01 — tiltTypeSchema (z.enum dos 7 ids)
// ---------------------------------------------------------------------------

describe('shared/tilt-types — tiltTypeSchema', () => {
  it('aceita cada um dos 7 ids', () => {
    for (const id of TILT_TYPE_IDS) {
      expect(() => tiltTypeSchema.parse(id)).not.toThrow();
    }
  });

  it('rejeita id invalido', () => {
    expect(() => tiltTypeSchema.parse('foo')).toThrow();
    expect(() => tiltTypeSchema.parse('winners_tilt')).toThrow();
  });

  it('rejeita null (o schema base do enum nao e nullable; nullable e aplicado fora)', () => {
    expect(() => tiltTypeSchema.parse(null)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RF-01 — TILT_TYPE_CATALOG: cada tipo tem 5 campos nao-vazios
// ---------------------------------------------------------------------------

describe('shared/tilt-types — TILT_TYPE_CATALOG', () => {
  it('e um array', () => {
    expect(Array.isArray(TILT_TYPE_CATALOG)).toBe(true);
  });

  it.each([
    'running_bad',
    'injustice',
    'hate_losing',
    'mistake',
    'entitlement',
    'revenge',
    'desperation',
  ] as const)('tem entrada para "%s" com label + description + antidote nao-vazios', (id) => {
    const meta = TILT_TYPE_CATALOG.find((m: TiltTypeMeta) => m.id === id);
    expect(meta).toBeDefined();
    expect(typeof meta!.label).toBe('string');
    expect(meta!.label.trim().length).toBeGreaterThan(0);
    expect(typeof meta!.description).toBe('string');
    expect(meta!.description.trim().length).toBeGreaterThan(0);
    expect(typeof meta!.antidote).toBe('string');
    expect(meta!.antidote.trim().length).toBeGreaterThan(0);
  });

  it('defaultTrigger, quando nao-null, e um valor presente em TILT_TRIGGERS', () => {
    const triggerSet = new Set(TILT_TRIGGERS as readonly string[]);
    for (const meta of TILT_TYPE_CATALOG) {
      if (meta.defaultTrigger != null) {
        expect(triggerSet.has(meta.defaultTrigger)).toBe(true);
      }
    }
  });

  it('defaultTrigger de running_bad mapeia para "downswing"', () => {
    const rb = TILT_TYPE_CATALOG.find((m) => m.id === 'running_bad');
    expect(rb!.defaultTrigger).toBe('downswing');
  });

  it('defaultTrigger de injustice mapeia para "cooler"', () => {
    const inj = TILT_TYPE_CATALOG.find((m) => m.id === 'injustice');
    expect(inj!.defaultTrigger).toBe('cooler');
  });

  it('defaultTrigger de revenge mapeia para "briga-interpessoal"', () => {
    const rev = TILT_TYPE_CATALOG.find((m) => m.id === 'revenge');
    expect(rev!.defaultTrigger).toBe('briga-interpessoal');
  });

  it.each(['hate_losing', 'mistake', 'entitlement', 'desperation'] as const)(
    '%s tem defaultTrigger null (sem gatilho situacional 1:1)',
    (id) => {
      const meta = TILT_TYPE_CATALOG.find((m) => m.id === id);
      expect(meta!.defaultTrigger).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// RF-01 — conteudo (sentinelas do curso D1 §15.1)
// ---------------------------------------------------------------------------

describe('shared/tilt-types — sentinelas de conteudo (curso D1 §15.1)', () => {
  it('antidoto de injustice contem "variancia"/"variância" (logic statement de variancia)', () => {
    const a = getTiltType('injustice')!.antidote.toLowerCase();
    expect(/vari[âa]ncia/.test(a)).toBe(true);
  });

  it('antidoto de revenge e mecanico (trocar de mesa / ocultar HUD)', () => {
    const a = getTiltType('revenge')!.antidote.toLowerCase();
    expect(/mesa|hud/.test(a)).toBe(true);
  });

  it('antidoto de desperation menciona stop-loss', () => {
    const a = getTiltType('desperation')!.antidote.toLowerCase();
    expect(/stop-?loss/.test(a)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RF-01 — helpers getTiltType / isValidTiltType (espelha getStatById)
// ---------------------------------------------------------------------------

describe('shared/tilt-types — getTiltType', () => {
  it('retorna meta para id valido', () => {
    const meta = getTiltType('injustice');
    expect(meta).toBeDefined();
    expect(meta!.id).toBe('injustice');
  });

  it('retorna undefined para id invalido (espelha getStatById)', () => {
    expect(getTiltType('xxx')).toBeUndefined();
    expect(getTiltType('winners_tilt')).toBeUndefined();
  });
});

describe('shared/tilt-types — isValidTiltType', () => {
  it('true para cada id do catalogo', () => {
    for (const id of TILT_TYPE_IDS) {
      expect(isValidTiltType(id)).toBe(true);
    }
  });

  it('false para id fora do catalogo', () => {
    expect(isValidTiltType('winners_tilt')).toBe(false);
    expect(isValidTiltType('foo')).toBe(false);
    expect(isValidTiltType('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RF-02 — suggestTiltType (heuristica pura, determinística, sem I/O)
// ---------------------------------------------------------------------------

describe('shared/tilt-types — suggestTiltType (mapeamento direto)', () => {
  it('triggers:["cooler"] -> injustice', () => {
    expect(suggestTiltType({ triggers: ['cooler'] })).toBe('injustice');
  });

  it('triggers:["slowroll"] -> injustice', () => {
    expect(suggestTiltType({ triggers: ['slowroll'] })).toBe('injustice');
  });

  it('triggers:["big-bluff-fail"] -> injustice', () => {
    expect(suggestTiltType({ triggers: ['big-bluff-fail'] })).toBe('injustice');
  });

  it('triggers:["downswing"] -> running_bad', () => {
    expect(suggestTiltType({ triggers: ['downswing'] })).toBe('running_bad');
  });

  it('triggers:["briga-interpessoal"] -> revenge', () => {
    expect(suggestTiltType({ triggers: ['briga-interpessoal'] })).toBe('revenge');
  });
});

describe('shared/tilt-types — suggestTiltType (precedencia: primeiro match vence)', () => {
  it('["briga-interpessoal","cooler"] -> revenge (revenge > injustice)', () => {
    expect(suggestTiltType({ triggers: ['briga-interpessoal', 'cooler'] })).toBe('revenge');
  });

  it('["downswing","briga-interpessoal"] -> revenge (revenge vence downswing)', () => {
    expect(suggestTiltType({ triggers: ['downswing', 'briga-interpessoal'] })).toBe('revenge');
  });

  it('["cooler","downswing"] -> injustice (injustice > running_bad)', () => {
    expect(suggestTiltType({ triggers: ['cooler', 'downswing'] })).toBe('injustice');
  });

  it('ordem dos triggers no array nao afeta a precedencia (precedencia e por regra, nao por posicao)', () => {
    // revenge sempre vence quando briga-interpessoal presente, independente da ordem
    expect(suggestTiltType({ triggers: ['cooler', 'briga-interpessoal'] })).toBe('revenge');
    expect(suggestTiltType({ triggers: ['briga-interpessoal', 'cooler'] })).toBe('revenge');
  });
});

describe('shared/tilt-types — suggestTiltType (desperation por score)', () => {
  it('nenhum trigger mapeavel + keptTilting>=7 -> desperation', () => {
    expect(suggestTiltType({ triggers: ['fome'], keptTilting: 8 })).toBe('desperation');
  });

  it('keptTilting exatamente 7 (limiar) -> desperation', () => {
    expect(suggestTiltType({ triggers: [], keptTilting: 7 })).toBe('desperation');
  });

  it('keptTilting 6 (abaixo do limiar) sem mapeavel -> null', () => {
    expect(suggestTiltType({ triggers: ['fome'], keptTilting: 6 })).toBeNull();
  });

  it('keptTilting 2 sem mapeavel -> null', () => {
    expect(suggestTiltType({ triggers: ['fome'], keptTilting: 2 })).toBeNull();
  });

  it('trigger mapeavel vence keptTilting>=7 (downswing + keptTilting 9 -> running_bad, NAO desperation)', () => {
    expect(suggestTiltType({ triggers: ['downswing'], keptTilting: 9 })).toBe('running_bad');
  });
});

describe('shared/tilt-types — suggestTiltType (estados aversivos genericos NAO mapeiam)', () => {
  it.each(['distracao', 'fome', 'sono', 'outro'] as const)(
    'trigger "%s" sozinho (scores baixos) -> null',
    (trigger) => {
      expect(suggestTiltType({ triggers: [trigger], keptTilting: 0 })).toBeNull();
    },
  );

  it('combinacao apenas de genericos -> null', () => {
    expect(suggestTiltType({ triggers: ['distracao', 'fome', 'sono'], keptTilting: 3 })).toBeNull();
  });
});

describe('shared/tilt-types — suggestTiltType (sem sugestao)', () => {
  it('triggers:[] e scores baixos -> null (nao chuta)', () => {
    expect(suggestTiltType({ triggers: [] })).toBeNull();
    expect(suggestTiltType({ triggers: [], feltTilt: 2, keptTilting: 1, presence: 5 })).toBeNull();
  });

  it('e determinística: mesma entrada -> mesma saida', () => {
    const input = { triggers: ['cooler', 'fome'], keptTilting: 8 };
    const r1 = suggestTiltType(input);
    const r2 = suggestTiltType(input);
    expect(r1).toBe(r2);
    expect(r1).toBe('injustice'); // injustice vence o keptTilting>=7
  });

  it('e pura: nao muta o input', () => {
    const input = { triggers: ['cooler'], keptTilting: 8 };
    const before = JSON.stringify(input);
    suggestTiltType(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
