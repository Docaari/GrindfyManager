import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  { keys: ['Ctrl', 'B'], description: 'Negrito (Bold)' },
  { keys: ['Ctrl', 'I'], description: 'Italico' },
  { keys: ['Ctrl', 'U'], description: 'Sublinhado' },
  { keys: ['Ctrl', 'Shift', '1'], description: 'Heading 1' },
  { keys: ['Ctrl', 'Shift', '2'], description: 'Heading 2' },
  { keys: ['Ctrl', 'Shift', '3'], description: 'Heading 3' },
  { keys: ['Ctrl', 'Shift', '7'], description: 'Lista numerada' },
  { keys: ['Ctrl', 'Shift', '8'], description: 'Lista com marcadores' },
  { keys: ['Ctrl', 'Shift', '9'], description: 'Checklist' },
  { keys: ['/'], description: 'Menu de comandos (slash menu)' },
  { keys: ['Tab'], description: 'Indentar' },
  { keys: ['Shift', 'Tab'], description: 'Desindentar' },
  { keys: ['Ctrl', 'Z'], description: 'Desfazer' },
  { keys: ['Ctrl', 'Shift', 'Z'], description: 'Refazer' },
  { keys: ['Ctrl', 'K'], description: 'Inserir link' },
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-gray-800 border-gray-700 max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Atalhos do Editor</DialogTitle>
          <DialogDescription className="text-gray-400">
            Atalhos de teclado disponiveis no editor de notas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-2">
          {SHORTCUTS.map((shortcut, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-700/50"
            >
              <span className="text-sm text-gray-300">
                {shortcut.description}
              </span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, j) => (
                  <span key={j}>
                    <kbd className="px-1.5 py-0.5 rounded bg-gray-700 border border-gray-600 text-gray-300 text-xs font-mono">
                      {key}
                    </kbd>
                    {j < shortcut.keys.length - 1 && (
                      <span className="text-gray-500 mx-0.5">+</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
