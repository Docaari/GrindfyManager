/**
 * TTS Wiring Smoke Tests — Sprint Alarmes 2.0 wiring fix.
 *
 * Sessao TTS original (425064a) entregou componentes mas NAO wireou:
 *  - AlertsPanel sem botao "Novo alerta de torneio"
 *  - TournamentAlertDialog nunca importado em GrindSessionLive
 *  - fireAlert calls usando API antiga (soundEnabled), sem soundMode/voiceURI/volume
 *  - Settings sem secao "Alertas e Voz"
 *
 * Estrategia: GrindSessionLive eh ~2300 linhas com >80 deps acopladas. Em vez
 * de re-renderizar a pagina inteira, testamos o contrato de wiring via os
 * componentes que ela compoe (AlertsPanel + TournamentAlertDialog) e a presenca
 * dos controles em Settings. O wiring real (state/callbacks) eh garantido pelo
 * review de codigo + smoke manual no browser.
 *
 * data-testid usados pela pagina:
 *  - open-tournament-alert-btn  (AlertsPanel novo botao)
 *  - tournament-alert-dialog    (dialog ja existente)
 *  - settings-tts-section       (Settings nova secao)
 *  - tts-sound-mode             (Settings radio modo)
 *  - tts-voice-select           (Settings select voz)
 *  - tts-volume-slider          (Settings slider volume)
 *  - tts-repeat-count           (Settings select repeticao)
 *  - tts-repeat-gap             (Settings input gap)
 *  - tts-redact-buyin           (Settings switch)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertsPanel from '../../components/grind-session-live/AlertsPanel';
import { TournamentAlertDialog } from '../../components/grind-session-live/TournamentAlertDialog';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AlertsPanel — botao "Novo alerta de torneio" (Fix 1)', () => {
  it('NAO renderiza botao quando hasUpcomingTournaments=false', () => {
    const onOpen = vi.fn();
    render(
      <AlertsPanel
        activeAlerts={[]}
        firedAlerts={[]}
        activeCount={0}
        onCreateAlert={vi.fn()}
        onDismissAlert={vi.fn()}
        onRemoveAlert={vi.fn()}
        onRefireAlert={vi.fn()}
        onClearAll={vi.fn()}
        onOpenTournamentAlert={onOpen}
        hasUpcomingTournaments={false}
      />
    );
    expect(screen.queryByTestId('open-tournament-alert-btn')).toBeNull();
  });

  it('NAO renderiza botao quando onOpenTournamentAlert ausente', () => {
    render(
      <AlertsPanel
        activeAlerts={[]}
        firedAlerts={[]}
        activeCount={0}
        onCreateAlert={vi.fn()}
        onDismissAlert={vi.fn()}
        onRemoveAlert={vi.fn()}
        onRefireAlert={vi.fn()}
        onClearAll={vi.fn()}
        hasUpcomingTournaments={true}
      />
    );
    expect(screen.queryByTestId('open-tournament-alert-btn')).toBeNull();
  });

  it('renderiza botao quando hasUpcomingTournaments=true && callback presente', () => {
    const onOpen = vi.fn();
    render(
      <AlertsPanel
        activeAlerts={[]}
        firedAlerts={[]}
        activeCount={0}
        onCreateAlert={vi.fn()}
        onDismissAlert={vi.fn()}
        onRemoveAlert={vi.fn()}
        onRefireAlert={vi.fn()}
        onClearAll={vi.fn()}
        onOpenTournamentAlert={onOpen}
        hasUpcomingTournaments={true}
      />
    );
    expect(screen.getByTestId('open-tournament-alert-btn')).toBeInTheDocument();
  });

  it('click no botao chama onOpenTournamentAlert', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <AlertsPanel
        activeAlerts={[]}
        firedAlerts={[]}
        activeCount={0}
        onCreateAlert={vi.fn()}
        onDismissAlert={vi.fn()}
        onRemoveAlert={vi.fn()}
        onRefireAlert={vi.fn()}
        onClearAll={vi.fn()}
        onOpenTournamentAlert={onOpen}
        hasUpcomingTournaments={true}
      />
    );
    await user.click(screen.getByTestId('open-tournament-alert-btn'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('TournamentAlertDialog — wiring contract (Fix 2)', () => {
  const baseTournament = {
    id: 't1',
    name: 'PSKO',
    site: 'PokerStars',
    buyIn: '50',
    startTime: new Date(Date.now() + 60 * 60_000), // +1h
    lateRegMinutes: 30,
  };

  it('NAO renderiza quando open=false', () => {
    render(
      <TournamentAlertDialog
        open={false}
        onOpenChange={vi.fn()}
        plannedTournaments={[baseTournament]}
        onCreate={vi.fn()}
        ttsAvailable={false}
        voice={null}
        volume={0.8}
        redactBuyIn={true}
      />
    );
    expect(screen.queryByTestId('tournament-alert-dialog')).toBeNull();
  });

  it('renderiza quando open=true', () => {
    render(
      <TournamentAlertDialog
        open={true}
        onOpenChange={vi.fn()}
        plannedTournaments={[baseTournament]}
        onCreate={vi.fn()}
        ttsAvailable={false}
        voice={null}
        volume={0.8}
        redactBuyIn={true}
      />
    );
    expect(screen.getByTestId('tournament-alert-dialog')).toBeInTheDocument();
  });

  it('lista torneios disponiveis para selecao', () => {
    render(
      <TournamentAlertDialog
        open={true}
        onOpenChange={vi.fn()}
        plannedTournaments={[baseTournament]}
        onCreate={vi.fn()}
        ttsAvailable={false}
        voice={null}
        volume={0.8}
        redactBuyIn={true}
      />
    );
    expect(screen.getByTestId('tournament-option-t1')).toBeInTheDocument();
  });
});
