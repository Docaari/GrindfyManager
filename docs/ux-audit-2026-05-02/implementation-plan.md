# Plano de Implementacao UX — 2026-05-02

Base: 130+ achados de `Docs/ux-audit-2026-05-02/`. Pipeline padrao Grindfy:
`pm-spec → system-architect → test-writer → implementer → /simplify → reviewer → (deployer opcional)`

---

## Principios do Plano

1. **Foundation antes de polish** — convencoes/tokens primeiro; senao retrabalho
2. **Quick wins globais antes de page-specific** — `hover:scale` cleanup global > 1 pagina por vez
3. **Refatoracoes estruturais isoladas** — GrindSessionLive nao mistura com outros sprints
4. **Pipeline obrigatorio** em sprints com >3h de codigo. Bypass so em cleanup global puro (1-2h, sem logica)
5. **Reviewer GATE antes de merge** sempre. Sem excecao
6. **1 ADR por decisao arquitetural** (ex: design tokens, command palette global, dialog mutex pattern)

---

## Fase 0 — Foundation (1 sprint, ~3 dias)

### Sprint UI-FND-1 — Convencoes + Design Tokens

**Objetivo**: criar fonte de verdade visual antes de tocar paginas. Senao replicamos inconsistencia.

**Pipeline:**
- `pm-spec` — escrever spec "Sistema de Design UI Grindfy" (escopo: tokens, padroes)
- `system-architect` — ADR "Design tokens + UI patterns" + diagrama de hierarquia componentes
- `test-writer` — testes pra helpers novos (cn merge, semantic color resolver)
- `implementer` — entrega:
  - `client/src/lib/ui-tokens.ts` — spacing scale (4/8/12/16/24/32), font sizes (12/14/16/20/24/32), color semantic (success/danger/warn/info/action/neutral)
  - `client/src/components/ui/EmptyState.tsx` — componente padrao (icon + title + subtext + CTA + optional link)
  - `client/src/components/ui/FilterChip.tsx` — chip removivel padrao
  - `client/src/components/ui/PageHeader.tsx` — header consistente (title + subtitle + actions slot)
  - `Docs/conventions/ui-patterns.md` — guia de uso (replicar do README do audit)
- `/simplify`
- `reviewer`

**Definition of done:**
- Tokens cobrindo 100% dos casos catalogados no audit
- 4 componentes utilitarios criados + testados
- Doc `ui-patterns.md` aprovada
- ZERO mudanca em paginas existentes (so foundation)

**Saida ADR esperado**: ADR-077 "Design tokens + UI patterns canonicos"

---

## Fase 1 — Quick Wins Globais (1 sprint, ~2 dias)

### Sprint UI-QW-1 — Padronizacao Global

**Objetivo**: aplicar limpezas low-effort/high-impact em batch. Sem logica nova, so substituicao + cleanup.

**Pipeline (reduzido — sem testes novos, so refactor visual):**
- `pm-spec` curto — listar mudancas globais
- `implementer` — entrega:
  - **G1** Remover `hover:scale-[1.02]` em todas paginas (Home, Library, UploadHistory)
  - **G2** Padronizar emoji em h1/h2 (banir; manter so em onboarding/empty)
  - **G3** Migrar `window.confirm()` -> AlertDialog Radix (GrindSession recovery)
  - **G4** Migrar `fetch()` -> `apiRequest()` (Bankroll page)
  - **G5** Header pages alinhado esquerda (UploadHistory ja text-center)
  - **G6** Aplicar `<EmptyState>` novo em Library + UploadHistory list + GrindSession history vazio
  - **G7** Aplicar `<FilterChip>` novo em Dashboard + Library + GrindSession (substitui implementacoes ad-hoc)
  - **G8** Padronizar copy "Em breve" vs "Sendo preparados" — escolher 1
- `/simplify`
- `reviewer` — DOUBLE check (mudanca global = risco regressao visual)

**Definition of done:**
- Smoke test manual em todas paginas Tier 1
- Reviewer aprovou regressao visual zero
- Tests existentes 100% verde

**Achados resolvidos:** H6, L11, U9 (scale), H7 (emoji), GS3 (confirm), B5 (fetch), U10 (header), L4 + U2 + GS6-recovery (empty), D1 + L2 + GL8 (chips), BL3 (copy).

---

## Fase 2 — Pages Tier 1 Polish (4 sprints paralelos possiveis, ~5-7 dias cada)

Cada sprint = 1 pagina. Pipeline completo. Independentes — podem rodar paralelo via worktrees.

### Sprint UI-T1-Home — Home polish

**Achados alvo**: H1, H2, H3, H4, H5, H8, H9, H10

**Pipeline completo:**
- `pm-spec` — spec "Home revamp"
- `system-architect` — fluxograma: novo Hub Home (proxima acao recomendada + onboarding condicional)
- `test-writer` — testes:
  - Onboarding hidden quando todos steps completed
  - Stat cards renderizam sparkline + delta
  - Card "proxima acao recomendada" com state-driven content
  - Skeleton match layout final
  - WelcomeNameModal expandido (nome + rede + ABI)
- `implementer`
- `/simplify`
- `reviewer`

**ADR**: nao necessario.

---

### Sprint UI-T1-Dashboard — Dashboard polish

**Achados alvo**: D2, D3, D4, D5, D6, D7, D8, D9, D10, D11, D12, D13

**Pipeline completo:**
- `pm-spec` — spec "Dashboard topology refactor"
- `system-architect` — diagrama: novo layout (header → filters chips → metrics core → tabs simplificadas → tab content). ADR pequena se mudanca em URL state.
- `test-writer` — testes:
  - Reagrupar widgets topo (Bankroll/ROI/Tickets) em "Resumo Financeiro" expandivel
  - Tabs reduzidas pra 4 + dropdown "Mais"
  - Splash com CTA "Ver dashboard hoje"
  - Empty state oculta widgets abaixo
  - Subtitulo dinamico com filtros aplicados
  - Atalhos teclado F/R/1-8
- `implementer`
- `/simplify`
- `reviewer`

**ADR potencial**: ADR-078 "Dashboard tabs strategy: 4 + overflow"

---

### Sprint UI-T1-Library — Library polish

**Achados alvo**: L1, L3, L5, L6, L7, L8, L9, L10, L12

**Pipeline completo:**
- `pm-spec` — spec "Library card density + filters uniformes"
- `system-architect` — fluxograma: card compacto vs detalhado (hover/click expand)
- `test-writer` — testes:
  - Filtros uniformes (sem 7 gradientes)
  - Card compacto: 3 stats principais
  - Density toggle (compact/detail)
  - Sort persiste em URL
  - Virtualizacao quando >50 grupos (react-virtual)
  - Modal de detalhe com export CSV
  - Sortable headers no modal
- `implementer`
- `/simplify`
- `reviewer`

---

### Sprint UI-T1-Upload — Upload onboarding (P0)

**Achados alvo**: U1, U3, U4, U5, U6, U7, U8, U11

**Pipeline completo (PRIORIDADE MAX):**
- `pm-spec` — spec "Upload onboarding por rede + tutorial visual"
- `system-architect` — fluxograma: tabs por rede (WPN/GG/Stars/Party/888/Bodog/Coin/Chico/Revolution/iPoker) + steps visuais + sample CSVs
- `test-writer` — testes:
  - Tab por rede ativa muda tutorial
  - Sample CSV download funcional
  - GranularDataCleanup MOVIDO pra Settings/Avancado (smoke test ambas paginas)
  - Confirmacao no delete de upload (AlertDialog)
  - Filter bar na lista (status, site, busca)
  - Stats com sparkline + delta
  - Helper `invalidateAfterUpload()` centralizado
- `implementer`
- `/simplify`
- `reviewer`

**ADR**: ADR-079 "Onboarding-driven import flow: tabs por rede + samples"

---

### Sprint UI-T1-Grind — GrindSession polish

**Achados alvo**: GS1 (P0!), GS2, GS4, GS5, GS7, GS8, GS9, GS10, GS11, GS13

**Pipeline completo:**
- `pm-spec` — spec "GrindSession state cleanup + UX hierarchy"
- `system-architect` — diagrama: dialog state reducer + nova hierarquia CTA (1 primary)
- `test-writer` — testes:
  - GS1 fix: early return apos hooks (regressao test pra Rules of Hooks)
  - Reducer activeModal funcional
  - StopBanner com CTAs ("Ver banca", "Configurar limites")
  - Recovery banner expandido com data + profit parcial + torneios
  - CTA primario unico + dropdown
  - Filter URL params (paridade Dashboard FP-11)
  - Mental-circle animation via CSS/Framer (nao DOM direto)
- `implementer`
- `/simplify`
- `reviewer`

---

## Fase 3 — Refatoracoes Estruturais (3 sprints, sequenciais, ~7-10 dias cada)

Sprints monstruosos. NAO paralelos (modificam mesmo dominio). NAO podem ser apressados.

### Sprint UI-REF-1 — GrindSessionLive Decomposition (P0)

**Achados alvo**: GL1, GL2, GL3, GL4, GL5, GL6, GL7, GL10

**Pre-requisito**: Sprint UI-FND-1 completo + UI-T1-Grind completo.

**Pipeline completo MAIOR:**
- `pm-spec` — spec "GrindSessionLive: refactor 2460L em 7 sub-componentes" (escopo extenso)
- `system-architect` — DIAGRAMA C4 obrigatorio. ADR-080 "Container/presenter split de GrindSessionLive". Identificar boundary de cada container:
  - `SessionLiveContainer` (orquestracao + queries)
  - `SessionLiveHeader` (timer + pause + finalizar)
  - `SessionLiveTournamentBoard` (lista + bulk actions + filters)
  - `SessionLiveAlerts` (alertas vinculados)
  - `SessionLiveBankroll` (banca + acumulador)
  - `SessionLiveBreaks` (breaks system)
  - `SessionLiveDialogs` (dialog mutex via reducer)
- `test-writer` — testes obrigatorios:
  - Smoke test integration (sessao completa: start → add 5 torneios → break → reconcile → finish) PRECISA passar antes E depois
  - Cada container isolado com props bem definidas
  - Reducer dialogStack mutex test
  - Bankroll shot via Radix AlertDialog (substituir custom modal)
  - Layout 3-colunas fixo (sticky header + sidebar + main scroll)
  - Banner pausa visivel
  - Sistema unificado de notes (timeline)
  - Bulk action bar sticky bottom
  - Alert managers consolidados
- `implementer` — 1 container por dia (~7 dias)
- `/simplify` POS cada container
- `reviewer` ROUND 3 garantido (massa de mudancas)

**ADR**: ADR-080 "GrindSessionLive container decomposition"

**Risco alto**: regressao em sessao live = founder/users perdem dados. Smoke test integration NAO opcional.

---

### Sprint UI-REF-2 — Settings Shell Navigation

**Achados alvo**: SE1, SE2, SE3, SE4

**Pre-requisito**: UI-FND-1 completo.

**Pipeline completo:**
- `pm-spec` — spec "Settings shell com tabs"
- `system-architect` — diagrama: shell com tabs (Geral / Banca / Alarmes / Voz-TTS / Sidebar / Dados / Avancado) + URL routing por tab. ADR pequena se decisao de URL pattern.
- `test-writer` — testes:
  - Cada tab carrega view isolada
  - URL routing `/settings/banca` funciona + back/forward
  - Settings reducer ou RHF unico (substituir 15+ useState)
  - Zod schema central de validacao
  - GranularDataCleanup MOVE-IN aqui (vindo de UploadHistory)
  - Bankroll legacy movement MOVE-IN (vindo de Bankroll page)
- `implementer` — 1 tab por dia
- `/simplify`
- `reviewer`

**ADR potencial**: ADR-081 "Settings sub-routing strategy"

---

### Sprint UI-REF-3 — GradePlanner Decomposition

**Achados alvo**: GP1, GP2, GP3, GP4, GP5

**Pre-requisito**: UI-FND-1 completo.

**Pipeline completo:**
- `pm-spec` — spec "GradePlanner sub-componentes + rota /grade"
- `system-architect` — diagrama. ADR potencial se migrar dnd-kit (decisao de lib).
- `test-writer` — testes:
  - Renomear A/B/C semanticamente (Volume Alto/Medio/Baixo + Off)
  - Rota `/coach` -> redirect `/grade` (sem quebrar bookmarks)
  - Reducer dialog state (4 dialogs)
  - NewTournament em steps (Basico → Avancado)
  - Validacao incremental on-blur
  - Sub-componentes (DayColumn, TournamentRow, FilterBar) extraidos
  - Avaliacao dnd-kit (apenas spike, decisao deferida)
- `implementer`
- `/simplify`
- `reviewer`

**ADR potencial**: ADR-082 "GradePlanner decomposition + profile naming semantica"

---

## Fase 4 — Tier 2 Polish (3 sprints paralelos, ~3 dias cada)

### Sprint UI-T2-Coach — CoachAI polish

**Achados alvo**: C1-C12 (todos)

**Pipeline completo:**
- `pm-spec`, `system-architect` (sem ADR), `test-writer`, `implementer`, `/simplify`, `reviewer`

**Destaque**: prompt starters por persona + counter de limites + auto-scroll inteligente + stop generation.

---

### Sprint UI-T2-Bankroll — Bankroll polish

**Achados alvo**: B1, B2, B3, B4, B6, B7, B8, B9

**Pipeline completo.**

**Destaque**: header 1 primary + 1 secondary + dropdown. Remover BankrollWidget duplicado.

---

### Sprint UI-T2-MentalPrep — MentalPrep polish

**Achados alvo**: MP1 (P0!), MP2, MP3, MP4, MP6, MP7

**Pipeline completo (curto).**

**Destaque**: fix Rules of Hooks (MP1). Card warm-up urgencia visual quando vencido. Toast com CTA "Iniciar grind".

---

## Fase 5 — Audit Completion + Tier 4 (2 sprints, ~3 dias cada)

### Sprint UI-AUDIT-2 — Cobertura completa do audit

**Pipeline parcial** (so audit, sem implementacao):
- `Explore` agent (background) — lê paginas restantes:
  - Auth (7): Login, Register, ForgotPassword, ResetPassword, VerifyEmail, RegistrationConfirmation, Landing
  - Admin (5): AdminDashboard, AdminUsers, AdminBugs, Analytics, AdminCoachAnalytics
  - Outras (4): Calculadoras, SessionHistory, Subscriptions, SubscriptionDemo
  - Settings completo (linhas 150-1176)
  - GradePlanner completo (linhas 200-978)
- Saida: `audit-tier4-auth.md`, `audit-tier4-admin.md`, `audit-tier4-misc.md` + atualizacoes em audit-tier3 (Settings/GradePlanner completos)

---

### Sprint UI-T4-Auth — Auth conversion polish

**Pre-requisito**: UI-AUDIT-2 completo.

**Pipeline completo:**
- `strategist` — analise de conversao + heuristicas best-in-class (Stripe, Linear)
- `pm-spec` — spec baseado em achados auth
- demais agentes

**Destaque esperado**: copy melhor, social proof, error messaging, password strength UX.

---

### Sprint UI-T4-Admin — Admin polish (low priority)

**Pre-requisito**: UI-AUDIT-2 completo.

**Pipeline reduzido** (uso interno = padrao mais relaxado):
- `pm-spec` curto + `implementer` direto + `reviewer`

---

## Sequenciamento Recomendado

```
Semana 1:  [Fase 0] UI-FND-1 (3 dias)
           [Fase 1] UI-QW-1 (2 dias)

Semana 2:  [Fase 2] UI-T1-Upload (P0!) (5 dias) — alguem AFK = solo critical path
           Paralelo (worktree): UI-T1-Home (5 dias)

Semana 3:  Paralelo (worktrees):
           - UI-T1-Dashboard (5 dias)
           - UI-T1-Library (5 dias)
           - UI-T1-Grind (5 dias)

Semana 4:  [Fase 3] UI-REF-1 GrindSessionLive (7 dias) — bloqueia outros (reuso de patterns)

Semana 5:  Paralelo:
           - UI-REF-2 Settings shell (5 dias)
           - UI-REF-3 GradePlanner (5 dias)

Semana 6:  Paralelo:
           - UI-T2-Coach (3 dias)
           - UI-T2-Bankroll (3 dias)
           - UI-T2-MentalPrep (2 dias)

Semana 7:  [Fase 5] UI-AUDIT-2 background (3 dias)
           [Fase 5] UI-T4-Auth (5 dias)
           [Fase 5] UI-T4-Admin (3 dias)
```

**Total**: 7 semanas com paralelismo via worktrees + agentes background.
**Conservador (solo serial)**: ~12 semanas.

---

## Definicao de Sucesso por Fase

| Fase | Metrica de sucesso |
|------|--------------------|
| 0 | Tokens criados + 4 componentes + ui-patterns.md aprovada. ZERO regressao. |
| 1 | Smoke test Tier 1+2 visualmente OK. Achados globais resolvidos no audit. |
| 2 | Cada pagina Tier 1 com 80%+ achados P1/P2 resolvidos. Testes verdes. |
| 3 | GrindSessionLive < 800 linhas/container. Smoke test integration OK. |
| 4 | Tier 2 paginas 80%+ achados resolvidos. |
| 5 | 100% cobertura audit. Auth com benchmarks de conversao documentados. |

---

## Risco e Mitigacao

| Risco | Mitigacao |
|-------|-----------|
| Regressao visual em UI-QW-1 (mudanca global) | Reviewer DOUBLE-check + smoke test Tier 1 antes merge |
| GrindSessionLive refactor quebra sessao live | Smoke test integration COMPLETO (start→add→break→reconcile→finish) antes E depois. Founder QA antes merge main. |
| Settings shell quebra deep links existentes | URL backward-compat: `/settings#bankroll` -> `/settings/banca` redirect |
| Decisao dnd-kit sem aval founder | ADR + opcao deferred (so spike, nao migracao) |
| Conflito merge entre worktrees paralelos | Pages independentes em sprints paralelos. Refactor structural NAO paralelo. |

---

## Achados que NAO entram (ou ficam pra depois)

- **GP6 (GradePlanner audit completo)** — entra em UI-AUDIT-2
- **SE5 (Settings audit completo)** — entra em UI-AUDIT-2
- **GL15, GL16 (P3 cleanup minor)** — backlog tecnico
- **C10-C12 (CoachAI P3)** — incluido em UI-T2-Coach mas pode ser cortado se tempo apertar
- **BL5, BL6, ST1-ST5 (Biblioteca/Studies P2-P3)** — sprint dedicado opcional UI-T3-Polish, criar so se founder quiser

---

## Decisoes do Founder (2026-05-02) — APROVADAS

1. **Escopo**: 7 semanas completo (todas 5 fases / 11 sprints)
2. **Paralelismo**: SIM via worktrees (Tier 1 + Tier 2 paralelos)
3. **Tier 4 Admin**: INCLUI (audit + polish)
4. **dnd-kit**: MIGRAR ja em UI-REF-3 (sem spike, full migration)
5. **Biblioteca/Studies polish**: SIM, sprint dedicado UI-T3-Polish (~3 dias)
6. **QA**: pos-cada-sprint (founder valida antes merge main)

**Implicacoes:**
- UI-REF-3 GradePlanner cresce ~5 dias (dnd-kit migration). Sprint vira ~10 dias.
- +1 sprint UI-T3-Polish na Fase 5.
- QA pos-sprint = ciclo completo: implementer -> reviewer -> founder QA -> merge.
- Total real: ~7-8 semanas com paralelismo agressivo.

---

## Proximo Passo

Apos aprovacao do plano:
1. Spawn `pm-spec` agent pra criar spec do **Sprint UI-FND-1** (Foundation)
2. Spec aprovada -> spawn `system-architect` (ADR-077 + componentes)
3. Pipeline TDD inteiro
4. Merge em main + memory atualizada
5. Disparar Fase 1 (UI-QW-1) em sequencia
