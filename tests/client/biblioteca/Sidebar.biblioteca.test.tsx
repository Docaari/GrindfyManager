import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-12 — Sidebar update + naming conflict
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-12 + D1
//
// Mudancas em client/src/components/Sidebar.tsx:
//   - Item "Biblioteca" do grupo DADOS muda para label "Torneios" (rota /library mantida)
//   - Novo item "Biblioteca" no grupo FERRAMENTAS aponta para /biblioteca com icone GraduationCap
// =============================================================================

// Mocks de contextos do Sidebar
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      userPlatformId: 'USER-0001',
      email: 'a@b.com',
      role: 'user',
      subscriptionPlan: 'pro',
    },
    isAdmin: false,
    logout: vi.fn(),
  }),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLocation: () => ['/dashboard', vi.fn()],
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { items: [], total: 0 }, isLoading: false }),
}));

// Modal stubs
vi.mock('@/components/BugReportModal', () => ({
  default: () => null,
}));
vi.mock('@/components/ImprovementSuggestionModal', () => ({
  default: () => null,
}));

import Sidebar from '../../../client/src/components/Sidebar';

describe('<Sidebar> — RF-12 naming "Torneios" + nova "Biblioteca"', () => {
  it('NAO deve mais ter item /library na barra (acesso por Grade)', () => {
    // Decisão do founder (2026-07-31): "Torneios" saiu da barra lateral porque a
    // biblioteca de torneios já é alcançável de dentro de "Grade". O teste antes
    // exigia o item; agora garante que ele não voltou.
    render(<Sidebar />);
    const links = Array.from(document.querySelectorAll('a'));
    const libraryLink = links.find((a) => a.getAttribute('href') === '/library');
    expect(libraryLink).toBeUndefined();
  });

  it('NAO deve mais ter item /library com texto exato "Biblioteca"', () => {
    render(<Sidebar />);
    const links = Array.from(document.querySelectorAll('a'));
    const oldBiblioteca = links.find(
      (a) =>
        a.getAttribute('href') === '/library' &&
        /^biblioteca$/i.test((a.textContent || '').trim())
    );
    expect(oldBiblioteca).toBeUndefined();
  });

  it('deve renderizar novo item FERRAMENTAS apontando para /biblioteca com label "Biblioteca"', () => {
    render(<Sidebar />);
    const links = Array.from(document.querySelectorAll('a'));
    const novaBiblioteca = links.find(
      (a) =>
        a.getAttribute('href') === '/biblioteca' &&
        /biblioteca/i.test(a.textContent || '')
    );
    expect(novaBiblioteca).toBeDefined();
  });
});
