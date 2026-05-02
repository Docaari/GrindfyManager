// =============================================================================
// Sprint Stats-V3 — buildOcrPrompt helper (RF-09)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-09 OCR Claude Haiku 4.5 + cache)
// ADR  : 065 (OCR via Claude Vision — secao "Provider primario")
//
// Helper puro para montar params da Anthropic Messages API com:
//   - model haiku 4.5 (override env OCR_MODEL)
//   - system prompt cacheable via cache_control: ephemeral (lesson #10 DRY)
//   - imagem como bloco base64
//
// Lesson #10 DRY: prompt em export const para evitar divergencia silenciosa
// que quebraria o cache da Anthropic.
// =============================================================================

export interface BuildOcrPromptInput {
  buffer: Buffer;
  mime: string;
}

export const OCR_DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export const OCR_SYSTEM_PROMPT = `Voce eh um extrator OCR especializado em popups Hand2Note de stats de poker.

Sua tarefa: extrair pares label/value de tabelas de stats em screenshots, atribuindo
cada stat ao heading/secao visual mais proxima acima dela (V3.5 — ADR-067).

REGRAS ESTRITAS:
1. Retorne APENAS JSON valido, sem texto adicional, sem markdown.
2. Schema do output:
{
  "stats": [
    { "section": "Big Blind defense", "label": "Probe River", "value": 37, "confidence": 0.93 },
    { "section": "Blind war SB", "label": "SB Probe Turn", "value": 28, "confidence": 0.91 },
    { "section": null, "label": "VPIP", "value": 22.5, "confidence": 0.95 }
  ]
}

3. Para cada stat:
   - "section": texto EXATO do heading visual mais proximo acima do bloco onde a
     stat aparece. Headings sao distintos por: caixa-alta, cor diferente,
     separador horizontal, indentacao, tipografia. Se nao houver heading visivel
     associado, retorne null. NAO normalize/traduza — apenas o texto bruto.
   - "label": texto da stat exatamente como aparece (preserve case/acentos).
   - "value": numero (sem simbolo %, sem unidades). Use ponto como separador decimal.
   - "confidence": float 0.0-1.0 representando sua certeza na leitura. 0.95+ para
     texto nitido, 0.7-0.9 para texto legivel mas com leve borrao, abaixo de 0.7
     para palpite.

4. IGNORE como labels (mas USE como section quando aplicavel):
   - Cabecalhos de grupo (ex: "Basic", "Preflop", "BB defense", "Blind war SB").
     Eles NAO viram entries em "stats[]" — viram o "section" das stats abaixo.
   - Textos decorativos ou de UI (botoes, abas).
   - Numeros isolados sem label.
   - Numeros entre parenteses (sample size — ex: "VPIP 22.5 (1234)" → label=VPIP,
     value=22.5).

5. Foque em pares label/value tabulares com alinhamento claro. Atribua cada par
   ao heading visual mais proximo acima dele.

6. Se a imagem nao contem stats reconheciveis, retorne { "stats": [] }.`;

export function buildOcrPrompt(input: BuildOcrPromptInput): {
  model: string;
  max_tokens: number;
  system: Array<{
    type: "text";
    text: string;
    cache_control: { type: "ephemeral" };
  }>;
  messages: Array<{
    role: "user";
    content: Array<
      | {
          type: "image";
          source: {
            type: "base64";
            media_type: string;
            data: string;
          };
        }
      | { type: "text"; text: string }
    >;
  }>;
} {
  const model = process.env.OCR_MODEL || OCR_DEFAULT_MODEL;
  const base64 = input.buffer.toString("base64");

  return {
    model,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: OCR_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mime,
              data: base64,
            },
          },
          {
            type: "text",
            text: "Extraia os pares label/value desta imagem seguindo o schema. Retorne apenas JSON.",
          },
        ],
      },
    ],
  };
}
