import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Settings } from 'lucide-react';
import type { WarmUpActivity } from './types';

interface CustomizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activities: WarmUpActivity[];
  onUpdateConfig: (activityId: string, field: keyof WarmUpActivity, value: any) => void;
}

export function CustomizationDialog({ open, onOpenChange, activities, onUpdateConfig }: CustomizationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-gray-600 hover:bg-gray-700 text-[#000000] hover:text-white">
          <Settings className="w-4 h-4 mr-2" />
          Personalizar Warm Up
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Personalizar Atividades</DialogTitle>
          <DialogDescription className="text-gray-400">
            Ative ou desative as atividades do checklist de preparação conforme sua preferência.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {activities.map(activity => (
            <div key={activity.id} className="flex items-center justify-between p-4 bg-gray-800/50 rounded border border-gray-600">
              <div className="flex items-center gap-3">
                <activity.icon className="w-5 h-5 text-poker-accent" />
                <div>
                  <div className="font-medium text-white">{activity.name}</div>
                  <div className="text-sm text-gray-400">{activity.points} pontos</div>
                </div>
              </div>
              <Switch
                checked={activity.enabled}
                onCheckedChange={(checked) => onUpdateConfig(activity.id, 'enabled', checked)}
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
