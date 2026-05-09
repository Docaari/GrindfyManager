# ADR-142 — Coach tool unificada `read_theme_with_linked_stats_and_spots`

- Status: Aprovado
- Data: 2026-05-08
- Sprint: stats-themes-linking-1
- Decision owner: system-architect
- Related: spec `Docs/specs/stats-themes-linking-1.md` §RF-03; ADR-068 (Studies-Reform Coach tools incluindo `read_theme_with_linked_spots`); ADR-141 (JSONB + GIN para reverse lookup); ADR-023 (tool registry pattern); ADR-024 (tool result wrapping); ADR-058/064 (catalog stats + `hudLayouts.fieldsJson`); ADR-062 (`readUserHudStatsToolV2` — não confundir, escopo diferente)
- Diagramas: `Docs/architecture/diagrams/stats-themes-linking-edit-flow.mermaid` (consumo indireto via stats invalidação), payload no §2.2 deste ADR

---

## 1. Contexto

A Coach tool `read_theme_with_linked_spots` existe desde Sprint Studies-Reform (ADR-067/068, arquivo `server/coachTools/readThemeWithLinkedSpots.ts`). Hoje ela retorna apenas o **tema + abas + spots vinculados (max 10) + summary** — sem nenhuma referência a **stats HUD vinculadas ao tema** (campo `studyThemes.linkedStats`). 

Sprint **stats-themes-linking-1** RF-03 estende o vínculo: agora a tool deve responder também **"como esse tema se conecta com o HUD do user — quais stats estão linkadas, qual o valor atual delas, qual a evolução nos últimos 30 dias?"**. Essa informação entra no contexto do Coach AI para respostas data-driven do tipo: *"voce esta com C-bet OOP=58%, alvo 38-45%, leak claro nessa stat — vamos focar no tema 'C-bet OOP em 3-bet pots'."*

Surgem 3 caminhos arquiteturais:

1. Estender a tool atual (rename + alias deprecation).
2. Criar uma tool nova (`read_theme_stats`) e manter `read_theme_with_linked_spots` separada.
3. Acrescentar uma "secção stats" como parametro opcional `include_stats: true` na tool atual, sem renomear.

A escolha cascateia em prompt cache da Anthropic (lesson #10 — DRY de prompts), shape dos consumidores futuros (Coach planos semanais, painéis pos-finalize), e overhead de latência por chamada.

### Estado atual confirmado em código

- `server/coachTools/readThemeWithLinkedSpots.ts` — handler retorna `{ theme, tabs, linked_spots, summary }`. Tool descriptor exporta `name: 'read_theme_with_linked_spots'`, gating `pro/premium/admin`, audit `log`, sem confirmation.
- `server/coachTools/index.ts` — registra a tool via `safeRegister(readThemeWithLinkedSpotsTool)` com flag `core: true`.
- `server/coachTools/registry.ts` — `registerTool(tool, { core })` lança `tool_already_registered` em duplicata. `_resetRegistry` re-registra core para suite de testes.
- **Não existe arquivo de prompt template separado** para essa tool — a `description` que o LLM vê é hard-coded inline no descriptor (linhas 141-144 de `readThemeWithLinkedSpots.ts`). Outras tools mais novas (`coachStudyPlan`, `coachSessionInsights`) usam `*.prompts.ts` dedicado seguindo lesson #10. Esta tool ainda não migrou.
- `hud_stat_snapshots` (`shared/schema.ts:3771`): cada row tem `userId + layoutId + capturedAt + values jsonb (record stat_id → number|null)`. **Não há coluna `value` por stat — todos os stats vivem em `values` jsonb num único snapshot**. Isso é importante para a query de `currentValue` e `sparkline30d` (ver §2.3).
- `hudLayouts.fieldsJson` jsonb (`shared/schema.ts:3714`) hospeda custom stats e overrides (`HudLayoutFieldEntry`). Stat custom = `id` com prefixo `custom_*` + `isCustom: true`.
- `STAT_INDEX_BY_ID` (`shared/hud-stat-catalog.ts:372`) Map estatico de 217 stats catalog.

### Forças em jogo

| Força | Estender (rename + alias) | Tool nova separada | Param opcional `include_stats` |
|---|---|---|---|
| DRY de prompt (lesson #10) | Único prompt unificado | 2 prompts paralelos = divergencia | Único prompt + condicional |
| Cache hit Anthropic | Hit estavel (1 description) | 2 descriptions = 2 cache keys | Hit estavel mas description maior |
| Cognitive load do Claude | "1 tool, 1 fonte de verdade do tema" | Claude tem que escolher qual chamar | Claude tem que escolher param |
| Migration de clients antigos | Alias por 1 sprint = transparente | Atualização explicita necessaria | Atualização explicita necessaria |
| Granularidade (caller que só quer spots) | Paga overhead de stats | Granular | Granular via flag |
| Latência incremental | +1 query batch (`hud_stat_snapshots`) | 0 quando não chama | 0 quando flag false |
| Risco de regressão | Baixo (adita dados) | Médio (novo handler) | Baixo |

---

## 2. Decisão

**Estender a tool atual: rename para `read_theme_with_linked_stats_and_spots`. Manter alias `read_theme_with_linked_spots` por 1 sprint com warning log.** Payload aumentado com `stats[]` + `summary.stats_*`.

### 2.1 Renomeação + alias

No `server/coachTools/readThemeWithLinkedSpots.ts` (renomear arquivo para `readThemeWithLinkedStatsAndSpots.ts`):

```ts
export const readThemeWithLinkedStatsAndSpotsTool = {
  name: 'read_theme_with_linked_stats_and_spots' as const,
  description: '...', // ver §2.5
  inputSchema, // mesmo XOR theme_id | theme_name (ADR-068)
  requiresConfirmation: false,
  auditLevel: 'log' as const,
  gateByTier: ['pro', 'premium', 'admin'] as const,
  async handler(input, ctx) { /* ... */ },
};

// Alias deprecated — mantido por 1 sprint (até stats-themes-linking-2).
// Emite console.warn cada vez que é chamado para sinalizar migration.
export const readThemeWithLinkedSpotsToolAlias = {
  ...readThemeWithLinkedStatsAndSpotsTool,
  name: 'read_theme_with_linked_spots' as const,
  description: '[Deprecated alias] Use read_theme_with_linked_stats_and_spots. ' +
               'Mesma logica + resposta. Sera removido em stats-themes-linking-2.',
  async handler(input, ctx) {
    console.warn(
      '[deprecation] read_theme_with_linked_spots — ' +
      'use read_theme_with_linked_stats_and_spots',
      { userPlatformId: ctx?.userPlatformId ?? ctx?.userId, messageId: ctx?.messageId },
    );
    return readThemeWithLinkedStatsAndSpotsTool.handler(input, ctx);
  },
};
```

`server/coachTools/index.ts` registra ambos como `core`:

```ts
safeRegister(readThemeWithLinkedStatsAndSpotsTool as any);
safeRegister(readThemeWithLinkedSpotsToolAlias as any);
```

**Por que registrar o alias e não apenas mapear no `getTool`:** o `exportToolsForAnthropic(tier)` devolve o catalogo cru do registry para a Anthropic API. Se queremos o alias visivel para tier free/pro/premium/admin transitorio (clients que ainda chamam pelo nome antigo), ele precisa estar no registry. Após a sprint, removemos o `safeRegister` do alias e o nome some do tool catalog enviado ao LLM.

### 2.2 Payload (extensão)

Resposta nova:

```ts
{
  theme: { id, name, color, emoji, progress, lastVisitedAt },     // existente
  tabs: [...],                                                     // existente, max 5
  linked_spots: [...],                                             // existente, max 10
  // NOVO RF-03.2:
  stats: [
    {
      statId: string,           // ex: 'cbet_oop_3bet'
      label: string,            // pt-BR de STAT_INDEX_BY_ID OU fieldsJson[i].label
      groupId: HudGroupId,      // ex: 'postflop_aggression'
      groupLabel: string,       // pt-BR de HUD_GROUP_LABELS
      currentValue: number | null,  // mais recente; null se nenhum snapshot
      targetMin: number,
      targetMax: number,
      direction: StatDirection, // 'higher_better' | 'lower_better' | 'context' | 'neutral'
      unit: StatUnit,           // 'pct' | 'bb' | 'count'
      sparkline30d: number[],   // ordem cronologica ASC, max 30 elementos
      isCustom: boolean,        // true se vier de hudLayouts.fieldsJson
    }
  ],
  summary: {
    spots_count: number,        // existente
    tabs_count: number,         // existente
    last_activity_at: ...,      // existente
    // NOVO:
    stats_count: number,        // length de stats[]
    stats_in_range: number,     // count com currentValue dentro de [min,max] (direction-aware)
    stats_alarm: number,        // count com currentValue fora do range (direction-aware)
  }
}
```

### 2.3 Fonte de dados — atenção crítica ao shape de `hud_stat_snapshots`

A spec linha 242-243 menciona `SELECT value FROM hud_stat_snapshots WHERE ... AND stat_id=$X`. **Esse shape é incorreto**. Confirmação no schema real:

```ts
// shared/schema.ts:3771 — hud_stat_snapshots
{
  id, userId, layoutId, capturedAt,
  values: jsonb(Record<string, number | null>),  // <— TODOS os stats num jsonb único
  // ... source, sampleSize, sessionId, notes, captureMethod, sourceImageKey, ocrConfidence...
}
```

Não existe coluna `stat_id` nem `value`. Cada snapshot é uma "foto" do layout inteiro com o jsonb `values` keyed por stat_id. Implementer **deve** extrair via jsonb operator:

```sql
-- currentValue: ultimo snapshot do user que tenha esse statId em values
SELECT (values ->> $statId)::numeric AS value
FROM hud_stat_snapshots
WHERE user_id = $userId
  AND values ? $statId
ORDER BY captured_at DESC
LIMIT 1;

-- sparkline30d: extrair value por stat_id em janela 30d, batched
SELECT
  captured_at,
  (values ->> $statId)::numeric AS value
FROM hud_stat_snapshots
WHERE user_id = $userId
  AND values ? $statId
  AND captured_at >= now() - INTERVAL '30 days'
ORDER BY captured_at ASC;
```

Para evitar N+1 quando o tema tem 5+ stats linkadas, fazer **uma query batch** que retorne todas as `values` keys de uma vez:

```sql
SELECT
  captured_at,
  values
FROM hud_stat_snapshots
WHERE user_id = $userId
  AND captured_at >= now() - INTERVAL '30 days'
  AND values ?| ARRAY[$statIds]::text[]   -- jsonb existence: any of the keys
ORDER BY captured_at ASC;
```

Em código, iterar e indexar por `statId`. Filtra apenas snapshots cujo `values` contém ao menos uma stat de interesse (via `?|`). 30 dias de snapshots com 1-2/dia = ~60 rows max — leve.

**Nota técnica:** o índice composto existente `idx_hud_snapshots_user_layout(user_id, layout_id, captured_at)` cobre a query parcial. O operator `?|` não é coberto sem GIN, mas o filtro por `user_id + captured_at` reduz o conjunto suficientemente — não é bottleneck no MVP. Se virar, criar GIN em `hud_stat_snapshots(values)` em sprint futuro.

### 2.4 Empty states graceful (RF-03.4)

| Situação | Comportamento |
|---|---|
| `theme.linkedStats` é `null` ou `[]` | `stats: []`, `summary.stats_count = 0`. Nenhum erro. |
| `statId` é `custom_*` mas `hudLayouts.fieldsJson[i]` foi deletado | Omitir do `stats[]`. `console.warn('[read_theme] custom stat orfa', { statId, themeId })`. NÃO retornar 500. |
| `statId` catalog mas `STAT_INDEX_BY_ID.get` retorna `undefined` (improvavel, defensivo) | Omitir + warn. Mesmo tratamento. |
| User sem nenhum snapshot | `currentValue: null`, `sparkline30d: []`. UI renderiza placeholder cinza (RF-05.3). |

### 2.5 Description do tool (DRY — lesson #10)

Criar **arquivo dedicado** `server/coachTools/readThemeWithLinkedStatsAndSpots.prompts.ts` (matching pattern de `coachStudyPlan.prompts.ts` + `coachSessionInsights.prompts.ts`):

```ts
// server/coachTools/readThemeWithLinkedStatsAndSpots.prompts.ts
// Sprint stats-themes-linking-1 (ADR-142). Lesson #10 — DRY de prompts.

export const READ_THEME_TOOL_DESCRIPTION = `
Le um tema de estudo do usuario com seu contexto completo:

- **theme**: dados base (id, nome, cor, emoji, progresso, ultima visita).
- **tabs**: ate 5 abas com preview de 200 chars do conteudo.
- **linked_spots**: ate 10 spots vinculados (id, conclusao, tipo, screenshot URL).
- **stats**: stats HUD linkadas ao tema com valores correntes do usuario,
  alvo (targetMin/targetMax), direcao (higher/lower/context/neutral),
  e sparkline dos ultimos 30 dias. Inclui catalog stats e custom user stats.
- **summary**: contadores agregados (spots, tabs, stats no alvo, stats em alarme,
  ultima atividade).

Use stats para diagnosticar leaks especificos com NUMEROS no contexto:
"voce esta com C-bet OOP=58%, alvo 38-45%, leak claro nessa stat".
Use linked_spots para citar spots concretos.
Use tabs para citar conteudo concreto que o user ja escreveu.

Cross-user isolation: tema deve pertencer ao usuario autenticado (403 caso contrario).
`.trim();
```

Importar essa constante no `readThemeWithLinkedStatsAndSpots.ts` e referenciar no `description` do tool descriptor. Mesmo template é referenciado pelo alias deprecated. Se quiserem refinar, **muda em um lugar só**.

### 2.6 Backwards compat & input schema

O input schema permanece **identico** ao da tool legada (XOR `theme_id` | `theme_name`):

```ts
const inputSchema = z.object({
  theme_id: z.string().min(1).optional(),
  theme_name: z.string().min(1).optional(),
}).refine(
  (v) => Boolean(v.theme_id) !== Boolean(v.theme_name),
  { message: 'Forneca theme_id OU theme_name (XOR).' }
);
```

Clients antigos que chamam `read_theme_with_linked_spots` com input válido continuam funcionando — o handler é compartilhado. Apenas recebem o payload novo (com `stats[]` adicional). **Adição não é breaking** em consumers que ignoram campos extras (todos os atuais).

---

## 3. Opções consideradas

### Opção A (escolhida): Estender + rename + alias 1 sprint

- **Prós:**
  - Fonte de verdade unica do tema no contexto do Coach.
  - DRY de prompt (lesson #10) — divergência futura impossível.
  - Cache Anthropic estavel (1 description).
  - Migration de clients transparente (alias + warn log).
  - Latência adicional +30ms p95 (1 query batch jsonb) — aceitavel.
- **Contras:**
  - Caller que só quer spots (poucos no Coach, basicamente o painel pos-finalize) paga overhead da query stats. Mitigado por tamanho médio do payload (~5-15 stats com sparkline 30d = ~3KB JSON), aceitavel.

### Opção B: Tool nova `read_theme_stats` + manter `read_theme_with_linked_spots`

- **Prós:**
  - Granularidade pura — caller pede o que precisa.
  - Tool legada intocada (zero risco de regressão em clients ainda em produção que chamam ela).
- **Contras:**
  - **2 prompts paralelos** (lesson #10 violada) — divergência silenciosa quase certa.
  - Claude tem que decidir qual chamar primeiro; complica o fluxo de raciocinio (provavelmente chama as duas, dobrando tool turns).
  - 2 cache keys Anthropic; cada nova versao reseta as duas.
  - Para o caso "tema completo", obriga 2 tool calls = 2 turns LLM = latência maior que 1 turn com tool unica.

### Opção C: Param opcional `include_stats: boolean` na tool atual

- **Prós:** flexibilidade caller.
- **Contras:**
  - Description maior (precisa documentar duas modalidades). Para LLM, mais tokens em cada cache hit.
  - Default? Se `true`, mesmo problema de B (caller paga overhead). Se `false`, Coach raramente liga o flag.
  - "Decisão sobre flag" vira mais um galho condicional — Claude precisa raciocinar.
  - Não resolve a renomeação semantica do problema.

### Opção D: Compor no LLM ("tool 1 + tool 2 chamadas em paralelo")

Manter `read_theme_with_linked_spots` + criar `read_user_hud_stats_for_theme(theme_id)` (variação de `readUserHudStatsToolV2`).

- **Prós:** separação de responsabilidades clara.
- **Contras:**
  - 2 tool calls vs 1 = dobra turns.
  - Claude precisa correlacionar manualmente os dados depois (tema com X stats, lookup payload Y).
  - Lessons #10 violada novamente.

---

## 4. Consequências

### Positivas

- **Single source of truth** do "tema completo" no Coach. Prompt cache estavel.
- **Migration suave**: clients antigos viram alias por 1 sprint. Warning logs sinalizam quando todos os caminhos foram migrados.
- **Coach data-driven**: respostas com numeros reais do user ("voce esta em 58%, alvo 38-45%") melhoram qualidade percebida.
- **Reuso da query batch de snapshots** poderá ser extraido para `getStatsSummaryForTheme(userId, statIds)` e consumido tambem por RF-05 (Stats foco do tema detalhe) — uma query, dois consumers.
- **Path da tool `coach-tools.md` documentado** — adiciona entry no catalogo.

### Negativas

- **Latência incremental ~30ms p95** por chamada (1 query batch `hud_stat_snapshots`). Aceitavel (target Coach geral é 2-5s LLM-bound).
- **Payload JSON cresce**: ~3KB para 10 stats com sparkline. Tier free não chama tools (gateado), e pro+ tem internet decente — irrelevante.
- **Stats orfãs (custom field deletado)**: precisa graceful skip (RF-03.4) — implementer deve testar explicitamente. Lesson #20 (graceful degradation em features secundárias).
- **Alias por apenas 1 sprint**: se algum sprint paralelo (Coach-Plano-Semanal-3, Spot-Anki-Reentry-4) tiver consumer não migrado a tempo, pode quebrar. Mitigação: log de deprecation grep-able em prod para sinalizar antes do remove.

### Neutras

- **Não troca o input schema**: clients existentes não precisam mudar payload de chamada. Apenas o nome muda (com alias).
- **Coach tool catalog cresce em 1 nome temporariamente** (`read_theme_with_linked_stats_and_spots` + alias). Após sprint, retorna a 1.
- **Tests de regressão**: suite que esperava `read_theme_with_linked_spots` no `listRegisteredTools()` continua passando enquanto alias existe. Após remoção, atualiza expectativa.

---

## 5. Confiança

**Alta.**

- Pattern de "extender tool com payload retroatif compativel" já tem precedente (ADR-140 estendeu `coach_session_insights.spotsToReview[]` com 3 campos opcionais sem breaking — mesma família de decisão).
- Reversibilidade: se o aumento de payload causar problema (improvavel), basta filtrar `stats[]` no handler retornando `[]` — alias e nome novo continuam funcionando.
- Risco residual: alguma pipeline interna do Coach que **valide** o shape estrito do payload (ex: Zod schema strict no caller). Mitigação: revisar consumers antes do merge — `Grep` por `read_theme_with_linked_spots` retorna apenas `coachTools/index.ts` + `readThemeWithLinkedSpots.ts` (no momento), o que indica zero consumer externo "frozen".

---

## 6. Próximos passos

- **Test-writer** cria testes:
  - Tool name novo + alias coexistem no registry.
  - Payload `stats[]` com tema com 5 stats linkadas (3 catalog + 2 custom).
  - `currentValue: null` sem snapshot.
  - `sparkline30d` ordem ASC, max 30.
  - Custom stat orfa (deletada do HUD) = omitida + warn (sem 500).
  - `summary.stats_in_range` direction-aware (lower_better invertido).
  - Alias chamado com input legacy retorna mesmo payload + emite warning (mock `console.warn`).
  - Cross-user 403 preservado.
- **Implementer**:
  - Renomear arquivo `readThemeWithLinkedSpots.ts` → `readThemeWithLinkedStatsAndSpots.ts`.
  - Criar `readThemeWithLinkedStatsAndSpots.prompts.ts`.
  - Estender handler com query batch de `hud_stat_snapshots` + assembling `stats[]` + computar `summary.stats_in_range/_alarm` direction-aware.
  - Atualizar `coachTools/index.ts` registrando alias `as core`.
  - Atualizar `Docs/api/coach-tools.md` com entry detalhado da tool nova.
- **Reviewer**:
  - Grep `read_theme_with_linked_spots` em todo `server/` para confirmar zero consumer frozen além do alias.
  - Verificar lesson #10 (description em arquivo prompts.ts dedicado, não inline no descriptor).
  - Verificar gracefulness em custom stat orfa (lesson #19/20).
  - Confirmar log de deprecation imprime `userPlatformId` para grep em produção.

---

## 7. Anexos

- Spec: `Docs/specs/stats-themes-linking-1.md` §RF-03
- Tool legada origem: ADR-068 (Studies-Reform RF-07 D6)
- Schema `hud_stat_snapshots`: `shared/schema.ts:3771`
- Catalog estatico: `shared/hud-stat-catalog.ts:372` (`STAT_INDEX_BY_ID`)
- Lesson #10 — DRY de prompts (extrair em arquivo unico para evitar divergencia silenciosa quebra cache Anthropic).
- Lesson #19 — graceful degradation com fallback silencioso para features secundarias.
- Lesson #20 — wirar hooks/queries em containers, não assumir refs diretos em players.
- Pattern de prompt modular: `server/coachTools/studies/coachStudyPlan.prompts.ts`, `server/coachTools/grind-live/coachSessionInsights.prompts.ts`.
- ADR-141 — JSONB + GIN para reverse lookup (cobre o estado de `linkedStats` consumido por esta tool).
- ADR-140 — exemplo análogo de extensão de payload Coach com campos opcionais (precedente).
