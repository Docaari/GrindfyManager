// Sprint Mini Player 3.2 / Wave B / W-B5 — PT-BR error mapping.
// ADR-198. RED PHASE — mapAudioErrorToMessage util ainda nao existe.
//
// Cobre:
// - DEMUXER_ERROR_* -> "Formato de audio nao suportado."
// - HTTP 404 / track_not_found -> "Faixa nao encontrada"
// - HTTP 403 -> "Sem permissao para esta faixa."
// - HTTP 500/503 -> "Servidor indisponivel..."
// - MEDIA_ELEMENT_ERROR_NETWORK -> "Falha de rede..."
// - buffering_timeout -> "Audio demorou a carregar..."
// - default fallback -> "Erro ao carregar audio. Tente novamente."

import { describe, it, expect } from "vitest";

describe("mapAudioErrorToMessage (W-B5)", () => {
  it("DEMUXER_ERROR_NO_SUPPORTED_STREAMS -> Formato de audio", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out = mapAudioErrorToMessage({
      code: "DEMUXER_ERROR_NO_SUPPORTED_STREAMS",
      message: "browser internal",
    });

    expect(out).toMatch(/Formato.*audio.*nao.*suportado|nao suportado/i);
  });

  it("track_not_found -> Faixa nao encontrada", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out = mapAudioErrorToMessage({
      code: "track_not_found",
      message: "",
    });

    expect(out).toMatch(/Faixa nao encontrada/i);
  });

  it("HTTP 404 -> Faixa nao encontrada", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out = mapAudioErrorToMessage({
      code: "http_404",
      httpStatus: 404,
      message: "",
    });

    expect(out).toMatch(/Faixa nao encontrada/i);
  });

  it("HTTP 403 -> Sem permissao", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out = mapAudioErrorToMessage({
      code: "http_403",
      httpStatus: 403,
      message: "",
    });

    expect(out).toMatch(/permissao/i);
  });

  it("HTTP 500 -> Servidor indisponivel", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out = mapAudioErrorToMessage({
      code: "http_500",
      httpStatus: 500,
      message: "",
    });

    expect(out).toMatch(/Servidor indisponivel|indisponivel/i);
  });

  it("HTTP 503 -> Servidor indisponivel", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out = mapAudioErrorToMessage({
      code: "http_503",
      httpStatus: 503,
      message: "",
    });

    expect(out).toMatch(/indisponivel/i);
  });

  it("MEDIA_ELEMENT_ERROR_NETWORK -> Falha de rede", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out = mapAudioErrorToMessage({
      code: "MEDIA_ELEMENT_ERROR_NETWORK",
      message: "",
    });

    expect(out).toMatch(/rede|conexao/i);
  });

  it("buffering_timeout -> Audio demorou a carregar", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out = mapAudioErrorToMessage({
      code: "buffering_timeout",
      message: "",
    });

    expect(out).toMatch(/demorou.*carregar|carregar/i);
  });

  it("codigo nao mapeado -> fallback generico", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out = mapAudioErrorToMessage({
      code: "unknown_unmapped_code",
      message: "",
    });

    expect(out).toMatch(/Erro.*carregar audio|Tente novamente/i);
  });

  it("error null/undefined -> fallback generico", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out1 = mapAudioErrorToMessage(null as any);
    const out2 = mapAudioErrorToMessage(undefined as any);

    expect(out1).toMatch(/Erro|Tente novamente/i);
    expect(out2).toMatch(/Erro|Tente novamente/i);
  });

  it("aceita string simples como input (back-compat)", async () => {
    const { mapAudioErrorToMessage } = await import(
      "../../../client/src/lib/audio-engine/errorMessages"
    );

    const out = mapAudioErrorToMessage("track_not_found" as any);
    expect(out).toMatch(/Faixa nao encontrada/i);
  });
});
