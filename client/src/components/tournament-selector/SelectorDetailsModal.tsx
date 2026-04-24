/**
 * Tournament Selector — SelectorDetailsModal
 *
 * Mostra breakdown completo dos 7 sinais de scoring para um torneio:
 * Sinal | ROI bruto | Sample | bucketScore | shrunkScore | Peso | Contribuicao
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { getGradeColor, getGradeLabel } from '../../lib/scoringHelpers';
import type { SelectorTournament, ScoringSignals } from '../../../../shared/scoring';

const SIGNAL_LABEL_PT: Record<keyof ScoringSignals, string> = {
  siteRoi: 'Site',
  buyInRoi: 'Buy-in',
  categoryRoi: 'Categoria',
  speedRoi: 'Velocidade',
  dayOfWeekRoi: 'Dia da semana',
  timeOfDayRoi: 'Horario',
  fieldRoi: 'Field',
};

export interface SelectorDetailsModalProps {
  tournament: SelectorTournament | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function SelectorDetailsModal({ tournament, open, onOpenChange }: SelectorDetailsModalProps) {
  if (!tournament) return null;

  const color = getGradeColor(tournament.grade);
  const signalKeys = Object.keys(tournament.signals) as Array<keyof ScoringSignals>;

  let totalContribution = 0;
  for (const k of signalKeys) {
    const s = tournament.signals[k];
    totalContribution += s.score * s.weight;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="selector-details-modal">
        <DialogHeader>
          <DialogTitle>
            Detalhes do score — {tournament.name}
          </DialogTitle>
          <DialogDescription>
            Score = soma ponderada dos 7 sinais. Cada sinal e ajustado por shrinkage Bayesian
            (K=30) para evitar conclusoes baseadas em poucas amostras.
          </DialogDescription>
        </DialogHeader>

        <div className={`p-3 rounded-lg ${color.bg} ${color.text} text-center mb-4`}>
          <div className="text-3xl font-bold">{tournament.score}</div>
          <div className="text-sm">Grade {tournament.grade} — {getGradeLabel(tournament.grade)}</div>
        </div>

        <Table data-testid="selector-details-table">
          <TableHeader>
            <TableRow>
              <TableHead>Sinal</TableHead>
              <TableHead className="text-right">ROI bruto</TableHead>
              <TableHead className="text-right">Sample</TableHead>
              <TableHead className="text-right">Score (apos shrink)</TableHead>
              <TableHead className="text-right">Peso</TableHead>
              <TableHead className="text-right">Contribuicao</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signalKeys.map((k) => {
              const s = tournament.signals[k];
              const contribution = s.score * s.weight;
              return (
                <TableRow key={k} data-testid={`selector-details-row-${k}`}>
                  <TableCell className="font-medium">{SIGNAL_LABEL_PT[k]}</TableCell>
                  <TableCell className="text-right">{s.value.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{s.sample}</TableCell>
                  <TableCell className="text-right">{s.score}</TableCell>
                  <TableCell className="text-right">{(s.weight * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">{contribution.toFixed(1)}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="font-semibold border-t-2">
              <TableCell>Total</TableCell>
              <TableCell colSpan={4}></TableCell>
              <TableCell className="text-right" data-testid="selector-details-total">
                {totalContribution.toFixed(1)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {tournament.rationale && (
          <p className="text-sm text-muted-foreground italic mt-3">
            {tournament.rationale}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
