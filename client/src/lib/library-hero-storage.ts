// =============================================================================
// library-hero-storage.ts — Sprint Bloco-A-Polish / RF-03 + D9
//
// localStorage helpers para a flag "hero-seen" por lesson. Permite que o
// LessonHeroPage redirecione direto pra /play em revisitas.
//
// Key canonica (D9):  library:lesson:{lessonId}:hero-seen
// Valor canonico:     "true"
//
// Todos helpers sao try/catch silent (Safari private mode, quota cheia,
// SecurityError). Falha silenciosa = comportamento de "1a visita" — usuario
// ve o hero novamente, sem crash.
// =============================================================================

const NAMESPACE = "library:lesson";
const SUFFIX = "hero-seen";

function buildKey(lessonId: string): string {
  return `${NAMESPACE}:${lessonId}:${SUFFIX}`;
}

/**
 * Le flag "hero-seen" de uma lesson. Retorna "true" quando setada,
 * null caso contrario (inclusive em erros de localStorage).
 */
export function readHeroSeenFlag(lessonId: string): string | null {
  try {
    return localStorage.getItem(buildKey(lessonId));
  } catch {
    return null;
  }
}

/**
 * Marca lesson como vista no hero (string "true"). Idempotente.
 * Retorna true em sucesso, false quando localStorage lanca
 * (quota exceeded / SecurityError em private mode).
 */
export function writeHeroSeenFlag(lessonId: string): boolean {
  try {
    localStorage.setItem(buildKey(lessonId), "true");
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a flag (usado em testes / reset manual). Silent em qualquer erro.
 */
export function clearHeroSeenFlag(lessonId: string): void {
  try {
    localStorage.removeItem(buildKey(lessonId));
  } catch {
    // ok — silent
  }
}
