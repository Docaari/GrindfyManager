# Spec: EST-2 — Weekly Report Data Enrichment

## Status
Aprovada

## Resumo
O gerador do Relatório Semanal do Coach (`weeklyReportGenerator.ts`) passa a **ler e interpretar** três fontes de dados que hoje ignora: (a) `break_feedbacks` (notas mentais 0-10 ao longo dos breaks de cada sessão), (b) notas + médias mentais de `grind_sessions`, e (c) métricas enriquecidas de estudo (EST-3). O `ReportContent` ganha duas seções opcionais (`mentalState` + `studyWeek`) e o prompt do mentor passa a correlacionar qualitativamente estado mental ↔ performance. Backend-only — nenhuma UI nova (o frontend já renderiza o markdown do relatório).

## Contexto
EST-1 destravou a entrega do relatório (mentor voltou a falar). Mas o conteúdo do relatório é raso: lê volume/ROI/bankroll/seleção/estudo-básico/warmup, e **ignora** os dados mais ricos que o jogador já registra — as notas de break (flutuação de foco/energia/confiança/IE/interferências durante a sessão) e as notas de fim de grind. O founder quer que o mentor "leia" essas notas como um coach humano leria: "seu foco caiu do 1º pro último break = leak de fadiga; corte a sessão mais cedo ou faça pausas maiores".

EST-3 já landou (`study_sessions_v2` ganhou `handsSolvedCount/filtersAnalyzedCount/statAnalysisEntries/lessonInsights`). EST-2 consome essas métricas.

Prioridade: alta (é o "cérebro" do ritual de segunda que EST-5/EST-6 vão usar).

## Usuários
- **Jogador (Trial/Pro/Premium/admin = `getReportTier` elegível):** recebe o relatório semanal enriquecido. Não interage diretamente com EST-2 — consome o output.
- **Mentor (LLM Sonnet 4.6):** recebe o bundle enriquecido + médias/deltas determinísticos e produz narrativa qualitativa.
- **Sistema (cron `reportJobRunner` / `processReportJobsTick`):** dispara a geração; sem mudança de trigger.

## Estado atual verificado (código)
- `gatherBundle()` (`weeklyReportGenerator.ts:151`) carrega 16 fontes em `Promise.all`, incluindo **`grindSessions`** (rows da semana, com `finalNotes/preparationNotes/dailyGoals/objectiveCompleted` + médias `focoMedio/...Media`) e **`studySessionsV2`** (rows com cols EST-3). `break_feedbacks` **NÃO** é carregado.
- `buildSections()` usa de `grindSessions` apenas `status` (conta completed). Usa de `studySessions` apenas `durationMinutes` (→ `minutesLogged`) e `themeId` (→ `topicsCovered`). Ignora notas, médias, e cols EST-3.
- `callLlm()` → `callReportLlm` (`anthropicClient.ts`) faz `JSON.stringify(bundle)` do bundle inteiro. **Weekly não aplica `reportSummarizer`** (só monthly/daily aplicam).
- `ReportContent` (`shared/schema.ts:5473`): interface TS pura, `schemaVersion` atual `1`. `mentalOps` (warmup rituais) é seção **existente e distinta** de break_feedbacks.
- `storage.getBreakFeedbacksBySessionIds(userId, sessionIds[])` → `Promise<BreakFeedback[]>` (1 query batch, ordena `desc(breakTime)`, retorna `[]` se sessionIds vazio). `BreakFeedback` = `{id, userId, sessionId, breakTime, foco, energia, confianca, inteligenciaEmocional, interferencias (int 0-10 notNull), notes, createdAt}`.
- `break_feedbacks.sessionId` referencia `grind_sessions.id` (sem FK formal — varchar livre).
- `reportSummarizer.summarizeBundle(...)` existe; threshold `COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS` (default 20K); usa Haiku.

## Requisitos Funcionais

### RF-01: Carregar `break_feedbacks` da semana no bundle
**Descrição:** `gatherBundle` passa a buscar os break feedbacks de todas as sessões de grind da semana, em **uma** query batch.
**Regras de negócio:**
- Coletar os `id` das `grindSessions` já carregadas na semana → `sessionIds`.
- Chamar `storage.getBreakFeedbacksBySessionIds(userId, sessionIds)` dentro do `safe(...)` wrapper (degrade `[]` em erro — lesson #9).
- Se `sessionIds` vazio → não chamar (helper já retorna `[]`); bundle recebe `breakFeedbacks: []`.
- Não usar `getBreakFeedbacks(userId)` sem filtro (traria histórico inteiro — caro e fora da semana).
**Critério de aceitação:**
- [ ] Com 2 sessões na semana e 5 breaks cada, `gatherBundle` retorna `breakFeedbacks.length === 10`.
- [ ] Sem sessões na semana, `getBreakFeedbacksBySessionIds` NÃO é chamado (ou é chamado com `[]`) e bundle tem `breakFeedbacks: []`.
- [ ] Erro no storage → bundle tem `breakFeedbacks: []`, geração não quebra.

### RF-02: Agregar série mental determinística por sessão + semanal
**Descrição:** Uma função pura (ex: `buildMentalState(bundle)`) transforma os break feedbacks crus + médias de grind_sessions em uma estrutura **enxuta e numérica** — NÃO o array bruto de N breaks.
**Regras de negócio:**
- Para cada sessão com ≥1 break: calcular, para as 5 dimensões (`foco/energia/confianca/inteligenciaEmocional/interferencias`):
  - `first` (valor do 1º break cronológico) e `last` (último break cronológico). **Atenção:** `getBreakFeedbacksBySessionIds` ordena `desc(breakTime)` — ordenar ascendente por `breakTime` antes de pegar first/last.
  - `avg` (média da dimensão na sessão, arredondada 1 casa).
  - `delta = last - first` (flutuação intra-sessão; negativo = piora p/ foco/energia/confiança/IE, positivo = piora p/ interferências).
- Agregado semanal por dimensão: `weeklyAvg` (média de todos os breaks da semana, 1 casa) + `breakCount` total.
- **Flag de fadiga determinística:** `fatigueSignal: boolean` = true se ≥2 sessões da semana têm `foco.delta <= -2` OU `energia.delta <= -2` (queda relevante do início ao fim). Documentar o threshold escolhido.
- Incluir as médias já persistidas em `grind_sessions` (`focoMedio` etc) quando existirem, como cross-check (campo `sessionAvgsFromGrind` por sessão, opcional).
- Estrutura final cap: no máximo **10 sessões** detalhadas (as mais recentes); se >10, incluir contagem total + nota de truncamento (não despejar centenas). Documentar cap.
**Critério de aceitação:**
- [ ] Sessão com breaks `foco` [8,6,4] (ordem cronológica) → `{first:8, last:4, avg:6, delta:-4}`.
- [ ] Breaks recebidos em ordem `desc(breakTime)` são reordenados → first/last corretos (teste com input desordenado).
- [ ] `fatigueSignal === true` quando 2 sessões têm `foco.delta <= -2`.
- [ ] `weeklyAvg` da semana = média de todos os breaks (não média das médias por sessão).
- [ ] >10 sessões com breaks → só 10 detalhadas + `totalSessionsWithBreaks` correto.
- [ ] Zero breaks na semana → `buildMentalState` retorna `null` (seção omitida).

### RF-03: Extrair notas + médias de grind_sessions
**Descrição:** Função pura extrai, das `grindSessions` da semana, as notas textuais e flags, em estrutura enxuta para o LLM.
**Regras de negócio:**
- Por sessão (cap 10 mais recentes): `{ date, finalNotes, preparationNotes, dailyGoals, objectiveCompleted }` — **omitir campos vazios/null** (não enviar `null` ao LLM, economiza tokens).
- Sessões sem nenhuma nota textual nem `objectiveCompleted` definido → excluídas da lista.
- `objectiveHitRate`: % de sessões com `objectiveCompleted === true` sobre as que têm `objectiveCompleted` definido (não-null). `null` se nenhuma definida.
- Truncar cada nota textual a um cap de chars (ex: 500) para evitar bundle gigante. Documentar cap.
**Critério de aceitação:**
- [ ] Sessão com `finalNotes` e `dailyGoals` vazios e `preparationNotes` preenchido → só `preparationNotes` aparece.
- [ ] 3 sessões, 2 com `objectiveCompleted=true`, 1 false → `objectiveHitRate === 67` (arred.).
- [ ] Nenhuma sessão com notas → lista vazia; bloco grind notes omitido.
- [ ] Nota de 2000 chars → truncada a 500 + sufixo de truncamento.

### RF-04: Agregar métricas de estudo enriquecidas (EST-3)
**Descrição:** Estender a agregação de estudo para incluir as métricas EST-3, com degrade gracioso (cols nullable → 0).
**Regras de negócio:**
- Sobre `studySessionsV2` da semana (status `completed`/sem soft-delete — seguir o que `getStudySessionsV2` já retorna):
  - `sessionCount` (total de sessões de estudo na semana).
  - `handsSolvedTotal` = soma de `handsSolvedCount` (null → 0).
  - `filtersAnalyzedTotal` = soma de `filtersAnalyzedCount` (null → 0).
  - `statAnalysisEntriesTotal` = soma de `statAnalysisEntries.length` (null/undefined → 0).
  - `statAnalysisSessionCount` = nº de sessões `mode === 'stat_analysis'`.
  - `timeByTheme`: `[{ themeId, minutes }]` agregando `durationMinutes` por `themeId` (cap top 8 por minutos; ignora themeId vazio).
  - `lessonInsightsCount` = nº de sessões com `lessonInsights` não-vazio.
  - Reusar `minutesLogged` total já existente.
- Esta agregação **alimenta a nova seção `studyWeek`** E mantém os campos existentes de `sections.study` intactos (back-compat).
**Critério de aceitação:**
- [ ] 3 sessões com `handsSolvedCount` [10, null, 5] → `handsSolvedTotal === 15`.
- [ ] Sessão com `statAnalysisEntries` de 3 entradas → `statAnalysisEntriesTotal === 3`.
- [ ] Sessões em 2 temas (40min + 20min no tema A, 30min no tema B) → `timeByTheme` ordenado [A:60, B:30].
- [ ] Zero sessões de estudo → `buildStudyWeek` retorna `null` (seção omitida).
- [ ] Todas as cols EST-3 null (sessão pré-EST-3) → totais `0`, sem erro.

### RF-05: Estender `ReportContent` com seções opcionais `mentalState` + `studyWeek`
**Descrição:** Adicionar dois campos opcionais à interface `ReportContent` (schema.ts), seguindo o padrão dos campos AI-1C (`comparatives/variance/...`).
**Regras de negócio:**
- `mentalState?` e `studyWeek?` opcionais (lesson #7 — frontend/renderer toleram ausência).
- `mentalState` carrega: `weeklyAverages` (5 dims), `breakCount`, `fatigueSignal`, `sessions: [{ sessionId, date, dims: { foco: {first,last,avg,delta}, ... }, notes? }]`, `narrative?` (preenchido pelo LLM).
- `studyWeek` carrega: `sessionCount`, `minutesLogged`, `handsSolvedTotal`, `filtersAnalyzedTotal`, `statAnalysisEntriesTotal`, `statAnalysisSessionCount`, `timeByTheme`, `lessonInsightsCount`, `narrative?`.
- `grindNotes` (RF-03) pode viver dentro de `mentalState` (ex: `mentalState.grindNotes`) OU como bloco próprio — **decisão do architect** (recomendação: dentro de `mentalState` por coesão "estado da semana").
- Quando o gerador popular `mentalState` OU `studyWeek`, faz `schemaVersion = 2`. Quando nenhum for populado (low-data, degrade), mantém `1`.
**Critério de aceitação:**
- [ ] `ReportContent` com `mentalState`/`studyWeek` ausentes continua type-valid (campos opcionais).
- [ ] `tsc` 0 erros após a extensão.
- [ ] Gerador com break+study data → `content.schemaVersion === 2` + `content.mentalState` e `content.studyWeek` presentes.
- [ ] Gerador low-data → `schemaVersion === 1`, sem os dois blocos.

### RF-06: Prompt do mentor interpreta qualitativamente
**Descrição:** `WEEKLY_REPORT_SYSTEM` (`prompts/weeklyReport.ts`) ganha instruções para o LLM interpretar o estado mental + notas e correlacionar com performance, e devolver `narrative` para os novos blocos.
**Regras de negócio:**
- Prompt único (lesson #10 — não criar variante; estender o arquivo existente preservando o prefixo estável para o cache da Anthropic — **acrescentar no fim do bloco**, não reordenar o início).
- Instruir: ler `mentalState.sessions[].dims` e `fatigueSignal` → se foco/energia caem no fim (delta negativo) e há `fatigueSignal`, sugerir leak de fadiga / sessões mais curtas. Ler `grindNotes` (finalNotes/dailyGoals/objectiveCompleted) qualitativamente. Correlacionar com volume/ROI da semana.
- Output JSON ganha campos opcionais: `sections.mentalState.narrative`, `sections.studyWeek.narrative` (1-2 frases cada). Os insights (exatamente 3) **podem** usar dados mentais/estudo com citação `[fonte: break_feedbacks:7d]` / `[fonte: study_sessions_v2:7d]`.
- NÃO inventar números — só usar o que está no bundle (regra já existente).
**Critério de aceitação:**
- [ ] Prompt contém instrução explícita sobre interpretar queda de foco/energia como fadiga.
- [ ] `mergeLlm` passa `parsed.sections.mentalState.narrative` e `parsed.sections.studyWeek.narrative` para o content (quando presentes).
- [ ] Prefixo do system prompt (até `## Voce esta gerando`) inalterado byte-a-byte (cache preservado).

### RF-07: `renderMarkdown` ganha blocos "Estado mental da semana" + "Estudo da semana"
**Descrição:** O markdown derivado renderiza os dois novos blocos quando presentes.
**Regras de negócio:**
- Bloco "## Estado mental da semana": médias semanais por dimensão + sinal de fadiga + narrative. Por sessão relevante: resumo `foco X→Y` quando delta significativo. Notas de fim quando presentes.
- Bloco "## Estudo da semana": sessões, minutos, mãos solucionadas, filtros, # análises de stat, tempo por tema, narrative.
- Blocos **omitidos** quando `mentalState`/`studyWeek` ausentes (back-compat — markdown atual não muda para relatórios sem os dados).
**Critério de aceitação:**
- [ ] `content` sem `mentalState` → markdown idêntico ao formato atual (nenhum bloco novo, nenhum header órfão).
- [ ] `content` com `mentalState.fatigueSignal=true` → markdown contém o bloco + menção à fadiga.
- [ ] `content` com `studyWeek` → markdown lista mãos solucionadas + tempo por tema.

### RF-08: Custo LLM — pré-agregação determinística (sem inflar bundle)
**Descrição:** Garantir que EST-2 não estoure o custo/tamanho do bundle enviado ao LLM.
**Regras de negócio:**
- A estratégia primária é **pré-agregar determinístico** (RF-02/03/04 produzem números/deltas/contagens, NÃO arrays brutos de N breaks). O bundle cresce em estrutura pequena e bounded (cap 10 sessões).
- **Decisão do architect (D-1):** avaliar se ainda assim vale ligar `reportSummarizer.summarizeBundle` no caminho weekly (hoje desligado) como guarda p/ usuários de alto volume — OU manter weekly sem summarizer porque a pré-agregação já limita o tamanho. Recomendação da spec: **não ligar o summarizer agora** (pré-agregação já resolve; ligar summarizer adicionaria custo Haiku + risco de perder estrutura). Architect confirma e documenta no ADR.
- Se o architect optar por NÃO ligar o summarizer, o gerador deve passar ao LLM apenas a **estrutura agregada** (`mentalState`/`studyWeek` + grind notes truncadas) — NÃO os arrays crus de `breakFeedbacks` (esses ficam só no cálculo determinístico, fora do prompt).
**Critério de aceitação:**
- [ ] O objeto efetivamente serializado pro LLM NÃO contém o array cru `breakFeedbacks` (só a agregação `mentalState`).
- [ ] Bundle com 10 sessões × 8 breaks permanece dentro de limite razoável (documentar tamanho esperado < threshold 20K na maioria dos casos).

## Requisitos Não-Funcionais
- **Custo:** input tokens do weekly não devem crescer mais que ~30% vs baseline para usuário típico (≤10 sessões/semana) — garantido pela pré-agregação (RF-08).
- **Resiliência:** falha em qualquer agregação nova (break/grind/study) degrada para `[]`/`null` sem derrubar o relatório (lesson #9 — log antes do fallback).
- **Back-compat:** relatórios sem os novos dados são byte-idênticos no markdown ao formato atual; `schemaVersion` permanece `1`.
- **Cache Anthropic:** prefixo estável do system prompt inalterado (lesson #10).
- **Tier gating:** sem mudança — `getReportTier` continua governando elegibilidade.

## Endpoints Previstos
Nenhum endpoint novo. `GET /api/coach/reports/:id` já serve o `content` enriquecido (frontend tolera campos novos). `GET /api/coach/timeline` inalterado.

## Modelos de Dados Afetados

### `ReportContent` (interface TS, `shared/schema.ts`) — alteração
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `mentalState` | objeto opcional | — | break analysis: weeklyAverages, breakCount, fatigueSignal, sessions[], grindNotes?, narrative? |
| `studyWeek` | objeto opcional | — | métricas estudo EST-3: counts + timeByTheme + narrative? |
| `schemaVersion` | number | — | bump 1→2 quando popular qualquer bloco novo |

**Sem migration de banco.** `break_feedbacks`, `grind_sessions`, `study_sessions_v2` já existem com todas as colunas necessárias (EST-3 já landou cols). `ReportContent` é interface TS pura (JSONB `reports.content` aceita o shape novo sem ALTER).

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| Anthropic API (Sonnet 4.6) | narrativa qualitativa dos novos blocos | já integrado via `callReportLlm` |
| Anthropic API (Haiku 4.5) | summarizer — **só se architect ligar no weekly (D-1)** | condicional |

## Cenários de Teste Derivados

### Happy Path
- [ ] Semana com 3 sessões + breaks + estudo EST-3 → `content.mentalState` + `content.studyWeek` populados, `schemaVersion=2`, markdown com os 2 blocos.

### Validação / Agregação
- [ ] Breaks em ordem `desc(breakTime)` → first/last reordenados corretamente (RF-02).
- [ ] `handsSolvedCount` com nulls → soma ignora nulls (RF-04).
- [ ] Notas vazias omitidas do payload do LLM (RF-03).
- [ ] `objectiveHitRate` calculado só sobre sessões com flag definida (RF-03).

### Regras de Negócio
- [ ] `fatigueSignal` dispara com 2 sessões de queda de foco ≥2 (RF-02).
- [ ] Cap de 10 sessões detalhadas respeitado + contagem total (RF-02).
- [ ] `schemaVersion` permanece 1 em low-data (RF-05).

### Edge Cases
- [ ] Zero breaks na semana → `mentalState` omitido, relatório normal (RF-02).
- [ ] Zero estudo → `studyWeek` omitido (RF-04).
- [ ] `getBreakFeedbacksBySessionIds` lança → bundle `breakFeedbacks: []`, sem crash (RF-01).
- [ ] Sessão pré-EST-3 (cols null) → totais 0, sem erro (RF-04).
- [ ] Array cru `breakFeedbacks` NÃO vaza pro prompt do LLM (RF-08).
- [ ] Relatório sem dados novos → markdown byte-idêntico ao atual (RF-07).

## Fora de Escopo
- Sharkscope 7d deep analysis (EST-5).
- Planejamento da próxima semana / ritual interativo (EST-5/EST-6).
- Qualquer UI nova (frontend já renderiza markdown; campos novos são tolerados).
- Mudança no Daily Debrief / Monthly Report (apenas weekly nesta sprint; monthly pode herdar depois).
- Mudança de tier gating / entrega (EST-1 cobriu).
- FX→USD: só aplicar se um insight cruzar valor monetário de break com profit (improvável; lesson #6 fica como guarda, não há cálculo monetário novo).
- Migration de banco (nenhuma necessária).

## Dependências
- **EST-3 (landou):** `study_sessions_v2.{handsSolvedCount,filtersAnalyzedCount,statAnalysisEntries,lessonInsights}` + `mode='stat_analysis'`. Migration 0087 local (PROD pendente — não bloqueia EST-2 em dev/local).
- **EST-1 (landou):** entrega do relatório.

## Notas de Implementação (para Architect/Implementer)
- Novas agregações = funções **puras** (testáveis sem DB): `buildMentalState(bundle)`, `buildGrindNotes(bundle)` (ou dentro de mentalState), `buildStudyWeek(bundle)`. Recebem o bundle, retornam a estrutura ou `null`.
- `gatherBundle` adiciona 1 entry no `Promise.all` (RF-01) reusando `sessionIds` das `grindSessions` — **atenção:** `grindSessions` é resolvido DENTRO do mesmo `Promise.all`, então o fetch de break_feedbacks que depende dos ids precisa ser **sequencial após** o `Promise.all` (segunda etapa), OU buscar todos os break feedbacks da semana por janela de data. **Decisão do architect (D-2):** (i) 2 fases (Promise.all → depois break_feedbacks com os ids) — simples, +1 round-trip; ou (ii) adicionar `getBreakFeedbacks` com filtro de data (requer método storage novo). Recomendação: **(i) 2 fases** (sem método storage novo, reusa `getBreakFeedbacksBySessionIds`).
- Métodos storage novos (se houver) seguem lesson #34 (injectedStorage). Mas RF-01 reusa método existente → provavelmente nenhum método novo.
- Ordenação cronológica: `getBreakFeedbacksBySessionIds` ordena `desc(breakTime)` — reordenar ASC antes de first/last (RF-02 critério).
- Agrupar break feedbacks por `sessionId` em memória (não query por sessão).
- `mergeLlm` (linha 807) já faz o pattern de mesclar narrativas — estender para os 2 blocos novos.
- Lessons: #6 (FX, guarda), #7 (optional+degrade), #9 (log antes do fallback), #10 (prompt único/cache), #34 (injectedStorage).

## Decisões abertas para o System-Architect
- **D-1 (custo):** ligar `reportSummarizer` no weekly OU manter desligado confiando na pré-agregação? (Spec recomenda manter desligado.)
- **D-2 (fetch break_feedbacks):** 2 fases pós-`Promise.all` (recomendado) vs novo método storage por data.
- **D-3 (localização de grindNotes):** dentro de `mentalState` (recomendado) vs bloco próprio em `ReportContent`.
- **D-4 (thresholds):** confirmar `fatigueSignal` (delta ≤ -2 em ≥2 sessões), cap 10 sessões, cap 500 chars/nota.
