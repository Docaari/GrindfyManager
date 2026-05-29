/**
 * Sprint Estudos-Fixes — FASE 1 (BUG-1 / GAP-1)
 *
 * ThemeFormDialog — dialog unico para CRIAR e EDITAR temas de estudo.
 *
 * Substitui o fluxo morto `/estudos/temas/novo` (que caia de volta na lista
 * sem form). Presentational + controlled: o parent fornece `onSubmit(data)`
 * (Promise) e controla a mutation (POST create / PUT edit). Mantem o dialog
 * agnostico ao endpoint, testavel via onSubmit mockado.
 *
 * Lessons:
 *   #1  hooks first
 *   #2  data-testid estaveis: theme-form-dialog, theme-form-name,
 *       theme-form-color-{hex}, theme-form-emoji, theme-form-submit
 *   #13 apiRequest retorna JSON parseado (parent trata)
 *
 * Nota: emojis nao podem aparecer literais em arquivos de codigo (regra do
 * projeto / hook block-emojis). Sugestoes sao geradas via String.fromCodePoint.
 */

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

// Paleta canonica (espelha studies-v2/types DEFAULT_THEME_COLORS).
export const THEME_COLORS = [
  '#16a34a',
  '#3b82f6',
  '#ef4444',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
] as const;

// Sugestoes rapidas de emoji (geradas de code points para nao violar a regra
// de "sem emoji literal em codigo"). target, chart, joker, brain, fire, money,
// trending-up, high-voltage.
const EMOJI_SUGGESTIONS = [
  0x1f3af, 0x1f4ca, 0x1f0cf, 0x1f9e0, 0x1f525, 0x1f4b0, 0x1f4c8, 0x26a1,
].map((cp) => String.fromCodePoint(cp));

export interface ThemeFormValues {
  name: string;
  color: string;
  emoji: string;
}

interface ThemeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  /** Valores iniciais (edit) — ignorados em create. */
  initial?: Partial<ThemeFormValues>;
  /** Retorna Promise; dialog mostra loading ate resolver, fecha em sucesso. */
  onSubmit: (values: ThemeFormValues) => Promise<void>;
}

export function ThemeFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
}: ThemeFormDialogProps): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? THEME_COLORS[0]);
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Resync quando reabre com novos initial (edit de tema diferente).
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setColor(initial?.color ?? THEME_COLORS[0]);
      setEmoji(initial?.emoji ?? '');
      setError('');
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.name, initial?.color, initial?.emoji]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Nome do tema é obrigatório.');
      return;
    }
    if (trimmed.length > 50) {
      setError('Nome deve ter no máximo 50 caracteres.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ name: trimmed, color, emoji });
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar tema. Tente novamente.');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent
        data-testid="theme-form-dialog"
        className="sm:max-w-[440px] bg-card border-border"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {emoji && <span className="text-2xl">{emoji}</span>}
            {mode === 'create' ? 'Novo tema de estudo' : 'Editar tema'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Organize suas anotações de poker por tema.'
              : 'Atualize nome, cor ou emoji do tema.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="theme-form-name">Nome</Label>
            <Input
              id="theme-form-name"
              data-testid="theme-form-name"
              value={name}
              autoFocus
              maxLength={50}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) handleSubmit();
              }}
              placeholder="Ex: IP vs BB, 3bet Pot, ICM..."
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {error ? (
                <span data-testid="theme-form-error" className="text-destructive">
                  {error}
                </span>
              ) : (
                <span>{name.length}/50</span>
              )}
            </div>
          </div>

          {/* Cor */}
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {THEME_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid={`theme-form-color-${c}`}
                  aria-label={`Cor ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`h-8 w-8 rounded-full transition-all ${
                    color === c
                      ? 'ring-2 ring-offset-2 ring-offset-card ring-white scale-110'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Emoji */}
          <div className="space-y-2">
            <Label htmlFor="theme-form-emoji">Emoji (opcional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="theme-form-emoji"
                data-testid="theme-form-emoji"
                value={emoji}
                maxLength={4}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="—"
                className="w-20 text-center text-lg"
              />
              <div className="flex flex-wrap gap-1">
                {EMOJI_SUGGESTIONS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    aria-label={`Emoji ${em}`}
                    onClick={() => setEmoji(em)}
                    className={`h-8 w-8 rounded text-lg transition-colors ${
                      emoji === em ? 'bg-accent' : 'hover:bg-accent/50'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            data-testid="theme-form-submit"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Criar tema' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ThemeFormDialog;
