import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// =============================================================================
// Testes TDD (Sprint W-1): OverrideConfirmDialog (RF-05, ADR-027)
//
// Contrato:
//   <OverrideConfirmDialog
//     open={boolean}
//     onConfirm={() => void}
//     onCancel={() => void}
//   />
//
// Microcopy obrigatoria:
//   "Tem certeza? Sessões em estado mental abaixo de 6 são estatisticamente -EV.
//    [Sim, registrar override] [Cancelar]"
//
// Status: red phase.
// =============================================================================

import { OverrideConfirmDialog } from '@/components/warmup/OverrideConfirmDialog';

describe('OverrideConfirmDialog - render', () => {
  it('NAO renderiza quando open=false', () => {
    render(<OverrideConfirmDialog open={false} onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.body.textContent || '').not.toMatch(/tem certeza/i);
  });

  it('renderiza quando open=true', () => {
    render(<OverrideConfirmDialog open onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.body.textContent).toMatch(/tem certeza/i);
  });

  it('exibe microcopy "estado mental abaixo de 6"', () => {
    render(<OverrideConfirmDialog open onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.body.textContent).toMatch(/estado mental.*abaixo.*6/i);
  });

  it('menciona "-EV"', () => {
    render(<OverrideConfirmDialog open onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.body.textContent).toMatch(/EV/i);
  });
});

describe('OverrideConfirmDialog - botoes', () => {
  it('botao "Sim, registrar override" chama onConfirm', () => {
    const onConfirm = vi.fn();
    render(<OverrideConfirmDialog open onConfirm={onConfirm} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /sim,?\s*registrar override/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('botao "Cancelar" chama onCancel', () => {
    const onCancel = vi.fn();
    render(<OverrideConfirmDialog open onConfirm={() => {}} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('botao destrutivo "Sim, registrar override" tem classe ambar/vermelha (aviso visual)', () => {
    render(<OverrideConfirmDialog open onConfirm={() => {}} onCancel={() => {}} />);
    const confirm = screen.getByRole('button', { name: /sim,?\s*registrar override/i });
    // Heuristica: alguma classe de cor de aviso
    const cls = confirm.className;
    expect(/amber|red|destructive|warning/i.test(cls)).toBe(true);
  });
});
