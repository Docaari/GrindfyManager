import { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  const [breaksError, setBreaksError] = useState(false);

  const feedbackRef = useRef(feedback);
  feedbackRef.current = feedback;

  // Buscar historico de breaks da sessao atual
  const loadSessionBreaks = async () => {
    try {
      const url = sessionId ? `/api/break-feedbacks?sessionId=${sessionId}` : '/api/break-feedbacks';
      const breaks = await apiRequest("GET", url);
      setSessionBreaks(breaks);
    } catch (error) {
      console.error('Failed to load session breaks:', error);
      setBreaksError(true);
    }
  };

  // Reset feedback when drawer opens
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
      setBreaksError(false);
      loadSessionBreaks();
    }
  }, [isOpen, timeRemaining]);

  // Sistema de shortcuts de teclado
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (isInTextarea) return;

      if (e.key >= '1' && e.key <= '9' && hoveredField) {
        const value = parseInt(e.key);
        setFeedback(prev => ({ ...prev, [hoveredField]: value }));
        e.preventDefault();
      }

      if (e.key === '0' && hoveredField) {
        setFeedback(prev => ({ ...prev, [hoveredField]: 10 }));
        e.preventDefault();
      }

      if (e.key === 'Enter') {
        onSubmit(feedbackRef.current);
        e.preventDefault();
      }

      if (e.key === 'Escape') {
        onClose();
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, isInTextarea, hoveredField, onClose]);

  const updateSliderValue = (key: string, value: number) => {
    setFeedback(prev => ({ ...prev, [key]: value }));
  };

  const getProgressColor = () => {
    if (sessionProgress >= 80) return 'bg-gradient-to-r from-orange-500 to-red-500';
    if (sessionProgress >= 50) return 'bg-gradient-to-r from-yellow-500 to-orange-500';
    return 'bg-gradient-to-r from-green-500 to-yellow-500';
  };

  const handleSubmit = () => {
    onSubmit(feedback);
  };

  const handleEditBreak = (breakFeedback: any) => {
    setShowHistoryPopup(false);
  };

  const handleCloseHistory = () => {
    setShowHistoryPopup(false);
  };

  const getMotivationalMessage = () => {
    const values = [feedback.foco, feedback.energia, feedback.confianca, feedback.inteligenciaEmocional, feedback.interferencias];
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;

    if (average >= 8) return "Voce esta em um estado mental excepcional! Continue assim e mantenha essa energia positiva.";
    if (average >= 6.5) return "Otimo trabalho! Voce esta no caminho certo. Pequenos ajustes podem elevar ainda mais sua performance.";
    if (average >= 5) return "Momento de reset! Algumas respiracoes profundas e voce volta mais forte. Acredite no seu potencial.";
    if (average >= 3) return "Cada break e uma oportunidade de recomecar. Voce tem tudo para reverter este momento.";
    return "Momentos dificeis fazem jogadores fortes. Use este break para se reconectar com seu foco interior.";
  };

  const getSuggestion = () => {
    const lowestValues = [
      { name: 'foco', value: feedback.foco, tip: 'Tente 5 respiracoes profundas para reconectar com o presente' },
      { name: 'energia', value: feedback.energia, tip: 'Hidrate-se e faca alguns alongamentos rapidos' },
      { name: 'confianca', value: feedback.confianca, tip: 'Lembre-se de suas vitorias recentes e decisoes corretas' },
      { name: 'inteligenciaEmocional', value: feedback.inteligenciaEmocional, tip: 'Observe suas emocoes sem julgamento, apenas reconheca-as' },
      { name: 'interferencias', value: feedback.interferencias, tip: 'Organize seu ambiente: feche abas desnecessarias e elimine distracoes' }
    ];

    const lowest = lowestValues.sort((a, b) => a.value - b.value)[0];

    if (lowest.value <= 4) return `Sugestao: ${lowest.tip}`;
    if (lowest.value <= 6) return `Dica: ${lowest.tip}`;
    return "Continue mantendo esse equilibrio mental. Voce esta no controle!";
  };

  // #16: Real snooze - close drawer and reopen after 5 minutes
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup snooze timer on unmount
  useEffect(() => {
    return () => {
      if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
    };
  }, []);

  const handleSnooze = useCallback(() => {
    onClose();
    // Clear any existing snooze timer
    if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
    // Schedule reopen in 5 minutes
    snoozeTimerRef.current = setTimeout(() => {
      onSubmit; // trigger re-render context
      // Reopen the break dialog by calling onClose's parent setter
      // We use a custom event to signal the parent to reopen
      window.dispatchEvent(new CustomEvent('grindfy:snooze-break-reopen'));
    }, 5 * 60 * 1000);
  }, [onClose]);

  return (
    <>
      {/* Item 8: Sheet (drawer) instead of modal overlay */}
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent
          side="right"
          className="bg-gray-900 border-gray-700 text-white w-full sm:max-w-[400px] overflow-y-auto p-6"
        >
          {/* Header */}
          <SheetHeader className="pb-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold text-white flex items-center gap-3">
                <Coffee className="w-6 h-6 text-[#16a249]" />
                Feedback do Break
              </SheetTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistoryPopup(true)}
                className="text-gray-400 hover:text-white hover:bg-gray-800 text-xs"
              >
                <BarChart3 className="w-4 h-4 mr-1" />
                Historico
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  Break {breakNumber} de {totalBreaks}
                </span>
                <span className="text-gray-400">
                  {Math.floor(sessionProgress)}% completo
                </span>
              </div>

              <div className="relative">
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${getProgressColor()}`}
                    style={{ width: `${sessionProgress}%` }}
                  />
                </div>
              </div>
            </div>

            <p className="text-gray-400 mt-2 text-sm">
              Como voce esta se sentindo? Avalie de 1 a 10
            </p>
          </SheetHeader>

          {/* Form */}
          <div className="space-y-4 py-4">
            <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-300 text-center">
                <strong>Shortcuts:</strong> Teclas 1-9,0 para valores rapidos - Enter para salvar - ESC para fechar
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <QuickSlider label="Foco" value={feedback.foco} onChange={(value) => updateSliderValue('foco', value)} icon="target" fieldName="foco" onHover={setHoveredField} isHovered={hoveredField === 'foco'} />
              <QuickSlider label="Energia" value={feedback.energia} onChange={(value) => updateSliderValue('energia', value)} icon="zap" fieldName="energia" onHover={setHoveredField} isHovered={hoveredField === 'energia'} />
              <QuickSlider label="Confianca" value={feedback.confianca} onChange={(value) => updateSliderValue('confianca', value)} icon="heart" fieldName="confianca" onHover={setHoveredField} isHovered={hoveredField === 'confianca'} />
              <QuickSlider label="Inteligencia Emocional" value={feedback.inteligenciaEmocional} onChange={(value) => updateSliderValue('inteligenciaEmocional', value)} icon="users" fieldName="inteligenciaEmocional" onHover={setHoveredField} isHovered={hoveredField === 'inteligenciaEmocional'} />
              <QuickSlider label="Interferencias (0=muitas, 10=nenhuma)" value={feedback.interferencias} onChange={(value) => updateSliderValue('interferencias', value)} icon="volume" fieldName="interferencias" onHover={setHoveredField} isHovered={hoveredField === 'interferencias'} />
            </div>

            {/* Feedback Inteligente */}
            <div className="mt-6 space-y-3">
              <div className="bg-gradient-to-r from-[#16a249]/20 to-green-600/20 border border-[#16a249]/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-[#16a249] rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">?</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-[#16a249] mb-1 text-sm">Feedback Inteligente</h4>
                    <p className="text-sm text-gray-300 leading-relaxed">{getMotivationalMessage()}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-900/20 to-blue-600/20 border border-blue-600/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">!</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-blue-400 mb-1 text-sm">Sugestao Personalizada</h4>
                    <p className="text-sm text-gray-300 leading-relaxed">{getSuggestion()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Textarea */}
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
                placeholder="Como voce esta se sentindo? Alguma observacao importante?"
                maxLength={280}
              />
              <div className="text-right text-xs text-gray-500 mt-1">
                {feedback.notes.length}/280 caracteres
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-3 pt-4 border-t border-gray-700">
            <div className="text-center text-xs text-gray-400">
              {hoveredField ? (
                <span className="text-[#16a249] font-medium">
                  Campo ativo: {hoveredField === 'foco' ? 'Foco' :
                                hoveredField === 'energia' ? 'Energia' :
                                hoveredField === 'confianca' ? 'Confianca' :
                                hoveredField === 'inteligenciaEmocional' ? 'Inteligencia Emocional' :
                                hoveredField === 'interferencias' ? 'Interferencias' : hoveredField}
                  {' '}- Use numeros 1-9,0 para alterar
                </span>
              ) : (
                <span>Passe o mouse sobre um campo para ativar os shortcuts</span>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg"
              >
                {isPending ? "Salvando..." : "Salvar Feedback"}
              </Button>
              <Button
                variant="outline"
                onClick={onSkip}
                className="border-gray-600 text-gray-400 hover:bg-gray-800"
              >
                <SkipForward className="w-4 h-4 mr-1" />
                Pular
              </Button>
            </div>

            <Button
              variant="outline"
              onClick={handleSnooze}
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-800 text-sm"
            >
              <Clock className="w-4 h-4 mr-2" />
              Lembrar em 5min
            </Button>

            <Button
              variant="ghost"
              onClick={onSkipAll}
              className="w-full text-yellow-400 hover:bg-yellow-900/20 text-sm"
            >
              Pular Todos os Breaks Hoje
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Break History Popup */}
      <BreakHistoryPopup
        isOpen={showHistoryPopup}
        onClose={handleCloseHistory}
        onEditBreak={handleEditBreak}
        sessionBreaks={sessionBreaks}
        breaksError={breaksError}
      />
    </>
  );
});

BreakFeedbackPopup.displayName = 'BreakFeedbackPopup';
