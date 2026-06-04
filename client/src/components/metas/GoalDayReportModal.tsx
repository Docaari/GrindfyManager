// =============================================================================
// GoalDayReportModal — relatorio do dia no calendario de metas (ADR-241).
//
// Carrega GET /api/goals/daily-logs/:date (log + metas ativas no dia). Form:
// medidas de direcao exercidas (checkbox + valor) + nota + nº torneios +
// horas/conteudo de estudo + aprendizado + o que fez de bom/ruim. Salva via
// PUT /api/goals/daily-logs/:date e invalida o cache do mes (lesson #21).
// RF-06: nenhum campo de P&L.
// =============================================================================

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ActiveGoal {
  id: string;
  kind: "measure" | "wig";
  title: string;
  sourceMetric?: string | null;
  cadence?: string | null;
  unit?: string | null;
  target?: number | null;
}

interface DailyLog {
  id?: string;
  logDate?: string;
  measuresExercised?: Array<{ measureId: string; value?: number | null }> | null;
  note?: string | null;
  tournamentsPlayed?: number | null;
  studyHours?: number | null;
  studyContent?: string | null;
  learning?: string | null;
  didGood?: string | null;
  didBad?: string | null;
}

interface DayResponse {
  date: string;
  log: DailyLog | null;
  activeGoals: ActiveGoal[];
}

interface GoalDayReportModalProps {
  date: string | null; // YYYY-MM-DD; null = fechado
  onClose: () => void;
}

function numOrNull(v: string): number | null {
  const cleaned = v.trim().replace(",", "."); // virgula decimal PT-BR -> ponto
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function GoalDayReportModal({ date, onClose }: GoalDayReportModalProps) {
  const open = Boolean(date);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<DayResponse>({
    queryKey: ["/api/goals/daily-logs", date],
    queryFn: async () => (await apiRequest("GET", `/api/goals/daily-logs/${date}`)) as DayResponse,
    enabled: open,
    retry: false,
  });

  // Estado local do form (hidratado do fetch).
  const [exercised, setExercised] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [tournaments, setTournaments] = useState("");
  const [studyHours, setStudyHours] = useState("");
  const [studyContent, setStudyContent] = useState("");
  const [learning, setLearning] = useState("");
  const [didGood, setDidGood] = useState("");
  const [didBad, setDidBad] = useState("");

  useEffect(() => {
    if (!data) return;
    const log = data.log;
    const ex: Record<string, boolean> = {};
    (log?.measuresExercised ?? []).forEach((m) => {
      if (m?.measureId) ex[m.measureId] = true;
    });
    setExercised(ex);
    setNote(log?.note ?? "");
    setTournaments(log?.tournamentsPlayed != null ? String(log.tournamentsPlayed) : "");
    setStudyHours(log?.studyHours != null ? String(log.studyHours) : "");
    setStudyContent(log?.studyContent ?? "");
    setLearning(log?.learning ?? "");
    setDidGood(log?.didGood ?? "");
    setDidBad(log?.didBad ?? "");
  }, [data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const measuresExercised = (data?.activeGoals ?? [])
        .filter((g) => g.kind === "measure" && exercised[g.id])
        .map((g) => ({ measureId: g.id, sourceMetric: g.sourceMetric ?? undefined }));
      const payload = {
        measuresExercised,
        note: note.trim() || null,
        tournamentsPlayed: numOrNull(tournaments),
        studyHours: numOrNull(studyHours),
        studyContent: studyContent.trim() || null,
        learning: learning.trim() || null,
        didGood: didGood.trim() || null,
        didBad: didBad.trim() || null,
      };
      return await apiRequest("PUT", `/api/goals/daily-logs/${date}`, payload);
    },
    onSuccess: () => {
      // Invalida o mes (prefixo /api/goals/daily-logs) + o dia + placar + streak.
      queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("/api/goals/daily-logs"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/goals/scoreboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/goals/consistency"] });
      // M10 — micro-celebracao do processo (sem P&L).
      const checked = (data?.activeGoals ?? []).filter((g) => g.kind === "measure" && exercised[g.id]).length;
      toast({
        title: checked > 0 ? "Dia registrado — processo em dia!" : "Relatorio do dia salvo.",
        description: checked > 0 ? `${checked} medida(s) de direcao marcada(s). Consistencia e o jogo.` : undefined,
      });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    },
  });

  const activeMeasures = (data?.activeGoals ?? []).filter((g) => g.kind === "measure");

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" data-testid="goal-day-report-modal">
        <DialogHeader>
          <DialogTitle>Relatorio do dia {date}</DialogTitle>
          <DialogDescription>
            Foco no processo, sem resultado financeiro. Registre o que voce controlou.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-sm text-muted-foreground" data-testid="goal-day-report-loading">
            Carregando...
          </div>
        ) : (
          <div className="space-y-5">
            {/* Secao 1 — Medidas de direcao (o que importa: destaque). */}
            <div className="rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-3">
              <Label className="text-sm font-semibold text-foreground">Medidas de direcao exercidas hoje</Label>
              {activeMeasures.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Nenhuma medida ativa neste dia.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {activeMeasures.map((g) => (
                    <label
                      key={g.id}
                      className="flex items-center gap-2 text-sm"
                      data-testid={`goal-day-measure-${g.id}`}
                    >
                      <Checkbox
                        checked={!!exercised[g.id]}
                        onCheckedChange={(v) =>
                          setExercised((prev) => ({ ...prev, [g.id]: Boolean(v) }))
                        }
                      />
                      <span>
                        {g.title}
                        {g.cadence ? (
                          <span className="text-muted-foreground"> ({g.cadence})</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Secao 2 — Volume & estudo. */}
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Volume & estudo</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="day-tournaments">Torneios jogados</Label>
                <Input
                  id="day-tournaments"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={tournaments}
                  onChange={(e) => setTournaments(e.target.value)}
                  data-testid="goal-day-tournaments"
                />
              </div>
              <div>
                <Label htmlFor="day-study-hours">Horas de estudo</Label>
                <Input
                  id="day-study-hours"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.5"
                  value={studyHours}
                  onChange={(e) => setStudyHours(e.target.value)}
                  data-testid="goal-day-study-hours"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="day-study-content">Conteudo estudado</Label>
              <Input
                id="day-study-content"
                value={studyContent}
                onChange={(e) => setStudyContent(e.target.value)}
                placeholder="Ex: ICM final table, ranges 3-bet pot"
                data-testid="goal-day-study-content"
              />
            </div>

            {/* Secao 3 — Reflexao. */}
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reflexao do dia</p>
            <div>
              <Label htmlFor="day-note">Nota do dia</Label>
              <Textarea
                id="day-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid="goal-day-note"
              />
            </div>

            <div>
              <Label htmlFor="day-learning">Aprendizado do dia</Label>
              <Textarea
                id="day-learning"
                rows={2}
                value={learning}
                onChange={(e) => setLearning(e.target.value)}
                data-testid="goal-day-learning"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="day-good">O que fiz de bom</Label>
                <Textarea
                  id="day-good"
                  rows={2}
                  value={didGood}
                  onChange={(e) => setDidGood(e.target.value)}
                  data-testid="goal-day-good"
                />
              </div>
              <div>
                <Label htmlFor="day-bad">O que fiz de ruim</Label>
                <Textarea
                  id="day-bad"
                  rows={2}
                  value={didBad}
                  onChange={(e) => setDidBad(e.target.value)}
                  data-testid="goal-day-bad"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || isLoading}
            data-testid="goal-day-save"
          >
            {mutation.isPending ? "Salvando..." : "Salvar relatorio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default GoalDayReportModal;
