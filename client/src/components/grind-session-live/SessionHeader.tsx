import { useLocation } from "wouter";
import { ArrowLeft, Pause, Play } from "lucide-react";

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
          <div className="session-timer" id="sessionTimer">
            {sessionElapsedTime || "0h 0m"}
          </div>
          <div className="session-status">
            <div className={`status-dot ${isPaused ? 'bg-amber-400' : ''}`}></div>
            <span id="statusMessage">
              {isPaused ? 'Pausada' : statusMessage}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-note"
            onClick={onOpenQuickNote}
          >
            Nota Rapida
          </button>
          <button
            className="btn btn-break"
            onClick={onOpenBreakDialog}
          >
            Feedback Break
          </button>
          <button
            className="btn btn-breaks-mgmt"
            onClick={onOpenBreakManagement}
            title="Ver historico de breaks"
          >
            Breaks
          </button>
          {/* RF-09: Pause/Resume button */}
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
          <button
            className="btn btn-end"
            onClick={onSessionFinalization}
          >
            Finalizar Sessao
          </button>
        </div>
      </div>
    </div>
  );
}
