// Sprint MP3.1 Wave A / H1 — orchestrator backfill tests.
// Lesson #36: storage usa lazy @shared/schema + db mock.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks parciais drizzle-orm pra evitar dependency hell.
vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return {
    ...actual,
    eq: (col: any, val: any) => ({ _eq: [col, val] }),
    isNull: (col: any) => ({ _isNull: col }),
    inArray: (col: any, arr: any) => ({ _inArray: [col, arr] }),
    and: (...args: any[]) => ({ _and: args }),
  };
});

// db mockado: select() retorna chain { from, where, limit } async-iterable.
const mockRows: any[] = [];
const dbMock: any = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => mockRows),
        then: (resolve: any) => resolve(mockRows),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  })),
};

vi.mock('../../../server/db', () => ({ db: dbMock }));

const ingestorMock = vi.hoisted(() => ({
  ingestPreviewFromMux: vi.fn(),
}));
vi.mock('../../../server/services/transcriptionIngestor', () => ingestorMock);

async function load() {
  return await import('../../../server/storage/transcriptionPreviewStorage');
}

describe('backfillTranscriptionPreviews orchestrator', () => {
  beforeEach(() => {
    mockRows.length = 0;
    vi.clearAllMocks();
  });

  it('zero candidates -> 0/0/0', async () => {
    const { backfillTranscriptionPreviews } = await load();
    const result = await backfillTranscriptionPreviews();
    expect(result).toEqual({
      updated: 0,
      skipped: 0,
      failed: 0,
      reasons: {},
    });
  });

  it('ingestor ok -> incrementa updated + chama update', async () => {
    mockRows.push(
      { id: 'L1', videoMuxAssetId: 'A1', videoMuxPlaybackId: 'P1' },
      { id: 'L2', videoMuxAssetId: 'A2', videoMuxPlaybackId: 'P2' },
    );
    ingestorMock.ingestPreviewFromMux
      .mockResolvedValueOnce({ ok: true, preview: 'preview-1' })
      .mockResolvedValueOnce({ ok: true, preview: 'preview-2' });

    const { backfillTranscriptionPreviews } = await load();
    const result = await backfillTranscriptionPreviews();
    expect(result.updated).toBe(2);
    expect(result.skipped).toBe(0);
    expect(dbMock.update).toHaveBeenCalledTimes(2);
  });

  it('ingestor falha -> skipped + reason tracking', async () => {
    mockRows.push(
      { id: 'L1', videoMuxAssetId: null, videoMuxPlaybackId: 'P1' },
      { id: 'L2', videoMuxAssetId: 'A2', videoMuxPlaybackId: 'P2' },
    );
    ingestorMock.ingestPreviewFromMux
      .mockResolvedValueOnce({ ok: false, reason: 'no_asset' })
      .mockResolvedValueOnce({ ok: false, reason: 'no_text_tracks' });

    const { backfillTranscriptionPreviews } = await load();
    const result = await backfillTranscriptionPreviews();
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.reasons.no_asset).toBe(1);
    expect(result.reasons.no_text_tracks).toBe(1);
  });

  it('mix sucesso/falha -> contagens separadas', async () => {
    mockRows.push(
      { id: 'L1', videoMuxAssetId: 'A1', videoMuxPlaybackId: 'P1' },
      { id: 'L2', videoMuxAssetId: 'A2', videoMuxPlaybackId: 'P2' },
      { id: 'L3', videoMuxAssetId: 'A3', videoMuxPlaybackId: 'P3' },
    );
    ingestorMock.ingestPreviewFromMux
      .mockResolvedValueOnce({ ok: true, preview: 'ok' })
      .mockResolvedValueOnce({ ok: false, reason: 'no_text_tracks' })
      .mockResolvedValueOnce({ ok: true, preview: 'ok2' });

    const { backfillTranscriptionPreviews } = await load();
    const result = await backfillTranscriptionPreviews();
    expect(result.updated).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.reasons.no_text_tracks).toBe(1);
  });

  it('onProgress callback chamado por lesson', async () => {
    mockRows.push(
      { id: 'L1', videoMuxAssetId: 'A1', videoMuxPlaybackId: 'P1' },
      { id: 'L2', videoMuxAssetId: 'A2', videoMuxPlaybackId: 'P2' },
    );
    ingestorMock.ingestPreviewFromMux.mockResolvedValue({ ok: true, preview: 'x' });

    const onProgress = vi.fn();
    const { backfillTranscriptionPreviews } = await load();
    await backfillTranscriptionPreviews({ onProgress });
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(1, 2, 'L1');
    expect(onProgress).toHaveBeenCalledWith(2, 2, 'L2');
  });
});
