# Sprint Stats-V3 — Hand2Note popup layout + OCR + 3-way comparison

- Status: Spec aprovada (autonomo founder AFK)
- Data: 2026-05-01
- Branch: `feature/stats-analyzer-v3-grouped-ocr`
- Worktree: `B:\grindfy-stats-v3`
- Modulo: Studies (`/studies` aba "Stats Analyzer")
- Tier: pro+
- Baseline: Sprint Stats-V2 (`docs/specs/sprint-stats-v2.md`) — 217 stats em
  16 grupos, comparator com `direction` semantics, customizer escalavel,
  Coach tool grouped. V3 assume V2 como contrato (catalogo + grupos +
  direction); ainda nao quebra rows existentes.
- Pesquisa: `docs/strategy/stats-v3-research.md` (2026-05-01).
- Reference UI: Hand2Note popup default (screenshot founder
  `Screenshot_1.png`).

## Visao geral

V2 organizou 217 stats em 16 grupos com customizer + comparator delta-cor.
**V3 muda como o usuario ENXERGA, ENTRA e COMPARA esses dados.**

1. **Hand2Note layout**: render do catalogo completo no estilo popup
   profissional (header verde por grupo, colunas `target | hero` em laranja
   + branco, fundo escuro, densidade alta). Templates V2 viram **filtros/
   presets** sobre o catalogo unico, NAO snapshots reduzidos.
2. **OCR ingestao**: upload de print do popup; Claude Haiku 4.5 vision
   extrai stats em JSON; preview com confidence + edicao inline; persiste
   como snapshot `captureMethod='ocr'`.
3. **3-way comparison**: comparator passa a aceitar **dois snapshots
   simultaneos** (snap1, snap2) com delta + trend indicator entre eles,
   alem de target.

V3 nao quebra V2 (catalogo permanece estatico, snapshots existentes ganham
`capture_method='manual'` no backfill). V4 (futuro): pool benchmark
dinamico, OCR multi-language, bulk OCR, GTO licenciado.

## Objetivos

1. `HudGroupedView.tsx` renderiza 16 grupos do catalogo (217 stats) estilo
   popup H2N.
2. Templates V2 viram filtros/presets visuais (NAO snapshots reduzidos).
3. Filter pills + search global + expand/collapse persistente em
   localStorage.
4. Inline edit de target (range) e hero (value) com optimistic + rollback.
5. Adicionar stats custom (`id` prefixo `custom_${nanoid(8)}`).
6. OCR endpoint via Claude Haiku 4.5 + cache SHA256 + rate limit 10/h +
   confidence scoring + preview UI com fuzzy match.
7. 3-way comparison (`target | snap1 | snap2 | delta`) + trend indicator +
   cor-coding semantico.
8. Migration 0020 minima: 4 colunas em `hud_stat_snapshots` para OCR.
9. Backward-compatible com V2 (snapshots existentes vira `capture_method=
   'manual'` via backfill).

## Requisitos funcionais

### RF-01 — `HudGroupedView.tsx` (layout Hand2Note)

Componente novo em `client/src/components/studies/stats/HudGroupedView.tsx`.

- Renderiza **16 cards**, um por grupo do `HUD_GROUP_IDS` (ordem V2).
- Header verde (`bg-emerald-700`) com label PT-BR + chevron + badge "X
  stats".
- Tabela 3 colunas: `Stat label` (branco) | `target` (laranja
  `text-orange-400`, formato `min-max%` ou `min-max`) | `hero` (branco;
  `—` cinza se `value=null`).
- Fundo `bg-slate-900`, `text-xs leading-tight`, padding `px-2 py-1`
  (densidade alta).
- Aceita props `snapshot: HudStatSnapshot` + `layoutId: string`.
- Mobile (<640px): 2 colunas (esconde target, acessivel via tooltip no hero).

**ACs (RTL unit):** AC-1.1 16 cards header verde; AC-1.2 stats por grupo
casa `getStatsByGroup`; AC-1.3 `value=null` exibe `—` cinza; AC-1.4
`basics` mostra 12 stats default.

---

### RF-02 — Tabela default = catalogo completo (presets como filtros)

- Tabela default = todos 217 stats (cards expandidos collapsed via RF-04).
- Templates V2 (`mttDefault`, `mttCashCompact`, etc) viram **presets de
  filtro UI** (`useState`), NAO sobrescrevem `fields_json`.
- `LayoutCustomizer` continua editando targets/customs (nao o catalogo).
- Catalogo permanece estatico (V2 ADR-058) — sem migration.

**ACs:** AC-2.1 default 217 stats visiveis (e2e); AC-2.2 preset
`mttCashCompact` reduz para ~30 (e2e); AC-2.3 trocar preset NAO dispara PUT
(integration network); AC-2.4 limpar preset restaura 217 (e2e).

---

### RF-03 — Filter pills + search global + presets

Header com 3 zonas:
1. **Search** (debounce 200ms): substring case-insensitive em `label` OR
   `id`.
2. **Group pills** (16 chips toggleaveis, default todos ativos) + botoes
   "Todos" / "Limpar".
3. **Preset selector**: 4 templates V2 + "Off-target only" (apenas stats
   fora `[targetMin, targetMax]`) + "Top 10 leaks" (10 stats com `|delta|`
   max, requer snapshot) + "Apenas grupo X" (16 dynamic).

Filtros combinaveis (AND). Empty state: "Nenhum stat encontrado".

**ACs:** AC-3.1 search "vpip" → 1 stat (e2e); AC-3.2 toggle off `basics`
esconde 12 (e2e); AC-3.3 "Off-target only" sem snapshot → empty (e2e);
AC-3.4 "Top 10 leaks" mostra 10 ordenados por `|delta|` desc (unit +
integration).

---

### RF-04 — Expand/Collapse persistente em localStorage

- Botoes "Expandir todos" / "Recolher todos".
- Estado por grupo persiste em `localStorage["stats-v3-expand-state"]` como
  `Record<HudGroupId, boolean>`.
- Default: todos expanded primeira visita; senao respeita ultimo estado.
- Fallback gracioso em `QuotaExceededError`: console.warn + state em memoria.

**ACs:** AC-4.1 recolher card persiste apos reload (e2e + assert); AC-4.2
"Expandir todos" reabre 16 cards (e2e); AC-4.3 localStorage indisponivel
nao quebra render (unit RTL).

---

### RF-05 — Inline edit de target (range)

- Click em celula `target` (ex: `28-30%`) abre popover com inputs `min` /
  `max` + Salvar/Cancelar.
- Validacao: `min < max`, ambos `>=0`. `unit='pct'` cap em `100`.
- PUT `/api/hud-layouts/:id` patching `fields_json[i].targetOverride:
  {min,max}` (preserva original do catalogo).
- Optimistic update via `setQueryData`; rollback automatico em erro
  (toast vermelho).

**ACs:** AC-5.1 click abre popover preenchido (RTL); AC-5.2 salvar dispara
PUT com `targetOverride` (integration network); AC-5.3 `min >= max` exibe
erro inline (RTL); AC-5.4 erro 500 reverte UI (integration mock).

---

### RF-06 — Inline edit de hero value

- Click em celula `hero` abre input numerico inline (Enter submete, Esc
  cancela).
- Validacao por `unit`: `pct` 0-100 decimais OK; `bb` >=0; `count` inteiro
  >=0.
- PUT `/api/stats-analyzer/snapshots/:id` body `{ values: { [statId]:
  newValue } }` (patch, nao replace).
- Optimistic + rollback. Customs (RF-07) usam mesmo fluxo com `customStat
  .unit`.

**ACs:** AC-6.1 click abre input com valor atual (RTL); AC-6.2 PUT patcha
apenas `values[statId]` (integration assert); AC-6.3 `pct=150` exibe erro
(RTL); AC-6.4 erro rede reverte (integration mock 500).

---

### RF-07 — Adicionar stat custom

- Botao `+ Stat` no header de cada card.
- Dialog com `label` (max 60), `unit`, `targetMin`, `targetMax`, `direction`
  (default `context`).
- Submit cria field em `fields_json` do layout ativo:
  ```json
  { "id": "custom_a8b3c9d1", "label": "...", "group": "basics",
    "targetMin": 0, "targetMax": 100, "direction": "context",
    "unit": "pct", "isCustom": true }
  ```
- `id` via `custom_${nanoid(8)}` (~36^8 collisions); `isCustom: true`
  habilita badge "Custom" + delete.
- Customs persistem em `hud_layouts.fields_json` (sem migration). NAO
  entram em `HUD_STAT_CATALOG`.

**ACs:** AC-7.1 dialog abre com select grupo pre-preenchido (RTL); AC-7.2
submit cria field com `id` matching `/^custom_[a-z0-9]{8}$/` (integration);
AC-7.3 custom aparece com badge (RTL e2e); AC-7.4 deletar remove de
`fields_json` (integration).

---

### RF-08 — Endpoint POST /api/stats-analyzer/ocr-extract

- Auth: `requireAuth` + tier `pro+`.
- Body: `multipart/form-data` com `image` (File).
- Validacao:
  - MIME real via magic bytes (`file-type` lib): `image/png`, `image/jpeg`,
    `image/webp`. Header `Content-Type` ignorado (lesson F2 spot-screenshots
    + ADR-057).
  - Size cap 10MB (env `OCR_IMAGE_MAX_BYTES` default `10485760`).
  - Magic bytes invalido → 422 `{ message: "Imagem invalida ou corrompida" }`.
- Persistencia: reusa `SpotImageStorage` (ADR-057) com prefixo
  `hud-snapshots/{userId}/{nanoid21}.{ext}`.
- Hash SHA256 do buffer = chave de cache (RF-09).
- Resposta:
  ```json
  { "imageKey": "hud-snapshots/USER-1234/abc.png",
    "ocrJobId": "ocrj_xxx",
    "stats": [ { "id": "vpip", "label": "VPIP", "value": 22.5,
                 "confidence": 0.94, "matchedBy": "exact" } ],
    "unmatched": [ { "label": "GG Bouns", "value": "12.3",
                     "confidence": 0.71 } ],
    "cached": false }
  ```

**ACs:** AC-8.1 PNG 1MB → 200 com `stats` (integration + Anthropic mock);
AC-8.2 TXT magic bytes invalido → 422 (integration); AC-8.3 >10MB → 413
PT-BR (integration); AC-8.4 imagem persiste com prefixo `hud-snapshots/`
(integration FS).

---

### RF-09 — OCR Claude Haiku 4.5 + cache SHA256

Servico: `server/services/hudOcrService.ts`. Modelo:
`claude-haiku-4-5-20251001` (SDK existente Coach AI).

- System prompt fixo cacheable ~1.5k tokens descrevendo schema JSON:
  ```
  Voce eh extrator OCR de popups Hand2Note.
  Retorne APENAS JSON: { "stats": [
    { "label": "VPIP", "value": 22.5, "confidence": 0.95 }, ... ]}
  - label: texto da stat (preserve case)
  - value: numero (sem %)
  - confidence: 0.0-1.0
  Ignore headers de grupo. Foque em pares label/value tabulares.
  ```
- Cache: antes da API, `SELECT FROM hud_stat_snapshots WHERE user_id=? AND
  source_image_key=? AND ocr_raw_response IS NOT NULL` → match retorna
  `cached: true`.
- Apos API: salva raw em `hud_stat_snapshots.ocr_raw_response` (jsonb);
  fuzzy match via RF-10.
- Retry: API 5xx → 1x backoff 500ms. Falha persistente → 502 + log
  `console.error('hud-ocr-failed', { userId, imageKey })`.
- Custo estimado ~$0.005/req (research doc: 1280 image tokens + 1500
  cached system + 600 output).

**ACs:** AC-9.1 primeira chamada dispara `messages.create` (integration +
SDK mock); AC-9.2 mesma SHA256 retorna cached sem hit SDK (integration);
AC-9.3 503 + retry success (mock); AC-9.4 503 ambas → 502 + log
(integration).

---

### RF-10 — `HudOcrPreview.tsx` confidence + bulk + fuzzy match

Componente em `client/src/components/studies/stats/HudOcrPreview.tsx`.
Grid scrolavel max-height `60vh`.

- Linha: badge confidence (verde >=0.9, amarelo 0.7-0.89, vermelho <0.7) +
  label OCR + dropdown "Suggested catalog stat" (top 3 fuzzy + manual +
  ignore) + value editavel + checkbox accept/reject.
- Fuzzy match (server expoe via response):
  - Levenshtein `<=3` entre label OCR normalizado (trim + lowercase + remove
    non-alphanumeric) e label catalog normalizado.
  - OR substring (`includes`) com length match `>=80%`.
  - Top match em `matchedBy: 'exact' | 'fuzzy_lev' | 'fuzzy_substring' |
    'unmatched'`.
- Bulk: "Aceitar todos >= 0.9", "Rejeitar todos < 0.7".
- "Salvar como snapshot" → RF-11.

**ACs:** AC-10.1 confidence 0.95 → badge verde (RTL); AC-10.2 "VPIP"
auto-suggest stat `vpip` (unit fuzzy); AC-10.3 bulk accept >=0.9 marca 5
linhas (e2e); AC-10.4 unmatched dropdown permite manual (RTL).

---

### RF-11 — Save flow OCR como snapshot

Endpoint: `POST /api/stats-analyzer/snapshots/from-ocr`.

- Body: `{ layoutId, imageKey, values, ocrConfidence, ocrRawResponse,
  capturedAt }`.
- Cria `hud_stat_snapshots` com `capture_method='ocr'`,
  `source_image_key=imageKey`, `ocr_confidence` (jsonb), `ocr_raw_response`
  (jsonb), `values` (V2 padrao).
- Validacao Zod: `values` matching catalogo + customs do layout. Stats nao
  mapeados → 400.
- Listagem snapshots mostra badge "OCR".

**ACs:** AC-11.1 POST cria row com `capture_method='ocr'` (integration);
AC-11.2 `source_image_key` aponta storage (integration); AC-11.3 listagem
mostra badge "OCR" (RTL); AC-11.4 statId desconhecido → 400 (integration).

---

### RF-12 — Rate limit OCR 10/h/user

- `express-rate-limit` apenas em `/api/stats-analyzer/ocr-extract`.
- Janela: 60min rolling. Limite: env `OCR_RATE_LIMIT_PER_HOUR` default 10.
- Storage `MemoryStore` (low-traffic OK, lesson bankroll). Reset em restart
  aceitavel.
- 429 response: `{ message: "Limite de OCR atingido. Tente novamente em
  X minutos.", retryAfterSeconds: <int> }` + header `Retry-After`. Minutos
  calculados de `req.rateLimit.resetTime`.

**ACs:** AC-12.1 10 reqs/60min passam (integration loop); AC-12.2 11a → 429
PT-BR (integration); AC-12.3 header `Retry-After` em segundos
(integration); AC-12.4 env override permite mais (integration env mock).

---

### RF-13 — Selector duplo Snapshot 1 + Snapshot 2

- Header (modo comparison) tem 2 selects: `Snapshot 1` (default mais
  antigo) + `Snapshot 2` (default mais recente).
- Opcoes: snapshots do user + layout, ordenados `captured_at desc`. Cada
  mostra `capturedAt` + label `(Manual)` / `(OCR)` / `(CSV)` baseado em
  `capture_method`.
- 0 snapshots: selects disabled + CTA "Criar primeiro snapshot".
- 1 snapshot: snap1 = snap2 = unico → comparator mostra apenas hero
  column (degraded mode).
- Toggle "Modo single snapshot" volta layout RF-01.

**ACs:** AC-13.1 0 snapshots → selects disabled (RTL); AC-13.2 5 snapshots
default snap1=mais antigo, snap2=mais recente (RTL); AC-13.3 trocar snap1
dispara fetch compare (integration); AC-13.4 toggle single esconde coluna
snap1 (RTL).

---

### RF-14 — Layout 3-coluna `target | snap1 | snap2 | delta`

- Tabela RF-01 ganha 2 colunas extras: `Stat | target | snap1 | snap2 |
  delta` (`snap2 - snap1`).
- Cor-coding combinando `direction` + status:
  - **verde** (`text-emerald-400`): ambos snap1 + snap2 in-target.
  - **laranja** (`text-orange-400`): improving (snap1 fora → snap2 dentro).
  - **vermelho** (`text-red-400`): regression (snap1 dentro → snap2 fora).
  - **cinza** (`text-slate-500`): ambos fora consistente OU
    `direction='context'` (Coach interpreta).
- Direction aplicada ao delta:
  - `higher_better`: delta>0 = good (verde se snap2 in-target).
  - `lower_better`: delta<0 = good.
  - `context` / `neutral`: cinza sempre.
- `value=null` em snap1 OU snap2: `—` cinza, delta=null.

**ACs:** AC-14.1 ambos in-target context → verde (RTL); AC-14.2
higher_better snap1 fora→snap2 dentro → laranja improving (RTL); AC-14.3
lower_better snap1 dentro→snap2 fora → vermelho regression (RTL); AC-14.4
snap1=null → `—` cinza, delta=null (RTL).

---

### RF-15 — Trend indicator + tooltip magnitude + dias

- Coluna `delta` mostra icone:
  - `→` se `|delta| < 1%`.
  - `↑` / `↓` se `1% <= |delta| < 5%`.
  - `↑↑` / `↓↓` se `|delta| >= 5%`.
- Direcao respeita semantica:
  - `higher_better`: delta>0 → `↑` positivo; delta<0 → `↓`.
  - `lower_better`: delta>0 → `↓` (pior); delta<0 → `↑`.
  - `context` / `neutral`: `→` sempre (Coach interpreta).
- Tooltip on hover: `VPIP / +5.0% em 14 dias (snap1: 2026-04-17, snap2:
  2026-05-01) / Direction: context — interpretacao depende de estilo`.
- Threshold por `unit`: `pct` 1%/5%; `bb` 0.1/0.5; `count` 1/5.

**ACs:** AC-15.1 delta=0.5% → `→` (RTL); AC-15.2 delta=3% higher_better →
`↑` verde (RTL); AC-15.3 delta=8% lower_better → `↓↓` vermelho (RTL);
AC-15.4 tooltip mostra dias (RTL hover).

---

### RF-16 — `GET /api/stats-analyzer/snapshots/compare`

Query: `?snap1=ID&snap2=ID&layoutId=ID`.

- Validacao: ambos snapshots pertencem ao user (403 senao); ambos referem
  `layoutId` (400 mismatch); deletado → 404 graceful (`{ message: "Snapshot
  nao encontrado" }`).
- Resposta agregada server-side:
  ```json
  { "layoutId": "...",
    "snap1": { "id": "...", "capturedAt": "...", "captureMethod": "manual" },
    "snap2": { "id": "...", "capturedAt": "...", "captureMethod": "ocr" },
    "groups": [ { "id": "basics", "name": "Basicos",
                  "stats": [ { "id": "vpip", "label": "VPIP",
                               "target": {"min":20,"max":25},
                               "snap1Value": 22, "snap2Value": 24,
                               "delta": 2, "direction": "context",
                               "status": "both_in_target",
                               "trend": "stable" } ] } ],
    "summary": { "snap1OffTarget": 5, "snap2OffTarget": 3,
                 "improvingCount": 2, "regressingCount": 1,
                 "stableCount": 211 } }
  ```
- `status` + `trend` calculados server (frontend renderiza sem recalc).
- Performance: 217 stats x 2 snaps = ~434 valores; agg em 1 SELECT
  (snapshots + layout fields). p95 <300ms.

**ACs:** AC-16.1 valid → 200 com 16 groups (integration); AC-16.2 snap1
de outro user → 403 (integration auth); AC-16.3 layoutId mismatch → 400
(integration); AC-16.4 snap1 deletado durante request → 404 graceful
(integration race).

## Requisitos nao-funcionais

- **RNF-01 Performance**: `HudGroupedView` 217 stats <300ms (React
  Profiler); OCR endpoint p95 <8s (Haiku 2-5s + I/O); compare p95 <300ms;
  inline PUT p95 <300ms local.
- **RNF-02 Seguranca**: `requireAuth` + `pro+`; magic bytes ANTES de enviar
  Anthropic (evita injetar payload texto disfarcado); rate limit 10/h
  contem abuso (~$0.005/req); `image_key` opaco (ADR-057); SDK HTTPS.
- **RNF-03 A11y**: filter pills `role="checkbox"` + `aria-checked`; OCR
  preview rows `role="row"` cells `role="cell"`; cor-coding RF-14
  acompanhado de icones (✓/!/✗) + texto status.
- **RNF-04 Mobile**: <640px HudGroupedView 2 cols (target em tooltip);
  3-way snapshots em accordion stacked; OCR `<input
  capture="environment">` permite tirar foto direto.
- **RNF-05 Tier**: pro+ (consistente V2). Free vê CTA upgrade.
- **RNF-06 i18n**: stats labels ingles (siglas universais V2 RNF-02);
  UI/toasts/group labels PT-BR.

## Endpoints (delta vs V2)

| Method | Path | Mudanca |
|--------|------|---------|
| POST | /api/stats-analyzer/ocr-extract | NOVO RF-08 |
| POST | /api/stats-analyzer/snapshots/from-ocr | NOVO RF-11 |
| GET | /api/stats-analyzer/snapshots/compare | NOVO RF-16 |
| PUT | /api/stats-analyzer/snapshots/:id | EXTENSAO RF-06 (patch values) |
| PUT | /api/hud-layouts/:id | EXTENSAO RF-05/RF-07 (targetOverride + customs) |

## Schema delta (migration 0020)

```sql
-- migrations/0020_stats_v3_ocr.sql

ALTER TABLE hud_stat_snapshots
  ADD COLUMN capture_method varchar(20) NOT NULL DEFAULT 'manual'
    CHECK (capture_method IN ('manual','paste','csv','ocr'));

ALTER TABLE hud_stat_snapshots
  ADD COLUMN source_image_key varchar(255);

ALTER TABLE hud_stat_snapshots
  ADD COLUMN ocr_confidence jsonb;

ALTER TABLE hud_stat_snapshots
  ADD COLUMN ocr_raw_response jsonb;

-- Backfill safe (DEFAULT cuida de rows novas; UPDATE garante existentes).
UPDATE hud_stat_snapshots
  SET capture_method = 'manual'
  WHERE capture_method IS NULL OR capture_method = '';

CREATE INDEX IF NOT EXISTS idx_hud_snapshots_capture_method
  ON hud_stat_snapshots (user_id, capture_method);

-- Index para cache lookup OCR (RF-09).
CREATE INDEX IF NOT EXISTS idx_hud_snapshots_source_image_key
  ON hud_stat_snapshots (user_id, source_image_key)
  WHERE source_image_key IS NOT NULL;
```

NOTA: `source_image_key` NAO eh FK formal (ADR-057 — keys opacas, storage
abstraction). Apenas string indexada.

## Defaults D1-D14

| ID | Decisao | Razao |
|----|---------|-------|
| D1 | Migration 0020 isolada (NAO usar 0021+) | Worktrees paralelas evitam colisao com main |
| D2 | Catalogo continua estatico (V2 ADR-058) | Customs viram parte do `fields_json` do layout, sem persistencia DB pra catalogo |
| D3 | Customs `id` prefixo `custom_` + nanoid 8 | Separa de catalog ids; ~36^8 colisoes irrelevantes |
| D4 | OCR primario Haiku 4.5 (NAO Sonnet) | $0.005/req vs $0.012; accuracy suficiente em tabelas (research) |
| D5 | Cache OCR via SHA256 do buffer | Determinismo; re-upload mesma imagem nao reconsome budget |
| D6 | Rate limit em memoria (`MemoryStore`) | Lesson bankroll: low-traffic OK, restart reset aceitavel |
| D7 | Templates V2 viram presets (NAO removidos) | Preserva contrato V2; layouts custom V2 continuam |
| D8 | Inline edit optimistic + rollback em erro | UX rapida; padrao TanStack Query do projeto |
| D9 | Compare endpoint server-side agg (NAO client) | Consistencia direction/status; evita drift entre 16 grupos |
| D10 | Trend threshold por `unit` (1%/5% pct, 0.1/0.5 bb, 1/5 count) | Faixas fazem sentido por dimensao; flat threshold nao cobre bb |
| D11 | Cor-coding 4 estados (verde/laranja/vermelho/cinza) | Consistente V2 RF-06; adiciona laranja=improving + vermelho=regressing especifico V3 |
| D12 | Reusa `SpotImageStorage` com prefixo `hud-snapshots/` | ADR-057 ja resolve persistencia + path traversal; zero infra nova |
| D13 | localStorage key `stats-v3-expand-state` versionado | Permite migration futura (V4 muda shape) sem corromper estado V3 |
| D14 | OCR aceita apenas PNG/JPEG/WEBP | Cobre 99% prints; HEIC/AVIF/PDF deferidos V4 (DEBT-V4-2) |

## Edge cases

- **Imagem corrompida pos magic-bytes** (Sharp passa, Anthropic falha): 422
  `{ message: "Imagem nao pode ser processada. Tente outra captura." }`.
- **Anthropic SDK 5xx**: retry 1x; falha persistente → 502 + log error;
  cache NAO salva (evita poison cache).
- **OCR retorna stats que NAO casam catalog**: vai para `unmatched` array
  no response. UI permite vinculo manual via dropdown OR ignore.
- **Snapshot deletado durante 3-way compare**: 404 graceful; frontend toast
  "Snapshot indisponivel — selecione outro".
- **localStorage cheio** (`QuotaExceededError`): catch + console.warn,
  state em memoria sem persistencia.
- **Inline edit em snapshot OCR**: permitido. Edicao vira manual override
  do extraido. Confidence preservado (historico).
- **OCR sem layout ativo**: 400 `{ message: "Selecione um layout antes de
  extrair OCR" }` (necessario para fuzzy match contra customs).
- **Imagem >10MB**: 413 antes do service (multer limits) + log do tamanho.

## Conflict avoidance (worktree paralelo)

NAO tocar:
- `client/src/pages/grind-session-live*` / `client/src/components/grind-session-live/**`
- `client/src/pages/Bankroll*` / `client/src/components/bankroll/**`
- `server/routes/grind-sessions.ts`, `server/routes/bankroll.ts`,
  `server/routes/wallets.ts`, `server/routes/cooldown.ts`
- `client/src/components/cooldown/**`

Migration 0020 reservada exclusiva V3. NAO criar 0021/0022 nesta sprint —
livres para outros worktrees ate V3 fazer merge. Se conflict com main:
rebase manual, preservar 0020 pre-existente.

## Pipeline F2-F12

| Fase | Output | Commit |
|------|--------|--------|
| F2 | ADR-060 (OCR via Anthropic Haiku) + ADR-061 (3-way compare schema) + diagrama Mermaid sequencia OCR | `docs(stats-v3): F2 — ADRs OCR + compare schema + diagrama` |
| F3 | Migration 0020 + schema delta + Drizzle types | `feat(stats-v3): F3 — migration 0020 capture_method + ocr cols` |
| F4 | `HudGroupedView.tsx` + filter pills + search + presets (RF-01..04) | `feat(stats-v3): F4 — Hand2Note layout + filtros` |
| F5 | Inline edit target + hero + custom stats (RF-05..07) | `feat(stats-v3): F5 — inline edit + custom stats` |
| F6 | Endpoint `/ocr-extract` + magic bytes + storage (RF-08) | `feat(stats-v3): F6 — endpoint OCR upload` |
| F7 | `hudOcrService.ts` + Anthropic Haiku + cache SHA256 (RF-09) | `feat(stats-v3): F7 — ocr service + cache + retry` |
| F8 | `HudOcrPreview.tsx` + fuzzy match + bulk actions (RF-10) | `feat(stats-v3): F8 — ocr preview + fuzzy match` |
| F9 | Endpoint `from-ocr` (RF-11) + rate limit (RF-12) | `feat(stats-v3): F9 — save ocr snapshot + rate limit` |
| F10 | Selector duplo + 3-way compare layout (RF-13..15) | `feat(stats-v3): F10 — 3-way compare + trend indicator` |
| F11 | Endpoint `compare` server-side agg (RF-16) | `feat(stats-v3): F11 — compare endpoint agregado` |
| F12 | simplify + reviewer + perf bench + memory file | `refactor(stats-v3): F12 — simplify + perf + memory` |

## Risks / debts

- **DEBT-V4-1** (pool benchmark dinamico): V3 mantem targets estaticos PT4.
  Pool real exige agregacao multi-user (anonimizado). Resolver V4 quando
  amostra >1k users pro+.
- **DEBT-V4-2** (OCR multi-language): V3 prompt + labels ingles. Suporte
  PT-BR/ES requer prompt expandido + maior risco de fuzzy errado. Defer V4.
- **DEBT-V4-3** (bulk OCR multi-image): V3 processa 1 imagem/req. Batch
  multi-image (5 prints sessoes diferentes) tem custo UX + queue. Defer V4.
- **DEBT-V4-4** (GTO source licenciado): V3 `targetMin/Max` chutes do
  catalogo PT4 V2. GTO Wizard licenciado (~$500/mo) traria targets reais
  por spot/buyin. Defer V4 ate monetizacao.
- **RISK-1**: Haiku vision pode retornar JSON malformado em <2% casos. Zod
  parse + fallback "Reformate: {raw}" em retry; persistente → unmatched
  array com raw text.
- **RISK-2**: Rate limit em memoria reseta em restart. Mitigacao: log uso
  anormal (`>5 reqs/5min` warn). V4: migrar Redis quando deploy.
- **RISK-3**: Cache SHA256 hit pode "voltar" valor a OCR antigo apos edit
  manual. Por design: cache eh por `source_image_key`, edits ficam em
  `values` separados. Re-upload mesma imagem retorna OCR original (correto).
- **RISK-4**: Custom stats em layouts compartilhados (futuro) podem colidir
  ID entre users. Mitigacao: customs vivem em `fields_json` (escopo user);
  `id` `custom_${nanoid}` global unique. Zero risco hoje.
