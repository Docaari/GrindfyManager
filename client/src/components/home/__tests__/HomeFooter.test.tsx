/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-18 (S12 footer minimalista).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-18, §5.12 S12
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/HomeFooter.tsx`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

vi.mock('@/components/BugReportModal', () => ({
  default: ({ trigger }: any) => (
    <div data-testid="bug-report-modal-stub">{trigger}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<HomeFooter /> — 4 links', () => {
  it('renderiza 4 elementos: Bug report + Discord + Suporte + versao', async () => {
    const { default: HomeFooter } = await import('../HomeFooter');
    render(<HomeFooter />);
    expect(screen.getByTestId('home-footer-bug-report')).toBeInTheDocument();
    expect(screen.getByTestId('home-footer-discord')).toBeInTheDocument();
    expect(screen.getByTestId('home-footer-suporte')).toBeInTheDocument();
    expect(screen.getByTestId('home-footer-versao')).toBeInTheDocument();
  });

  it('versao NAO eh clicavel (texto plain)', async () => {
    const { default: HomeFooter } = await import('../HomeFooter');
    render(<HomeFooter />);
    const versao = screen.getByTestId('home-footer-versao');
    // Nao deve ser <a> ou <button>
    expect(versao.tagName).not.toBe('A');
    expect(versao.tagName).not.toBe('BUTTON');
  });
});

describe('<HomeFooter /> — bug report integration', () => {
  it('bug report click abre modal stub (BugReportModal)', async () => {
    const { default: HomeFooter } = await import('../HomeFooter');
    render(<HomeFooter />);
    expect(screen.getByTestId('bug-report-modal-stub')).toBeInTheDocument();
  });
});
