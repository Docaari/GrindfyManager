import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-02 — MediaStorage abstraction generica
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-02
// ADR: Docs/architecture/decisions/071-media-storage-backend-generic.md
//
// Modulo target: server/services/mediaStorage.ts (AINDA NAO EXISTE)
//
// Surface esperada:
//   interface MediaStorage {
//     put(input: { scope: string, userId?: string, ext: string, buffer: Buffer, mime: string })
//       => Promise<{ key: string, size: number }>
//     get(key: string) => Promise<{ buffer: Buffer, mime: string } | null>
//     delete(key: string) => Promise<void>
//     exists(key: string) => Promise<boolean>
//   }
//
//   createMediaStorage(opts?: { root?: string }) => MediaStorage
//   resolveMediaBackend() => 'local' | 's3' | 'mux'
//
// Backends:
//   - local (default) — FS em uploads/ ou root injetavel para tests
//   - s3 — stub, lanca not_implemented
//   - mux — fora do contrato MediaStorage (ADR-072)
//
// Env aliasing:
//   MEDIA_STORAGE_BACKEND=local|s3 (preferred)
//   SPOT_IMAGE_STORAGE_BACKEND=... (deprecated, alias com warn)
// =============================================================================

import {
  createMediaStorage,
  resolveMediaBackend,
  // @ts-expect-error - modulo nao existe (red phase)
} from '../../../server/services/mediaStorage';

// ---------------------------------------------------------------------------
// Setup: tmpdir como root do FS para isolar tests
// ---------------------------------------------------------------------------

let tmpRoot: string;
let storage: any;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mediaStorage-test-'));
  storage = createMediaStorage({ root: tmpRoot });
  // Reset env entre tests
  delete process.env.MEDIA_STORAGE_BACKEND;
  delete process.env.SPOT_IMAGE_STORAGE_BACKEND;
});

afterEach(async () => {
  if (tmpRoot) {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// resolveMediaBackend — env handling + alias retrocompat
// ---------------------------------------------------------------------------

describe('resolveMediaBackend', () => {
  it('deve retornar "local" como default sem env definido', () => {
    expect(resolveMediaBackend()).toBe('local');
  });

  it('deve respeitar MEDIA_STORAGE_BACKEND quando setado', () => {
    process.env.MEDIA_STORAGE_BACKEND = 's3';
    expect(resolveMediaBackend()).toBe('s3');
  });

  it('deve fallback para SPOT_IMAGE_STORAGE_BACKEND com warning quando MEDIA_STORAGE_BACKEND ausente', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.SPOT_IMAGE_STORAGE_BACKEND = 'local';
    delete process.env.MEDIA_STORAGE_BACKEND;
    expect(resolveMediaBackend()).toBe('local');
    expect(warnSpy).toHaveBeenCalled();
    const calls = warnSpy.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(calls.toLowerCase()).toMatch(/deprecated|spot_image_storage_backend/);
    warnSpy.mockRestore();
  });

  it('MEDIA_STORAGE_BACKEND tem precedencia sobre SPOT_IMAGE_STORAGE_BACKEND', () => {
    process.env.MEDIA_STORAGE_BACKEND = 's3';
    process.env.SPOT_IMAGE_STORAGE_BACKEND = 'local';
    expect(resolveMediaBackend()).toBe('s3');
  });
});

// ---------------------------------------------------------------------------
// put() — escrita basica + cap de scope + path traversal
// ---------------------------------------------------------------------------

describe('MediaStorage.put', () => {
  it('deve salvar buffer e retornar key + size', async () => {
    const buf = Buffer.from('audio-bytes');
    const result = await storage.put({
      scope: 'library/audio',
      userId: 'USER-0001',
      ext: 'm4a',
      buffer: buf,
      mime: 'audio/mp4',
    });
    expect(result.key).toMatch(/^library\/audio\/USER-0001\/[A-Za-z0-9_-]+\.m4a$/);
    expect(result.size).toBe(buf.length);

    // Deve existir no FS
    const absPath = path.join(tmpRoot, result.key);
    const onDisk = await fs.readFile(absPath);
    expect(onDisk.equals(buf)).toBe(true);
  });

  it('deve permitir put sem userId (asset global tipo capa)', async () => {
    const buf = Buffer.from('cover-bytes');
    const result = await storage.put({
      scope: 'library/covers',
      ext: 'jpg',
      buffer: buf,
      mime: 'image/jpeg',
    });
    // Sem userId no path
    expect(result.key).toMatch(/^library\/covers\/[A-Za-z0-9_-]+\.jpg$/);
    expect(result.key).not.toContain('USER-');
  });

  it('deve rejeitar buffer invalido (nao-Buffer)', async () => {
    await expect(
      storage.put({
        scope: 'library/audio',
        ext: 'm4a',
        buffer: 'not-a-buffer' as any,
        mime: 'audio/mp4',
      })
    ).rejects.toThrow(/buffer/i);
  });

  it('deve rejeitar scope com path traversal (..)', async () => {
    await expect(
      storage.put({
        scope: '../../../etc',
        ext: 'm4a',
        buffer: Buffer.from('x'),
        mime: 'audio/mp4',
      })
    ).rejects.toThrow(/scope|traversal|invalid/i);
  });

  it('deve rejeitar userId com path traversal', async () => {
    await expect(
      storage.put({
        scope: 'library/audio',
        userId: '..\\..\\evil',
        ext: 'm4a',
        buffer: Buffer.from('x'),
        mime: 'audio/mp4',
      })
    ).rejects.toThrow(/userId|traversal|invalid/i);
  });

  it('deve gerar keys distintos para puts identicos (nanoid)', async () => {
    const a = await storage.put({
      scope: 'library/audio',
      userId: 'USER-0001',
      ext: 'm4a',
      buffer: Buffer.from('x'),
      mime: 'audio/mp4',
    });
    const b = await storage.put({
      scope: 'library/audio',
      userId: 'USER-0001',
      ext: 'm4a',
      buffer: Buffer.from('x'),
      mime: 'audio/mp4',
    });
    expect(a.key).not.toBe(b.key);
  });
});

// ---------------------------------------------------------------------------
// get() — leitura + path traversal
// ---------------------------------------------------------------------------

describe('MediaStorage.get', () => {
  it('deve retornar { buffer, mime } para key existente', async () => {
    const buf = Buffer.from('hello');
    const { key } = await storage.put({
      scope: 'library/audio',
      userId: 'USER-0001',
      ext: 'm4a',
      buffer: buf,
      mime: 'audio/mp4',
    });
    const got = await storage.get(key);
    expect(got).not.toBeNull();
    expect(got!.buffer.equals(buf)).toBe(true);
    expect(got!.mime).toMatch(/audio\/mp4|application\/octet-stream/);
  });

  it('deve retornar null para key inexistente', async () => {
    const got = await storage.get('library/audio/USER-0001/nonexistent.m4a');
    expect(got).toBeNull();
  });

  it('deve rejeitar path traversal em key (..)', async () => {
    await expect(storage.get('../../../etc/passwd')).rejects.toThrow(
      /traversal|invalid|key/i
    );
  });

  it('deve rejeitar key absoluta', async () => {
    await expect(storage.get('/etc/passwd')).rejects.toThrow(/invalid|key/i);
  });
});

// ---------------------------------------------------------------------------
// delete() + exists()
// ---------------------------------------------------------------------------

describe('MediaStorage.delete + exists', () => {
  it('exists deve retornar true para key existente, false para inexistente', async () => {
    const { key } = await storage.put({
      scope: 'library/audio',
      userId: 'USER-0001',
      ext: 'm4a',
      buffer: Buffer.from('x'),
      mime: 'audio/mp4',
    });
    expect(await storage.exists(key)).toBe(true);
    expect(await storage.exists('library/audio/USER-0001/missing.m4a')).toBe(false);
  });

  it('delete deve remover arquivo', async () => {
    const { key } = await storage.put({
      scope: 'library/audio',
      userId: 'USER-0001',
      ext: 'm4a',
      buffer: Buffer.from('x'),
      mime: 'audio/mp4',
    });
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it('delete em key inexistente nao deve lancar (idempotente)', async () => {
    await expect(
      storage.delete('library/audio/USER-0001/missing.m4a')
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Compat — wrapper para spotImageStorage
// ---------------------------------------------------------------------------

describe('MediaStorage compat — spots scope retro', () => {
  it('put scope=spots/<sessionId> deve gerar key compat layout antigo', async () => {
    const result = await storage.put({
      scope: 'spots/ses_123',
      userId: 'USER-0001',
      ext: 'png',
      buffer: Buffer.from('img-bytes'),
      mime: 'image/png',
    });
    // Key deve incluir sessionId e userId no path
    expect(result.key).toContain('spots/ses_123');
    expect(result.key).toContain('USER-0001');
    expect(result.key.endsWith('.png')).toBe(true);
  });
});
