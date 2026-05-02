/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-01: StudiesBottomNav (mobile <768px)
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
import { StudiesBottomNav } from '../StudiesBottomNav';

beforeEach(() => {
  navigateMock.mockReset();
  locationStateMock.path = '/estudos/dashboard';
});

describe('StudiesBottomNav', () => {
  it('renderiza 5 botoes nav (mesma ordem da sidebar)', () => {
    render(<StudiesBottomNav />);
    expect(screen.getByTestId('studies-bottom-nav-item-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('studies-bottom-nav-item-temas')).toBeInTheDocument();
    expect(screen.getByTestId('studies-bottom-nav-item-stats')).toBeInTheDocument();
    expect(screen.getByTestId('studies-bottom-nav-item-spots')).toBeInTheDocument();
    expect(screen.getByTestId('studies-bottom-nav-item-recomendacoes')).toBeInTheDocument();
  });

  it('marca aria-current no ativo', () => {
    locationStateMock.path = '/estudos/recomendacoes';
    render(<StudiesBottomNav />);
    expect(
      screen.getByTestId('studies-bottom-nav-item-recomendacoes').getAttribute('aria-current'),
    ).toBe('page');
  });

  it('click em item navega', async () => {
    render(<StudiesBottomNav />);
    await userEvent.click(screen.getByTestId('studies-bottom-nav-item-spots'));
    expect(navigateMock).toHaveBeenCalledWith('/estudos/spots');
  });

  it('container raiz tem altura minima 64px (tap target)', () => {
    render(<StudiesBottomNav />);
    const root = screen.getByTestId('studies-bottom-nav');
    // Espera classe ou style com height >= 64px
    const cls = root.className || '';
    expect(cls).toMatch(/h-(16|\[64px\])|min-h-\[?64/);
  });
});
