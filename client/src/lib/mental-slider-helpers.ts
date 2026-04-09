// Mental slider context helpers (FP-14)

export type SliderType = 'energia' | 'foco' | 'confianca' | 'equilibrio';

export interface SliderLabels {
  min: string;
  max: string;
}

export interface BreakFeedback {
  energia: number;
  foco: number;
  confianca: number;
  inteligenciaEmocional: number;
  [key: string]: any;
}

const SLIDER_LABELS: Record<SliderType, SliderLabels> = {
  energia: { min: 'Esgotado', max: 'Eletrico' },
  foco: { min: 'Disperso', max: 'Laser Focus' },
  confianca: { min: 'Inseguro', max: 'Inabalavel' },
  equilibrio: { min: 'Instavel', max: 'Zen' },
};

const FIELD_MAP: Record<SliderType, keyof BreakFeedback> = {
  energia: 'energia',
  foco: 'foco',
  confianca: 'confianca',
  equilibrio: 'inteligenciaEmocional',
};

const SLIDER_DESCRIPTIONS: Record<SliderType, [number, number, string][]> = {
  foco: [
    [1, 2, 'Voce esta com dificuldade para manter atencao. Considere exercicios de respiracao.'],
    [3, 4, 'Atencao flutuante. Pode jogar, mas cuidado com decisoes automaticas.'],
    [5, 6, 'Foco adequado para sessoes de rotina.'],
    [7, 8, 'Boa concentracao. Aproveite para sessoes mais longas ou stakes maiores.'],
    [9, 10, 'Estado de flow. Momento ideal para grind intenso.'],
  ],
  energia: [
    [1, 2, 'Energia muito baixa. Considere descansar antes de jogar.'],
    [3, 4, 'Energia abaixo do ideal. Sessoes curtas sao mais indicadas.'],
    [5, 6, 'Energia suficiente para uma sessao normal.'],
    [7, 8, 'Boa energia. Aproveite para sessoes produtivas.'],
    [9, 10, 'Energia maxima. Momento ideal para sessoes longas e intensas.'],
  ],
  confianca: [
    [1, 2, 'Confianca muito baixa. Evite stakes altos e decisoes marginais.'],
    [3, 4, 'Confianca abalada. Jogue dentro da sua zona de conforto.'],
    [5, 6, 'Confianca adequada para jogar normalmente.'],
    [7, 8, 'Boa confianca. Pode explorar spots mais agressivos.'],
    [9, 10, 'Confianca inabalavel. Aproveite para desafios maiores.'],
  ],
  equilibrio: [
    [1, 2, 'Equilibrio emocional fragil. Risco alto de tilt.'],
    [3, 4, 'Estabilidade emocional baixa. Atencao redobrada com bad beats.'],
    [5, 6, 'Equilibrio emocional razoavel para sessoes de rotina.'],
    [7, 8, 'Bom equilibrio emocional. Resiliencia a variancias.'],
    [9, 10, 'Estado zen. Imune a oscilacoes emocionais.'],
  ],
};

export function getSliderLabels(type: SliderType): SliderLabels {
  return SLIDER_LABELS[type];
}

export function getSliderBenchmark(type: SliderType, breakFeedbacks: BreakFeedback[]): number | null {
  if (breakFeedbacks.length < 3) return null;
  const field = FIELD_MAP[type];
  const sum = breakFeedbacks.reduce((acc, fb) => acc + (fb[field] as number), 0);
  const avg = sum / breakFeedbacks.length;
  return Math.round(avg * 10) / 10;
}

export function formatBenchmark(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

export function getSliderDescription(type: SliderType, value: number): string {
  const ranges = SLIDER_DESCRIPTIONS[type];
  if (!ranges) return '';
  for (const [min, max, desc] of ranges) {
    if (value >= min && value <= max) return desc;
  }
  return '';
}

export function getSliderTypes(): SliderType[] {
  return ['energia', 'foco', 'confianca', 'equilibrio'];
}
