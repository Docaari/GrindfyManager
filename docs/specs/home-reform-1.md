# Spec — Home Reform Onda 1 (Operations Cockpit Pessoal)

> Sprint: **home-reform-1** (MVP da reforma da Home)
> Data: 2026-05-03
> Input: `Docs/strategy/home-reform-research-and-plan.md` (v1.1)
> Output: este documento — fonte de verdade operacional para `system-architect`, `test-writer`, `implementer`, `reviewer`
> Status: Proposta (aguardando aprovacao do dev)
> Idioma: PT-BR (codigo em ingles, conteudo/UI em PT-BR)

---

## 1. Sumario Executivo

**Objetivo.** Substituir a Home atual (`client/src/pages/Home.tsx`, ~510 linhas, "launcher page de onboarding com 3 vanity metrics + 4 cards de modulo") por uma **Home Operations Cockpit** glanceable em <5s, alinhada com os 17 modulos REST e com as 9 features shipadas em 2026-04+ (Bankroll Multi-Wallet, Tournament Selector, Stats Analyzer, Coach AI, Biblioteca, Studies-Reform, Flight, PrimeDope variance, Cooldown stops). Layout fixo, sem customizacao, sem gamificacao.

**Escopo.** Apenas **Onda 1**. Onda 2 (insights/heuristicas/Coach diario) e Onda 3 (customizacao + integracao real Grok) ficam fora.

**13 blocos da Onda 1 (recap):**

| ID  | Bloco                          | Tipo                  | Condicional?            |
| --- | ------------------------------ | --------------------- | ----------------------- |
| S1  | Status Strip (4 KPIs)          | Sempre visivel        | nao                     |
| S2  | Today (sessao do dia)          | Sempre visivel        | empty se nao ha grade   |
| S3  | Banca alert / Stops            | Banner condicional    | so se cooldown ativo    |
| S4  | Proximo torneio countdown      | Sempre visivel        | empty se nao ha grade   |
| S5  | Day 2 / Flight ativo           | Banner condicional    | so se serie ativa       |
| F1  | Historico Geral compacto       | Sempre visivel        | nao                     |
| F2  | Ultimas sessoes (top 5)        | Sempre visivel        | empty se 0 sessoes      |
| F6  | Performance mini (sparkline)   | Sempre visivel        | empty se 0 torneios     |
| F8  | Maos pendentes (top 5)         | Sempre visivel        | empty se 0 starred      |
| F9  | Coach IA (apenas FAB global)   | Decisao tecnica       | sem embed na Home       |
| F10 | Sidebar nova                   | Refactor componente   | nao                     |
| S12 | Bug report quick (footer)      | Sempre visivel        | nao                     |
| S15 | News slot reservado            | Sempre renderizado    | retorna null com flag off |
| S16 | `<HeaderLogo>` swappable       | Componente            | nao                     |

**Nao toca:** schema do banco, prompts do Coach, regras de scoring, Studies, Stats Analyzer (apenas leitura). Apenas 1 endpoint backend novo (`GET /api/home/overview`) e 1 stub (`GET /api/news`).

---

## 2. Decisoes Fechadas (Founder, 2026-05-03)

Decisoes ja resolvidas no doc de pesquisa v1.1. PM-Spec, test-writer e implementer assumem como inalteraveis.

| ID | Decisao |
|---|---|
| **D-FOUNDER-1** | **Sem gamificacao em qualquer onda.** Sem streak, badges, daily goals, heatmap calendario Duolingo-style. S8 e S13 do doc de pesquisa CORTADOS permanentemente. Status Strip vai com **4 KPIs** (Banca / ROI 30d / Hoje / Pendencias), nunca 5. |
| **D-FOUNDER-2** | **Sem customizacao em Ondas 1+2.** Layout da Home eh fixo. Toggle on/off + drag-drop ficam para Onda 3, condicionados a analytics coletados em Onda 1. Spec NAO cria schema `user_settings.homeLayout` nem UI de configuracao. |
| **D-FOUNDER-3** | **News feed: estrutura preparada Onda 1, integracao real Onda 3.** Onda 1 entrega: (a) feature flag `NEWS_FEED_ENABLED=false` em todos ambientes; (b) componente `<NewsSlot>` que retorna `null` quando flag off; (c) tipo TS `NewsItem` em `shared/types/news.ts`; (d) endpoint stub `GET /api/news` retornando `{ items: [], enabled: false }`; (e) ADR escrito documentando contrato + estrategia de integracao xAI Grok deferida. **F4 (fofocas/cravadas/resultados torneios) VETADA permanentemente** — nao abrir hook futuro. |
| **D-FOUNDER-4** | **Logo nova ENTREGUE em 2026-05-03.** Assets em `attached_assets/grindfy-logo-full.png` (lockup completo) + `attached_assets/grindfy-logo-mark.png` (marca/G isolada). Componente `<HeaderLogo>` aceita props `{ asset?, alt?, className?, variant? }` com `variant: 'full' \| 'mark'` (default `'mark'` em sidebar collapsed/auth pages, `'full'` em headers expandidos). Sidebar.tsx + RegisterPage + LoginPage + ForgotPasswordPage + ResetPasswordPage + VerifyEmailPage **ja apontam** para `@assets/grindfy-logo-mark.png` (swap pre-sprint). Tipografia "Grindfy" inline (`Grind` + `<span text-[#15a24e]>fy</span>`) mantida onde a marca aparece com texto adjacente — designer pode remover em PR isolado depois. |

---

## 3. Defaults Ativos D1-D20

Decisoes adicionais resolvidas pelo PM-Spec a partir do doc de pesquisa + arquitetura existente. Test-writer e implementer assumem sem requestionar.

| ID | Default |
|---|---|
| **D1** | **Rota da Home permanece `/`.** Componente Home reformado **substitui** `client/src/pages/Home.tsx` (substituicao in-place, sem rota nova). `App.tsx` continua roteando `/` → `<Home />`. URL do menu sidebar passa a ser rotulada **"Hoje"** (era "Home"), mantendo `path: '/'`. |
| **D2** | **`MiniChat` global eh o unico canal Coach na Home (F9).** Componente `<MiniChat>` ja monta global em `App.tsx` (linha 156). NAO criar embed redundante na Home. F9 do doc de pesquisa eh entregue **por ja existir** — verificar que continua montando e abrindo via FAB flutuante. |
| **D3** | **Endpoint composto `/api/home/overview` eh fonte unica.** Frontend faz **1 unica** query TanStack para essa rota (queryKey `['/api/home/overview']`). Sub-blocos consumem `data?.statusStrip`, `data?.today`, etc. Sem queries adicionais por bloco. Cache cliente: `staleTime: 30_000` (30s); refetch ao focus janela. Reduz 8 round-trips → 1. |
| **D4** | **Cache server-side do endpoint composto = 30s in-memory por user.** Implementacao trivial (`Map<userId, { data, expiresAt }>`); SEM Redis ou similar. Invalidacao automatica por TTL. Sem invalidacao por evento na Onda 1 (aceitar staleness ate 30s). System-architect documenta na ADR. |
| **D5** | **`/api/home/overview` orquestra em paralelo via `Promise.allSettled`** chamando funcoes do `storage.ts` ja existentes (NAO chama HTTP-loopback nos proprios endpoints). Cada subquery individual com timeout 800ms; se uma falha, retorna `null` para aquele sub-bloco e sucesso geral. Frontend trata `null` como empty/error state local do bloco. |
| **D6** | **Performance budget total do endpoint:** `< 500ms p95` em ambiente de dev (1 user, ~1k torneios, ~50 sessoes). Validado via medicao manual + log estruturado `[home/overview] userId=X total=Yms subqueries={ statusStrip:Xms, today:Yms, ... }`. |
| **D7** | **Power user vs Empty State sao 2 layouts da MESMA URL.** Heuristica: empty state se `quickStats.totalTournaments < 50 AND totalSessions < 5`. Bandeira no payload: `data.userState: 'empty' | 'power'`. Frontend renderiza componentes diferentes baseado em `userState`. Empty state: copia o checklist de 4 passos da Home atual (item Importar / Banca / Grade / Sessao). Threshold gravado no servidor — ADR documenta motivo. |
| **D8** | **Status Strip 4 KPIs (D-FOUNDER-1):** **Banca** (saldo total USD + BIs disponiveis + delta % vs 7d), **ROI 30d** (% + sparkline 30 pontos), **Hoje** (qtd torneios planejados OU PnL realizado se ja jogou), **Pendencias** (qtd starred-hands pending + qtd alertas cooldown). Cada KPI eh card clicavel; click leva pra rota correspondente (Banca→`/bankroll`, ROI→`/dashboard`, Hoje→`/coach` (Grade), Pendencias→`/estudos`). |
| **D9** | **Banner S3 / S5 nivel de prioridade:** se ambos ativos (cooldown E flight ativo), **flight ativo prevalece** (acionavel imediato). Cooldown vira sub-banner abaixo. Se apenas um, ele ocupa toda a largura do banner. Banner dismissable em-sessao via `useState` (NAO persiste em localStorage); reaparece no proximo refresh se condicao continua. |
| **D10** | **F1 Historico Geral compacto = 4 metricas em 1 row:** Total torneios (lifetime), Total sessoes (lifetime), Dias ativos (lifetime), Streak atual (dias consecutivos com sessao). **NOTA:** "streak" aqui eh metrica passiva descritiva (nao gamificada — sem badge, sem CTA, sem celebration animation). D-FOUNDER-1 corta gamificacao, NAO corta visualizacao informativa. Se founder achar que ate "streak number" eh gamificacao, remover trivialmente substituindo por "Ultimo upload" (data). |
| **D11** | **F2 Ultimas sessoes = top 5 cards horizontais.** Cada card: data (DD/MM), PnL com cor (verde/+, vermelho/-, neutral/0), qtd torneios, plataforma principal, tag de status (live/ended/finalized). Click → `/grind-live/:sessionId` ou `/dashboard?session=:id` (decisao tecnica do implementer). Empty state: "Nenhuma sessao registrada — comece importando seu primeiro CSV ou iniciando uma sessao live." |
| **D12** | **F6 Performance mini = sparkline 30d ROI cumulativo.** 1 grafico `<Sparkline>` (component) usando dados de `/api/dashboard/performance`. Toggle 7d/30d (default 30d, persistido em `localStorage` chave `home:f6:range`). Click no grafico → `/dashboard`. NAO replica dashboard inteiro. |
| **D13** | **F8 Maos pendentes top 5 = mesma fonte ja usada pelo Sidebar.** Endpoint `GET /api/starred-hands/pending?limit=5`. Card por mao: hero string (ex: "AQ on K72r"), context curto (UTG vs BB), hand type tag, idade (relativa, ex: "ha 2d"). Click → `/estudos?spot=:id`. Botao "Ver todas →" no rodape do bloco link → `/estudos`. |
| **D14** | **S2 Today: data calculada em fuso do user.** Backend usa `userTimezone` se disponivel no JWT/profile, senao fallback `America/Sao_Paulo`. Calcula `dayOfWeek` (0-6) e busca `profile_states` correspondente + `planned_tournaments WHERE start_time::date = today`. |
| **D15** | **S4 Countdown atualiza client-side via `setInterval` 1s.** Server retorna `nextTournamentStartTime` ISO 8601; cliente renderiza "Em 1h 23min" recalculado. Se `< 60s`, mostra "Comecando agora". Se `<= 0`, mostra "Em andamento" + link `/grind-live`. |
| **D16** | **S5 Flight ativo = `tournament_series WHERE status='active' AND user_id=X`.** Mostra primeiro `series.title`, `nextDayStartTime` (Day 2/3/4), countdown ate proximo dia, `currentStack` (BBs). Se 0 series ativas, banner some. CTA "Abrir Flight" → `/flight`. |
| **D17** | **S15 `<NewsSlot>`:** componente que recebe `enabled: boolean`, `items: NewsItem[]` via prop. Em Onda 1, **sempre** renderiza `null` quando `enabled === false` (sem reservar espaco visivel — layout-wise eh `display:none`, evita "vazio decorativo"). System-architect decide se vale reservar `min-height` para evitar layout shift na Onda 3 (ADR). |
| **D18** | **S16 `<HeaderLogo>` props:** `{ asset?: string; alt?: string; className?: string; variant?: 'full' \| 'mark' }`. Quando `asset` ausente, resolve via `variant`: `'full'` → `@assets/grindfy-logo-full.png`, `'mark'` (default) → `@assets/grindfy-logo-mark.png`. Componente isolado em `client/src/components/branding/HeaderLogo.tsx`. Sidebar (collapsed e expanded), Header da Home, Auth pages (Login/Register/Forgot/Reset/VerifyEmail) consomem esse componente em vez de `<img>` hardcoded. Refactor das auth pages substitui o import ja swapped pelo `<HeaderLogo variant='mark' className='w-12 h-12' />`. |
| **D19** | **F10 Sidebar refactor — preservar URLs e labels conhecidos.** Mudancas exatas: (a) renomear grupo "VISAO GERAL" → "HOJE"; (b) renomear item `path: '/'` label "Home" → **"Hoje"**; (c) criar grupo novo "ESTUDOS" entre "GRIND" e "FERRAMENTAS" contendo Estudos + Biblioteca (movidos de FERRAMENTAS); (d) reordenar GRIND para fluxo diario: Grade → Grind → Warm Up → Coach IA → Flight; (e) manter Calculadoras + Banca em FERRAMENTAS; (f) Settings + Logout no footer ja existe — manter. **Zero migration de URL.** |
| **D20** | **Instrumentacao via `client/src/lib/tracker.ts` (`emit()`).** 6 eventos minimos (RNF-09). NAO criar nova plataforma de analytics. Tracker eh stub `console.log` ate plataforma real chegar (ADR-055). |

---

## 4. Usuarios e Personas

Persona unica relevante: **player profissional MTT, logado, intencao de grindar nas proximas horas**. Sem segmentacao por tier, sem persona admin (admin usa mesma Home + sees grupo ADMIN extra na sidebar).

### 4.1. User Stories

#### US-01 (power user — manha)
> Como player pro acordando 11h, quero abrir a Home e em <5s saber: minha banca atual, ROI ultimos 30d, e se tenho alguma mao starred pendente. Sem precisar navegar.

#### US-02 (power user — pre-grind)
> Como player as 17:30 prestes a grindar as 18h, quero ver banner imediato com countdown do primeiro torneio, perfil A/B/C ativo do dia, qtd planejada, e botao "iniciar warm-up" em 1 clique.

#### US-03 (power user — Day 2)
> Como player que baggou ontem, quero o banner "Seu Day 2 do XYZ comeca em 1h 12min · Stack: 47 BB" no topo da Home. Click leva pra Flight.

#### US-04 (power user — cooldown)
> Como player que bati stop loss ontem, quero banner "Cooldown ate 18:00" sem alarme visual (vermelho gritado), informativo. Permitir dismiss visual da sessao mas re-mostrar no proximo refresh se cooldown continua ativo.

#### US-05 (empty state — primeiro acesso)
> Como user novo (<50 torneios E <5 sessoes), quero ver checklist de 4 passos no centro da Home (Import / Banca / Grade / Sessao live) em vez do cockpit cheio. Apos completar, transicionar suavemente pro layout power user.

#### US-06 (mobile — recap)
> Como player consultando recap em mobile no transporte publico, quero scroll vertical com Status Strip horizontal swipeavel + ultimas sessoes + maos pendentes empilhadas. Sem perda de informacao critica.

#### US-07 (Coach insight)
> Como player que quer perguntar pro Coach, quero o FAB global do `MiniChat` (que ja existe) acessivel da Home sem embed redundante. Clicar abre overlay; nao precisa rota nova.

---

## 5. Escopo IN — 13 blocos detalhados

Para cada bloco: **fonte de dados**, **comportamento esperado**, **empty state**, **error state**, **interacao primaria**.

### 5.1. S1 — Status Strip (4 KPIs)

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | `data.statusStrip = { banca, roi30d, today, pendencias }` do `/api/home/overview`, agregando `dashboard/quick-stats` + `bankroll` (current snapshot) + `dashboard/performance` (30d) + `starred-hands/pending` + `cooldown-logs` (active count). |
| **Comportamento** | Grid `grid-cols-4` desktop / `grid-cols-2` tablet / horizontal-scroll-snap mobile. Cada card: numero principal grande (text-3xl), label (text-xs uppercase), sub-info (sparkline ou delta). Cor de destaque so quando `delta < 0` em ROI ou Pendencias > 0 (amber). Banca PnL > 0 = neutro `tokens.color.text.primary` (anti-Christmas-tree). |
| **Empty state** | KPI Banca: "Configure sua banca" + link `/bankroll`. KPI ROI: "Sem dados (importe CSVs)" + link `/upload`. KPI Hoje: "Sem grade hoje" + link `/coach`. KPI Pendencias: "Tudo em dia" (positivo). |
| **Error state** | Card individual com icone alert + texto "Erro ao carregar — tente atualizar". NAO derrubar o strip inteiro se 1 KPI falhar (graceful degradation). |
| **Interacao** | Card clicavel: Banca → `/bankroll`, ROI → `/dashboard`, Hoje → `/coach`, Pendencias → `/estudos`. Hover state: leve elevacao (`tokens.shadow.sm`). |

### 5.2. S2 — Today (sessao do dia)

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | `data.today = { profile, plannedCount, firstStartTime, stopLoss, stopTime, hasWarmupToday }` agregando `profile-states/:dayOfWeek` + `planned-tournaments?date=today` + `bankroll` (stops). |
| **Comportamento** | Card hero `2/3` da row (desktop). Mostra: Perfil (badge "A"/"B"/"C"/"OFF"), texto "{N} torneios · primeiro {HH:MM}", linha "Stop loss: {valor} · Stop time: {HH:MM}", 2 CTAs em row: `[Iniciar warm-up]` (so se `hasWarmupToday === false`) + `[Ver grade completa →]`. |
| **Empty state** | Sem grade configurada para o dia: card vazio "Nenhuma sessao planejada para hoje" + CTA "Configurar grade →" → `/coach`. |
| **Error state** | Skeleton + "Nao foi possivel carregar grade — tente atualizar". |
| **Interacao** | CTA warm-up → `/mental` (ja existe). CTA Grade → `/coach`. Card todo NAO eh clicavel (so CTAs explicitos). |

### 5.3. S3 — Banca alert / Stops (banner condicional)

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | `data.banners.cooldown = { active: boolean, until: ISO, type: 'stop-loss' \| 'time-stop' \| 'manual' }` agregando `cooldown-logs WHERE status='active'`. |
| **Comportamento** | Banner full-width acima do Status Strip. Cor amber (NAO vermelho — anti-tilt). Texto: "⚠ Cooldown ate {HH:MM} — {motivo legivel}". Link "[ver detalhes]" → `/bankroll`. Renderiza so se `active === true`. Dismiss-em-sessao via `useState`. |
| **Empty state** | N/A (banner some). |
| **Error state** | Se subquery `cooldown` falhar, NAO mostra banner (silenciar — assumir nao-cooldown eh fail-safe). Log server-side. |
| **Interacao** | Click no banner → `/bankroll`. Botao X dismiss em-sessao. |

### 5.4. S4 — Proximo torneio countdown

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | `data.nextTournament = { startTime: ISO, name, buyin, currency, plataform } \| null` derivado de `planned-tournaments?date=today&order=startTime ASC LIMIT 1`. |
| **Comportamento** | Subcard dentro de S2 OU card proprio (system-architect decide layout). Texto: "Proximo: {name} em {countdown}" (recalculado client-side a cada 1s). Se `< 60s`: "Comecando agora". Se `<= 0`: "Em andamento" + CTA "→ Grind live". |
| **Empty state** | Sem proximo torneio hoje: card oculto OU "Sem torneios restantes hoje". |
| **Error state** | Card oculto se subquery falhar. |
| **Interacao** | Click → `/grind-live` se em andamento, `/coach` se planejado. |

### 5.5. S5 — Day 2 / Flight ativo (banner condicional)

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | `data.banners.flight = { active: boolean, seriesTitle, nextDayStartTime: ISO, currentStackBb, day: 2\|3\|4 } \| null` agregando `tournament-series?status=active`. |
| **Comportamento** | Banner full-width. Prioridade > S3 (D9). Cor verde sutil. Texto: "🏆 Day {N} do "{seriesTitle}" comeca em {countdown} · Stack: {bb} BB". CTA "[abrir Flight]" → `/flight`. |
| **Empty state** | N/A (banner some). |
| **Error state** | Banner oculto. |
| **Interacao** | Click → `/flight`. Sem dismiss (informacao critica acionavel). |

### 5.6. F1 — Historico Geral compacto

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | `data.lifetime = { totalTournaments, totalSessions, activeDays, currentStreakDays }` de `dashboard/quick-stats`. |
| **Comportamento** | 1 row 4-cols com numeros simples + label. Visualmente compacto (h-16). Sem cor de destaque. |
| **Empty state** | Mostrar zeros — eh natural pra user novo. |
| **Error state** | Skeleton row 4-cols. |
| **Interacao** | Bloco inteiro clicavel → `/dashboard`. |

### 5.7. F2 — Ultimas sessoes (top 5)

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | `data.recentSessions: Session[]` de `grind-sessions/history?limit=5`. |
| **Comportamento** | 5 cards verticais empilhados. Cada um: data DD/MM, PnL com cor, qtd torneios, plataforma principal, status badge. CTA "[Ver historico completo →]" no rodape do bloco. |
| **Empty state** | Mensagem "Nenhuma sessao registrada — comece importando seu primeiro CSV ou iniciando uma sessao live." + 2 CTAs: `[Importar CSV →]` + `[Iniciar sessao live →]`. |
| **Error state** | Skeleton 5 cards + retry button. |
| **Interacao** | Card → `/grind-live/:sessionId` ou modal de detalhes (decisao implementer). CTA rodape → `/dashboard`. |

### 5.8. F6 — Performance mini (sparkline)

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | `data.performance = { roi30d, itm30d, cash30d, sparkline: number[] }` de `dashboard/performance?period=30`. |
| **Comportamento** | Card full-width. Sparkline esquerda (`<Sparkline points>`); 3 metricas direita (ITM%, Cash%, ROI). Toggle 7d/30d/90d/YTD no canto direito (default 30d). CTA "[Ver dashboard completo →]" rodape. Persistir periodo selecionado em `localStorage:home:f6:range`. |
| **Empty state** | "Sem dados de performance — importe CSVs" + CTA `[Importar →]`. |
| **Error state** | Skeleton sparkline + "Erro ao carregar performance". |
| **Interacao** | Toggle periodo (atualiza apenas este bloco via re-fetch). Click no sparkline ou CTA → `/dashboard`. |

### 5.9. F8 — Maos pendentes (top 5)

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | `data.pendingHands: PendingHand[]` de `starred-hands/pending?limit=5`. Reusa endpoint que sidebar ja consome. |
| **Comportamento** | 5 cards verticais. Cada um: hero (ex: "AQ on K72r"), context (UTG vs BB), tag tipo, idade relativa. CTA "[Revisar todas →]" rodape. |
| **Empty state** | "Nenhuma mao pendente — voce esta em dia 🎯" (sem CTA). |
| **Error state** | Skeleton 5 cards. |
| **Interacao** | Card → `/estudos?spot=:id`. CTA rodape → `/estudos`. |

### 5.10. F9 — Coach IA (apenas FAB global)

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | N/A (componente `<MiniChat>` ja monta global em `App.tsx`, faz suas proprias queries). |
| **Comportamento** | Verificar que `<MiniChat>` continua acessivel via FAB flutuante quando user esta na Home. NAO criar novo card de Coach na Home (D2). Esta spec NAO modifica `MiniChat` — apenas garante que a Home reformada nao quebra o overlay. |
| **Empty state** | N/A. |
| **Error state** | N/A (escopo MiniChat). |
| **Interacao** | FAB flutuante (decisao MiniChat). |

### 5.11. F10 — Sidebar nova

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | Estatica (estrutura definida em `Sidebar.tsx`) + query `starred-hands/pending` para badge (ja existe). |
| **Comportamento** | Refactor de `client/src/components/Sidebar.tsx` aplicando D19. Mantem URLs. Mantem sub-componentes (`renderSubscriptionBadge`, badges). Estrutura final: HOJE [Hoje (`/`), Dashboard, Import, Torneios] / GRIND [Grade, Grind, Warm Up, Coach IA, Flight] / ESTUDOS [Estudos, Biblioteca] / FERRAMENTAS [Calculadoras, Banca] / ADMIN [Analytics, Usuarios, Bugs] (admin-only). Footer: trial badge + Settings + Logout. |
| **Empty state** | N/A. |
| **Error state** | N/A. |
| **Interacao** | Click items navega; collapse toggle existente (chevron) mantido; badges Estudos/Biblioteca mantidos. |

### 5.12. S12 — Bug report quick (footer)

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | N/A (componente `<BugReportModal>` ja existe). |
| **Comportamento** | Footer minimo da Home (h-12, text-xs, color muted). 4 links: `[Bug report]` (abre modal existente) + `[Discord]` (link externo) + `[Suporte]` (mailto ou link existente) + `[v{appVersion}]` (texto, nao clicavel). |
| **Empty state** | N/A. |
| **Error state** | N/A. |
| **Interacao** | Click bug report → abre `<BugReportModal>` ja importado. |

### 5.13. S15 — News slot reservado

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | `data.news = { enabled: false, items: [] }` retornado pelo `/api/home/overview` (ou via stub `/api/news`, system-architect decide). Onda 1: sempre `enabled: false`. |
| **Comportamento** | Componente `<NewsSlot enabled items />`. Quando `enabled === false`, retorna `null` (NAO renderiza placeholder visivel — D17). Em runtime Onda 1, **invisivel ao user**. |
| **Empty state** | N/A (componente nao renderiza). |
| **Error state** | Se subquery falhar, tratar como `enabled: false` (silenciar). |
| **Interacao** | N/A em Onda 1. |

### 5.14. S16 — `<HeaderLogo>` swappable

| Aspecto | Detalhe |
|---|---|
| **Fonte de dados** | Asset estatico (default `@assets/image_1753377238747.webp`). |
| **Comportamento** | Componente `client/src/components/branding/HeaderLogo.tsx`. Aceita `{ asset?, alt?, className? }`. Refatora `Sidebar.tsx` para consumir esse componente em vez de `<img src={logoImage} />` hardcoded (linhas 170-173 e 181-185). Sem mudanca visual em Onda 1 (asset = atual). |
| **Empty state** | N/A. |
| **Error state** | `<img onError>` fallback para texto "Grindfy". |
| **Interacao** | N/A. |

---

## 6. Escopo OUT (explicito)

NAO entra em Onda 1. Lista exaustiva pra evitar scope creep.

- **Onda 2 inteira:** F5 Heuristicas, F7 Stats Analyzer preview, S6 Variance check, S7 Coach insight diario, S10 Continue assistindo (Biblioteca), S11 Tournament Selector top 3.
- **Onda 3 inteira:** S17 Customizacao (toggle/drag), S18 Integracao real xAI Grok, S9 Pending CSV uploads heuristic, S14 Goal tracker.
- **Gamificacao:** S8 Streak + Daily goal CORTADO permanentemente. S13 Calendario heatmap CORTADO. NAO criar tabela `user_streaks`. (Nota D10: F1 mostra "currentStreakDays" como numero descritivo informativo, sem badges/celebration/CTA — se founder considerar isso ja gamificacao, trivial trocar por outro KPI.)
- **Customizacao:** sem toggle on/off de blocos, sem drag-drop, sem schema `user_settings.homeLayout`, sem UI de configuracao Home em `/settings`.
- **News integration:** sem chamada real xAI Grok, sem cache Redis-style, sem opt-in por user, sem curadoria.
- **Logo nova:** sem swap de asset visual (D-FOUNDER-4). Componente preparado mas asset = atual.
- **Coach embed na Home:** sem novo `<CoachInsightCard>` na Home (D2). MiniChat global eh suficiente.
- **`/api/home/overview` cache distribuido:** sem Redis, sem invalidacao por evento. TTL 30s in-memory chega.
- **Onboarding redesenho profundo:** empty state usa o checklist atual da Home (4 passos) sem redesenhar fluxo de onboarding (escopo seria sprint proprio).
- **Mobile gestures avancados:** sem swipe-to-dismiss banners, sem pull-to-refresh customizado (basta TanStack `refetch`).
- **A/B test de layout:** sem feature flag de "Home antiga vs nova". Substituicao direta.
- **Migracao de tokens UI fora da Home:** sprint UI-FND-1 ja fundou tokens; aplicar **apenas na Home + Sidebar + HeaderLogo** nesta sprint. Outras paginas migram em sprints proprias.
- **Refactor de `<MiniChat>`:** sem mudanca em `MiniChat.tsx`. Spec apenas verifica que continua funcionando.
- **Schema novo:** zero `CREATE TABLE`, zero migration. Onda 1 eh feature read-only.

---

## 7. Requisitos Funcionais (RF)

Cada RF tem criterio de aceite testavel. Test-writer escreve 1 ou mais testes por RF.

### RF-01 — Endpoint composto `GET /api/home/overview`

**Descricao:** novo endpoint em `server/routes/dashboard.ts` (ou modulo novo `server/routes/home.ts` — system-architect decide; PM-Spec recomenda **modulo proprio** `home.ts` para isolamento). Orquestra subqueries via `storage.ts` e retorna JSON unico.

**Schema da resposta:**

```ts
type HomeOverviewResponse = {
  userState: 'empty' | 'power';
  statusStrip: {
    banca: { totalUsd: number; bisAvailable: number | null; deltaPct7d: number | null; sparkline: number[] } | null;
    roi30d: { value: number; sparkline: number[] } | null;
    today: { plannedCount: number; firstStartTime: string | null; realizedPnlUsd: number | null } | null;
    pendencias: { starredHands: number; cooldownAlerts: number } | null;
  };
  today: {
    profile: 'A' | 'B' | 'C' | 'OFF' | null;
    plannedCount: number;
    firstStartTime: string | null;
    stopLoss: { amount: number; currency: string } | null;
    stopTime: string | null;
    hasWarmupToday: boolean;
  } | null;
  banners: {
    cooldown: { active: boolean; until: string; type: 'stop-loss' | 'time-stop' | 'manual' } | null;
    flight: { active: boolean; seriesTitle: string; nextDayStartTime: string; currentStackBb: number; day: number } | null;
  };
  nextTournament: { startTime: string; name: string; buyin: number; currency: string; platform: string } | null;
  lifetime: { totalTournaments: number; totalSessions: number; activeDays: number; currentStreakDays: number };
  recentSessions: Array<{
    id: string; date: string; pnlUsd: number; tournamentCount: number; primaryPlatform: string; status: 'live' | 'ended' | 'finalized';
  }>;
  performance: {
    roi: number; itm: number; cash: number; sparkline: number[]; period: '7d' | '30d' | '90d' | 'ytd';
  } | null;
  pendingHands: Array<{ id: string; hero: string; context: string; tag: string; ageRelative: string }>;
  news: { enabled: boolean; items: NewsItem[] };
  meta: { generatedAt: string; cacheHit: boolean; subqueryTimingsMs: Record<string, number> };
};
```

**Criterio de aceite:**
- [ ] Endpoint registrado e responde 200 com schema acima para user autenticado
- [ ] Retorna 401 sem JWT
- [ ] Tempo total de resposta < 500ms p95 (medido em test de integracao)
- [ ] Subqueries rodam em `Promise.allSettled` (verificavel via `meta.subqueryTimingsMs` ter todas as keys mesmo se 1 falha)
- [ ] Se subquery falha, campo correspondente eh `null` (nao throw)
- [ ] Cache 30s in-memory verificavel: 2 chamadas seguidas, 2a com `meta.cacheHit === true`
- [ ] Cache eh por-userId (user A nao recebe dados do user B)

### RF-02 — Endpoint stub `GET /api/news`

**Descricao:** novo endpoint que retorna `{ enabled, items, cachedAt? }`. Onda 1: sempre `{ enabled: false, items: [] }`. Onda 3: implementacao real xAI Grok.

**Criterio de aceite:**
- [ ] Endpoint responde 200 com `{ enabled: false, items: [] }` quando `NEWS_FEED_ENABLED=false` (ou nao definida)
- [ ] Retorna 401 sem JWT
- [ ] Schema valido contra `NewsResponse` em `shared/types/news.ts`
- [ ] Aceita query param `?source=poker-software&limit=5` (ignorado em stub mas validado)

### RF-03 — Tipo `NewsItem` em `shared/types/news.ts`

**Descricao:** criar arquivo `shared/types/news.ts` com tipos `NewsItem` e `NewsResponse`.

```ts
export interface NewsItem {
  id: string;
  source: 'poker-software' | 'reserved-future';
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  tags?: string[];
}

export interface NewsResponse {
  items: NewsItem[];
  enabled: boolean;
  cachedAt?: string;
  nextRefreshAt?: string;
}
```

**Criterio de aceite:**
- [ ] Arquivo criado em `shared/types/news.ts`
- [ ] Tipos exportados nominalmente `NewsItem`, `NewsResponse`
- [ ] `tsc` passa sem erros
- [ ] `summary` documentado como `<= 280 chars` em JSDoc (validacao em runtime fica para Onda 3)

### RF-04 — Feature flag `NEWS_FEED_ENABLED`

**Descricao:** env var lida em server config com default `false`. Documentada em `CLAUDE.md` (secao 4 — variaveis opcionais).

**Criterio de aceite:**
- [ ] `process.env.NEWS_FEED_ENABLED` lida em ponto centralizado (recomendacao: `server/config.ts` ou no proprio handler de `/api/news`)
- [ ] Default `false` quando nao definida ou string nao-truthy
- [ ] Truthy: `'true'` ou `'1'`. Outros valores → `false` (defensivo)
- [ ] Test de integracao: setar env `NEWS_FEED_ENABLED=true` e endpoint retorna `enabled: true` (items continua `[]` em Onda 1)
- [ ] Documentada em `CLAUDE.md`

### RF-05 — Componente `<NewsSlot>`

**Descricao:** novo componente `client/src/components/home/NewsSlot.tsx`. Recebe `enabled: boolean` e `items: NewsItem[]`. Onda 1: retorna `null` quando `enabled === false`.

**Criterio de aceite:**
- [ ] Componente criado e exportado default
- [ ] Quando `enabled === false`, render eh `null` (nao DOM, nao espaco reservado)
- [ ] Quando `enabled === true && items.length === 0`, render eh `null` (Onda 1 nao mostra "sem noticias" — preserva limpeza)
- [ ] Teste unit verifica os 2 cases acima

### RF-06 — Componente `<HeaderLogo>`

**Descricao:** novo componente `client/src/components/branding/HeaderLogo.tsx`. Aceita `{ asset?: string; alt?: string; className?: string; variant?: 'full' \| 'mark' }`. Resolve asset via `variant` quando `asset` ausente: `'full'` → `@assets/grindfy-logo-full.png`, `'mark'` (default) → `@assets/grindfy-logo-mark.png`.

**Criterio de aceite:**
- [ ] Componente criado e exportado default
- [ ] Default `variant='mark'` → resolve `@assets/grindfy-logo-mark.png`
- [ ] `variant='full'` → resolve `@assets/grindfy-logo-full.png`
- [ ] Prop `asset` quando presente sobrepoe `variant`
- [ ] Tem `<img onError>` fallback que renderiza texto "Grindfy"
- [ ] Sidebar.tsx refatorado para consumir `<HeaderLogo variant='mark'>` (collapsed e expanded; expanded mantem h1 inline ao lado da marca ate designer decidir adotar `variant='full'`)
- [ ] Auth pages (LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage) refatoradas para `<HeaderLogo variant='mark' className='...' />` substituindo `<img src={logoPath}>` direto
- [ ] Teste unit verifica os 4 cases: default, variant=full, variant=mark, asset override

### RF-07 — Refactor `Sidebar.tsx` (D19)

**Descricao:** aplicar D19 em `client/src/components/Sidebar.tsx`. Sem alterar URLs.

**Criterio de aceite:**
- [ ] Grupo "VISAO GERAL" renomeado para "HOJE"
- [ ] Item `path: '/'` label muda de "Home" para "Hoje"
- [ ] Novo grupo "ESTUDOS" criado entre "GRIND" e "FERRAMENTAS" contendo Estudos + Biblioteca (movidos de FERRAMENTAS)
- [ ] Ordem em GRIND: Grade → Grind → Warm Up → Coach IA → Flight
- [ ] FERRAMENTAS contem apenas Calculadoras + Banca (Estudos + Biblioteca movidos out)
- [ ] ADMIN inalterado (Analytics, Usuarios, Bugs)
- [ ] Footer (trial badge, Settings, Logout) inalterado
- [ ] Badge "Novo" em Biblioteca preservado (logica ja existe linhas 250-258)
- [ ] Badge pendingSpots em Estudos preservado (logica ja existe linhas 240-244)
- [ ] Test de snapshot ou DOM-query confirma 5 grupos na ordem correta

### RF-08 — Pagina Home reformada (`client/src/pages/Home.tsx`)

**Descricao:** substituir conteudo atual pela nova Home. Manter rota `/`. Carregar `/api/home/overview` via TanStack Query. Renderizar empty state OU power user state baseado em `data.userState`.

**Criterio de aceite:**
- [ ] Single query TanStack Query com queryKey `['/api/home/overview']`, staleTime 30000
- [ ] Loading: skeleton de cada bloco (NAO skeleton da pagina inteira — bloco-a-bloco para perceived perf)
- [ ] `data.userState === 'empty'` renderiza componente `<EmptyHomeOnboarding>` com checklist 4 passos
- [ ] `data.userState === 'power'` renderiza layout cockpit (S1/S2/S3/S4/S5 conforme presente, F1/F2/F6/F8, S15, S12)
- [ ] Mantem `<WelcomeNameModal>` existente (linhas 30-62 da Home atual) para primeiro login
- [ ] Header da pagina usa `<HeaderLogo>`
- [ ] Sem queries adicionais (excecao: re-fetch local de F6 quando user troca toggle de periodo)

### RF-09 — Bloco S1 Status Strip implementado

**Criterio de aceite:**
- [ ] Componente `<StatusStrip data />` em `client/src/components/home/StatusStrip.tsx`
- [ ] Renderiza 4 cards: Banca, ROI 30d, Hoje, Pendencias
- [ ] Cada card: numero principal + label + sub-info
- [ ] Card Banca clicavel → `/bankroll`
- [ ] Card ROI clicavel → `/dashboard`
- [ ] Card Hoje clicavel → `/coach`
- [ ] Card Pendencias clicavel → `/estudos`
- [ ] Empty per-card quando subdata `null` (mensagem + link CTA)
- [ ] Cor amber so quando `pendencias.starredHands > 0 OR pendencias.cooldownAlerts > 0`
- [ ] Mobile (<768px): horizontal scroll snap
- [ ] Tablet (768-1279px): grid 2x2
- [ ] Desktop (>=1280px): grid 1x4

### RF-10 — Bloco S2 Today implementado

**Criterio de aceite:**
- [ ] Componente `<TodayCard data />` em `client/src/components/home/TodayCard.tsx`
- [ ] Renderiza Perfil badge + linha torneios + linha stops + 2 CTAs
- [ ] CTA "Iniciar warm-up" oculto se `hasWarmupToday === true`
- [ ] CTA "Ver grade" sempre visivel → `/coach`
- [ ] Empty state: "Nenhuma sessao planejada para hoje" + CTA `[Configurar grade →]`

### RF-11 — Bloco S3 banner cooldown (condicional)

**Criterio de aceite:**
- [ ] Componente `<CooldownBanner banner />` em `client/src/components/home/CooldownBanner.tsx`
- [ ] Renderiza so se `banners.cooldown?.active === true`
- [ ] Cor amber (NAO vermelho)
- [ ] Texto "⚠ Cooldown ate {HH:MM} — {motivo}"
- [ ] Botao X dismiss em-sessao (useState local)
- [ ] Click banner → `/bankroll`

### RF-12 — Bloco S4 Next tournament countdown

**Criterio de aceite:**
- [ ] Componente `<NextTournamentCountdown data />` em `client/src/components/home/NextTournamentCountdown.tsx`
- [ ] `setInterval` 1s recalcula countdown client-side
- [ ] `< 60s`: mostra "Comecando agora"
- [ ] `<= 0`: mostra "Em andamento" + CTA "→ Grind live" → `/grind-live`
- [ ] Cleanup do `setInterval` no unmount (sem leak)
- [ ] Card oculto se `nextTournament === null`

### RF-13 — Bloco S5 banner flight ativo (condicional)

**Criterio de aceite:**
- [ ] Componente `<FlightBanner banner />` em `client/src/components/home/FlightBanner.tsx`
- [ ] Renderiza so se `banners.flight?.active === true`
- [ ] Cor verde sutil (`tokens.color.success.bg`)
- [ ] Texto "🏆 Day {N} do "{seriesTitle}" comeca em {countdown} · Stack: {bb} BB"
- [ ] Countdown client-side via `setInterval` 1s
- [ ] CTA "[abrir Flight]" → `/flight`
- [ ] Sem dismiss (informacao critica)
- [ ] Quando S3 + S5 ambos ativos, S5 acima de S3 (D9)

### RF-14 — Bloco F1 Lifetime stats

**Criterio de aceite:**
- [ ] Componente `<LifetimeStats data />` em `client/src/components/home/LifetimeStats.tsx`
- [ ] 1 row com 4 metricas: Torneios / Sessoes / Dias ativos / Streak (dias)
- [ ] Numeros formatados com separador de milhar (PT-BR: `1.234`)
- [ ] Bloco clicavel → `/dashboard`

### RF-15 — Bloco F2 Recent sessions

**Criterio de aceite:**
- [ ] Componente `<RecentSessionsList data />` em `client/src/components/home/RecentSessionsList.tsx`
- [ ] Renderiza ate 5 cards verticais
- [ ] Cada card: data DD/MM, PnL com cor (verde/vermelho/neutral), qtd torneios, plataforma, status badge
- [ ] CTA "[Ver historico completo →]" rodape
- [ ] Empty state: 2 CTAs (`Importar CSV →` + `Iniciar sessao live →`)
- [ ] Click card → `/grind-live/:sessionId` (se status='live') OR `/dashboard?session=:id`

### RF-16 — Bloco F6 Performance mini

**Criterio de aceite:**
- [ ] Componente `<PerformanceMini data />` em `client/src/components/home/PerformanceMini.tsx`
- [ ] Sparkline + 3 metricas (ITM%, Cash%, ROI)
- [ ] Toggle 7d/30d/90d/YTD (default 30d)
- [ ] Periodo persistido em `localStorage:home:f6:range`
- [ ] Toggle dispara re-fetch local de `dashboard/performance?period=X` (separate query)
- [ ] CTA "[Ver dashboard completo →]" → `/dashboard`
- [ ] Empty state: "Sem dados de performance — importe CSVs"

### RF-17 — Bloco F8 Pending hands

**Criterio de aceite:**
- [ ] Componente `<PendingHandsList data />` em `client/src/components/home/PendingHandsList.tsx`
- [ ] Renderiza ate 5 cards
- [ ] Cada card: hero, context, tag, idade relativa
- [ ] CTA "[Revisar todas →]" rodape → `/estudos`
- [ ] Empty state: "Nenhuma mao pendente — voce esta em dia 🎯" (sem CTA)
- [ ] Click card → `/estudos?spot=:id`

### RF-18 — Bloco S12 Footer

**Criterio de aceite:**
- [ ] Componente `<HomeFooter />` em `client/src/components/home/HomeFooter.tsx`
- [ ] 4 links: Bug report (abre `<BugReportModal>`) + Discord + Suporte + versao
- [ ] Versao lida de `package.json` (build-time) ou env `APP_VERSION`
- [ ] Estilo discreto (text-xs, color muted)

### RF-19 — Bloco S15 NewsSlot integrado

**Criterio de aceite:**
- [ ] `<NewsSlot enabled={data.news.enabled} items={data.news.items} />` invocado dentro da Home
- [ ] Em Onda 1, com `enabled === false`, nao adiciona DOM visivel
- [ ] DOM testavel via `queryByTestId('home-news-slot')` retorna null em Onda 1

### RF-20 — Empty state Onboarding

**Criterio de aceite:**
- [ ] Componente `<EmptyHomeOnboarding data />` em `client/src/components/home/EmptyHomeOnboarding.tsx`
- [ ] Renderiza so se `data.userState === 'empty'`
- [ ] 4 passos checklist: Importar CSV / Configurar banca / Planejar grade / Iniciar sessao live
- [ ] Step "completed" baseado em quickStats (totalTournaments > 0, banca configurada, gradeDays > 0, totalSessions > 0)
- [ ] Botao `[Pular onboarding (mostrar dashboard vazio)]` que seta `localStorage:home:skipOnboarding=true` e re-renderiza power state mesmo se thresholds nao batidos

### RF-21 — Instrumentacao 6 eventos

**Criterio de aceite:** ver RNF-09 abaixo. Cada evento testavel via spy em `emit()` de `client/src/lib/tracker.ts`.

---

## 8. Requisitos Nao-Funcionais (RNF)

### RNF-01 — Performance endpoint

- `/api/home/overview` < 500ms p95 em ambiente dev (1 user, ~1k torneios, ~50 sessoes)
- Cache 30s server-side hit reduz tempo medio para < 50ms p95
- Subquery individual com timeout 800ms (degrada gracefully)
- Test de carga: 10 calls sequenciais, p95 < 500ms

### RNF-02 — Performance frontend

- LCP (Largest Contentful Paint) Status Strip < 1.5s em desktop, < 2.5s em mobile (3G simulado)
- Skeleton cada bloco renderiza em < 100ms apos mount (perceived perf)
- Sem layout shift > 0.1 (CLS) durante carregamento
- Sem re-render de bloco `B` quando outro bloco `A` tem mudanca local de estado (uso correto de memoization)

### RNF-03 — Acessibilidade WCAG AA

- Contraste de texto >= 4.5:1 (texto normal) e >= 3:1 (texto grande/UI)
- Todos os interativos tem `aria-label` ou texto descritivo
- Navegacao por teclado: Tab atravessa Status Strip cards → S2 CTAs → F2 cards → ... em ordem visual
- Focus state visivel em todos os elementos interativos (`tokens.color.action.text` outline)
- Banner cooldown e flight tem `role="alert"` (screen reader anuncia)
- Sparkline F6 tem `aria-label="Grafico de performance ROI ultimos 30 dias"`
- Skeleton loaders tem `aria-busy="true"` e `aria-live="polite"`

### RNF-04 — Responsivo mobile-first

| Breakpoint    | Comportamento                                                                  |
| ------------- | ------------------------------------------------------------------------------ |
| `< 768px`     | Stack vertical. S1 = horizontal scroll-snap. F2/F8 = stack. F6 = full-width. Footer S12 colapsa em 1 linha. |
| `768-1279px`  | Sidebar colapsa para 64px. S1 = grid 2x2. Banners full-width. F2 + F8 stack vertical (cada um full-width). F6 full-width. |
| `>= 1280px`   | Sidebar expandida 240px. S1 = grid 1x4. S2 + (futuro Coach insight Onda 2) row 2/3+1/3 — em Onda 1, S2 ocupa 2/3 e direita fica vazia (ou pode ocupar full-width). F2 + F8 row 1/2+1/2. F6 full-width. |

### RNF-05 — i18n PT-BR

- Toda copy em PT-BR
- Numeros: separador de milhar `.`, decimal `,` (ex: `R$ 1.234,56`)
- Datas: formato curto DD/MM (ex: `03/05`), longo `Ter 04/05`
- Tempo relativo: "ha 2 dias", "em 1h 23min"
- Moedas: simbolo + valor (`$8.200`, `R$ 12.500`, `€ 450`)

### RNF-06 — Tokens UI

- ZERO hardcoded `bg-gray-900`, `text-emerald-400`, `bg-slate-800/70` no codigo novo da Home
- Usar `@/lib/ui-tokens` para spacing/font/color/motion
- Sidebar refatorada usa tokens (Onda 1 ja migra Sidebar como parte do escopo F10 + RF-07)
- Documentado em ADR (ver secao 12)

### RNF-07 — Zero regressao

- Todos os testes existentes (`npm run test`) continuam passando
- Sidebar mantem URLs (`/`, `/dashboard`, `/upload`, `/library`, `/coach`, `/grind`, `/mental`, `/coach-ai`, `/flight`, `/estudos`, `/biblioteca`, `/calculadoras`, `/bankroll`, `/analytics`, `/admin/users`, `/admin/bugs`)
- Badges de pending spots e biblioteca-novo continuam funcionando
- WelcomeNameModal primeiro login continua funcionando
- `<MiniChat>` global continua acessivel em rota `/`

### RNF-08 — Logging server

- `[home/overview] userId=X total=Yms cacheHit=Z subqueries={...}` log estruturado por request
- Log nivel `info` por request bem-sucedido, `error` por subquery falha (com stack)
- Sem PII em logs (nao logar email, nome real)

### RNF-09 — Instrumentacao analytics

6 eventos via `emit()` de `client/src/lib/tracker.ts` (D20):

| Evento | Disparo | Payload |
|---|---|---|
| `home_view` | Mount da Home (apenas 1x por mount) | `{ userState: 'empty' \| 'power', cacheHit: boolean }` |
| `home_block_view` | Cada bloco que mounta (1x por bloco por mount) | `{ blockId: 'S1' \| 'S2' \| ... \| 'S15', position: number }` |
| `home_block_click` | Click em qualquer interactivo dentro de um bloco | `{ blockId, action: string }` |
| `home_status_strip_kpi_click` | Click especifico em card do S1 | `{ kpi: 'banca' \| 'roi' \| 'hoje' \| 'pendencias' }` |
| `home_today_warmup_start` | Click no CTA "Iniciar warm-up" do S2 | `{ source: 'home' }` |
| `home_banner_dismiss` | Click no X de S3 (cooldown) | `{ blockId: 'S3' \| 'S5' }` (S5 nao dismissable em Onda 1, mas event preparado) |

Test-writer escreve teste por evento com spy em `emit`.

### RNF-10 — Seguranca

- Endpoint `/api/home/overview` requer JWT (`requireAuth` middleware existente)
- Cache server-side e estritamente per-userId (chave do Map = userId, nao IP/sessao)
- `/api/news` requer JWT
- `<NewsSlot>` em Onda 1 nao executa fetch externo (dados vem do `/api/home/overview` ou stub interno)

### RNF-11 — Compatibilidade browsers

- Chrome 120+ (target principal — pro players grindam Chrome desktop)
- Firefox 120+ , Edge 120+ , Safari 17+ (validacao manual)
- Sem polyfill novo (Vite + tsconfig target ja cuidam)
- `setInterval` countdowns funcionam em todos os browsers target

---

## 9. Modelo de Dados

**Tabelas tocadas:** **NENHUMA**. Onda 1 eh feature 100% read-only. Sem migration. Sem `CREATE TABLE`. Sem alteracao de schema.

**Tabelas LIDAS (via `storage.ts` queries existentes):**

- `users` (info do usuario logado, timezone)
- `tournaments` (lifetime totals, ROI 30d, sparkline)
- `planned_tournaments` (today, next, profile A/B/C)
- `profile_states` (perfil A/B/C/OFF do dayOfWeek)
- `grind_sessions` (recent 5)
- `bankroll_snapshots` ou `wallets` (banca total + BIs — confirmar com system-architect qual tabela atual)
- `cooldown_logs` (status active)
- `tournament_series` (status='active' para banner flight)
- `starred_hands` (pending top 5)
- `warmup_rituals` (hasWarmupToday)

**Schema do `NewsItem` em `shared/types/news.ts` (RF-03):**

Tipo TypeScript apenas (NAO eh tabela do banco). Definicao em RF-03.

---

## 10. API

### 10.1. Endpoint novo: `GET /api/home/overview`

| Aspecto | Detalhe |
|---|---|
| **Rota** | `GET /api/home/overview` |
| **Auth** | JWT obrigatorio (`requireAuth`) |
| **Module** | `server/routes/home.ts` (novo modulo) registrado em `server/routes/index.ts` |
| **Query params** | Nenhum (Onda 1) |
| **Resposta 200** | `HomeOverviewResponse` (schema em RF-01) |
| **Resposta 401** | `{ message: 'Unauthorized' }` |
| **Resposta 500** | `{ message: 'Internal error' }` apenas se erro fatal nao-recuperavel; subquery individual nao causa 500 (vira `null` no campo correspondente) |
| **Cache headers** | `Cache-Control: private, max-age=30` (espelha cache server-side) |
| **Cache server-side** | Map<userId, { data, expiresAt }>, TTL 30s in-memory |
| **Performance budget** | < 500ms p95 (RNF-01) |

### 10.2. Endpoint novo (stub): `GET /api/news`

| Aspecto | Detalhe |
|---|---|
| **Rota** | `GET /api/news` |
| **Auth** | JWT obrigatorio |
| **Module** | `server/routes/news.ts` (novo modulo) ou inline em `home.ts` (system-architect decide) |
| **Query params** | `source?: 'poker-software'` (validado, ignorado em stub), `limit?: number` (validado, ignorado em stub) |
| **Resposta 200** | `NewsResponse` com `enabled: false, items: []` em Onda 1 |
| **Resposta 401** | `{ message: 'Unauthorized' }` |
| **Cache headers** | `Cache-Control: private, max-age=300` (5min) |
| **Onda 3** | Mesma rota, implementacao real xAI Grok |

### 10.3. Endpoints REUSADOS (zero codigo backend novo)

Esses endpoints **ja existem** e sao chamados internamente pelo `/api/home/overview` via `storage.ts` (NAO via HTTP loopback):

| Endpoint | Para o que |
|---|---|
| `GET /api/dashboard/quick-stats` | Lifetime totals (F1) + threshold empty/power (RF-08) |
| `GET /api/dashboard/performance` | F6 sparkline + ROI 30d (S1) |
| `GET /api/grind-sessions/history?limit=5` | F2 |
| `GET /api/starred-hands/pending?limit=5` | F8 + S1 pendencias count |
| `GET /api/planned-tournaments?date=today` | S2 + S4 |
| `GET /api/profile-states` | S2 perfil A/B/C |
| `GET /api/bankroll` | S1 banca |
| `GET /api/cooldown-logs?status=active` | S3 + S1 cooldownAlerts |
| `GET /api/tournament-series?status=active` | S5 |

NOTA: Onda 1 chama as **funcoes do storage.ts** que esses endpoints chamam, NAO o HTTP. Implementer evita HTTP loopback.

---

## 11. Frontend — Arvore de Componentes

```
client/src/pages/Home.tsx (refatorado)
├── <HeaderLogo />                              [novo - RF-06]
├── <WelcomeNameModal />                        [existente]
├── if data.userState === 'empty':
│   └── <EmptyHomeOnboarding data />            [novo - RF-20]
├── if data.userState === 'power':
│   ├── <FlightBanner banner={banners.flight} />        [novo - RF-13, condicional]
│   ├── <CooldownBanner banner={banners.cooldown} />    [novo - RF-11, condicional]
│   ├── <StatusStrip data={statusStrip} />              [novo - RF-09]
│   ├── <TodayCard data={today} />                      [novo - RF-10]
│   ├── <NextTournamentCountdown data={nextTournament} />  [novo - RF-12]
│   ├── <LifetimeStats data={lifetime} />               [novo - RF-14]
│   ├── <RecentSessionsList data={recentSessions} />    [novo - RF-15]
│   ├── <PerformanceMini data={performance} />          [novo - RF-16]
│   ├── <PendingHandsList data={pendingHands} />        [novo - RF-17]
│   └── <NewsSlot enabled={data.news.enabled} items={data.news.items} />  [novo - RF-05]
├── <HomeFooter />                              [novo - RF-18]
└── <MiniChat /> (montado global em App.tsx, NAO duplicar)
```

### 11.1. Estados de carregamento

- Cada componente bloco aceita prop opcional `isLoading` ou trata `data === undefined`
- Cada componente tem `<Skeleton>` interno pro shape do bloco
- Fallback global: `<HomeSkeleton />` se a query falha completamente

### 11.2. Interacao com TanStack Query

```ts
const { data, isLoading, isError } = useQuery<HomeOverviewResponse>({
  queryKey: ['/api/home/overview'],
  queryFn: () => apiRequest('GET', '/api/home/overview'),
  staleTime: 30_000,
  refetchOnWindowFocus: true,
});
```

F6 toggle de periodo dispara query separada:

```ts
const { data: perfData } = useQuery({
  queryKey: ['/api/dashboard/performance', { period: f6Range }],
  queryFn: () => apiRequest('GET', `/api/dashboard/performance?period=${f6Range}`),
  enabled: f6Range !== '30d', // 30d ja vem no overview
});
```

### 11.3. Path de arquivos novos no client

```
client/src/components/home/
├── StatusStrip.tsx
├── TodayCard.tsx
├── NextTournamentCountdown.tsx
├── CooldownBanner.tsx
├── FlightBanner.tsx
├── LifetimeStats.tsx
├── RecentSessionsList.tsx
├── PerformanceMini.tsx
├── PendingHandsList.tsx
├── NewsSlot.tsx
├── HomeFooter.tsx
├── EmptyHomeOnboarding.tsx
└── HomeSkeleton.tsx (opcional — fallback global)

client/src/components/branding/
└── HeaderLogo.tsx
```

---

## 12. Feature Flags

| Flag | Localizacao | Default Onda 1 | Onda 3 |
|---|---|---|---|
| `NEWS_FEED_ENABLED` | env var server (`process.env.NEWS_FEED_ENABLED`) | `false` | `true` em prod apos QA |

- Frontend NAO le env diretamente — recebe valor via `data.news.enabled` no `/api/home/overview`
- Em Onda 1, valor sempre `false` (ignora env caso por engano alguem setar `true` — endpoint stub retorna `[]` mesmo)

---

## 13. ADRs a Criar

System-architect criou os 4 ADRs abaixo (numeracao real 099-102 — 096-098 ja ocupados por Sprint Bloco-A-Polish em paralelo no mesmo dia):

| ADR | Titulo proposto | Decisao principal |
|---|---|---|
| **ADR-099** | Home como Operations Cockpit Pessoal | Substituir Home launcher por cockpit acionavel; layout fixo Ondas 1+2; principios densidade <40%, 5-second rule, progressive disclosure (empty vs power). |
| **ADR-100** | News feed integration strategy (xAI Grok deferred to Onda 3) | Onda 1 prepara contrato + flag + slot; Onda 3 integra real. F4 (fofocas) vetada permanentemente. Tipo `NewsItem` em `shared/types/news.ts`. Custo estimado xAI Grok: <$2/user/mes com cache 1-3h. |
| **ADR-101** | Sidebar nova IA (grupos HOJE/GRIND/ESTUDOS/FERRAMENTAS/ADMIN) | Mantem URLs; renomeia grupo VISAO GERAL→HOJE; cria grupo ESTUDOS proprio; reordena GRIND para fluxo diario. Zero migration. |
| **ADR-102** | `/api/home/overview` cache strategy | TTL 30s in-memory per-userId Map; subqueries via Promise.allSettled com timeout 800ms cada; sem Redis em Onda 1; budget 500ms p95. |

ADR-5 do plano (custom layout) **fica para Onda 3** — NAO criar nesta sprint.

---

## 14. Criterios de Aceite Globais

### 14.1. Golden path power user

```
1. User loga (>=50 torneios)
2. Navega para `/`
3. Em <2s ve: Status Strip preenchido com 4 KPIs reais
4. Se ha cooldown, banner amber acima
5. Se ha flight ativo, banner verde acima do cooldown
6. Ve S2 Today com perfil A/B/C correto + qtd torneios + countdown
7. Ve F1 lifetime stats real
8. Ve F2 ultimas 5 sessoes com PnL colorido
9. Ve F6 sparkline 30d ROI
10. Ve F8 maos pendentes (ate 5)
11. Footer com bug report acessivel
12. NewsSlot invisivel (flag off)
13. Sidebar mostra grupo HOJE no topo, item "Hoje" ativo
14. Click no card Banca → navega `/bankroll`
15. Click no warm-up CTA → navega `/mental`
16. MiniChat FAB acessivel no canto inferior
```

### 14.2. Golden path empty state

```
1. User novo loga (0 torneios, 0 sessoes)
2. Navega para `/`
3. Ve checklist 4 passos centralizado
4. Step "Importar CSV" destacado como proximo
5. Click → navega `/upload`
6. Apos importar, retorna `/` → checklist mostra step 1 completo
7. Apos completar 4 steps, layout transiciona para power user
```

### 14.3. Testes

**Unit (Vitest jsdom project):**
- 1 teste por componente novo (smoke + props variations)
- Coverage mininimo: 80% lines em `client/src/components/home/`
- Mocks de TanStack Query via `vi.mock('@tanstack/react-query')` ou wrapper de teste com `QueryClientProvider`
- Mocks de wouter `Link` ja sao globais (`tests/setup.ts`)

**Integration (Vitest node project):**
- Test de `/api/home/overview` end-to-end com user fixture, validando schema completo
- Test de cache hit (2 calls seguidas, 2a com cacheHit=true)
- Test de subquery falhando (mock storage throw, endpoint retorna campo `null` mas 200)
- Test de timeout (subquery >800ms vira `null`)
- Test de auth (sem JWT → 401)

**E2E (manual / fora do escopo de Vitest):**
- Smoke test em browser real: golden path power + empty
- Validacao mobile breakpoints (Chrome DevTools responsive mode)

### 14.4. Zero regressao

- `npm run test` ⇒ tudo verde
- `npm run check` (tsc) ⇒ zero erros
- Sidebar mantem URLs e badges existentes
- WelcomeNameModal continua funcionando
- MiniChat continua acessivel via FAB

---

## 15. Riscos & Mitigacoes

| # | Risco | Severidade | Mitigacao |
|---|---|---|---|
| R1 | Endpoint composto vira N+1 (subqueries enchem o DB) | Medio | Promise.allSettled + timeout 800ms cada + budget total 500ms p95. Test de carga. |
| R2 | Cache 30s vira stale demais (user faz acao e Home nao atualiza) | Baixo | TTL 30s eh aceitavel para overview. Acoes criticas (importar CSV) o user ja navega para outras paginas. Refetch on focus mitiga. |
| R3 | Refactor sidebar quebra muscle memory de power users | Medio | URLs preservadas. Apenas labels e ordem mudam. Item `/` continua mais alto. Documentar em changelog. |
| R4 | `<MiniChat>` colide ou conflita com novo layout | Baixo | Nao criar embed na Home (D2). Verificar via teste smoke que FAB continua montando em rota `/`. |
| R5 | Tokens UI hardcoded ainda restantes em Sidebar.tsx pos-refactor | Medio | Reviewer faz checklist final. Greppable: zero `bg-gray-9`, `text-emerald-` no diff. |
| R6 | Power user reclama de 4 KPIs em vez dos 5 do plano original (perde streak) | Baixo | Streak vira metrica em F1 (D10). Founder cortou gamificacao especifica (badges, celebration), nao informacao. |
| R7 | Mobile horizontal scroll do Status Strip causa friction | Medio | Snap mandatorio (CSS scroll-snap). Indicador visual de "ha mais cards →" via gradient fade direito. |
| R8 | Banner cooldown re-aparece toda sessao mesmo apos dismiss | Baixo | D9 — comportamento intencional (cooldown ativo eh critico). Dismiss eh em-sessao apenas. |
| R9 | Empty state nao detecta corretamente (user importou pouco mas ja eh power) | Baixo | Threshold conservador (50 torneios E 5 sessoes). Botao manual "Pular onboarding" sempre disponivel. |
| R10 | NewsSlot causa layout shift quando flipar para Onda 3 | Baixo | Onda 1 retorna `null` (sem espaco). Onda 3 introduz espaco. Aceitar shift quando flag flipa (eh um deploy). |
| R11 | Founder muda ideia sobre streak em F1 e quer remover | Trivial | D10 ja documenta saida (substituir por "Ultimo upload"). 1 string change. |

---

## 16. Sequencia Sugerida de Implementacao

Sub-tarefas em ordem ascendente de dependencia. Cada uma pode virar PR isolado.

| # | Sub-tarefa | Depende de | Tipo | Esforco estimado |
|---|---|---|---|---|
| 1 | Criar `shared/types/news.ts` com `NewsItem` + `NewsResponse` | — | Backend | XS |
| 2 | Criar feature flag `NEWS_FEED_ENABLED` em config server + documentar em CLAUDE.md | — | Backend | XS |
| 3 | Criar endpoint stub `GET /api/news` retornando `{ enabled: false, items: [] }` | 1, 2 | Backend | S |
| 4 | Criar `server/routes/home.ts` com `GET /api/home/overview` (esqueleto + auth + Promise.allSettled wiring) | — | Backend | M |
| 5 | Implementar 9 subqueries via storage.ts em `home.ts` (banca, ROI, today, etc) | 4 | Backend | M |
| 6 | Adicionar cache 30s in-memory per-userId | 5 | Backend | S |
| 7 | Adicionar logging estruturado + `meta.subqueryTimingsMs` | 5 | Backend | XS |
| 8 | Criar `<HeaderLogo>` em `client/src/components/branding/HeaderLogo.tsx` | — | Frontend | XS |
| 9 | Refatorar `Sidebar.tsx` para usar `<HeaderLogo>` + aplicar D19 (5 grupos novos) | 8 | Frontend | M |
| 10 | Criar `<NewsSlot>` em `client/src/components/home/NewsSlot.tsx` | 1 | Frontend | XS |
| 11 | Criar shell da Home reformada `pages/Home.tsx` (TanStack Query + roteamento empty/power) | 4 | Frontend | M |
| 12 | Implementar `<StatusStrip>` (S1) | 5, 11 | Frontend | M |
| 13 | Implementar `<TodayCard>` (S2) | 5, 11 | Frontend | S |
| 14 | Implementar `<CooldownBanner>` + `<FlightBanner>` (S3 + S5) com prioridade D9 | 5, 11 | Frontend | S |
| 15 | Implementar `<NextTournamentCountdown>` (S4) com setInterval cleanup | 5, 11 | Frontend | S |
| 16 | Implementar `<LifetimeStats>` (F1) | 5, 11 | Frontend | XS |
| 17 | Implementar `<RecentSessionsList>` (F2) | 5, 11 | Frontend | S |
| 18 | Implementar `<PerformanceMini>` (F6) com toggle 7/30/90/YTD + localStorage | 5, 11 | Frontend | M |
| 19 | Implementar `<PendingHandsList>` (F8) | 5, 11 | Frontend | S |
| 20 | Implementar `<HomeFooter>` (S12) | — | Frontend | XS |
| 21 | Implementar `<EmptyHomeOnboarding>` (RF-20) com checklist 4 passos | 11 | Frontend | M |
| 22 | Wirear `<NewsSlot>` na Home (RF-19) | 10, 11 | Frontend | XS |
| 23 | Adicionar 6 eventos de tracking (RNF-09) via `emit()` | 11-22 | Frontend | S |
| 24 | Garantir mobile breakpoints (RNF-04) e a11y (RNF-03) por bloco | 12-22 | Frontend | M |
| 25 | Migrar todo codigo novo para `@/lib/ui-tokens` (RNF-06) | 11-22 | Frontend | S |
| 26 | Reviewer + system-architect criam 4 ADRs (099-102) | aprovacao spec | Doc | M |
| 27 | Smoke test manual em browser real golden path | 22 | QA | S |

**Esforco total estimado:** ~12-15 dias dev solo (1 sprint).

---

## 17. Definition of Done

A sprint **home-reform-1** esta DONE quando **todos** os bullets abaixo sao verdade:

### 17.1. Codigo

- [ ] `client/src/pages/Home.tsx` substituido (Home antiga zero presente — sem cards de modulo, sem onboarding permanente, sem 4 quick actions footer redundantes)
- [ ] 12 componentes novos criados em `client/src/components/home/` (lista RF-08 a RF-20)
- [ ] `<HeaderLogo>` criado em `client/src/components/branding/`
- [ ] `<NewsSlot>` integrado na Home (em Onda 1 retorna null)
- [ ] Sidebar refatorada com 5 grupos (HOJE/GRIND/ESTUDOS/FERRAMENTAS/ADMIN) e zero URL alterada
- [ ] `server/routes/home.ts` criado com `GET /api/home/overview`
- [ ] `server/routes/news.ts` (ou inline) com `GET /api/news` stub
- [ ] `shared/types/news.ts` criado com `NewsItem` + `NewsResponse`
- [ ] Feature flag `NEWS_FEED_ENABLED` lido em server, default false
- [ ] Zero hardcoded `bg-gray-`, `text-emerald-`, `bg-slate-` no codigo novo
- [ ] Componentes consomem `@/lib/ui-tokens`

### 17.2. Testes

- [ ] Test unit por componente novo (~12)
- [ ] Test integration `/api/home/overview` (auth, schema, cache, timeout, subquery falha)
- [ ] Test integration `/api/news` (auth, schema, flag off retorna empty)
- [ ] Test snapshot ou DOM-query da Sidebar refatorada (5 grupos na ordem D19)
- [ ] 6 testes de instrumentacao analytics (1 por evento RNF-09)
- [ ] Coverage `client/src/components/home/` >= 80% lines
- [ ] `npm run test` ⇒ tudo verde, zero regressao
- [ ] `npm run check` (tsc) ⇒ zero erros

### 17.3. Performance

- [ ] `/api/home/overview` < 500ms p95 medido (1 user, ~1k torneios, ~50 sessoes)
- [ ] Cache hit < 50ms p95
- [ ] LCP Status Strip < 1.5s desktop / < 2.5s mobile
- [ ] CLS < 0.1

### 17.4. Acessibilidade

- [ ] Lighthouse a11y score >= 95 na Home
- [ ] Navegacao por teclado completa (Tab atravessa todos os blocos)
- [ ] Banners tem `role="alert"`
- [ ] Sparkline tem `aria-label`
- [ ] Contrastes >= 4.5:1 (texto) e >= 3:1 (UI)

### 17.5. Mobile

- [ ] Mobile breakpoints validados em Chrome DevTools (320px, 375px, 414px, 768px, 1024px, 1280px, 1920px)
- [ ] Status Strip horizontal scroll-snap funciona em mobile
- [ ] Sem overflow horizontal acidental em qualquer breakpoint

### 17.6. Documentacao

- [ ] 4 ADRs criados (099-102)
- [ ] CLAUDE.md atualizado: env var `NEWS_FEED_ENABLED` documentada (secao 4)
- [ ] CLAUDE.md atualizado: roadmap secao 10 menciona home-reform-1 entregue
- [ ] `Docs/api/endpoints-index.md` lista 2 endpoints novos
- [ ] `Docs/api/endpoints.md` ou novo `home.md` documenta schema completo de `/api/home/overview`

### 17.7. Instrumentacao

- [ ] 6 eventos `emit()` implementados (RNF-09)
- [ ] Verificavel em DevTools console (`[track] home_view {...}`)

### 17.8. Aprovacao

- [ ] Reviewer aprovou
- [ ] System-architect validou ADRs
- [ ] Founder aprovou QA manual em ambiente dev
- [ ] Commit em `main` (ou merge de feature branch)

---

## 18. Notas de Implementacao (sugestoes nao-vinculantes)

- **TanStack staleTime 30s** alinhado com cache server-side. Se quiser cache mais longo no client, aumenta sem mudar server.
- **Para countdowns S4 e S5**, considere extrair hook `useCountdown(targetIso)` reutilizavel (1 lugar, 1 setInterval).
- **Skeletons individuais por bloco** > skeleton da pagina inteira. Da percepcao de "carregamento incremental".
- **Usar `Suspense` boundaries** com cuidado — TanStack Query nao precisa Suspense; `isLoading` flag eh suficiente.
- **`Promise.allSettled` no servidor** — preferir sobre `Promise.all` para nao derrubar o response inteiro se 1 subquery throw.
- **In-memory cache:** `Map<string, { data, expiresAt }>` com cleanup periodico opcional (ou aceitar leak — pequeno em dev). System-architect documenta na ADR-102.
- **Empty state pode reutilizar onboarding existente** se houver — `<WelcomeNameModal>` continua, mas o checklist 4 passos eh inline na Home, nao modal.

---

**Fim da spec home-reform-1. ADRs 099-102 + 4 diagramas Mermaid criados pelo system-architect em 2026-05-03. Proxima fase: test-writer (TDD red-phase).**
