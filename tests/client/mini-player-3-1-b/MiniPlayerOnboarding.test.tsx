// Sprint Mini Player 3.1 Wave B / TIER 3 #7 — MiniPlayerOnboarding.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

function loadModule() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/components/audio-player/MiniPlayerOnboarding');
}

describe('<MiniPlayerOnboarding> (TIER 3 #7)', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  it('renderiza tooltip na primeira vez (flag ausente)', () => {
    const { MiniPlayerOnboarding } = loadModule();
    render(<MiniPlayerOnboarding />);
    expect(screen.getByTestId('audio-onboarding-tooltip')).toBeInTheDocument();
  });

  it('NAO renderiza quando flag ja foi marcada (seen)', () => {
    const { MiniPlayerOnboarding, _ONBOARDING_STORAGE_KEY } = loadModule();
    localStorage.setItem(_ONBOARDING_STORAGE_KEY, 'true');
    render(<MiniPlayerOnboarding />);
    expect(screen.queryByTestId('audio-onboarding-tooltip')).toBeNull();
  });

  it('click anywhere dispara dismiss + marca flag (apos delay attach 300ms)', () => {
    vi.useFakeTimers();
    try {
      const { MiniPlayerOnboarding, _ONBOARDING_STORAGE_KEY } = loadModule();
      render(<MiniPlayerOnboarding />);
      expect(screen.getByTestId('audio-onboarding-tooltip')).toBeInTheDocument();
      // Reviewer HIGH-2 fix: listener so anexa apos 300ms (evita click que abriu
      // o player dismiss prematuro).
      act(() => {
        vi.advanceTimersByTime(350);
      });
      act(() => {
        fireEvent.click(document.body);
      });
      expect(screen.queryByTestId('audio-onboarding-tooltip')).toBeNull();
      expect(localStorage.getItem(_ONBOARDING_STORAGE_KEY)).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('press ? dispara dismiss (apos delay attach 300ms)', () => {
    vi.useFakeTimers();
    try {
      const { MiniPlayerOnboarding } = loadModule();
      render(<MiniPlayerOnboarding />);
      expect(screen.getByTestId('audio-onboarding-tooltip')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(350);
      });
      act(() => {
        fireEvent.keyDown(document, { key: '?' });
      });
      expect(screen.queryByTestId('audio-onboarding-tooltip')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('click ANTES de 300ms NAO dismissa (HIGH-2 guard)', () => {
    vi.useFakeTimers();
    try {
      const { MiniPlayerOnboarding } = loadModule();
      render(<MiniPlayerOnboarding />);
      // Sem advance — listener nao anexado ainda.
      act(() => {
        fireEvent.click(document.body);
      });
      expect(screen.queryByTestId('audio-onboarding-tooltip')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
