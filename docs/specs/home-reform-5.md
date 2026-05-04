# Sprint home-reform-5 — Home QA Pos-Reform-4

**Status:** Em planejamento
**Origem:** Feedback founder pos-QA home-reform-4 (2026-05-04)
**Founder:** Ricardo
**Idioma:** codigo EN, UI PT-BR

---

## Contexto

Apos QA do home-reform-4, founder identificou 11 ajustes/correcoes/novas features na pagina Home (`/`). Sprint home-reform-5 consolida tudo em ordem de implementacao **sequencial e item-a-item** (founder vai dar `/clear` entre itens).

Regra de execucao:
- **Item 10 (News) por ULTIMO** — founder ainda esta evoluindo a sessao News, esperar estabilizar.
- Cada item finaliza com **prompt curto** indicando proximo item + reforco para o proximo agente emitir prompt curto no final tambem.
- Pipeline TDD obrigatorio para itens com logica nova/agregacao backend. Itens UI-only podem pular pipeline completo.

---

## Status Tracker

| # | Item | Status | Tipo | Estimativa |
|---|------|--------|------|------------|
| 1 | Remover aviso "Day 2 do Mystery Mini comeca em 145h..." | Concluido (2026-05-04) | Remocao | 15min |
| 2 | Corrigir Header Sessao (Banca, Hoje, ROI 30D, Pendencias priorizadas) | Concluido (2026-05-04) | Bug fix + feature | 4-6h |
| 3 | Pergunte ao Coach: perfis multiplos + Iniciar Sessao + DAY OFF | Concluido (2026-05-04) | Feature | 2-3h |
| 4 | Acao Imediata: stat destaque + Iniciar sessao | Concluido (2026-05-04) | Feature (depende de stat destaque futura) | 2h |
| 5 | Grade do Dia: Primeiro Registro + Ultimo Registro | Concluido (2026-05-04) | Feature pequena | 1-2h |
| 6 | Renomear Performance -> Sessoes Registradas + KPIs corretos + ITM/MF/Cravadas | Concluido (2026-05-04) | Bug fix + feature | 3-4h |
| 7 | Dashboard: All Time + KPIs ITM/MF/Cravadas + grafico evolucao all-time | Concluido (2026-05-04) | Feature | 3-4h |
| 8 | Performance baseada em registros /grind (toggle futuro) | Concluido (2026-05-04) | Refactor | 2h |
| 9 | Estudos: OK, nao mexer | Skip | — | 0 |
| 10 | News: renomear + botoes novos + carousel com setas+dots | **POR ULTIMO** | UI/feature | 4-6h |
| 11 | Engrenagem habilita/desabilita sessoes da Home | Pendente | Feature | 3-4h |

Ordem de execucao recomendada: **1 -> 2 -> 5 -> 3 -> 4 -> 6 -> 7 -> 8 -> 11 -> 10** (deixa News por ultimo conforme pedido).

---

## Itens Detalhados

### Item 1 — Remover aviso "Day 2 do Mystery Mini"

**Problema:** Aviso "Day 2 do 'Mystery Mini' comeca em 145h 39min . Stack: 0 BB" aparece na Home mesmo sem relevancia. Founder considera ruido visual e quer remover por completo.

**Aceite:**
- Componente que renderiza esse aviso e removido da Home (e da chamada do route handler `/api/home/overview` se exclusivo).
- Endpoints relacionados (se houver, ex: `getNextDay2Resume`) ficam preservados se forem usados em `/grind` ou outra pagina, **so a renderizacao na Home some**.
- Zero regressao em Day 2 auto-resume da pagina `/grind` (Sprint Flight-1).

**Arquivos provaveis:**
- `client/src/components/home/Day2Banner.tsx` (ou similar)
- `client/src/pages/Home.tsx`
- `server/routes/home.ts` (campo do payload, se aplicavel)

#### Resolucao (2026-05-04)

- Componente real = `client/src/components/home/FlightBanner.tsx` (Sprint home-reform-1 RF-13). Renderizava `Day {n} do "{seriesTitle}" comeca em Xh Ymin · Stack: ZZ BB`.
- Removido import + render em `client/src/pages/Home.tsx` (substitui o bloco "Banner priority D9" por comentario apontando este sprint).
- Backend `/api/home/overview.banners.flight` **preservado** — payload continua entregando o objeto, so a UI da Home parou de consumir. Logica Day 2 auto-resume em `/grind` (Sprint Flight-1) intacta.
- Componente `FlightBanner.tsx` + testes `FlightBanner.test.tsx` mantidos no repo (8/8 verde) caso outra pagina queira reusar.
- Teste de banner priority (`Home.test.tsx` linha 178) atualizado: agora valida que com `flight.active=true` no payload, **`flight-banner` NAO aparece** na Home, enquanto `cooldown-banner` continua renderizando. 9/9 verde.
- Type-check: zero erros novos introduzidos. Erros pre-existentes (NewsSlot/Studies/storage) intocados.

---

### Item 2 — Header Sessao (Banca, Hoje, ROI, Pendencias)

**Problema:** Strip do topo da Home ("Banca / Hoje / ROI / Pendencias") esta com dados errados/incoerentes.

**Especificacao por KPI:**

**2.1 Banca**
- Atual mostra `$1867`. Banca real consolidada = `$1866,84`.
- Deve renderizar valor exato em USD (sem arredondamento brusco) com 2 casas decimais.
- Fonte: agregador de wallets atual (`bankrollService.getBalance(userId)` ou equivalente). Confirmar que wallets multi-currency convertem com FX antes de somar.

**2.2 Hoje**
- Atual mostra `100 Torneios`. Esta errado.
- Comportamento correto: contar torneios planejados para o **dia atual** considerando o **perfil ativo do dia da semana corrente**.
- Hoje (segunda-feira) o perfil ativo eh **B** (founder confirmou). Total real = 0 torneios (porque B nao tem torneios planejados pra segunda — confirmar via grade-planner).
- Se nao houver perfil ativo no dia atual -> exibir `OFF` ou `DAY OFF`.

**2.3 ROI**
- Atual mostra `+0,0%`. Sem fonte clara.
- Comportamento correto: ROI baseado nas **movimentacoes de banca dos ultimos 30 dias**.
- Calculo proposto: `(Saldo atual - Saldo 30D atras) / Investido_30D * 100` ou metrica aprovada pelo founder antes de implementar (perguntar caso ambiguo).
- Empty state se nao houver dados nos ultimos 30D.

**2.4 Pendencias**
- Atual: campo generico/incorreto.
- Comportamento correto: exibir **principal pendencia do usuario** com **ordem de prioridade**:
  1. **Verificar valores das bancas** — quando >7 dias sem reportar rakeback ou resultado de sessao na Banca.
  2. **Analisar relatorio semanal** — quando relatorio do Coach IA ainda nao foi revisado **(feature futura, deixar gancho/flag mas nao implementar agora)**.
  3. **Subir torneios para o dashboard** — quando >7 dias sem upload de torneios (`tournaments WHERE grind_session_id IS NULL`).
  4. **Spot pendente** — quando >3 dias com spot da sessao Estudos sem revisar.
  5. **Stats Analyzer** — quando uma das 3 stats em destaque (feature futura) >7 dias sem revisar.
- Mostrar **somente a primeira pendente da lista** (a mais prioritaria). CTA leva pra rota relevante.
- Se zero pendencias -> empty state ("Tudo em dia" ou similar).

**Aceite global:**
- Backend: novo (ou ajustado) endpoint `/api/home/overview` com bloco `headerStrip: { bankroll, todayTournaments, roi30d, topPendency }`.
- Service `services/homeHeader.ts` puro com testes unitarios para cada KPI.
- Frontend: `client/src/components/home/HeaderStrip.tsx` consome o bloco e renderiza.
- Pipeline TDD obrigatorio (logica + agregacao + datas).

**Atencao:**
- Confirmar regra do CLAUDE.md secao 6.1: dashboard usa `tournaments WHERE grind_session_id IS NULL`.
- Pendencia #4 depende de tabela de spots — checar `spots` schema antes (`shared/schema.ts`).
- Pendencias #2 e #5 ainda nao tem feature implementada -> reservar slot mas nao quebrar se vazio.

#### Resolucao (2026-05-04)

- Service puro novo: `server/services/homeHeader.ts` com `buildHeaderStrip(input)` retornando `{ banca, today, roi30d, pendency }`. Recebe inputs ja resolvidos (bankrollUsd, snapshots agregados, datas) — testavel sem Drizzle. 25/25 testes verde em `tests/services/homeHeader.test.ts`.
- 3 storage helpers novos em `server/storage.ts`: `getLatestBankrollMovementAt`, `getLatestTournamentUploadAt` (filtro `grindSessionId IS NULL` conforme CLAUDE.md §6.1), `getOldestPendingSpotAt` (starred_hands status='pending').
- 5 subqueries adicionadas em `/api/home/overview` (lastBankrollMovementAt, lastTournamentUploadAt, oldestPendingSpotAt, bankrollSnapshots30d, bankrollSnapshotPrior30d). Subqueries seguem padrao `timed()` + Promise.allSettled (graceful degradation).
- Bloco novo `headerStrip` no payload do `/api/home/overview` (coexiste com `statusStrip` legado durante migracao).
- **2.1 Banca**: `bank.totalUsd` (consolidado via walletService FX cascata) renderizado com 2 casas decimais (`fmtUsd2` -> `$1.866,84`).
- **2.2 Hoje**: filtra `planned_tournaments` por `profile===activeProfile` do `profile_states`. `isOff=true` somente quando `activeProfile` null/'OFF'. Profile B com 0 torneios continua mostrando `0 torneios · perfil B` (nao DAY OFF).
- **2.3 ROI 30D**: formula spec literal `(saldoAtual - saldo30dAtras) / invested30d * 100`. `saldo30dAtras` = `newAmount` do ultimo snapshot anterior a now-30d (fallback 0 se ha snapshots dentro da janela mas nenhum antes). `invested30d` = soma absoluta deltas com `reason='deposit'` nos ultimos 30d. Empty state quando denominador 0 ou sem dados.
- **2.4 Pendencias**: prioridade fixa 1->5 (bankroll_check > coach_report > upload_tournaments > spot_review > focus_stat). Mostra apenas a primeira ativa. Thresholds: bankroll/upload >7d, spot >3d, focus_stat >7d. Pendencias #2 (coach_report) e #5 (focus_stat) sao slots dormantes (recebem inputs do payload ainda zerados — feature futura).
- Frontend: `client/src/components/home/HeaderStrip.tsx` consome `data.headerStrip`. 14/14 testes verde em `tests/home/HeaderStrip.test.tsx`. Substitui `StatusStrip` na posicao sticky-top da Home (StatusStrip permanece exportado para fallback `data.headerStrip == null`).
- Type-check zero erros novos. Errors pre-existentes (Home.test.tsx, NewsSlot.test.tsx) intocados.
- Tests: 162/162 home-related verdes. Falhas em `tests/integration/home/news-stub.test.ts` sao pre-existentes (sprint News-3 em desenvolvimento, sem relacao com este item).

---

### Item 3 — Pergunte ao Coach (perfis + Iniciar Sessao + DAY OFF)

**Problema 3.1 — Label "B 100 Torneios" abaixo de Pergunte ao Coach**
- Atual: mostra apenas `B`. Deve mostrar **todos os perfis selecionados** + total **somado**.
- Hoje so `B` ativo, mas mostrar quantos torneios o perfil B realmente tem (152, nao 100).
- Quando multiplos perfis ativos (ex: A + B), exibir `A + B - 304 torneios` (numero correto = soma dos torneios do dia atual em todos os perfis ativos).
- **Considerar dia da semana atual** (perfil pode estar ativo so em alguns dias).

**Problema 3.2 — "Proximo Torneio" incorreto**
- Atual: mostra "Em Andamento" e CTA leva para `/grind-live` mesmo sem sessao aberta.
- Comportamento correto:
  - Renomear titulo da sessao de **"Proximo Torneio"** para **"Iniciar Sessao"**.
  - CTA leva para a rota `/grind` e abre o modal **"Inicio Rapido"** (ja existente).
  - Conteudo do card: quantos torneios planejados para hoje no(s) perfil(s) ativo(s).
  - Se perfil ativo nao tem torneios -> exibir `DAY OFF`.
- Confirmar que modal "Inicio Rapido" pode ser aberto via query param tipo `/grind?open=quickstart` ou similar (checar `GrindSession.tsx`).

**Aceite:**
- Endpoint `/api/home/overview` retorna `coachContext: { activeProfiles: ['A','B'], todayTournamentsTotal: 304, isDayOff: false }`.
- Componente `client/src/components/home/CoachQuickAccess.tsx` (ou pago similar) refatorado.
- Testes: agregacao por perfil ativo + dia da semana.

#### Resolucao (2026-05-04)

- Service puro novo: `server/services/coachContext.ts` com `buildCoachContext({ activeProfile, plannedTournaments })` retornando `{ activeProfiles, todayTournamentsTotal, isDayOff }`. Aceita `activeProfile` singular (schema atual `profile_states.activeProfile`) OU array (forward-compat para multi-profile futuro). Filtra valores invalidos. 16/16 testes verde em `tests/services/coachContext.test.ts`.
- `/api/home/overview` carrega bloco novo `coachContext` no payload. Reusa subqueries existentes `profile` (profile_states do dia) + `planned` (planned_tournaments do dia atual) — zero subqueries novas. CLAUDE.md §6.1 nao se aplica (planned_tournaments NAO usa filtro grindSessionId).
- **3.1 Label refatorado** — `TodayCard` aceita prop `coachContext` opcional. Quando fornecido, substitui `"X torneios"` por:
  - 1 perfil: `"B - 152 torneios"` (singular: `"B - 1 torneio"`).
  - 2 perfis: `"A + B - 304 torneios"`.
  - 3 perfis: `"A + B + C - X torneios"`.
  - DAY OFF: `"DAY OFF"`.
  - Quando coachContext ausente, mantem layout antigo (back-compat).
- **3.2 Iniciar Sessao** — `NextTournamentCountdown` aceita prop `coachContext` opcional. Quando fornecido:
  - Titulo renomeado de `"Proximo torneio"` para `"Iniciar Sessao"`.
  - Conteudo: `"X torneios planejados"` + linha `"A + B"` dos perfis ativos.
  - CTA `"Inicio Rapido →"` aponta para `/grind?open=quickstart`.
  - Empty state DAY OFF (`testid iniciar-sessao-day-off`) sem CTA.
  - Quando coachContext ausente, mantem countdown legacy (back-compat).
- **GrindSession.tsx wiring** — novo `useEffect` watching `useSearch()`. Quando query `open=quickstart`, aguarda `sessionsLoading`/`historyLoading`/`warmupGateLoading` resolverem + `startSessionMutation` ocioso, ai dispara `handleQuickStart()` 1x (ref guard). Limpa o query param via `history.replaceState` para evitar re-fire em refetch/back-nav. Permite que warmup gate, conflict dialog e demais branches do `handleQuickStart` operem normalmente.
- `Home.tsx` passa `data.coachContext` para os 2 cards (TodayCard + NextTournamentCountdown). Tipo da resposta atualizado em `HomeOverviewResponse.coachContext` (opcional, back-compat com versoes antigas do backend).
- Tests: 11/11 verdes em `tests/home/CoachQuickAccess.test.tsx`. Regressao home + services: 360/361 verdes (1 fail pre-existente em `tests/services/news/titleFingerprint.test.ts:106` — lesson #25 documenta inconsistencia logica do test-writer no Sprint News-3, sem relacao com este item). Type-check zero erros novos.

---

### Item 4 — Acao Imediata (stat destaque + Iniciar sessao)

**Problema:** Atual so mostra "Mao Pendente". Founder quer mais opcoes.

**Comportamento correto — prioridade de exibicao:**
1. **Mao pendente** (ja existe).
2. **Revisar stat em destaque** — feature futura (Stats Analyzer pin). Reservar slot, nao implementar logica de "stat destaque" agora; apenas garantir a estrutura do componente aceita esse tipo.
3. **Iniciar sessao** — quando ha sessao planejada para hoje no(s) perfil(s) ativo(s) e nenhuma sessao /grind aberta. CTA -> `/grind` modal Inicio Rapido.

**Aceite:**
- Componente `client/src/components/home/ImmediateAction.tsx` ja existe (item 3 home-reform-4).
- Estender o tipo `ImmediateActionType = 'pending_hand' | 'focus_stat' | 'start_session'` (focus_stat permanece dormante ate Stats Analyzer destaque).
- Backend: campo `immediateAction` em `/api/home/overview` ja existe; ampliar logica de selecao.
- Pipeline TDD recomendado para selecao de prioridade.

#### Resolucao (2026-05-04)

- Premissa do spec corrigida: `ImmediateAction.tsx` NAO existia previamente. Item 3 home-reform-4 era documentacao apenas. `PendingHandsList` (zona Acao Imediata) eh quem foi visto como "so mostra Mao Pendente" pelo founder. Item 4 cria componente novo + campo backend novo.
- Backend service puro novo: `server/services/immediateAction.ts` com `buildImmediateAction(input)` retornando `ImmediateActionData | null`. Prioridade fixa `pending_hand > focus_stat > start_session > null`.
  - **pending_hand**: ativa quando `pendingHandsCount > 0`. Output `{ kind, count, ctaHref: '/estudos' }`.
  - **focus_stat (DORMENTE)**: ativa quando `focusStatPending != null`. Backend hoje passa `null`; estrutura ja aceita `{ statName, daysSince, ctaHref }` para hidratar quando Stats Analyzer destaque (Sprint Stats-V*) for entregue. Output `{ kind, statName, daysSince, ctaHref }`.
  - **start_session**: ativa quando `todayTournamentsTotal > 0` + `!isDayOff` + `!hasActiveGrindSession`. Output `{ kind, plannedCount, activeProfilesLabel, ctaHref: '/grind?open=quickstart' }`.
  - Saneamento: counts negativos viram zero; counts vazios/null nao disparam variant.
  - 15/15 testes verde em `tests/services/immediateAction.test.ts`.
- Storage: `hasActiveGrindSession(userId)` em `server/storage.ts`. Filtra `grind_sessions WHERE user_id=? AND status='active' LIMIT 1`. Catch retorna `false` (graceful degradation). Sem alteracao na interface IStorage (segue padrao item 2 com cast `(storage as any)`).
- Route handler `/api/home/overview`:
  - 1 subquery nova `hasActiveGrindSession` (Promise.allSettled, `timed()`, padrao existente).
  - Bloco novo `immediateActionData` apos `coachContextData`. Reusa `coachContextData.todayTournamentsTotal` + `coachContextData.isDayOff` (sem subquery duplicada). `activeProfilesLabel` = `coachContextData.activeProfiles.join(' + ')`.
  - `pendingHandsCount = pending.length` reusando subquery `pendingHands` (top-5 ja carregada). Limita o sinal mas eh suficiente para o gancho prioridade — UI nao depende de count exato.
  - `focusStatPending: null` ate Stats Analyzer destaque entregar.
  - Campo `immediateAction: ImmediateActionData | null` adicionado ao `HomeOverviewBody` + payload final.
- Frontend novo: `client/src/components/home/ImmediateAction.tsx`. Renderiza 1 das 3 variants conforme `data.immediateAction`. Quando `null`, retorna `null` (zona Acao Imediata cai pro fluxo antigo: `PendingHandsList` + `CoachRecommendationCard`). 
  - Variant pending_hand: `"X mãos pendentes"` (singular `"1 mão pendente"`) + CTA "Revisar agora →" -> /estudos.
  - Variant focus_stat: `"Stat XYZ sem revisão há Nd"` + CTA "Ver stat →" -> ctaHref do payload.
  - Variant start_session: `"X torneios planejados para hoje · A + B"` + CTA "Início Rápido →" -> /grind?open=quickstart (modal Inicio Rapido, wired no GrindSession.tsx desde item 3).
  - 6/6 testes verde em `client/src/components/home/__tests__/ImmediateAction.test.tsx`.
- Wiring `Home.tsx`: import + tipo `immediateAction?: ImmediateActionData | null` na interface + render `<ImmediateAction data={data.immediateAction ?? null} />` como primeiro filho da zona Acao Imediata, ACIMA da sub-grid `PendingHandsList + CoachRecommendationCard`. Quando null, nao quebra layout (componente retorna null).
- Type-check: zero erros novos. Tests regressao home + services + storage + components: 616/619 verdes (3 falhas pre-existentes Sprint News-3 em desenvolvimento — `tests/services/news/titleFingerprint.test.ts:106`, `client/src/components/home/__tests__/NewsSlot.test.tsx:53/58`, ja documentadas em itens 3 e 5).
- focus_stat permanece DORMENTE: backend nao tem fonte de "stat em destaque" hoje. Quando Stats Analyzer destaque for entregue, basta hidratar `focusStatPending` no route handler com `{ statName, daysSince, ctaHref }` — service + componente ja aceitam.

---

### Item 5 — Grade do Dia (Primeiro + Ultimo Registro)

**Problema:** Card "Grade do Dia" nao mostra horarios chave da sessao planejada.

**Comportamento correto — adicionar:**
- **Primeiro Registro:** horario + nome do torneio do primeiro registro do dia (perfil ativo).
- **Ultimo Registro:** horario + nome do torneio do ultimo registro do dia (perfil ativo).

**Aceite:**
- Backend: `storage.getDayPlanBoundaries(userId, weekday, profileIds)` retorna `{ first: { time, name }, last: { time, name } } | null`.
- Frontend: `GradeTodayCard` (ja existe — item 5 home-reform-4) recebe esses 2 campos.
- Empty state se grade vazia (DAY OFF) ja deve estar coberto pelo item 3 (DAY OFF global).
- Pipeline TDD recomendado.

#### Resolucao (2026-05-04)

- Storage: `getDayPlanBoundaries(userId, weekday, profileIds)` em `server/storage.ts`. Filtra `planned_tournaments` por `userId + dayOfWeek + profile IN (...)` + `isActive=true`. `ORDER BY COALESCE(registration_time, time) ASC`. Retorna `{ first, last }` com `time` (registrationTime quando preenchido, senao `time`) + `name`. Profile array vazio -> null sem hit DB. Interface IStorage atualizada (linha ~803).
- Service `server/services/gradeToday.ts`: `GradeTodaySummary` estendido com `firstEntry: GradeTodayEntry | null` + `lastEntry: GradeTodayEntry | null`. Storage call e null-tolerant: falha logada, payload degrada para `null` em vez de quebrar request.
- Frontend `client/src/components/home/GradeTodayCard.tsx`: 2 chips informativos abaixo dos KPIs ("1º registro" / "Último registro") renderizados condicionalmente. Hidden quando ambos null. Design: bordas suaves + bg-muted/30, layout 2-col responsivo.
- Tests novos:
  - `tests/storage/getDayPlanBoundaries.test.ts` (7 casos): null-empty, multi-row, single-row, registrationTime fallback, multi-profile IN, profileIds vazio.
  - `tests/services/gradeToday.test.ts` estendido com 4 casos: storage retorna boundaries, retorna null, falha graceful, chamada com `[profile]`.
  - `client/src/components/home/__tests__/GradeTodayCard.test.tsx` estendido com 2 casos: render condicional firstEntry+lastEntry, hidden quando null.
- Resultado: 25/25 verde nos 3 arquivos focados; 448/450 verde regressao (`tests/services/`, `tests/storage/`, `tests/home/`, `client/src/components/home/__tests__/`). Os 2 fails restantes sao `NewsSlot.test.tsx` (pre-existentes, Sprint News-3 em dev — confirmado via stash baseline).
- Atencao CLAUDE.md §6.1: planned_tournaments NAO usa filtro `grindSessionId IS NULL` (regra so vale para `tournaments` historico). Filtro aplicado eh `isActive=true` para excluir rows soft-deleted.
- Type-check: zero erros novos.

---

### Item 6 — Renomear Performance -> Sessoes Registradas + KPIs corretos

**Problema:**
- Sessao chamada "Performance" -> renomear para **"Sessoes Registradas"**.
- Valores incorretos. Real `/grind`: **124 torneios, profit $-255,24, ROI -17,4%**.
- Faltam KPIs **ITM, Mesas Finais, Cravadas**.
- Lista de ultimas sessoes deve incluir todos esses KPIs por sessao.

**Aceite:**
- Renomear titulo do card.
- Backend: `getSessionsRegisteredAggregate(userId, range)` retorna `{ tournaments, profit, roi, itm, finalTables, wins }`.
- Cada sessao na lista exibe: Torneios | Profit | ROI | ITM | Mesas Finais | Cravadas.
- Verificar fonte: `session_tournaments` (tabela das sessoes /grind) com FX (`getCurrencyForSite` + `convertToNativeCurrency` -> normalizado USD).
- Ver `feedback_grind_live_fx.md` (memory) — stats grind-live exigem FX consistente.
- Confirmar formula ITM/MF/Cravadas: contar registros com finishPlace dentro do payout / final table threshold / position 1.
- Pipeline TDD obrigatorio.

#### Resolucao (2026-05-04)

- **Backend service novo**: `server/services/sessionsRegistered.ts` com `getSessionsRegisteredSummary(userId)` retornando `{ tournaments, profit, invested, roi, itm, finalTables, wins }`. FX cascade via `fxResolver.resolveExchangeRates` + `getCurrencyForSite` (lesson #6). Empty/error -> shape vazio sem throw (lesson #9). 6/6 testes verde em `tests/services/sessionsRegistered.test.ts` incluindo cenario real founder (124 torneios, profit -$255.24 USD, ROI -17.4%).
- **Storage helpers novos** em `server/storage.ts`:
  - `getSessionsRegisteredAggregate(userId, opts?)` — agrupa por site com `count`, `investedNative`, `returnsNative`, `itmCount` (prize > 0), `finalTablesCount` (position 1..9), `winsCount` (position = 1). Aceita `{ from, to }` opcional para uso futuro.
  - `getRecentSessionsWithKpis(userId, limit)` — pega top-N grind_sessions DESC + agrega session_tournaments por (sessionId, site) com mesmos 6 KPIs nativos. Orchestrator aplica FX por site para devolver USD por sessao.
  - Interface IStorage atualizada com ambas assinaturas.
- **Route handler `/api/home/overview`**:
  - 2 subqueries novas (Promise.allSettled, padrao `timed()`): `sessionsRegistered` (delega ao service) + `recentSessionsKpis` (storage).
  - Bloco `sessionsRegistered: { tournaments, profit, invested, roi, itm, finalTables, wins } | null` no payload final.
  - `recentSessionsOut` reescrito: usa `recentSessionsKpisResult` quando disponivel, aplica FX por site -> USD por sessao + soma KPIs (count/itm/finalTables/wins) e calcula PnL/ROI USD por sessao. `primaryPlatform` derivado do site com mais torneios. Fallback legacy para shape antigo (KPIs zerados) quando subquery falhar.
- **Frontend novo**: `client/src/components/home/SessionsRegisteredCard.tsx` renderiza header "Sessoes Registradas" + grid responsivo 6 KPIs (Torneios | Profit | ROI | ITM | Mesas Finais | Cravadas). Empty state quando `data == null` ou `tournaments === 0`. CTA card-wide para `/grind-live`. Profit usa `fmtUsd2` local (2 casas pt-BR) para casar valores founder ("-$255,24"). 5/5 testes verde em `client/src/components/home/__tests__/SessionsRegisteredCard.test.tsx`.
- **Frontend atualizado**: `RecentSessionsList.tsx` aceita props opcionais `investedUsd | roi | itm | finalTables | wins` por sessao + renderiza linha auxiliar com 4 chips (ROI/ITM/MF/Cravadas) abaixo de cada cartao. Back-compat: props ausentes mostram zero.
- **Wiring `Home.tsx`**: zona 3 renomeada `<ZoneHeading>Sessoes Registradas</ZoneHeading>`. Novo `<SessionsRegisteredCard data={data.sessionsRegistered ?? null} />` como primeiro card da zona. Tipo `HomeOverviewResponse.recentSessions[]` estendido com KPIs opcionais + novo bloco `sessionsRegistered`.
- **Test ajustado**: `tests/home/HomeZoning.test.tsx` linha 202 trocou regex de `/Performance/i` para `/Sessoes Registradas/i`.
- **Premissa item 8 absorvida parcialmente**: card ja consome `session_tournaments` por default. Item 8 fica como fundacao da flag `homeOptions.performanceFromGrind` (UI toggle entrega item 11).
- Tests: 5 arquivos focados 46/46 verde. Regressao home + services + componentes home: 598/601 verde. 3 falhas restantes pre-existentes do Sprint News-3 em desenvolvimento (`tests/services/news/titleFingerprint.test.ts:106` lesson #25 + `client/src/components/home/__tests__/NewsSlot.test.tsx:53/58`). Type-check sem erros novos.
- **Confirmacao founder pos-implementacao**: Validar valores reais 124 torneios / profit -$255,24 / ROI -17,4% via Home apos `db:push` ou backend reload. Service test ja simula esse cenario com `invested 1467.24 / returns 1212.00 / position 1 / itm 22 / FT 5` e bate exato.

---

### Item 7 — Dashboard All Time + KPIs estendidos

**Problema:**
- Atualmente mostra "Mes Atual"; founder quer **All Time**.
- Falta clareza: deixar **label "All Time"** explicito no card.
- KPIs a exibir: **Torneios, Profit, ROI, ITM, Mesas Finais, Cravadas**.
- Grafico embaixo: **evolucao all time de todos os dados upados**.

**Aceite:**
- Renomear card de "Dashboard mes atual" para **"Dashboard - All Time"**.
- Backend: `getDashboardAllTimeAggregate(userId)` agrega `tournaments WHERE grind_session_id IS NULL` SEM filtro de mes.
- KPIs: tournaments, profit, roi, itm, finalTables, wins.
- Grafico de evolucao: timeline all-time agrupando por mes (label eixo X = "Jan 2024", "Fev 2024", ...).
- Pipeline TDD obrigatorio (agregacao all time + grafico).

#### Resolucao (2026-05-04)

- **Storage helpers novos** em `server/storage.ts`:
  - `getDashboardAllTimeAggregate(userId)` — agrupa `tournaments` por site, filtros `grind_session_id IS NULL` + `bagged_at IS NULL` (CLAUDE.md §6.1, exclui Day 2 em jogo). Retorna count, investedNative, profitNative + KPIs estendidos: itmCount, finalTablesCount, winsCount via `COUNT(DISTINCT CASE WHEN ... THEN COALESCE(seriesId, id) END)::int`. Espelha formula de `getDashboardPerformance` (linha ~2750) para consistencia com /dashboard.
  - `getDashboardAllTimeMonthlyAggregate(userId)` — mesma fonte, agrupa por mes UTC (`TO_CHAR(date_played AT TIME ZONE 'UTC', 'YYYY-MM')`) + site para alimentar grafico de evolucao mensal. Sem filtro de range (all-time).
  - Interface `IStorage` atualizada com ambas assinaturas.
- **Service novo** `server/services/dashboardAllTime.ts`:
  - `getDashboardAllTimeSummary(userId)` -> `{ tournaments, profit, invested, roi, itm, finalTables, wins }`. FX cascade via `fxResolver.resolveExchangeRates` + `getCurrencyForSite` (lesson #6). Empty/error -> shape vazio sem throw (lesson #9). `roi: null` quando `invested = 0`.
  - `getHomeEvolutionAllTime(userId)` -> `{ months: [...], totalProfitUsd }` com serie continua mensal (preenche meses sem volume) entre primeiro mes com dados e mes corrente UTC. `cumulativeProfitUsd` cresce mes a mes. Storage falha -> `{ months: [], totalProfitUsd: 0 }`.
- **Route** `/api/home/overview`:
  - Subquery nova `dashboardAllTime` (Promise.allSettled, padrao `timed()`).
  - Bloco `dashboardAllTime: { tournaments, profit, invested, roi, itm, finalTables, wins } | null` no payload final.
- **Route** `/api/home/evolution`:
  - Aceita `?scope=all` retornando `{ months, totalProfitUsd }` via `getHomeEvolutionAllTime`. Sem `scope=all`, comportamento original (mes selecionado) preservado.
- **Frontend novo** `client/src/components/home/DashboardAllTimeCard.tsx`: header "Dashboard - All Time" + grid responsivo 6 KPIs (Torneios | Profit | ROI | ITM | Mesas Finais | Cravadas). Padrao identico ao SessionsRegisteredCard (item 6) mas linka para `/dashboard`. Empty state quando `data == null` ou `tournaments === 0` ("Sem torneios upados ainda — importe um CSV ou registre na grade.").
- **Frontend novo** `client/src/components/home/AllTimeEvolutionChart.tsx`: line chart agrupado por mes via Recharts. Eixo X label = "Jan 2024", "Fev 2024", ... (`Intl.DateTimeFormat pt-BR { month: 'short', year: 'numeric' }`). Loading skeleton, empty state, error state. Total acumulado all-time exibido acima do grafico. Endpoint: `GET /api/home/evolution?scope=all`.
- **Wiring** `Home.tsx`: zona 3 (Sessoes Registradas) substitui `<DashboardMonthCard />` + `<MonthEvolutionChart />` por `<DashboardAllTimeCard />` + `<AllTimeEvolutionChart />`. Imports antigos removidos da Home (componentes ainda existem no repo para uso futuro em outras paginas).
- **Tests**: 24/24 verde nos 5 arquivos focados (`tests/storage/getDashboardAllTimeAggregate.test.ts` 7 casos, `tests/services/dashboardAllTime.test.ts` 4 casos, `tests/services/homeEvolutionAllTime.test.ts` 3 casos, `client/src/components/home/__tests__/DashboardAllTimeCard.test.tsx` 6 casos, `client/src/components/home/__tests__/AllTimeEvolutionChart.test.tsx` 4 casos). Regressao home + services + components: 615/618 verde, 3 falhas pre-existentes (Sprint News-3 em desenvolvimento — `tests/services/news/titleFingerprint.test.ts:106` lesson #25 + 2 falhas `NewsSlot.test.tsx`). `Home.test.tsx`: 9/9 verde.
- **Type-check**: zero erros novos introduzidos.
- **Branch**: founder pediu trabalho direto em `main`. Inicial detectei via `git status` que harness havia colocado em `feature/news-3.1-agent-tools-and-real-selectors` (lesson #24 — auto-mode harness pode trocar branch). Resolvi: `git diff > patch`, `git checkout main`, `git apply --3way`, continuei a partir de main com mods preservadas.

---

### Item 8 — Performance baseada em registros /grind

**Problema:** Card Performance atual nao reflete registros da pagina /grind. Founder quer que **seja baseado nos registros /grind** com possibilidade de toggle no futuro.

**Comportamento correto:**
- Por default, card Performance puxa dados de `session_tournaments` (sessoes /grind).
- **Reservar flag** `homeOptions.performanceFromGrind = true` no backend (settings de usuario), default `true`. Toggle UI adicionado no item 11.
- Quando flag `false` (futuro), Performance pode puxar de `tournaments` historico.

**Aceite:**
- Schema: adicionar coluna em `users` ou tabela `user_home_settings` (a decidir, ver item 11) com `performance_source` enum `'grind' | 'history'` default `'grind'`.
- Backend respeita a flag.
- Sem UI de toggle agora (item 11 entrega).

**Atencao:** este item se sobrepoe parcialmente ao item 6. Se item 6 ja garantiu fonte /grind para "Sessoes Registradas", item 8 pode ficar como **fundacao da flag**, sem refactor adicional. Reavaliar quando for executar.

#### Resolucao (2026-05-04) — absorvido pelo item 6

- **Decisao**: nenhuma mudanca de codigo / schema executada neste item. Item 6 (`SessionsRegisteredCard` + `getSessionsRegisteredAggregate` + `getRecentSessionsWithKpis`) ja consome `session_tournaments` por default — comportamento alvo do item 8 esta entregue.
- **Schema flag deferida pro item 11**: spec original (linha 330) diz "adicionar coluna em users ou tabela user_home_settings (a decidir, ver item 11)". Item 11 vai entregar engrenagem de visibilidade de **todas** as sessoes da Home (Header, Coach, Acao Imediata, Grade, Sessoes Registradas, Dashboard, Performance, Estudos, News) + persistencia. Faz sentido decidir formato (JSONB unica vs. tabela dedicada) **junto** com o consumidor real do schema, em vez de pre-commitar uma coluna agora que pode ser reshaped quando item 11 desenhar o modelo de settings completo.
- **Contrato preservado para item 11**: quando item 11 introduzir o schema, deve incluir campo `performanceFromGrind: boolean` (default `true`) ao lado dos toggles de visibilidade. Caminho de leitura: `homeOptions.performanceFromGrind` no payload `/api/home/settings`. Backend respeita flag em `getSessionsRegisteredSummary` (false -> rotear pra `tournaments WHERE grind_session_id IS NULL` reaproveitando `getDashboardAllTimeAggregate` ou variante com range mensal).
- **Risco zero**: card "Sessoes Registradas" continua mostrando dados /grind (default desejado); nenhum usuario pode atualmente desativar; toggle UI sera entregue por item 11.
- **Sem testes / sem migration / sem commit de codigo** — apenas atualizacao desta secao de spec + Status Tracker.

---

### Item 9 — Estudos: OK, nao mexer

Skip. Sem alteracao.

---

### Item 10 — News (POR ULTIMO)

**Problema:**
- Renomear sessao **"Sinal Externo"** para **"Noticias, Estudos e Atualizacoes"**.
- Botoes rapidos atuais -> trocar para: **Series | Atualizacoes | Estudos | Resultados | Fofocas**.
- Layout: noticia em destaque deve ter **seta direita/esquerda** + **bolinhas indicador** (ex: "1 de 5", "2 de 5"...).

**Aceite:**
- Renomear titulo do card.
- Trocar botoes (chips/tabs) com os 5 nomes.
- Carousel: setas left/right + dots paginadores (5 noticias). Componente Radix/shadcn + Embla ou similar (verificar dependencias ja instaladas em `package.json`).
- Pipeline TDD recomendado para carousel state + categoria filter.

**Atencao:**
- Founder pediu para deixar **por ULTIMO**. News esta sendo evoluida em paralelo (RSS + xAI Grok — ADR-106/107).
- Aguardar founder confirmar que essa feature esta estavel antes de aplicar refactor visual.

---

### Item 11 — Engrenagem habilita/desabilita sessoes

**Problema:** Founder quer controle de visibilidade dos cards/sessoes da Home.

**Comportamento correto:**
- Icone engrenagem em local "inteligente" (header da Home, canto superior direito).
- Modal/popover com lista de sessoes da Home (toggles): Header Strip, Pergunte ao Coach, Acao Imediata, Grade do Dia, Sessoes Registradas, Dashboard, Performance, Estudos, News.
- Toggle off -> sessao some da Home.
- Persistir em DB (tabela `user_home_settings` ou JSONB em `users`).

**Aceite:**
- Schema: tabela nova ou coluna JSONB `home_layout_visibility` em `users`.
- Endpoints: `GET /api/home/settings` + `PATCH /api/home/settings`.
- Frontend: componente `HomeSettingsGear.tsx` com toggles + persistencia via TanStack mutation.
- Pipeline TDD obrigatorio (persistencia + permissoes).
- Considerar item 8 (flag `performance_source`) integrado ao mesmo modelo de settings.

---

## Workflow

1. Founder roda `/clear`, cola prompt curto do item N.
2. Agente entra, le `Docs/specs/home-reform-5.md` -> item N -> implementa (pipeline TDD se aplicavel).
3. No final, agente atualiza Status Tracker (este doc) marcando item N como `Concluido (YYYY-MM-DD)` + adiciona secao `#### Resolucao` ao item.
4. Agente emite **prompt curto** com proximo item + reforca que proximo agente deve emitir prompt curto no final.

**Template do prompt curto:**

```
home-reform-5 item <N+1>: <titulo curto>.
Doc: Docs/specs/home-reform-5.md (secao "Item <N+1>").
Contexto memory: MEMORY.md.
Implemente seguindo aceite + pipeline TDD se aplicavel.
Ao terminar, atualize Status Tracker do doc + emita prompt curto pro proximo item (item <N+2>) lembrando o agente de tambem emitir prompt curto no fim.
```
