import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Spot-Screenshots — detectMimeFromBuffer (magic bytes helper)
//
// Spec: Docs/specs/spot-screenshots.md (NFR Seguranca, decisao founder #2)
// ADR : Docs/architecture/decisions/057-spot-image-storage-abstraction.md
//
// Modulo NAO existe ainda — Implementer cria em:
//   server/services/spotImageStorage/mime.ts
//
// Contrato:
//   detectMimeFromBuffer(buffer: Buffer): "image/png" | "image/jpeg" | "image/webp" | null
//
// Headers reconhecidos:
//   PNG  : 89 50 4E 47 0D 0A 1A 0A  (8 bytes)
//   JPEG : FF D8 FF                  (3 bytes — JFIF, EXIF, etc.)
//   WebP : 52 49 46 46 .. .. .. ..   ("RIFF" 4 bytes)
//          57 45 42 50               ("WEBP" em offset 8)
//
// Lessons learned ponto 1: nao confiar em Content-Type do cliente.
// Magic bytes sao a fonte de verdade — usados para persistir image_mime.
// =============================================================================

// @ts-expect-error - Modulo ainda nao implementado (red phase)
import { detectMimeFromBuffer } from '../../../server/services/spotImageStorage/mime';

// -----------------------------------------------------------------------------
// Fixtures como bytes literais — sem fs.readFileSync, sem dependencias externas.
// Cada buffer eh apenas o suficiente para o magic bytes detector funcionar.
// -----------------------------------------------------------------------------

// PNG: header 8 bytes + IHDR chunk minimo
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, // IHDR length
  0x49, 0x48, 0x44, 0x52, // "IHDR"
  0x00, 0x00, 0x00, 0x01, // width 1
  0x00, 0x00, 0x00, 0x01, // height 1
  0x08, 0x06, 0x00, 0x00, 0x00, // bit depth 8, color RGBA
]);

// JPEG: SOI (FF D8) + APP0 marker (FF E0) + JFIF identifier
const JPEG_JFIF = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
  0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, // "JFIF\0"
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, 0xff, 0xd9, // EOI
]);

// JPEG variant: SOI + EXIF (FF E1)
const JPEG_EXIF = Buffer.from([
  0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10,
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
]);

// WebP: "RIFF" + size (4 bytes) + "WEBP" + "VP8 " sub-chunk
const WEBP_HEADER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x24, 0x00, 0x00, 0x00, // file size (irrelevante p/ deteccao)
  0x57, 0x45, 0x42, 0x50, // "WEBP"
  0x56, 0x50, 0x38, 0x20, // "VP8 " sub-chunk
  0x18, 0x00, 0x00, 0x00,
  0x30, 0x01, 0x00, 0x9d,
]);

// GIF: "GIF87a" — explicitamente NAO whitelisted, deve retornar null.
const GIF_BYTES = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x37, 0x61, // "GIF87a"
  0x01, 0x00, 0x01, 0x00,
]);

// Texto plano: lorem ipsum
const TEXT_BYTES = Buffer.from('Lorem ipsum dolor sit amet', 'utf-8');

// PDF: "%PDF-"
const PDF_BYTES = Buffer.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
]);

// RIFF mas NAO WebP (e.g. WAV audio): "RIFF...WAVE"
const RIFF_WAVE_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46,
  0x24, 0x00, 0x00, 0x00,
  0x57, 0x41, 0x56, 0x45, // "WAVE" — nao "WEBP"
  0x66, 0x6d, 0x74, 0x20,
]);

// Buffer vazio
const EMPTY = Buffer.alloc(0);

// Buffer pequeno demais (1 byte) — nao bate com nenhum header
const TINY = Buffer.from([0x89]);

// =============================================================================
// PNG
// =============================================================================

describe('detectMimeFromBuffer - PNG', () => {
  it('detecta PNG pelo header 89 50 4E 47', () => {
    expect(detectMimeFromBuffer(PNG_HEADER)).toBe('image/png');
  });

  it('detecta PNG mesmo com payload curto apos o header', () => {
    const minimal = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(detectMimeFromBuffer(minimal)).toBe('image/png');
  });

  it('rejeita PNG corrompido (primeiro byte trocado)', () => {
    const corrupt = Buffer.concat([
      Buffer.from([0x88]), // troca 0x89 por 0x88
      PNG_HEADER.slice(1),
    ]);
    expect(detectMimeFromBuffer(corrupt)).toBeNull();
  });
});

// =============================================================================
// JPEG
// =============================================================================

describe('detectMimeFromBuffer - JPEG', () => {
  it('detecta JPEG/JFIF pelo header FF D8 FF', () => {
    expect(detectMimeFromBuffer(JPEG_JFIF)).toBe('image/jpeg');
  });

  it('detecta JPEG/EXIF pelo header FF D8 FF (variant E1)', () => {
    // Mesmo magic bytes (FF D8 FF) — variant nao importa, todos sao image/jpeg.
    expect(detectMimeFromBuffer(JPEG_EXIF)).toBe('image/jpeg');
  });

  it('rejeita FF D8 sem terceiro FF (header truncado)', () => {
    const truncated = Buffer.from([0xff, 0xd8]);
    expect(detectMimeFromBuffer(truncated)).toBeNull();
  });
});

// =============================================================================
// WebP
// =============================================================================

describe('detectMimeFromBuffer - WebP', () => {
  it('detecta WebP via RIFF + WEBP', () => {
    expect(detectMimeFromBuffer(WEBP_HEADER)).toBe('image/webp');
  });

  it('rejeita RIFF que NAO eh WebP (audio WAVE)', () => {
    // Detector deve checar offset 8 — "WAVE" em vez de "WEBP" significa
    // outro tipo de RIFF (audio), nao image.
    expect(detectMimeFromBuffer(RIFF_WAVE_BYTES)).toBeNull();
  });

  it('rejeita RIFF truncado antes do offset 8 (sem "WEBP")', () => {
    const partial = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x24, 0x00, 0x00, 0x00,
      // sem "WEBP"
    ]);
    expect(detectMimeFromBuffer(partial)).toBeNull();
  });
});

// =============================================================================
// Outros tipos — devem retornar null (NAO whitelisted)
// =============================================================================

describe('detectMimeFromBuffer - tipos nao whitelisted', () => {
  it('retorna null para GIF (nao whitelisted)', () => {
    // Mesmo que GIF seja imagem, nao esta na whitelist do spec
    // (decisao founder: png/jpeg/webp apenas).
    expect(detectMimeFromBuffer(GIF_BYTES)).toBeNull();
  });

  it('retorna null para texto puro', () => {
    expect(detectMimeFromBuffer(TEXT_BYTES)).toBeNull();
  });

  it('retorna null para PDF', () => {
    expect(detectMimeFromBuffer(PDF_BYTES)).toBeNull();
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('detectMimeFromBuffer - edge cases', () => {
  it('retorna null para buffer vazio', () => {
    expect(detectMimeFromBuffer(EMPTY)).toBeNull();
  });

  it('retorna null para buffer com 1 byte (insuficiente para qualquer magic)', () => {
    expect(detectMimeFromBuffer(TINY)).toBeNull();
  });

  it('nao throw em buffer null/undefined (defensivo)', () => {
    // O detector deve lidar gracefully com input invalido.
    // Documentamos comportamento esperado: retorna null em vez de explodir.
    expect(() => detectMimeFromBuffer(null as any)).not.toThrow();
    expect(() => detectMimeFromBuffer(undefined as any)).not.toThrow();
  });
});
