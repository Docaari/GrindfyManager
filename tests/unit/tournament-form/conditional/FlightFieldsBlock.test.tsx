import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FlightFieldsBlock from '../../../../client/src/components/tournament-form/conditional/FlightFieldsBlock';

// =============================================================================
// Sprint Flight-1 H6 — refatorado pra usar tournament_series API.
// Substitui flags ADR-031 (flightDay/flightAdvanced/flightParentId) por
// seriesId + baggedAt.
//
// Mock: apiRequest GET /api/tournament-series -> [].
//
// data-testid:
//   - wizard-flight-series-id (select)
//   - wizard-flight-bagged (checkbox)
//   - wizard-flight-series-empty-hint (quando lista vazia)
// =============================================================================

vi.mock('../../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => []),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
}));

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
};

const baseValue: any = {
  seriesId: null,
  baggedAt: null,
};

describe('FlightFieldsBlock (H6 refatorado)', () => {
  it('renderiza select para seriesId', () => {
    render(wrap(<FlightFieldsBlock value={baseValue} onChange={() => {}} />));
    expect(screen.getByTestId('wizard-flight-series-id')).toBeTruthy();
  });

  it('renderiza checkbox bagged', () => {
    render(wrap(<FlightFieldsBlock value={baseValue} onChange={() => {}} />));
    expect(screen.getByTestId('wizard-flight-bagged')).toBeTruthy();
  });

  it('mostra hint quando lista series vazia', async () => {
    render(wrap(<FlightFieldsBlock value={baseValue} onChange={() => {}} />));
    // Aguarda render inicial (sem series, mostra hint).
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId('wizard-flight-series-empty-hint')).toBeTruthy();
  });

  it('select seriesId dispara onChange (limpar -> null)', () => {
    const onChange = vi.fn();
    // start with seriesId set, change to ''
    render(
      wrap(
        <FlightFieldsBlock
          value={{ ...baseValue, seriesId: 'srs-old' }}
          onChange={onChange}
        />,
      ),
    );
    const select = screen.getByTestId('wizard-flight-series-id') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(arg.seriesId).toBeNull();
  });

  it('toggle bagged seta baggedAt = Date', () => {
    const onChange = vi.fn();
    render(wrap(<FlightFieldsBlock value={baseValue} onChange={onChange} />));
    fireEvent.click(screen.getByTestId('wizard-flight-bagged'));
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(arg.baggedAt).toBeInstanceOf(Date);
  });

  it('toggle bagged off (com baggedAt setado) zera baggedAt', () => {
    const onChange = vi.fn();
    render(
      wrap(
        <FlightFieldsBlock
          value={{ ...baseValue, baggedAt: new Date() }}
          onChange={onChange}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('wizard-flight-bagged'));
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(arg.baggedAt).toBeNull();
  });

  it('container tem cor cyan (smoke estilo Flight)', () => {
    render(wrap(<FlightFieldsBlock value={baseValue} onChange={() => {}} />));
    const html = document.body.outerHTML;
    expect(html).toMatch(/cyan/i);
  });
});
