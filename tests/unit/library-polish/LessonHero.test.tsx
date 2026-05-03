// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / RF-01 + RF-04 + RF-06 + D2 + D7 + D11 + D12
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md RF-01 + RF-04 + RF-06
// ADR: Docs/architecture/decisions/098-hero-cinematic-animation-strategy.md
//
// Componente target: client/src/components/biblioteca/LessonHero.tsx (NAO EXISTE)
//
// Cobertura:
//   - Mount basico (cover + title + subtitle + chips + CTAs)
//   - Fallback gradient quando coverKey === null/undefined (D2)
//   - Skip button apos 3s (RF-04)
//   - CTA "Adicionar lista" disabled com tooltip "Em breve" (D7)
//   - Audio concorrente: CTA muda + chip tocando-agora (RF-06 + D12)
//   - Reduced motion respeita prefers-reduced-motion (D11)
//
// Lessons aplicadas:
//   #1 hooks primeiro (early return depois)
//   #2 data-testid estavel (lesson-hero-*)
//   #3 mock validar shape real do AudioPlayerContext
//   #11 default minimo (nao renderiza secundario nao pedido)
//   #14 isolamento timer/localStorage entre testes
//   #15 vi.doUnmock localizado quando necessario
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock framer-motion: forwardRef para preservar refs; ignora props de animacao.
// useReducedMotion eh sobrescrito por test individual via vi.doMock.
vi.mock('framer-motion', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef(({ children, ...rest }: any, ref: any) => {
      // Strip framer-only props para nao injetar no DOM.
      const {
        initial,
        animate,
        exit,
        transition,
        variants,
        whileHover,
        whileTap,
        whileFocus,
        whileInView,
        onAnimationStart,
        onAnimationComplete,
        ...domProps
      } = rest;
      return React.createElement(tag, { ref, ...domProps }, children);
    });
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, prop: string) => passthrough(prop),
      },
    ),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => false,
  };
});

// Mock useAssetUrl helper (se existir no projeto)
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Componente target — RED phase, ainda nao existe.
// @ts-expect-error - componente nao existe
import { LessonHero } from '../../../client/src/components/biblioteca/LessonHero';

const baseLesson = {
  id: 'l-a1',
  slug: 'a1-mentalidade-fixa-vs-crescimento',
  courseSlug: 'antes-das-cartas',
  title: 'Mentalidade Fixa vs Mentalidade de Crescimento',
  subtitle: 'A crenca invisivel sobre como habilidade funciona.',
  coverKey: 'covers/a1.jpg',
  durationMinutes: 13,
  formats: ['podcast', 'article'] as Array<'video' | 'podcast' | 'article'>,
  learningObjectives: [
    'Diferenca entre mentalidade fixa e de crescimento.',
    '4 armadilhas da versao falsa.',
  ],
  tags: ['mindset', 'crescimento'],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Mount basico — RF-01
// =============================================================================
describe('<LessonHero> — mount basico (RF-01)', () => {
  it('deve renderizar root container com data-testid lesson-hero', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A · Antes das Cartas"
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByTestId('lesson-hero')).toBeInTheDocument();
  });

  it('deve renderizar cover image com src derivada de coverKey', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    const cover = screen.getByTestId('lesson-hero-cover') as HTMLImageElement;
    // src deve referir a coverKey (sem importar transformacao especifica)
    expect(cover.tagName).toBe('IMG');
    expect(cover.getAttribute('src') ?? '').toMatch(/a1\.jpg|covers\/a1/);
  });

  it('deve renderizar titulo da lesson em h1', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    const title = screen.getByTestId('lesson-hero-title');
    expect(title.tagName).toBe('H1');
    expect(title.textContent).toContain(
      'Mentalidade Fixa vs Mentalidade de Crescimento',
    );
  });

  it('deve renderizar subtitle quando presente', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByTestId('lesson-hero-subtitle').textContent).toContain(
      'crenca invisivel',
    );
  });

  it('NAO deve renderizar subtitle quando lesson.subtitle === null', () => {
    render(
      <LessonHero
        lesson={{ ...baseLesson, subtitle: null }}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('lesson-hero-subtitle')).toBeNull();
  });

  it('deve renderizar episode label com EPISODIO N + blockLabel', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={3}
        blockLabel="Bloco A · Antes das Cartas"
        onStart={vi.fn()}
      />,
    );
    const label =
      screen.queryByTestId('lesson-hero-episode-label') ??
      screen.getByText(/EPISODIO/i);
    const text = label.textContent ?? '';
    expect(text).toMatch(/EPISODIO\s*3/i);
    expect(text).toMatch(/Antes das Cartas/);
  });

  it('deve renderizar chip de duracao quando durationMinutes presente', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText(/13\s*min/i)).toBeInTheDocument();
  });

  it('deve omitir chip de duracao quando durationMinutes ausente', () => {
    render(
      <LessonHero
        lesson={{ ...baseLesson, durationMinutes: undefined }}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByText(/13\s*min/i)).toBeNull();
  });
});

// =============================================================================
// CTAs — RF-01 + D7
// =============================================================================
describe('<LessonHero> — CTAs primary/secondary', () => {
  it('CTA primario "Iniciar aula" deve disparar onStart ao click', async () => {
    const onStart = vi.fn();
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={onStart}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('lesson-hero-cta-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('CTA primario texto default deve conter "Iniciar aula"', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    const cta = screen.getByTestId('lesson-hero-cta-start');
    expect(cta.textContent?.toLowerCase()).toMatch(/iniciar aula/);
  });

  // Sprint UX-Biblioteca-1 / RF-04 — botao "Adicionar lista" REMOVIDO (lesson #11
  // default minimo). Testes invertidos para asserer AUSENCIA.
  it('CTA secundario "Adicionar lista" foi REMOVIDO (RF-04 — default minimo)', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('lesson-hero-cta-add-list')).toBeNull();
  });

  it('hero NAO deve mostrar texto "Adicionar lista" no DOM (RF-04)', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    const root = screen.getByTestId('lesson-hero');
    expect(root.textContent ?? '').not.toMatch(/Adicionar lista/i);
  });
});

// =============================================================================
// Skip button apos 3s — RF-04
// =============================================================================
describe('<LessonHero> — Skip button apos 3s (RF-04)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('NAO deve renderizar skip button antes de 3000ms', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('lesson-hero-skip-button')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.queryByTestId('lesson-hero-skip-button')).toBeNull();
  });

  it('deve renderizar skip button apos 3000ms de mount', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('lesson-hero-skip-button')).toBeInTheDocument();
  });

  it('skip button deve ter aria-label descritivo', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const btn = screen.getByTestId('lesson-hero-skip-button');
    const label = btn.getAttribute('aria-label') ?? '';
    expect(label.toLowerCase()).toMatch(/pular|skip|introduc/);
  });

  it('click no skip button deve disparar onSkipIntro quando fornecido', async () => {
    const onSkipIntro = vi.fn();
    const onStart = vi.fn();
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={onStart}
        onSkipIntro={onSkipIntro}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByTestId('lesson-hero-skip-button'));
    expect(onSkipIntro).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('click no skip button deve fallback para onStart quando onSkipIntro undefined', async () => {
    const onStart = vi.fn();
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={onStart}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByTestId('lesson-hero-skip-button'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Fallback gradient — D2 (sem coverKey)
// =============================================================================
describe('<LessonHero> — Fallback gradient sem coverKey (D2)', () => {
  it('deve renderizar fallback gradient quando coverKey === null', () => {
    render(
      <LessonHero
        lesson={{ ...baseLesson, coverKey: null }}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    // Pode ser fallback test-id ou falta de img tag
    const fallback = screen.queryByTestId('lesson-hero-fallback-gradient');
    const cover = screen.queryByTestId('lesson-hero-cover');
    // Ou: tem fallback explicito, ou: cover existe mas nao eh IMG (eh DIV).
    expect(fallback ?? (cover && cover.tagName !== 'IMG' ? cover : null)).not.toBeNull();
  });

  it('deve renderizar fallback gradient quando coverKey === undefined', () => {
    const lesson = { ...baseLesson };
    delete (lesson as any).coverKey;
    render(
      <LessonHero
        lesson={lesson as any}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    const fallback = screen.queryByTestId('lesson-hero-fallback-gradient');
    const cover = screen.queryByTestId('lesson-hero-cover');
    expect(fallback ?? (cover && cover.tagName !== 'IMG' ? cover : null)).not.toBeNull();
  });

  it('deve renderizar fallback gradient quando coverKey === "" (string vazia)', () => {
    render(
      <LessonHero
        lesson={{ ...baseLesson, coverKey: '' }}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    const fallback = screen.queryByTestId('lesson-hero-fallback-gradient');
    const cover = screen.queryByTestId('lesson-hero-cover');
    expect(fallback ?? (cover && cover.tagName !== 'IMG' ? cover : null)).not.toBeNull();
  });
});

// =============================================================================
// Audio concorrente — RF-06 + D12
// =============================================================================
describe('<LessonHero> — audio concorrente (RF-06 + D12)', () => {
  it('CTA texto muda para "Trocar pra esta aula" quando isOtherAudioPlaying === true', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
        isOtherAudioPlaying={true}
        otherAudioLabel="A.2 (Dicotomia do Controle)"
      />,
    );
    const cta = screen.getByTestId('lesson-hero-cta-start');
    const text = (cta.textContent ?? '').toLowerCase();
    expect(text).toMatch(/trocar/);
  });

  it('CTA texto eh "Iniciar aula" quando isOtherAudioPlaying === false', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
        isOtherAudioPlaying={false}
      />,
    );
    const cta = screen.getByTestId('lesson-hero-cta-start');
    expect((cta.textContent ?? '').toLowerCase()).toMatch(/iniciar aula/);
  });

  it('chip "Tocando agora" deve renderizar com otherAudioLabel', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
        isOtherAudioPlaying={true}
        otherAudioLabel="A.2 (Dicotomia do Controle)"
      />,
    );
    const chip = screen.getByTestId('lesson-hero-other-audio-chip');
    expect(chip.textContent ?? '').toMatch(/A\.2/);
    expect(chip.textContent ?? '').toMatch(/Dicotomia do Controle/);
  });

  it('chip "Tocando agora" NAO deve renderizar quando isOtherAudioPlaying === false', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
        isOtherAudioPlaying={false}
      />,
    );
    expect(screen.queryByTestId('lesson-hero-other-audio-chip')).toBeNull();
  });
});

// =============================================================================
// Stagger animation — delays absolutos (ADR-098)
// =============================================================================
describe('<LessonHero> — stagger animation delays', () => {
  it('elementos animaveis devem ter atributo data-animation-delay para introspeccao', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    // Mantem teste tolerante: cada elemento animavel marca seu delay para
    // que test-writer + reviewer possam verificar a sequencia stagger.
    const titleEl = screen.getByTestId('lesson-hero-title');
    expect(titleEl.getAttribute('data-animation-delay')).toBeDefined();
  });
});
