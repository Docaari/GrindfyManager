/**
 * BankrollModeSegmentedControl — Sprint TS-3 RF-04 (ADR-178 §2.4)
 *
 * Segmented control 3-way: Todos | Avisar | Esconder fora.
 * Quando `persist` ativo, persiste mudancas via PUT /api/user-settings com
 * debounce 500ms.
 */

import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

export type BankrollMode = "all" | "hide" | "warn";

export interface BankrollModeSegmentedControlProps {
  value: BankrollMode;
  onChange: (next: BankrollMode) => void;
  persist?: boolean;
}

const CHIPS: Array<{ value: BankrollMode; label: string; tooltip: string }> = [
  {
    value: "all",
    label: "Todos",
    tooltip: "Mostra todos os torneios sem filtro de banca.",
  },
  {
    value: "warn",
    label: "Avisar",
    tooltip: "Mostra torneios acima do limite com badge de aviso.",
  },
  {
    value: "hide",
    label: "Esconder fora",
    tooltip: "Esconde torneios acima do limite da banca.",
  },
];

export function BankrollModeSegmentedControl({
  value,
  onChange,
  persist,
}: BankrollModeSegmentedControlProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function schedulePersist(next: BankrollMode) {
    if (!persist) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      apiRequest("PUT", "/api/user-settings", {
        tournament_selector_bankroll_mode: next,
      })?.catch?.((err: any) => console.error("BankrollMode persist failed:", err));
    }, 500);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      role="group"
      aria-label="Modo de filtro por banca"
      className="inline-flex items-center gap-1 rounded-md border bg-background p-1"
      data-testid="bankroll-mode-control"
    >
      {CHIPS.map((c) => (
        <button
          key={c.value}
          type="button"
          aria-pressed={value === c.value}
          title={c.tooltip}
          onClick={() => {
            onChange(c.value);
            schedulePersist(c.value);
          }}
          data-testid={`bankroll-mode-chip-${c.value}`}
          className={
            value === c.value
              ? "px-3 py-1 text-sm rounded bg-primary text-primary-foreground"
              : "px-3 py-1 text-sm rounded text-muted-foreground hover:bg-muted"
          }
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export default BankrollModeSegmentedControl;
