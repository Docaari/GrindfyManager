# Spec: Reconciliacao de Banca ao Fim da Sessao — V2

## Status
Proposta

## Predecessora e Motivacao para v2

Esta spec **substitui** `Docs/specs/session-end-wallet-reconciliation.md` (v1, doravante "spec v1"). A v1 foi parcialmente implementada (commit `1e61dfd`) mas esta **quebrada em producao**. Casos:

- **P1** — `WalletReconciliationDialog` nao aparece em nenhuma sessao real do founder. Root cause: `storage.listReconcilableWallets` (`server/storage.ts:4175-4187`) filtra wallets pela presenca de `wallet_transactions WHERE session_id = :id`. Hoje buy-ins/payouts durante sessao gravam SOMENTE em `session_tournaments` e NUNCA criam `wallet_transactions` com `sessionId`. Resultado: set de atividade sempre vazio → endpoint retorna `wallets: []` → `runSessionEndFlow` (linhas 84-86) pula o dialog → `openSummaryModal` redireciona pra `/grind`. Founder nunca ve nem o reconcile nem o summary.
- **P2** — `openSummaryModal` em `GrindSessionLive.tsx:577-581` redireciona pra `/grind` em vez de exibir `SessionSummaryModal` in-place. Bug introduzido junto da implementacao da v1.
- **P3** — `POST /api/cooldown-logs` retorna 400 ao iniciar cooldown a partir do summary. Root cause: `generateSessionSummary` (linhas 472-498) monta `summaryData` SEM o campo `sessionId`. `SessionSummaryModal.startCooldown` (linha 59) le `summaryData.sessionId` → `undefined` → cai no fallback (linhas 65-68) e chama POST sem `sessionId`. Server adiciona `userId`, valida com `insertCooldownLogSchema` (`.strict()`, exige `sessionId.min(1)`) e responde 400 "Required".

A v1 falha em premissa central: assume que ja existe um sinal `wallet_transactions.sessionId` populado durante a sessao. **A v2 inverte essa premissa**: o servidor *deriva* o delta esperado por wallet a partir de `session_tournaments` agrupado por site (a fonte de verdade real de buy-ins/payouts hoje), pre-calcula o saldo final candidato por wallet, e usa essa derivacao como "saldo final pre-calculado" no dialog.

A v2 tambem expande o escopo para cobrir lacunas operacionais que a v1 nao enderecou:
- Persistencia de openingBalance/closingBalance/expectedDelta/manualAdjustment **por wallet por sessao** (nova tabela), pre-requisito para a tela "detalhes da sessao" mostrar a banca antes/depois.
- Mapeamento explicito `session_tournaments.site → wallets.platform` com tratamento de N matches e zero matches (delta orfao).
- Conversao de moeda quando `tournament` esta numa moeda diferente de `wallet.nativeCurrency` (uso da convencao oficial ADR-033).
- Contrato de reset de alarmes em `endSessionMutation.onSuccess` (consistencia com sessao A — gestao de alarmes).
- Telemetria expandida para os 9 eventos do fluxo completo (incluindo summary, cooldown, dialog).

A v1 fica arquivada como referencia historica do API delta inicial; **toda nova implementacao deve seguir esta v2**.

---

## Resumo

Substitui o fluxo "Finalizar Sessao" em `/grind-session-live` por uma sequencia integra:

1. **Confirmation modal** (auto-finish de torneios pendentes — preservado).
2. **PUT `/api/grind-sessions/:id` `status=completed`** + reset de alarmes + abertura do `SessionSummaryModal` **in-place** (nao redireciona).
3. **`SessionSummaryModal`** com 3 CTAs cooldown corretamente alimentados pelo `sessionId`.
4. Quando o usuario clica "Finalizar Sessao" no summary (skip cooldown), o sistema abre o **`WalletReconciliationDialog`** com **saldo final pre-calculado por wallet** (derivado de `session_tournaments` + mapeamento site→wallet + conversao de moeda quando necessario).
5. Submit do dialog grava `wallet_transactions` (`reason='session_result'`, `source='auto_session'`) **e** snapshot por wallet em nova tabela `session_wallet_snapshots`. Skip do dialog grava apenas o snapshot (sem manualAdjustment).
6. Pagina de detalhes da sessao (`SessionHistory` edit modal estendido) le `session_wallet_snapshots` e exibe tabela `wallet | inicial | final | delta esperado | ajuste manual | reason`.

Reusa `walletService.recordTransaction` (ADR-038 optimistic concurrency), o ledger imutavel (ADR-017), o telemetry adapter existente, e o normalizador de currency (ADR-033). Adiciona uma unica tabela nova: `session_wallet_snapshots`.

---

## Contexto

### Estado atual (bugado)

Codigo atual em producao tem 3 bugs ativos descritos na secao "Predecessora". Em resumo:
- Dialog de reconciliacao nao aparece (premissa errada na query).
- Summary redireciona em vez de aparecer in-place.
- Cooldown create falha por falta de `sessionId` no payload.

### Verdade de campo da arquitetura existente

Buy-ins, payouts, bounties, rebuys e add-ons sao registrados em `session_tournaments` durante a sessao ativa (`shared/schema.ts:416-456`). **Nao existe** path automatico que crie `wallet_transactions` ao registrar um torneio. Wallets sao alimentadas separadamente por: `WalletTransactionDialog` (manual), reconciliacao, e import CSV historico.

Logo, o saldo "real" de cada wallet ao fim da sessao precisa ser **derivado** por agregacao de `session_tournaments`:

```
expectedDelta(wallet)
  = Σ (prize + bounty - buyIn - addOnCost*addOnTaken - rebuyCost*rebuys)
        para cada session_tournament cujo `site` mapeia para `wallet.platform`
        convertido para `wallet.nativeCurrency` quando `tournament_currency != wallet.nativeCurrency`
```

E `expectedClosingBalance(wallet) = wallet.balance + expectedDelta(wallet)`.

### Por que verdade-de-campo do jogador continua vencendo

Mesmo com `expectedDelta` pre-calculado, o jogador continua tendo a palavra final via input "Saldo final reportado". A diferenca em relacao a v1 e que agora o input vem **pre-preenchido com o `expectedClosingBalance`** (nao com o `wallet.balance` cru). Isso reduz o trabalho do jogador para "conferir e confirmar" quando o registro durante a sessao foi consistente, e expoe imediatamente a divergencia quando nao foi.

### Restricoes de coordenacao

Esta spec **NAO** modifica codigo controlado pela "sessao A" (gestao de alarmes em `GrindSessionLive`). Ver secao "Contrato com Sessao A" abaixo. Apenas adiciona reset de alarmes em `endSessionMutation.onSuccess` e expoe uma flag derivada `alertsSuspended`.

---

## Usuarios

- **Jogador (player) — fluxo finalizar sessao:** clica "Finalizar Sessao" durante o grind, confirma auto-finish de pendentes, ve summary in-place, escolhe entre 3 CTAs (cooldown full / quick / skip), reconcilia wallets quando aplicavel, redirecionado para `/grind`.
- **Jogador (player) — auditoria pos-fato:** abre `SessionHistory`, clica edit numa sessao concluida, ve a aba "Banca" com tabela `wallet | inicial | final | delta esperado | ajuste manual | reason`.
- **Jogador (player) — reabrir sessao por engano:** se uma reconciliacao ja foi persistida, sistema bloqueia uma segunda (idempotencia, mantida da v1).

### Glossario

- **Saldo inicial (openingBalance):** `wallet.balance` no momento em que a reconciliacao comeca a ser processada (capturado server-side via `SELECT FOR UPDATE`).
- **Delta esperado (expectedDelta):** soma derivada de `session_tournaments` agrupada por site→wallet, convertida para `wallet.nativeCurrency`. Pre-calculado server-side.
- **Saldo final pre-calculado (expectedClosingBalance):** `openingBalance + expectedDelta`. Valor que pre-preenche o input no dialog.
- **Saldo final reportado (reportedBalance):** valor que o jogador digita no dialog. Verdade de campo.
- **Ajuste manual (manualAdjustment):** `reportedBalance - expectedClosingBalance`. Quando != 0, indica divergencia entre registro durante sessao e realidade. Quando == 0, registro estava consistente.
- **Delta orfao:** soma de `session_tournaments` cujo `site` nao mapeia para nenhuma wallet ativa do usuario. Exibido no dialog como informacao mas NAO gera tx.
- **Source `auto_session`:** valor enum existente em `wallet_transactions.source`. Marca tx geradas pela reconciliacao automatica.
- **alertsSuspended:** flag derivada client-side que vale `true` enquanto qualquer modal terminal esta aberto (`showSessionSummary || showReconcileDialog || showConfirmationModal`). Sessao A consome.
- **Snapshot por sessao por wallet:** row em `session_wallet_snapshots` capturando estado da wallet relativo a uma sessao. Imutavel apos criacao (mesmo principio de ledger).

---

## Requisitos Funcionais

### RF-01: Reset de alarmes + summary in-place em `endSessionMutation.onSuccess`

**Descricao:** Substituir o callback atual de `endSessionMutation.onSuccess` (que hoje, via `runSessionEndFlow`, redireciona pra `/grind` ao chamar `openSummaryModal`) por um callback que **(a)** reseta os alarmes e **(b)** abre `SessionSummaryModal` in-place.

**Regras de negocio:**
- Reset acontece em `endSessionMutation.onSuccess` (apos PUT `status=completed` retornar 200), **NAO** dentro de `runSessionEndFlow`. Razao: assim que o servidor confirma o status como `completed`, alarmes nao devem mais disparar mesmo se a UI demorar/falhar nas etapas seguintes (consistencia > timing).
- Reseta literalmente: `sessionAlertManagerRef.current.reset(); setGenericAlerts([]); setFiredGenericAlerts([]); setActiveAlertCount(0);`.
- Apos o reset, abre `SessionSummaryModal` setando `setSessionSummaryData(...)` (com `sessionId` — RF-07) e `setShowSessionSummary(true)`.
- **NAO** redireciona pra `/grind` neste ponto. Redirect so acontece quando o usuario clica "Finalizar Sessao" no summary (apos eventual reconciliacao) — RF-04.
- `runSessionEndFlow` (atual) e refatorado para nao mais ser invocado direto no `handleEndSession`. O orquestrador passa a ser:
  1. `setShowConfirmationModal(true)` (apenas se `pendingTournaments.length > 0` — ver paragrafo abaixo).
  2. user confirma → auto-finish pendentes → `endSessionMutation.mutate()`
  3. `endSessionMutation.onSuccess` → reset alarmes + open summary in-place
  4. summary CTAs decidem o resto (RF-02 / RF-03).

**Skip de ConfirmationModal sem pendentes (P5 — F-05):**
Quando `pendingTournaments.length === 0`, ConfirmationModal eh **pulado** automaticamente: clique em 'Finalizar Sessao' (botao principal da grind UI) dispara direto `endSessionMutation.mutate()` sem modal intermediario. Reduz cliques no caso comum (founder fechou todos torneios manualmente durante grind). Quando ha pendentes, ConfirmationModal continua aparecendo com lista + opcao auto-finish.

Telemetria: evento `confirmation_modal_skipped` registrado quando pulado, com payload `{ pendingCount: 0 }`.

**Summary CTAs apos PUT (P4 — F-06):**
Summary modal exibe APENAS 3 CTAs apos `endSessionMutation` ter rodado: `Cool-down completo`, `Cool-down rapido`, `Finalizar (sem cool-down)`. Botao `Continuar Sessao` foi removido — apos PUT `status=completed` no servidor + reset de alarmes, voltar pra grind ativo deixaria estado inconsistente. Founder que clicou por engano pode iniciar nova sessao a partir de `/grind`. ConfirmationModal (pre-PUT) mantem opcao 'Cancelar' como ultima chance de desistir.

**Criterio de aceitacao:**
- [ ] PUT `status=completed` retorna 200 → `sessionAlertManagerRef.current.reset()` chamado exatamente 1x.
- [ ] `genericAlerts`, `firedGenericAlerts` zerados; `activeAlertCount === 0`.
- [ ] `SessionSummaryModal` aparece in-place sem `setLocation('/grind')`.
- [ ] `summaryData.sessionId === activeSession.id`.
- [ ] Em caso de PUT falhar (4xx/5xx), reset de alarmes **NAO** acontece e summary **NAO** abre; usa o handler de erro existente (toast).
- [ ] 0 pendentes → ConfirmationModal nao renderiza.
- [ ] N pendentes → ConfirmationModal renderiza com lista de N torneios + opcao auto-finish.
- [ ] Summary modal NAO renderiza botao 'Continuar Sessao'.
- [ ] CTAs visiveis: 3 quando cool-down nao iniciado; 1 ('Fechar') quando cooldownAlreadyDone=true.

---

### RF-02: Pre-calculo de `expectedDelta` por wallet (server-side)

**Descricao:** Novo helper server-side `calculateExpectedDeltaPerWallet(sessionId, userId, exchangeRates)` que agrega `session_tournaments` por site, mapeia para wallets ativas via `mapSiteToWallet`, converte buy-ins/prizes para `wallet.nativeCurrency` quando necessario, e retorna estrutura por wallet `{ walletId, expectedDelta, contributingTournaments[], orphanContribution? }`.

**Regras de negocio:**
- Le `session_tournaments WHERE session_id = :sessionId AND user_id = :userId AND status='finished'`. Torneios com status diferente de `finished` ou `null` devem ser **ignorados** (nao geram delta — sao casos de cancelamento ou registro sem fechamento).
- Para cada torneio, calcula contribuicao individual:
  ```
  contribution_native = (prize + bounty)
                      - (buyIn + addOnCost*addOnTaken + rebuyCost*rebuys)
  ```
  onde `rebuyCost = buyIn` (alinhado com convencao do projeto; manter consistente com `calculateSessionStats`).
- Mapeia o torneio para wallet via `mapSiteToWallet(tournament.site, userWallets)` (RF-03). Se mapeia para multiplas wallets, aplica regra de tie-break documentada em RF-03. Se nao mapeia, contribuicao vai para `orphanContribution`.
- Converte para `wallet.nativeCurrency` quando aplicavel:
  - **Premissa default:** `session_tournaments` armazena valores na moeda nativa do site. Tabela de equivalencia padrao site→currency aceita pelo projeto: PokerStars/PokerStars.com → USD, BlackChip/AmericasCardroom (WPN) → USD, GGPoker/GG → USD, PartyPoker → USD, 888poker → USD, PokerStars.BR → BRL (caso futuro). Se o tournament tem campo de currency explicito (campo nao existe hoje em `session_tournaments`), usa ele; caso contrario, infere via lookup site→default_currency em constante `SITE_DEFAULT_CURRENCY` declarada em `server/services/walletReconciliation.ts`.
  - Se `tournament_currency === wallet.nativeCurrency` → no-op.
  - Se diferente → converte usando `exchangeRates` do `userSettings` via `normalizeBuyInToUSD` + reconversao para `wallet.nativeCurrency` (ADR-033). Pseudocodigo:
    ```
    usd = normalizeBuyInToUSD(contribution_native, tournament_currency, exchangeRates)
    contribution_in_wallet_currency = usd * exchangeRates[wallet.nativeCurrency]
    ```
    Se `wallet.nativeCurrency === 'USD'` → contribution_in_wallet_currency = usd.
- Soma todas as contribuicoes por wallet → `expectedDelta`.
- `contributingTournaments[]` lista os ids dos torneios contabilizados (para auditoria / telemetria).
- `orphanContribution` eh um **array** de `{ site, currency, amount }` exibido no dialog como info detalhada (P6 — F-03), nao gera tx. Exemplo: `[{ site: 'BodogPlay', currency: 'BRL', amount: 12.50 }, { site: 'ChicoNetwork', currency: 'USD', amount: 8.00 }]`. Permite que o banner liste sites especificos + CTA "Cadastrar carteira agora" (RF-05).

**Criterio de aceitacao:**
- [ ] Helper puro `calculateExpectedDeltaPerWallet` testado em isolamento com 6 casos: (a) 1 torneio, 1 wallet, mesma moeda; (b) N torneios mesmo site, 1 wallet; (c) 1 site, 2 wallets ativas (tie-break); (d) site sem wallet correspondente (orfao); (e) torneio em USD, wallet em BRL (conversao); (f) torneio com `status != 'finished'` ignorado.
- [ ] Quando `exchangeRates[wallet.nativeCurrency]` ausente ou invalido, conversao retorna 0 deterministico (consistente com ADR-033) e telemetria registra `currency_conversion_skipped` com `reason='missing_rate'`.
- [ ] `orphanContribution` agregado ao retorno quando ha sites sem match.
- [ ] Funcao nao toca DB diretamente — recebe `tournaments[]` e `wallets[]` como parametros (testavel sem mock pesado).

---

### RF-03: Mapeamento `session_tournaments.site → wallets`

**Descricao:** Helper puro `mapSiteToWallet(site, wallets)` que retorna a(s) wallet(s) candidata(s) para um determinado site.

**Regras de negocio:**
- Match e **case-insensitive** e baseado em `wallet.platform` exato. Sinonimos comuns sao normalizados via tabela `SITE_ALIASES` em `server/services/walletReconciliation.ts`. Aliases iniciais (extensible):
  - `BlackChip`, `BlackChipPoker`, `BCP`, `AmericasCardroom`, `ACR`, `WPN` → grupo "WPN".
  - `GGPoker`, `GG`, `Natural8`, `GGNetwork` → grupo "GG".
  - `PokerStars`, `Stars`, `PS` → grupo "PokerStars".
  - `PartyPoker`, `Party` → grupo "PartyPoker".
  - `888poker`, `888` → grupo "888poker".
- O grupo do site eh comparado contra `wallet.platform` apos a mesma normalizacao. Wallets com `platform === group` matcheiam.
- Apenas wallets com `status='active'` sao candidatas. Wallets `archived` nunca matcheiam (mesmo se `platform` bate).
- **Tie-break (multiplas matches):** ambas wallets entram em `candidates[]`. A divisao do `expectedDelta` segue a politica:
  - Se exatamente 1 wallet ativa para o grupo → 100% do delta vai pra ela.
  - Se 2+ wallets ativas para o grupo → delta eh distribuido **proporcionalmente** ao saldo atual de cada (pesos = `wallet.balance / Σ balances do grupo`). Caso todos balances sejam 0 → distribui igualmente. Founder pode override pelo dialog (input editavel por wallet, RF-05).
  - Politica documentada em ADR-045 "session-end reconciliation: site-to-wallet tie-break policy" (`Docs/architecture/decisions/045-session-end-wallet-tie-break.md`).
- **Sem match:** site retorna `[]`. Contribuicoes acumulam em `orphanContribution` (RF-02).

**Criterio de aceitacao:**
- [ ] Helper puro `mapSiteToWallet` testado com 5 casos: (a) match exato 1-1; (b) match com alias case-insensitive; (c) 0 matches → orfao; (d) 2 matches ambas ativas → ambas retornadas; (e) wallet archived com platform que bate → ignorada.
- [ ] Tabela `SITE_ALIASES` exportada e extensivel (nao hardcoded em multiplos lugares).
- [ ] Tie-break proporcional documentado em ADR.
- [ ] `mapSiteToWallet('Bovada', [...])` retorna `[]` quando nenhum alias bate (caso real: bovada nao mapeado por default — verificar `SITE_ALIASES`).

---

### RF-04: Endpoint `GET /api/grind-sessions/:id/reconcilable-wallets` (corrigido)

**Descricao:** Substitui a implementacao bugada de `storage.listReconcilableWallets` (linhas 4175-4187). Agora retorna wallets matched mesmo sem `wallet_transactions` previas, alimentadas pelo helper de RF-02.

**Regras de negocio:**
- Auth: `requireAuth` + ownership da sessao.
- Query string: `?includeAll=true|false` (default false) — preservado da v1.
- Request flow:
  1. Verifica idempotencia (P5 — F-12): `SELECT 1 FROM session_wallet_snapshots WHERE session_id = :sessionId LIMIT 1`. Se existe → resposta `{ alreadyReconciled: true, wallets: [] }`. (Captura tanto reconciliacao confirmada com ajustes quanto skip explicito via `Saldos OK, sem ajuste` — ambos geram snapshot, ambos sao decisoes deliberadas imutaveis.) Adicionalmente, `wallet_transactions WHERE source='auto_session' AND session_id=:sessionId` continua sendo checagem secundaria de seguranca contra race conditions, mas snapshots e a fonte primaria. Skip via `Pular sem registrar` (X / ESC / link terciario) NAO grava snapshot, portanto NAO marca sessao como reconciliada — reabrir sessao mostra dialog de novo (decisao deliberada: skip soft permite voltar atras; skip hard via 'Saldos OK' nao). ADR-046 documenta esta escolha.
  2. Busca `session_tournaments` da sessao.
  3. Busca wallets ativas do user.
  4. Busca `userSettings.exchangeRates`.
  5. Chama `calculateExpectedDeltaPerWallet` (RF-02).
  6. Monta resposta:
     ```json
     {
       "sessionId": "...",
       "alreadyReconciled": false,
       "wallets": [
         {
           "walletId": "wal_xyz",
           "name": "BlackChip Main",
           "platform": "WPN",
           "nativeCurrency": "USD",
           "openingBalance": 1180.00,
           "expectedPreviousBalance": 1180.00,
           "expectedDelta": 67.50,
           "expectedClosingBalance": 1247.50,
           "contributingTournaments": ["st_1", "st_2"],
           "hadActivityInSession": true
         }
       ],
       "orphanContribution": [
         { "site": "BodogPlay", "currency": "BRL", "amount": 12.50 },
         { "site": "ChicoNetwork", "currency": "USD", "amount": 8.00 }
       ]
     }
     ```
- Default (`includeAll=false`): retorna apenas wallets com `hadActivityInSession=true` (i.e. `contributingTournaments.length > 0`). Diferente da v1, que filtrava por `wallet_transactions.session_id` (sempre vazio).
- `includeAll=true`: retorna todas as wallets ativas do user. Wallets sem atividade tem `expectedDelta=0`, `expectedClosingBalance=openingBalance`.
- Wallets archived nunca aparecem (preservado da v1).
- `orphanContribution` eh array de `{ site, currency, amount }` (P6 — F-03) — exibido como banner informativo detalhado no dialog (RF-05).

**Criterio de aceitacao:**
- [ ] Endpoint retorna wallets matched mesmo quando `wallet_transactions WHERE session_id = X` esta vazio (correcao do bug P1).
- [ ] `expectedClosingBalance` calculado server-side; cliente nao recalcula.
- [ ] `alreadyReconciled=true` quando ja existe tx com source `auto_session` para a sessao OU rows em `session_wallet_snapshots` (P5 — F-12).
- [ ] Sessao sem nenhum `session_tournaments` finalizado → response com `wallets: []` (e `includeAll=true` retorna wallets ativas com delta 0).
- [ ] `orphanContribution` populado quando ha sites sem wallet correspondente, com `{ site, currency, amount }` por entrada.
- [ ] Resposta inclui `expectedPreviousBalance` (= `openingBalance`) para optimistic concurrency RF-08.
- [ ] `session_wallet_snapshots` rows existem → `alreadyReconciled=true`.
- [ ] Skip via X (sem snapshots) → `alreadyReconciled=false`, dialog reabre.
- [ ] `Saldos OK, sem ajuste` cria snapshots com manualAdjustment=0 → `alreadyReconciled=true` em proxima visita.

---

### RF-05: `WalletReconciliationDialog` com saldo pre-calculado

**Descricao:** Dialog atualizado para receber `expectedClosingBalance` por wallet e usa-lo como pre-preenchimento do input "Saldo final reportado".

**Regras de negocio:**
- Para cada wallet listada:
  - Exibe: nome + plataforma; `nativeCurrency`; `openingBalance` ("Saldo inicial") formatado; `expectedDelta` ("Delta esperado", verde se >0, vermelho se <0, cinza se 0); `expectedClosingBalance` ("Saldo final pre-calculado").
  - Input "Saldo final reportado" vem **pre-preenchido com `expectedClosingBalance`** (NAO com `openingBalance` como na v1).
  - Preview de `manualAdjustment = reportedBalance - expectedClosingBalance` em tempo real:
    - `manualAdjustment > 0` → label "+{adj} (extra nao registrado)" em verde.
    - `manualAdjustment < 0` → label "{adj} (saida nao registrada)" em vermelho.
    - `|manualAdjustment| < 0.01` → label "Conferido. Sem ajuste manual." em cinza.
- **Banner de orfao (P6 — F-03):** exibido quando `orphanContribution.length > 0`:

  > 🟨 Detectamos resultados em sites sem carteira cadastrada nesta sessao:
  > - BodogPlay (BRL 12.50)
  > - ChicoNetwork (USD 8.00)
  >
  > **Esses valores nao serao registrados nesta sessao.** Para incluir em sessoes futuras: [Cadastrar carteira agora]

  CTA `Cadastrar carteira agora` abre `/bankroll` em nova aba (preserva fluxo de reconciliacao). Em mobile, abre modal in-place de criacao rapida de wallet com pre-fill de plataforma + currency detectada.

- Toggle "Mostrar todas as wallets ativas" preservado da v1; refetch com `includeAll=true`.

- **Botoes (P2 — F-02 nomenclatura atualizada):**
  - "Confirmar e gerar ajustes" (primario): cria `wallet_transactions` para deltas != 0 + grava `session_wallet_snapshots` para todas as wallets do dialog (RF-07).
  - "Saldos OK, sem ajuste" (secundario): cria snapshots com `manualAdjustment=0` (skip soft, imutavel). Botao com tooltip: "Confirma que os saldos pre-calculados estao corretos. Snapshot da sessao sera salvo sem ajuste manual."
  - "Pular sem registrar" (link terciario discreto com icone de aviso): NAO grava snapshots, NAO grava wallet_transactions, fecha dialog → `setLocation('/grind')`. Telemetria `reconcile_skipped_user` (RF-12).

- **Hierarquia visual (P2 — F-02):** (a) primario solid colorido = `Confirmar e gerar ajustes`; (b) secundario outline = `Saldos OK, sem ajuste`; (c) link terciario discreto com icone de aviso = `Pular sem registrar`. Diferenciacao visual evita confusao entre 'confirmar sem alterar' (skip soft, cria snapshot) e 'sair sem salvar' (skip hard, sem snapshot).

- **Fechar via X / ESC / overlay click (P1 — F-01):** equivalente a `Pular sem registrar`. Dispara mesma telemetria `reconcile_skipped_user`. NAO chama endpoint POST. NAO grava `session_wallet_snapshots`. Para registrar snapshot rastreavel (skip explicito imutavel), usuario deve clicar `Saldos OK, sem ajuste` ou `Confirmar e gerar ajustes`.

- **Tie-break visualization (P3 — F-04):** em wallets que receberam `expectedDelta` via tie-break proporcional (ADR-045), badge ao lado do delta esperado: `Distribuido proporcionalmente — [editar]`. Click no link 'editar' zera essa wallet e abre modal de redistribuicao manual entre wallets do mesmo site.

- **Formatacao currency (P12 — F-09):** segue locale `pt-BR` com simbolo internacional consistente em TODOS displays (dialog, banner orfao, summary, detalhes da sessao). Helper unico: `formatCurrency(amount: number, currency: 'USD'|'BRL'|'EUR'|'CNY', locale?: 'pt-BR'|'en-US'): string` em `client/src/lib/format.ts`. Saidas:
  - USD → `US$ 1.180,00`
  - BRL → `R$ 1.180,00`
  - EUR → `€ 1.180,00`
  - CNY → `¥ 1.180,00`

  Delta colorido: verde (>0), vermelho (<0), cinza (=0). Sinal explicito (+/-) sempre visivel exceto no openingBalance/expectedClosingBalance.

**Criterio de aceitacao:**
- [ ] Input pre-preenchido com `expectedClosingBalance` (nao `openingBalance`).
- [ ] Preview de `manualAdjustment` (nao mais `delta` cru) atualiza em tempo real.
- [ ] Banner de orfao aparece quando `orphanContribution.length > 0`, listando cada site com currency + amount.
- [ ] CTA `Cadastrar carteira agora` abre `/bankroll` em nova aba (desktop) ou modal in-place (mobile).
- [ ] Botao "Saldos OK, sem ajuste" submete payload com `reportedBalance = expectedClosingBalance` (manualAdjustment = 0) e grava snapshots.
- [ ] Link "Pular sem registrar" fecha dialog sem chamar endpoint de submit.
- [ ] Fechar via X / ESC / overlay = `Pular sem registrar` (sem snapshot, sem POST, telemetria `reconcile_skipped_user`).
- [ ] Hierarquia visual respeitada (primario solid / secundario outline / terciario link com aviso).
- [ ] Toggle `includeAll` preservado.
- [ ] Wallet com tie-break proporcional exibe badge `Distribuido proporcionalmente — [editar]`.
- [ ] `formatCurrency` usado consistentemente para todos valores monetarios visiveis.

---

### RF-06: Endpoint `POST /api/grind-sessions/:id/reconcile-wallets` (atualizado)

**Descricao:** Atualiza o handler para receber `reportedBalance` por wallet, calcular delta vs `expectedPreviousBalance`, criar `wallet_transactions` (preserva v1) e gravar `session_wallet_snapshots` (novo, RF-07).

**Regras de negocio:**
- Body:
  ```json
  {
    "adjustments": [
      {
        "walletId": "wal_xyz",
        "reportedBalance": 1247.50,
        "expectedPreviousBalance": 1180.00,
        "expectedDelta": 67.50
      }
    ],
    "skipReconciliation": false
  }
  ```
- Quando `skipReconciliation=true`: backend grava apenas `session_wallet_snapshots` para cada wallet com `closingBalance=NULL`, `manualAdjustment=NULL` (skip explicito do usuario, sem dados confiaveis). Nenhuma `wallet_transaction` criada. Resposta `{ snapshotsCreated: N, txCreated: [], skipped: N }`.
- Quando `skipReconciliation=false` (default), itera adjustments:
  - Para cada wallet, calcula:
    ```
    delta_total = reportedBalance - expectedPreviousBalance
    manualAdjustment = reportedBalance - (expectedPreviousBalance + expectedDelta)
                     = delta_total - expectedDelta
    ```
  - Cria `wallet_transactions`:
    - Se `|delta_total| < 0.01` → ignorado (consistente com epsilon da v1). Telemetria `reconcile_zero_delta` opcional.
    - Caso contrario, chama `walletService.recordTransaction` com:
      - `walletId`, `direction: delta_total > 0 ? 'in' : 'out'`, `nativeAmount: |delta_total|`
      - `reason: 'session_result'`, `source: 'auto_session'`, `sessionId`
      - `expectedPreviousBalance` (passa adiante para optimistic concurrency)
      - `note: 'Reconciliacao automatica fim de sessao'`
  - Grava `session_wallet_snapshots` (RF-07) para cada wallet (independente de delta zero ou nao).
- Atomicidade fail-fast por wallet (preservado da v1): se uma falha, anteriores permanecem persistidas; resposta carrega `txCreated[]` ate o erro + `failedAt: { walletId, error }`.
- Idempotencia (preservado da v1): preflight `SELECT 1 FROM wallet_transactions WHERE session_id = :id AND source='auto_session'`. Se existe → 409 `already_reconciled`.
- Resposta sucesso:
  ```json
  {
    "snapshotsCreated": 2,
    "txCreated": [{...}, {...}],
    "skipped": 0
  }
  ```

**Criterio de aceitacao:**
- [ ] `manualAdjustment` calculado server-side (autoritativo); cliente nao manda esse valor.
- [ ] `wallet_transactions` criada apenas quando `|delta_total| >= 0.01`.
- [ ] `session_wallet_snapshots` criada SEMPRE (uma por adjustment), exceto em `skipReconciliation=true` onde tambem cria mas com closingBalance/manualAdjustment NULL.
- [ ] Idempotencia: 2a chamada → 409 `already_reconciled` (preservado).
- [ ] Optimistic concurrency: `expectedPreviousBalance` divergente → 409 `balance_mismatch` (preservado).
- [ ] `skipReconciliation=true` cria snapshots NULL e nao cria txs.

---

### RF-07: Persistencia em `session_wallet_snapshots` (nova tabela)

**Descricao:** Cria nova tabela `session_wallet_snapshots` para capturar estado da banca por wallet por sessao. Pre-requisito da pagina de detalhes (RF-09).

**Regras de negocio:**
- Schema da nova tabela em `shared/schema.ts`:
  ```ts
  export const sessionWalletSnapshots = pgTable("session_wallet_snapshots", {
    id: varchar("id").primaryKey().notNull(),
    userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
    sessionId: varchar("session_id").notNull().references(() => grindSessions.id, { onDelete: "cascade" }),
    walletId: varchar("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
    nativeCurrency: varchar("native_currency", { length: 8 }).notNull(),
    openingBalance: decimal("opening_balance").notNull(),
    closingBalance: decimal("closing_balance"),         // null quando skipReconciliation=true
    expectedDelta: decimal("expected_delta").notNull(),
    manualAdjustment: decimal("manual_adjustment"),     // null quando skipReconciliation=true
    contributingTournamentIds: jsonb("contributing_tournament_ids").$type<string[]>().default([]),
    reason: varchar("reason").notNull().default("session_result"),
    walletTransactionId: varchar("wallet_transaction_id"), // FK opcional para a tx criada (null se delta zero ou skip)
    createdAt: timestamp("created_at").defaultNow(),
  }, (table) => [
    uniqueIndex("uq_session_wallet_snapshot").on(table.sessionId, table.walletId),
    index("idx_session_wallet_snapshots_user").on(table.userId, table.sessionId),
  ]);
  ```
- Migration via `drizzle-kit push` (alinhado com convencao do projeto — sem migration formal).
- Insert SEMPRE pelo handler `POST /reconcile-wallets`. Imutavel apos criacao (tentativas de UPDATE/DELETE devem falhar — convencao ledger ADR-017; sem trigger especifico, suficiente que ninguem implemente UPDATE).
- Unique constraint `(sessionId, walletId)` garante idempotencia adicional de snapshots: se ja existe row, segundo POST falha (alinhado com idempotencia geral RF-06).
- Zod insert schema obrigatorio em `shared/schema.ts`:
  ```ts
  export const insertSessionWalletSnapshotSchema = z.object({
    userId: z.string().min(1),
    sessionId: z.string().min(1),
    walletId: z.string().min(1),
    nativeCurrency: z.string().min(1).max(8),
    openingBalance: z.string().or(z.number()),
    closingBalance: z.string().or(z.number()).nullable().optional(),
    expectedDelta: z.string().or(z.number()),
    manualAdjustment: z.string().or(z.number()).nullable().optional(),
    contributingTournamentIds: z.array(z.string()).default([]),
    reason: z.literal("session_result").default("session_result"),
    walletTransactionId: z.string().nullable().optional(),
  }).strict();
  ```

**Criterio de aceitacao:**
- [ ] Tabela criada via `db:push`; teste de migration valida shape.
- [ ] Reconciliacao normal cria 1 row por wallet com todos campos preenchidos.
- [ ] `skipReconciliation=true` cria 1 row por wallet com `closingBalance=null` e `manualAdjustment=null`.
- [ ] Unique `(sessionId, walletId)` impede duplicatas.
- [ ] `walletTransactionId` populado quando ha tx criada; null quando `|delta_total| < 0.01`.
- [ ] `contributingTournamentIds` lista os ids dos torneios que contribuiram para o delta da wallet.

---

### RF-08: `SessionSummaryModal` recebe `sessionId` (correcao P3)

**Descricao:** Corrige bug P3. Adiciona `sessionId: activeSession?.id` ao objeto `summaryData` em `generateSessionSummary` (`GrindSessionLive.tsx:476-498`). Endurece `SessionSummaryModal.startCooldown` (linha 54-76) com early return + toast quando `sessionId` ausente.

**Regras de negocio:**
- `summaryData.sessionId` deve estar presente quando o summary eh aberto via fluxo normal (`activeSession.id` sempre disponivel nesse momento).
- `SessionSummaryModal.startCooldown`: se `summaryData.sessionId` for falsy, NAO chamar POST. Mostrar toast: "Sessao nao identificada. Tente recarregar a pagina." e nao alterar estado.
- Remover o fallback bugado que chama POST sem sessionId (linhas 65-68 atuais).
- Cooldown CTAs continuam funcionando normalmente quando `sessionId` presente.

**Criterio de aceitacao:**
- [ ] `summaryData.sessionId === activeSession.id` em runtime apos `generateSessionSummary`.
- [ ] `POST /api/cooldown-logs` chamado com `{sessionId, mode}` valido → server retorna 201 (nao mais 400).
- [ ] `summaryData.sessionId === undefined` → CTA cooldown nao chama endpoint, exibe toast.
- [ ] Teste de regressao: cooldown create funcionando com sessionId.

---

### RF-09: Pagina detalhes da sessao mostra snapshots

**Descricao:** Estende o edit modal de `SessionHistory` (preservar — nao criar rota nova) para exibir, quando `session_wallet_snapshots` tem rows pra essa sessao, uma nova aba/secao "Banca" com tabela `wallet | inicial | final | delta esperado | ajuste manual | reason`.

**Regras de negocio:**
- Endpoint novo `GET /api/grind-sessions/:id/wallet-snapshots`:
  - Auth: `requireAuth` + ownership.
  - Resposta:
    ```json
    {
      "sessionId": "ses_abc",
      "snapshots": [
        {
          "walletId": "wal_xyz",
          "walletName": "BlackChip Main",
          "platform": "WPN",
          "nativeCurrency": "USD",
          "openingBalance": 1180.00,
          "closingBalance": 1247.50,
          "expectedDelta": 67.50,
          "manualAdjustment": 0,
          "contributingTournamentIds": ["st_1", "st_2"],
          "reason": "session_result"
        }
      ]
    }
    ```
  - Quando sessao nao tem snapshots → resposta `{ sessionId, snapshots: [] }`.
- Componente `<SessionWalletSnapshotsTable>` em `client/src/components/session-history/`:
  - Renderiza apenas se `snapshots.length > 0`.
  - Cada linha: nome wallet (+ icone plataforma), opening, closing, expectedDelta (verde/vermelho), manualAdjustment (verde/vermelho/cinza), reason ("Reconciliacao automatica" / "Pulada").
  - Quando `closingBalance === null` (skip), exibe "—" em colunas closing/manualAdjustment + badge "Reconciliacao pulada".
- Edit modal atual de `SessionHistory` ganha tab nova "Banca" (Radix Tabs) ou secao expansivel (decidir no implementer; ambas aceitaveis). Tab so aparece quando `snapshots.length > 0`.

**Layout responsivo (P10 — F-10):** Em viewports < 640px (mobile), tabela colapsa em **cards verticais por wallet** (1 wallet = 1 card). Cada card mostra:
- Header: nome wallet + plataforma + currency badge
- Grid 2x2: `Inicial` / `Final` na primeira linha, `Delta esperado` / `Ajuste manual` na segunda linha
- Footer: `Reason` em texto livre (ocupa linha inteira)
- Badge `Pulada` (cinza) no header quando `closingBalance=null` (skip explicito).

Em viewports >= 640px (tablet/desktop), tabela completa com 6 colunas. Componente reutilizavel `<ResponsiveSnapshotRow>` em `client/src/components/grind-session-live/ResponsiveSnapshotRow.tsx`.

**Criterio de aceitacao:**
- [ ] Endpoint retorna snapshots da sessao do usuario; 404 se sessao nao for do usuario.
- [ ] Edit modal de `SessionHistory` exibe a nova secao quando snapshots existem.
- [ ] Tabela formatada conforme regras (cores, badges, "—" para nulls).
- [ ] Sem snapshots → secao nao aparece (sem espaco vazio).
- [ ] Viewport 375px renderiza cards verticais, sem scroll horizontal.
- [ ] Viewport 1024px renderiza tabela tradicional 6 colunas.
- [ ] Snapshot pulado mostra badge 'Pulada' no header do card.

---

### RF-10: Flag derivada `alertsSuspended`

**Descricao:** Expoe flag client-side `alertsSuspended` em `GrindSessionLive` que vale `true` enquanto qualquer modal terminal esta aberto. Sessao A (gestao de alarmes) consome via useEffect proprio.

**Regras de negocio:**
- Definicao:
  ```ts
  const alertsSuspended = showSessionSummary || showReconcileDialog || showConfirmationModal;
  ```
- Flag exposta como variavel local no scope do componente; sessao A pode adicionar `useEffect` que reage a ela sem que esta spec mexa em nada do gerenciamento de alarmes.
- **Trade-off resolvido por RF-01 (P4 — F-06):** botao 'Continuar Sessao' removido do summary modal pos-PUT. Reset de alarmes em `endSessionMutation.onSuccess` agora e seguro — nao ha caminho de UX onde founder volta para grind ativo apos reset. Caso founder queira continuar grindando, deve iniciar nova sessao via `/grind` (acao deliberada, sem perda silenciosa).

**Criterio de aceitacao:**
- [ ] `alertsSuspended` declarada e disponivel no scope do componente.
- [ ] Valor reativo aos 3 estados (testavel via render).
- [ ] Limitacao "continuar sessao apos reset perde alarmes" documentada.

---

### RF-11: Telemetria expandida (12 eventos)

**Descricao:** Implementa 12 eventos no telemetry adapter existente.

**Regras de negocio:**

| Evento | Quando | Payload |
|---|---|---|
| `session_finalize_clicked` | User clica "Finalizar Sessao" durante grind ativo | `{ sessionId, origin: 'confirmation_modal' \| 'direct' }` |
| `confirmation_modal_skipped` | ConfirmationModal pulado (P5 — F-05): sem pendentes | `{ sessionId, pendingCount: 0 }` |
| `session_completed` | PUT `/api/grind-sessions/:id` retorna 200 | `{ sessionId, durationMinutes, profit, volume }` |
| `reconcile_disambiguation_choice` | User escolhe opcao no step de desambiguacao (RF-13) | `{ sessionId, site, choice: 'single'\|'proportional'\|'custom', walletId? }` |
| `reconcile_dialog_opened` | `WalletReconciliationDialog` monta apos GET reconcilable-wallets | `{ sessionId, walletsCount, hadActivityCount, orphanCurrencies: string[] }` |
| `reconcile_skipped_no_wallets` | RF-04 retorna `wallets: []` (sem wallets elegiveis) | `{ sessionId }` |
| `reconcile_skipped_user` | User clica "Pular sem registrar" / X / ESC / overlay (P1 — F-01) | `{ sessionId, walletsCount, via: 'button'\|'x'\|'esc'\|'overlay' }` |
| `reconcile_submitted` | POST `/reconcile-wallets` retorna 2xx | `{ sessionId, snapshotsCreated, txCreated, skipped, totalManualAdjustmentUsdEstimate? }` |
| `reconcile_failed` | POST `/reconcile-wallets` retorna 4xx/5xx | `{ sessionId, errorCode, httpStatus, failedAtWalletId? }` |
| `cooldown_started_from_summary` | User clica CTA cooldown no summary, POST cooldown-logs OK | `{ sessionId, mode: 'full' \| 'quick' }` |
| `cooldown_create_failed` | POST cooldown-logs falha | `{ sessionId, httpStatus, errorMessage }` |
| `summary_finalize_clicked` | User clica "Finalizar Sessao" no summary (skip cooldown) | `{ sessionId }` |

- `totalManualAdjustmentUsdEstimate` opcional (nao bloqueia evento se conversao falhar).
- Sem PII: nenhum payload contem `note`, `walletName`, `platform`. Apenas IDs.
- Telemetria desabilitada por feature flag respeitada (preservar comportamento atual).

**Criterio de aceitacao:**
- [ ] 12 eventos disparam exatamente nos momentos corretos.
- [ ] Payloads sem PII.
- [ ] Sem dependencia de import circular (telemetry adapter ja existente).
- [ ] `reconcile_skipped_user.via` distingue origem (button/x/esc/overlay).
- [ ] `confirmation_modal_skipped` dispara apenas quando `pendingCount === 0`.

---

### RF-12: Mapeamento de erros cooldown 400 → mensagem humana

**Descricao:** No client, traduzir respostas de erro do POST `/api/cooldown-logs` em mensagens em PT-BR usando o `errorMessage` ou `issues[0].message` quando disponivel.

**Regras de negocio (P8 — F-07):**

| Status | Cenario | Mensagem PT-BR |
|--------|---------|----------------|
| 400 | sessionId ausente/invalido | "Sessao invalida ou expirada. Recarregue a pagina." |
| 400 | mode invalido | "Tipo de cool-down nao reconhecido. Tente novamente." |
| 401 | token expirado | "Sessao expirada. Faca login novamente." (+ redirect /login apos 3s) |
| 404 | sessao deletada noutra aba | "Sessao nao encontrada. Pode ter sido removida noutra aba. Voltando para /grind..." (+ redirect) |
| 409 | cooldown ja iniciado | "Cool-down ja iniciado para esta sessao. Continuando..." (+ navegar pra cool-down existente) |
| 429 | rate limit | "Muitas tentativas. Aguarde 1 minuto e tente novamente." |
| 5xx | erro servidor | "Erro no servidor. Sua sessao foi salva, mas o cool-down nao iniciou. Tente em alguns minutos." |
| Network | offline/timeout | "Sem conexao. Verifique sua internet e tente novamente." |

- Telemetria `cooldown_create_failed` (RF-11) dispara em todos os casos.

**Criterio de aceitacao:**
- [ ] Mensagens distintas por codigo HTTP / issue conforme tabela.
- [ ] Toast nao expoe stack trace nem JSON cru ao usuario.
- [ ] Telemetria captura status + message original.
- [ ] 401 redireciona para `/login` apos 3s.
- [ ] 404 redireciona para `/grind`.
- [ ] 409 navega para cool-down existente (le `existingId` da resposta quando disponivel).

---

### RF-13: Step de desambiguacao quando 2+ wallets do mesmo site

**Descricao (P3 — F-04):** Quando `mapSiteToWallet` retorna 2+ wallets candidatas para o mesmo site (ex: 2 wallets BlackChip), exibir step extra ANTES do dialog principal de reconciliacao perguntando como atribuir `expectedDelta`.

**Regras de negocio:**
- Step aparece apenas se ALGUM site da sessao tem 2+ wallets candidatas. Se todos sites tem 0 ou 1 wallet, pula step.
- Cada site ambiguo gera uma secao com 4 opcoes:
  - [ ] Wallet A (saldo atual)
  - [ ] Wallet B (saldo atual)
  - [x] Distribuir proporcionalmente (default, ADR-045)
  - [ ] Personalizado (eu defino na proxima tela)
- User escolhe wallet unica → `expectedDelta` total vai pra ela; outras wallets do mesmo grupo recebem `expectedDelta=0` mas continuam aparecendo no dialog para `reportedBalance` (founder confirma que nao mudaram).
- User escolhe proporcional ou personalizado → segue logica padrao do RF-03.
- Step pulavel via botao 'Continuar com default' (mesmo que 'Distribuir proporcionalmente').
- Snapshot do step persistido em telemetria `reconcile_disambiguation_choice` com payload `{ site, choice: 'single'|'proportional'|'custom', walletId? }`.

**Criterio de aceitacao:**
- [ ] 1 wallet por site → step nao aparece.
- [ ] 2+ wallets para 1 site → step aparece com opcoes.
- [ ] Escolha 'wallet unica' → outras wallets do site recebem expectedDelta=0.
- [ ] Escolha 'proporcional' default → segue ADR-045.
- [ ] Skip do step via 'Continuar' → equivale a proporcional default.
- [ ] Telemetria registra escolha.

---

### RF-14: Input UX para `reportedBalance` (mobile + desktop)

**Descricao (P9 — F-08):** Especificar comportamento do input numerico de saldo final por wallet, garantindo usabilidade em mobile (teclado virtual, virgula vs ponto) e desktop (Tab/Enter navigation).

**Regras de negocio:**
- `inputMode='decimal'` em todos inputs (teclado numerico mobile com separador decimal apropriado por OS).
- Aceita ambos `.` e `,` como separador decimal — parser sanitiza antes de converter para number (substitui `,` por `.`).
- Mascara visual respeita locale `pt-BR`:
  - USD: `US$ 1.247,50`
  - BRL: `R$ 1.247,50`
  - EUR: `€ 1.247,50`
  - CNY: `¥ 1.247,50`
- Precisao: 2 casas decimais para fiat. Valores com mais casas truncados/bloqueados pelo input.
- Foco inicial: primeiro input numerico ao abrir dialog.
- Tab / Enter avanca para proximo input. Enter no ultimo input dispara submit (se valid).
- Helper `formatCurrency(amount, currency, locale='pt-BR')` em `client/src/lib/format.ts` (compartilhado com RF-09).

**Criterio de aceitacao:**
- [ ] Mobile (320px e 375px viewports): inputs nao quebram layout, teclado numerico abre, label visivel acima do input.
- [ ] Digitar `1247,50` no input USD → parser converte para `1247.50` antes de calcular delta.
- [ ] Tab navega entre inputs em ordem visual.
- [ ] Enter no ultimo input dispara submit do dialog se todos inputs validos.
- [ ] Mascara exibe simbolo correto por currency em tempo real.

---

## Requisitos Nao-Funcionais

- **Performance:** Endpoint `GET /reconcilable-wallets` deve responder em < 300ms p95 mesmo com 50+ `session_tournaments` na sessao. Helper `calculateExpectedDeltaPerWallet` eh O(N*W) onde N = torneios e W = wallets. Tipico: N<30, W<10.
- **Atomicidade:** `POST /reconcile-wallets` mantem fail-fast por wallet (preservado da v1). Se uma wallet falha, anteriores permanecem persistidas. Cliente reflete isso na UI (linhas concluidas ficam disabled).
- **Concorrencia:** Optimistic concurrency via `expectedPreviousBalance` reusada (ADR-038). Race entre `endSessionMutation` e abertura do dialog mitigada pelo preflight de idempotencia em RF-04.
- **Idempotencia:** Preservada da v1 (RF-08 v1 → RF-06 v2). Adiciona unique constraint `(sessionId, walletId)` em `session_wallet_snapshots` como camada extra.
- **Disponibilidade:** Falha do endpoint `GET /reconcilable-wallets` NAO bloqueia o fluxo: cliente exibe toast e segue direto pra summary (preservado de `runSessionEndFlow`).
- **i18n:** Toda copy nova em PT-BR. Codigo/identificadores em ingles.
- **Rate limit:** `walletLimiter` reusado em `POST /reconcile-wallets` (preservado da v1).

---

## Casos de Erro

### Cenario A: 0 wallets elegiveis (sessao sem session_tournaments finalizados)
- GET retorna `wallets: []`.
- Telemetria: `reconcile_skipped_no_wallets`.
- Cliente: dialog NAO abre, `setLocation('/grind')` direto apos summary.
- Decisao: nao mostrar dialog mesmo com `includeAll=true`. Razao: usuario nao tem o que reconciliar (nada se passou).

### Cenario B: 1 wallet elegivel
- GET retorna `wallets: [{...}]`, `expectedDelta` calculado.
- Dialog abre com 1 linha. Fluxo padrao.

### Cenario C: N wallets, varios sites
- GET retorna N wallets, cada uma com seu `expectedDelta`.
- Dialog renderiza N linhas. Submit em batch.

### Cenario D: 2 wallets ativas, mesmo site (caso real founder — 2 wallets BlackChip)
- `mapSiteToWallet('BlackChip', wallets)` retorna ambas.
- Tie-break proporcional ao saldo distribui `expectedDelta` (RF-03).
- Dialog mostra ambas linhas com `expectedDelta` distribuido. Founder pode editar `reportedBalance` independente em cada.
- ADR-045 documenta a politica de tie-break.

### Cenario E: Wallet archived durante a sessao
- Wallet teve atividade em `session_tournaments` (via site mapeado), mas foi archived antes de `endSession`.
- `mapSiteToWallet` ignora wallets archived.
- Contribuicoes da wallet archived caem em `orphanContribution` (mesmo que seja a "unica" wallet do site).
- Dialog mostra banner orfao informando.
- Decisao: nao reabrir wallet automaticamente. Usuario decide se cria nova wallet ou ignora.

### Cenario F: 409 `balance_mismatch` (race entre abas)
- Outra aba registra deposito em uma wallet → `wallet.balance` muda.
- Cliente envia `expectedPreviousBalance` antigo → backend rejeita com 409.
- Cliente refetch GET reconcilable-wallets → recalcula `expectedDelta` e `expectedClosingBalance` com novo opening → dialog remonta com `reportedBalance` digitado preservado mas `manualAdjustment` recomputado.
- Telemetria: `reconcile_failed` com `errorCode='balance_mismatch'`.

### Cenario G: 409 `already_reconciled` (idempotencia)
- 2a chamada de POST → 409.
- Cliente fecha dialog + toast "Sessao ja reconciliada anteriormente" + `setLocation('/grind')`.
- Telemetria: `reconcile_failed` com `errorCode='already_reconciled'`.

### Cenario H: GET reconcilable-wallets falha (5xx ou network)
- Cliente: toast "Nao foi possivel carregar carteiras" + `setLocation('/grind')` direto.
- Sem telemetria (erro de rede gera ruido).

### Cenario I: PUT grind-sessions falha
- `endSessionMutation` retorna erro → handler atual de erro (toast).
- Reset de alarmes NAO acontece. Summary NAO abre.
- Sessao permanece em `status='active'`. Usuario pode tentar de novo.

### Cenario J: POST cooldown-logs falha (400 Required, 401, 409, 500)
- Cliente RF-12 mapeia codigo → mensagem humana.
- Telemetria: `cooldown_create_failed`.
- Summary modal continua aberto. Usuario pode tentar outro CTA ou skip cooldown.

### Cenario K: Conversao de moeda sem rate disponivel
- `exchangeRates[wallet.nativeCurrency]` ausente.
- Helper retorna `expectedDelta=0` para essa wallet (deterministico ADR-033).
- Telemetria: evento separado `currency_conversion_skipped` (opcional).
- Dialog ainda abre; usuario reporta saldo manualmente (verdade de campo).

### Cenario L: Sessao com `session_tournaments` em currency desconhecida
- Site nao tem default currency em `SITE_DEFAULT_CURRENCY` e `tournament.currency` nao existe (campo nao implementado hoje).
- Helper assume USD como fallback (consistente com convencao default do projeto, ja que maioria dos sites internacionais opera em USD).
- Documentar em ADR como assumption explicita; futuro pode adicionar coluna `currency` em `session_tournaments`.

---

## API Delta

### Endpoint atualizado: `GET /api/grind-sessions/:id/reconcilable-wallets`

Substitui implementacao atual de `storage.listReconcilableWallets`.

**Auth:** `requireAuth` + ownership.
**Query:** `?includeAll=true|false` (default false).
**Resposta 200 (com wallets):**
```json
{
  "sessionId": "ses_abc",
  "alreadyReconciled": false,
  "wallets": [
    {
      "walletId": "wal_xyz",
      "name": "BlackChip Main",
      "platform": "WPN",
      "nativeCurrency": "USD",
      "openingBalance": 1180.00,
      "expectedPreviousBalance": 1180.00,
      "expectedDelta": 67.50,
      "expectedClosingBalance": 1247.50,
      "contributingTournaments": ["st_1", "st_2"],
      "hadActivityInSession": true
    }
  ],
  "orphanContribution": [
    { "site": "BodogPlay", "currency": "BRL", "amount": 12.50 }
  ]
}
```
**Resposta 200 (already reconciled):**
```json
{
  "sessionId": "ses_abc",
  "alreadyReconciled": true,
  "wallets": [],
  "orphanContribution": []
}
```
**Erros:** 404 sessao inexistente / nao do usuario.

### Endpoint atualizado: `POST /api/grind-sessions/:id/reconcile-wallets`

**Body:**
```json
{
  "adjustments": [
    {
      "walletId": "wal_xyz",
      "reportedBalance": 1247.50,
      "expectedPreviousBalance": 1180.00,
      "expectedDelta": 67.50
    }
  ],
  "skipReconciliation": false
}
```

**Resposta 200:**
```json
{
  "snapshotsCreated": 1,
  "txCreated": [
    {"id": "tx_1", "walletId": "wal_xyz", "direction": "in", "nativeAmount": 67.50, ...}
  ],
  "skipped": 0
}
```

**Resposta 200 (skipReconciliation):**
```json
{
  "snapshotsCreated": 2,
  "txCreated": [],
  "skipped": 0,
  "skippedByUser": true
}
```

**Erros (preservados da v1):**
- 400 `empty_adjustments`, `duplicate_wallet`, `missing_expected_balance`
- 404 sessao/wallet inexistente
- 409 `already_reconciled`, `balance_mismatch`
- 422 `wallet_archived`, `invalid_reported_balance`

### Endpoint novo: `GET /api/grind-sessions/:id/wallet-snapshots`

**Auth:** `requireAuth` + ownership.
**Resposta 200:**
```json
{
  "sessionId": "ses_abc",
  "snapshots": [
    {
      "walletId": "wal_xyz",
      "walletName": "BlackChip Main",
      "platform": "WPN",
      "nativeCurrency": "USD",
      "openingBalance": 1180.00,
      "closingBalance": 1247.50,
      "expectedDelta": 67.50,
      "manualAdjustment": 0.00,
      "contributingTournamentIds": ["st_1", "st_2"],
      "reason": "session_result"
    }
  ]
}
```
**Erros:** 404 sessao inexistente / nao do usuario.

### Endpoints inalterados

- `PUT /api/grind-sessions/:id` continua funcionando como hoje. Apenas o callback `onSuccess` no client passa a fazer reset alarmes + open summary in-place (RF-01).
- `POST /api/cooldown-logs` continua aceitando o mesmo schema. Apenas o cliente passa a enviar `sessionId` corretamente (RF-08).
- `POST /api/wallets/:id/transactions` continua aceitando o mesmo schema; nao usado por este flow.

---

## Modelos de Dados Afetados

### Nova tabela: `session_wallet_snapshots`

Criada via `db:push` (sem migration formal, alinhado com convencao do projeto).

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | varchar | PK, notNull | nanoid |
| `userId` | varchar | notNull, FK users | cascade delete |
| `sessionId` | varchar | notNull, FK grindSessions | cascade delete |
| `walletId` | varchar | notNull, FK wallets | cascade delete |
| `nativeCurrency` | varchar(8) | notNull | snapshot da currency da wallet no momento |
| `openingBalance` | decimal | notNull | balance da wallet ao iniciar reconciliacao |
| `closingBalance` | decimal | nullable | balance final reportado; null quando skip |
| `expectedDelta` | decimal | notNull | derivado de session_tournaments |
| `manualAdjustment` | decimal | nullable | diff entre reported e expected; null quando skip |
| `contributingTournamentIds` | jsonb | default `[]` | ids de session_tournaments que contribuiram |
| `reason` | varchar | notNull, default `'session_result'` | extensivel para outros motivos no futuro |
| `walletTransactionId` | varchar | nullable | FK opcional para tx criada |
| `createdAt` | timestamp | defaultNow | imutavel |

**Indices:**
- `uniqueIndex("uq_session_wallet_snapshot").on(sessionId, walletId)` — idempotencia.
- `index("idx_session_wallet_snapshots_user").on(userId, sessionId)` — query por user.

**Imutabilidade:** convencao ledger ADR-017. Sem trigger. Implementer NAO escreve handler de UPDATE/DELETE.

### Tabelas nao alteradas

- `wallets`, `wallet_transactions`, `bankroll_snapshots`, `grind_sessions`, `session_tournaments`, `cooldown_logs` — sem alteracao de schema.
- `wallet_transactions.source` ja contem `'auto_session'` (Sprint Bankroll-2 RF-05). Reusa.

---

## Migracao

- `drizzle-kit push` cria `session_wallet_snapshots` na DB.
- Sessoes pre-existentes nao tem snapshots — RF-09 lida com `snapshots: []` graceful (secao "Banca" nao aparece). Nenhum back-fill necessario.
- Migrations existentes nao precisam ser revisitadas.
- Codigo bugado existente (`storage.listReconcilableWallets`, `runSessionEndFlow`, `generateSessionSummary`) sera substituido in-place. Sem feature flag — bug atual ja torna funcionalidade nao-utilizavel; rollout direto.

---

## Plano de Testes

### Testes unitarios (helpers puros)

1. **`calculateExpectedDeltaPerWallet`** (server, novo arquivo `server/services/walletReconciliation.test.ts`):
   - 1 torneio, 1 wallet, mesma currency → delta correto.
   - N torneios mesmo site → delta agregado.
   - 1 site, 2 wallets (tie-break proporcional) → distribuicao correta.
   - 1 site, 2 wallets, ambos balance 0 → distribuicao igualitaria.
   - Site sem wallet → delta vai para `orphanContribution`.
   - Currency mismatch (USD → BRL) → conversao via `exchangeRates`.
   - `exchangeRates` invalido → delta = 0 deterministico.
   - Torneio com `status != 'finished'` → ignorado.
   - Torneio com `addOnTaken=true` → soma `addOnCost`.
   - Torneio com `rebuys > 0` → soma `buyIn * rebuys`.

2. **`mapSiteToWallet`** (server):
   - Match exato 1-1.
   - Match com alias case-insensitive (`BlackChip` → `WPN`).
   - 0 matches → `[]`.
   - 2 matches ambas ativas → ambas retornadas.
   - Wallet archived com platform que bate → ignorada.

3. **`convertToNativeCurrency`** (server, helper auxiliar):
   - USD → BRL com rate valido.
   - BRL → USD (inversao).
   - Same currency → no-op.
   - Rate ausente → 0.
   - Rate invalido (NaN/0/negativo) → 0.

### Testes de integracao (server)

4. **Endpoint `GET /reconcilable-wallets`**:
   - Sessao com `session_tournaments` finalizados em 1 wallet → response com 1 wallet matched.
   - Sessao sem `session_tournaments` → response `wallets: []`.
   - Sessao em site sem wallet correspondente → wallets vazia, `orphanContribution > 0`.
   - 2 wallets mesmo site → ambas listadas com delta proporcional.
   - `alreadyReconciled` quando ja existe tx `auto_session` → response `alreadyReconciled: true`.
   - Wallet archived com atividade → nao aparece na lista, contribuicao vai pra orfao.

5. **Endpoint `POST /reconcile-wallets`** (atualizado):
   - Submit com adjustments validos → cria N txs + N snapshots.
   - `skipReconciliation: true` → cria N snapshots com nulls + 0 txs.
   - Idempotencia: 2a chamada → 409 `already_reconciled` (preservar testes da v1).
   - Optimistic concurrency: `expectedPreviousBalance` divergente → 409 `balance_mismatch`.
   - Wallet archived → 422 (preservar).
   - Snapshots tem `walletTransactionId` correto quando ha tx.

6. **Endpoint `GET /wallet-snapshots`**:
   - Sessao com snapshots → retorna lista.
   - Sessao sem snapshots → `snapshots: []`.
   - Sessao de outro user → 404.

### Testes de integracao (client)

7. **`runSessionEndFlow` refatorado** (atualiza testes existentes em `session-end-flow.test.ts`):
   - Fluxo deve mudar: PUT 200 → reset alarmes (mock) → summary in-place. Sem `setLocation` direto.
   - Cooldown CTA chama POST com `sessionId` correto.
   - Summary "Finalizar Sessao" → abre dialog se wallets > 0.
   - Summary "Finalizar Sessao" → `setLocation('/grind')` se wallets === 0.
   - Reconcile dialog skip → `setLocation('/grind')` sem POST.

8. **`SessionSummaryModal` startCooldown**:
   - `summaryData.sessionId` presente → POST OK → callback fired.
   - `summaryData.sessionId` ausente → toast + nao chama POST.
   - 400 `sessionId required` → toast PT-BR (RF-12).

9. **Edit modal de `SessionHistory`**:
   - Sessao com snapshots → secao "Banca" aparece.
   - Sessao sem snapshots → secao nao aparece.
   - Snapshot com `closingBalance: null` → exibe "—" + badge "Pulada".

### Testes de regressao

10. **Bug P1 (dialog nao aparece)**: cenario E2E ou integracao mockada — sessao real com `session_tournaments` finalizados em wallet `BlackChip` deve abrir dialog (red phase: teste atual passa com fix do RF-04).
11. **Bug P2 (summary redirect)**: ao chamar callback `onSuccess` da `endSessionMutation`, NAO chama `setLocation('/grind')` (red: assercao mock).
12. **Bug P3 (cooldown 400)**: `summaryData.sessionId` definido apos `generateSessionSummary` (red: snapshot do objeto).

### Testes de migration

13. **`session_wallet_snapshots` schema**: drizzle-kit push em DB de teste; assert tabela existe com indices unique + composite.

---

## Out-of-scope

Itens explicitamente fora desta spec (podem virar specs futuras):

- **Criar `wallet_transactions` automaticamente ao registrar buy-in/payout** durante a sessao. Mudanca grande que afeta `session_tournaments`, `walletService`, e o csvParser. Quando isso for feito, esta spec se torna parcialmente redundante — mas trade-off favorece a v2 hoje, pois a derivacao server-side e estavel sem mudar o registro.
- **Cross-wallet rebalancing** dentro do dialog (mover saldo de uma wallet pra outra) — fora.
- **Importacao automatica de saldo via API da sala** — fora (sem fonte automatizada hoje).
- **Reabrir sessao concluida e re-reconciliar** — fora; idempotencia bloqueia.
- **Editar snapshots apos criados** — fora; ledger imutavel.
- **OCR de screenshot da sala** — vetado por memory rule.
- **Notificacao push se delta orfao acumulado for grande** — fora.
- **Dashboard agregado de reconciliacao** (% sessoes ajustadas, delta medio) — possivel sprint futura.
- **Suporte a v1 de bankroll** (`/api/bankroll/snapshot`, `BankrollMovementDialog`) — em deprecation; ignorar.
- **Adicionar coluna `currency` em `session_tournaments`** para evitar fallback via `SITE_DEFAULT_CURRENCY` — possivel sprint futura.
- **CRUD generico de `wallet_transactions`** (delete/edit) — fora; outra spec.

---

## Dependencias

- **Sprint Bankroll-2** (multi-wallet v2) — entregue (`69c03c7`). Provem `walletService.recordTransaction`, `wallet_transactions`, `bankroll_snapshots`.
- **Sprint Bankroll-2.1** (Reportar saldo + ADR-038) — entregue (`3c31b28`). Optimistic concurrency obrigatorio.
- **ADR-033** (FX convention) — provem semantica de `exchangeRates`.
- **ADR-017** (ledger imutavel) — provem semantica de imutabilidade aplicada a `session_wallet_snapshots`.
- **Sprint Cooldown-3** (Coach AI integration) — convive sem conflito; testes nao podem quebrar `cooldown_logs` schema.
- **Sessao A** (gestao de alarmes) — coordenacao via contrato definido na secao "Contrato com Sessao A". Esta spec NAO modifica `sessionAlertManagerRef`, `genericAlerts`, `firedGenericAlerts`, `activeAlertCount`, `refreshAlertState`, `AlertsPanel`, hooks antes da linha 1132 em `GrindSessionLive.tsx`, ou o interval `checkAlerts` (linhas 928-1007). Adiciona apenas: reset em `endSessionMutation.onSuccess` + flag derivada `alertsSuspended`.

---

## Contrato com Sessao A (mediacao)

**NAO MODIFICAR (controlado por Sessao A):**
- `sessionAlertManagerRef`
- Estados `genericAlerts`, `firedGenericAlerts`, `activeAlertCount`
- Funcao `refreshAlertState`
- Componente `AlertsPanel` (props/internas)
- Hooks declarados antes da linha 1132 em `GrindSessionLive.tsx`
- Interval `checkAlerts` (linhas 928-1007)

**FAZER (controlado por esta spec):**
- Adicionar callback de reset de alarmes em `endSessionMutation.onSuccess`. Reset = `sessionAlertManagerRef.current.reset(); setGenericAlerts([]); setFiredGenericAlerts([]); setActiveAlertCount(0);`. Sequer altera funcoes — apenas chama API publica.
- Expor `alertsSuspended` como variavel local derivada (`showSessionSummary || showReconcileDialog || showConfirmationModal`).
- NUNCA editar definicao das funcoes/refs listadas acima.

---

## Rollout

- **Sem feature flag.** Bug atual (P1+P2+P3) torna o flow ja inutilizavel; rollout direto e mais seguro do que manter dois caminhos coexistindo.
- **Ordem de implementacao sugerida** (segue pipeline TDD do projeto):
  1. test-writer escreve testes red para RF-02, RF-03, RF-04, RF-06, RF-07, RF-08.
  2. implementer cria tabela `session_wallet_snapshots` via `db:push` (RF-07).
  3. implementer escreve helpers puros `calculateExpectedDeltaPerWallet`, `mapSiteToWallet`, `convertToNativeCurrency` (RF-02, RF-03).
  4. implementer atualiza `storage.listReconcilableWallets` para usar os helpers (RF-04).
  5. implementer atualiza handler `POST /reconcile-wallets` (RF-06).
  6. implementer cria handler `GET /wallet-snapshots` (RF-09).
  7. implementer corrige `generateSessionSummary` (sessionId) e endurece `SessionSummaryModal` (RF-08, RF-12).
  8. implementer refatora `handleEndSession` + adiciona reset alarmes em `endSessionMutation.onSuccess` (RF-01).
  9. implementer atualiza `WalletReconciliationDialog` para o novo payload (RF-05).
  10. implementer estende `SessionHistory` edit modal (RF-09).
  11. implementer adiciona telemetria (RF-11).
  12. implementer adiciona flag `alertsSuspended` (RF-10).
  13. /simplify pos-impl.
  14. reviewer.
- **Pos-merge**: monitorar telemetria por 1 semana. Metricas-chave:
  - Taxa de `reconcile_dialog_opened` / `session_completed`. Esperado > 50% (sessoes com pelo menos 1 torneio finalizado em wallet mapeada).
  - Taxa de `reconcile_failed` com `errorCode='balance_mismatch'`. Esperado < 1%.
  - Taxa de `cooldown_create_failed`. Esperado near-zero (P3 corrigido).
  - Taxa de `reconcile_skipped_user`. Acima de 30% = repensar UX (input pre-preenchido deveria reduzir skip).

---

## Notas de Implementacao

- **`SITE_ALIASES` e `SITE_DEFAULT_CURRENCY`** centralizadas em `server/services/walletReconciliation.ts`. Nao espalhar pelo csvParser nem por outros services.
- **ADR-045** (`Docs/architecture/decisions/045-session-end-wallet-tie-break.md`): "session-end reconciliation: site-to-wallet tie-break policy". Documenta a regra de distribuicao proporcional + fallback igualitario.
- **ADR-046** (`Docs/architecture/decisions/046-session-wallet-snapshots-table.md`): "session-wallet-snapshots table". Documenta schema + imutabilidade + uso da tabela como fonte primaria de idempotencia em RF-04.
- **Imutabilidade de snapshots:** sem trigger, sem RLS. Convencao + ausencia de handlers UPDATE/DELETE eh suficiente. Documentar em `lessons-learned.md` se algum implementer tentar criar PATCH no futuro.
- **`runSessionEndFlow` continua existindo?** Decisao: reduzir o escopo da funcao, mas preservar a abstracao para o caso "Finalizar Sessao no summary". A funcao passa a:
  ```
  fetchReconcilable → if alreadyReconciled toast + setLocation; if wallets empty setLocation; else openReconcileDialog → setLocation
  ```
  Sem mais `completeSession`, sem mais `openSummaryModal`. Esses migram para `endSessionMutation.onSuccess` (RF-01) e summary CTA "Finalizar Sessao" (RF-04 implicito).
- **Compat com testes existentes:** os testes red-phase existentes para `runSessionEndFlow` (em `tests/unit/grind-session-live/session-end-flow.test.ts` se existir) precisam ser atualizados conforme novo contrato. Test-writer responsavel por essa atualizacao.
- **Sequence diagram:** test-writer ou system-architect criam (ou atualizam) sequence diagram em `Docs/architecture/flows/grind/sequence-session-end-reconciliation-v2.mermaid` antes da implementacao. Esse diagrama eh a referencia visual do fluxo correto.

---

## Q&A Interno (decisoes do founder)

- **Q1:** Por que o `expectedClosingBalance` pre-calculado e nao deixar usuario preencher do zero (v1)?
  **R:** Reduz friccao. Quando registro durante a sessao foi consistente (caso comum), usuario apenas confere e clica "Confirmar". Quando ha divergencia, valor preenchido expoe imediatamente o ajuste manual em destaque. UX favoravel.

- **Q2:** Por que tabela nova `session_wallet_snapshots` e nao JSON em `grind_sessions.sessionSnapshot`?
  **R:** Snapshot por wallet eh pluralidade — 1 sessao tem N rows. JSON nested complica queries de auditoria ("liste sessoes com manualAdjustment > X em wallet Y"). Tabela normalizada eh trivial via drizzle-kit, sem custo proibitivo.

- **Q3:** Por que reset de alarmes em `onSuccess` e nao no inicio de `runSessionEndFlow`?
  **R:** Consistencia > timing. Se reset acontece antes do PUT confirmar, alarmes podem reaparecer caso PUT falhe. Se acontece em `onSuccess`, garante: status no servidor = completed E alarmes resetados juntos. Se PUT falha, sessao continua ativa, alarmes continuam ativos. Comportamento correto.

- **Q4:** Por que summary in-place e nao redirect direto?
  **R:** Founder quer ver resumo da sessao + escolher o que fazer (cooldown ou skip). Redirect direto pula essa decisao. Bug P2 introduzido por engano em sprint anterior.

- **Q5:** Como tratar 2 wallets BlackChip (caso real founder)?
  **R:** Tie-break proporcional ao saldo (RF-03). Founder pode ajustar manualmente cada `reportedBalance`. Alternativas (round-robin, primeira por createdAt) descartadas — proporcional captura intuicao "wallet maior teve a maior parte do volume".

- **Q6:** Por que ainda manter botao "Pular reconciliacao" depois de tudo isso?
  **R:** Founder pode estar com pressa, sem ver os saldos das salas no momento. Skip preserva fluxo sem forcar dado errado. Snapshot null documenta o skip — auditoria futura sabe que sessao foi pulada.

- **Q7:** `cooldown_create_failed` mapeado para mensagem humana — por que nao logar e seguir?
  **R:** Founder precisa saber que cooldown nao iniciou. Caso contrario clica e nada acontece, fica confuso. Toast PT-BR + telemetria = transparencia.

- **Q8:** `expectedDelta` baseado em `session_tournaments` ignora rakeback / fee da sala / bonus surpresa. Como tratar?
  **R:** Sao casos onde `manualAdjustment != 0`. Founder digita o saldo real, sistema calcula o adjustment, registra como tx normal. Nao tentamos modelar todas fontes — confiamos na verdade de campo do jogador, que captura tudo.

- **Q9:** Currency unknown (SITE_DEFAULT_CURRENCY ausente) → fallback USD. E se site e BRL real (PokerStars.BR futuro)?
  **R:** Adicionar entrada em `SITE_DEFAULT_CURRENCY`. Fallback USD eh apenas para sites nao mapeados — tratar caso a caso quando aparecer.

- **Q10:** Por que esta v2 substitui v1 e nao apenas adiciona patches?
  **R:** v1 tem 3 RFs implementadas parcial/quebrado: RF-02 (listagem), RF-04 (submit), e o fluxo de `runSessionEndFlow`. Os bugs decorrem de premissa errada (wallet_transactions.sessionId esta populado durante sessao). Spec v2 inverte premissa e adiciona escopo (snapshots por sessao + detalhes da sessao + telemetria expandida + reset alarmes + sessionId em summary). Patch incremental seria mais confuso de revisar; v2 facilita audit.
