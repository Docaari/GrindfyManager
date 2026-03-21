import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD (RED phase): Validacao de Upload de Imagens para Estudos
// Testa as regras de validacao de formato e tamanho de arquivos de imagem.
//
// A funcao de validacao AINDA NAO EXISTE — o Implementer vai cria-la.
// Estes testes definem o contrato esperado.
// =============================================================================

// ---------------------------------------------------------------------------
// Constantes da spec
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

const REJECTED_MIME_TYPES = [
  'application/pdf',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'text/plain',
  'application/json',
] as const;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ---------------------------------------------------------------------------
// Funcao de validacao que sera implementada pelo Implementer
// Contrato:
//   validateStudyImage(file: { mimetype: string, size: number, originalname: string })
//     => { valid: true, filename: string } | { valid: false, error: string }
// ---------------------------------------------------------------------------

import { validateStudyImage } from '../../../server/services/study-images';

// ---------------------------------------------------------------------------
// Helper para gerar URL esperada
// ---------------------------------------------------------------------------

function expectedUrl(filename: string): string {
  return `/uploads/study-images/${filename}`;
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('validateStudyImage', () => {
  describe('formatos aceitos', () => {
    it('deve aceitar arquivo PNG', () => {
      const result = validateStudyImage({
        mimetype: 'image/png',
        size: 1024 * 100, // 100KB
        originalname: 'range-solver.png',
      });

      expect(result.valid).toBe(true);
    });

    it('deve aceitar arquivo JPG', () => {
      const result = validateStudyImage({
        mimetype: 'image/jpg',
        size: 1024 * 200, // 200KB
        originalname: 'spot-analysis.jpg',
      });

      expect(result.valid).toBe(true);
    });

    it('deve aceitar arquivo JPEG', () => {
      const result = validateStudyImage({
        mimetype: 'image/jpeg',
        size: 1024 * 500, // 500KB
        originalname: 'screenshot.jpeg',
      });

      expect(result.valid).toBe(true);
    });

    it('deve aceitar arquivo GIF', () => {
      const result = validateStudyImage({
        mimetype: 'image/gif',
        size: 1024 * 300, // 300KB
        originalname: 'animation.gif',
      });

      expect(result.valid).toBe(true);
    });

    it('deve aceitar arquivo WebP', () => {
      const result = validateStudyImage({
        mimetype: 'image/webp',
        size: 1024 * 150, // 150KB
        originalname: 'modern-format.webp',
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('formatos rejeitados', () => {
    it('deve rejeitar arquivo PDF', () => {
      const result = validateStudyImage({
        mimetype: 'application/pdf',
        size: 1024 * 100,
        originalname: 'document.pdf',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBeTruthy();
      }
    });

    it('deve rejeitar arquivo SVG', () => {
      const result = validateStudyImage({
        mimetype: 'image/svg+xml',
        size: 1024 * 50,
        originalname: 'vector.svg',
      });

      expect(result.valid).toBe(false);
    });

    it('deve rejeitar arquivo BMP', () => {
      const result = validateStudyImage({
        mimetype: 'image/bmp',
        size: 1024 * 500,
        originalname: 'bitmap.bmp',
      });

      expect(result.valid).toBe(false);
    });

    it('deve rejeitar arquivo TIFF', () => {
      const result = validateStudyImage({
        mimetype: 'image/tiff',
        size: 1024 * 200,
        originalname: 'photo.tiff',
      });

      expect(result.valid).toBe(false);
    });

    it('deve rejeitar arquivo texto', () => {
      const result = validateStudyImage({
        mimetype: 'text/plain',
        size: 1024,
        originalname: 'notes.txt',
      });

      expect(result.valid).toBe(false);
    });

    it('deve rejeitar arquivo JSON', () => {
      const result = validateStudyImage({
        mimetype: 'application/json',
        size: 512,
        originalname: 'data.json',
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('validacao de tamanho', () => {
    it('deve aceitar arquivo com exatamente 5MB (limite)', () => {
      const result = validateStudyImage({
        mimetype: 'image/png',
        size: MAX_FILE_SIZE, // exatamente 5MB
        originalname: 'large-range.png',
      });

      expect(result.valid).toBe(true);
    });

    it('deve rejeitar arquivo com 5MB + 1 byte (excede limite)', () => {
      const result = validateStudyImage({
        mimetype: 'image/png',
        size: MAX_FILE_SIZE + 1,
        originalname: 'too-large.png',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/5\s*MB|tamanho|size/i);
      }
    });

    it('deve rejeitar arquivo com 10MB', () => {
      const result = validateStudyImage({
        mimetype: 'image/jpeg',
        size: 10 * 1024 * 1024,
        originalname: 'huge-image.jpeg',
      });

      expect(result.valid).toBe(false);
    });

    it('deve aceitar arquivo pequeno (1KB)', () => {
      const result = validateStudyImage({
        mimetype: 'image/png',
        size: 1024,
        originalname: 'tiny.png',
      });

      expect(result.valid).toBe(true);
    });

    it('deve aceitar arquivo de 4.9MB (abaixo do limite)', () => {
      const result = validateStudyImage({
        mimetype: 'image/jpeg',
        size: 4.9 * 1024 * 1024,
        originalname: 'just-under.jpeg',
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('filename no resultado', () => {
    it('deve retornar filename quando arquivo e valido', () => {
      const result = validateStudyImage({
        mimetype: 'image/png',
        size: 1024 * 100,
        originalname: 'my-range.png',
      });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.filename).toBeTruthy();
        expect(typeof result.filename).toBe('string');
      }
    });

    it('deve gerar filename unico (nao usar originalname diretamente)', () => {
      const result1 = validateStudyImage({
        mimetype: 'image/png',
        size: 1024,
        originalname: 'same-name.png',
      });
      const result2 = validateStudyImage({
        mimetype: 'image/png',
        size: 1024,
        originalname: 'same-name.png',
      });

      if (result1.valid && result2.valid) {
        // Filenames devem ser diferentes para evitar colisao
        expect(result1.filename).not.toBe(result2.filename);
      }
    });

    it('deve preservar a extensao original no filename gerado', () => {
      const pngResult = validateStudyImage({
        mimetype: 'image/png',
        size: 1024,
        originalname: 'test.png',
      });

      if (pngResult.valid) {
        expect(pngResult.filename).toMatch(/\.png$/);
      }

      const jpegResult = validateStudyImage({
        mimetype: 'image/jpeg',
        size: 1024,
        originalname: 'photo.jpeg',
      });

      if (jpegResult.valid) {
        expect(jpegResult.filename).toMatch(/\.jpeg$/);
      }
    });

    it('deve gerar URL no formato /uploads/study-images/{filename}', () => {
      const result = validateStudyImage({
        mimetype: 'image/png',
        size: 1024,
        originalname: 'range.png',
      });

      if (result.valid) {
        const url = expectedUrl(result.filename);
        expect(url).toMatch(/^\/uploads\/study-images\/.+\.png$/);
      }
    });
  });

  describe('mensagens de erro', () => {
    it('deve retornar mensagem de erro para formato invalido', () => {
      const result = validateStudyImage({
        mimetype: 'application/pdf',
        size: 1024,
        originalname: 'doc.pdf',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }
    });

    it('deve retornar mensagem de erro para tamanho excedido', () => {
      const result = validateStudyImage({
        mimetype: 'image/png',
        size: 10 * 1024 * 1024,
        originalname: 'big.png',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBeTruthy();
      }
    });
  });
});
