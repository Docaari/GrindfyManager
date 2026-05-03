import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-2 / RF-06 — postMessage protocol helpers
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-06 + D8 + D9
// ADR-094 (article bundle protocol — postMessage whitelist)
//
// Modulo target (helpers low-level que ArticleIframe usa):
//   client/src/lib/library/iframePostMessage.ts (NAO EXISTE — red phase)
//
// Funcoes:
//   - parseLibraryMessage(event): { type, payload } | null
//   - isResizeMessage(data): boolean
//   - isScrollMessage(data): boolean
//   - clampHeight(h): number  (0..50000)
//   - clampPercent(p): number  (0..100)
//
// Whitelist tipos: 'grindfy:library:resize', 'grindfy:library:scroll'.
// Mensagens fora ignoradas silenciosamente.
//
// IMPORTANTE: validacao por event.source (NAO event.origin) porque
// iframe sandbox sem same-origin tem origin=null. event.source eh
// suficiente — iframe nao consegue forjar source.
// =============================================================================

// Lazy load para nao crashar suite quando modulo nao existe (red phase).
// Os testes individuais falham com "Cannot find module" — exatamente o sinal
// que o implementer precisa criar o helper.
function loadHelpers() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../../../client/src/lib/library/iframePostMessage');
  return {
    parseLibraryMessage: mod.parseLibraryMessage,
    isResizeMessage: mod.isResizeMessage,
    isScrollMessage: mod.isScrollMessage,
    clampHeight: mod.clampHeight,
    clampPercent: mod.clampPercent,
  };
}
// Aliases que cada teste invoca
const parseLibraryMessage = (...args: any[]) => loadHelpers().parseLibraryMessage(...args);
const isResizeMessage = (...args: any[]) => loadHelpers().isResizeMessage(...args);
const isScrollMessage = (...args: any[]) => loadHelpers().isScrollMessage(...args);
const clampHeight = (...args: any[]) => loadHelpers().clampHeight(...args);
const clampPercent = (...args: any[]) => loadHelpers().clampPercent(...args);

// ---------------------------------------------------------------------------
// parseLibraryMessage
// ---------------------------------------------------------------------------

describe('parseLibraryMessage', () => {
  it('deve aceitar resize msg + retornar { type, payload }', () => {
    const data = { type: 'grindfy:library:resize', payload: { height: 1234 } };
    const result = parseLibraryMessage(data);
    expect(result).toEqual({ type: 'grindfy:library:resize', payload: { height: 1234 } });
  });

  it('deve aceitar scroll msg', () => {
    const data = { type: 'grindfy:library:scroll', payload: { percent: 42 } };
    const result = parseLibraryMessage(data);
    expect(result).toEqual({ type: 'grindfy:library:scroll', payload: { percent: 42 } });
  });

  it('type fora do whitelist -> null', () => {
    const result = parseLibraryMessage({ type: 'evil:hack', payload: { height: 9999 } });
    expect(result).toBeNull();
  });

  it('data null/undefined -> null', () => {
    expect(parseLibraryMessage(null)).toBeNull();
    expect(parseLibraryMessage(undefined)).toBeNull();
  });

  it('payload mal-formado (sem height nem percent) -> null', () => {
    expect(parseLibraryMessage({ type: 'grindfy:library:resize', payload: {} })).toBeNull();
  });

  it('resize com height nao number -> null', () => {
    expect(
      parseLibraryMessage({ type: 'grindfy:library:resize', payload: { height: 'not-a-number' } })
    ).toBeNull();
  });

  it('scroll com percent nao number -> null', () => {
    expect(
      parseLibraryMessage({ type: 'grindfy:library:scroll', payload: { percent: 'not-a-number' } })
    ).toBeNull();
  });

  it('data string (nao object) -> null', () => {
    expect(parseLibraryMessage('not-an-object')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isResizeMessage / isScrollMessage type guards
// ---------------------------------------------------------------------------

describe('isResizeMessage', () => {
  it('valida resize com height number', () => {
    expect(isResizeMessage({ type: 'grindfy:library:resize', payload: { height: 100 } })).toBe(true);
  });
  it('rejeita scroll', () => {
    expect(isResizeMessage({ type: 'grindfy:library:scroll', payload: { percent: 0 } })).toBe(false);
  });
  it('rejeita type errado', () => {
    expect(isResizeMessage({ type: 'foo', payload: { height: 1 } })).toBe(false);
  });
});

describe('isScrollMessage', () => {
  it('valida scroll com percent number', () => {
    expect(isScrollMessage({ type: 'grindfy:library:scroll', payload: { percent: 50 } })).toBe(true);
  });
  it('rejeita resize', () => {
    expect(isScrollMessage({ type: 'grindfy:library:resize', payload: { height: 1 } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clampHeight (anti-DoS)
// ---------------------------------------------------------------------------

describe('clampHeight', () => {
  it('cap superior 50000', () => {
    expect(clampHeight(99999)).toBeLessThanOrEqual(50000);
  });
  it('floor 0 (negativo nao aceito)', () => {
    expect(clampHeight(-1)).toBeGreaterThanOrEqual(0);
  });
  it('passthrough no range valido', () => {
    expect(clampHeight(1234)).toBe(1234);
  });
});

// ---------------------------------------------------------------------------
// clampPercent
// ---------------------------------------------------------------------------

describe('clampPercent', () => {
  it('cap superior 100', () => {
    expect(clampPercent(150)).toBe(100);
  });
  it('floor 0 (negativo)', () => {
    expect(clampPercent(-10)).toBe(0);
  });
  it('passthrough no range valido', () => {
    expect(clampPercent(42)).toBe(42);
  });
  it('bordas exatas 0 e 100', () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(100)).toBe(100);
  });
});
