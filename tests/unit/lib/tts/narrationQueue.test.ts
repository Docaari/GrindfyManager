/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint Alarmes 2.0
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-01 (FLUSH/QUEUE assimetrica via priority + setTimeout chain)
 *  - RF-09 (stopAlertById scoped P1-5)
 *  - RF-13 (priority queue P1-8: FLUSH/QUEUE matrix, cap items, cap time)
 *  - R-12 (watchdog stuck — onerror + 30s timeout)
 *
 * ADRs:
 *  - 048-tts-priority-queue.md
 *  - 050-tts-state-module-level.md (state global precisa __resetForTesting)
 *
 * Modulo testado: client/src/lib/tts/narrationQueue.ts (ainda NAO existe — red phase).
 *
 * API esperada (do architect):
 *   - enqueue(item: QueueItem): { dropped: boolean; reason?: string }
 *   - stopAlertById(alertId: string): void
 *   - stopAllAlerts(): void
 *   - getCurrentlySpeaking(): QueueItem | null   (helper de teste/exposicao)
 *   - getQueue(): QueueItem[]                    (helper de teste/exposicao)
 *   - __resetForTesting(): void                  (reset module-level state)
 *
 * QueueItem shape (do RF-13):
 *   { alertId, priority: 'high'|'normal', text, voice, volume,
 *     enqueuedAt, repeatCount?, repeatGapMs? }
 *
 * IMPORTANTE — lessons-learned:
 *  - Nao usar `findByText` percorrendo. State module-level requer __resetForTesting
 *    em beforeEach (vide tests/setup.ts global hook).
 *  - SpeechSynthesisUtterance e CLASS no setup, nao vi.fn. Asserts usam `instanceof`
 *    ou checagem do `.text`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Imports que ainda nao existem — implementer cria.
import {
  enqueue,
  stopAlertById,
  stopAllAlerts,
  getCurrentlySpeaking,
  getQueue,
  __resetForTesting,
} from '../../../../client/src/lib/tts/narrationQueue';

const speechSynthesisMock = (globalThis as any).__speechSynthesisMock as {
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  speaking: boolean;
  getVoices: ReturnType<typeof vi.fn>;
};

function makeItem(overrides: Partial<any> = {}) {
  return {
    alertId: 'alert-1',
    priority: 'normal' as const,
    text: 'Faltam 5min',
    voice: null,
    volume: 0.8,
    enqueuedAt: Date.now(),
    repeatCount: 1,
    repeatGapMs: 3000,
    ...overrides,
  };
}

describe('narrationQueue (RF-01 + RF-13 priority queue)', () => {
  beforeEach(() => {
    __resetForTesting();
    vi.useFakeTimers();
  });

  describe('enqueue — caso vazio', () => {
    it('com queue vazia, comeca a falar imediatamente', () => {
      const result = enqueue(makeItem());

      expect(result.dropped).toBe(false);
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
      const utterance = speechSynthesisMock.speak.mock.calls[0][0];
      expect(utterance.text).toBe('Faltam 5min');
      expect(getCurrentlySpeaking()?.alertId).toBe('alert-1');
      expect(getQueue()).toEqual([]);
    });

    it('aplica volume e voice no utterance', () => {
      const fakeVoice = { name: 'Maria', voiceURI: 'maria-uri' } as any;
      enqueue(makeItem({ volume: 0.3, voice: fakeVoice }));

      const utterance = speechSynthesisMock.speak.mock.calls[0][0];
      expect(utterance.volume).toBe(0.3);
      expect(utterance.voice).toBe(fakeVoice);
    });
  });

  describe('FLUSH/QUEUE matrix (P1-8) — 5 cenarios', () => {
    it('priority normal + current normal -> QUEUE (atras, nao FLUSH)', () => {
      enqueue(makeItem({ alertId: 'A' }));
      speechSynthesisMock.cancel.mockClear();

      const result = enqueue(makeItem({ alertId: 'B' }));

      expect(result.dropped).toBe(false);
      expect(speechSynthesisMock.cancel).not.toHaveBeenCalled();
      expect(getCurrentlySpeaking()?.alertId).toBe('A');
      expect(getQueue().map((q) => q.alertId)).toEqual(['B']);
    });

    it('priority high + current normal -> FLUSH (descarta queue inteira)', () => {
      enqueue(makeItem({ alertId: 'A', priority: 'normal' }));
      enqueue(makeItem({ alertId: 'B', priority: 'normal' }));
      enqueue(makeItem({ alertId: 'C', priority: 'normal' }));
      speechSynthesisMock.cancel.mockClear();
      speechSynthesisMock.speak.mockClear();

      enqueue(makeItem({ alertId: 'HIGH', priority: 'high' }));

      expect(speechSynthesisMock.cancel).toHaveBeenCalledTimes(1);
      expect(getCurrentlySpeaking()?.alertId).toBe('HIGH');
      expect(getQueue()).toEqual([]);
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
    });

    it('priority high + current high -> QUEUE (mesma priority, nao FLUSH)', () => {
      enqueue(makeItem({ alertId: 'H1', priority: 'high' }));
      speechSynthesisMock.cancel.mockClear();

      enqueue(makeItem({ alertId: 'H2', priority: 'high' }));

      expect(speechSynthesisMock.cancel).not.toHaveBeenCalled();
      expect(getCurrentlySpeaking()?.alertId).toBe('H1');
      expect(getQueue().map((q) => q.alertId)).toEqual(['H2']);
    });

    it('priority normal + current high -> QUEUE atras (sem FLUSH reverso)', () => {
      enqueue(makeItem({ alertId: 'HIGH', priority: 'high' }));
      speechSynthesisMock.cancel.mockClear();

      enqueue(makeItem({ alertId: 'normal', priority: 'normal' }));

      expect(speechSynthesisMock.cancel).not.toHaveBeenCalled();
      expect(getCurrentlySpeaking()?.alertId).toBe('HIGH');
      expect(getQueue().map((q) => q.alertId)).toEqual(['normal']);
    });

    it('promove proximo via utterance.onend + itens em queue tocam apenas 1x', () => {
      enqueue(makeItem({ alertId: 'A', repeatCount: 1 }));
      enqueue(makeItem({ alertId: 'B', repeatCount: 5 }));
      enqueue(makeItem({ alertId: 'C', repeatCount: 5 }));

      // Simula fim da fala A.
      const utteranceA = speechSynthesisMock.speak.mock.calls[0][0];
      utteranceA.onend?.({});

      expect(getCurrentlySpeaking()?.alertId).toBe('B');

      // Item B em queue toca apenas 1x — nao repeta mesmo tendo repeatCount 5.
      const utteranceB = speechSynthesisMock.speak.mock.calls[1][0];
      utteranceB.onend?.({});

      expect(getCurrentlySpeaking()?.alertId).toBe('C');

      // Quando C termina, queue vazia.
      const utteranceC = speechSynthesisMock.speak.mock.calls[2][0];
      utteranceC.onend?.({});

      expect(getCurrentlySpeaking()).toBeNull();
    });
  });

  describe('Cap items (>3 em queue)', () => {
    it('descarta novo item quando queue ja tem 3 + retorna dropped=true cap_items', () => {
      enqueue(makeItem({ alertId: 'A' })); // current
      enqueue(makeItem({ alertId: 'B' })); // queue[0]
      enqueue(makeItem({ alertId: 'C' })); // queue[1]
      enqueue(makeItem({ alertId: 'D' })); // queue[2]

      const result = enqueue(makeItem({ alertId: 'E' }));

      expect(result.dropped).toBe(true);
      expect(result.reason).toBe('cap_items');
      expect(getQueue().map((q) => q.alertId)).toEqual(['B', 'C', 'D']);
    });
  });

  describe('Cap time (>30s buffered)', () => {
    it('item enqueued ha mais de 30s descartado ao tentar promover (cap_time)', () => {
      const t0 = 1000;
      vi.setSystemTime(t0);
      enqueue(makeItem({ alertId: 'A', enqueuedAt: t0 }));
      enqueue(makeItem({ alertId: 'STALE', enqueuedAt: t0 }));

      // Avanca 31s antes de promover STALE.
      vi.setSystemTime(t0 + 31000);

      const utteranceA = speechSynthesisMock.speak.mock.calls[0][0];
      speechSynthesisMock.speak.mockClear();
      utteranceA.onend?.({});

      // STALE descartado por cap_time, nao foi falado.
      expect(getCurrentlySpeaking()).toBeNull();
      expect(speechSynthesisMock.speak).not.toHaveBeenCalled();
    });
  });

  describe('Watchdog — utterance stuck (R-12)', () => {
    it('utterance que nunca comeca a falar -> recupera em 3s (start timeout) e promove proximo', () => {
      // Fix "as vezes nao toca": o engine aceita `speak()` e nunca fala (Chrome
      // com speechSynthesis grudado em paused apos aba em background). Antes so
      // o watchdog de 30s reagia — e durante esses 30s todo alarme novo ficava
      // enfileirado atras do travado e depois era descartado por cap_time (30s),
      // sumindo calado. Agora a ausencia de `onstart` e detectada em 3s.
      enqueue(makeItem({ alertId: 'STUCK' }));
      enqueue(makeItem({ alertId: 'NEXT' }));

      vi.advanceTimersByTime(3000);

      expect(speechSynthesisMock.cancel).toHaveBeenCalled();
      expect(getCurrentlySpeaking()?.alertId).toBe('NEXT');
    });

    it('utterance que comeca mas nunca termina -> watchdog de 30s cancela + promove proximo', () => {
      // Com `onstart` disparado o start timeout e desarmado, entao quem cobre o
      // travamento no meio da fala continua sendo o watchdog de 30s.
      enqueue(makeItem({ alertId: 'STUCK' }));
      enqueue(makeItem({ alertId: 'NEXT' }));

      const utteranceStuck = speechSynthesisMock.speak.mock.calls[0][0];
      utteranceStuck.onstart?.({});

      vi.advanceTimersByTime(3000);
      expect(getCurrentlySpeaking()?.alertId).toBe('STUCK');

      vi.advanceTimersByTime(27000);

      expect(speechSynthesisMock.cancel).toHaveBeenCalled();
      expect(getCurrentlySpeaking()?.alertId).toBe('NEXT');
    });

    it('utterance.onerror tambem promove proximo (R-12 mitigation)', () => {
      enqueue(makeItem({ alertId: 'BAD' }));
      enqueue(makeItem({ alertId: 'NEXT' }));

      const utteranceBad = speechSynthesisMock.speak.mock.calls[0][0];
      utteranceBad.onerror?.({ error: 'synthesis-failed' });

      expect(getCurrentlySpeaking()?.alertId).toBe('NEXT');
    });
  });

  describe('stopAlertById (scoped — P1-5) — 3 caminhos', () => {
    it('alertId currently speaking -> cancel + promote next', () => {
      enqueue(makeItem({ alertId: 'A' }));
      enqueue(makeItem({ alertId: 'B' }));
      speechSynthesisMock.cancel.mockClear();

      stopAlertById('A');

      expect(speechSynthesisMock.cancel).toHaveBeenCalled();
      expect(getCurrentlySpeaking()?.alertId).toBe('B');
    });

    it('alertId em queue -> filtra de queue, current intacto', () => {
      enqueue(makeItem({ alertId: 'A' })); // current
      enqueue(makeItem({ alertId: 'B' })); // queue[0]
      enqueue(makeItem({ alertId: 'C' })); // queue[1]
      speechSynthesisMock.cancel.mockClear();

      stopAlertById('B');

      expect(speechSynthesisMock.cancel).not.toHaveBeenCalled();
      expect(getCurrentlySpeaking()?.alertId).toBe('A');
      expect(getQueue().map((q) => q.alertId)).toEqual(['C']);
    });

    it('alertId desconhecido -> no-op (nao toca, nao cancela, nao limpa)', () => {
      enqueue(makeItem({ alertId: 'A' }));
      enqueue(makeItem({ alertId: 'B' }));
      speechSynthesisMock.cancel.mockClear();

      stopAlertById('UNKNOWN');

      expect(speechSynthesisMock.cancel).not.toHaveBeenCalled();
      expect(getCurrentlySpeaking()?.alertId).toBe('A');
      expect(getQueue().map((q) => q.alertId)).toEqual(['B']);
    });
  });

  describe('stopAllAlerts — 3 caminhos', () => {
    it('com fala em curso e queue cheia -> cancel global + reset state', () => {
      enqueue(makeItem({ alertId: 'A' }));
      enqueue(makeItem({ alertId: 'B' }));
      enqueue(makeItem({ alertId: 'C' }));
      speechSynthesisMock.cancel.mockClear();

      stopAllAlerts();

      expect(speechSynthesisMock.cancel).toHaveBeenCalled();
      expect(getCurrentlySpeaking()).toBeNull();
      expect(getQueue()).toEqual([]);
    });

    it('com fala em curso e queue vazia -> cancel + state reset', () => {
      enqueue(makeItem({ alertId: 'SOLO' }));

      stopAllAlerts();

      expect(speechSynthesisMock.cancel).toHaveBeenCalled();
      expect(getCurrentlySpeaking()).toBeNull();
    });

    it('sem fala em curso -> no-op seguro (idempotente)', () => {
      stopAllAlerts();
      stopAllAlerts(); // Chamada dupla nao quebra.

      expect(getCurrentlySpeaking()).toBeNull();
      expect(getQueue()).toEqual([]);
    });
  });

  describe('Repeat (RF-01) — apenas item current, nao itens em queue', () => {
    it('item entrando direto como current com repeatCount 2 schedula setTimeout para repeat', () => {
      enqueue(makeItem({ alertId: 'A', repeatCount: 2, repeatGapMs: 3000 }));

      // Primeira fala imediata.
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);

      // Termina primeira fala.
      const utteranceA1 = speechSynthesisMock.speak.mock.calls[0][0];
      utteranceA1.onend?.({});

      // Avanca 3s — segunda fala (repeat).
      vi.advanceTimersByTime(3000);

      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(2);
      // Ainda eh o mesmo alertId em curso (mesmo item, repeticao).
      expect(getCurrentlySpeaking()?.alertId).toBe('A');
    });

    it('item promovido da queue toca apenas 1x mesmo com repeatCount 5', () => {
      enqueue(makeItem({ alertId: 'A', repeatCount: 1 }));
      enqueue(makeItem({ alertId: 'B', repeatCount: 5 }));

      // Termina A.
      const utteranceA = speechSynthesisMock.speak.mock.calls[0][0];
      utteranceA.onend?.({});

      // Termina B (a unica vez que tocou).
      const utteranceB = speechSynthesisMock.speak.mock.calls[1][0];
      utteranceB.onend?.({});

      // Avanca tempo suficiente para qualquer repeat hipotetico.
      vi.advanceTimersByTime(30000);

      // B foi promovido da queue -> repeat NAO ocorreu.
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(2);
      expect(getCurrentlySpeaking()).toBeNull();
    });

    // Fix 8 — founder default 3x com gap 3000ms.
    it('repeatCount 3 + gap 3000ms toca exatamente 3 vezes com 3s entre cada', () => {
      enqueue(makeItem({ alertId: 'A', repeatCount: 3, repeatGapMs: 3000 }));

      // 1a fala imediata
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);

      // Encerra 1a -> agenda 2a em 3s
      speechSynthesisMock.speak.mock.calls[0][0].onend?.({});
      vi.advanceTimersByTime(2999);
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(2);

      // Encerra 2a -> agenda 3a em 3s
      speechSynthesisMock.speak.mock.calls[1][0].onend?.({});
      vi.advanceTimersByTime(3000);
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(3);

      // Encerra 3a -> sem mais repeticoes
      speechSynthesisMock.speak.mock.calls[2][0].onend?.({});
      vi.advanceTimersByTime(10000);
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(3);
      expect(getCurrentlySpeaking()).toBeNull();
    });

    // Fix 8 — founder requer dismiss imediato.
    it('stopAlertById durante o gap impede o proximo repeat', () => {
      enqueue(makeItem({ alertId: 'A', repeatCount: 3, repeatGapMs: 3000 }));

      // 1a fala
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
      speechSynthesisMock.speak.mock.calls[0][0].onend?.({});

      // Durante o gap, dispara stopAlertById
      vi.advanceTimersByTime(1500);
      stopAlertById('A');

      expect(speechSynthesisMock.cancel).toHaveBeenCalled();

      // Avanca tempo — nenhum speak adicional
      vi.advanceTimersByTime(10000);
      expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
      expect(getCurrentlySpeaking()).toBeNull();
    });
  });

  describe('__resetForTesting', () => {
    it('limpa state module-level entre testes (current + queue + timeouts)', () => {
      enqueue(makeItem({ alertId: 'A' }));
      enqueue(makeItem({ alertId: 'B' }));

      __resetForTesting();

      expect(getCurrentlySpeaking()).toBeNull();
      expect(getQueue()).toEqual([]);
    });
  });
});
