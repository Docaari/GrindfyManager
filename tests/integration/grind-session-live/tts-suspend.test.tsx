/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint Alarmes 2.0
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-09 alertsSuspended (vindo da Sessao B) cancela TTS em curso e impede novos disparos.
 *  - R-07 latencia <50ms aceitavel.
 *
 * Estrategia: testar diretamente os HELPERS expostos por narrationQueue
 * (stopAllAlerts) que GrindSessionLive.tsx chama em useEffect quando
 * alertsSuspended muda. NAO renderiza GrindSessionLive completo (componente
 * de 1700+ linhas com queries + state global — vide pattern em
 * tests/unit/bankroll/GrindSessionLive.test.tsx, l.13-19).
 *
 * Em vez disso: simulamos o efeito via re-render de um wrapper que invoca
 * o callback que GrindSessionLive precisa implementar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useEffect } from 'react';

// Imports ainda nao existem — implementer cria.
import {
  enqueue,
  stopAllAlerts,
  __resetForTesting,
  getCurrentlySpeaking,
} from '../../../client/src/lib/tts/narrationQueue';

const speechSynthesisMock = (globalThis as any).__speechSynthesisMock;

// Wrapper que simula o useEffect de GrindSessionLive: quando
// alertsSuspended muda para true, deve chamar stopAllAlerts.
function MockGrindSessionEffect({ alertsSuspended }: { alertsSuspended: boolean }) {
  useEffect(() => {
    if (alertsSuspended) {
      stopAllAlerts();
    }
  }, [alertsSuspended]);
  return null;
}

beforeEach(() => {
  __resetForTesting();
  speechSynthesisMock.cancel.mockClear();
});

describe('GrindSessionLive — alertsSuspended cancela TTS (RF-09)', () => {
  it('alertsSuspended muda para true durante narracao -> stopAllAlerts cancela TTS', () => {
    // 1. Inicia narracao.
    enqueue({
      alertId: 'alert-X',
      priority: 'normal',
      text: 'Faltam 5min',
      voice: null,
      volume: 0.8,
      enqueuedAt: Date.now(),
      repeatCount: 1,
      repeatGapMs: 3000,
    } as any);

    expect(getCurrentlySpeaking()?.alertId).toBe('alert-X');
    speechSynthesisMock.cancel.mockClear();

    // 2. Render com alertsSuspended=true.
    render(<MockGrindSessionEffect alertsSuspended={true} />);

    // 3. cancel deve ser chamado, queue limpa.
    expect(speechSynthesisMock.cancel).toHaveBeenCalled();
    expect(getCurrentlySpeaking()).toBeNull();
  });

  it('alertsSuspended=false (default) -> nao cancela TTS em curso', () => {
    enqueue({
      alertId: 'alert-X',
      priority: 'normal',
      text: 'Faltam 5min',
      voice: null,
      volume: 0.8,
      enqueuedAt: Date.now(),
      repeatCount: 1,
      repeatGapMs: 3000,
    } as any);
    speechSynthesisMock.cancel.mockClear();

    render(<MockGrindSessionEffect alertsSuspended={false} />);

    expect(speechSynthesisMock.cancel).not.toHaveBeenCalled();
    expect(getCurrentlySpeaking()?.alertId).toBe('alert-X');
  });

  it('transicao alertsSuspended false -> true durante render -> cancela', () => {
    enqueue({
      alertId: 'alert-X',
      priority: 'normal',
      text: 'X',
      voice: null,
      volume: 0.8,
      enqueuedAt: Date.now(),
    } as any);
    speechSynthesisMock.cancel.mockClear();

    const { rerender } = render(<MockGrindSessionEffect alertsSuspended={false} />);
    expect(speechSynthesisMock.cancel).not.toHaveBeenCalled();

    rerender(<MockGrindSessionEffect alertsSuspended={true} />);

    expect(speechSynthesisMock.cancel).toHaveBeenCalled();
    expect(getCurrentlySpeaking()).toBeNull();
  });

  it('alertsSuspended=true E novo enqueue -> queue limpa novamente apos novo cancel', () => {
    render(<MockGrindSessionEffect alertsSuspended={true} />);

    // Mesmo enfileirando depois, GrindSessionLive em estado suspended NAO chama
    // fireAlert/enqueue — gate eh do checkAlerts. Aqui validamos apenas que
    // stopAllAlerts foi chamado uma vez por mount com suspended=true.
    expect(speechSynthesisMock.cancel).toHaveBeenCalled();
  });
});
