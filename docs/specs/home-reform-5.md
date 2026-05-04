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
| 3 | Pergunte ao Coach: perfis multiplos + Iniciar Sessao + DAY OFF | Pendente | Feature | 2-3h |
| 4 | Acao Imediata: stat destaque + Iniciar sessao | Pendente | Feature (depende de stat destaque futura) | 2h |
| 5 | Grade do Dia: Primeiro Registro + Ultimo Registro | Pendente | Feature pequena | 1-2h |
| 6 | Renomear Performance -> Sessoes Registradas + KPIs corretos + ITM/MF/Cravadas | Pendente | Bug fix + feature | 3-4h |
| 7 | Dashboard: All Time + KPIs ITM/MF/Cravadas + grafico evolucao all-time | Pendente | Feature | 3-4h |
| 8 | Performance baseada em registros /grind (toggle futuro) | Pendente | Refactor | 2h |
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
