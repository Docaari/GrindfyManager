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

// Mock database module to prevent DATABASE_URL requirement in unit tests
vi.mock('../server/db', () => ({
  db: {},
  pool: {},
}));

import { _resetLibraryStore } from '../server/library-storage';

beforeEach(() => {
  _resetLibraryStore();
});
