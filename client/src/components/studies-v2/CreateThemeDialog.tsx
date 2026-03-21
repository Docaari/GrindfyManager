import { useState } from 'react';
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
import { DEFAULT_THEME_COLORS } from './types';

interface CreateThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTheme: (data: { name: string; color: string; emoji: string }) => void;
}

export function CreateThemeDialog({
  open,
  onOpenChange,
  onCreateTheme,
}: CreateThemeDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_THEME_COLORS[0]);
  const [emoji, setEmoji] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Nome do tema e obrigatorio.');
      return;
    }
    if (trimmedName.length > 50) {
      setError('Nome deve ter no maximo 50 caracteres.');
      return;
    }
    onCreateTheme({ name: trimmedName, color, emoji: emoji || '' });
    // Reset form
    setName('');
    setColor(DEFAULT_THEME_COLORS[0]);
    setEmoji('');
    setError('');
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setName('');
      setColor(DEFAULT_THEME_COLORS[0]);
      setEmoji('');
      setError('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px] bg-gray-800 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Novo Tema de Estudo</DialogTitle>
          <DialogDescription className="text-gray-400">
            Crie um tema para organizar suas anotacoes de estudo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="theme-name" className="text-gray-300">
              Nome
            </Label>
            <Input
              id="theme-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder="Ex: IP vs BB, 3bet Pot, ICM..."
              className="bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
              maxLength={50}
              autoFocus
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <Label className="text-gray-300">Cor</Label>
            <div className="flex gap-2">
              {DEFAULT_THEME_COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === c
                      ? 'border-white scale-110'
                      : 'border-transparent hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  type="button"
                />
              ))}
            </div>
          </div>

          {/* Emoji input */}
          <div className="space-y-2">
            <Label htmlFor="theme-emoji" className="text-gray-300">
              Emoji (opcional)
            </Label>
            <Input
              id="theme-emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="Ex: 📊, 🎯, 🃏..."
              className="bg-gray-900 border-gray-600 text-white placeholder:text-gray-500 w-24"
              maxLength={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            className="bg-gray-700 text-white border-gray-600 hover:bg-gray-600"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-[#16a34a] hover:bg-[#16a34a]/90 text-white"
          >
            Criar Tema
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
