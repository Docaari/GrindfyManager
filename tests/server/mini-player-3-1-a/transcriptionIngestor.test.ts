// Sprint MP3.1 Wave A / H1 — transcriptionIngestor unit tests.

import { describe, it, expect, vi } from 'vitest';

async function load() {
  return await import('../../../server/services/transcriptionIngestor');
}

const SAMPLE_VTT = `WEBVTT

NOTE
This is a note block that should be skipped.

00:00:00.000 --> 00:00:03.500
<v Speaker>Hoje vamos falar sobre cbet em flops dry.</v>

00:00:03.500 --> 00:00:07.000
ICM matters muito em final tables.

00:00:07.000 --> 00:00:10.000
Esse spot e classico de exploit vs nit.
`;

describe('extractTextFromVtt', () => {
  it('extrai apenas linhas de fala, sem timestamps/notes/headers/tags', async () => {
    const { extractTextFromVtt } = await load();
    const out = extractTextFromVtt(SAMPLE_VTT);
    expect(out).toMatch(/Hoje vamos falar sobre cbet/);
    expect(out).not.toMatch(/WEBVTT/);
    expect(out).not.toMatch(/-->/);
    expect(out).not.toMatch(/NOTE/);
    expect(out).not.toMatch(/<v /);
  });

  it('empty/invalid input -> empty string', async () => {
    const { extractTextFromVtt } = await load();
    expect(extractTextFromVtt('')).toBe('');
    expect(extractTextFromVtt(null as any)).toBe('');
  });
});

describe('truncatePreview', () => {
  it('strings curtas retornam intactas', async () => {
    const { truncatePreview } = await load();
    expect(truncatePreview('curto')).toBe('curto');
  });

  it('strings longas truncam com ellipsis unicode', async () => {
    const { truncatePreview } = await load();
    const long = 'a'.repeat(200);
    const out = truncatePreview(long, 80);
    expect(out?.endsWith('…')).toBe(true);
    expect(out?.length).toBeLessThanOrEqual(81);
  });

  it('recorta em boundary de espaco quando possivel', async () => {
    const { truncatePreview } = await load();
    const text = 'palavra '.repeat(20);
    const out = truncatePreview(text, 50);
    expect(out?.endsWith('…')).toBe(true);
    // Nao corta no meio de "palavra".
    expect(out?.split('…')[0].endsWith(' ')).toBe(false);
    expect(out?.includes('palavr…')).toBe(false);
  });

  it('texto vazio retorna null', async () => {
    const { truncatePreview } = await load();
    expect(truncatePreview('')).toBeNull();
    expect(truncatePreview('   ')).toBeNull();
  });
});

describe('ingestPreviewFromMux', () => {
  function makeMockClient(asset: any) {
    return {
      video: {
        assets: {
          retrieve: vi.fn().mockResolvedValue(asset),
        },
      },
    };
  }

  it('no_asset quando assetId null', async () => {
    const { ingestPreviewFromMux } = await load();
    const result = await ingestPreviewFromMux(
      { assetId: null, playbackId: 'pb1' },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_asset');
  });

  it('no_playback_id quando playbackId null', async () => {
    const { ingestPreviewFromMux } = await load();
    const result = await ingestPreviewFromMux(
      { assetId: 'asset1', playbackId: null },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_playback_id');
  });

  it('mux_not_configured quando sem cliente injetado + env ausente', async () => {
    const oldId = process.env.MUX_TOKEN_ID;
    const oldSecret = process.env.MUX_TOKEN_SECRET;
    delete process.env.MUX_TOKEN_ID;
    delete process.env.MUX_TOKEN_SECRET;
    try {
      const { ingestPreviewFromMux } = await load();
      const result = await ingestPreviewFromMux(
        { assetId: 'asset1', playbackId: 'pb1' },
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('mux_not_configured');
    } finally {
      if (oldId) process.env.MUX_TOKEN_ID = oldId;
      if (oldSecret) process.env.MUX_TOKEN_SECRET = oldSecret;
    }
  });

  it('no_text_tracks quando asset sem tracks de texto', async () => {
    const { ingestPreviewFromMux } = await load();
    const mux = makeMockClient({
      data: {
        tracks: [{ id: 'tr1', type: 'video', status: 'ready' }],
      },
    });
    const result = await ingestPreviewFromMux(
      { assetId: 'asset1', playbackId: 'pb1' },
      { muxClient: mux as any },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_text_tracks');
  });

  it('happy path: text track ready -> preview extraido + truncado', async () => {
    const { ingestPreviewFromMux } = await load();
    const mux = makeMockClient({
      data: {
        tracks: [
          {
            id: 'tr-text-1',
            type: 'text',
            text_type: 'subtitles',
            text_source: 'uploaded',
            status: 'ready',
          },
        ],
      },
    });
    const fetchVtt = vi.fn().mockResolvedValue(SAMPLE_VTT);
    const result = await ingestPreviewFromMux(
      { assetId: 'asset1', playbackId: 'pb1' },
      { muxClient: mux as any, fetchVttText: fetchVtt },
    );
    expect(result.ok).toBe(true);
    expect(result.preview).toContain('Hoje vamos');
    expect(fetchVtt).toHaveBeenCalledWith(
      expect.stringContaining('stream.mux.com/pb1/text/tr-text-1.vtt'),
    );
  });

  it('subtitles preferido sobre captions', async () => {
    const { ingestPreviewFromMux } = await load();
    const mux = makeMockClient({
      data: {
        tracks: [
          { id: 'cap1', type: 'text', text_type: 'captions', status: 'ready' },
          {
            id: 'sub1',
            type: 'text',
            text_type: 'subtitles',
            text_source: 'uploaded',
            status: 'ready',
          },
        ],
      },
    });
    const fetchVtt = vi.fn().mockResolvedValue(SAMPLE_VTT);
    await ingestPreviewFromMux(
      { assetId: 'asset1', playbackId: 'pb1' },
      { muxClient: mux as any, fetchVttText: fetchVtt },
    );
    // Primeira chamada deve ser para `sub1`.
    expect(fetchVtt.mock.calls[0][0]).toContain('/text/sub1.vtt');
  });

  it('fetch_failed -> tenta proximo track + empty_transcript se nada funciona', async () => {
    const { ingestPreviewFromMux } = await load();
    const mux = makeMockClient({
      data: {
        tracks: [
          { id: 'tr1', type: 'text', status: 'ready' },
          { id: 'tr2', type: 'text', status: 'ready' },
        ],
      },
    });
    const fetchVtt = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await ingestPreviewFromMux(
      { assetId: 'asset1', playbackId: 'pb1' },
      { muxClient: mux as any, fetchVttText: fetchVtt },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty_transcript');
    expect(fetchVtt).toHaveBeenCalledTimes(2);
  });

  it('fetch_failed asset retrieve -> reason fetch_failed', async () => {
    const { ingestPreviewFromMux } = await load();
    const mux = {
      video: {
        assets: { retrieve: vi.fn().mockRejectedValue(new Error('500')) },
      },
    };
    const result = await ingestPreviewFromMux(
      { assetId: 'asset1', playbackId: 'pb1' },
      { muxClient: mux as any },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('fetch_failed');
  });

  it('empty_transcript quando VTT so tem cabecalho', async () => {
    const { ingestPreviewFromMux } = await load();
    const mux = makeMockClient({
      data: { tracks: [{ id: 'tr1', type: 'text', status: 'ready' }] },
    });
    const fetchVtt = vi.fn().mockResolvedValue('WEBVTT\n\n');
    const result = await ingestPreviewFromMux(
      { assetId: 'asset1', playbackId: 'pb1' },
      { muxClient: mux as any, fetchVttText: fetchVtt },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty_transcript');
  });
});
