# ADR-047: Reconciliacao de wallets inline no `SessionSummaryModal`

## Status
Proposto

## Data
2026-04-27

## Contexto

A Sprint B (commit `21fca11`) entregou a v2 da reconciliacao de banca pos-sessao usando um **dialog separado** (`WalletReconciliationDialog`) que abria depois do `SessionSummaryModal`. O fluxo end-to-end era:

```
[summary] → user click "Finalizar" → [summary fecha] → [reconcile dialog abre]
→ user edita saldos → user click "Confirmar reconcile" → [reconcile fecha]
→ [confirmation modal abre com CTAs cooldown] → user escolhe → [cooldown ou /grind]
```

Tres modais sequenciais para encerrar uma sessao. QA real do founder revelou tres tipos de friccao:

1. **Modal-em-modal-em-modal:** o jogador via summary, fechava, via reconcile, fechava, via confirmation. Cada transicao quebrava continuidade visual e exigia uma nova decisao.
2. **Decisao bipartida:** o reconcile pedia "qual saldo final?" *antes* de o jogador escolher entre cooldown full / quick / pular. A decisao de cooldown deveria ser informada pelos saldos (sessao com perda > 5% BR pode justificar cooldown full), mas o fluxo separava as duas perguntas.
3. **Reconcile silencioso para wallets nao matched:** se o jogador jogou em GG sem ter wallet GG cadastrada, o reconcile passava por isso sem aviso — o sintoma era "snapshot Suprema gravado, mas e o GG?". O dialog separado nao tinha espaco UX bom pra mostrar isso (ver ADR-048).

A spec `Docs/specs/sprint-b2-summary-inline-reconcile.md` (M1) enderecaa os tres pontos juntos: levar o reconcile pra dentro do summary, com submit automatico atrelado ao CTA terminal, e adicionar banner de missing platforms inline (ADR-048).

A B2 **nao reabre** decisoes de modelagem da B (ledger imutavel ADR-017, snapshot por sessao ADR-046, optimistic concurrency ADR-038, currency normalizer ADR-033). Apenas reorganiza a UX cliente.

### Pre-requisitos satisfeitos pelo Sprint B
- `session_wallet_snapshots` (ADR-046): tabela imutavel ja existe, idempotente via UNIQUE(sessionId, walletId).
- `walletService.recordTransaction` (ADR-038): optimistic concurrency com `expectedVersion` ja atomic.
- `expectedDelta` derivado server-side: cliente recebe pronto do `GET /reconcilable-wallets`.
- `WalletCreateDialog` ja aceita `prefill: WalletPrefill` (`client/src/components/bankroll/WalletCreateDialog.tsx:17-21`): nenhum trabalho de prop drift, reusar contrato existente.
- `alertsSuspended` ja exposto pelo Sprint B, A2 ja consome.

## Decisao

Migrar a logica do `WalletReconciliationDialog` para uma **secao "Bancas"** embutida no `SessionSummaryModal`. Submit do reconcile vira **automatico** ao clicar qualquer CTA terminal (`Iniciar Cool-down full`, `Iniciar Cool-down quick`, `Finalizar Sessao`).

### Detalhes do contrato

**Componente:**
- `WalletReconciliationDialog.tsx` deprecado. Header `// DEPRECATED — logica migrada para SessionSummaryModal (Sprint B2)`. Arquivo deletado se nao houver consumidor remanescente.
- `SessionSummaryModal.tsx` ganha:
  - Estado local `reportedBalances: Record<walletId, string>` inicializado com `expectedClosingBalance` por wallet.
  - Estado `isReconciling: boolean` para bloquear CTAs durante mutation.
  - Submit handler `runSubmitFlow(ctaAction)`:
    1. Computa `walletsWithAdjustment` (filtro `manualAdjustment != 0`).
    2. Se `walletsWithAdjustment.length > 0`, dispara `POST /reconcile-wallets` e aguarda 200.
    3. Apos sucesso (ou skip se nao ha adjustments), executa `ctaAction()` (cria cooldown ou marca completed + redirect).
    4. Em caso de erro reconcile, exibe toast e NAO avanca CTA.
- `WalletCreateDialog` reusa **contrato existente** `prefill: WalletPrefill`. Nenhum prop novo `defaultPlatform`/`defaultCurrency` (correcao em relacao a versao inicial da spec — UX audit secao 3 alinhou nomenclatura).

**Layout (UX audit):**
- Tabela densa (1 linha por wallet, ~40-48px), nao cards. Scroll vertical com `max-h-[280px]` quando 6+ wallets.
- Ordem vertical: stats → (banner missing platforms se aplicavel) → secao "Bancas" → resumo agregado de ajuste → CTAs.
- Preview manualAdjustment em tempo real ao lado do input (verde positivo, destructive negativo, muted-foreground zero).
- Auto-foco no primeiro input editavel ao abrir (quick win UX-1).

**Tokens visuais (M6 + correcao do UX audit):**
- Usar **tokens semanticos** (`bg-card`, `bg-background`, `border-border`, `text-foreground`, `bg-primary`) ao inves de classes raw (`bg-poker-surface`, `bg-gray-900`, `bg-gray-800`). Aproveita o trabalho de `cf9e163` e preserva theme switching.

**Setting `bankrollManagementEnabled`:**
- Quando `false`, secao "Bancas" e banner missing platforms NAO sao renderizados. CTAs prosseguem direto sem chamar `POST /reconcile-wallets`. Server tambem skip de gravar snapshot. Telemetry `reconcile_skipped_setting_off` server-side.

**Compatibilidade A2:**
- Flag `alertsSuspended` simplificada. `showReconcileDialog` removido do calculo. Novo:
  ```ts
  const alertsSuspended = showSessionSummary || showConfirmationModal;
  ```
  Contrato externo mantido.

### Risco de bloat e mitigacao

A secao "Bancas" + banner missing + WalletCreateDialog inline (Portal Radix) podem inflar `SessionSummaryModal.tsx` para alem de 300 linhas. Mitigacao explicita:

- Se `SessionSummaryModal.tsx` ultrapassar **300 linhas** apos B2, extrair sub-componente `BankrollReconcileSection.tsx` em `client/src/components/grind-session-live/`. Recebe props `wallets`, `missingPlatforms`, `reportedBalances`, `onReportedBalanceChange`, `onCreateWalletClick`. SessionSummaryModal mantem orquestracao + CTAs + submit handler.
- Nao extrair preventivamente. Aguardar fim da implementacao M1+M3 e medir. (Lesson learned: refactor profilatico vira layer extra sem motivo.)

## Opcoes Consideradas

### Opcao 1: Manter dialog separado e melhorar transicoes (animacao, breadcrumb)
- **Pros:**
  - Preserva separacao de concerns (summary = analise; reconcile = saldo; confirmation = decisao cooldown).
  - SessionSummaryModal nao cresce.
  - Componente reusavel se houver outro contexto que pede reconcile (hipotetico).
- **Contras:**
  - Nao resolve a friccao raiz (3 modais em sequencia continua sendo 3 modais).
  - "Reusabilidade hipotetica" sem caso real concreto = YAGNI.
  - Nielsen heuristica #4 (consistency) sofre quando reconcile, summary e confirmation tem padroes visuais ligeiramente diferentes.
  - Nao ajuda em missing platforms (banner precisa estar no mesmo modal que mostra as wallets, senao o jogador nao conecta as duas informacoes).

### Opcao 2: Reconcile inline no summary, submit ATOMICO no CTA terminal (decisao escolhida)
- **Pros:**
  - 1 modal, fluxo linear, submit unico.
  - Banner missing platforms convive com tabela de wallets — diagnostico e remediacao no mesmo lugar.
  - Decisao de cooldown informada pelos saldos (jogador ve perda real antes de escolher quick vs full).
  - Submit atomico: se reconcile falha, CTA nao avanca. Sem estado intermediario "reconcile OK mas cooldown nao criou".
  - Reuso de `WalletCreateDialog` existente sem mudanca de contrato (prefill ja existe).
- **Contras:**
  - SessionSummaryModal cresce. Mitigado por extracao de sub-componente quando passa de 300 linhas.
  - Mistura concerns (analise + edicao de saldo + cadastro de wallet) — aceito como trade-off pela reducao de friccao macro.
  - Modal-em-modal (WalletCreateDialog dentro de summary) tem risco de focus trap em cascata. Mitigado por uso correto de Radix Portal + teste manual em Chrome+Firefox.

### Opcao 3: Wizard multi-step (summary → reconcile → cooldown choice)
- **Pros:**
  - Cada passo focado em uma decisao.
  - Progresso visivel reduz ansiedade (Nielsen #1).
- **Contras:**
  - Wizard exige back/next navigation, dificulta volta apos cadastro inline de wallet (jogador estaria no passo 2, voltaria pro 1?).
  - Pattern atipico no app — todo o resto eh modal direto. Inconsistencia (Nielsen #4).
  - Nao se beneficia da informacao consolidada — wizard isola decisoes que se beneficiam de ver juntas (saldo + escolha de cooldown).

### Opcao 4: Substituir summary por uma pagina dedicada `/grind/:id/end`
- **Pros:**
  - Sem limite de espaco vertical.
  - URL discoverable (jogador pode reabrir).
- **Contras:**
  - Quebra padrao `modal pos-sessao` ja estabelecido no app.
  - Adiciona route + state management (sessionId via URL params).
  - Tempo de implementacao 3x maior. Nao justificado pelo ganho.
  - Sessao em estado intermediario (`ended`) entre encerrar e finalizar continua estranho — pagina dedicada nao resolve, so muda onde mora.

## Consequencias

### Positivas

- **Fluxo encurtado de 3 modais para 1.** Uma unica decisao composta (saldos + escolha de cooldown).
- **Reconcile + cadastro de wallet missing convivem no mesmo viewport.** Banner amber no contexto da tabela = remediacao obvia.
- **Submit atomico CTA → reconcile → acao terminal.** Sem estado intermediario inconsistente. Erros falham cedo, modal continua aberto.
- **Reuso do contrato `prefill` ja existente.** Zero refactor em `WalletCreateDialog`. UX audit alinhou nomenclatura — nao se cria `defaultPlatform`/`defaultCurrency`.
- **Tokens semanticos preservam theme switching futuro.** Aproveitamento do trabalho de `cf9e163`.
- **Performance neutra.** Mesma quantidade de queries (1 GET reconcilable-wallets, 1 POST reconcile, 1 POST cooldown-logs). Nada novo no servidor.

### Negativas

- **`SessionSummaryModal.tsx` fica maior.** Mitigado por extracao de `BankrollReconcileSection` quando passar de 300 linhas. Nao preventivamente.
- **Mistura responsabilidades** (analise da sessao + edicao de saldo). Aceito como trade-off; o ganho de consolidacao supera o ganho teorico de separacao.
- **Modal-em-modal** (WalletCreateDialog dentro do summary) traz risco de focus trap quebrado. Mitigado por Radix Portal + QA manual.
- **Componente A2** (`AlertsPanel`, `TournamentAlertDialog`, `fireAlert`, `sessionAlertManagerRef`) NAO modificado. Contrato `alertsSuspended` simplificado mas externo inalterado.
- **Migracao `WalletReconciliationDialog` deprecated** — implementer precisa garantir que nenhum outro consumidor importa antes de deletar. Header `DEPRECATED` se houver remanescente.

### Neutras

- **Telemetria renomeada.** Eventos `reconcile_dialog_*` (se existiam) viram `summary_inline_reconcile_*`. Decisao de renomear vs manter nome legado fica com implementer (preferencia: renomear para refletir realidade).
- **Estado em sessionStorage.** UX audit quick win UX-4 sugere persistir `reportedBalances` em sessionStorage para survivar Esc/refresh. Implementer decide se entra em B2 ou em sub-spec posterior. NAO bloqueante para esta ADR.
- **Tabela densa vs cards.** UX audit recomenda tabela densa (40-48px por linha). Decisao executiva do implementer + design review final.

## Confianca

**Alta.** A friccao foi observada empiricamente em QA real, nao hipotetica. As pre-condicoes ja estao satisfeitas (snapshot, ledger, FX, prefill). Risco principal (focus trap modal-em-modal) tem mitigacao conhecida (Radix Portal). Bloat do componente tem trigger objetivo (300 linhas) e mitigacao concreta (extracao).

## Referencias

- Spec: `Docs/specs/sprint-b2-summary-inline-reconcile.md` (M1)
- UX audit: `Docs/strategy/b2-ux-audit.md` (secoes 1, 5, 6)
- Sequence diagram: `Docs/architecture/flows/grind/sequence-session-end-b2.mermaid`
- ADR-046: `session_wallet_snapshots` table (pre-requisito)
- ADR-048: Wallets eligibility por plataformas jogadas (sibling — banner missing platforms)
- ADR-038: Wallet tx optimistic concurrency
- ADR-017: Wallet ledger imutavel
- ADR-033: FX rate convention
