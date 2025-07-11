import { useState, useEffect, forwardRef } from 'react';
// Removed Dialog imports - using simple modal now
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Coffee, Clock, SkipForward, Plus } from 'lucide-react';
import { QuickSlider } from './QuickSlider';

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
  console.log('BreakFeedbackPopup render - isOpen:', isOpen);
  const [feedback, setFeedback] = useState({
    foco: 5,
    energia: 5,
    confianca: 5,
    inteligenciaEmocional: 5,
    interferencias: 5,
    notes: ''
  });

  const [countdown, setCountdown] = useState(timeRemaining);
  const [isInTextarea, setIsInTextarea] = useState(false);

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

  // Sistema de shortcuts de teclado
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      console.log('Key pressed:', e.key, 'isInTextarea:', isInTextarea);
      
      // Não processar se estiver na textarea
      if (isInTextarea) return;

      // Números 1-9,0 para definir valores
      if (e.key >= '1' && e.key <= '9') {
        const value = parseInt(e.key);
        // Definir valor para todos os sliders
        setFeedback(prev => ({
          ...prev,
          foco: value,
          energia: value,
          confianca: value,
          inteligenciaEmocional: value,
          interferencias: value
        }));
        e.preventDefault();
      }

      // 0 = valor 10
      if (e.key === '0') {
        setFeedback(prev => ({
          ...prev,
          foco: 10,
          energia: 10,
          confianca: 10,
          inteligenciaEmocional: 10,
          interferencias: 10
        }));
        e.preventDefault();
      }

      // Enter para salvar
      if (e.key === 'Enter') {
        console.log('Enter pressed, submitting feedback');
        handleSubmit();
        e.preventDefault();
      }

      // ESC para fechar
      if (e.key === 'Escape') {
        console.log('Escape pressed, closing modal');
        handleClose();
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, isInTextarea, onClose]);

  // Atualizar valor individual do slider
  const updateSliderValue = (key: string, value: number) => {
    setFeedback(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Determinar cor da barra de progresso
  const getProgressColor = () => {
    if (sessionProgress >= 80) return 'bg-gradient-to-r from-orange-500 to-red-500';
    if (sessionProgress >= 50) return 'bg-gradient-to-r from-yellow-500 to-orange-500';
    return 'bg-gradient-to-r from-green-500 to-yellow-500';
  };

  const handleSubmit = () => {
    console.log('BreakFeedbackPopup handleSubmit called');
    onSubmit(feedback);
  };

  const handleClose = () => {
    console.log('BreakFeedbackPopup onClose called');
    onClose();
  };

  // Sistema de Feedback Inteligente - ETAPA 4
  const getMotivationalMessage = () => {
    const values = [
      feedback.foco,
      feedback.energia,
      feedback.confianca,
      feedback.inteligenciaEmocional,
      feedback.interferencias
    ];
    
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    if (average >= 8) {
      return "🔥 Você está em um estado mental excepcional! Continue assim e mantenha essa energia positiva.";
    } else if (average >= 6.5) {
      return "💪 Ótimo trabalho! Você está no caminho certo. Pequenos ajustes podem elevar ainda mais sua performance.";
    } else if (average >= 5) {
      return "⚡ Momento de reset! Algumas respirações profundas e você volta mais forte. Acredite no seu potencial.";
    } else if (average >= 3) {
      return "🎯 Cada break é uma oportunidade de recomeçar. Você tem tudo para reverter este momento.";
    } else {
      return "🌟 Momentos difíceis fazem jogadores fortes. Use este break para se reconectar com seu foco interior.";
    }
  };

  const getSuggestion = () => {
    const lowestValues = [
      { name: 'foco', value: feedback.foco, tip: 'Tente 5 respirações profundas para reconectar com o presente' },
      { name: 'energia', value: feedback.energia, tip: 'Hidrate-se e faça alguns alongamentos rápidos' },
      { name: 'confiança', value: feedback.confianca, tip: 'Lembre-se de suas vitórias recentes e decisões corretas' },
      { name: 'inteligenciaEmocional', value: feedback.inteligenciaEmocional, tip: 'Observe suas emoções sem julgamento, apenas reconheça-as' },
      { name: 'interferencias', value: feedback.interferencias, tip: 'Organize seu ambiente: feche abas desnecessárias e elimine distrações' }
    ];
    
    const lowest = lowestValues.sort((a, b) => a.value - b.value)[0];
    
    if (lowest.value <= 4) {
      return `💡 Sugestão: ${lowest.tip}`;
    } else if (lowest.value <= 6) {
      return `✨ Dica: ${lowest.tip}`;
    } else {
      return "🎯 Continue mantendo esse equilíbrio mental. Você está no controle!";
    }
  };

  // Debug logs
  console.log('BreakFeedbackPopup render - isOpen:', isOpen);
  console.log('BreakFeedbackPopup component props:', { isOpen, breakNumber, totalBreaks });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div 
        ref={ref}
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Otimizado com Timer e Progresso */}
        <div className="pb-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              <Coffee className="w-6 h-6 text-[#16a249]" />
              Feedback do Break
            </h2>
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
          
          <p className="text-gray-400 mt-2">
            Como você está se sentindo neste momento? Avalie de 1 a 10
          </p>
        </div>

        {/* Formulário com QuickSliders */}
        <div className="space-y-4 py-4">
          {/* Shortcuts Info */}
          <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 mb-4">
            <p className="text-xs text-blue-300 text-center">
              <strong>Shortcuts:</strong> Teclas 1-9,0 para valores rápidos • Enter para salvar • ESC para fechar
            </p>
          </div>

          {/* Grid de QuickSliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <QuickSlider
              label="Foco"
              value={feedback.foco}
              onChange={(value) => updateSliderValue('foco', value)}
              icon="target"
            />
            <QuickSlider
              label="Energia"
              value={feedback.energia}
              onChange={(value) => updateSliderValue('energia', value)}
              icon="zap"
            />
            <QuickSlider
              label="Confiança"
              value={feedback.confianca}
              onChange={(value) => updateSliderValue('confianca', value)}
              icon="heart"
            />
            <QuickSlider
              label="Inteligência Emocional"
              value={feedback.inteligenciaEmocional}
              onChange={(value) => updateSliderValue('inteligenciaEmocional', value)}
              icon="users"
            />
            <div className="md:col-span-2">
              <QuickSlider
                label="Interferências (0=muitas, 10=nenhuma)"
                value={feedback.interferencias}
                onChange={(value) => updateSliderValue('interferencias', value)}
                icon="volume"
              />
            </div>
          </div>

          {/* Seção de Feedback Inteligente - ETAPA 4 */}
          <div className="mt-6 space-y-3">
            {/* Mensagem Motivacional */}
            <div className="bg-gradient-to-r from-[#16a249]/20 to-green-600/20 border border-[#16a249]/30 rounded-lg p-4 transition-all duration-300 hover:shadow-lg hover:shadow-[#16a249]/10">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#16a249] rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
                  <span className="text-white font-bold text-sm">💭</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-[#16a249] mb-1 text-sm">Feedback Inteligente</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {getMotivationalMessage()}
                  </p>
                </div>
              </div>
            </div>

            {/* Sugestão Contextual */}
            <div className="bg-gradient-to-r from-blue-900/20 to-blue-600/20 border border-blue-600/30 rounded-lg p-4 transition-all duration-300 hover:shadow-lg hover:shadow-blue-600/10">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
                  <span className="text-white font-bold text-sm">🎯</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-400 mb-1 text-sm">Sugestão Personalizada</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {getSuggestion()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Textarea para notas */}
          <div className="mt-6">
            <Label htmlFor="notes" className="text-sm font-medium text-gray-300 mb-2 block">
              Notas (opcional)
            </Label>
            <Textarea
              id="notes"
              value={feedback.notes}
              onChange={(e) => setFeedback({...feedback, notes: e.target.value})}
              onFocus={() => setIsInTextarea(true)}
              onBlur={() => setIsInTextarea(false)}
              className="bg-gray-800 border-gray-600 text-white min-h-[80px] focus:border-[#16a249] focus:ring-[#16a249]"
              placeholder="Como você está se sentindo? Alguma observação importante?"
              maxLength={280}
            />
            <div className="text-right text-xs text-gray-500 mt-1">
              {feedback.notes.length}/280 caracteres
            </div>
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
      </div>
    </div>
  );
});

BreakFeedbackPopup.displayName = 'BreakFeedbackPopup';