// =============================================================================
// ConfidenceBadge — Sprint Coach-1 / RF-03
// Badge visual para tags de confianca emitidas pelo coach.
//
// Spec: docs/specs/coach-sprint-1-fundacao-economica.md (RF-03.2)
// ADR:  Docs/architecture/decisions/022-coach-confidence-tags-inline-vs-structured.md
//
// Cores:
//   - alta:  verde (bg-green-100 text-green-900 border-green-300)
//   - media: azul  (bg-blue-100  text-blue-900  border-blue-300)
//   - baixa: amarelo (bg-yellow-100 text-yellow-900 border-yellow-300)
//   - unknown: cinza (bg-gray-100 text-gray-700 border-gray-300)
// =============================================================================

import * as React from 'react';

export type ConfidenceLevel = 'baixa' | 'media' | 'alta';

export interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  n: number;
  className?: string;
}

export interface UnknownBadgeProps {
  reason: string;
  className?: string;
}

const LEVEL_CLASSES: Record<ConfidenceLevel, string> = {
  alta: 'bg-green-100 text-green-900 border-green-300',
  media: 'bg-blue-100 text-blue-900 border-blue-300',
  baixa: 'bg-yellow-100 text-yellow-900 border-yellow-300',
};

const LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  alta: 'Alta',
  media: 'Media',
  baixa: 'Baixa',
};

export function ConfidenceBadge({ level, n, className }: ConfidenceBadgeProps): JSX.Element {
  // INFO: TypeScript garante que `level` e ConfidenceLevel; sem fallback redundante.
  const levelClasses = LEVEL_CLASSES[level];
  const label = LEVEL_LABELS[level];
  const ariaLabel = `Confianca ${label.toLowerCase()}, N igual a ${n}`;

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${levelClasses}${className ? ' ' + className : ''}`}
    >
      <span>{label}</span>
      <span className="opacity-75">N={n}</span>
    </span>
  );
}

export function UnknownBadge({ reason, className }: UnknownBadgeProps): JSX.Element {
  const ariaLabel = `Nao sei: ${reason}`;

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      title={reason}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium bg-gray-100 text-gray-700 border-gray-300${className ? ' ' + className : ''}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="h-3.5 w-3.5"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM9 9.75a.75.75 0 01.75-.75h.25a.75.75 0 01.75.75v3.25a.75.75 0 01-1.5 0V9.75z"
          clipRule="evenodd"
        />
      </svg>
      <span>Nao sei</span>
      <span className="opacity-75">: {reason}</span>
    </span>
  );
}

export default ConfidenceBadge;
