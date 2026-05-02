/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UI-FND-1 — RF-01: Design Tokens em `client/src/lib/ui-tokens.ts`
 *
 * Spec: Docs/specs/ui-fnd-1-foundation.md (RF-01 + D2-D7 + D11)
 * ADR:  Docs/architecture/decisions/078-design-tokens-ui-patterns.md (secao 2.1)
 *
 * Estrutura esperada (ADR-078):
 *   tokens = {
 *     space: { xs:4, sm:8, md:12, base:16, lg:24, xl:32, '2xl':48, '3xl':64 },
 *     font:  { xs:12, sm:14, base:16, lg:20, xl:24, '2xl':32 },
 *     fontWeight: { normal:400, medium:500, semibold:600, bold:700 },
 *     color: {
 *       success: { text, bg, border },
 *       danger:  { text, bg, border },
 *       warn:    { text, bg, border },
 *       info:    { text, bg, border },
 *       action:  { text, bg, border },
 *       neutral: { text, bg, border },
 *     },
 *     motion: { fast:150, base:200, slow:300, easing:'cubic-bezier(0.4, 0, 0.2, 1)' },
 *     radius: { sm:4, md:8, lg:12, full:9999 },
 *     shadow: { sm:'...', md:'...', lg:'...' },
 *   }
 *
 * Frozen profundo (D11): mutacoes silenciosas em runtime, throw em strict mode.
 * Tipos exportados: SpaceKey, FontKey, ColorKey, MotionKey, RadiusKey, ShadowKey.
 *
 * Lessons aplicadas:
 *   #11 — escopo enxuto, sem keys decorativas.
 *   #2  — testes prescriptivos validando estrutura esperada (sem heuristicas).
 */

import { describe, it, expect } from 'vitest';

// Imports red-phase (modulo nao existe ainda).
// @ts-expect-error - red phase, modulo sera criado pelo implementer.
import tokensDefault, {
  tokens,
  // @ts-expect-error - red phase
  type SpaceKey,
  // @ts-expect-error - red phase
  type FontKey,
  // @ts-expect-error - red phase
  type ColorKey,
  // @ts-expect-error - red phase
  type MotionKey,
  // @ts-expect-error - red phase
  type RadiusKey,
  // @ts-expect-error - red phase
  type ShadowKey,
} from '../../../client/src/lib/ui-tokens';

describe('RF-01 — ui-tokens.ts: exports', () => {
  it('exporta named export `tokens`', () => {
    expect(tokens).toBeDefined();
    expect(typeof tokens).toBe('object');
  });

  it('exporta default export equivalente ao named export `tokens`', () => {
    expect(tokensDefault).toBeDefined();
    // Default e o mesmo objeto (ou estruturalmente identico).
    expect(tokensDefault).toBe(tokens);
  });

  it('expoe os 6 sub-namespaces canonicos: space, font, color, motion, radius, shadow', () => {
    expect(tokens).toHaveProperty('space');
    expect(tokens).toHaveProperty('font');
    expect(tokens).toHaveProperty('color');
    expect(tokens).toHaveProperty('motion');
    expect(tokens).toHaveProperty('radius');
    expect(tokens).toHaveProperty('shadow');
  });
});

// ============================================================================
// space (D2)
// ============================================================================
describe('RF-01 — tokens.space (D2)', () => {
  it('tem 8 aliases: xs, sm, md, base, lg, xl, 2xl, 3xl', () => {
    const keys = Object.keys(tokens.space).sort();
    expect(keys).toEqual(['2xl', '3xl', 'base', 'lg', 'md', 'sm', 'xl', 'xs']);
  });

  it('mapeia para [4, 8, 12, 16, 24, 32, 48, 64] (px)', () => {
    expect(tokens.space.xs).toBe(4);
    expect(tokens.space.sm).toBe(8);
    expect(tokens.space.md).toBe(12);
    expect(tokens.space.base).toBe(16);
    expect(tokens.space.lg).toBe(24);
    expect(tokens.space.xl).toBe(32);
    expect(tokens.space['2xl']).toBe(48);
    expect(tokens.space['3xl']).toBe(64);
  });

  it('todos valores de space sao numbers', () => {
    for (const key of Object.keys(tokens.space)) {
      expect(typeof (tokens.space as any)[key]).toBe('number');
    }
  });

  it('NAO inclui alias para 0 (use literal)', () => {
    // D2 explicita: "Valor 0 nao tem alias (use literal)".
    const values = Object.values(tokens.space);
    expect(values).not.toContain(0);
  });
});

// ============================================================================
// font (D3)
// ============================================================================
describe('RF-01 — tokens.font (D3)', () => {
  it('tem 6 aliases: xs, sm, base, lg, xl, 2xl', () => {
    const keys = Object.keys(tokens.font).sort();
    expect(keys).toEqual(['2xl', 'base', 'lg', 'sm', 'xl', 'xs']);
  });

  it('mapeia para [12, 14, 16, 20, 24, 32] (px)', () => {
    expect(tokens.font.xs).toBe(12);
    expect(tokens.font.sm).toBe(14);
    expect(tokens.font.base).toBe(16);
    expect(tokens.font.lg).toBe(20);
    expect(tokens.font.xl).toBe(24);
    expect(tokens.font['2xl']).toBe(32);
  });

  it('todos valores de font sao numbers', () => {
    for (const key of Object.keys(tokens.font)) {
      expect(typeof (tokens.font as any)[key]).toBe('number');
    }
  });
});

// ============================================================================
// color (D4 + R8 — objeto {text, bg, border})
// ============================================================================
describe('RF-01 — tokens.color (D4 + R8 resolved)', () => {
  it('tem 6 namespaces semanticos: success, danger, warn, info, action, neutral', () => {
    const keys = Object.keys(tokens.color).sort();
    expect(keys).toEqual(['action', 'danger', 'info', 'neutral', 'success', 'warn']);
  });

  describe.each([
    ['success'],
    ['danger'],
    ['warn'],
    ['info'],
    ['action'],
    ['neutral'],
  ])('tokens.color.%s', (ns) => {
    it(`expoe estrutura { text, bg, border }`, () => {
      const swatch = (tokens.color as any)[ns];
      expect(swatch).toBeDefined();
      expect(swatch).toHaveProperty('text');
      expect(swatch).toHaveProperty('bg');
      expect(swatch).toHaveProperty('border');
    });

    it('todos os 3 valores sao strings (classnames Tailwind ou CSS)', () => {
      const swatch = (tokens.color as any)[ns];
      expect(typeof swatch.text).toBe('string');
      expect(typeof swatch.bg).toBe('string');
      expect(typeof swatch.border).toBe('string');
      expect(swatch.text.length).toBeGreaterThan(0);
      expect(swatch.bg.length).toBeGreaterThan(0);
      expect(swatch.border.length).toBeGreaterThan(0);
    });
  });

  it('action token usa cor de marca poker-accent (D4)', () => {
    // ADR-078 secao 2.1: action = {text:'text-poker-accent', bg:'bg-poker-accent/15', border:'border-poker-accent/40'}.
    const action = (tokens.color as any).action;
    expect(action.text).toMatch(/poker-accent/);
    expect(action.bg).toMatch(/poker-accent/);
    expect(action.border).toMatch(/poker-accent/);
  });
});

// ============================================================================
// motion (D5)
// ============================================================================
describe('RF-01 — tokens.motion (D5)', () => {
  it('tem 3 durations + 1 easing', () => {
    expect(tokens.motion).toHaveProperty('fast');
    expect(tokens.motion).toHaveProperty('base');
    expect(tokens.motion).toHaveProperty('slow');
    expect(tokens.motion).toHaveProperty('easing');
  });

  it('durations sao 150 / 200 / 300 (ms)', () => {
    expect(tokens.motion.fast).toBe(150);
    expect(tokens.motion.base).toBe(200);
    expect(tokens.motion.slow).toBe(300);
  });

  it('easing eh string cubic-bezier', () => {
    expect(typeof tokens.motion.easing).toBe('string');
    expect(tokens.motion.easing).toMatch(/cubic-bezier/);
  });

  it('NAO expoe duration > 300ms (anti-pattern boas praticas 1.12)', () => {
    // Apenas as 3 keys + easing. Garante que nao adicionaram `xtraSlow`.
    const numericValues = Object.entries(tokens.motion)
      .filter(([k]) => k !== 'easing')
      .map(([, v]) => v as number);
    for (const v of numericValues) {
      expect(v).toBeLessThanOrEqual(300);
    }
  });
});

// ============================================================================
// radius (D6)
// ============================================================================
describe('RF-01 — tokens.radius (D6)', () => {
  it('tem 4 aliases: sm, md, lg, full', () => {
    const keys = Object.keys(tokens.radius).sort();
    expect(keys).toEqual(['full', 'lg', 'md', 'sm']);
  });

  it('mapeia para [4, 8, 12, 9999] (px)', () => {
    expect(tokens.radius.sm).toBe(4);
    expect(tokens.radius.md).toBe(8);
    expect(tokens.radius.lg).toBe(12);
    expect(tokens.radius.full).toBe(9999);
  });
});

// ============================================================================
// shadow (D7)
// ============================================================================
describe('RF-01 — tokens.shadow (D7)', () => {
  it('tem 3 aliases: sm, md, lg', () => {
    const keys = Object.keys(tokens.shadow).sort();
    expect(keys).toEqual(['lg', 'md', 'sm']);
  });

  it('todos valores sao strings CSS prontas', () => {
    expect(typeof tokens.shadow.sm).toBe('string');
    expect(typeof tokens.shadow.md).toBe('string');
    expect(typeof tokens.shadow.lg).toBe('string');
    expect(tokens.shadow.sm.length).toBeGreaterThan(0);
    expect(tokens.shadow.md.length).toBeGreaterThan(0);
    expect(tokens.shadow.lg.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Frozen profundo (D11)
// ============================================================================
describe('RF-01 — frozen profundo (D11)', () => {
  it('tokens (root) eh frozen', () => {
    expect(Object.isFrozen(tokens)).toBe(true);
  });

  it('tokens.space eh frozen', () => {
    expect(Object.isFrozen(tokens.space)).toBe(true);
  });

  it('tokens.font eh frozen', () => {
    expect(Object.isFrozen(tokens.font)).toBe(true);
  });

  it('tokens.color eh frozen', () => {
    expect(Object.isFrozen(tokens.color)).toBe(true);
  });

  it('tokens.color.danger (nested) eh frozen — deep freeze', () => {
    expect(Object.isFrozen(tokens.color.danger)).toBe(true);
  });

  it('tokens.color.success (nested) eh frozen — deep freeze', () => {
    expect(Object.isFrozen(tokens.color.success)).toBe(true);
  });

  it('tokens.motion eh frozen', () => {
    expect(Object.isFrozen(tokens.motion)).toBe(true);
  });

  it('tokens.radius eh frozen', () => {
    expect(Object.isFrozen(tokens.radius)).toBe(true);
  });

  it('tokens.shadow eh frozen', () => {
    expect(Object.isFrozen(tokens.shadow)).toBe(true);
  });

  it('mutacao em strict mode lanca TypeError', () => {
    'use strict';
    expect(() => {
      // @ts-expect-error - tentativa de mutacao
      (tokens.space as any).md = 999;
    }).toThrow(TypeError);
  });

  it('mutacao silenciosa NAO altera o valor lido', () => {
    // Mesmo se nao throw em non-strict, valor permanece imutavel.
    try {
      (tokens.space as any).md = 999;
    } catch {
      // ignore
    }
    expect(tokens.space.md).toBe(12);
  });

  it('mutacao em propriedade aninhada (color.danger.text) tambem eh bloqueada', () => {
    const before = tokens.color.danger.text;
    try {
      (tokens.color.danger as any).text = 'text-pink-500';
    } catch {
      // ignore
    }
    expect(tokens.color.danger.text).toBe(before);
  });
});

// ============================================================================
// Tipos exportados (D11)
// ============================================================================
describe('RF-01 — tipos exportados (D11)', () => {
  it('SpaceKey aceita literais validos (compile-time check via runtime guard)', () => {
    // Tipo nao tem representacao runtime, mas validamos via uso.
    const k: SpaceKey = 'md';
    expect(tokens.space[k]).toBe(12);
  });

  it('FontKey aceita literais validos', () => {
    const k: FontKey = 'lg';
    expect(tokens.font[k]).toBe(20);
  });

  it('ColorKey aceita os 6 namespaces semanticos', () => {
    const keys: ColorKey[] = ['success', 'danger', 'warn', 'info', 'action', 'neutral'];
    for (const k of keys) {
      expect(tokens.color[k]).toBeDefined();
    }
  });

  it('MotionKey aceita as 3 durations', () => {
    const fast: MotionKey = 'fast';
    const base: MotionKey = 'base';
    const slow: MotionKey = 'slow';
    expect(tokens.motion[fast]).toBe(150);
    expect(tokens.motion[base]).toBe(200);
    expect(tokens.motion[slow]).toBe(300);
  });

  it('RadiusKey aceita os 4 aliases', () => {
    const keys: RadiusKey[] = ['sm', 'md', 'lg', 'full'];
    for (const k of keys) {
      expect(typeof tokens.radius[k]).toBe('number');
    }
  });

  it('ShadowKey aceita os 3 aliases', () => {
    const keys: ShadowKey[] = ['sm', 'md', 'lg'];
    for (const k of keys) {
      expect(typeof tokens.shadow[k]).toBe('string');
    }
  });
});

// ============================================================================
// Edge cases — SSR / ambiente Node
// ============================================================================
describe('RF-01 — edge cases', () => {
  it('importar ui-tokens em ambiente sem window NAO quebra (SSR safe)', () => {
    // Modulo nao deve referenciar window/document na avaliacao top-level.
    // Validacao indireta: se importacao chegou ate aqui, esta safe.
    expect(tokens).toBeDefined();
  });
});
