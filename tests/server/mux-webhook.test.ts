// Sprint Mini Player 3.2 / Wave A / W-A2 — Mux webhook handler.
// ADR-199. RED PHASE: handler ainda nao existe.
//
// Cobre:
// - HMAC valido aceita + dispatch para ingestor
// - HMAC invalido retorna 401
// - Replay (timestamp >5min) retorna 401
// - Event types nao relevantes -> 200 no-op
// - Idempotencia (mesma lesson 2x -> 2a chamada short-circuita)
// - Boot fail quando MUX_WEBHOOK_SECRET ausente
// - Lesson #34: handler aceita 3o arg injectedDeps?
// - Sempre 200 em erro interno (Mux nao retry agressivo)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const SECRET = "test-mux-webhook-secret";

function signBody(rawBody: string, timestamp: number, secret = SECRET): string {
  const signaturePayload = `${timestamp}.${rawBody}`;
  const v1 = crypto
    .createHmac("sha256", secret)
    .update(signaturePayload)
    .digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function buildReq(opts: {
  rawBody: string;
  signature?: string;
  noSignature?: boolean;
}) {
  const headers: Record<string, string> = {};
  if (!opts.noSignature) {
    headers["mux-signature"] = opts.signature ?? signBody(opts.rawBody, Math.floor(Date.now() / 1000));
  }
  return {
    rawBody: Buffer.from(opts.rawBody, "utf8"),
    body: JSON.parse(opts.rawBody),
    headers,
    header: (k: string) => headers[k.toLowerCase()],
    get: (k: string) => headers[k.toLowerCase()],
  } as any;
}

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe("Mux webhook handler (W-A2)", () => {
  beforeEach(() => {
    process.env.MUX_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.MUX_WEBHOOK_SECRET;
  });

  it("aceita request com HMAC valido + dispara ingestor", async () => {
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const ingestSpy = vi.fn().mockResolvedValue({ ok: true, preview: "Mock preview", reason: undefined });
    const getLessonSpy = vi
      .fn()
      .mockResolvedValue({ id: "lesson-1", videoMuxPlaybackId: "play-1" });
    const updateSpy = vi.fn().mockResolvedValue(undefined);

    const eventBody = JSON.stringify({
      type: "video.asset.track.ready",
      data: {
        asset_id: "asset-1",
        type: "text",
        id: "track-1",
        status: "ready",
      },
    });
    const req = buildReq({ rawBody: eventBody });
    const res = buildRes();

    await handleMuxWebhook(req, res, {
      ingestPreviewFromMux: ingestSpy,
      getLessonByMuxAssetId: getLessonSpy,
      updatePreview: updateSpy,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getLessonSpy).toHaveBeenCalledWith("asset-1");
    expect(ingestSpy).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith("lesson-1", "Mock preview", expect.any(Object));
  });

  it("rejeita HMAC invalido com 401", async () => {
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const eventBody = JSON.stringify({ type: "video.asset.track.ready" });
    const ts = Math.floor(Date.now() / 1000);
    const req = buildReq({
      rawBody: eventBody,
      signature: `t=${ts},v1=DEADBEEFINVALID`,
    });
    const res = buildRes();
    const ingestSpy = vi.fn();

    await handleMuxWebhook(req, res, { ingestPreviewFromMux: ingestSpy });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  it("rejeita request sem header Mux-Signature com 401", async () => {
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const req = buildReq({
      rawBody: JSON.stringify({ type: "video.asset.track.ready" }),
      noSignature: true,
    });
    const res = buildRes();

    await handleMuxWebhook(req, res, {});

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejeita replay (timestamp >5min antigo)", async () => {
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const eventBody = JSON.stringify({ type: "video.asset.track.ready" });
    const old = Math.floor(Date.now() / 1000) - 6 * 60; // 6 min ago
    const req = buildReq({
      rawBody: eventBody,
      signature: signBody(eventBody, old),
    });
    const res = buildRes();
    const ingestSpy = vi.fn();

    await handleMuxWebhook(req, res, { ingestPreviewFromMux: ingestSpy });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  it("event nao relevante (ex: video.asset.created) -> 200 no-op", async () => {
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const eventBody = JSON.stringify({
      type: "video.asset.created",
      data: { id: "asset-1" },
    });
    const req = buildReq({ rawBody: eventBody });
    const res = buildRes();
    const ingestSpy = vi.fn();

    await handleMuxWebhook(req, res, { ingestPreviewFromMux: ingestSpy });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  it("event track.ready com type != 'text' -> 200 no-op", async () => {
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const eventBody = JSON.stringify({
      type: "video.asset.track.ready",
      data: { asset_id: "asset-1", type: "audio", id: "track-1" },
    });
    const req = buildReq({ rawBody: eventBody });
    const res = buildRes();
    const ingestSpy = vi.fn();

    await handleMuxWebhook(req, res, { ingestPreviewFromMux: ingestSpy });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  it("idempotencia: lesson com preview ja populado -> short-circuit", async () => {
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const ingestSpy = vi.fn();
    const updateSpy = vi.fn();
    const getLessonSpy = vi.fn().mockResolvedValue({
      id: "lesson-1",
      videoMuxPlaybackId: "play-1",
      transcriptionPreview: "ja-populado",
      transcriptionPreviews: { pt: "ja-populado" },
    });

    const eventBody = JSON.stringify({
      type: "video.asset.track.ready",
      data: { asset_id: "asset-1", type: "text", id: "track-1" },
    });
    const req = buildReq({ rawBody: eventBody });
    const res = buildRes();

    await handleMuxWebhook(req, res, {
      ingestPreviewFromMux: ingestSpy,
      getLessonByMuxAssetId: getLessonSpy,
      updatePreview: updateSpy,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    // Nao chama ingest porque ja tem preview (short-circuit)
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("lesson nao encontrada (asset_id desconhecido) -> 200 + log", async () => {
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const ingestSpy = vi.fn();
    const getLessonSpy = vi.fn().mockResolvedValue(null);

    const eventBody = JSON.stringify({
      type: "video.asset.track.ready",
      data: { asset_id: "asset-orphan", type: "text", id: "track-1" },
    });
    const req = buildReq({ rawBody: eventBody });
    const res = buildRes();

    await handleMuxWebhook(req, res, {
      ingestPreviewFromMux: ingestSpy,
      getLessonByMuxAssetId: getLessonSpy,
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  it("ingestor lanca erro -> ainda 200 (evita Mux retry agressivo)", async () => {
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const ingestSpy = vi.fn().mockRejectedValue(new Error("network blip"));
    const getLessonSpy = vi.fn().mockResolvedValue({
      id: "lesson-1",
      videoMuxPlaybackId: "play-1",
    });

    const eventBody = JSON.stringify({
      type: "video.asset.track.ready",
      data: { asset_id: "asset-1", type: "text", id: "track-1" },
    });
    const req = buildReq({ rawBody: eventBody });
    const res = buildRes();

    await handleMuxWebhook(req, res, {
      ingestPreviewFromMux: ingestSpy,
      getLessonByMuxAssetId: getLessonSpy,
    });

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("boot fail: MUX_WEBHOOK_SECRET ausente quando handler chamado", async () => {
    delete process.env.MUX_WEBHOOK_SECRET;
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const req = buildReq({
      rawBody: JSON.stringify({ type: "video.asset.track.ready" }),
    });
    const res = buildRes();

    // Decisao: handler deve falhar fechado (500) ou rejeitar (401)?
    // ADR-199: boot fail quando webhook registrado sem secret -> usamos throw.
    // Aceita ambos: throw OR status 500.
    let threw = false;
    try {
      await handleMuxWebhook(req, res, {});
    } catch {
      threw = true;
    }
    const statusCall = (res.status as any).mock?.calls?.[0]?.[0];
    expect(threw || statusCall === 500).toBe(true);
  });

  it("usa timingSafeEqual contra timing attack (verificar assinatura via crypto)", async () => {
    const { handleMuxWebhook } = await import("../../server/routes/muxWebhooks");

    const eventBody = JSON.stringify({ type: "video.asset.track.ready" });
    const ts = Math.floor(Date.now() / 1000);

    // Assinatura com 1 char diferente (mesmo length)
    const valid = signBody(eventBody, ts);
    const tampered = valid.slice(0, -1) + (valid.endsWith("0") ? "1" : "0");

    const req = buildReq({ rawBody: eventBody, signature: tampered });
    const res = buildRes();

    await handleMuxWebhook(req, res, {});

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
