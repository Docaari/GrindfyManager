// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint UX-Biblioteca-1 / RF-01
//
// Spec: Docs/specs/ux-biblioteca-1.md RF-01
//
// Componente target: client/src/components/biblioteca/LessonRow.tsx (existe — modo TDD altera comportamento)
//
// Mudanca esperada em RF-01:
//   - locked-by-entitlement (!hasAccess) -> "Acesso restrito" + cor cinza + Lock icon
//   - NAO mais "Em breve" amber-300 quando bloqueado por entitlement.
//   - "Em breve" amber-300 reservado para isPublished === false (out-of-scope hoje;
//     spec pede que !hasAccess seja tratado como locked-by-entitlement por enquanto).
//
// data-testid principais:
//   - library-lesson-row-{slug} (existente)
//   - library-lesson-row-{slug}-locked-label (NOVO)
//   - library-lesson-row-{slug}-locked-icon (NOVO — Lock icon)
//
// Lessons aplicadas:
//   #2 data-testid estavel
// =============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

import { LessonRow } from '../LessonRow';

const baseLesson = {
  id: 'l-1',
  slug: 'a1-mentalidade',
  title: 'Mentalidade',
  subtitle: 'Sub',
  coverUrl: null,
  durationMinutes: 13,
  formats: ['video' as const, 'article' as const],
  hasAccess: true,
  displayLabel: 'A1',
  displayOrder: 1,
};

beforeEach(() => {});
afterEach(() => cleanup());

// =============================================================================
// RF-01 — locked label muda para "Acesso restrito" cinza + Lock icon
// =============================================================================
describe('<LessonRow> — locked-by-entitlement (RF-01)', () => {
  it('quando hasAccess=false deve renderizar texto "Acesso restrito" (NAO "Em breve")', () => {
    render(<LessonRow lesson={{ ...baseLesson, hasAccess: false }} courseSlug="curso" />);
    const row = screen.getByTestId('library-lesson-row-a1-mentalidade');
    expect(row.textContent ?? '').toMatch(/Acesso restrito/i);
    expect(row.textContent ?? '').not.toMatch(/Em breve/i);
  });

  it('quando hasAccess=false deve renderizar locked-label com cor cinza (text-gray-400) — NAO amber', () => {
    render(<LessonRow lesson={{ ...baseLesson, hasAccess: false }} courseSlug="curso" />);
    const label = screen.getByTestId('library-lesson-row-a1-mentalidade-locked-label');
    expect(label).toBeInTheDocument();
    const className = label.className ?? '';
    expect(className).toMatch(/text-gray-400/);
    expect(className).not.toMatch(/text-amber-300/);
  });

  it('quando hasAccess=false deve renderizar Lock icon antes do texto', () => {
    render(<LessonRow lesson={{ ...baseLesson, hasAccess: false }} courseSlug="curso" />);
    // Lock icon (lucide-react) — testid estavel.
    const icon = screen.getByTestId('library-lesson-row-a1-mentalidade-locked-icon');
    expect(icon).toBeInTheDocument();
  });

  it('quando hasAccess=true NAO deve renderizar locked label nem locked icon', () => {
    render(<LessonRow lesson={{ ...baseLesson, hasAccess: true }} courseSlug="curso" />);
    expect(
      screen.queryByTestId('library-lesson-row-a1-mentalidade-locked-label'),
    ).toBeNull();
    expect(
      screen.queryByTestId('library-lesson-row-a1-mentalidade-locked-icon'),
    ).toBeNull();
  });

  it('quando hasAccess=true NAO deve mostrar texto "Acesso restrito" nem "Em breve"', () => {
    render(<LessonRow lesson={{ ...baseLesson, hasAccess: true }} courseSlug="curso" />);
    const row = screen.getByTestId('library-lesson-row-a1-mentalidade');
    expect(row.textContent ?? '').not.toMatch(/Acesso restrito/i);
    expect(row.textContent ?? '').not.toMatch(/Em breve/i);
  });
});

// =============================================================================
// RF-01 — Regression existing behavior
// =============================================================================
describe('<LessonRow> — regression existing behavior', () => {
  it('quando hasAccess=true row deve estar dentro de um Link (clicavel)', () => {
    render(<LessonRow lesson={{ ...baseLesson, hasAccess: true }} courseSlug="curso" />);
    expect(
      screen.getByTestId('library-lesson-row-a1-mentalidade-link'),
    ).toBeInTheDocument();
  });

  it('quando hasAccess=false NAO deve ser clicavel (sem -link testid)', () => {
    render(<LessonRow lesson={{ ...baseLesson, hasAccess: false }} courseSlug="curso" />);
    expect(
      screen.queryByTestId('library-lesson-row-a1-mentalidade-link'),
    ).toBeNull();
  });

  it('deve renderizar titulo da aula', () => {
    render(<LessonRow lesson={baseLesson} courseSlug="curso" />);
    expect(screen.getByText('Mentalidade')).toBeInTheDocument();
  });

  it('deve renderizar duracao quando presente', () => {
    render(<LessonRow lesson={baseLesson} courseSlug="curso" />);
    expect(screen.getByText(/13\s*min/i)).toBeInTheDocument();
  });
});
