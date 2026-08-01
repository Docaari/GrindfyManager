import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Swords } from "lucide-react";
import { num, formatUsd } from "@/lib/dashboard-insights";

/**
 * De onde vem o dinheiro num PKO: cabeca (bounty) ou premiacao.
 *
 * Serve para separar dois jogadores que tem o mesmo lucro por caminhos opostos —
 * quem cacao cabeca e busta cedo vs quem preserva stack e paga o proprio bounty
 * com premiacao. O ajuste de estrategia e diferente em cada caso.
 *
 * Honestidade: `bounty_prize` so existe a partir da Migration 0097. Em historico
 * antigo a coluna e NULL, e 0% ali significa "o export nao trouxe", nao "voce
 * nao ganhou nenhuma cabeca". Por isso o card SOME quando nao ha cobertura, em
 * vez de mostrar zero.
 */

interface BountyBreakdownCardProps {
  categoryAnalytics: any;
}

interface BountyRow {
  category: string;
  volume: number;
  bountyPrize: number;
  grossPrize: number;
  bountyRows: number;
  share: number;
}

export function BountyBreakdownCard({ categoryAnalytics }: BountyBreakdownCardProps) {
  const rows: BountyRow[] = (Array.isArray(categoryAnalytics) ? categoryAnalytics : [])
    .map((row: any) => {
      const grossPrize = num(row?.grossPrize);
      const bountyPrize = num(row?.bountyPrize);
      return {
        category: String(row?.category ?? '').trim(),
        volume: num(row?.volume),
        bountyPrize,
        grossPrize,
        bountyRows: num(row?.bountyRows),
        share: grossPrize > 0 ? (bountyPrize / grossPrize) * 100 : 0,
      };
    })
    // So faz sentido onde existe cabeca E o export trouxe o dado.
    .filter((r) => r.category.length > 0 && r.bountyRows > 0 && r.bountyPrize > 0)
    .sort((a, b) => b.bountyPrize - a.bountyPrize);

  if (rows.length === 0) return null;

  const totalBounty = rows.reduce((sum, r) => sum + r.bountyPrize, 0);
  const totalGross = rows.reduce((sum, r) => sum + r.grossPrize, 0);
  const overallShare = totalGross > 0 ? (totalBounty / totalGross) * 100 : 0;

  return (
    <Card
      className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10"
      data-testid="bounty-breakdown-card"
    >
      <CardHeader className="pb-6">
        <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
          <Swords className="h-7 w-7 text-amber-400" />
          De Onde Vem o Prêmio
        </CardTitle>
        <CardDescription className="text-gray-300 text-base">
          Quanto do que você recebeu veio de cabeça (bounty) e quanto veio da premiação.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2 space-y-5">
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm text-gray-400">No total</span>
            <span className="text-sm text-gray-400">
              {formatUsd(totalBounty)} de {formatUsd(totalGross)}
            </span>
          </div>
          <div className="text-3xl font-bold text-amber-400" data-testid="bounty-overall-share">
            {overallShare.toFixed(0)}% em cabeças
          </div>
        </div>

        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.category} data-testid={`bounty-row-${row.category}`}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="text-white font-medium">{row.category}</span>
                <span className="text-gray-400">
                  {row.share.toFixed(0)}% · {formatUsd(row.bountyPrize)} em cabeças
                </span>
              </div>
              {/* Barra: bounty (ambar) sobre premiacao (cinza). */}
              <div className="h-2 w-full rounded-full bg-gray-700 overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, row.share))}%` }}
                />
              </div>
              {row.bountyRows < row.volume && (
                <p className="text-xs text-gray-500 mt-1">
                  Dado de recompensa disponível em {row.bountyRows} de {row.volume} torneios.
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          Participação alta em cabeças com lucro baixo costuma indicar caça agressiva com
          busts precoces. Participação baixa em PKO indica que você preserva stack, mas pode
          estar deixando de pagar o próprio bounty.
        </p>
      </CardContent>
    </Card>
  );
}
