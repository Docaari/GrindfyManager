# Spec: Fase C #3 — getStatsLeaks: stub → detecção real de leak

## Status
Proposta

## Resumo
Substituir o corpo do stub `storage.getStatsLeaks(userId, top)` (hoje `return []`) por uma **síntese de sinais já capturados** (`coach_leak_focus`, `study_sessions_v2` mode `stat_analysis`, `user_focus_stats`), enriquecida pelo catálogo estático `shared/hud-stat-catalog.ts`. Objetivo: destravar 5 consumidores que hoje sempre recebem `[]`, sem inventar pipeline de import de HUD numbers (que não existe). É fatia de detecção — sem UI nova, sem migration, sem tilt/mental.

## Contexto
Âncora do curso: **C4 — estudo dirigido a leak**. O jogador deve estudar o que ele erra, não estudar no escuro. Cinco fluxos (auto-suggest de foco, recomendações da Biblioteca, recomendações de estudo, planning EST-6, plano semanal de estudo) já chamam `getStatsLeaks` e fazem degrade gracioso quando recebem `[]` — hoje **todos** recebem `[]` porque o método é stub. Esta sprint preenche o método.

**Achado crítico confirmado no código (origin/main):** as tabelas que o TODO original sugeria (`hud_stats_snapshots`, `stats_analyzer_history`) **NÃO existem**. O Grindfy **não importa o valor jogado de uma stat** (não há "VPIP=24%" persistido em lugar nenhum). Logo, leak detection **NÃO pode ser delta de "valor jogado vs benchmark"**. Tem que ser **síntese de sinais comportamentais** que o jogador e o Coach já produzem.

Doc fonte: `Docs/strategy/estrategia-sprints-finais-2026-06-01.md` board #3 (ICE 7.7) + `Docs/specs/metas-tool-2026-06-01.md` RF-15 (degrade gracioso).

## Usuários
- **Jogador (indireto):** não interage com este método; consome o resultado através dos 5 fluxos existentes (auto-suggest de foco, "Destaques e Vazamentos" da Biblioteca, recomendações de estudo, wizard de planning, card de plano semanal).
- **Coach AI (indireto):** o planning EST-6 (`weeklyPlanningOrchestrator`) usa leaks para derivar temas-foco.

## Sinais reais disponíveis (verificados em origin/main)

| # | Fonte | Tabela / arquivo | O que representa | Campos usados |
|---|---|---|---|---|
| S1 | Leak logado pelo Coach | `coach_leak_focus` | Registro explícito de leak (tool `log_leak_focus`) | `leakCode`, `description`, `targetMonth` (YYYY-MM), `baselineStatKey`, `baselineValue`, `status` ('active'/'resolved') |
| S2 | Erros próprios por stat | `study_sessions_v2` mode=`stat_analysis` | Jogador registra erros que ele cometeu, por `statId` | `statId`, `statAnalysisEntries` (array cap 10), `handsSolvedCount`, `startedAt`, `deletedAt` |
| S3 | Stats auto-marcados como foco | `user_focus_stats` | O que o jogador decidiu trabalhar | `statId`, `month` (YYYY-MM), `studyThemeId` |
| Enriquecimento | Catálogo estático | `shared/hud-stat-catalog.ts` | label + benchmark por stat | `getStatById(id)` → `{ label, targetMin, targetMax, direction, unit }` |

## Requisitos Funcionais

### RF-01: Síntese de leaks a partir dos 3 sinais
**Descrição:** `getStatsLeaks(userId, top)` agrega S1 + S2 + S3, consolida por statId, computa um `severity` sintético, ordena por severity desc, e retorna os `top` primeiros.
**Regras de negócio:**
- Lê os 3 sinais filtrados pela janela temporal (RF-04).
- Cada sinal contribui um sub-score (RF-03).
- Consolida por chave de leak (RF-02), somando sub-scores.
- Ordena por `severity` desc; desempate por chave (statId/leakCode) ascendente para determinismo.
- Retorna no máximo `top` itens (default dos consumers: 3 ou 5).
**Critério de aceitação:**
- [ ] Com S1 + S2 + S3 vazios → retorna `[]` (degrade preservado).
- [ ] Com sinais presentes → retorna array ordenado por `severity` desc, no máx `top` itens.
- [ ] Ordenação é determinística (mesma entrada → mesma saída e ordem).

### RF-02: Consolidação (dedup) por statId
**Descrição:** Um mesmo statId pode aparecer em S1, S2 e S3. Consolidar em **um único leak** com `severity` = soma dos sub-scores das fontes que o mencionam.
**Regras de negócio:**
- **Chave de consolidação = statId resolvido** (RF-05 define como cada fonte produz um statId).
- S1 (`coach_leak_focus`) que não casa com nenhum statId do catálogo (RF-05) NÃO se funde com S2/S3 por statId — vira leak próprio com chave sintética `leak:<leakCode>` (preserva o registro explícito do Coach em vez de perdê-lo).
- `statName` do leak consolidado: resolvido via RF-05 (catálogo > description > leakCode).
- `value` e `delta` permanecem `null` no resultado consolidado (RF-06).
**Critério de aceitação:**
- [ ] statId presente em S1 + S2 + S3 → 1 item, severity = soma dos 3 sub-scores.
- [ ] statId presente só em S2 → 1 item, severity = sub-score S2.
- [ ] S1 com `baselineStatKey` que não casa catálogo → item separado com chave `leak:<leakCode>`, não funde com nada.

### RF-03: Fórmula de severity (proposta — architect confirma/ajusta)
**Descrição:** Cada fonte produz um sub-score fixo por ocorrência; severity = soma. Score sintético, **não** unidade de delta-de-mão.
**Fórmula proposta:**

```
severity(leak) = scoreS1 + scoreS2 + scoreS3

scoreS1 (coach_leak_focus, status='active', janela RF-04):
    = 10  por leak ativo que mapeia a este statId
    (peso ALTO — registro explícito e curado pelo Coach)

scoreS2 (stat_analysis, janela RF-04):
    = 3 * (nº de sessões stat_analysis distintas que tocam o statId na janela)
    + 1 * min(totalEntries, 10)         // totalEntries = soma de statAnalysisEntries.length
    (peso MÉDIO, escala com recorrência — o jogador volta a errar a mesma stat)
    cap de scoreS2 = 30

scoreS3 (user_focus_stats, mês corrente — RF-04):
    = 2  por statId marcado como foco no mês corrente
    (peso BAIXO — reconhecimento, ainda não necessariamente erro)
```

- Pesos como **constantes nomeadas** no helper (`WEIGHT_COACH_LEAK = 10`, `WEIGHT_STAT_ANALYSIS_SESSION = 3`, `WEIGHT_STAT_ANALYSIS_ENTRY = 1`, `WEIGHT_FOCUS_MARK = 2`, `CAP_STAT_ANALYSIS = 30`) — fáceis de tunar e de assertar em teste.
- `severity` é número ≥ 0; resultado nunca inclui itens com `severity === 0` (sem sinal = não é leak).
**Critério de aceitação:**
- [ ] 1 leak ativo no Coach (S1) sobre statId X, sem S2/S3 → severity = 10.
- [ ] 2 sessões stat_analysis distintas no statId X com 3 entries cada (6 total) → scoreS2 = 3*2 + 1*6 = 12.
- [ ] statId marcado como foco no mês (S3) → +2.
- [ ] statId em S1(ativo) + S2(2 sessões, 6 entries) + S3 → severity = 10 + 12 + 2 = 24.
- [ ] scoreS2 nunca passa de 30 mesmo com muitas sessões/entries.

### RF-04: Janela temporal por fonte
**Descrição:** Cada sinal tem janela própria; só sinais "ativos/recentes" contam.
**Regras de negócio:**
- **S1 (`coach_leak_focus`):** `status = 'active'` (ignora `resolved`). Sem corte de data adicional na fatia (o status já é o gate; `targetMonth` usado só como informação, não como filtro — architect decide se adiciona corte por `targetMonth >= mês corrente - N`).
- **S2 (`stat_analysis`):** `deletedAt IS NULL` AND `startedAt >= now - STAT_ANALYSIS_WINDOW_DAYS` (proposto **60 dias** — constante nomeada).
- **S3 (`user_focus_stats`):** `month = mês corrente` (YYYY-MM em UTC; reusar helper de mês existente, não criar novo).
**Critério de aceitação:**
- [ ] Leak S1 com `status='resolved'` → não entra no resultado.
- [ ] Sessão stat_analysis com `deletedAt` setado → não conta.
- [ ] Sessão stat_analysis com `startedAt` há 90 dias → não conta (fora dos 60d).
- [ ] focus_stat de mês anterior → não conta.

### RF-05: Resolução de statId e statName por fonte
**Descrição:** Cada fonte produz um `statId` de consolidação + um `statName` enriquecido.
**Regras de negócio:**
- **S2 e S3:** já têm `statId` nativo (`varchar(64)`).
  - Se `statId` casa no catálogo (`getStatById`) → `statName = stat.label`, `benchmark` via RF-06.
  - Se `statId` é `custom_*` (regex `^custom_[A-Za-z0-9_-]{1,48}$`, já existente em `study-sessions.ts:127`) → **inclui** no resultado; `statName = "Stat personalizada"` (ou o sufixo após `custom_` se útil), `benchmark = null`. Herda TODO(EST-3 MEDIUM-1) — sem ownership, custom_* não validado contra dono. Documentar, não bloquear.
- **S1 (`coach_leak_focus`):** `baselineStatKey` é `varchar(128)` livre — pode ou não casar com id do catálogo.
  - Se `baselineStatKey` casa em `getStatById` → consolida com S2/S3 por esse statId; `statName = stat.label`.
  - Se NÃO casa → leak próprio com chave `leak:<leakCode>`; `statId = baselineStatKey` (cru, para o consumer ter algo), `statName = description` (truncado em ~80 chars) ou `leakCode` se description vazia; `benchmark = null`.
**Critério de aceitação:**
- [ ] S2 com statId catálogo → `statName` = label do catálogo.
- [ ] S2/S3 com `custom_xyz` → incluído, `statName` não-vazio, `benchmark = null`.
- [ ] S1 com `baselineStatKey='vpip'` (casa) → funde com S2 do mesmo statId.
- [ ] S1 com `baselineStatKey='3bet defesa BB vs CO'` (não casa) → item `leak:<code>`, statName = description.

### RF-06: Shape de retorno (contrato dos 5 consumers)
**Descrição:** Cada item do array respeita o superset lido pelos consumers.
**Shape:**
```ts
type StatLeak = {
  statId: string;            // catálogo id, custom_*, ou baselineStatKey cru
  statName: string;          // label catálogo, description, ou "Stat personalizada"
  value: number | null;      // SEMPRE null nesta fatia (não há HUD number jogado)
  benchmark: number | null;  // midpoint (targetMin+targetMax)/2 do catálogo, ou null
  delta: number | null;      // SEMPRE null (sem value, não há delta)
  severity: number;          // score sintético ≥ 0 (RF-03)
  // opcional/informativo (consumers ignoram extras):
  id?: string;               // = statId (studyRecommendationsService lê `id?`)
  type?: string;             // = 'stat_leak'
  description?: string;      // = statName ou description do Coach
};
```
**Regras de negócio:**
- `benchmark`: se statId casa catálogo, `= (targetMin + targetMax) / 2`; senão `null`.
- `value` e `delta` **sempre** `null` (sem fonte de número jogado).
- Campos extras (`id`, `type`, `description`) preenchidos para compatibilidade com `studyRecommendationsService` (lê `{ id?, type?, severity, description? }`) e `bibliotecaRecommendationsService` (lê `{ statId, statName, value, benchmark, delta, severity }`).
**Critério de aceitação:**
- [ ] Todo item tem `statId`, `statName` (não-vazio), `severity` (number).
- [ ] `value` e `delta` sempre `null`.
- [ ] `benchmark` numérico só quando statId casa catálogo; `null` caso contrário.
- [ ] `auto-suggest` consegue ler `{ statId, severity }` e ordenar.
- [ ] `bibliotecaRecommendationsService` consegue ler os 6 campos sem `undefined` quebrando.

### RF-07: Local do código + integração no storage
**Descrição:** A lógica de síntese mora em helper puro testável isolado; `storage.getStatsLeaks` só orquestra leitura + chama o helper.
**Regras de negócio:**
- Criar **`server/coach/leaks/detectLeaks.ts`** (paridade com `server/coach/adherence/` e `server/coach/goals/`):
  - Função pura `synthesizeLeaks(inputs, top): StatLeak[]` que recebe os 3 conjuntos de sinais já carregados (sem tocar DB) + `top` e retorna o array ordenado. Testável sem mock de DB.
  - Constantes de peso e janela exportadas (ou em arquivo irmão) para assertar em teste.
- `storage.getStatsLeaks(userId, top)`:
  - Faz as 3 queries (S1/S2/S3) com a janela RF-04.
  - **lesson #9:** envolve cada query em try/catch; em erro, loga (`console.error("getStatsLeaks.<source>.error", {...})`) e degrada essa fonte para `[]` (não derruba o método inteiro).
  - Passa os resultados para `synthesizeLeaks`.
  - Retorna o array final.
- Assinatura preservada: `getStatsLeaks(userId: string, top: number): Promise<any[]>` (só troca o corpo; tipo de retorno pode estreitar para `Promise<StatLeak[]>` se não quebrar callers — architect decide).
**Critério de aceitação:**
- [ ] `synthesizeLeaks` testável sem DB (entrada = arrays, saída = array).
- [ ] Falha de uma das 3 queries → método ainda retorna o que conseguiu das outras (não lança).
- [ ] Log emitido antes de cada degrade (lesson #9).
- [ ] Assinatura e contrato preservados; os 5 consumers continuam compilando sem mudança.

## Requisitos Não-Funcionais
- **Performance:** no máx 3 queries por chamada (S1/S2/S3), filtradas por `userId` + janela; usar índices existentes (`idx_coach_leak_focus_user_month`, `idx_ssv2_stat_analysis_theme_stat`, `idx_user_focus_stats_user_month`). Sem N+1. Síntese é O(n) sobre os sinais (n pequeno).
- **Resiliência (lesson #9):** logar antes de qualquer fallback; distinguir "sem linhas" (`[]` legítimo) de "DB explodiu" (loga + degrada fonte).
- **Determinismo:** mesma entrada → mesma saída e ordem (desempate estável).
- **Zero migration:** todas as tabelas já existem. **NENHUMA** alteração de schema.

## Endpoints Previstos
Nenhum endpoint novo. Os 5 consumers já existem e já têm rotas/serviços:
| Consumer | Arquivo | Lê do leak |
|---|---|---|
| auto-suggest de foco | `server/routes/focus-stats-auto-suggest.ts` | `{ statId, severity }`, top 3 |
| recomendações Biblioteca | `server/services/bibliotecaRecommendationsService.ts` | `{ statId, statName, value, benchmark, delta, severity }`, top 3 |
| recomendações de estudo | `server/services/studyRecommendationsService.ts` | `{ id?, type?, severity, description? }`, top 5 |
| planning EST-6 | `server/coach/planning/weeklyPlanningOrchestrator.ts` | `statId` (deriveThemeFocus), top N |
| plano semanal estudo | `server/services/studyWeeklyPlanService.ts` | leaks crus, top 3 |

## Modelos de Dados Afetados
**Nenhuma alteração de schema.** Tabelas lidas (já existentes):

### coach_leak_focus (leitura)
| Campo | Tipo | Uso |
|---|---|---|
| userId | varchar | filtro |
| leakCode | varchar(64) | chave sintética `leak:<code>` quando baselineStatKey não casa |
| description | text | statName fallback |
| baselineStatKey | varchar(128) | tentativa de mapear → statId catálogo |
| status | varchar(16) | filtro = 'active' |

### study_sessions_v2 mode='stat_analysis' (leitura)
| Campo | Tipo | Uso |
|---|---|---|
| statId | varchar(64) | chave de consolidação |
| statAnalysisEntries | jsonb (cap 10) | `.length` → scoreS2 entries |
| startedAt | timestamp | janela 60d |
| deletedAt | timestamp | filtro IS NULL |

### user_focus_stats (leitura)
| Campo | Tipo | Uso |
|---|---|---|
| statId | varchar(64) | chave de consolidação |
| month | varchar(7) | filtro = mês corrente |

### shared/hud-stat-catalog.ts (estático)
`getStatById(id)` → `StatField { id, label, targetMin, targetMax, direction, unit }`. Usado p/ statName + benchmark midpoint.

## Integrações Externas
Nenhuma.

## Cenários de Teste Derivados

### Happy Path
- [ ] 3 sinais presentes em statIds distintos → array ordenado por severity desc, ≤ `top`.
- [ ] statId presente nas 3 fontes → 1 item consolidado, severity = soma.

### Fórmula / severity (RF-03)
- [ ] S1 ativo isolado → severity = 10.
- [ ] S2 com 2 sessões + 6 entries → scoreS2 = 12.
- [ ] S3 isolado → severity = 2.
- [ ] S1+S2+S3 mesmo statId → 24.
- [ ] scoreS2 com 20 sessões/200 entries → capado em 30.
- [ ] item com severity 0 (nenhum sinal) → não aparece no resultado.

### Consolidação / dedup (RF-02, RF-05)
- [ ] mesmo statId em S2 e S3 → 1 item.
- [ ] S1 com baselineStatKey que casa catálogo → funde com S2 do mesmo statId.
- [ ] S1 com baselineStatKey que NÃO casa → item separado `leak:<code>`.
- [ ] statName de item consolidado vem do catálogo (não da description) quando casa.

### Janela temporal (RF-04)
- [ ] coach_leak_focus status='resolved' → excluído.
- [ ] stat_analysis com deletedAt setado → excluído.
- [ ] stat_analysis há 90 dias (>60d) → excluído; há 30 dias → incluído.
- [ ] focus_stat de mês anterior → excluído; mês corrente → incluído.

### Shape / contrato (RF-06)
- [ ] todo item tem value=null e delta=null.
- [ ] benchmark = midpoint quando catálogo; null quando custom_*/não-casa.
- [ ] statName nunca vazio.
- [ ] consumer auto-suggest lê {statId, severity} sem erro.
- [ ] consumer biblioteca lê os 6 campos sem undefined.

### custom_* (RF-05, herda EST-3 MEDIUM-1)
- [ ] statId = `custom_meu_leak` em S2 → incluído, statName não-vazio, benchmark null.
- [ ] statId = `custom_../etc` (regex falha) → comportamento definido (excluir ou statName genérico — architect trava; teste cobre o que for decidido).

### Edge cases / resiliência (RF-07, lesson #9)
- [ ] todas as fontes vazias → `[]`.
- [ ] query S1 lança erro → loga + degrada S1 para []; S2/S3 ainda processam.
- [ ] `top = 0` → `[]` (ou todos? — architect trava; default consumers ≥3).
- [ ] `top` menor que nº de leaks → trunca corretamente após ordenar.
- [ ] empate de severity → ordem determinística por chave asc.
- [ ] statAnalysisEntries `null`/ausente numa sessão → trata como 0 entries (não NaN).
- [ ] baselineValue presente mas sem HUD jogado → value/delta seguem null (não usar baselineValue como value).

## Fora de Escopo
- **Import de HUD numbers** — não existe pipeline; `value`/`delta` ficam `null` por design. NÃO criar tabela de snapshots de stat.
- **UI nova** — os 5 consumers e suas telas já existem.
- **Tilt detection (#4)** e **mental↔resultado (#10)** — sprints separados da Fase C.
- **Migration / mudança de schema** — zero.
- **Resolver TODO(EST-3 MEDIUM-1) de ownership de custom_*** — só herda e documenta; não corrige aqui.
- **Mudar a assinatura `getStatsLeaks`** — só troca o corpo.
- **Persistir leaks detectados** — método é read-only/derivado a cada chamada (sem cache nesta fatia; architect pode propor cache como follow-up).

## Dependências
Nenhuma. Todas as tabelas (`coach_leak_focus`, `study_sessions_v2`, `user_focus_stats`) e o catálogo (`hud-stat-catalog.ts`) existem em origin/main.

## Decisões travadas nesta spec
1. **Algoritmo = síntese de 3 sinais comportamentais**, não delta valor-jogado-vs-benchmark (não há valor jogado).
2. **`value`/`delta` sempre `null`**; `severity` é score sintético; `benchmark` = midpoint do catálogo quando disponível.
3. **Consolidação por statId** com severity somado; S1 sem mapeamento de catálogo vira leak próprio `leak:<code>` (não se perde).
4. **Pesos:** S1=10, S2=3/sessão+1/entry (cap 30), S3=2 — constantes nomeadas.
5. **Janela:** S1 `status='active'`; S2 últimos 60 dias + `deletedAt IS NULL`; S3 mês corrente.
6. **Código:** helper puro `server/coach/leaks/detectLeaks.ts` (`synthesizeLeaks`) + `storage.getStatsLeaks` orquestra leitura com try/catch por fonte (lesson #9).
7. **custom_*:** incluído (statName genérico, benchmark null); herda TODO ownership EST-3.
8. **Zero migration; assinatura preservada; degrade `[]` continua válido.**

## Decisões deferidas pro system-architect
- **D-A1:** S1 precisa de corte adicional por `targetMonth` (ex: ignorar leaks ativos de meses muito antigos), ou `status='active'` basta? (Spec propõe: status basta.)
- **D-A2:** Valor exato de `STAT_ANALYSIS_WINDOW_DAYS` (proposto 60) — confirmar/tunar.
- **D-A3:** Estreitar o tipo de retorno de `Promise<any[]>` para `Promise<StatLeak[]>` é seguro (não quebra os 5 callers que usam `(storage as any)`)? Definir o tipo canônico e onde declará-lo (`server/coach/leaks/types.ts`?).
- **D-A4:** Comportamento de `top = 0` (retorna `[]` ou ignora e retorna todos?).
- **D-A5:** custom_* com regex inválida (path traversal) — excluir totalmente ou incluir com statName neutro? (Spec propõe excluir se a regex `CUSTOM_STAT_RE` falhar, igual study-sessions.ts:130.)
- **D-A6:** Reusar helper de mês UTC existente (qual? `ymdUtc` é dia, não mês) ou criar derivação `YYYY-MM` local ao helper — architect aponta a SSoT de "mês corrente YYYY-MM".
- **D-A7:** Mapeamento `baselineStatKey → catálogo` é match exato por `id`, ou também tenta normalizar (lowercase/trim)? (Spec propõe match exato por `getStatById(baselineStatKey)`; normalização é opcional.)
- **D-A8:** Como carregar a tabela `users`/queries no storage sem reintroduzir o problema da lesson #36 (import top-level de `@shared/schema` em módulo testado com drizzle mockado parcialmente) — relevante se o helper for testado com `db` mockado. Spec já mitiga colocando a leitura no storage e a síntese pura no helper.

## Notas de Implementação
- Helper puro = sem `import db`; recebe arrays já carregados.
- Reusar `getStatById` e `CUSTOM_STAT_RE` (já em `server/routes/study-sessions.ts:127`) — extrair para módulo compartilhado se o reuso justificar (CLAUDE.md menciona `server/coach/statId.ts` planejado p/ MDA-1; verificar se já existe antes de duplicar).
- Pipeline: esta spec → system-architect (ADR + diagrama de sequência da síntese) → test-writer (red) → implementer (green) → /simplify → reviewer.
- Branch `feature/fase-c-stats-leaks` (off origin/main). Tree compartilhada com MDA-1 paralelo → **git add explícito** dos arquivos desta sprint (nunca `-A`).
