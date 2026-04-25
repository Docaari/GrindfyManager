import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
// Modulo NAO EXISTE ainda (red phase).
import WizardStep1Type from '../../../client/src/components/tournament-form/WizardStep1Type';
import {
  TOURNAMENT_PRIMARY_TYPES,
  TYPE_COLORS,
  TYPE_LABELS_PT_BR,
} from '../../../shared/tournamentTypes';

// =============================================================================
// Sprint 2 - RF-06 Step 1: Tipo Primario
//
// Componente: 4 botoes radio (Vanilla, PKO, Mystery, Satellite). Cada botao:
//   - mostra label PT-BR (Satellite -> "Satélite")
//   - usa cores do SSoT (TYPE_COLORS)
//   - tem data-testid="wizard-step1-type-{Type}" (estavel)
//   - dispara onChange(type) em click
//   - aria-selected=true quando value === type
//
// RED PHASE: componente nao existe ainda.
// =============================================================================

describe('WizardStep1Type', () => {
  it('renderiza 4 botoes (um por tipo primario do SSoT)', () => {
    render(<WizardStep1Type value={null} onChange={() => {}} />);
    for (const t of TOURNAMENT_PRIMARY_TYPES) {
      const btn = screen.getByTestId(`wizard-step1-type-${t}`);
      expect(btn).toBeTruthy();
    }
  });

  it('cada botao mostra o label PT-BR do SSoT', () => {
    render(<WizardStep1Type value={null} onChange={() => {}} />);
    for (const t of TOURNAMENT_PRIMARY_TYPES) {
      const btn = screen.getByTestId(`wizard-step1-type-${t}`);
      expect(btn.textContent).toContain(TYPE_LABELS_PT_BR[t]);
    }
  });

  it('o label de Satellite eh "Satélite" (PT-BR)', () => {
    render(<WizardStep1Type value={null} onChange={() => {}} />);
    const btn = screen.getByTestId('wizard-step1-type-Satellite');
    expect(btn.textContent).toContain('Satélite');
  });

  it('botao selecionado tem aria-selected=true (ou aria-checked)', () => {
    render(<WizardStep1Type value="PKO" onChange={() => {}} />);
    const btn = screen.getByTestId('wizard-step1-type-PKO');
    const selected =
      btn.getAttribute('aria-selected') === 'true' ||
      btn.getAttribute('aria-checked') === 'true' ||
      btn.getAttribute('data-selected') === 'true';
    expect(selected).toBe(true);
  });

  it('botoes nao-selecionados tem aria-selected=false (ou aria-checked=false)', () => {
    render(<WizardStep1Type value="PKO" onChange={() => {}} />);
    const btn = screen.getByTestId('wizard-step1-type-Vanilla');
    const selected =
      btn.getAttribute('aria-selected') === 'true' ||
      btn.getAttribute('aria-checked') === 'true' ||
      btn.getAttribute('data-selected') === 'true';
    expect(selected).toBe(false);
  });

  it('click em um botao chama onChange(type)', () => {
    const onChange = vi.fn();
    render(<WizardStep1Type value={null} onChange={onChange} />);
    const btn = screen.getByTestId('wizard-step1-type-Mystery');
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith('Mystery');
  });

  it('click em Satellite dispara onChange("Satellite")', () => {
    const onChange = vi.fn();
    render(<WizardStep1Type value={null} onChange={onChange} />);
    const btn = screen.getByTestId('wizard-step1-type-Satellite');
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith('Satellite');
  });

  it('aplica a classe `bg` do SSoT no botao (cor de cada tipo)', () => {
    render(<WizardStep1Type value="Vanilla" onChange={() => {}} />);
    const btn = screen.getByTestId('wizard-step1-type-Vanilla');
    const expectedBg = TYPE_COLORS.Vanilla.bg.split(' ')[0]; // ex: bg-zinc-100
    // Deve aparecer no className do botao OU em algum descendente
    const html = btn.outerHTML;
    expect(html).toContain(expectedBg);
  });

  it('todos os 4 botoes sao independentes (selecionar um nao seleciona outros)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<WizardStep1Type value="Vanilla" onChange={onChange} />);
    // Selecionado = Vanilla
    let vanilla = screen.getByTestId('wizard-step1-type-Vanilla');
    let pko = screen.getByTestId('wizard-step1-type-PKO');
    expect(
      vanilla.getAttribute('aria-selected') === 'true' ||
      vanilla.getAttribute('aria-checked') === 'true' ||
      vanilla.getAttribute('data-selected') === 'true',
    ).toBe(true);
    expect(
      pko.getAttribute('aria-selected') === 'true' ||
      pko.getAttribute('aria-checked') === 'true' ||
      pko.getAttribute('data-selected') === 'true',
    ).toBe(false);
  });
});
