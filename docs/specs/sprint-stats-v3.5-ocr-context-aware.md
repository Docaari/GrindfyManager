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

```ts
// Mapa de heading bruto (normalizado) -> HudGroupId.
// Aliases cobrem variacoes PT/EN, abreviacoes, e nomes oficiais Hand2Note.
export const SECTION_ALIASES: Record<string, HudGroupId> = {
  // basics
  "basics": "basics",
  "basicos": "basics",
  "fundamentos": "basics",

  // bb_defense
  "bb defense": "bb_defense",
  "big blind defense": "bb_defense",
  "defesa do bb": "bb_defense",
  "defesa big blind": "bb_defense",

  // blind_war_sb
  "blind war sb": "blind_war_sb",
  "sb vs bb": "blind_war_sb",
  "small blind war": "blind_war_sb",

  // blind_war_bb
  "blind war bb": "blind_war_bb",
  "bb vs sb": "blind_war_bb",
  "big blind war": "blind_war_bb",

  // ... cobertura para os 16 HudGroupIds
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

Logica de boost:

- Se `sectionHint` setado e candidata tem `group === sectionHint`: `score += 0.15` (clamped a 1.0).
- Se `sectionHint` setado e candidata tem `group !== sectionHint`: `score *= 0.6` (penalty).
- Em caso de empate de score apos boost, candidata com `group === sectionHint` vence.

### 4.4 hudOcrService (`server/services/hudOcrService.ts`)

- Schema de parse aceita campo opcional `section`.
- `extractStatsJson` retorna `Array<{label, value, confidence, section?}>`.
- Antes do fuzzy match, normaliza section via `resolveSection()`.
- Passa `sectionHint` para `fuzzyMatchStat`.
- Estrutura `OcrMatchedStat` ganha campo `section?: HudGroupId | null` para audit.

### 4.5 Endpoint route (`server/routes/statsAnalyzer.ts`)

- Response payload inclui `section` em cada item de `stats[]` e `unmatched[]`.
- `ocrRawResponse` (cache) inclui aliases-resolvidos-por-stat para nao reprocessar em cache hit.

### 4.6 HudOcrPreview (frontend)

- Cada linha de preview mostra badge `Secao: {HUD_GROUP_LABELS[section]}` quando detectada.
- Linhas sem secao detectada: badge cinza "Sem secao".
- Permite override manual: dropdown com 16 grupos.
- Ao salvar (from-ocr endpoint), section override eh persistido junto.

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

### E2E manual (founder)

1. Print real Hand2Note com BB defense + Blind war SB no mesmo popup.
2. "Probe River 37" sob BB defense → mapeia como `bb_probe_river_sb` (NAO `sb_probe_river`).
3. "SB Probe Turn 28" sob Blind war SB → mapeia como `sb_probe_turn`.

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
- [ ] Cache funcional (cache hit retorna section sem re-chamar LLM).
- [ ] Tests unit passando: novos casos de `fuzzyMatchStat` + `resolveSection`.
- [ ] Tests integration passando: payload mock com 3 secoes.
- [ ] HudOcrPreview mostra secao detectada + override.
- [ ] Zero regressao nos 545+ testes do Sprint Stats-V3.
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
