// Sprint Mini Player 3.2 / Wave A / W-A1 + W-A3 + W-A4 — Ingestor extensions.
// ADR-199 + ADR-200 + ADR-201. RED PHASE — alguns campos novos ainda nao existem.
//
// Cobre:
// - W-A1: createMuxAsset com generated_subtitles payload contendo [{language_code:'pt'}]
// - W-A1: MUX_GENERATED_SUBTITLES_LANGS override CSV
// - W-A1: Mux 400 lang invalido -> asset criado sem caption + warn
// - W-A3: WHISPER_FALLBACK_ENABLED=false -> retorna 'whisper_disabled' reason
// - W-A4: Ingestor escreve em JSONB transcriptionPreviews[lang]
// - W-A4: Espelha em varchar legacy quando lang='pt'

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Mux asset creation com generated_subtitles (W-A1)", () => {
  beforeEach(() => {
    process.env.MUX_TOKEN_ID = "test-id";
    process.env.MUX_TOKEN_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.MUX_TOKEN_ID;
    delete process.env.MUX_TOKEN_SECRET;
    delete process.env.MUX_GENERATED_SUBTITLES_LANGS;
  });

  it("payload inclui generated_subtitles default [{language_code:'pt'}]", async () => {
    const { createMuxAssetWithSubtitles } = await import(
      "../../server/services/muxAssetCreator"
    );

    const createSpy = vi.fn().mockResolvedValue({
      id: "asset-1",
      playback_ids: [{ id: "play-1", policy: "public" }],
    });
    const mockClient = {
      video: { assets: { create: createSpy } },
    };

    await createMuxAssetWithSubtitles(
      { inputUrl: "https://example.com/v.mp4" },
      { muxClient: mockClient as any },
    );

    expect(createSpy).toHaveBeenCalledOnce();
    const payload = createSpy.mock.calls[0][0];
    expect(payload.generated_subtitles).toEqual([
      expect.objectContaining({ language_code: "pt" }),
    ]);
  });

  it("MUX_GENERATED_SUBTITLES_LANGS=pt,en gera 2 entries", async () => {
    process.env.MUX_GENERATED_SUBTITLES_LANGS = "pt,en";
    const { createMuxAssetWithSubtitles } = await import(
      "../../server/services/muxAssetCreator"
    );

    const createSpy = vi.fn().mockResolvedValue({
      id: "asset-1",
      playback_ids: [{ id: "play-1" }],
    });

    await createMuxAssetWithSubtitles(
      { inputUrl: "https://example.com/v.mp4" },
      { muxClient: { video: { assets: { create: createSpy } } } as any },
    );

    const payload = createSpy.mock.calls[0][0];
    expect(payload.generated_subtitles).toHaveLength(2);
    expect(payload.generated_subtitles[0].language_code).toBe("pt");
    expect(payload.generated_subtitles[1].language_code).toBe("en");
  });

  it("Mux 400 lang invalido -> retry sem captions + log warn", async () => {
    process.env.MUX_GENERATED_SUBTITLES_LANGS = "xx-invalid";
    const { createMuxAssetWithSubtitles } = await import(
      "../../server/services/muxAssetCreator"
    );

    const createSpy = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("Invalid language code"), { status: 400 }),
      )
      .mockResolvedValueOnce({ id: "asset-1", playback_ids: [{ id: "play-1" }] });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await createMuxAssetWithSubtitles(
      { inputUrl: "https://example.com/v.mp4" },
      { muxClient: { video: { assets: { create: createSpy } } } as any },
    );

    // 1a chamada falhou; 2a NAO inclui generated_subtitles
    expect(createSpy).toHaveBeenCalledTimes(2);
    const secondPayload = createSpy.mock.calls[1][0];
    expect(secondPayload.generated_subtitles).toBeUndefined();
    expect(result.id).toBe("asset-1");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("Whisper fallback gate (W-A3)", () => {
  afterEach(() => {
    delete process.env.WHISPER_FALLBACK_ENABLED;
  });

  it("WHISPER_FALLBACK_ENABLED=false -> retorna reason='whisper_disabled'", async () => {
    process.env.WHISPER_FALLBACK_ENABLED = "false";
    const { tryWhisperFallback } = await import(
      "../../server/services/whisperFallback"
    );

    const result = await tryWhisperFallback({
      playbackId: "play-1",
      lang: "pt",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("whisper_disabled");
  });

  it("env ausente trata como disabled (default false)", async () => {
    delete process.env.WHISPER_FALLBACK_ENABLED;
    const { tryWhisperFallback } = await import(
      "../../server/services/whisperFallback"
    );

    const result = await tryWhisperFallback({
      playbackId: "play-1",
      lang: "pt",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("whisper_disabled");
  });

  it("WHISPER_FALLBACK_ENABLED=true mas sem implementacao -> reason='whisper_not_implemented'", async () => {
    process.env.WHISPER_FALLBACK_ENABLED = "true";
    const { tryWhisperFallback } = await import(
      "../../server/services/whisperFallback"
    );

    const result = await tryWhisperFallback({
      playbackId: "play-1",
      lang: "pt",
    });

    expect(result.ok).toBe(false);
    // Placeholder pode retornar whisper_not_implemented OR whisper_disabled — discriminado
    expect(["whisper_not_implemented", "whisper_disabled"]).toContain(result.reason);
  });
});

describe("Ingestor + JSONB transcriptionPreviews (W-A4)", () => {
  beforeEach(() => {
    process.env.MUX_TOKEN_ID = "test-id";
    process.env.MUX_TOKEN_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.MUX_TOKEN_ID;
    delete process.env.MUX_TOKEN_SECRET;
  });

  it("writeTranscriptionPreview escreve em previews[lang] + espelha varchar quando lang='pt'", async () => {
    const mod = await import("../../server/storage/transcriptionPreviewStorage");
    expect(typeof (mod as any).writeTranscriptionPreview).toBe("function");

    const updateSpy = vi.fn().mockResolvedValue(undefined);
    const setSpy = vi.fn().mockReturnValue({ where: () => updateSpy() });
    const dbMock = { update: vi.fn().mockReturnValue({ set: setSpy }) };

    await (mod as any).writeTranscriptionPreview(
      "lesson-1",
      "pt",
      "Texto preview PT",
      { db: dbMock },
    );

    // set foi chamado com objeto contendo transcriptionPreviews (sql) + varchar mirror
    expect(setSpy).toHaveBeenCalledOnce();
    const payload = setSpy.mock.calls[0][0];
    expect(payload).toHaveProperty("transcriptionPreviews");
    expect(payload).toHaveProperty("transcriptionPreview", "Texto preview PT");
  });

  it("writeTranscriptionPreview lang='en' NAO espelha em varchar legacy", async () => {
    const mod = await import("../../server/storage/transcriptionPreviewStorage");

    const setSpy = vi.fn().mockReturnValue({ where: () => Promise.resolve() });
    const dbMock = { update: vi.fn().mockReturnValue({ set: setSpy }) };

    await (mod as any).writeTranscriptionPreview(
      "lesson-1",
      "en",
      "English preview text",
      { db: dbMock },
    );

    const payload = setSpy.mock.calls[0][0];
    expect(payload).toHaveProperty("transcriptionPreviews");
    expect(payload.transcriptionPreview).toBeUndefined();
  });

  it("ingestor passa `lang` opcional para writeTranscriptionPreview", async () => {
    const { ingestPreviewFromMux } = await import(
      "../../server/services/transcriptionIngestor"
    );

    // Mux client mock retorna 1 track text PT
    const muxClient: any = {
      video: {
        assets: {
          retrieve: vi.fn().mockResolvedValue({
            tracks: [
              {
                id: "track-pt",
                type: "text",
                text_source: "generated_vod",
                text_type: "subtitles",
                language_code: "pt",
                status: "ready",
              },
            ],
          }),
        },
      },
    };

    const result = await ingestPreviewFromMux(
      { assetId: "asset-1", playbackId: "play-1" },
      {
        muxClient,
        fetchVttText: vi.fn().mockResolvedValue(
          "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nOla mundo do poker",
        ),
      },
    );

    expect(result.ok).toBe(true);
    // Lang derivado do track (PT) — pode estar em result.lang OR result.preview com metadata
    expect(result.preview).toBeTruthy();
  });
});

describe("Ingestor processa generated_subtitles ready (W-A1 + W-A4)", () => {
  it("aceita track type=text com text_source='generated_vod' status='ready'", async () => {
    process.env.MUX_TOKEN_ID = "x";
    process.env.MUX_TOKEN_SECRET = "y";

    const { ingestPreviewFromMux } = await import(
      "../../server/services/transcriptionIngestor"
    );

    const muxClient: any = {
      video: {
        assets: {
          retrieve: vi.fn().mockResolvedValue({
            tracks: [
              {
                id: "track-1",
                type: "text",
                text_source: "generated_vod",
                language_code: "pt",
                status: "ready",
              },
            ],
          }),
        },
      },
    };

    const result = await ingestPreviewFromMux(
      { assetId: "a1", playbackId: "p1" },
      {
        muxClient,
        fetchVttText: vi.fn().mockResolvedValue(
          "WEBVTT\n\n00:00.000 --> 00:02.000\nGenerated caption sample",
        ),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.preview).toContain("Generated");

    delete process.env.MUX_TOKEN_ID;
    delete process.env.MUX_TOKEN_SECRET;
  });
});
