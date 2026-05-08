/**
 * LessonAutoLogToast — Sprint Estudos-Coach-Biblio-2 / RF-1.4
 *
 * Toast non-blocking exibido apos auto-log de aula.
 *   - variant=success: "Estudo registrado: <titulo> (<X> min)" + acao
 *     "Ver detalhes" (navega /estudos?session=<sessionId>) + dismiss.
 *   - variant=info:    "Aula em andamento: progresso atualizado para <X> min"
 *     (sem acao, apenas dismiss).
 *
 * Toast eh um componente de apresentacao puro — quem orquestra timing/auto
 * dismiss eh o caller (use-toast ou wrapper). Aqui responsabilidade fica em:
 *   - render label + action + dismiss
 *   - delegar navigation pro Wouter useLocation()
 *
 * Lessons aplicadas:
 *   #2  data-testid estaveis (lesson-auto-log-toast, *-message, *-action,
 *       *-dismiss).
 *   #19 navegacao Wouter via setLocation (URL exata da spec).
 *
 * Spec: Docs/specs/estudos-coach-biblio-2.md §RF-1.4
 */

import * as React from "react";
import { useLocation } from "wouter";

export interface LessonAutoLogToastProps {
  variant: "success" | "info";
  lessonTitle: string;
  durationMinutes: number;
  sessionId: string;
  onDismiss: () => void;
}

export function LessonAutoLogToast({
  variant,
  lessonTitle,
  durationMinutes,
  sessionId,
  onDismiss,
}: LessonAutoLogToastProps) {
  const [, setLocation] = useLocation();

  const message =
    variant === "success"
      ? `Estudo registrado: ${lessonTitle} (${durationMinutes} min)`
      : `Aula em andamento: progresso atualizado para ${durationMinutes} min`;

  const handleViewDetails = (): void => {
    setLocation(`/estudos?session=${sessionId}`);
  };

  return (
    <div
      data-testid="lesson-auto-log-toast"
      data-variant={variant}
      role="alert"
      className={`flex items-start gap-3 p-3 rounded-md border shadow-md max-w-sm ${
        variant === "success"
          ? "bg-green-900/40 border-green-500/40 text-green-100"
          : "bg-blue-900/40 border-blue-500/40 text-blue-100"
      }`}
    >
      <span
        data-testid="lesson-auto-log-toast-message"
        className="flex-1 text-sm"
      >
        {message}
      </span>
      <div className="flex items-center gap-2">
        {variant === "success" && (
          <button
            type="button"
            data-testid="lesson-auto-log-toast-action"
            onClick={handleViewDetails}
            className="text-xs font-medium underline hover:no-underline"
          >
            Ver detalhes
          </button>
        )}
        <button
          type="button"
          data-testid="lesson-auto-log-toast-dismiss"
          onClick={onDismiss}
          aria-label="Fechar"
          className="text-xs opacity-70 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default LessonAutoLogToast;
