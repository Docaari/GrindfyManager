/**
 * Session End Helpers (UX 2026-04-24 — GL-D)
 *
 * Helpers puros para calcular a lista de torneios que serao auto-encerrados
 * quando o usuario finaliza uma sessao. Usado pelo modal de confirmacao
 * para mostrar um aviso explicito antes de auto-fechar com resultado zero.
 */

export interface PendingTournamentSummary {
  id: string;
  site?: string | null;
  name?: string | null;
  time?: string | null;
  buyIn?: string | number | null;
}

export interface PendingTournamentInput {
  id?: string;
  status?: string | null;
  site?: string | null;
  name?: string | null;
  time?: string | null;
  buyIn?: string | number | null;
}

/**
 * Filtra a lista de torneios da sessao para aqueles em status 'registered'
 * (em andamento) que serao encerrados automaticamente no finalize.
 *
 * Nao inclui:
 *  - 'upcoming' (ainda nao foram iniciados; nao sao auto-fechados)
 *  - 'finished', 'deleted' (ja encerrados)
 *  - Registros sem id valido
 */
export function getPendingTournamentsForSessionEnd(
  sessionTournaments: PendingTournamentInput[] | null | undefined
): PendingTournamentSummary[] {
  if (!Array.isArray(sessionTournaments)) return [];
  const result: PendingTournamentSummary[] = [];
  for (const t of sessionTournaments) {
    if (!t || !t.id) continue;
    if ((t.status ?? '').toLowerCase() !== 'registered') continue;
    result.push({
      id: t.id,
      site: t.site ?? null,
      name: t.name ?? null,
      time: t.time ?? null,
      buyIn: t.buyIn ?? null,
    });
  }
  return result;
}

/**
 * Formata um torneio pendente em uma linha curta: "site - name (time)".
 * Usado no modal de confirmacao para listar os torneios que serao fechados.
 */
export function formatPendingTournamentLabel(t: PendingTournamentSummary): string {
  const site = t.site?.trim() || 'Torneio';
  const name = t.name?.trim() || 'Sem nome';
  const time = t.time?.trim();
  return time ? `${site} - ${name} (${time})` : `${site} - ${name}`;
}

// =============================================================================
// Sprint Session-End Reconciliation V2 — RF-01, RF-08, RF-10, RF-13/P7
// =============================================================================

export interface CreateEndSessionOnSuccessDeps {
  activeSessionId?: string;
  sessionAlertManagerRef: { current: { reset: () => void } | null };
  setGenericAlerts: (a: any[]) => void;
  setFiredGenericAlerts: (a: any[]) => void;
  setActiveAlertCount: (n: number) => void;
  setSessionSummaryData: (d: any) => void;
  setShowSessionSummary: (b: boolean) => void;
  setLocation?: (path: string) => void;
  queryClient?: { invalidateQueries: (q: any) => void };
  toast?: (m: any) => void;
  sessionStats?: any;
}

/**
 * createEndSessionOnSuccess — RF-01.
 *
 * Factory que retorna o callback do `endSessionMutation.onSuccess`.
 * Reseta alarmes (chamando a API publica do sessionAlertManagerRef + state setters)
 * e abre summary modal in-place setando setSessionSummaryData(... sessionId ...) +
 * setShowSessionSummary(true). NAO chama setLocation.
 */
export function createEndSessionOnSuccess(
  deps: CreateEndSessionOnSuccessDeps,
): () => void {
  return function onSuccess() {
    // Reset alarmes (API publica do manager ref).
    try {
      deps.sessionAlertManagerRef.current?.reset();
    } catch {
      // ignore
    }
    deps.setGenericAlerts([]);
    deps.setFiredGenericAlerts([]);
    deps.setActiveAlertCount(0);

    // Monta summaryData com sessionId (RF-08, fix bug P3).
    const stats = deps.sessionStats ?? {};
    const summaryData = {
      ...stats,
      sessionId: deps.activeSessionId,
    };
    deps.setSessionSummaryData(summaryData);
    deps.setShowSessionSummary(true);
  };
}

/**
 * shouldSkipConfirmationModal — RF-13/P7.
 *
 * Quando pendingTournaments.length === 0, ConfirmationModal eh pulado e
 * endSessionMutation.mutate eh chamado direto.
 */
export function shouldSkipConfirmationModal(
  pendingTournaments: any[] | null | undefined,
): boolean {
  if (!Array.isArray(pendingTournaments)) return true;
  return pendingTournaments.length === 0;
}

/**
 * deriveAlertsSuspended — RF-10.
 *
 * Flag derivada que vale true enquanto qualquer modal terminal esta aberto.
 * Sessao A (gestao de alarmes) consome via useEffect proprio.
 */
export interface DeriveAlertsSuspendedInput {
  showSessionSummary: boolean;
  showReconcileDialog: boolean;
  showConfirmationModal: boolean;
}
export function deriveAlertsSuspended(s: DeriveAlertsSuspendedInput): boolean {
  return !!(
    s.showSessionSummary ||
    s.showReconcileDialog ||
    s.showConfirmationModal
  );
}

// =============================================================================
// Ajuste manual do resultado final da sessao — RF-04 / ADR-244 (D1, D4)
// =============================================================================

export interface EndSessionMentalAverages {
  focus: number;
  energy: number;
  confidence: number;
  emotionalIntelligence: number;
  interference: number;
}

export interface EndSessionSessionData {
  volume: number;
  invested: number;
  profit: number;
  roi: number;
  fts: number;
  wins: number;
  objectiveStatus?: string;
  mentalAverages: EndSessionMentalAverages;
}

/** Resultado declarado pelo jogador no modal de fim de sessao. */
export interface ManualSessionResultOverride {
  profitUsd: number;
  roi: number | null;
}

export interface BuildEndSessionPayloadInput {
  sessionData: EndSessionSessionData;
  finalNotes: string;
  endTimeIso: string;
  /** Lucro reconciliado da banca. Ausente quando nao ha secao Bancas. */
  walletProfitUsd?: number;
  /** Ajuste manual ativo. `null`/ausente = sem ajuste. */
  manualOverride?: ManualSessionResultOverride | null;
}

/**
 * Monta o corpo do `PUT /api/grind-sessions/:id` disparado ao finalizar.
 *
 * Sem ajuste, o payload e byte-a-byte o de antes desta feature (inclusive a
 * regra de so mandar `walletProfitUsd` quando ele e um numero finito).
 *
 * Com ajuste (D1), o valor declarado ocupa `profit`, `roi` e `walletProfitUsd` —
 * inclusive em sessao sem wallet nenhuma. A chave `roi` fica SEMPRE presente:
 * omitir deixaria o ROI antigo no banco, pior que `null` (ADR-244 Q4, opcao C).
 * `abiMed` continua derivado de `invested / volume` — o override nao o toca.
 */
export function buildEndSessionPayload(
  input: BuildEndSessionPayloadInput,
): Record<string, any> {
  const { sessionData, finalNotes, endTimeIso, walletProfitUsd } = input;
  const override = input.manualOverride ?? null;

  const profit = override ? override.profitUsd : sessionData.profit;
  const roi = override ? override.roi : sessionData.roi;
  const effectiveWalletProfitUsd = override ? override.profitUsd : walletProfitUsd;

  const payload: Record<string, any> = {
    status: 'completed',
    endTime: endTimeIso,
    finalNotes,
    objectiveCompleted: sessionData.objectiveStatus === 'completed',
    volume: sessionData.volume,
    profit: profit.toString(),
    abiMed:
      sessionData.invested > 0
        ? (sessionData.invested / sessionData.volume).toString()
        : '0',
    roi: roi === null || roi === undefined ? null : roi.toString(),
    fts: sessionData.fts,
    cravadas: sessionData.wins,
    energiaMedia: sessionData.mentalAverages.energy.toString(),
    focoMedio: sessionData.mentalAverages.focus.toString(),
    confiancaMedia: sessionData.mentalAverages.confidence.toString(),
    inteligenciaEmocionalMedia:
      sessionData.mentalAverages.emotionalIntelligence.toString(),
    interferenciasMedia: sessionData.mentalAverages.interference.toString(),
  };

  if (
    typeof effectiveWalletProfitUsd === 'number' &&
    Number.isFinite(effectiveWalletProfitUsd)
  ) {
    payload.walletProfitUsd = effectiveWalletProfitUsd.toString();
  }

  return payload;
}
