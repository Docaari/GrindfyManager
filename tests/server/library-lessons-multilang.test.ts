// Sprint Mini Player 3.2 / Wave A / W-A4 — Multi-lang transcription preview lookup.
// ADR-201. RED PHASE — resolveTranscriptionPreview ainda nao implementada.
//
// Cobre:
// - Fallback chain: previews[user_lang] -> previews['pt'] -> previews['en'] -> Object.values(0) -> varchar legacy -> null
// - normalizeLang: pt-BR -> pt, en-US -> en
// - API endpoint retorna string (nao objeto) — server escolhe lang
// - Back-compat: lessons antigas (so varchar) ainda funcionam

import { describe, it, expect } from "vitest";

describe("resolveTranscriptionPreview fallback chain (W-A4)", () => {
  it("retorna preview user lang quando existe", async () => {
    const { resolveTranscriptionPreview } = await import(
      "../../server/storage/transcriptionPreviewStorage"
    );

    const result = resolveTranscriptionPreview(
      {
        transcriptionPreviews: { pt: "PT text", en: "EN text" },
        transcriptionPreview: null,
      },
      "en-US",
    );

    expect(result).toBe("EN text");
  });

  it("normaliza pt-BR -> pt", async () => {
    const { resolveTranscriptionPreview } = await import(
      "../../server/storage/transcriptionPreviewStorage"
    );

    const result = resolveTranscriptionPreview(
      {
        transcriptionPreviews: { pt: "PT text" },
        transcriptionPreview: null,
      },
      "pt-BR",
    );

    expect(result).toBe("PT text");
  });

  it("user_lang ausente -> fallback pt", async () => {
    const { resolveTranscriptionPreview } = await import(
      "../../server/storage/transcriptionPreviewStorage"
    );

    const result = resolveTranscriptionPreview(
      {
        transcriptionPreviews: { pt: "PT only" },
        transcriptionPreview: null,
      },
      "en-US",
    );

    expect(result).toBe("PT only");
  });

  it("pt e user_lang ausentes -> fallback en", async () => {
    const { resolveTranscriptionPreview } = await import(
      "../../server/storage/transcriptionPreviewStorage"
    );

    const result = resolveTranscriptionPreview(
      {
        transcriptionPreviews: { en: "EN only" },
        transcriptionPreview: null,
      },
      "fr-FR",
    );

    expect(result).toBe("EN only");
  });

  it("nenhum match -> primeira chave existente", async () => {
    const { resolveTranscriptionPreview } = await import(
      "../../server/storage/transcriptionPreviewStorage"
    );

    const result = resolveTranscriptionPreview(
      {
        transcriptionPreviews: { fr: "French preview" },
        transcriptionPreview: null,
      },
      "en-US",
    );

    expect(result).toBe("French preview");
  });

  it("previews vazio + varchar legacy presente -> retorna legacy (back-compat)", async () => {
    const { resolveTranscriptionPreview } = await import(
      "../../server/storage/transcriptionPreviewStorage"
    );

    const result = resolveTranscriptionPreview(
      {
        transcriptionPreviews: null,
        transcriptionPreview: "Legacy varchar text",
      },
      "pt-BR",
    );

    expect(result).toBe("Legacy varchar text");
  });

  it("previews={} + varchar=null -> retorna null", async () => {
    const { resolveTranscriptionPreview } = await import(
      "../../server/storage/transcriptionPreviewStorage"
    );

    const result = resolveTranscriptionPreview(
      {
        transcriptionPreviews: {},
        transcriptionPreview: null,
      },
      "pt-BR",
    );

    expect(result).toBeNull();
  });

  it("previews={} + varchar legacy -> usa legacy", async () => {
    const { resolveTranscriptionPreview } = await import(
      "../../server/storage/transcriptionPreviewStorage"
    );

    const result = resolveTranscriptionPreview(
      {
        transcriptionPreviews: {},
        transcriptionPreview: "Legacy",
      },
      "pt-BR",
    );

    expect(result).toBe("Legacy");
  });

  it("ambos null -> null (UI esconde slot)", async () => {
    const { resolveTranscriptionPreview } = await import(
      "../../server/storage/transcriptionPreviewStorage"
    );

    const result = resolveTranscriptionPreview(
      {
        transcriptionPreviews: null,
        transcriptionPreview: null,
      },
      "pt-BR",
    );

    expect(result).toBeNull();
  });
});

describe("GET /api/library/lessons/:slug retorna string nao objeto (W-A4)", () => {
  it("endpoint serializa transcriptionPreview como string single-lang", async () => {
    // Esta tese e sobre o contrato: o handler escolhe a lingua via user.preferredLanguage
    // e retorna apenas a string. Testes detalhados ficam em rotas; aqui validamos
    // a forma do helper getLibraryLessonResponse caso existir.
    let handlerExists = false;
    try {
      const mod: any = await import("../../server/storage/libraryLessonStorage");
      if (typeof mod.serializeLessonForApi === "function") {
        handlerExists = true;
        const out = mod.serializeLessonForApi(
          {
            id: "l1",
            slug: "abc",
            transcriptionPreviews: { pt: "PT", en: "EN" },
            transcriptionPreview: null,
          },
          { preferredLanguage: "pt-BR" },
        );
        expect(typeof out.transcriptionPreview).toBe("string");
        expect(out.transcriptionPreview).toBe("PT");
      }
    } catch {
      // ok — modulo nao existe ainda (red phase)
    }
    expect(handlerExists).toBe(true); // forca RED se handler nao foi escrito
  });
});
