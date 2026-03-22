import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Clock, Coins, Edit, X, Undo2, UserPlus, Trophy, Bell, CheckCircle } from "lucide-react";
import { calculateLateRegDeadline, formatStack, getLateRegColor } from "@/lib/lateRegUtils";
import { formatBuyIn, getCurrencyForSite } from "@shared/platform-currency";
import {
  getSiteColor, getCategoryColor, getSpeedColor,
  getPrioridadeColor, getPrioridadeLabel,
  getRebuyCounterClass, getRebuyText,
  formatNumberWithDots, normalizeDecimalInput,
  generateTournamentName, getGuaranteedValue,
} from './helpers';
import type { RegistrationData } from './types';

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
}

interface TournamentCardUpcomingProps {
  mode: 'upcoming';
  tournament: any;
  registered: any[];
  onRegister: (id: string) => void;
  onEditTime: (id: string) => void;
  onEdit: (tournament: any) => void;
  onDelete: (id: string) => void;
  queryClient: any;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

interface TournamentCardCompletedProps {
  mode: 'completed';
  tournament: any;
  onEdit: (tournament: any) => void;
  onUnregister: (id: string) => void;
  queryClient: any;
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
}: TournamentCardRegisteredProps) {
  const guaranteedValue = getGuaranteedValue(tournament);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const currency = getCurrencyForSite(tournament.site || '');

  return (
    <div className={`tournament-card tournament-registered pt-[2px] pb-[2px] ${isSelected ? 'ring-2 ring-emerald-500' : ''}`}>
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
                {tournament.time || '\u2014'}
              </time>
              {!tournament.time && (
                <span className="text-red-400 text-xs ml-1">(sem horario)</span>
              )}
            </div>
            <div className="font-medium text-white text-sm truncate ml-6">{generateTournamentName(tournament)}</div>
          </div>
          {/* Item 3: Badges in one line */}
          <div className="flex gap-1 flex-wrap text-xs">
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

      {/* Item 3 & 4: Result dialog with currency-aware fields */}
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
            {/* #10 + #20: Bounty with consistent styling and min validation */}
            <div className="flex flex-col">
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

      {index < totalCount - 1 && <div className="h-px bg-blue-600/30 my-1" />}
    </div>
  );
}

function UpcomingCard({
  tournament, registered,
  onRegister, onEditTime, onEdit, onDelete, queryClient,
  isSelected, onToggleSelect,
}: TournamentCardUpcomingProps) {
  const guaranteedValue = getGuaranteedValue(tournament);

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

  return (
    <div className={`tournament-card tournament-upcoming mt-[6px] mb-[6px] ml-[0px] mr-[0px] pt-[0px] pb-[0px] relative ${isSelected ? 'ring-2 ring-emerald-500' : ''}`}>
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
                {tournament.time || '\u2014'}
              </time>
              {!tournament.time && (
                <span className="text-red-400 text-xs ml-1">(sem horario)</span>
              )}
            </div>
            <div className="font-semibold text-white ml-7 truncate">{generateTournamentName(tournament)}</div>
          </div>
          <div className="flex gap-1 text-xs mb-2 ml-7">
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
        {/* Grid 2x3 Layout */}
        <div className="grid grid-cols-[1fr_1fr_1.3fr] grid-rows-2 gap-2 w-72 max-w-72">
          {/* Horario */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEditTime(tournament.id)}
            className="border-2 border-orange-500 bg-gradient-to-r from-orange-600/60 to-orange-700/60 text-orange-100 hover:from-orange-500/80 hover:to-orange-600/80 hover:text-white h-10 px-2 text-xs font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
          >
            <Clock className="w-3 h-3 mr-1" />
            Horario
          </Button>

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

          {/* REGISTRAR (2 rows) */}
          <Button
            size="sm"
            onClick={() => onRegister(tournament.id)}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white row-span-2 h-[84px] px-2 text-sm font-bold shadow-xl transform hover:scale-105 transition-all duration-200 border-2 border-blue-400/50"
          >
            <div className="flex flex-col items-center justify-center">
              <UserPlus className="w-4 h-4 mb-1" />
              <span>REGISTRAR</span>
            </div>
          </Button>

          {/* #14: Notificar disabled - feature not implemented */}
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

          {/* Excluir */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (window.confirm('Tem certeza que deseja excluir este torneio da lista?')) {
                onDelete(tournament.id);
              }
            }}
            className="border-2 border-red-500 bg-gradient-to-r from-red-600/60 to-red-700/60 text-red-100 hover:from-red-500/80 hover:to-red-600/80 hover:text-white h-10 px-2 text-xs font-semibold shadow-lg transform hover:scale-105 transition-all duration-200"
          >
            <X className="w-3 h-3 mr-1" />
            Excluir
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompletedCard({
  tournament, onEdit, onUnregister, queryClient,
}: TournamentCardCompletedProps) {
  const guaranteedValue = getGuaranteedValue(tournament);

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
          <div className="flex gap-1 text-xs mb-2 ml-7">
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
          <div></div>
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
