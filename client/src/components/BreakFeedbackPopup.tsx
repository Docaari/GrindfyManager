import { useState, useEffect, forwardRef } from 'react';
// Removed Dialog imports - using simple modal now
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Coffee, Clock, SkipForward, Plus, BarChart3 } from 'lucide-react';
import { QuickSlider } from './QuickSlider';
import { BreakHistoryPopup } from './BreakHistoryPopup';
import { apiRequest } from "@/lib/queryClient";

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
  sessionId?: string;
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
  isPending = false,
  sessionId
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
  const [isInTextarea, setIsInTextarea] = useState(false);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);
  const [sessionBreaks, setSessionBreaks] = useState<any[]>([]);

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

  // Buscar histórico de breaks da sessão atual
  const loadSessionBreaks = async () => {
    try {
      const url = sessionId ? `/api/break-feedbacks?sessionId=${sessionId}` : '/api/break-feedbacks';
      const breaks = await apiRequest("GET", url);
      setSessionBreaks(breaks);
    } catch (error) {
    }
  };

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
      loadSessionBreaks();
    }
  }, [isOpen, timeRemaining]);

  // Sistema de shortcuts de teclado
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      
      // Não processar se estiver na textarea
      if (isInTextarea) return;

      // Números 1-9,0 para definir valores - apenas no campo em hover
      if (e.key >= '1' && e.key <= '9' && hoveredField) {
        const value = parseInt(e.key);
        // Definir valor apenas para o campo em hover
        setFeedback(prev => ({
          ...prev,
          [hoveredField]: value
        }));
        e.preventDefault();
      }

      // 0 = valor 10 - apenas no campo em hover
      if (e.key === '0' && hoveredField) {
        setFeedback(prev => ({
          ...prev,
          [hoveredField]: 10
        }));
        e.preventDefault();
      }

      // Enter para salvar
      if (e.key === 'Enter') {
        handleSubmit();
        e.preventDefault();
      }

      // ESC para fechar
      if (e.key === 'Escape') {
        handleClose();
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, isInTextarea, hoveredField, onClose]);

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
    onSubmit(feedback);
  };

  const handleClose = () => {
    onClose();
  };

  const handleEditBreak = (breakFeedback: any) => {
    setShowHistoryPopup(false);
  };

  const handleCloseHistory = () => {
    setShowHistoryPopup(false);
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
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistoryPopup(true)}
                className="text-gray-400 hover:text-white hover:bg-gray-800 text-xs"
              >
                <BarChart3 className="w-4 h-4 mr-1" />
                Histórico
              </Button>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="font-mono text-lg text-[#16a249]">
                  {formatTime(countdown)}
                </span>
              </div>
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
              fieldName="foco"
              onHover={setHoveredField}
              isHovered={hoveredField === 'foco'}
            />
            <QuickSlider
              label="Energia"
              value={feedback.energia}
              onChange={(value) => updateSliderValue('energia', value)}
              icon="zap"
              fieldName="energia"
              onHover={setHoveredField}
              isHovered={hoveredField === 'energia'}
            />
            <QuickSlider
              label="Confiança"
              value={feedback.confianca}
              onChange={(value) => updateSliderValue('confianca', value)}
              icon="heart"
              fieldName="confianca"
              onHover={setHoveredField}
              isHovered={hoveredField === 'confianca'}
            />
            <QuickSlider
              label="Inteligência Emocional"
              value={feedback.inteligenciaEmocional}
              onChange={(value) => updateSliderValue('inteligenciaEmocional', value)}
              icon="users"
              fieldName="inteligenciaEmocional"
              onHover={setHoveredField}
              isHovered={hoveredField === 'inteligenciaEmocional'}
            />
            <div className="md:col-span-2">
              <QuickSlider
                label="Interferências (0=muitas, 10=nenhuma)"
                value={feedback.interferencias}
                onChange={(value) => updateSliderValue('interferencias', value)}
                icon="volume"
                fieldName="interferencias"
                onHover={setHoveredField}
                isHovered={hoveredField === 'interferencias'}
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

        {/* Footer Dinâmico */}
        <div className="flex flex-col gap-3 pt-4 border-t border-gray-700">
          {/* Indicador de Campo Ativo */}
          <div className="text-center text-xs text-gray-400">
            {hoveredField ? (
              <span className="text-[#16a249] font-medium">
                Campo ativo: {hoveredField === 'foco' ? 'Foco' : 
                              hoveredField === 'energia' ? 'Energia' : 
                              hoveredField === 'confianca' ? 'Confiança' : 
                              hoveredField === 'inteligenciaEmocional' ? 'Inteligência Emocional' : 
                              hoveredField === 'interferencias' ? 'Interferências' : hoveredField}
                {' '}• Use números 1-9,0 para alterar
              </span>
            ) : (
              <span>Passe o mouse sobre um campo para ativar os shortcuts</span>
            )}
          </div>
          
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
      
      {/* Break History Popup */}
      <BreakHistoryPopup
        isOpen={showHistoryPopup}
        onClose={handleCloseHistory}
        onEditBreak={handleEditBreak}
        sessionBreaks={sessionBreaks}
      />
    </div>
  );
});

BreakFeedbackPopup.displayName = 'BreakFeedbackPopup';