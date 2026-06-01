import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint MDA-1 RF-07 (Form de Registro)
//
// Spec: Docs/specs/sprint-mda-1-2026-06-01.md (RF-07)
// ADR : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md (D-2/D-3/D-5)
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/components/studies/MdaReadForm.tsx
//   - campos: title, spotContext, filters, tendencyText.
//   - theme multi-select (N:N) — pre-preenche ?themeId= via prop initialThemeId.
//   - upload de prints (preview local + remover); cap 8 (bloqueia 9o no client).
//   - fluxo 2-passos: POST /api/mda-reads -> POST /:id/images por arquivo.
//   - apiRequest retorna JSON parseado direto (lesson #13).
//
// Lessons aplicadas:
//   #14/#26/#38 — await import (path em variavel; SO await import, NUNCA require).
//   #13 — apiRequest retorna JSON parseado direto.
//   #2  — data-testid estaveis (NAO heuristica DOM).
//   #1  — hooks antes de early return (responsabilidade do impl; teste so render).
//
// Suposicao documentada (testids exatos nao fixados pela spec): raiz
// 'mda-read-form'; submit 'mda-read-form-submit'; input de arquivo
// 'mda-read-image-input'. Se o impl usar outros nomes, NAO modifica o teste —
// documenta o impedimento (regra TDD da casa).
// =============================================================================

const apiRequestMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

// Navegacao (wouter) — captura redirect ao detalhe pos-save.
const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/mda/registrar', navigateMock],
  Link: ({ children }: any) => children,
}));

const FORM_PATH = '../../../client/src/components/studies/MdaReadForm';
async function loadForm() {
  const mod: any = await import(/* @vite-ignore */ FORM_PATH);
  return mod.MdaReadForm ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

async function renderForm(props: any = {}) {
  const MdaReadForm = await loadForm();
  return render(
    <QueryClientProvider client={makeClient()}>
      <MdaReadForm {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    // GET de temas (multi-select) — JSON parseado direto (#13).
    if (method === 'GET' && /\/api\/study-themes/.test(url)) {
      return [
        { id: 't1', name: 'BTN vs BB', userId: 'USER-0001' },
        { id: 't2', name: 'Turn barrels', userId: 'USER-0001' },
      ];
    }
    // GET de um read existente (modo edicao, ?id=) — JSON parseado direto (#13).
    if (method === 'GET' && /\/api\/mda-reads\/read_1$/.test(url)) {
      return {
        id: 'read_1',
        title: 'Pop overfolda turn',
        spotContext: 'BTN abre, BB defende',
        filters: 'SRP, flop 2-tone',
        tendencyText: 'Sobre-bluff barrel no turn.',
        statId: 'vpip',
        themeIds: ['t1', 't2'],
        images: [{ id: 'img_e1', url: '/api/mda-reads/read_1/images/img_e1', caption: 'c' }],
      };
    }
    if (method === 'POST' && /\/api\/mda-reads$/.test(url)) {
      return { id: 'read_NEW', themeIds: ['t1'] }; // passo 1 (#13)
    }
    if (method === 'PATCH' && /\/api\/mda-reads\/read_1$/.test(url)) {
      return { id: 'read_1' }; // edicao (#13)
    }
    if (method === 'POST' && /\/api\/mda-reads\/[^/]+\/images$/.test(url)) {
      return { id: 'img_1', url: '/api/mda-reads/read_NEW/images/img_1' }; // passo 2
    }
    return null;
  });
});

// =============================================================================
// Render base
// =============================================================================

describe('<MdaReadForm> — render base', () => {
  it('renderiza o form (data-testid estavel)', async () => {
    await renderForm();
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
  });

  it('possui botao de submit (data-testid estavel)', async () => {
    await renderForm();
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    expect(screen.getByTestId('mda-read-form-submit')).toBeInTheDocument();
  });
});

// =============================================================================
// RF-07 — pre-preenche ?themeId=
// =============================================================================

describe('<MdaReadForm> — pre-selecao de tema via initialThemeId (?themeId=)', () => {
  it('renderiza com initialThemeId sem quebrar (tema X pre-selecionado)', async () => {
    await renderForm({ initialThemeId: 't1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    // O chip/indicador do tema pre-selecionado deve aparecer (data-testid estavel).
    await waitFor(() =>
      expect(screen.getByTestId('mda-theme-chip-t1')).toBeInTheDocument(),
    );
  });
});

// =============================================================================
// RF-07 — submit dispara fluxo 2-passos (#13)
// =============================================================================

describe('<MdaReadForm> — submit 2-passos (#13)', () => {
  it('submeter com tema pre-selecionado chama POST /api/mda-reads', async () => {
    await renderForm({ initialThemeId: 't1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    // preenche title (obrigatorio).
    const titleInput = screen.getByTestId('mda-read-title-input') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Pop overfolda turn' } });
    fireEvent.click(screen.getByTestId('mda-read-form-submit'));
    await waitFor(() => {
      const calledCreate = apiRequestMock.mock.calls.some(
        ([method, url]) => method === 'POST' && /\/api\/mda-reads$/.test(url),
      );
      expect(calledCreate).toBe(true);
    });
  });

  it('apos criar, redireciona ao detalhe /estudos/mda/:id', async () => {
    await renderForm({ initialThemeId: 't1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('mda-read-title-input'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('mda-read-form-submit'));
    await waitFor(() => {
      const navigatedToDetail = navigateMock.mock.calls.some(
        ([to]) => typeof to === 'string' && /\/estudos\/mda\/read_NEW/.test(to),
      );
      expect(navigatedToDetail).toBe(true);
    });
  });
});

// =============================================================================
// RF-07 — upload de prints com preview + cap 8 no client
// =============================================================================

describe('<MdaReadForm> — upload de prints', () => {
  it('possui input de arquivo de print (data-testid estavel)', async () => {
    await renderForm({ initialThemeId: 't1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    expect(screen.getByTestId('mda-read-image-input')).toBeInTheDocument();
  });

  it('mostra preview local apos selecionar um arquivo', async () => {
    await renderForm({ initialThemeId: 't1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    const input = screen.getByTestId('mda-read-image-input') as HTMLInputElement;
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'p.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(screen.getByTestId('mda-read-image-preview-0')).toBeInTheDocument(),
    );
  });
});

// =============================================================================
// HIGH-2 (fix wave) — modo EDICAO (?id=<readId>)
//
// Hoje o botao "Editar" do detalhe navega p/ /estudos/mda/registrar?id=<readId>
// mas o form ignora o ?id= e sempre faz POST -> cria DUPLICATA. Estes testes
// dirigem o modo edicao: quando o form recebe um readId (a pagina Studies.tsx
// extrai o ?id= e passa como prop `readId`, paralelo a como extrai ?themeId=
// para `initialThemeId`), ele:
//   - faz useQuery GET /api/mda-reads/<readId> e HIDRATA os campos;
//   - ao salvar faz PATCH /api/mda-reads/<readId> (NAO POST).
//
// Contrato de testids (decisao test-writer, documentada p/ o impl seguir):
//   - prop de edicao: `readId` (string). A pagina extrai ?id= e passa essa prop.
//   - chips de tema selecionado ja usam `mda-theme-chip-<themeId>` (existente).
//   - imagens existentes (vindas do read) usam `mda-read-existing-image-<imageId>`.
//   - inputs reusam os testids ja existentes (title/spot/filters/tendency/stat).
// Se o impl divergir nos nomes, NAO modifica o teste — documenta o impedimento.
// =============================================================================

describe('<MdaReadForm> — modo edicao (?id=) [HIGH-2]', () => {
  it('com readId, faz GET /api/mda-reads/<readId> para carregar o read', async () => {
    await renderForm({ readId: 'read_1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    await waitFor(() => {
      const calledGet = apiRequestMock.mock.calls.some(
        ([method, url]) => method === 'GET' && /\/api\/mda-reads\/read_1$/.test(url),
      );
      expect(calledGet).toBe(true);
    });
  });

  it('hidrata os campos do read carregado (title/spot/filters/tendency/stat)', async () => {
    await renderForm({ readId: 'read_1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    await waitFor(() =>
      expect((screen.getByTestId('mda-read-title-input') as HTMLInputElement).value).toBe(
        'Pop overfolda turn',
      ),
    );
    expect((screen.getByTestId('mda-read-spot-input') as HTMLInputElement).value).toBe(
      'BTN abre, BB defende',
    );
    expect((screen.getByTestId('mda-read-filters-input') as HTMLInputElement).value).toBe(
      'SRP, flop 2-tone',
    );
    expect((screen.getByTestId('mda-read-tendency-input') as HTMLTextAreaElement).value).toBe(
      'Sobre-bluff barrel no turn.',
    );
    expect((screen.getByTestId('mda-read-stat-input') as HTMLInputElement).value).toBe('vpip');
  });

  it('hidrata os temas tagueados como chips selecionados (t1 + t2)', async () => {
    await renderForm({ readId: 'read_1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('mda-theme-chip-t1')).toBeInTheDocument());
    expect(screen.getByTestId('mda-theme-chip-t2')).toBeInTheDocument();
  });

  it('hidrata as imagens existentes do read (img_e1)', async () => {
    await renderForm({ readId: 'read_1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId('mda-read-existing-image-img_e1')).toBeInTheDocument(),
    );
  });

  it('salvar em modo edicao faz PATCH /api/mda-reads/<readId> (NAO POST)', async () => {
    await renderForm({ readId: 'read_1' });
    await waitFor(() =>
      expect((screen.getByTestId('mda-read-title-input') as HTMLInputElement).value).toBe(
        'Pop overfolda turn',
      ),
    );
    fireEvent.change(screen.getByTestId('mda-read-title-input'), {
      target: { value: 'Pop overfolda turn (editado)' },
    });
    fireEvent.click(screen.getByTestId('mda-read-form-submit'));
    await waitFor(() => {
      const patched = apiRequestMock.mock.calls.some(
        ([method, url]) => method === 'PATCH' && /\/api\/mda-reads\/read_1$/.test(url),
      );
      expect(patched).toBe(true);
    });
    // E NAO deve ter feito POST de criacao (sem duplicata).
    const posted = apiRequestMock.mock.calls.some(
      ([method, url]) => method === 'POST' && /\/api\/mda-reads$/.test(url),
    );
    expect(posted).toBe(false);
  });

  it('apos editar, redireciona ao detalhe /estudos/mda/<readId>', async () => {
    await renderForm({ readId: 'read_1' });
    await waitFor(() =>
      expect((screen.getByTestId('mda-read-title-input') as HTMLInputElement).value).toBe(
        'Pop overfolda turn',
      ),
    );
    fireEvent.click(screen.getByTestId('mda-read-form-submit'));
    await waitFor(() => {
      const navigated = navigateMock.mock.calls.some(
        ([to]) => typeof to === 'string' && /\/estudos\/mda\/read_1/.test(to),
      );
      expect(navigated).toBe(true);
    });
  });
});

// =============================================================================
// HIGH-2 regressao — modo CRIACAO (sem ?id=/readId) continua POST
// =============================================================================

describe('<MdaReadForm> — modo criacao continua POST (regressao HIGH-2)', () => {
  it('sem readId, salvar faz POST /api/mda-reads (NAO PATCH)', async () => {
    await renderForm({ initialThemeId: 't1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('mda-read-title-input'), { target: { value: 'novo' } });
    fireEvent.click(screen.getByTestId('mda-read-form-submit'));
    await waitFor(() => {
      const posted = apiRequestMock.mock.calls.some(
        ([method, url]) => method === 'POST' && /\/api\/mda-reads$/.test(url),
      );
      expect(posted).toBe(true);
    });
    const patched = apiRequestMock.mock.calls.some(([method]) => method === 'PATCH');
    expect(patched).toBe(false);
  });

  it('sem readId, NAO faz GET de um read especifico', async () => {
    await renderForm({ initialThemeId: 't1' });
    await waitFor(() => expect(screen.getByTestId('mda-read-form')).toBeInTheDocument());
    // da tempo de qualquer query disparar
    await waitFor(() => expect(screen.getByTestId('mda-read-title-input')).toBeInTheDocument());
    const getRead = apiRequestMock.mock.calls.some(
      ([method, url]) => method === 'GET' && /\/api\/mda-reads\/[^/]+$/.test(url) && !/by-theme/.test(url),
    );
    expect(getRead).toBe(false);
  });
});
