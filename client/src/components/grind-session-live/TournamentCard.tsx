import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Clock, Coins, Edit, X, Undo2, UserPlus, Trophy, Bell, CheckCircle, Plus, Flame, Hourglass } from "lucide-react";
import { calculateLateRegDeadline, formatStack, getLateRegColor } from "@/lib/lateRegUtils";
import { formatBuyIn, getCurrencyForSite } from "@shared/platform-currency";
import {
  getSiteColor, getCategoryColor, getSpeedColor,
  getPrioridadeColor, getPrioridadeLabel,
  getRebuyCounterClass, getRebuyText,
  formatNumberWithDots, normalizeDecimalInput,
  generateTournamentName, getGuaranteedValue,
  formatAddOnCost, getAddOnButtonState,
} from './helpers';
import { shouldShowBountyField } from './result-dialog-helpers';
import type { RegistrationData } from './types';
import { SatelliteResultDialog } from './SatelliteResultDialog';
import { RegisterPaymentDialog, useTicketMatchesForTournament } from './RegisterPaymentDialog';

// Reg deadline = start + lateRegMinutes. Card display ordena por reg, mostra
// reg como tempo principal; start vai como subtitulo (inicio HH:MM).
function getRegDeadlineLabel(time?: string | null, lateRegMinutes?: number | null): string | null {
  if (!time || typeof lateRegMinutes !== 'number' || lateRegMinutes <= 0) return null;
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const total = h * 60 + m + lateRegMinutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// =============================================================================
// Sprint grind-live-detail-parity (ADR-214 D8) — sub-render compartilhado de
// prioridade + chip Max Late + toggle/picker, consumido por Upcoming/Registered/
// Completed. Fonte unica de verdade visual (zero JSX duplicado triplo).
// =============================================================================

// hh 00-23, mm 00-59 (rejeita "99:99", "24:00", "20:60").
const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * prioridade resolvida (default Media=2) + flags de border/opacity + borderClass
 * pronto (Alta=barra vermelha esquerda, Baixa=opacity-90, Media=sem classe).
 * Consumido por RegisteredCard + UpcomingCard (zero ternario duplicado).
 */
function resolvePriority(tournament: any): {
  prioridade: number;
  isHigh: boolean;
  isLow: boolean;
  borderClass: string;
} {
  const prioridade = Number(tournament?.prioridade) || 2;
  const isHigh = prioridade === 1;
  const isLow = prioridade === 3;
  const borderClass = isHigh ? 'border-l-4 border-l-red-500' : isLow ? 'opacity-90' : '';
  return { prioridade, isHigh, isLow, borderClass };
}

/** registrationTime como string nao-vazia, ou null. */
function getMaxLateValue(tournament: any): string | null {
  const v = tournament?.registrationTime;
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/** Badge de prioridade Alta (Flame "Alta") — paridade DayDetailZoom:1241-1250. */
function PriorityBadge({ tournament }: { tournament: any }) {
  const { isHigh } = resolvePriority(tournament);
  if (!isHigh) return null;
  return (
    <span
      data-testid={`live-tournament-priority-badge-${tournament.id}`}
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40 shrink-0"
      title="Prioridade alta"
    >
      <Flame className="w-2.5 h-2.5" />
      Alta
    </span>
  );
}

/** Chip Max Late (Hourglass + registrationTime) — paridade DayDetailZoom:1270-1280. */
function MaxLateChip({ tournament }: { tournament: any }) {
  const value = getMaxLateValue(tournament);
  if (!value) return null;
  return (
    <span
      data-testid={`live-tournament-maxlate-${tournament.id}`}
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono tabular-nums bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0"
      title={`Reg final ${value}`}
    >
      <Hourglass className="w-2.5 h-2.5" />
      {value}
    </span>
  );
}

/**
 * Toggle + picker de Max Late (RF-03/RF-06). Montado apenas em Upcoming/Registered.
 *
 * - registrationTime presente -> toggle clica = OFF -> onMaxLateChange(id, null).
 * - registrationTime ausente -> toggle clica = abre picker (input time) + confirm.
 *   - confirm HH:MM valido -> onMaxLateChange(id, "HH:MM").
 *   - confirm invalido -> erro inline (live-maxlate-error-{id}), nao chama.
 */
function MaxLateControl({
  tournament,
  onMaxLateChange,
  variant = 'inline',
}: {
  tournament: any;
  onMaxLateChange: (id: string, value: string | null) => void;
  variant?: 'inline' | 'block';
}) {
  const id = tournament.id;
  const block = variant === 'block';
  const hasMaxLate = getMaxLateValue(tournament) != null;
  const [showPicker, setShowPicker] = useState(false);
  const [pickerValue, setPickerValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleToggle = () => {
    if (hasMaxLate) {
      // OFF -> limpa (null explicito, lesson #43).
      onMaxLateChange(id, null);
      return;
    }
    // ON sem valor -> abre picker.
    setError(null);
    setPickerValue('');
    setShowPicker(true);
  };

  const handleConfirm = () => {
    if (!HHMM_RE.test(pickerValue)) {
      setError('Horario invalido (use HH:MM)');
      return;
    }
    setError(null);
    setShowPicker(false);
    onMaxLateChange(id, pickerValue);
  };

  return (
    <span className={block ? 'flex flex-col gap-1 w-full' : 'inline-flex items-center gap-1'}>
      <button
        type="button"
        data-testid={`live-maxlate-toggle-${id}`}
        onClick={handleToggle}
        title={hasMaxLate ? 'Desligar Max Late' : 'Definir Max Late'}
        className={block
          ? 'flex items-center justify-center gap-1 w-full h-6 rounded text-[10px] font-medium border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
          : 'inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 shrink-0'}
      >
        <Hourglass className="w-2.5 h-2.5" />
        Max Late
      </button>
      {showPicker && (
        <span className={block ? 'flex items-center gap-1 w-full' : 'inline-flex items-center gap-1'}>
          <input
            type="time"
            data-testid={`live-maxlate-picker-${id}`}
            value={pickerValue}
            onChange={(e) => setPickerValue(e.target.value)}
            className={block
              ? 'flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded text-[10px] text-white px-1 py-0.5'
              : 'bg-gray-800 border border-gray-600 rounded text-[10px] text-white px-1 py-0.5'}
          />
          <button
            type="button"
            data-testid={`live-maxlate-confirm-${id}`}
            onClick={handleConfirm}
            className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-emerald-600 text-white hover:bg-emerald-500"
          >
            OK
          </button>
        </span>
      )}
      {error && (
        <span
          data-testid={`live-maxlate-error-${id}`}
          className="text-[9px] text-red-400"
        >
          {error}
        </span>
      )}
    </span>
  );
}

interface TournamentCardRegisteredProps {
  mode: 'registered';
  tournament: any;
  index: number;
  totalCount: number;
  registrationData: RegistrationData;
  maxLateStates: {[key: string]: boolean};
  editingPriority: string | null;
  onUnregister: (id: string) => void;
  onRebuy: (tournament: any) => void;
  onFinishDirect: (id: string) => void;
  onPriorityClickCycle: (id: string, current: number) => void;
  onPriorityClick: (id: string, e: React.MouseEvent) => void;
  onUpdatePriority: (id: string, priority: number) => void;
  setEditingPriority: (id: string | null) => void;
  onSetRegistrationData: React.Dispatch<React.SetStateAction<RegistrationData>>;
  onSetMaxLateStates: React.Dispatch<React.SetStateAction<{[key: string]: boolean}>>;
  updateIsPending: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  // Add-on + Re-entry (ADR-014)
  onAddOnTaken?: (tournamentId: string, value: boolean) => void;
  // Sprint grind-live-detail-parity (RF-06) — toggle/picker Max Late (rebuy).
  onMaxLateChange?: (id: string, value: string | null) => void;
}

interface TournamentCardUpcomingProps {
  mode: 'upcoming';
  tournament: any;
  registered: any[];
  onRegister: (id: string) => void;
  // Sprint Tickets-2 (RF-05) — registro com ticket. id = id do session_tournament/planned, ticketId = ticket a consumir apos register.
  onRegisterWithTicket?: (id: string, ticketId: string) => void;
  onEdit: (tournament: any) => void;
  onDelete: (id: string) => void;
  queryClient: any;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  // Sprint Alarmes 2.0 — botao unico Alerta abre TournamentAlertDialog com torneio pre-selecionado.
  onOpenTournamentAlert?: (tournamentId: string) => void;
  // Sprint grind-live-detail-parity (RF-03) — toggle/picker Max Late.
  onMaxLateChange?: (id: string, value: string | null) => void;
}

interface TournamentCardCompletedProps {
  mode: 'completed';
  tournament: any;
  onEdit: (tournament: any) => void;
  onUnregister: (id: string) => void;
  queryClient: any;
  /** Sprint D / RF-01.1 — quando presente + status=finished + allowsAddOn +
   *  !addOnTaken + addOnCost>0, renderiza botao "Add-on retroativo". */
  onAddOnTaken?: (tournamentId: string, value: boolean) => void;
}

type TournamentCardProps = TournamentCardRegisteredProps | TournamentCardUpcomingProps | TournamentCardCompletedProps;

export default function TournamentCard(props: TournamentCardProps) {
  if (props.mode === 'registered') {
    return <RegisteredCard {...props} />;
  } else if (props.mode === 'upcoming') {
    return <UpcomingCard {...props} />;
  } else {
    return <CompletedCard {...props} />;
  }
}

function RegisteredCard({
  tournament, index, totalCount,
  registrationData, maxLateStates, editingPriority,
  onUnregister, onRebuy, onFinishDirect,
  onPriorityClickCycle, onUpdatePriority, setEditingPriority,
  onSetRegistrationData, onSetMaxLateStates, updateIsPending,
  isSelected, onToggleSelect,
  onAddOnTaken, onMaxLateChange,
}: TournamentCardRegisteredProps) {
  const guaranteedValue = getGuaranteedValue(tournament);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const { isLow, borderClass: priorityBorder } = resolvePriority(tournament);
  const isSatellite = tournament?.type === 'Satellite';
  const currency = getCurrencyForSite(tournament.site || '');
  const addOnState = getAddOnButtonState(tournament, updateIsPending);
  const regTimeExplicit = tournament.registrationTime && String(tournament.registrationTime).trim() !== ''
    ? String(tournament.registrationTime)
    : null;
  const regDeadlineLabel = getRegDeadlineLabel(tournament.time, tournament.lateRegMinutes);
  const primaryTimeLabel = regTimeExplicit ?? regDeadlineLabel ?? tournament.time ?? '—';
  const startSubtitle = (regTimeExplicit || regDeadlineLabel) && tournament.time && tournament.time !== primaryTimeLabel
    ? tournament.time
    : null;

  return (
    <div className={`tournament-card tournament-registered pt-[2px] pb-[2px] ${priorityBorder} ${isSelected ? 'ring-2 ring-emerald-500' : ''}`}>
      {/* #2 + #43: Selection checkbox moved to right, with aria-label */}
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={isSelected || false}
          onChange={() => onToggleSelect(tournament.id)}
          aria-label={`Selecionar ${tournament.name || 'torneio'}`}
          className="absolute top-2 right-8 w-4 h-4 rounded border-gray-500 bg-gray-700 text-emerald-500 focus:ring-emerald-500 z-10 cursor-pointer"
        />
      )}
      {/* Botao desfazer no canto superior direito */}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onUnregister(tournament.id)}
        className="absolute top-1 right-1 p-1 h-5 w-5 text-gray-400 hover:text-gray-200 hover:bg-blue-800/50"
      >
        <Undo2 className="w-3 h-3" />
      </Button>

      <div className="flex items-center justify-between gap-3">
        {/* Informacoes do torneio - compacta */}
        <div className="flex-1 min-w-0">
          {/* #6 + #47: Time and name on separate lines, time with semantic element */}
          <div className="mb-1">
            <div className="flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <time dateTime={tournament.time || ''} className="text-emerald-400 font-mono text-sm font-bold">
                {primaryTimeLabel}
              </time>
              {startSubtitle && (
                <span className="text-gray-400 text-xs">(inicio {startSubtitle})</span>
              )}
              {!tournament.time && !regTimeExplicit && (
                <span className="text-red-400 text-xs ml-1">(sem horario)</span>
              )}
            </div>
            <div className={`font-medium text-sm truncate ml-6 ${isLow ? 'text-gray-400' : 'text-white'}`}>{generateTournamentName(tournament)}</div>
          </div>
          {/* Item 3: Badges in one line */}
          <div className="flex gap-1 flex-wrap text-xs items-center">
            <PriorityBadge tournament={tournament} />
            <MaxLateChip tournament={tournament} />
            {onMaxLateChange && (
              <MaxLateControl tournament={tournament} onMaxLateChange={onMaxLateChange} />
            )}
            <Badge className={`px-1.5 py-0.5 text-white ${getSiteColor(tournament.site)}`}>
              {tournament.site}
            </Badge>
            <Badge className={`px-1.5 py-0.5 text-white ${getCategoryColor(tournament.type || tournament.category || 'Vanilla')}`}>
              {tournament.type || tournament.category || 'Vanilla'}
            </Badge>
            <Badge className={`px-1.5 py-0.5 text-white ${getSpeedColor(tournament.speed || 'Normal')}`}>
              {tournament.speed || 'Normal'}
            </Badge>
            {tournament.gameType && (
              <Badge className={`px-1.5 py-0.5 text-white ${tournament.gameType === 'PLO' ? 'bg-purple-600' : 'bg-blue-500'}`}>
                {tournament.gameType}
              </Badge>
            )}
            {editingPriority === tournament.id ? (
              <div className="priority-select" onClick={(e) => e.stopPropagation()}>
                <Select
                  value={String(tournament.prioridade || 2)}
                  onValueChange={(value) => {
                    onUpdatePriority(tournament.id, parseInt(value));
                  }}
                  open={true}
                  onOpenChange={(open) => {
                    if (!open) {
                      setEditingPriority(null);
                    }
                  }}
                >
                  <SelectTrigger className="w-20 h-6 text-xs bg-gray-700 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="1" className="text-white hover:bg-gray-700 cursor-pointer">Alta</SelectItem>
                    <SelectItem value="2" className="text-white hover:bg-gray-700 cursor-pointer">Media</SelectItem>
                    <SelectItem value="3" className="text-white hover:bg-gray-700 cursor-pointer">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Badge
                className={`px-1.5 py-0.5 text-white cursor-pointer hover:ring-1 hover:ring-white/30 active:scale-95 transition-all ${getPrioridadeColor(tournament.prioridade || 2)}`}
                role="button"
                tabIndex={0}
                aria-label={`Prioridade: ${getPrioridadeLabel(tournament.prioridade || 2)}. Clique para alterar.`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPriorityClickCycle(tournament.id, tournament.prioridade || 2);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPriorityClickCycle(tournament.id, tournament.prioridade || 2);
                  }
                }}
              >
                {getPrioridadeLabel(tournament.prioridade || 2)}
              </Badge>
            )}
            {(tournament.rebuys || 0) > 0 && (
              <Badge className={`px-1.5 py-0.5 text-white transition-all duration-200 ${getRebuyCounterClass(tournament.rebuys || 0)}`}>
                {getRebuyText(tournament.rebuys || 0)}
              </Badge>
            )}
            {/* Add-on + Re-entry badges (ADR-014) */}
            {tournament.allowsAddOn && (
              <Badge
                className="px-1.5 py-0.5 bg-amber-600 text-white font-semibold"
                data-testid="badge-plus"
                title={`Torneio com add-on disponivel ($${formatAddOnCost(tournament)}). Clique no botao verde durante o break para pagar.`}
              >
                Plus
              </Badge>
            )}
            {tournament.allowsReentry && (
              <Badge className="px-1.5 py-0.5 bg-purple-600 text-white font-semibold" data-testid="badge-rea">
                ReA
              </Badge>
            )}
            {(tournament.reentries || 0) > 0 && (
              <Badge className="px-1.5 py-0.5 bg-purple-700 text-white font-semibold" data-testid="badge-tentativa">
                Tentativa {(tournament.reentries || 0) + 1}
                {tournament.maxReentries != null ? `/${tournament.maxReentries + 1}` : '/∞'}
              </Badge>
            )}
          </div>
          {/* Item 9: Buy-in with currency */}
          <div className="text-xs text-gray-400 mt-1">
            Buy-in: <span className="text-poker-green font-medium">{formatBuyIn(tournament.buyIn, tournament.site || '')}</span>
            {guaranteedValue && guaranteedValue > 0 && (
              <span className="ml-3 text-blue-400">| <span className="font-medium">{currency.symbol}{formatNumberWithDots(guaranteedValue)} GTD</span></span>
            )}
          </div>
        </div>

        {/* RF-11: Status badge */}
        <Badge className="absolute top-1 left-1 px-1.5 py-0.5 text-xs bg-green-600 text-white">
          Jogando
        </Badge>

        {/* #3 + #37: Action buttons - stack vertically on mobile */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2 md:mt-0 md:ml-4 w-full sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRebuy(tournament)}
            className={`border-2 h-10 px-3 text-xs font-bold shadow-lg transition-all duration-200 ${
              !tournament.rebuys || tournament.rebuys === 0
                ? "border-green-500 bg-gradient-to-r from-green-600/80 to-green-700/80 text-white hover:from-green-500 hover:to-green-600"
                : tournament.rebuys === 1
                ? "border-yellow-500 bg-gradient-to-r from-yellow-600/80 to-yellow-700/80 text-white hover:from-yellow-500 hover:to-yellow-600"
                : "border-red-500 bg-gradient-to-r from-red-600/80 to-red-700/80 text-white hover:from-red-500 hover:to-red-600"
            }`}
            disabled={updateIsPending}
            title={`Rebuys: ${tournament.rebuys || 0}`}
          >
            <Coins className="w-3 h-3 mr-1" />
            REBUY{tournament.rebuys && tournament.rebuys > 0 ? ` (${tournament.rebuys})` : ''}
          </Button>

          {/* Add-on button (ADR-014 / Spec 2) */}
          {addOnState.visible && onAddOnTaken && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAddOnTaken(tournament.id, !tournament.addOnTaken)}
              disabled={addOnState.disabled}
              className={`border-2 h-10 px-3 text-xs font-bold shadow-lg transition-all duration-200 ${
                addOnState.variant === 'paid'
                  ? 'border-amber-400 bg-gradient-to-r from-amber-500/80 to-yellow-600/80 text-white hover:from-amber-400 hover:to-yellow-500'
                  : 'border-green-500 bg-gradient-to-r from-emerald-600/80 to-emerald-700/80 text-white hover:from-emerald-500 hover:to-emerald-600'
              }`}
              title={
                tournament.addOnTaken
                  ? `Add-on $${formatAddOnCost(tournament)} pago. Clique para desfazer.`
                  : `Pagar add-on $${formatAddOnCost(tournament)}`
              }
              data-testid="btn-addon"
            >
              <Plus className="w-3 h-3 mr-1" />
              {addOnState.label}
            </Button>
          )}

          {/* Item 3: "Registrar Resultado" button opens dialog */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowResultDialog(true)}
            className="border-2 border-emerald-500 bg-gradient-to-r from-emerald-600/60 to-emerald-700/60 text-emerald-100 hover:from-emerald-500/80 hover:to-emerald-600/80 hover:text-white h-10 px-3 text-xs font-semibold shadow-lg transition-all duration-200"
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            Resultado
          </Button>

          {/* GG Button */}
          <Button
            onClick={() => onFinishDirect(tournament.id)}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white h-10 px-4 text-sm font-bold shadow-xl transition-all duration-200 border-2 border-red-400/50"
          >
            GG!
          </Button>
        </div>
      </div>

      {/* Sprint Tickets-1 (RF-02) — Satellite usa dialog dedicado com 3 outcomes (ticket/cash/nopass) */}
      {isSatellite && (
        <SatelliteResultDialog
          tournament={tournament}
          open={showResultDialog}
          onOpenChange={setShowResultDialog}
        />
      )}

      {/* Item 3 & 4: Result dialog with currency-aware fields (Vanilla/PKO/Mystery/etc — nao Satellite) */}
      {!isSatellite && (
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="bg-gray-900 border border-gray-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-white">Registrar Resultado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="text-sm text-gray-400 mb-2">
              {generateTournamentName(tournament)} - {formatBuyIn(tournament.buyIn, tournament.site || '')}
            </div>
            {/* #10 + #20: Prize with consistent styling and min validation */}
            <div className="flex flex-col">
              <label className="text-xs text-emerald-400 font-medium mb-1">Premio ({currency.symbol})</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                className="border-gray-600 bg-gray-800 text-white h-12 text-sm p-2 text-center font-bold shadow-lg focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={registrationData[tournament.id]?.prize || ''}
                onChange={(e) => {
                  const normalizedValue = normalizeDecimalInput(e.target.value);
                  onSetRegistrationData(prev => ({
                    ...prev,
                    [tournament.id]: {
                      ...prev[tournament.id],
                      prize: normalizedValue,
                      bounty: prev[tournament.id]?.bounty || '',
                      position: prev[tournament.id]?.position || ''
                    }
                  }));
                }}
              />
            </div>
            {/* GL-F (UX 2026-04-24): Bounty so aparece para PKO/Mystery */}
            {shouldShowBountyField(tournament.type) && (
              <div className="flex flex-col" data-testid="result-dialog-bounty-field">
                <label className="text-xs text-blue-400 font-medium mb-1">Bounty ({currency.symbol})</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="border-gray-600 bg-gray-800 text-white h-12 text-sm p-2 text-center font-bold shadow-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={registrationData[tournament.id]?.bounty || ''}
                  onChange={(e) => {
                    const normalizedValue = normalizeDecimalInput(e.target.value);
                    onSetRegistrationData(prev => ({
                      ...prev,
                      [tournament.id]: {
                        ...prev[tournament.id],
                        bounty: normalizedValue,
                        prize: prev[tournament.id]?.prize || '',
                        position: prev[tournament.id]?.position || ''
                      }
                    }));
                  }}
                />
              </div>
            )}
            {/* #10 + #20: Position with consistent styling and min=1 */}
            <div className="flex flex-col">
              <label className="text-xs text-white font-medium mb-1">Posicao</label>
              <Input
                type="number"
                step="1"
                min="1"
                inputMode="numeric"
                placeholder="Ex: 1"
                className="border-gray-600 bg-gray-800 text-white h-12 text-sm p-2 text-center font-bold shadow-lg focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={registrationData[tournament.id]?.position || ''}
                onChange={(e) => onSetRegistrationData(prev => ({
                  ...prev,
                  [tournament.id]: {
                    ...prev[tournament.id],
                    position: e.target.value,
                    bounty: prev[tournament.id]?.bounty || '',
                    prize: prev[tournament.id]?.prize || ''
                  }
                }))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowResultDialog(false)}
                className="flex-1 bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  onFinishDirect(tournament.id);
                  setShowResultDialog(false);
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                Salvar e Finalizar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {index < totalCount - 1 && <div className="h-px bg-blue-600/30 my-1" />}
    </div>
  );
}

function UpcomingCard({
  tournament, registered,
  onRegister, onRegisterWithTicket, onEdit, onDelete, queryClient,
  isSelected, onToggleSelect,
  onOpenTournamentAlert, onMaxLateChange,
}: TournamentCardUpcomingProps) {
  const guaranteedValue = getGuaranteedValue(tournament);
  const { isLow, borderClass: priorityBorder } = resolvePriority(tournament);

  // Sprint Tickets-2 (RF-05) — payment dialog state
  const ticketMatches = useTicketMatchesForTournament(tournament);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const handleRegisterClick = () => {
    if (ticketMatches.length > 0 && typeof onRegisterWithTicket === 'function') {
      setShowPaymentDialog(true);
    } else {
      onRegister(tournament.id);
    }
  };

  // Late reg countdown - update every 60s
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const lateRegInfo = (() => {
    if (!tournament.lateRegMinutes || tournament.lateRegMinutes <= 0 || !tournament.time) return null;
    const [h, m] = tournament.time.split(':').map(Number);
    const startTime = new Date();
    startTime.setHours(h, m, 0, 0);
    const deadline = calculateLateRegDeadline(startTime, tournament.lateRegMinutes);
    const minutesRemaining = Math.floor((deadline.getTime() - now.getTime()) / 60000);
    const color = getLateRegColor(minutesRemaining);
    const hh = String(deadline.getHours()).padStart(2, '0');
    const mm = String(deadline.getMinutes()).padStart(2, '0');
    return { deadline, minutesRemaining, color, hh, mm };
  })();
  const regTimeExplicit = tournament.registrationTime && String(tournament.registrationTime).trim() !== ''
    ? String(tournament.registrationTime)
    : null;
  const regDeadlineLabel = getRegDeadlineLabel(tournament.time, tournament.lateRegMinutes);
  const primaryTimeLabel = regTimeExplicit ?? regDeadlineLabel ?? tournament.time ?? '—';
  const startSubtitle = (regTimeExplicit || regDeadlineLabel) && tournament.time && tournament.time !== primaryTimeLabel
    ? tournament.time
    : null;

  return (
    <div className={`tournament-card tournament-upcoming mt-[6px] mb-[6px] ml-[0px] mr-[0px] pt-[0px] pb-[0px] relative ${priorityBorder} ${isSelected ? 'ring-2 ring-emerald-500' : ''}`}>
      {/* #2 + #43: Selection checkbox moved to right, with aria-label */}
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={isSelected || false}
          onChange={() => onToggleSelect(tournament.id)}
          aria-label={`Selecionar ${tournament.name || 'torneio'}`}
          className="absolute top-2 right-2 w-4 h-4 rounded border-gray-500 bg-gray-700 text-emerald-500 focus:ring-emerald-500 z-10 cursor-pointer"
        />
      )}
      {/* RF-11: Status badge */}
      <Badge className="absolute top-1 left-1 px-1.5 py-0.5 text-xs bg-gray-600 text-white">
        Proximo
      </Badge>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {/* #6 + #47: Time and name on separate lines */}
          <div className="mb-2 mt-4">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <time dateTime={tournament.time || ''} className="text-emerald-400 font-mono text-sm font-bold">
                {primaryTimeLabel}
              </time>
              {startSubtitle && (
                <span className="text-gray-400 text-xs">(inicio {startSubtitle})</span>
              )}
              {!tournament.time && !regTimeExplicit && (
                <span className="text-red-400 text-xs ml-1">(sem horario)</span>
              )}
            </div>
            <div className={`font-semibold ml-7 truncate ${isLow ? 'text-gray-400' : 'text-white'}`}>{generateTournamentName(tournament)}</div>
          </div>
          <div className="flex gap-1 text-xs mb-2 ml-7 flex-wrap items-center">
            <PriorityBadge tournament={tournament} />
            <MaxLateChip tournament={tournament} />
            <Badge className={`px-1.5 py-0.5 text-white ${getSiteColor(tournament.site)}`}>
              {tournament.site}
            </Badge>
            <Badge className={`px-1.5 py-0.5 text-white ${getCategoryColor(tournament.type || tournament.category || 'Vanilla')}`}>
              {tournament.type || tournament.category || 'Vanilla'}
            </Badge>
            <Badge className={`px-1.5 py-0.5 text-white ${getSpeedColor(tournament.speed || 'Normal')}`}>
              {tournament.speed || 'Normal'}
            </Badge>
            {tournament.gameType && (
              <Badge className={`px-1.5 py-0.5 text-white ${tournament.gameType === 'PLO' ? 'bg-purple-600' : 'bg-blue-500'}`}>
                {tournament.gameType}
              </Badge>
            )}
            {/* Add-on + Re-entry badges (ADR-014) */}
            {tournament.allowsAddOn && (
              <Badge className="px-1.5 py-0.5 bg-amber-600 text-white font-semibold">
                Plus
              </Badge>
            )}
            {tournament.allowsReentry && (
              <Badge className="px-1.5 py-0.5 bg-purple-600 text-white font-semibold">
                ReA
              </Badge>
            )}
            {/* Suprema: badge com numero de entradas registradas */}
            {tournament.site === 'Suprema' && (() => {
              const actualId = tournament.id?.startsWith('planned-') ? tournament.id.substring(8) : tournament.id;
              const entryCount = (registered || []).filter((st: any) =>
                (st.plannedTournamentId === actualId) ||
                (st.site === 'Suprema' && st.name === tournament.name && st.buyIn === tournament.buyIn && st.time === tournament.time && st.id !== tournament.id)
              ).length;
              return entryCount > 0 ? (
                <Badge className="px-1.5 py-0.5 bg-amber-600 text-white font-bold">
                  Reg: {entryCount}
                </Badge>
              ) : null;
            })()}
          </div>
          {/* Enriched secondary line */}
          {(tournament.startingStack || tournament.maxPlayers || tournament.blindLevelMinutes) && (
            <div className="text-xs text-gray-400 ml-7 mb-1">
              {[
                tournament.startingStack ? `Stack: ${formatStack(tournament.startingStack)}` : null,
                tournament.maxPlayers ? `Max: ${tournament.maxPlayers}` : null,
                tournament.blindLevelMinutes ? `Blinds: ${tournament.blindLevelMinutes}min` : null,
              ].filter(Boolean).join(' | ')}
            </div>
          )}
          {/* Item 14: Late reg visual with colored badges */}
          {lateRegInfo && (
            <div className={`flex items-center gap-1 text-xs ml-7 mb-1`}>
              <Clock className="w-3 h-3" />
              {lateRegInfo.color === 'expired' ? (
                <span className="text-gray-500 line-through">Late encerrado</span>
              ) : (
                <Badge className={`px-1.5 py-0.5 text-xs ${
                  lateRegInfo.color === 'red' ? 'bg-red-600/20 text-red-400 border border-red-600/30'
                  : lateRegInfo.color === 'yellow' ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/30'
                  : 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
                }`}>
                  Late ate {lateRegInfo.hh}:{lateRegInfo.mm} ({lateRegInfo.minutesRemaining}min)
                </Badge>
              )}
            </div>
          )}
          {/* Item 9: Buy-in with currency */}
          <div className="text-gray-200 ml-7 text-lg font-bold">
            Buy-in: <span className="text-poker-green font-semibold">{formatBuyIn(tournament.buyIn, tournament.site || '')}</span>
            {guaranteedValue && guaranteedValue > 0 && (
              <span className="ml-3 text-blue-400">| <span className="font-semibold">{getCurrencyForSite(tournament.site || '').symbol}{formatNumberWithDots(guaranteedValue)} GTD</span></span>
            )}
          </div>
        </div>
        {/* Grid 3x2 Layout — Fix 9 (apos remocao Horario + AlertBellPopover) */}
        <div className="flex flex-col gap-2 w-64 max-w-64">
        <div className="grid grid-cols-[1fr_1.3fr] grid-rows-3 gap-2">
          {/* Editar */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(tournament)}
            className="border-2 border-blue-500 bg-gradient-to-r from-blue-600/60 to-blue-700/60 text-blue-100 hover:from-blue-500/80 hover:to-blue-600/80 hover:text-white h-10 px-2 text-xs font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
          >
            <Edit className="w-3 h-3 mr-1" />
            Editar
          </Button>

          {/* REGISTRAR (3 rows span) */}
          <Button
            size="sm"
            onClick={handleRegisterClick}
            data-testid={`btn-register-${tournament.id}`}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white row-span-3 h-[136px] px-2 text-sm font-bold shadow-xl transform hover:scale-105 transition-all duration-200 border-2 border-blue-400/50 relative"
          >
            <div className="flex flex-col items-center justify-center">
              <UserPlus className="w-4 h-4 mb-1" />
              <span>REGISTRAR</span>
              {ticketMatches.length > 0 && (
                <span
                  data-testid={`ticket-available-badge-${tournament.id}`}
                  className="mt-1 text-[10px] bg-emerald-500/90 text-white rounded px-1 py-0.5 font-semibold"
                  title="Ticket disponivel"
                >
                  TICKET
                </span>
              )}
            </div>
          </Button>

          {/* RF-05 RegisterPaymentDialog */}
          {ticketMatches.length > 0 && typeof onRegisterWithTicket === 'function' && (
            <RegisterPaymentDialog
              tournament={tournament}
              open={showPaymentDialog}
              onOpenChange={setShowPaymentDialog}
              onConfirmCash={() => onRegister(tournament.id)}
              onConfirmTicket={(ticketId) => onRegisterWithTicket(tournament.id, ticketId)}
            />
          )}

          {/* Alerta unico (Sprint Alarmes 2.0 — abre TournamentAlertDialog) */}
          <Button
            size="sm"
            variant="outline"
            data-testid={`tournament-alert-btn-${tournament.id}`}
            onClick={() => onOpenTournamentAlert?.(tournament.id)}
            disabled={!onOpenTournamentAlert}
            title="Criar alerta para este torneio"
            className="border-2 border-amber-500 bg-gradient-to-r from-amber-600/60 to-amber-700/60 text-amber-100 hover:from-amber-500/80 hover:to-amber-600/80 hover:text-white h-10 px-2 text-xs font-semibold shadow-lg transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Bell className="w-3 h-3 mr-1" />
            Alerta
          </Button>

          {/* Excluir — confirmacao via shadcn AlertDialog em GrindSessionLive (handleDeleteTournament) */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(tournament.id)}
            className="border-2 border-red-500 bg-gradient-to-r from-red-600/60 to-red-700/60 text-red-100 hover:from-red-500/80 hover:to-red-600/80 hover:text-white h-10 px-2 text-xs font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
          >
            <X className="w-3 h-3 mr-1" />
            Excluir
          </Button>
        </div>
        {/* Max Late — pequeno, abaixo do REGISTRAR (RF-03) */}
        {onMaxLateChange && (
          <MaxLateControl tournament={tournament} onMaxLateChange={onMaxLateChange} variant="block" />
        )}
        </div>
      </div>
    </div>
  );
}

function CompletedCard({
  tournament, onEdit, onUnregister, queryClient, onAddOnTaken,
}: TournamentCardCompletedProps) {
  const guaranteedValue = getGuaranteedValue(tournament);
  // Sprint D / RF-01.1 — add-on retroativo no CompletedCard.
  const addOnCostNum = (() => {
    if (tournament.addOnCost == null) return 0;
    const n = typeof tournament.addOnCost === 'number'
      ? tournament.addOnCost
      : parseFloat(String(tournament.addOnCost));
    return Number.isFinite(n) ? n : 0;
  })();
  const showRetroAddOn = !!onAddOnTaken
    && tournament.status === 'finished'
    && !!tournament.allowsAddOn
    && !tournament.addOnTaken
    && addOnCostNum > 0;

  return (
    <div className="tournament-card tournament-finished relative">
      {/* RF-11: Status badge */}
      <Badge className={`absolute top-1 left-1 px-1.5 py-0.5 text-xs ${
        tournament.status === 'finished' && parseFloat(tournament.result || '0') === 0 && !tournament.position
          ? 'bg-red-600 text-white' // Bust
          : 'bg-blue-600 text-white' // Finalizado
      }`}>
        {tournament.status === 'finished' && parseFloat(tournament.result || '0') === 0 && !tournament.position ? 'Bust' : 'Finalizado'}
      </Badge>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          {/* #6 + #47: Time and name on separate lines */}
          <div className="mb-2 mt-4">
            <div className="flex items-center gap-3">
              <Trophy className="w-4 h-4 text-poker-accent flex-shrink-0" />
              <time dateTime={tournament.time || ''} className="text-emerald-400 font-mono text-sm font-bold">
                {tournament.time || '\u2014'}
              </time>
              {!tournament.time && (
                <span className="text-red-400 text-xs ml-1">(sem horario)</span>
              )}
            </div>
            <div className="font-semibold text-white ml-7 truncate">{generateTournamentName(tournament)}</div>
          </div>
          <div className="flex gap-1 text-xs mb-2 ml-7 flex-wrap items-center">
            <PriorityBadge tournament={tournament} />
            <MaxLateChip tournament={tournament} />
            <Badge className={`px-1.5 py-0.5 text-white ${getSiteColor(tournament.site)}`}>
              {tournament.site}
            </Badge>
            <Badge className={`px-1.5 py-0.5 text-white ${getCategoryColor(tournament.type || tournament.category || 'Vanilla')}`}>
              {tournament.type || tournament.category || 'Vanilla'}
            </Badge>
            <Badge className={`px-1.5 py-0.5 text-white ${getSpeedColor(tournament.speed || 'Normal')}`}>
              {tournament.speed || 'Normal'}
            </Badge>
            {(tournament.rebuys || 0) > 0 && (
              <Badge className="bg-yellow-600 px-1.5 py-0.5 text-white">
                {(tournament.rebuys || 0) + 1}x
              </Badge>
            )}
            {/* Add-on + Re-entry badges (ADR-014) */}
            {tournament.allowsAddOn && !tournament.addOnTaken && (
              <Badge className="px-1.5 py-0.5 bg-amber-600 text-white font-semibold">
                Plus
              </Badge>
            )}
            {tournament.addOnTaken && (
              <Badge className="px-1.5 py-0.5 bg-amber-500 text-white font-semibold">
                + Add-on pago
              </Badge>
            )}
            {tournament.allowsReentry && (
              <Badge className="px-1.5 py-0.5 bg-purple-600 text-white font-semibold">
                ReA
              </Badge>
            )}
            {(tournament.reentries || 0) > 0 && (
              <Badge className="px-1.5 py-0.5 bg-purple-700 text-white font-semibold">
                Tentativa {(tournament.reentries || 0) + 1}
                {tournament.maxReentries != null ? `/${tournament.maxReentries + 1}` : '/∞'}
              </Badge>
            )}
          </div>
          {/* Item 9: Buy-in with currency */}
          <div className="text-sm text-gray-200 ml-7">
            Buy-in: <span className="text-poker-green font-semibold">{formatBuyIn(tournament.buyIn, tournament.site || '')}</span>
            {guaranteedValue && guaranteedValue > 0 && (
              <span className="ml-3 text-blue-400">| <span className="font-semibold">{getCurrencyForSite(tournament.site || '').symbol}{formatNumberWithDots(guaranteedValue)} GTD</span></span>
            )}
            {tournament.rebuys > 0 && (
              <span className="ml-4">Rebuys: <span className="text-yellow-400 font-semibold">{tournament.rebuys}</span></span>
            )}
            {tournament.result && parseFloat(tournament.result) > 0 && (
              <span className="ml-4">Prize: <span className="text-green-400 font-semibold">{formatBuyIn(tournament.result, tournament.site || '')}</span></span>
            )}
            {tournament.position && (
              <span className="ml-4">Posicao: <span className="text-orange-400 font-semibold">{tournament.position}o</span></span>
            )}
          </div>
        </div>
        {/* Grid 2x3 Layout para CONCLUIDOS */}
        <div className="grid grid-cols-[1fr_1fr_1.3fr] grid-rows-2 gap-2 w-72 max-w-72">
          {/* Sprint D / RF-01.1 — Add-on retroativo */}
          {showRetroAddOn ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAddOnTaken!(tournament.id, true)}
              data-testid="btn-addon-retroativo"
              title={`Marcar add-on como pago retroativamente ($${formatAddOnCost(tournament)})`}
              className="border-2 border-emerald-500 bg-gradient-to-r from-emerald-600/70 to-emerald-700/70 text-white hover:from-emerald-500/80 hover:to-emerald-600/80 h-10 px-2 text-xs font-semibold shadow-lg transition-all duration-200"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add-on
            </Button>
          ) : (
            <div></div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(tournament)}
            className="border-2 border-blue-500 bg-gradient-to-r from-blue-600/60 to-blue-700/60 text-blue-100 hover:from-blue-500/80 hover:to-blue-600/80 hover:text-white h-10 px-2 text-xs font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
          >
            <Edit className="w-3 h-3 mr-1" />
            Editar
          </Button>
          <div></div>

          {/* #14: Notificar disabled in completed cards too */}
          <Button
            size="sm"
            variant="outline"
            disabled
            title="Em breve"
            aria-label="Notificar - Em breve"
            className="border-2 border-gray-500 bg-gradient-to-r from-gray-600/60 to-gray-700/60 text-gray-300 opacity-50 cursor-not-allowed h-10 px-2 text-xs font-semibold shadow-lg transition-all duration-200"
          >
            <Bell className="w-3 h-3 mr-1" />
            Em breve
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => onUnregister(tournament.id)}
            className="border-2 border-yellow-500 bg-gradient-to-r from-yellow-600/60 to-yellow-700/60 text-yellow-100 hover:from-yellow-500/80 hover:to-yellow-600/80 hover:text-white h-10 px-2 text-xs font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
          >
            <Undo2 className="w-3 h-3 mr-1" />
            Desfazer
          </Button>

          <div></div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Sprint Tickets-1 (RF-02) — Named export para satellite result flow
//
// Componente leve focado no fluxo de resultado de torneio Satellite.
// Coexiste com o default export (RegisteredCard/UpcomingCard/CompletedCard).
// =============================================================================

import { apiRequest as ticketApiRequest, queryClient as ticketsQueryClient } from "@/lib/queryClient";
import { RegisterTicketDialog as TicketRecoveryDialog } from "@/components/tickets/RegisterTicketDialog";

export interface TournamentCardSatelliteProps {
  tournament: any;
  registered?: boolean;
  index?: number;
  totalCount?: number;
  registrationData?: any;
  onSetRegistrationData?: any;
  onFinishDirect?: (id: string) => void;
  onUnregister?: (id: string) => void;
  onBust?: (id: string) => void;
  onLateReg?: (id: string) => void;
  onEdit?: (t: any) => void;
  onEditTime?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRegister?: (id: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onCreateLateRegAlert?: any;
  hasAlertForTournament?: any;
  queryClient?: any;
}

function TournamentCardSatellite(props: TournamentCardSatelliteProps) {
  const { tournament } = props;
  const isSatellite = tournament?.type === "Satellite";
  const rewardType: string | null = tournament?.satelliteRewardType ?? null;

  const [resultOpen, setResultOpen] = useState(false);
  const [outcome, setOutcome] = useState<"ticket" | "cash" | "nopass" | null>(null);
  const [ticketValue, setTicketValue] = useState<string>(
    tournament?.satelliteTicketValue ? String(tournament.satelliteTicketValue) : "",
  );
  const [cashPrize, setCashPrize] = useState<string>("");
  const [position, setPosition] = useState<string>("");
  const [valueError, setValueError] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryToast, setRecoveryToast] = useState<boolean>(false);

  useEffect(() => {
    if (!resultOpen) return;
    if (rewardType === "cash") setOutcome("cash");
    else if (rewardType === "ticket" || rewardType === "package") setOutcome("ticket");
    else setOutcome(null);
  }, [resultOpen, rewardType]);

  const ticketDisabled = rewardType === "cash";
  const cashDisabled = rewardType === "ticket" || rewardType === "package";

  function openResult() {
    setResultOpen(true);
    setValueError(null);
    setRecoveryToast(false);
  }

  async function onSubmit() {
    if (!isSatellite) return;
    setValueError(null);

    if (outcome === "ticket") {
      const v = parseFloat(ticketValue);
      if (!ticketValue || !Number.isFinite(v) || v <= 0) {
        setValueError("Valor do ticket obrigatorio");
        return;
      }

      let putOk = false;
      try {
        await ticketApiRequest("PUT", `/api/session-tournaments/${tournament.id}`, {
          status: "finished",
          prize: 0,
          position: position ? parseInt(position, 10) : undefined,
        });
        putOk = true;
      } catch (err) {
        return;
      }

      // B3 fix: priorizar templateId quando ambos targetTemplateId E
      // satelliteTargetName estao preenchidos (route tem XOR estrito).
      const ticketBody: any = {
        source: "satellite_result",
        sourceSessionTournamentId: tournament.id,
        targetSite: tournament.site ?? undefined,
        ticketValueUSD: v,
      };
      if (tournament.satelliteTargetTemplateId) {
        ticketBody.targetTemplateId = tournament.satelliteTargetTemplateId;
      } else if (tournament.satelliteTargetName) {
        ticketBody.targetName = tournament.satelliteTargetName;
      }

      try {
        await ticketApiRequest("POST", "/api/tickets", ticketBody);
        // B2 fix: invalidar cache de tickets apos POST sucesso para refletir
        // imediatamente no widget do dashboard.
        try { ticketsQueryClient.invalidateQueries({ queryKey: ["/api/tickets"] }); } catch { /* noop */ }
        // Tambem invalidar session-tournaments para o card sair de upcoming/registered.
        try { ticketsQueryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] }); } catch { /* noop */ }
        setResultOpen(false);
      } catch (err) {
        if (putOk) setRecoveryToast(true);
      }
      return;
    }

    if (outcome === "cash") {
      try {
        await ticketApiRequest("PUT", `/api/session-tournaments/${tournament.id}`, {
          status: "finished",
          prize: cashPrize ? parseFloat(cashPrize) : 0,
          position: position ? parseInt(position, 10) : undefined,
        });
        // B2 fix: invalidar session-tournaments para o card refrescar.
        try { ticketsQueryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] }); } catch { /* noop */ }
        setResultOpen(false);
      } catch (err) {
        // mantem aberto
      }
      return;
    }

    if (outcome === "nopass") {
      try {
        await ticketApiRequest("PUT", `/api/session-tournaments/${tournament.id}`, {
          status: "finished",
          prize: 0,
          position: position ? parseInt(position, 10) : undefined,
        });
        // B2 fix: invalidar session-tournaments para o card refrescar.
        try { ticketsQueryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] }); } catch { /* noop */ }
        setResultOpen(false);
      } catch (err) {
        // mantem aberto
      }
      return;
    }
  }

  return (
    <div className="tournament-card-satellite">
      <button
        data-testid={`tournament-card-result-button-${tournament.id}`}
        onClick={openResult}
        className="px-2 py-1 bg-blue-600 rounded text-sm"
      >
        Resultado
      </button>

      {resultOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 flex items-center justify-center bg-black/60 z-50"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-w-md w-full">
            <h3 className="font-semibold mb-3">Resultado do torneio</h3>

            {isSatellite && (
              <div className="flex gap-2 mb-3">
                <button
                  data-testid="satellite-outcome-ticket"
                  onClick={() => setOutcome("ticket")}
                  disabled={ticketDisabled}
                  className={`flex-1 px-2 py-1 rounded ${
                    outcome === "ticket" ? "bg-emerald-600" : "bg-zinc-800"
                  } ${ticketDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  Ganhei ticket
                </button>
                <button
                  data-testid="satellite-outcome-cash"
                  onClick={() => setOutcome("cash")}
                  disabled={cashDisabled}
                  className={`flex-1 px-2 py-1 rounded ${
                    outcome === "cash" ? "bg-emerald-600" : "bg-zinc-800"
                  } ${cashDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  Ganhei cash
                </button>
                <button
                  data-testid="satellite-outcome-nopass"
                  onClick={() => setOutcome("nopass")}
                  className={`flex-1 px-2 py-1 rounded ${
                    outcome === "nopass" ? "bg-emerald-600" : "bg-zinc-800"
                  }`}
                >
                  Nao passei
                </button>
              </div>
            )}

            {isSatellite && outcome === "ticket" && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs">Valor do ticket (USD)</label>
                  <input
                    data-testid="satellite-ticket-value-input"
                    type="number"
                    step="0.01"
                    value={ticketValue}
                    onChange={(e) => setTicketValue(e.target.value)}
                    className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
                  />
                  {valueError && (
                    <span data-testid="satellite-ticket-value-error" className="text-xs text-red-400">
                      {valueError}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-xs">Posicao</label>
                  <input
                    type="number"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
                  />
                </div>
              </div>
            )}

            {isSatellite && outcome === "cash" && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs">Premio (cash)</label>
                  <input
                    data-testid="satellite-cash-prize-input"
                    type="number"
                    step="0.01"
                    value={cashPrize}
                    onChange={(e) => setCashPrize(e.target.value)}
                    className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs">Posicao</label>
                  <input
                    type="number"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
                  />
                </div>
              </div>
            )}

            {isSatellite && outcome === "nopass" && (
              <div className="space-y-2">
                <p className="text-sm text-zinc-400">Sem premio. Sem ticket.</p>
                <div>
                  <label className="block text-xs">Posicao (opcional)</label>
                  <input
                    type="number"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
                  />
                </div>
              </div>
            )}

            {recoveryToast && (
              <div
                data-testid="satellite-ticket-recovery-toast"
                className="mt-3 p-2 bg-amber-700/30 border border-amber-700 rounded text-xs"
              >
                Resultado salvo, mas falha ao criar ticket.
                <button
                  data-testid="satellite-ticket-recovery-cta"
                  onClick={() => setRecoveryOpen(true)}
                  className="ml-2 underline"
                >
                  Registrar manualmente
                </button>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setResultOpen(false)}
                className="px-3 py-1 border border-zinc-700 rounded"
              >
                Fechar
              </button>
              <button
                data-testid="satellite-result-submit"
                onClick={onSubmit}
                className="px-3 py-1 bg-emerald-600 rounded"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {recoveryOpen && (
        <TicketRecoveryDialog
          open={recoveryOpen}
          onOpenChange={setRecoveryOpen}
          initialValues={{
            targetName: tournament?.satelliteTargetName ?? "",
            targetSite: tournament?.site ?? "",
            ticketValueUSD: ticketValue ? parseFloat(ticketValue) : undefined,
            note: `Vindo do satelite #${tournament?.id ?? ""}`,
          }}
        />
      )}
    </div>
  );
}

// Named export para Sprint Tickets-1 (RF-02). Resolve conflito com `function
// TournamentCard` default export (mode-based) — o named export e dedicado ao
// fluxo de resultado de Satellite.
export { TournamentCardSatellite as TournamentCard };
