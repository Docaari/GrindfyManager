import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';

// =============================================================================
// Testes TDD (Sprint W-1): hooks/useWarmupTelemetry (RF-19, ADR-030)
//
// Estrategia: client-only via console.log estruturado nesta sprint.
// Hook expoe { track(eventName, props) } que loga em formato:
//   console.log('[telemetry][warmup]', eventName, payload)
// payload inclui: userId, ts (ISO), viewport (mobile|desktop), ...props
//
// Status esperado: FALHANDO (red) ate hook ser implementado.
// =============================================================================

// Mock useAuth para fornecer userId.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

import { useWarmupTelemetry } from '@/hooks/useWarmupTelemetry';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWarmupTelemetry - track function', () => {
  it('expoe funcao track', () => {
    const { result } = renderHook(() => useWarmupTelemetry());
    expect(typeof result.current.track).toBe('function');
  });

  it('console.log com prefixo [telemetry][warmup]', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useWarmupTelemetry());

    result.current.track('warmup_started', { ritualId: 'r-1' });

    expect(spy).toHaveBeenCalled();
    const args = spy.mock.calls[0];
    expect(args[0]).toContain('[telemetry][warmup]');
    spy.mockRestore();
  });

  it('payload inclui eventName como segundo argumento', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useWarmupTelemetry());

    result.current.track('warmup_completed', {});

    const args = spy.mock.calls[0];
    expect(args[1]).toBe('warmup_completed');
    spy.mockRestore();
  });

  it('payload inclui userId do useAuth', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useWarmupTelemetry());

    result.current.track('block_completed', { blockId: 1 });

    const payload = spy.mock.calls[0][2] as any;
    expect(payload.userId).toBe('USER-0001');
    spy.mockRestore();
  });

  it('payload inclui timestamp ISO em ts', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useWarmupTelemetry());

    result.current.track('emotional_check_submitted', { score: 8 });

    const payload = spy.mock.calls[0][2] as any;
    expect(payload.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    spy.mockRestore();
  });

  it('payload inclui viewport (mobile|desktop)', () => {
    // Stub innerWidth = 360 (mobile)
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 360 });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useWarmupTelemetry());

    result.current.track('warmup_started', {});

    const payload = spy.mock.calls[0][2] as any;
    expect(['mobile', 'desktop']).toContain(payload.viewport);
    spy.mockRestore();
  });

  it('viewport=mobile quando innerWidth <= 768', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 360 });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useWarmupTelemetry());
    result.current.track('warmup_started', {});

    const payload = spy.mock.calls[0][2] as any;
    expect(payload.viewport).toBe('mobile');
    spy.mockRestore();
  });

  it('viewport=desktop quando innerWidth > 768', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useWarmupTelemetry());
    result.current.track('warmup_started', {});

    const payload = spy.mock.calls[0][2] as any;
    expect(payload.viewport).toBe('desktop');
    spy.mockRestore();
  });

  it('mantem props customizadas alem das de sistema', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useWarmupTelemetry());

    result.current.track('gate_triggered', { score: 4, ritualId: 'r-1' });

    const payload = spy.mock.calls[0][2] as any;
    expect(payload.score).toBe(4);
    expect(payload.ritualId).toBe('r-1');
    spy.mockRestore();
  });

  it('nao lanca quando props eh objeto vazio', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useWarmupTelemetry());
    expect(() => result.current.track('warmup_started', {})).not.toThrow();
    spy.mockRestore();
  });

  it('NAO faz fetch para servidor (telemetria client-only nesta sprint - ADR-030)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('{}')),
    );
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { result } = renderHook(() => useWarmupTelemetry());
    result.current.track('warmup_completed', {});

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
