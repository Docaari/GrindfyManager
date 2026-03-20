import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Target } from 'lucide-react';
import type { WarmUpStats } from './types';

interface GoalsCardProps {
  finalScore: number;
  stats: WarmUpStats;
}

export function GoalsCard({ finalScore, stats }: GoalsCardProps) {
  const targetScore = 80;
  const targetConsistency = 7;
  const focusAreas = ['Meditação', 'Visualização'];

  return (
    <Card className="bg-poker-surface border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Target className="w-5 h-5 text-poker-accent" />
          Metas Pessoais
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-white text-sm">Score Alvo</Label>
              <span className="text-poker-accent font-bold">{targetScore}%</span>
            </div>
            <div className="relative w-full h-2 bg-gray-700 rounded-full">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-poker-accent to-green-400 rounded-full transition-all duration-200"
                style={{ width: `${Math.min(100, (finalScore / targetScore) * 100)}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-white text-sm">Consistência</Label>
              <span className="text-poker-accent font-bold">{stats.currentStreak}/{targetConsistency}</span>
            </div>
            <div className="relative w-full h-2 bg-gray-700 rounded-full">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-200"
                style={{ width: `${(stats.currentStreak / targetConsistency) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white text-sm">Áreas de Foco</Label>
            <div className="flex flex-wrap gap-2">
              {focusAreas.map((area, index) => (
                <Badge key={index} variant="outline" className="text-poker-accent border-poker-accent">
                  {area}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
