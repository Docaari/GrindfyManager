import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * Re-entry confirmation dialog (ADR-014 / Spec 3).
 *
 * Shown after GG click on a tournament where canReentry(t) is true.
 * FIFO queue semantics handled by parent (GrindSessionLive).
 *
 * ESC / backdrop click is treated as "Nao, GG definitivo" (invariante §7.4).
 */
export interface ReentryConfirmDialogProps {
  open: boolean;
  tournamentName: string;
  buyIn: string;
  currentReentries: number;
  maxReentries: number | null;
  /**
   * GL-G polish (UX-2 2026-04-25): tamanho TOTAL da fila de re-entry
   * pendentes (incluindo este). Quando > 1, exibe badge "+N na fila" no
   * header para o usuario saber quantas decisoes vem pela frente.
   */
  queueSize?: number;
  onConfirmReentry: () => void;
  onConfirmBust: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ReentryConfirmDialog({
  open,
  tournamentName,
  buyIn,
  currentReentries,
  maxReentries,
  queueSize,
  onConfirmReentry,
  onConfirmBust,
  onOpenChange,
}: ReentryConfirmDialogProps) {
  const atMax = maxReentries != null && currentReentries >= maxReentries;
  // GL-G: ha mais decisoes apos esta? (queueSize inclui o atual)
  const remainingInQueue = (queueSize ?? 1) - 1;
  const showQueueBadge = remainingInQueue > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-2 border-amber-500/60 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span className="flex-1">Bustou no {tournamentName}</span>
            {showQueueBadge && (
              <span
                className="text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full px-2 py-0.5"
                data-testid="reentry-queue-badge"
                aria-label={`${remainingInQueue} decisoes na fila`}
              >
                +{remainingInQueue} na fila
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-gray-300">
            Este torneio permite <span className="font-semibold text-amber-400">re-entrada</span>.
            {maxReentries != null && (
              <>
                {' '}Voce ja fez <span className="font-bold">{currentReentries}</span> de{' '}
                <span className="font-bold">{maxReentries}</span> re-entradas permitidas.
              </>
            )}
            {maxReentries == null && (
              <> Re-entradas ilimitadas (<span className="font-bold">{currentReentries}</span> ate agora).</>
            )}
          </p>
          <p className="text-xs text-gray-400">
            Investimento atual: ${buyIn}. Re-entrar adiciona mais ${buyIn} ao total.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={onConfirmReentry}
              disabled={atMax}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold h-12"
              data-testid="reentry-confirm-button"
            >
              <RotateCw className="w-4 h-4 mr-2" />
              Sim, re-entrar
            </Button>
            <Button
              variant="outline"
              onClick={onConfirmBust}
              className="border-gray-600 bg-gray-700 hover:bg-gray-600 text-white h-10"
              data-testid="reentry-bust-button"
            >
              Nao, GG definitivo
            </Button>
          </div>
          {atMax && (
            <p className="text-xs text-red-400 text-center">
              Limite de re-entradas atingido.
            </p>
          )}
          <p className="text-xs text-gray-500 text-center">
            Re-entrar descarta prize/posicao desta tentativa.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ReentryConfirmDialog;
