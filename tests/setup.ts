import { beforeEach, vi } from 'vitest';

// Mock database module to prevent DATABASE_URL requirement in unit tests
vi.mock('../server/db', () => ({
  db: {},
  pool: {},
}));

import { _resetLibraryStore } from '../server/library-storage';

beforeEach(() => {
  _resetLibraryStore();
});
