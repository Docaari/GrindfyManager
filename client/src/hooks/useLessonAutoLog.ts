/**
 * useLessonAutoLog — Sprint Estudos-Coach-Biblio-2 / RF-1.1 + RF-1.2 + RF-1.4 + RF-1.5
 *
 * Hook que escuta `timeupdate` em <video>/<audio>/<mux-player> dentro de um
 * container e dispara POST /api/study-sessions com source='auto_lesson' quando
 * o progresso passa de 80% pela PRIMEIRA vez na vida deste mount.
 *
 * HIGH-2 fix (review): caller passava `container.current` (HTMLElement|null)
 * que era null no primeiro render. Como atribuir ref nao re-renderiza, o hook
 * recebia null pra sempre e o listener nunca instalava. Migramos a API para
 * receber o ref OBJETO (RefObject<HTMLElement>); o hook le `.current` DENTRO
 * do useEffect, que re-roda quando lessonId muda — naquele ponto o ref ja foi
 * preenchido pelo React.
 *
 * HIGH-3 / RF-1.4: hook expoe `lastLogged` (estado React) com metadata do
 * ultimo auto-log bem-sucedido (sessionId + durationMinutes + status). Caller
 * (LessonViewer) escuta e dispara toast via useToast(). State faz auto-clear
 * apos 5s para evitar replay em re-mount sem que o hook re-emita.
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #9  log antes de fallback (network erro nao silencioso de tudo)
 *   #20 wirar via container.querySelector — Mux Player encapsula <video> em
 *       custom element (mux-player) que implementa HTMLMediaElement-like.
 *
 * NUNCA bloquear o player: catch + warn em qualquer falha.
 *
 * Spec: Docs/specs/estudos-coach-biblio-2.md §RF-1.1 / RF-1.2 / RF-1.4 / RF-1.5
 * ADR : Docs/architecture/decisions/131-auto-lesson-trigger-client-side.md
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { apiRequest } from "@/lib/queryClient";

export type LessonAutoLogStatus = "success" | "failed";

export interface LessonAutoLogResult {
  sessionId: string | null;
  lessonId: string;
  durationMinutes: number;
  status: LessonAutoLogStatus;
}

export interface UseLessonAutoLogParams {
  /** ID da aula (UUID) — quando null/undefined o hook fica inerte. */
  lessonId: string | null | undefined;
  /**
   * RefObject apontando para o container DOM dentro do qual o `<video>`,
   * `<audio>` ou `<mux-player>` sera renderizado. Hook le `.current` dentro
   * do effect, entao primeiro render pode ter ref vazio que sera resolvido
   * em renders subsequentes (HIGH-2 fix).
   *
   * Tambem aceitamos forma legacy `HTMLElement | null` para retro-compat com
   * testes que passam mock direto via `{ querySelector }`.
   */
  containerRef?: RefObject<HTMLElement | null> | null | undefined;
  /** Forma legacy: passar elemento direto (mantida pra compat de testes). */
  container?: HTMLElement | null | undefined;
  /**
   * RF-1.5 opt-out via setting `studyHabit.autoLogLessons`. Quando false o
   * hook NAO dispara — listener nem instala.
   */
  autoLogEnabled: boolean;
}

export interface UseLessonAutoLogReturn {
  /** Resultado do ultimo auto-log emitido neste mount. Auto-clear em 5s. */
  lastLogged: LessonAutoLogResult | null;
}

const PROGRESS_THRESHOLD = 0.8;
const RESULT_AUTO_CLEAR_MS = 5000;

function findMediaElement(
  container: HTMLElement,
): HTMLMediaElement | null {
  // Ordem deliberada: <video> e <audio> tradicionais primeiro, mux-player
  // (custom element) por ultimo. mux-player expoe currentTime/duration/
  // 'timeupdate' compativeis com HTMLMediaElement.
  const v = container.querySelector("video") as HTMLMediaElement | null;
  if (v) return v;
  const a = container.querySelector("audio") as HTMLMediaElement | null;
  if (a) return a;
  const mux = container.querySelector(
    "mux-player",
  ) as unknown as HTMLMediaElement | null;
  return mux ?? null;
}

export function useLessonAutoLog(
  params: UseLessonAutoLogParams,
): UseLessonAutoLogReturn {
  const { lessonId, containerRef, container, autoLogEnabled } = params;
  // RF-1.1: idempotente local — 1 dispatch por mount.
  const firedRef = useRef<boolean>(false);
  const [lastLogged, setLastLogged] = useState<LessonAutoLogResult | null>(
    null,
  );

  useEffect(() => {
    // Reset ao re-mount/troca de aula. Server lida com idempotency cross-mount
    // via janela 24h (RF-1.3).
    firedRef.current = false;
  }, [lessonId]);

  useEffect(() => {
    if (!autoLogEnabled) return;
    if (!lessonId) return;
    // HIGH-2: prefer `containerRef.current`; fallback para `container` legacy.
    const resolvedContainer =
      containerRef?.current ?? container ?? null;
    if (!resolvedContainer) return;

    const media = findMediaElement(resolvedContainer);
    if (!media) return;

    function onTimeUpdate(): void {
      if (firedRef.current) return;
      // Defensive: media may be null em re-render; usa snapshot.
      const m = media as HTMLMediaElement;
      const duration = Number(m.duration);
      const currentTime = Number(m.currentTime);
      // Mux Player runtime=0 (live ou bug) -> divisao por zero protegida.
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (!Number.isFinite(currentTime) || currentTime < 0) return;

      const progress = currentTime / duration;
      if (progress < PROGRESS_THRESHOLD) return;

      // Atinge 80%. Marca disparo IMEDIATAMENTE (anti-double via concurrent
      // events) e envia request.
      firedRef.current = true;

      const cappedSeconds = Math.min(currentTime, duration);
      const durationMinutes = Math.max(1, Math.round(cappedSeconds / 60));
      const lessonIdSnapshot = lessonId as string;

      const payload = {
        mode: "lesson" as const,
        source: "auto_lesson" as const,
        lessonId: lessonIdSnapshot,
        durationMinutes,
        notes: null,
        endedAt: new Date().toISOString(),
      };

      apiRequest("POST", "/api/study-sessions", payload)
        .then((resp: any) => {
          // RF-1.4: estado emitido pra LessonViewer disparar toast.
          setLastLogged({
            sessionId:
              typeof resp?.sessionId === "string"
                ? resp.sessionId
                : typeof resp?.id === "string"
                  ? resp.id
                  : null,
            lessonId: lessonIdSnapshot,
            durationMinutes,
            status: "success",
          });
        })
        .catch((err: any) => {
          // Lesson #9: log antes de fallback. Nao throw para nao quebrar player.
          // eslint-disable-next-line no-console
          console.warn(
            "[useLessonAutoLog] auto_lesson POST falhou (silent):",
            err?.message ?? err,
          );
          setLastLogged({
            sessionId: null,
            lessonId: lessonIdSnapshot,
            durationMinutes,
            status: "failed",
          });
        });
    }

    media.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      media.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [lessonId, containerRef, container, autoLogEnabled]);

  // Auto-clear apos 5s pra que toast nao "ressuscite" em re-renders.
  useEffect(() => {
    if (!lastLogged) return;
    const t = setTimeout(() => setLastLogged(null), RESULT_AUTO_CLEAR_MS);
    return () => clearTimeout(t);
  }, [lastLogged]);

  return { lastLogged };
}

export default useLessonAutoLog;
