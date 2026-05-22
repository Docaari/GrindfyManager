// Sprint Mini Player 3 / RF-03.4 — ShortcutsHelpPopover.
// ADR-195 + D5. Lista PT-BR compact dos shortcuts. Toggle via `?` key.

import React from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsHelpPopover({ open, onOpenChange }: Props) {
  if (!open) return null;

  return (
    <div
      data-testid="shortcuts-help-popover"
      role="dialog"
      aria-label="Atalhos de teclado"
      className="fixed bottom-20 right-4 z-50 w-72 rounded-md border border-white/10 bg-gray-900 p-4 text-sm text-white shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Atalhos de teclado</h3>
        <button
          type="button"
          data-testid="shortcuts-help-close"
          aria-label="Fechar atalhos"
          onClick={() => onOpenChange(false)}
          className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white"
        >
          x
        </button>
      </div>
      <ul className="space-y-1 text-xs text-gray-300">
        <li>
          <kbd className="font-mono">Espaco</kbd>: Play/Pause
        </li>
        <li>
          <kbd className="font-mono">Setas &larr; &rarr;</kbd>: -15s / +15s
        </li>
        <li>
          <kbd className="font-mono">J / L</kbd>: -10s / +10s (paridade YouTube)
        </li>
        <li>
          <kbd className="font-mono">0-9</kbd>: Pular para 0% / 10% / ... / 90%
        </li>
        <li>
          <kbd className="font-mono">M</kbd>: Mute toggle
        </li>
        <li>
          <kbd className="font-mono">Setas Cima/Baixo</kbd>: Volume +/- 10%
        </li>
        <li>
          <kbd className="font-mono">?</kbd>: Mostrar/esconder atalhos
        </li>
        <li>
          <kbd className="font-mono">Esc</kbd>: Fechar player
        </li>
      </ul>
    </div>
  );
}

export default ShortcutsHelpPopover;
