/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint Alarmes 2.0
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-03 P1-9 Botao "preview por alarme" em cada card de active alert
 *  - RF-03 P1-10 Preview no form custom (debounced 500ms)
 *
 * Componente: client/src/components/grind-session-live/AlertsPanel.tsx (existe, sera modificado).
 *
 * Lessons-learned:
 *  - data-testid estaveis (sem findByText percorrendo).
 *  - Validar shape REAL de SessionAlert (shared/generic-alerts.ts:6-15).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SessionAlert } from '@shared/generic-alerts';

const speakUtteranceMock = vi.fn();
vi.mock('../../../client/src/lib/ttsVoices', () => ({
  speakUtterance: (...args: any[]) => speakUtteranceMock(...args),
  pickVoice: vi.fn((_uri: string | null, voices: any[]) => voices[0] ?? null),
  getPtBRVoices: vi.fn(async () => []),
  useTTSVoices: vi.fn(),
}));

import AlertsPanel from '../../../client/src/components/grind-session-live/AlertsPanel';

function makeAlert(overrides: Partial<SessionAlert> = {}): SessionAlert {
  return {
    id: 'alert-1',
    type: 'custom',
    label: 'Faltam 5min',
    triggerAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    fired: false,
    dismissed: false,
    ...overrides,
  } as SessionAlert;
}

const baseProps: any = {
  activeAlerts: [],
  firedAlerts: [],
  activeCount: 0,
  onCreateAlert: vi.fn(),
  onDismissAlert: vi.fn(),
  onRemoveAlert: vi.fn(),
  onRefireAlert: vi.fn(),
  onClearAll: vi.fn(),
  // Novas props (RF-03 / P1-9 / P1-10).
  voice: { name: 'Maria', voiceURI: 'maria-uri', lang: 'pt-BR' } as any,
  volume: 0.8,
  ttsAvailable: true,
  soundMode: 'tts' as const,
};

beforeEach(() => {
  speakUtteranceMock.mockClear();
});

describe('AlertsPanel — preview por active alert (P1-9)', () => {
  it('renderiza botao Volume2 preview por alarme com data-testid estavel', () => {
    const alert = makeAlert({ id: 'alert-X', label: 'Verificar stack' });
    render(<AlertsPanel {...baseProps} activeAlerts={[alert]} activeCount={1} />);

    const previewBtn = screen.getByTestId('preview-btn-alert-X');
    expect(previewBtn).toBeInTheDocument();
  });

  it('click no preview chama speakUtterance 1x sem repeat', async () => {
    const alert = makeAlert({ id: 'alert-X', label: 'Verificar stack' });
    const user = userEvent.setup();
    render(<AlertsPanel {...baseProps} activeAlerts={[alert]} activeCount={1} />);

    await user.click(screen.getByTestId('preview-btn-alert-X'));

    expect(speakUtteranceMock).toHaveBeenCalledTimes(1);
    // Texto narrado = label se nao houver narrationText.
    expect(speakUtteranceMock).toHaveBeenCalledWith(
      'Verificar stack',
      expect.objectContaining({ voiceURI: 'maria-uri' }),
      0.8
    );
  });

  it('preview usa narrationText quando presente em vez de label', async () => {
    const alert = makeAlert({
      id: 'tourn-1',
      label: 'Sunday Plus em 10min',
      type: 'tournament' as any,
      ...({ narrationText: 'Suprema, Sunday Plus, atencao' } as any),
    });
    const user = userEvent.setup();
    render(<AlertsPanel {...baseProps} activeAlerts={[alert]} activeCount={1} />);

    await user.click(screen.getByTestId('preview-btn-tourn-1'));

    expect(speakUtteranceMock).toHaveBeenCalledWith(
      'Suprema, Sunday Plus, atencao',
      expect.anything(),
      0.8
    );
  });

  it('preview button hidden quando soundMode mute', () => {
    const alert = makeAlert({ id: 'alert-X' });
    render(
      <AlertsPanel
        {...baseProps}
        activeAlerts={[alert]}
        activeCount={1}
        soundMode="mute"
      />
    );

    expect(screen.queryByTestId('preview-btn-alert-X')).not.toBeInTheDocument();
  });

  it('preview button hidden quando ttsAvailable=false', () => {
    const alert = makeAlert({ id: 'alert-X' });
    render(
      <AlertsPanel
        {...baseProps}
        activeAlerts={[alert]}
        activeCount={1}
        ttsAvailable={false}
      />
    );

    expect(screen.queryByTestId('preview-btn-alert-X')).not.toBeInTheDocument();
  });
});

describe('AlertsPanel — preview no form custom (P1-10)', () => {
  it('renderiza botao "Ouvir como vai soar" no form custom com data-testid', async () => {
    const user = userEvent.setup();
    render(<AlertsPanel {...baseProps} />);

    // Abre form.
    await user.click(screen.getByText('Novo Alerta'));

    expect(screen.getByTestId('preview-form-custom-btn')).toBeInTheDocument();
  });

  it('botao disabled quando label vazio', async () => {
    const user = userEvent.setup();
    render(<AlertsPanel {...baseProps} />);
    await user.click(screen.getByText('Novo Alerta'));

    const btn = screen.getByTestId('preview-form-custom-btn');
    expect(btn).toBeDisabled();
  });

  it('botao habilita apos digitar label e debounce 500ms', async () => {
    vi.useFakeTimers();
    render(<AlertsPanel {...baseProps} />);
    fireEvent.click(screen.getByText('Novo Alerta'));

    const labelInput = document.querySelector('input[placeholder*="Lembrete" i]') as HTMLInputElement;
    expect(labelInput).toBeDefined();

    fireEvent.change(labelInput, { target: { value: 'Faltam 10min' } });

    const btn = screen.getByTestId('preview-form-custom-btn');

    // Antes do debounce -> ainda desabilitado.
    expect(btn).toBeDisabled();

    // Avanca debounce.
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(btn).not.toBeDisabled();
    vi.useRealTimers();
  });

  it('click em preview form chama speakUtterance com label digitado', async () => {
    vi.useFakeTimers();
    render(<AlertsPanel {...baseProps} />);
    fireEvent.click(screen.getByText('Novo Alerta'));

    const labelInput = document.querySelector('input[placeholder*="Lembrete" i]') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Faltam 10min' } });

    // Avanca debounce.
    act(() => {
      vi.advanceTimersByTime(550);
    });

    const btn = screen.getByTestId('preview-form-custom-btn');
    fireEvent.click(btn);

    expect(speakUtteranceMock).toHaveBeenCalledTimes(1);
    expect(speakUtteranceMock).toHaveBeenCalledWith(
      'Faltam 10min',
      expect.anything(),
      0.8
    );
    vi.useRealTimers();
  });

  it('botao preview form hidden/disabled quando ttsAvailable=false', () => {
    render(<AlertsPanel {...baseProps} ttsAvailable={false} />);
    fireEvent.click(screen.getByText('Novo Alerta'));

    const btn = screen.queryByTestId('preview-form-custom-btn');
    if (btn) {
      expect(btn).toBeDisabled();
    } else {
      // Hidden tambem aceitavel.
      expect(btn).toBeNull();
    }
  });
});
