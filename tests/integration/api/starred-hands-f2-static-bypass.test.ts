/**
 * Sprint F2 — security regression test
 *
 * Pre-merge review CRITICAL-1: `app.use("/uploads", express.static(...))` em
 * studies-v2.ts servia silenciosamente arquivos de spot screenshots, neutralizando
 * o ownership middleware do ADR-052.
 *
 * Mitigacao: SPOT_UPLOADS_DIR foi movido para `private-uploads/spot-screenshots/`
 * (fora do prefix servido por express.static). URL prefix permanece
 * `/uploads/spot-screenshots/` como identificador logico mas resolve para path
 * fora do static — express.static retorna 404.
 *
 * Este teste prova:
 *   1. SPOT_UPLOADS_DIR fica em `private-uploads/` (NAO em `uploads/`).
 *   2. SPOT_URL_PREFIX (`/uploads/spot-screenshots`) eh apenas identificador
 *      logico — disco real esta noutro lugar.
 *   3. Arquivo gravado em SPOT_UPLOADS_DIR NAO eh alcancavel via leitura do
 *      filesystem servido por express.static (`uploads/`).
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

import { SPOT_UPLOADS_DIR, SPOT_URL_PREFIX } from '../../../server/lib/spotStorage';

describe('Sprint F2 — security regression: spot screenshots fora do static /uploads', () => {
  it('SPOT_UPLOADS_DIR fica fora de uploads/', () => {
    const uploadsRoot = path.resolve('uploads');
    expect(SPOT_UPLOADS_DIR.startsWith(uploadsRoot + path.sep)).toBe(false);
    expect(SPOT_UPLOADS_DIR).toMatch(/private-uploads/);
  });

  it('SPOT_URL_PREFIX eh logico — NAO resolve para path fisico em uploads/', () => {
    // O prefix URL pode parecer "/uploads/..." mas o disco esta em private-uploads/.
    // Isto eh intencional: URL eh ID logico; acesso real via GET /:id/image.
    expect(SPOT_URL_PREFIX).toBe('/uploads/spot-screenshots');
    // Path equivalente em uploads/ NAO existe / nao deve ser usado.
    const fakePathInUploads = path.resolve('uploads' + SPOT_URL_PREFIX.replace('/uploads', ''));
    expect(fakePathInUploads).not.toBe(SPOT_UPLOADS_DIR);
  });

  it('arquivo gravado em SPOT_UPLOADS_DIR NAO eh visivel via filesystem em uploads/spot-screenshots/', () => {
    fs.mkdirSync(SPOT_UPLOADS_DIR, { recursive: true });
    const filename = 'security-regression-' + Date.now() + '.png';
    const realPath = path.join(SPOT_UPLOADS_DIR, filename);
    fs.writeFileSync(realPath, Buffer.from('fake png bytes'));

    try {
      // Caminho que express.static "/uploads" tentaria resolver para SPOT_URL_PREFIX/<file>
      const staticServedPath = path.join(
        path.resolve('uploads'),
        'spot-screenshots',
        filename,
      );

      // Arquivo NAO deve existir em uploads/spot-screenshots/ (esta em private-uploads/).
      expect(fs.existsSync(staticServedPath)).toBe(false);
      // Confirma que o arquivo realmente esta no SPOT_UPLOADS_DIR (private).
      expect(fs.existsSync(realPath)).toBe(true);
    } finally {
      try {
        fs.unlinkSync(realPath);
      } catch {
        /* ignore */
      }
    }
  });
});
