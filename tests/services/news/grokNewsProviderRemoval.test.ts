/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-12: Cleanup `grokNewsProvider.ts` legacy.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-12
 *
 * Status RED: arquivo ainda existe + imports referenciando ainda existem.
 *   - DELETE server/services/grokNewsProvider.ts
 *   - grep -r "grokNewsProvider" server/ tests/ client/ retorna 0 matches
 *   - npm run check passa (sem unresolved imports)
 *
 * Implementer deve apagar arquivo + remover imports em routes/news.ts e
 * jobs/refreshNews.ts.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

describe('grokNewsProvider removal (RF-12)', () => {
  it('arquivo server/services/grokNewsProvider.ts NAO existe', async () => {
    // RF-12 AC: arquivo removido
    const filePath = path.join(PROJECT_ROOT, 'server', 'services', 'grokNewsProvider.ts');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('zero imports de grokNewsProvider em server/', async () => {
    // RF-12 AC: imports limpos em server/
    const serverDir = path.join(PROJECT_ROOT, 'server');
    const offenders = findReferencesInDir(serverDir, 'grokNewsProvider');
    expect(offenders).toEqual([]);
  });

  it('zero imports de grokNewsProvider em client/', async () => {
    const clientDir = path.join(PROJECT_ROOT, 'client');
    const offenders = findReferencesInDir(clientDir, 'grokNewsProvider');
    expect(offenders).toEqual([]);
  });

  it('zero imports de fetchGrokNews em server/', async () => {
    // RF-12 AC: simbolos exportados removidos das call sites
    const serverDir = path.join(PROJECT_ROOT, 'server');
    const offenders = findReferencesInDir(serverDir, 'fetchGrokNews');
    expect(offenders).toEqual([]);
  });
});

// =============================================================================
// Helper recursivo (apenas .ts/.tsx, ignora node_modules + dist + build)
// =============================================================================
function findReferencesInDir(dir: string, needle: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const queue: string[] = [dir];
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.turbo']);
  while (queue.length > 0) {
    const current = queue.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|cjs|mjs)$/.test(entry.name)) continue;
      // skip esta propria suite de testes (referencia o nome para verificar)
      if (full.endsWith('grokNewsProviderRemoval.test.ts')) continue;
      try {
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes(needle)) out.push(full);
      } catch {
        // ignore
      }
    }
  }
  return out;
}
