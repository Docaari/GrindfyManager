const confidenceTooltips: Record<string, string> = {
  A: 'A — 2000+ torneios, altamente confiavel',
  B: 'B — 1000-1999 torneios, confiavel',
  C: 'C — 500-999 torneios, moderado',
  D: 'D — 200-499 torneios, baixa confiabilidade',
  F: 'F — 50-199 torneios, dados insuficientes',
};

export function getConfidenceTooltip(grade: string): string {
  return confidenceTooltips[grade] || '';
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
