import type { BigHitData } from './types';

interface BigHitsListProps {
  bigHits: BigHitData[];
  bigHitsPercentage: number;
  formatCurrency: (value: number) => string;
}

export function BigHitsList({ bigHits, bigHitsPercentage, formatCurrency }: BigHitsListProps) {
  if (bigHits.length === 0) return null;

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="bg-gray-800/30 border border-gray-600/50 rounded-lg p-4 mt-4">
      <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
        🔥 Big Hits - Top 3
      </h3>
      <div className="space-y-3">
        {bigHits.slice(0, 3).map((hit, index) => {
          const tournament = hit.tournament;

          if (!tournament) {
            const hitDateFormatted = new Date(hit.fullDate).toLocaleDateString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric'
            });
            return (
              <div key={index} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{medals[index]}</span>
                    <span className="text-gray-400 text-sm">{hitDateFormatted}</span>
                  </div>
                  <span className="text-emerald-400 font-bold text-sm">+{formatCurrency(hit.profitJump || 0)}</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Salto de lucro no dia (torneio nao identificado)
                </div>
              </div>
            );
          }

          const buyIn = parseFloat(String(tournament.buyIn || '0'));
          const result = parseFloat(String(tournament.prize || tournament.result || '0'));
          const bounty = parseFloat(String(tournament.bounty || '0'));
          const totalProfit = result + bounty;

          // Limpar nome: remover datas, horarios e limitar tamanho
          let tournamentName = String(tournament.name || 'Torneio');
          // Remover sufixos como "- 2-Day Event", "- 4-Day Event"
          tournamentName = tournamentName
            .replace(/\s*-\s*\d+-Day Event/gi, '')
            .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
            .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '')
            .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          const position = tournament.position || '--';
          const fieldSize = tournament.fieldSize || '--';
          const site = tournament.site || '';

          const tournamentDateFormatted = tournament.datePlayed
            ? new Date(tournament.datePlayed).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : new Date(hit.fullDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

          return (
            <div key={index} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/30">
              {/* Linha 1: Medalha + Profit + Data */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{medals[index]}</span>
                  <span className="text-emerald-400 font-bold text-base">+{formatCurrency(totalProfit)}</span>
                </div>
                <span className="text-gray-400 text-xs">{tournamentDateFormatted}</span>
              </div>
              {/* Linha 2: Nome completo do torneio */}
              <div className="text-sm text-white mb-1.5 leading-snug" title={String(tournament.name)}>
                {tournamentName}
              </div>
              {/* Linha 3: Tags de detalhes */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {site && <span className="text-xs bg-blue-900/60 px-1.5 py-0.5 rounded text-blue-300">{site}</span>}
                <span className="text-xs bg-gray-700/60 px-1.5 py-0.5 rounded text-gray-300">${buyIn}</span>
                <span className="text-xs bg-gray-700/60 px-1.5 py-0.5 rounded text-gray-300">{position}/{fieldSize}</span>
                {tournament.category && tournament.category !== 'Vanilla' && (
                  <span className="text-xs bg-purple-900/60 px-1.5 py-0.5 rounded text-purple-300">{tournament.category}</span>
                )}
                {tournament.speed && tournament.speed !== 'Normal' && (
                  <span className="text-xs bg-orange-900/60 px-1.5 py-0.5 rounded text-orange-300">{tournament.speed}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-2 border-t border-gray-600 text-xs text-gray-400">
        Top 3 Big Hits representam {bigHitsPercentage?.toFixed(1) || '0'}% do resultado total do periodo
      </div>
    </div>
  );
}
