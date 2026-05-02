# ADR-072 — Adotar Mux para video, signed URLs TTL 4h, watermark CSS overlay

- Status: Proposto
- Data: 2026-05-01
- Sprint: Biblioteca-1 (RF-03)
- Decision owner: system-architect (ratifica decisao founder D1 de `memory/biblioteca_decisions_2026-05-01.md`)
- Related: ADR-071 (media-storage-backend-generic — Mux fora da abstracao), ADR-073 (entitlements model — gating de signed URL)
- Spec: `Docs/specs/biblioteca-spec-1.md` RF-03 + D8

## Contexto

A Spec 1 da Biblioteca exige hospedar video das aulas (Curso 01 — A
Anatomia de um Spot, 11 modulos com mix MP4) com:

1. **Streaming HLS chunked** — usuario nao baixa video inteiro upfront.
2. **Signed URLs** — link nao pode ser compartilhado publicamente (cada
   user precisa de URL gerada server-side com TTL).
3. **Watermark dinamico** — `userPlatformId` (`USER-XXXX`) overlay para
   dissuadir upload bruto para concorrentes (poor-man DRM).
4. **CDN global** — alpha testers em multiplos paises (BR + US + EU).
5. **Cap de custo MVP < $50/mes** — 100 alpha users × 30min/sem = 12k
   min/mes.

Founder ja decidiu (D1 do brainstorm): **Mux primeiro, Vimeo depois.**
Esta ADR formaliza o **porque Mux ganhou**, **como signed URLs sao
geradas**, **TTL de 4h e nao 1h ou 24h**, e **watermark CSS overlay vs
Mux server-side burn-in**.

### Forcas em jogo

- **Custo cap:** Mux cobra $0.005/min de delivery + $0.0008/min de
  encoding. 12k min/mes = $60/mes encoding (1x) + delivery on-demand.
  Para watch ratio 80% (alpha tester engajado consome 80% do video),
  delivery = ~10k min/mes = $50/mes. Total <$120/mes para 100 users.
- **Vimeo Pro $20/mes:** plano basico nao tem signed URLs robustos (so
  domain whitelist). Plano Premium $75/mes tem signed URLs mas API
  menos flexivel que Mux (sem JWT customizado para watermark text).
- **Cloudflare Stream $5/1000min:** competitivo mas API menos madura,
  Player React menos pronto. Vendor lock similar a Mux com menos
  documentacao.
- **Self-hosted (HLS via FFmpeg + S3 + signed URLs custom):** zero
  vendor lock mas 40+ horas de infra build (encoder pipeline, ABR
  manifest, signing key rotation, CDN integration). Founder solo dev
  nao tem orcamento.
- **DRM real (Widevine/PlayReady):** $1k+/mes setup + $0.05/play. ROI
  zero em MVP. Watermark CSS suficiente.
- **Watermark CSS vs burn-in:** Mux suporta burn-in server-side
  (overlay queimado no video por encoding) mas custa re-encoding de
  todos os assets se watermark mudar. CSS overlay no Player render-time
  e dinamico, gratis, e suficiente para dissuadir casual upload —
  qualquer pessoa razoavelmente tecnica remove via DevTools, mas isso
  ja e barreira o suficiente para nao-tecnicos (alpha testers reais).
- **TTL signed URL:** 1h forca renovacao no meio de aula longa
  (interrompe replay), 24h e janela ampla demais para sharing.
- **Lesson #5 (`vi.fn()` nao e constructor):** Mux SDK usa `new` —
  testes precisam wrappar em try/catch com fallback para evitar mock
  quebrar.
- **Vendor lock:** se Mux subir preco ou deprecar, refactor para Vimeo
  ou Cloudflare Stream e ~1 arquivo (`muxMediaProvider.ts`). Encapsular
  SDK em provider e suficiente.

## Opcoes Consideradas

### Opcao A: Mux + signed URLs TTL 4h + watermark CSS overlay (ESCOLHIDA)

`server/services/muxMediaProvider.ts` encapsula `@mux/mux-node`:

```ts
interface MuxMediaProvider {
  uploadAsset(opts: { fileBuffer: Buffer; mimeType: string }): Promise<{
    assetId: string;
    playbackId: string;
  }>;

  createPlaybackToken(opts: {
    playbackId: string;
    userPlatformId: string;
  }): Promise<{ url: string; expiresAt: ISO8601; watermarkText: string }>;
}
```

Frontend usa `@mux/mux-player-react`:

```tsx
<MuxPlayer
  playbackId={playbackId}
  tokens={{ playback: signedToken }}
  metadata={{ video_id: lessonId, viewer_user_id: userPlatformId }}
/>
{/* CSS overlay watermark */}
<div className="mux-watermark">{userPlatformId}</div>
```

`mux-watermark` CSS:
```css
.mux-watermark {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    -45deg,
    transparent 0,
    transparent 80px,
    rgba(255,255,255,0.15) 80px,
    rgba(255,255,255,0.15) 81px
  );
  mix-blend-mode: difference;
}
.mux-watermark::after {
  content: attr(data-text);
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%,-50%) rotate(-45deg);
  font-size: 24px;
  opacity: 0.15;
  color: white;
}
```

TTL = 4h (token JWT signed via `MUX_SIGNING_KEY`):
- 4h cobre uma sessao de assistir tipica (~1-3h).
- Menos longa que 24h (limita window de share).
- Renovacao automatica via re-fetch quando TTL < 30min restantes.

- **Pros:**
  - **CDN global incluso** — Mux tem POPs em 80+ cidades.
  - **HLS ABR automatico** — usuario com 4G ve 480p, fibra ve 1080p.
  - **Signed URLs robustos** — JWT customizavel, token revoke por user.
  - **API madura + SDK Node + Player React** — onboarding em horas.
  - **Mux Player UI completo** — speed control, fullscreen, captions.
  - **Watermark CSS dinamico** — zero re-encoding, mudar texto = mudar
    DOM.
  - **Encapsulamento facil** — 1 arquivo (`muxMediaProvider.ts`); trocar
    por Vimeo = 1 PR.
  - **Telemetria nativa** — Mux Data inclui watch metrics.

- **Contras:**
  - **Vendor lock parcial** — refactor para outro provider e ~1 dia
    quando aceitavel.
  - **CSS watermark removivel via DevTools** — aceitavel (poor-man DRM,
    nao DRM real).
  - **Custo escala** — se passar 1k users assistindo agressivamente,
    custo sobe. Monitorar e renegociar (Mux tem volume discount).
  - **Sem fallback offline** — Mux nao oferece download legitimo;
    usuario sempre online.

### Opcao B: Vimeo Pro $20/mes (single plan basico)

API simples, embed direto.

- **Pros:**
  - Custo fixo $20/mes (sem variavel).
  - Vimeo Player gratuito + customizavel.
  - Ja conhecido pelo founder/criadores de conteudo.

- **Contras:**
  - **Signed URLs frageis** — plano Pro nao tem; precisa ir Premium $75/mes.
  - **Watermark customizavel = $$$ Premium.** Plano Pro nao tem.
  - **API menos flexivel** — sem JWT customizado para meta-data.
  - **Player customization limitada** — sem hooks programaticos para
    overlay watermark dinamico.
  - **Rejeitada por:** Premium $75 + falta de signed JWT robusto =
    arquitetura mais fraca por preco proximo.

### Opcao C: Cloudflare Stream $5/1000min

API moderna, signed URLs nativos.

- **Pros:**
  - Custo escalavel ($5/1000min delivery, $1/1000min storage).
  - CDN Cloudflare global.
  - Signed URLs token-based.

- **Contras:**
  - **Player React nao oficial** — biblioteca community-maintained.
  - **API menos documentada que Mux** — onboarding mais longo.
  - **Watermark menos flexivel** — sem feature comparavel a Mux Player
    React `<Overlay>`.
  - **Founder zero familiaridade** — risco de tropecos em edge cases.
  - **Rejeitada por:** maturidade ecosystem < Mux. Custo similar mas
    risco de bug em produ desconhecido.

### Opcao D: Self-hosted HLS + S3 + signed URLs custom

FFmpeg encode local, S3 storage, CloudFront signed URLs.

- **Pros:**
  - **Zero vendor lock**.
  - **Custo CDN < Mux delivery** (CloudFront $0.085/GB vs Mux $0.005/min).
  - **Watermark burn-in via FFmpeg** possivel.

- **Contras:**
  - **40+ horas infra build** — encoder pipeline, ABR manifest, signing
    key rotation.
  - **Player customization** — Video.js ou shaka-player instalacao
    + setup ABR.
  - **Operations** — falha de transcode = manual restart; Mux faz auto.
  - **Founder solo dev — sem orcamento**.
  - **Rejeitada por:** ROI negativo em MVP. Considerar quando >$500/mes
    em Mux justificar.

## Decisao

**Adotar Opcao A: Mux + signed URLs TTL 4h + watermark CSS overlay
dinamico via Mux Player React. Encapsular SDK em
`server/services/muxMediaProvider.ts` para isolar vendor lock.**

### Detalhes-chave do design

1. **Provider isolation:** todo uso de `@mux/mux-node` mora em
   `muxMediaProvider.ts`. Codigo de dominio (routes, services) chama
   `muxProvider.createPlaybackToken()` — nunca SDK direto. Trocar
   vendor = trocar este arquivo.
2. **Signed URL TTL = 4h.** Rationale:
   - 1h interrompe playback longo (aulas de 30-60min com pausas).
   - 24h cria window grande para token sharing.
   - 4h cobre sessao tipica + tolerancia, sem expor demais.
3. **Auto-renew client-side:** Mux Player consome tokens. Frontend
   monitora `expiresAt`. Quando `expiresAt - now < 30min`, re-fetch
   `GET /api/library/lessons/:id/playback-token` e atualiza prop
   `tokens.playback`. Player nao re-buffera (token rotation).
4. **Watermark CSS:**
   - Render no client (`<div>` overlay sobre `<MuxPlayer>`).
   - Texto = `userPlatformId` (publico, nao-secret).
   - Opacidade 0.15 — visivel mas nao perturba assistir.
   - Diagonal -45deg + repeticao para cobrir tela.
   - Pointer-events none — nao bloqueia controles do player.
   - **NAO usa Mux burn-in:** burn-in custa re-encoding por user (Mux
     suporta variants but pricey). CSS dinamico = gratis.
5. **Endpoint contract:**
   ```
   GET /api/library/lessons/:id/playback-token
     auth: requireAuth + lessonAccess (D entitlement)
     response 200: {
       url: string,        // Mux signed HLS URL
       expiresAt: ISO8601,
       watermarkText: string  // = userPlatformId
     }
     response 401: { message: 'access_denied' }
     response 404: { message: 'lesson_not_found' | 'lesson_no_video' }
     response 503: { message: 'mux_not_configured' }
   ```
6. **Dev fallback (sem env Mux):** endpoint retorna 503. Frontend mostra
   `"Video temporariamente indisponivel"`. Permite rodar dev sem credenciais.
7. **Env vars:**
   ```
   MUX_TOKEN_ID=...           # API token
   MUX_TOKEN_SECRET=...       # API secret
   MUX_SIGNING_KEY=...        # Private key (pem)
   MUX_SIGNING_KEY_ID=...     # Key ID para JWT header
   ```
8. **Telemetria:** Mux Data SDK passa `userPlatformId` em metadata
   (anonimo para Mux). Founder ve heatmap de quais aulas/momentos sao
   mais assistidos. Custo: gratuito ate 100k views/mes.
9. **Asset upload via `uploadAsset`** (RF-11 manifest):
   - `muxProvider.uploadAsset({ fileBuffer, mimeType })` retorna
     `assetId + playbackId`.
   - Polling Mux para `assetReady` status — timeout 60s; se exceder,
     lesson criada com `videoMuxPlaybackId = null` + marcada
     `isPublished: false`.
   - Founder rerun manifest depois para resolver pending.
10. **Lesson #5 mock:** test mock de SDK Mux precisa wrappar
    `new Mux()` em try/catch. Documentado no test fixture.

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **CSS watermark removivel** | Poor-man DRM. Real DRM custa $1k+/mes. MVP aceita. |
| **TTL 4h fixa, nao adaptavel ao tipo de aula** | Simplicidade > otimizacao. Renovacao auto resolve interrupcao. |
| **Vendor lock em Mux** | Encapsulado em 1 arquivo; refactor = 1 dia futuro. |
| **Custo escalavel** | Monitor mensal; renegociar volume discount se passar $200/mes. |
| **Sem download offline** | Spec 6 (PWA + service worker) trata se demand. |
| **Watermark text expoe userPlatformId** | userPlatformId nao e secret — ja exposto em UI. Aceitavel. |

### Quando rever esta decisao

- **Custo Mux > $200/mes:** avaliar Cloudflare Stream + Vimeo Premium.
- **Watermark inadequado** (alpha testers compartilham massivamente):
  considerar Mux burn-in ou DRM real.
- **Novo provider entra com pricing 50%+ menor:** refactor de
  `muxMediaProvider.ts` justifica-se.
- **Founder pede subtitles/captions:** Mux suporta nativo (VTT
  upload), so habilita feature.
- **Multi-region edge case** (BR-only) onde Mux POP est aruim: pode
  precisar Cloudflare Stream que tem CDN BR melhor.

## Consequencias

### Positivas

- **CDN global out-of-the-box.**
- **HLS ABR automatico** — UX cross-device.
- **Signed URLs robustos com JWT custom.**
- **Watermark dinamico via CSS** — zero custo encoding.
- **Vendor isolation** — trocar = 1 arquivo.
- **Player React maduro** — UX a11y-compliant.
- **Telemetria gratis** via Mux Data.
- **Custo MVP previsivel** ~$120/mes para 100 users.

### Negativas

- **Vendor lock parcial** (mitigado por encapsulamento).
- **CSS watermark removivel** (aceitavel para MVP).
- **Custo variavel** (delivery $0.005/min).
- **Sem fallback offline.**
- **Dependencia de servico externo** — Mux down = video indisponivel
  (audio/artigo continuam).

### Neutras

- **Decisao revisitavel** — ADR novo se trocar provider.
- **Env vars novas** documentar em CLAUDE.md secao 4.
- **Lesson learned aplicavel:** #5 (mock `new` precisa try/catch
  fallback).

## Confianca

**Alta.** Mux usado em producao por Vercel, Twitch (alguns), HubSpot
clones, edTech medios. SDK +Player Reaact maduros (v3+). TTL 4h e
median da industria. Watermark CSS pattern usado por Coursera-clones.
Provider isolation testado em outros ADRs (021 model selection via env,
023 tool registry pattern).

## Referencias

- **Spec:** `Docs/specs/biblioteca-spec-1.md` RF-03 + D8
- **ADR-071:** `Docs/architecture/decisions/071-media-storage-backend-generic.md`
  — Mux fora de `MediaStorage`.
- **ADR-073:** `Docs/architecture/decisions/073-library-entitlements-model.md`
  — gating de signed URL via `user_lesson_access`.
- **Lessons learned:** `Docs/architecture/lessons-learned.md` — #5
  (`vi.fn()` nao e constructor — mock SDK Mux precisa try/catch
  fallback), #11 (default minimo — endpoint sem env retorna 503, nao
  fakeia URL).
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/biblioteca/c4-context.mermaid` — Mux
    como container externo.
  - `Docs/architecture/diagrams/biblioteca/flow-viewer-3-format-sync.mermaid`
    — endpoint `playback-token` no fluxo.
- **External docs:** Mux Node SDK https://github.com/muxinc/mux-node-sdk;
  Mux Player React https://github.com/muxinc/elements/tree/main/packages/mux-player-react;
  Mux Signed URLs https://docs.mux.com/guides/secure-video-playback.
- **Out of scope:** DRM real (Widevine), download offline (PWA),
  burn-in watermark, captions/legendas (Spec 6).
