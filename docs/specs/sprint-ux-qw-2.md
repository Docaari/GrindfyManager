# Spec — Sprint UX-QW-2 (UX Quick Wins 2)

> Sprint: UX-QW-2 (consolidacao top-ICE da auditoria strategist 2026-05-20)
> Data: 2026-05-20
> Input: auditoria strategist 2026-05-20 (40 friction points em /grind-live, /coach-ai, /bankroll, /grade-planner) + Foundation UI-FND-1 (`@/components/ui/EmptyState`, `@/lib/ui-tokens`) + ADR-078 + `Docs/conventions/ui-patterns.md`
> Output: fonte de verdade operacional para `system-architect` -> `test-writer` -> `implementer` -> `reviewer`
> Status: Proposta (aguardando aprovacao do founder)
> Idioma: PT-BR (codigo em ingles, conteudo/UI em PT-BR)

---

## 1. Status

Proposta | ~~Aprovada~~ | ~~Em Desenvolvimento~~ | ~~Concluida~~

---

## 2. Resumo

Sprint de UX Quick Wins consolidando as 6 fricoes de maior ICE da auditoria 2026-05-20 (todas esforco S). Foco em CTAs contextuais em empty states, sinalizacao de staleness em saldos, micro-copy explicativa nos chips de lente do Coach e toast com action inline no `/grade-planner`. Reuso da Foundation UI-FND-1 (`<EmptyState>` canonico) — sem criar componente paralelo.

---

## 3. Contexto

A auditoria strategist 2026-05-20 mapeou 40 friction points distribuidos em 4 paginas core. O top-6 ICE concentra dois padroes sistemicos:

1. **Empty states genericos sem CTA contextual** — `/grade-planner` (WeekGrid vazia pos-instalacao), `/grind-live` (sem sessao + sem grade), `/bankroll` (sem wallets) e `/coach-ai` (sem conversas) mostram estado vazio sem direcionar o usuario para a acao certa. Existe `<EmptyState>` canonico Foundation UI-FND-1 (`client/src/components/ui/EmptyState.tsx`) ja com slots `primaryCTA` (obrigatorio) + `secondaryLink` (opcional). Falta um terceiro slot `secondaryCTA` (botao com `onClick`, nao link) — extensao minima do componente existente atende todos os casos. **Decisao:** estender o `<EmptyState>` existente (adicionar prop `secondaryCTA?: { label, onClick, ariaLabel? }`) em vez de criar `<EmptyStateWithCTA>` paralelo, evitando duplicacao e respeitando a Foundation.

2. **Falta de sinais de "freshness" e clarificacao semantica** — Saldo de wallet sem badge de staleness ("atualizado ha N dias") e chips Mental/Selecao/Tecnico no Coach sao percebidos como agentes distintos (apos AI-0B foi unificado num agente unico com lentes — micro-copy precisa reforcar isso).

Sprint sem logica de negocio nova: apenas extensao de componente + 4 migracoes + 2 micro-melhorias (badge + tooltip) + 1 toast action.

---

## 4. Usuarios

- **Jogador novo (primeira semana):** afetado por RF-02, RF-03, RF-04 (encontra paginas vazias e precisa de direcao clara).
- **Jogador ativo:** afetado por RF-05 (clica celula OFF e quer ativar perfil em 1 toque), RF-06 (precisa saber se saldo esta desatualizado), RF-07 (entende que mudou de "agente" mas nao mudou).

---

## 5. Requisitos Funcionais

### RF-01 — Estender `<EmptyState>` Foundation com slot `secondaryCTA`

**Descricao:** Adicionar prop opcional `secondaryCTA` ao componente existente `client/src/components/ui/EmptyState.tsx` (Foundation UI-FND-1). Hoje o componente ja tem `primaryCTA` (obrigatorio, via `ctaLabel`+`ctaAction`) e `secondaryLink` (opcional, anchor `href`). Falta um slot para "acao secundaria que dispara callback JS" (ex: abrir dialog, link wouter via `useLocation`).

**Path do arquivo:** `client/src/components/ui/EmptyState.tsx`

**Regras de negocio:**
- Nova prop opcional: `secondaryCTA?: { label: string; onClick: () => void; ariaLabel?: string }`.
- Render: quando `secondaryCTA` definido, renderizar `<Button variant="ghost">` apos o primary CTA (na mesma linha em viewport >= sm; empilhado em mobile).
- Quando ambos `secondaryCTA` e `secondaryLink` definidos, ambos aparecem (CTA primeiro, link depois). Caso de uso raro mas suportado.
- Telemetria: rastrear clique em `ui.empty_state_secondary_cta_clicked` com `{ area }` (mesmo padrao de `ui.empty_state_cta_clicked`). Try/catch silencioso (lesson #9).
- `data-testid="empty-state-secondary-cta"` estavel (lesson #2).
- Adicionar nova `EmptyStateArea`: `'grade-planner-empty'`, `'grind-live-empty'`, `'bankroll-empty'`, `'coach-conversations-empty'` (este ultimo se RF-08 entrar; senao manter `coach-conversations`).
- Sem breaking change: componentes existentes continuam funcionando (prop opcional).

**Criterio de aceitacao:**
- [ ] Prop `secondaryCTA` aceita objeto `{ label, onClick, ariaLabel? }` e renderiza botao com `data-testid="empty-state-secondary-cta"`.
- [ ] Quando undefined, nenhum botao secundario eh renderizado.
- [ ] `onClick` eh disparado quando o botao eh clicado.
- [ ] Telemetria `ui.empty_state_secondary_cta_clicked` eh chamada (try/catch silencioso).
- [ ] Layout responsivo: lado a lado em sm+, empilhado em xs.
- [ ] Acessibilidade: botao com `aria-label` quando `ariaLabel` fornecido; senao usa `label`.
- [ ] Catalog `EMPTY_STATE_AREAS` atualizado com 3-4 novas areas.

**Complexidade:** S

---

### RF-02 — Migrar empty state `/grade-planner` (GP-10)

**Descricao:** Quando `/grade-planner` esta sem torneios planejados E sem perfil ativo (`activeProfile === 'OFF' || !activeProfile`), substituir o estado atual (grid vazia silenciosa) por `<EmptyState>` com CTA primary "Ativar Perfil A" + CTA secundario "Ver tour" que abre um tour 3-steps inline (componente ja existe ou pode ser stub que apenas mostra toast informativo na primeira iteracao — escopo minimo nao bloqueia spec).

**Paths afetados:**
- `client/src/pages/GradePlanner.tsx` (render do WeekGrid)
- `client/src/components/grade-planner/WeekGrid.tsx` (proximo do empty state ou parent)

**Regras de negocio:**
- Trigger do empty state: `(plannedTournaments.length === 0) && (activeProfile === 'OFF' || !activeProfile)`. Quando ha perfil ativo mas zero torneios, comportamento atual ja eh aceitavel (cells clicaveis). Quando ha torneios mas perfil OFF, comportamento atual ja eh aceitavel.
- Primary CTA: label "Ativar Perfil A". `onClick` chama a mesma logica do header (setActiveProfile('A') + persistencia ja existente).
- Secondary CTA: label "Ver tour rapido". `onClick` mostra inline `<TourCard>` (3 steps em sequencia: "1. Ative um perfil", "2. Clique em uma celula vazia para adicionar torneio", "3. Use o painel Selector para sugestoes"). Se complexidade do tour for alta, fallback aceitavel: toast `<Toast>` com mesmo conteudo. **Decisao default:** toast (lower-effort, ja existe infra).
- Area: `'grade-planner-empty'`.
- Headline: "Sua grade esta vazia". Description: "Ative um perfil A/B/C e clique em uma celula para adicionar torneios."

**Criterio de aceitacao:**
- [ ] Condicao de render verificavel: usuario novo sem torneios + sem perfil ve `<EmptyState>`.
- [ ] Click "Ativar Perfil A" muda `activeProfile` para 'A' e some o empty state.
- [ ] Click "Ver tour rapido" dispara toast/card com 3 steps.
- [ ] Quando ha torneios OU ha perfil ativo, empty state nao aparece (grid normal).
- [ ] `data-testid="empty-state"` com `data-area="grade-planner-empty"`.

**Complexidade:** S

---

### RF-03 — Migrar empty state `/grind-live` (GL-2)

**Descricao:** Quando usuario abre `/grind-live` sem sessao ativa E sem `planned_tournaments` para hoje, o estado atual mostra botao "Iniciar Sessao" solo. Adicionar CTA secundario "Configurar grade primeiro" que navega para `/grade-planner` via Wouter.

**Paths afetados:**
- `client/src/pages/GrindSessionLive.tsx` (estado pre-sessao)

**Regras de negocio:**
- Trigger: `!activeSession && plannedTournamentsToday.length === 0`.
- Primary CTA: "Iniciar Sessao Vazia" (label atualizado — clarifica que vai abrir vazio). `onClick` = comportamento atual (cria sessao).
- Secondary CTA: "Configurar grade primeiro". `onClick` = navega para `/grade-planner` via `useLocation` do Wouter (`setLocation('/grade-planner')`).
- Area: `'grind-live-empty'`.
- Headline: "Pronto para o grind?". Description: "Voce nao tem torneios planejados para hoje. Configure sua grade ou inicie uma sessao vazia."

**Criterio de aceitacao:**
- [ ] Empty state renderiza quando `!activeSession && plannedTournamentsToday.length === 0`.
- [ ] Click "Configurar grade primeiro" navega para `/grade-planner`.
- [ ] Click "Iniciar Sessao Vazia" mantem comportamento atual.
- [ ] Quando ha planned_tournaments OU sessao ativa, empty state nao aparece.
- [ ] `data-testid="empty-state"` com `data-area="grind-live-empty"`.

**Complexidade:** S

---

### RF-04 — Migrar empty state `/bankroll` (BR-2) + esconder `BankrollWidget`

**Descricao:** Quando `/bankroll` esta sem wallets (`wallets.length === 0`), hoje aparece dupla mensagem: `BankrollWidget` mostrando "$0" no topo + texto "crie sua primeira carteira" abaixo. Esconder `BankrollWidget` enquanto nao houver wallet ativa e substituir por `<EmptyState>` central com CTA primary "Criar primeira carteira" (abre `WalletCreateDialog`) + secondary "Saber mais" (link para docs/help — pode ser anchor `secondaryLink` apontando para `/help/bankroll` ou similar; se rota nao existir, deixar `#` placeholder com toast "Em breve").

**Paths afetados:**
- `client/src/pages/Bankroll.tsx`
- `client/src/components/bankroll/BankrollWidget.tsx` (apenas consumidor — esconde via condicional no parent)

**Regras de negocio:**
- Renderizar `BankrollWidget` **somente** quando `wallets.length > 0 && walletItems.some(w => w.status === 'active')`. Em caso contrario, esconder (sem unmount destrutivo de queries — apenas conditional render).
- Empty state: primary CTA "Criar primeira carteira" -> `setIsCreateDialogOpen(true)` (state ja existe no Bankroll.tsx para WalletCreateDialog).
- Secondary link (preferir link sobre CTA — vai para docs): label "Saber mais", `href="/help/bankroll"` (se rota nao existir, fallback para `#` com onClick noop + toast "Documentacao em breve"). **Decisao default:** usar `secondaryLink` com `href="#"` e onClick noop ate documentacao oficial existir.
- Area: `'bankroll-empty'`.
- Headline: "Sua banca espera por voce". Description: "Crie sua primeira carteira para acompanhar saldos, transacoes e regras de banca."

**Criterio de aceitacao:**
- [ ] Quando `wallets.length === 0`, `BankrollWidget` NAO renderiza e `<EmptyState>` aparece central.
- [ ] Click "Criar primeira carteira" abre `WalletCreateDialog`.
- [ ] Apos criar wallet, empty state some e `BankrollWidget` aparece.
- [ ] `data-testid="empty-state"` com `data-area="bankroll-empty"`.
- [ ] `BankrollWidget` continua funcionando normalmente quando ha wallets.

**Complexidade:** S

---

### RF-05 — Toast com action no `/grade-planner` (GP-1)

**Descricao:** Atualmente em `GradePlanner.tsx:451` quando o usuario clica em celula vazia de dia OFF, dispara toast "{dayName} esta OFF" sem nenhuma acao. Adicionar `<ToastAction>` "Ativar A" que ativa o perfil A diretamente, fechando o toast e re-tentando a operacao original (abrir dialog de novo torneio com o slot original).

**Paths afetados:**
- `client/src/pages/GradePlanner.tsx` (handler `handleClickEmptyCell`)

**Regras de negocio:**
- Quando `activeProfile === 'OFF' || !activeProfile`, toast vira:
  - title: `"{dayName} esta OFF"`
  - description: "Ative o perfil A, B ou C no cabecalho para adicionar torneios."
  - `action`: `<ToastAction altText="Ativar Perfil A" onClick={() => { setActiveProfile(dayOfWeek, 'A'); /* opcional: re-trigger handleClickEmptyCell */ }}>Ativar A</ToastAction>`
- Perfil default ao clicar action: sempre 'A' (decisao simples; futuro pode olhar GradeSettings para "perfil preferido do dia").
- Re-trigger da operacao original: **opcional** nesta sprint (escopo minimo: apenas ativa o perfil; usuario clica novamente na celula). Se baixo custo, implementer pode incluir re-trigger via setTimeout(0) apos setActiveProfile.
- Lesson #11 aplicada: toast `action` nao eh decorativo — eh a unica forma de ativar perfil em 1 toque.

**Criterio de aceitacao:**
- [ ] Click em celula OFF dispara toast com `<ToastAction>`.
- [ ] Click no botao "Ativar A" do toast muda `activeProfile` para 'A' e fecha o toast.
- [ ] Apos ativar, celula passa a ser clicavel normalmente (proximo clique abre dialog).
- [ ] `altText` do `<ToastAction>` preenchido para screen readers.

**Complexidade:** S

---

### RF-06 — Badge staleness em wallets (BR-8)

**Descricao:** Mostrar badge inline em cada `WalletCard`/`WalletList` row indicando ha quantos dias o saldo foi atualizado pela ultima vez. Fonte do timestamp: `wallets.updatedAt` (campo existente — schema.ts:2905) OU `MAX(walletTransactions.occurredAt)` (mais preciso, pois `updatedAt` muda por qualquer edicao de wallet, nao so por transacao). **Decisao default:** usar `walletTransactions.occurredAt` (ultima transacao) via query agregada no storage, ou derivar no front se ja temos lista de transacoes carregada.

**Paths afetados:**
- `client/src/components/bankroll/WalletList.tsx` ou `WalletDetailPanel.tsx` (definir local mais natural — provavel `WalletList.tsx`)
- `server/storage.ts` (se necessario expor `lastTransactionAt` na listagem de wallets — preferir adicionar ao retorno de `listWallets()`/`getUserWallets()`)
- `server/routes/wallets.ts` (passar campo derivado no response)

**Regras de negocio:**
- Calcular `daysSinceUpdate = differenceInDays(now, lastTransactionAt ?? wallet.updatedAt ?? wallet.createdAt)`.
- Thresholds:
  - `< 3 dias`: sem badge.
  - `3-7 dias`: badge `"atualizado ha {n}d"` com cor cinza/info (`tokens.color.text.muted`).
  - `> 7 dias`: badge `"atualizado ha {n}d"` com cor amarela/warn (use `tokens.color` equivalente — `text-yellow-500` se nao houver token semantico).
  - `> 30 dias`: badge `"sem movimento ha {n}d"` com cor mais forte (mesma warn).
- Tooltip no hover do badge: "Saldo nao atualizado ha {n} dias. Registre uma transacao ou atualize manualmente em Carteira > Editar."
- Sem mudanca em wallets sem transacoes (badge baseado em `createdAt` — se carteira recem-criada esta em `< 3d`, sem badge).
- Storage: adicionar `lastTransactionAt` (timestamp nullable) ao retorno do `listWallets` derivado de `MAX(walletTransactions.occurredAt) WHERE wallet_id = w.id`. Sem migracao — apenas LEFT JOIN agregado.

**Criterio de aceitacao:**
- [ ] Wallet com ultima transacao ha 5 dias mostra badge cinza "atualizado ha 5d".
- [ ] Wallet com ultima transacao ha 10 dias mostra badge amarelo "atualizado ha 10d".
- [ ] Wallet com ultima transacao ha 35 dias mostra badge amarelo "sem movimento ha 35d".
- [ ] Wallet com ultima transacao ha 1 dia nao mostra badge.
- [ ] Tooltip aparece no hover com texto explicativo.
- [ ] `data-testid="wallet-staleness-badge"` para tests.
- [ ] Storage retorna `lastTransactionAt` no shape da wallet (mockable em tests).

**Complexidade:** S (front) + S (storage join leve). Total S.

---

### RF-07 — Tooltip + micro-copy nos chips de lente do Coach (CA-1)

**Descricao:** Em `/coach-ai` aba Chat, os chips Mental/Selecao/Tecnico ja existem (linhas 391-411 de CoachAI.tsx) com micro-copy "Foco:" antes da lista. Adicionar tooltip explicativo no hover de cada chip + linha de status "Foco da conversa: {lenteAtual}" abaixo dos chips.

**Paths afetados:**
- `client/src/pages/CoachAI.tsx` (linhas 390-412)

**Regras de negocio:**
- Wrapper `<Tooltip>` (Radix, ja em uso no projeto) em cada `<button>` de lente. Conteudo do tooltip: "Foco desta conversa — voce pode mudar a qualquer momento. Nao sao agentes diferentes."
- Mesmo texto para os 3 chips (ja existe um label individual via `lens.label`, basta um copy unico explicando o conceito).
- Linha de status: logo apos o `<div>` dos chips, adicionar `<p>` pequeno com texto "Foco da conversa: {LENS_OPTIONS.find(l => l.value === coachType)?.label}". Classe `text-xs text-gray-500 px-4 pb-2`.
- Acessibilidade: tooltip com `aria-describedby` ligando para o conteudo. Mantem `aria-pressed` existente.

**Criterio de aceitacao:**
- [ ] Hover em qualquer chip mostra tooltip "Foco desta conversa — voce pode mudar...".
- [ ] Abaixo dos chips, linha "Foco da conversa: Mental" (ou Selecao/Tecnico) atualiza ao trocar de lente.
- [ ] `data-testid="coach-lens-tooltip-{value}"` para tests.
- [ ] Sem regressao no comportamento de click (continua mudando `coachType`).
- [ ] Keyboard nav: focus em chip dispara tooltip (Radix Tooltip ja suporta).

**Complexidade:** S

---

### RF-08 — Tests para `<EmptyState>` estendido

**Descricao:** Cobrir a nova prop `secondaryCTA` com tests unitarios e atualizar tests existentes de `<EmptyState>` para garantir non-regression.

**Paths afetados:**
- `client/src/components/ui/__tests__/EmptyState.test.tsx` (ou novo arquivo equivalente)

**Regras de negocio:**
- Cenarios cobertos:
  1. Render `secondaryCTA` quando definido — botao com label correto + `data-testid="empty-state-secondary-cta"`.
  2. NAO render quando `secondaryCTA` undefined.
  3. `onClick` do `secondaryCTA` eh chamado ao clicar.
  4. Telemetria `ui.empty_state_secondary_cta_clicked` eh disparada (mock `window.__telemetry.track`).
  5. Ambos `secondaryCTA` e `secondaryLink` renderizam quando ambos fornecidos.
  6. `ariaLabel` do `secondaryCTA` eh respeitado (fallback para `label`).
  7. Telemetria nao quebra quando `window.__telemetry` indisponivel (try/catch silencioso — lesson #9).
- Test setup: usar `@testing-library/react` (jsdom project). NAO usar `require()` para carregar o componente — usar `import` estatico no topo do arquivo (lesson #14 + #26).

**Criterio de aceitacao:**
- [ ] 7 tests cobrem os cenarios acima.
- [ ] Tests passam em isolamento (`npx vitest run client/src/components/ui/__tests__/EmptyState.test.tsx`).
- [ ] Sem regressao em tests existentes de `EmptyState` (run completo).
- [ ] Usa `data-testid` (lesson #2), nao heuristicas DOM (`findByText` percorrendo).

**Complexidade:** S

---

## 6. Requisitos Nao-Funcionais

- **RNF-01 — Tipagem strict:** `npm run check` (tsc) exit code 0. Sem `any` novos sem justificativa em comentario.
- **RNF-02 — Sem regressao em vitest:** baseline atual da branch main (server: 8548 verde / cliente: ~25 red conhecidos em CoachAI tests da refatoracao paralela — esses sao deferidos e nao bloqueiam). Apos sprint: zero novos red.
- **RNF-03 — A11y level AA:** keyboard nav funciona em todos os novos elementos; focus visible (tokens existentes); `aria-label` em botoes; `role="status"` mantido no `<EmptyState>`; tooltip Radix com `aria-describedby`.
- **RNF-04 — Tokens consistentes:** usar `tokens.color.text.muted`, `tokens.color.bg.subtle`, `tokens.spacing`, `tokens.font` de `@/lib/ui-tokens`. Hardcoded hex permitido SOMENTE em casos onde nao ha token equivalente (badge yellow warning — documentar follow-up de adicionar `tokens.color.warn` em sprint futura).
- **RNF-05 — i18n PT-BR:** todos os textos novos em portugues. Codigo em ingles (nomes de vars, types, testids).

---

## 7. Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | `/api/wallets` (existente — alterar shape) | Adicionar `lastTransactionAt` ao retorno de cada wallet | JWT |

Sem novos endpoints. RF-06 estende o shape de resposta do endpoint existente.

---

## 8. Modelos de Dados Afetados

Sem migracao. RF-06 apenas adiciona campo derivado via JOIN agregado no storage:

### wallets (alteracao de **retorno**, nao de schema)

| Campo | Tipo | Origem | Notas |
|---|---|---|---|
| `lastTransactionAt` | `string \| null` (ISO timestamp) | `MAX(wallet_transactions.occurred_at) WHERE wallet_id = w.id` | Derivado em query. `null` se nao ha transacoes. |

`storage.listWallets(userId)` (ou equivalente — implementer confirma nome real no codigo) deve retornar `lastTransactionAt` opcional. Frontend consome o campo direto.

---

## 9. Integracoes Externas

Nenhuma.

---

## 10. Cenarios de Teste Derivados

### Happy Path
- [ ] Usuario novo abre `/grade-planner` -> ve empty state com CTA "Ativar Perfil A" -> clica -> grid normal aparece.
- [ ] Usuario novo abre `/grind-live` -> ve empty state -> clica "Configurar grade primeiro" -> navega para `/grade-planner`.
- [ ] Usuario novo abre `/bankroll` -> ve empty state -> clica "Criar primeira carteira" -> WalletCreateDialog abre.
- [ ] Usuario clica celula OFF em `/grade-planner` -> toast com action "Ativar A" -> clica -> perfil ativa -> proximo clique funciona.
- [ ] Wallet com transacao ha 10 dias mostra badge amarelo "atualizado ha 10d".
- [ ] Hover em chip "Mental" em `/coach-ai` mostra tooltip explicativo.

### Validacao de Input
- [ ] `secondaryCTA` com label vazio: render normal (label vazio nao quebra, mas reviewer deve marcar como NIT se ocorrer em uso real).
- [ ] `wallets.length === 0` mas `walletItems.some(active)` (estado inconsistente) — esconder widget mesmo assim (regra: `length > 0 AND some(active)`).

### Regras de Negocio
- [ ] Empty state grade-planner NAO aparece quando ha torneios planejados, mesmo com perfil OFF.
- [ ] Empty state grade-planner NAO aparece quando ha perfil ativo, mesmo sem torneios.
- [ ] Empty state grind-live NAO aparece quando ha sessao ativa.
- [ ] Badge staleness NAO aparece em wallet com ultima transacao ha < 3 dias.
- [ ] Badge muda de cor entre 7 e 30 dias (cinza -> amarelo).

### Edge Cases
- [ ] `lastTransactionAt = null` (wallet recem criada sem transacoes): badge baseado em `createdAt`; se < 3d, sem badge.
- [ ] Telemetria `window.__telemetry` indisponivel: clique no `secondaryCTA` ainda chama `onClick` (try/catch silencioso).
- [ ] Toast action `<ToastAction>` clicado em modo `aria-pressed` ja ativo: setActiveProfile idempotente (sem erro).
- [ ] Tooltip Coach em mobile (touch): Radix Tooltip ja suporta `delayDuration` longo + tap mostra; aceitar comportamento padrao Radix.

---

## 11. Fora de Escopo

Explicitamente NAO entram nesta sprint:

- **Padroes sistemicos 2 e 3** (`createLocalStorageState`, categorizacao de toasts) — sprints futuras dedicadas.
- **Migracao dos outros ~11 empty states ad-hoc** do projeto (CourseDetailPage, BibliotecaPanel filtros vazios, SessionHistory sem filtros, etc) — sprint UX-QW-3.
- **SessionSummaryModal wizard refactor (GL-4)** — esforco L, sprint dedicado.
- **Drag-and-drop mobile (GP-2)** — esforco L, sprint dedicado.
- **Documentacao oficial `/help/bankroll`** — RF-04 secondary link usa placeholder `#` ate docs existirem (follow-up).
- **Token semantico `tokens.color.warn`** — RF-06 usa `text-yellow-500` direto ate adicionarmos token (follow-up explicito).
- **Re-trigger automatico de `handleClickEmptyCell` apos action do toast** (RF-05) — opcional; default eh nao re-trigger.
- **Tour interativo 3-steps em `/grade-planner` (RF-02)** — default eh toast informativo; tour como componente dedicado fica para futuro.
- **Badge staleness em `BankrollWidget` agregado** (visao global) — RF-06 cobre apenas `WalletCard`/`WalletList` individuais.

---

## 12. Dependencias

- **Foundation UI-FND-1 entregue** (`<EmptyState>` Foundation, `tokens` em `@/lib/ui-tokens`). **Status: entregue, commit 829fd50.**
- **Radix Tooltip** (ja em uso — `@radix-ui/react-tooltip`).
- **Radix Toast / `useToast` hook** (ja em uso — `@/hooks/use-toast` + `<ToastAction>`).
- **Wouter `useLocation`** (ja em uso — `wouter`).
- **Storage `listWallets`/`getUserWallets`** (existente — implementer confirma nome exato em `server/storage.ts`).

---

## 13. Notas de Implementacao

### Lessons-learned aplicaveis (CLAUDE.md §9)

- **Lesson #1 (Hooks first):** RF-04 esconde `BankrollWidget` condicionalmente — early return DEPOIS de hooks. NAO mover `useQuery` para dentro de `if`.
- **Lesson #2 (data-testid estavel):** todos os novos elementos com `data-testid` (`empty-state-secondary-cta`, `wallet-staleness-badge`, `coach-lens-tooltip-{value}`).
- **Lesson #5 (`vi.fn()` nao eh constructor):** RF-08 testa Radix Tooltip — usar `userEvent.hover` (NAO `fireEvent.mouseEnter`).
- **Lesson #9 (Try/catch generico engole erros):** RF-01 telemetria silenciosa segue padrao existente de `EmptyState` (dev-only `console.debug` antes do fallback).
- **Lesson #11 (Default minimo em componentes):** RF-01 `secondaryCTA` eh prop opcional pura — sem default decorativo. Implementer NAO deve adicionar CTA "default" em nenhum empty state.
- **Lesson #14 + #26 (`require()` em `.tsx`):** RF-08 tests usam `import` estatico, NUNCA `require()`.
- **Lesson #27 (Radix Tabs/Tooltip — eventos):** RF-07 — `<TooltipTrigger>` Radix reage a `onMouseEnter`/`onFocus`. Para tests use `userEvent.hover(chip)` ou `chip.focus()`.
- **Lesson #28 (`vi.mock` por path):** RF-08 — se mockar `@/components/ui/EmptyState`, o path do mock TEM que casar com o path do import do consumidor. Mocks de RF-02/RF-03/RF-04 NAO sao necessarios (usar componente real).

### Padrao de migracao do `BankrollWidget` (RF-04)

Esconder via parent (Bankroll.tsx) — NAO via guard interno do widget. Mantem o widget puro:

```tsx
// Bankroll.tsx
const hasActiveWallets = wallets.length > 0 && wallets.some(w => w.status === 'active');

return (
  <>
    {hasActiveWallets && <BankrollWidget ... />}
    {!hasActiveWallets && (
      <EmptyState
        area="bankroll-empty"
        title="Sua banca espera por voce"
        description="Crie sua primeira carteira para acompanhar saldos, transacoes e regras."
        ctaLabel="Criar primeira carteira"
        ctaAction={() => setIsCreateDialogOpen(true)}
        secondaryLink={{ label: "Saber mais", href: "#" /* TODO: /help/bankroll */ }}
      />
    )}
    {/* resto da pagina */}
  </>
);
```

### Storage query agregada (RF-06)

```sql
-- Pseudo-Drizzle (ajustar para sintaxe real em storage.ts)
SELECT
  w.*,
  (SELECT MAX(wt.occurred_at) FROM wallet_transactions wt WHERE wt.wallet_id = w.id) AS last_transaction_at
FROM wallets w
WHERE w.user_id = $1
ORDER BY w.display_order ASC;
```

Performance: subquery por wallet — N+1 leve. Aceitavel pois usuario tipico tem < 10 wallets. Otimizar com window/lateral join se virar gargalo.

### Toast action (RF-05) — referencia rapida

```tsx
import { ToastAction } from "@/components/ui/toast";

toast({
  title: `${dayName} esta OFF`,
  description: "Ative o perfil A, B ou C no cabecalho.",
  action: (
    <ToastAction
      altText="Ativar Perfil A para este dia"
      onClick={() => {
        setActiveProfile(dayOfWeek, 'A');
        // Opcional: re-trigger via microtask
        // setTimeout(() => handleClickEmptyCell(dayOfWeek, time), 0);
      }}
    >
      Ativar A
    </ToastAction>
  ),
});
```

### Estimativa de complexidade total

| RF | Complexidade | Notas |
|---|---|---|
| RF-01 | S | Extensao de componente existente; 1 nova prop. |
| RF-02 | S | Condicional + EmptyState; tour como toast (default). |
| RF-03 | S | Condicional + EmptyState; uso de useLocation Wouter. |
| RF-04 | S | Conditional render + EmptyState + sem migracao. |
| RF-05 | S | Toast com action; 1 funcao. |
| RF-06 | S+S | Storage join + badge component + tooltip. |
| RF-07 | S | Wrapper Tooltip + 1 linha de status. |
| RF-08 | S | 7 tests usando padrao existente. |
| **Total** | **~1.5-2 dias dev** | Sprint tipico de quick wins. |

---

## 14. Criterios de Aceite Globais (sprint-level)

- **AC-1:** `npx vitest run` exit code 0 em tests novos (RF-08) e sem regressao em baseline atual (server 8548 verde, clientes nao-Coach verdes).
- **AC-2:** `npm run check` (tsc) exit code 0.
- **AC-3:** 4 paginas usam `<EmptyState>` estendido com `secondaryCTA` quando apropriado (RF-02 grade-planner, RF-03 grind-live, RF-04 bankroll; RF-04 usa `secondaryLink` em vez de `secondaryCTA` — aceitavel pois link semanticamente certo). Coach (CA-3 sem conversas) **DEFERIDO** caso esforco extrapole — implementer reporta no fim.
- **AC-4:** Toast em `/grade-planner` com `<ToastAction>` funcionando manualmente (smoke test inline aceitavel).
- **AC-5:** Badge staleness aparece em wallets com `lastTransactionAt > 7d` (mockable em tests; verificavel manualmente em wallet seed).
- **AC-6:** Tooltip chips Coach renderiza com texto "Foco desta conversa — voce pode mudar a qualquer momento. Nao sao agentes diferentes." em hover ou focus.
- **AC-7:** Sem novos `any` ou `@ts-ignore` sem justificativa em comentario.
- **AC-8:** Reviewer APPROVED (com ou sem NITs).

---

## 15. Verificacao Final (checklist pre-aprovacao)

- [x] Cada RF tem criterios de aceitacao verificaveis.
- [x] Cenarios de teste cobrem happy path, validacao, regras de negocio e edge cases.
- [x] Secao "Fora de Escopo" preenchida.
- [x] Sem ambiguidade — cada regra tem uma interpretacao unica documentada.
- [x] Endpoints listados (RF-06 estende shape existente).
- [x] Modelos de dados documentados (RF-06 adiciona campo derivado, sem migracao).
- [x] Lessons-learned relevantes do CLAUDE.md mapeadas (§13).
- [x] Estimativa de complexidade por RF.
- [x] Dependencias (Foundation UI-FND-1) confirmadas.

---

## 16. Proximo Passo

Apos aprovacao do founder:

```
Spec aprovada e salva em Docs/specs/sprint-ux-qw-2.md

Proximo passo recomendado:
-> Use o agente system-architect para criar a arquitetura
   baseada na spec em Docs/specs/sprint-ux-qw-2.md
   (mudancas: extensao do EmptyState + 1 ADR opcional para
   decisao "estender vs criar novo componente paralelo")
```

Caso o founder prefira pular system-architect (sprint pequeno, sem decisao arquitetural significativa):

```
-> Use o agente test-writer para escrever os tests TDD
   da extensao do EmptyState + tests de integracao das 4 paginas
   migradas, baseados em Docs/specs/sprint-ux-qw-2.md
```

---

**FIM DA SPEC.**

Pergunto antes de prosseguir:
1. **Esta faltando algum cenario ou regra?**
2. **Alguma decisao default (ex: tour-como-toast em RF-02, `secondaryLink` em vez de `secondaryCTA` em RF-04, perfil 'A' hardcoded em RF-05) precisa ser revertida?**
3. **CA-3 (Coach sem conversas) deve ser garantido ou pode ser deferido?**
4. **Posso prosseguir com esta spec?**
