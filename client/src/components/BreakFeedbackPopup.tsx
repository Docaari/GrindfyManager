import { useState, useEffect, forwardRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Coffee, Clock, SkipForward, Plus } from 'lucide-react';

interface BreakFeedbackPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: any) => void;
  onSkip: () => void;
  onSkipAll: () => void;
  breakNumber: number;
  totalBreaks: number;
  sessionProgress: number;
  timeRemaining: number;
  isPending?: boolean;
}

export const BreakFeedbackPopup = forwardRef<HTMLDivElement, BreakFeedbackPopupProps>(({
  isOpen,
  onClose,
  onSubmit,
  onSkip,
  onSkipAll,
  breakNumber,
  totalBreaks,
  sessionProgress,
  timeRemaining,
  isPending = false
}, ref) => {
  const [feedback, setFeedback] = useState({
    foco: 5,
    energia: 5,
    confianca: 5,
    inteligenciaEmocional: 5,
    interferencias: 5,
    notes: ''
  });

  const [countdown, setCountdown] = useState(timeRemaining);

  // Formatação do tempo
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Countdown timer
  useEffect(() => {
    if (!isOpen || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, countdown]);

  // Reset feedback when modal opens
  useEffect(() => {
    if (isOpen) {
      setFeedback({
        foco: 5,
        energia: 5,
        confianca: 5,
        inteligenciaEmocional: 5,
        interferencias: 5,
        notes: ''
      });
      setCountdown(timeRemaining);
    }
  }, [isOpen, timeRemaining]);

  // Determinar cor da barra de progresso
  const getProgressColor = () => {
    if (sessionProgress >= 80) return 'bg-gradient-to-r from-orange-500 to-red-500';
    if (sessionProgress >= 50) return 'bg-gradient-to-r from-yellow-500 to-orange-500';
    return 'bg-gradient-to-r from-green-500 to-yellow-500';
  };

  const handleSubmit = () => {
    onSubmit(feedback);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        ref={ref}
        className="break-feedback-popup max-w-lg bg-gray-900 border-gray-700 text-white animate-in fade-in duration-300"
      >
        {/* Header Otimizado com Timer e Progresso */}
        <DialogHeader className="pb-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-3">
              <Coffee className="w-6 h-6 text-[#16a249]" />
              Feedback do Break
            </DialogTitle>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="font-mono text-lg text-[#16a249]">
                {formatTime(countdown)}
              </span>
            </div>
          </div>
          
          {/* Informações da Sessão */}
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">
                Break {breakNumber} de {totalBreaks} • {sessionProgress}% da sessão
              </span>
              <span className="text-gray-400">
                {Math.floor(sessionProgress)}% completo
              </span>
            </div>
            
            {/* Barra de Progresso */}
            <div className="relative">
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${getProgressColor()}`}
                  style={{ width: `${sessionProgress}%` }}
                />
              </div>
            </div>
          </div>
          
          <DialogDescription className="text-gray-400 mt-2">
            Como você está se sentindo neste momento? Avalie de 1 a 10
          </DialogDescription>
        </DialogHeader>

        {/* Placeholder para conteúdo do formulário - será implementado nas próximas etapas */}
        <div className="space-y-4 py-4">
          <div className="text-center text-gray-500">
            <Coffee className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="text-sm">
              Formulário de avaliação será implementado na próxima etapa
            </p>
          </div>
        </div>

        {/* Footer com Botões */}
        <div className="flex flex-col gap-3 pt-4 border-t border-gray-700">
          <div className="flex gap-3">
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 bg-[#16a249] hover:bg-[#14a244] text-white font-semibold shadow-lg"
            >
              {isPending ? "Salvando..." : "Salvar Feedback"}
            </Button>
            <Button
              variant="outline"
              onClick={onSkip}
              className="border-gray-600 text-gray-400 hover:bg-gray-800"
            >
              <SkipForward className="w-4 h-4 mr-2" />
              Pular
            </Button>
          </div>
          
          <Button
            variant="ghost"
            onClick={onSkipAll}
            className="w-full text-yellow-400 hover:bg-yellow-900/20 text-sm"
          >
            Pular Todos os Breaks Hoje
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

BreakFeedbackPopup.displayName = 'BreakFeedbackPopup';