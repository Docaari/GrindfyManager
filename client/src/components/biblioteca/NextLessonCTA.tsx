import React, { useEffect, useRef, useState } from "react";

export interface NextLessonRef {
  id: string;
  displayLabel?: string;
  title: string;
}

export interface NextLessonCTAProps {
  nextLesson: NextLessonRef;
  onGo: () => void;
  onCancel: () => void;
  autoStartSeconds?: number;
}

export function NextLessonCTA({
  nextLesson,
  onGo,
  onCancel,
  autoStartSeconds = 5,
}: NextLessonCTAProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(autoStartSeconds);
  const [countdownActive, setCountdownActive] = useState<boolean>(true);
  const goButtonRef = useRef<HTMLButtonElement | null>(null);
  const onGoRef = useRef(onGo);
  const onCancelRef = useRef(onCancel);
  const goFiredRef = useRef(false);

  useEffect(() => {
    onGoRef.current = onGo;
  }, [onGo]);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    goButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!goFiredRef.current) {
      setSecondsLeft(autoStartSeconds);
    }
  }, [autoStartSeconds]);

  useEffect(() => {
    if (!countdownActive) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!goFiredRef.current) {
            goFiredRef.current = true;
            onGoRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdownActive]);

  useEffect(() => {
    function handleKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        handleCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGo() {
    if (goFiredRef.current) return;
    goFiredRef.current = true;
    setCountdownActive(false);
    onGoRef.current();
  }

  function handleCancel() {
    setCountdownActive(false);
    onCancelRef.current();
  }

  const labelPrefix = nextLesson.displayLabel ?? "";
  const titleText = `${labelPrefix ? `${labelPrefix} - ` : ""}${nextLesson.title}`;

  return (
    <div
      data-testid="next-lesson-cta"
      role="region"
      aria-label="Proxima aula"
      className="mt-3 p-4 rounded-lg border border-green-500/30 bg-green-500/5 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wider text-green-400 font-mono">
          Proxima aula
        </p>
        <p className="text-sm text-white truncate">{titleText}</p>
        <p
          data-testid="next-lesson-cta-countdown"
          aria-live="polite"
          className="text-xs text-gray-400 mt-1"
        >
          {countdownActive
            ? `Auto-iniciando em ${secondsLeft}s`
            : "Quando quiser, clique abaixo"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="next-lesson-cta-cancel"
          onClick={handleCancel}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-300 hover:text-white border border-gray-600 hover:bg-gray-800"
        >
          Cancelar
        </button>
        <button
          type="button"
          data-testid="next-lesson-cta-go"
          ref={goButtonRef}
          onClick={handleGo}
          className="px-4 py-1.5 rounded-md text-sm font-semibold bg-green-500 hover:bg-green-400 text-black"
        >
          Ir agora
        </button>
      </div>
    </div>
  );
}

export default NextLessonCTA;
