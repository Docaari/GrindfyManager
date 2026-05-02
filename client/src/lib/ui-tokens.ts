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
  /** CTA primario de marca Grindfy (poker-accent). */
  action: {
    text: 'text-poker-accent',
    bg: 'bg-poker-accent/15',
    border: 'border-poker-accent/40',
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

export type Tokens = typeof tokens;
export type SpaceKey = keyof Tokens['space'];
export type FontKey = keyof Tokens['font'];
export type FontWeightKey = keyof Tokens['fontWeight'];
export type ColorKey = keyof Tokens['color'];
export type ColorVariant = keyof Tokens['color']['success'];
export type MotionKey = keyof Tokens['motion'];
export type RadiusKey = keyof Tokens['radius'];
export type ShadowKey = keyof Tokens['shadow'];
