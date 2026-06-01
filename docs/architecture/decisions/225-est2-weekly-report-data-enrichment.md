# ADR-225: EST-2 — Weekly Report Data Enrichment (break_feedbacks + grind notes + estudo EST-3)

## Status
Aceito

## Data
2026-06-01

## Contexto

O Weekly Report do Coach (`server/services/weeklyReportGenerator.ts`) gera narrativa a partir de um "bundle" de 16 fontes coletadas em `gatherBundle()`. Hoje ele **ignora** os dados qualitativos mais ricos que o jogador registra:

- **`break_feedbacks`** — notas mentais 0-10 (`foco/energia/confianca/inteligenciaEmocional/interferencias`) capturadas em cada break de uma sessão de grind. Nunca são carregadas no bundle.
- **`grind_sessions.{finalNotes,preparationNotes,dailyGoals,objectiveCompleted}`** + médias `focoMedio/...Media` — as rows já vêm no bundle (`grindSessions`), mas `buildSections()` só usa `status`.
- **Métricas de estudo EST-3** (`handsSolvedCount/filtersAnalyzedCount/statAnalysisEntries/lessonInsights`) — `studySessionsV2` já vem no bundle, mas só `durationMinutes` e `themeId` são agregados.

O founder quer que o mentor "leia" essas notas como um coach humano: detectar queda de foco/energia ao longo da sessão (leak de fadiga), correlacionar notas de fim de grind com performance, e mostrar o esforço de estudo da semana.

Restrições verificadas:
- `ReportContent` (`shared/schema.ts:5473`) é interface TS pura → JSONB `reports.content` aceita shape novo **sem migration**.
- Weekly **não** aplica `reportSummarizer` hoje (só monthly/daily). O bundle inteiro vira `JSON.stringify` no prompt (lesson #10 — prefixo do system prompt estável p/ cache Anthropic).
- `getBreakFeedbacksBySessionIds(userId, sessionIds[])` existe, ordena `desc(breakTime)`, `[]` se vazio.
- `grindSessions` é resolvido **dentro** do `Promise.all` de `gatherBundle` — break_feedbacks dependem dos `id` dessas sessões.

## Decisões

### D-1 — Custo: NÃO ligar `reportSummarizer` no weekly. Pré-agregação determinística.
As novas agregações (`buildMentalState`/`buildStudyWeek`/grind notes) produzem **números, deltas e contagens bounded** (cap 10 sessões), nunca arrays brutos de N breaks. O array cru `breakFeedbacks` fica **fora** do objeto serializado ao LLM — só alimenta o cálculo determinístico. Resultado: o bundle cresce em estrutura pequena (~1-3 KB no caso típico ≤10 sessões), bem abaixo do threshold de 20K que aciona summarizer.

- **Rejeitado** ligar `reportSummarizer.summarizeBundle` no weekly: adicionaria custo Haiku por relatório, latência, e **risco de o Haiku descartar justamente os deltas mentais** (a estrutura é o valor; o summarizer é otimizado p/ "agregar listas longas de torneios", não p/ preservar séries de 5 dims × N sessões).
- **Guarda futura:** se telemetria de custo (admin `report-cost-metrics`) mostrar usuários de altíssimo volume estourando 20K, ligar o summarizer no weekly vira follow-up trivial (1 wire, paridade monthly). Documentado como pendência, não implementado.

### D-2 — Fetch break_feedbacks: 2 fases pós-`Promise.all`.
`gatherBundle` mantém o `Promise.all` atual (resolve `grindSessions` entre outras), e **depois** faz uma segunda etapa: coleta `sessionIds` das `grindSessions` da semana e chama `getBreakFeedbacksBySessionIds(userId, sessionIds)` dentro de `safe(...)`. +1 round-trip sequencial, custo desprezível (1 query batch).

- **Rejeitado** novo método storage `getBreakFeedbacks(userId, {from,to})` por data: exigiria método novo + index review, e a janela por `sessionIds` é mais precisa (só breaks das sessões da semana, não breaks órfãos de sessão fora da janela).
- Se `sessionIds` vazio → não chama (helper retorna `[]`). Erro → `[]` (lesson #9, log antes).

### D-3 — `grindNotes` vive **dentro** de `mentalState`.
Coesão semântica: notas de fim de grind + médias mentais + séries de break são todas "estado mental/operacional da semana". `mentalState.grindNotes` evita um terceiro top-level field em `ReportContent`. O renderer trata os dois sub-blocos sob o header "Estado mental da semana".

### D-4 — Thresholds confirmados.
- `fatigueSignal = true` ⟺ **≥2 sessões** da semana com `foco.delta <= -2` **OU** `energia.delta <= -2`. (delta = last − first; queda de ≥2 pontos numa escala 0-10 é material.)
- **Cap 10 sessões** detalhadas em `mentalState.sessions` e `grindNotes` (as mais recentes por data desc). Excedente → só contagem (`totalSessionsWithBreaks` / `totalSessionsWithNotes`).
- **Cap 500 chars** por nota textual (`finalNotes/preparationNotes/dailyGoals`), com sufixo `…` quando truncado.
- **Cap top 8** temas em `studyWeek.timeByTheme` (por minutos desc).
- Arredondamento: `avg`/`weeklyAvg`/`delta` a 1 casa decimal; `objectiveHitRate` inteiro (%).

## Shape exato (contrato test-writer ↔ implementer)

Adicionar a `ReportContent` (`shared/schema.ts`), após `sessionSummary?`, seguindo o padrão dos campos opcionais AI-1C:

```ts
// EST-2 (ADR-225) — Weekly Report Data Enrichment. Opcionais (lesson #7);
// renderer + frontend toleram ausencia. Popular qualquer um => schemaVersion=2.

/** Uma dimensao mental 0-10 dentro de uma sessao. delta = last - first. */
export interface ReportMentalDim {
  first: number;
  last: number;
  avg: number;   // 1 casa decimal
  delta: number; // last - first, 1 casa decimal
}

export interface ReportMentalSession {
  sessionId: string;
  date: string;               // ISO (data da sessao)
  dims: {
    foco: ReportMentalDim;
    energia: ReportMentalDim;
    confianca: ReportMentalDim;
    inteligenciaEmocional: ReportMentalDim;
    interferencias: ReportMentalDim;
  };
  breakCount: number;         // breaks nesta sessao
}

export interface ReportGrindNote {
  sessionId: string;
  date: string;               // ISO
  finalNotes?: string;        // truncado 500
  preparationNotes?: string;  // truncado 500
  dailyGoals?: string;        // truncado 500
  objectiveCompleted?: boolean;
}

export interface ReportMentalState {
  weeklyAverages: {           // media de TODOS os breaks da semana, por dim (1 casa)
    foco: number | null;
    energia: number | null;
    confianca: number | null;
    inteligenciaEmocional: number | null;
    interferencias: number | null;
  };
  breakCount: number;                 // total de breaks na semana
  totalSessionsWithBreaks: number;    // pode ser > sessions.length (cap 10)
  fatigueSignal: boolean;
  sessions: ReportMentalSession[];    // cap 10, mais recentes
  grindNotes: ReportGrindNote[];      // cap 10; [] se nenhuma nota
  objectiveHitRate: number | null;    // % inteiro; null se nenhum objectiveCompleted definido
  narrative?: string;                 // preenchido pelo LLM
}

export interface ReportStudyWeek {
  sessionCount: number;
  minutesLogged: number;
  handsSolvedTotal: number;
  filtersAnalyzedTotal: number;
  statAnalysisEntriesTotal: number;
  statAnalysisSessionCount: number;
  lessonInsightsCount: number;
  timeByTheme: Array<{ themeId: string; minutes: number }>; // cap 8, minutos desc
  narrative?: string;
}

// dentro de interface ReportContent:
//   mentalState?: ReportMentalState;
//   studyWeek?: ReportStudyWeek;
```

### Regras de população
- `buildMentalState(bundle)` → `ReportMentalState | null`. Retorna `null` se **zero** break feedbacks na semana **E** zero grind notes/objectives (nada a dizer). Se há breaks mas sem notas → `grindNotes: []`. Se há notas mas sem breaks → `sessions: []`, `weeklyAverages` todos `null`, `fatigueSignal: false`, mas o bloco existe (notas valem).
  - **Refinamento:** o bloco é omitido (`null`) somente quando NÃO há breaks E NÃO há nenhuma grind note nem objective definido. Caso contrário retorna estrutura (campos vazios degradados).
- `buildStudyWeek(bundle)` → `ReportStudyWeek | null`. Retorna `null` se `studySessions.length === 0`.
- Em `generateWeeklyReport`: se `buildMentalState` **ou** `buildStudyWeek` ≠ null → `schemaVersion = 2`; senão `1`.
- Ordem cronológica: agrupar breaks por `sessionId`, ordenar **ascendente** por `breakTime` (input vem `desc`) antes de pegar `first`/`last`.
- `weeklyAverages` = média sobre TODOS os breaks da semana (não média das médias por sessão); `null` se zero breaks.

## Opções consideradas (resumo)

### D-1: summarizer no weekly vs pré-agregação
- **Pré-agregação (escolhida):** Prós — barato, determinístico, preserva estrutura, zero custo Haiku extra. Contras — lógica determinística a mais (testável, ok).
- **Summarizer Haiku:** Prós — paridade monthly, lida com qualquer volume. Contras — custo+latência por relatório, risco de descartar deltas, complexidade.

### D-2: 2 fases vs método por data
- **2 fases (escolhida):** Prós — reusa método existente, janela precisa por sessão. Contras — +1 round-trip (desprezível).
- **Método por data:** Prós — 1 fase. Contras — método storage novo + index, pega breaks órfãos.

## Consequências

**Positivas:**
- Mentor passa a correlacionar estado mental ↔ performance (valor central do produto).
- Zero migration, zero endpoint novo, zero UI nova (frontend renderiza markdown).
- Back-compat total: relatórios sem dados novos ficam byte-idênticos (`schemaVersion` 1).
- Funções puras testáveis sem DB.

**Negativas:**
- Bundle cresce (bounded). Telemetria de custo deve ser observada pós-deploy.
- Cap de 10 sessões pode esconder detalhe de jogadores de altíssimo volume (mitigado por contagem total + médias semanais completas).

**Neutras:**
- Monthly Report poderia herdar `mentalState`/`studyWeek` no futuro (fora de escopo EST-2).
- Se volume estourar 20K → ligar summarizer no weekly vira follow-up de 1 linha.

## Confiança
Alta — contratos do código verificados, sem migration, padrão de extensão idêntico ao AI-1C já em produção.
