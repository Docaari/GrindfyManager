/**
 * PhysicalSetupBlock — Sprint W-1 (RF-08, T-10) — Reformado warm-up reform 2026-05-05.
 *
 * Bloco 1 (era 4): Setup fisico. Items custom (localStorage), min 3 marcados
 * para avancar. Botao "Editar lista" abre modal add/edit/remove items.
 * NAO conta no timer global (timer so inicia em Respiracao).
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useSetupItems } from "@/hooks/useSetupItems";
import { DEFAULT_SETUP_ITEMS } from "./setupItemsStore";

const MIN_CHECKED = 3;

export interface PhysicalSetupBlockProps {
  onAdvance: (payload: {
    setupItems: Record<string, boolean>;
    setupItemsList: string[];
  }) => void;
}

export function PhysicalSetupBlock({ onAdvance }: PhysicalSetupBlockProps) {
  const { items, save } = useSetupItems();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [editorOpen, setEditorOpen] = useState(false);

  const checkedCount = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked],
  );
  const canAdvance = checkedCount >= MIN_CHECKED;

  const toggle = (label: string) => {
    setChecked((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleAdvance = () => {
    onAdvance({
      setupItems: checked,
      setupItemsList: items,
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto px-4">
      <header className="text-center space-y-1">
        <h2 className="text-2xl font-bold">Setup fisico</h2>
        <p className="text-sm text-muted-foreground">
          Cada friccao evitada agora e um glitch a menos daqui a 2 horas
        </p>
      </header>

      <ul className="space-y-2">
        {items.map((label, idx) => {
          const id = `setup-item-${idx}`;
          return (
            <li key={`${idx}-${label}`} className="flex items-center gap-2">
              <Checkbox
                id={id}
                data-testid={id}
                checked={!!checked[label]}
                onCheckedChange={() => toggle(label)}
              />
              <label htmlFor={id} className="text-sm flex-1">
                {label}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          Minimo {MIN_CHECKED} para avancar. ({checkedCount}/{items.length})
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditorOpen(true)}
          data-testid="setup-edit-list"
        >
          <Pencil className="h-3 w-3 mr-1" />
          Editar lista
        </Button>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          data-testid="setup-advance"
          onClick={handleAdvance}
          disabled={!canAdvance}
        >
          Proximo
        </Button>
      </div>

      <SetupEditorDialog
        open={editorOpen}
        items={items}
        onOpenChange={setEditorOpen}
        onSave={async (next) => {
          await save(next);
          // remove checks de items que sumiram
          setChecked((prev) => {
            const out: Record<string, boolean> = {};
            for (const label of next) {
              if (prev[label]) out[label] = true;
            }
            return out;
          });
        }}
      />
    </div>
  );
}

interface SetupEditorDialogProps {
  open: boolean;
  items: string[];
  onOpenChange: (v: boolean) => void;
  onSave: (items: string[]) => void | Promise<void>;
}

function SetupEditorDialog({ open, items, onOpenChange, onSave }: SetupEditorDialogProps) {
  const [draft, setDraft] = useState<string[]>(items);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(items);
      setNewItem("");
    }
  }, [open, items]);

  const updateAt = (idx: number, value: string) => {
    setDraft((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const removeAt = (idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    const v = newItem.trim();
    if (!v) return;
    setDraft((prev) => [...prev, v]);
    setNewItem("");
  };

  const restoreDefaults = () => {
    setDraft(DEFAULT_SETUP_ITEMS.slice());
  };

  const handleSave = async () => {
    const cleaned = draft.map((s) => s.trim()).filter((s) => s.length > 0);
    await onSave(cleaned.length > 0 ? cleaned : DEFAULT_SETUP_ITEMS.slice());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Editar checklist do Setup Fisico</DialogTitle>
          <DialogDescription>
            Adicione, edite ou remova itens. Minimo 3 marcados ainda eh exigido para avancar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
          {draft.map((value, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={value}
                onChange={(e) => updateAt(idx, e.target.value)}
                maxLength={120}
                className="flex-1 rounded-md border px-3 py-2 text-sm bg-background"
                data-testid={`setup-edit-input-${idx}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeAt(idx)}
                data-testid={`setup-edit-remove-${idx}`}
                aria-label={`Remover ${value}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t">
          <input
            type="text"
            placeholder="Novo item..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            maxLength={120}
            className="flex-1 rounded-md border px-3 py-2 text-sm bg-background"
            data-testid="setup-edit-new-input"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            disabled={newItem.trim().length === 0}
            data-testid="setup-edit-add"
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>

        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={restoreDefaults}
            data-testid="setup-edit-restore"
          >
            Restaurar padroes
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} data-testid="setup-edit-save">
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
