import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Biblioteca-2 / RF-06 — ArticleIframe sandbox (GREEN PHASE)
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-06 + D2 + D8 + D9
// ADR-092 (iframe sandbox)
// ADR-094 (postMessage protocol)
//
// Componente: client/src/components/biblioteca/ArticleIframe.tsx
//
// data-testid: library-article-iframe
//
// Lessons:
//   #1 hooks-first cleanup (removeEventListener em unmount)
//   #2 data-testid estavel
//   #13 apiRequest retorna JSON parseado (NAO Response)
//   #14 NAO usar require() lazy em test .tsx — Node nao resolve ESM deps
//      como @tanstack/react-query via require. Usar import estatico.
// =============================================================================

// Mock apiRequest — RETORNA JSON parseado direto (lesson #13)
const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Lesson #14: import estatico ESM — componente ja existe pos-green phase.
import { ArticleIframe } from '../../../client/src/components/biblioteca/ArticleIframe';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

function renderWithClient(ui: React.ReactElement) {
  const client = makeClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const DEFAULT_BUNDLE = {
  html: '<section><p>conteudo</p></section>',
  stylesUrl: '/api/library/static/article-styles.css?v=abc123def456',
  scriptsUrl: '/api/library/static/article-scripts.js?v=789xyz012345',
  version: 'aabbccddeeff0011',
  meta: {
    title: 'A1 - Mentalidade Fixa',
    learningObjectives: ['Obj 1', 'Obj 2'],
  },
};

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue(DEFAULT_BUNDLE);
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Sandbox attributes (ADR-092 D2)
// ---------------------------------------------------------------------------

describe('<ArticleIframe> — sandbox attributes (D2)', () => {
  it('iframe deve ter sandbox="allow-scripts" (sem same-origin)', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = await waitFor(() => screen.getByTestId('library-article-iframe'));
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('iframe NUNCA deve ter allow-same-origin no sandbox', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = await waitFor(() => screen.getByTestId('library-article-iframe'));
    expect(iframe.getAttribute('sandbox')).not.toMatch(/allow-same-origin/);
  });

  it('iframe NUNCA deve ter allow-popups, allow-forms, allow-top-navigation', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = await waitFor(() => screen.getByTestId('library-article-iframe'));
    const sandbox = iframe.getAttribute('sandbox') ?? '';
    expect(sandbox).not.toMatch(/allow-popups/);
    expect(sandbox).not.toMatch(/allow-forms/);
    expect(sandbox).not.toMatch(/allow-top-navigation/);
  });
});

// ---------------------------------------------------------------------------
// srcdoc construction
// ---------------------------------------------------------------------------

describe('<ArticleIframe> — srcdoc construction', () => {
  it('iframe deve ter srcdoc presente apos bundle carregar', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;
    expect(iframe.getAttribute('srcdoc')).toBeTruthy();
  });

  it('srcdoc deve incluir <link rel="stylesheet" href={stylesUrl}>', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;
    const srcdoc = iframe.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('rel="stylesheet"');
    expect(srcdoc).toContain(DEFAULT_BUNDLE.stylesUrl);
  });

  it('srcdoc deve incluir <script src={scriptsUrl} defer>', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;
    const srcdoc = iframe.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('script');
    expect(srcdoc).toContain(DEFAULT_BUNDLE.scriptsUrl);
  });

  it('srcdoc deve incluir bundle.html dentro de <body>', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;
    const srcdoc = iframe.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('<section><p>conteudo</p></section>');
  });

  it('srcdoc deve escapar HTML entities no <title> (XSS defense)', async () => {
    apiRequestMock.mockResolvedValue({
      ...DEFAULT_BUNDLE,
      meta: { title: 'A1 <script>alert(1)</script>', learningObjectives: [] },
    });
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;
    const srcdoc = iframe.getAttribute('srcdoc') ?? '';
    // Titulo escapado: &lt;script&gt; — nao deve renderizar como tag executavel
    expect(srcdoc).not.toMatch(/<title>[^<]*<script>/);
  });

  it('iframe deve ter title ARIA com lesson title', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;
    expect(iframe.getAttribute('title')).toContain('A1 - Mentalidade Fixa');
  });
});

// ---------------------------------------------------------------------------
// postMessage resize (D8)
// ---------------------------------------------------------------------------

describe('<ArticleIframe> — postMessage resize (D8)', () => {
  it('resize message deve atualizar iframe.style.height', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;

    // Simula child enviando postMessage com height: 1234
    const event = new MessageEvent('message', {
      source: iframe.contentWindow as any,
      data: { type: 'grindfy:library:resize', payload: { height: 1234 } },
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      const h = (iframe.style.height ?? '').replace('px', '');
      expect(h).toBe('1234');
    });
  });

  it('cap altura 50000 anti-DoS', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;

    const event = new MessageEvent('message', {
      source: iframe.contentWindow as any,
      data: { type: 'grindfy:library:resize', payload: { height: 99999 } },
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      const h = parseInt((iframe.style.height ?? '0px').replace('px', ''), 10);
      expect(h).toBeLessThanOrEqual(50000);
    });
  });

  it('postMessage de event.source diferente deve ser IGNORADO (XSS defense)', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;
    const initialHeight = iframe.style.height;

    // Source diferente -> ignorado
    const event = new MessageEvent('message', {
      source: window as any,
      data: { type: 'grindfy:library:resize', payload: { height: 9999 } },
    });
    window.dispatchEvent(event);

    // Nao deve mudar height
    await new Promise((r) => setTimeout(r, 50));
    expect(iframe.style.height).toBe(initialHeight);
  });

  it('mensagens com type fora do whitelist devem ser ignoradas', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;
    const initialHeight = iframe.style.height;

    const event = new MessageEvent('message', {
      source: iframe.contentWindow as any,
      data: { type: 'evil:hack', payload: { height: 9999 } },
    });
    window.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 50));
    expect(iframe.style.height).toBe(initialHeight);
  });

  it('payload mal-formado (height nao number) ignorado', async () => {
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;
    const initialHeight = iframe.style.height;

    const event = new MessageEvent('message', {
      source: iframe.contentWindow as any,
      data: { type: 'grindfy:library:resize', payload: { height: 'not-a-number' } },
    });
    window.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 50));
    expect(iframe.style.height).toBe(initialHeight);
  });
});

// ---------------------------------------------------------------------------
// postMessage scroll-depth (D9)
// ---------------------------------------------------------------------------

describe('<ArticleIframe> — postMessage scroll-depth (D9)', () => {
  it('scroll msg dispara onScrollDepth callback com percent valido', async () => {
    const onScrollDepth = vi.fn();
    renderWithClient(
      <ArticleIframe
        lessonId="l1"
        userPlatformId="USER-1234"
        onScrollDepth={onScrollDepth}
      />
    );
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;

    const event = new MessageEvent('message', {
      source: iframe.contentWindow as any,
      data: { type: 'grindfy:library:scroll', payload: { percent: 42 } },
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(onScrollDepth).toHaveBeenCalledWith(42);
    });
  });

  it('scroll percent fora 0-100 deve ser clamped', async () => {
    const onScrollDepth = vi.fn();
    renderWithClient(
      <ArticleIframe
        lessonId="l1"
        userPlatformId="USER-1234"
        onScrollDepth={onScrollDepth}
      />
    );
    const iframe = (await waitFor(() => screen.getByTestId('library-article-iframe'))) as HTMLIFrameElement;

    // 150% -> 100; -10% -> 0
    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe.contentWindow as any,
        data: { type: 'grindfy:library:scroll', payload: { percent: 150 } },
      })
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe.contentWindow as any,
        data: { type: 'grindfy:library:scroll', payload: { percent: -10 } },
      })
    );

    await waitFor(() => {
      const calls = onScrollDepth.mock.calls.map((c) => c[0]);
      for (const v of calls) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Cleanup em unmount (Lesson #1)
// ---------------------------------------------------------------------------

describe('<ArticleIframe> — cleanup em unmount', () => {
  it('removeEventListener("message") chamado em unmount (memory leak prevention)', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderWithClient(
      <ArticleIframe lessonId="l1" userPlatformId="USER-1234" />
    );
    await waitFor(() => screen.getByTestId('library-article-iframe'));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
    removeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Loading + error states
// ---------------------------------------------------------------------------

describe('<ArticleIframe> — loading + error states', () => {
  it('apiRequest pending -> mostra skeleton/loading state', async () => {
    apiRequestMock.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    // Aceita: data-testid library-article-iframe-loading OU library-article-skeleton
    expect(
      screen.queryByTestId('library-article-iframe-loading') ??
        screen.queryByTestId('library-article-skeleton')
    ).not.toBeNull();
  });

  it('apiRequest erro -> mostra error state (data-testid library-article-iframe-error)', async () => {
    apiRequestMock.mockRejectedValue(new Error('500 internal_error'));
    renderWithClient(<ArticleIframe lessonId="l1" userPlatformId="USER-1234" />);
    await waitFor(() => {
      expect(
        screen.queryByTestId('library-article-iframe-error') ??
          screen.queryByText(/erro/i)
      ).not.toBeNull();
    });
  });
});
