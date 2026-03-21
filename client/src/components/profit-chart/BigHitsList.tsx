import type { BigHitData } from './types';

interface BigHitsListProps {
  bigHits: BigHitData[];
  bigHitsPercentage: number;
  formatCurrency: (value: number) => string;
}

export function BigHitsList({ bigHits, bigHitsPercentage, formatCurrency }: BigHitsListProps) {
  if (bigHits.length === 0) return null;

  return (
    <div className="bg-gray-800/30 border border-gray-600/50 rounded-lg p-4 mt-4">
      <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
        🔥 Big Hits - Top 3
      </h3>
      <div className="space-y-2">
        {bigHits.slice(0, 3).map((hit, index) => {
          const tournament = hit.tournament;

          if (!tournament) {
            const hitDateFormatted = new Date(hit.fullDate).toLocaleDateString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric'
            });
            return (
              <div key={index} className="text-xs text-gray-300 leading-relaxed">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-white font-medium">{index + 1}.</span>
                    <span className="text-gray-400">🎯</span>
                    <span className="text-gray-400">$--</span>
                    <span className="text-gray-300">Big Hit</span>
                    <span className="text-blue-400">{hitDateFormatted}</span>
                  </div>
                  <span className="text-emerald-400 font-medium">+{formatCurrency(hit.profitJump || 0)}</span>
                </div>
                <div className="ml-6 text-xs text-gray-500">
                  Salto de lucro não associado a torneio específico
                </div>
              </div>
            );
          }

          const buyIn = parseFloat(String(tournament.buyIn || '0'));
          const result = parseFloat(String(tournament.prize || tournament.result || '0'));
          const bounty = parseFloat(String(tournament.bounty || '0'));
          const totalProfit = result + bounty;

          let tournamentName = String(tournament.name || 'Torneio');
          tournamentName = tournamentName
            .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
            .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '')
            .replace(/\b\d{2}-\d{2}-\d{4}\b/g, '')
            .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '')
            .replace(/\s*-\s*\d{4}-\d{2}-\d{2}/g, '')
            .replace(/\([^)]*\d{4}[^)]*\)/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (tournamentName.length > 25) {
            tournamentName = tournamentName.substring(0, 22) + '...';
          }

          const position = tournament.position || '--';
          const fieldSize = tournament.fieldSize || '--';
          const getMedal = (pos: number) => {
            if (pos === 1) return '🥇';
            if (pos === 2) return '🥈';
            if (pos === 3) return '🥉';
            if (pos <= 9) return '🏅';
            return '🎯';
          };
          const medal = position !== '--' ? getMedal(Number(position)) : '';

          const tournamentDateFormatted = tournament.datePlayed
            ? new Date(tournament.datePlayed).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : new Date(hit.fullDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

          return (
            <div key={index} className="text-xs text-gray-300 leading-relaxed">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className="text-white font-medium">{index + 1}.</span>
                  <span className="text-amber-400">{medal}</span>
                  <span className="text-blue-400">${buyIn}</span>
                  <span className="text-gray-300 truncate" title={String(tournament.name)}>{tournamentName}</span>
                  <span className="text-gray-500 text-xs">{position}/{fieldSize}</span>
                </div>
                <span className="text-emerald-400 font-medium ml-2">+{formatCurrency(totalProfit)}</span>
              </div>
              <div className="flex items-center gap-1 mt-1 ml-6">
                <span className="text-xs bg-blue-700 px-1 rounded text-blue-200">{tournamentDateFormatted}</span>
                {tournament.site && <span className="text-xs bg-gray-700 px-1 rounded text-gray-300">{tournament.site}</span>}
                {tournament.category && tournament.category !== 'Vanilla' && <span className="text-xs bg-purple-700 px-1 rounded text-purple-200">{tournament.category}</span>}
                {tournament.speed && tournament.speed !== 'Normal' && <span className="text-xs bg-orange-700 px-1 rounded text-orange-200">{tournament.speed}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-2 border-t border-gray-600 text-xs text-gray-400">
        💡 Big Hits representam {bigHitsPercentage?.toFixed(1) || '0'}% do resultado total do período
      </div>
    </div>
  );
}
