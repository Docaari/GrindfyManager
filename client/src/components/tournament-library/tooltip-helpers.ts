import { GRADE_TOOLTIPS } from "@shared/library-grades";

export function getConfidenceTooltip(grade: string): string {
  return GRADE_TOOLTIPS[grade as keyof typeof GRADE_TOOLTIPS] || '';
}

export function getVolatilityTooltip(): string {
  return 'Desvio padrao em buy-ins. Menor = resultados mais previsiveis. Maior = mais variancia (swings maiores). Verde: <3 (baixa variancia) | Amarelo: 3-6 (media) | Vermelho: >6 (alta)';
}

export function getVolatilityLevel(sdBuyins: number): 'low' | 'medium' | 'high' {
  if (sdBuyins < 3) return 'low';
  if (sdBuyins <= 6) return 'medium';
  return 'high';
}

export function getVolatilityColor(sdBuyins: number): string {
  const level = getVolatilityLevel(sdBuyins);
  switch (level) {
    case 'low':
      return 'text-emerald-400';
    case 'medium':
      return 'text-yellow-400';
    case 'high':
      return 'text-red-400';
  }
}
