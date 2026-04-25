import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Modulo NAO EXISTE ainda (red phase).
import SatelliteFieldsBlock from '../../../../client/src/components/tournament-form/conditional/SatelliteFieldsBlock';

// =============================================================================
// Sprint 2 - RF-06 SatelliteFieldsBlock
//
// Campos:
//   - satelliteRewardType (select: ticket/package/cash/mixed)
//   - satelliteTargetTemplateId (Combobox dos templates do user) — mockado
//   - satelliteTargetName (text fallback)
//   - satelliteTicketValue (decimal)
//   - satelliteExtraCash (decimal)
//   - Quando rewardType=package: liberta os 5 campos package_* + notes
//
// Refinement RELAXADO: nao ha required em rewardType nem target.
//
// data-testid:
//   - wizard-satellite-reward-type
//   - wizard-satellite-target-template-id
//   - wizard-satellite-target-name
//   - wizard-satellite-ticket-value
//   - wizard-satellite-extra-cash
//   - wizard-satellite-target-hint (hint quando target ausente)
//   - wizard-satellite-package-{buyIn|accommodation|travel|meals|other|notes}
//
// Mock: useQuery({queryKey: ['tournament-templates']}) retorna [].
//
// RED PHASE.
// =============================================================================

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
};

const baseValue: any = {
  satelliteRewardType: null,
  satelliteTargetTemplateId: null,
  satelliteTargetName: '',
  satelliteTicketValue: '',
  satelliteExtraCash: '',
  packageBuyIn: '',
  packageAccommodation: '',
  packageTravel: '',
  packageMeals: '',
  packageOther: '',
  packageNotes: '',
};

describe('SatelliteFieldsBlock', () => {
  it('renderiza select para satelliteRewardType', () => {
    render(wrap(<SatelliteFieldsBlock value={baseValue} onChange={() => {}} />));
    expect(screen.getByTestId('wizard-satellite-reward-type')).toBeTruthy();
  });

  it('select rewardType tem 4 opcoes (ticket/package/cash/mixed)', () => {
    render(wrap(<SatelliteFieldsBlock value={baseValue} onChange={() => {}} />));
    const sel = screen.getByTestId('wizard-satellite-reward-type');
    const html = sel.outerHTML;
    expect(html).toMatch(/ticket/i);
    expect(html).toMatch(/package/i);
    expect(html).toMatch(/cash/i);
    expect(html).toMatch(/mixed/i);
  });

  it('renderiza fallback satelliteTargetName (text)', () => {
    render(wrap(<SatelliteFieldsBlock value={baseValue} onChange={() => {}} />));
    expect(screen.getByTestId('wizard-satellite-target-name')).toBeTruthy();
  });

  it('renderiza input para satelliteTicketValue', () => {
    render(wrap(<SatelliteFieldsBlock value={baseValue} onChange={() => {}} />));
    expect(screen.getByTestId('wizard-satellite-ticket-value')).toBeTruthy();
  });

  it('renderiza input para satelliteExtraCash', () => {
    render(wrap(<SatelliteFieldsBlock value={baseValue} onChange={() => {}} />));
    expect(screen.getByTestId('wizard-satellite-extra-cash')).toBeTruthy();
  });

  it('NAO renderiza campos package_* quando rewardType !== package', () => {
    render(
      wrap(
        <SatelliteFieldsBlock
          value={{ ...baseValue, satelliteRewardType: 'ticket' }}
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId('wizard-satellite-package-buyIn')).toBeNull();
    expect(screen.queryByTestId('wizard-satellite-package-accommodation')).toBeNull();
  });

  it('renderiza os 5 campos package_* + notes quando rewardType=package', () => {
    render(
      wrap(
        <SatelliteFieldsBlock
          value={{ ...baseValue, satelliteRewardType: 'package' }}
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId('wizard-satellite-package-buyIn')).toBeTruthy();
    expect(screen.getByTestId('wizard-satellite-package-accommodation')).toBeTruthy();
    expect(screen.getByTestId('wizard-satellite-package-travel')).toBeTruthy();
    expect(screen.getByTestId('wizard-satellite-package-meals')).toBeTruthy();
    expect(screen.getByTestId('wizard-satellite-package-other')).toBeTruthy();
    expect(screen.getByTestId('wizard-satellite-package-notes')).toBeTruthy();
  });

  it('mostra hint quando nenhum target preenchido', () => {
    render(wrap(<SatelliteFieldsBlock value={baseValue} onChange={() => {}} />));
    const hint = screen.queryByTestId('wizard-satellite-target-hint');
    // Aceitamos: data-testid OU texto literal.
    if (hint) {
      expect(hint.textContent).toMatch(/ROI/i);
    } else {
      // Fallback: texto literal "ROI consolidado" no DOM.
      const matches = screen.queryAllByText(/ROI consolidado/i);
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it('NAO mostra hint quando satelliteTargetName preenchido', () => {
    render(
      wrap(
        <SatelliteFieldsBlock
          value={{ ...baseValue, satelliteTargetName: 'Sunday Million' }}
          onChange={() => {}}
        />,
      ),
    );
    const hint = screen.queryByTestId('wizard-satellite-target-hint');
    expect(hint).toBeNull();
  });

  it('alterar rewardType dispara onChange com novo rewardType', () => {
    const onChange = vi.fn();
    render(wrap(<SatelliteFieldsBlock value={baseValue} onChange={onChange} />));
    const sel = screen.getByTestId('wizard-satellite-reward-type') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'package' } });
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(arg.satelliteRewardType).toBe('package');
  });

  it('alterar targetName dispara onChange com novo targetName', () => {
    const onChange = vi.fn();
    render(wrap(<SatelliteFieldsBlock value={baseValue} onChange={onChange} />));
    const input = screen.getByTestId('wizard-satellite-target-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'WSOP Main' } });
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(arg.satelliteTargetName).toBe('WSOP Main');
  });

  it('alterar ticketValue aceita decimal', () => {
    const onChange = vi.fn();
    render(wrap(<SatelliteFieldsBlock value={baseValue} onChange={onChange} />));
    const input = screen.getByTestId('wizard-satellite-ticket-value') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '109.50' } });
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    // Aceita string OU number
    expect(String(arg.satelliteTicketValue)).toBe('109.50');
  });
});
