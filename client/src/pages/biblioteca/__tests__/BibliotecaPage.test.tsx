// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint UX-Biblioteca-1 / RF-02
//
// Spec: Docs/specs/ux-biblioteca-1.md RF-02
// ADR:  Docs/architecture/decisions/103-library-access-requests-table.md
//
// Page target: client/src/pages/biblioteca/BibliotecaPage.tsx (existe — modificar)
//
// Mudanca esperada em RF-02:
//   - Substituir <a href="mailto:...">  por <button> que abre <AccessRequestDialog>.
//   - GET /api/library/access-requests/me ao montar -> banner state:
//     - { status: 'pending' } -> botao disabled "Pedido em analise"
//     - { status: 'approved' } -> botao normal "Pedir liberacao"
//     - { status: 'denied' } -> botao normal "Pedir liberacao" (re-pedido permitido)
//     - null (sem pedido) -> botao normal "Pedir liberacao"
//   - Click no botao (estado normal) -> abre modal AccessRequestDialog.
//   - Apos submitted -> banner mostra "Pedido em analise" (refetch ou state local).
//
// Lessons aplicadas:
//   #2  data-testid estavel
//   #13 apiRequest retorna JSON parseado
//   #14 vi.hoisted para spy compartilhado
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: { invalidateQueries: vi.fn() },
  getCsrfToken: () => null,
  initCsrf: vi.fn(),
}));

// Mock auth context — providencia user com plano basico.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      userPlatformId: 'USER-0001',
      email: 'p@test.com',
      username: 'player1',
      name: 'Joao Player',
      firstName: 'Joao',
      lastName: 'Player',
      subscriptionPlan: 'basic',
      permissions: [],
      status: 'active',
    },
    isAuthenticated: true,
    isLoading: false,
    hasAccess: false,
    isAdmin: false,
  }),
}));

// Mock CourseCard / Link rendering — focar testes em banner.
// (Wouter Link funciona ok em jsdom; nao precisa mockar.)

// Page target — modulo existe.
import { BibliotecaPage } from '../BibliotecaPage';

function renderWithQuery() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <BibliotecaPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockReset();
  // Default: empty courses, no access request.
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (url === '/api/library/courses') return [];
    if (url === '/api/library/access-requests/me') return null;
    return null;
  });
  // Limpar localStorage flags do banner (alpha-dismissed nao deve interferir).
  try {
    localStorage.clear();
  } catch {}
});

afterEach(() => cleanup());

// =============================================================================
// RF-02 — banner mostra botao em vez de mailto
// =============================================================================
describe('<BibliotecaPage> — RF-02 banner: button substitui mailto', () => {
  it('deve renderizar banner alpha quando nao foi dismissed', async () => {
    renderWithQuery();
    await waitFor(() => {
      expect(screen.getByTestId('library-alpha-banner')).toBeInTheDocument();
    });
  });

  it('CTA do banner deve ser <button> (NAO <a href="mailto:">)', async () => {
    renderWithQuery();
    await waitFor(() => {
      expect(screen.getByTestId('library-alpha-banner')).toBeInTheDocument();
    });
    const cta = screen.getByTestId('library-alpha-banner-cta');
    expect(cta.tagName).toBe('BUTTON');
    expect(cta.getAttribute('href')).toBeNull();
  });

  it('CTA do banner NAO deve ter href apontando para mailto', async () => {
    renderWithQuery();
    await waitFor(() => {
      expect(screen.getByTestId('library-alpha-banner-cta')).toBeInTheDocument();
    });
    const cta = screen.getByTestId('library-alpha-banner-cta');
    expect(cta.getAttribute('href') ?? '').not.toMatch(/^mailto:/i);
  });
});

// =============================================================================
// RF-02 — GET /me determina estado do banner
// =============================================================================
describe('<BibliotecaPage> — RF-02 banner state via GET /me', () => {
  it('GET /me retorna pending -> banner mostra botao disabled "Pedido em analise"', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/library/courses') return [];
      if (url === '/api/library/access-requests/me') {
        return {
          id: 'req-1',
          status: 'pending',
          createdAt: '2026-05-03T12:00:00Z',
          name: 'Joao Player',
          reason: 'Quero acesso',
        };
      }
      return null;
    });
    renderWithQuery();
    await waitFor(() => {
      const cta = screen.getByTestId('library-alpha-banner-cta');
      expect(cta.textContent ?? '').toMatch(/em analise|pedido enviado|aguardando/i);
    });
    const cta = screen.getByTestId('library-alpha-banner-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it('GET /me retorna approved -> banner mostra botao normal "Pedir liberacao"', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/library/courses') return [];
      if (url === '/api/library/access-requests/me') {
        return {
          id: 'req-1',
          status: 'approved',
          createdAt: '2026-05-03T12:00:00Z',
          name: 'Joao',
          reason: 'Quero acesso',
        };
      }
      return null;
    });
    renderWithQuery();
    await waitFor(() => {
      const cta = screen.getByTestId('library-alpha-banner-cta');
      expect(cta.textContent ?? '').toMatch(/Pedir liberacao|Pedir acesso/i);
    });
    const cta = screen.getByTestId('library-alpha-banner-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
  });

  it('GET /me retorna denied -> banner mostra botao normal "Pedir liberacao" (re-pedido permitido)', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/library/courses') return [];
      if (url === '/api/library/access-requests/me') {
        return {
          id: 'req-1',
          status: 'denied',
          createdAt: '2026-05-03T12:00:00Z',
          name: 'Joao',
          reason: 'Quero',
        };
      }
      return null;
    });
    renderWithQuery();
    await waitFor(() => {
      const cta = screen.getByTestId('library-alpha-banner-cta');
      expect(cta.textContent ?? '').toMatch(/Pedir liberacao|Pedir acesso/i);
    });
    const cta = screen.getByTestId('library-alpha-banner-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
  });

  it('GET /me retorna null -> banner mostra botao normal "Pedir liberacao"', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/library/courses') return [];
      if (url === '/api/library/access-requests/me') return null;
      return null;
    });
    renderWithQuery();
    await waitFor(() => {
      const cta = screen.getByTestId('library-alpha-banner-cta');
      expect(cta.textContent ?? '').toMatch(/Pedir liberacao|Pedir acesso/i);
    });
    const cta = screen.getByTestId('library-alpha-banner-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
  });
});

// =============================================================================
// RF-02 — click no botao abre modal
// =============================================================================
describe('<BibliotecaPage> — RF-02 click no botao abre modal', () => {
  it('click no botao (estado sem-pedido) deve abrir AccessRequestDialog', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/library/courses') return [];
      if (url === '/api/library/access-requests/me') return null;
      return null;
    });
    renderWithQuery();
    await waitFor(() => {
      expect(screen.getByTestId('library-alpha-banner-cta')).toBeInTheDocument();
    });
    // Antes do click — modal nao montado.
    expect(screen.queryByTestId('access-request-dialog')).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('library-alpha-banner-cta'));

    await waitFor(() => {
      expect(screen.getByTestId('access-request-dialog')).toBeInTheDocument();
    });
  });

  it('click no botao (estado pending) NAO deve abrir modal (botao disabled)', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/library/courses') return [];
      if (url === '/api/library/access-requests/me') {
        return {
          id: 'req-1',
          status: 'pending',
          createdAt: '2026-05-03T12:00:00Z',
          name: 'Joao',
          reason: 'Quero',
        };
      }
      return null;
    });
    renderWithQuery();
    await waitFor(() => {
      const cta = screen.getByTestId('library-alpha-banner-cta') as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
    });
    const user = userEvent.setup();
    // Click em botao disabled — userEvent respeita pointer-events:none, mas
    // tambem testamos via click direto e verificamos que modal nao monta.
    try {
      await user.click(screen.getByTestId('library-alpha-banner-cta'));
    } catch {
      // pointer events bloqueados — esperado.
    }
    expect(screen.queryByTestId('access-request-dialog')).toBeNull();
  });
});
