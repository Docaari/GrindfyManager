# Sprint home-reform-4 — Operations Cockpit Refinement

**Status:** Em planejamento
**Origem:** Feedback founder pos-QA home-reform-3 (2026-05-03)
**Founder:** Ricardo
**Idioma:** codigo EN, UI PT-BR

---

## Contexto

Apos QA do home-reform-3, founder identificou 11 ajustes/novas features na pagina Inicial `/`. Sprint home-reform-4 consolida todas as solicitacoes em ordem de implementacao sequencial.

Founder pediu explicitamente:
- Criar este documento para nao perder o contexto
- Implementar **uma a uma**, sem pressa
- Pipeline TDD nao e obrigatorio para itens triviais (UI-only); features novas (item 4 e 7) seguem pipeline completo

---

## Status Tracker

| # | Item | Status | Tipo | Estimativa |
|---|------|--------|------|------------|
| 1 | Card "Sessoes" mes atual — fix tamanho/espaco | Concluido (2026-05-03) | UI fix | <1h |
| 2 | Novo card "Dashboard" mes atual abaixo do Sessoes | Pendente | Feature | 2-3h |
| 3 | Explicacao "Acao imediata" | Pendente | Doc | 5min |
| 4 | Substituir "Continue assistindo" por recomendacao Coach IA semanal | Pendente | Feature complexa | 1-2 dias |
| 5 | Substituir "Recomendacao de hoje" por visao rapida grade planner | Pendente | Feature | 2-3h |
| 6 | Performance abaixo de Sessoes (mesmo padrao) com empty states | Pendente | UI/refactor | 1-2h |
| 7 | Card Estudos: 3 stats foco do mes + temas linkados | Pendente | Feature complexa | 1-2 dias |
| 8 | Remover card "4 torneios, 2 sessoes, 1 dia ativo" | Pendente | UI fix | 15min |
| 9 | Card "Ultimas Sessoes" abaixo de Sessoes (acima Dashboard) | Pendente | Reorder | 30min |
| 10 | Card Dashboard com grafico evolucao do mes selecionado abaixo | Pendente | Feature | 2h |
| 11 | News: cards nao aparecem, links "Link nao encontrado" | Concluido (2026-05-03) | Bug fix | 1h |

---

## Itens Detalhados

### Item 1 — Card Sessoes: tamanho e espaco

**Problema:** Card "57 torneios (Sessoes)" atual tem tamanho estranho, nao ocupa espaco adequado.

**Aceite:**
- Card ocupa largura full do container (ou compativel com grid)
- Padding consistente com outros cards Onda 1
- Tipografia harmoniosa (numero grande mais visivel)
- Conteudo do card deve ser ajustado conforme item 2 (mes atual + Profit + ROI)

**Arquivos provaveis:** `client/src/components/home/StatusStrip.tsx` ou componente proprio

#### Resolucao (2026-05-03)

- Componente novo `SessionsMonthCard` (full-width rounded-lg border bg-card p-4) com 3 KPIs grandes: Torneios | Profit | ROI + label "Mes: {Mes pt-BR}".
- Backend: `storage.getSessionsMonthAggregate(userId, { monthStart, monthEnd })` agrega `session_tournaments` por site (count + investedNative + returnsNative). Orchestrator `services/sessionsMonth.ts:getSessionsMonthSummary` aplica FX via `fxResolver` + `getCurrencyForSite` -> totals USD + ROI%. Adicionado a `/api/home/overview` (campo `sessionsMonth`).
- Empty state: "Sem sessoes esse mes" quando count=0 ou data null.
- Profit verde/vermelho conforme sinal; ROI null (invested=0) renderiza em-dash sem cor.
- Card linka pra `/grind`.
- Testes: `tests/services/sessionsMonth.test.ts` (4/4) + `client/.../SessionsMonthCard.test.tsx` (7/7). Zero regressao home (78 integration verde).
- Conteudo do card permanece "Sessoes mes atual"; o sibling "Dashboard mes atual" sera adicionado no item 2.

---

### Item 2 — Novo card "Dashboard" abaixo de Sessoes

**Problema:** Founder quer card adicional **abaixo** do card Sessoes que mostre os mesmos KPIs **mas baseados em dados diferentes**.

**Diferenca dados:**
- Card **Sessoes** = dados de sessoes ao vivo (`session_tournaments` ou agregado `grind_sessions`)
- Card **Dashboard** = dados oficiais/historico do dashboard (`tournaments WHERE grind_session_id IS NULL`)

**Ambos exibem:**
- Contagem de torneios
- Profit do mes
- ROI do mes

**Mes atual deve ser claro:** label visivel "Fevereiro 2026" (ou mes corrente). Use `Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })`.

**Aceite:**
- 2 cards consecutivos: Sessoes (acima), Dashboard (abaixo)
- Mesmo layout/padding/tipografia
- Cada card mostra: Contagem | Profit | ROI | label "Mes: {Mes}"
- Backend: 2 endpoints (ou 1 endpoint com 2 sources)
  - GET /api/home/sessions-month — agrega session-related
  - GET /api/home/dashboard-month — agrega tournaments WHERE grind_session_id IS NULL
- Filtro de mes: padrao mes corrente, mas suporta query param `?month=2026-02` futuramente

**Lessons applicar:** §6.1 do CLAUDE.md (regra fonte historico) — NUNCA agregar `session_tournaments` em dashboard, NUNCA esquecer `WHERE grind_session_id IS NULL` em queries de dashboard.

---

### Item 3 — Explicar "Acao imediata"

**Acao requerida:** Apenas explicar ao founder o que e a zona "Acao Imediata" e seu proposito. Sem implementacao.

**Resposta esperada:** Documentar aqui + responder inline ao founder.

**O que e "Acao Imediata":**
A zona 2 do Operations Cockpit (definida na ADR-110) agrupa **componentes que pedem decisao/acao no curto prazo**:
- `PendingHands` — maos imported aguardando review/tag
- `LibraryResume` — episodio em progresso para retomar (sera substituido item 4)
- `TournamentRecommendations` — sugestoes de torneios para registrar agora (sera modificado item 5)

**Filosofia:** zona projetada para "o que voce pode/deve fazer NESTE momento, antes de comecar o grind". Diferente da zona "Hoje" (status passivo) e zona "Performance" (analise retrospectiva).

**Status:** Aguarda confirmacao founder se quer manter conceito ou repensar.

---

### Item 4 — Substituir "Continue assistindo" por Recomendacao Coach IA semanal

**Problema:** Founder testou "Continue assistindo" iniciando um podcast e parando na metade. Episodio nao aparece no card. **Nao funciona.**

**Decisao:** Remover completamente. Substituir por **Recomendacao de Licao** gerada pelo Coach IA, baseada em relatorio semanal.

**Especificacao da nova feature "Recomendacao de Licao":**

#### 4.1 Geracao da recomendacao
- Coach IA analisa relatorio semanal do user (gerado **toda segunda 06:00 BRT**)
- Coach gera 1 recomendacao de licao por semana
- Recomendacao salva em DB (tabela nova: `coach_lesson_recommendations`)
  - `id`, `user_id`, `lesson_id`, `reason`, `weekly_report_id`, `created_at`, `dismissed_at?`, `consumed_at?`

#### 4.2 Exibicao no card
- Card "Recomendacao da Semana" na zona Acao Imediata
- Mostra:
  - Thumbnail do episodio/licao
  - Titulo
  - Justificativa do Coach (1-2 linhas)
  - Tempo estimado / categoria
  - CTA condicional:
    - **Tem acesso liberado:** botao "Assistir agora" ou "Ouvir agora"
    - **NAO tem acesso:** botao "Ver detalhes / Comprar" + tag "Sugestao de compra"

#### 4.3 Ciclo
- 1 recomendacao por semana ate o user consumir OU dismiss
- Apos consumir/dismiss, card vira "Ja consumido essa semana — proxima recomendacao na segunda"
- Reset toda segunda 06:00 BRT junto com o relatorio

#### 4.4 Dependencias
- **Pre-requisito:** relatorio semanal Coach IA (verificar se ja existe — provavel sim apos sprints Coach-1)
- **Pre-requisito:** schema entitlements de Biblioteca (existe apos Biblioteca-1)
- Nova tabela + endpoint + cron job

**Pipeline TDD obrigatorio.** Sub-spec dedicada se necessario.

---

### Item 5 — Visao rapida Grade Planner para Hoje

**Problema:** Card "Recomendacao de hoje" atual nao satisfaz. Founder quer visao operacional rapida do grade planner.

**Especificacao:**

- Card titulo: "Grade do dia — {dd/mm}"
- Filtros perfil: chips `[A | B | C]` (multi-select ou single-select — preferencia single-select, default = perfil ativo do user)
- Stats exibidos:
  - **Quantidade de torneios planejados no dia** (count)
  - **Investimento total** (soma buyins em USD)
  - **ABI** (Average Buy-In = investimento total / count)
- CTA: link "Ver grade completa" -> `/grade-planner`

**Backend:**
- GET `/api/home/grade-today?profile=A|B|C&date=2026-05-03` (date opcional, default hoje BRT)
- Query `planned_tournaments` filtrado por user, data, perfil
- Retorna `{ count, totalInvestmentUsd, abi, profile, date }`

**Aceite:**
- Click chip filtra sem refetch full page
- Quando perfil sem torneios planejados: empty state "Nenhum torneio planejado para perfil X"
- ABI formatado USD com 2 decimais

**Pipeline TDD recomendado.**

---

### Item 6 — Performance abaixo de Sessoes (mesmo padrao)

**Problema:** Card Performance esta separado em zona propria. Founder quer **logo abaixo do card Sessoes**, mesmo padrao visual.

**Decisao:** Performance e o mesmo conceito do "card Dashboard" (item 2). Possivelmente UNIFICAR item 2 e item 6.

**Empty states:**
- Quando user nao reportou nada no mes: **"Sem reports nesse mes"**
- Quando user nao fez upload no mes: **"Sem dados upados esse mes"**

**Aceite:**
- Card Performance/Dashboard (mes atual) imediatamente abaixo do Card Sessoes
- Mesmo layout, mesmo padding, mesma tipografia
- Empty states claros e sem alarmismo

**Nota:** Reorganizar zonas — possivelmente "Hoje" e "Performance" fundem em zona "Estado Atual" com 4 cards verticais (Sessoes, Dashboard/Performance, Ultimas Sessoes, Grafico Evolucao).

---

### Item 7 — Card Estudos: 3 stats foco + temas linkados

**Problema:** Card de estudos atual nao reflete prioridades do user.

**Especificacao da nova feature:**

#### 7.1 Feature pre-requisito: Stats Analyzer "3 stats foco"
- Em `/stats-analyzer`, user pode marcar **3 stats como "foco do mes"**
- Cada stat foco fica linkada a um **tema de estudo** (escolhido pelo user na hora de marcar)
- Schema novo: `user_focus_stats` (user_id, stat_id, study_theme_id, month, created_at)

#### 7.2 Card Estudos no Home
Layout vertical com 3 entradas, cada uma:
1. **Nome da stat** (ex: "C-Bet OOP %")
2. **Valor atual + delta vs mes anterior**
3. **Card do tema de estudo linkado:**
   - Nome do tema (ex: "C-Bet em Heads-Up")
   - **Tempo dedicado no mes atual** (Xh Ymin)
   - Atalho: botao "Estudar agora" -> abre modal de estudo do tema

#### 7.3 Empty state
- Quando user nao definiu 3 stats foco: card mostra "Defina suas 3 stats foco do mes" + CTA -> `/stats-analyzer`

#### 7.4 Dependencias
- Schema `user_focus_stats` + tabela link `study_themes`
- Endpoint GET `/api/home/focus-stats`
- Modal estudo do tema (existe? verificar `client/src/components/study/`)
- Atualizar `/stats-analyzer` para permitir marcacao das 3 stats

**Pipeline TDD obrigatorio.** Sub-spec dedicada provavel.

---

### Item 8 — Remover card "4 torneios, 2 sessoes, 1 dia ativo"

**Problema:** Redundancia com card Sessoes. Founder quer remover.

**Aceite:** Componente removido do Home.tsx. Verificar se ha referencia em outras paginas — se exclusivo Home, deletar arquivo.

**Arquivo provavel:** algum componente em `client/src/components/home/` que renderiza esses 3 contadores. Investigar.

---

### Item 9 — Reordenar: Ultimas Sessoes abaixo de Sessoes (acima Dashboard)

**Aceite:** Ordem vertical:
1. Card Sessoes (mes atual)
2. Card Ultimas Sessoes
3. Card Dashboard (mes atual)
4. Grafico evolucao (item 10)

**Arquivo:** `client/src/pages/Home.tsx` — reorganizar JSX.

---

### Item 10 — Grafico evolucao abaixo do Card Dashboard

**Especificacao:**
- Logo abaixo do Card Dashboard, renderizar grafico de evolucao filtrado pelo **mes selecionado** (default mes corrente)
- Filtros: mesmo seletor de mes do Card Dashboard (sincronizado)
- Y axis: bankroll/profit acumulado
- X axis: dias do mes
- Recharts LineChart, sparkline grande (~280px altura)

**Backend:** GET `/api/home/evolution?month=2026-05` retorna `{ days: [{ date, profit, bankroll }] }`.

---

### Item 11 — News: cards nao aparecem, links quebrados

**Problemas observados:**
- Card "Sinal Externo" **nao aparece mais noticias** (apos refactor home-reform-3)
- Links de acesso aparecem **"Link nao encontrado"**

**Investigacao necessaria:**
- Endpoint `/api/news/feed` retornando dados? (verificar com curl/Network panel)
- Frontend `NewsFeed.tsx` esta consumindo response correto?
- `NEWS_FEED_ENABLED=true` no .env? (default false)
- `XAI_API_KEY` configurado?
- Se sim — por que renderiza "Link nao encontrado"?
- Items tem campo `url` no schema? Backend salvando?

**Aceite:**
- Card mostra noticias quando ha dados ou empty state correto
- Cada item linka para URL real (target=_blank, rel=noopener noreferrer)
- Modal preferencias funciona corretamente
- Verificacao de fontes (Grok provider + Tavily) **fora de escopo deste sprint** — apenas garantir que URLs salvas funcionam

#### Resolucao (2026-05-03)

**Causa raiz:** Grok provider (xAI Responses API sem live search) gera URLs *hallucinated* — caminhos especificos como `mundopoker.com.br/joao-simoes-high-roller-italia` que nao existem. HEAD check em todos os 13 items existentes confirmou 100% dos URLs retornando 404/403/timeout. Isso e que o usuario via como "Link nao encontrado" ao clicar nos cards. "Cards nao aparecem" pode ter sido percepcao secundaria de cards aparentemente quebrados.

**Fix aplicado:**
1. **Migration 0041** (`migrations/0041_news_sources_homepage_url.sql`): adiciona coluna `homepage_url` em `news_sources` + backfill com homepages reais (verificadas) por source.
2. **`server/services/urlValidator.ts`**: helper `isUrlReachable` (HEAD com fallback GET Range em 405) + `resolveItemUrl` (mantem URL se valido, substitui por fallback se quebrado).
3. **`server/storage.ts` `upsertNewsItem`**: agora consulta `homepage_url` da source e valida URL antes de salvar. URL quebrada -> substituida por homepage. Cron `refreshNews` semanal automaticamente passa por essa logica.
4. **Schema TS** (`shared/schema.ts`): adicionado campo `homepageUrl` em `newsSources`.
5. **`scripts/repair-news-urls.ts`**: one-shot pra reparar items existentes (executado: 13 substituidos, 0 mantidos).
6. **Tests**: `tests/services/urlValidator.test.ts` (9 testes verde — HEAD ok/404/500/network-err/405-fallback + resolveItemUrl 3 cenarios).

**Trade-off:** Items com URL hallucinated agora linkam pra homepage da source (mundopoker.com.br, blog.gtowizard.com, etc). Usuario clica no card, pousa na homepage real onde pode navegar pelas noticias. Melhor que 404. Conteudo informativo (titulo + summary + thumbnail) preservado — Grok ainda e util pra essas dimensoes.

**Trabalho futuro (fora de escopo):** Onda 3.5 / sprint News-2 deve migrar grokNewsProvider pra Agent Tools API (web_search/x_search) que retorna URLs reais. Ate la, fallback resolve.

---

## Notas Tecnicas Globais

### Reorganizacao de zonas pos-feedback

Layout atual (home-reform-3):
- Hoje | Acao Imediata | Performance | Sinal Externo

Layout proposto (home-reform-4):
- Hoje (DailyInsight + TodayCard + NextTournament + Grade Planner Quick — item 5)
- Estado do Mes (Sessoes + Ultimas Sessoes + Dashboard + Grafico Evolucao — itens 1, 2, 6, 9, 10)
- Acao Imediata (PendingHands + Recomendacao Coach IA — item 4)
- Estudos (3 stats foco + temas — item 7)
- Sinal Externo (NewsFeed corrigido — item 11)

### Compatibilidade

- Manter ADRs 099-110 referencia
- Itens estruturais (4, 7) merecem ADR proprio
- Migration necessaria: `coach_lesson_recommendations`, `user_focus_stats`

### Estimativa total

~5-7 dias trabalho dependendo de profundidade dos items 4 e 7.

---

## Ordem de Implementacao

1. **Item 11** (bug fix critico — News quebradas) — primeiro porque eh regressao
2. **Item 8** (remover card redundante) — quick win
3. **Item 9** (reorder) — quick win
4. **Item 1** (fix layout card Sessoes) — base para itens 2 e 6
5. **Item 2 + Item 6** (unificar — Card Dashboard com label mes + empty states)
6. **Item 10** (Grafico evolucao mes selecionado)
7. **Item 5** (Grade Planner quick view)
8. **Item 3** (explicacao Acao Imediata + decisao founder)
9. **Item 4** (Recomendacao Coach IA semanal — feature pesada)
10. **Item 7** (3 stats foco + temas estudo — feature pesada)

Apos cada item: tick na tabela Status Tracker + commit isolado para facilitar revert.
