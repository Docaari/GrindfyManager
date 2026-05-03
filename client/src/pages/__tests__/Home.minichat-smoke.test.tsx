/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — F9 / D2 (MiniChat global continua acessivel).
 *
 * Spec : Docs/specs/home-reform-1.md §3 D2, §5.10 F9, §RNF-07
 * ADR  : Docs/architecture/decisions/099-home-operations-cockpit-pattern.md §4.3
 *
 * F9 NAO cria embed na Home — apenas verifica que <MiniChat> em App.tsx
 * continua montado. Teste smoke por importacao do App ja eh complexo, entao
 * validamos via assertion de presenca em App.tsx (grep semantico).
 *
 * Status RED: este teste eh "sempre passa" depois de Home reformada — eh
 * uma asseguracao de que <MiniChat /> NAO foi acidentalmente removido
 * em refactor.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const APP_TSX = path.resolve(
  __dirname,
  '..',
  '..',
  'App.tsx',
);

describe('Home reform — F9 MiniChat global preservado (D2 / RNF-07)', () => {
  it('App.tsx ainda monta <MiniChat />', () => {
    const src = fs.readFileSync(APP_TSX, 'utf8');
    // Regex: monta tag <MiniChat /> ou <MiniChat>...</MiniChat>
    expect(/<MiniChat\s*\/?>/.test(src)).toBe(true);
  });

  it('App.tsx ainda importa MiniChat', () => {
    const src = fs.readFileSync(APP_TSX, 'utf8');
    expect(/import\s+MiniChat\s+from|import\s+\{[^}]*MiniChat[^}]*\}\s+from/.test(src)).toBe(true);
  });
});
