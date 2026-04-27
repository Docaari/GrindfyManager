/**
 * TTS Voices — detect and pick pt-BR voices from SpeechSynthesis API.
 * Sprint Alarmes 2.0 — RF-02.
 *
 * Chrome carrega vozes async (event 'voiceschanged'); Firefox/Safari
 * geralmente carregam sync. Este modulo abstrai essa diferenca.
 */

import { useEffect, useState } from 'react';

/**
 * Filtro: aceita apenas vozes pt-BR (lang exato ou prefixo).
 */
export function getPtBRVoicesSync(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  const all = speechSynthesis.getVoices();
  return all.filter((v) => v.lang && v.lang.toLowerCase().startsWith('pt-br'));
}

/**
 * Resolve com a lista de vozes pt-BR disponiveis. Trata o caso async do
 * Chrome esperando o evento `voiceschanged` ate 2s; depois fallback para
 * a lista sync corrente (que pode ser vazia).
 */
export function getPtBRVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') {
      resolve([]);
      return;
    }

    const tryResolve = () => {
      const ptBR = getPtBRVoicesSync();
      if (ptBR.length > 0 || speechSynthesis.getVoices().length > 0) {
        cleanup();
        resolve(ptBR);
        return true;
      }
      return false;
    };

    let timeoutId: any = null;
    const handler = () => {
      tryResolve();
    };

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      try {
        speechSynthesis.removeEventListener?.('voiceschanged', handler);
      } catch {
        // ignore
      }
    };

    // Tentativa imediata (Firefox/Safari geralmente resolvem aqui).
    if (tryResolve()) return;

    // Aguarda voiceschanged com timeout de 2s.
    try {
      speechSynthesis.addEventListener?.('voiceschanged', handler);
    } catch {
      // ignore
    }
    timeoutId = setTimeout(() => {
      cleanup();
      resolve(getPtBRVoicesSync());
    }, 2000);
  });
}

/**
 * Escolhe a voz preferida (`preferredURI`) se presente em `voices`; senao
 * retorna a primeira voz; senao null.
 */
export function pickVoice(
  preferredURI: string | null | undefined,
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;
  if (preferredURI) {
    const match = voices.find((v) => v.voiceURI === preferredURI);
    if (match) return match;
  }
  return voices[0] ?? null;
}

/**
 * Cria um SpeechSynthesisUtterance com voice/volume e dispara
 * `speechSynthesis.speak`. Retorna o utterance para o caller poder
 * encadear handlers (onend/onerror).
 */
export function speakUtterance(
  text: string,
  voice: SpeechSynthesisVoice | null,
  volume: number
): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.volume = volume;
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.speak(u);
  }
  return u;
}

export interface UseTTSVoicesResult {
  voices: SpeechSynthesisVoice[];
  ready: boolean;
  available: boolean;
  preferredVoice: SpeechSynthesisVoice | null;
}

/**
 * Hook que mantem a lista de vozes pt-BR sincronizada com a API do browser.
 * Atualiza no evento `voiceschanged` (Chrome async).
 */
export function useTTSVoices(preferredVoiceURI?: string | null): UseTTSVoicesResult {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => getPtBRVoicesSync());
  const [ready, setReady] = useState<boolean>(() => {
    if (typeof speechSynthesis === 'undefined') return true;
    return speechSynthesis.getVoices().length > 0;
  });

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;

    const sameURIs = (a: SpeechSynthesisVoice[], b: SpeechSynthesisVoice[]) => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i].voiceURI !== b[i].voiceURI) return false;
      }
      return true;
    };

    const update = () => {
      const next = getPtBRVoicesSync();
      setVoices((prev) => (sameURIs(prev, next) ? prev : next));
      setReady(true);
    };

    update();
    speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => {
      speechSynthesis.removeEventListener?.('voiceschanged', update);
    };
  }, []);

  const preferredVoice = pickVoice(preferredVoiceURI ?? null, voices);
  const available = voices.length > 0;

  return { voices, ready, available, preferredVoice };
}
