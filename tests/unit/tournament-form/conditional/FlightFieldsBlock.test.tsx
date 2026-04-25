import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Modulo NAO EXISTE ainda (red phase).
import FlightFieldsBlock from '../../../../client/src/components/tournament-form/conditional/FlightFieldsBlock';
import { FLIGHT_DAY_SUGGESTIONS } from '../../../../shared/tournamentTypes';

// =============================================================================
// Sprint 2 - RF-06 FlightFieldsBlock
//
// Campos:
//   - flightDay (input + datalist com FLIGHT_DAY_SUGGESTIONS)
//   - flightAdvanced (checkbox, so quando Day 1A/B/C)
//   - flightParentId (autocomplete dos Day 1 do user — mockado)
//
// Hints:
//   - Day Final: "Position e prize obrigatorios"
//   - Estados visuais: Day 1 (verde), intermediario (amarelo), Final (azul)
//
// Mock: useQuery flight-parents -> [].
//
// data-testid:
//   - wizard-flight-day
//   - wizard-flight-advanced
//   - wizard-flight-parent-id
//   - wizard-flight-final-hint
//
// RED PHASE.
// =============================================================================

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
};

const baseValue: any = {
  flightDay: '',
  flightAdvanced: null,
  flightParentId: null,
};

describe('FlightFieldsBlock', () => {
  it('renderiza input para flightDay', () => {
    render(wrap(<FlightFieldsBlock value={baseValue} onChange={() => {}} />));
    expect(screen.getByTestId('wizard-flight-day')).toBeTruthy();
  });

  it('input flightDay associa-se a um datalist com sugestoes', () => {
    render(wrap(<FlightFieldsBlock value={baseValue} onChange={() => {}} />));
    const input = screen.getByTestId('wizard-flight-day') as HTMLInputElement;
    const listAttr = input.getAttribute('list');
    if (listAttr) {
      const dl = document.getElementById(listAttr) as HTMLDataListElement | null;
      expect(dl).toBeTruthy();
      const opts = Array.from(dl!.querySelectorAll('option')).map((o) =>
        (o as HTMLOptionElement).value,
      );
      // Deve conter as sugestoes do SSoT.
      for (const s of FLIGHT_DAY_SUGGESTIONS) {
        expect(opts).toContain(s);
      }
    } else {
      // Pode ser implementado como Combobox: precisa pelo menos exibir as opcoes
      // como elementos no DOM em algum momento.
      const html = document.body.outerHTML;
      for (const s of FLIGHT_DAY_SUGGESTIONS.slice(0, 3)) {
        expect(html).toContain(s);
      }
    }
  });

  it('renderiza checkbox flightAdvanced quando flightDay matches Day 1A/B/C/D/E', () => {
    render(
      wrap(
        <FlightFieldsBlock
          value={{ ...baseValue, flightDay: '1A' }}
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId('wizard-flight-advanced')).toBeTruthy();
  });

  it('NAO renderiza flightAdvanced quando flightDay=Final', () => {
    render(
      wrap(
        <FlightFieldsBlock
          value={{ ...baseValue, flightDay: 'Final' }}
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId('wizard-flight-advanced')).toBeNull();
  });

  it('NAO renderiza flightAdvanced quando flightDay=2 (intermediario)', () => {
    render(
      wrap(
        <FlightFieldsBlock
          value={{ ...baseValue, flightDay: '2' }}
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId('wizard-flight-advanced')).toBeNull();
  });

  it('mostra hint quando flightDay=Final ("Position e prize obrigatorios")', () => {
    render(
      wrap(
        <FlightFieldsBlock
          value={{ ...baseValue, flightDay: 'Final' }}
          onChange={() => {}}
        />,
      ),
    );
    const hint = screen.queryByTestId('wizard-flight-final-hint');
    if (hint) {
      expect(hint.textContent).toMatch(/Position.*prize|prize.*Position|posi.*prize/i);
    } else {
      const matches = screen.queryAllByText(/Position.*prize|prize.*posi/i);
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it('renderiza autocomplete para flightParentId', () => {
    render(wrap(<FlightFieldsBlock value={baseValue} onChange={() => {}} />));
    expect(screen.getByTestId('wizard-flight-parent-id')).toBeTruthy();
  });

  it('alterar flightDay dispara onChange', () => {
    const onChange = vi.fn();
    render(wrap(<FlightFieldsBlock value={baseValue} onChange={onChange} />));
    const input = screen.getByTestId('wizard-flight-day') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1B' } });
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(arg.flightDay).toBe('1B');
  });

  it('toggle flightAdvanced dispara onChange', () => {
    const onChange = vi.fn();
    render(
      wrap(
        <FlightFieldsBlock
          value={{ ...baseValue, flightDay: '1A', flightAdvanced: false }}
          onChange={onChange}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('wizard-flight-advanced'));
    const arg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(arg.flightAdvanced).toBe(true);
  });

  it('estado visual de Day 1 contem cor verde (smoke - classe aplicada)', () => {
    render(
      wrap(
        <FlightFieldsBlock
          value={{ ...baseValue, flightDay: '1A' }}
          onChange={() => {}}
        />,
      ),
    );
    // Procura por algum elemento com classe relacionada a verde.
    const html = document.body.outerHTML;
    expect(html).toMatch(/(green|emerald|teal)/i);
  });

  it('estado visual de Day Final contem cor azul (smoke)', () => {
    render(
      wrap(
        <FlightFieldsBlock
          value={{ ...baseValue, flightDay: 'Final' }}
          onChange={() => {}}
        />,
      ),
    );
    const html = document.body.outerHTML;
    expect(html).toMatch(/(blue|sky|indigo|cyan)/i);
  });
});
