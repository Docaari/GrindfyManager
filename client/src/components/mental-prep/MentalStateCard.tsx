import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MentalSlider } from '@/components/MentalSlider';
import { Brain } from 'lucide-react';
import type { MentalState } from './types';

interface MentalStateCardProps {
  mentalState: MentalState;
  onMentalStateChange: (state: MentalState) => void;
  mentalScore: number;
}

export function MentalStateCard({ mentalState, onMentalStateChange, mentalScore }: MentalStateCardProps) {
  return (
    <Card className="bg-poker-surface border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Brain className="w-5 h-5 text-poker-accent" />
          Estado Mental
          <Badge variant="outline" className="ml-auto text-white border-gray-400">
            {mentalScore}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <MentalSlider
            label="Energia"
            icon="⚡"
            value={mentalState.energia}
            onChange={(val) => onMentalStateChange({ ...mentalState, energia: val })}
          />
          <MentalSlider
            label="Foco"
            icon="🎯"
            value={mentalState.foco}
            onChange={(val) => onMentalStateChange({ ...mentalState, foco: val })}
          />
          <MentalSlider
            label="Confiança"
            icon="📈"
            value={mentalState.confianca}
            onChange={(val) => onMentalStateChange({ ...mentalState, confianca: val })}
          />
          <MentalSlider
            label="Equilíbrio"
            icon="💜"
            value={mentalState.equilibrio}
            onChange={(val) => onMentalStateChange({ ...mentalState, equilibrio: val })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
