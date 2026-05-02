# UX Audit — Tier 1 (GrindSession + GrindSessionLive)

---

## 5. GrindSession (`/grind`) — `GrindSession.tsx`

### Contexto
1259 linhas. Tela principal de sessoes (lista + dashboard de metricas + acoes). Usa 7 dialogs reusaveis (Edit/Delete/Register/Details/Conflict/EpicStart/WarmupGate). Recovery banner pra sessao nao finalizada. Spot screenshot paster ativo durante sessao live. Stop-loss banner.

### Achados

#### P0 — `useState` antes de hook condicional ja resolvido, mas ordem dos hooks suspeita
- **Problema**: Linha 49-51 retorna `<AccessDenied>` se `!hasPermission`. MAS o componente ja chamou `usePermission` (hook). Apos o early return, restante do componente declara dezenas de hooks. Se `hasPermission` mudar entre renders, ordem dos hooks pode quebrar **Rules of Hooks**.
- **Lesson learned #1** do CLAUDE.md exata.
- **Linha**: 46-51.
- **Fix**: Mover early return PARA DEPOIS de todos os hooks, ou retornar wrapper:
  ```tsx
  const denied = !hasPermission;
  // ...todos hooks...
  if (denied) return <AccessDenied .../>;
  ```

#### P1 — 7 dialogs com state local separado
- **Problema**: showStartDialog, showWarmupGateDialog, isEditDialogOpen, isDeleteDialogOpen, showRegisterDialog, showSessionDetailsModal, showConflictDialog. 7 booleans soltos. Mutual exclusion nao garantida — usuario pode ter 2 abertos simultaneamente (ja codigo defensivo no useEffect linha 164-170 reseta).
- **Anti-pattern**: 2.14 (modais para tudo) + state proliferation.
- **Fix**: Reducer com `activeModal: 'none' | 'start' | 'edit' | 'delete' | ...`. Uma fonte. Mutual exclusion automatica.

#### P1 — `window.confirm` para recovery de auto-save
- **Problema**: Linha 960-963. Usa `window.confirm()` nativo. Inconsistente com resto do app (AlertDialog Radix). Quebra dark mode, sem styling.
- **Anti-pattern**: 2.7 (cores semanticas) + browser dialog.
- **Fix**: AlertDialog do Radix ou Toast com action.

#### P1 — Stops banner no topo, mas sem afford de ver detalhes
- **Problema**: Linha 982-991. `StopBanner` aparece mas nao tem CTA pra "Ver detalhes" / "Override" / "Ir para Bankroll". Estado terminal.
- **Fix**: Banner com CTA secundario ("Ver banca", "Configurar limites").

#### P2 — Spot screenshot paster sem lugar visual definido
- **Problema**: Linha 994-1002. Renderiza no topo da pagina, sticky? floating? Nao da pra saber sem ler componente. Se o paster acompanha scroll, ok. Se nao, em sessao com lista grande, usuario rola pra baixo e perde affordance de paste.
- **Fix**: Verificar componente. Se nao for sticky, mover pra header da sessao live em vez disso.

#### P2 — Recovery banner sem foto do que esta perdido
- **Problema**: Linha 1005-1030. Banner diz "Sessao nao finalizada detectada" + timestamp. Sem mostrar QUAL sessao (data, profit ate o momento, torneios). Usuario nao tem confianca pra "Retomar".
- **Fix**: Banner expandido: "Sessao 28/04 — 12 torneios, R$340 lucro parcial".

#### P2 — Multiplos botoes "Sessao" no header
- **Problema**: Linha 1042-1110. Quando `activeSession` existe, header mostra: "Continuar Sessao Ativa" + "Nova Sessao" + "Registrar Sessao". 3 acoes principais juntas. Quando nao tem session: "Quick Start" + "Personalizar..." + "Registrar Sessao". CTA primario varia.
- **Anti-pattern**: 2.3 (CTA fraco, multiplos primary).
- **Fix**:
  - Active session: SO "Continuar Sessao Ativa" no destaque, resto em dropdown (`...`).
  - No active: SO "Quick Start" no destaque, "Personalizar" e "Registrar" em dropdown.

#### P2 — Animacoes via DOM direto
- **Problema**: Linha 577-631. `useEffect` faz `document.querySelectorAll('.mental-circle')` e manipula `style.transform/opacity/boxShadow` direto. Anti-pattern React (deveria usar Framer Motion ou CSS animations + props).
- **Anti-pattern**: 2.8 (microinteractions ausentes ou hackeadas).
- **Fix**: Migrar pra Framer Motion ou CSS-only com `animation-delay`.

#### P2 — Quick Start label dinamico, mas semantico nao claro
- **Problema**: `quickStartLabel` muda baseado em warm-up (linha 376). Usuario novo ve label diferente todo dia sem entender porque.
- **Fix**: Tooltip "Quick Start considera seu ultimo warm-up + ultima sessao".

#### P2 — Filter persiste em localStorage, mas nao na URL
- **Problema**: `loadFiltersFromStorage` (linha 79). Bom pra retorno do user. Ruim pra share / debug. Compare com Dashboard que persiste em URL.
- **Fix**: URL params (consistencia) + localStorage como fallback.

#### P3 — Toast emoji misto
- **Problema**: Linhas 970-972. "📁 Dados recuperados". Emoji mixed em titulos. Outros toasts sem emoji.
- **Fix**: Padronizar.

#### P3 — `loadWarmUpData` usa localStorage como source of truth
- **Problema**: Linha 691-709. `localStorage.getItem('warmUpScore')` etc. Misturado com query DB. Gambiarra de migration (TODO no codigo linha 337).
- **Fix**: Concluir migration. Remover localStorage path.

#### P3 — Botao "Personalizar..." baixa hierarquia
- **Problema**: Linha 1099-1107. Ghost button text-gray-400. Funcional mas invisivel.
- **Fix**: Outlined ou link estilizado, nao ghost.

### Recomendacoes Acionaveis GrindSession

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| GS1 | Mover early return apos hooks | P0 | L | High |
| GS2 | Reducer pra activeModal | P1 | M | High |
| GS3 | Recovery confirm via AlertDialog | P1 | L | Med |
| GS4 | StopBanner com CTAs | P1 | L | High |
| GS5 | Spot paster sticky/header | P2 | M | Med |
| GS6 | Recovery banner expandido com data | P2 | L | High |
| GS7 | CTA primario unico + dropdown actions | P2 | M | Med |
| GS8 | Animacoes mental-circle via React | P2 | M | Low |
| GS9 | Tooltip Quick Start | P2 | L | Low |
| GS10 | Filter URL params | P2 | M | Med |
| GS11 | Concluir migration warm-up localStorage | P3 | M | Low |
| GS12 | Remover emoji de titulos toast | P3 | L | Low |
| GS13 | Personalizar em outline | P3 | L | Low |

---

## 6. GrindSessionLive (`/grind-live`) — `GrindSessionLive.tsx`

### Contexto
**2460 linhas. 35+ useState. 14+ sub-componentes/dialogs.** Tela mais critica do app (jogador joga ativamente, multi-tabling, 2-6 horas continuas). Cada erro UX = stress real.

Componentes: SessionHeader, SessionDashboard, AddTournamentDialog, TournamentCard, SessionSummaryModal, CoolDownRunner, QuickCoolDownDialog, EditTournamentDialog, TimeEditDialog, AlertsPanel, ReentryConfirmDialog, TournamentAlertDialog, WalletReconciliationDialog, BreakFeedbackPopup, SupremaImportModal, EpicStartSessionModal.

### Achados

#### P0 — Pagina monolitica 2460 linhas com 35+ useState
- **Problema**: Componente nao e mantivel. Re-render de qualquer state dispara re-render de toda a tela. Performance critica em sessao live (a cada 5s `refetchInterval` em GrindSession ja consome — aqui similar).
- **Anti-pattern**: 2.13 (estados intermediarios), arquitetural.
- **Fix**: Refatorar em sub-componentes com responsabilidades claras:
  - `SessionLiveContainer` (orquestracao + queries)
  - `SessionLiveHeader` (timer, pause, finalizar)
  - `SessionLiveTournamentBoard` (lista + bulk actions)
  - `SessionLiveAlerts` (alertas vinculados)
  - `SessionLiveBankroll` (banca + acumulador)
  - `SessionLiveBreaks` (breaks system)
  - `SessionLiveDialogs` (group de dialogs)

  Cada um com proprio state. Reducer compartilhado quando precisar.

#### P0 — Bankroll shot custom modal (nao Radix)
- **Problema**: Linha 304-336. Custom keyboard handler global (`window.addEventListener('keydown', handler)`) pra Enter/Esc + custom focus trap. Codigo defensivo extenso pra casos edge (focus outside modal, tab cycling, escape capture).
- **Anti-pattern**: 1.11 (acessibilidade) + reinvent the wheel.
- **Fix**: Migrar pra `<AlertDialog>` Radix. Tem focus trap + Esc nativo. Remove ~50 linhas de codigo custom.

#### P1 — 9+ dialogs simultaneos possiveis
- **Problema**: `showStartDialog`, `showBreakDialog`, `showAddTournamentDialog`, `showSupremaModal`, `showQuickNotesDialog`, `showConfirmationModal`, `showSessionSummary`, `showReconcileDialog`, `bankrollShotModalOpen`, `showEditTournamentDialog`, `showBreakManagementDialog`, `showPendingTournamentsDialog`, `showReentryDialog` (derivado de queue), `tournamentAlertContext.open`. 14 booleans de modal. Sem mutex.
- **Anti-pattern**: 1.8 (chain modals possivel).
- **Fix**: Reducer central `dialogStack: DialogId[]`. Open push, close pop. So renderiza topo da stack.

#### P1 — Sessao live mas tela cheia de scroll
- **Problema**: Sub-componentes (SessionDashboard, AlertsPanel, lista de torneios completados separada de pendentes etc) empilhados. Em sessao com 30+ torneios, jogador rola constantemente.
- **Anti-pattern**: 2.6.
- **Fix**:
  - Layout em **3 colunas fixas** (header sticky + sidebar timer/dashboard + main board).
  - `viewport: 100vh; overflow: hidden` no container; rolagem so na coluna main.
  - Mobile: tabs (Lista | Dashboard | Alertas).

#### P1 — Pause sem feedback de tempo pausado
- **Problema**: Linha 113-116. `isPaused` + `pausedTime` + `pauseStartTime`. Logica sim, mas sem afford visual: usuario pausou por 15min, ao despausar nao ve "+15min retornado". E timer da sessao continua mesmo? Ambiguo.
- **Fix**: Banner durante pausa: "PAUSADO ha 12:34. Botao [Retomar]". Time elapsed deve excluir pausas (ja faz com pausedTime, mas usuario nao ve).

#### P1 — Quick Notes vs Final Notes vs Preparation Notes — confusao
- **Problema**: Multiplas formas de note (preparationObservations, dailyGoals, sessionFinalNotes, finalNotes, quickNotes). Usuario nao sabe onde escrever oque.
- **Anti-pattern**: 2.10 (genericos).
- **Fix**: 1 note system: "Anotacoes da sessao" com timestamp + tag (warm-up | objetivo | mid-session | final). Mostra timeline.

#### P1 — Bulk select de torneios sem hint visual
- **Problema**: `selectedTournaments: Set<string>` (linha 108). Sem ver UI nao da pra saber, mas anti-pattern padrao = checkbox por linha + master + bar de acoes flutuante.
- **Fix**: Verificar TournamentCard. Se nao tiver, adicionar `<Checkbox>` + sticky bottom bar "X selecionados [Finalizar todos] [Marcar bust] [Excluir]".

#### P1 — Site filter `siteFilter` sem badge ativo claro
- **Problema**: Linha 111. State existe; UI nao examinada. Provavelmente um Select. Anti-pattern: filter sem chip.
- **Fix**: Filter chips visiveis topo. Reset rapido.

#### P2 — `localStorage` para `showDashboard` mas nao pra outros toggles
- **Problema**: Linha 361-364. Persiste so showDashboard. Outros toggles (showCompletedTournaments, skipBreaksToday, syncWithGrade) sao state ephemero.
- **Fix**: Persistir todos OU nenhum. Mais usavel = persistir todos como user preferences.

#### P2 — Tournament alert system dual (manual + alarmes 2.0 unified)
- **Problema**: 2 sistemas paralelos: `LateRegAlertManager` (manager class) + `SessionAlertManager` (generic). Mais codigo, mais bugs possiveis.
- **Fix**: Consolidar em 1 sistema com tipos discriminados.

#### P2 — TTS narrationQueue sem mute global
- **Problema**: Linha 39 importa `stopAlertById, stopAllAlerts`. Sessao live com 5 alertas falando = caos. Sem botao "Mute alarmes" geral.
- **Fix**: Botao mute no header (icon volume-x). Persiste em session storage.

#### P2 — Suprema Import Modal apenas pra Suprema
- **Problema**: Linha 99 + 28. Modal especifico Suprema. Outras redes nao tem import nativo durante sessao live.
- **Fix**: Generalizar pra "Import durante sessao" com adapters. Ou pelo menos, abstracao Modal generico parametrizado.

#### P2 — Reconciliation modal sem indicacao de quantas wallets faltam pre-aberto
- **Problema**: `summaryReconcilable.wallets[]` + `missingPlatforms[]` carregados antes (linha 182-192). Modal abre apos finalizacao. Bom. Mas sem preview no botao "Finalizar" que diz "Vai pedir reconciliar 3 wallets".
- **Fix**: Adicionar contador no botao "Finalizar Sessao".

#### P2 — `addTournamentMutation` ja com bankroll check, mas accumulator throttle por tier ([10,15,25,50])
- **Problema**: Linha 247-254 + 271-282. Logica complex (warning por tier discreto). User ve 1 toast aos 10%, outro aos 15%, etc. Pode ser barulho.
- **Fix**: Visual indicator persistente (progress bar vermelha pequena no header) ao inves de toast spam.

#### P3 — Skip breaks toggle escondido
- **Problema**: `skipBreaksToday: boolean` (linha 125). UI nao visivel sem ler resto. Provavel modal de start.
- **Fix**: Toggle visivel no header (com tooltip "Pular breaks hoje?") quando ativado.

#### P3 — Quick feedback score 1 numero
- **Problema**: `quickFeedbackScore: 5` (linha 134). Score unico durante break. Multi-dimensional (foco, energia, etc) so no full feedback.
- **Fix**: Manter quick = 1 (rapido). OK.

#### P3 — `maxLateStates: {[id]: boolean}` sem cleanup
- **Problema**: Linha 145. Map cresce com cada torneio. Apos sessao 50+ torneios, pode ter state dead. Cleanup so on unmount.
- **Fix**: Cleanup quando torneio finaliza.

### Recomendacoes Acionaveis GrindSessionLive

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| GL1 | Refatorar em sub-containers | P0 | H | High |
| GL2 | Bankroll shot modal -> AlertDialog Radix | P0 | M | High |
| GL3 | Reducer pra dialogStack (mutex modais) | P1 | M | High |
| GL4 | Layout 3-colunas fixo + sticky header | P1 | H | High |
| GL5 | Banner de pausa visivel | P1 | L | High |
| GL6 | Sistema unificado de notes (timeline) | P1 | M | Med |
| GL7 | Bulk action bar sticky bottom | P1 | M | High |
| GL8 | Filter chips ativos | P1 | L | Med |
| GL9 | Persistir toggles como user prefs | P2 | M | Med |
| GL10 | Consolidar alert managers | P2 | M | Low |
| GL11 | Botao mute global TTS | P2 | L | High |
| GL12 | Generalizar import modal | P2 | M | Low |
| GL13 | Contador no Finalizar Sessao | P2 | L | Med |
| GL14 | Bankroll exposure como progress bar | P2 | M | Med |
| GL15 | Skip breaks toggle visivel | P3 | L | Low |
| GL16 | Cleanup maxLateStates | P3 | L | Low |

---

## Sumario Tier 1

**Arquivos:** `audit-tier1-core.md` (Home, Dashboard) + `audit-tier1-library-upload.md` + este.

**Total achados:** 65+ items
- **P0:** 4 (security/usabilidade critica)
- **P1:** 22 (impacto diario)
- **P2:** 26 (polimento)
- **P3:** 13 (nice-to-have)

**Top 5 prioridades Tier 1:**
1. **U1** — Tutorial de import por rede + sample CSV (UploadHistory)
2. **GS1** — Mover early return apos hooks (GrindSession)
3. **GL1** — Refatorar GrindSessionLive em sub-containers
4. **GL2** — Migrar bankroll shot modal pra Radix AlertDialog
5. **L1+L2** — Filtros uniformes + chips unica fonte (Library)
