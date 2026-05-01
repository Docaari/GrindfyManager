import { beforeEach, vi } from 'vitest';
import Module from 'module';
import path from 'path';
import fs from 'fs';

// jest-dom matchers (toBeInTheDocument, etc.) — so loaded em ambiente jsdom.
// Em ambiente node, este import e no-op para os matchers (eles ainda sao registrados
// mas so funcionam se window/document existirem).
import '@testing-library/jest-dom/vitest';

// Polyfills para Radix UI em jsdom: ResizeObserver, IntersectionObserver, scrollIntoView,
// matchMedia, hasPointerCapture (jsdom nao implementa essas APIs).
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).window !== 'undefined') {
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!(globalThis as any).IntersectionObserver) {
    (globalThis as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    };
  }
  // matchMedia stub
  if (!(window as any).matchMedia) {
    (window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
  // Element.prototype.scrollIntoView (Radix Select usa)
  if (!(Element.prototype as any).scrollIntoView) {
    (Element.prototype as any).scrollIntoView = () => {};
  }
  // Element.prototype.hasPointerCapture (Radix usa)
  if (!(Element.prototype as any).hasPointerCapture) {
    (Element.prototype as any).hasPointerCapture = () => false;
    (Element.prototype as any).releasePointerCapture = () => {};
    (Element.prototype as any).setPointerCapture = () => {};
  }
}

// Patch require to resolve .ts files (needed for TDD try/catch require pattern in tests)
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, ...args: any[]) {
  try {
    return originalResolveFilename.call(this, request, parent, ...args);
  } catch (err: any) {
    if (err.code === 'MODULE_NOT_FOUND') {
      // Try with .ts extension
      const parentDir = parent?.filename ? path.dirname(parent.filename) : process.cwd();
      const resolved = path.resolve(parentDir, request + '.ts');
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
    throw err;
  }
};

// Set required environment variables for tests
process.env.JWT_SECRET = 'test-jwt-secret-for-vitest';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-vitest';
// ADR-060 (Sprint Bankroll-3 RF-6): release endpoint default OFF in prod;
// tests need it ON to assert happy path.
process.env.ALLOW_STOP_LOCK_RELEASE = 'true';

// Mock database module to prevent DATABASE_URL requirement in unit tests
vi.mock('../server/db', () => ({
  db: {},
  pool: {},
}));

import { _resetLibraryStore } from '../server/library-storage';

// =============================================================================
// TTS / SpeechSynthesis polyfill (Sprint Alarmes 2.0).
// O modulo narrationQueue mantem state global (`_currentlySpeaking`, `_queue`,
// `_alertTimeouts`). Sem reset entre testes -> pollution.
// `vi.fn()` NAO eh constructor, entao `SpeechSynthesisUtterance` precisa ser
// uma class real para `new SpeechSynthesisUtterance(text)` funcionar.
// =============================================================================
class MockSpeechSynthesisUtterance {
  text: string;
  voice: any = null;
  volume = 1;
  rate = 1;
  pitch = 1;
  lang = 'pt-BR';
  onend: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onstart: ((ev: any) => void) | null = null;
  constructor(text?: string) {
    this.text = text ?? '';
  }
}

(globalThis as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

const speechSynthesisMock = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => [] as any[]),
  speaking: false,
  paused: false,
  pending: false,
  onvoiceschanged: null as any,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(() => false),
};

(globalThis as any).speechSynthesis = speechSynthesisMock;
if (typeof (globalThis as any).window !== 'undefined') {
  (globalThis as any).window.speechSynthesis = speechSynthesisMock;
  (globalThis as any).window.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
}

// Disponivel para os testes: helpers para acessar/resetar o mock global.
(globalThis as any).__speechSynthesisMock = speechSynthesisMock;

beforeEach(() => {
  _resetLibraryStore();
  // B1 do reviewer: in-memory ticket store removido — testes de tickets
  // declaram seus proprios vi.mock('../../../server/db', ...) com Drizzle-shape.

  // Reset speechSynthesis mock state.
  speechSynthesisMock.speak.mockClear();
  speechSynthesisMock.cancel.mockClear();
  speechSynthesisMock.pause.mockClear();
  speechSynthesisMock.resume.mockClear();
  speechSynthesisMock.getVoices.mockReset();
  speechSynthesisMock.getVoices.mockReturnValue([]);
  speechSynthesisMock.addEventListener.mockClear();
  speechSynthesisMock.removeEventListener.mockClear();
  speechSynthesisMock.speaking = false;
  speechSynthesisMock.paused = false;
  speechSynthesisMock.pending = false;
  speechSynthesisMock.onvoiceschanged = null;

  // Reset narrationQueue module-level state se o modulo ja foi importado.
  // (try/catch porque modulo pode nao existir ainda em red phase).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../client/src/lib/tts/narrationQueue');
    if (typeof mod.__resetForTesting === 'function') {
      mod.__resetForTesting();
    }
  } catch {
    // narrationQueue ainda nao implementado — red phase.
  }

  // fxResolver cache reset entre testes (Sprint Bankroll-3 RF-11).
  // HIGH-3 fix round 2: import explicito do reset; antes vivia em globalThis
  // como anti-pattern. require() funciona porque setup.ts roda via vitest
  // que ja resolveu .ts.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fxMod = require('../server/services/fxResolver');
    if (typeof fxMod._resetCacheForTests === 'function') {
      fxMod._resetCacheForTests();
    }
  } catch {
    // modulo ainda nao carregado — ok
  }
  // Compat: zera cache via globalThis se algum teste ainda usar a abordagem antiga.
  try {
    const fxCache = (globalThis as any).__fxResolverCache;
    if (fxCache && typeof fxCache.clear === 'function') fxCache.clear();
  } catch {
    // ok
  }
});
