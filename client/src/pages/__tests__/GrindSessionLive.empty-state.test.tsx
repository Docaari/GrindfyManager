/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-2 — RF-03
 * Spec: Docs/specs/sprint-ux-qw-2.md
 *
 * Quando user abre /grind-live sem sessao ativa E sem planned_tournaments
 * para hoje, mostrar <EmptyState area="grind-live-empty"> com:
 *   - title: "Pronto para o grind?"
 *   - description: "Voce nao tem torneios planejados para hoje. Configure sua
 *     grade ou inicie uma sessao vazia."
 *   - primaryCTA: "Iniciar Sessao Vazia" -> cria sessao (handler existente)
 *   - secondaryCTA: "Configurar grade primeiro" -> useLocation('/grade-planner')
 *
 * NOTA: implementer pode extrair o empty state para um componente standalone
 * `<GrindLiveEmptyState>` ou inline no GrindSessionLive. Por isolamento e
 * testabilidade, recomendamos componente standalone. Os tests aqui exercitam
 * o componente standalone — se ficar inline, implementer adapta os tests.
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel (empty-state com data-area="grind-live-empty").
 *   #11 sem default decorativo.
 *   #14 import estatico.
 *   #28 mock por path: wouter `useLocation` precisa casar com o path do import.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const setLocationMock = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/grind-live', setLocationMock] as const,
  Link: ({ href, children }: any) => (
    <a href={href} data-href={href}>
      {children}
    </a>
  ),
}));

// RED: componente ainda nao existe. Implementer cria em
// client/src/components/grind-session-live/GrindLiveEmptyState.tsx OU inline em
// GrindSessionLive.tsx + exporta um helper render fn. O teste assume named export.
// Dinamico via variavel para evitar resolucao estatica do Vite (RED phase —
// modulo ainda nao existe). Vite ignora `import(variavel)`.
const EMPTY_STATE_PATH =
  '@/components/grind-session-live/GrindLiveEmptyState';

async function loadEmptyState() {
  // @ts-expect-error — RED: modulo ainda nao existe
  const mod: any = await import(/* @vite-ignore */ EMPTY_STATE_PATH);
  return (mod.default ?? mod.GrindLiveEmptyState) as React.ComponentType<any>;
}

describe('RF-03 GrindLiveEmptyState — render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza <EmptyState> com data-area="grind-live-empty"', async () => {
    const GrindLiveEmptyState = await loadEmptyState();
    render(<GrindLiveEmptyState onStartEmptySession={vi.fn()} />);
    const empty = screen.getByTestId('empty-state');
    expect(empty.getAttribute('data-area')).toBe('grind-live-empty');
  });

  it('exibe headline "Pronto para o grind?"', async () => {
    const GrindLiveEmptyState = await loadEmptyState();
    render(<GrindLiveEmptyState onStartEmptySession={vi.fn()} />);
    expect(screen.getByText(/Pronto para o grind\?/i)).toBeInTheDocument();
  });

  it('CTA primario label inclui "Iniciar Sessao"', async () => {
    const GrindLiveEmptyState = await loadEmptyState();
    render(<GrindLiveEmptyState onStartEmptySession={vi.fn()} />);
    const cta = screen.getByTestId('empty-state-cta');
    expect(cta.textContent).toMatch(/Iniciar Sess(a|ã)o/i);
  });

  it('CTA secundario label inclui "Configurar grade"', async () => {
    const GrindLiveEmptyState = await loadEmptyState();
    render(<GrindLiveEmptyState onStartEmptySession={vi.fn()} />);
    const secondary = screen.getByTestId('empty-state-secondary-cta');
    expect(secondary.textContent).toMatch(/Configurar grade/i);
  });
});

describe('RF-03 GrindLiveEmptyState — interatividade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('click no primario chama onStartEmptySession', async () => {
    const GrindLiveEmptyState = await loadEmptyState();
    const onStartEmptySession = vi.fn();
    render(<GrindLiveEmptyState onStartEmptySession={onStartEmptySession} />);
    await userEvent.click(screen.getByTestId('empty-state-cta'));
    expect(onStartEmptySession).toHaveBeenCalledTimes(1);
  });

  it('click no secundario navega via wouter para /grade-planner', async () => {
    const GrindLiveEmptyState = await loadEmptyState();
    render(<GrindLiveEmptyState onStartEmptySession={vi.fn()} />);
    await userEvent.click(screen.getByTestId('empty-state-secondary-cta'));
    expect(setLocationMock).toHaveBeenCalledWith('/grade-planner');
  });

  it('click no secundario NAO chama onStartEmptySession', async () => {
    const GrindLiveEmptyState = await loadEmptyState();
    const onStartEmptySession = vi.fn();
    render(<GrindLiveEmptyState onStartEmptySession={onStartEmptySession} />);
    await userEvent.click(screen.getByTestId('empty-state-secondary-cta'));
    expect(onStartEmptySession).not.toHaveBeenCalled();
  });
});

describe('RF-03 GrindLiveEmptyState — acessibilidade', () => {
  it('CTA primario tem aria-label', async () => {
    const GrindLiveEmptyState = await loadEmptyState();
    render(<GrindLiveEmptyState onStartEmptySession={vi.fn()} />);
    const cta = screen.getByTestId('empty-state-cta');
    expect(cta.getAttribute('aria-label')).toBeTruthy();
  });

  it('wrapper EmptyState mantem role="status"', async () => {
    const GrindLiveEmptyState = await loadEmptyState();
    render(<GrindLiveEmptyState onStartEmptySession={vi.fn()} />);
    expect(screen.getByTestId('empty-state').getAttribute('role')).toBe(
      'status',
    );
  });
});
