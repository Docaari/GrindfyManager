/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint Alarmes 2.0
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-01 Substituir beep por TTS no fireAlert (soundMode + repeticoes)
 *  - RF-11 Fallback transparente quando TTS indisponivel
 *  - RF-12 prefers-reduced-data
 *  - RF-13 Priority queue integration
 *
 * Modulo testado: client/src/lib/fireAlert.ts (existe, sera modificado).
 *
 * API esperada (assinatura atualizada):
 *   fireAlert({
 *     title, description,
 *     soundMode: 'tts'|'beep'|'mute',
 *     narrationText?: string,
 *     voiceURI?: string|null,
 *     volume?: number,
 *     repeatCount?: number,
 *     repeatGapMs?: number,
 *     priority?: 'high'|'normal',
 *     alertId?: string,
 *     duration?: number,
 *     toast: (opts) => void,
 *   })
 *
 * `soundEnabled` (boolean) e DEPRECATED — substituido por `soundMode`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted resolve TDZ: factory de vi.mock executa antes do const declarado abaixo.
const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn(() => ({ dropped: false })) }));
vi.mock('../../../client/src/lib/tts/narrationQueue', () => ({
  enqueue: enqueueMock,
  stopAlertById: vi.fn(),
  stopAllAlerts: vi.fn(),
  getCurrentlySpeaking: vi.fn(() => null),
  getQueue: vi.fn(() => []),
  __resetForTesting: vi.fn(),
}));

const ttsVoicesMock = {
  pickVoice: vi.fn((_uri: string | null, voices: any[]) => voices[0] ?? null),
};
vi.mock('../../../client/src/lib/ttsVoices', () => ({
  pickVoice: (...args: any[]) => (ttsVoicesMock.pickVoice as any)(...args),
  speakUtterance: vi.fn(),
  getPtBRVoices: vi.fn(async () => []),
  useTTSVoices: vi.fn(),
}));

// Modulo modificado.
import { fireAlert } from '../../../client/src/lib/fireAlert';

const speechSynthesisMock = (globalThis as any).__speechSynthesisMock;

beforeEach(() => {
  enqueueMock.mockClear();
  enqueueMock.mockReturnValue({ dropped: false });
  ttsVoicesMock.pickVoice.mockClear();
  // Por padrao, getVoices retorna 1 voz pt-BR.
  speechSynthesisMock.getVoices.mockReturnValue([
    { name: 'Maria', voiceURI: 'maria-uri', lang: 'pt-BR' } as any,
  ]);

  // AudioContext stub para o branch beep.
  (globalThis as any).window = (globalThis as any).window ?? {};
  (globalThis as any).window.AudioContext = class {
    currentTime = 0;
    destination = {};
    createOscillator() {
      return {
        connect: vi.fn(),
        frequency: { value: 0 },
        type: 'sine',
        onended: null as any,
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createGain() {
      return {
        connect: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      };
    }
    close = vi.fn();
  };

  // Notification stub.
  (globalThis as any).Notification = class {
    static permission = 'denied';
    constructor(public title: string, public opts: any) {}
    onclick: any = null;
  };

  // matchMedia default — sem reduced-data.
  (globalThis as any).matchMedia = vi.fn((q: string) => ({
    matches: false,
    media: q,
  }));
});

describe('fireAlert — soundMode tts (RF-01)', () => {
  it('soundMode=tts + voz disponivel -> chama narrationQueue.enqueue com texto narrationText', () => {
    const toast = vi.fn();

    fireAlert({
      title: 'Alerta',
      description: 'Faltam 5min',
      soundMode: 'tts',
      narrationText: 'Faltam cinco minutos',
      voiceURI: 'maria-uri',
      volume: 0.5,
      repeatCount: 2,
      repeatGapMs: 3000,
      priority: 'normal',
      alertId: 'alert-A',
      toast,
    } as any);

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertId: 'alert-A',
        text: 'Faltam cinco minutos',
        priority: 'normal',
        volume: 0.5,
        repeatCount: 2,
        repeatGapMs: 3000,
      })
    );
  });

  it('soundMode=tts sem narrationText -> usa description como texto', () => {
    const toast = vi.fn();

    fireAlert({
      title: 'Alerta',
      description: 'Faltam 5min',
      soundMode: 'tts',
      voiceURI: null,
      volume: 0.8,
      priority: 'normal',
      alertId: 'alert-A',
      toast,
    } as any);

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Faltam 5min' })
    );
  });

  it('priority high passada para enqueue (P1-8)', () => {
    const toast = vi.fn();

    fireAlert({
      title: 'Late Reg',
      description: 'Sunday Plus em 3min',
      soundMode: 'tts',
      priority: 'high',
      alertId: 'latereg-tourn-1',
      toast,
    } as any);

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'high' })
    );
  });

  it('alertId ausente -> gera UUID interno (nao undefined)', () => {
    const toast = vi.fn();

    fireAlert({
      title: 'X',
      description: 'X',
      soundMode: 'tts',
      toast,
    } as any);

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const passed = enqueueMock.mock.calls[0][0] as any;
    expect(passed.alertId).toBeDefined();
    expect(typeof passed.alertId).toBe('string');
    expect(passed.alertId.length).toBeGreaterThan(0);
  });
});

describe('fireAlert — fallback beep (RF-11)', () => {
  it('soundMode=tts + sem voz pt-BR -> NAO chama enqueue (fallback beep)', () => {
    speechSynthesisMock.getVoices.mockReturnValue([]); // sem voz pt-BR
    const toast = vi.fn();

    fireAlert({
      title: 'X',
      description: 'X',
      soundMode: 'tts',
      toast,
    } as any);

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('soundMode=tts + speechSynthesis indefinido -> fallback beep', () => {
    const original = (globalThis as any).speechSynthesis;
    (globalThis as any).speechSynthesis = undefined;
    if ((globalThis as any).window) {
      (globalThis as any).window.speechSynthesis = undefined;
    }

    const toast = vi.fn();

    fireAlert({
      title: 'X',
      description: 'X',
      soundMode: 'tts',
      toast,
    } as any);

    expect(enqueueMock).not.toHaveBeenCalled();

    (globalThis as any).speechSynthesis = original;
    if ((globalThis as any).window) {
      (globalThis as any).window.speechSynthesis = original;
    }
  });
});

describe('fireAlert — soundMode beep', () => {
  it('soundMode=beep -> NAO chama enqueue, executa branch oscillator', () => {
    const toast = vi.fn();

    fireAlert({
      title: 'X',
      description: 'X',
      soundMode: 'beep',
      toast,
    } as any);

    expect(enqueueMock).not.toHaveBeenCalled();
    // Toast continua disparando.
    expect(toast).toHaveBeenCalled();
  });
});

describe('fireAlert — soundMode mute', () => {
  it('soundMode=mute -> sem som (sem enqueue, sem oscillator)', () => {
    const toast = vi.fn();

    fireAlert({
      title: 'X',
      description: 'X',
      soundMode: 'mute',
      toast,
    } as any);

    expect(enqueueMock).not.toHaveBeenCalled();
    // Toast e notification ainda disparam.
    expect(toast).toHaveBeenCalled();
  });
});

describe('fireAlert — toast e notification sempre', () => {
  it('toast disparado independente de soundMode', () => {
    const toast = vi.fn();

    fireAlert({
      title: 'A',
      description: 'B',
      soundMode: 'mute',
      toast,
    } as any);

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'A',
        description: 'B',
      })
    );
  });
});

describe('fireAlert — action passthrough (botoes de soneca)', () => {
  it('repassa `action` ao toast — e o que faz os botoes +1min/+3min aparecerem', () => {
    const toast = vi.fn();
    const action = { __element: 'AlertSnoozeActions' } as any;

    fireAlert({
      title: 'Late Reg Encerrando!',
      description: 'Sunday Plus',
      soundMode: 'mute',
      action,
      toast,
    } as any);

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ action }));
  });

  it('sem `action` o toast continua valido (alertas sem soneca nao quebram)', () => {
    const toast = vi.fn();

    fireAlert({
      title: 'X',
      description: 'Y',
      soundMode: 'mute',
      toast,
    } as any);

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'X', description: 'Y', action: undefined })
    );
  });
});

describe('fireAlert — prefers-reduced-data (RF-12)', () => {
  it('prefers-reduced-data: reduce + soundMode tts -> fallback beep', () => {
    (globalThis as any).matchMedia = vi.fn((q: string) => ({
      matches: q.includes('reduced-data'),
      media: q,
    }));

    const toast = vi.fn();

    fireAlert({
      title: 'X',
      description: 'X',
      soundMode: 'tts',
      toast,
    } as any);

    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
