// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — buildOcrPrompt helper (RF-09)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-09 OCR Claude Haiku 4.5 + cache)
// ADR  : 065 (OCR via Claude Vision — secao "Provider primario")
//
// Modulo NAO existe ainda — Implementer criara em
// `server/services/hudOcrPrompt.ts`.
//
// Shape esperada (Anthropic SDK Messages API):
//   {
//     model: string,
//     max_tokens: number,
//     system: [{ type: 'text', text: ..., cache_control: { type: 'ephemeral' } }],
//     messages: [{ role: 'user', content: [{ type: 'image', source: {...} }] }]
//   }
//
// Lessons aplicadas:
//   #5 vi.fn() nao eh constructor — N/A (helper puro de string)
//   #10 DRY de prompts — system prompt em arquivo unico
// =============================================================================

import { describe, it, expect } from 'vitest';

// Modulo NAO existe — red phase
import {
  buildOcrPrompt,
  OCR_SYSTEM_PROMPT,
} from '../../../server/services/hudOcrPrompt';

describe('buildOcrPrompt — shape Anthropic Messages API', () => {
  it('retorna objeto com model, max_tokens, system, messages', () => {
    const buf = Buffer.from('fake-png-data');
    const params = buildOcrPrompt({ buffer: buf, mime: 'image/png' });
    expect(params).toHaveProperty('model');
    expect(params).toHaveProperty('max_tokens');
    expect(params).toHaveProperty('system');
    expect(params).toHaveProperty('messages');
    expect(Array.isArray(params.messages)).toBe(true);
  });

  it('content do user message inclui image base64', () => {
    const buf = Buffer.from('fake-png-data');
    const params = buildOcrPrompt({ buffer: buf, mime: 'image/png' });
    const message = params.messages[0];
    expect(message.role).toBe('user');
    const imageBlock = (message.content as any[]).find((c) => c.type === 'image');
    expect(imageBlock).toBeDefined();
    expect(imageBlock.source.type).toBe('base64');
    expect(imageBlock.source.media_type).toBe('image/png');
    expect(typeof imageBlock.source.data).toBe('string');
    // base64 do "fake-png-data"
    expect(imageBlock.source.data).toBe(buf.toString('base64'));
  });
});

describe('buildOcrPrompt — system prompt cacheable', () => {
  it('system eh array com cache_control ephemeral', () => {
    const buf = Buffer.from('x');
    const params = buildOcrPrompt({ buffer: buf, mime: 'image/png' });
    expect(Array.isArray(params.system)).toBe(true);
    const sysBlock = (params.system as any[])[0];
    expect(sysBlock.type).toBe('text');
    expect(sysBlock.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('OCR_SYSTEM_PROMPT pede APENAS JSON e descreve schema', () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/JSON/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/label/);
    expect(OCR_SYSTEM_PROMPT).toMatch(/value/);
    expect(OCR_SYSTEM_PROMPT).toMatch(/confidence/);
  });
});

describe('buildOcrPrompt — modelo + max_tokens', () => {
  it('default model = claude-haiku-4-5-20251001', () => {
    const buf = Buffer.from('x');
    const params = buildOcrPrompt({ buffer: buf, mime: 'image/png' });
    // Permite override por env OCR_MODEL — default sem env eh haiku 4.5
    expect(params.model).toMatch(/haiku-4-5|haiku/);
  });

  it('max_tokens razoavel (>=1024)', () => {
    const buf = Buffer.from('x');
    const params = buildOcrPrompt({ buffer: buf, mime: 'image/png' });
    expect(params.max_tokens).toBeGreaterThanOrEqual(1024);
  });
});
