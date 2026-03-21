import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Calendar } from "lucide-react";
import { SmartPlaceholders } from "./helpers";

// Preparation Indicator
const PreparationIndicator = ({ percentage }: { percentage: number }) => {
  const getIndicatorData = () => {
    if (percentage >= 80) {
      return {
        emoji: "🔥",
        text: "Altamente preparado",
        color: "text-green-400",
        bgColor: "bg-green-400/10"
      };
    }
    if (percentage >= 50) {
      return {
        emoji: "⚡",
        text: "Bem preparado",
        color: "text-yellow-400",
        bgColor: "bg-yellow-400/10"
      };
    }
    return {
      emoji: "⚠️",
      text: "Preparação baixa",
      color: "text-orange-400",
      bgColor: "bg-orange-400/10"
    };
  };

  const indicator = getIndicatorData();

  return (
    <div className={`preparation-indicator ${indicator.bgColor} ${indicator.color}`}>
      <span className="prep-emoji text-xl">{indicator.emoji}</span>
      <span className="prep-text text-sm font-medium">{indicator.text}</span>
    </div>
  );
};

// Enhanced Preparation Slider
const EnhancedPreparationSlider = ({
  value,
  onChange
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) => {
  const markers = [
    { value: 25, label: "25%" },
    { value: 50, label: "50%" },
    { value: 75, label: "75%" },
    { value: 100, label: "100%" }
  ];

  return (
    <div className="enhanced-slider-container">
      <div className="slider-header">
        <label className="field-label text-gray-300">Preparação (%)</label>
        <PreparationIndicator percentage={value[0]} />
      </div>

      <div className="slider-wrapper">
        <Slider
          value={value}
          onValueChange={onChange}
          max={100}
          min={0}
          step={5}
          className="prep-slider enhanced"
        />

        <div className="slider-markers">
          {markers.map((marker) => (
            <div
              key={marker.value}
              className="marker"
              style={{ left: `${marker.value}%` }}
            >
              <div className="marker-dot"></div>
              <span className="marker-label">{marker.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="slider-value">
        <span className="text-2xl font-bold text-green-400">{value[0]}%</span>
      </div>
    </div>
  );
};

// Loading Button (simple version for the modal)
const ModalLoadingButton = ({
  isLoading,
  onClick,
  children
}: {
  isLoading: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => {
  return (
    <Button
      onClick={onClick}
      disabled={isLoading}
      className="loading-button"
    >
      {isLoading ? (
        <div className="loading-content">
          <div className="spinner"></div>
          <span>Iniciando...</span>
        </div>
      ) : (
        children
      )}
    </Button>
  );
};

// Tournament Summary Component
interface TournamentSummaryProps {
  tournaments: any[];
}

const TournamentSummaryNew: React.FC<TournamentSummaryProps> = ({ tournaments }) => {
  const parseValue = (value: any): number => {
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return typeof value === 'number' ? value : 0;
  };

  const totalTournaments = tournaments.length;
  const averageBuyIn = tournaments.length > 0 ?
    tournaments.reduce((sum, t) => sum + parseValue(t.buyIn), 0) / tournaments.length : 0;

  const tournamentTimes = tournaments
    .filter(t => t.time)
    .map(t => t.time)
    .sort();

  const firstTime = tournamentTimes.length > 0 ? tournamentTimes[0] : null;
  const lastTime = tournamentTimes.length > 0 ? tournamentTimes[tournamentTimes.length - 1] : null;

  const siteData = tournaments.reduce((acc, tournament) => {
    const site = tournament.site || 'Outros';
    const buyInValue = parseValue(tournament.buyIn);

    if (!acc[site]) {
      acc[site] = { total: 0, buyIns: [] };
    }
    acc[site].total += buyInValue;
    acc[site].buyIns.push(buyInValue);
    return acc;
  }, {} as Record<string, { total: number; buyIns: number[] }>);

  const siteBankrolls = (Object.entries(siteData) as [string, { total: number; buyIns: number[] }][])
    .map(([site, siteInfo]) => ({
      site,
      required: Math.round(siteInfo.total * 1.5),
      total: siteInfo.total
    }))
    .sort((a, b) => b.required - a.required);

  const totalBankrollRequired = siteBankrolls.reduce((sum, s) => sum + s.required, 0);

  const getSiteColor = (site: string) => {
    const colors: Record<string, string> = {
      'WPN': '🟢',
      'PokerStars': '🔴',
      'GGPoker': '⚫',
      'Chico': '🔴',
      '888poker': '🔵',
      'CoinPoker': '🩷',
      'Revolution': '🩷',
      'PartyPoker': '🟡',
      'Coin': '🩷',
      'Bodog': '🟣'
    };
    return colors[site] || '⚪';
  };

  const formatMoney = (value: number) => {
    if (isNaN(value) || !isFinite(value) || value <= 0) {
      return '$0';
    }

    const roundedValue = Math.round(value);

    if (roundedValue >= 1000) {
      return `$${roundedValue.toLocaleString('pt-BR')}`;
    }

    return `$${roundedValue}`;
  };

  return (
    <div className="space-y-3 max-w-full overflow-hidden">
      <div className="text-white text-sm font-medium break-words">
        <span className="text-emerald-400">{totalTournaments}</span> torneios |
        ABI <span className="text-green-400">{formatMoney(averageBuyIn)}</span>
        {firstTime && lastTime && (
          <div className="mt-1 text-blue-400">
            Registro: {firstTime} - {lastTime}
          </div>
        )}
      </div>

      <div className="text-white text-sm break-words">
        <div className="flex flex-wrap items-center gap-1">
          <span>Banca Necessária:</span>
          <span className="text-yellow-400 font-bold">{formatMoney(totalBankrollRequired)}</span>
          <span className="text-gray-400 text-xs">(+50%)</span>
        </div>
      </div>

      <div className="max-h-32 overflow-y-auto space-y-1 max-w-full pr-2">
        {siteBankrolls.map(({ site, required }) => (
          <div key={site} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 flex-shrink-0">
              <span>{getSiteColor(site)}</span>
              <span className="text-white font-medium truncate max-w-[120px]">{site}</span>
            </div>
            <span className="text-yellow-400 font-bold flex-shrink-0 ml-2">{formatMoney(required)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Main Modal Component
interface EpicStartSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preparationPercentage: number[];
  setPreparationPercentage: (value: number[]) => void;
  preparationNotes: string;
  setPreparationNotes: (value: string) => void;
  dailyGoals: string;
  setDailyGoals: (value: string) => void;
  screenCap: number;
  setScreenCap: (value: number) => void;
  isLoading: boolean;
  plannedTournaments: any[];
  isLoadingPlannedTournaments: boolean;
}

export default function EpicStartSessionModal({
  isOpen,
  onClose,
  onSuccess,
  preparationPercentage,
  setPreparationPercentage,
  preparationNotes,
  setPreparationNotes,
  dailyGoals,
  setDailyGoals,
  screenCap,
  setScreenCap,
  isLoading,
  plannedTournaments,
  isLoadingPlannedTournaments
}: EpicStartSessionModalProps) {
  useEffect(() => {
    const overlay = document.querySelector('.epic-start-modal');

    if (preparationPercentage[0] >= 80) {
      overlay?.classList.add('high-energy');
      overlay?.classList.remove('medium-energy');
    } else if (preparationPercentage[0] >= 60) {
      overlay?.classList.add('medium-energy');
      overlay?.classList.remove('high-energy');
    } else {
      overlay?.classList.remove('high-energy', 'medium-energy');
    }
  }, [preparationPercentage]);

  const getTimeBasedContent = () => {
    const hour = new Date().getHours();

    if (hour >= 6 && hour < 12) {
      return {
        title: "Bom Dia, Grinder!",
        subtitle: "Vamos começar o dia dominando as mesas",
        motivation: "O early bird pega os peixes! 🌅",
        icon: "🌅"
      };
    } else if (hour >= 12 && hour < 18) {
      return {
        title: "Hora do Show!",
        subtitle: "As mesas estão aquecidas e prontas",
        motivation: "Prime time para maximizar o grind! 🔥",
        icon: "🔥"
      };
    } else {
      return {
        title: "Grind Noturno!",
        subtitle: "A noite é nossa, vamos conquistar",
        motivation: "Night owl mode ativado! 🦉",
        icon: "🦉"
      };
    }
  };

  const timeContent = getTimeBasedContent();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="epic-start-modal max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">Iniciar Nova Sessão</DialogTitle>
        <DialogDescription className="sr-only">
          Prepare-se para sua sessão de grind com notas e objetivos
        </DialogDescription>

        {/* Header épico */}
        <div className="epic-header">
          <DialogClose className="close-btn">✕</DialogClose>
          <div className="header-icon animate-card-shuffle">{timeContent.icon}</div>
          <h2 className="modal-title gradient-text">{timeContent.title}</h2>
          <p className="modal-subtitle">{timeContent.subtitle}</p>
          <p className="motivation-text">{timeContent.motivation}</p>
        </div>

        {/* Body */}
        <div className="modal-body space-y-6">
          <EnhancedPreparationSlider
            value={preparationPercentage}
            onChange={setPreparationPercentage}
          />

          <div className="input-field">
            <label className="field-label">📝 Notas de Preparação</label>
            <Textarea
              value={preparationNotes}
              onChange={(e) => setPreparationNotes(e.target.value)}
              placeholder={SmartPlaceholders.preparationNotes()}
              maxLength={300}
              className="field-textarea bg-gray-800 border-gray-600 text-white"
              rows={3}
            />
          </div>

          <div className="input-field">
            <label className="field-label">🎯 Objetivos do Dia</label>
            <Textarea
              value={dailyGoals}
              onChange={(e) => setDailyGoals(e.target.value)}
              placeholder={SmartPlaceholders.dailyGoals()}
              className="field-textarea bg-gray-800 border-gray-600 text-white"
              rows={4}
              maxLength={500}
            />
          </div>

          <div className="input-field">
            <label className="field-label">🗓️ Torneios Planejados Hoje</label>
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 w-full overflow-hidden">
              {isLoadingPlannedTournaments ? (
                <div className="text-center text-gray-400 py-2">
                  <div className="animate-spin w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  Carregando torneios...
                </div>
              ) : plannedTournaments.length > 0 ? (
                <div className="w-full">
                  <TournamentSummaryNew tournaments={plannedTournaments} />
                </div>
              ) : (
                <div className="text-center text-gray-400 py-2">
                  <Calendar className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p>Nenhum torneio planejado para hoje</p>
                  <p className="text-xs mt-1">Você pode adicionar torneios no Grade Planner</p>
                </div>
              )}
            </div>
          </div>

          <div className="input-field">
            <label className="field-label">🖥️ Cap de Telas</label>
            <div className="flex items-center space-x-4">
              <Input
                type="number"
                min="1"
                max="50"
                value={screenCap}
                onChange={(e) => setScreenCap(Number(e.target.value))}
                className="field-input bg-gray-800 border-gray-600 text-white w-20"
                placeholder="10"
              />
              <span className="text-white">telas simultâneas</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Quantas telas você pretende jogar simultaneamente (1-50)
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-600 hover:bg-gray-700 text-white"
          >
            Cancelar
          </Button>

          <ModalLoadingButton
            isLoading={isLoading}
            onClick={onSuccess}
          >
            <span className="flex items-center gap-2">
              <span>⚡</span>
              Iniciar Sessão
            </span>
          </ModalLoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
