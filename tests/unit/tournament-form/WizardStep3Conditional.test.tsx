import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Modulo NAO EXISTE ainda (red phase).
import WizardStep3Conditional from '../../../client/src/components/tournament-form/WizardStep3Conditional';

// =============================================================================
// Sprint 2 - RF-06 Step 3: Campos condicionais
//
// Sub-renderiza:
//   - SatelliteFieldsBlock se type === 'Satellite'
//   - FlightFieldsBlock se isFlight === true
//   - LiveFieldsBlock se isLive === true
//
// Skip auto: callback onSkip() quando type=Vanilla + ambos modifs false.
// Pode mostrar TODOS os blocks simultaneamente.
//
// data-testid:
//   - wizard-step3-satellite-block
//   - wizard-step3-flight-block
//   - wizard-step3-live-block
//
// RED PHASE.
// =============================================================================

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
};

const baseValue = {
  type: 'Vanilla' as const,
  isFlight: false,
  isLive: false,
};

describe('WizardStep3Conditional', () => {
  it('chama onSkip quando type=Vanilla + isFlight=false + isLive=false', () => {
    const onSkip = vi.fn();
    render(
      wrap(
        <WizardStep3Conditional
          value={baseValue}
          onChange={() => {}}
          onSkip={onSkip}
        />,
      ),
    );
    expect(onSkip).toHaveBeenCalled();
  });

  it('NAO chama onSkip quando type=Satellite', () => {
    const onSkip = vi.fn();
    render(
      wrap(
        <WizardStep3Conditional
          value={{ type: 'Satellite', isFlight: false, isLive: false }}
          onChange={() => {}}
          onSkip={onSkip}
        />,
      ),
    );
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('renderiza SatelliteFieldsBlock quando type=Satellite', () => {
    render(
      wrap(
        <WizardStep3Conditional
          value={{ type: 'Satellite', isFlight: false, isLive: false }}
          onChange={() => {}}
          onSkip={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId('wizard-step3-satellite-block')).toBeTruthy();
  });

  it('renderiza FlightFieldsBlock quando isFlight=true', () => {
    render(
      wrap(
        <WizardStep3Conditional
          value={{ type: 'PKO', isFlight: true, isLive: false }}
          onChange={() => {}}
          onSkip={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId('wizard-step3-flight-block')).toBeTruthy();
  });

  it('renderiza LiveFieldsBlock quando isLive=true', () => {
    render(
      wrap(
        <WizardStep3Conditional
          value={{ type: 'Mystery', isFlight: false, isLive: true }}
          onChange={() => {}}
          onSkip={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId('wizard-step3-live-block')).toBeTruthy();
  });

  it('renderiza TODOS os blocks em combinacao Satellite + Flight + Live', () => {
    render(
      wrap(
        <WizardStep3Conditional
          value={{ type: 'Satellite', isFlight: true, isLive: true }}
          onChange={() => {}}
          onSkip={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId('wizard-step3-satellite-block')).toBeTruthy();
    expect(screen.getByTestId('wizard-step3-flight-block')).toBeTruthy();
    expect(screen.getByTestId('wizard-step3-live-block')).toBeTruthy();
  });

  it('NAO renderiza SatelliteFieldsBlock quando type !== Satellite', () => {
    render(
      wrap(
        <WizardStep3Conditional
          value={{ type: 'PKO', isFlight: true, isLive: true }}
          onChange={() => {}}
          onSkip={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId('wizard-step3-satellite-block')).toBeNull();
  });

  it('NAO renderiza FlightFieldsBlock quando isFlight=false', () => {
    render(
      wrap(
        <WizardStep3Conditional
          value={{ type: 'Satellite', isFlight: false, isLive: true }}
          onChange={() => {}}
          onSkip={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId('wizard-step3-flight-block')).toBeNull();
  });

  it('NAO renderiza LiveFieldsBlock quando isLive=false', () => {
    render(
      wrap(
        <WizardStep3Conditional
          value={{ type: 'Satellite', isFlight: true, isLive: false }}
          onChange={() => {}}
          onSkip={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId('wizard-step3-live-block')).toBeNull();
  });
});
