import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest } from "@/lib/queryClient";
import { Play, Plus, Clock, Target, Coffee, ChevronDown, ChevronUp, Trophy, AlertTriangle, RefreshCw, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BreakFeedbackPopup } from "@/components/BreakFeedbackPopup";
import SupremaImportModal from "@/components/SupremaImportModal";
import { buildSupremaMatchKey, buildSupremaMatchKeysFromSession } from "@/lib/supremaDedupe";
import EpicStartSessionModal from "@/components/grind-session/EpicStartSessionModal";
import { Download, X } from "lucide-react";
import { LateRegAlertManager } from "@/lib/lateRegAlerts";
import { getBreakFrequency, shouldTriggerBreak, getBreakCountdownMinutes, canSnoozeBreak, getSnoozeOptions, calculateNextBreakTime } from "@/components/grind-session/break-notification-helpers";
import { getHistoricalAverages, distributeQuickFeedback } from "@/components/grind-session/quick-feedback-helpers";
import { calculateLateRegDeadline, resolveAlertThreshold } from "@/lib/lateRegUtils";
import { SessionAlertManager } from "@shared/generic-alerts";
import type { SessionAlert } from "@shared/generic-alerts";
import { fireAlert } from "@/lib/fireAlert";

// Sub-components
import SessionHeader from "@/components/grind-session-live/SessionHeader";
import SessionDashboard from "@/components/grind-session-live/SessionDashboard";
import AddTournamentDialog from "@/components/grind-session-live/AddTournamentDialog";
import TournamentCard from "@/components/grind-session-live/TournamentCard";
import SessionSummaryModal from "@/components/grind-session-live/SessionSummaryModal";
import EditTournamentDialog from "@/components/grind-session-live/EditTournamentDialog";
import TimeEditDialog from "@/components/grind-session-live/TimeEditDialog";
import AlertsPanel from "@/components/grind-session-live/AlertsPanel";
import ReentryConfirmDialog from "@/components/grind-session-live/ReentryConfirmDialog";

// Bankroll (RF-08)
import { useBankroll } from "@/hooks/useBankroll";
import {
  decideBankrollAction,
  shouldWarnAccumulator,
  normalizeBuyInToUSD as normalizeBuyInToUSDPure,
  SESSION_BANKROLL_WARNING_PCT,
  shouldWarnForTier,
} from "@/lib/bankrollGrindHelpers";

// Types, helpers, and stats
import type { GrindSession, NewTournamentForm, RegistrationData, QuickNote } from "@/components/grind-session-live/types";
import {
  normalizeDecimalInput, generateTournamentName, parseTime,
  organizeTournaments, organizeTournamentsByBreaks, combineTournaments,
  getSiteColor,
  shouldShowReentryModal, buildReentryPayload,
  resolveAddonReaPayload,
  type ReentryQueueState,
} from "@/components/grind-session-live/helpers";
import { calculateSessionStats, calculateFinalSessionStats, calculateBreakAverages, calculateTournamentPercentages } from "@/components/grind-session-live/calculateSessionStats";
import {
  getPendingTournamentsForSessionEnd,
  formatPendingTournamentLabel,
} from "@/components/grind-session-live/session-end-helpers";
import {
  captureFinishSnapshot,
  buildUndoFinishPayload,
  UNDO_FINISH_TOAST_DURATION_MS,
} from "@/components/grind-session-live/finish-undo-helpers";
import { WalletReconciliationDialog } from "@/components/grind-session-live/WalletReconciliationDialog";
import { runSessionEndFlow } from "@/components/grind-session-live/session-end-flow";

export default function GrindSessionLive() {
  const [, setLocation] = useLocation();
  const [activeSession, setActiveSession] = useState<GrindSession | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [showAddTournamentDialog, setShowAddTournamentDialog] = useState(false);
  const [showSupremaModal, setShowSupremaModal] = useState(false);

  // RF-01: Session recovery banner
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);

  // RF-08: Tournament search
  const [tournamentSearch, setTournamentSearch] = useState("");

  // Item 15: Bulk selection
  const [selectedTournaments, setSelectedTournaments] = useState<Set<string>>(new Set());

  // Item 19: Site filter
  const [siteFilter, setSiteFilter] = useState<string>("all");

  // RF-09: Pause session
  const [isPaused, setIsPaused] = useState(false);
  const [pausedTime, setPausedTime] = useState(0); // total ms paused
  const [pauseStartTime, setPauseStartTime] = useState<number | null>(null);

  const [sessionObjectiveCompleted, setSessionObjectiveCompleted] = useState(false);
  const [sessionFinalNotes, setSessionFinalNotes] = useState("");
  const [showCompletedTournaments, setShowCompletedTournaments] = useState(false);
  const [preparationPercentage, setPreparationPercentage] = useState<number[]>([50]);
  const [preparationObservations, setPreparationObservations] = useState("");
  const [dailyGoals, setDailyGoals] = useState("");
  const [screenCap, setScreenCap] = useState<number>(10);
  const [skipBreaksToday, setSkipBreaksToday] = useState(false);

  // Break banner state (FP-07: non-blocking break system)
  const [showBreakBanner, setShowBreakBanner] = useState(false);
  const [breakBannerActive, setBreakBannerActive] = useState(false); // countdown reached 0
  const [breakSnoozeCount, setBreakSnoozeCount] = useState(0);
  const [nextBreakTimeMin, setNextBreakTimeMin] = useState<number | null>(null);
  const [breakCountdown, setBreakCountdown] = useState(0);
  const [quickFeedbackMode, setQuickFeedbackMode] = useState(true);
  const [quickFeedbackScore, setQuickFeedbackScore] = useState(5);

  // Inline result fields
  const [registrationData, setRegistrationData] = useState<RegistrationData>({});

  // Quick notes
  const [showQuickNotesDialog, setShowQuickNotesDialog] = useState(false);
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [quickNoteText, setQuickNoteText] = useState('');

  // Max late toggle
  const [maxLateStates, setMaxLateStates] = useState<{[key: string]: boolean}>({});

  // RF-10: Late reg alert manager
  const alertManagerRef = useRef(new LateRegAlertManager());

  // Generic alerts manager (manual/custom alerts)
  const sessionAlertManagerRef = useRef(new SessionAlertManager());
  const [genericAlerts, setGenericAlerts] = useState<SessionAlert[]>([]);
  const [firedGenericAlerts, setFiredGenericAlerts] = useState<SessionAlert[]>([]);
  const [activeAlertCount, setActiveAlertCount] = useState(0);

  // Session finalization
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionSummaryData, setSessionSummaryData] = useState<any>(null);
  const [finalNotes, setFinalNotes] = useState('');
  const [pendingTournaments, setPendingTournaments] = useState<any[]>([]);

  // ADR-040: Wallet reconciliation dialog ao fim da sessao
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [reconcileSessionId, setReconcileSessionId] = useState<string | null>(null);
  const reconcileResolveRef = useRef<((info?: any) => void) | null>(null);

  // RF-08: Bankroll integration — hook + accumulator da sessao.
  // fail-open: se o hook falhar ou retornar null, assume "nao configurado" e o
  // fluxo permanece identico ao pre-Sprint 2.
  const { data: bankroll } = useBankroll();
  const { data: exchangeRatesData } = useQuery<any>({
    queryKey: ["/api/settings/exchange-rates"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const [sessionAccumulatorUSD, setSessionAccumulatorUSD] = useState(0);
  const [bankrollShotModalOpen, setBankrollShotModalOpen] = useState(false);
  const [bankrollShotPendingData, setBankrollShotPendingData] = useState<any | null>(null);
  const [bankrollShotBuyInUSD, setBankrollShotBuyInUSD] = useState<number>(0);
  const lastAccumulatorWarnedRef = useRef<number>(0);

  // Check antes de `addTournamentMutation.mutate`. Aplica:
  // - Modal bloqueante se buyInUSD > hardLimit (RF-08 Cenario C)
  // - Toast warning se accumulator ultrapassa 10% da banca (RF-08 Q5)
  // Nao muda comportamento se bankroll.configured === false (feature transparente).
  function tryAddTournamentWithBankrollCheck(data: any) {
    const decision = decideBankrollAction(data?.buyIn, data?.site ?? "", bankroll);

    if (decision.kind === "block-hard") {
      setBankrollShotPendingData(data);
      setBankrollShotBuyInUSD(decision.buyInUSD);
      setBankrollShotModalOpen(true);
      return;
    }

    // Pass / warn-soft: adiciona normal
    addTournamentMutation.mutate(data);

    // RF-08 Q5: accumulator check — usa buyInUSD quando banca configurada
    // GL-E (UX 2026-04-24): throttle por tiers discretos [10,15,25,50]
    // ao inves de 1% em 1% para reduzir ruido de toasts em sessoes longas.
    if (bankroll?.configured) {
      const buyInUSD = normalizeBuyInToUSDPure(data?.buyIn, data?.site ?? "", bankroll);
      const { newAccumulator, pctExposed } = shouldWarnAccumulator(
        sessionAccumulatorUSD,
        buyInUSD,
        bankroll.amount,
      );
      setSessionAccumulatorUSD(newAccumulator);
      const { shouldWarn, newTier } = shouldWarnForTier(
        pctExposed,
        lastAccumulatorWarnedRef.current,
      );
      if (shouldWarn) {
        lastAccumulatorWarnedRef.current = newTier;
        toast({
          title: `Exposicao elevada (${newTier}% da banca)`,
          description: `Voce ja exposto ${(pctExposed * 100).toFixed(1)}% da banca hoje`,
          duration: 10000,
        });
      }
    }
  }

  // Confirma "shot" — registra torneio com flag aboveBankrollRule=true
  function handleConfirmBankrollShot() {
    if (!bankrollShotPendingData) return;
    const data = { ...bankrollShotPendingData, aboveBankrollRule: true };
    addTournamentMutation.mutate(data);

    if (bankroll?.configured) {
      const { newAccumulator, pctExposed } = shouldWarnAccumulator(
        sessionAccumulatorUSD,
        bankrollShotBuyInUSD,
        bankroll.amount,
      );
      setSessionAccumulatorUSD(newAccumulator);
      // GL-E: throttle por tiers [10,15,25,50]
      const { shouldWarn, newTier } = shouldWarnForTier(
        pctExposed,
        lastAccumulatorWarnedRef.current,
      );
      if (shouldWarn) {
        lastAccumulatorWarnedRef.current = newTier;
        toast({
          title: `Exposicao elevada (${newTier}% da banca)`,
          description: `Voce ja exposto ${(pctExposed * 100).toFixed(1)}% da banca hoje`,
          duration: 10000,
        });
      }
    }

    setBankrollShotModalOpen(false);
    setBankrollShotPendingData(null);
  }

  function handleCancelBankrollShot() {
    setBankrollShotModalOpen(false);
    setBankrollShotPendingData(null);
  }

  // GL-A (UX 2026-04-24): keyboard shortcut no bankroll shot modal — Enter
  // confirma, Esc cancela. Handler global porque o modal e custom (nao
  // Radix Dialog), entao nao temos bubbling de keydown pelo DialogContent.
  // GL-A polish (UX-2 2026-04-25): focus trap + guard contra captura fora do
  // modal. Antes, o listener global capturava Enter/Esc mesmo quando outro
  // input fora do modal estava em foco — causando submit/cancel acidental.
  useEffect(() => {
    if (!bankrollShotModalOpen) return;
    const handler = (e: KeyboardEvent) => {
      const modalEl = document.querySelector('[data-testid="bankroll-shot-modal"]');
      if (!modalEl) return;
      const active = document.activeElement;
      // Guard: so reage se foco esta dentro do modal ou em document.body
      // (caso onde nada explicitamente esta focado).
      const focusOutsideModal = active && active !== document.body && !modalEl.contains(active);
      if (focusOutsideModal) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmBankrollShot();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelBankrollShot();
      } else if (e.key === 'Tab') {
        // Focus trap: cicla entre os 2 botoes do modal (Cancelar / Confirmar)
        const focusables = modalEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankrollShotModalOpen, bankrollShotPendingData, bankrollShotBuyInUSD]);

  // Tournament states and dialogs
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [showPendingTournamentsDialog, setShowPendingTournamentsDialog] = useState(false);
  const [newTournament, setNewTournament] = useState<NewTournamentForm>({
    site: "", name: "", buyIn: "", type: "Vanilla", speed: "Normal",
    scheduledTime: "", fieldSize: "", rebuys: 0, result: "0", position: null, status: "upcoming",
    allowsAddOn: false, addOnCost: "", allowsReentry: false, maxReentries: null,
  });

  // Re-entry queue (ADR-014 / Spec 3 — FIFO)
  const [reentryQueue, setReentryQueue] = useState<ReentryQueueState>({ items: [] });
  const currentReentryTournament = reentryQueue.items[0] ?? null;
  const showReentryDialog = !!currentReentryTournament;

  const [showBreakManagementDialog, setShowBreakManagementDialog] = useState(false);
  const [sessionElapsedTime, setSessionElapsedTime] = useState("");
  const [showEditTournamentDialog, setShowEditTournamentDialog] = useState(false);
  const [editingPriority, setEditingPriority] = useState<string | null>(null);
  const [editingTimeDialog, setEditingTimeDialog] = useState<{[key: string]: boolean}>({});
  const [timeEditValue, setTimeEditValue] = useState<{[key: string]: string}>({});

  const [showDashboard, setShowDashboard] = useState(() => {
    const saved = localStorage.getItem('grindSessionDashboardVisible');
    return saved ? JSON.parse(saved) : true;
  });
  const [syncWithGrade, setSyncWithGrade] = useState(true);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ===== INLINE RESULT HANDLERS =====
  // applyFinishWithRegistrationData: finaliza o torneio usando o snapshot
  // de registrationData (prize/bounty/position) quando disponivel.
  // Extraido de handleFinishTournamentDirect para reuso no flow de re-entry
  // quando o usuario clica "Nao, GG definitivo" no modal.
  const applyFinishWithRegistrationData = (tournamentId: string) => {
    const entryData = registrationData[tournamentId];
    const hasBounty = entryData?.bounty && entryData.bounty.trim() !== '';
    const hasPrize = entryData?.prize && entryData.prize.trim() !== '';
    const hasPosition = entryData?.position && entryData.position.trim() !== '';

    let updateData: any = { status: 'finished', endTime: new Date().toISOString() };

    if (hasBounty || hasPrize || hasPosition) {
      updateData.bounty = normalizeDecimalInput(entryData?.bounty || '0');
      updateData.result = normalizeDecimalInput(entryData?.prize || '0');
      updateData.position = hasPosition ? parseInt(entryData.position) : null;
      updateTournamentMutation.mutate({ id: tournamentId, data: updateData });
      setRegistrationData(prev => { const updated = { ...prev }; delete updated[tournamentId]; return updated; });
      const totalResult = parseFloat(updateData.result) + parseFloat(updateData.bounty);
      toast({ title: "Torneio Finalizado", description: `Resultado salvo: $${totalResult.toFixed(2)}` });
    } else {
      updateData.result = '0'; updateData.bounty = '0'; updateData.position = null;
      updateTournamentMutation.mutate({ id: tournamentId, data: updateData });
      toast({ title: "Torneio Finalizado", description: "Torneio marcado como GG!" });
    }
  };

  const handleFinishTournamentDirect = (tournamentId: string) => {
    // ADR-014 Spec 3: torneios ReA com limite nao atingido disparam modal
    // de confirmacao antes de finalizar. Sem ReA ou ja no limite, finaliza.
    const tournament = (sessionTournaments as any[])?.find((t: any) => t.id === tournamentId);
    if (tournament && shouldShowReentryModal(tournament)) {
      // FIFO queue (RD-2) — preserva snapshot do torneio
      setReentryQueue((q) => ({ items: [...q.items, { ...tournament }] }));
      return;
    }

    // GL-B (UX 2026-04-24): captura snapshot ANTES da mutation para
    // permitir desfazer o GG! dentro de 8s via toast action. Evita que
    // um clique acidental destrua registro.
    const snapshot = captureFinishSnapshot(tournament);
    applyFinishWithRegistrationData(tournamentId);

    if (snapshot) {
      toast({
        title: 'Torneio encerrado',
        description: 'Cliquei por engano? Voce pode desfazer.',
        duration: UNDO_FINISH_TOAST_DURATION_MS,
        action: (
          <ToastAction
            altText="Desfazer encerramento"
            onClick={() => {
              const undoPayload = buildUndoFinishPayload(snapshot);
              updateTournamentMutation.mutate(undoPayload, {
                onSuccess: () => {
                  toast({
                    title: 'Encerramento desfeito',
                    description: 'Torneio voltou para "em andamento".',
                  });
                },
                // GL-B polish (UX-2 2026-04-25): se mutation reversa falhar
                // (rede/conflito 409), avisar o usuario que o undo nao foi
                // aplicado em vez de deixar silencioso.
                onError: (err: any) => {
                  toast({
                    title: 'Nao foi possivel desfazer',
                    description: err?.message || 'Tente abrir o torneio e marcar como ativo manualmente.',
                    variant: 'destructive',
                  });
                },
              });
            }}
            data-testid="gg-undo-action"
          >
            Desfazer
          </ToastAction>
        ),
      });
    }
  };

  // Re-entry flow handlers (ADR-014 / Spec 3)
  const handleConfirmReentry = () => {
    const t = currentReentryTournament;
    if (!t) return;
    const payload = buildReentryPayload(t);
    updateTournamentMutation.mutate(payload, {
      onSuccess: () => {
        toast({
          title: 'Re-entry registrado',
          description: `Tentativa ${(t.reentries || 0) + 2}. Bom jogo!`,
        });
      },
      onError: (err: any) => {
        toast({
          title: 'Erro ao registrar re-entry',
          description: err?.message || 'Tente novamente',
          variant: 'destructive',
        });
      },
    });
    // Descarta registrationData da tentativa encerrada (decisao v1)
    setRegistrationData((prev) => {
      const updated = { ...prev };
      delete updated[t.id];
      return updated;
    });
    setReentryQueue((q) => ({ items: q.items.slice(1) }));
  };

  const handleConfirmBust = () => {
    const t = currentReentryTournament;
    if (!t) return;
    applyFinishWithRegistrationData(t.id);
    setReentryQueue((q) => ({ items: q.items.slice(1) }));
  };

  // Add-on handler (ADR-014 / Spec 2) — reuses updateTournamentMutation
  const handleAddOnTaken = (tournamentId: string, value: boolean) => {
    updateTournamentMutation.mutate(
      { id: tournamentId, data: { addOnTaken: value } },
      {
        onSuccess: () => {
          toast({
            title: value ? 'Add-on registrado' : 'Add-on removido',
            description: value ? 'Investimento atualizado' : 'Valor do add-on desfeito',
          });
        },
        onError: (err: any) => {
          toast({
            title: 'Erro ao registrar add-on',
            description: err?.message || 'Tente novamente',
            variant: 'destructive',
          });
        },
      }
    );
  };

  // ===== SESSION FINALIZATION (RF-02: Simplified - max 2 clicks) =====
  const handleSessionFinalization = () => {
    setShowConfirmationModal(true);
  };

  const generateSessionSummary = async () => {
    try {
      const investedNorm = stats.totalInvestidoUSD ?? stats.totalInvestido;
      const profitNorm = stats.profitUSD ?? stats.profit;
      const summaryData = {
        volume: stats.registros,
        invested: investedNorm,
        profit: profitNorm,
        roi: stats.roi,
        fts: stats.fts,
        wins: stats.cravadas,
        bestResult: null,
        mentalAverages: {
          focus: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.foco, 0) / breakFeedbacks.length : 0,
          energy: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.energia, 0) / breakFeedbacks.length : 0,
          confidence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.confianca, 0) / breakFeedbacks.length : 0,
          emotionalIntelligence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.inteligenciaEmocional, 0) / breakFeedbacks.length : 0,
          interference: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.interferencias, 0) / breakFeedbacks.length : 0,
        },
        objectiveStatus: profitNorm > 0 ? 'completed' : (profitNorm > -investedNorm * 0.5 ? 'partial' : 'missed'),
        sessionTime: sessionElapsedTime,
        objectives: activeSession?.dailyGoals || '',
        quickNotes: quickNotes,
        endTime: new Date().toISOString()
      };
      setSessionSummaryData(summaryData);
      setShowSessionSummary(true);
    } catch (error) {
      toast({ title: "Erro ao Gerar Resumo", description: "Nao foi possivel gerar o resumo da sessao.", variant: "destructive" });
    }
  };

  const handleConfirmEndSession = async () => {
    try {
      // Auto-finish ALL pending tournaments (RF-02)
      const allTournaments = [
        ...(plannedTournaments || []).map(t => ({ ...t, id: `planned-${t.id}` })),
        ...(sessionTournaments || [])
      ];
      const organized = organizeTournaments(allTournaments, plannedTournaments || []);
      const pendingList = organized.registered?.filter(t => t.status === 'registered') || [];

      for (const tournament of pendingList) {
        try {
          await updateTournamentMutation.mutateAsync({
            id: tournament.id,
            data: { status: 'finished', endTime: new Date().toISOString(), result: '0', bounty: '0', position: null }
          });
        } catch {
          // Continuar com os demais mesmo se um falhar
        }
      }
      setShowConfirmationModal(false);
      generateSessionSummary();
    } catch (error) {
      toast({ title: "Erro ao Finalizar Torneios", description: "Nao foi possivel finalizar os torneios pendentes.", variant: "destructive" });
    }
  };

  const handleEndSession = async () => {
    const sessionId = activeSession?.id;
    if (!sessionId) return;
    const sessionData = sessionSummaryData || {
      volume: stats.registros,
      invested: stats.totalInvestidoUSD ?? stats.totalInvestido,
      profit: stats.profitUSD ?? stats.profit,
      roi: stats.roi,
      fts: stats.fts, wins: stats.cravadas,
      mentalAverages: {
        focus: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.foco, 0) / breakFeedbacks.length : 0,
        energy: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.energia, 0) / breakFeedbacks.length : 0,
        confidence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.confianca, 0) / breakFeedbacks.length : 0,
        emotionalIntelligence: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.inteligenciaEmocional, 0) / breakFeedbacks.length : 0,
        interference: breakFeedbacks.length > 0 ? breakFeedbacks.reduce((sum: number, b: any) => sum + b.interferencias, 0) / breakFeedbacks.length : 0,
      }
    };

    await runSessionEndFlow({
      sessionId,
      completeSession: async () => {
        await apiRequest('PUT', `/api/grind-sessions/${sessionId}`, {
          status: 'completed', endTime: new Date().toISOString(), finalNotes: finalNotes || '',
          objectiveCompleted: sessionData.objectiveStatus === 'completed',
          volume: sessionData.volume, profit: sessionData.profit.toString(),
          abiMed: sessionData.invested > 0 ? (sessionData.invested / sessionData.volume).toString() : '0',
          roi: sessionData.roi.toString(), fts: sessionData.fts, cravadas: sessionData.wins,
          energiaMedia: sessionData.mentalAverages.energy.toString(),
          focoMedio: sessionData.mentalAverages.focus.toString(),
          confiancaMedia: sessionData.mentalAverages.confidence.toString(),
          inteligenciaEmocionalMedia: sessionData.mentalAverages.emotionalIntelligence.toString(),
          interferenciasMedia: sessionData.mentalAverages.interference.toString(),
        });
      },
      fetchReconcilable: async () => {
        const data: any = await apiRequest('GET', `/api/grind-sessions/${sessionId}/reconcilable-wallets`);
        return {
          wallets: Array.isArray(data?.wallets) ? data.wallets : [],
          alreadyReconciled: !!data?.alreadyReconciled,
        };
      },
      openReconcileDialog: () => new Promise<any>((resolve) => {
        reconcileResolveRef.current = resolve;
        setReconcileSessionId(sessionId);
        setShowReconcileDialog(true);
      }),
      openSummaryModal: () => {
        setQuickNotes([]);
        localStorage.removeItem('grindfy_session_backup');
        setLocation('/grind');
      },
      toast,
      onError: (err) => {
        console.error("Failed to end session:", err);
        toast({ title: "Erro ao Finalizar", description: "Nao foi possivel salvar os dados da sessao. Tente novamente.", variant: "destructive" });
      },
    });
  };

  function handleReconcileComplete(info?: any) {
    // HIGH-4 reviewer fix: torna idempotente. Sem essa guarda, double trigger
    // (onComplete + onOpenChange(false) consecutivos) podia causar resolve
    // multiplo do ref ou races sutis em reabertura.
    if (!showReconcileDialog && reconcileResolveRef.current === null) {
      return;
    }
    setShowReconcileDialog(false);
    if (reconcileResolveRef.current) {
      reconcileResolveRef.current(info);
      reconcileResolveRef.current = null;
    }
  }

  const handleContinueSession = () => {
    setShowSessionSummary(false); setSessionSummaryData(null); setFinalNotes('');
    setShowConfirmationModal(false); setPendingTournaments([]);
  };

  // ===== EFFECTS =====
  useEffect(() => { localStorage.setItem('grindSessionDashboardVisible', JSON.stringify(showDashboard)); }, [showDashboard]);

  // RF-03: Load quick notes from session data (DB-backed via session update)
  useEffect(() => {
    if (activeSession?.id) {
      // Try to load notes from session's finalNotes field (stored as JSON array)
      try {
        const parsed = activeSession.finalNotes ? JSON.parse(activeSession.finalNotes) : [];
        if (Array.isArray(parsed)) {
          setQuickNotes(parsed);
        }
      } catch {
        // finalNotes is plain text, not JSON - that's OK, just start fresh
      }
    }
  }, [activeSession?.id]);

  // Timer for session elapsed time (RF-09: pause-aware)
  useEffect(() => {
    if (activeSession) {
      const updateElapsedTime = () => {
        if (isPaused) return; // Don't update while paused
        const sessionStart = new Date(activeSession.date);
        const now = new Date();
        const totalPaused = pausedTime + (pauseStartTime ? now.getTime() - pauseStartTime : 0);
        const diffMs = now.getTime() - sessionStart.getTime() - totalPaused;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setSessionElapsedTime(`${hours}h ${minutes}m`);
      };
      updateElapsedTime();
      const interval = setInterval(updateElapsedTime, 60000);
      return () => clearInterval(interval);
    }
  }, [activeSession, isPaused, pausedTime, pauseStartTime]);

  const getSessionTimeInfo = () => {
    if (!activeSession) return { color: 'text-gray-400', bgColor: 'bg-gray-700', message: '' };
    const sessionStart = new Date(activeSession.date);
    const now = new Date();
    const hours = (now.getTime() - sessionStart.getTime()) / (1000 * 60 * 60);

    if (hours < 2) return { color: 'text-green-300', bgColor: 'bg-green-600/20 border-green-500/50', message: '🚀 O dia ta so comecando, pra cima!' };
    if (hours < 4) return { color: 'text-green-400', bgColor: 'bg-green-700/20 border-green-600/50', message: '💪 Se mantenha inabalavel, ainda estamos no comeco!' };
    if (hours < 6) return { color: 'text-yellow-300', bgColor: 'bg-yellow-600/20 border-yellow-500/50', message: '🔄 Reboot mental recomendado!' };
    if (hours < 8) return { color: 'text-red-300', bgColor: 'bg-red-500/20 border-red-400/50', message: '🔥 Aqui separa os homens dos meninos!' };
    return { color: 'text-red-400', bgColor: 'bg-red-600/20 border-red-500/50', message: '⚡ E aqui que muitos regs viram fish! Mantenha o foco!' };
  };

  const currentDayOfWeek = new Date().getDay();

  // ===== QUERIES =====
  const { data: sessions = [], isLoading: sessionsLoading, isError: sessionsError, refetch: refetchSessions } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => { const response = await apiRequest('GET', "/api/grind-sessions"); return Array.isArray(response) ? response : []; },
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: true, refetchOnMount: true,
  });

  const { data: plannedTournaments = [], refetch: refetchTournaments } = useQuery({
    queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek],
    queryFn: async () => { const response = await apiRequest('GET', `/api/session-tournaments/by-day/${currentDayOfWeek}`); return Array.isArray(response) ? response : []; },
    staleTime: 30000, gcTime: 0, refetchOnWindowFocus: true, refetchOnMount: true,
  });

  const { data: sessionTournaments = [], refetch: refetchSessionTournaments } = useQuery({
    queryKey: ["/api/session-tournaments", activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      const data = await apiRequest('GET', `/api/session-tournaments?sessionId=${activeSession.id}`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!activeSession?.id, staleTime: 0, gcTime: 0, refetchOnWindowFocus: true, refetchOnMount: true,
  });

  const { data: weeklySuggestions = [] } = useQuery({
    queryKey: ["/api/session-tournaments/weekly-suggestions"],
    queryFn: async () => { const data = await apiRequest('GET', "/api/session-tournaments/weekly-suggestions"); return Array.isArray(data) ? data : []; },
    staleTime: 300000,
  });

  const { data: breakFeedbacks = [] } = useQuery({
    queryKey: [`/api/break-feedbacks`, activeSession?.id],
    queryFn: async () => { if (!activeSession?.id) return []; return await apiRequest("GET", `/api/break-feedbacks?sessionId=${activeSession.id}`); },
    enabled: !!activeSession?.id, staleTime: 30000,
  });

  // RF-10: Fetch user settings for alert preferences
  const { data: userAlertSettings } = useQuery({
    queryKey: ["/api/user-settings"],
    retry: false,
  });

  // Exit warning: show native browser dialog when navigating away during active session
  useEffect(() => {
    if (!activeSession) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeSession]);

  // Auto-save session backup to localStorage every 30 seconds
  useEffect(() => {
    if (!activeSession) return;
    const saveSessionBackup = () => {
      const backup = {
        sessionId: activeSession.id,
        timestamp: Date.now(),
      };
      localStorage.setItem('grindfy_session_backup', JSON.stringify(backup));
    };
    saveSessionBackup();
    const interval = setInterval(saveSessionBackup, 30000);
    return () => {
      clearInterval(interval);
    };
  }, [activeSession]);

  // ===== SUGGESTION HELPERS =====
  const getFilteredSuggestions = () => {
    const suggestions = Array.isArray(weeklySuggestions) ? weeklySuggestions : [];
    if (suggestions.length === 0) return [];
    let filtered = suggestions.filter(suggestion => {
      if (newTournament.site && newTournament.site !== suggestion.site) return false;
      if (newTournament.type && newTournament.type !== suggestion.type) return false;
      if (newTournament.speed && newTournament.speed !== suggestion.speed) return false;
      if (newTournament.buyIn && newTournament.buyIn !== '') {
        const formBuyIn = parseFloat(newTournament.buyIn);
        const suggestionBuyIn = parseFloat(suggestion.buyIn);
        if (!isNaN(formBuyIn) && !isNaN(suggestionBuyIn) && Math.abs(formBuyIn - suggestionBuyIn) > formBuyIn * 0.2) return false;
      }
      return true;
    });
    filtered.sort((a, b) => b.frequency - a.frequency);
    return filtered.slice(0, 6);
  };

  const resetFilters = () => {
    setNewTournament({ site: "", name: "", buyIn: "", type: "Vanilla", speed: "Normal", scheduledTime: "", fieldSize: "", rebuys: 0, result: "0", position: null, status: "upcoming" });
    toast({ title: "Filtros Limpos", description: "Todos os campos foram resetados" });
  };

  const hasActiveFilters = () => !!(newTournament.site || newTournament.type !== "Vanilla" || newTournament.speed !== "Normal" || newTournament.buyIn);

  const applyQuickFilter = (filterType: string, value: string) => {
    setNewTournament(prev => ({ ...prev, [filterType]: value }));
    toast({ title: "Filtro Aplicado", description: `Filtrado por ${filterType}: ${value}` });
  };

  const getSuggestionStats = () => {
    const suggestions = Array.isArray(weeklySuggestions) ? weeklySuggestions : [];
    return { total: suggestions.length, filtered: getFilteredSuggestions().length, sites: new Set(suggestions.map(s => s.site)).size, types: new Set(suggestions.map(s => s.type)).size };
  };

  const getSimilarityScore = (suggestion: any) => {
    let score = 0;
    if (newTournament.site === suggestion.site) score += 25;
    if (newTournament.type === suggestion.type) score += 25;
    if (newTournament.speed === suggestion.speed) score += 25;
    if (newTournament.buyIn && Math.abs(parseFloat(newTournament.buyIn) - parseFloat(suggestion.buyIn)) <= 5) score += 25;
    return score;
  };

  const applySuggestion = (suggestion: any) => {
    setNewTournament(prev => ({
      ...prev, site: suggestion.site, type: suggestion.type, speed: suggestion.speed,
      buyIn: suggestion.buyIn, fieldSize: suggestion.guaranteed || prev.fieldSize,
      scheduledTime: suggestion.time || prev.scheduledTime, name: ''
    }));
    toast({ title: "Sugestao Aplicada", description: `${suggestion.site} ${suggestion.type} $${suggestion.buyIn} ${suggestion.speed}` });
  };

  // ===== ACTIVE SESSION DETECTION (RF-01: session recovery) =====
  useEffect(() => {
    if (sessions) {
      const found = sessions.find((s: GrindSession) => s.status === "active");
      if (found && !activeSession) {
        // Session recovered from DB
        setActiveSession(found);
        setShowRecoveryBanner(true);
        setTimeout(() => setShowRecoveryBanner(false), 5000);
      } else {
        setActiveSession(found || null);
      }
    }
  }, [sessions]);

  // Bug 5: Timeout redirect if no active session found after query completes
  // Use ref to avoid stale closure capturing null activeSession
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  useEffect(() => {
    if (activeSession) return;
    if (sessionsLoading) return;

    const timeout = setTimeout(() => {
      if (!activeSessionRef.current) {
        toast({
          title: "Nenhuma sessão ativa",
          description: "Nenhuma sessão ativa encontrada. Redirecionando...",
          variant: "default",
        });
        setLocation("/grind");
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [activeSession, sessionsLoading]);

  // Break timer using configurable frequency from user settings (FP-07)
  const lastBreakTimeRef = useRef<number>(0);
  const breakFrequency = getBreakFrequency((userAlertSettings as any) || null);

  useEffect(() => {
    if (activeSession && !activeSession.skipBreaksToday && !skipBreaksToday) {
      const sessionStart = new Date(activeSession.date).getTime();
      const frequencyMs = breakFrequency * 60 * 1000;
      const bannerLeadMs = 5 * 60 * 1000; // banner shows 5min before break

      const timer = setInterval(() => {
        if (isPaused) return;
        const now = Date.now();
        const totalPausedMs = pausedTime + (pauseStartTime ? now - pauseStartTime : 0);
        const elapsedMs = now - sessionStart - totalPausedMs;
        const elapsedMin = elapsedMs / (60 * 1000);

        // Check if we should trigger a break
        const lastBreakMin = lastBreakTimeRef.current > 0 ? lastBreakTimeRef.current / (60 * 1000) : null;

        if (shouldTriggerBreak(elapsedMin, breakFrequency, lastBreakMin)) {
          // Calculate which break we're on to avoid re-triggering
          const breakNumber = lastBreakMin !== null
            ? Math.floor((elapsedMin - lastBreakMin) / breakFrequency)
            : Math.floor(elapsedMin / breakFrequency);

          if (breakNumber > 0 || lastBreakTimeRef.current === 0) {
            const currentBreakMs = Math.floor(elapsedMin / breakFrequency) * frequencyMs;
            if (currentBreakMs > lastBreakTimeRef.current) {
              lastBreakTimeRef.current = currentBreakMs;
              // FP-07: Show non-blocking banner instead of auto-opening dialog
              setBreakBannerActive(true);
              setShowBreakBanner(true);
              setBreakSnoozeCount(0); // reset snooze count for new break
            }
          }
        }

        // Banner countdown: show 5min before next break
        if (nextBreakTimeMin !== null) {
          const countdown = getBreakCountdownMinutes(nextBreakTimeMin, elapsedMin);
          setBreakCountdown(Math.ceil(countdown));
        } else {
          // Calculate next break time for countdown
          const nextBreak = lastBreakTimeRef.current > 0
            ? (lastBreakTimeRef.current / (60 * 1000)) + breakFrequency
            : breakFrequency;
          const countdown = getBreakCountdownMinutes(nextBreak, elapsedMin);
          setBreakCountdown(Math.ceil(countdown));
          // Show pre-break banner 5min before
          if (countdown <= 5 && countdown > 0 && !showBreakBanner && !breakBannerActive) {
            setShowBreakBanner(true);
            setBreakBannerActive(false);
          }
        }
      }, 30000); // check every 30s
      return () => clearInterval(timer);
    }
  }, [activeSession, isPaused, pausedTime, pauseStartTime, skipBreaksToday, breakFrequency, nextBreakTimeMin]);

  // RF-10: Request notification permission once on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // #16: Listen for snooze reopen event from BreakFeedbackPopup
  useEffect(() => {
    const handleSnoozeReopen = () => {
      if (activeSession && !skipBreaksToday) {
        setShowBreakDialog(true);
      }
    };
    window.addEventListener('grindfy:snooze-break-reopen', handleSnoozeReopen);
    return () => window.removeEventListener('grindfy:snooze-break-reopen', handleSnoozeReopen);
  }, [activeSession, skipBreaksToday]);

  // FP-07: Break banner handlers
  const handleBreakRespond = () => {
    setShowBreakBanner(false);
    setBreakBannerActive(false);
    setShowBreakDialog(true);
  };

  const handleBreakSnooze = () => {
    if (!canSnoozeBreak(breakSnoozeCount)) return;
    setBreakSnoozeCount(prev => prev + 1);
    setShowBreakBanner(false);
    setBreakBannerActive(false);
    // Calculate next break time after 15min snooze
    const sessionStart = activeSession ? new Date(activeSession.date).getTime() : Date.now();
    const totalPausedMs = pausedTime + (pauseStartTime ? Date.now() - pauseStartTime : 0);
    const elapsedMin = (Date.now() - sessionStart - totalPausedMs) / (60 * 1000);
    const nextBreak = calculateNextBreakTime(elapsedMin, 15);
    setNextBreakTimeMin(nextBreak);
  };

  const handleBreakSkip = () => {
    setShowBreakBanner(false);
    setBreakBannerActive(false);
    setNextBreakTimeMin(null);
  };

  const breakOptions = getSnoozeOptions(breakSnoozeCount);

  // RF-10: Late reg alert timer
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') return;

    const settings = userAlertSettings as any;
    const alertSettings = {
      lateRegAlertMinutes: settings?.lateRegAlertMinutes ?? 10,
      lateRegAlertEnabled: settings?.lateRegAlertEnabled ?? true,
      lateRegAlertSound: settings?.lateRegAlertSound ?? true,
    };

    const checkAlerts = () => {
      // Automatic late reg alerts (only if enabled)
      if (alertSettings.lateRegAlertEnabled) {
      const allTournaments = [
        ...(plannedTournaments || []).map((pt: any) => ({ ...pt, id: `planned-${pt.id}`, status: pt.status || 'upcoming' })),
        ...(sessionTournaments || []),
      ];

      const upcomingWithLate = allTournaments.filter((t: any) =>
        t.status === 'upcoming' && t.lateRegMinutes && t.lateRegMinutes > 0 && t.time
      );

      for (const tournament of upcomingWithLate) {
        const [h, m] = tournament.time.split(':').map(Number);
        const startTime = new Date();
        startTime.setHours(h, m, 0, 0);

        const alertTournament = {
          id: tournament.id,
          name: tournament.name || 'Torneio',
          time: tournament.time,
          lateRegMinutes: tournament.lateRegMinutes,
          alertMinutesBefore: tournament.alertMinutesBefore ?? null,
          status: tournament.status,
          startTime,
        };

        if (alertManagerRef.current.shouldAlert(alertTournament, alertSettings)) {
          alertManagerRef.current.markAlerted(tournament.id);

          const deadline = calculateLateRegDeadline(startTime, tournament.lateRegMinutes);
          const now = new Date();
          const minutesRemaining = Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 60000));
          const hh = String(deadline.getHours()).padStart(2, '0');
          const mm = String(deadline.getMinutes()).padStart(2, '0');
          const tournamentName = tournament.name || 'Torneio';
          const description = `${tournamentName} — Late ate ${hh}:${mm} (faltam ${minutesRemaining}min)`;

          fireAlert({
            title: "Late Reg Encerrando!",
            description,
            soundEnabled: alertSettings.lateRegAlertSound,
            toast,
          });
        }
      }
      } // end if lateRegAlertEnabled

      // Check generic (manual) alerts - always check, regardless of lateRegAlertEnabled
      const alertsToFire = sessionAlertManagerRef.current.getAlertsToFire();
      for (const alert of alertsToFire) {
        sessionAlertManagerRef.current.markFired(alert.id);
        const title = alert.type === 'late-reg' ? `Late Reg: ${alert.label.replace('Late Reg: ', '')}` : 'Lembrete';
        fireAlert({
          title,
          description: alert.label,
          soundEnabled: alertSettings.lateRegAlertSound,
          toast,
        });
      }
      if (alertsToFire.length > 0) {
        refreshAlertState();
      }
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 30000);
    return () => clearInterval(interval);
  }, [activeSession, plannedTournaments, sessionTournaments, userAlertSettings, toast]);

  // ===== MUTATIONS =====
  const startSessionMutation = useMutation({
    mutationFn: async (data: { preparationNotes: string; preparationPercentage: number; dailyGoals: string; screenCap: number; skipBreaksToday: boolean }) => {
      return await apiRequest("POST", "/api/grind-sessions", {
        date: new Date().toISOString(), status: "active", ...data,
        resetTournaments: true, replaceExisting: true, dayOfWeek: new Date().getDay(), loadFromGradePlanner: true,
      });
    },
    onSuccess: (session) => {
      setActiveSession(session); setShowStartDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({ title: "Sessao Iniciada", description: "Sua sessao de grind foi iniciada com sucesso!" });
    },
    onError: (error: Error) => { toast({ title: "Erro", description: error.message, variant: "destructive" }); },
  });

  const addTournamentMutation = useMutation({
    mutationFn: async (tournamentData: any) => {
      // ADR-014 (B1+B2 fix): propaga add-on/re-entry em ambos os paths
      // (manual e syncWithGrade). Helper resolveAddonReaPayload espelha
      // autodetect server-side em grade-planner.ts (Plus/ReA pelo nome).
      const resolvedName = tournamentData.name || `${tournamentData.site} ${tournamentData.type || 'Tournament'}`;
      const addonReaPayload = resolveAddonReaPayload({
        name: resolvedName,
        site: tournamentData.site,
        type: tournamentData.type,
        buyIn: tournamentData.buyIn,
        allowsAddOn: tournamentData.allowsAddOn,
        addOnCost: tournamentData.addOnCost,
        allowsReentry: tournamentData.allowsReentry,
        maxReentries: tournamentData.maxReentries,
      });

      if (tournamentData.syncWithGrade) {
        const currentDayOfWeek = new Date().getDay();
        let activeProfile = 'A';
        try {
          const profileStatesResponse = await apiRequest('GET', '/api/profile-states');
          const todayProfileState = profileStatesResponse?.find((state: any) => state.dayOfWeek === currentDayOfWeek);
          if (todayProfileState?.activeProfile) activeProfile = todayProfileState.activeProfile;
        } catch {}
        return await apiRequest("POST", "/api/planned-tournaments", {
          site: tournamentData.site, name: resolvedName,
          buyIn: String(tournamentData.buyIn), type: tournamentData.type || 'Vanilla', speed: tournamentData.speed || 'Normal',
          time: tournamentData.scheduledTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          guaranteed: tournamentData.guaranteed ? String(tournamentData.guaranteed) : null, prioridade: 2,
          dayOfWeek: currentDayOfWeek, profile: activeProfile,
          ...addonReaPayload,
        });
      } else {
        return await apiRequest("POST", "/api/session-tournaments", {
          userId: activeSession?.userId, sessionId: activeSession?.id, site: tournamentData.site,
          name: resolvedName,
          buyIn: tournamentData.buyIn, rebuys: 0, result: "0", bounty: "0",
          status: tournamentData.status || "upcoming", fromPlannedTournament: tournamentData.fromPlannedTournament || false,
          plannedTournamentId: tournamentData.plannedTournamentId || null,
          fieldSize: tournamentData.fieldSize ? parseInt(tournamentData.fieldSize) : null, position: null,
          startTime: tournamentData.startTime || null, endTime: null,
          time: tournamentData.scheduledTime || tournamentData.time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          type: tournamentData.type || 'Vanilla', speed: tournamentData.speed || 'Normal',
          guaranteed: tournamentData.guaranteed || null,
          addOnTaken: false,
          reentries: 0,
          ...addonReaPayload,
        });
      }
    },
    onSuccess: (result, variables) => {
      // RF-07: Single invalidateQueries per mutation, no setTimeout cascades
      const currentDayOfWeek = new Date().getDay();
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      if (syncWithGrade) {
        queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      }
      // RF-12: Keep modal open for adding more, show success toast
      setNewTournament({ site: "", name: "", buyIn: "", type: "Vanilla", speed: "Normal", scheduledTime: "", fieldSize: "", rebuys: 0, result: "0", position: null, status: "upcoming", allowsAddOn: false, addOnCost: "", allowsReentry: false, maxReentries: null });
      const isRegistration = variables?.status === 'registered' && variables?.fromPlannedTournament;
      toast({
        title: isRegistration ? "Registrado no Torneio" : "Torneio Adicionado",
        description: isRegistration ? `Voce foi registrado em ${variables?.name || 'torneio'}!` : (syncWithGrade ? "Torneio adicionado a sessao e sincronizado com a Grade!" : "Torneio adicionado a sessao com sucesso!"),
      });
    },
    onError: (error: any) => { toast({ title: "Erro no Registro", description: error?.message || "Falha ao registrar torneio.", variant: "destructive" }); },
  });

  const updateTournamentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      let endpoint;
      if (id.startsWith('planned-')) { endpoint = `/api/planned-tournaments/${id.substring(8)}`; }
      else { endpoint = `/api/session-tournaments/${id}`; }
      return await apiRequest("PUT", endpoint, data);
    },
    onSuccess: (result, variables) => {
      // RF-07: Single invalidateQueries, no removeQueries/setTimeout cascades
      const currentDayOfWeek = new Date().getDay();
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      if (activeSession?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments", activeSession.id] });
      }
      const isRegistrationUpdate = variables.data.status === 'registered';
      toast({
        title: isRegistrationUpdate ? "Registrado no Torneio" : "Torneio Atualizado",
        description: isRegistrationUpdate ? "Voce se registrou no torneio com sucesso!" : "Torneio atualizado com sucesso!",
      });
    },
    onError: (error: any) => { toast({ title: "Erro ao Atualizar Torneio", description: error.message ? `Falha ao atualizar torneio: ${error.message}` : "Falha ao atualizar torneio", variant: "destructive" }); },
  });

  const breakFeedbackMutation = useMutation({
    mutationFn: async (feedback: any) => {
      return await apiRequest("POST", "/api/break-feedbacks", { ...feedback, sessionId: activeSession?.id, breakTime: new Date().toISOString() });
    },
    onSuccess: () => {
      setShowBreakDialog(false);
      queryClient.invalidateQueries({ queryKey: [`/api/break-feedbacks`, activeSession?.id] });
      toast({ title: "Feedback Registrado", description: "Seu feedback do break foi registrado!" });
    },
    onError: () => { toast({ title: "Erro ao Salvar Feedback", description: "Nao foi possivel salvar o feedback.", variant: "destructive" }); },
  });

  const finalizePendingTournamentsMutation = useMutation({
    mutationFn: async (pendingTs: any[]) => {
      return Promise.all(pendingTs.map(t => {
        const endpoint = t.id.startsWith('planned-') ? `/api/planned-tournaments/${t.id.substring(8)}` : `/api/session-tournaments/${t.id}`;
        return apiRequest("PUT", endpoint, { status: "completed", result: "0", bounty: "0", endTime: new Date().toISOString(), position: null });
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      toast({ title: "Torneios Finalizados", description: "Torneios pendentes foram marcados como GG!" });
      endSessionMutation.mutate();
    },
    onError: () => { toast({ title: "Erro ao Finalizar Torneios", description: "Nao foi possivel finalizar os torneios pendentes.", variant: "destructive" }); }
  });

  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const finalStats = calculateFinalSessionStats(plannedTournaments, sessionTournaments);
      const breakAvgs = calculateBreakAverages(breakFeedbacks);
      // Calcular duracao real descontando tempo pausado
      const sessionStartMs = activeSession?.date ? new Date(activeSession.date).getTime() : Date.now();
      const totalPausedMs = pausedTime + (pauseStartTime ? Date.now() - pauseStartTime : 0);
      const durationMinutes = Math.round((Date.now() - sessionStartMs - totalPausedMs) / 60000);

      return await apiRequest("PUT", `/api/grind-sessions/${activeSession?.id}`, {
        status: "completed", endTime: new Date().toISOString(), duration: Math.max(0, durationMinutes), objectiveCompleted: sessionObjectiveCompleted, finalNotes: sessionFinalNotes,
        volume: finalStats.volume, profit: finalStats.profit.toString(), abiMed: finalStats.abiMed.toString(), roi: finalStats.roi.toString(),
        fts: finalStats.fts, cravadas: finalStats.cravadas,
        energiaMedia: breakAvgs.energia.toString(), focoMedio: breakAvgs.foco.toString(), confiancaMedia: breakAvgs.confianca.toString(),
        inteligenciaEmocionalMedia: breakAvgs.inteligenciaEmocional.toString(), interferenciasMedia: breakAvgs.interferencias.toString(),
        vanillaPercentage: finalStats.percentages.types.vanilla.toString(), pkoPercentage: finalStats.percentages.types.pko.toString(),
        mysteryPercentage: finalStats.percentages.types.mystery.toString(),
        normalSpeedPercentage: finalStats.percentages.speeds.normal.toString(), turboSpeedPercentage: finalStats.percentages.speeds.turbo.toString(),
        hyperSpeedPercentage: finalStats.percentages.speeds.hyper.toString(),
      });
    },
    onSuccess: () => {
      toast({ title: "Sessao Finalizada!", description: "Sua sessao foi concluida com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      localStorage.removeItem('grindfy_session_backup');
      // RF-08 Q5: reseta o accumulator ao finalizar a sessao
      setSessionAccumulatorUSD(0);
      lastAccumulatorWarnedRef.current = 0;
      // RF-02: Show summary, redirect on summary close
      setShowSessionSummary(true);
    },
  });

  // ===== QUICK NOTES (RF-03: Persist to DB via session update) =====
  const handleAddQuickNote = async () => {
    if (!quickNoteText.trim() || !activeSession?.id) return;
    const newNote: QuickNote = { id: Date.now().toString(), text: quickNoteText.trim(), timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    const updatedNotes = [...quickNotes, newNote];
    setQuickNotes(updatedNotes);
    // Persist notes to DB as JSON in finalNotes field
    try {
      await apiRequest('PUT', `/api/grind-sessions/${activeSession.id}`, {
        finalNotes: JSON.stringify(updatedNotes)
      });
    } catch {
      // Silent fail - notes are still in local state
    }
    setQuickNoteText(""); setShowQuickNotesDialog(false);
    toast({ title: "Nota Salva!", description: "Sua anotacao foi capturada com sucesso." });
  };

  // ===== GENERIC ALERTS HANDLERS =====
  const refreshAlertState = () => {
    const mgr = sessionAlertManagerRef.current;
    setGenericAlerts(mgr.getActiveAlerts());
    setFiredGenericAlerts(mgr.getFiredAlerts());
    setActiveAlertCount(mgr.getActiveCount());
  };

  const handleCreateCustomAlert = (label: string, mode: 'absolute' | 'relative', time?: string, minutesAhead?: number) => {
    const mgr = sessionAlertManagerRef.current;
    try {
      if (mode === 'absolute' && time) {
        const [h, m] = time.split(':').map(Number);
        const triggerAt = new Date();
        triggerAt.setHours(h, m, 0, 0);
        mgr.addAlert({ type: 'custom', label, triggerAt });
      } else if (mode === 'relative' && minutesAhead) {
        mgr.addRelativeAlert(label, minutesAhead);
      }
      refreshAlertState();
      toast({ title: "Alerta Criado", description: label });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleCreateLateRegAlert = (tournamentId: string, tournamentName: string, startTime: Date, lateRegMinutes: number, minutesBefore: number) => {
    const mgr = sessionAlertManagerRef.current;
    try {
      mgr.addLateRegAlert({ id: tournamentId, name: tournamentName, site: '', startTime, lateRegMinutes }, minutesBefore);
      refreshAlertState();
      toast({ title: "Alerta de Late Reg Criado", description: `${minutesBefore}min antes - ${tournamentName}` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleDismissAlert = (id: string) => {
    sessionAlertManagerRef.current.dismissAlert(id);
    refreshAlertState();
  };

  const handleRemoveAlert = (id: string) => {
    sessionAlertManagerRef.current.removeAlert(id);
    refreshAlertState();
  };

  const handleRefireAlert = (id: string) => {
    sessionAlertManagerRef.current.unmarkFired(id);
    refreshAlertState();
  };

  const handleClearAllAlerts = () => {
    sessionAlertManagerRef.current.reset();
    refreshAlertState();
  };

  const hasAlertForTournament = (tournamentId: string, triggerAt: Date) => {
    return sessionAlertManagerRef.current.hasDuplicateLateReg(tournamentId, triggerAt);
  };

  // ===== TOURNAMENT HANDLERS =====
  const handleStartSession = async () => {
    try { await apiRequest('POST', '/api/grind-sessions/reset-tournaments'); queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] }); queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] }); } catch {}
    setQuickNotes([]);
    startSessionMutation.mutate({ preparationNotes: preparationObservations, preparationPercentage: preparationPercentage[0], dailyGoals, screenCap, skipBreaksToday });
  };

  // RF-09: Pause/Resume handlers
  const handlePauseSession = () => {
    setIsPaused(true);
    setPauseStartTime(Date.now());
  };

  const handleResumeSession = () => {
    if (pauseStartTime) {
      setPausedTime(prev => prev + (Date.now() - pauseStartTime));
    }
    setPauseStartTime(null);
    setIsPaused(false);
  };

  const handleRebuyTournament = (tournament: any) => {
    updateTournamentMutation.mutate({ id: tournament.id, data: { rebuys: (tournament.rebuys || 0) + 1 } });
  };

  const handleUpdatePriority = (tournamentId: string, newPriority: number) => {
    updateTournamentMutation.mutate({ id: tournamentId, data: { prioridade: newPriority } }, {
      onSuccess: () => { setEditingPriority(null); toast({ title: "Prioridade Atualizada" }); },
      onError: () => { setEditingPriority(null); toast({ title: "Erro ao Atualizar Prioridade", variant: "destructive" }); }
    });
  };

  const handlePriorityClickCycle = (tournamentId: string, currentPriority: number) => {
    let nextPriority = currentPriority + 1;
    if (nextPriority > 3) nextPriority = 1;
    handleUpdatePriority(tournamentId, nextPriority);
  };

  const handleRegisterTournament = (tournamentId: string) => {
    if (!activeSession?.id) { toast({ title: "Erro", description: "Nenhuma sessao ativa encontrada.", variant: "destructive" }); return; }
    const allTournaments = [...(sessionTournaments || []), ...(plannedTournaments || []).map(pt => ({ ...pt, id: `planned-${pt.id}`, status: 'upcoming', sessionId: activeSession.id }))];
    const targetTournament = allTournaments.find(t => t.id === tournamentId);
    if (!targetTournament) { toast({ title: "Erro", description: "Torneio nao encontrado.", variant: "destructive" }); return; }
    const isSuprema = targetTournament.site === 'Suprema';

    if (!tournamentId.startsWith('planned-')) {
      if (isSuprema) {
        addTournamentMutation.mutate({ sessionId: activeSession.id, site: targetTournament.site, name: targetTournament.name, buyIn: targetTournament.buyIn || '0', type: targetTournament.type || 'Vanilla', speed: targetTournament.speed || 'Normal', time: targetTournament.time || '20:00', guaranteed: targetTournament.guaranteed || null, status: 'registered', startTime: new Date().toISOString(), rebuys: 0, result: '0', bounty: '0', position: null, fieldSize: null, fromPlannedTournament: false, plannedTournamentId: null,
          // ADR-014 copy-on-promote
          allowsAddOn: (targetTournament as any).allowsAddOn ?? false,
          addOnCost: (targetTournament as any).addOnCost ?? null,
          allowsReentry: (targetTournament as any).allowsReentry ?? false,
          maxReentries: (targetTournament as any).maxReentries ?? null,
        });
      } else {
        updateTournamentMutation.mutate({ id: tournamentId, data: { status: 'registered', startTime: new Date().toISOString() } });
      }
      return;
    }

    const actualId = tournamentId.substring(8);
    const plannedTournament = plannedTournaments?.find(t => t.id === actualId);
    const existingSessionTournament = sessionTournaments?.find(st => st.plannedTournamentId === actualId);

    if (existingSessionTournament && !isSuprema) {
      // Refresh addon/reentry config from the current planned source.
      // The session row was snapshotted at session-creation time; if the
      // planned tournament was edited afterwards (e.g., user enabled
      // allowsAddOn), the snapshot is stale and the Add-on button never
      // shows. Promoting upcoming -> registered is the right moment to
      // re-sync those fields.
      const promoteData: any = { status: 'registered', startTime: new Date().toISOString() };
      const pt: any = plannedTournaments?.find(t => t.id === actualId);
      if (pt) {
        if (pt.allowsAddOn === true && existingSessionTournament.allowsAddOn !== true) {
          promoteData.allowsAddOn = true;
          if (!existingSessionTournament.addOnCost) {
            promoteData.addOnCost = pt.addOnCost ?? existingSessionTournament.buyIn ?? null;
          }
        }
        if (pt.allowsReentry === true && existingSessionTournament.allowsReentry !== true) {
          promoteData.allowsReentry = true;
          if (existingSessionTournament.maxReentries == null && pt.maxReentries != null) {
            promoteData.maxReentries = pt.maxReentries;
          }
        }
      }
      updateTournamentMutation.mutate({ id: existingSessionTournament.id, data: promoteData });
      return;
    }

    if (plannedTournament) {
      addTournamentMutation.mutate({ sessionId: activeSession.id, site: plannedTournament.site || 'PokerStars', name: plannedTournament.name, buyIn: plannedTournament.buyIn || '0', type: plannedTournament.type || 'Vanilla', speed: plannedTournament.speed || 'Normal', time: plannedTournament.time || '20:00', guaranteed: plannedTournament.guaranteed || null, status: 'registered', startTime: new Date().toISOString(), rebuys: 0, result: '0', bounty: '0', position: null, fieldSize: null, fromPlannedTournament: true, plannedTournamentId: actualId, lateRegMinutes: plannedTournament.lateRegMinutes ?? null, startingStack: plannedTournament.startingStack ?? null, maxPlayers: plannedTournament.maxPlayers ?? null, gameType: plannedTournament.gameType ?? null, blindLevelMinutes: plannedTournament.blindLevelMinutes ?? null, alertMinutesBefore: plannedTournament.alertMinutesBefore ?? null,
        // ADR-014 copy-on-promote
        allowsAddOn: (plannedTournament as any).allowsAddOn ?? false,
        addOnCost: (plannedTournament as any).addOnCost ?? null,
        allowsReentry: (plannedTournament as any).allowsReentry ?? false,
        maxReentries: (plannedTournament as any).maxReentries ?? null,
      });
      return;
    }
    toast({ title: "Erro", description: "Torneio nao encontrado.", variant: "destructive" });
  };

  const handleUnregisterTournament = (tournamentId: string) => {
    updateTournamentMutation.mutate({ id: tournamentId, data: { status: 'upcoming', result: '0', bounty: '0', position: null, startTime: null, endTime: null } });
    setRegistrationData(prev => { const updated = { ...prev }; delete updated[tournamentId]; return updated; });
  };

  // GL-H polish (UX-2 2026-04-25): trocar window.confirm() por shadcn
  // AlertDialog. Antes: confirm nativo do browser (sem estilo, bloqueia
  // thread, inacessivel em alguns mobiles). Agora: dialog estilizado com
  // foco programatico e suporte a teclado/screen-reader.
  const [deleteTournamentId, setDeleteTournamentId] = useState<string | null>(null);
  const handleDeleteTournament = (tournamentId: string) => {
    setDeleteTournamentId(tournamentId);
  };
  const handleConfirmDeleteTournament = () => {
    if (!deleteTournamentId) return;
    updateTournamentMutation.mutate({ id: deleteTournamentId, data: { status: 'deleted' } });
    setDeleteTournamentId(null);
  };
  const handleCancelDeleteTournament = () => setDeleteTournamentId(null);

  // ===== TIME EDIT HANDLERS =====
  const handleEditTime = (tournamentId: string) => {
    let tournament = sessionTournaments?.find(t => t.id === tournamentId);
    if (!tournament && tournamentId.startsWith('planned-')) {
      const actualId = tournamentId.substring(8);
      tournament = plannedTournaments?.find(t => t.id === actualId);
      if (tournament) tournament = { ...tournament, id: tournamentId };
    }
    if (tournament) {
      setTimeEditValue({ ...timeEditValue, [tournamentId]: tournament.time || '20:00' });
      setEditingTimeDialog({ ...editingTimeDialog, [tournamentId]: true });
    }
  };

  const handleSaveTime = (tournamentId: string) => {
    const newTime = timeEditValue[tournamentId];
    if (newTime && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newTime)) {
      updateTournamentMutation.mutate({ id: tournamentId, data: { time: newTime } });
      setEditingTimeDialog({ ...editingTimeDialog, [tournamentId]: false });
      toast({ title: "Horario atualizado", description: `Horario alterado para ${newTime}` });
    } else {
      toast({ title: "Erro", description: "Formato invalido. Use HH:MM (ex: 20:30)", variant: "destructive" });
    }
  };

  const adjustTournamentTime = (tournamentId: string, minutesToAdd: number, autoClose: boolean = false) => {
    let tournament = sessionTournaments?.find(t => t.id === tournamentId);
    if (!tournament && tournamentId.startsWith('planned-')) { const actualId = tournamentId.substring(8); tournament = plannedTournaments?.find(t => t.id === actualId); }
    if (tournament) {
      const currentTime = tournament.time || '20:00';
      if (!currentTime || typeof currentTime !== 'string') return;
      const [hours, minutes] = currentTime.split(':').map(Number);
      let totalMinutes = hours * 60 + minutes + minutesToAdd;
      // Wrap around 24h (evitar valores negativos)
      totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
      const newHours = Math.floor(totalMinutes / 60);
      const newMinutes = totalMinutes % 60;
      const newTime = `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
      updateTournamentMutation.mutate({ id: tournamentId, data: { time: newTime } });
      setTimeEditValue({ ...timeEditValue, [tournamentId]: newTime });
      if (autoClose) setEditingTimeDialog({ ...editingTimeDialog, [tournamentId]: false });
      toast({ title: `${minutesToAdd > 0 ? '+' : ''}${minutesToAdd} minutos aplicados`, description: `Horario alterado para ${newTime}` });
    } else {
      toast({ title: "Erro", description: "Torneio nao encontrado", variant: "destructive" });
    }
  };

  const setFixedTime = (tournamentId: string, timeType: 'now' | 'next-hour' | 'plus-30') => {
    const now = new Date();
    let targetTime: string;
    switch (timeType) {
      case 'now': targetTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`; break;
      case 'next-hour': targetTime = `${(now.getHours() + 1).toString().padStart(2, '0')}:00`; break;
      case 'plus-30': const plus30 = new Date(now.getTime() + 30 * 60000); targetTime = `${plus30.getHours().toString().padStart(2, '0')}:${plus30.getMinutes().toString().padStart(2, '0')}`; break;
      default: return;
    }
    updateTournamentMutation.mutate({ id: tournamentId, data: { time: targetTime } });
    setTimeEditValue({ ...timeEditValue, [tournamentId]: targetTime });
    setEditingTimeDialog({ ...editingTimeDialog, [tournamentId]: false });
    toast({ title: `Horario definido`, description: `Horario alterado para ${targetTime}` });
  };

  // Close priority editing when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (editingPriority && !(event.target as Element).closest('.priority-select')) setEditingPriority(null); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingPriority]);

  // GL-I fix (UX-2 2026-04-25): bloco de DOM manipulation removido.
  // Timer e statusMessage ja sao state-based (sessionElapsedTime no useEffect
  // anterior + getSessionTimeInfo().message), passados como props ao
  // SessionHeader. O useEffect com document.getElementById('sessionTimer')
  // sobrescrevia o conteudo do React via DOM direto, conflitando com re-renders
  // e dificultando testes/SSR. Lookup duplicado eliminado.

  // FX rates "1 USD = N native units" para conversao USD do dashboard live.
  // Combina exchangeRates do user_settings com rate de BRL derivado de
  // bankroll.maxBuyInDisplay quando o usuario nao configurou BRL ainda.
  const usdConversionRates = useMemo<Record<string, number>>(() => {
    const fromSettings = (exchangeRatesData ?? {}) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [code, val] of Object.entries(fromSettings)) {
      const n = typeof val === 'number' ? val : parseFloat(String(val));
      if (Number.isFinite(n) && n > 0) out[code] = n;
    }
    if (out.BRL == null) {
      const usd = bankroll?.maxBuyInUSD;
      const brl = bankroll?.maxBuyInDisplay?.BRL;
      if (usd != null && brl != null && usd > 0 && brl > 0) {
        out.BRL = brl / usd;
      }
    }
    return out;
  }, [exchangeRatesData, bankroll?.maxBuyInUSD, bankroll?.maxBuyInDisplay?.BRL]);

  // Calculate stats
  const stats = useMemo(() => calculateSessionStats(sessionTournaments, plannedTournaments, registrationData, activeSession, usdConversionRates), [plannedTournaments, sessionTournaments, registrationData, activeSession, usdConversionRates]);

  // Screen cap alert via toast (não manipular DOM diretamente)
  const lastScreenCapAlertRef = useRef<number>(0);
  useEffect(() => {
    const percentage = stats.screenCap > 0 ? (stats.emAndamento / stats.screenCap) * 100 : 0;
    const now = Date.now();
    // Throttle: max 1 alerta a cada 60s
    if (now - lastScreenCapAlertRef.current < 60000) return;
    if (percentage >= 100) {
      lastScreenCapAlertRef.current = now;
      toast({ title: "Limite de telas atingido!", description: `${stats.emAndamento}/${stats.screenCap} telas em uso`, variant: "destructive" });
    } else if (percentage >= 80) {
      lastScreenCapAlertRef.current = now;
      toast({ title: "Proximo do limite de telas", description: `${stats.emAndamento}/${stats.screenCap} telas (${Math.round(percentage)}%)` });
    }
  }, [stats.emAndamento, stats.screenCap]);

  // Moved before early returns to respect React hooks rules (hooks must be called in same order every render)
  const allSites = useMemo(() => {
    const sites = new Set<string>();
    [...(sessionTournaments || []), ...(plannedTournaments || [])].forEach((t: any) => {
      if (t.site) sites.add(t.site);
    });
    return Array.from(sites).sort();
  }, [sessionTournaments, plannedTournaments]);

  // ===== RENDER =====
  if (sessionsLoading) {
    return (
      <div className="p-6 text-white" aria-live="polite">
        <div className="mb-6"><Skeleton className="h-8 w-48 bg-gray-700 mb-2" /><Skeleton className="h-4 w-96 bg-gray-700" /></div>
        <Card className="bg-poker-surface border-gray-700 max-w-2xl mx-auto"><CardContent className="p-6 space-y-4"><Skeleton className="h-6 w-48 mx-auto bg-gray-700" /><Skeleton className="h-4 w-64 mx-auto bg-gray-700" /><div className="grid grid-cols-3 gap-4 mt-4"><Skeleton className="h-16 w-full bg-gray-700" /><Skeleton className="h-16 w-full bg-gray-700" /><Skeleton className="h-16 w-full bg-gray-700" /></div></CardContent></Card>
      </div>
    );
  }

  if (sessionsError) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6"><h2 className="text-2xl font-bold mb-2">Sessao de Grind</h2><p className="text-gray-400">Inicie uma nova sessao de grind para rastrear seu desempenho em tempo real</p></div>
        <div className="text-center py-12">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" /><p className="text-xl font-semibold mb-2 text-red-400">Erro ao carregar sessao</p><p className="text-gray-400 mb-4">Nao foi possivel carregar os dados da sessao.</p>
          <Button variant="outline" onClick={() => refetchSessions()} className="bg-gray-800 border-gray-600 hover:bg-gray-700 text-white"><RefreshCw className="w-4 h-4 mr-2" />Tentar novamente</Button>
        </div>
      </div>
    );
  }

  if (!activeSession) {
    // RF-04: Use EpicStartSessionModal instead of inline dialog
    return (
      <div className="p-6 text-white">
        <EpicStartSessionModal
          isOpen={true}
          onClose={() => setLocation('/grind')}
          onSuccess={handleStartSession}
          preparationPercentage={preparationPercentage}
          setPreparationPercentage={setPreparationPercentage}
          preparationNotes={preparationObservations}
          setPreparationNotes={setPreparationObservations}
          dailyGoals={dailyGoals}
          setDailyGoals={setDailyGoals}
          screenCap={screenCap}
          setScreenCap={setScreenCap}
          isLoading={startSessionMutation.isPending}
          plannedTournaments={plannedTournaments}
          isLoadingPlannedTournaments={false}
        />
      </div>
    );
  }

  // Build combined tournament lists
  const allCombinedTournaments = combineTournaments(sessionTournaments, plannedTournaments);
  const { registered, upcoming, completed } = organizeTournaments(allCombinedTournaments, plannedTournaments);

  // RF-08: Filter tournaments by search + Item 19: site filter
  const filterBySearch = (tournaments: any[]) => {
    let filtered = tournaments;
    // Item 19: Apply site filter
    if (siteFilter !== "all") {
      filtered = filtered.filter(t => t.site === siteFilter);
    }
    if (!tournamentSearch.trim()) return filtered;
    const term = tournamentSearch.toLowerCase();
    return filtered.filter(t =>
      (t.name && t.name.toLowerCase().includes(term)) ||
      (t.site && t.site.toLowerCase().includes(term)) ||
      (t.buyIn && String(t.buyIn).includes(term))
    );
  };

  // Item 15: Bulk action helpers
  const toggleTournamentSelection = (id: string) => {
    setSelectedTournaments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const selectAllVisible = () => {
    const allIds = [...filteredUpcoming, ...filteredRegistered].map(t => t.id);
    setSelectedTournaments(new Set(allIds));
  };

  const clearSelection = () => {
    setSelectedTournaments(new Set());
  };

  const handleBulkRegister = () => {
    selectedTournaments.forEach(id => {
      const t = [...filteredUpcoming].find(t => t.id === id);
      if (t && t.status !== 'registered') {
        handleRegisterTournament(id);
      }
    });
    clearSelection();
  };

  const handleBulkFinish = () => {
    selectedTournaments.forEach(id => {
      const t = [...filteredRegistered].find(t => t.id === id);
      if (t) {
        handleFinishTournamentDirect(id);
      }
    });
    clearSelection();
  };

  const totalTournamentCount = registered.length + upcoming.length + completed.length;
  const filteredRegistered = filterBySearch(registered);
  const filteredUpcoming = filterBySearch(upcoming);
  const filteredCompleted = filterBySearch(completed);
  const filteredTotalCount = filteredRegistered.length + filteredUpcoming.length + filteredCompleted.length;

  return (
    <div className="container p-6 text-white">
      {/* RF-01: Session recovery banner */}
      {showRecoveryBanner && (
        <div className="mb-4 p-3 bg-green-600/20 border border-green-500/50 rounded-lg text-green-300 text-center font-medium animate-in fade-in duration-300">
          Sessao retomada
        </div>
      )}

      {/* FP-07: Break Banner (non-blocking) */}
      {showBreakBanner && activeSession && !skipBreaksToday && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-4 p-3 rounded-lg border sticky top-0 z-40 ${
            breakBannerActive
              ? 'bg-green-900/30 border-green-500/50 text-green-300'
              : 'bg-blue-900/30 border-blue-500/50 text-blue-300'
          }`}
        >
          {breakBannerActive ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="font-medium">Hora do Break!</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  size="sm"
                  onClick={handleBreakRespond}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Responder Agora
                </Button>
                {breakOptions.includes('snooze-15min') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBreakSnooze}
                    className="border-blue-500 text-blue-300 hover:bg-blue-900/50"
                  >
                    Adiar 15min
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleBreakSkip}
                  className="text-gray-400 hover:text-white"
                >
                  Pular
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="font-medium">Break em {breakCountdown} min</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleBreakSkip}
                className="text-gray-400 hover:text-white h-6 w-6 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Session Objectives */}
      {activeSession?.dailyGoals && (
        <Card className="bg-slate-800/70 border border-slate-700/60 shadow-lg shadow-emerald-500/10 mb-6 hover:shadow-emerald-500/20 transition-all duration-300">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-center space-x-3 mb-4"><div className="p-2 bg-emerald-500/20 rounded-full border border-emerald-500/40"><Target className="w-6 h-6 text-emerald-400" /></div><span className="text-xl font-bold text-emerald-400 tracking-wide">OBJETIVOS DA SESSAO</span></div>
            <div className="bg-slate-900/60 border border-slate-600/40 rounded-lg p-4"><p className="text-white text-lg font-medium leading-relaxed text-center">{activeSession.dailyGoals}</p></div>
          </CardContent>
        </Card>
      )}

      <SessionHeader
        sessionElapsedTime={sessionElapsedTime}
        statusMessage={getSessionTimeInfo().message}
        onOpenQuickNote={() => setShowQuickNotesDialog(true)}
        onOpenBreakDialog={() => setShowBreakDialog(true)}
        onSessionFinalization={handleSessionFinalization}
        onOpenBreakManagement={() => setShowBreakManagementDialog(true)}
        isPaused={isPaused}
        onPause={handlePauseSession}
        onResume={handleResumeSession}
      />

      <SessionDashboard stats={stats} showDashboard={showDashboard} onToggleDashboard={() => setShowDashboard(!showDashboard)} sessionTournaments={sessionTournaments as any[]} />

      {/* Alerts Panel */}
      <AlertsPanel
        activeAlerts={genericAlerts}
        firedAlerts={firedGenericAlerts}
        activeCount={activeAlertCount}
        onCreateAlert={handleCreateCustomAlert}
        onDismissAlert={handleDismissAlert}
        onRemoveAlert={handleRemoveAlert}
        onRefireAlert={handleRefireAlert}
        onClearAll={handleClearAllAlerts}
      />

      {/* Tournament List */}
      <div className="tournaments-section">
        <div className="tournaments-header">
          <div className="tournaments-title">Torneios de Hoje</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSupremaModal(true)} className="add-tournament-btn" style={{ backgroundColor: '#d97706' }}><Download className="h-4 w-4" />Importar Suprema</button>
            <AddTournamentDialog
              open={showAddTournamentDialog} onOpenChange={setShowAddTournamentDialog}
              newTournament={newTournament} setNewTournament={setNewTournament}
              syncWithGrade={syncWithGrade} setSyncWithGrade={setSyncWithGrade}
              weeklySuggestions={weeklySuggestions}
              onAddTournament={(data) => {
                if (!data.site || !data.buyIn) { toast({ title: "Campos Obrigatorios", description: "Site e Buy-in sao obrigatorios", variant: "destructive" }); return; }
                tryAddTournamentWithBankrollCheck(data);
              }}
              isPending={addTournamentMutation.isPending}
              getFilteredSuggestions={getFilteredSuggestions} resetFilters={resetFilters}
              hasActiveFilters={hasActiveFilters} getSuggestionStats={getSuggestionStats}
              applySuggestion={applySuggestion} applyQuickFilter={applyQuickFilter}
              getSimilarityScore={getSimilarityScore}
            />
          </div>
        </div>

        {/* RF-08: Tournament search + Item 19: Site filter */}
        <div className="mb-4 mt-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={tournamentSearch}
              onChange={(e) => setTournamentSearch(e.target.value)}
              placeholder="Buscar torneios..."
              className="pl-10 bg-gray-800/50 border-gray-700 text-white placeholder-gray-500 focus:border-green-500"
            />
          </div>
          {/* Item 19: Site filter buttons */}
          {allSites.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setSiteFilter("all")}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  siteFilter === "all" ? "bg-emerald-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                Todos
              </button>
              {allSites.map(site => (
                <button
                  key={site}
                  onClick={() => setSiteFilter(siteFilter === site ? "all" : site)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    siteFilter === site ? "bg-emerald-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {site}
                </button>
              ))}
            </div>
          )}
          {(tournamentSearch.trim() || siteFilter !== "all") && (
            <p className="text-xs text-gray-400 mt-1">
              Mostrando {filteredTotalCount} de {totalTournamentCount} torneios
            </p>
          )}
        </div>

        <div className="tournaments-content">
          {/* Empty state global quando nao ha torneios */}
          {filteredTotalCount === 0 && !tournamentSearch.trim() && siteFilter === "all" && (
            <div className="bg-gray-800/50 border border-gray-700/50 border-dashed rounded-xl p-8 text-center mb-6">
              <div className="text-gray-400 text-lg font-medium mb-2">Nenhum torneio na sessao</div>
              <p className="text-gray-500 text-sm mb-4">Adicione torneios para comecar a acompanhar sua sessao em tempo real</p>
              <button
                onClick={() => setShowAddTournamentDialog(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                + Adicionar Primeiro Torneio
              </button>
            </div>
          )}
          {/* EM ANDAMENTO */}
          <div className="tournament-category" id="activeCategory">
            <div className="category-header category-registered"><div className="category-icon"></div><div className="category-title">Em Andamento</div><div className="category-count">{filteredRegistered.length}</div></div>
            <div className="tournaments-list">
              {filteredRegistered.length > 0 ? filteredRegistered.map((tournament: any, index: number) => (
                <TournamentCard key={tournament.id} mode="registered"
                  tournament={tournament} index={index} totalCount={filteredRegistered.length}
                  registrationData={registrationData} maxLateStates={maxLateStates} editingPriority={editingPriority}
                  onUnregister={handleUnregisterTournament} onRebuy={handleRebuyTournament}
                  onFinishDirect={handleFinishTournamentDirect} onPriorityClickCycle={handlePriorityClickCycle}
                  onPriorityClick={(id, e) => { e.preventDefault(); e.stopPropagation(); setEditingPriority(id); }}
                  onUpdatePriority={handleUpdatePriority} setEditingPriority={setEditingPriority}
                  onSetRegistrationData={setRegistrationData} onSetMaxLateStates={setMaxLateStates}
                  updateIsPending={updateTournamentMutation.isPending}
                  isSelected={selectedTournaments.has(tournament.id)}
                  onToggleSelect={toggleTournamentSelection}
                  onAddOnTaken={handleAddOnTaken}
                />
              )) : <div className="category-empty">Nenhum torneio em andamento</div>}
            </div>
          </div>

          {/* PROXIMOS */}
          <div className="tournament-category" id="upcomingCategory">
            <div className="category-header category-upcoming"><div className="category-icon"></div><div className="category-title">Proximos</div><div className="category-count">{filteredUpcoming.length}</div></div>
            <div className="tournaments-list">
              {filteredUpcoming.length > 0 ? (
                <div className="space-y-4">
                  {organizeTournamentsByBreaks(filteredUpcoming).map((breakBlock) => (
                    <div key={breakBlock.breakTime} className="break-block">
                      <div className="break-header"><div className="break-line"></div><div className="break-title">Break {breakBlock.breakTime} ({breakBlock.tournaments.length})</div><div className="break-line"></div></div>
                      <div className="space-y-2">
                        {breakBlock.tournaments.map((tournament: any) => (
                          <TournamentCard key={tournament.id} mode="upcoming"
                            tournament={tournament} registered={registered}
                            onRegister={handleRegisterTournament} onEditTime={handleEditTime}
                            onEdit={(t) => { setEditingTournament(t); setShowEditTournamentDialog(true); }}
                            onDelete={handleDeleteTournament} queryClient={queryClient}
                            isSelected={selectedTournaments.has(tournament.id)}
                            onToggleSelect={toggleTournamentSelection}
                            onCreateLateRegAlert={handleCreateLateRegAlert}
                            hasAlertForTournament={hasAlertForTournament}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="category-empty">Nenhum torneio proximo</div>}
            </div>
          </div>

          {/* CONCLUIDOS */}
          <div className="tournament-category" id="finishedCategory">
            <div className="category-header category-finished"><div className="category-icon"></div><div className="category-title">Concluidos</div><div className="category-count">{filteredCompleted.length}</div></div>
            <div className="tournaments-list">
              {filteredCompleted.length > 0 ? (
                <Collapsible open={showCompletedTournaments} onOpenChange={setShowCompletedTournaments}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-poker-gold" /><span className="font-semibold text-white">Ver Torneios Concluidos</span></div>
                      {showCompletedTournaments ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 mt-3">
                    {filteredCompleted.map((tournament: any) => (
                      <TournamentCard key={tournament.id} mode="completed"
                        tournament={tournament}
                        onEdit={(t) => { setEditingTournament(t); setShowEditTournamentDialog(true); }}
                        onUnregister={handleUnregisterTournament} queryClient={queryClient}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ) : <div className="category-empty">Nenhum torneio concluido</div>}
            </div>
          </div>
        </div>

        {/* Item 15: Bulk selection floating bar */}
        {selectedTournaments.size > 0 && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900 border border-gray-600 rounded-xl px-6 py-3 flex items-center gap-4 shadow-2xl z-50">
            <span className="text-white text-sm font-medium">{selectedTournaments.size} selecionado{selectedTournaments.size > 1 ? 's' : ''}</span>
            <Button size="sm" onClick={handleBulkRegister} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              Registrar {selectedTournaments.size}
            </Button>
            <Button size="sm" onClick={handleBulkFinish} className="bg-red-600 hover:bg-red-700 text-white text-xs">
              Finalizar {selectedTournaments.size}
            </Button>
            <Button size="sm" variant="outline" onClick={selectAllVisible} className="border-gray-600 text-gray-300 hover:bg-gray-800 text-xs">
              Selecionar Todos
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection} className="text-gray-400 hover:text-white text-xs">
              Limpar
            </Button>
          </div>
        )}
      </div>

      {/* Break Feedback Dialog */}
      <BreakFeedbackPopup isOpen={showBreakDialog}
        onClose={() => setShowBreakDialog(false)}
        onSubmit={(feedback) => breakFeedbackMutation.mutate(feedback)}
        onSkip={() => setShowBreakDialog(false)}
        onSkipAll={() => { setShowBreakDialog(false); toast({ title: "Breaks Desabilitados", description: "Nao mostraremos mais feedbacks de break hoje" }); }}
        breakNumber={breakFeedbacks?.length ? breakFeedbacks.length + 1 : 1} totalBreaks={8}
        sessionProgress={breakFeedbacks?.length ? (breakFeedbacks.length / 8) * 100 : 0}
        timeRemaining={360} isPending={breakFeedbackMutation.isPending} sessionId={activeSession?.id}
      />

      {/* Break Management Dialog */}
      <Dialog open={showBreakManagementDialog} onOpenChange={setShowBreakManagementDialog}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-2xl">
          <DialogHeader><DialogTitle className="text-xl flex items-center"><Coffee className="w-6 h-6 mr-3 text-poker-accent" />Gerenciamento de Breaks</DialogTitle></DialogHeader>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-poker-gold mb-4">Breaks Registrados Hoje</h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {breakFeedbacks && breakFeedbacks.length > 0 ? breakFeedbacks.map((feedback: any) => (
                  <div key={feedback.id} className="p-4 bg-green-900/20 rounded-lg border border-green-600/30">
                    <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-3"><Coffee className="w-4 h-4 text-green-400" /><span className="text-white font-medium">Break as {new Date(feedback.breakTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><Badge variant="outline" className="border-green-600 text-green-400">Registrado</Badge></div></div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between"><span className="text-gray-400">Foco:</span><span className="text-white font-medium">{feedback.foco}/10</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Energia:</span><span className="text-white font-medium">{feedback.energia}/10</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Confianca:</span><span className="text-white font-medium">{feedback.confianca}/10</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Int. Emocional:</span><span className="text-white font-medium">{feedback.inteligenciaEmocional}/10</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Interferencias:</span><span className="text-white font-medium">{feedback.interferencias}/10</span></div>
                    </div>
                    {feedback.notes && <div className="mt-3 p-2 bg-gray-800/50 rounded text-sm"><span className="text-gray-400">Notas:</span><p className="text-gray-300 mt-1">{feedback.notes}</p></div>}
                  </div>
                )) : (
                  <div className="p-6 bg-gray-800/30 rounded-lg text-center"><Coffee className="w-8 h-8 text-gray-500 mx-auto mb-3" /><p className="text-gray-400 text-sm">Nenhum break registrado ainda nesta sessao</p></div>
                )}
              </div>
            </div>
            <div className="border-t border-gray-700 pt-6">
              <Button onClick={() => { setShowBreakManagementDialog(false); setShowBreakDialog(true); }} className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-3 h-12 shadow-lg"><Plus className="w-5 h-5 mr-3" />Gerar Novo Report</Button>
            </div>
          </div>
          <div className="flex justify-end mt-6"><Button onClick={() => setShowBreakManagementDialog(false)} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800">Fechar</Button></div>
        </DialogContent>
      </Dialog>

      <EditTournamentDialog open={showEditTournamentDialog} onOpenChange={setShowEditTournamentDialog}
        editingTournament={editingTournament} setEditingTournament={setEditingTournament}
        onSave={(id, data) => updateTournamentMutation.mutate({ id, data })}
      />

      {/* Re-entry confirmation modal (ADR-014 / Spec 3) */}
      {currentReentryTournament && (
        <ReentryConfirmDialog
          open={showReentryDialog}
          tournamentName={generateTournamentName(currentReentryTournament)}
          buyIn={String(currentReentryTournament.buyIn ?? '0')}
          currentReentries={currentReentryTournament.reentries ?? 0}
          maxReentries={currentReentryTournament.maxReentries ?? null}
          queueSize={reentryQueue.items.length}
          onConfirmReentry={handleConfirmReentry}
          onConfirmBust={handleConfirmBust}
          onOpenChange={(open) => {
            // ESC/backdrop click = "GG definitivo" (invariante §7.4)
            if (!open && currentReentryTournament) {
              handleConfirmBust();
            }
          }}
        />
      )}

      {/* Pending Tournaments Dialog removed - RF-02 simplified flow handles this */}

      <TimeEditDialog editingTimeDialog={editingTimeDialog} setEditingTimeDialog={setEditingTimeDialog}
        timeEditValue={timeEditValue} setTimeEditValue={setTimeEditValue}
        onSaveTime={handleSaveTime} onAdjustTime={adjustTournamentTime} onSetFixedTime={setFixedTime}
      />

      {/* Quick Notes Dialog */}
      <Dialog open={showQuickNotesDialog} onOpenChange={setShowQuickNotesDialog}>
        <DialogContent className="sm:max-w-[425px] bg-gradient-to-br from-blue-900 to-blue-800 border-blue-500/30 text-white">
          <DialogHeader><DialogTitle className="text-xl font-bold text-center text-blue-100">📝 Anotacao Rapida</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-blue-200">Sua anotacao (max. 280 caracteres)</Label>
              <Textarea value={quickNoteText} onChange={(e) => setQuickNoteText(e.target.value)} placeholder="Ex: Vilao a esquerda muito agressivo no button, ajustar ranges..." className="min-h-[100px] bg-blue-800/50 border-blue-500/50 text-white placeholder-blue-300/70 focus:border-blue-400" maxLength={280} />
              <div className="flex justify-between text-xs text-blue-300"><span>Horario atual: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><span>{quickNoteText.length}/280</span></div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => { setShowQuickNotesDialog(false); setQuickNoteText(""); }} className="flex-1 border-blue-500 text-blue-200 hover:bg-blue-600/20">Cancelar</Button>
              <Button onClick={handleAddQuickNote} disabled={!quickNoteText.trim() || quickNoteText.length > 280} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Salvar Nota</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SessionSummaryModal show={showSessionSummary} summaryData={sessionSummaryData}
        finalNotes={finalNotes} setFinalNotes={setFinalNotes}
        onContinueSession={handleContinueSession} onEndSession={handleEndSession}
      />

      {/* ADR-040: Wallet reconciliation dialog ao fim da sessao */}
      {showReconcileDialog && reconcileSessionId && (
        <WalletReconciliationDialog
          open={showReconcileDialog}
          onOpenChange={(open) => {
            if (!open) handleReconcileComplete();
          }}
          sessionId={reconcileSessionId}
          onComplete={handleReconcileComplete}
        />
      )}

      {/* RF-02: Simplified confirmation modal - single step with notes */}
      {/* GL-D (UX 2026-04-24): lista torneios pendentes que serao auto-fechados */}
      <Dialog open={showConfirmationModal} onOpenChange={setShowConfirmationModal}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Finalizar sessao?</DialogTitle>
            <DialogDescription className="text-gray-400">
              Torneios pendentes serao marcados como encerrados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {(() => {
              const pending = getPendingTournamentsForSessionEnd(sessionTournaments as any[]);
              if (pending.length === 0) return null;
              return (
                <div
                  data-testid="session-end-pending-warning"
                  className="bg-amber-900/30 border border-amber-500/40 rounded-lg p-3 text-sm"
                >
                  <strong className="text-amber-300">
                    {pending.length} torneio{pending.length > 1 ? "s" : ""} rodando
                  </strong>
                  <p className="text-amber-200/80 text-xs mt-1">
                    Ser{pending.length > 1 ? "ao" : "a"} marcado{pending.length > 1 ? "s" : ""} como encerrado{pending.length > 1 ? "s" : ""} com resultado zero.
                  </p>
                  <ul className="mt-2 space-y-0.5 text-xs text-amber-100/80 max-h-28 overflow-y-auto">
                    {pending.map((t) => (
                      <li key={t.id} className="truncate" data-testid="session-end-pending-item">
                        • {formatPendingTournamentLabel(t)}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            <div>
              <Label className="text-sm font-medium text-gray-300 mb-2 block">Notas finais (opcional)</Label>
              <Textarea
                value={finalNotes}
                onChange={(e) => setFinalNotes(e.target.value)}
                placeholder="Como foi a sessao? Alguma observacao importante?"
                className="bg-gray-800 border-gray-600 text-white min-h-[80px] focus:border-emerald-500"
                maxLength={500}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowConfirmationModal(false)} className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800">
                Cancelar
              </Button>
              <Button onClick={handleConfirmEndSession} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold" disabled={updateTournamentMutation.isPending}>
                {updateTournamentMutation.isPending ? "Finalizando..." : "Finalizar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suprema Import Modal — GL-C: dedupe por match key (name+time+buyIn) */}
      <SupremaImportModal
        open={showSupremaModal}
        onClose={() => setShowSupremaModal(false)}
        excludeExternalIds={[]}
        excludeMatchKeys={buildSupremaMatchKeysFromSession(sessionTournaments as any[])}
        onImport={async (tournaments) => {
          // Dedupe final defensivo: se o usuario conseguir (race) selecionar um
          // torneio que ja esta na sessao, bloqueamos no cliente e avisamos.
          const existingKeys = new Set(
            buildSupremaMatchKeysFromSession(sessionTournaments as any[])
          );
          let importedCount = 0;
          let skippedCount = 0;
          for (const t of tournaments) {
            const matchKey = buildSupremaMatchKey({
              site: t.site,
              name: t.name,
              time: t.time,
              buyIn: t.buyIn,
            });
            if (matchKey && existingKeys.has(matchKey)) {
              skippedCount++;
              continue;
            }
            try {
              addTournamentMutation.mutate({
                site: t.site, name: t.name, buyIn: t.buyIn, type: t.type, speed: t.speed,
                guaranteed: t.guaranteed, scheduledTime: t.time, status: "upcoming",
                syncWithGrade: false, fromPlannedTournament: false,
                lateRegMinutes: t.lateRegMinutes ?? null, startingStack: t.startingStack ?? null,
                maxPlayers: t.maxPlayers ?? null, gameType: t.gameType ?? null,
                blindLevelMinutes: t.blindLevelMinutes ?? null,
              });
              importedCount++;
              if (matchKey) existingKeys.add(matchKey);
            } catch {}
          }
          if (importedCount > 0 || skippedCount > 0) {
            const parts: string[] = [];
            if (importedCount > 0) parts.push(`${importedCount} novos importados`);
            if (skippedCount > 0) parts.push(`${skippedCount} ja estavam na sessao`);
            toast({
              title: "Importacao Concluida",
              description: parts.join(", "),
            });
          }
        }}
      />

      {/* GL-H polish (UX-2 2026-04-25): AlertDialog para confirmar delete
          de torneio. Substitui window.confirm() — mais acessivel, estilizado,
          e nao bloqueia thread. */}
      <AlertDialog
        open={!!deleteTournamentId}
        onOpenChange={(open) => { if (!open) handleCancelDeleteTournament(); }}
      >
        <AlertDialogContent data-testid="delete-tournament-alert-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover torneio da sessao?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao remove o torneio da sessao atual. Voce pode adiciona-lo
              novamente depois — historico de resultados nao e perdido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="delete-tournament-cancel"
              onClick={handleCancelDeleteTournament}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="delete-tournament-confirm"
              onClick={handleConfirmDeleteTournament}
              className="bg-red-600 hover:bg-red-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* RF-08: Bankroll Shot Modal — buyIn acima do hardLimit */}
      {bankrollShotModalOpen && bankroll?.configured && (
        <div
          data-testid="bankroll-shot-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-semibold text-red-400 mb-2">Torneio acima da sua regra de banca</h2>
            <p className="text-sm text-gray-300 mb-3">
              Este torneio custa ${bankrollShotBuyInUSD.toFixed(2)} USD, acima do limite
              da sua regra ({bankroll.rule ?? "1pct"} de ${(bankroll.amount ?? 0).toFixed(2)} =
              {" "}${(bankroll.hardLimitUSD ?? bankroll.maxBuyInUSD ?? 0).toFixed(2)} com tolerancia).
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Quer registrar mesmo assim como "shot"?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleCancelBankrollShot}
                data-testid="bankroll-shot-cancel"
                className="border-gray-600 text-gray-300"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmBankrollShot}
                data-testid="bankroll-shot-confirm"
                className="bg-red-600 hover:bg-red-700 text-white"
                autoFocus
              >
                Registrar como shot
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
