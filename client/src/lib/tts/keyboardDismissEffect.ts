/**
 * useTTSKeyboardDismiss — Hook para dismiss rapido de TTS via teclado.
 * Sprint Alarmes 2.0 — RF-14 (P0-3).
 *
 * Comportamento:
 *  - Esc/Space + fala ativa + foco no body → stopAllAlerts() + preventDefault.
 *  - Esc/Space + foco em input/textarea/select/contentEditable → NAO age.
 *  - Esc + sem fala ativa → NAO preventDefault (preserva comportamento nativo).
 *  - session.status != 'active' ou null → listener nao registrado.
 */

import { useEffect } from 'react';
import { stopAllAlerts, getCurrentlySpeaking } from './narrationQueue';

interface MinimalSession {
  status: string;
}

/**
 * Hook que registra listener global de keydown para dismiss rapido de TTS.
 * Listener so age quando session.status === 'active'.
 */
export function useTTSKeyboardDismiss(session: MinimalSession | null | undefined): void {
  const isActive = session?.status === 'active';

  useEffect(() => {
    if (!isActive) return;

    const handler = (event: KeyboardEvent) => {
      // Apenas Esc ou Space.
      if (event.key !== 'Escape' && event.key !== ' ') return;

      // Skip quando foco em input/textarea/select/contentEditable.
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        // jsdom nao computa isContentEditable a partir do atributo;
        // checamos ambos para cobrir browsers reais e jsdom.
        if ((target as any).isContentEditable) return;
        const ce = target.getAttribute?.('contenteditable');
        if (ce === '' || ce === 'true' || ce === 'plaintext-only') return;
      }

      const speakingNow =
        (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) ||
        getCurrentlySpeaking() != null;
      if (!speakingNow) return;
      event.preventDefault();
      stopAllAlerts();
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [isActive]);
}
