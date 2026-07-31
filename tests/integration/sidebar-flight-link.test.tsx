/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint coach-page-reform-1 — RF-07.2: Sidebar item "Flight" path migrado.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-07.2.
 * Diagrama: routes-migration.mermaid
 *
 * Comportamento:
 *   - Sidebar.tsx linha 93 (grupo JOGAR, item label="Flight"):
 *     - path antigo: '/flight'
 *     - path novo:   '/coach?tab=flights'
 *   - Label "Flight" e icon Layers MANTIDOS.
 *   - Active state: quando location === /coach E search.tab === flights,
 *     item Flight destaca (RF-07.2 mitigacao se possivel).
 *
 * Lessons:
 *   #19 — CTA targets devem casar com rotas Wouter registradas.
 *   #14 — await import() em test .tsx.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import React from 'react';

// Mock auth context — Sidebar provavelmente le user.
vi.mock('@/contexts/AuthContext', async () => {
  return {
    useAuth: () => ({
      user: { id: 'u1', userPlatformId: 'USER-0001', isAdmin: false },
      isAuthenticated: true,
      isLoading: false,
    }),
    AuthProvider: ({ children }: any) => children,
  };
});

// Mock SidebarContext (collapse state).
vi.mock('@/contexts/SidebarContext', async () => {
  return {
    useSidebar: () => ({ collapsed: false, toggle: vi.fn() }),
    SidebarProvider: ({ children }: any) => children,
  };
});

async function loadSidebar() {
  // @ts-expect-error - red phase
  const mod: any = await import('@/components/Sidebar');
  return (mod.Sidebar ?? mod.default) as React.FC<any>;
}

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sidebar — item Flight foi removido (acesso por Grade)', () => {
  // Decisão do founder (2026-07-31): "Flight" e "Torneios" saíram da barra
  // lateral porque os dois já são alcançáveis de dentro de "Grade" — eram porta
  // duplicada para o mesmo destino. O teste antigo garantia a existência do
  // item; agora garante o contrário, e que a porta legítima continua de pé.
  it('não renderiza mais um item "Flight" na barra', async () => {
    const Sidebar = await loadSidebar();
    const { hook } = memoryLocation({ path: '/' });
    render(
      <Router hook={hook}>
        <Sidebar />
      </Router>
    );

    const flightAnchor = Array.from(document.querySelectorAll('a')).find((a) =>
      /Flight/i.test(a.textContent || ''),
    );
    expect(flightAnchor).toBeUndefined();
  });

  it('mantém o acesso a "Grade", de onde os flights são abertos', async () => {
    const Sidebar = await loadSidebar();
    const { hook } = memoryLocation({ path: '/' });
    render(
      <Router hook={hook}>
        <Sidebar />
      </Router>
    );

    const gradeAnchor = Array.from(document.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/coach',
    );
    expect(gradeAnchor).toBeTruthy();
    expect(gradeAnchor!.textContent).toMatch(/Grade/i);
  });
});
