// Sprint Mini Player 3 / RF-03.4 — ShortcutsHelpPopover.
// ADR-195 + D5. Lista PT-BR compact dos shortcuts. Toggle via `?` key.
//
// MP3.1 Wave B / INFO-1: migrado de <div role="dialog"> custom para Radix
// Dialog (focus trap + Esc + outside click a11y compliant).

import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsHelpPopover({ open, onOpenChange }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          data-testid="shortcuts-help-popover"
          className="fixed bottom-20 right-4 z-50 w-72 rounded-md border border-white/10 bg-gray-900 p-4 text-sm text-white shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <div className="mb-2 flex items-center justify-between">
            <DialogPrimitive.Title className="font-semibold">
              Atalhos de teclado
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-testid="shortcuts-help-close"
              aria-label="Fechar atalhos"
              className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Lista de atalhos de teclado do player de audio.
          </DialogPrimitive.Description>
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
              <kbd className="font-mono">0-9</kbd>: Pular para 0% / 10% / … / 90%
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default ShortcutsHelpPopover;
