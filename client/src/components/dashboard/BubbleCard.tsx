import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Info } from "lucide-react";
import { num, formatUsd } from "@/lib/dashboard-insights";

/**
 * Bolha e ITM real x esperado.
 *
 * "ITM alto" sozinho não diz nada: um torneio que paga 20% do field entrega 20%
 * de ITM para quem joga na sorte. O que importa é a DIFERENÇA entre o seu ITM e
 * o que o próprio field pagaria — é isso que separa habilidade de estrutura.
 *
 * `places_paid_avg` (quantas posições pagam) veio com a simulação PrimeDope e é
 * NULL em boa parte do histórico. Por isso o card exibe a cobertura: "medido em
 * 120 dos seus 900 torneios". Sem isso, um recorte de 5 torneios pareceria
 * conclusão sobre o histórico inteiro.
 */

interface BubbleCardProps {
  bubble: any;
}

export function BubbleCard({ bubble }: BubbleCardProps) {
  if (!bubble) return null;

  const sample = num(bubble.sample);
  if (sample <= 0) return null;

  const total = num(bubble.total);
  const coverage = num(bubble.coverage);
  const itmRate = num(bubble.itmRate);
  const expectedItmRate = num(bubble.expectedItmRate);
  const deltaPp = num(bubble.itmDeltaPp);
  const bubbleRate = num(bubble.bubbleRate);
  const bubbleCount = num(bubble.bubbleCount);

  const beatingField = deltaPp > 0;

  return (
    <Card
      className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10"
      data-testid="bubble-card"
    >
      <CardHeader className="pb-6">
        <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
          <Target className="h-7 w-7 text-purple-400" />
          Bolha e ITM
        </CardTitle>
        <CardDescription className="text-gray-300 text-base">
          Seu ITM comparado ao que a estrutura do torneio pagaria sozinha.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-gray-400 mb-1">Seu ITM</div>
            <div className="text-3xl font-bold text-white" data-testid="bubble-itm-rate">
              {itmRate.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">O field pagaria</div>
            <div className="text-3xl font-bold text-gray-400" data-testid="bubble-expected-itm">
              {expectedItmRate.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">Diferença</div>
            <div
              className={`text-3xl font-bold ${beatingField ? 'text-green-400' : 'text-red-400'}`}
              data-testid="bubble-delta"
            >
              {deltaPp >= 0 ? '+' : ''}{deltaPp.toFixed(1)} p.p.
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-300">
          {beatingField
            ? `Você passa da bolha mais do que a estrutura entregaria — sinal de que a leitura perto do dinheiro está funcionando.`
            : `Você passa da bolha menos do que a estrutura entregaria. Vale revisar a fase de stack curto perto do corte.`}
        </p>

        <div className="border-t border-gray-700/50 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-400">Estouros na bolha</span>
            <span className="text-sm text-gray-300">
              {bubbleCount} torneios ({bubbleRate.toFixed(1)}%)
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Terminou logo fora do dinheiro (até 10% de posições acima do corte). Resultado
            acumulado nesses: {formatUsd(num(bubble.bubbleProfit))}.
          </p>
        </div>

        {coverage < 99 && (
          <p className="text-xs text-gray-500 flex items-start gap-1.5" data-testid="bubble-coverage">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
            Medido em {sample} dos {total} torneios do recorte ({coverage.toFixed(0)}%) — só entram
            os que trouxeram posição, tamanho de field e quantas posições pagavam.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
