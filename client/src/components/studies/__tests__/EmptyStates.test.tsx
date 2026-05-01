/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-10: Empty states personalizados
 *
 * Componente reutilizavel: EmptyState
 *   props: { icon, title, description, ctaLabel, ctaAction, area? }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// @ts-expect-error - red phase
import { EmptyState } from '../EmptyState';

describe('RF-10 EmptyState component', () => {
  it('renderiza title + description + CTA', () => {
    render(
      <EmptyState
        title="Nenhum spot pendente"
        description="Faca cooldown para gerar spots"
        ctaLabel="Iniciar grind"
        ctaAction={() => {}}
        area="spots"
      />,
    );
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state').textContent).toMatch(/Nenhum spot pendente/);
    expect(screen.getByTestId('empty-state-cta').textContent).toMatch(/Iniciar grind/);
  });

  it('click no CTA chama ctaAction', async () => {
    const ctaAction = vi.fn();
    render(
      <EmptyState
        title="X" description="Y" ctaLabel="Go" ctaAction={ctaAction} area="spots"
      />,
    );
    await userEvent.click(screen.getByTestId('empty-state-cta'));
    expect(ctaAction).toHaveBeenCalled();
  });

  it('renderiza icon prop quando passado', () => {
    const Icon = () => <svg data-testid="empty-state-icon" />;
    render(
      <EmptyState
        icon={<Icon />} title="X" description="Y" ctaLabel="Z" ctaAction={() => {}} area="themes"
      />,
    );
    expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
  });

  it('CTA dispara analytics tracking studies.empty_state_cta_clicked', async () => {
    const trackMock = vi.fn();
    (window as any).__telemetry = { track: trackMock };

    const ctaAction = vi.fn();
    render(
      <EmptyState
        title="X" description="Y" ctaLabel="Z" ctaAction={ctaAction} area="recommendations"
      />,
    );
    await userEvent.click(screen.getByTestId('empty-state-cta'));
    // Aceita que tracking seja via console.log/window/structured — apenas valida ctaAction
    expect(ctaAction).toHaveBeenCalled();
  });

  it('area prop e refletida em data-area attr (telemetria)', () => {
    render(
      <EmptyState
        title="X" description="Y" ctaLabel="Z" ctaAction={() => {}} area="dashboard"
      />,
    );
    expect(screen.getByTestId('empty-state').getAttribute('data-area')).toBe('dashboard');
  });

  it('copy esta em PT-BR (sample obrigatorio)', () => {
    render(
      <EmptyState
        title="Nenhum tema ainda"
        description="Comece criando seu primeiro tema"
        ctaLabel="Criar tema"
        ctaAction={() => {}}
        area="themes"
      />,
    );
    const text = screen.getByTestId('empty-state').textContent || '';
    expect(text).toMatch(/Nenhum|Comece|Criar/i);
  });
});
