// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.1 / RF-02 - sanitizeCoverUrl helper
//
// Spec: Docs/specs/sprint-mini-player-1.1.md RF-02
//
// Target: client/src/lib/audio-engine/sanitizeCoverUrl.ts (NAO EXISTE)
//
// Cobertura:
//   - http://, https:// validos passam
//   - javascript:, data:, file:, ftp: retornam null
//   - URLs malformadas retornam null
//   - null/undefined/empty retornam null
//   - non-string retorna null
//
// NOTA: usa `require()` lazy (nao `await import()`) — Vite resolve dynamic
// imports com argumento string literal no transform pipeline, quebrando em
// red phase quando o modulo nao existe. `require()` passa pelo handler ts/tsx
// custom em tests/setup.ts (lesson #38).
// =============================================================================

import { describe, it, expect } from 'vitest';

function loadHelper() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@/lib/audio-engine/sanitizeCoverUrl');
  return mod.sanitizeCoverUrl as (
    url: string | null | undefined,
  ) => string | null;
}

describe('sanitizeCoverUrl (RF-02 helper)', () => {
  it('https:// URL valida retorna a propria string', () => {
    const sanitize = loadHelper();
    const url = 'https://cdn.example.com/cover.jpg';
    expect(sanitize(url)).toBe('https://cdn.example.com/cover.jpg');
  });

  it('http:// URL valida retorna a propria string', () => {
    const sanitize = loadHelper();
    const url = 'http://example.com/cover.jpg';
    expect(sanitize(url)).toBe('http://example.com/cover.jpg');
  });

  it('javascript: pseudo-protocol retorna null', () => {
    const sanitize = loadHelper();
    expect(sanitize('javascript:alert(1)')).toBeNull();
  });

  it('data:image/png base64 retorna null (so http/https)', () => {
    const sanitize = loadHelper();
    expect(sanitize('data:image/png;base64,iVBORw0KGgoAAAANSU')).toBeNull();
  });

  it('file:// retorna null', () => {
    const sanitize = loadHelper();
    expect(sanitize('file:///etc/passwd')).toBeNull();
  });

  it('ftp:// retorna null', () => {
    const sanitize = loadHelper();
    expect(sanitize('ftp://example.com/cover.jpg')).toBeNull();
  });

  it('string vazia retorna null', () => {
    const sanitize = loadHelper();
    expect(sanitize('')).toBeNull();
  });

  it('null retorna null', () => {
    const sanitize = loadHelper();
    expect(sanitize(null)).toBeNull();
  });

  it('undefined retorna null', () => {
    const sanitize = loadHelper();
    expect(sanitize(undefined)).toBeNull();
  });

  it('string nao-URL (without scheme) retorna null', () => {
    const sanitize = loadHelper();
    expect(sanitize('not-a-url')).toBeNull();
  });

  it('caminho relativo /img/x.jpg retorna null (nao tem scheme absoluto)', () => {
    const sanitize = loadHelper();
    expect(sanitize('/img/x.jpg')).toBeNull();
  });

  it('input nao-string (number) retorna null', () => {
    const sanitize = loadHelper();
    // Forca type-check bypass intencional pra testar guard
    expect(sanitize(123 as any)).toBeNull();
  });

  it('input nao-string (object) retorna null', () => {
    const sanitize = loadHelper();
    expect(sanitize({ url: 'x' } as any)).toBeNull();
  });

  it('https URL com query string e hash retorna intacta', () => {
    const sanitize = loadHelper();
    const url = 'https://cdn.example.com/cover.jpg?v=2#thumb';
    const out = sanitize(url);
    expect(out).not.toBeNull();
    // Aceita exact ou via URL roundtrip (depende impl).
    expect(out).toContain('https://cdn.example.com/cover.jpg');
  });
});
