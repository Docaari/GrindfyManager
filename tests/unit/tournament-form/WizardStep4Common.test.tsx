import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
// Modulo NAO EXISTE ainda (red phase).
import WizardStep4Common from '../../../client/src/components/tournament-form/WizardStep4Common';

// =============================================================================
// Sprint 2 - RF-06 Step 4: Campos comuns
//
// Renderiza campos: site, time, buyIn, name, guaranteed, position, prize,
// fieldSize. Add-on/re-entry em collapsible.
//
// data-testid:
//   - wizard-step4-site
//   - wizard-step4-time
//   - wizard-step4-buyIn
//   - wizard-step4-name
//   - wizard-step4-guaranteed
//   - wizard-step4-toggle-addon
//   - wizard-step4-toggle-reentry
//
// RED PHASE: componente nao existe.
// =============================================================================

const baseValue: any = {
  site: '',
  time: '',
  buyIn: '',
  name: '',
  guaranteed: '',
  position: null,
  prize: '',
  fieldSize: '',
  allowsAddOn: false,
  addOnCost: '',
  allowsReentry: false,
  maxReentries: null,
};

describe('WizardStep4Common', () => {
  it('renderiza input para site', () => {
    render(<WizardStep4Common value={baseValue} onChange={() => {}} />);
    expect(screen.getByTestId('wizard-step4-site')).toBeTruthy();
  });

  it('renderiza input para time', () => {
    render(<WizardStep4Common value={baseValue} onChange={() => {}} />);
    expect(screen.getByTestId('wizard-step4-time')).toBeTruthy();
  });

  it('renderiza input para buyIn', () => {
    render(<WizardStep4Common value={baseValue} onChange={() => {}} />);
    expect(screen.getByTestId('wizard-step4-buyIn')).toBeTruthy();
  });

  it('renderiza input para name (opcional)', () => {
    render(<WizardStep4Common value={baseValue} onChange={() => {}} />);
    expect(screen.getByTestId('wizard-step4-name')).toBeTruthy();
  });

  it('renderiza input para guaranteed', () => {
    render(<WizardStep4Common value={baseValue} onChange={() => {}} />);
    expect(screen.getByTestId('wizard-step4-guaranteed')).toBeTruthy();
  });

  it('alterar site dispara onChange com novo valor de site', () => {
    const onChange = vi.fn();
    render(<WizardStep4Common value={baseValue} onChange={onChange} />);
    const input = screen.getByTestId('wizard-step4-site') as HTMLInputElement | HTMLSelectElement;
    fireEvent.change(input, { target: { value: 'PokerStars' } });
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(arg.site).toBe('PokerStars');
  });

  it('alterar buyIn dispara onChange com novo buyIn', () => {
    const onChange = vi.fn();
    render(<WizardStep4Common value={baseValue} onChange={onChange} />);
    const input = screen.getByTestId('wizard-step4-buyIn') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '22.00' } });
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(arg.buyIn).toBe('22.00');
  });

  it('addon collapse: ao clicar no toggle, addOnCost fica visivel', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WizardStep4Common value={baseValue} onChange={onChange} />,
    );
    const toggle = screen.getByTestId('wizard-step4-toggle-addon');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.allowsAddOn).toBe(true);

    // Re-render com allowsAddOn=true para verificar exibicao do campo addOnCost
    rerender(
      <WizardStep4Common
        value={{ ...baseValue, allowsAddOn: true }}
        onChange={onChange}
      />,
    );
    const cost = screen.queryByTestId('wizard-step4-addon-cost');
    expect(cost).toBeTruthy();
  });

  it('reentry collapse: ao clicar no toggle, maxReentries fica visivel', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WizardStep4Common value={baseValue} onChange={onChange} />,
    );
    const toggle = screen.getByTestId('wizard-step4-toggle-reentry');
    fireEvent.click(toggle);
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.allowsReentry).toBe(true);

    rerender(
      <WizardStep4Common
        value={{ ...baseValue, allowsReentry: true }}
        onChange={onChange}
      />,
    );
    const max = screen.queryByTestId('wizard-step4-max-reentries');
    expect(max).toBeTruthy();
  });

  it('NAO mostra addOnCost quando allowsAddOn=false', () => {
    render(<WizardStep4Common value={baseValue} onChange={() => {}} />);
    expect(screen.queryByTestId('wizard-step4-addon-cost')).toBeNull();
  });

  it('NAO mostra maxReentries quando allowsReentry=false', () => {
    render(<WizardStep4Common value={baseValue} onChange={() => {}} />);
    expect(screen.queryByTestId('wizard-step4-max-reentries')).toBeNull();
  });
});
