// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-01 + ADR-207 §3 — PII guard client-side
//
// Cobertura:
//   - metadata com chave proibida (email, phone, name, cpf, payment_card,
//     address, display_name) eh STRIPPED antes do POST.
//   - console.warn emitido em DEV ao detectar key proibida.
//   - Server `stripPII` ja garante defesa-em-profundidade, mas convencao
//     client eh primeira linha (lesson #9: log antes do swallow).
//
// Lessons: #14/#26 (await import).
// =============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

let fetchSpy: ReturnType<typeof vi.fn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
  (globalThis as any).fetch = fetchSpy;
  if (typeof navigator !== 'undefined') {
    (navigator as any).sendBeacon = undefined;
  }
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

async function loadLib() {
  vi.resetModules();
  const mod: any = await import('@/lib/activity-telemetry');
  if (typeof mod._resetForTests === 'function') mod._resetForTests();
  return mod;
}

describe('RF-01 PII guard client-side (ADR-207 §3)', () => {
  it('strip key "email" do metadata antes do POST', async () => {
    const { emitAudioEvent } = await loadLib();
    await emitAudioEvent('audio.play', {
      track_id: 'tr1',
      email: 'leak@evil.com',
    });
    const [, init] = fetchSpy.mock.calls[0] as any[];
    const body = JSON.parse(init.body);
    expect(body.metadata.email).toBeUndefined();
    expect(body.metadata.track_id).toBe('tr1');
  });

  it('strip keys "phone", "name", "cpf", "payment_card", "address", "display_name"', async () => {
    const { emitCoachEvent } = await loadLib();
    await emitCoachEvent('coach.chat_message', {
      message_type: 'user',
      token_count_input: 10,
      phone: '+5511999998888',
      name: 'Joao',
      cpf: '12345678900',
      payment_card: '4111111111111111',
      address: 'Rua X 123',
      display_name: 'JoaoP',
    });
    const [, init] = fetchSpy.mock.calls[0] as any[];
    const body = JSON.parse(init.body);
    for (const k of ['phone', 'name', 'cpf', 'payment_card', 'address', 'display_name']) {
      expect(body.metadata[k]).toBeUndefined();
    }
    expect(body.metadata.token_count_input).toBe(10);
  });

  it('emite console.warn quando key PII detectada (ADR-207 §3 + lesson #9)', async () => {
    const { emitAudioEvent } = await loadLib();
    await emitAudioEvent('audio.play', {
      track_id: 'tr1',
      email: 'x@x.com',
    });
    expect(warnSpy).toHaveBeenCalled();
  });
});
