import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Spot-Screenshots — LocalFsSpotImageStorage
//
// Spec: Docs/specs/spot-screenshots.md (RF-09)
// ADR : Docs/architecture/decisions/057-spot-image-storage-abstraction.md
//
// Modulo NAO existe ainda — Implementer cria em:
//   server/services/spotImageStorage/local.ts
//
// Contrato (interface SpotImageStorage):
//   put({userId, sessionId, ext, buffer, mime}) -> {key, size}
//   get(key) -> {buffer, mime} | null
//   delete(key) -> boolean (true se removeu, false se nao existia)
//   exists(key) -> boolean
//
// Layout FS:
//   <root>/<userId>/<sessionId>/<nanoid21>.<ext>
//
// Key persistida (path relativo a root, neutro entre backends):
//   {userId}/{sessionId}/{nanoid}.{ext}
//
// Patterns proibidos (lessons learned #file-uploads + ADR-057):
//   - aceitar extension fora da whitelist (png/jpeg/webp)
//   - aceitar key com path traversal (.., \\, leading /)
//   - aceitar userId/sessionId com '..' ou '/' (defesa em profundidade)
// =============================================================================

// Import do modulo que AINDA NAO EXISTE — Implementer cria.
// Tipo da impl resolve em runtime; ts ignora ate o arquivo existir.
// @ts-expect-error - Modulo ainda nao implementado (red phase)
import { LocalFsSpotImageStorage } from '../../../server/services/spotImageStorage/local';

// Diretorio temp por suite — afterEach apaga.
let tmpRoot: string;
let storage: any;

beforeEach(async () => {
  // mkdtemp evita colisao entre tests paralelos
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spot-fs-test-'));
  storage = new LocalFsSpotImageStorage({ root: tmpRoot });
});

afterEach(async () => {
  // Cleanup: remove o tmp inteiro (recursive). Erros silenciosos para nao mascarar
  // falhas de teste reais.
  try {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// Buffer fixture: PNG header valido (89 50 4E 47 0D 0A 1A 0A) + payload minimo.
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  // IHDR chunk (length 13)
  0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
  // 1x1 px, 8-bit, RGBA
  0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00,
  0x1f, 0x15, 0xc4, 0x89,
]);

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
  0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, 0xff, 0xd9, // JPEG EOI
]);

// =============================================================================
// put()
// =============================================================================

describe('LocalFsSpotImageStorage.put - happy path', () => {
  it('cria arquivo em <root>/<userId>/<sessionId>/<nanoid>.<ext> e retorna key', async () => {
    const result = await storage.put({
      userId: 'USER-0001',
      sessionId: 'ses_1',
      ext: 'png',
      buffer: PNG_BYTES,
      mime: 'image/png',
    });

    // key relativa, nao absoluta (ADR-057 ponto 4)
    expect(result.key).toMatch(/^USER-0001\/ses_1\/[A-Za-z0-9_-]+\.png$/);
    expect(result.size).toBe(PNG_BYTES.length);

    // Arquivo existe em disco
    const absPath = path.join(tmpRoot, result.key);
    const stat = await fs.stat(absPath);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBe(PNG_BYTES.length);
  });

  it('cria diretorios pais recursivamente (mkdir recursive)', async () => {
    // Diretorio user/sessao nao existe — put() deve criar.
    const result = await storage.put({
      userId: 'USER-NEW',
      sessionId: 'ses_NEW',
      ext: 'jpeg',
      buffer: JPEG_BYTES,
      mime: 'image/jpeg',
    });

    const dir = path.join(tmpRoot, 'USER-NEW', 'ses_NEW');
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
    expect(result.key).toContain('USER-NEW/ses_NEW/');
  });

  it('aceita ext webp', async () => {
    const result = await storage.put({
      userId: 'u1',
      sessionId: 's1',
      ext: 'webp',
      buffer: Buffer.from('riff_webp_dummy'),
      mime: 'image/webp',
    });
    expect(result.key.endsWith('.webp')).toBe(true);
  });

  it('gera nanoid unico para cada put (mesmo userId/sessionId)', async () => {
    const r1 = await storage.put({
      userId: 'u1', sessionId: 's1', ext: 'png',
      buffer: PNG_BYTES, mime: 'image/png',
    });
    const r2 = await storage.put({
      userId: 'u1', sessionId: 's1', ext: 'png',
      buffer: PNG_BYTES, mime: 'image/png',
    });
    expect(r1.key).not.toBe(r2.key);
  });
});

describe('LocalFsSpotImageStorage.put - validacao', () => {
  it('rejeita ext fora da whitelist (gif)', async () => {
    await expect(
      storage.put({
        userId: 'u1', sessionId: 's1', ext: 'gif',
        buffer: Buffer.from('gif89a'), mime: 'image/gif',
      }),
    ).rejects.toThrow(/extension|ext|formato|whitelist/i);
  });

  it('rejeita ext sem ponto inicial bizarra (txt, exe, php)', async () => {
    for (const ext of ['txt', 'exe', 'php', 'js']) {
      await expect(
        storage.put({
          userId: 'u1', sessionId: 's1', ext,
          buffer: Buffer.from('xxx'), mime: 'text/plain',
        }),
      ).rejects.toThrow();
    }
  });

  // Defesa em profundidade: lessons-learned ponto 2 (path traversal).
  it('rejeita userId com .. (path traversal)', async () => {
    await expect(
      storage.put({
        userId: '../etc',
        sessionId: 's1',
        ext: 'png',
        buffer: PNG_BYTES,
        mime: 'image/png',
      }),
    ).rejects.toThrow();
  });

  it('rejeita sessionId com .. (path traversal)', async () => {
    await expect(
      storage.put({
        userId: 'u1',
        sessionId: '../../passwd',
        ext: 'png',
        buffer: PNG_BYTES,
        mime: 'image/png',
      }),
    ).rejects.toThrow();
  });

  it('rejeita userId com / (separador injetado)', async () => {
    await expect(
      storage.put({
        userId: 'u1/u2',
        sessionId: 's1',
        ext: 'png',
        buffer: PNG_BYTES,
        mime: 'image/png',
      }),
    ).rejects.toThrow();
  });

  it('rejeita userId com \\ (backslash separador no Windows)', async () => {
    await expect(
      storage.put({
        userId: 'u1\\u2',
        sessionId: 's1',
        ext: 'png',
        buffer: PNG_BYTES,
        mime: 'image/png',
      }),
    ).rejects.toThrow();
  });

  it('rejeita /etc/passwd-style absolute paths em sessionId', async () => {
    await expect(
      storage.put({
        userId: 'u1',
        sessionId: '/etc/passwd',
        ext: 'png',
        buffer: PNG_BYTES,
        mime: 'image/png',
      }),
    ).rejects.toThrow();
  });
});

// =============================================================================
// get()
// =============================================================================

describe('LocalFsSpotImageStorage.get', () => {
  it('retorna {buffer, mime} para key valida', async () => {
    const { key } = await storage.put({
      userId: 'u1', sessionId: 's1', ext: 'png',
      buffer: PNG_BYTES, mime: 'image/png',
    });

    const result = await storage.get(key);
    expect(result).not.toBeNull();
    expect(Buffer.isBuffer(result!.buffer)).toBe(true);
    expect(result!.buffer.equals(PNG_BYTES)).toBe(true);
  });

  it('retorna null para key inexistente (sem throw)', async () => {
    const result = await storage.get('USER-XX/ses_XX/inexistent_nanoid.png');
    expect(result).toBeNull();
  });

  it('rejeita key com .. (path traversal — defesa em profundidade)', async () => {
    // ADR-057 ponto 5: get() valida key contra regex antes de tocar FS.
    // Se valor corrompido por SQL injection externa chegar ao storage,
    // ainda assim path traversal eh bloqueado.
    await expect(
      storage.get('USER-0001/../../../etc/passwd'),
    ).rejects.toThrow(/invalid key|invalid|traversal/i);
  });

  it('rejeita key comecando com / (path absoluto)', async () => {
    await expect(
      storage.get('/etc/passwd'),
    ).rejects.toThrow(/invalid key|invalid/i);
  });

  it('rejeita key com \\ (backslash — windows traversal)', async () => {
    await expect(
      storage.get('USER-0001\\..\\..\\etc'),
    ).rejects.toThrow(/invalid key|invalid/i);
  });
});

// =============================================================================
// delete()
// =============================================================================

describe('LocalFsSpotImageStorage.delete', () => {
  it('remove arquivo do disco e retorna true', async () => {
    const { key } = await storage.put({
      userId: 'u1', sessionId: 's1', ext: 'png',
      buffer: PNG_BYTES, mime: 'image/png',
    });

    const removed = await storage.delete(key);
    expect(removed).toBe(true);

    // Confirma que arquivo sumiu
    const absPath = path.join(tmpRoot, key);
    await expect(fs.access(absPath)).rejects.toThrow();
  });

  it('idempotente — delete 2x nao throw', async () => {
    const { key } = await storage.put({
      userId: 'u1', sessionId: 's1', ext: 'png',
      buffer: PNG_BYTES, mime: 'image/png',
    });

    await storage.delete(key); // primeiro: remove
    // Segundo: arquivo ja sumiu, mas nao deve throw (ADR-057 secao Detalhes 7)
    await expect(storage.delete(key)).resolves.not.toThrow();
  });

  it('retorna false quando arquivo nao existia', async () => {
    const removed = await storage.delete('USER-XX/ses_XX/nonexistent_id.png');
    expect(removed).toBe(false);
  });

  it('retorna true quando removeu efetivamente', async () => {
    const { key } = await storage.put({
      userId: 'u1', sessionId: 's1', ext: 'png',
      buffer: PNG_BYTES, mime: 'image/png',
    });
    const removed = await storage.delete(key);
    expect(removed).toBe(true);
  });
});

// =============================================================================
// exists()
// =============================================================================

describe('LocalFsSpotImageStorage.exists', () => {
  it('retorna true para key existente', async () => {
    const { key } = await storage.put({
      userId: 'u1', sessionId: 's1', ext: 'png',
      buffer: PNG_BYTES, mime: 'image/png',
    });
    expect(await storage.exists(key)).toBe(true);
  });

  it('retorna false para key inexistente', async () => {
    expect(await storage.exists('USER-XX/ses_XX/nope.png')).toBe(false);
  });

  it('retorna false apos delete', async () => {
    const { key } = await storage.put({
      userId: 'u1', sessionId: 's1', ext: 'png',
      buffer: PNG_BYTES, mime: 'image/png',
    });
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });
});
