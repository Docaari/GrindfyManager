/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-04.2 / ADR-191
 *
 * Module: client/src/lib/audio-telemetry.ts
 *
 * Exporta:
 *  - emitAudioEvent(action, payload, options?): Promise<void>
 *  - flushBacklog(): Promise<void>   // chamado em window 'online' event
 *  - _resetForTests(): void
 *
 * Comportamento:
 *  - useBeacon=true → navigator.sendBeacon('/api/user-activity/batch', JSON.stringify({...}))
 *  - useBeacon=false (default) → fetch('/api/user-activity', { keepalive: true, POST })
 *  - Offline (navigator.onLine === false) → enfileira em localStorage backlog (cap 100)
 *  - Online + ha backlog → flushBacklog re-envia em batches
 *  - Payload contem: action, feature?, duration?, page='mini_player', metadata: { v: 1, clientTimestamp, ...payload }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(async () => {
  vi.useRealTimers();
  try {
    const mod = await import('./audio-telemetry').catch(() => null);
    if (mod && typeof (mod as any)._resetForTests === 'function') {
      (mod as any)._resetForTests();
    }
  } catch {
    // red phase
  }
  // Reset fetch/sendBeacon mocks
  (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  (globalThis as any).navigator = (globalThis as any).navigator ?? {};
  (globalThis as any).navigator.sendBeacon = vi.fn().mockReturnValue(true);
  Object.defineProperty((globalThis as any).navigator, 'onLine', {
    configurable: true,
    get: () => true,
  });
  try {
    localStorage.clear();
  } catch {
    /* node env handled by setup polyfill */
  }
});

async function loadModule() {
  return await import('./audio-telemetry');
}

describe('audio-telemetry.emitAudioEvent (RF-04.2 / ADR-191)', () => {
  it('emit default (fetch keepalive) → POST /api/user-activity com body shape correto', async () => {
    const mod = await loadModule();
    await mod.emitAudioEvent('audio_driver_active', { driver: 'spotify', trackId: 't1' });

    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (globalThis as any).fetch.mock.calls[0];
    expect(url).toBe('/api/user-activity');
    expect(opts.method).toBe('POST');
    expect(opts.keepalive).toBe(true);
    const body = JSON.parse(opts.body);
    expect(body.action).toBe('audio_driver_active');
    expect(body.page).toBe('mini_player');
    expect(body.metadata.driver).toBe('spotify');
    expect(body.metadata.v).toBe(1);
    expect(typeof body.metadata.clientTimestamp).toBe('number');
  });

  it('emit useBeacon=true → navigator.sendBeacon /batch', async () => {
    const mod = await loadModule();
    await mod.emitAudioEvent(
      'audio_driver_active',
      { driver: 'spotify' },
      { useBeacon: true },
    );

    expect((globalThis as any).navigator.sendBeacon).toHaveBeenCalledTimes(1);
    const [url, body] = (globalThis as any).navigator.sendBeacon.mock.calls[0];
    expect(url).toBe('/api/user-activity/batch');
    const parsed = JSON.parse(body);
    // batch endpoint espera { events: [...] }
    expect(Array.isArray(parsed.events)).toBe(true);
    expect(parsed.events[0].action).toBe('audio_driver_active');
  });

  it('options.feature + options.duration repassam pro body', async () => {
    const mod = await loadModule();
    await mod.emitAudioEvent(
      'audio_driver_switch',
      { from: 'html_audio', to: 'spotify' },
      { feature: 'driver_switch', duration: 250 },
    );
    const body = JSON.parse((globalThis as any).fetch.mock.calls[0][1].body);
    expect(body.feature).toBe('driver_switch');
    expect(body.duration).toBe(250);
  });

  it('NUNCA throw — fetch reject NAO propaga', async () => {
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const mod = await loadModule();
    await expect(
      mod.emitAudioEvent('audio_driver_active', { driver: 'spotify' }),
    ).resolves.not.toThrow();
  });

  it('offline (navigator.onLine=false): enfileira em localStorage backlog em vez de fetch', async () => {
    Object.defineProperty((globalThis as any).navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
    const mod = await loadModule();
    await mod.emitAudioEvent('audio_driver_active', { driver: 'spotify', trackId: 'X' });

    expect((globalThis as any).fetch).not.toHaveBeenCalled();
    const stored = localStorage.getItem('mini_player:audio_telemetry_backlog');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].action).toBe('audio_driver_active');
  });

  it('backlog cap 100: 101o evento descarta o mais antigo (FIFO)', async () => {
    Object.defineProperty((globalThis as any).navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
    const mod = await loadModule();
    for (let i = 0; i < 101; i++) {
      await mod.emitAudioEvent('audio_driver_active', { i });
    }
    const parsed = JSON.parse(localStorage.getItem('mini_player:audio_telemetry_backlog')!);
    expect(parsed.length).toBe(100);
    expect(parsed[0].metadata.i).toBe(1); // 0 foi descartado
    expect(parsed[99].metadata.i).toBe(100);
  });

  it('flushBacklog: envia eventos enfileirados em batch via sendBeacon', async () => {
    Object.defineProperty((globalThis as any).navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
    const mod = await loadModule();
    await mod.emitAudioEvent('audio_driver_active', { i: 1 });
    await mod.emitAudioEvent('audio_driver_active', { i: 2 });

    // back online
    Object.defineProperty((globalThis as any).navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
    await mod.flushBacklog();

    // Pode usar fetch OU sendBeacon — verifica que pelo menos um foi chamado.
    const totalCalls =
      ((globalThis as any).fetch.mock.calls?.length ?? 0) +
      ((globalThis as any).navigator.sendBeacon.mock.calls?.length ?? 0);
    expect(totalCalls).toBeGreaterThan(0);

    // backlog vazio apos flush bem-sucedido
    const stored = localStorage.getItem('mini_player:audio_telemetry_backlog');
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.length).toBe(0);
    }
  });

  it('PII strip: emit com email no payload NAO inclui email no body enviado', async () => {
    const mod = await loadModule();
    await mod.emitAudioEvent('spotify_connected', {
      displayNameHash: 'hash_abc',
      email: 'leak@evil.com', // NAO deve persistir
    });
    const body = (globalThis as any).fetch.mock.calls[0][1].body;
    expect(body).not.toContain('leak@evil.com');
  });
});
