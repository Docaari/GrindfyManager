// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-04 — Sidebar item "Coach IA" → /coach-ai
//
// ADR-148 ja consolidou Sidebar item Coach IA = `/coach-ai`. Este teste valida
// regressao: item label "Coach IA" continua apontando `/coach-ai`. Itens legacy
// "Grade" + "Flight" usam `/coach*` (rota legacy preservada 90d) — fora do escopo
// deste teste.
//
// Cobertura:
//   - Sidebar renderiza link com label "Coach IA" e href="/coach-ai".
//
// Lessons:
//   #29: Sidebar usa useQuery internamente — wrap em QueryClientProvider OU
//        confiar no ErrorBoundary local da Sidebar (lesson #29 ja resolveu).
//   #19: validar target casa com rota Wouter registrada.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

// Sidebar tem ErrorBoundary local (lesson #29) — useQuery sem provider fica null
// silenciosamente. Funciona standalone.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { userPlatformId: 'USER-X', subscriptionPlan: 'active', name: 'X' },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Sidebar — RF-04 item "Coach IA" aponta /coach-ai', () => {
  it('renderiza link "Coach IA" com href /coach-ai', async () => {
    const mod: any = await import('@/components/Sidebar');
    const Sidebar = mod.default ?? mod.Sidebar;
    expect(Sidebar).toBeDefined();

    render(
      <React.Fragment>
        <Sidebar />
      </React.Fragment>,
    );

    // Por nome do label visual.
    const link = screen.getByText('Coach IA').closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/coach-ai');
  });
});
