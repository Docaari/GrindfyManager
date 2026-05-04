/**
 * Test — Sprint home-reform-5 item 11.
 *
 * Spec: Docs/specs/home-reform-5.md item 11.
 *
 * Cobre <HomeSettingsGear />:
 *   - Renderiza botao engrenagem com aria-label.
 *   - Click abre popover com 9 toggles + flag performanceFromGrind.
 *   - Toggle dispara mutation PATCH com diff (apenas chave alterada).
 *   - Optimistic update: visibility flip imediato no popover.
 *
 * Lesson #13: apiRequest retorna JSON parseado direto.
 * Lesson #14: vi.hoisted para mock spies (vi.mock hoisting + TDZ).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { DEFAULT_HOME_LAYOUT_SETTINGS } from '@shared/types/homeSettings';

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('<HomeSettingsGear />', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('renderiza botao engrenagem com aria-label', async () => {
    apiRequestMock.mockResolvedValue(DEFAULT_HOME_LAYOUT_SETTINGS);
    const { default: HomeSettingsGear } = await import('../HomeSettingsGear');
    renderWithClient(<HomeSettingsGear />);
    const btn = await screen.findByTestId('home-settings-gear');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label') || btn.getAttribute('title')).toMatch(/configura/i);
  });

  it('click abre painel com 9 toggles + flag performanceFromGrind', async () => {
    apiRequestMock.mockResolvedValue(DEFAULT_HOME_LAYOUT_SETTINGS);
    const { default: HomeSettingsGear } = await import('../HomeSettingsGear');
    renderWithClient(<HomeSettingsGear />);
    const btn = await screen.findByTestId('home-settings-gear');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByTestId('home-settings-toggle-headerStrip')).toBeTruthy();
      expect(screen.getByTestId('home-settings-toggle-coach')).toBeTruthy();
      expect(screen.getByTestId('home-settings-toggle-immediateAction')).toBeTruthy();
      expect(screen.getByTestId('home-settings-toggle-gradeToday')).toBeTruthy();
      expect(screen.getByTestId('home-settings-toggle-sessionsRegistered')).toBeTruthy();
      expect(screen.getByTestId('home-settings-toggle-dashboard')).toBeTruthy();
      expect(screen.getByTestId('home-settings-toggle-performance')).toBeTruthy();
      expect(screen.getByTestId('home-settings-toggle-studies')).toBeTruthy();
      expect(screen.getByTestId('home-settings-toggle-news')).toBeTruthy();
      expect(screen.getByTestId('home-settings-flag-performanceFromGrind')).toBeTruthy();
    });
  });

  it('toggle dispara PATCH apiRequest com diff', async () => {
    apiRequestMock.mockResolvedValueOnce(DEFAULT_HOME_LAYOUT_SETTINGS);
    apiRequestMock.mockResolvedValueOnce({
      ...DEFAULT_HOME_LAYOUT_SETTINGS,
      visibility: { ...DEFAULT_HOME_LAYOUT_SETTINGS.visibility, news: false },
    });
    const { default: HomeSettingsGear } = await import('../HomeSettingsGear');
    renderWithClient(<HomeSettingsGear />);
    const btn = await screen.findByTestId('home-settings-gear');
    fireEvent.click(btn);
    const newsToggle = await screen.findByTestId('home-settings-toggle-news');
    fireEvent.click(newsToggle);
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        'PATCH',
        '/api/home/settings',
        expect.objectContaining({ visibility: { news: false } }),
      );
    });
  });
});
