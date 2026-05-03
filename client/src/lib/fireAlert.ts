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
import { generateClientId } from '@shared/ids';

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
  toast: (opts: {
    title: string;
    description: string;
    variant?: 'default' | 'destructive' | null;
    duration?: number;
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

function getPtBRVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  try {
    return (speechSynthesis.getVoices() ?? []).filter(
      (v) => v.lang && v.lang.toLowerCase().startsWith('pt-br')
    );
  } catch {
    return [];
  }
}

function playBeep() {
  try {
    const Ctx =
      (typeof window !== 'undefined' &&
        ((window as any).AudioContext || (window as any).webkitAudioContext)) ||
      (typeof globalThis !== 'undefined' && (globalThis as any).AudioContext);
    if (!Ctx) return;
    const audioCtx = new Ctx();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    oscillator.onended = () => audioCtx.close();
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.2);
  } catch {
    // ignore
  }
}

function fireToast(
  toast: FireAlertOptions['toast'],
  title: string,
  description: string,
  duration: number,
  alertId: string,
) {
  toast({
    title,
    description,
    variant: 'destructive',
    duration,
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
    toast,
  } = opts;

  // Backward compat: se soundEnabled passado e soundMode ausente, infere.
  let soundMode: SoundMode = soundModeRaw ?? (soundEnabled === false ? 'mute' : 'beep');

  // alertId compartilhado entre toast (onOpenChange -> stopAlertById) e enqueue.
  const alertId = providedAlertId ?? generateClientId('alert');

  // Layer 1: Toast — sempre dispara. Fechar toast = parar TTS associado.
  fireToast(toast, title, description, duration, alertId);

  // Layer 2: Sound.
  if (soundMode === 'mute') {
    // No-op em audio.
  } else if (soundMode === 'tts') {
    const voices = prefersReducedData() ? [] : getPtBRVoices();
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
