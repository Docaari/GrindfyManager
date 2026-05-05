import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// Testes TDD (Sprint W-1): EmotionalCheckBlock (RF-03, T-09)
//
// Contrato:
//   <EmotionalCheckBlock
//     onSubmit={(score: number, overrideUsed: boolean) => void}
//     onCancel={() => void}  // chamado se gate -> "Nao vou jogar"
//   />
//
// Comportamento:
//   - Compoe BreathingBox4444 + slider 0-10.
//   - Submit com score >= 6: chama onSubmit(score, false).
//   - Submit com score < 6: abre GoNoGoModal automaticamente.
//   - "Nao vou jogar" -> chama onCancel.
//   - "Ainda quero jogar" -> abre OverrideConfirmDialog.
//   - "Sim, registrar override" -> chama onSubmit(score, true).
//
// Status: red phase.
// =============================================================================

import { EmotionalCheckBlock } from '@/components/warmup/EmotionalCheckBlock';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EmotionalCheckBlock - render', () => {
  it('onCancel passa score atual (reform 2026-05-05)', () => {
    const onCancel = vi.fn();
    render(<EmotionalCheckBlock onSubmit={() => {}} onCancel={onCancel} />);
    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('emotional-check-submit'));
    // Gate aparece (score < 6) -> click "Nao vou jogar"
    fireEvent.click(screen.getByRole('button', { name: /n[aã]o vou jogar/i }));
    expect(onCancel).toHaveBeenCalledWith(3);
  });

  it('exibe titulo "Respiração + check-in"', () => {
    render(<EmotionalCheckBlock onSubmit={() => {}} onCancel={() => {}} />);
    expect(document.body.textContent).toMatch(/respira[çc][aã]o.*check-in|check-in.*respira/i);
  });

  it('exibe pergunta "Estou OK pra jogar agora?" (copia spec secao 9.1)', () => {
    render(<EmotionalCheckBlock onSubmit={() => {}} onCancel={() => {}} />);
    expect(document.body.textContent).toMatch(/estou.*ok.*jogar/i);
  });

  it('expoe slider de score com data-testid', () => {
    render(<EmotionalCheckBlock onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('emotional-check-slider')).toBeTruthy();
  });
});

describe('EmotionalCheckBlock - submit happy', () => {
  it('score=8 submit chama onSubmit(8, false) sem abrir gate', () => {
    const onSubmit = vi.fn();
    render(<EmotionalCheckBlock onSubmit={onSubmit} onCancel={() => {}} />);

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '8' } });

    const submit = screen.getByTestId('emotional-check-submit');
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(8, false);
  });

  it('score=6 (limite inclusivo) submit nao abre gate', () => {
    const onSubmit = vi.fn();
    render(<EmotionalCheckBlock onSubmit={onSubmit} onCancel={() => {}} />);

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '6' } });

    const submit = screen.getByTestId('emotional-check-submit');
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(6, false);
  });
});

describe('EmotionalCheckBlock - gate score < 6', () => {
  it('score=4 submit abre GoNoGoModal', () => {
    const onSubmit = vi.fn();
    render(<EmotionalCheckBlock onSubmit={onSubmit} onCancel={() => {}} />);

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '4' } });

    const submit = screen.getByTestId('emotional-check-submit');
    fireEvent.click(submit);

    // Modal deve aparecer - copy do spec
    expect(document.body.textContent).toMatch(/n[aã]o jogar/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('score=0 (extremo) tambem abre gate', () => {
    const onSubmit = vi.fn();
    render(<EmotionalCheckBlock onSubmit={onSubmit} onCancel={() => {}} />);

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0' } });

    fireEvent.click(screen.getByTestId('emotional-check-submit'));

    expect(document.body.textContent).toMatch(/n[aã]o jogar/i);
  });

  it('"Nao vou jogar" chama onCancel', () => {
    const onCancel = vi.fn();
    render(<EmotionalCheckBlock onSubmit={() => {}} onCancel={onCancel} />);

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('emotional-check-submit'));

    const noPlay = screen.getByRole('button', { name: /n[aã]o vou jogar/i });
    fireEvent.click(noPlay);

    expect(onCancel).toHaveBeenCalled();
  });
});

describe('EmotionalCheckBlock - override', () => {
  it('"Ainda quero jogar" abre confirmacao dupla', () => {
    render(<EmotionalCheckBlock onSubmit={() => {}} onCancel={() => {}} />);

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('emotional-check-submit'));

    const wantPlay = screen.getByRole('button', { name: /ainda quero jogar/i });
    fireEvent.click(wantPlay);

    // OverrideConfirmDialog deve aparecer - copy do spec
    expect(document.body.textContent).toMatch(/tem certeza/i);
    expect(document.body.textContent).toMatch(/-EV/);
  });

  it('"Sim, registrar override" chama onSubmit(score, true)', () => {
    const onSubmit = vi.fn();
    render(<EmotionalCheckBlock onSubmit={onSubmit} onCancel={() => {}} />);

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('emotional-check-submit'));

    fireEvent.click(screen.getByRole('button', { name: /ainda quero jogar/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /sim,?\s*registrar override/i }),
    );

    expect(onSubmit).toHaveBeenCalledWith(4, true);
  });

  it('"Cancelar" no override volta sem fechar modal', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<EmotionalCheckBlock onSubmit={onSubmit} onCancel={onCancel} />);

    const slider = screen.getByTestId('emotional-check-slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('emotional-check-submit'));

    fireEvent.click(screen.getByRole('button', { name: /ainda quero jogar/i }));

    // Tentar achar Cancelar do override dialog (excluindo "Nao vou jogar")
    const cancelBtns = screen.getAllByRole('button', { name: /cancelar/i });
    fireEvent.click(cancelBtns[0]);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('EmotionalCheckBlock - acessibilidade', () => {
  it('slider tem aria-valuenow (RNF-10)', () => {
    render(<EmotionalCheckBlock onSubmit={() => {}} onCancel={() => {}} />);
    const slider = screen.getByTestId('emotional-check-slider');
    // Aceita aria-valuenow ou aria-valuemin/max no proprio slider ou parent
    const hasAria =
      slider.hasAttribute('aria-valuenow') ||
      slider.parentElement?.hasAttribute('aria-valuenow') ||
      slider.querySelector('[aria-valuenow]') !== null;
    expect(hasAria).toBe(true);
  });
});
