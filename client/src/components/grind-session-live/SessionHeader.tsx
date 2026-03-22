import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Pause, Play, MoreVertical, StickyNote, Coffee, History } from "lucide-react";
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
          {/* Item 10: Solid timer bg, paused state with blink */}
          <div className={`session-timer ${isPaused ? 'paused' : ''}`} id="sessionTimer">
            {isPaused && <span className="mr-2" style={{ animation: 'pulse-paused 1.5s ease-in-out infinite' }}>PAUSADO</span>}
            {sessionElapsedTime || "0h 0m"}
          </div>
          <div className="session-status">
            <div className={`status-dot ${isPaused ? 'bg-amber-400' : ''}`}></div>
            <span id="statusMessage">
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
