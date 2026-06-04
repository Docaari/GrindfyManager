/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Feature: Evolucao Mental Editavel na Sessao
 * Spec : Docs/specs/evolucao-mental-editavel-sessao.md (RF-05/RF-06/RF-07)
 * ADR  : Docs/architecture/decisions/242-mental-evolution-editable-bulk-replace-derived-medias.md
 * Diag : Docs/architecture/diagrams/mental-evolution-editable-save-sequence.mermaid
 *
 * Componente sob teste (NAO existe ainda):
 *   client/src/components/grind-session/MentalEvolutionEditor.tsx
 *   - props: { sessionId: string }
 *   - le a serie via GET /api/break-feedbacks?sessionId= (useQuery)
 *   - draft local editavel (add/edit/remove report) — NAO persiste ate "Salvar"
 *   - grafico Recharts (linha temporal das 5 metricas, mockado aqui)
 *   - medias derivadas read-only (calculadas do draft em tempo real)
 *   - "Salvar Alteracoes" -> 1 PUT /api/grind-sessions/:id/break-feedbacks
 *     com a serie inteira do draft no payload (bulk-replace, Q-03 salvar junto)
 *
 * Convencao: await import() (NAO require) p/ componente React (lesson #14/#26/#38).
 * data-testid estaveis (lesson #2). Sem emoji.
 *
 * Status RED: MentalEvolutionEditor.tsx NAO existe -> loadEditor() retorna null.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks hoisted: useQuery (serie), useMutation (save), apiRequest.
// ---------------------------------------------------------------------------
const { useQueryMock, useMutationMock, apiRequestMock, mutateMock, invalidateMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
  apiRequestMock: vi.fn(),
  mutateMock: vi.fn(),
  invalidateMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: invalidateMock,
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: useQueryMock,
    useMutation: useMutationMock,
  };
});

// Recharts minimal mock (lesson — verifica props sem renderizar SVG real).
const { lineChartProps } = vi.hoisted(() => ({ lineChartProps: vi.fn() }));
vi.mock('recharts', () => ({
  LineChart: (props: any) => {
    lineChartProps(props);
    return React.createElement('div', { 'data-testid': 'recharts-linechart' }, props.children);
  },
  Line: (props: any) => React.createElement('div', { 'data-testid': `recharts-line-${props.dataKey ?? 'x'}` }),
  XAxis: () => React.createElement('div', { 'data-testid': 'recharts-xaxis' }),
  YAxis: (props: any) => React.createElement('div', { 'data-testid': 'recharts-yaxis', 'data-domain': JSON.stringify(props.domain ?? null) }),
  Tooltip: () => React.createElement('div'),
  Legend: () => React.createElement('div'),
  CartesianGrid: () => React.createElement('div'),
  ResponsiveContainer: (props: any) => React.createElement('div', { 'data-testid': 'recharts-responsive' }, props.children),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function serieRow(over: Partial<Record<string, any>> = {}) {
  return {
    id: 'b1',
    userId: 'USER-0001',
    sessionId: 'sess_1',
    breakTime: '2026-06-04T13:00:00.000Z',
    foco: 5,
    energia: 4,
    confianca: 6,
    inteligenciaEmocional: 5,
    interferencias: 3,
    notes: null,
    createdAt: '2026-06-04T12:00:00.000Z',
    ...over,
  };
}

function mockSerie(data: any[] | undefined, state: { isLoading?: boolean } = {}) {
  useQueryMock.mockReturnValue({
    data,
    isLoading: state.isLoading ?? false,
    isError: false,
    error: null,
  });
}

function setupMutation() {
  useMutationMock.mockImplementation((opts: any) => ({
    mutate: (vars: any) => mutateMock(vars),
    mutateAsync: async (vars: any) => mutateMock(vars),
    isPending: false,
    isError: false,
    // expoe opts para o teste inspecionar mutationFn se precisar
    _opts: opts,
  }));
}

async function loadEditor(): Promise<any | null> {
  try {
    const p = '@/components/grind-session/MentalEvolutionEditor';
    const mod: any = await import(/* @vite-ignore */ p);
    return mod.MentalEvolutionEditor ?? mod.default ?? null;
  } catch {
    return null;
  }
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  setupMutation();
  mockSerie([serieRow({ id: 'b1', breakTime: '2026-06-04T13:00:00.000Z' }), serieRow({ id: 'b2', breakTime: '2026-06-04T15:00:00.000Z', energia: 8 })]);
});

// =============================================================================
// Render + grafico
// =============================================================================
describe('MentalEvolutionEditor — render', () => {
  it('componente existe', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
  });

  it('renderiza grafico Recharts (LineChart) com a serie', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));
    expect(screen.getByTestId('recharts-linechart')).toBeInTheDocument();
  });

  it('eixo Y do grafico fixo em 0-10 (domain)', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));
    const yaxis = screen.getByTestId('recharts-yaxis');
    expect(yaxis.getAttribute('data-domain')).toBe(JSON.stringify([0, 10]));
  });

  it('com 0 breaks mostra empty-state PT-BR em vez de grafico', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    mockSerie([]);
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));
    expect(screen.getByTestId('mental-evolution-empty')).toBeInTheDocument();
  });
});

// =============================================================================
// Medias derivadas read-only (RF-07)
// =============================================================================
describe('MentalEvolutionEditor — medias derivadas read-only', () => {
  it('exibe as 5 medias como leitura (sem slider editavel)', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));
    // bloco de medias derivadas existe
    expect(screen.getByTestId('mental-evolution-medias')).toBeInTheDocument();
  });

  it('energiaMedia derivada reflete media do draft (4 e 8 -> 6)', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));
    const energia = screen.getByTestId('mental-evolution-media-energia');
    expect(energia.textContent).toMatch(/6([.,]0)?/);
  });
});

// =============================================================================
// Lista editavel + draft (RF-06)
// =============================================================================
describe('MentalEvolutionEditor — lista editavel (draft)', () => {
  it('lista um item por break da serie', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));
    expect(screen.getByTestId('mental-evolution-report-0')).toBeInTheDocument();
    expect(screen.getByTestId('mental-evolution-report-1')).toBeInTheDocument();
  });

  it('"Adicionar medicao" adiciona um report ao draft (sem request)', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));

    fireEvent.click(screen.getByTestId('mental-evolution-add'));

    // 3o report aparece no draft local
    expect(screen.getByTestId('mental-evolution-report-2')).toBeInTheDocument();
    // NAO dispara mutate/apiRequest ainda (Q-03 salvar junto)
    expect(mutateMock).not.toHaveBeenCalled();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('adicionar report numa sessao SEM breaks parte do empty e cria 1 report local', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    mockSerie([]);
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));

    fireEvent.click(screen.getByTestId('mental-evolution-add'));
    expect(screen.getByTestId('mental-evolution-report-0')).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('"Remover" report tira do draft sem request', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));

    fireEvent.click(screen.getByTestId('mental-evolution-remove-0'));

    // restou 1 report
    expect(screen.queryByTestId('mental-evolution-report-1')).toBeNull();
    expect(mutateMock).not.toHaveBeenCalled();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('editar metrica de um report NAO dispara request (so atualiza draft)', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));

    const focoInput = screen.getByTestId('mental-evolution-foco-0');
    fireEvent.change(focoInput, { target: { value: '9' } });

    expect(mutateMock).not.toHaveBeenCalled();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Salvar junto (Q-03) — 1 clique agrega a serie no payload do bulk endpoint
// =============================================================================
describe('MentalEvolutionEditor — Salvar Alteracoes (bulk)', () => {
  it('clicar "Salvar Alteracoes" chama mutate UMA vez com { breaks: [...] }', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));

    fireEvent.click(screen.getByTestId('mental-evolution-save'));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const payload = mutateMock.mock.calls[0][0];
    expect(payload).toHaveProperty('breaks');
    expect(Array.isArray(payload.breaks)).toBe(true);
    // a serie inteira (2 breaks) vai no payload
    expect(payload.breaks).toHaveLength(2);
  });

  it('payload do save inclui edicoes + adicoes do draft', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));

    // adiciona um report e salva
    fireEvent.click(screen.getByTestId('mental-evolution-add'));
    fireEvent.click(screen.getByTestId('mental-evolution-save'));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const payload = mutateMock.mock.calls[0][0];
    expect(payload.breaks).toHaveLength(3);
  });

  it('save com draft vazio (todos removidos) envia breaks: []', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));

    fireEvent.click(screen.getByTestId('mental-evolution-remove-0'));
    fireEvent.click(screen.getByTestId('mental-evolution-remove-0'));
    fireEvent.click(screen.getByTestId('mental-evolution-save'));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const payload = mutateMock.mock.calls[0][0];
    expect(payload.breaks).toEqual([]);
  });

  it('mutationFn chama o endpoint bulk PUT /api/grind-sessions/:id/break-feedbacks', async () => {
    const Editor = await loadEditor();
    expect(Editor).not.toBeNull();
    const { render, screen } = await import('@testing-library/react');
    render(React.createElement(Editor, { sessionId: 'sess_1' }));

    // recupera o mutationFn passado ao useMutation e executa-o, verificando apiRequest
    const opts = useMutationMock.mock.calls[0]?.[0];
    expect(opts).toBeTruthy();
    expect(typeof opts.mutationFn).toBe('function');
    apiRequestMock.mockResolvedValue({ breaks: [], medias: {}, breakCount: 0 });
    await opts.mutationFn({ breaks: [] });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [method, url] = apiRequestMock.mock.calls[0];
    expect(method).toBe('PUT');
    expect(url).toBe('/api/grind-sessions/sess_1/break-feedbacks');
  });
});
