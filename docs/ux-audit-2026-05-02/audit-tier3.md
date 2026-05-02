# UX Audit — Tier 2 (extras) + Tier 3 (Biblioteca, Studies, Settings)

---

## 11. GradePlanner (`/coach`, "Grade") — leitura parcial

### Contexto
978 linhas. Drag-and-drop semanal (react-beautiful-dnd) + react-resizable-panels (BibliotecaPanel + WeekGrid). Profile states A/B/C/OFF por dia. Selector panel (tournament-selector). 4 dialogs (Edit, Delete, NewTournamentPlanning, OffToggle).

### Achados (baseado em 200 linhas + estrutura)

#### P1 — Imports indicam complexidade arquitetural
- **Problema**: react-beautiful-dnd (lib em manutencao limitada, autora arquivou em 2023) + react-resizable-panels + WeekGrid + BibliotecaPanel + ProfileComparison + GradeSettings. Stack de DnD pesada.
- **Anti-pattern**: sustentabilidade tecnica.
- **Fix**: Considerar migrar pra `@dnd-kit/core` (sucessor moderno, melhor a11y).

#### P1 — Profile states A/B/C/OFF por dia — UX ambiguo
- **Problema**: Cada dia da semana tem 4 estados de perfil. Usuario novo nao entende A vs B vs C. So OFF e claro.
- **Fix**: Renomear: "Volume Alto / Volume Medio / Volume Baixo / Off". Ou usar nome semantico que o user definiu.

#### P1 — `useEffect` + ref para colapsar BibliotecaPanel
- **Problema**: Linha 55-67. Imperative API via ref. Codigo defensivo (`if (!panel)`). Funciona mas fragil.
- **Fix**: Estado declarativo + propagar pra Panel via prop.

#### P2 — Default values do form com 14 campos
- **Problema**: Linhas 132-153. tournamentSchema com 14 fields, todos obrigatorios definir default. Carga cognitiva alta no AddTournament.
- **Fix**: Form em steps (Basico: site/time/buyIn/name -> Avancado: gameType/stack/blinds/lateReg/etc).

#### P2 — `mapZodIssuesToForm` indica friction de validacao
- **Problema**: Linha 196-199. Backend retorna `{error, issues}` mapeado pra setError. Bom. Mas user ja preencheu form todo, recebe erro depois.
- **Fix**: Validar incrementalmente on-blur (RHF + zod).

#### P3 — Mobile tab "grade" como string
- **Problema**: Linha 47. `mobileTab` string, nao enum. Magic string.
- **Fix**: TS enum ou `as const` array.

### Recomendacoes Acionaveis GradePlanner

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| GP1 | Renomear A/B/C semanticamente | P1 | M | High |
| GP2 | Avaliar migrar pra dnd-kit | P1 | H | Med |
| GP3 | NewTournament em steps | P2 | M | High |
| GP4 | Validacao incremental on-blur | P2 | M | Med |
| GP5 | Mobile tab enum | P3 | L | Low |
| GP6 | **Pendente**: leitura completa pra audit fundo | — | — | — |

---

## 12. Biblioteca (3 paginas) — `BibliotecaPage`, `CourseDetailPage`, `LessonViewer`

### Contexto
Sprint Biblioteca-1 entregue 2026-05-01. Listagem cursos -> detalhe curso -> viewer com 3 formatos (video Mux, podcast, artigo).

### Achados

#### Pontos POSITIVOS (boas referencias para outras paginas)
- **Empty state rico** em BibliotecaPage (linha 170-224): icone + titulo + texto + categorias chips + CTA "Avise-me". **EXEMPLAR.**
- **Skeleton matching layout** (linha 147-168). Boa pratica.
- **Breadcrumb** em CourseDetailPage (linha 188-199). Unico do app que usa.
- **Hooks first** explicito em LessonViewer (comentario linha 16). Lesson learned aplicada.
- **Error states tipados** 401/404/500 com CTAs (LessonViewer comment linha 13).
- **Continue from where you left off** card (CourseDetailPage linha 236-247). Smart.
- **data-testid estavel** consistente.

#### P1 — Banner alpha sticky pode irritar
- **Problema**: Linha 108-133. Banner amber dismissable mas reaparece se localStorage limpa. CTA "Pedir liberacao" via mailto.
- **Fix**: Manter ate user agir explicitamente. Mailto OK pra alpha; trocar pra form em prod.

#### P2 — `accordion type="multiple" defaultValue={modules.map(m=>m.id)}`
- **Problema**: CourseDetailPage linha 268-269. Todos modulos abertos por default. Em curso 10+ modulos = scroll longo.
- **Fix**: Open so primeiro modulo OU "Continuar de onde parou" modulo.

#### P2 — Empty state "Em breve" vs "Modulos sendo preparados"
- **Problema**: BibliotecaPage usa "Em breve" (linha 179). CourseDetailPage usa "Modulos sendo preparados - em breve!" (linha 256). Copy inconsistente.
- **Fix**: Padronizar copy.

#### P2 — `cursor-pointer` no AccordionTrigger ja default mas hover sem feedback
- **Problema**: CourseDetailPage linha 280. Trigger tem hover:no-underline mas sem highlight (bg change).
- **Fix**: hover:bg-gray-800/40.

#### P3 — LessonViewer importa MuxPlayerRaw + helper `?? MuxPlayerRaw`
- **Problema**: Linha 27-33. `(MuxPlayerRaw as any)?.default ?? MuxPlayerRaw`. Hack de export shape. Funcional mas cheiro.
- **Fix**: Wrapper module ou ajustar import per docs Mux.

#### P3 — Biblioteca grid 5 cols xl
- **Problema**: Linha 229. `xl:grid-cols-5`. Em monitor 4K, cards ficam minusculos. Bom em 1440p.
- **Fix**: max-w-[280px] por card.

### Recomendacoes Acionaveis Biblioteca

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| BL1 | Banner alpha persiste ate acao | P1 | L | Med |
| BL2 | Accordion default = primeiro modulo | P2 | L | Med |
| BL3 | Padronizar copy "Em breve" vs "Sendo preparados" | P2 | L | Low |
| BL4 | Hover bg no AccordionTrigger | P2 | L | Low |
| BL5 | MuxPlayer import limpo | P3 | L | Low |
| BL6 | Cap card width pra 4K | P3 | L | Low |

**Nota**: Biblioteca e referencia de qualidade. Replicar padroes em outras paginas (especialmente empty states).

---

## 13. Studies (`/estudos`) — `Studies.tsx`

### Contexto
212 linhas. Sprint Studies-Reform entregue 2026-05-01. Shell com sidebar (desktop) / collapsed (tablet) / bottom-nav (mobile). Cmd/Ctrl+K abre QuickSearchPalette. OnboardingWizard. Sub-views (Dashboard/Temas/Stats/Spots/Recomendacoes).

### Achados

#### Pontos POSITIVOS
- **Command palette** (Cmd/K) — primeira pagina do app. Pode/deve expandir pra global.
- **Responsive shell** com 3 breakpoints + bottom-nav.
- **Hooks first** explicito (linha 81+).
- **Permission gate** via AccessDenied com CTA pra Subscriptions.
- **OnboardingWizard** com persist localStorage.
- **Cache continuity** (TanStack mantido entre views).

#### P2 — `detectBreakpoint` hardcoded thresholds
- **Problema**: Linha 60-65. `window.matchMedia('(min-width: 1024px)')`. Funcional mas duplica config Tailwind. Mudanca de breakpoint = duas alteracoes.
- **Fix**: Centralizar em `lib/breakpoints.ts` ou usar Tailwind config import.

#### P2 — `viewFromPath` parseing manual
- **Problema**: Linha 67-77. String parsing of location. Wouter ja oferece params API.
- **Fix**: Wouter `Route` com `useRoute` ou `useParams`.

#### P2 — `breakpoint === 'tablet'` forca collapse
- **Problema**: Linha 120. Tablet sempre collapsed sem afford do user expandir.
- **Fix**: Mostrar toggle em tablet tambem.

#### P3 — Shell sem header de breadcrumb
- **Problema**: Sub-views nao tem indicador "Estudos > Temas > X".
- **Fix**: Header shell com breadcrumb baseado em view ativa.

#### P3 — Onboarding sempre abre se nunca completou
- **Problema**: Linha 86-92. Se user dismiss sem completar, abre toda visita. Pode irritar.
- **Fix**: Limit max 3 abertas, depois muda pra link "Ver tour" no sidebar.

### Recomendacoes Acionaveis Studies

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| ST1 | Centralizar breakpoints | P2 | L | Low |
| ST2 | Wouter useParams | P2 | L | Low |
| ST3 | Toggle collapse em tablet | P2 | L | Med |
| ST4 | Breadcrumb no shell | P3 | M | Med |
| ST5 | Onboarding limit 3x | P3 | L | Med |

**Nota**: Studies + Biblioteca sao TOP de qualidade. Replicar padroes (command palette, shell responsivo, onboarding wizard, hooks first explicito).

---

## 14. Settings (`/settings`) — leitura parcial

### Contexto
1176 linhas. Configs: exchange rates, late reg alerts, TTS/voz (sound mode, voice URI, volume, repeat count, redact buy-in), bankroll (amount, rule preset, custom pct), sidebar auto-collapse, clear data confirmation.

### Achados (preliminar)

#### P0 — 1176 linhas em 1 pagina
- **Problema**: Configuracoes empilhadas sem agrupamento navegavel. Scroll longo.
- **Fix**: Tabs ou shell navegavel: `[Geral] [Banca] [Alarmes] [Voz/TTS] [Sidebar] [Dados]`.

#### P1 — `useState` para 15+ configs separadas
- **Problema**: Linhas 50-83. exchangeRates, alertMinutes, alertEnabled, alertSound, soundMode, preferredVoiceURI, alertVolume, alertRepeatCount, alertRepeatGapMs, ttsRedactBuyIn, optimisticBankrollManagement, bankrollAmount, bankrollRulePreset, bankrollCustomPct, etc.
- **Fix**: Agrupar em settings reducer ou form unico (RHF).

#### P1 — Validacao customizada inline (`/^-?\d+(?:\.\d)?$/`)
- **Problema**: Linha 113, 128. Regex inline para validar percent. Logica espalhada.
- **Fix**: Zod schema central.

#### P2 — `effectivePct = (() => {...})()` IIFE memoization sem useMemo
- **Problema**: Linha 106-116. Calculado a cada render.
- **Fix**: useMemo.

### Recomendacoes Acionaveis Settings

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| SE1 | Tabs/shell navegavel | P0 | H | High |
| SE2 | Settings reducer ou RHF | P1 | M | Med |
| SE3 | Zod central | P1 | M | Med |
| SE4 | useMemo no effectivePct | P2 | L | Low |
| SE5 | **Pendente**: audit completo restante linhas 150-1176 | — | — | — |

---

## 15. Paginas remanescentes — Audit Macro

Por economia de context, audit superficial (sem leitura completa):

### `Calculadoras.tsx` (133 linhas)
- Provavelmente lista de ferramentas (ICM, EV, etc) + popup window per tool.
- **Recomendacao**: Verificar se popup window e WebStandard API. Se sim, ok. Se gambiarra, reavaliar.

### `SessionHistory.tsx` (845 linhas)
- Pagina muito provavelmente similar a GrindSession (table + filters). 845 linhas indica monolitismo.
- **Recomendacao**: Audit similar a Library/Dashboard. Refatorar.

### `Subscriptions.tsx` + `SubscriptionDemo.tsx`
- Stripe integration. Critical pages.
- **Recomendacao**: Audit dedicado. Foco em billing flow + error states + cancellation UX.

### Auth (`Login`, `Register`, `Forgot`, `Reset`, `VerifyEmail`, `RegistrationConfirmation`, `Landing`)
- 7 paginas auth. Conversion-critical.
- **Recomendacao**: Audit dedicado. Foco em copy, social proof, error messaging, password requirements UX.

### Admin (`AdminDashboard`, `AdminUsers`, `AdminBugs`, `Analytics`, `AdminCoachAnalytics`)
- Backoffice. Internal tool standards.
- **Recomendacao**: Audit menos rigoroso (uso interno). Foco em data density + bulk actions.

### `not-found.tsx`
- 404. Verificar se tem CTA "Voltar para home" + busca.
