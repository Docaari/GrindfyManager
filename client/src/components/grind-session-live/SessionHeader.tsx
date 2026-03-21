interface SessionHeaderProps {
  sessionElapsedTime: string;
  statusMessage: string;
  onOpenQuickNote: () => void;
  onOpenBreakDialog: () => void;
  onSessionFinalization: () => void;
  onOpenBreakManagement: () => void;
}

export default function SessionHeader({
  sessionElapsedTime,
  statusMessage,
  onOpenQuickNote,
  onOpenBreakDialog,
  onSessionFinalization,
  onOpenBreakManagement,
}: SessionHeaderProps) {
  return (
    <div className="live-header">
      <div className="header-content">
        <div className="session-info">
          <div className="session-title">🔥 Sessao Ativa</div>
          <div className="session-timer" id="sessionTimer">
            {sessionElapsedTime || "0h 0m"}
          </div>
          <div className="session-status">
            <div className="status-dot"></div>
            <span id="statusMessage">
              {statusMessage}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-note"
            onClick={onOpenQuickNote}
          >
            📝 Nota Rapida
          </button>
          <button
            className="btn btn-break"
            onClick={onOpenBreakDialog}
          >
            ☕ Feedback Break
          </button>
          <button
            className="btn btn-breaks-mgmt"
            onClick={onOpenBreakManagement}
            title="Ver historico de breaks"
          >
            📋 Breaks
          </button>
          <button
            className="btn btn-end"
            onClick={onSessionFinalization}
          >
            ⏹ Finalizar Sessao
          </button>
        </div>
      </div>
    </div>
  );
}
