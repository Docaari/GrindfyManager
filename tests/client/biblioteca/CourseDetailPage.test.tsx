import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Biblioteca-1 / UX Round Implementer F2 — CourseDetailPage drill-down
// Spec: prompt RF-F2
// =============================================================================

const fetchCourseMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async (method: string, url: string) => {
    if (method === 'GET' && /\/api\/library\/courses\/[^/]+$/.test(url)) {
      return fetchCourseMock(url);
    }
    return null;
  }),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Stub Link to avoid wouter context complications in this isolated test.
vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

import React from 'react';
import { CourseDetailPage } from '../../../client/src/pages/biblioteca/CourseDetailPage';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(slug = 'antes-das-cartas') {
  return render(
    <QueryClientProvider client={makeClient()}>
      <CourseDetailPage courseSlug={slug} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<CourseDetailPage> (F2)', () => {
  it('deve renderizar loading state durante fetch', () => {
    fetchCourseMock.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('course-detail-loading')).toBeInTheDocument();
  });

  it('deve renderizar header + breadcrumb + total de aulas', async () => {
    fetchCourseMock.mockResolvedValue({
      id: 'c1',
      slug: 'antes-das-cartas',
      title: '00 - Antes das Cartas',
      subtitle: 'Fundacao mental',
      description: null,
      coverUrl: '/api/library/assets/00.jpg',
      isPublished: true,
      modules: [
        {
          id: 'm1',
          slug: 'mod1',
          title: 'Modulo 1',
          description: null,
          coverUrl: null,
          lessons: [
            {
              id: 'l1',
              slug: 'a1',
              title: 'A1',
              durationMinutes: 12,
              formats: ['video'],
              hasAccess: true,
            },
            {
              id: 'l2',
              slug: 'a2',
              title: 'A2',
              durationMinutes: 30,
              formats: ['video'],
              hasAccess: false,
            },
          ],
        },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('course-detail-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('course-detail-breadcrumb').textContent).toMatch(
      /Biblioteca.*00 - Antes das Cartas/,
    );
    expect(screen.getByTestId('course-detail-lesson-count').textContent).toMatch(
      /2 aulas/,
    );
    expect(screen.getByTestId('course-detail-total-duration').textContent).toMatch(
      /42min|0h 42min/,
    );
  });

  it('deve renderizar cada modulo com seu data-testid', async () => {
    fetchCourseMock.mockResolvedValue({
      id: 'c1',
      slug: 'curso',
      title: 'Curso',
      coverUrl: null,
      isPublished: true,
      modules: [
        {
          id: 'm1',
          slug: 'mod1',
          title: 'Modulo 1',
          lessons: [],
        },
        {
          id: 'm2',
          slug: 'mod2',
          title: 'Modulo 2',
          lessons: [],
        },
      ],
    });
    renderPage('curso');
    await waitFor(() => {
      expect(screen.getByTestId('course-detail-module-mod1')).toBeInTheDocument();
      expect(screen.getByTestId('course-detail-module-mod2')).toBeInTheDocument();
    });
  });

  it('deve renderizar empty state quando modules vazio', async () => {
    fetchCourseMock.mockResolvedValue({
      id: 'c1',
      slug: 'curso',
      title: 'Curso vazio',
      coverUrl: null,
      isPublished: true,
      modules: [],
    });
    renderPage('curso');
    await waitFor(() => {
      expect(screen.getByTestId('course-detail-empty-modules')).toBeInTheDocument();
    });
  });

  it('quando 404, deve mostrar mensagem "Curso nao encontrado" + link voltar', async () => {
    const err: any = new Error('not_found');
    err.response = { status: 404, data: { message: 'course_not_found' } };
    fetchCourseMock.mockRejectedValue(err);
    renderPage('xyz');
    await waitFor(() => {
      expect(screen.getByTestId('course-detail-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('course-detail-error').textContent?.toLowerCase()).toMatch(
      /nao encontrado/,
    );
    expect(screen.getByTestId('course-detail-back-link').getAttribute('href')).toBe(
      '/biblioteca',
    );
  });

  it('deve renderizar CTA "Continuar de onde parou" quando ha lesson com progresso', async () => {
    fetchCourseMock.mockResolvedValue({
      id: 'c1',
      slug: 'curso',
      title: 'Curso',
      coverUrl: null,
      isPublished: true,
      modules: [
        {
          id: 'm1',
          slug: 'mod1',
          title: 'Mod 1',
          lessons: [
            {
              id: 'l1',
              slug: 'a1',
              title: 'A1 em progresso',
              durationMinutes: 10,
              formats: ['video'],
              hasAccess: true,
              userProgress: {
                maxFormatPositionSeconds: 120,
                maxFormatTotalSeconds: 600,
                completedAny: false,
              },
            },
          ],
        },
      ],
    });
    renderPage('curso');
    await waitFor(() => {
      const cta = screen.getByTestId('course-detail-continue-cta');
      expect(cta).toBeInTheDocument();
      expect(cta.textContent).toMatch(/A1 em progresso/);
      expect(cta.getAttribute('href')).toBe('/biblioteca/curso/curso/a1');
    });
  });

  it('NAO deve renderizar CTA "Continuar" quando sem progresso (lesson #11 default minimo)', async () => {
    fetchCourseMock.mockResolvedValue({
      id: 'c1',
      slug: 'curso',
      title: 'Curso',
      coverUrl: null,
      isPublished: true,
      modules: [
        {
          id: 'm1',
          slug: 'mod1',
          title: 'Mod 1',
          lessons: [
            {
              id: 'l1',
              slug: 'a1',
              title: 'A1',
              durationMinutes: 10,
              formats: ['video'],
              hasAccess: true,
            },
          ],
        },
      ],
    });
    renderPage('curso');
    await waitFor(() => {
      expect(screen.getByTestId('course-detail-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('course-detail-continue-cta')).toBeNull();
  });
});
