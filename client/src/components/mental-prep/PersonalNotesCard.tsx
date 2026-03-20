import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen } from 'lucide-react';

interface PersonalNotesCardProps {
  notes: string;
  onNotesChange: (notes: string) => void;
}

export function PersonalNotesCard({ notes, onNotesChange }: PersonalNotesCardProps) {
  return (
    <Card className="bg-poker-surface border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-poker-accent" />
          Notas Pessoais
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Registre suas observações antes do grind..."
              maxLength={200}
              className="w-full h-32 p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-poker-accent"
            />
            <div className="absolute bottom-2 right-2 text-xs text-gray-500">
              {notes.length}/200
            </div>
          </div>
          <div className="text-sm text-gray-400">
            Suas observações serão incluídas nos dados de preparação
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
