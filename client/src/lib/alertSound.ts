/**
 * alertSound — beep dos alarmes do Grind Live (Web Audio API).
 *
 * Extraido de `fireAlert.ts` para que `tts/narrationQueue.ts` possa usar o beep
 * como fallback audivel quando a narracao TTS falha, sem criar import circular
 * (`fireAlert` -> `narrationQueue` -> `fireAlert`).
 *
 * Historico do bug que motivou o singleton: o codigo anterior criava um
 * `new AudioContext()` a cada beep e so o fechava em `oscillator.onended`.
 * Quando a policy de autoplay do Chrome deixava o contexto `suspended` (aba sem
 * gesto do usuario, ou aba em background), o oscillator nunca rodava, `onended`
 * nunca disparava e o contexto vazava. Chrome limita ~6 contextos por documento,
 * entao a partir do 7o beep `new AudioContext()` passava a lancar — com o erro
 * engolido por um `catch {}` vazio. Sintoma pro jogador: o alarme parava de
 * tocar e so voltava com F5.
 */

let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (_audioCtx && _audioCtx.state !== 'closed') return _audioCtx;
  try {
    const Ctx =
      (typeof window !== 'undefined' &&
        ((window as any).AudioContext || (window as any).webkitAudioContext)) ||
      (typeof globalThis !== 'undefined' && (globalThis as any).AudioContext);
    if (!Ctx) return null;
    _audioCtx = new Ctx();
    return _audioCtx;
  } catch (err) {
    console.warn('[alertSound] AudioContext indisponivel', err);
    return null;
  }
}

function emitBeep(audioCtx: AudioContext) {
  try {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    // Sem close(): o contexto e singleton e sera reaproveitado no proximo beep.
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.2);
  } catch (err) {
    console.warn('[alertSound] emitBeep falhou', err);
  }
}

export function playBeep(): void {
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;
    // Autoplay policy deixa o contexto 'suspended' ate haver gesto do usuario.
    // resume() e assincrono: agenda o beep no `then` para nao emitir em um
    // contexto parado (que simplesmente nao produz som e nao lanca erro).
    if (audioCtx.state === 'suspended') {
      const resumed = audioCtx.resume?.();
      if (resumed && typeof resumed.then === 'function') {
        resumed
          .then(() => emitBeep(audioCtx))
          .catch((err: unknown) => {
            console.warn('[alertSound] AudioContext.resume bloqueado', err);
          });
        return;
      }
    }
    emitBeep(audioCtx);
  } catch (err) {
    console.warn('[alertSound] beep falhou', err);
  }
}

/**
 * Destrava o audio na primeira interacao do usuario com a pagina. A policy de
 * autoplay so libera o AudioContext apos um gesto; sem isso o primeiro alarme da
 * sessao sai mudo. Idempotente — pode ser chamada a cada gesto.
 */
export function primeAlertAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      ctx.resume?.();
    } catch (err) {
      // Sem gesto valido a policy recusa; tentamos de novo no proximo gesto.
      console.debug('[alertSound] prime adiado (sem gesto valido)', err);
    }
  }
}

/** Apenas para testes — descarta o AudioContext singleton. */
export function _resetAudioContextForTests(): void {
  _audioCtx = null;
}
