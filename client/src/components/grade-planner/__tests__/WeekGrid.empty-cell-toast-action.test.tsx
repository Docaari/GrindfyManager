/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint UX-QW-2 — RF-05
 * Spec: Docs/specs/sprint-ux-qw-2.md
 *
 * Quando user clica em celula vazia de dia OFF no /grade-planner, o toast atual
 * eh informativo sem acao. Spec RF-05 manda adicionar `<ToastAction>` "Ativar A"
 * que chama setActiveProfile(dayOfWeek, 'A') no click.
 *
 * Test estrategia:
 *   Como GradePlanner eh muito pesado para montar em test isolado, este teste
 *   verifica o build do payload do toast via helper exportavel
 *   `buildOffDayToastPayload({ dayName, dayOfWeek, setActiveProfile })` que
 *   retorna `{ title, description, action }`. Implementer cria o helper em
 *   `client/src/pages/grade-planner-helpers.ts` (modulo ja existente — basta
 *   adicionar a funcao) E usa o helper em GradePlanner.tsx:handleClickEmptyCell.
 *
 *   Se o implementer escolher inlining (sem helper extrai), pode adaptar o test
 *   importando GradePlanner e mockando useToast (vide AI-1A onboarding-banner
 *   pattern). Recomendacao: extrair o helper — mais testavel e segue lesson #11
 *   (componente fica magrinho, regra fica no helper).
 *
 * Lessons aplicadas:
 *   #2  data-testid estavel.
 *   #5  vi.fn() nao eh constructor — `<ToastAction>` retorna React element.
 *   #11 helper isolado evita componente decorativo.
 *   #14 import estatico.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// RED: helper ainda nao existe. Implementer adiciona em grade-planner-helpers.ts.
// @ts-expect-error — RED: buildOffDayToastPayload sera exportado pelo implementer
import { buildOffDayToastPayload } from '@/components/grade-planner/helpers';

describe('RF-05 buildOffDayToastPayload — formato', () => {
  it('retorna { title, description, action } com title incluindo dayName', () => {
    const payload = buildOffDayToastPayload({
      dayName: 'Segunda',
      dayOfWeek: 1,
      setActiveProfile: vi.fn(),
    });
    expect(payload.title).toContain('Segunda');
    expect(payload.title).toMatch(/OFF/i);
    expect(typeof payload.description).toBe('string');
    expect(payload.description.length).toBeGreaterThan(0);
  });

  it('payload.action eh um React element (ToastAction) renderizavel', () => {
    const payload = buildOffDayToastPayload({
      dayName: 'Sabado',
      dayOfWeek: 6,
      setActiveProfile: vi.fn(),
    });
    expect(React.isValidElement(payload.action)).toBe(true);
  });
});

describe('RF-05 buildOffDayToastPayload — interatividade do action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('click no action button chama setActiveProfile(dayOfWeek, "A")', async () => {
    const setActiveProfile = vi.fn();
    const payload = buildOffDayToastPayload({
      dayName: 'Quarta',
      dayOfWeek: 3,
      setActiveProfile,
    });
    render(payload.action as any);
    // ToastAction renderiza como um botao com texto "Ativar A"
    const btn = screen.getByRole('button', { name: /Ativar A/i });
    await userEvent.click(btn);
    expect(setActiveProfile).toHaveBeenCalledTimes(1);
    expect(setActiveProfile).toHaveBeenCalledWith(3, 'A');
  });

  it('label do action button eh "Ativar A"', () => {
    const payload = buildOffDayToastPayload({
      dayName: 'Quinta',
      dayOfWeek: 4,
      setActiveProfile: vi.fn(),
    });
    render(payload.action as any);
    expect(screen.getByRole('button', { name: /Ativar A/i })).toBeInTheDocument();
  });

  it('passa altText para screen readers', () => {
    const payload = buildOffDayToastPayload({
      dayName: 'Sexta',
      dayOfWeek: 5,
      setActiveProfile: vi.fn(),
    });
    render(payload.action as any);
    const btn = screen.getByRole('button', { name: /Ativar A/i });
    // ToastAction da Radix mapeia altText -> aria-label via wrapper
    const altText = btn.getAttribute('aria-label') ?? btn.getAttribute('alt');
    expect(altText).toBeTruthy();
  });
});

describe('RF-05 buildOffDayToastPayload — independencia entre invocacoes', () => {
  it('cada call gera novo payload (sem state compartilhado)', () => {
    const setA = vi.fn();
    const setB = vi.fn();
    const p1 = buildOffDayToastPayload({
      dayName: 'Domingo',
      dayOfWeek: 0,
      setActiveProfile: setA,
    });
    const p2 = buildOffDayToastPayload({
      dayName: 'Terca',
      dayOfWeek: 2,
      setActiveProfile: setB,
    });
    expect(p1.title).toContain('Domingo');
    expect(p2.title).toContain('Terca');
  });

  it('idempotencia: setActiveProfile pode ser chamado multiplas vezes sem throw', async () => {
    const setActiveProfile = vi.fn();
    const payload = buildOffDayToastPayload({
      dayName: 'Quarta',
      dayOfWeek: 3,
      setActiveProfile,
    });
    render(payload.action as any);
    const btn = screen.getByRole('button', { name: /Ativar A/i });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(setActiveProfile).toHaveBeenCalledTimes(2);
    expect(setActiveProfile).toHaveBeenNthCalledWith(1, 3, 'A');
    expect(setActiveProfile).toHaveBeenNthCalledWith(2, 3, 'A');
  });
});
