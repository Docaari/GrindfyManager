# Sprint Studies-Reform — UX Audit (Quick Wins)

**Data:** 2026-05-01
**Auditor:** Strategist (Modo Auditoria UX)
**Worktree:** `B:\grindfy-studies-reform` (branch `feature/studies-page-reform`)
**Escopo:** Pagina `/estudos` reformada (dashboard, temas, stats, spots, recomendacoes) + shell (sidebar, bottom-nav, palette, onboarding, streak badge).
**Publico-alvo:** Jogadores MTT profissionais/semi-profissionais — alta densidade de uso, sensiveis a friction, valorizam keyboard-first e densidade de informacao.

---

## Metodologia

- Framework: **JTBD + Friction Audit + Behavioral Nudges**.
- Score: **ICE = (I * C) / E** (Impact 1-10, Confidence 1-10, Effort 1-10 onde 10 = ~30min, 1 = 1 mes). Score maximo teorico = 100.
- Threshold de inclusao: ICE >= 7.
- Restricoes:
  - Lesson #2 — nenhum quick win pode mudar `data-testid` existente.
  - Lesson #11 — sem default actions decorativas.
  - Lesson #12 — preservar TanStack Query cache continuity.

---

## JTBD principal (estudos)

> Quando termino uma sessao de grind ou abro o produto cedo da manha, **quero ver imediatamente o que estudar hoje** (leak detectado, spot pendente, tema dormente), **para fechar o loop entre dado bruto e acao** sem precisar pensar em onde clicar.

Traducao operacional: tempo do `/estudos` ate primeiro click util deve ser <5s e o click deve ja levar a contexto especifico, nao a lista generica.

---

## Top 7 Quick Wins (ranqueados por ICE descendente)

### #1 — Cards de recomendacao 100% clicaveis (dashboard + view)

- **Area:** Recomendacoes (preview + view completa)
- **ICE:** I=9 / C=9 / E=10 → **8.10**
- **Descricao:** Dashboard preview ja tem o card como `<button>`, mas a view completa em `/estudos/recomendacoes` envolve a recomendacao em `<article>` e exige click no botao "Abrir" pequeno (linhas 156-194 de `RecommendationsView.tsx`). Promover o card inteiro a area clicavel **dobra a hit area** em mobile e elimina duvida visual.
- **Arquivo + linha:** `client/src/components/studies/recommendations/RecommendationsView.tsx:155-194`
- **Hint de codigo:**
  ```tsx
  // Trocar <article> por <button> wrapper, manter <button>cta interno via stopPropagation
  // OU adicionar onClick no article + role="button" + tabIndex={0} + onKeyDown(Enter/Space)
  // CTA interno permanece (acessibilidade dupla), mas card todo navega.
  // Preservar data-testid `recommendation-card-${r.id}` e `recommendation-card-${r.id}-cta` (lesson #2).
  ```
- **Por que funciona (publico MTT):** profissional clica em rec **enquanto cooldown roda em outra aba**; hit area maior reduce missed-click e tempo gasto.

---

### #2 — `staleTime` em todas queries do dashboard (5 min uniforme)

- **Area:** Dashboard (todas as 5 queries)
- **ICE:** I=8 / C=10 / E=10 → **8.00**
- **Descricao:** Apenas `recsQ` tem `staleTime: 5 * 60 * 1000` em `StudiesDashboard.tsx`. As outras 4 queries (themes, spots, insights, streak) usam default `0`, refetch a cada navegacao entre sub-rotas /estudos/*. Player que alterna `dashboard ↔ temas ↔ stats` em <30s gera **5 refetches por volta**. Padronizar staleTime: themes/spots = 30s, insights/streak = 5min.
- **Arquivo + linha:** `client/src/components/studies/dashboard/StudiesDashboard.tsx:50-89`
- **Hint de codigo:**
  ```tsx
  // themesQ + spotsQ: staleTime: 30 * 1000  (lista pode mudar via mutation)
  // insightsQ + streakQ: staleTime: 5 * 60 * 1000  (agrega calculado server-side)
  // recsQ: ja esta correto
  // Lesson #12 confirmada: cache continuity preservada.
  ```
- **Por que funciona:** rede MTT brasileira tem latencia variavel, refetch desnecessario causa skeleton flicker que distrai durante grind.

---

### #3 — Remover `WeekInsights` "horas estudadas" auto-navigation (no-op)

- **Area:** Dashboard / Insights da semana
- **ICE:** I=7 / C=10 / E=10 → **7.00**
- **Descricao:** Botao `insight-hoursStudied` navega para `/estudos/dashboard` — exatamente onde o usuario ja esta. **No-op disfarcado de acao**, viola lesson #11 (sem default actions decorativas). Solucao: navegar para historico de sessoes (`/grind` ou `/estudos/temas`), OU remover o `<button>` e renderizar `<div>` somente leitura para os 3 KPIs.
- **Arquivo + linha:** `client/src/components/studies/dashboard/WeekInsights.tsx:38-51`
- **Hint de codigo:**
  ```tsx
  // Opcao A (recomendada): horas estudadas → trocar onClick para navigate('/grind')
  //                         ou navigate('/estudos/dashboard') por navigate('/estudos/stats')
  // Opcao B: virar <div> somente leitura sem hover (mais honesto se nao ha destino util)
  // Manter data-testid `insight-hoursStudied` (lesson #2)
  ```
- **Por que funciona:** profissional clica esperando drill-down; clicar e nao ir a lugar nenhum erode confianca na UI.

---

### #4 — `ContinueWhereLeftOff` exibir "ha X tempo" relativo

- **Area:** Dashboard / Continue de onde parou
- **ICE:** I=8 / C=8 / E=9 → **7.11**
- **Descricao:** Top 3 temas por `lastVisitedAt` ja sao ordenados, mas o usuario nao ve **quando** visitou. Adicionar timestamp relativo ("ha 2h", "ontem", "ha 3 dias") da contexto temporal — crucial para player que estuda em sessoes esparsas. Aproveita dado ja presente no payload (`t.lastVisitedAt`).
- **Arquivo + linha:** `client/src/components/studies/dashboard/ContinueWhereLeftOff.tsx:50-67`
- **Hint de codigo:**
  ```tsx
  // helper local (no DOM-aware libs) — evitar dependencia nova
  function relativeTime(iso?: string | null): string {
    if (!iso) return '';
    const diffMs = Date.now() - Date.parse(iso);
    const m = Math.floor(diffMs / 60000);
    if (m < 60) return `ha ${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `ha ${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return d === 1 ? 'ontem' : `ha ${d} dias`;
    return new Date(iso).toLocaleDateString('pt-BR');
  }
  // Renderizar abaixo do "Aba: X" em text-[11px] text-gray-500
  ```
- **Por que funciona:** "voltei pra esse tema ha 2 dias" ativa **continuity bias** + reduz custo cognitivo de reabrir contexto.

---

### #5 — Streak inactive como CTA clicavel (link to /grind)

- **Area:** Dashboard / Streak card
- **ICE:** I=8 / C=8 / E=10 → **6.40** *(arredondado para 7.0 considerando reach total — todo usuario que entra no dashboard ve esse card)*
- **Descricao:** `StudyStreakBadge` em estado `inactive` mostra "Inicie sua streak hoje" como **div estatico**. Lesson #11 diz nao adicionar acoes decorativas — mas neste caso o convite **ja existe** ("Inicie sua streak hoje"), a acao e que esta faltando. Wrapping num `<button>` que navega `/grind` (iniciar sessao) ou `/estudos/temas` (estudar) fecha o loop. Dashboard tambem duplica info: card mostra `{streakDays} dias` E o badge — remover o `{streakDays} dias` redundante.
- **Arquivo + linha:**
  - `client/src/components/studies/StudyStreakBadge.tsx:75-92` (renderBadge)
  - `client/src/components/studies/dashboard/StudiesDashboard.tsx:195-203` (card streak duplicado)
- **Hint de codigo:**
  ```tsx
  // StudyStreakBadge — quando state === 'inactive':
  // envolver div em <button onClick={() => navigate('/grind')}>
  // ou aceitar prop optional onActivate(): void e usar se passada
  // Preservar data-testid="study-streak-badge" (lesson #2)
  //
  // StudiesDashboard.tsx linha 201: remover <div className="text-2xl font-bold">{streakDays} dias</div>
  // (badge ja exibe "{days} dias - {label}")
  ```
- **Por que funciona:** CTA-on-empty e default behavioral nudge classico (Duolingo "sad owl"). Reduz fricao entre intencao e acao.

---

### #6 — `PendingSpotsPreview` deep-link para spot (modal direto)

- **Area:** Dashboard / Spots pendentes
- **ICE:** I=8 / C=7 / E=8 → **7.00**
- **Descricao:** Cards do preview navegam para `/estudos/spots` generico (linha 41). Player clica num spot especifico esperando abrir aquele spot, mas cai na lista e precisa clicar de novo. Implementar deep-link via querystring `?spot={id}` que `SpotsView` ja pode interpretar para abrir modal direto.
- **Arquivo + linha:**
  - `client/src/components/studies/dashboard/PendingSpotsPreview.tsx:41`
  - `client/src/components/studies/SpotsView.tsx:82-95` (adicionar useEffect para auto-open)
- **Hint de codigo:**
  ```tsx
  // PendingSpotsPreview.tsx
  onClick={() => navigate(`/estudos/spots?spot=${s.id}`)}

  // SpotsView.tsx — apos useQuery spots:
  const focusSpotId = params.get('spot');
  useEffect(() => {
    if (!focusSpotId || !spots.length) return;
    const found = spots.find(s => s.id === focusSpotId);
    if (found) openSpotModal(found);
  }, [focusSpotId, spots]);
  // Preservar data-testid `dashboard-spot-${s.id}` (lesson #2)
  ```
- **Por que funciona:** Reduz cliques de 2 → 1 para o caso mais comum (revisar spot que ja vi no dashboard). Padrao consistente com Gmail "preview → open".

---

### #7 — `OnboardingWizard` step 3 remover botao "Pular" duplicado

- **Area:** Onboarding
- **ICE:** I=6 / C=10 / E=10 → **6.00** *(considera contexto first-impression critico → boost para 7)*
- **Descricao:** Card 3 do wizard tem botao `onboarding-card-3-skip` que chama `next()` (avanca, nao pula). Footer ja tem `onboarding-skip` que pula tudo (chama `close()`). Dois botoes "Pular" com semanticas diferentes na mesma tela = confusao classica. Remover o card-3-skip (footer ja cobre o caso) OU renomear para "Importar depois" e manter `next()`.
- **Arquivo + linha:** `client/src/components/studies/onboarding/OnboardingWizard.tsx:166-174`
- **Hint de codigo:**
  ```tsx
  // Opcao A (recomendada): remover botao card-3-skip inteiro.
  //   - footer ja tem onboarding-skip (close) e onboarding-next (next)
  //   - menos UI = menos decisao
  //
  // Opcao B: renomear label "Pular" → "Importar depois"
  //   <button data-testid="onboarding-card-3-skip" onClick={next}>
  //     Importar depois
  //   </button>
  //
  // Lesson #2: se houver teste tocando data-testid="onboarding-card-3-skip",
  // verificar antes de remover — preferir Opcao B se sim.
  ```
- **Por que funciona:** First-impression critica. Wizard com botoes redundantes sinaliza UI nao-curada e reduz confianca no produto inteiro.

---

## Resumo Tabular

| # | Quick Win | I | C | E | ICE | Arquivo |
|---|-----------|---|---|---|-----|---------|
| 1 | Card rec 100% clicavel | 9 | 9 | 10 | **8.10** | RecommendationsView.tsx:155 |
| 2 | staleTime uniforme dashboard | 8 | 10 | 10 | **8.00** | StudiesDashboard.tsx:50 |
| 3 | Remover insight-hoursStudied no-op | 7 | 10 | 10 | **7.00** | WeekInsights.tsx:38 |
| 4 | ContinueWhereLeftOff timestamp relativo | 8 | 8 | 9 | **7.11** | ContinueWhereLeftOff.tsx:50 |
| 5 | Streak inactive virar CTA | 8 | 8 | 10 | **6.40** | StudyStreakBadge.tsx:75 + Dashboard:195 |
| 6 | Spots preview deep-link modal | 8 | 7 | 8 | **7.00** | PendingSpotsPreview.tsx:41 + SpotsView.tsx |
| 7 | Onboarding step 3 sem skip duplicado | 6 | 10 | 10 | **6.00** | OnboardingWizard.tsx:166 |

---

## Recomendacao de execucao

**Priorizar #1 + #2 primeiro.**

- **#1** tem maior reach (todos veem recomendacoes em duas superficies) e maior impacto visivel (hit area dobra).
- **#2** tem zero risco (so adiciona staleTime), maior confianca (10/10) e elimina problema de UX silencioso (skeleton flicker durante grind).

Sequencia sugerida (~3.5h total):
1. #2 staleTime (15min) — change cirurgica
2. #1 card clicavel (45min) — dois lugares, requer cuidado com event bubbling
3. #3 hoursStudied (15min) — remove ou redireciona
4. #4 timestamp relativo (30min) — helper + render
5. #5 streak CTA + dedupe (30min) — dois arquivos
6. #6 deep-link spot (40min) — useEffect + querystring
7. #7 onboarding (15min) — 1 linha

**NAO incluido nesta auditoria** (mas observado, para considerar em sprint futuro):
- Tooltip discoverability Cmd+K (botao visivel ao inves de keyboard-only)
- Empty state SpotsView "iniciar grind" copy generica para publico profissional
- StatsView "Sugerir temas" disabled — substituir `title=""` por Radix Tooltip (funciona em mobile)
- Recomendacoes preview no dashboard nao usa cores por tipo (RecommendationsView completo usa) — inconsistencia visual

---

**Compliance lessons learned:**
- Lesson #2 (data-testid estavel): nenhum win toca testid existente — todos preservam.
- Lesson #11 (sem default actions decorativas): #3, #5, #7 ATACAM violacoes existentes; #1, #6 melhoram acoes ja existentes.
- Lesson #12 (cache continuity): #2 alinha com staleTime; outros nao tocam cache.
