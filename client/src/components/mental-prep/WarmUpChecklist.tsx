import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle } from 'lucide-react';
import type { WarmUpActivity } from './types';

interface WarmUpChecklistProps {
  activities: WarmUpActivity[];
  onToggleActivity: (activityId: string) => void;
  checklistScore: number;
}

export function WarmUpChecklist({ activities, onToggleActivity, checklistScore }: WarmUpChecklistProps) {
  const enabledActivities = activities.filter(a => a.enabled);
  const completedCount = enabledActivities.filter(a => a.completed).length;

  return (
    <Card className="bg-poker-surface border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-poker-accent" />
          Checklist de Preparação
          <Badge variant="outline" className="ml-auto text-white border-gray-400">
            {completedCount}/{enabledActivities.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Progresso</span>
              <span>{checklistScore}%</span>
            </div>
            <Progress value={checklistScore} className="h-2" />
          </div>

          <div className="grid grid-cols-1 gap-3">
            {enabledActivities.map(activity => (
              <div
                key={activity.id}
                className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                  activity.completed
                    ? 'bg-green-900/20 border-green-600/50 hover:bg-green-900/30'
                    : 'bg-gray-800/50 border-gray-600 hover:bg-gray-800/70'
                }`}
                onClick={() => onToggleActivity(activity.id)}
              >
                <div className="relative">
                  {activity.completed ? (
                    <CheckCircle2 className="w-6 h-6 text-green-400" />
                  ) : (
                    <Circle className="w-6 h-6 text-gray-400" />
                  )}
                </div>
                <activity.icon className={`w-5 h-5 ${activity.completed ? 'text-green-400' : 'text-poker-accent'}`} />
                <div className="flex-1">
                  <div className={`font-medium ${activity.completed ? 'text-green-400' : 'text-white'}`}>
                    {activity.name}
                  </div>
                  <div className="text-sm text-gray-400">
                    {activity.points * activity.weight} pontos
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
