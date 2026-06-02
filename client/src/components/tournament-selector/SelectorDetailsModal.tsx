/**
 * Tournament Selector — SelectorDetailsModal
 *
 * Mostra breakdown completo dos 7 sinais de scoring para um torneio:
 * Sinal | ROI bruto | Sample | bucketScore | shrunkScore | Peso | Contribuicao
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
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

// Fase F #12 (ADR-237 D-5) — softness. Modal lista os 6 indicadores
// (batidos destacados + nao-batidos em cinza) + legenda fixa de honestidade.
const SOFTNESS_ALL_INDICATORS: Array<{ key: string; label: string; weak: boolean }> = [
  { key: 'overlay', label: 'Garantido alto vs buy-in', weak: false },
  { key: 'primetime', label: 'Horario nobre', weak: false },
  { key: 'sportsbook', label: 'Rede com sportsbook', weak: true },
  { key: 'satellite', label: 'Satelite / qualifier', weak: true },
  { key: 'multiday', label: 'Multi-day', weak: true },
  { key: 'regional', label: 'Serie regional', weak: true },
];

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

        {/* Fase F #12 (ADR-237 D-5) — secao "Softness do field". Lista os 6
            indicadores (batidos destacados + nao-batidos em cinza) + legenda
            fixa de honestidade. null => "Nao calculado", sem quebrar o modal. */}
        {tournament.softness ? (
          <div data-testid="softness-modal-section" className="mt-4 border-t pt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="text-sm font-medium">Softness do field</h4>
              <span className="text-sm text-muted-foreground">
                Score {tournament.softness.score}/100
              </span>
            </div>
            <ul className="space-y-1">
              {SOFTNESS_ALL_INDICATORS.map((def) => {
                const hit = tournament.softness!.indicators.find((i) => i.key === def.key);
                const matched = !!hit;
                return (
                  <li
                    key={def.key}
                    data-testid={`softness-modal-indicator-${def.key}`}
                    className={`text-sm ${matched ? 'font-medium' : 'text-muted-foreground'}`}
                  >
                    {def.label}
                    {def.weak ? ' *' : ''}
                    {hit?.evidence ? ` — ${hit.evidence}` : ''}
                  </li>
                );
              })}
            </ul>
            <p
              data-testid="softness-modal-legend"
              className="text-xs text-muted-foreground italic mt-2"
            >
              Indicadores marcados com * sao estimados pelo nome do torneio e podem ter
              falsos positivos/negativos.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-4 border-t pt-3">
            Softness do field: nao calculado.
          </p>
        )}

        {/* TS-F polish (UX-2 2026-04-25): explicacao em PT-BR sobre como
            funciona o scoring. Antes, termos como "shrinkage" e "K=30" so
            apareciam no DialogDescription sem contexto. Agora colapsavel e
            opcional para o jogador interessado. */}
        <Accordion
          type="single"
          collapsible
          className="mt-4 border-t pt-3"
          data-testid="selector-details-explainer"
        >
          <AccordionItem value="how-it-works" className="border-0">
            <AccordionTrigger className="text-sm font-medium hover:no-underline py-2">
              Como funciona este score?
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2 pt-1">
              <p>
                O Tournament Selector calcula o ROI do seu historico em <strong>7 dimensoes</strong>{' '}
                (site, buy-in, categoria, velocidade, dia da semana, horario e tamanho do field) e
                cruza com as caracteristicas do torneio que voce esta avaliando.
              </p>
              <p>
                <strong>Score</strong> de cada dimensao = ROI medio dessa fatia do seu historico,
                normalizado para 0-100. Por exemplo: se nos torneios de buy-in $11-21 voce tem ROI
                medio de 25%, o score de "buy-in" sera mais alto do que num intervalo onde voce
                perde dinheiro.
              </p>
              <p>
                <strong>Shrinkage Bayesian (K=30):</strong> quando voce tem poucos torneios em uma
                dimensao especifica (ex: so 3 torneios em horario de madrugada), o sistema "puxa"
                o ROI dessa fatia para o ROI global. Isso evita conclusoes baseadas em amostra
                pequena. Conforme voce joga mais, o efeito de shrink diminui e o score reflete a
                realidade do seu jogo.
              </p>
              <p>
                <strong>Pesos:</strong> cada dimensao contribui de forma diferente para o score
                final. Site e buy-in sao os maiores fatores; horario e dia da semana tem peso
                menor. Os pesos foram calibrados para refletir o que mais impacta o ROI em MTT.
              </p>
              <p>
                <strong>Grade S/A/B/C/D:</strong> S (excelente, 80+), A (otimo, 70-79), B (bom,
                55-69), C (regular, 40-54), D (evitar, &lt;40). Use como guia rapido e abra os
                detalhes para entender o porque.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
