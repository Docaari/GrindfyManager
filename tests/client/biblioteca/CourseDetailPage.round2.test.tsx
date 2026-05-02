import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Biblioteca-1 / Round 2 — CourseDetailPage empty modules state polish
// (D2)
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

vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

import { CourseDetailPage } from '../../../client/src/pages/biblioteca/CourseDetailPage';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(slug = 'curso') {
  return render(
    <QueryClientProvider client={makeClient()}>
      <CourseDetailPage courseSlug={slug} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<CourseDetailPage> Round 2 - empty modules polish', () => {
  it('mostra link de voltar quando modules=[]', async () => {
    fetchCourseMock.mockResolvedValue({
      id: 'c1',
      slug: 'curso',
      title: 'Curso vazio',
      coverUrl: null,
      isPublished: true,
      modules: [],
    });
    renderPage('curso');
    await waitFor(() => screen.getByTestId('course-detail-empty-modules'));
    const back = screen.getByTestId('course-detail-empty-back');
    expect(back).toBeInTheDocument();
    expect(back.getAttribute('href')).toBe('/biblioteca');
  });

  it('mensagem de empty inclui "preparados" ou "breve"', async () => {
    fetchCourseMock.mockResolvedValue({
      id: 'c1',
      slug: 'curso',
      title: 'Curso vazio',
      coverUrl: null,
      isPublished: true,
      modules: [],
    });
    renderPage('curso');
    await waitFor(() => screen.getByTestId('course-detail-empty-modules'));
    const empty = screen.getByTestId('course-detail-empty-modules');
    expect(empty.textContent?.toLowerCase()).toMatch(/preparados|breve/);
  });
});
