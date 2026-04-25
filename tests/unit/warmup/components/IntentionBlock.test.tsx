import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// Testes TDD (Sprint W-1): IntentionBlock (RF-09, T-10)
//
// Contrato:
//   <IntentionBlock onSubmit={(intention: SessionIntention) => void} />
//
// SessionIntention = { focus: string, tiltPlan: string, stopCriteria: string }
//   max 200 chars cada, todos obrigatorios (nao-vazios apos trim).
//
// Microcopy spec 9.5:
//   Botao final: "Concluir warm-up e iniciar grind"
//   Aviso campos vazios: "Os 3 campos são obrigatórios. Mesmo curtos."
//
// Status: red phase.
// =============================================================================

import { IntentionBlock } from '@/components/warmup/IntentionBlock';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('IntentionBlock - render', () => {
  it('exibe titulo "Intenção da sessão"', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    expect(document.body.textContent).toMatch(/inten[çc][aã]o da sess[aã]o/i);
  });

  it('expoe 3 textareas com data-testid', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    expect(screen.getByTestId('intention-focus')).toBeTruthy();
    expect(screen.getByTestId('intention-tilt-plan')).toBeTruthy();
    expect(screen.getByTestId('intention-stop-criteria')).toBeTruthy();
  });

  it('label "Foco desta sessão"', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    expect(document.body.textContent).toMatch(/foco desta sess[aã]o/i);
  });

  it('label "Se sentir tilt, vou"', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    expect(document.body.textContent).toMatch(/se sentir tilt/i);
  });

  it('label "Vou encerrar quando"', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    expect(document.body.textContent).toMatch(/vou encerrar/i);
  });

  it('botao "Concluir warm-up e iniciar grind"', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    expect(
      screen.getByRole('button', { name: /concluir warm-up.*iniciar grind/i }),
    ).toBeTruthy();
  });
});

describe('IntentionBlock - validacao', () => {
  it('botao concluir disabled quando todos os 3 campos vazios', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    const submit = screen.getByRole('button', {
      name: /concluir warm-up.*iniciar grind/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('botao concluir disabled quando 2/3 preenchidos', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    fireEvent.change(screen.getByTestId('intention-focus'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('intention-tilt-plan'), { target: { value: 'b' } });

    const submit = screen.getByRole('button', {
      name: /concluir warm-up.*iniciar grind/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('botao habilita quando os 3 estao preenchidos', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    fireEvent.change(screen.getByTestId('intention-focus'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('intention-tilt-plan'), { target: { value: 'b' } });
    fireEvent.change(screen.getByTestId('intention-stop-criteria'), { target: { value: 'c' } });

    const submit = screen.getByRole('button', {
      name: /concluir warm-up.*iniciar grind/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('whitespace puro (apos trim) NAO conta como preenchido', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    fireEvent.change(screen.getByTestId('intention-focus'), { target: { value: '   ' } });
    fireEvent.change(screen.getByTestId('intention-tilt-plan'), { target: { value: '   ' } });
    fireEvent.change(screen.getByTestId('intention-stop-criteria'), { target: { value: '   ' } });

    const submit = screen.getByRole('button', {
      name: /concluir warm-up.*iniciar grind/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('limita inputs a max 200 chars (maxLength)', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    const focus = screen.getByTestId('intention-focus') as HTMLTextAreaElement;
    expect(focus.maxLength).toBe(200);
  });
});

describe('IntentionBlock - submit', () => {
  it('submit chama onSubmit com SessionIntention completo', () => {
    const onSubmit = vi.fn();
    render(<IntentionBlock onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId('intention-focus'), { target: { value: 'foco' } });
    fireEvent.change(screen.getByTestId('intention-tilt-plan'), { target: { value: 'tilt' } });
    fireEvent.change(screen.getByTestId('intention-stop-criteria'), { target: { value: 'stop' } });

    fireEvent.click(screen.getByRole('button', { name: /concluir warm-up.*iniciar grind/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      focus: 'foco',
      tiltPlan: 'tilt',
      stopCriteria: 'stop',
    });
  });
});
