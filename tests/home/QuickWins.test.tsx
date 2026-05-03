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
// RF-C3 — TournamentRecommendations grade S destaque visual
// =============================================================================

describe('TournamentRecommendationCard — RF-C3 grade S destaque', () => {
  it('grade S aplica visual destacado com gradient (RF-C3)', async () => {
    const { default: TournamentRecommendations } = await import(
      '@/components/home/TournamentRecommendations'
    );
    const data: any = [
      {
        id: 'rec-S',
        name: 'Sunday Million',
        buyinUsd: 215,
        buyinNative: 215,
        currency: 'USD',
        score: 95,
        grade: 'S',
        startTime: '20:00',
        platform: 'PokerStars',
        alreadyInGrid: false,
      },
    ];
    render(<TournamentRecommendations data={data} plannedTodayCount={5} />);
    const card = screen.getByTestId('home-tournament-recommendations-card-rec-S');
    const html = card.outerHTML.toLowerCase();
    // Spec RF-C3: bg-gradient-to-br from-emerald-500/10 to-emerald-300/5
    expect(html).toMatch(/bg-gradient/);
    expect(html).toMatch(/emerald/);
  });

  it('grade A NAO aplica visual S (nem gradient)', async () => {
    const { default: TournamentRecommendations } = await import(
      '@/components/home/TournamentRecommendations'
    );
    const data: any = [
      {
        id: 'rec-A',
        name: 'Daily Cooldown',
        buyinUsd: 22,
        buyinNative: 22,
        currency: 'USD',
        score: 80,
        grade: 'A',
        startTime: '20:00',
        platform: 'PokerStars',
        alreadyInGrid: false,
      },
    ];
    render(<TournamentRecommendations data={data} plannedTodayCount={5} />);
    const card = screen.getByTestId('home-tournament-recommendations-card-rec-A');
    expect(card.outerHTML.toLowerCase()).not.toMatch(/bg-gradient/);
  });

  it('score em text-2xl font-bold', async () => {
    const { default: TournamentRecommendations } = await import(
      '@/components/home/TournamentRecommendations'
    );
    const data: any = [
      {
        id: 'rec-S2',
        name: 'High Roller',
        buyinUsd: 1000,
        buyinNative: 1000,
        currency: 'USD',
        score: 92,
        grade: 'S',
        startTime: '21:00',
        platform: 'PokerStars',
        alreadyInGrid: false,
      },
    ];
    render(<TournamentRecommendations data={data} plannedTodayCount={5} />);
    const card = screen.getByTestId('home-tournament-recommendations-card-rec-S2');
    expect(card.outerHTML).toMatch(/text-2xl/);
    expect(card.outerHTML).toMatch(/font-bold/);
  });
});

// =============================================================================
// RF-C4 — Badge "Ja na grade"
// =============================================================================

describe('TournamentRecommendationCard — RF-C4 badge "Ja na grade"', () => {
  it('renderiza badge quando alreadyInGrid=true', async () => {
    const { default: TournamentRecommendations } = await import(
      '@/components/home/TournamentRecommendations'
    );
    const data: any = [
      {
        id: 'rec-X',
        name: 'Sunday Million',
        buyinUsd: 215,
        buyinNative: 215,
        currency: 'USD',
        score: 88,
        grade: 'A',
        startTime: '20:00',
        platform: 'PokerStars',
        alreadyInGrid: true,
      },
    ];
    render(<TournamentRecommendations data={data} plannedTodayCount={5} />);
    const badge = screen.getByTestId('recommendation-already-in-grid-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent ?? '').toMatch(/ja na grade/i);
  });

  it('NAO renderiza badge quando alreadyInGrid=false', async () => {
    const { default: TournamentRecommendations } = await import(
      '@/components/home/TournamentRecommendations'
    );
    const data: any = [
      {
        id: 'rec-Y',
        name: 'Daily',
        buyinUsd: 22,
        buyinNative: 22,
        currency: 'USD',
        score: 80,
        grade: 'A',
        startTime: '20:00',
        platform: 'PokerStars',
        alreadyInGrid: false,
      },
    ];
    render(<TournamentRecommendations data={data} plannedTodayCount={5} />);
    expect(screen.queryByTestId('recommendation-already-in-grid-badge')).not.toBeInTheDocument();
  });

  it('NAO renderiza badge quando alreadyInGrid undefined (defensivo)', async () => {
    const { default: TournamentRecommendations } = await import(
      '@/components/home/TournamentRecommendations'
    );
    const data: any = [
      {
        id: 'rec-Z',
        name: 'Mystery',
        buyinUsd: 50,
        buyinNative: 50,
        currency: 'USD',
        score: 75,
        grade: 'B',
        startTime: '20:00',
        platform: 'PokerStars',
        // alreadyInGrid omitido
      },
    ];
    render(<TournamentRecommendations data={data} plannedTodayCount={5} />);
    expect(screen.queryByTestId('recommendation-already-in-grid-badge')).not.toBeInTheDocument();
  });
});
