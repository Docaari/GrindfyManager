import { beforeEach, vi } from 'vitest';

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
