// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint UX-Biblioteca-1 / RF-03
//
// Spec: Docs/specs/ux-biblioteca-1.md RF-03
// ADR:  Docs/architecture/decisions/104-library-video-speed-global-localstorage.md
//
// Modulo target: client/src/lib/library-video-speed-storage.ts (NAO EXISTE)
//
// Storage key canonica: library-video-speed (string serializada de numero).
// Helpers expostos:
//   - readVideoSpeed(): number (default 1.0; range valido 0.5..3.0)
//   - writeVideoSpeed(speed: number): void (silent fallback em quota/private)
//   - LIBRARY_VIDEO_SPEED_STORAGE_KEY: const exportada
//   - DEFAULT_VIDEO_SPEED: const exportada (= 1.0)
//
// Lessons aplicadas:
//   #14 isolamento (clear localStorage entre testes)
//   #15 polyfill MemoryStorage ja em tests/setup.ts cobre Storage.prototype
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Modulo target — RED phase (stub criado pelo test-writer).
import {
  readVideoSpeed,
  writeVideoSpeed,
  LIBRARY_VIDEO_SPEED_STORAGE_KEY,
  DEFAULT_VIDEO_SPEED,
} from '../library-video-speed-storage';

beforeEach(() => {
  // Limpa localStorage entre testes (lesson #14 — isolamento).
  try {
    localStorage.clear();
  } catch {
    // ok — pode estar mocked / indisponivel
  }
});

describe('library-video-speed-storage — constants (RF-03)', () => {
  it('LIBRARY_VIDEO_SPEED_STORAGE_KEY deve ser "library-video-speed"', () => {
    expect(LIBRARY_VIDEO_SPEED_STORAGE_KEY).toBe('library-video-speed');
  });

  it('DEFAULT_VIDEO_SPEED deve ser 1.0', () => {
    expect(DEFAULT_VIDEO_SPEED).toBe(1.0);
  });
});

describe('readVideoSpeed — RF-03 happy path', () => {
  it('deve retornar 1.0 quando localStorage esta vazio', () => {
    const speed = readVideoSpeed();
    expect(speed).toBe(1.0);
  });

  it('deve retornar valor numerico persistido (1.5)', () => {
    localStorage.setItem('library-video-speed', '1.5');
    expect(readVideoSpeed()).toBe(1.5);
  });

  it('deve retornar valor minimo valido (0.5)', () => {
    localStorage.setItem('library-video-speed', '0.5');
    expect(readVideoSpeed()).toBe(0.5);
  });

  it('deve retornar valor maximo valido (3.0)', () => {
    localStorage.setItem('library-video-speed', '3');
    expect(readVideoSpeed()).toBe(3.0);
  });

  it('deve usar a key canonica "library-video-speed"', () => {
    // Chave errada -> fallback default.
    localStorage.setItem('video-speed', '2.0');
    localStorage.setItem('library:video-speed', '2.0');
    expect(readVideoSpeed()).toBe(1.0);
  });
});

describe('readVideoSpeed — edge cases (RF-03)', () => {
  it('deve retornar 1.0 quando valor armazenado eh "abc" (NaN)', () => {
    localStorage.setItem('library-video-speed', 'abc');
    expect(readVideoSpeed()).toBe(1.0);
  });

  it('deve retornar 1.0 quando valor armazenado eh string vazia', () => {
    localStorage.setItem('library-video-speed', '');
    expect(readVideoSpeed()).toBe(1.0);
  });

  it('deve retornar 1.0 quando valor armazenado eh "99" (acima do range)', () => {
    localStorage.setItem('library-video-speed', '99');
    expect(readVideoSpeed()).toBe(1.0);
  });

  it('deve retornar 1.0 quando valor armazenado eh negativo', () => {
    localStorage.setItem('library-video-speed', '-1');
    expect(readVideoSpeed()).toBe(1.0);
  });

  it('deve retornar 1.0 quando valor armazenado eh 0 (abaixo do minimo 0.5)', () => {
    localStorage.setItem('library-video-speed', '0');
    expect(readVideoSpeed()).toBe(1.0);
  });

  it('deve retornar 1.0 quando valor armazenado eh "Infinity"', () => {
    localStorage.setItem('library-video-speed', 'Infinity');
    expect(readVideoSpeed()).toBe(1.0);
  });

  it('deve retornar 1.0 quando localStorage.getItem lanca (private mode)', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    expect(readVideoSpeed()).toBe(1.0);
    spy.mockRestore();
  });
});

describe('writeVideoSpeed — RF-03 happy path', () => {
  it('deve persistir valor 1.5 na key canonica', () => {
    writeVideoSpeed(1.5);
    expect(localStorage.getItem('library-video-speed')).toBe('1.5');
  });

  it('deve persistir valor 1.0 (default explicito)', () => {
    writeVideoSpeed(1.0);
    expect(localStorage.getItem('library-video-speed')).toBe('1');
  });

  it('deve persistir valor maximo (3.0)', () => {
    writeVideoSpeed(3.0);
    expect(localStorage.getItem('library-video-speed')).toBe('3');
  });

  it('deve persistir valor minimo (0.5)', () => {
    writeVideoSpeed(0.5);
    expect(localStorage.getItem('library-video-speed')).toBe('0.5');
  });

  it('deve sobrescrever valor anterior', () => {
    writeVideoSpeed(1.0);
    writeVideoSpeed(2.0);
    expect(localStorage.getItem('library-video-speed')).toBe('2');
  });
});

describe('writeVideoSpeed — edge cases (RF-03)', () => {
  it('deve REJEITAR valor NaN (nao escreve)', () => {
    writeVideoSpeed(Number.NaN);
    expect(localStorage.getItem('library-video-speed')).toBeNull();
  });

  it('deve REJEITAR valor Infinity (nao escreve)', () => {
    writeVideoSpeed(Number.POSITIVE_INFINITY);
    expect(localStorage.getItem('library-video-speed')).toBeNull();
  });

  it('deve REJEITAR valor acima de 3.0 (nao escreve)', () => {
    writeVideoSpeed(99);
    expect(localStorage.getItem('library-video-speed')).toBeNull();
  });

  it('deve REJEITAR valor abaixo de 0.5 (nao escreve)', () => {
    writeVideoSpeed(0.1);
    expect(localStorage.getItem('library-video-speed')).toBeNull();
  });

  it('deve REJEITAR valor negativo (nao escreve)', () => {
    writeVideoSpeed(-1);
    expect(localStorage.getItem('library-video-speed')).toBeNull();
  });

  it('NAO deve crashear quando localStorage.setItem lanca (quota/private)', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    // Nao deve throw — fallback silencioso conforme ADR-104.
    expect(() => writeVideoSpeed(1.5)).not.toThrow();
    spy.mockRestore();
  });
});

describe('library-video-speed-storage — round-trip', () => {
  it('write seguido de read deve devolver mesmo valor (1.25)', () => {
    writeVideoSpeed(1.25);
    expect(readVideoSpeed()).toBe(1.25);
  });

  it('write 1.75 + read = 1.75', () => {
    writeVideoSpeed(1.75);
    expect(readVideoSpeed()).toBe(1.75);
  });
});
