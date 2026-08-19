/**
 * Sprint UI-FND-1 — RF-01: Design Tokens (Foundation)
 *
 * Spec: Docs/specs/ui-fnd-1-foundation.md (RF-01 + D2-D7 + D11)
 * ADR:  Docs/architecture/decisions/078-design-tokens-ui-patterns.md (secao 2.1)
 *
 * Camada TS-pura complementar ao shadcn/Tailwind. Tokens semanticos canonicos
 * para spacing, typography, color, motion, radius e shadow. Frozen profundo
 * (D11) para garantir imutabilidade em runtime.
 *
 * Lessons aplicadas:
 *   #11 — escopo enxuto, sem keys decorativas.
 *   #2  — estrutura tipada para autocomplete e validacao em testes.
 */

import { deepFreeze } from '@/lib/deep-freeze';

/**
 * Spacing scale (D2). Valores em px.
 * Mapeamento Tailwind: 4→1, 8→2, 12→3, 16→4, 24→6, 32→8, 48→12, 64→16.
 * `0` sem alias (use literal).
 */
const _space = {
  /** 4px */
  xs: 4,
  /** 8px */
  sm: 8,
  /** 12px */
  md: 12,
  /** 16px */
  base: 16,
  /** 24px */
  lg: 24,
  /** 32px */
  xl: 32,
  /** 48px */
  '2xl': 48,
  /** 64px */
  '3xl': 64,
} as const;

/**
 * Font sizes (D3). Valores em px.
 */
const _font = {
  /** 12px */
  xs: 12,
  /** 14px */
  sm: 14,
  /** 16px */
  base: 16,
  /** 20px */
  lg: 20,
  /** 24px */
  xl: 24,
  /** 32px */
  '2xl': 32,
} as const;

/**
 * Font weights (D3). Excluido 300 (thin) e 800/900 (anti-pattern em pro UI).
 */
const _fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

/**
 * Semantic colors (D4 + R8 resolved). Cada token expoe { text, bg, border }
 * como classnames Tailwind. Componentes acessam direto: tokens.color.danger.bg.
 */
const _color = {
  success: {
    text: 'text-green-300',
    bg: 'bg-green-500/15',
    border: 'border-green-500/40',
  },
  danger: {
    text: 'text-red-300',
    bg: 'bg-red-500/15',
    border: 'border-red-500/40',
  },
  warn: {
    text: 'text-amber-300',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/40',
  },
  info: {
    text: 'text-blue-300',
    bg: 'bg-blue-500/15',
    border: 'border-blue-500/40',
  },
  /** CTA primario de marca Grindfy (== primary; era poker-accent, migrado em
   * 2026-06 — mesmos valores HSL em dark, ver ADR-239). */
  action: {
    text: 'text-primary',
    bg: 'bg-primary/15',
    border: 'border-primary/40',
  },
  neutral: {
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-border',
  },
  /** Roxo — categorias/grupos sem mapeamento semantico em success/danger/warn/info. UI-T1-Library RF-13 + ADR-078 amendment. */
  accent: {
    text: 'text-purple-300',
    bg: 'bg-purple-500/15',
    border: 'border-purple-500/40',
  },
  /**
   * LOW-18 reviewer — tokens dedicados para sinais de delta KPI (vermelho/verde
   * em saturacao 500 para destaque visual em numeros grandes). Diferente de
   * `success`/`danger` que usam saturacao 300 (badges/banners). Manter ambos.
   */
  delta: {
    positive: 'text-emerald-500',
    negative: 'text-rose-500',
    neutral: 'text-muted-foreground',
  },
} as const;

/**
 * Motion tokens (D5). Durations em ms. Anti-pattern: >300ms vira lento (1.12).
 */
const _motion = {
  /** 150ms — micro feedback (hover, click). */
  fast: 150,
  /** 200ms — transitions padrao (toggle, expand). */
  base: 200,
  /** 300ms — entradas/saidas de modais. */
  slow: 300,
  /** Easing canonico: standard ease-out. */
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/**
 * Border radius (D6). Valores em px.
 */
const _radius = {
  /** 4px */
  sm: 4,
  /** 8px */
  md: 8,
  /** 12px */
  lg: 12,
  /** 9999px (pill) */
  full: 9999,
} as const;

/**
 * Box shadows (D7). Strings CSS prontas.
 */
const _shadow = {
  /** Sutil — hover de cards. */
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  /** Medio — popovers, dropdowns. */
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  /** Forte — modais flutuantes. */
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
} as const;

const _tokens = {
  space: _space,
  font: _font,
  fontWeight: _fontWeight,
  color: _color,
  motion: _motion,
  radius: _radius,
  shadow: _shadow,
} as const;

/**
 * Tokens canonicos do Grindfy. Frozen profundo — mutacao falha silenciosamente
 * (non-strict) ou throw (strict mode).
 *
 * @example
 *   import { tokens } from '@/lib/ui-tokens';
 *   <div className={cn(tokens.color.danger.bg, tokens.color.danger.text)}>...</div>
 */
export const tokens = deepFreeze(_tokens);

export default tokens;

// ============================================================================
// Tipos exportados (D11) — uso em props de componentes para autocomplete.
// ============================================================================

// ============================================================================
// Escala de calor (Range Lab F1, emenda A18 / ADR-246 D-F1-10)
//
// FICA FORA DE `tokens.color` DE PROPOSITO. A licao #22 registra o custo de
// meter shape heterogeneo la dentro: `tokens.color.delta` quebrou `ColorKey` e
// todos os consumidores de swatch, e exigiu `ColorKey` literal mais um
// `DeltaTone` a parte. Repetir o erro conhecido custaria a mesma correcao.
//
// Tres derivacoes, porque uma so nao serve:
//   absolute — 0..1, para equity (a escala tem significado absoluto);
//   relative — ao min/max do conjunto, para quando o que importa e o RANKING e
//              nao o valor (hotness por carta);
//   text     — variante para cor de FONTE. O amarelo do meio da escala e
//              ilegivel como texto, entao esta faixa nao e a de fundo.
// ============================================================================

const HEAT_STEPS = 7;

const HEAT_BG = [
  'bg-red-900/60',
  'bg-red-700/60',
  'bg-orange-600/60',
  'bg-amber-500/60',
  'bg-lime-600/60',
  'bg-emerald-600/60',
  'bg-emerald-500/70',
] as const;

const HEAT_TEXT = [
  'text-red-300',
  'text-red-200',
  'text-orange-300',
  'text-amber-200',
  'text-lime-300',
  'text-emerald-300',
  'text-emerald-200',
] as const;

/** Fracao -> indice de degrau. Entrada nao finita cai em 0, nunca em NaN. */
function heatIndex(fraction: number): number {
  if (typeof fraction !== 'number' || Number.isNaN(fraction)) return 0;
  const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  return Math.round(clamped * (HEAT_STEPS - 1));
}

export const heat = {
  /** Cor de fundo para uma fracao 0..1 (equity). */
  absolute(fraction: number): string {
    return HEAT_BG[heatIndex(fraction)];
  },
  /**
   * Cor de fundo pela posicao do valor dentro do conjunto. Conjunto sem
   * amplitude (`min === max`) nao tem ranking: o meio da escala e a resposta
   * honesta, e nao uma divisao por zero disfarcada de cor.
   */
  relative(value: number, min: number, max: number): string {
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value)) {
      return HEAT_BG[heatIndex(0.5)];
    }
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const span = hi - lo;
    if (span <= 0) return HEAT_BG[heatIndex(0.5)];
    return HEAT_BG[heatIndex((value - lo) / span)];
  },
  /** Cor de FONTE para a mesma fracao. Nunca e igual a `absolute`. */
  text(fraction: number): string {
    return HEAT_TEXT[heatIndex(fraction)];
  },
} as const;

/**
 * Paleta por categoria de leitura do Range Lab (F3a, emenda A14).
 *
 * Mora AQUI FORA, ao lado do `heat`, e NAO dentro de `tokens.color`. `ColorKey` e
 * derivado de `keyof tokens.color` e todo consumidor de `tokens.color[tom]` espera
 * o shape `{ bg, text, border }` — foi assim que `tokens.color.delta` quebrou o
 * `FilterChip` (licao #22). Uma entrada por categoria, com shape proprio, entraria
 * no mesmo buraco.
 *
 * A escala vai do forte (esmeralda) ao sem valor (ardosia), para o painel ficar
 * legivel de relance: nut e lixo nunca dividem a mesma cor.
 */
const CATEGORY_MADE_BG: Record<string, string> = {
  straight_flush: 'bg-emerald-400/70',
  quads: 'bg-emerald-500/70',
  full_house: 'bg-emerald-600/65',
  flush: 'bg-teal-600/65',
  straight: 'bg-cyan-600/60',
  set: 'bg-lime-600/60',
  trips: 'bg-lime-700/55',
  two_pair: 'bg-amber-500/55',
  overpair: 'bg-amber-600/55',
  top_pair: 'bg-orange-500/55',
  second_pair: 'bg-orange-600/50',
  third_pair: 'bg-orange-700/45',
  weak_pair: 'bg-red-700/45',
  underpair: 'bg-red-800/45',
  ace_high: 'bg-slate-600/50',
  no_pair: 'bg-slate-700/50',
};

const CATEGORY_DRAW_BG: Record<string, string> = {
  fd_nut: 'bg-sky-400/60',
  fd: 'bg-sky-500/55',
  bdfd: 'bg-sky-700/45',
  oesd: 'bg-violet-500/55',
  gutshot: 'bg-violet-600/50',
  bdsd: 'bg-violet-800/45',
  overcards2: 'bg-zinc-500/50',
  overcard1: 'bg-zinc-600/45',
};

/** Fundo neutro para id desconhecido: nunca `bg-undefined` na tela. */
const CATEGORY_FALLBACK_BG = 'bg-slate-700/40';

export const categoryPalette = {
  /** Cor de fundo da linha/celula de uma categoria de mao feita. */
  made(id: string): string {
    return CATEGORY_MADE_BG[id] ?? CATEGORY_FALLBACK_BG;
  },
  /** Cor de fundo da linha/chip de uma tag de draw. */
  draw(id: string): string {
    return CATEGORY_DRAW_BG[id] ?? CATEGORY_FALLBACK_BG;
  },
} as const;

/**
 * Paleta da aritmetica da decisao (Range Lab F3b, ADR-249 D-F3-33).
 *
 * TERCEIRA paleta a morar aqui fora, pelo mesmo motivo das duas de cima:
 * `ColorKey` e derivado de `keyof tokens.color` e todo consumidor de
 * `tokens.color[tom]` espera `{ bg, text, border }`. Foi assim que
 * `tokens.color.delta` quebrou o `FilterChip` (licao #22). Repetir o erro
 * conhecido custaria a mesma correcao.
 *
 * Tres funcoes porque sao tres eixos diferentes: o degrau da cascata (a barra
 * desce, a cor escurece), o resultado do confronto e o veredito de balanco.
 */
const CASCADE_BG: Record<string, string> = {
  nominal: 'bg-slate-600/50',
  declared: 'bg-sky-700/55',
  after_board_removal: 'bg-teal-700/55',
  after_mutual_removal: 'bg-emerald-700/55',
  loses_to_hero: 'bg-emerald-500/60',
};

/**
 * `unknown` PRECISA de cor propria: ele existe justamente para nao se disfarcar
 * de blefe, e cor igual a do blefe desfaria isso na tela (D-F3-24).
 */
const CONFRONT_BG: Record<string, string> = {
  value: 'bg-red-700/55',
  bluff: 'bg-emerald-600/55',
  chop: 'bg-amber-500/50',
  unknown: 'bg-zinc-600/45',
};

const BALANCE_BG: Record<string, string> = {
  bluffs_missing: 'bg-emerald-600/55',
  balanced: 'bg-sky-600/50',
  bluffs_excess: 'bg-red-700/55',
};

/** Fundo neutro para id desconhecido: nunca `bg-undefined` na tela. */
const DECISION_FALLBACK_BG = 'bg-slate-700/40';

export const decisionPalette = {
  /** Cor de fundo do degrau da cascata. */
  cascade(id: string): string {
    return CASCADE_BG[id] ?? DECISION_FALLBACK_BG;
  },
  /** Cor de fundo do balde de confronto (value / blefe / chop / desconhecido). */
  confront(outcome: string): string {
    return CONFRONT_BG[outcome] ?? DECISION_FALLBACK_BG;
  },
  /** Cor de fundo do veredito de balanco de blefes. */
  balance(verdict: string): string {
    return BALANCE_BG[verdict] ?? DECISION_FALLBACK_BG;
  },
} as const;

export type Tokens = typeof tokens;
export type SpaceKey = keyof Tokens['space'];
export type FontKey = keyof Tokens['font'];
export type FontWeightKey = keyof Tokens['fontWeight'];
/**
 * ColorKey — chaves do `tokens.color` que sao "swatches" (compartilham shape
 * { text, bg, border }). Exclui `delta` que tem shape distinto
 * (positive/negative/neutral). Use `DeltaTone` para `tokens.color.delta`.
 *
 * LOW-18 reviewer: introduzido para nao quebrar consumidores
 * (`FilterChip`, swatches em badges) ao adicionar `delta`.
 */
export type ColorKey =
  | 'success'
  | 'danger'
  | 'warn'
  | 'info'
  | 'action'
  | 'neutral'
  | 'accent';
export type ColorVariant = keyof Tokens['color']['success'];
/** Tokens dedicados a sinais de delta (KPIs grandes). */
export type DeltaTone = keyof Tokens['color']['delta'];
export type MotionKey = keyof Tokens['motion'];
export type RadiusKey = keyof Tokens['radius'];
export type ShadowKey = keyof Tokens['shadow'];
