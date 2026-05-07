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

describe('Sidebar — item Flight aponta para /coach?tab=flights (RF-07.2)', () => {
  it('renderiza link Flight com href /coach?tab=flights', async () => {
    const Sidebar = await loadSidebar();
    const { hook } = memoryLocation({ path: '/' });
    render(
      <Router hook={hook}>
        <Sidebar />
      </Router>
    );

    // Procura link Flight no sidebar — pode ser <a> ou Link Wouter.
    const allAnchors = Array.from(document.querySelectorAll('a'));
    const flightAnchor = allAnchors.find((a) => /Flight/i.test(a.textContent || ''));
    expect(flightAnchor).toBeTruthy();

    // href deve apontar para /coach?tab=flights.
    const href = flightAnchor!.getAttribute('href') || '';
    expect(href).toBe('/coach?tab=flights');
  });

  it('label "Flight" continua presente (mantido)', async () => {
    const Sidebar = await loadSidebar();
    const { hook } = memoryLocation({ path: '/' });
    render(
      <Router hook={hook}>
        <Sidebar />
      </Router>
    );
    expect(document.body.textContent).toMatch(/Flight/);
  });
});
