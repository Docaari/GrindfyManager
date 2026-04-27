/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint Alarmes 2.0
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-14 (P0-3) Dismiss rapido via teclado durante narracao.
 *  - Skip quando foco em input/textarea/select/contentEditable.
 *  - Skip quando nao ha fala ativa (preserva comportamento nativo de Esc).
 *  - Listener auto-removido apos sessao finalizada.
 *
 * Componente alvo: client/src/lib/tts/keyboardDismissEffect.ts (NOVO — red phase).
 *
 * Estrategia: o handler de keydown sera extraido como hook puro
 * `useTTSKeyboardDismiss(activeSession)` que pode ser testado isoladamente.
 *
 * API esperada:
 *   useTTSKeyboardDismiss(activeSession: { status: string } | null): void
 *
 * Comportamento esperado:
 *   - Esc/Space + fala ativa + foco no body -> chama stopAllAlerts() + preventDefault
 *   - Esc/Space + foco em input -> NAO age (preserva comportamento nativo)
 *   - Esc + sem fala ativa -> NAO preventDefault (deixa dialog fechar nativamente)
 *   - activeSession null ou status != 'active' -> listener nao registrado
 *   - cleanup remove listener
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

// vi.hoisted resolve TDZ: factory de vi.mock executa antes dos const declarados abaixo.
const { stopAllAlertsMock, getCurrentlySpeakingMock } = vi.hoisted(() => ({
  stopAllAlertsMock: vi.fn(),
  getCurrentlySpeakingMock: vi.fn(() => null as any),
}));

vi.mock('../../../client/src/lib/tts/narrationQueue', () => ({
  stopAllAlerts: stopAllAlertsMock,
  getCurrentlySpeaking: getCurrentlySpeakingMock,
  enqueue: vi.fn(() => ({ dropped: false })),
  stopAlertById: vi.fn(),
  __resetForTesting: vi.fn(),
  getQueue: vi.fn(() => []),
}));

// Hook NAO existe — red phase.
import { useTTSKeyboardDismiss } from '../../../client/src/lib/tts/keyboardDismissEffect';

const speechSynthesisMock = (globalThis as any).__speechSynthesisMock;

function HookHost({ session }: { session: any }) {
  useTTSKeyboardDismiss(session);
  return <div data-testid="host" />;
}

beforeEach(() => {
  stopAllAlertsMock.mockClear();
  getCurrentlySpeakingMock.mockReset();
  getCurrentlySpeakingMock.mockReturnValue(null);
  speechSynthesisMock.speaking = false;
});

afterEach(() => {
  // Garante remocao de listeners residuais.
  document.body.innerHTML = '';
});

describe('useTTSKeyboardDismiss (RF-14 P0-3)', () => {
  function dispatchKey(key: string, target: EventTarget = document.body) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  }

  it('Esc com TTS tocando -> stopAllAlerts + preventDefault', () => {
    speechSynthesisMock.speaking = true;
    getCurrentlySpeakingMock.mockReturnValue({ alertId: 'A' });

    render(<HookHost session={{ status: 'active' }} />);

    const event = dispatchKey('Escape');

    expect(stopAllAlertsMock).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Space com TTS tocando + foco no body -> stopAllAlerts', () => {
    speechSynthesisMock.speaking = true;
    getCurrentlySpeakingMock.mockReturnValue({ alertId: 'A' });

    render(<HookHost session={{ status: 'active' }} />);

    dispatchKey(' ');

    expect(stopAllAlertsMock).toHaveBeenCalledTimes(1);
  });

  it('Esc com foco em <input> -> NAO age (preserva comportamento nativo)', () => {
    speechSynthesisMock.speaking = true;
    getCurrentlySpeakingMock.mockReturnValue({ alertId: 'A' });

    render(<HookHost session={{ status: 'active' }} />);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    dispatchKey('Escape', input);

    expect(stopAllAlertsMock).not.toHaveBeenCalled();
  });

  it('Space com foco em <textarea> -> NAO age', () => {
    speechSynthesisMock.speaking = true;
    getCurrentlySpeakingMock.mockReturnValue({ alertId: 'A' });

    render(<HookHost session={{ status: 'active' }} />);

    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();

    dispatchKey(' ', ta);

    expect(stopAllAlertsMock).not.toHaveBeenCalled();
  });

  it('Esc com foco em <select> -> NAO age', () => {
    speechSynthesisMock.speaking = true;
    getCurrentlySpeakingMock.mockReturnValue({ alertId: 'A' });

    render(<HookHost session={{ status: 'active' }} />);

    const sel = document.createElement('select');
    document.body.appendChild(sel);
    sel.focus();

    dispatchKey('Escape', sel);

    expect(stopAllAlertsMock).not.toHaveBeenCalled();
  });

  it('Esc com foco em contentEditable -> NAO age', () => {
    speechSynthesisMock.speaking = true;
    getCurrentlySpeakingMock.mockReturnValue({ alertId: 'A' });

    render(<HookHost session={{ status: 'active' }} />);

    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    div.focus();

    dispatchKey('Escape', div);

    expect(stopAllAlertsMock).not.toHaveBeenCalled();
  });

  it('Esc sem TTS tocando -> NAO preventDefault, NAO chama stopAllAlerts', () => {
    speechSynthesisMock.speaking = false;
    getCurrentlySpeakingMock.mockReturnValue(null);

    render(<HookHost session={{ status: 'active' }} />);

    const event = dispatchKey('Escape');

    expect(stopAllAlertsMock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('session.status != active -> listener NAO age', () => {
    speechSynthesisMock.speaking = true;
    getCurrentlySpeakingMock.mockReturnValue({ alertId: 'A' });

    render(<HookHost session={{ status: 'pending' }} />);

    dispatchKey('Escape');

    expect(stopAllAlertsMock).not.toHaveBeenCalled();
  });

  it('session null -> listener NAO age', () => {
    speechSynthesisMock.speaking = true;
    getCurrentlySpeakingMock.mockReturnValue({ alertId: 'A' });

    render(<HookHost session={null} />);

    dispatchKey('Escape');

    expect(stopAllAlertsMock).not.toHaveBeenCalled();
  });

  it('cleanup remove listener apos unmount/finalizacao', () => {
    speechSynthesisMock.speaking = true;
    getCurrentlySpeakingMock.mockReturnValue({ alertId: 'A' });

    const { unmount } = render(<HookHost session={{ status: 'active' }} />);

    // Antes do unmount, Esc dispara stopAllAlerts.
    dispatchKey('Escape');
    expect(stopAllAlertsMock).toHaveBeenCalledTimes(1);

    unmount();
    stopAllAlertsMock.mockClear();

    // Apos unmount, Esc NAO dispara mais.
    dispatchKey('Escape');
    expect(stopAllAlertsMock).not.toHaveBeenCalled();
  });
});
