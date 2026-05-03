// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / RF-03 + D9 — localStorage helpers para hero-seen flag
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md RF-03 + D9
// ADR: Docs/architecture/decisions/096-hero-prologue-routing-pattern.md
//
// Modulo target: client/src/lib/library-hero-storage.ts (NAO EXISTE)
//
// Storage key canonica: library:lesson:{lessonId}:hero-seen = "true"
// Tres helpers expostos: readHeroSeenFlag, writeHeroSeenFlag, clearHeroSeenFlag
// Todos try/catch silent (tolerantes a quota cheia / private mode).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Modulo target — RED phase, ainda nao existe.
// @ts-expect-error - modulo nao existe ainda
import {
  readHeroSeenFlag,
  writeHeroSeenFlag,
  clearHeroSeenFlag,
} from '../../../client/src/lib/library-hero-storage';

beforeEach(() => {
  // Limpa localStorage entre testes (lesson #14 — isolamento).
  try {
    localStorage.clear();
  } catch {
    // ok — pode estar mocked / indisponivel
  }
});

describe('library-hero-storage helpers — RF-03 + D9', () => {
  // ---- readHeroSeenFlag --------------------------------------------------

  it('readHeroSeenFlag deve retornar null quando flag nao existe', () => {
    const flag = readHeroSeenFlag('lesson-id-inexistente');
    expect(flag).toBeNull();
  });

  it('readHeroSeenFlag deve retornar "true" quando flag esta setada', () => {
    localStorage.setItem('library:lesson:abc-123:hero-seen', 'true');
    const flag = readHeroSeenFlag('abc-123');
    expect(flag).toBe('true');
  });

  it('readHeroSeenFlag deve usar a key canonica library:lesson:{id}:hero-seen', () => {
    // Insercao com key incorreta — deve retornar null.
    localStorage.setItem('library:lesson:wrong-format', 'true');
    localStorage.setItem('hero-seen:abc-123', 'true');
    const flag = readHeroSeenFlag('abc-123');
    expect(flag).toBeNull();
  });

  it('readHeroSeenFlag deve retornar null quando localStorage.getItem lanca erro (private mode)', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    const flag = readHeroSeenFlag('any-id');
    expect(flag).toBeNull();
    spy.mockRestore();
  });

  // ---- writeHeroSeenFlag -------------------------------------------------

  it('writeHeroSeenFlag deve setar string "true" na key canonica', () => {
    const ok = writeHeroSeenFlag('lesson-xyz');
    expect(localStorage.getItem('library:lesson:lesson-xyz:hero-seen')).toBe(
      'true',
    );
    expect(ok).toBe(true);
  });

  it('writeHeroSeenFlag deve retornar false quando localStorage.setItem lanca (quota cheia)', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    const ok = writeHeroSeenFlag('any-id');
    expect(ok).toBe(false);
    spy.mockRestore();
  });

  it('writeHeroSeenFlag deve ser idempotente — chamar 2x nao quebra', () => {
    const ok1 = writeHeroSeenFlag('lesson-1');
    const ok2 = writeHeroSeenFlag('lesson-1');
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(localStorage.getItem('library:lesson:lesson-1:hero-seen')).toBe(
      'true',
    );
  });

  // ---- clearHeroSeenFlag --------------------------------------------------

  it('clearHeroSeenFlag deve remover a flag', () => {
    localStorage.setItem('library:lesson:lesson-2:hero-seen', 'true');
    clearHeroSeenFlag('lesson-2');
    expect(
      localStorage.getItem('library:lesson:lesson-2:hero-seen'),
    ).toBeNull();
  });

  it('clearHeroSeenFlag deve ser silent quando flag nao existe', () => {
    expect(() => clearHeroSeenFlag('nonexistent-id')).not.toThrow();
  });

  it('clearHeroSeenFlag deve ser silent quando localStorage.removeItem lanca', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    expect(() => clearHeroSeenFlag('any-id')).not.toThrow();
    spy.mockRestore();
  });

  // ---- namespace isolation ------------------------------------------------

  it('deve isolar flags entre lessonIds diferentes', () => {
    writeHeroSeenFlag('lesson-A');
    expect(readHeroSeenFlag('lesson-A')).toBe('true');
    expect(readHeroSeenFlag('lesson-B')).toBeNull();

    writeHeroSeenFlag('lesson-B');
    expect(readHeroSeenFlag('lesson-A')).toBe('true');
    expect(readHeroSeenFlag('lesson-B')).toBe('true');

    clearHeroSeenFlag('lesson-A');
    expect(readHeroSeenFlag('lesson-A')).toBeNull();
    expect(readHeroSeenFlag('lesson-B')).toBe('true');
  });
});
