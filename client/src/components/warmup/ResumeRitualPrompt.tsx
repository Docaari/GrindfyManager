/**
 * ResumeRitualPrompt — Sprint W-1 (RF-12)
 *
 * Detecta draft em localStorage e oferece "Retomar" / "Descartar".
 * Se draft expirado (>30min), descarta silenciosamente.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const DRAFT_KEY = "warmup-ritual-draft";
const DRAFT_TTL_MS = 30 * 60 * 1000;

interface DraftShape {
  ritualStartedAt: string;
  currentBlock: number;
  [key: string]: any;
}

function readDraft(): DraftShape | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DraftShape;
  } catch {
    return null;
  }
}

function clearDraft() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function isDraftFresh(d: DraftShape): boolean {
  const t = new Date(d.ritualStartedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < DRAFT_TTL_MS;
}

export interface ResumeRitualPromptProps {
  onResume: () => void;
  onDiscard: () => void;
}

export function ResumeRitualPrompt({ onResume, onDiscard }: ResumeRitualPromptProps) {
  const [valid, setValid] = useState<boolean>(() => {
    const d = readDraft();
    if (!d) return false;
    if (!isDraftFresh(d)) {
      clearDraft();
      return false;
    }
    return true;
  });

  useEffect(() => {
    // Re-check on mount in case localStorage was modified between SSR and CSR.
    const d = readDraft();
    if (!d) {
      setValid(false);
      return;
    }
    if (!isDraftFresh(d)) {
      clearDraft();
      setValid(false);
      return;
    }
    setValid(true);
  }, []);

  if (!valid) return null;

  return (
    <div className="rounded-lg border surface-warning p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <p className="text-sm">
        Retomar warm-up em andamento?
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            clearDraft();
            setValid(false);
            onDiscard();
          }}
        >
          Descartar
        </Button>
        <Button
          type="button"
          onClick={() => {
            setValid(false);
            onResume();
          }}
        >
          Retomar
        </Button>
      </div>
    </div>
  );
}
