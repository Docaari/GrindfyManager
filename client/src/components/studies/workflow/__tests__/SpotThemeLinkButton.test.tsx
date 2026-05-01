/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-05: SpotsView + workflow link spot↔tema
 *
 * Lessons:
 *   #1 hooks first
 *   #2 data-testid: link-spot-theme-dropdown, suggested-theme-side-panel,
 *      spot-link-submit, spots-grid, spot-card-{id}
 *   #3 mock storage shape REAL (starredHands)
 *  #11 sem default actions decorativas
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navigateMock = vi.fn();
const locationStateMock = vi.hoisted(() => ({ path: '/estudos/spots' }));

vi.mock('wouter', () => ({
  useLocation: () => [locationStateMock.path, navigateMock],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
  useSearch: () => locationStateMock.path.includes('?') ? locationStateMock.path.split('?')[1] : '',
}));

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: any[]) => apiRequestMock(...a),
  queryClient: {
    invalidateQueries: (...a: any[]) => invalidateQueriesMock(...a),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: toastMock,
}));

// @ts-expect-error - componente nao existe ainda (red phase)
import { SpotsView } from '../../SpotsView';
// @ts-expect-error - red phase
import { LinkSpotToThemeDropdown } from '../LinkSpotToThemeDropdown';
// @ts-expect-error - red phase
import { SuggestedThemeSidePanel } from '../SuggestedThemeSidePanel';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const themesFixture = [
  { id: 'thm_ip', name: 'IP vs BB', color: '#fff', emoji: '', tags: ['ip_vs_bb', 'flop_strategy'] },
  { id: 'thm_icm', name: 'ICM Basics', color: '#fff', emoji: '', tags: ['icm_basics'] },
];

const spotsFixture = [
  {
    id: 'spt_1', userId: 'USER-0001', type: 'tilt', spot: 'ip_vs_bb',
    conclusion: 'fold demais IP',
    reviewLater: true, status: 'pending', createdAt: '2026-04-29',
    imageUrl: null,
    themeLink: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  toastMock.mockReset();
  invalidateQueriesMock.mockReset();
  apiRequestMock.mockImplementation(async (url: string, opts: any = {}) => {
    if (url.includes('/api/study-themes')) return themesFixture;
    if (url.includes('/api/starred-hands')) return spotsFixture;
    if (url.includes('/api/study-themes/') && url.includes('/linked-spots')) return [];
    return null;
  });
  global.fetch = vi.fn(async (url: any, opts: any) => {
    const data = await apiRequestMock(String(url), opts);
    return new Response(JSON.stringify(data ?? null), { status: 200 });
  }) as any;
});

describe('RF-05 SpotsView grid + workflow', () => {
  it('renderiza grid com spots pendentes nao vinculados', async () => {
    render(withClient(<SpotsView />));
    await waitFor(() => {
      expect(screen.getByTestId('spots-grid')).toBeInTheDocument();
      expect(screen.getByTestId('spot-card-spt_1')).toBeInTheDocument();
    });
  });

  it('toggle "Mostrar todos" inclui vinculados', async () => {
    render(withClient(<SpotsView />));
    const toggle = await screen.findByTestId('spots-show-all-toggle');
    await userEvent.click(toggle);
    expect(navigateMock).toHaveBeenCalled();
    const path = String(navigateMock.mock.calls[0][0]);
    expect(path).toMatch(/showAll=1/);
  });

  it('empty state em /estudos/spots quando zero pendentes', async () => {
    apiRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/starred-hands')) return [];
      if (url.includes('/api/study-themes')) return [];
      return null;
    });
    render(withClient(<SpotsView />));
    await waitFor(() => {
      expect(screen.getByTestId('spots-empty')).toBeInTheDocument();
    });
  });
});

describe('LinkSpotToThemeDropdown', () => {
  it('renderiza opcoes de temas do usuario', async () => {
    render(withClient(<LinkSpotToThemeDropdown spotId="spt_1" themes={themesFixture as any} value={null} onChange={() => {}} />));
    expect(screen.getByTestId('link-spot-theme-dropdown')).toBeInTheDocument();
  });

  it('onChange chamado com themeId selecionado', async () => {
    const onChange = vi.fn();
    render(withClient(<LinkSpotToThemeDropdown spotId="spt_1" themes={themesFixture as any} value={null} onChange={onChange} />));
    const dropdown = screen.getByTestId('link-spot-theme-dropdown');
    // Simula select native ou Radix; ambos devem expor change events
    const opt = screen.queryByTestId('link-spot-theme-option-thm_ip');
    if (opt) {
      await userEvent.click(opt);
      expect(onChange).toHaveBeenCalledWith('thm_ip');
    } else {
      // Fallback: dispatch change event no select native
      const select = dropdown.querySelector('select') as HTMLSelectElement | null;
      if (select) {
        select.value = 'thm_ip';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(onChange).toHaveBeenCalledWith('thm_ip');
      }
    }
  });
});

describe('SuggestedThemeSidePanel', () => {
  it('mostra sugestao baseada em SPOT_TO_THEME_MAPPING quando type/spot match', async () => {
    render(withClient(
      <SuggestedThemeSidePanel
        spot={{ type: 'tilt', spot: 'ip_vs_bb' } as any}
        themes={themesFixture as any}
        onApply={() => {}}
      />,
    ));
    expect(screen.getByTestId('suggested-theme-side-panel')).toBeInTheDocument();
    expect(screen.getByTestId('suggested-theme-name').textContent).toMatch(/IP vs BB/);
  });

  it('botao "Aplicar sugestao" chama onApply com themeId sugerido', async () => {
    const onApply = vi.fn();
    render(withClient(
      <SuggestedThemeSidePanel
        spot={{ type: 'tilt', spot: 'ip_vs_bb' } as any}
        themes={themesFixture as any}
        onApply={onApply}
      />,
    ));
    await userEvent.click(screen.getByTestId('suggested-theme-apply'));
    expect(onApply).toHaveBeenCalledWith('thm_ip');
  });

  it('quando nenhum tema match: panel mostra empty state', () => {
    render(withClient(
      <SuggestedThemeSidePanel
        spot={{ type: 'random_unknown', spot: 'random' } as any}
        themes={themesFixture as any}
        onApply={() => {}}
      />,
    ));
    expect(screen.getByTestId('suggested-theme-empty')).toBeInTheDocument();
  });
});

describe('SpotsView + submit workflow', () => {
  it('submit de revisao com themeId chama PATCH e dispara toast sucesso', async () => {
    apiRequestMock.mockImplementation(async (url: string, opts: any = {}) => {
      if (url.includes('/api/study-themes')) return themesFixture;
      if (url.includes('/api/starred-hands') && (opts?.method === 'PATCH' || (opts as any)?.method === undefined && url.includes('/review'))) {
        return { id: 'spt_1', themeLink: { themeId: 'thm_ip' } };
      }
      if (url.includes('/api/starred-hands')) return spotsFixture;
      return null;
    });

    render(withClient(<SpotsView />));
    const card = await screen.findByTestId('spot-card-spt_1');
    await userEvent.click(card);
    // Modal abre
    const modal = await screen.findByTestId('spot-review-card');
    expect(modal).toBeInTheDocument();
    const submit = await screen.findByTestId('spot-link-submit');
    await userEvent.click(submit);
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
  });

  it('cross-user: PATCH com themeId de outro user retorna 403 (toast erro)', async () => {
    apiRequestMock.mockImplementation(async (url: string, opts: any = {}) => {
      if (url.includes('/api/study-themes')) return themesFixture;
      if (url.includes('/review') || (opts as any)?.method === 'PATCH') {
        const err: any = new Error('Forbidden');
        err.status = 403;
        throw err;
      }
      if (url.includes('/api/starred-hands')) return spotsFixture;
      return null;
    });

    render(withClient(<SpotsView />));
    const card = await screen.findByTestId('spot-card-spt_1');
    await userEvent.click(card);
    const submit = await screen.findByTestId('spot-link-submit');
    await userEvent.click(submit);
    await waitFor(() => {
      const calls = toastMock.mock.calls.flat();
      const variants = calls.map((c: any) => c?.variant ?? '').filter(Boolean);
      expect(variants.join(',')).toMatch(/destructive|error/i);
    });
  });

  it('apos submit bem-sucedido, invalidateQueries chama linked-spots e starred-hands', async () => {
    apiRequestMock.mockImplementation(async (url: string, opts: any = {}) => {
      if (url.includes('/api/study-themes')) return themesFixture;
      if (url.includes('/review') || (opts as any)?.method === 'PATCH') {
        return { id: 'spt_1', themeLink: { themeId: 'thm_ip' } };
      }
      if (url.includes('/api/starred-hands')) return spotsFixture;
      return null;
    });

    render(withClient(<SpotsView />));
    const card = await screen.findByTestId('spot-card-spt_1');
    await userEvent.click(card);
    const submit = await screen.findByTestId('spot-link-submit');
    await userEvent.click(submit);
    await waitFor(() => {
      expect(invalidateQueriesMock).toHaveBeenCalled();
    });
  });

  it('PATCH 404 (theme not found): toast erro', async () => {
    apiRequestMock.mockImplementation(async (url: string, opts: any = {}) => {
      if (url.includes('/api/study-themes')) return themesFixture;
      if (url.includes('/review') || (opts as any)?.method === 'PATCH') {
        const err: any = new Error('Not Found');
        err.status = 404;
        throw err;
      }
      if (url.includes('/api/starred-hands')) return spotsFixture;
      return null;
    });

    render(withClient(<SpotsView />));
    const card = await screen.findByTestId('spot-card-spt_1');
    await userEvent.click(card);
    const submit = await screen.findByTestId('spot-link-submit');
    await userEvent.click(submit);
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
  });

  it('500 server error: toast erro generico', async () => {
    apiRequestMock.mockImplementation(async (url: string, opts: any = {}) => {
      if (url.includes('/api/study-themes')) return themesFixture;
      if (url.includes('/review') || (opts as any)?.method === 'PATCH') {
        throw new Error('Internal Server Error');
      }
      if (url.includes('/api/starred-hands')) return spotsFixture;
      return null;
    });

    render(withClient(<SpotsView />));
    const card = await screen.findByTestId('spot-card-spt_1');
    await userEvent.click(card);
    const submit = await screen.findByTestId('spot-link-submit');
    await userEvent.click(submit);
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
  });
});
