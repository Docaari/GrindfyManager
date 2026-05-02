# Sprint Stats-V3.5 — OCR Context-Aware Mapping

**Status:** Draft
**Origem:** Sessao 3 (Stats) — feedback founder 2026-05-01
**Pre-requisito:** Sprint Stats-V3 entregue (`sprint-stats-v3.md`, ADR-065)
**Pipeline:** pm-spec → system-architect → test-writer → implementer → reviewer

---

## 1. Problema

OCR atual extrai apenas `label` + `value` linha-a-linha, ignorando o **agrupamento visual** do popup Hand2Note. Resultado: stats com nome ambiguo (multiplas secoes contem o mesmo label-base) sao mapeadas para a stat errada.

### Caso real (founder, 2026-05-01)

> "Probe river 37" capturado dentro da secao **Big Blind defense** no print foi mapeado como `sb_probe_river` (Blind war SB).

### Causa raiz

1. **Prompt Gemini** (`server/services/hudOcrPrompt.ts`) instrui apenas pares `{label, value, confidence}`. Nao pede secao/heading.
2. **Schema de saida** `{ stats: [{label, value, confidence}] }` nao carrega contexto.
3. **fuzzyMatchStat** (`shared/hud-fuzzy-match.ts`) compara somente texto normalizado do label. "Probe River" casa via substring com TODAS estas no catalog:
   - `sb_probe_river` (group `blind_war_sb`)
   - `bb_probe_river_sb` (group `blind_war_bb`)
   - `probe_river_oop` (group `pos_flop_pfr_oop`)
   - `fold_vs_probe_river`, `call_vs_probe_river`, `raise_vs_probe_river` (group `pos_flop_pfr_ip`)
4. Ranking atual = score textual puro. Primeiro match com maior overlap vence — sem desambiguar via contexto visual.

### Catalogo ja preparado

`shared/hud-stat-catalog.ts` ja agrupa stats em 16 `HudGroupId` com labels PT-BR em `HUD_GROUP_LABELS` (ex: `"BB defense"`, `"Blind war SB"`, `"Pos-flop PFR OOP"`). Falta wiring entre OCR e catalogo.

---

## 2. Objetivo

Usar a estrutura visual do popup Hand2Note (cabecalhos de secao) como **sinal de desambiguacao** ao mapear `label` → `statId` do catalogo.

**Meta:** zero mismatch entre stat lida e stat mapeada quando o popup contiver heading visivel da secao.

---

## 3. Escopo

### In scope

1. Prompt Gemini/Anthropic atualizado para extrair `section` (heading visual) junto de cada par `label/value`.
2. Novo schema de OCR response com `section` por stat.
3. `fuzzyMatchStat` aceita parametro `sectionHint` opcional. Boost de score quando `groupId` da candidata bate com mapeamento `sectionHint → HudGroupId`.
4. Tabela de mapeamento `SECTION_ALIASES`: aliases comuns de heading (PT/EN, abreviacoes, variantes Hand2Note) → `HudGroupId`.
5. Endpoint `/api/stats-analyzer/ocr-extract` propaga `section` do servico ate response.
6. Frontend `HudOcrPreview` mostra a secao detectada (ex: badge "Secao: BB defense") e permite override manual.
7. Testes:
   - Unit: `fuzzyMatchStat` com `sectionHint` resolve casos ambiguos corretamente (ex: "probe river" + section "Big Blind defense" → `bb_probe_river_sb`).
   - Unit: `SECTION_ALIASES` mapeia variantes (case-insensitive, espacos extras, abreviacoes).
   - Integration: payload OCR mock com 3 secoes diferentes mapeia stats por secao.
   - E2E: print real Hand2Note com BB defense + Blind war SB resolve sem colisao.

### Out of scope

- Re-treino de modelo OCR / fine-tune.
- Detector visual proprio (continuamos delegando ao LLM vision Gemini/Anthropic).
- Mudanca de provider.
- Cache invalidation por upgrade de schema (cache existente vira `cached=false`, re-OCR transparente).

---

## 4. Mudancas tecnicas

### 4.1 Prompt (server/services/hudOcrPrompt.ts)

Nova versao do `OCR_SYSTEM_PROMPT` deve:

- Pedir extracao do **heading da secao** acima de cada bloco de stats.
- Reconhecer headings visualmente distintos: caixa-alta, cor diferente, separador horizontal, indentacao, etc.
- Atribuir cada `{label, value}` a secao mais proxima acima dele.
- Se nao houver heading visivel, retornar `section: null`.

Schema esperado de saida:

```json
{
  "stats": [
    {
      "section": "Big Blind defense",
      "label": "Probe River",
      "value": 37,
      "confidence": 0.93
    },
    {
      "section": "Blind war SB",
      "label": "SB Probe Turn",
      "value": 28,
      "confidence": 0.91
    }
  ]
}
```

`section` eh string livre (texto exato do heading). NAO eh enum — normalizacao acontece no servidor.

### 4.2 SECTION_ALIASES (novo `shared/hud-section-aliases.ts`)

**Cobertura obrigatoria:** os 16 `HudGroupId` (HUD_GROUP_IDS) DEVEM ter pelo
menos 3 aliases cada — (a) o label oficial PT-BR (`HUD_GROUP_LABELS[g]`),
(b) a versao EN canonica derivada do id (`_` -> espaco), (c) variantes
Hand2Note conhecidas. Sem cobertura completa, headings de grupos nao mapeados
caem para `null` (degrada graciosamente). Tabela canonica que implementer DEVE
replicar (todos lowercased, sem pontuacao, espacos normalizados):

| HudGroupId | Aliases minimos |
|---|---|
| `basics` | `basics`, `basicos`, `fundamentos` |
| `rfi` | `rfi`, `rfi por posicao`, `rfi by position`, `open raise` |
| `threebet` | `3bet`, `three bet`, `threebet`, `3bet pf`, `3 bet preflop` |
| `resteal` | `resteal`, `re steal`, `resteal pf` |
| `pos_flop_pfr_ip` | `pos flop pfr ip`, `posflop pfr ip`, `pfr ip`, `as pfr ip` |
| `pos_flop_pfr_oop` | `pos flop pfr oop`, `posflop pfr oop`, `pfr oop`, `as pfr oop` |
| `pos_flop_multiway` | `pos flop multiway`, `multiway`, `mw`, `multi way` |
| `cbets_by_board` | `cbets por textura`, `cbets by board`, `cbet by texture`, `c bet textura` |
| `caller_pre_flop` | `caller pre flop`, `caller preflop`, `as caller`, `cold call` |
| `threeway_bb` | `3 way bb`, `3way bb`, `bb 3 way`, `three way bb` |
| `bb_defense` | `bb defense`, `big blind defense`, `defesa do bb`, `defesa big blind`, `bb defend` |
| `pos_flop_pfc_ip` | `pos flop pfc ip`, `posflop pfc ip`, `pfc ip`, `as caller ip` |
| `blind_war_sb` | `blind war sb`, `sb vs bb`, `small blind war`, `sb war`, `sb open vs bb` |
| `blind_war_bb` | `blind war bb`, `bb vs sb`, `big blind war`, `bb war`, `bb defend vs sb` |
| `threebet_pot_ip` | `3bet pot ip`, `3 bet pot ip`, `threebet pot ip`, `3bp ip` |
| `threebet_pot_oop_vs_lp` | `3bet pot oop vs lp`, `3 bet pot oop vs lp`, `3bp oop vs lp`, `threebet pot oop` |

**Regra de duplicidade:** se um alias literal aparecer em duas linhas, implementer
DEVE escolher a interpretacao mais especifica (ex: "bb defense" fica em
`bb_defense`, NAO em `blind_war_bb`) e adicionar comentario inline justificando.

```ts
// Mapa de heading bruto (normalizado) -> HudGroupId.
// Cobre os 16 HudGroupId conforme tabela acima.
export const SECTION_ALIASES: Record<string, HudGroupId> = {
  "basics": "basics",
  "basicos": "basics",
  "fundamentos": "basics",
  // ... (replicar todas as linhas da tabela)
};

export function resolveSection(rawHeading: string | null | undefined): HudGroupId | null {
  if (!rawHeading) return null;
  const normalized = rawHeading.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return SECTION_ALIASES[normalized] ?? null;
}
```

### 4.3 fuzzyMatchStat (`shared/hud-fuzzy-match.ts`)

Nova assinatura:

```ts
export function fuzzyMatchStat(
  rawLabel: string,
  catalog: StatField[],
  options?: { maxResults?: number; sectionHint?: HudGroupId | null },
): FuzzyMatchCandidate[]
```

Logica de boost (aplicada APOS calculo de score base, ANTES de ordenar):

- Se `sectionHint == null` (sem hint OR resolveSection retornou null): nenhum ajuste — comportamento 100% legacy preservado.
- Se `sectionHint` setado e candidata tem `group === sectionHint`: `score = min(1.0, score + 0.15)` (boost aditivo, teto em 1.0).
- Se `sectionHint` setado e candidata tem `group !== sectionHint`: `score = score * 0.6` (penalty multiplicativo).
- Tie-breaker: em empate apos boost, candidata com `group === sectionHint` vence; persistindo empate, ordem original do catalog (estavel).
- `kind` NAO muda: um match `fuzzy_substring` com boost continua `fuzzy_substring` no payload (campo separado opcional `boostedBySection: boolean` no `FuzzyMatchCandidate` para audit).

**Justificativa numerica:** scores `fuzzy_substring` sao 0.85-0.95. Penalty `*0.6` derruba para 0.51-0.57, abaixo do piso de substring (0.85) — garante que candidata fora-de-grupo so vence se a in-grupo nem existir como candidata. Boost `+0.15` em substring ja proximo de 0.95 chega ao teto 1.0, igualando exact — desempate pelo `kindRank` ainda preserva exact > substring quando ambos batem. Para `fuzzy_lev` (<= 0.7), penalty leva a <= 0.42 — efetivamente filtrado.

### 4.4 hudOcrService (`server/services/hudOcrService.ts`)

- Schema de parse aceita campo opcional `section`.
- `extractStatsJson` retorna `Array<{label, value, confidence, section?}>`.
- Antes do fuzzy match, normaliza section via `resolveSection()`.
- Passa `sectionHint` para `fuzzyMatchStat`.
- Estrutura `OcrMatchedStat` ganha campo `section?: HudGroupId | null` para audit.

### 4.5 Endpoint route (`server/routes/statsAnalyzer.ts`)

- `/api/stats-analyzer/ocr-extract` response payload inclui `section: HudGroupId | null` em cada item de `stats[]` e `unmatched[]`, alem do `rawSection: string | null` (heading bruto reportado pelo LLM, antes da resolucao).
- `ocrRawResponse` (cache key por imageSha256) inclui aliases-resolvidos-por-stat (`{ rawSection, resolvedSection }`) para nao reprocessar em cache hit. Cache hit retorna mesma estrutura sem re-chamar LLM.
- `/api/stats-analyzer/snapshots/from-ocr` ganha campo OPCIONAL `sections: Record<string, HudGroupId | null>` no body (chave = statId, valor = HudGroupId que ganhou o match — ou null se sem secao). Persistido em `ocrRawResponse.sections` (jsonb existente, sem migration). Compat: omitir campo = comportamento legacy.

### 4.6 HudOcrPreview (frontend)

- Cada linha de preview mostra badge `Secao: {HUD_GROUP_LABELS[section]}` quando detectada.
- Linhas sem secao detectada: badge cinza "Sem secao".
- Permite override manual: dropdown com 17 opcoes (16 grupos + "Sem secao"/null).
- Override altera ranking client-side: re-roda `fuzzyMatchStat` local com novo `sectionHint` (ja que catalog + helper sao shared). Re-render mostra novo top match.
- Ao salvar via from-ocr endpoint, frontend monta `sections` map com o HudGroupId vencedor por statId (override ou auto-detectado) e envia junto com `values`/`ocrConfidence`/`ocrRawResponse`.

---

## 5. Plano de testes

### Unit

1. `fuzzyMatchStat("Probe River", catalog, { sectionHint: "bb_defense" })` → primeiro candidato eh stat com group `bb_defense` (ex: `bb_probe_river_sb` se houver alias, OR documentar gap se nao houver match no grupo).
2. `fuzzyMatchStat("Probe River", catalog, { sectionHint: "blind_war_sb" })` → primeiro candidato `sb_probe_river`.
3. `fuzzyMatchStat("Probe River", catalog)` (sem hint) → comportamento legacy preservado.
4. `resolveSection("Big Blind Defense")` → `"bb_defense"`.
5. `resolveSection("BB DEFENSE")` → `"bb_defense"` (case-insensitive).
6. `resolveSection("blah blah")` → `null`.
7. `resolveSection(null)` → `null`.

### Integration

1. Mock Gemini retorna payload com 3 secoes — endpoint mapeia 3 stats em 3 grupos diferentes sem colisao.
2. Mock Gemini retorna payload sem `section` — fallback comportamento legacy (sem boost).
3. Cache hit re-retorna payload com section preservado.

### E2E manual (founder) — **BLOQUEANTE para DONE**

1. Print real Hand2Note com BB defense + Blind war SB no mesmo popup.
2. "Probe River 37" sob BB defense → mapeia como `bb_probe_river_sb` (NAO `sb_probe_river`).
3. "SB Probe Turn 28" sob Blind war SB → mapeia como `sb_probe_turn`.
4. Override manual no preview: trocar secao detectada para outro grupo → top match recalcula client-side.
5. Salvar via from-ocr → recarregar pagina → snapshot persistiu com sections corretas.

**Quando:** apos implementer entregar green phase E reviewer aprovar code review,
ANTES de marcar sprint como DONE. Founder roda os 5 cenarios em ambiente local
(ou stage). Se um falhar, volta para implementer com prints+repro.

---

## 6. Riscos

| Risco | Mitigacao |
|-------|-----------|
| Gemini extrai section errada (heading confuso ou ausente) | Fallback: section nulo → comportamento legacy. Founder pode override manual. |
| Catalog sem stat correspondente para combinacao section+label | Marcar como `unmatched`. Logar para iterar SECTION_ALIASES + catalogo em sprint futuro. |
| SECTION_ALIASES incompleto vs realidade Hand2Note | Coletar lista exaustiva de headings Hand2Note (idealmente do site oficial OR prints reais). Iterar em PRs incrementais. |
| Cache antigo sem section vira "miss" pos-deploy | Aceitavel: re-OCR primeiro upload. Custo ~3-5s + tokens Gemini (free tier). |
| Boost agressivo distorce ranking quando section vem errada | Penalty (`*0.6`) em vez de exclusao mantem fallback se LLM errar section mas acertar label. |

---

## 7. ADRs envolvidas

- ADR-065 (OCR via Claude/Gemini Vision) — atualizar com nova schema de response.
- ADR nova (proposta: 067) — "Section-aware OCR mapping com SECTION_ALIASES".

---

## 8. Criterios de aceite

- [ ] Print Hand2Note com BB defense + Blind war SB → cada "Probe River" cai no grupo correto.
- [ ] Toast de erro NAO surge em fluxo normal.
- [ ] Cache funcional: cache hit retorna section sem re-chamar LLM (verificavel via log de chamadas Gemini contagem).
- [ ] Comportamento legacy preservado: `fuzzyMatchStat(label, catalog)` (sem options) e `fuzzyMatchStat(label, catalog, { sectionHint: null })` produzem ranking identico ao Sprint Stats-V3.
- [ ] `SECTION_ALIASES` cobre os 16 `HudGroupId` (test enumera HUD_GROUP_IDS e verifica >= 1 alias por grupo).
- [ ] Tests unit passando: novos casos de `fuzzyMatchStat` + `resolveSection` + `SECTION_ALIASES` coverage.
- [ ] Tests integration passando: payload mock com 3 secoes; payload sem section (fallback legacy); cache hit preserva section.
- [ ] HudOcrPreview mostra secao detectada + dropdown override (17 opcoes incluindo null).
- [ ] from-ocr endpoint aceita `sections` opcional e persiste em `ocrRawResponse.sections` (jsonb existente, sem migration).
- [ ] Zero regressao nos 545+ testes do Sprint Stats-V3.
- [ ] E2E manual founder: 5 cenarios passam (item 5.E2E acima).
- [ ] Prompt `OCR_SYSTEM_PROMPT` continua sendo single source (lesson #10) — sem duplicacao em hudOcrService.
- [ ] reviewer: APPROVED-CLEAN.

---

## 9. Estimativa

| Fase | Owner | Complexidade |
|------|-------|--------------|
| pm-spec (este doc) | pm-spec | M (entregue) |
| system-architect (ADR + diagrama de fluxo OCR pos-section) | system-architect | S |
| test-writer (red phase: 12-15 testes unit + 3 integration) | test-writer | M |
| implementer (green: prompt + aliases + boost + frontend badge) | implementer | M |
| reviewer (security: prompt injection via section, IDOR, cache key) | reviewer | S |
| Total | | ~1 sprint pequeno (1-2 dias) |

---

## 10. Notas de implementacao

- Prompt Gemini deve ser DRY — sair de `OCR_SYSTEM_PROMPT` unico (lesson #10).
- `SECTION_ALIASES` em `shared/` para reuso server+client (frontend usa pra render badge de secao).
- NAO criar tabela DB nova. `ocrRawResponse` JSON ja absorve `section`.
- Migration: nao necessaria (campo opcional dentro de jsonb).
- Telemetria opcional (futura sprint): contar quantos OCRs sao corrigidos por section vs sem section.
