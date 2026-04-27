import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Headphones } from 'lucide-react';

interface AudioLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AudioLibraryDialog({ open, onOpenChange }: AudioLibraryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border hover:bg-accent text-foreground">
          <Headphones className="w-4 h-4 mr-2" />
          Biblioteca de Audios
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-poker-surface border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Biblioteca de Audios</DialogTitle>
          <DialogDescription className="text-gray-400">
            Audios para preparacao mental
          </DialogDescription>
        </DialogHeader>
        <div className="bg-gray-800/50 rounded-lg p-8 border border-gray-600 border-dashed text-center">
          <Headphones className="w-12 h-12 mx-auto text-gray-500 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Em Desenvolvimento
          </h3>
          <p className="text-gray-400 text-sm">
            Audios motivacionais, de hipnose e foco para sua preparacao mental serao disponibilizados em breve.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
