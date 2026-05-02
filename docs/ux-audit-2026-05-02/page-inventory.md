# Inventario Completo — Paginas + Modais (2026-05-02)

Base do UX Audit. Fonte: `client/src/App.tsx` + glob de `pages/**` e `components/**`.

---

## 1. Layout Global

- **Sidebar** (`components/Sidebar.tsx`, 400 linhas, 4 secoes: Visao Geral, Grind, Ferramentas, Admin) — colapsavel (w-16/w-64), badge trial/assinatura, bug/sugestao no rodape.
- **MiniChat** — flutuante, presente em todas paginas autenticadas.
- **NotificationBanner + NotificationModals** — globais.
- **StickyAudioBar** — global (Biblioteca audio).
- **Toaster** (sonner-style) — global.

Navegacao: Wouter `<Switch>` SPA. Sem breadcrumbs. Sem command palette. Sem topbar/header global.

---

## 2. Paginas Publicas (sem auth)

| Rota | Arquivo | Funcao |
|------|---------|--------|
| `/login` | `LoginPage.tsx` | Login email+senha + Google OAuth |
| `/register` | `RegisterPage.tsx` | Cadastro |
| `/forgot-password` | `ForgotPasswordPage.tsx` | Solicita reset |
| `/reset-password/:token` | `ResetPasswordPage.tsx` | Define nova senha |
| `/verify-email` | `VerifyEmailPage.tsx` | Confirmacao via link |
| `/registration-confirmation` | `RegistrationConfirmationPage.tsx` | Pos-cadastro |
| (raiz nao autenticada) | `Landing.tsx` | Landing page marketing |

---

## 3. Paginas Autenticadas — Visao Geral

| Rota | Arquivo | Sidebar Label | Nota |
|------|---------|---------------|------|
| `/` ou `/home` | `Home.tsx` | Home | Hub pos-login |
| `/dashboard` | `Dashboard.tsx` | Dashboard | Analytics agregado |
| `/upload` | `UploadHistory.tsx` | Import | Importar CSV historico |
| `/library` | `TournamentLibraryNew.tsx` | Torneios | Biblioteca de torneios jogados |

---

## 4. Paginas Autenticadas — Grind

| Rota | Arquivo | Sidebar Label |
|------|---------|---------------|
| `/coach` | `GradePlanner.tsx` | Grade |
| `/coach-ai` | `CoachAI.tsx` | Coach IA |
| `/grind` | `GrindSession.tsx` | Grind |
| `/grind-live` | `GrindSessionLive.tsx` | (live, acesso indireto) |
| `/mental` | `MentalPrep.tsx` | Warm Up |

---

## 5. Paginas Autenticadas — Ferramentas

| Rota | Arquivo | Sidebar Label |
|------|---------|---------------|
| `/estudos` | `Studies.tsx` | Estudos (badge spots pendentes) |
| `/biblioteca` | `biblioteca/BibliotecaPage.tsx` | Biblioteca (badge "Novo") |
| `/biblioteca/curso/:slug` | `biblioteca/CourseDetailPage.tsx` | (drill) |
| `/biblioteca/curso/:slug/:lesson` | `biblioteca/LessonViewer.tsx` | (viewer) |
| `/calculadoras` | `Calculadoras.tsx` | Ferramentas |
| `/calculadora-popup/:tool` | `CalculadoraPopup.tsx` | (janela popup) |
| `/bankroll` | `Bankroll.tsx` | Banca |

---

## 6. Paginas Autenticadas — Admin

| Rota | Arquivo | Sidebar Label |
|------|---------|---------------|
| `/analytics` | `Analytics.tsx` | Analytics |
| `/admin/dashboard` | `AdminDashboard.tsx` | (sem link visivel) |
| `/admin/users` | `AdminUsers.tsx` | Usuarios |
| `/admin/bugs` | `AdminBugs.tsx` | Bugs |
| (sem rota propria) | `AdminCoachAnalytics.tsx` | (orfao? verificar) |

---

## 7. Paginas Autenticadas — Outras

| Rota | Arquivo |
|------|---------|
| `/settings` | `Settings.tsx` |
| `/subscriptions` | `Subscriptions.tsx` |
| `/subscription-demo` | `SubscriptionDemo.tsx` |
| (acessada via Grind) | `SessionHistory.tsx` |
| (catch-all) | `not-found.tsx` |

---

## 8. Modais e Dialogs Reutilizaveis

### Geral / Admin
- `ApproveItemModal`, `RejectItemModal`, `EditItemModal` — moderacao admin
- `DeleteUserModal`, `EditUserModal`, `EditUserModalFixed`, `PermissionPreviewModal` — admin/users
- `BugReportModal`, `ImprovementSuggestionModal` — feedback global (sidebar)
- `WelcomeNameModal` — onboarding inicial
- `NotificationModals` — push de notificacoes globais

### Tournament Library
- `SupremaImportModal` — import nativa Suprema
- `tournament-selector/SelectorDetailsModal` — detalhe scoring

### Grind / Sessions
- `grind-session/EpicStartSessionModal` — inicio sessao
- `grind-session/EditSessionDialog`, `DeleteSessionDialog`, `RegisterSessionDialog`, `SessionDetailsDialog`, `ConflictDialog`
- `grind-session-live/SessionSummaryModal` — resumo pos-sessao
- `grind-session-live/TimeEditDialog`, `ReentryConfirmDialog`, `WalletReconciliationDialog`, `TournamentAlertDialog`, `AddTournamentDialog`, `EditTournamentDialog`
- `cooldown/QuickCoolDownDialog`
- `tickets/RegisterTicketDialog`

### Grade Planner
- `grade-planner/PlanningDialog`, `EditDialog`, `DeleteDialog`
- `NewTournamentPlanningDialog`

### Bankroll
- `bankroll/BankrollAlertModal`, `BankrollDetailModal`, `BankrollMovementDialog`
- `bankroll/WalletCreateDialog`, `WalletEditDialog`, `WalletTransactionDialog`
- `bankroll/RakebackDialog`, `TransferDialog`

### Coach
- `coach/UpgradeCoachModal` — paywall plano

### Mental Prep / Warmup
- `mental-prep/AchievementsDialog`, `AudioLibraryDialog`, `MeditationDialog`, `VisualizationDialog`
- `warmup/GoNoGoModal`, `OverrideConfirmDialog`

### Estudos
- `studies-v2/CreateTabDialog`, `CreateThemeDialog`, `ShortcutsDialog`
- `studies/stats/HudCustomStatDialog`

---

## 9. Componentes-chave Compartilhados

- `MetricsCard`, `Sparkline`, `ProfitChart`, `AnalyticsCharts` — visualizacao
- `AdvancedCalendar` — calendario reusavel
- `FilterDropdown`, `FilterPopup`, `FilterPopupSimple`, `MultiSelect`, `RangeSlider` — filtros
- `TournamentTable`, `TournamentLibraryFilters` — table do library
- `MiniChat` — Coach flutuante global
- `FileUpload`, `AutoUpload` — upload CSV
- `RealtimeMonitoring`, `DataMonitoring`, `SessionTracker` — telemetria sessao
- `BreakHistoryPopup`, `BreakFeedbackPopup` — pausas
- `MentalSlider`, `QuickSlider` — sliders especiais

---

## 10. Paginas Prioritarias para Audit (peso de uso)

**Tier 1 — Core diario do usuario:**
1. `Home` — primeira impressao pos-login
2. `Dashboard` — analytics core
3. `TournamentLibraryNew` — biblioteca, tabela grande
4. `GrindSession` + `GrindSessionLive` — fluxo de sessao
5. `UploadHistory` — entrada de dados (sem ele, app vazio)

**Tier 2 — Diferencial:**
6. `CoachAI` — chat AI
7. `GradePlanner` — planejamento semanal
8. `Bankroll` — financeiro
9. `MentalPrep` — Warm Up

**Tier 3 — Suporte:**
10. `Settings`, `Subscriptions`, `Studies`, `Biblioteca*`, `Calculadoras`

**Tier 4 — Auth/admin:**
11. `Login`, `Register`, `Forgot/Reset`, `Verify`, `Landing`
12. `Admin*`, `Analytics`

---

## 11. Observacoes Iniciais (pre-audit, alto nivel)

- Sidebar tem **15 itens visiveis** + footer (4 itens). Pode estar saturada.
- Sem **breadcrumb** nem **topbar** — usuario perde contexto em paginas profundas (ex: Biblioteca > Curso > Licao).
- Sem **command palette** / search global. Em SaaS analitico, isso e padrao 2024-2025.
- 2 itens de menu ambiguos: `/library` ("Torneios") e `/biblioteca` ("Biblioteca") — confusao semantica.
- 4 modais de admin so para usuarios (`EditUser`, `EditUserFixed`, `Delete`, `PermissionPreview`) — `EditUserModalFixed` parece duplicacao tecnica.
- Bankroll tem **8 dialogs** — possivel UX overload (cada acao = modal).
- Grind Live tem **7 dialogs** — sessao pode interromper foco do jogador.
- `WelcomeNameModal` so para nome — possivel onboarding mais rico.
