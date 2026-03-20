import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sparkles, Play, Pause, RotateCcw, Volume2, VolumeX, Info } from 'lucide-react';
import type { MeditationTimer } from './types';

interface MeditationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MeditationDialog({ open, onOpenChange }: MeditationDialogProps) {
  const [meditationTimer, setMeditationTimer] = useState<MeditationTimer>({
    duration: 10 * 60,
    timeLeft: 10 * 60,
    isRunning: false,
    isCompleted: false
  });
  const [timerSound, setTimerSound] = useState(true);
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (meditationTimer.isRunning && meditationTimer.timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setMeditationTimer(prev => ({
          ...prev,
          timeLeft: prev.timeLeft - 1
        }));
      }, 1000);
    } else if (meditationTimer.timeLeft === 0 && meditationTimer.isRunning) {
      setMeditationTimer(prev => ({
        ...prev,
        isRunning: false,
        isCompleted: true
      }));
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [meditationTimer.isRunning, meditationTimer.timeLeft]);

  const startTimer = () => setMeditationTimer(prev => ({ ...prev, isRunning: true, isCompleted: false }));
  const pauseTimer = () => setMeditationTimer(prev => ({ ...prev, isRunning: false }));
  const resetTimer = () => setMeditationTimer(prev => ({ ...prev, timeLeft: prev.duration, isRunning: false, isCompleted: false }));
  const setDuration = (minutes: number) => {
    const seconds = minutes * 60;
    setMeditationTimer({ duration: seconds, timeLeft: seconds, isRunning: false, isCompleted: false });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
          <Sparkles className="w-4 h-4 mr-2" />
          Timer Meditação
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-poker-surface border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Timer de Meditação</DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure e inicie sua sessão de meditação
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-white">Duração</Label>
            <div className="flex gap-2 flex-wrap">
              {[3, 6, 12, 18].map(minutes => (
                <Button
                  key={minutes}
                  variant={meditationTimer.duration === minutes * 60 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDuration(minutes)}
                  disabled={meditationTimer.isRunning}
                  className={meditationTimer.duration === minutes * 60 ? "bg-[#16a34a]" : ""}
                >
                  {minutes}min
                </Button>
              ))}
            </div>
          </div>

          <div className="text-center">
            <div className="text-6xl font-bold text-poker-accent mb-2">
              {formatTime(meditationTimer.timeLeft)}
            </div>
            <div className="text-sm text-gray-400">
              {meditationTimer.isCompleted ? 'Meditação concluída!' :
               meditationTimer.isRunning ? 'Meditando...' : 'Pronto para começar'}
            </div>
          </div>

          <div className="flex justify-center gap-2">
            <Button
              onClick={meditationTimer.isRunning ? pauseTimer : startTimer}
              disabled={meditationTimer.timeLeft === 0 && meditationTimer.isCompleted}
              className="bg-green-600 hover:bg-green-700"
            >
              {meditationTimer.isRunning ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              {meditationTimer.isRunning ? 'Pausar' : 'Iniciar'}
            </Button>
            <Button
              variant="outline"
              onClick={resetTimer}
              className="border-gray-600 hover:bg-gray-700"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={timerSound}
                onCheckedChange={setTimerSound}
                id="timer-sound"
              />
              <Label htmlFor="timer-sound" className="text-white">Som de finalização</Label>
            </div>
            <Button
              variant="outline"
              onClick={() => setTimerSound(!timerSound)}
              size="sm"
              className="border-gray-600 hover:bg-gray-700"
            >
              {timerSound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600">
            <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Dicas para Meditar
            </h4>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Encontre um local tranquilo e confortável</li>
              <li>• Mantenha a postura ereta mas relaxada</li>
              <li>• Foque na respiração naturalmente</li>
              <li>• Quando a mente divagar, gentilmente volte ao foco</li>
              <li>• Seja paciente e consistente</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
