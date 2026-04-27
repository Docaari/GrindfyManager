/**
 * Test-Writer (Modo TDD - Red Phase) — Sprint Alarmes 2.0
 *
 * Spec: Docs/specs/alarmes-2-0-tts.md
 *  - RF-07 Schema — 7 novas colunas em user_settings
 *  - RF-08 Endpoint /api/user-settings aceita novos campos via Zod
 *
 * Modulo testado: shared/schema.ts (insertUserSettingsSchema) e
 * server/routes/misc.ts (POST /api/user-settings — endpoint EXISTENTE).
 *
 * NOTA: spec menciona "PUT /api/user/settings" mas a rota REAL e
 * "POST /api/user-settings" (server/routes/misc.ts:111). Os testes seguem
 * a realidade do projeto (lessons-learned: validar shape REAL antes).
 *
 * Campos novos validados via Zod:
 *   soundMode: 'tts'|'beep'|'mute'
 *   preferredVoiceURI: string|null
 *   alertVolume: 0.0–1.0
 *   alertRepeatCount: 1–5 ou 99 (loop)
 *   alertRepeatGapMs: 2000–30000
 *   ttsRedactBuyIn: boolean
 *   ttsFirstRunSeen: boolean
 */

import { describe, it, expect } from 'vitest';
import { insertUserSettingsSchema } from '@shared/schema';

describe('insertUserSettingsSchema — TTS fields (RF-07 + RF-08)', () => {
  describe('soundMode', () => {
    it('aceita "tts"', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        soundMode: 'tts',
      });
      expect(result.success).toBe(true);
    });

    it('aceita "beep"', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        soundMode: 'beep',
      });
      expect(result.success).toBe(true);
    });

    it('aceita "mute"', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        soundMode: 'mute',
      });
      expect(result.success).toBe(true);
    });

    it('rejeita valor invalido', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        soundMode: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('preferredVoiceURI', () => {
    it('aceita string', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        preferredVoiceURI: 'Microsoft Maria - Portuguese (Brazil)',
      });
      expect(result.success).toBe(true);
    });

    it('aceita null', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        preferredVoiceURI: null,
      });
      expect(result.success).toBe(true);
    });

    it('aceita ausente (campo opcional)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
      });
      expect(result.success).toBe(true);
    });

    it('rejeita string > 255 chars', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        preferredVoiceURI: 'x'.repeat(256),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('alertVolume (range 0.0-1.0)', () => {
    it('aceita 0.5', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertVolume: 0.5,
      });
      expect(result.success).toBe(true);
    });

    it('aceita 0.0', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertVolume: 0,
      });
      expect(result.success).toBe(true);
    });

    it('aceita 1.0', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertVolume: 1,
      });
      expect(result.success).toBe(true);
    });

    it('rejeita 1.5 (acima de 1.0)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertVolume: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it('rejeita -0.1 (negativo)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertVolume: -0.1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('alertRepeatCount (range 1-5 ou 99)', () => {
    it('aceita 1', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatCount: 1,
      });
      expect(result.success).toBe(true);
    });

    it('aceita 2 (default P1-4)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatCount: 2,
      });
      expect(result.success).toBe(true);
    });

    it('aceita 5', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatCount: 5,
      });
      expect(result.success).toBe(true);
    });

    it('aceita 99 (loop)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatCount: 99,
      });
      expect(result.success).toBe(true);
    });

    it('rejeita 0', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatCount: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejeita 100 (acima do max 99)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatCount: 100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('alertRepeatGapMs (range 2000-30000)', () => {
    it('aceita 3000 (default P1-4)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatGapMs: 3000,
      });
      expect(result.success).toBe(true);
    });

    it('aceita 2000 (limite inferior)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatGapMs: 2000,
      });
      expect(result.success).toBe(true);
    });

    it('aceita 30000 (limite superior)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatGapMs: 30000,
      });
      expect(result.success).toBe(true);
    });

    it('rejeita 1000 (abaixo do min 2000)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatGapMs: 1000,
      });
      expect(result.success).toBe(false);
    });

    it('rejeita 30001 (acima do max 30000)', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertRepeatGapMs: 30001,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ttsRedactBuyIn (P0-2: privacy default true)', () => {
    it('aceita true', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        ttsRedactBuyIn: true,
      });
      expect(result.success).toBe(true);
    });

    it('aceita false', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        ttsRedactBuyIn: false,
      });
      expect(result.success).toBe(true);
    });

    it('rejeita string "true"', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        ttsRedactBuyIn: 'true' as any,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ttsFirstRunSeen (P0-1)', () => {
    it('aceita true', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        ttsFirstRunSeen: true,
      });
      expect(result.success).toBe(true);
    });

    it('aceita false', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        ttsFirstRunSeen: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Body parcial (PATCH-like merge)', () => {
    it('aceita body com so volume', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        alertVolume: 0.3,
      });
      expect(result.success).toBe(true);
    });

    it('aceita body com so soundMode', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        soundMode: 'mute',
      });
      expect(result.success).toBe(true);
    });

    it('aceita os 7 campos novos juntos', () => {
      const result = insertUserSettingsSchema.safeParse({
        userId: 'USER-0001',
        soundMode: 'tts',
        preferredVoiceURI: 'maria-uri',
        alertVolume: 0.7,
        alertRepeatCount: 2,
        alertRepeatGapMs: 3000,
        ttsRedactBuyIn: true,
        ttsFirstRunSeen: true,
      });
      expect(result.success).toBe(true);
    });
  });
});
