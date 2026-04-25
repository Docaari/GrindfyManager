import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
// Modulo NAO EXISTE ainda (red phase).
import WizardStep2Modifiers from '../../../client/src/components/tournament-form/WizardStep2Modifiers';

// =============================================================================
// Sprint 2 - RF-06 Step 2: Modificadores
//
// Componente: 2 checkboxes independentes:
//   - "É Flight (multi-dia)"
//   - "É Live (presencial)"
//
// Estado: { isFlight: boolean, isLive: boolean }
// onChange recebe novo estado completo.
//
// data-testid:
//   - wizard-step2-isFlight
//   - wizard-step2-isLive
//
// RED PHASE: componente nao existe.
// =============================================================================

describe('WizardStep2Modifiers', () => {
  const initial = { isFlight: false, isLive: false };

  it('renderiza checkbox para isFlight', () => {
    render(<WizardStep2Modifiers value={initial} onChange={() => {}} />);
    const cb = screen.getByTestId('wizard-step2-isFlight');
    expect(cb).toBeTruthy();
  });

  it('renderiza checkbox para isLive', () => {
    render(<WizardStep2Modifiers value={initial} onChange={() => {}} />);
    const cb = screen.getByTestId('wizard-step2-isLive');
    expect(cb).toBeTruthy();
  });

  it('label do isFlight contem "Flight" e "multi-dia"', () => {
    render(<WizardStep2Modifiers value={initial} onChange={() => {}} />);
    const label = screen.getByText(/Flight.*multi-dia|multi-dia.*Flight/i);
    expect(label).toBeTruthy();
  });

  it('label do isLive contem "Live" e "presencial"', () => {
    render(<WizardStep2Modifiers value={initial} onChange={() => {}} />);
    const label = screen.getByText(/Live.*presencial|presencial.*Live/i);
    expect(label).toBeTruthy();
  });

  it('clicar em isFlight chama onChange com isFlight=true', () => {
    const onChange = vi.fn();
    render(<WizardStep2Modifiers value={initial} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('wizard-step2-isFlight'));
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0];
    expect(arg.isFlight).toBe(true);
    expect(arg.isLive).toBe(false);
  });

  it('clicar em isLive chama onChange com isLive=true (sem afetar isFlight)', () => {
    const onChange = vi.fn();
    render(<WizardStep2Modifiers value={initial} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('wizard-step2-isLive'));
    const arg = onChange.mock.calls[0][0];
    expect(arg.isLive).toBe(true);
    expect(arg.isFlight).toBe(false);
  });

  it('checkbox de isFlight reflete value.isFlight', () => {
    const { rerender } = render(
      <WizardStep2Modifiers value={{ isFlight: true, isLive: false }} onChange={() => {}} />,
    );
    const cb = screen.getByTestId('wizard-step2-isFlight') as HTMLInputElement;
    // Aceitar `checked` em input nativo OU aria-checked em outras impl
    const isChecked = cb.checked === true || cb.getAttribute('aria-checked') === 'true' || cb.getAttribute('data-state') === 'checked';
    expect(isChecked).toBe(true);
  });

  it('checkbox de isLive reflete value.isLive', () => {
    render(
      <WizardStep2Modifiers value={{ isFlight: false, isLive: true }} onChange={() => {}} />,
    );
    const cb = screen.getByTestId('wizard-step2-isLive') as HTMLInputElement;
    const isChecked = cb.checked === true || cb.getAttribute('aria-checked') === 'true' || cb.getAttribute('data-state') === 'checked';
    expect(isChecked).toBe(true);
  });

  it('ambos podem estar ativos simultaneamente', () => {
    const both = { isFlight: true, isLive: true };
    render(<WizardStep2Modifiers value={both} onChange={() => {}} />);
    const flight = screen.getByTestId('wizard-step2-isFlight') as HTMLInputElement;
    const live = screen.getByTestId('wizard-step2-isLive') as HTMLInputElement;
    const flightOn = flight.checked === true || flight.getAttribute('aria-checked') === 'true' || flight.getAttribute('data-state') === 'checked';
    const liveOn = live.checked === true || live.getAttribute('aria-checked') === 'true' || live.getAttribute('data-state') === 'checked';
    expect(flightOn).toBe(true);
    expect(liveOn).toBe(true);
  });

  it('toggle de isFlight quando ja ativo desliga (volta para false)', () => {
    const onChange = vi.fn();
    render(
      <WizardStep2Modifiers value={{ isFlight: true, isLive: false }} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId('wizard-step2-isFlight'));
    const arg = onChange.mock.calls[0][0];
    expect(arg.isFlight).toBe(false);
  });
});
