# ADR-065 — OCR via Claude Vision (Haiku 4.5) + Cache SHA256

- Status: Accepted
- Date: 2026-05-01
- Sprint: Stats-V3 / F2 (precede F6/F7 — endpoint OCR + service implementation)
- Decision owner: autonomous (founder AFK; spec defaults Stats-V3 RF-08..RF-12)
- Related: ADR-019 (Coach prompt cache), ADR-021 (Coach model selection),
  ADR-057 (SpotImageStorage abstraction), ADR-062 (grouped tool response)

## Context

Stats-V3 RF-08..RF-12 introduz extracao OCR de prints do popup Hand2Note
para preencher snapshot de stats automaticamente. Sem OCR, o jogador
precisa transcrever manualmente 50-200 valores apos cada sessao — friccao
proibitiva que mata adocao da feature.

Pesquisa profunda em `docs/strategy/stats-v3-research.md` (secoes 2-3)
mapeou opcoes:

| Opcao | Accuracy table | Latency | Cost / 1k req | Effort | Verdict |
|---|---|---|---|---|---|
| Tesseract self-hosted | <80% dark theme/small fonts | 0.3-1s CPU | $0 | Medio (preprocess OpenCV) | Reject |
| EasyOCR | Media | 1-2s | $0 | Medio | Reject |
| PaddleOCR-VL 1.5 | 94.5% (OmniDocBench) | 0.5-2s GPU | ~$0.09/1k pages + GPU $0.40/h | Alto (deploy GPU + parser custom) | Defer V5+ |
| **Claude Haiku 4.5 vision** | Alta para texto tabular + raciocinio semantico | 2-5s | ~$5/1k req | **Baixa** (SDK ja em uso) | **GO** |
| Claude Sonnet 4.6 vision | Maxima | 4-8s | ~$10-15/1k req | Baixa | Fallback retry |
| GPT-4o vision | Comparavel a Sonnet | 3-6s | $10-25/1k req | Baixa | Reject (vendor-lock) |

A decisao escolhida e **Haiku 4.5 vision como provider primario** com
Sonnet como retry-fallback opcional, cache SHA256 server-side e rate-limit
10/h/user. Custo projetado <$50/mes ate 5k users.

A SDK `@anthropic-ai/sdk` ja eh dependency do projeto (Coach AI). Reuso
significa: zero nova dep, mesmo retry/observability, mesmo modelo de
auth via `ANTHROPIC_API_KEY`. Sem nova chave de API, sem novo provider.

Tres alternativas foram avaliadas para arquitetura interna:

1. **OCR client-side** (modelo on-device via WebAssembly). Rejeitado:
   bundle ~50MB inviavel, accuracy ruim em dark theme, sem cache cross-device.
2. **Worker queue** (BullMQ + Redis). Rejeitado: overhead 8h infra para
   feature de baixa frequencia (4 OCR/user/mes); request sincrono <8s eh
   aceitavel UX; queue = DEBT-V4 quando volume crescer.
3. **Cache em DB com TTL** (jsonb com expiracao). Rejeitado: imagens
   tipicamente unicas por sessao — cache hit rate <10%; complexidade extra
   (cleanup TTL job) sem ganho.

A decisao final usa cache **por SHA256 do buffer** persistido em
`hud_stat_snapshots.ocr_raw_response` — re-upload da mesma imagem retorna
resultado sem nova chamada API. Hit rate esperado >30% em users que
re-fazem screenshot da mesma sessao para corrigir crops.

## Decision

### Provider primario: Claude Haiku 4.5 vision

Modelo: `claude-haiku-4-5-20251001` (mesmo SDK do Coach AI).

System prompt fixo cacheable (~1.5k tokens), descrevendo schema JSON
esperado:

```
Voce eh extrator OCR de popups Hand2Note.
Retorne APENAS JSON valido (sem markdown wrapper):
{
  "stats": [
    { "label": "VPIP", "value": 22.5, "confidence": 0.95 },
    { "label": "PFR",  "value": 18.0, "confidence": 0.93 },
    ...
  ]
}

Regras:
- label: texto exato da stat na imagem (preserve case e abreviacoes)
- value: numero (sem simbolo %; converta "22.5%" para 22.5)
- confidence: 0.0 a 1.0 baseado em legibilidade visual
- Ignore headers de grupo (ex: "BASICS", "RFI") — extraia apenas pares
  label/value tabulares
- Se valor ilegivel, omita a entry (nao retorne null)
```

Prompt cache reduz custo apos primeiro hit em 5min (TTL Anthropic). Para
batch de 4 OCR/user/mes, primeira chamada paga full price, demais usam
cache prefix → ~$0.005/req medio.

### Endpoint POST /api/stats-analyzer/ocr-extract

Path: `server/routes/stats-analyzer.ts` (extensao do modulo V2).

Auth: `requireAuth` + tier `pro+` (consistente V2). Free tier vê CTA
upgrade.

Body: `multipart/form-data` com campo `image` (Multer memoryStorage).

Pipeline:

1. **Magic bytes validation** (lib `file-type` ja no projeto):
   - Aceita: `image/png`, `image/jpeg`, `image/webp` (D14).
   - Header `Content-Type` IGNORADO (lesson F2 spot-screenshots).
   - Falha → 422 `{ message: "Imagem invalida ou corrompida" }`.

2. **Size cap** (env `OCR_IMAGE_MAX_BYTES` default 10485760 / 10MB):
   - >10MB → 413 (multer limit antes do handler).

3. **SHA256 hash do buffer**:
   - `crypto.createHash('sha256').update(buffer).digest('hex')`.

4. **Cache lookup**:
   ```sql
   SELECT id, ocr_raw_response, source_image_key
   FROM hud_stat_snapshots
   WHERE user_id = $1
     AND source_image_key IS NOT NULL
     AND (ocr_raw_response->>'image_sha256') = $2
   ORDER BY captured_at DESC
   LIMIT 1
   ```
   Hit → retorna `{ ...response, cached: true }` sem chamar SDK.
   Miss → segue para 5.

5. **Persistencia da imagem** (ADR-057 reuso):
   - `spotImageStorage.put({ userId, sessionId: 'hud-snapshots', ext, buffer, mime })`
     com prefix `hud-snapshots/{userId}/`.
   - Key persistida: `hud-snapshots/{userId}/{nanoid21}.{ext}`.

6. **Anthropic SDK call**:
   ```ts
   const response = await client.messages.create({
     model: process.env.OCR_MODEL ?? 'claude-haiku-4-5-20251001',
     max_tokens: 2048,
     system: [{
       type: 'text',
       text: OCR_SYSTEM_PROMPT,
       cache_control: { type: 'ephemeral' }
     }],
     messages: [{
       role: 'user',
       content: [{
         type: 'image',
         source: { type: 'base64', media_type: mime, data: base64 }
       }]
     }]
   });
   ```

7. **Parse robust JSON**:
   - Try `JSON.parse(response.content[0].text)`.
   - Fallback: regex `/\{[\s\S]*\}/` para extrair objeto se LLM wrappou
     em markdown apesar do prompt.
   - Validacao Zod do schema `{ stats: [{ label, value, confidence }] }`.
   - Falha persistente → 502 + log + cache **NAO** salva (evita poison).

8. **Fuzzy match** contra catalogo + customs do layout (RF-10):
   - Levenshtein <=3 OR substring match length >=80%.
   - Top match por stat OCR; classificacao `matchedBy: 'exact' | 'fuzzy_lev'
     | 'fuzzy_substring' | 'unmatched'`.

9. **Persist raw response** em `hud_stat_snapshots.ocr_raw_response`:
   ```json
   {
     "image_sha256": "abc123...",
     "raw_stats": [...],
     "matched_stats": [...],
     "unmatched_stats": [...],
     "model": "claude-haiku-4-5-20251001",
     "extracted_at": "2026-05-01T..."
   }
   ```
   Salva em snapshot temporario com `capture_method='ocr'` mas SEM
   `values` — usuario aceita/edita via `HudOcrPreview` antes de virar
   snapshot real (RF-11).

10. **Response shape**:
    ```json
    {
      "imageKey": "hud-snapshots/USER-1234/abc.png",
      "ocrJobId": "ocrj_xyz",
      "stats": [
        {
          "id": "vpip",
          "label": "VPIP",
          "value": 22.5,
          "confidence": 0.94,
          "matchedBy": "exact"
        }
      ],
      "unmatched": [
        { "label": "GG Bouns", "value": "12.3", "confidence": 0.71 }
      ],
      "cached": false
    }
    ```

### Retry policy (RF-09)

- API 5xx (Overloaded, ServerError) → 1x retry com backoff 500ms.
- Falha persistente apos retry → 502 + log
  `console.error('hud-ocr-failed', { userId, imageKey, status, error })`.
- Cache **NAO** salva em retry-failed (evita persistir resposta vazia).
- Sonnet fallback (research opcional) apenas se confidence medio <0.7 em
  primeira tentativa — defer V4 (DEBT-V4-5: dual-model OCR).

### Cache SHA256 — design

**Por que SHA256 do buffer (e nao filename ou metadata)?**
- Determinismo: re-upload da mesma imagem (PNG identico bit-a-bit) retorna
  mesmo hash. Re-encode (PNG → JPEG) muda hash → cache miss → call API
  novamente (correto, pois pixels podem variar).
- Sem dependencia de cliente: filename pode ser arbitrario, metadata
  pode ser strippada. Hash do conteudo eh fonte de verdade.
- Privacy: hash nao revela conteudo da imagem; storage layer guarda
  bytes separadamente (ADR-057).

**Storage do hash:**
- Coluna `ocr_raw_response` jsonb em `hud_stat_snapshots` (migration 0020).
- Index parcial:
  ```sql
  CREATE INDEX idx_hud_snapshots_image_sha256
    ON hud_stat_snapshots ((ocr_raw_response->>'image_sha256'))
    WHERE ocr_raw_response IS NOT NULL;
  ```
- Lookup O(log N) mesmo com 100k snapshots.

**Cache invalidation:**
- Nao ha. Hash → response eh imutavel (mesma imagem sempre da mesma
  resposta determinista do LLM, pois temperature implicita 0 em vision
  task).
- Edits manuais do user (RF-06) gravam em `values` separado; cache de
  `ocr_raw_response` preserva extracao original (audit trail).

**Cleanup:**
- Cascata via DELETE da snapshot row → spotImageStorage.delete(imageKey)
  no service layer (consistencia: imagem orfa = 0).

### Rate limit (RF-12)

`express-rate-limit` apenas em `/api/stats-analyzer/ocr-extract`:

```ts
const ocrLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,                      // 1 hora rolling
  max: Number(process.env.OCR_RATE_LIMIT_PER_HOUR ?? 10),
  store: undefined,                              // MemoryStore (lesson bankroll)
  keyGenerator: (req) => req.user.id,
  handler: (req, res) => {
    const resetMs = req.rateLimit.resetTime.getTime() - Date.now();
    const minutes = Math.ceil(resetMs / 60000);
    res.status(429)
       .header('Retry-After', String(Math.ceil(resetMs / 1000)))
       .json({
         message: `Limite de OCR atingido. Tente novamente em ${minutes} minutos.`,
         retryAfterSeconds: Math.ceil(resetMs / 1000)
       });
  }
});
```

- Janela: 60min rolling.
- Storage: `MemoryStore` (default). Reset em restart aceitavel
  (low-traffic, lesson bankroll-2). Migrar para Redis em DEBT-V4-2.
- Override por env `OCR_RATE_LIMIT_PER_HOUR` (test, plano premium).

### Graceful degradation sem ANTHROPIC_API_KEY

Se `ANTHROPIC_API_KEY` ausente no boot do servidor:
- Endpoint `/ocr-extract` retorna 503:
  ```json
  {
    "message": "OCR indisponivel — Coach deve estar configurado primeiro",
    "code": "OCR_DISABLED"
  }
  ```
- Coach config eh single source de Anthropic key — nao fragmenta config.
- Frontend exibe CTA "Configurar Coach AI" com link para
  `/settings/coach` (existente).

## Consequences

### Positivas

- **Custo desprezivel ate 5k users** — $20/mes para 4k OCR (research
  secao 3). Nao precisa cobrar feature isolada.
- **Implementacao 1 dia** — SDK ja em uso, prompt fixo, response shape
  testable. Sem deploy de infra (sem GPU, sem queue, sem worker).
- **Robustez semantica** — Haiku entende "RFI" = "Raise First In",
  reconhece variantes de label, mapeia para catalogo via fuzzy match.
  Tesseract erra cego.
- **Cache SHA256** elimina chamadas duplicadas (re-upload mesma imagem,
  user que recorta novamente, audit re-process). Hit rate >30% esperado.
- **Reuso ADR-057** (`SpotImageStorage`) — zero infra nova para
  persistencia de imagens; mesmo abstraction de spots/screenshots.
- **Rate limit 10/h** contem abuso financeiro — pior caso 10*24*$0.005 =
  $1.20/dia/user (ainda controlado). Plan tier eleva limite (Pro 50/h,
  Premium ilimitado pratico).
- **Fallback sem Anthropic key** — Coach config single source; sem
  duplicacao de auth, sem chave nova para gerenciar.

### Negativas

- **Latency 2-5s** — visivel ao user (loading state). Mitigado por UX:
  spinner com mensagem "Extraindo stats..." + estimativa "~5 segundos".
  P95 <8s aceitavel para acao manual (~user faz 1 OCR pos-sessao).
- **Acoplamento com Anthropic provider** — se Haiku 4.5 retired,
  precisa atualizar modelo (mesma SDK, alta migracao trivial). Vendor
  switch para OpenAI vision exige novo provider (nao trivial). Mitigado
  por env `OCR_MODEL` override + research mostra Anthropic estavel
  3+ anos.
- **Custo escala linear** — heavy users (50+ OCR/dia) podem pesar.
  Mitigado por rate limit + plano pago (Premium $X/mes inclui).
  Telemetria por user via `hud_ocr_audit` (RF-12).
- **JSON malformado em <2% casos** (RISK-1 spec) — Haiku ocasionalmente
  retorna texto explicativo antes/depois do JSON. Mitigado por:
  - System prompt explicito ("APENAS JSON").
  - Regex fallback para extrair objeto.
  - Zod parse com fallback `unmatched: [{ label: rawText }]`.
- **Cache pode ficar stale se prompt mudar** — mudanca no system prompt
  invalida hits anteriores conceitualmente. Mitigado por: prompt
  versionado (`OCR_PROMPT_VERSION` env), entries cache marcadas com
  versao, lookup ignora versoes antigas.

### Neutras

- **Migration 0020** adiciona 4 colunas em `hud_stat_snapshots`:
  `capture_method`, `source_image_key`, `ocr_confidence`, `ocr_raw_response`.
  Backfill safe (DEFAULT cuida; UPDATE para NULLs).
- **Index parcial** em `(user_id, source_image_key) WHERE source_image_key
  IS NOT NULL` — cache lookup O(log N).
- **Tests integration** mockam `client.messages.create` (RF-09 AC-9.1..9.4).
  Cobertura: cache hit/miss, retry path, 5xx, magic bytes invalido.
- **Docs API** novo arquivo `Docs/api/stats-analyzer-ocr.md` com endpoint
  schemas + exemplos.
- **Telemetry**: `hud_ocr_audit (user_id, created_at, status, image_size,
  cache_hit)` para observability — alerta em uso anomalo (`>20 reqs/dia`
  warn).

## Alternativas rejeitadas

### A1 — Tesseract self-hosted (CPU)

OSS gratuito, deploy zero externo. Rejeitado:
- Accuracy <80% em dark theme com fontes 10-12px do popup H2N.
- Preprocessing OpenCV (binarize, denoise, deskew) dobra effort de
  implementacao para ainda nao bater Haiku.
- Sem raciocinio semantico — confunde "RFI" com "RH" cego.
- Bug fixes em parser custom para tabela H2N = manutencao perpetua.

### A2 — PaddleOCR-VL self-hosted (GPU)

Estado-da-arte OSS (94.5% OmniDocBench). Rejeitado *ate V5*:
- Effort alto: deploy GPU ($0.40-1/h), monitoring, model versioning.
- Custo break-even >50k OCR/mes (Haiku $200/mes vs GPU $300/mes equipara
  em escala enorme — Grindfy hoje ~100 users).
- Privacy advantage marginal — Anthropic SOC2 + zero training opt-out.

### A3 — GPT-4o vision

Custo $10-25/1k req (3x Haiku). Rejeitado:
- Vendor-lock (sem benefit vs Anthropic ja em stack).
- Accuracy comparavel a Sonnet (nao bate Haiku custo-benefit).
- Adicionar OpenAI key = friccao config + auditoria adicional.

### A4 — Worker queue (BullMQ + Redis)

Processar OCR async com job queue. Rejeitado *para V3*:
- Effort 8h: Redis deploy, BullMQ setup, dashboard, retry policy custom.
- UX desnecessaria: 4 OCR/user/mes nao justifica polling de status.
- Sincrono <8s eh tolerable. Async = DEBT-V4-3 quando bulk OCR
  multi-image entrar.

### A5 — Cache em DB com TTL (jsonb expiracao)

Cache com `expires_at` + cleanup job. Rejeitado:
- Imagens unicas por sessao — hit rate <10% mesmo sem TTL.
- Cleanup job = complexidade extra sem ganho.
- Cache permanente (sem TTL) eh suficiente — re-upload retorna mesmo
  resultado deterministicamente.

### A6 — OCR client-side (WebAssembly)

Modelo ONNX/WASM no browser. Rejeitado:
- Bundle ~50MB inviavel para feature de baixa frequencia.
- Accuracy ruim em modelos compactos browser-friendly.
- Sem cache cross-device (user que troca de PC processa de novo).

## Confianca

**Alta.** SDK Anthropic ja em uso (Coach AI) — risco de integracao zero.
Custo dimensionado em research (secao 3) — escalavel ate 5k users sem
preocupacao financeira. Cache SHA256 eh design comprovado (Cloudflare R2,
S3 IfNoneMatch usam padrao analogo). Rate limit em memoria eh suficiente
para low-traffic (lesson bankroll). Reversivel: feature flag
`statsOcrEnabled` desliga endpoint sem afetar V2.

## Referencias

- **Spec:** `docs/specs/sprint-stats-v3.md` (RF-08..RF-12, defaults D4-D6).
- **Research:** `docs/strategy/stats-v3-research.md` (secoes 2-4: OCR
  options matrix, custo projetado, riscos).
- **ADR-019:** prompt cache strategy Coach AI — reuso direto.
- **ADR-021:** model selection via env — pattern aplicado a `OCR_MODEL`.
- **ADR-057:** SpotImageStorage abstraction — reuso para `hud-snapshots/`.
- **ADR-062:** grouped tool response — output format do Coach reuso.
- **Diagramas Mermaid:**
  - `docs/architecture/flows/studies/stats-v3-ocr-pipeline.mermaid` —
    sequence diagram do pipeline upload → vision → cache → preview.
  - `docs/architecture/flows/studies/stats-v3-ocr-cache-er.mermaid` —
    ER diagram cache + audit.
- **Codigo precedente:** `server/coachClient.ts` — SDK Anthropic
  configurado com retry + observability. Esta ADR reusa pattern.
- **Out of scope V3:** Sonnet fallback dual-model (DEBT-V4-5), bulk OCR
  multi-image (DEBT-V4-3), OCR multi-language PT-BR/ES (DEBT-V4-2),
  Cloudflare R2 storage (DEBT deploy real).
