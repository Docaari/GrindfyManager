import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trophy } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { SessionHistoryData } from "./types";
import { localFormatCurrency } from "./helpers";
import { formatCurrency as formatNativeCurrency } from "@/lib/format";
import { getCurrencyForSite } from "@shared/platform-currency";

interface SessionDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSession: SessionHistoryData | null;
  tournaments: any[];
  isLoading: boolean;
  formatCurrency?: (amountUsd: number) => string;
}

// Tournament money fields are stored in NATIVE currency (USD/BRL/EUR/CNY).
// formatCurrency prop expects USD input → mixing inflates BRL by ~5x. Format
// in native currency for accuracy + locale.
function nativeMoney(t: any, amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  const ccy = (typeof t.currency === 'string' && t.currency.length > 0
    ? t.currency
    : getCurrencyForSite(String(t.site ?? '')).code).toUpperCase();
  return formatNativeCurrency(amount, ccy);
}

export default function SessionDetailsDialog({
  isOpen,
  onOpenChange,
  selectedSession,
  tournaments,
  isLoading,
  formatCurrency,
}: SessionDetailsDialogProps) {
  void formatCurrency;
  void localFormatCurrency;
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-slate-800/70 backdrop-blur-sm border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white text-xl font-semibold flex items-center gap-3">
            <Trophy className="w-6 h-6 text-emerald-400" />
            Detalhes dos Torneios
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            {selectedSession && (
              <>Sessão de {formatDate(selectedSession.date)} - {tournaments.length} torneios</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[600px] overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">Carregando torneios...</p>
            </div>
          ) : tournaments.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum torneio encontrado para esta sessão</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-8 gap-3 px-4 py-2 bg-slate-700/50 rounded-lg text-sm font-medium text-gray-300">
                <div>🧾 Nome</div>
                <div>💵 Buy-in</div>
                <div>🔁 Entradas</div>
                <div>🎯 Posição</div>
                <div>🏆 Prize</div>
                <div>🎯 Bounty</div>
                <div>👥 Participantes</div>
                <div>💰 Garantido</div>
              </div>

              {tournaments.map((tournament, index) => {
                const buyIn = Number(tournament.buyIn) || 0;
                const result = Number(tournament.result) || 0;
                const bounty = Number(tournament.bounty) || 0;
                const guaranteed = Number(tournament.guaranteed) || 0;
                const rebuys = Number(tournament.rebuys) || 0;
                const reentries = Number(tournament.reentries) || 0;
                const position = Number(tournament.position) || 0;
                return (
                  <div key={tournament.id} className={`grid grid-cols-8 gap-3 px-4 py-3 rounded-lg hover:bg-slate-700/50 transition-colors ${
                    index % 2 === 0 ? 'bg-slate-700/30' : 'bg-slate-700/20'
                  }`}>
                    <div className="text-white font-medium truncate" title={tournament.name}>
                      {tournament.name}
                    </div>
                    <div className="text-gray-300">
                      {nativeMoney(tournament, buyIn)}
                    </div>
                    <div className="text-gray-300">
                      {1 + rebuys + reentries}
                    </div>
                    <div className="text-gray-300">
                      {position > 0 ? `${position}º` : '-'}
                    </div>
                    <div className={`font-medium ${result >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {nativeMoney(tournament, result)}
                    </div>
                    <div className={`font-medium ${bounty > 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                      {bounty > 0 ? nativeMoney(tournament, bounty) : '-'}
                    </div>
                    <div className="text-gray-300">
                      {tournament.fieldSize || (guaranteed > 0 && buyIn > 0 ? Math.round(guaranteed / buyIn) : '-')}
                    </div>
                    <div className="text-gray-300">
                      {guaranteed > 0 ? nativeMoney(tournament, guaranteed) : '-'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-700">
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
