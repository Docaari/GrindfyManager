import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MentalSlider } from '@/components/MentalSlider';
import { Brain } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { MentalState } from './types';
import { getSliderLabels } from '@/lib/mental-slider-helpers';

interface MentalAverages {
  energia: number | null;
  foco: number | null;
  confianca: number | null;
  equilibrio: number | null;
  totalRecords: number;
  source: string | null;
}

interface MentalStateCardProps {
  mentalState: MentalState;
  onMentalStateChange: (state: MentalState) => void;
  mentalScore: number;
}

export function MentalStateCard({ mentalState, onMentalStateChange, mentalScore }: MentalStateCardProps) {
  const { data: averages } = useQuery<MentalAverages>({
    queryKey: ['/api/mental-averages'],
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const energiaLabels = getSliderLabels('energia');
  const focoLabels = getSliderLabels('foco');
  const confiancaLabels = getSliderLabels('confianca');
  const equilibrioLabels = getSliderLabels('equilibrio');

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
            minLabel={energiaLabels.min}
            maxLabel={energiaLabels.max}
            benchmark={averages?.energia}
          />
          <MentalSlider
            label="Foco"
            icon="🎯"
            value={mentalState.foco}
            onChange={(val) => onMentalStateChange({ ...mentalState, foco: val })}
            minLabel={focoLabels.min}
            maxLabel={focoLabels.max}
            benchmark={averages?.foco}
          />
          <MentalSlider
            label="Confiança"
            icon="📈"
            value={mentalState.confianca}
            onChange={(val) => onMentalStateChange({ ...mentalState, confianca: val })}
            minLabel={confiancaLabels.min}
            maxLabel={confiancaLabels.max}
            benchmark={averages?.confianca}
          />
          <MentalSlider
            label="Equilíbrio"
            icon="💜"
            value={mentalState.equilibrio}
            onChange={(val) => onMentalStateChange({ ...mentalState, equilibrio: val })}
            minLabel={equilibrioLabels.min}
            maxLabel={equilibrioLabels.max}
            benchmark={averages?.equilibrio}
          />
        </div>
      </CardContent>
    </Card>
  );
}
