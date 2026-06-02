# ADR-231: getStatsLeaks — síntese comportamental de 3 sinais (Fase C #3)

## Status
Aceito

## Data
2026-06-01

## Contexto

`storage.getStatsLeaks(userId, top)` (storage.ts:9802) é hoje um stub `return []`.
Cinco consumidores já o chamam e degradam graciosamente quando recebem `[]` — então
**todos** os fluxos de "estuda o que você erra" (C4 do curso) hoje recebem `[]`:

| Consumer | Arquivo | Chamada |
|---|---|---|
| auto-suggest de foco | `server/routes/focus-stats-auto-suggest.ts:74` | `(storage as any).getStatsLeaks(userId, 3)` |
| recomendações Biblioteca | `server/services/bibliotecaRecommendationsService.ts:119` | `(storage as any).getStatsLeaks(userId, 3)` |
| recomendações de estudo | `server/services/studyRecommendationsService.ts:180` | `storage.getStatsLeaks(userId, 5)` (direto, `unwrapSettled<any>` + `mapLeak`) |
| planning EST-6 | `server/coach/planning/weeklyPlanningOrchestrator.ts:353` | `storage.getStatsLeaks?.(userId, TOP_LEAKS)` |
| plano semanal estudo | `server/services/studyWeeklyPlanService.ts:197` | `(storage as any).getStatsLeaks(userId, 3)` |

**Achado-âncora confirmado em origin/main:** as tabelas que o TODO original citava
(`hud_stats_snapshots`, `stats_analyzer_history`) **NÃO existem**. O Grindfy não
persiste o valor jogado de uma stat (não há "VPIP=24%" em lugar nenhum). Logo, leak
detection **não pode** ser delta "valor jogado vs benchmark". Tem que ser **síntese de
sinais comportamentais** já capturados:

- **S1** — `coach_leak_focus` (status `active`): leak explícito curado pelo Coach.
- **S2** — `study_sessions_v2` mode `stat_analysis` (não-deletadas, recentes): erros que
  o próprio jogador registrou por stat.
- **S3** — `user_focus_stats` (mês corrente): stats que o jogador decidiu trabalhar.

Catálogo estático `shared/hud-stat-catalog.ts` (`getStatById` → `{ label, targetMin,
targetMax, ... }`) enriquece `statName` + `benchmark`.

A spec (`Docs/specs/sprint-fase-c-stats-leaks-2026-06-01.md`) travou o algoritmo (3
decisões 1-8 lá), e deferiu 8 micro-decisões (D-A1..D-A8) a este ADR.

### Colunas reais confirmadas no schema (re-verificadas para este ADR)

```
coach_leak_focus (schema.ts:4921)
  userId, leakCode varchar(64), description text NOT NULL,
  targetMonth varchar(7) NOT NULL, baselineStatKey varchar(128) NOT NULL,
  baselineValue decimal NOT NULL, status varchar(16) default 'active'
  idx_coach_leak_focus_user_month (userId, targetMonth)

study_sessions_v2 (schema.ts:2469) — mode='stat_analysis'
  statId varchar(64) nullable, statAnalysisEntries jsonb (StatAnalysisEntry[], cap 10),
  startedAt timestamptz nullable, deletedAt timestamptz nullable
  idx_ssv2_stat_analysis_theme_stat (userId, themeId, statId)
    WHERE mode='stat_analysis' AND deleted_at IS NULL

user_focus_stats (schema.ts:2614)
  statId varchar(64) NOT NULL, month varchar(7) NOT NULL
  idx_user_focus_stats_user_month (userId, month)
```

⚠️ Nota sobre `startedAt`: é **nullable** em `study_sessions_v2`. A janela S2
(`startedAt >= now-60d`) deve tratar `startedAt IS NULL` — ver D-A2.

## Decisão

Implementar `getStatsLeaks` como **síntese comportamental** em duas camadas:

1. **Helper PURO** `server/coach/leaks/detectLeaks.ts` — recebe os 3 conjuntos de sinais
   já lidos do DB (arrays simples) + `top`, consolida por statId, computa `severity`,
   ordena e retorna `StatLeak[]`. **Não toca DB, não importa drizzle, não importa
   `@shared/schema`** (resolve lesson #36 — ver D-A8). Importa apenas `getStatById` de
   `shared/hud-stat-catalog.ts` (módulo puro, sem drizzle).
2. **`storage.getStatsLeaks(userId, top)`** — orquestra: 3 queries (S1/S2/S3) com a
   janela de RF-04, cada uma em try/catch (lesson #9: loga antes de degradar a fonte
   para `[]`), monta os inputs crus e chama o helper.

Constantes de peso/janela ficam em `server/coach/leaks/constants.ts` (irmão), exportadas
para o teste assertar sem números mágicos.

A fórmula de severity é a da spec RF-03 (não alterada):

```
severity = scoreS1 + scoreS2 + scoreS3
scoreS1 = WEIGHT_COACH_LEAK (10) por leak active mapeado ao statId
scoreS2 = min( WEIGHT_STAT_ANALYSIS_SESSION(3)*sessõesDistintas
             + WEIGHT_STAT_ANALYSIS_ENTRY(1)*min(totalEntries,10), CAP_STAT_ANALYSIS(30) )
scoreS3 = WEIGHT_FOCUS_MARK (2) por statId marcado no mês corrente
```

Itens com `severity === 0` nunca aparecem. Ordenação: `severity` desc, desempate por
chave (`statId`/`leak:<code>`) ascendente para determinismo.

---

## Decisões deferidas resolvidas (D-A1..D-A8)

### D-A1 — Corte adicional por `targetMonth` em S1?
**Decisão: NÃO. `status='active'` é o único gate de S1.**
`coach_leak_focus.status` é a fonte de verdade do ciclo de vida do leak; o Coach marca
`resolved` quando o jogador supera o leak (UNIQUE `(user, leakCode, targetMonth)`).
`targetMonth` é o mês-alvo do plano de estudo, não a validade do leak. Um leak ativo de
2 meses atrás continua sendo um leak não-resolvido — **não deve sumir só por virar o
mês**, senão o jogador "ganha" um leak resolvido sem ter resolvido nada. `targetMonth`
fica como dado informativo (não filtra). Quem fecha o leak é o Coach via `status`.

### D-A2 — Valor da janela S2
**Decisão: `STAT_ANALYSIS_WINDOW_DAYS = 60` (constante nomeada).**
Confirmado o valor proposto. 60 dias cobre ~2 ciclos mensais de estudo dirigido, o
suficiente para detectar recorrência ("o jogador voltou a errar a mesma stat") sem
arrastar erros antigos já trabalhados. A query usa `startedAt >= now - 60d`.
**Tratamento de `startedAt IS NULL`** (coluna nullable): a query S2 inclui a condição
`(started_at IS NULL OR started_at >= cutoff)` — uma sessão `stat_analysis` registrada
sem `startedAt` é um registro post-hoc legítimo (lesson da app: `registeredAt` é o
fallback temporal). Para não derrubar registros válidos por causa de coluna nullable,
**NULL conta** (não é excluída pela janela). Constante futura-tunável.

### D-A3 — Estreitar `Promise<any[]>` → `Promise<StatLeak[]>`?
**Decisão: SIM, estreitar. Tipo canônico em `server/coach/leaks/types.ts` (server-only).**
- É **seguro**: 4 dos 5 consumers usam `(storage as any).getStatsLeaks` / `storage.getStatsLeaks?.`
  → não sofrem checagem de tipo. O 5º (`studyRecommendationsService.ts:180`) usa a chamada
  direta mas embrulha em `unwrapSettled<any>(...)` + `mapLeak(any)` → consome como `any`.
  Narrowing do **retorno** (de `any[]` para um supertipo concreto) é covariante e
  compatível: todo `StatLeak[]` é atribuível a `any[]`; nenhum consumer escreve no array.
- **Onde declarar:** `server/coach/leaks/types.ts` (server-only). Motivos:
  1. O tipo não é compartilhado com o client (os consumers são todos server).
  2. Mantém o helper puro **sem importar `@shared/schema`** (D-A8) — `types.ts` só tem
     `type`, é apagado em runtime.
  3. Evita colisão com a tree compartilhada do MDA-1 (que mexe em `shared/`).
- A interface da `IStorage` (storage.ts:1037) e a impl (storage.ts:9802) passam a
  declarar `Promise<StatLeak[]>`, importando o tipo de `server/coach/leaks/types.ts`.
  Como `storage.ts` já toca drizzle, importar um `type` puro daqui não cria ciclo nem
  reintroduz lesson #36 (o helper é que tem a restrição, não o storage).

`StatLeak` (canônico):
```ts
export interface StatLeak {
  statId: string;            // catálogo id | custom_* | baselineStatKey cru
  statName: string;          // label catálogo | description | "Stat personalizada"
  value: number | null;      // SEMPRE null (não há HUD number jogado)
  benchmark: number | null;  // (targetMin+targetMax)/2 do catálogo, ou null
  delta: number | null;      // SEMPRE null
  severity: number;          // score sintético > 0
  id?: string;               // = statId (studyRecommendationsService lê id?)
  type?: string;             // = 'stat_leak'
  description?: string;      // = statName/description
}
```

### D-A4 — Semântica de `top=0` e `top` negativo
**Decisão: `top <= 0` → `[]`. Valor não-inteiro → `Math.floor`. `top` ausente/NaN → trata como 0 → `[]`.**
- `top` é "quantos leaks retornar". `0` e negativos significam "nenhum" → `[]`.
  Justificativa: os 5 consumers passam sempre `3` ou `5` (constantes); nenhum passa `0`
  com intenção de "todos". A semântica conservadora ("0 = nenhum") é a leitura natural de
  `slice(0, top)` e não surpreende nenhum consumer real.
- Implementação no helper: `const n = Number.isFinite(top) ? Math.floor(top) : 0; if (n <= 0) return [];`
  antes de qualquer trabalho (early return barato). Depois `ordenados.slice(0, n)`.

### D-A5 — `custom_*` com regex inválida / path traversal
**Decisão: EXCLUIR (igual a `study-sessions.ts:130`).**
A regex `CUSTOM_STAT_RE = /^custom_[A-Za-z0-9_-]{1,48}$/` é a SSoT de shape. Um statId
`custom_../etc` (path traversal) ou qualquer `custom_*` que falha a regex é **descartado
silenciosamente** (não vira leak). Justificativa:
- Paridade com o irmão `stat_analysis` (study-sessions valida no insert; mas registros
  legados ou corrompidos podem existir — o detector não confia, revalida na leitura).
- `statId` nunca toca o filesystem aqui (é só uma chave de consolidação e um label), mas
  excluir lixo evita poluir o ranking com chaves sem sentido.
- statId que **não** começa com `custom_` e **não** casa no catálogo só é válido como
  fonte S1 (`baselineStatKey` livre → vira `leak:<code>`). Para S2/S3, um statId que não é
  catálogo-válido nem `custom_*`-válido é **excluído** (não há como rotulá-lo de forma útil).
- **Regra de validação do helper** (espelha `isValidStatId` de study-sessions.ts, mas
  reimplementada localmente no helper para não importar a rota — ver "Reuso" abaixo):
  ```
  isValidStatId(statId):
    if !string || empty            -> false
    if startsWith("custom_")       -> CUSTOM_STAT_RE.test(statId)
    else                           -> !!getStatById(statId)   // catálogo
  ```
  Aplicada a S2/S3. Para S1, ver D-A7.

### D-A6 — SSoT de "mês corrente YYYY-MM"
**Achado: NÃO existe SSoT compartilhado.** A função `currentMonthUtc(date=new Date())`
está **duplicada** em ≥4 arquivos (`focus-stats-auto-suggest.ts:31`, `focus-stats.ts:30`,
`home-focus-stats.ts:20`, `studyWeeklyPlanService.ts:87`), todas idênticas:
```ts
function currentMonthUtc(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
```
`ymdUtc` é dia (YYYY-MM-DD), não serve. `weekKeys.ts` é semana.
**Decisão: o `storage` (camada de orquestração) deriva o mês corrente com a MESMA fórmula
inline `getUTCFullYear()/getUTCMonth()+1` e passa o string `currentMonth` ao helper como
input.** O helper PURO recebe `currentMonth` pronto — **não** chama `new Date()` (mantém
pureza/determinismo para teste; o teste injeta `currentMonth` fixo). Isso evita criar um
novo util compartilhado nesta fatia (a tree é compartilhada com MDA-1; criar
`shared/monthKey.ts` agora arriscaria colisão de merge). **Follow-up documentado:** extrair
`currentMonthUtc` para um util compartilhado (`shared/monthKey.ts`) e migrar os 4+
call-sites — fora do escopo desta sprint, registrado como dívida grepável.

### D-A7 — Match `baselineStatKey` → catálogo: exato vs normalizado
**Decisão: match EXATO por `getStatById(baselineStatKey)`, com UM passo de normalização
defensiva barato: `trim()`.**
- Os ids do catálogo são lowercase com `_` (`vpip`, `threebet_pf`, `bb_fold_vs_steal`).
  `baselineStatKey` é `varchar(128)` livre, preenchido pela tool `log_leak_focus` do Coach.
- **Tentativa 1:** `getStatById(key)` exato.
- **Tentativa 2 (defensiva):** `getStatById(key.trim().toLowerCase())` — cobre o caso comum
  do Coach mandar `"VPIP"` ou `" vpip "`. Lowercase é seguro porque **todos** os ids do
  catálogo já são lowercase (confirmado: 217 entries, todas lowercase) → não há colisão.
- Se nenhuma casa → leak próprio `leak:<leakCode>` (não funde). `statId = baselineStatKey`
  cru (consumer tem algo), `statName = description` truncado em 80 chars (ou `leakCode` se
  description vazia — mas `description` é NOT NULL no schema), `benchmark = null`.
- **NÃO** tenta normalização agressiva (remover espaços internos, fuzzy match): risco de
  falso-positivo de consolidação (`"3bet defesa BB vs CO"` não deve casar com `threebet_pf`).

### D-A8 — Isolamento do helper puro (lesson #36) + estratégia de teste das 2 camadas
**Confirmado o isolamento.** O helper `detectLeaks.ts`:
- **NÃO** importa `@shared/schema`, **NÃO** importa `drizzle-orm`, **NÃO** importa
  `server/storage` nem `server/db`.
- Importa apenas `getStatById` de `shared/hud-stat-catalog.ts` (módulo puro: só dados +
  `Map`, sem drizzle/relations) e os tipos locais de `./types` + constantes de `./constants`.
- Reimplementa `CUSTOM_STAT_RE` + `isValidStatId` localmente (cópia de 4 linhas de
  study-sessions.ts) — **não** importa a rota (importar `server/routes/study-sessions.ts`
  arrastaria express + multer + storage para dentro do helper puro). Documentar a
  duplicação intencional como dívida (ver "Reuso").
- Recebe **arrays já lidos** (sem shape de drizzle — interfaces planas próprias) → testável
  com objetos literais, sem mock de DB.

**Estratégia de teste (2 camadas):**
1. **Helper puro (`detectLeaks.test.ts`):** unit puro. Entrada = literais
   `{ coachLeaks:[...], statAnalysisSessions:[...], focusStats:[...], currentMonth, now }` +
   `top`; saída = `StatLeak[]`. Cobre RF-02/03/05/06, fórmula, caps, consolidação,
   custom_* válido/inválido, `top<=0`, empate determinístico. **Zero mock de DB.** Não há
   `import @shared/schema`, então não reproduz lesson #36.
2. **Storage (`getStatsLeaks`):** teste de integração com `db` mockado parcialmente. Como
   `storage.ts` já importa `@shared/schema` no topo (módulo grande, comportamento legado),
   o teste de integração mocka o `db` (query builder) retornando as rows e verifica:
   (a) janela RF-04 aplicada nas 3 queries; (b) try/catch por fonte — uma query que lança
   degrada SÓ aquela fonte para `[]` e ainda processa as outras (lesson #9); (c) log
   emitido antes do degrade; (d) o helper é chamado com os inputs crus + `currentMonth`
   derivado. O teste de storage pode mockar o helper (`vi.mock('../coach/leaks/detectLeaks')`)
   para isolar a orquestração da síntese, OU usar o helper real e validar o resultado
   end-to-end. **Recomendação ao test-writer:** mockar o helper no teste de storage (isola
   "leu certo + degradou certo") e cobrir a síntese exaustivamente no teste do helper puro.
   Se mockar `drizzle-orm` parcialmente no teste de storage, **incluir `relations: vi.fn()`**
   (lesson #36) porque `@shared/schema` faz `import { relations } from "drizzle-orm"`.

---

## Consequências

### Positivas
- Os 5 fluxos de estudo dirigido a leak deixam de receber `[]` permanente → C4 do curso
  passa a funcionar de ponta a ponta sem nenhuma migration.
- Helper puro e testável isolado (paridade com `adherence/` e `goals/`); a síntese é
  determinística e fácil de tunar (constantes nomeadas).
- Zero risco de quebra de compile nos consumers (narrowing de retorno é seguro).
- Resiliência por fonte (lesson #9): uma das 3 queries falhar não derruba o método.

### Negativas / dívidas
- **Duplicação intencional** de `CUSTOM_STAT_RE` + `isValidStatId` + `currentMonthUtc`.
  Justificada para manter o helper puro e evitar colisão com MDA-1 (que planeja criar
  `server/coach/statId.ts` — **não existe ainda em origin/main**). Dívida grepável:
  unificar em `server/coach/statId.ts` + `shared/monthKey.ts` quando MDA-1 mergear (evita
  duas sprints criarem o mesmo arquivo e colidirem no merge).
- `value`/`delta` permanecem `null` por design (não há HUD number). Os consumers que
  desenham "delta vs benchmark" mostram só `severity` + `benchmark` informativo. Aceito
  pela spec (fora de escopo: import de HUD numbers).
- Herda `TODO(EST-3 MEDIUM-1)`: `custom_*` válido por shape mas sem ownership-check. Um
  `custom_*` órfão entra no ranking. Sem dano de segurança (statId nunca toca FS). Não
  corrigido aqui.
- Sem cache: o método recalcula a cada chamada. Aceitável (n pequeno, ≤3 queries
  indexadas). Cache é follow-up se profiling indicar.

### Neutras
- O ADR **não** será adicionado ao `README.md` index nesta sprint (evita colisão de merge
  com MDA-1, que mexe no README). Registrar a entrada do índice é **pendência de fim de
  sprint** (após MDA-1 mergear ou em janela sem conflito).

## Confiança
Alta. Algoritmo travado pela spec, colunas re-confirmadas no schema, consumers auditados
(narrowing seguro), isolamento do helper validado contra lesson #36.

## Pendências (follow-up, fora do escopo)
- [ ] Adicionar entrada `231` ao `Docs/architecture/decisions/README.md` (fim de sprint, sem colisão MDA-1).
- [ ] Unificar `CUSTOM_STAT_RE`/`isValidStatId` em `server/coach/statId.ts` (após MDA-1 mergear).
- [ ] Extrair `currentMonthUtc` para `shared/monthKey.ts` + migrar 4+ call-sites.
- [ ] Avaliar cache se profiling indicar (read-only derivado, sem cache nesta fatia).
