import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-07 — Pagina /biblioteca (LibraryHome)
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-07
// Componente target: client/src/pages/biblioteca/BibliotecaPage.tsx (NAO EXISTE)
// =============================================================================

const fetchCoursesMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/library/courses') return fetchCoursesMock();
    return null;
  }),
  queryClient: { invalidateQueries: vi.fn() },
}));

// @ts-expect-error - componente nao existe (red phase)
import { BibliotecaPage } from '../../../client/src/pages/biblioteca/BibliotecaPage';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <BibliotecaPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<BibliotecaPage> (RF-07)', () => {
  it('deve listar cursos publicados em CourseCards', async () => {
    fetchCoursesMock.mockResolvedValue([
      { id: 'c1', slug: 'antes-das-cartas', title: '00 - Antes das Cartas', subtitle: 'sub', coverUrl: '/api/library/assets/00.jpg', lessonCount: 46, hasAnyAccess: true },
      { id: 'c2', slug: 'anatomia-spot', title: '01 - Anatomia de um Spot', subtitle: '', coverUrl: '/api/library/assets/01.jpg', lessonCount: 11, hasAnyAccess: false },
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('library-course-card-antes-das-cartas')).toBeInTheDocument();
      expect(screen.getByTestId('library-course-card-anatomia-spot')).toBeInTheDocument();
    });
  });

  it('deve mostrar empty state quando 0 cursos', async () => {
    fetchCoursesMock.mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('library-empty-state')).toBeInTheDocument();
    });
  });

  it('deve mostrar badge "X aulas liberadas" quando hasAnyAccess', async () => {
    fetchCoursesMock.mockResolvedValue([
      { id: 'c1', slug: 'antes-das-cartas', title: '00', subtitle: '', coverUrl: '/x.jpg', lessonCount: 46, hasAnyAccess: true, accessibleLessonsCount: 12 },
    ]);
    renderPage();
    await waitFor(() => {
      const card = screen.getByTestId('library-course-card-antes-das-cartas');
      expect(card.textContent).toMatch(/12|liberada|liberadas/i);
    });
  });

  it('deve mostrar header "Biblioteca Grindfy"', async () => {
    fetchCoursesMock.mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('library-page-title')).toBeInTheDocument();
    });
  });
});
