import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Headphones, Music, Play } from 'lucide-react';
import { sampleAudioTracks } from './data';

interface AudioLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AudioLibraryDialog({ open, onOpenChange }: AudioLibraryDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<'motivacional' | 'hipnose' | 'foco'>('motivacional');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
          <Headphones className="w-4 h-4 mr-2" />
          Biblioteca de Áudios
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] bg-poker-surface border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Biblioteca de Áudios</DialogTitle>
          <DialogDescription className="text-gray-400">
            Em breve - Biblioteca de áudios para sua preparação
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['motivacional', 'hipnose', 'foco'] as const).map(category => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="capitalize"
                disabled
              >
                {category}
              </Button>
            ))}
          </div>

          <div className="bg-gray-800/50 rounded-lg p-8 border border-gray-600 text-center">
            <Headphones className="w-16 h-16 mx-auto text-gray-500 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              Biblioteca de Áudios em Desenvolvimento
            </h3>
            <p className="text-gray-400 mb-4">
              Este recurso será disponibilizado em breve. Teremos áudios motivacionais, de hipnose e foco para sua preparação mental.
            </p>
            <div className="text-sm text-gray-500">
              Versão 2.0 - Em breve
            </div>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {sampleAudioTracks
              .filter(track => track.category === selectedCategory)
              .map(track => (
                <div
                  key={track.id}
                  className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-600 opacity-50"
                >
                  <div className="flex-1">
                    <h4 className="font-semibold text-white">{track.title}</h4>
                    <p className="text-sm text-gray-400 mb-1">{track.description}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Music className="w-3 h-3" />
                      {track.duration}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-gray-600 hover:bg-gray-700 text-gray-400"
                      disabled
                    >
                      ⭐
                    </Button>
                    <Button
                      size="sm"
                      className="bg-gray-600 hover:bg-gray-700"
                      disabled
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Reproduzir
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
