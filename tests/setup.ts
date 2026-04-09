import { beforeEach, vi } from 'vitest';
import Module from 'module';
import path from 'path';
import fs from 'fs';

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
