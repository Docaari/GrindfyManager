/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-10: Limpar dual CTAs legacy do summary
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-10)
 *
 * Validacao via grep:
 *   - data-testid="summary-modal-cta-quick" -> 0 matches
 *   - data-testid="summary-modal-cta-full" -> 0 matches
 *   - data-testid="summary-modal-cta-skip" -> 0 matches
 *   - data-testid="cta-start-cooldown" -> >=1 match
 *   - data-testid="cta-finalize-session" -> >=1 match
 *
 * Implementer deve substituir os legacy pelos novos.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function listClientFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // skip __tests__ e node_modules
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      listClientFiles(full, acc);
    } else if (
      e.isFile() &&
      (e.name.endsWith('.tsx') || e.name.endsWith('.ts'))
    ) {
      acc.push(full);
    }
  }
  return acc;
}

const clientRoot = path.resolve(__dirname, '../../../client/src');

describe('RF-10: cleanup dual CTAs do summary', () => {
  it('summary-modal-cta-quick: 0 matches em arquivos client (sem testes)', () => {
    const files = listClientFiles(clientRoot);
    const matches: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('summary-modal-cta-quick')) {
        matches.push(f);
      }
    }
    expect(matches).toEqual([]);
  });

  it('summary-modal-cta-full: 0 matches em arquivos client (sem testes)', () => {
    const files = listClientFiles(clientRoot);
    const matches: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('summary-modal-cta-full')) {
        matches.push(f);
      }
    }
    expect(matches).toEqual([]);
  });

  it('summary-modal-cta-skip: 0 matches em arquivos client (sem testes)', () => {
    const files = listClientFiles(clientRoot);
    const matches: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('summary-modal-cta-skip')) {
        matches.push(f);
      }
    }
    expect(matches).toEqual([]);
  });

  it('cta-start-cooldown ainda existe (>= 1 match)', () => {
    const files = listClientFiles(clientRoot);
    let total = 0;
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('cta-start-cooldown')) total++;
    }
    expect(total).toBeGreaterThanOrEqual(1);
  });

  it('cta-finalize-session ainda existe (>= 1 match)', () => {
    const files = listClientFiles(clientRoot);
    let total = 0;
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('cta-finalize-session')) total++;
    }
    expect(total).toBeGreaterThanOrEqual(1);
  });
});
