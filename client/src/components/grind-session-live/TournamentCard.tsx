import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Clock, Coins, Edit, X, Undo2, UserPlus, Trophy, Bell } from "lucide-react";
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
}: TournamentCardRegisteredProps) {
  const guaranteedValue = getGuaranteedValue(tournament);

  return (
    <div className="tournament-card tournament-registered pt-[2px] pb-[2px]">
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
          <div className="flex items-center gap-2 mb-1">
            <PlayCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span className="font-bold text-blue-400 text-sm">
              {tournament.time || '—'}
            </span>
            {!tournament.time && (
              <span className="text-red-400 text-xs ml-1">(sem horario)</span>
            )}
            <span className="font-medium text-white text-sm truncate">{generateTournamentName(tournament)}</span>
          </div>
          <div className="flex gap-1 text-xs">
            <Badge className={`px-1.5 py-0.5 text-white ${getSiteColor(tournament.site)}`}>
              {tournament.site}
            </Badge>
            <Badge className={`px-1.5 py-0.5 text-white ${getCategoryColor(tournament.type || tournament.category || 'Vanilla')}`}>
              {tournament.type || tournament.category || 'Vanilla'}
            </Badge>
            <Badge className={`px-1.5 py-0.5 text-white ${getSpeedColor(tournament.speed || 'Normal')}`}>
              {tournament.speed || 'Normal'}
            </Badge>
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
                className={`px-1.5 py-0.5 text-white cursor-pointer hover:opacity-80 transition-opacity ${getPrioridadeColor(tournament.prioridade || 2)}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPriorityClickCycle(tournament.id, tournament.prioridade || 2);
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
          <div className="text-xs text-gray-400 mt-1">
            Buy-in: <span className="text-poker-green font-medium">${formatNumberWithDots(tournament.buyIn)}</span>
            {guaranteedValue && guaranteedValue > 0 && (
              <span className="ml-3 text-blue-400">| <span className="font-medium">${formatNumberWithDots(guaranteedValue)} GTD</span></span>
            )}
          </div>
        </div>

        {/* Layout 5 Colunas: Grid 2x5 com Campos de Entrada e Botoes */}
        <div className="grid grid-cols-5 grid-rows-2 gap-4 w-[480px] max-w-[480px]">
          {/* Bounty */}
          <div className="row-span-2 flex flex-col justify-center ml-4">
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Bounty"
              className="flex rounded-md ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm bg-gradient-to-r from-blue-800/60 to-blue-700/60 border-2 border-blue-500/60 text-white h-[68px] w-14 text-xs p-1 text-center font-bold shadow-lg focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ml-[75px] mr-[75px]"
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

          {/* Prize */}
          <div className="row-span-2 flex flex-col justify-center ml-2">
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Prize"
              className="bg-gradient-to-r from-green-800/60 to-green-700/60 border-2 border-green-500/60 text-white h-[68px] w-16 text-xs font-bold shadow-lg focus:border-green-400 focus:ring-2 focus:ring-green-400/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pt-[4px] pb-[4px] pl-[4px] pr-[4px] mt-[0px] mb-[0px] ml-[50px] mr-[50px] text-center"
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

          {/* Position */}
          <div className="row-span-2 flex flex-col justify-center ml-2">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Pos"
              className="bg-gradient-to-r from-yellow-800/60 to-yellow-700/60 border-2 border-yellow-500/60 text-white h-[68px] w-12 text-xs p-1 text-center font-bold shadow-lg focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ml-[28px] mr-[28px] mt-[0px] mb-[0px]"
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

          {/* Rebuy */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRebuy(tournament)}
            className={`border-2 h-8 px-2 text-xs font-bold shadow-lg transform hover:scale-105 transition-all duration-200 ${
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
            REBUY
            {tournament.rebuys && tournament.rebuys > 0 ? ` (${tournament.rebuys})` : ''}
          </Button>

          {/* GG Button */}
          <Button
            onClick={() => onFinishDirect(tournament.id)}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-primary/90 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white row-span-2 h-[84px] px-2 text-sm font-bold shadow-xl transform hover:scale-105 transition-all duration-200 border-2 border-red-400/50 min-w-[90px] w-full mt-[0px] mb-[0px] ml-[-10px] mr-[-10px]"
          >
            <div className="flex flex-col items-center justify-center">
              <span className="text-lg mb-1">💀</span>
              <span>GG!</span>
            </div>
          </Button>

          {/* Max Late */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onSetMaxLateStates(prev => ({
                ...prev,
                [tournament.id]: !prev[tournament.id]
              }));
            }}
            title="Funcionalidade sera ativada em breve"
            className={`border-2 h-8 px-2 text-xs font-semibold shadow-lg transform hover:scale-105 transition-all duration-200 ${
              maxLateStates[tournament.id]
                ? 'border-green-500 bg-gradient-to-r from-green-600/80 to-green-700/80 text-green-100 hover:from-green-500/90 hover:to-green-600/90'
                : 'border-gray-500 bg-gradient-to-r from-gray-600/60 to-gray-700/60 text-gray-300 hover:from-gray-500/80 hover:to-gray-600/80'
            }`}
          >
            <Clock className="w-3 h-3 mr-1" />
            LATE
          </Button>
        </div>
      </div>
      {index < totalCount - 1 && <div className="h-px bg-blue-600/30 my-1" />}
    </div>
  );
}

function UpcomingCard({
  tournament, registered,
  onRegister, onEditTime, onEdit, onDelete, queryClient,
}: TournamentCardUpcomingProps) {
  const guaranteedValue = getGuaranteedValue(tournament);

  return (
    <div className="tournament-card tournament-upcoming mt-[6px] mb-[6px] ml-[0px] mr-[0px] pt-[0px] pb-[0px]">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="font-semibold text-gray-400">
              {tournament.time || '—'}
            </span>
            {!tournament.time && (
              <span className="text-red-400 text-xs ml-1">(sem horario)</span>
            )}
            <span className="font-semibold text-white">{generateTournamentName(tournament)}</span>
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
            {/* Suprema: badge com numero de entradas registradas */}
            {tournament.site === 'Suprema' && (() => {
              const actualId = tournament.id?.startsWith('planned-') ? tournament.id.substring(8) : tournament.id;
              const entryCount = (registered || []).filter((st: any) =>
                (st.plannedTournamentId === actualId) ||
                (st.site === 'Suprema' && st.name === tournament.name && st.buyIn === tournament.buyIn && st.time === tournament.time && st.id !== tournament.id)
              ).length;
              return entryCount > 0 ? (
                <Badge className="px-1.5 py-0.5 bg-amber-600 text-white font-bold">
                  {entryCount} {entryCount === 1 ? 'entrada' : 'entradas'}
                </Badge>
              ) : null;
            })()}
          </div>
          <div className="text-gray-300 ml-7 text-[22px]">
            Buy-in: <span className="text-poker-green font-semibold">${formatNumberWithDots(tournament.buyIn)}</span>
            {guaranteedValue && guaranteedValue > 0 && (
              <span className="ml-3 text-blue-400">| <span className="font-semibold">${formatNumberWithDots(guaranteedValue)} GTD</span></span>
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

          {/* Notificar */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const currentState = tournament.notifyActive || false;
              tournament.notifyActive = !currentState;
              queryClient.invalidateQueries({ queryKey: [`/api/session-tournaments/by-day/${new Date().getDay()}`] });
            }}
            title="Funcionalidade sera adicionada em breve"
            className={`border-2 h-10 px-2 text-xs font-semibold shadow-lg transform hover:scale-105 transition-all duration-200 ${
              tournament.notifyActive
                ? 'border-green-500 bg-gradient-to-r from-green-600/80 to-green-700/80 text-green-100 hover:from-green-500/90 hover:to-green-600/90'
                : 'border-gray-500 bg-gradient-to-r from-gray-600/60 to-gray-700/60 text-gray-300 hover:from-gray-500/80 hover:to-gray-600/80'
            }`}
          >
            <Bell className="w-3 h-3 mr-1" />
            {tournament.notifyActive ? 'ON' : 'OFF'}
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
    <div className="tournament-card tournament-finished">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-4 h-4 text-poker-accent flex-shrink-0" />
            <span className="font-semibold text-poker-accent">
              {tournament.time || '—'}
            </span>
            {!tournament.time && (
              <span className="text-red-400 text-xs ml-1">(sem horario)</span>
            )}
            <span className="font-semibold text-white">{generateTournamentName(tournament)}</span>
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
          <div className="text-sm text-gray-300 ml-7">
            Buy-in: <span className="text-poker-green font-semibold">${formatNumberWithDots(tournament.buyIn)}</span>
            {guaranteedValue && guaranteedValue > 0 && (
              <span className="ml-3 text-blue-400">| <span className="font-semibold">${formatNumberWithDots(guaranteedValue)} GTD</span></span>
            )}
            {tournament.rebuys > 0 && (
              <span className="ml-4">Rebuys: <span className="text-yellow-400 font-semibold">{tournament.rebuys}</span></span>
            )}
            {tournament.result && parseFloat(tournament.result) > 0 && (
              <span className="ml-4">Prize: <span className="text-green-400 font-semibold">${formatNumberWithDots(tournament.result)}</span></span>
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

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const currentState = tournament.notifyActive || false;
              tournament.notifyActive = !currentState;
              queryClient.invalidateQueries({ queryKey: [`/api/session-tournaments/by-day/${new Date().getDay()}`] });
            }}
            title="Funcionalidade sera adicionada em breve"
            className={`border-2 h-10 px-2 text-xs font-semibold shadow-lg transform hover:scale-105 transition-all duration-200 ${
              tournament.notifyActive
                ? 'border-green-500 bg-gradient-to-r from-green-600/80 to-green-700/80 text-green-100 hover:from-green-500/90 hover:to-green-600/90'
                : 'border-gray-500 bg-gradient-to-r from-gray-600/60 to-gray-700/60 text-gray-300 hover:from-gray-500/80 hover:to-gray-600/80'
            }`}
          >
            <Bell className="w-3 h-3 mr-1" />
            {tournament.notifyActive ? 'ON' : 'OFF'}
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
