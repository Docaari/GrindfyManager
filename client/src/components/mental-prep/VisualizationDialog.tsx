import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Eye, Play, Pause, ArrowLeft, ArrowRight } from 'lucide-react';
import { visualization6Minutes, visualization12Minutes } from './data';

interface VisualizationDialogProps {
  showSelection: boolean;
  onSelectionChange: (open: boolean) => void;
  showGuide: boolean;
  onGuideChange: (open: boolean) => void;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VisualizationDialog({ showSelection, onSelectionChange, showGuide, onGuideChange }: VisualizationDialogProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [duration, setDuration] = useState<6 | 12>(6);
  const visualizationRef = useRef<NodeJS.Timeout>();

  const currentSteps = duration === 6 ? visualization6Minutes : visualization12Minutes;

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      visualizationRef.current = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      if (currentStep < currentSteps.length - 1) {
        setCurrentStep(prev => prev + 1);
        setTimeLeft(currentSteps[currentStep + 1].duration);
      } else {
        setIsRunning(false);
        setTimeLeft(0);
      }
    }
    return () => {
      if (visualizationRef.current) clearTimeout(visualizationRef.current);
    };
  }, [isRunning, timeLeft, currentStep, currentSteps]);

  const selectDuration = (d: 6 | 12) => {
    setDuration(d);
    setCurrentStep(0);
    setIsRunning(false);
    setTimeLeft(d === 6 ? visualization6Minutes[0].duration : visualization12Minutes[0].duration);
    onSelectionChange(false);
    onGuideChange(true);
  };

  const startVisualization = () => {
    setCurrentStep(0);
    setTimeLeft(currentSteps[0].duration);
    setIsRunning(true);
  };

  return (
    <>
      <Dialog open={showSelection} onOpenChange={onSelectionChange}>
        <DialogTrigger asChild>
          <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
            <Eye className="w-4 h-4 mr-2" />
            Guia Visualização
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px] bg-poker-surface border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Escolha a Duração</DialogTitle>
            <DialogDescription className="text-gray-400">
              Selecione a duração do exercício de visualização
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <Button
                onClick={() => selectDuration(6)}
                className="h-auto p-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold">6min</div>
                  <div className="flex-1">
                    <div className="font-semibold text-lg mb-1">Visualização Rápida</div>
                    <div className="text-sm opacity-90">Preparação essencial com 5 etapas focadas</div>
                  </div>
                </div>
              </Button>
              <Button
                onClick={() => selectDuration(12)}
                className="h-auto p-6 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold">12min</div>
                  <div className="flex-1">
                    <div className="font-semibold text-lg mb-1">Visualização Profunda</div>
                    <div className="text-sm opacity-90">Preparação completa com técnicas avançadas</div>
                  </div>
                </div>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showGuide} onOpenChange={onGuideChange}>
        <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">
              Guia de Visualização - {duration} minutos
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Exercício guiado de visualização para poker
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Progresso</span>
                <span className="text-poker-accent">
                  {currentStep + 1} / {currentSteps.length}
                </span>
              </div>
              <Progress
                value={((currentStep + 1) / currentSteps.length) * 100}
                className="h-2"
              />
            </div>

            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-600 min-h-[200px]">
              <h3 className="text-xl font-semibold text-white mb-3">
                {currentSteps[currentStep]?.title}
              </h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                {currentSteps[currentStep]?.content}
              </p>
              {isRunning && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-poker-accent">
                    {formatTime(timeLeft)}
                  </div>
                  <div className="text-sm text-gray-400">tempo restante</div>
                </div>
              )}
            </div>

            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (currentStep > 0) {
                    setCurrentStep(prev => prev - 1);
                    setTimeLeft(currentSteps[currentStep - 1].duration);
                  }
                }}
                disabled={currentStep === 0}
                className="border-gray-600 hover:bg-gray-700"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Anterior
              </Button>
              <Button
                onClick={isRunning ? () => setIsRunning(false) : startVisualization}
                className="bg-green-600 hover:bg-green-700"
              >
                {isRunning ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {isRunning ? 'Pausar' : 'Iniciar'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (currentStep < currentSteps.length - 1) {
                    setCurrentStep(prev => prev + 1);
                    setTimeLeft(currentSteps[currentStep + 1].duration);
                  }
                }}
                disabled={currentStep === currentSteps.length - 1}
                className="border-gray-600 hover:bg-gray-700"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Próximo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
