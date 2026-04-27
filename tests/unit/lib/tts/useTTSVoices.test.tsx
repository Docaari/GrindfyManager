/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint Alarmes 2.0
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-02 Detectar e listar vozes pt-BR (getPtBRVoices, useTTSVoices, pickVoice, speakUtterance)
 *
 * Modulo testado: client/src/lib/ttsVoices.ts (NAO existe — red phase)
 *
 * IMPORTANTE — extension .tsx para hook test (jsdom project).
 *
 * API esperada:
 *   - useTTSVoices(): { voices: SpeechSynthesisVoice[]; ready: boolean; available: boolean; preferredVoice: SpeechSynthesisVoice | null }
 *   - getPtBRVoices(): Promise<SpeechSynthesisVoice[]>
 *   - pickVoice(preferredURI: string|null, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice|null
 *   - speakUtterance(text: string, voice: SpeechSynthesisVoice|null, volume: number): SpeechSynthesisUtterance
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Modulo NAO existe — implementer cria.
import {
  useTTSVoices,
  getPtBRVoices,
  pickVoice,
  speakUtterance,
} from '../../../../client/src/lib/ttsVoices';

const speechSynthesisMock = (globalThis as any).__speechSynthesisMock;

function makeVoice(overrides: Partial<any> = {}): any {
  return {
    name: 'Microsoft Maria - Portuguese (Brazil)',
    voiceURI: 'maria-uri',
    lang: 'pt-BR',
    localService: true,
    default: false,
    ...overrides,
  };
}

describe('useTTSVoices (RF-02)', () => {
  beforeEach(() => {
    speechSynthesisMock.getVoices.mockReturnValue([]);
    speechSynthesisMock.addEventListener.mockClear();
    speechSynthesisMock.removeEventListener.mockClear();
  });

  it('estado inicial: ready=false, available=false (chrome async)', () => {
    speechSynthesisMock.getVoices.mockReturnValue([]);
    const { result } = renderHook(() => useTTSVoices());

    expect(result.current.available).toBe(false);
  });

  it('apos voiceschanged com array contendo pt-BR -> available=true + voices preenchidos', async () => {
    // 1a chamada (mount) retorna vazio.
    let voicesAvailable: any[] = [];
    speechSynthesisMock.getVoices.mockImplementation(() => voicesAvailable);

    const listeners: Array<(ev: any) => void> = [];
    speechSynthesisMock.addEventListener.mockImplementation(
      (event: string, cb: (ev: any) => void) => {
        if (event === 'voiceschanged') listeners.push(cb);
      }
    );

    const { result } = renderHook(() => useTTSVoices());

    expect(result.current.available).toBe(false);

    // Simula carregamento async: getVoices passa a retornar pt-BR.
    voicesAvailable = [makeVoice(), makeVoice({ name: 'Luciana', voiceURI: 'luciana-uri' })];

    // Dispara voiceschanged.
    act(() => {
      listeners.forEach((cb) => cb({}));
    });

    await waitFor(() => {
      expect(result.current.available).toBe(true);
      expect(result.current.voices.length).toBe(2);
    });
  });

  it('sem voz pt-BR -> available=false mesmo apos voiceschanged', async () => {
    // SO vozes en-US.
    speechSynthesisMock.getVoices.mockReturnValue([
      makeVoice({ lang: 'en-US', name: 'Samantha', voiceURI: 'sam-uri' }),
    ]);

    const { result } = renderHook(() => useTTSVoices());

    await waitFor(() => {
      // Voices carregadas mas filtradas (vazias).
      expect(result.current.available).toBe(false);
      expect(result.current.voices).toEqual([]);
    });
  });

  it('preferredVoiceURI selecionado quando match em voices', async () => {
    speechSynthesisMock.getVoices.mockReturnValue([
      makeVoice({ name: 'Maria', voiceURI: 'maria-uri' }),
      makeVoice({ name: 'Luciana', voiceURI: 'luciana-uri' }),
    ]);

    const { result } = renderHook(() => useTTSVoices('luciana-uri'));

    await waitFor(() => {
      expect(result.current.preferredVoice?.voiceURI).toBe('luciana-uri');
    });
  });

  it('preferredVoiceURI nao encontrada -> cai na primeira pt-BR', async () => {
    speechSynthesisMock.getVoices.mockReturnValue([
      makeVoice({ name: 'Maria', voiceURI: 'maria-uri' }),
    ]);

    const { result } = renderHook(() => useTTSVoices('foo-removed-uri'));

    await waitFor(() => {
      expect(result.current.preferredVoice?.voiceURI).toBe('maria-uri');
    });
  });
});

describe('getPtBRVoices (RF-02)', () => {
  beforeEach(() => {
    speechSynthesisMock.getVoices.mockReturnValue([]);
  });

  it('retorna array vazio quando nenhuma voz disponivel apos timeout', async () => {
    // getVoices sempre retorna vazio. Timeout de 2s expira.
    const promise = getPtBRVoices();
    // Nao avancamos timer — esperamos que getPtBRVoices use real timers
    // ou tenha fallback. Para evitar test infinito, aceita ate 3s.
    const result = await Promise.race([
      promise,
      new Promise<any[]>((resolve) => setTimeout(() => resolve(['TIMEOUT']), 3000)),
    ]);

    // Resultado pode ser [] (sucesso com timeout) ou TIMEOUT marker (test fallback).
    if (Array.isArray(result) && result[0] !== 'TIMEOUT') {
      expect(result).toEqual([]);
    } else {
      // Aceitavel: timeout do test marker — implementacao deve resolver mais rapido.
      expect.fail('getPtBRVoices nao resolveu em 3s');
    }
  }, 5000);

  it('filtra apenas vozes pt-BR', async () => {
    speechSynthesisMock.getVoices.mockReturnValue([
      makeVoice({ lang: 'pt-BR', name: 'Maria' }),
      makeVoice({ lang: 'en-US', name: 'Samantha' }),
      makeVoice({ lang: 'pt-PT', name: 'Joana' }),
      makeVoice({ lang: 'pt-BR', name: 'Luciana' }),
    ]);

    const result = await getPtBRVoices();
    expect(result.length).toBe(2);
    expect(result.every((v: any) => v.lang.startsWith('pt-BR'))).toBe(true);
  });
});

describe('pickVoice (RF-02)', () => {
  it('retorna voz preferida quando presente', () => {
    const voices = [
      makeVoice({ voiceURI: 'maria-uri', name: 'Maria' }),
      makeVoice({ voiceURI: 'luciana-uri', name: 'Luciana' }),
    ];
    const result = pickVoice('luciana-uri', voices);
    expect(result?.voiceURI).toBe('luciana-uri');
  });

  it('cai em primeira pt-BR quando preferida nao existe', () => {
    const voices = [makeVoice({ voiceURI: 'maria-uri', name: 'Maria' })];
    const result = pickVoice('removed-voice-uri', voices);
    expect(result?.voiceURI).toBe('maria-uri');
  });

  it('retorna null quando voices vazio', () => {
    expect(pickVoice('any-uri', [])).toBeNull();
    expect(pickVoice(null, [])).toBeNull();
  });

  it('preferredURI null + voices nao-vazio -> primeira voz', () => {
    const voices = [makeVoice({ voiceURI: 'maria-uri' })];
    expect(pickVoice(null, voices)?.voiceURI).toBe('maria-uri');
  });
});

describe('speakUtterance (RF-02)', () => {
  it('cria utterance com text, voice e volume corretos', () => {
    const voice = makeVoice();
    const utterance = speakUtterance('Faltam 5min', voice, 0.5);

    expect(utterance.text).toBe('Faltam 5min');
    expect(utterance.voice).toBe(voice);
    expect(utterance.volume).toBe(0.5);
  });

  it('chama speechSynthesis.speak com a utterance', () => {
    speechSynthesisMock.speak.mockClear();
    const voice = makeVoice();
    speakUtterance('Teste', voice, 0.8);

    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
    expect(speechSynthesisMock.speak.mock.calls[0][0].text).toBe('Teste');
  });
});
