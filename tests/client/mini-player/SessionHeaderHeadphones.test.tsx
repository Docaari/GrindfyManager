// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-08 - Botao headphones no SessionHeader
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-08
//
// Target: client/src/components/grind-session-live/SessionHeader.tsx (EXTENSAO)
//
// Acceptance:
//   - 2 props opcionais: onOpenLessonPicker?: () => void; isAudioPlaying?: boolean
//   - SE onOpenLessonPicker === undefined -> botao NAO renderiza (back-compat)
//   - Desktop: <Headphones /> entre [Breaks] e autoBreakToggleSlot, className inclui "hidden md:inline-flex"
//   - Mobile: dentro do Popover, item "Estudar"
//   - data-testid="session-header-study-button"
//   - aria-label="Abrir biblioteca de podcasts"
//   - isAudioPlaying=true -> pulsa (class animate-pulse OU pulse-audio)
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

function loadHeader() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/components/grind-session-live/SessionHeader');
}

// Props minimos do SessionHeader (lookup arquivo)
const baseProps = {
  sessionElapsedTime: '3h 42m',
  statusMessage: 'em andamento',
  onOpenQuickNote: () => {},
  onOpenBreakDialog: () => {},
  onSessionFinalization: () => {},
  onOpenBreakManagement: () => {},
};

describe('SessionHeader botao Headphones (RF-08)', () => {
  it('NAO renderiza botao se onOpenLessonPicker === undefined (back-compat)', () => {
    const HeaderMod = loadHeader();
    const SessionHeader = HeaderMod.default || HeaderMod.SessionHeader;
    render(<SessionHeader {...baseProps} />);
    expect(screen.queryByTestId('session-header-study-button')).toBeNull();
  });

  it('renderiza botao quando onOpenLessonPicker e funcao', () => {
    const HeaderMod = loadHeader();
    const SessionHeader = HeaderMod.default || HeaderMod.SessionHeader;
    const onOpen = vi.fn();
    render(<SessionHeader {...baseProps} onOpenLessonPicker={onOpen} />);
    expect(screen.getByTestId('session-header-study-button')).toBeInTheDocument();
  });

  it('aria-label="Abrir biblioteca de podcasts"', () => {
    const HeaderMod = loadHeader();
    const SessionHeader = HeaderMod.default || HeaderMod.SessionHeader;
    render(<SessionHeader {...baseProps} onOpenLessonPicker={() => {}} />);
    const btn = screen.getByTestId('session-header-study-button');
    expect(btn.getAttribute('aria-label')).toMatch(/biblioteca|podcast|estudar/i);
  });

  it('desktop button tem className "hidden md:inline-flex"', () => {
    const HeaderMod = loadHeader();
    const SessionHeader = HeaderMod.default || HeaderMod.SessionHeader;
    render(<SessionHeader {...baseProps} onOpenLessonPicker={() => {}} />);
    const btn = screen.getByTestId('session-header-study-button');
    expect(btn.className).toMatch(/hidden.*md:inline-flex|md:inline-flex/);
  });

  it('click invoca onOpenLessonPicker callback', async () => {
    const HeaderMod = loadHeader();
    const SessionHeader = HeaderMod.default || HeaderMod.SessionHeader;
    const onOpen = vi.fn();
    render(<SessionHeader {...baseProps} onOpenLessonPicker={onOpen} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('session-header-study-button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('quando isAudioPlaying=true -> botao tem classe de pulse (animate-pulse OU pulse-audio)', () => {
    const HeaderMod = loadHeader();
    const SessionHeader = HeaderMod.default || HeaderMod.SessionHeader;
    render(
      <SessionHeader {...baseProps} onOpenLessonPicker={() => {}} isAudioPlaying={true} />,
    );
    const btn = screen.getByTestId('session-header-study-button');
    expect(btn.className).toMatch(/animate-pulse|pulse-audio|pulse/);
  });

  it('quando isAudioPlaying=false -> botao SEM pulse', () => {
    const HeaderMod = loadHeader();
    const SessionHeader = HeaderMod.default || HeaderMod.SessionHeader;
    render(
      <SessionHeader {...baseProps} onOpenLessonPicker={() => {}} isAudioPlaying={false} />,
    );
    const btn = screen.getByTestId('session-header-study-button');
    expect(btn.className).not.toMatch(/animate-pulse|pulse-audio/);
  });

  it('mobile Popover contem item "Estudar" quando onOpenLessonPicker definido', async () => {
    const HeaderMod = loadHeader();
    const SessionHeader = HeaderMod.default || HeaderMod.SessionHeader;
    render(<SessionHeader {...baseProps} onOpenLessonPicker={() => {}} />);
    const user = userEvent.setup();
    // Mobile menu trigger - botao MoreVertical com aria-label="Menu de opcoes"
    const trigger = screen.getByLabelText(/Menu de opcoes/i);
    await user.click(trigger);
    // Espera item com texto "Estudar" no Popover
    expect(await screen.findByText(/Estudar/)).toBeInTheDocument();
  });
});
