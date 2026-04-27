/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint Alarmes 2.0
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-03 Modal de criacao de alarme vinculado a torneio
 *  - P1-1 Modos de horario simplificados (2 visiveis + "Outro horario..." colapsado)
 *  - P1-2 Lista ordenada por proximidade temporal
 *  - P1-3 Preview habilitado mesmo sem voz selecionada
 *
 * Componente: client/src/components/grind-session-live/TournamentAlertDialog.tsx (NAO existe — red phase).
 *
 * Props esperadas:
 *   {
 *     open: boolean,
 *     onOpenChange: (b: boolean) => void,
 *     plannedTournaments: PlannedTournamentLite[],
 *     sessionTournaments: SessionTournamentLite[],
 *     onCreate: (input: { type: 'tournament', tournamentId, narrationText, triggerAt, label }) => void,
 *     ttsAvailable: boolean,
 *     voice: SpeechSynthesisVoice | null,
 *     volume: number,
 *     redactBuyIn: boolean,
 *   }
 *
 * data-testid usados (estaveis):
 *   tournament-alert-dialog
 *   tournament-select
 *   tournament-option-{id}
 *   trigger-mode-before-start
 *   trigger-mode-before-late
 *   trigger-mode-absolute-toggle
 *   trigger-mode-absolute-input
 *   minutes-before-start-input
 *   minutes-before-late-input
 *   narration-preview
 *   preview-btn
 *   save-btn
 *   error-msg
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const speakUtteranceMock = vi.fn();
vi.mock('../../../client/src/lib/ttsVoices', () => ({
  speakUtterance: (...args: any[]) => speakUtteranceMock(...args),
  pickVoice: vi.fn((_uri: string | null, voices: any[]) => voices[0] ?? null),
  getPtBRVoices: vi.fn(async () => []),
  useTTSVoices: vi.fn(),
}));

const buildTournamentNarrationMock = vi.fn(
  (t: any, opts: { redactBuyIn: boolean }) =>
    opts.redactBuyIn
      ? `${t.site}, ${t.name}, atencao`
      : `${t.site}, ${t.name}, buy-in ${t.buyIn}`
);
vi.mock('../../../client/src/lib/tournamentNarration', () => ({
  buildTournamentNarration: (...args: any[]) => buildTournamentNarrationMock(...args),
}));

// Componente NAO existe — implementer cria.
import { TournamentAlertDialog } from '../../../client/src/components/grind-session-live/TournamentAlertDialog';

function makePlanned(overrides: any = {}) {
  // Shape REAL validado em shared/schema.ts plannedTournaments.
  return {
    id: 'p1',
    name: 'Sunday Plus',
    site: 'Suprema',
    buyIn: '100',
    time: '19:00',
    startTime: new Date(Date.now() + 60 * 60_000),
    lateRegMinutes: 60,
    status: 'upcoming',
    ...overrides,
  };
}

const baseVoice = { name: 'Maria', voiceURI: 'maria-uri', lang: 'pt-BR' } as any;

const baseProps: any = {
  open: true,
  onOpenChange: vi.fn(),
  plannedTournaments: [],
  sessionTournaments: [],
  onCreate: vi.fn(),
  ttsAvailable: true,
  voice: baseVoice,
  volume: 0.8,
  redactBuyIn: true,
};

beforeEach(() => {
  speakUtteranceMock.mockClear();
  buildTournamentNarrationMock.mockClear();
  baseProps.onCreate = vi.fn();
  baseProps.onOpenChange = vi.fn();
});

describe('TournamentAlertDialog (RF-03)', () => {
  describe('Lista combinada e ordenacao (P1-2)', () => {
    it('exibe lista combinada planned + session com status upcoming', () => {
      const tFar = makePlanned({
        id: 'p1',
        name: 'A Far',
        startTime: new Date(Date.now() + 4 * 60 * 60_000),
      });
      const tNear = makePlanned({
        id: 'p2',
        name: 'B Near',
        startTime: new Date(Date.now() + 1 * 60 * 60_000),
      });

      render(
        <TournamentAlertDialog
          {...baseProps}
          plannedTournaments={[tFar, tNear]}
        />
      );

      expect(screen.getByTestId('tournament-option-p1')).toBeInTheDocument();
      expect(screen.getByTestId('tournament-option-p2')).toBeInTheDocument();
    });

    it('lista ordenada por proximidade temporal ascendente (P1-2)', () => {
      const tFar = makePlanned({
        id: 'far',
        name: 'A Far',
        startTime: new Date(Date.now() + 4 * 60 * 60_000),
      });
      const tNear = makePlanned({
        id: 'near',
        name: 'B Near',
        startTime: new Date(Date.now() + 1 * 60 * 60_000),
      });

      const { container } = render(
        <TournamentAlertDialog
          {...baseProps}
          plannedTournaments={[tFar, tNear]}
        />
      );

      const opts = container.querySelectorAll('[data-testid^="tournament-option-"]');
      // Primeiro deve ser o mais proximo.
      expect(opts[0].getAttribute('data-testid')).toBe('tournament-option-near');
      expect(opts[1].getAttribute('data-testid')).toBe('tournament-option-far');
    });
  });

  describe('Modos de horario (P1-1)', () => {
    it('modo "Antes do start" pre-preenchido com 10 min', async () => {
      const t = makePlanned();
      const user = userEvent.setup();
      render(
        <TournamentAlertDialog {...baseProps} plannedTournaments={[t]} />
      );

      await user.click(screen.getByTestId('tournament-option-p1'));

      const input = screen.getByTestId('minutes-before-start-input') as HTMLInputElement;
      expect(input.value).toBe('10');
    });

    it('modo "Antes do late close" so aparece se lateRegMinutes > 0', async () => {
      const t = makePlanned({ lateRegMinutes: 60 });
      const user = userEvent.setup();
      render(
        <TournamentAlertDialog {...baseProps} plannedTournaments={[t]} />
      );

      await user.click(screen.getByTestId('tournament-option-p1'));

      expect(screen.queryByTestId('minutes-before-late-input')).toBeInTheDocument();
    });

    it('modo "Antes do late close" oculto quando lateRegMinutes nao existe', async () => {
      const t = makePlanned({ lateRegMinutes: undefined });
      const user = userEvent.setup();
      render(
        <TournamentAlertDialog {...baseProps} plannedTournaments={[t]} />
      );

      await user.click(screen.getByTestId('tournament-option-p1'));

      expect(screen.queryByTestId('minutes-before-late-input')).not.toBeInTheDocument();
    });

    it('modo "Outro horario..." inicialmente colapsado, expansao mostra input time', async () => {
      const t = makePlanned();
      const user = userEvent.setup();
      render(
        <TournamentAlertDialog {...baseProps} plannedTournaments={[t]} />
      );

      await user.click(screen.getByTestId('tournament-option-p1'));

      // Inicialmente nao visivel.
      expect(screen.queryByTestId('trigger-mode-absolute-input')).not.toBeInTheDocument();

      // Click no toggle expande.
      await user.click(screen.getByTestId('trigger-mode-absolute-toggle'));

      expect(screen.getByTestId('trigger-mode-absolute-input')).toBeInTheDocument();
    });
  });

  describe('Preview de narracao (RF-03)', () => {
    it('selecionar torneio popula previa automaticamente (P1-1)', async () => {
      const t = makePlanned({ buyIn: '100', name: 'Sunday Plus', site: 'Suprema' });
      const user = userEvent.setup();
      render(
        <TournamentAlertDialog
          {...baseProps}
          plannedTournaments={[t]}
          redactBuyIn={false}
        />
      );

      await user.click(screen.getByTestId('tournament-option-p1'));

      const preview = screen.getByTestId('narration-preview');
      expect(preview.textContent).toContain('Suprema');
      expect(preview.textContent).toContain('Sunday Plus');
      expect(buildTournamentNarrationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          site: 'Suprema',
          name: 'Sunday Plus',
          buyIn: '100',
        }),
        expect.objectContaining({ redactBuyIn: false })
      );
    });

    it('redactBuyIn=true -> previa narra "atencao" sem valor', async () => {
      const t = makePlanned({ buyIn: '100' });
      const user = userEvent.setup();
      render(
        <TournamentAlertDialog
          {...baseProps}
          plannedTournaments={[t]}
          redactBuyIn={true}
        />
      );

      await user.click(screen.getByTestId('tournament-option-p1'));

      const preview = screen.getByTestId('narration-preview');
      expect(preview.textContent).toContain('atencao');
      expect(preview.textContent).not.toContain('100');
    });

    it('preview button toca narracao 1x sem repeat', async () => {
      const t = makePlanned();
      const user = userEvent.setup();
      render(
        <TournamentAlertDialog {...baseProps} plannedTournaments={[t]} />
      );

      await user.click(screen.getByTestId('tournament-option-p1'));
      await user.click(screen.getByTestId('preview-btn'));

      expect(speakUtteranceMock).toHaveBeenCalledTimes(1);
    });

    it('preview disabled quando nenhum torneio selecionado', () => {
      render(
        <TournamentAlertDialog
          {...baseProps}
          plannedTournaments={[makePlanned()]}
        />
      );

      const previewBtn = screen.getByTestId('preview-btn');
      expect(previewBtn).toBeDisabled();
    });

    it('preview disabled quando ttsAvailable=false', async () => {
      const t = makePlanned();
      const user = userEvent.setup();
      render(
        <TournamentAlertDialog
          {...baseProps}
          plannedTournaments={[t]}
          ttsAvailable={false}
        />
      );

      await user.click(screen.getByTestId('tournament-option-p1'));

      const previewBtn = screen.getByTestId('preview-btn');
      expect(previewBtn).toBeDisabled();
    });
  });

  describe('Salvar (onCreate)', () => {
    it('confirm chama onCreate com payload type=tournament', async () => {
      const t = makePlanned({ id: 'p1' });
      const onCreate = vi.fn();
      const user = userEvent.setup();
      render(
        <TournamentAlertDialog
          {...baseProps}
          plannedTournaments={[t]}
          onCreate={onCreate}
        />
      );

      await user.click(screen.getByTestId('tournament-option-p1'));
      await user.click(screen.getByTestId('save-btn'));

      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tournament',
          tournamentId: 'p1',
          narrationText: expect.any(String),
          triggerAt: expect.any(Date),
        })
      );
    });

    it('triggerAt no passado -> mostra erro, NAO chama onCreate', async () => {
      const tPast = makePlanned({
        id: 'past',
        startTime: new Date(Date.now() - 60_000),
      });
      const onCreate = vi.fn();
      const user = userEvent.setup();
      render(
        <TournamentAlertDialog
          {...baseProps}
          plannedTournaments={[tPast]}
          onCreate={onCreate}
        />
      );

      await user.click(screen.getByTestId('tournament-option-past'));
      await user.click(screen.getByTestId('save-btn'));

      expect(onCreate).not.toHaveBeenCalled();
      expect(screen.getByTestId('error-msg')).toBeInTheDocument();
    });
  });
});
