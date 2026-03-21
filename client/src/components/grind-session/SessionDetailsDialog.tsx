import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trophy } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { SessionHistoryData } from "./types";
import { localFormatCurrency } from "./helpers";

interface SessionDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSession: SessionHistoryData | null;
  tournaments: any[];
  isLoading: boolean;
}

export default function SessionDetailsDialog({
  isOpen,
  onOpenChange,
  selectedSession,
  tournaments,
  isLoading,
}: SessionDetailsDialogProps) {
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
          {tournaments.length === 0 ? (
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

              {tournaments.map((tournament, index) => (
                <div key={tournament.id} className={`grid grid-cols-8 gap-3 px-4 py-3 rounded-lg hover:bg-slate-700/50 transition-colors ${
                  index % 2 === 0 ? 'bg-slate-700/30' : 'bg-slate-700/20'
                }`}>
                  <div className="text-white font-medium truncate" title={tournament.name}>
                    {tournament.name}
                  </div>
                  <div className="text-gray-300">
                    {localFormatCurrency(tournament.buyIn)}
                  </div>
                  <div className="text-gray-300">
                    {((tournament as any).rebuys || 0) + 1}
                  </div>
                  <div className="text-gray-300">
                    {tournament.position > 0 ? `${tournament.position}º` : '-'}
                  </div>
                  <div className={`font-medium ${((tournament as any).result || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {localFormatCurrency((tournament as any).result || 0)}
                  </div>
                  <div className={`font-medium ${((tournament as any).bounty || 0) > 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                    {(tournament as any).bounty > 0 ? localFormatCurrency((tournament as any).bounty) : '-'}
                  </div>
                  <div className="text-gray-300">
                    {tournament.fieldSize || ((tournament as any).guaranteed > 0 && tournament.buyIn > 0 ? Math.round((tournament as any).guaranteed / tournament.buyIn) : '-')}
                  </div>
                  <div className="text-gray-300">
                    {(tournament as any).guaranteed > 0 ? localFormatCurrency((tournament as any).guaranteed) : '-'}
                  </div>
                </div>
              ))}
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
