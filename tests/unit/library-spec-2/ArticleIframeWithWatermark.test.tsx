import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Biblioteca-2 / RF-07 — ArticleIframeWithWatermark (GREEN PHASE)
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-07 + D10
// ADR-076 (watermark intensidade preservada)
// ADR-092 (overlay externo, NAO injetado no srcdoc)
//
// Componente: client/src/components/biblioteca/ArticleIframeWithWatermark.tsx
//
// data-testid:
//   library-article-iframe-wrapper (container)
//   library-article-watermark-{0..5} (6 instances)
//
// Lessons:
//   #2 data-testid estavel
//   #11 default minimo (sem userPlatformId -> watermark NAO renderiza)
//   #14 import estatico ESM — NAO require() lazy
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Lesson #14: import estatico ESM — componente ja existe pos-green phase.
import { ArticleIframeWithWatermark } from '../../../client/src/components/biblioteca/ArticleIframeWithWatermark';

const DEFAULT_BUNDLE = {
  html: '<p>x</p>',
  stylesUrl: '/api/library/static/article-styles.css?v=abc123def456',
  scriptsUrl: '/api/library/static/article-scripts.js?v=789xyz012345',
  version: 'aabbccddeeff0011',
  meta: { title: 'A1', learningObjectives: [] },
};

function renderWithClient(ui: React.ReactElement) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={c}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue(DEFAULT_BUNDLE);
});

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Wrapper renderiza iframe + watermark sobreposto
// ---------------------------------------------------------------------------

describe('<ArticleIframeWithWatermark> — overlay positioning', () => {
  it('deve renderizar wrapper com data-testid library-article-iframe-wrapper', async () => {
    renderWithClient(
      <ArticleIframeWithWatermark lessonId="l1" userPlatformId="USER-1234" />
    );
    await waitFor(() =>
      expect(screen.getByTestId('library-article-iframe-wrapper')).toBeInTheDocument()
    );
  });

  it('deve renderizar 6 instancias de watermark com userPlatformId', async () => {
    renderWithClient(
      <ArticleIframeWithWatermark lessonId="l1" userPlatformId="USER-1234" />
    );
    await waitFor(() => {
      // Cada instancia: data-testid library-article-watermark-0..5
      for (let i = 0; i < 6; i++) {
        const el = screen.queryByTestId(`library-article-watermark-${i}`);
        expect(el).not.toBeNull();
        expect(el?.textContent ?? '').toContain('USER-1234');
      }
    });
  });

  it('overlay deve ter pointer-events: none (atravessa eventos pro iframe)', async () => {
    renderWithClient(
      <ArticleIframeWithWatermark lessonId="l1" userPlatformId="USER-1234" />
    );
    await waitFor(() => screen.getByTestId('library-article-iframe-wrapper'));
    const overlay = screen.getByTestId('library-article-iframe-wrapper').querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    // class Tailwind pointer-events-none OU style inline pointer-events: none
    const className = overlay.className ?? '';
    const inlineStyle = overlay.getAttribute('style') ?? '';
    expect(
      /pointer-events-none/.test(className) || /pointer-events:\s*none/i.test(inlineStyle)
    ).toBe(true);
  });

  it('overlay deve ter aria-hidden="true" (screen reader nao le)', async () => {
    renderWithClient(
      <ArticleIframeWithWatermark lessonId="l1" userPlatformId="USER-1234" />
    );
    await waitFor(() => screen.getByTestId('library-article-iframe-wrapper'));
    const wrapper = screen.getByTestId('library-article-iframe-wrapper');
    const overlay = wrapper.querySelector('[aria-hidden="true"]');
    expect(overlay).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Defense: sem userPlatformId, watermark NAO renderiza
// ---------------------------------------------------------------------------

describe('<ArticleIframeWithWatermark> — defense quando userPlatformId ausente', () => {
  it('userPlatformId vazio/undefined -> watermark NAO renderiza (Lesson #11 default minimo)', async () => {
    renderWithClient(
      <ArticleIframeWithWatermark lessonId="l1" userPlatformId="" />
    );
    await waitFor(() => screen.getByTestId('library-article-iframe-wrapper'));
    expect(screen.queryByTestId('library-article-watermark-0')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Wrapper compoe ArticleIframe internamente
// ---------------------------------------------------------------------------

describe('<ArticleIframeWithWatermark> — composicao com ArticleIframe', () => {
  it('iframe sandbox interno deve estar presente (compoe com ArticleIframe)', async () => {
    renderWithClient(
      <ArticleIframeWithWatermark lessonId="l1" userPlatformId="USER-1234" />
    );
    await waitFor(() => {
      const iframe = screen.queryByTestId('library-article-iframe');
      expect(iframe).not.toBeNull();
      expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
    });
  });

  it('onScrollDepth callback deve ser propagado para ArticleIframe', async () => {
    const onScrollDepth = vi.fn();
    renderWithClient(
      <ArticleIframeWithWatermark
        lessonId="l1"
        userPlatformId="USER-1234"
        onScrollDepth={onScrollDepth}
      />
    );
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;
    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe.contentWindow as any,
        data: { type: 'grindfy:library:scroll', payload: { percent: 33 } },
      })
    );
    await waitFor(() => expect(onScrollDepth).toHaveBeenCalledWith(33));
  });
});
