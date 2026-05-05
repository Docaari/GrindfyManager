import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// IntentionBlock — Reform 2026-05-05
//
// - Bloco OPCIONAL. Botao "Proximo" SEMPRE habilitado.
// - Campos vazios -> onSubmit recebe null.
// - Campos preenchidos -> onSubmit recebe SessionIntention.
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

  it('marca como opcional', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    expect(document.body.textContent).toMatch(/opcional/i);
  });

  it('botao "Proximo" sempre habilitado', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    const submit = screen.getByTestId('intention-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('limita inputs a max 200 chars (maxLength)', () => {
    render(<IntentionBlock onSubmit={() => {}} />);
    const focus = screen.getByTestId('intention-focus') as HTMLTextAreaElement;
    expect(focus.maxLength).toBe(200);
  });
});

describe('IntentionBlock - submit', () => {
  it('vazio -> onSubmit recebe null', () => {
    const onSubmit = vi.fn();
    render(<IntentionBlock onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('intention-submit'));
    expect(onSubmit).toHaveBeenCalledWith(null);
  });

  it('whitespace puro -> null', () => {
    const onSubmit = vi.fn();
    render(<IntentionBlock onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('intention-focus'), { target: { value: '  ' } });
    fireEvent.change(screen.getByTestId('intention-tilt-plan'), { target: { value: '  ' } });
    fireEvent.change(screen.getByTestId('intention-stop-criteria'), { target: { value: '  ' } });
    fireEvent.click(screen.getByTestId('intention-submit'));
    expect(onSubmit).toHaveBeenCalledWith(null);
  });

  it('preenchido -> onSubmit recebe SessionIntention', () => {
    const onSubmit = vi.fn();
    render(<IntentionBlock onSubmit={onSubmit} />);

    fireEvent.change(screen.getByTestId('intention-focus'), { target: { value: 'foco' } });
    fireEvent.change(screen.getByTestId('intention-tilt-plan'), { target: { value: 'tilt' } });
    fireEvent.change(screen.getByTestId('intention-stop-criteria'), { target: { value: 'stop' } });

    fireEvent.click(screen.getByTestId('intention-submit'));

    expect(onSubmit).toHaveBeenCalledWith({
      focus: 'foco',
      tiltPlan: 'tilt',
      stopCriteria: 'stop',
    });
  });

  it('parcial -> retorna campos preenchidos + outros vazios', () => {
    const onSubmit = vi.fn();
    render(<IntentionBlock onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('intention-focus'), { target: { value: 'apenas foco' } });
    fireEvent.click(screen.getByTestId('intention-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      focus: 'apenas foco',
      tiltPlan: '',
      stopCriteria: '',
    });
  });
});
