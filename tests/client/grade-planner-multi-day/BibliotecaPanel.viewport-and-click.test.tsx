/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint grade-planner-library-and-multi-day — RF-01 (parte testavel) + RF-03.
 * Spec: Docs/specs/grade-planner-library-and-multi-day.md §RF-01 §RF-03.
 * ADR:  Docs/architecture/decisions/245-...-multi-day.md §D3 §D7 §Q4.
 *
 * O QUE NAO DA PARA TESTAR AQUI, e por que:
 * O sticky do painel depende de neutralizar o `overflow: hidden` que o
 * `react-resizable-panels` aplica no PanelGroup e no Panel (ADR §Q4/Opcao A
 * "Contras"). jsdom nao faz layout: nao calcula sticky, nao resolve
 * `calc(100vh - X)` e nao descobre scrollport. Um teste de unidade que
 * "verificasse" o sticky estaria verificando string de className, nao
 * comportamento — e passaria com o sticky quebrado. **Verificacao de navegador,
 * fora deste arquivo.**
 *
 * O QUE DA PARA TESTAR, e e o que este arquivo protege:
 *   - o painel expoe data-testid="library-panel" (expandido e colapsado);
 *   - existe EXATAMENTE UM container de scroll vertical na arvore do painel.
 *     Esta e a invariante que matou o drag na regressao a6b2925c citada em
 *     GradePlanner.tsx:1153 — react-beautiful-dnd nao suporta scroll container
 *     aninhado. Se alguem adicionar um `overflow-y-auto` na casca ao capar a
 *     altura, este teste falha antes do drag morrer em producao;
 *   - o contador fica FORA do container que rola;
 *   - clique no card sobe para o GradePlanner via onTournamentClick, com o
 *     registro completo de tournament_library.
 *
 * Contrato novo em BibliotecaPanel:
 *   onTournamentClick?: (tournament: any) => void   // sem ela, so arrastavel
 * testids novos: library-panel, library-scroll, library-count, library-card-${id}
 *
 * Lessons: #14/#26/#38 (await import, nunca require), #2 (data-testid estavel),
 * #3 (mock com o shape REAL — o registro abaixo espelha tournament_library).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Dados de biblioteca controlados por teste.
// Shape real de tournament_library (ver shared/schema.ts + libraryAutoPopulate).
// ---------------------------------------------------------------------------
let _libraryData: any[] = [];
let _trashData: any[] = [];

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<any>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (opts: any) => {
      const key = Array.isArray(opts?.queryKey) ? opts.queryKey.join('|') : '';
      if (key.includes('tournament-library/trash')) {
        return { data: _trashData, isLoading: false, isError: false, refetch: vi.fn() };
      }
      if (key.includes('tournament-library')) {
        return { data: _libraryData, isLoading: false, isError: false, refetch: vi.fn() };
      }
      return { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    },
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(async () => ({})),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    }),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      setQueryData: vi.fn(),
      getQueryData: vi.fn(() => []),
    }),
  };
});

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toasts: [], toast: toastMock, dismiss: vi.fn() }),
  toast: (...args: any[]) => toastMock(...args),
}));

const apiRequestMock = vi.fn(async () => []);
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...(args as [])),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(() => []),
  },
  getQueryFn: vi.fn(),
}));

function makeLibraryRow(over: Record<string, any> = {}) {
  return {
    id: over.id ?? 'lib-1',
    name: over.name ?? 'Bounty Builder HR',
    site: over.site ?? 'PokerStars',
    buyIn: over.buyIn ?? '109',
    guaranteed: over.guaranteed ?? '50000',
    time: over.time ?? '18:45',
    type: over.type ?? 'PKO',
    speed: over.speed ?? 'Turbo',
    source: over.source ?? 'manual',
    ...over,
  };
}

beforeEach(() => {
  _libraryData = [makeLibraryRow({ id: 'lib-1' })];
  _trashData = [];
  toastMock.mockReset();
  apiRequestMock.mockClear();
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1440 });
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * O painel usa Droppable/Draggable — precisa de um DragDropContext ancestral.
 * StrictModeDroppable so renderiza depois de um requestAnimationFrame, por isso
 * todas as buscas usam findBy*.
 */
async function renderPanel(override: Record<string, any> = {}) {
  const React = await import('react');
  const { render, screen, fireEvent } = await import('@testing-library/react');
  const { DragDropContext } = await import('react-beautiful-dnd');
  const { BibliotecaPanel } = await import(
    '@/components/grade-planner/BibliotecaPanel'
  );

  const props: Record<string, any> = {
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    onTournamentClick: vi.fn(),
    ...override,
  };

  const result = render(
    React.createElement(
      DragDropContext as any,
      { onDragEnd: vi.fn() },
      React.createElement(BibliotecaPanel as any, props),
    ),
  );
  return { ...result, screen, fireEvent, props };
}

/** Elementos da subarvore que declaram scroll vertical proprio. */
function verticalScrollers(root: Element): Element[] {
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  return all.filter((el) => {
    const cls = el.getAttribute('class') ?? '';
    return /(^|\s)overflow-(y-)?(auto|scroll)(\s|$)/.test(cls);
  });
}

// ===========================================================================
// RF-01 — o que e testavel sem layout
// ===========================================================================

describe('BibliotecaPanel — ancoragem do painel (parte testavel do RF-01)', () => {
  it('expoe data-testid library-panel no modo expandido', async () => {
    const { screen } = await renderPanel();
    expect(await screen.findByTestId('library-panel')).toBeInTheDocument();
  });

  it('expoe data-testid library-panel tambem no modo colapsado', async () => {
    const { screen } = await renderPanel({ collapsed: true });
    expect(await screen.findByTestId('library-panel')).toBeInTheDocument();
  });

  it('marca a lista como o unico container de scroll com data-testid library-scroll', async () => {
    const { screen } = await renderPanel();
    const panel = await screen.findByTestId('library-panel');
    await screen.findByTestId('library-scroll');
    expect(panel.querySelectorAll('[data-testid="library-scroll"]')).toHaveLength(
      1,
    );
  });

  it('nao ha NENHUM outro scroll vertical na arvore do painel (invariante do rbd)', async () => {
    const { screen } = await renderPanel();
    const panel = await screen.findByTestId('library-panel');
    const scroll = await screen.findByTestId('library-scroll');
    const scrollers = verticalScrollers(panel);
    expect(scrollers).toHaveLength(1);
    expect(scrollers[0]).toBe(scroll);
  });

  it('no modo colapsado tambem ha um unico scroll vertical', async () => {
    const { screen } = await renderPanel({ collapsed: true });
    const panel = await screen.findByTestId('library-panel');
    await screen.findByTestId('library-scroll');
    expect(verticalScrollers(panel)).toHaveLength(1);
  });

  it('o contador fica FORA do container que rola', async () => {
    const { screen } = await renderPanel();
    const scroll = await screen.findByTestId('library-scroll');
    const count = await screen.findByTestId('library-count');
    expect(scroll.contains(count)).toBe(false);
  });

  it('o contador continua reportando filtrados de total', async () => {
    _libraryData = [
      makeLibraryRow({ id: 'lib-1' }),
      makeLibraryRow({ id: 'lib-2' }),
      makeLibraryRow({ id: 'lib-3' }),
    ];
    const { screen } = await renderPanel();
    const count = await screen.findByTestId('library-count');
    expect(count.textContent ?? '').toMatch(/3\s+de\s+3\s+torneios/);
  });

  it('biblioteca vazia mantem o empty state dentro do painel capado', async () => {
    _libraryData = [];
    const { screen } = await renderPanel();
    await screen.findByTestId('library-panel');
    expect(await screen.findByText(/Biblioteca vazia/i)).toBeInTheDocument();
    expect((await screen.findByTestId('library-count')).textContent ?? '').toMatch(
      /0\s+de\s+0\s+torneios/,
    );
  });
});

// ===========================================================================
// RF-03 — o clique sobe para o GradePlanner
// ===========================================================================

describe('BibliotecaPanel — clique no card sobe para o caller', () => {
  it('clicar num card chama onTournamentClick com o registro completo da biblioteca', async () => {
    const row = makeLibraryRow({ id: 'lib-7', name: 'Sunday Storm' });
    _libraryData = [row];
    const { screen, fireEvent, props } = await renderPanel();
    fireEvent.click(await screen.findByTestId('library-card-lib-7'));

    expect(props.onTournamentClick).toHaveBeenCalledTimes(1);
    expect(props.onTournamentClick.mock.calls[0][0]).toMatchObject({
      id: 'lib-7',
      name: 'Sunday Storm',
      site: 'PokerStars',
      buyIn: '109',
      time: '18:45',
      type: 'PKO',
      speed: 'Turbo',
      guaranteed: '50000',
    });
  });

  it('sem a prop onTournamentClick os cards seguem apenas arrastaveis (back-compat)', async () => {
    const { screen, fireEvent } = await renderPanel({
      onTournamentClick: undefined,
    });
    const card = await screen.findByTestId('library-card-lib-1');
    expect(card.getAttribute('role')).not.toBe('button');
    expect(() => fireEvent.click(card)).not.toThrow();
  });

  it('o card do modo colapsado tambem sobe o clique (ADR §C6)', async () => {
    const { screen, fireEvent, props } = await renderPanel({ collapsed: true });
    fireEvent.click(await screen.findByTestId('library-card-lib-1'));
    expect(props.onTournamentClick).toHaveBeenCalledTimes(1);
  });
});
