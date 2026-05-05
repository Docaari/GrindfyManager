/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-3 — RF-C1, RF-C3, RF-C4 (Quick Wins).
 *
 * Spec: Docs/specs/home-reform-3.md §RF-C1, §RF-C3, §RF-C4
 *
 * Status RED:
 *   RF-C1: StatusStrip atual KPI Hoje linka pra "/coach", deve linkar pra "/grade-planner".
 *   RF-C3: TournamentRecommendations atual nao aplica visual diferenciado a grade S.
 *   RF-C4: TournamentRecommendations atual nao renderiza badge "Ja na grade".
 *
 * Lessons aplicadas:
 *   #14 await import(...) ESM compat
 *   #2  data-testid estavel
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock wouter Link para inspecionar href.
vi.mock('wouter', () => ({
  Link: ({ children, href }: any) => (
    <a href={href} data-testid="wouter-link" data-href={href}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/tracker', () => ({ emit: vi.fn() }));

// =============================================================================
// RF-C1 — KPI "Hoje" linka /grade-planner
// =============================================================================

describe('StatusStrip — RF-C1 KPI Hoje linka /grade-planner', () => {
  function findHrefForKpi(container: HTMLElement, testId: string): string {
    // O wouter Link mock cria <a href="..."> ao redor de <a data-testid="...">.
    // Buscamos qualquer ancestral <a> que tenha href setado.
    const card = container.querySelector(`[data-testid="${testId}"]`);
    if (!card) return '';
    let cur: Element | null = card;
    while (cur) {
      if (cur.tagName === 'A') {
        const href = cur.getAttribute('href') ?? cur.getAttribute('data-href');
        if (href && href.length > 0) return href;
      }
      cur = cur.parentElement;
    }
    return '';
  }

  it('KPI Hoje tem href="/grade-planner" (NAO /coach)', async () => {
    const { default: StatusStrip } = await import('@/components/home/StatusStrip');
    const data: any = {
      banca: null,
      roi30d: null,
      today: { plannedCount: 3, firstStartTime: '20:00', realizedPnlUsd: null },
      pendencias: null,
    };
    const { container } = render(<StatusStrip data={data} />);
    const href = findHrefForKpi(container, 'status-strip-card-hoje');
    expect(href).toBe('/grade-planner');
  });

  it('NAO mais aponta para /coach', async () => {
    const { default: StatusStrip } = await import('@/components/home/StatusStrip');
    const data: any = {
      banca: null,
      roi30d: null,
      today: { plannedCount: 0, firstStartTime: null, realizedPnlUsd: null },
      pendencias: null,
    };
    const { container } = render(<StatusStrip data={data} />);
    const href = findHrefForKpi(container, 'status-strip-card-hoje');
    expect(href).not.toBe('/coach');
    expect(href.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// RF-C3 + RF-C4 removidos (2026-05-05): TournamentRecommendations substituido
// por GradeTodayCard em Sprint home-reform-4 item 5. Coverage residual em
// tests/components/home/__tests__/GradeTodayCard.test.tsx.
// =============================================================================
