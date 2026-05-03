// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / RF-11 + D8 — Below-the-fold lazy-render
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md RF-11 + D8
//
// Componente target: client/src/components/biblioteca/LessonHeroBelowFold.tsx
//   (NAO EXISTE — RED phase)
//
// Comportamento esperado:
//   - Antes de scroll: placeholder div (h-screen) renderiza, sem conteudo real
//   - IntersectionObserver dispara setIsVisible(true) quando placeholder entra viewport
//   - "O que voce vai aprender" lista renderiza com cada learning_objective em <li>
//   - "Conceitos-chave" renderiza chips quando keyConcepts.length > 0
//   - "Base cientifica" renderiza paragraph com refs (vazio MVP -> secao omitida)
//   - Quando todos arrays vazios -> componente null
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// Capturamos instancias de IntersectionObserver para que os testes possam
// disparar callbacks manualmente (jsdom nao implementa nativo).
const observerCallbacks: Array<(entries: any[]) => void> = [];

class MockIntersectionObserver {
  callback: (entries: any[]) => void;
  constructor(cb: (entries: any[]) => void) {
    this.callback = cb;
    observerCallbacks.push(cb);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

// @ts-expect-error - red phase
import { LessonHeroBelowFold } from '../../../client/src/components/biblioteca/LessonHeroBelowFold';

beforeEach(() => {
  observerCallbacks.length = 0;
  // Substitui IntersectionObserver para capturar callbacks.
  (globalThis as any).IntersectionObserver = MockIntersectionObserver;
  if (typeof window !== 'undefined') {
    (window as any).IntersectionObserver = MockIntersectionObserver;
  }
});

afterEach(() => {
  observerCallbacks.length = 0;
});

function fireIntersect(intersecting: boolean) {
  act(() => {
    observerCallbacks.forEach((cb) =>
      cb([
        {
          isIntersecting: intersecting,
          target: document.body,
          intersectionRatio: intersecting ? 1 : 0,
        },
      ]),
    );
  });
}

describe('<LessonHeroBelowFold> lazy-render (RF-11 + D8)', () => {
  it('antes de IntersectionObserver disparar, conteudo NAO esta visivel', () => {
    render(
      <LessonHeroBelowFold
        learningObjectives={['obj1', 'obj2']}
        keyConcepts={['conc1']}
        scientificBasis={[]}
      />,
    );
    expect(screen.queryByTestId('below-fold-objectives')).toBeNull();
    expect(screen.queryByTestId('lesson-hero-below-fold')).toBeNull();
  });

  it('apos IntersectionObserver disparar com isIntersecting=true, conteudo aparece', () => {
    render(
      <LessonHeroBelowFold
        learningObjectives={['obj1', 'obj2']}
        keyConcepts={['conc1']}
        scientificBasis={[]}
      />,
    );
    fireIntersect(true);
    expect(
      screen.getByTestId('lesson-hero-below-fold'),
    ).toBeInTheDocument();
  });

  it('"O que voce vai aprender" renderiza um <li> por learning_objective', () => {
    render(
      <LessonHeroBelowFold
        learningObjectives={['Diferenca fixa vs crescimento', '4 armadilhas']}
        keyConcepts={[]}
        scientificBasis={[]}
      />,
    );
    fireIntersect(true);
    const objSection = screen.getByTestId('below-fold-objectives');
    const items = objSection.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toMatch(/Diferenca fixa/);
    expect(items[1].textContent).toMatch(/armadilhas/);
  });

  it('NAO deve renderizar secao objetivos quando learningObjectives === []', () => {
    render(
      <LessonHeroBelowFold
        learningObjectives={[]}
        keyConcepts={['conc1']}
        scientificBasis={[]}
      />,
    );
    fireIntersect(true);
    expect(screen.queryByTestId('below-fold-objectives')).toBeNull();
  });

  it('"Conceitos-chave" renderiza chips quando keyConcepts.length > 0', () => {
    render(
      <LessonHeroBelowFold
        learningObjectives={[]}
        keyConcepts={['mindset', 'crescimento']}
        scientificBasis={[]}
      />,
    );
    fireIntersect(true);
    const conceptsSection = screen.getByTestId('below-fold-concepts');
    expect(conceptsSection.textContent).toMatch(/mindset/);
    expect(conceptsSection.textContent).toMatch(/crescimento/);
  });

  it('quando todos arrays vazios e visivel, componente NAO renderiza nenhuma secao real', () => {
    render(
      <LessonHeroBelowFold
        learningObjectives={[]}
        keyConcepts={[]}
        scientificBasis={[]}
      />,
    );
    fireIntersect(true);
    expect(screen.queryByTestId('below-fold-objectives')).toBeNull();
    expect(screen.queryByTestId('below-fold-concepts')).toBeNull();
    expect(screen.queryByTestId('below-fold-references')).toBeNull();
  });
});
