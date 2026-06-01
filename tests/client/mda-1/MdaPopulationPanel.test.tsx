import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint MDA-1 RF-06
// Painel "MDA da populacao" durante a sessao de estudo
//
// Spec: Docs/specs/sprint-mda-1-2026-06-01.md (RF-06)
// ADR : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md
//
// Componente alvo (AINDA NAO EXISTE):
//   client/src/components/studies/MdaPopulationPanel.tsx
//   - painel COLAPSAVEL "MDA da populacao" carregado em StudySessionPage.
//   - carrega GET /api/mda-reads/by-theme?themeId=<themeId da sessao>.
//   - reusa MdaReadsSection (modo compacto). Vazio -> placeholder discreto/some.
//
// NOTA: a spec diz "reusa o mesmo componente MdaReadsSection (modo compacto)".
//   Para isolar o painel, mockamos MdaReadsSection por path exato (lesson #28) e
//   verificamos que o painel o monta com o themeId da sessao + flag compact.
//
// Lessons: #28 (vi.mock por path exato), #2 (data-testid), #14/#38 (await import).
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

// Mock por PATH EXATO (lesson #28) — captura props passadas ao componente reusado.
const sectionSpy = vi.fn();
vi.mock('@/components/studies/MdaReadsSection', () => ({
  MdaReadsSection: (props: any) => {
    sectionSpy(props);
    return <div data-testid="mda-reads-section-mock">{props.themeId}</div>;
  },
}));

const PANEL_PATH = '../../../client/src/components/studies/MdaPopulationPanel';
async function loadPanel() {
  const mod: any = await import(/* @vite-ignore */ PANEL_PATH);
  return mod.MdaPopulationPanel ?? mod.default;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

async function renderPanel(props: any = {}) {
  const MdaPopulationPanel = await loadPanel();
  return render(
    <QueryClientProvider client={makeClient()}>
      <MdaPopulationPanel themeId="t1" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockResolvedValue([]);
});

describe('<MdaPopulationPanel> — painel durante a sessao', () => {
  it('renderiza o painel (data-testid estavel)', async () => {
    await renderPanel();
    await waitFor(() => expect(screen.getByTestId('mda-population-panel')).toBeInTheDocument());
  });

  it('reusa MdaReadsSection com o themeId da sessao', async () => {
    await renderPanel({ themeId: 't1' });
    await waitFor(() => expect(screen.getByTestId('mda-population-panel')).toBeInTheDocument());
    await waitFor(() => {
      const calledWithTheme = sectionSpy.mock.calls.some(([props]) => props?.themeId === 't1');
      expect(calledWithTheme).toBe(true);
    });
  });

  it('passa modo compacto ao MdaReadsSection reusado', async () => {
    await renderPanel({ themeId: 't1' });
    await waitFor(() => expect(screen.getByTestId('mda-population-panel')).toBeInTheDocument());
    await waitFor(() => {
      const compact = sectionSpy.mock.calls.some(
        ([props]) => props?.compact === true || props?.variant === 'compact',
      );
      expect(compact).toBe(true);
    });
  });

  it('e colapsavel (toggle data-testid estavel)', async () => {
    await renderPanel({ themeId: 't1' });
    await waitFor(() => expect(screen.getByTestId('mda-population-panel')).toBeInTheDocument());
    const toggle = screen.getByTestId('mda-population-panel-toggle');
    expect(toggle).toBeInTheDocument();
    // Toggle nao deve quebrar (colapsa/expande).
    fireEvent.click(toggle);
  });
});
