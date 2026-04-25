import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
// Modulo NAO EXISTE ainda (red phase).
import WizardNav from '../../../client/src/components/tournament-form/WizardNav';

// =============================================================================
// Sprint 2 - RF-06 WizardNav
//
// Botoes Voltar / Avancar / Submit + indicador de step "N de 4".
//
// data-testid:
//   - wizard-nav-back
//   - wizard-nav-next
//   - wizard-nav-submit
//   - wizard-nav-step-indicator
//
// Comportamento:
//   - Step 1: Voltar OCULTO/disabled, Avancar visivel, Submit oculto.
//   - Step 4: Voltar visivel, Avancar oculto, Submit visivel.
//   - canAdvance=false: Avancar disabled.
//
// RED PHASE.
// =============================================================================

describe('WizardNav', () => {
  it('renderiza botao Avancar no step 1', () => {
    render(
      <WizardNav
        currentStep={1}
        totalSteps={4}
        onBack={() => {}}
        onNext={() => {}}
        onSubmit={() => {}}
        canAdvance={true}
      />,
    );
    expect(screen.getByTestId('wizard-nav-next')).toBeTruthy();
  });

  it('NAO renderiza botao Voltar no step 1 (ou disabled)', () => {
    render(
      <WizardNav
        currentStep={1}
        totalSteps={4}
        onBack={() => {}}
        onNext={() => {}}
        onSubmit={() => {}}
        canAdvance={true}
      />,
    );
    const back = screen.queryByTestId('wizard-nav-back');
    if (back) {
      expect((back as HTMLButtonElement).disabled).toBe(true);
    } else {
      expect(back).toBeNull();
    }
  });

  it('NAO renderiza botao Submit no step 1', () => {
    render(
      <WizardNav
        currentStep={1}
        totalSteps={4}
        onBack={() => {}}
        onNext={() => {}}
        onSubmit={() => {}}
        canAdvance={true}
      />,
    );
    expect(screen.queryByTestId('wizard-nav-submit')).toBeNull();
  });

  it('renderiza Submit no step final (4 de 4)', () => {
    render(
      <WizardNav
        currentStep={4}
        totalSteps={4}
        onBack={() => {}}
        onNext={() => {}}
        onSubmit={() => {}}
        canAdvance={true}
      />,
    );
    expect(screen.getByTestId('wizard-nav-submit')).toBeTruthy();
  });

  it('NAO renderiza Avancar no step final', () => {
    render(
      <WizardNav
        currentStep={4}
        totalSteps={4}
        onBack={() => {}}
        onNext={() => {}}
        onSubmit={() => {}}
        canAdvance={true}
      />,
    );
    expect(screen.queryByTestId('wizard-nav-next')).toBeNull();
  });

  it('Avancar com canAdvance=false esta disabled', () => {
    render(
      <WizardNav
        currentStep={1}
        totalSteps={4}
        onBack={() => {}}
        onNext={() => {}}
        onSubmit={() => {}}
        canAdvance={false}
      />,
    );
    const next = screen.getByTestId('wizard-nav-next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it('Avancar com canAdvance=true clicavel chama onNext', () => {
    const onNext = vi.fn();
    render(
      <WizardNav
        currentStep={2}
        totalSteps={4}
        onBack={() => {}}
        onNext={onNext}
        onSubmit={() => {}}
        canAdvance={true}
      />,
    );
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    expect(onNext).toHaveBeenCalled();
  });

  it('Voltar clicavel chama onBack', () => {
    const onBack = vi.fn();
    render(
      <WizardNav
        currentStep={3}
        totalSteps={4}
        onBack={onBack}
        onNext={() => {}}
        onSubmit={() => {}}
        canAdvance={true}
      />,
    );
    const back = screen.getByTestId('wizard-nav-back');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalled();
  });

  it('Submit clicavel chama onSubmit', () => {
    const onSubmit = vi.fn();
    render(
      <WizardNav
        currentStep={4}
        totalSteps={4}
        onBack={() => {}}
        onNext={() => {}}
        onSubmit={onSubmit}
        canAdvance={true}
      />,
    );
    fireEvent.click(screen.getByTestId('wizard-nav-submit'));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('renderiza step indicator com formato "N de M"', () => {
    render(
      <WizardNav
        currentStep={2}
        totalSteps={4}
        onBack={() => {}}
        onNext={() => {}}
        onSubmit={() => {}}
        canAdvance={true}
      />,
    );
    const indicator = screen.getByTestId('wizard-nav-step-indicator');
    // Aceita "2 de 4", "Step 2 de 4", "2/4", etc.
    expect(indicator.textContent).toMatch(/2.*4|2\s*\/\s*4/);
  });
});
