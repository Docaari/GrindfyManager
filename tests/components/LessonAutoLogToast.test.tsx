/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-1.4 LessonAutoLogToast.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-1.4
 *
 * Cobertura:
 *   - Renderiza toast variant=success com label "Estudo registrado: <titulo> (<X> min)"
 *   - Action button "Ver detalhes" navega `/estudos?session=<sessionId>`
 *   - Variant=info para update incremental (sem action button)
 *   - data-testid estaveis (lesson #2)
 *
 * data-testid:
 *   - lesson-auto-log-toast (root)
 *   - lesson-auto-log-toast-message
 *   - lesson-auto-log-toast-action
 *   - lesson-auto-log-toast-dismiss
 *
 * Status RED: client/src/components/study/LessonAutoLogToast.tsx NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/biblioteca/curso/x/y/play', navigateMock],
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

beforeEach(() => {
  cleanup();
  navigateMock.mockReset();
});

async function loadToast() {
  const mod: any = await import('../../client/src/components/study/LessonAutoLogToast');
  return mod.LessonAutoLogToast;
}

describe('<LessonAutoLogToast>', () => {
  it('renderiza root com data-testid', async () => {
    const Toast = await loadToast();
    render(
      <Toast
        variant="success"
        lessonTitle="Bloco A — Ep 4"
        durationMinutes={12}
        sessionId="ssv2-1"
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByTestId('lesson-auto-log-toast')).toBeInTheDocument();
  });

  it('variant=success exibe action button "Ver detalhes" (RF-1.4)', async () => {
    const Toast = await loadToast();
    render(
      <Toast
        variant="success"
        lessonTitle="Ep 4"
        durationMinutes={12}
        sessionId="ssv2-1"
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByTestId('lesson-auto-log-toast-action')).toBeInTheDocument();
  });

  it('variant=info NAO exibe action button (apenas dismiss)', async () => {
    const Toast = await loadToast();
    render(
      <Toast
        variant="info"
        lessonTitle="Ep 4"
        durationMinutes={15}
        sessionId="ssv2-1"
        onDismiss={() => {}}
      />,
    );
    expect(screen.queryByTestId('lesson-auto-log-toast-action')).not.toBeInTheDocument();
    expect(screen.getByTestId('lesson-auto-log-toast-dismiss')).toBeInTheDocument();
  });

  it('action click navega `/estudos?session=<sessionId>`', async () => {
    const Toast = await loadToast();
    render(
      <Toast
        variant="success"
        lessonTitle="Ep 4"
        durationMinutes={12}
        sessionId="ssv2-1"
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('lesson-auto-log-toast-action'));
    expect(navigateMock).toHaveBeenCalledWith('/estudos?session=ssv2-1');
  });

  it('mostra texto com titulo da aula + duracao', async () => {
    const Toast = await loadToast();
    render(
      <Toast
        variant="success"
        lessonTitle="Bloco A — Ep 4"
        durationMinutes={12}
        sessionId="ssv2-1"
        onDismiss={() => {}}
      />,
    );
    const msg = screen.getByTestId('lesson-auto-log-toast-message');
    expect(msg.textContent).toMatch(/Bloco A — Ep 4/);
    expect(msg.textContent).toMatch(/12/);
  });

  it('dismiss button chama onDismiss', async () => {
    const Toast = await loadToast();
    const onDismiss = vi.fn();
    render(
      <Toast
        variant="success"
        lessonTitle="Ep 4"
        durationMinutes={12}
        sessionId="ssv2-1"
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByTestId('lesson-auto-log-toast-dismiss'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
