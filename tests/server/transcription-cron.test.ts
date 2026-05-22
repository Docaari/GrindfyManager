// Sprint Mini Player 3.2 / Wave A / W-A2 — Cron transcription ingest tick.
// ADR-199. RED PHASE.
//
// Cobre:
// - Schedule cron 0 4 * * * UTC
// - Gate por TRANSCRIPTION_INGEST_ENABLED (default true)
// - Skip silencioso quando MUX_TOKEN_ID ausente
// - Cap 100 lessons/run
// - Sleep 1s entre Mux calls (rate limit)
// - Idempotencia: lessons ja preenchidas nao reprocessam

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Transcription cron tick (W-A2)", () => {
  beforeEach(() => {
    process.env.MUX_TOKEN_ID = "test-mux-id";
    process.env.MUX_TOKEN_SECRET = "test-mux-secret";
    process.env.TRANSCRIPTION_INGEST_ENABLED = "true";
  });

  afterEach(() => {
    delete process.env.MUX_TOKEN_ID;
    delete process.env.MUX_TOKEN_SECRET;
    delete process.env.TRANSCRIPTION_INGEST_ENABLED;
  });

  it("expoe schedule '0 4 * * *' UTC", async () => {
    const mod = await import("../../server/cron/transcriptionCron");
    expect(mod.TRANSCRIPTION_CRON_SCHEDULE).toBe("0 4 * * *");
    expect(mod.TRANSCRIPTION_CRON_TZ).toBe("UTC");
  });

  it("tick processa cap 100 lessons NULL", async () => {
    const { runTranscriptionCronTick } = await import(
      "../../server/cron/transcriptionCron"
    );

    const lessons = Array.from({ length: 100 }, (_, i) => ({
      id: `lesson-${i}`,
      videoMuxAssetId: `asset-${i}`,
      videoMuxPlaybackId: `play-${i}`,
    }));
    const listSpy = vi.fn().mockResolvedValue(lessons);
    const ingestSpy = vi.fn().mockResolvedValue({ ok: true, preview: "preview" });
    const updateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await runTranscriptionCronTick({
      listCandidates: listSpy,
      ingestPreviewFromMux: ingestSpy,
      updatePreview: updateSpy,
      sleepMs: 0, // skip sleep em test
    });

    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
    expect(ingestSpy).toHaveBeenCalledTimes(100);
    expect(updateSpy).toHaveBeenCalledTimes(100);
    expect(result.updated).toBe(100);
  });

  it("skip + log info quando MUX_TOKEN_ID ausente", async () => {
    delete process.env.MUX_TOKEN_ID;
    const { runTranscriptionCronTick } = await import(
      "../../server/cron/transcriptionCron"
    );

    const ingestSpy = vi.fn();
    const listSpy = vi.fn();

    const result = await runTranscriptionCronTick({
      listCandidates: listSpy,
      ingestPreviewFromMux: ingestSpy,
      updatePreview: vi.fn(),
      sleepMs: 0,
    });

    expect(listSpy).not.toHaveBeenCalled();
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("mux_not_configured");
  });

  it("skip quando TRANSCRIPTION_INGEST_ENABLED=false", async () => {
    process.env.TRANSCRIPTION_INGEST_ENABLED = "false";
    const { runTranscriptionCronTick } = await import(
      "../../server/cron/transcriptionCron"
    );

    const listSpy = vi.fn();

    const result = await runTranscriptionCronTick({
      listCandidates: listSpy,
      ingestPreviewFromMux: vi.fn(),
      updatePreview: vi.fn(),
      sleepMs: 0,
    });

    expect(listSpy).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("disabled");
  });

  it("idempotencia: lessons com reason='no_text_tracks' nao falham — sao skipped", async () => {
    const { runTranscriptionCronTick } = await import(
      "../../server/cron/transcriptionCron"
    );

    const lessons = [
      { id: "l1", videoMuxAssetId: "a1", videoMuxPlaybackId: "p1" },
      { id: "l2", videoMuxAssetId: "a2", videoMuxPlaybackId: "p2" },
    ];
    const listSpy = vi.fn().mockResolvedValue(lessons);
    const ingestSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "no_text_tracks" })
      .mockResolvedValueOnce({ ok: true, preview: "ok preview" });
    const updateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await runTranscriptionCronTick({
      listCandidates: listSpy,
      ingestPreviewFromMux: ingestSpy,
      updatePreview: updateSpy,
      sleepMs: 0,
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(result.updated).toBe(1);
    expect(result.skipped_lessons).toBe(1);
    expect(result.reasons["no_text_tracks"]).toBe(1);
  });

  it("aplica sleep configuravel entre Mux calls", async () => {
    const { runTranscriptionCronTick } = await import(
      "../../server/cron/transcriptionCron"
    );

    const lessons = [
      { id: "l1", videoMuxAssetId: "a1", videoMuxPlaybackId: "p1" },
      { id: "l2", videoMuxAssetId: "a2", videoMuxPlaybackId: "p2" },
    ];
    const sleepSpy = vi.fn().mockResolvedValue(undefined);

    await runTranscriptionCronTick({
      listCandidates: vi.fn().mockResolvedValue(lessons),
      ingestPreviewFromMux: vi.fn().mockResolvedValue({ ok: true, preview: "x" }),
      updatePreview: vi.fn().mockResolvedValue(undefined),
      sleepFn: sleepSpy,
      sleepMs: 1000,
    });

    // sleep ocorre entre items (n-1 vezes para n items)
    expect(sleepSpy).toHaveBeenCalled();
  });

  it("falha em ingest individual nao quebra cron run inteiro", async () => {
    const { runTranscriptionCronTick } = await import(
      "../../server/cron/transcriptionCron"
    );

    const lessons = [
      { id: "l1", videoMuxAssetId: "a1", videoMuxPlaybackId: "p1" },
      { id: "l2", videoMuxAssetId: "a2", videoMuxPlaybackId: "p2" },
      { id: "l3", videoMuxAssetId: "a3", videoMuxPlaybackId: "p3" },
    ];
    const ingestSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, preview: "p1" })
      .mockRejectedValueOnce(new Error("rate-limit"))
      .mockResolvedValueOnce({ ok: true, preview: "p3" });

    const result = await runTranscriptionCronTick({
      listCandidates: vi.fn().mockResolvedValue(lessons),
      ingestPreviewFromMux: ingestSpy,
      updatePreview: vi.fn().mockResolvedValue(undefined),
      sleepMs: 0,
    });

    expect(result.updated).toBe(2);
    expect(result.failed).toBe(1);
  });
});
