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
import { NOTE_TEMPLATES } from './types';

interface CreateTabDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTab: (name: string, content?: any[]) => void;
}

export function CreateTabDialog({
  open,
  onOpenChange,
  onCreateTab,
}: CreateTabDialogProps) {
  const [name, setName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Nome da aba e obrigatorio.');
      return;
    }
    if (trimmedName.length > 30) {
      setError('Nome deve ter no maximo 30 caracteres.');
      return;
    }

    const template = NOTE_TEMPLATES.find((t) => t.name === selectedTemplate);
    onCreateTab(trimmedName, template?.blocks);

    // Reset form
    setName('');
    setSelectedTemplate('');
    setError('');
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setName('');
      setSelectedTemplate('');
      setError('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px] bg-gray-800 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Nova Aba</DialogTitle>
          <DialogDescription className="text-gray-400">
            Crie uma nova aba para organizar seu conteudo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="tab-name" className="text-gray-300">
              Nome
            </Label>
            <Input
              id="tab-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder="Ex: Boards secos, Multiway..."
              className="bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
              maxLength={30}
              autoFocus
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>

          {/* Template selector */}
          <div className="space-y-2">
            <Label className="text-gray-300">Template (opcional)</Label>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={`text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedTemplate === ''
                    ? 'bg-gray-700 text-white border border-gray-500'
                    : 'bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-500'
                }`}
                onClick={() => setSelectedTemplate('')}
              >
                Vazio
              </button>
              {NOTE_TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  className={`text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedTemplate === template.name
                      ? 'bg-gray-700 text-white border border-gray-500'
                      : 'bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-500'
                  }`}
                  onClick={() => setSelectedTemplate(template.name)}
                >
                  {template.name}
                </button>
              ))}
            </div>
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
            Criar Aba
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
