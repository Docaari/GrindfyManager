// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.2 / RF-03 - JSDoc policy + security em sanitizeCoverUrl
//
// Spec: Docs/specs/sprint-mini-player-1.2.md RF-03 (MEDIUM-3)
//
// Target: client/src/lib/audio-engine/sanitizeCoverUrl.ts
//
// Background: hoje sanitizeCoverUrl bloqueia data:image/* sem doc. Reviewer R2
// MEDIUM-3: "se MP2 quiser embedded placeholder Spotify, vai abrir excecao
// errada". Adicionar JSDoc @policy + @security explicando que:
//   - data:image/* bloqueado by-design (XSS via SVG inline)
//   - Outros pseudo-protocols bloqueados (javascript:, file:, ftp:, blob:)
//   - HTTPS preferido, HTTP aceito (Media Session API tolera)
//   - URLs relativas REJEITADAS
//   - NAO implementar excecao data:image/png — so documentar para MP2
//
// Cobertura (doc-only — comportamento permanece identico):
//   - JSDoc no topo do arquivo contem @policy
//   - JSDoc contem @security
//   - Doc menciona explicitamente "data:image" + "XSS"
//   - Doc menciona "MP2" ou "Spotify" como contexto futuro de excecao
//   - Comportamento NAO muda: data:image/png continua retornando null
//   - Comportamento NAO muda: data:image/svg+xml continua retornando null
//   - Comportamento NAO muda: blob: continua retornando null (mencionado na
//     policy mas ja bloqueado pela URL parsing)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { sanitizeCoverUrl } from '@/lib/audio-engine/sanitizeCoverUrl';

describe('sanitizeCoverUrl RF-03 — JSDoc @policy + @security', () => {
  it('source contem JSDoc tag @policy', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      process.cwd(),
      'client/src/lib/audio-engine/sanitizeCoverUrl.ts',
    );
    const src = fs.readFileSync(filePath, 'utf8');

    expect(src).toMatch(/@policy/);
  });

  it('source contem JSDoc tag @security', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      process.cwd(),
      'client/src/lib/audio-engine/sanitizeCoverUrl.ts',
    );
    const src = fs.readFileSync(filePath, 'utf8');

    expect(src).toMatch(/@security/);
  });

  it('JSDoc menciona "data:image" explicitamente (bloqueio by-design)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      process.cwd(),
      'client/src/lib/audio-engine/sanitizeCoverUrl.ts',
    );
    const src = fs.readFileSync(filePath, 'utf8');

    expect(src).toMatch(/data:image/i);
  });

  it('JSDoc menciona XSS como motivo do bloqueio data:image/*', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      process.cwd(),
      'client/src/lib/audio-engine/sanitizeCoverUrl.ts',
    );
    const src = fs.readFileSync(filePath, 'utf8');

    expect(src).toMatch(/xss/i);
  });

  it('JSDoc menciona MP2 OR Spotify como contexto futuro de excecao', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      process.cwd(),
      'client/src/lib/audio-engine/sanitizeCoverUrl.ts',
    );
    const src = fs.readFileSync(filePath, 'utf8');

    // Aceita ambos MP2 ou Spotify (qualquer marker indicando "futuro").
    const hasFutureContext = /MP2|Spotify/i.test(src);
    expect(hasFutureContext).toBe(true);
  });

  it('comportamento inalterado: data:image/png continua retornando null', () => {
    expect(sanitizeCoverUrl('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
  });

  it('comportamento inalterado: data:image/svg+xml continua retornando null', () => {
    expect(
      sanitizeCoverUrl('data:image/svg+xml;base64,PHN2ZyB4bWxucz0='),
    ).toBeNull();
  });

  it('comportamento inalterado: javascript: continua retornando null', () => {
    expect(sanitizeCoverUrl('javascript:alert(1)')).toBeNull();
  });

  it('comportamento inalterado: https URL valida continua passando', () => {
    expect(sanitizeCoverUrl('https://cdn.example.com/cover.jpg')).toBe(
      'https://cdn.example.com/cover.jpg',
    );
  });
});
