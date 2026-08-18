/**
 * Unified alert firing utility.
 * Sprint Alarmes 2.0 (RF-01, RF-11, RF-12, RF-13):
 *  - 3 layers: toast, sound, browser notification.
 *  - sound layer agora suporta soundMode tts/beep/mute via narrationQueue.
 *  - Fallback transparente para beep quando TTS indisponivel.
 *  - prefers-reduced-data forca beep.
 */

import { enqueue, stopAlertById } from './tts/narrationQueue';
import { pickVoice } from './ttsVoices';
import { playBeep } from './alertSound';
import { generateClientId } from '@shared/ids';
// Import de TIPO apenas — apagado na compilacao, entao nao arrasta React nem o
// componente de toast para dentro deste modulo em runtime.
import type { ToastActionElement } from '@/components/ui/toast';

export const SOUND_MODES = ['tts', 'beep', 'mute'] as const;
export type SoundMode = (typeof SOUND_MODES)[number];

interface FireAlertOptions {
  title: string;
  description: string;
  /** @deprecated — use soundMode */
  soundEnabled?: boolean;
  soundMode?: SoundMode;
  narrationText?: string;
  voiceURI?: string | null;
  volume?: number;
  repeatCount?: number;
  repeatGapMs?: number;
  priority?: 'high' | 'normal';
  alertId?: string;
  duration?: number;
  /**
   * Elemento de acao renderizado dentro do toast (ex.: os botoes de soneca
   * `AlertSnoozeActions`). Passthrough puro: `fireAlert` nao monta JSX, so
   * repassa — por isso este modulo continua sendo `.ts`, sem React em runtime.
   */
  action?: ToastActionElement;
  toast: (opts: {
    title: string;
    description: string;
    variant?: 'default' | 'destructive' | null;
    duration?: number;
    action?: ToastActionElement;
    onOpenChange?: (open: boolean) => void;
  }) => void;
}

function prefersReducedData(): boolean {
  try {
    const mm: ((q: string) => MediaQueryList) | undefined =
      (typeof window !== 'undefined' && window.matchMedia) ||
      (globalThis as any).matchMedia;
    if (!mm) return false;
    return !!mm('(prefers-reduced-data: reduce)')?.matches;
  } catch {
    return false;
  }
}

/**
 * Vozes candidatas em ordem de preferencia: pt-BR > pt-* > default do browser >
 * primeira disponivel.
 *
 * Antes filtravamos SO `pt-br`: em Windows sem o pacote de idioma PT-BR (e em
 * Linux com espeak en-only) a lista voltava vazia e o alarme caia no beep — que
 * por sua vez estava quebrado (ver getAudioContext). Resultado pro jogador:
 * alarme mudo. Narrar em voz nao-PT soa pior, mas e audivel; silencio nao.
 * Lista totalmente vazia continua caindo em beep (nao ha o que falar).
 */
function getNarrationVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  let all: SpeechSynthesisVoice[] = [];
  try {
    all = speechSynthesis.getVoices() ?? [];
  } catch {
    return [];
  }
  if (all.length === 0) return [];

  const lang = (v: SpeechSynthesisVoice) => (v.lang ?? '').toLowerCase();
  const ptBR = all.filter((v) => lang(v).startsWith('pt-br'));
  if (ptBR.length > 0) return ptBR;
  const pt = all.filter((v) => lang(v).startsWith('pt'));
  if (pt.length > 0) return pt;
  const def = all.filter((v) => v.default);
  if (def.length > 0) return def;
  return all;
}

// Beep vive em `alertSound.ts` para que narrationQueue possa reusa-lo como
// fallback audivel sem import circular. Re-exportado aqui por compatibilidade
// com os callers historicos.
export { primeAlertAudio, _resetAudioContextForTests } from './alertSound';

function fireToast(
  toast: FireAlertOptions['toast'],
  title: string,
  description: string,
  duration: number,
  alertId: string,
  action?: ToastActionElement,
) {
  toast({
    title,
    description,
    variant: 'destructive',
    duration,
    action,
    onOpenChange: (open) => {
      if (!open) stopAlertById(alertId);
    },
  });
}

function fireNotification(title: string, description: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const notification = new Notification(`Grindfy — ${title}`, {
        body: description,
      });
      notification.onclick = () => {
        if (typeof window !== 'undefined') window.focus();
      };
    } catch {
      // ignore
    }
  }
}

export function fireAlert(opts: FireAlertOptions): void {
  const {
    title,
    description,
    soundEnabled,
    soundMode: soundModeRaw,
    narrationText,
    voiceURI,
    volume = 0.8,
    repeatCount = 2,
    repeatGapMs = 3000,
    priority = 'normal',
    alertId: providedAlertId,
    duration = 30000,
    action,
    toast,
  } = opts;

  // Backward compat: se soundEnabled passado e soundMode ausente, infere.
  let soundMode: SoundMode = soundModeRaw ?? (soundEnabled === false ? 'mute' : 'beep');

  // alertId compartilhado entre toast (onOpenChange -> stopAlertById) e enqueue.
  const alertId = providedAlertId ?? generateClientId('alert');

  // Layer 1: Toast — sempre dispara. Fechar toast = parar TTS associado.
  // Isso cobre tambem a soneca: `ToastAction` do Radix fecha o toast ao clicar,
  // entao o `onOpenChange` corta a narracao em curso sem codigo extra.
  fireToast(toast, title, description, duration, alertId, action);

  // Layer 2: Sound.
  if (soundMode === 'mute') {
    // No-op em audio.
  } else if (soundMode === 'tts') {
    const voices = prefersReducedData() ? [] : getNarrationVoices();
    if (voices.length === 0) {
      // RF-11/RF-12: fallback transparente para beep.
      playBeep();
    } else {
      enqueue({
        alertId,
        priority,
        text: narrationText ?? description,
        voice: pickVoice(voiceURI ?? null, voices),
        volume,
        enqueuedAt: Date.now(),
        repeatCount,
        repeatGapMs,
      });
    }
  } else {
    playBeep();
  }

  // Layer 3: Browser Notification.
  fireNotification(title, description);
}
