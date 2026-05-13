# ADR-160: `bulk_query_dimensions` — tool batching que generaliza `query_dimension`; lógica interna `runQueryDimension(input, ctx)` extraída e reusada por ambas; input array de specs (até 8); output array de resultados por-spec robusto a spec ruim; `requiresConfirmation: false`, `auditLevel: 'log'`, `gateByTier` = `query_dimension`

## Status
Aceito

## Data
2026-05-12

## Sprint
AI-1C (`Docs/specs/sprint-ai-1c.md`, RF-09)

## Decision owner
system-architect (founder validou o roadmap — Tema D: tool batching)

## Related
- Depende de: ADR-145 (estado canônico do registry de tools pós-AI-0A — `coachTools/index.ts` side-effect import + `registry.ts` `CoachTool` interface), ADR-147 (read tool service extraction pattern — extrair a lógica do handler para uma função reutilizável), ADR-021/ADR-019 (modelo Coach + caching — não afeta diretamente, mas `bulk_query_dimensions` reduz round-trips de tool use).
- Reusa: `server/coachTools/handlers/queryDimension.ts` (`queryDimensionInputSchema`, `STORAGE_METHOD_BY_GROUP`, `rowKey`/`rowValue`/`rowCount`, `buildResult` — extrair a lógica interna), `server/coachTools/registry.ts` (`CoachTool` interface), `server/coachTools/index.ts` (registração via `safeRegister`).
- Sucessor de: nada — primeira tool de batching. (Quando AI-2A adicionar tools de diagnóstico, considerar um `bulk_*` análogo se houver padrão de N chamadas seguidas.)

---

## 1. Contexto

O AI-0A religou `query_dimension` (`server/coachTools/handlers/queryDimension.ts` — input `{ dimension: enum, groupBy?: enum, filters?: { site?, category?, speed?, dateRange? }, period?: enum }`, `requiresConfirmation: false`, `auditLevel: 'log'`, `gateByTier: ['pro','premium','admin']`; roteia a dimensão pedida para os métodos de analytics em `storage.ts` que já filtram `grind_session_id IS NULL` — §6.1; sem dado → `{ rows: [], totalCount: 0, note }`; DB explode → loga + `handler_error`). O LLM, ao analisar performance, frequentemente quer várias dimensões (ROI por site **e** volume nos últimos 90d **e** ITM por speed) — hoje isso são N chamadas sequenciais de `query_dimension`, cada uma um round-trip de tool use (latência + tokens de tool_use/tool_result a mais). O roadmap (Tema D) prevê **tool batching**: uma tool que executa N specs de dimensão numa chamada só.

A pergunta: **a tool nova; o input/output; como reusar a lógica de `query_dimension` (DRY — não duplicar o roteamento por `groupBy` nem o mapeamento de campos); o gating; a robustez (uma spec ruim no array não pode derrubar as outras).**

### Restrições
- **Lesson #8 (length de enum em test = anti-pattern):** os testes que verificam o registry validam **presença individual** (`getTool('bulk_query_dimensions')` retorna a tool), nunca length absoluta de `coachTools`.
- **Lesson #9 (logar antes de fallback):** uma spec que faz o DB explodir → o erro daquele item é logado antes de virar `{ ok: false, error: 'handler_error' }`; as outras seguem.
- **DRY (ADR-147 / lesson #10):** a lógica interna de `query_dimension` (o corpo do `handler` sem o `safeParse` — o caller valida) vira `runQueryDimension(input, ctx)`; `query_dimension` e `bulk_query_dimensions` ambos a usam.
- **Gating consistente:** `bulk_query_dimensions` é um read tool (nenhum side-effect) — `requiresConfirmation: false`, `auditLevel: 'log'` (mesmo de `query_dimension` — logar a invocação é útil pra telemetria; `'log'` ≠ `'persist'`; o roadmap fala de "nível none" referindo-se a "não requer confirmação", não a um `auditLevel` que não existe), `gateByTier: ['pro','premium','admin']` (o registry filtra por `gateByTier` — free não vê a tool).

---

## 2. Decisões

### 2.1 Extração de `runQueryDimension`
Em `server/coachTools/handlers/queryDimension.ts`: extrair o corpo do `handler` atual (tudo **depois** do `safeParse` — o roteamento por `groupBy`, o mapeamento de campos, o try/catch que vira `handler_error`) para uma função exportada:
```ts
export async function runQueryDimension(input: QueryDimensionInput, ctx: { userId: string }): Promise<any> {
  const period = input.period;
  const filters = input.filters ?? {};
  try {
    if (input.groupBy) { /* STORAGE_METHOD_BY_GROUP[input.groupBy] -> rows -> buildResult */ }
    /* sem groupBy: getDashboardStats -> buildResult */
  } catch (err) {
    console.error("coach.tool.query_dimension.error", { userId: ctx.userId, dimension: input.dimension, groupBy: input.groupBy, err });
    return { ok: false, error: "handler_error", message: err?.message ?? "query_dimension failed" };
  }
}
```
`query_dimension`'s `handler` vira: `const parsed = queryDimensionInputSchema.safeParse(rawInput); if (!parsed.success) return { ok: false, error: 'validation_failed', details: parsed.error.issues }; return runQueryDimension(parsed.data, ctx);` — comportamento idêntico (sem regressão; testes do AI-0A verdes).

### 2.2 `server/coachTools/handlers/bulkQueryDimensions.ts`
- **Input schema (zod):** `z.object({ queries: z.array(z.object({ id: z.string().optional() }).merge(queryDimensionInputSchema)).min(1).max(8) })` — cada item é um `QueryDimensionInput` opcionalmente com `id` (string livre, para o LLM correlacionar resultado↔spec). `max(8)` (defesa contra abuso). Acima de 8 → o `safeParse` falha → `{ ok: false, error: 'validation_failed', details }` (não trunca — arrays absurdos são rejeitados, não silenciosamente cortados).
- **Output:** `{ results: Array<R> }` onde cada `R` é, na **mesma ordem** das `queries`: `{ id?: string, dimension, groupBy, rows, totalCount, period, note? }` (o shape de `query_dimension`) — ou `{ id?: string, ok: false, error: 'validation_failed', details }` (se aquela spec individual for inválida no zod por-item) — ou `{ id?: string, ok: false, error: 'handler_error', message }` (se aquela spec fizer o DB explodir; já vem de `runQueryDimension`). Uma spec ruim **não derruba** as outras.
- **Execução:** o handler valida o array via zod (`bulkQueryDimensionsInputSchema.safeParse`), depois para cada item: re-valida o item individual via `queryDimensionInputSchema.safeParse(item)` (defesa — o merge no array-schema já valida, mas re-validar por-item dá o `{ ok: false, error: 'validation_failed' }` granular), e se ok chama `await runQueryDimension(item, ctx)` num try/catch que captura **por-item** (`runQueryDimension` já tem o seu try/catch interno → `handler_error`; o try/catch externo é cinto + suspensório). **Sequencial** (não `Promise.all`) — analytics são reads no `tournaments`, mas executar em sequência evita pressão no DB se o LLM mandar 8 specs pesadas; a latência extra (8 queries sequenciais vs paralelas) é aceitável (já é melhor que 8 round-trips de tool use). Preserva a `id` do item no resultado.
- **`description` da tool:** "Roda VÁRIAS consultas de dimensão numa chamada só — passe um array de specs (até 8). Use isto em vez de chamar query_dimension N vezes seguidas. Cada item aceita os mesmos campos de query_dimension (dimension, groupBy, filters, period) + um id opcional pra você correlacionar o resultado." (incentiva o LLM a batchar.)
- **Metadados:** `requiresConfirmation: false`; `auditLevel: 'log'`; `gateByTier: ['pro','premium','admin']`; `inputSchema: bulkQueryDimensionsInputSchema`; `handler` como acima.

### 2.3 Registração
`server/coachTools/index.ts`: `import { bulkQueryDimensionsTool } from './handlers/bulkQueryDimensions';` + `safeRegister(bulkQueryDimensionsTool);` + adicionar à lista de tools no comentário-cabeçalho do módulo. Os testes do registry validam `getTool('bulk_query_dimensions')` (presença individual — lesson #8), nunca length de `coachTools`.

---

## 3. Consequências

### Positivas
- O LLM faz 1 chamada de tool em vez de N — menos round-trips, menos tokens de tool_use/tool_result, resposta mais rápida quando ele precisa de várias dimensões (caso comum em análise de performance).
- DRY: `query_dimension` e `bulk_query_dimensions` compartilham `runQueryDimension` — uma mudança no roteamento por `groupBy` ou no mapeamento de campos vale para os dois.
- Robusto: uma spec ruim no array vira `{ ok: false, error }` por-item — o LLM vê o que falhou e segue com o resto.
- Prepara o padrão para outras tools batcháveis (AI-2A).

### Negativas / trade-offs
- Execução sequencial → 8 specs pesadas = 8 queries em sequência (latência somada). Aceito (ainda melhor que 8 round-trips; e o LLM raramente manda 8 specs pesadas de uma vez). Se virar gargalo, trocar para `Promise.all` com um limite de concorrência é uma mudança local.
- `max(8)` é um número arbitrário — calibrável; 8 cobre os casos reais sem permitir abuso.

### Neutras
- `gateByTier` igual ao `query_dimension` — free não vê a tool (o registry filtra).
- `auditLevel: 'log'` (não `'persist'`) — loga a invocação para telemetria, não persiste nada.

## Confiança
Alta — generalização direta de uma tool existente; o registry pattern e o gating já estão consolidados; a robustez por-item é o ponto de atenção e está coberta.
