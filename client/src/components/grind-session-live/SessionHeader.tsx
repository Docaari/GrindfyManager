import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Pause, Play, MoreVertical, StickyNote, Coffee, History, Headphones } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SessionHeaderProps {
  sessionElapsedTime: string;
  statusMessage: string;
  onOpenQuickNote: () => void;
  onOpenBreakDialog: () => void;
  onSessionFinalization: () => void;
  onOpenBreakManagement: () => void;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  // Sprint Grind-Live Break Auto-Open (RF-01): slot opcional renderizado entre
  // o botao [Breaks] e [Pausar]. Recebe o BreakAutoOpenToggle do parent.
  autoBreakToggleSlot?: ReactNode;
  // Sprint Mini Player 1 / RF-08: botao "Estudar" (headphones) abre o
  // LessonPickerDialog. Quando undefined, o botao nao renderiza (back-compat).
  onOpenLessonPicker?: () => void;
  // Sprint Mini Player 1 / RF-08: pulsa o botao headphones quando ha audio
  // tocando em background.
  isAudioPlaying?: boolean;
}

export default function SessionHeader({
  sessionElapsedTime,
  statusMessage,
  onOpenQuickNote,
  onOpenBreakDialog,
  onSessionFinalization,
  onOpenBreakManagement,
  isPaused = false,
  onPause,
  onResume,
  autoBreakToggleSlot,
  onOpenLessonPicker,
  isAudioPlaying = false,
}: SessionHeaderProps) {
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Item 11: Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        onOpenBreakDialog();
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (isPaused) {
          onResume?.();
        } else {
          onPause?.();
        }
      } else if (e.key === 'Escape') {
        // Escape is handled by individual dialogs
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPaused, onOpenBreakDialog, onPause, onResume]);

  return (
    <div className={`live-header ${isPaused ? 'bg-amber-900/30 border-amber-500/50' : ''}`}>
      <div className="header-content">
        <div className="session-info">
          {/* RF-05: Back navigation */}
          <button
            onClick={() => setLocation('/grind')}
            className="flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-1 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </button>
          <div className="session-title">
            {isPaused ? 'Sessao Pausada' : 'Sessao Ativa'}
          </div>
          {/* GL-I fix (UX-2 2026-04-25): id="sessionTimer"/id="statusMessage"
              removidos. Antes, GrindSessionLive sobrescrevia esses elementos
              via document.getElementById em useEffect — DOM manipulation
              conflitante com props do React. Agora valores vem 100% via
              props (state-based). data-testid mantido para integration tests. */}
          <div
            className={`session-timer ${isPaused ? 'paused' : ''}`}
            data-testid="session-timer"
          >
            {isPaused && <span className="mr-2" style={{ animation: 'pulse-paused 1.5s ease-in-out infinite' }}>PAUSADO</span>}
            {sessionElapsedTime || "0h 0m"}
          </div>
          <div className="session-status">
            <div className={`status-dot ${isPaused ? 'bg-amber-400' : ''}`}></div>
            <span data-testid="session-status-message">
              {isPaused ? 'Pausada' : statusMessage}
            </span>
          </div>
        </div>
        <TooltipProvider delayDuration={300}>
          <div className="header-actions">
            {/* Desktop: show all buttons (hidden on mobile) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="btn btn-note hidden md:inline-flex"
                  onClick={onOpenQuickNote}
                  aria-label="Nota Rapida"
                >
                  Nota Rapida
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Nota Rapida</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="btn btn-break hidden md:inline-flex"
                  onClick={onOpenBreakDialog}
                  aria-label="Feedback Break (B)"
                >
                  Feedback Break
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Feedback Break (B)</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="btn-breaks"
                  className="btn btn-breaks-mgmt hidden md:inline-flex"
                  onClick={onOpenBreakManagement}
                  title="Ver historico de breaks"
                  aria-label="Historico de Breaks"
                >
                  Breaks
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Historico de Breaks</p></TooltipContent>
            </Tooltip>

            {/* Sprint Mini Player 1 / RF-08: botao "Estudar" entre [Breaks] e
                autoBreakToggleSlot. Pulsa quando isAudioPlaying. */}
            {onOpenLessonPicker && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    data-testid="session-header-study-button"
                    className={
                      "btn btn-study hidden md:inline-flex" +
                      (isAudioPlaying ? " animate-pulse pulse-audio" : "")
                    }
                    onClick={onOpenLessonPicker}
                    aria-label="Abrir biblioteca de podcasts"
                  >
                    <Headphones className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p>Estudar enquanto faz grind</p></TooltipContent>
              </Tooltip>
            )}

            {/* Sprint Grind-Live Break Auto-Open (RF-01): toggle clock-aligned
                XX:54/XX:02 BRT. Renderizado pelo parent quando ha sessao ativa. */}
            {autoBreakToggleSlot && (
              <div className="hidden md:inline-flex items-center px-2">
                {autoBreakToggleSlot}
              </div>
            )}

            {/* #12 + #41: Feedback Break always visible on mobile */}
            <button
              className="btn btn-break md:hidden"
              onClick={onOpenBreakDialog}
              aria-label="Feedback Break"
            >
              <Coffee className="w-4 h-4 inline mr-1" />
              Break
            </button>

            {/* Mobile: dropdown for secondary buttons */}
            <div className="md:hidden">
              <Popover open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <PopoverTrigger asChild>
                  <button className="btn btn-note p-2 relative" aria-label="Menu de opcoes">
                    <MoreVertical className="w-5 h-5" />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-52 bg-gray-900 border-gray-700 p-2"
                  align="end"
                >
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 rounded-md transition-colors"
                    onClick={() => { setMobileMenuOpen(false); onOpenQuickNote(); }}
                  >
                    <StickyNote className="w-4 h-4 text-blue-400" />
                    Nota Rapida
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 rounded-md transition-colors"
                    onClick={() => { setMobileMenuOpen(false); onOpenBreakDialog(); }}
                  >
                    <Coffee className="w-4 h-4 text-amber-400" />
                    Feedback Break
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 rounded-md transition-colors"
                    onClick={() => { setMobileMenuOpen(false); onOpenBreakManagement(); }}
                  >
                    <History className="w-4 h-4 text-green-400" />
                    Historico Breaks
                  </button>
                  {/* Sprint Mini Player 1 / RF-08: item "Estudar" no Popover mobile */}
                  {onOpenLessonPicker && (
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 rounded-md transition-colors"
                      onClick={() => { setMobileMenuOpen(false); onOpenLessonPicker(); }}
                    >
                      <Headphones className="w-4 h-4 text-emerald-400" />
                      Estudar
                    </button>
                  )}
                  {/* MEDIUM-1 fix: slot do BreakAutoOpenToggle tambem disponivel
                      no Popover mobile. Mesmo handler/instance que o desktop —
                      parent renderiza apenas uma vez via autoBreakToggleSlot. */}
                  {autoBreakToggleSlot && (
                    <div className="border-t border-gray-700 mt-1 pt-2">
                      <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-200">
                        {autoBreakToggleSlot}
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Pause/Resume - always visible (critical action) */}
            <Tooltip>
              <TooltipTrigger asChild>
                {isPaused ? (
                  <button
                    className="btn btn-note"
                    onClick={onResume}
                    style={{ backgroundColor: '#d97706' }}
                  >
                    <Play className="w-4 h-4 inline mr-1" />
                    Retomar
                  </button>
                ) : (
                  <button
                    data-testid="btn-pausar"
                    className="btn btn-note"
                    onClick={onPause}
                  >
                    <Pause className="w-4 h-4 inline mr-1" />
                    Pausar
                  </button>
                )}
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>{isPaused ? 'Retomar (P)' : 'Pausar (P)'}</p></TooltipContent>
            </Tooltip>

            {/* Finalizar - always visible (critical action) */}
            <button
              className="btn btn-end"
              onClick={onSessionFinalization}
            >
              Finalizar Sessao
            </button>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
