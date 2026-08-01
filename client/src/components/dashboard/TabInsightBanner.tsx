import { Lightbulb, TrendingDown, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { tokens } from "@/lib/ui-tokens";
import type { TabInsight } from "@/lib/dashboard-insights";

interface TabInsightBannerProps {
  insight: TabInsight | null;
}

/**
 * Faixa de diagnóstico no topo da aba. Some sozinha quando o motor não tem o que
 * afirmar (`insight === null`) — silêncio é melhor que conselho inventado.
 *
 * Respeita os filtros ativos por construção: a dica é calculada em cima dos
 * mesmos dados que alimentam os gráficos da aba.
 */
export function TabInsightBanner({ insight }: TabInsightBannerProps) {
  if (!insight) return null;

  // Amostra insuficiente nao e alerta nem elogio: e recado. Fica discreto para
  // nao competir com o grafico, mas VISIVEL — sumir de vez parece tela quebrada.
  const palette =
    insight.insufficient ? tokens.color.neutral
    : insight.tone === 'good' ? tokens.color.success
    : insight.tone === 'bad' ? tokens.color.danger
    : tokens.color.info;

  const Icon =
    insight.insufficient ? Info
    : insight.tone === 'good' ? TrendingUp
    : insight.tone === 'bad' ? TrendingDown
    : Lightbulb;

  return (
    <div
      data-testid="tab-insight-banner"
      data-tone={insight.tone}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 mb-6',
        palette.bg,
        palette.border,
      )}
    >
      <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', palette.text)} />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', palette.text)}>{insight.headline}</p>
        {insight.detail && (
          <p className="text-sm text-muted-foreground mt-1">{insight.detail}</p>
        )}
        {insight.lowSample && (
          <p
            className="text-xs text-muted-foreground mt-2 flex items-center gap-1"
            data-testid="tab-insight-low-sample"
          >
            <Info className="h-3 w-3" />
            Amostra pequena — trate como tendência, não como veredito.
          </p>
        )}
      </div>
    </div>
  );
}
