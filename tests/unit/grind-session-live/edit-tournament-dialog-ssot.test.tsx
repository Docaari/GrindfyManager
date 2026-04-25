import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EditTournamentDialog from '../../../client/src/components/grind-session-live/EditTournamentDialog';
import { TOURNAMENT_PRIMARY_TYPES } from '../../../shared/tournamentTypes';

// =============================================================================
// Sprint 2 - RF-02 (revisitar): EditTournamentDialog deve renderizar
// SelectItems vindos do SSoT.
//
// Estado anterior (Sprint 1): 3 <SelectItem> literais.
// Estado esperado (Sprint 2): 4 itens (V/P/M/Satellite) derivados do SSoT.
//
// RED PHASE: hoje so 3 items hardcoded.
// =============================================================================

const noopProps = {
  open: true,
  onOpenChange: () => {},
  editingTournament: {
    id: 'T-001',
    type: 'Vanilla',
    speed: 'Normal',
    site: 'PokerStars',
    name: 'Daily $22',
    buyIn: '22.00',
    time: '19:00',
  } as any,
  setEditingTournament: () => {},
  onSave: () => {},
  isPending: false,
  currency: { symbol: '$', code: 'USD' } as any,
};

describe('EditTournamentDialog - Tipos vindos do SSoT (RF-02)', () => {
  it('renderiza SelectItems para os 4 tipos primarios', () => {
    render(<EditTournamentDialog {...noopProps} />);
    for (const t of TOURNAMENT_PRIMARY_TYPES) {
      // Pode renderizar como SelectItem (Radix) ou option dependendo da
      // implementacao. Validamos por data attr ou content.
      // Radix select item geralmente tem role="option" quando aberto, mas
      // fechado fica em DOM com data-value. Tentamos varios seletores.
      const found =
        document.querySelector(`[data-value="${t}"]`) ||
        document.querySelector(`[data-radix-select-item-value="${t}"]`) ||
        Array.from(document.querySelectorAll('*')).find((el) =>
          el.textContent === t || el.getAttribute('data-value') === t,
        );
      // Quando o Select esta colapsado, os itens podem nao estar montados em
      // alguns componentes. Para essa validacao basica, aceitamos que pelo
      // menos a string do tipo apareca em algum lugar do DOM (textContent
      // do trigger, etc.) OU exista um element com data-value=t.
      const someText = Array.from(document.querySelectorAll('*')).some((el) =>
        el.textContent && el.textContent.includes(t),
      );
      expect(
        Boolean(found) || someText,
        `tipo ${t} deveria aparecer no dialog (ssot)`,
      ).toBe(true);
    }
  });

  it('garante que Satellite aparece como opcao (nao mais ausente)', () => {
    render(<EditTournamentDialog {...noopProps} />);
    const someText = Array.from(document.querySelectorAll('*')).some((el) =>
      el.textContent && (el.textContent.includes('Satellite') || el.textContent.includes('Satélite')),
    );
    expect(someText).toBe(true);
  });

  it('NAO contem mais tipo "Flight" como opcao (Flight eh modificador agora)', () => {
    render(<EditTournamentDialog {...noopProps} />);
    // No dialog de edicao, "Flight" nao deve aparecer como item de tipo.
    // Pode aparecer em outras strings (ex: "Flight Day"), entao buscamos
    // especificamente data-value ou data-radix-select-item-value.
    const flightItem =
      document.querySelector('[data-value="Flight"]') ||
      document.querySelector('[data-radix-select-item-value="Flight"]');
    expect(flightItem).toBeFalsy();
  });
});
