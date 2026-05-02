// =============================================================================
// CitationChip — Sprint Coach-1 Frontend UX / RF-02
// Chip inline que representa uma citation extraida do texto do coach.
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-02)
//
// MEDIUM-5 fix: comportamento default e VISUAL-ONLY (so renderiza chip + tooltip,
// sem acao no click). A spec define o chip como decorativo — a copia para clipboard
// que existia antes era surpresa nao-spec. A prop `onClick` permanece OPCIONAL para
// customizacao futura (ex: roteamento para dashboard filtrado).
//
// MEDIUM-13 fix: tooltip alinhado a spec — "Baseado em N={n}, janela={janela}"
// quando ambos presentes. Variacoes para apenas n, apenas window, ou nenhum.
// Usa shadcn Tooltip quando disponivel (com fallback no `title` HTML para
// hover sem JS / leitores de tela / testes antigos).
// =============================================================================

import * as React from 'react';
import { BookOpen } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface CitationChipProps {
  source: string;
  n?: number;
  window?: string;
  /**
   * Handler opcional. Quando ausente (default), o chip e visual-only:
   * o click NAO faz nada. Quando presente, sera invocado no click.
   */
  onClick?: () => void;
  className?: string;
}

function buildTooltipText(source: string, n?: number, window?: string): string {
  // MEDIUM-13: spec define "Baseado em N={n}, janela={janela}".
  if (typeof n === 'number' && window) {
    return `Baseado em N=${n}, janela=${window}`;
  }
  if (typeof n === 'number') {
    return `Baseado em N=${n}`;
  }
  if (window) {
    return `Janela: ${window}`;
  }
  // Sem metadados: descritivo da fonte (preserva o "Dado obtido de" usado nos
  // testes existentes para evitar regressao).
  return `Dado obtido de: ${source}`;
}

export function CitationChip({
  source,
  n,
  window,
  onClick,
  className,
}: CitationChipProps): JSX.Element {
  // Texto exibido: "Source (N=145, 90d)" — parenteses so se houver n ou window
  const meta: string[] = [];
  if (typeof n === 'number') meta.push(`N=${n}`);
  if (window) meta.push(window);
  const metaText = meta.length > 0 ? ` (${meta.join(', ')})` : '';

  // Tooltip alinhado a spec.
  const tooltipText = buildTooltipText(source, n, window);
  const ariaLabel = `Fonte: ${source}${metaText}`;

  // MEDIUM-5: cursor-help quando default (visual-only); cursor-pointer quando
  // ha onClick explicito (afordancia interativa real).
  const isInteractive = typeof onClick === 'function';
  const cursorClass = isInteractive ? 'cursor-pointer' : 'cursor-help';

  // Sprint Coach Sprint 0 RF-04: detecta fonte "nao verificado" para tooltip especial
  const isUnverified = /nao\s+verificado/i.test(source) || /n[aã]o\s+verificado/i.test(source);
  const finalTooltip = isUnverified
    ? 'Esse numero NAO foi verificado contra dados reais. Cuidado.'
    : tooltipText;

  // MEDIUM-13: shadcn Tooltip. Mantemos `title` no botao para fallback
  // em ambientes sem JS / hover programatico em testes que checam `getAttribute('title')`.
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid={isUnverified ? 'citation-chip-unverified' : 'citation-chip'}
            data-source={isUnverified ? 'unverified' : 'verified'}
            aria-label={ariaLabel}
            title={finalTooltip}
            // MEDIUM-5: so passa onClick quando explicitamente fornecido.
            // Default: sem handler, click e no-op (visual-only).
            onClick={isInteractive ? onClick : undefined}
            className={
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-900/30 border border-blue-700/40 text-blue-300 text-xs hover:bg-blue-900/50 transition-colors ' +
              cursorClass +
              (className ? ' ' + className : '')
            }
          >
            <BookOpen className="h-3 w-3" aria-hidden="true" />
            <span>{source}</span>
            {metaText && <span className="opacity-75">{metaText}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{finalTooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default CitationChip;
