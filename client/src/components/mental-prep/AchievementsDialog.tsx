import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy } from 'lucide-react';
import type { Achievement } from './types';

interface AchievementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  achievements: Achievement[];
}

export function AchievementsDialog({ open, onOpenChange, achievements }: AchievementsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-gray-600 hover:bg-gray-700 text-[#000000] hover:text-white">
          <Trophy className="w-4 h-4 mr-2" />
          Conquistas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            Conquistas e Gamificação
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Acompanhe seu progresso e desbloqueie conquistas especiais
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
          {achievements.map(achievement => {
            const Icon = achievement.icon;
            const progressPercentage = Math.min((achievement.progress / achievement.requirement) * 100, 100);

            return (
              <div
                key={achievement.id}
                className={`p-4 rounded-lg border ${
                  achievement.completed
                    ? 'bg-yellow-900/20 border-yellow-600/50'
                    : 'bg-gray-800/50 border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon className={`w-6 h-6 ${achievement.completed ? 'text-yellow-400' : 'text-gray-400'}`} />
                  <div className="flex-1">
                    <h3 className={`font-semibold ${achievement.completed ? 'text-yellow-400' : 'text-white'}`}>
                      {achievement.title}
                      {achievement.completed && <span className="ml-2 text-xs">✓</span>}
                    </h3>
                    <p className="text-sm text-gray-400">{achievement.description}</p>
                  </div>
                  <Badge variant={achievement.completed ? "default" : "outline"} className="text-xs">
                    {achievement.type}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Progresso</span>
                    <span>{achievement.progress}/{achievement.requirement}</span>
                  </div>
                  <Progress value={progressPercentage} className="h-2" />
                  {achievement.completed && achievement.unlockedAt && (
                    <div className="text-xs text-yellow-400">
                      Desbloqueado em {achievement.unlockedAt.toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
