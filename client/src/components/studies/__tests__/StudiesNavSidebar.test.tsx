/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-01: StudiesNavSidebar
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid: studies-nav-sidebar, studies-nav-item-{view}
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const navigateMock = vi.fn();
const locationStateMock = vi.hoisted(() => ({ path: '/estudos/dashboard' }));

vi.mock('wouter', () => ({
  useLocation: () => [locationStateMock.path, navigateMock],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

// @ts-expect-error - componente nao existe ainda (red phase)
import { StudiesNavSidebar } from '../StudiesNavSidebar';

beforeEach(() => {
  navigateMock.mockReset();
  locationStateMock.path = '/estudos/dashboard';
});

describe('StudiesNavSidebar', () => {
  it('renderiza 5 nav items (Dashboard, Temas, Stats, Spots, Recomendacoes)', () => {
    render(<StudiesNavSidebar />);
    expect(screen.getByTestId('studies-nav-item-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('studies-nav-item-temas')).toBeInTheDocument();
    expect(screen.getByTestId('studies-nav-item-stats')).toBeInTheDocument();
    expect(screen.getByTestId('studies-nav-item-spots')).toBeInTheDocument();
    expect(screen.getByTestId('studies-nav-item-recomendacoes')).toBeInTheDocument();
  });

  it('aplica aria-current="page" no item ativo', () => {
    locationStateMock.path = '/estudos/spots';
    render(<StudiesNavSidebar />);
    expect(screen.getByTestId('studies-nav-item-spots').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('studies-nav-item-temas').getAttribute('aria-current')).not.toBe('page');
  });

  it('startsWith match: /estudos/temas/<id> destaca "Temas"', () => {
    locationStateMock.path = '/estudos/temas/abc123';
    render(<StudiesNavSidebar />);
    expect(screen.getByTestId('studies-nav-item-temas').getAttribute('aria-current')).toBe('page');
  });

  it('click em item chama navigate com path correto', async () => {
    render(<StudiesNavSidebar />);
    await userEvent.click(screen.getByTestId('studies-nav-item-recomendacoes'));
    expect(navigateMock).toHaveBeenCalledWith('/estudos/recomendacoes');
  });

  it('renderiza com data-collapsed quando prop collapsed=true (modo tablet)', () => {
    render(<StudiesNavSidebar collapsed />);
    const root = screen.getByTestId('studies-nav-sidebar');
    expect(root.getAttribute('data-collapsed')).toBe('true');
  });

  it('renderiza StudyStreakBadge no rodape', () => {
    render(<StudiesNavSidebar />);
    expect(screen.getByTestId('study-streak-badge')).toBeInTheDocument();
  });
});
