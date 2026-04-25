import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Modulo NAO EXISTE ainda (red phase).
import TournamentFormWizard from '../../../client/src/components/tournament-form/TournamentFormWizard';

// =============================================================================
// Sprint 2 - RF-06: TournamentFormWizard (orquestrador)
//
// Modelo de state machine simples (React state):
//   step: 1 | 2 | 3 | 4
//   value: { type, isFlight, isLive, ...campos }
//
// Comportamentos chave:
//   - Step 1 inicial.
//   - Avancar disabled em Step 1 ate user selecionar tipo.
//   - Vanilla puro + nenhum modifier: Step 3 PULADO (1 -> 2 -> 4).
//   - Satellite: Step 3 sempre.
//   - isFlight=true: Step 3 mostra FlightFieldsBlock.
//   - isLive=true: Step 3 mostra LiveFieldsBlock.
//   - Multi-modifiers: Step 3 mostra todos.
//   - Voltar preserva state.
//   - Submit no Step 4 chama onSubmit({...payload}).
//   - WizardBadges visiveis no header em todos os steps (atualizam).
//
// data-testid relevantes (depende dos sub-componentes):
//   - wizard-step1-type-{T}
//   - wizard-step2-isFlight, wizard-step2-isLive
//   - wizard-nav-next, wizard-nav-back, wizard-nav-submit
//   - wizard-step3-{satellite|flight|live}-block
//   - wizard-step4-site, wizard-step4-buyIn, etc.
//   - wizard-current-step (data attr indicando step atual)
//
// RED PHASE.
// =============================================================================

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
};

describe('TournamentFormWizard - state machine', () => {
  it('renderiza Step 1 inicialmente', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    // Botoes do step 1 sao visiveis
    expect(screen.getByTestId('wizard-step1-type-Vanilla')).toBeTruthy();
    expect(screen.queryByTestId('wizard-step2-isFlight')).toBeNull();
  });

  it('Avancar esta disabled antes de selecionar tipo', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    const next = screen.getByTestId('wizard-nav-next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it('apos selecionar tipo, Avancar fica habilitado', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    fireEvent.click(screen.getByTestId('wizard-step1-type-PKO'));
    const next = screen.getByTestId('wizard-nav-next') as HTMLButtonElement;
    expect(next.disabled).toBe(false);
  });

  it('Vanilla + nenhum modificador: Step 3 e PULADO (vai direto pro Step 4)', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    // Step 1: selecionar Vanilla, avancar
    fireEvent.click(screen.getByTestId('wizard-step1-type-Vanilla'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    // Step 2: nenhum modificador, avancar
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    // Esperado: Step 4 (Step 3 pulado por skip auto).
    expect(screen.getByTestId('wizard-step4-site')).toBeTruthy();
    expect(screen.queryByTestId('wizard-step3-satellite-block')).toBeNull();
    expect(screen.queryByTestId('wizard-step3-flight-block')).toBeNull();
    expect(screen.queryByTestId('wizard-step3-live-block')).toBeNull();
  });

  it('Satellite + nenhum modificador: Step 3 mostra SatelliteFieldsBlock', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    fireEvent.click(screen.getByTestId('wizard-step1-type-Satellite'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    // Step 2: nao marca nada, avanca.
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    expect(screen.getByTestId('wizard-step3-satellite-block')).toBeTruthy();
    expect(screen.queryByTestId('wizard-step3-flight-block')).toBeNull();
    expect(screen.queryByTestId('wizard-step3-live-block')).toBeNull();
  });

  it('Vanilla + isFlight=true: Step 3 mostra FlightFieldsBlock', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    fireEvent.click(screen.getByTestId('wizard-step1-type-Vanilla'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    fireEvent.click(screen.getByTestId('wizard-step2-isFlight'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    expect(screen.getByTestId('wizard-step3-flight-block')).toBeTruthy();
  });

  it('Mystery + isLive=true: Step 3 mostra LiveFieldsBlock', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    fireEvent.click(screen.getByTestId('wizard-step1-type-Mystery'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    fireEvent.click(screen.getByTestId('wizard-step2-isLive'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    expect(screen.getByTestId('wizard-step3-live-block')).toBeTruthy();
  });

  it('Satellite + isFlight + isLive: Step 3 mostra TODOS os blocks', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    fireEvent.click(screen.getByTestId('wizard-step1-type-Satellite'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    fireEvent.click(screen.getByTestId('wizard-step2-isFlight'));
    fireEvent.click(screen.getByTestId('wizard-step2-isLive'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    expect(screen.getByTestId('wizard-step3-satellite-block')).toBeTruthy();
    expect(screen.getByTestId('wizard-step3-flight-block')).toBeTruthy();
    expect(screen.getByTestId('wizard-step3-live-block')).toBeTruthy();
  });

  it('Voltar do Step 2 para Step 1 preserva tipo selecionado', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    fireEvent.click(screen.getByTestId('wizard-step1-type-PKO'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    // Estamos no Step 2; clicar Voltar.
    fireEvent.click(screen.getByTestId('wizard-nav-back'));
    // PKO ainda selecionado (aria-selected/checked/data-selected)
    const pko = screen.getByTestId('wizard-step1-type-PKO');
    const selected =
      pko.getAttribute('aria-selected') === 'true' ||
      pko.getAttribute('aria-checked') === 'true' ||
      pko.getAttribute('data-selected') === 'true';
    expect(selected).toBe(true);
  });

  it('Submit no Step 4 chama onSubmit com payload completo', () => {
    const onSubmit = vi.fn();
    render(wrap(<TournamentFormWizard onSubmit={onSubmit} />));
    fireEvent.click(screen.getByTestId('wizard-step1-type-PKO'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    // Step 2 sem modificadores.
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    // Step 4 (Step 3 pulado).
    const site = screen.getByTestId('wizard-step4-site') as HTMLInputElement | HTMLSelectElement;
    fireEvent.change(site, { target: { value: 'PokerStars' } });
    const time = screen.getByTestId('wizard-step4-time') as HTMLInputElement;
    fireEvent.change(time, { target: { value: '19:00' } });
    const buyIn = screen.getByTestId('wizard-step4-buyIn') as HTMLInputElement;
    fireEvent.change(buyIn, { target: { value: '22.00' } });
    fireEvent.click(screen.getByTestId('wizard-nav-submit'));
    expect(onSubmit).toHaveBeenCalled();
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.type).toBe('PKO');
    expect(payload.site).toBe('PokerStars');
    expect(payload.time).toBe('19:00');
    expect(payload.buyIn).toBe('22.00');
    expect(payload.isFlight === false || payload.isFlight === undefined).toBe(true);
    expect(payload.isLive === false || payload.isLive === undefined).toBe(true);
  });

  it('badges no header atualizam em tempo real ao selecionar tipo', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    fireEvent.click(screen.getByTestId('wizard-step1-type-Mystery'));
    expect(screen.getByTestId('wizard-badge-type-Mystery')).toBeTruthy();
  });

  it('badge Flight aparece no header apos marcar isFlight no Step 2', () => {
    render(wrap(<TournamentFormWizard onSubmit={() => {}} />));
    fireEvent.click(screen.getByTestId('wizard-step1-type-Vanilla'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    fireEvent.click(screen.getByTestId('wizard-step2-isFlight'));
    expect(screen.getByTestId('wizard-badge-mod-isFlight')).toBeTruthy();
  });

  it('payload final inclui campos condicionais Satellite quando preenchidos', () => {
    const onSubmit = vi.fn();
    render(wrap(<TournamentFormWizard onSubmit={onSubmit} />));
    fireEvent.click(screen.getByTestId('wizard-step1-type-Satellite'));
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    // Step 2 sem modificador
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    // Step 3: preenche pelo menos um campo
    const targetName = screen.queryByTestId('wizard-satellite-target-name');
    if (targetName) {
      fireEvent.change(targetName, { target: { value: 'Sunday Storm' } });
    }
    fireEvent.click(screen.getByTestId('wizard-nav-next'));
    // Step 4
    const site = screen.getByTestId('wizard-step4-site') as HTMLInputElement | HTMLSelectElement;
    fireEvent.change(site, { target: { value: 'PokerStars' } });
    const time = screen.getByTestId('wizard-step4-time') as HTMLInputElement;
    fireEvent.change(time, { target: { value: '20:00' } });
    const buyIn = screen.getByTestId('wizard-step4-buyIn') as HTMLInputElement;
    fireEvent.change(buyIn, { target: { value: '11.00' } });
    fireEvent.click(screen.getByTestId('wizard-nav-submit'));
    expect(onSubmit).toHaveBeenCalled();
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.type).toBe('Satellite');
    if (targetName) {
      expect(payload.satelliteTargetName).toBe('Sunday Storm');
    }
  });
});
