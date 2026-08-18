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

import { playBeep } from '../alertSound';

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
  /** True apos `onstart`. Enquanto false, a fala pode ter morrido calada. */
  started: boolean;
}

// ============================================================================
// Module-level state
// ============================================================================

let _currentlySpeaking: CurrentlySpeaking | null = null;
let _queue: QueueItem[] = [];
let _alertTimeouts: Map<string, any[]> = new Map();
let _watchdogTimer: any = null;
let _startTimer: any = null;
let _unstickTimer: any = null;

const MAX_QUEUE_ITEMS = 3; // Excluindo current. Caps tempo total ~15s (3 * ~5s).
const MAX_BUFFERED_MS = 30_000; // Items mais antigos que isso na queue sao descartados em promoteNext.
const WATCHDOG_MS = 30_000; // Stuck utterance detection. Independente de MAX_BUFFERED_MS.
/**
 * Se `onstart` nao disparar nesse prazo, a fala morreu calada e caimos no beep.
 * O watchdog de 30s existia, mas era tarde demais: durante os 30s de espera o
 * `_currentlySpeaking` travado enfileirava os alarmes seguintes, e o
 * `promoteNext` entao os descartava por `MAX_BUFFERED_MS` (tambem 30s). Ou seja,
 * uma fala travada engolia calada TODOS os alarmes da janela. Este timer curto
 * corta o problema na raiz.
 */
const START_TIMEOUT_MS = 3_000;
/** Poll do destravamento do speechSynthesis (bug de `paused` grudado no Chrome). */
const UNSTICK_POLL_MS = 5_000;

// ============================================================================
// Helpers internos
// ============================================================================

function hasSpeechSynthesis(): boolean {
  return typeof speechSynthesis !== 'undefined' && !!speechSynthesis;
}

/**
 * Chrome deixa o `speechSynthesis` grudado em `paused` depois que a aba fica em
 * background (o jogador esta na mesa do site de poker, nao no Grindfy). Nesse
 * estado `speak()` aceita a utterance, nao lanca erro e nao emite som algum —
 * o alarme simplesmente nao toca. Chamar `resume()` destrava.
 */
function unstickSpeechSynthesis() {
  if (!hasSpeechSynthesis()) return;
  try {
    if (speechSynthesis.paused) speechSynthesis.resume();
  } catch (err) {
    console.warn('[narrationQueue] resume falhou', err);
  }
}

function startUnstickPoll() {
  if (_unstickTimer) return;
  if (typeof setInterval === 'undefined') return;
  _unstickTimer = setInterval(() => {
    if (!_currentlySpeaking) {
      stopUnstickPoll();
      return;
    }
    unstickSpeechSynthesis();
  }, UNSTICK_POLL_MS);
}

function stopUnstickPoll() {
  if (_unstickTimer) {
    clearInterval(_unstickTimer);
    _unstickTimer = null;
  }
}

function clearStartTimer() {
  if (_startTimer) {
    clearTimeout(_startTimer);
    _startTimer = null;
  }
}

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
      } catch (err) {
        console.warn('[narrationQueue] cancel no watchdog falhou', err);
      }
      const stuckId = _currentlySpeaking.alertId;
      _currentlySpeaking = null;
      clearStartTimer();
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
    started: false,
  } as CurrentlySpeaking;

  utterance.onstart = () => {
    if (_currentlySpeaking !== current) return;
    current.started = true;
    clearStartTimer();
  };
  utterance.onend = () => handleUtteranceFinished(current, 'end');
  utterance.onerror = () => handleUtteranceFinished(current, 'error');

  _currentlySpeaking = current;
  startWatchdog();
  startStartTimer(current);
  startUnstickPoll();

  // Destrava antes de falar: se o engine ficou `paused` (aba em background),
  // `speak()` aceita a utterance e nao emite som nenhum.
  unstickSpeechSynthesis();

  try {
    speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[narrationQueue] speak failed', err);
    handleUtteranceFinished(current, 'error');
  }
  return current;
}

/**
 * Se a fala nao comecar em START_TIMEOUT_MS, considera natimorta: cai no beep
 * (o jogador PRECISA ouvir algo) e libera a fila para o proximo alarme.
 */
function startStartTimer(current: CurrentlySpeaking) {
  clearStartTimer();
  if (typeof setTimeout === 'undefined') return;
  _startTimer = setTimeout(() => {
    _startTimer = null;
    if (_currentlySpeaking !== current || current.started) return;
    // O engine pode estar apenas com a fila cheia (outra aba falando): nesse
    // caso a utterance esta viva, so nao comecou. Nao mata — re-checa depois.
    if (hasSpeechSynthesis() && (speechSynthesis.pending || speechSynthesis.speaking)) {
      startStartTimer(current);
      return;
    }
    console.warn(
      '[narrationQueue] TTS nao iniciou em',
      START_TIMEOUT_MS,
      'ms — fallback beep',
      { alertId: current.alertId },
    );
    try {
      speechSynthesis.cancel();
    } catch (err) {
      console.warn('[narrationQueue] cancel apos falha de start', err);
    }
    playBeep();
    handleUtteranceFinished(current, 'error');
  }, START_TIMEOUT_MS);
}

function speakNow(item: QueueItem, allowRepeat: boolean): CurrentlySpeaking {
  const repeatRemaining = allowRepeat ? Math.max(0, (item.repeatCount ?? 1) - 1) : 0;
  return startUtterance(item, repeatRemaining, allowRepeat);
}

function handleUtteranceFinished(current: CurrentlySpeaking, reason: 'end' | 'error') {
  // Se current ja foi sobrescrito por FLUSH/stop, ignorar.
  if (_currentlySpeaking !== current) return;

  // Terminou (bem ou mal) => a fala nao esta natimorta. Desarma o start timer
  // antes de qualquer branch, senao ele dispararia no meio do gap do repeat e
  // mataria uma narracao saudavel.
  clearStartTimer();

  // Caso de erro: promove proximo (R-12 mitigation).
  if (reason === 'error') {
    clearWatchdog();
    clearStartTimer();
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
  clearStartTimer();
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
  clearStartTimer();
  stopUnstickPoll();
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
    clearStartTimer();
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
    clearStartTimer();
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
  clearStartTimer();
  stopUnstickPoll();
  _alertTimeouts.forEach((list) => list.forEach((t) => clearTimeout(t)));
  _alertTimeouts.clear();
  _currentlySpeaking = null;
  _queue = [];
}

export function getCurrentlySpeaking(): QueueItem | null {
  if (!_currentlySpeaking) return null;
  const { utterance, repeatRemaining, allowRepeat, started, ...item } = _currentlySpeaking;
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
  clearStartTimer();
  stopUnstickPoll();
  _alertTimeouts.forEach((list) => list.forEach((t) => clearTimeout(t)));
  _alertTimeouts.clear();
  _currentlySpeaking = null;
  _queue = [];
}
