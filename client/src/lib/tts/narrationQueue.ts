/**
 * narrationQueue — TTS priority queue (Sprint Alarmes 2.0).
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-01 Substituir beep por TTS (repeticoes via setTimeout chain)
 *  - RF-09 stopAlertById scoped (P1-5)
 *  - RF-13 priority queue (FLUSH/QUEUE matrix, cap items, cap time)
 *  - R-12 watchdog stuck (onerror + 30s timeout)
 *
 * ADRs:
 *  - 048-tts-priority-queue.md
 *  - 050-tts-state-module-level.md (state global; usar __resetForTesting em testes)
 *
 * Estado module-level (singleton). NAO usar Context/Zustand.
 */

export type Priority = 'high' | 'normal';

export interface QueueItem {
  alertId: string;
  priority: Priority;
  text: string;
  voice: SpeechSynthesisVoice | null;
  volume: number;
  enqueuedAt: number;
  repeatCount?: number;
  repeatGapMs?: number;
}

export interface EnqueueResult {
  dropped: boolean;
  reason?: 'cap_items' | 'cap_time';
}

interface CurrentlySpeaking extends QueueItem {
  utterance: SpeechSynthesisUtterance;
  repeatRemaining: number;
  /** Quando promovido da queue, repeat e desativado (toca 1x). */
  allowRepeat: boolean;
}

// ============================================================================
// Module-level state
// ============================================================================

let _currentlySpeaking: CurrentlySpeaking | null = null;
let _queue: QueueItem[] = [];
let _alertTimeouts: Map<string, any[]> = new Map();
let _watchdogTimer: any = null;

const MAX_QUEUE_ITEMS = 3; // Excluindo current. Caps tempo total ~15s (3 * ~5s).
const MAX_BUFFERED_MS = 30_000; // Items mais antigos que isso na queue sao descartados em promoteNext.
const WATCHDOG_MS = 30_000; // Stuck utterance detection. Independente de MAX_BUFFERED_MS.

// ============================================================================
// Helpers internos
// ============================================================================

function clearWatchdog() {
  if (_watchdogTimer) {
    clearTimeout(_watchdogTimer);
    _watchdogTimer = null;
  }
}

function clearTimeoutsFor(alertId: string) {
  const list = _alertTimeouts.get(alertId);
  if (list) {
    list.forEach((t) => clearTimeout(t));
    _alertTimeouts.delete(alertId);
  }
}

function trackTimeout(alertId: string, t: any) {
  const list = _alertTimeouts.get(alertId) ?? [];
  list.push(t);
  _alertTimeouts.set(alertId, list);
}

function startWatchdog() {
  clearWatchdog();
  _watchdogTimer = setTimeout(() => {
    // Stuck: current existe mas nunca disparou onend.
    if (_currentlySpeaking) {
      try {
        speechSynthesis.cancel();
      } catch {
        // ignore
      }
      const stuckId = _currentlySpeaking.alertId;
      _currentlySpeaking = null;
      clearTimeoutsFor(stuckId);
      promoteNext();
    }
  }, WATCHDOG_MS);
}

/**
 * Cria utterance + atribui handlers (onend, onerror) + chama speak.
 * Usado tanto em speakNow (1a fala) quanto no repeat path.
 */
function startUtterance(
  base: QueueItem & Partial<CurrentlySpeaking>,
  repeatRemaining: number,
  allowRepeat: boolean
): CurrentlySpeaking {
  const utterance = new SpeechSynthesisUtterance(base.text);
  if (base.voice) utterance.voice = base.voice;
  utterance.volume = base.volume;

  const current: CurrentlySpeaking = {
    ...base,
    utterance,
    repeatRemaining,
    allowRepeat,
  } as CurrentlySpeaking;

  utterance.onend = () => handleUtteranceFinished(current, 'end');
  utterance.onerror = () => handleUtteranceFinished(current, 'error');

  _currentlySpeaking = current;
  startWatchdog();
  try {
    speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[narrationQueue] speak failed', err);
  }
  return current;
}

function speakNow(item: QueueItem, allowRepeat: boolean): CurrentlySpeaking {
  const repeatRemaining = allowRepeat ? Math.max(0, (item.repeatCount ?? 1) - 1) : 0;
  return startUtterance(item, repeatRemaining, allowRepeat);
}

function handleUtteranceFinished(current: CurrentlySpeaking, reason: 'end' | 'error') {
  // Se current ja foi sobrescrito por FLUSH/stop, ignorar.
  if (_currentlySpeaking !== current) return;

  // Caso de erro: promove proximo (R-12 mitigation).
  if (reason === 'error') {
    clearWatchdog();
    _currentlySpeaking = null;
    clearTimeoutsFor(current.alertId);
    promoteNext();
    return;
  }

  // onend: aplica repeat se ainda tem repeticoes pendentes.
  if (current.allowRepeat && current.repeatRemaining > 0) {
    const gap = current.repeatGapMs ?? 3000;
    const t = setTimeout(() => {
      if (_currentlySpeaking !== current) return; // foi cancelado durante o gap
      startUtterance(current, current.repeatRemaining - 1, true);
    }, gap);
    trackTimeout(current.alertId, t);
    return;
  }

  // Sem repeat ou repeat exaurido: promove proximo da queue.
  clearWatchdog();
  _currentlySpeaking = null;
  clearTimeoutsFor(current.alertId);
  promoteNext();
}

/**
 * Promove o proximo item da queue para current. Aplica cap_time (descarta
 * itens enqueuedAt > 30s atras). Itens promovidos da queue tocam 1x (sem repeat).
 */
function promoteNext() {
  while (_queue.length > 0) {
    const next = _queue.shift()!;
    const age = Date.now() - next.enqueuedAt;
    if (age > MAX_BUFFERED_MS) {
      // cap_time: descarta esse item, tenta o proximo.
      continue;
    }
    speakNow(next, /* allowRepeat */ false);
    return;
  }
  // Queue vazia.
  clearWatchdog();
}

// ============================================================================
// API publica
// ============================================================================

/**
 * Enfileira um item para narracao TTS.
 * - Se queue+current vazios: comeca a falar imediato, repeat habilitado.
 * - Se current normal + new high: FLUSH (cancel atual, descarta queue).
 * - Demais combinacoes: QUEUE atras.
 * - Cap items: se queue ja tem 3, retorna `dropped: true, reason: cap_items`.
 *
 * Asssimetria intencional (ADR-048): high NAO eh FLUSHADO por outro high
 * (mesma priority preserva ordem chronologica). Normal nunca FLUSHA high
 * (downgrade reverso nao faz sentido).
 *
 * CONTRATO: `alertId` deve ser unico no escopo da sessao. Reuso causa
 * cleanup map collision (timeouts do alarme antigo vs novo). Use UUID
 * (generateClientId) ou prefixos derivados (ex: `latereg-${tournamentId}`).
 */
export function enqueue(item: QueueItem): EnqueueResult {
  if (!_currentlySpeaking) {
    speakNow(item, /* allowRepeat */ true);
    return { dropped: false };
  }

  // High priority interrompe normal em curso (FLUSH).
  if (item.priority === 'high' && _currentlySpeaking.priority === 'normal') {
    try {
      speechSynthesis.cancel();
    } catch (err) {
      console.warn('[narrationQueue] cancel during FLUSH failed', err);
    }
    clearTimeoutsFor(_currentlySpeaking.alertId);
    _currentlySpeaking = null;
    _queue = [];
    speakNow(item, /* allowRepeat */ true);
    return { dropped: false };
  }

  if (_queue.length >= MAX_QUEUE_ITEMS) {
    return { dropped: true, reason: 'cap_items' };
  }

  _queue.push(item);
  return { dropped: false };
}

/**
 * Cancela alarme especifico (P1-5).
 *  - Se for o current: cancel + promote next.
 *  - Se estiver em queue: filter out, current intacto.
 *  - Se desconhecido: no-op.
 */
export function stopAlertById(alertId: string): void {
  if (_currentlySpeaking && _currentlySpeaking.alertId === alertId) {
    try {
      speechSynthesis.cancel();
    } catch {
      // ignore
    }
    clearTimeoutsFor(alertId);
    clearWatchdog();
    _currentlySpeaking = null;
    promoteNext();
    return;
  }
  // Procura em queue.
  const idx = _queue.findIndex((q) => q.alertId === alertId);
  if (idx >= 0) {
    _queue.splice(idx, 1);
    clearTimeoutsFor(alertId);
  }
  // Desconhecido: no-op silencioso.
}

/**
 * Cancela qualquer fala em curso, descarta queue, limpa state.
 * Idempotente — multiplas chamadas seguidas nao quebram.
 *
 * Sempre chama speechSynthesis.cancel(): util como gate global (RF-09 suspend),
 * onde pode ser chamado defensivamente mesmo sem state interno.
 */
export function stopAllAlerts(): void {
  try {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
  } catch {
    // ignore
  }
  clearWatchdog();
  _alertTimeouts.forEach((list) => list.forEach((t) => clearTimeout(t)));
  _alertTimeouts.clear();
  _currentlySpeaking = null;
  _queue = [];
}

export function getCurrentlySpeaking(): QueueItem | null {
  if (!_currentlySpeaking) return null;
  const { utterance, repeatRemaining, allowRepeat, ...item } = _currentlySpeaking;
  return item;
}

/** True quando ha narracao em curso (modulo OU browser API speaking). */
export function isAnythingSpeaking(): boolean {
  if (_currentlySpeaking) return true;
  return typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking;
}

export function getQueue(): QueueItem[] {
  return [..._queue];
}

/**
 * Reset module-level state — usado APENAS em tests (vide tests/setup.ts).
 */
export function __resetForTesting(): void {
  clearWatchdog();
  _alertTimeouts.forEach((list) => list.forEach((t) => clearTimeout(t)));
  _alertTimeouts.clear();
  _currentlySpeaking = null;
  _queue = [];
}
