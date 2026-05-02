import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Sprint Biblioteca-1 / Round 2 — BibliotecaPage skeleton (F-A1.3)
// =============================================================================

const fetchCoursesMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/library/courses') return fetchCoursesMock();
    return null;
  }),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { BibliotecaPage } from '../../../client/src/pages/biblioteca/BibliotecaPage';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <BibliotecaPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<BibliotecaPage> Round 2 - skeleton grid', () => {
  it('renderiza skeleton grid com 6 placeholders durante loading', () => {
    fetchCoursesMock.mockImplementation(() => new Promise(() => {}));
    renderPage();
    const skeleton = screen.getByTestId('library-courses-skeleton');
    expect(skeleton).toBeInTheDocument();
    const items = screen.getAllByTestId('library-course-card-skeleton');
    expect(items.length).toBe(6);
  });
});
