import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// =============================================================================
// MEDIUM-1 — Sprint Coach-1 Polimento
// ProtectedRoute: gate por PREFIXO (admin-only) em vez de whitelist hardcoded.
//
// Garante que rotas admin futuras nao escapam do gate (e.g. /admin/coach-analytics
// estava ausente da whitelist antiga).
// =============================================================================

const mockUseAuth = vi.fn();
const mockUseLocation = vi.fn(() => ['/'] as any);

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('wouter', () => ({
  useLocation: () => mockUseLocation(),
}));

// AccessDenied stub (simples, evita Lucide/Radix em teste isolado)
vi.mock('@/components/AccessDenied', () => ({
  default: () => <div data-testid="access-denied">Acesso negado</div>,
}));

import ProtectedRoute from '../ProtectedRoute';

beforeEach(() => {
  vi.clearAllMocks();
});

function setAuth(opts: { isAuthenticated: boolean; isAdmin: boolean; hasAccess: boolean }) {
  mockUseAuth.mockReturnValue({
    user: opts.isAuthenticated ? { userPlatformId: 'USER-0001', email: 'a@b.com' } : null,
    isAuthenticated: opts.isAuthenticated,
    hasAccess: opts.hasAccess,
    isAdmin: opts.isAdmin,
  });
}

function setLocation(loc: string) {
  mockUseLocation.mockReturnValue([loc, vi.fn()]);
}

describe('ProtectedRoute — admin gate por prefixo', () => {
  it('admin acessa /admin/coach-analytics (gate passa)', () => {
    setAuth({ isAuthenticated: true, isAdmin: true, hasAccess: true });
    setLocation('/admin/coach-analytics');

    render(
      <ProtectedRoute>
        <div data-testid="content">CONTENT</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByTestId('content')).not.toBeNull();
    expect(screen.queryByTestId('access-denied')).toBeNull();
  });

  it('non-admin (mas autenticado e com acesso) NAO acessa /admin/coach-analytics', () => {
    setAuth({ isAuthenticated: true, isAdmin: false, hasAccess: true });
    setLocation('/admin/coach-analytics');

    render(
      <ProtectedRoute>
        <div data-testid="content">CONTENT</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByTestId('access-denied')).not.toBeNull();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('admin acessa /admin/users (rota classica continua protegida)', () => {
    setAuth({ isAuthenticated: true, isAdmin: true, hasAccess: true });
    setLocation('/admin/users');

    render(
      <ProtectedRoute>
        <div data-testid="content">CONTENT</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByTestId('content')).not.toBeNull();
  });

  it('non-admin NAO acessa /admin/users', () => {
    setAuth({ isAuthenticated: true, isAdmin: false, hasAccess: true });
    setLocation('/admin/users');

    render(
      <ProtectedRoute>
        <div data-testid="content">CONTENT</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByTestId('access-denied')).not.toBeNull();
  });

  it('non-admin NAO acessa /analytics (rota admin-only legada)', () => {
    setAuth({ isAuthenticated: true, isAdmin: false, hasAccess: true });
    setLocation('/analytics');

    render(
      <ProtectedRoute>
        <div data-testid="content">CONTENT</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByTestId('access-denied')).not.toBeNull();
  });

  it('non-admin acessa rotas comuns (ex.: /dashboard) com hasAccess=true', () => {
    setAuth({ isAuthenticated: true, isAdmin: false, hasAccess: true });
    setLocation('/dashboard');

    render(
      <ProtectedRoute>
        <div data-testid="content">CONTENT</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByTestId('content')).not.toBeNull();
  });

  it('rota com query string em /admin/ continua sendo gate-checada', () => {
    setAuth({ isAuthenticated: true, isAdmin: false, hasAccess: true });
    setLocation('/admin/coach-analytics?period=30');

    render(
      <ProtectedRoute>
        <div data-testid="content">CONTENT</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByTestId('access-denied')).not.toBeNull();
  });

  it('nao autenticado: nao renderiza children (provider faz redirect)', () => {
    setAuth({ isAuthenticated: false, isAdmin: false, hasAccess: false });
    setLocation('/admin/coach-analytics');

    const { container } = render(
      <ProtectedRoute>
        <div data-testid="content">CONTENT</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByTestId('content')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('admin acessa /admin-users (rota legada com hifen)', () => {
    setAuth({ isAuthenticated: true, isAdmin: true, hasAccess: true });
    setLocation('/admin-users');

    render(
      <ProtectedRoute>
        <div data-testid="content">CONTENT</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByTestId('content')).not.toBeNull();
  });
});
