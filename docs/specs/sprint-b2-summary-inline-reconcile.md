# Spec: Sprint B2 — Summary Inline Reconcile + Setting + Bug Fixes

## Status
Proposta

## Predecessora e Motivacao para B2

Sprint B (commit `21fca11`) entregou a v2 da reconciliacao de banca (ver `Docs/specs/session-end-reconciliation-v2.md`): tabela `session_wallet_snapshots`, derivacao server-side de `expectedDelta`, mapeamento Suprema → wallets, 9 eventos de telemetria. QA real do founder revelou 6 problemas operacionais que a B2 enderecaa.

A B2 **nao reabre** premissas da B (derivacao server-side, ledger, optimistic concurrency, snapshot imutavel — tudo mantido). A B2 **reorganiza UX** (reconcile vira inline no summary), **adiciona setting** (`bankrollManagementEnabled`), **expande eligibility de wallets** (todas plataformas jogadas, nao apenas as matched), **corrige 2 bugs cooldown** e **uniformiza paleta visual**.

A Sprint A2 (TTS wiring + alarmes) roda em paralelo. Esta spec **NAO modifica** codigo de A2 (lista de no-touch na secao "Restricoes de Coordenacao"). A Sprint F (cooldown revamp + prints) virá depois e construirá em cima de B2 — esta spec nao antecipa F.

---

## Resumo

Seis mudancas operacionais sobre o fluxo session-end:

1. **M1 — Reconcile inline:** `WalletReconciliationDialog` deixa de ser modal separado. Sua logica vai para uma secao "Bancas" dentro de `SessionSummaryModal`. Submit do reconcile acontece automaticamente ao clicar qualquer CTA terminal (cooldown full/quick/finalize).
2. **M2 — Setting `bankrollManagementEnabled`:** novo toggle em `Settings.tsx` que desliga todo o fluxo multi-wallet (esconde wallets list, esconde secao "Bancas" do summary, nao tenta reconcile, nao grava snapshot). Banca legada (`bankrollAmount` + `bankrollRule`) continua visivel e funcionando.
3. **M3 — Eligibility por plataformas jogadas:** `GET /api/grind-sessions/:id/reconcilable-wallets` passa a derivar `playedPlatforms` (set de sites unicos dos `session_tournaments` finalizados) e retorna `missingPlatforms: string[]` quando uma plataforma jogada nao tem wallet ativa. Summary exibe banner amber com link "Cadastrar agora" → abre `WalletCreateDialog` inline pre-preenchido. Submit so e permitido com `missingPlatforms.length === 0`.
4. **M4 — Bug cooldown Bloco 3:** botao "Concluir cooldown" volta a aparecer a partir do Bloco 2 em `mode='full'` (regressao introduzida em `21fca11`). Comentario `// Sprint F vai mover pra Bloco 4 ultimo` sinaliza intencao futura.
5. **M5 — Bug cooldown finish nao marca sessao:** ao concluir cooldown, sessao deve ficar `status='completed'`, queries invalidadas, e redirect para `/grind` (nao `/dashboard`).
6. **M6 — Auditoria visual:** substituir `bg-white`, `bg-gray-100`, `bg-gray-50` em modais do fluxo session-end pela paleta poker-green/gold (referencia commit `cf9e163`).

Reusa: `walletService.recordTransaction` (ADR-038), ledger imutavel (ADR-017), telemetry adapter, currency normalizer (ADR-033), `WalletCreateDialog` existente (com 2 props novas opcionais: `defaultPlatform`, `defaultCurrency`).

---

## Contexto

### Estado pos-Sprint B (entregue)

- `WalletReconciliationDialog` aparece **apenas quando ha matched wallets**. Se o jogador jogou na Suprema mas ainda nao cadastrou wallet Suprema, o reconcile silenciosamente passa pelo torneio sem gerar tx — e o jogador nao tem indicacao visual disso.
- `SessionSummaryModal` abre in-place. Tres CTAs (cooldown full / quick / finalize). Cooldown create funciona com `sessionId` correto.
- `session_wallet_snapshots` populado por wallet por sessao (idempotente).
- 9 eventos de telemetria emitidos.
- A2 (alarmes) consome `alertsSuspended` flag derivada (`showSessionSummary || showReconcileDialog || showConfirmationModal`).

### Problemas reportados em QA (motivacao das 6 mudancas)

1. **Friccao do dialog separado:** jogador ja viu o summary, clica "Finalizar", aparece *outro* modal. Duas decisoes onde poderia ser uma. (M1)
2. **Jogador casual sem multi-wallet:** founder testou com colega que joga so na Suprema, nao usa multi-wallet, ainda assim viu o reconcile e ficou confuso. Setting precisa permitir desligar. (M2)
3. **Wallet nao cadastrada = silencio:** jogou na GG sem ter wallet GG. Sessao terminou, snapshot gravado so para Suprema, GG sumiu sem aviso. (M3)
4. **"Concluir cooldown" sumiu no Bloco 3:** regressao do commit `21fca11`. Founder ficou preso no Bloco 3 do cooldown sem botao para sair. (M4)
5. **Cooldown finalizado mas sessao continua "active":** ao concluir cooldown, redirect ia pra `/dashboard` e a sessao na lista `/grind` ainda aparecia como ativa. (M5)
6. **Inconsistencia visual:** SessionSummaryModal e ConfirmationModal usam `bg-white`, destoam do resto da app que ja foi padronizada para paleta dark poker-green/gold em `cf9e163`. (M6)

### Restricoes de Coordenacao (A2 paralela — NAO TOCAR)

Os seguintes arquivos/regioes sao territorio exclusivo da Sprint A2 (TTS wiring + alarmes). Esta spec **nao modifica nenhum**:

- `client/src/components/grind-session-live/AlertsPanel.tsx`
- `client/src/components/grind-session-live/TournamentAlertDialog.tsx`
- `client/src/components/grind-session-live/fireAlert.ts`
- `sessionAlertManagerRef` e funcoes correlatas em `GrindSessionLive.tsx`
- `checkAlerts` useEffect em `GrindSessionLive.tsx` (linhas 928-1007 do estado pos-`21fca11`)
- Secao "Alertas e Voz" em `Settings.tsx`

**Contrato externo mantido:** flag derivada `alertsSuspended` continua exposta. A B2 **simplifica** o calculo (remove `showReconcileDialog` porque dialog deixa de existir), mas a flag continua sendo `true` enquanto qualquer modal terminal estiver aberto:

```ts
const alertsSuspended = showSessionSummary || showConfirmationModal;
```

A2 ja consome `alertsSuspended` — nenhum trabalho cross-sprint adicional.

### Antecipacoes vetadas (Sprint F futura)

A Sprint F enderecara cooldown revamp + prints. Esta spec **NAO** implementa nenhum dos itens abaixo:

- NAO criar tabela `session_screenshots`.
- NAO mudar UX do Bloco 1 do cooldown.
- NAO criar Bloco 4 de respiracao.
- NAO mover botao "Concluir cooldown" para o Bloco 4 ultimo (M4 reverte regressao; F vai mover depois).
- NAO implementar drag-drop de prints.

---

## Usuarios

- **Jogador multi-wallet (default):** usa multiplas wallets (USD/BRL/CNY etc), faz reconcile pos-sessao, valida saldos por plataforma jogada.
- **Jogador casual single-wallet:** desliga `bankrollManagementEnabled`, mantem so `bankrollAmount` legado, finaliza sessao sem reconcile.
- **Jogador novo plataforma:** jogou em plataforma sem wallet cadastrada. Banner amber instrui cadastrar antes de finalizar.
- **Jogador em cooldown full:** chega no Bloco 3 (tilt), ve botao "Concluir cooldown", clica, sessao marcada `completed`, redirect para `/grind`.

### Glossario

- **`bankrollManagementEnabled`:** boolean em `user_settings`. Default `true`. Quando `false`, todo o fluxo multi-wallet e secao "Bancas" desaparecem.
- **`playedPlatforms`:** set de `session_tournaments.site` distintos da sessao (apenas torneios finalizados, ou seja, com `outcome != 'not_played'`).
- **`missingPlatforms`:** subset de `playedPlatforms` para os quais o jogador NAO tem wallet ativa correspondente (via `mapSiteToWallet`).
- **Reconcile inline:** secao "Bancas" embutida no `SessionSummaryModal`, com input editavel `reportedBalance` por wallet.
- **Submit automatico:** ao clicar qualquer CTA terminal (Iniciar Cool-down full/quick / Finalizar Sessao), se houver wallets com `manualAdjustment != 0`, dispara `POST /reconcile-wallets` antes da acao.
- **`alertsSuspended`:** flag derivada client-side, contrato externo com Sprint A2. Vale `true` enquanto qualquer modal terminal estiver aberto.

---

## Requisitos Funcionais

### M1 — Reconcile Inline no SessionSummaryModal

#### User Story
> Como jogador finalizando uma sessao, quero conferir saldo final de cada wallet na mesma tela do summary, sem ter que passar por um dialog separado, para que minha decisao de "qual cooldown rodar / pular" seja tomada com toda a informacao visivel de uma vez.

#### Critérios de Aceitação

**Cenario 1: Layout do summary com secao Bancas**
- **Given** sessao concluida com >= 1 matched wallet, `bankrollManagementEnabled=true`, sem missing platforms
- **When** `SessionSummaryModal` abre
- **Then** modal exibe, em ordem vertical: (a) stats da sessao (atual), (b) **secao "Bancas"** com lista de wallets jogadas, (c) CTAs `Iniciar Cool-down (full)`, `Iniciar Cool-down (quick)`, `Finalizar Sessao`
- **And** secao "Bancas" mostra para cada wallet: nome plataforma, moeda nativa, `expectedClosingBalance` em texto auxiliar, input editavel "Saldo final reportado" pre-preenchido com `expectedClosingBalance`
- **And** abaixo do input aparece preview em tempo real: `Ajuste manual: +X.XX YYY` ou `-X.XX YYY` ou `0.00` (verde se 0, amber caso contrario)
- **And** NAO existe botao "Confirmar reconcile" separado

**Cenario 2: Submit automatico ao clicar CTA**
- **Given** secao "Bancas" preenchida, jogador alterou pelo menos um `reportedBalance`
- **When** jogador clica `Finalizar Sessao` (ou qualquer um dos cooldown CTAs)
- **Then** sistema dispara `POST /api/grind-sessions/:id/reconcile-wallets` com payload `[{ walletId, reportedBalance }, ...]` apenas para wallets com `manualAdjustment != 0`
- **And** aguarda 200 OK
- **And** so apos sucesso prossegue para a acao do CTA (cooldown create / status=completed + redirect)
- **And** se reconcile falhar (4xx/5xx), CTA nao avanca, exibe toast de erro, mantem modal aberto

**Cenario 3: Submit sem ajustes**
- **Given** todos os `reportedBalance` permanecem iguais ao `expectedClosingBalance` (todos `manualAdjustment === 0`)
- **When** jogador clica qualquer CTA terminal
- **Then** sistema NAO dispara `POST /reconcile-wallets` (sem-op no servidor, sem tx criadas)
- **But** snapshot por wallet **ainda eh gravado** (mantem comportamento da Sprint B: snapshot sempre, ledger so quando ha tx)
- **And** prossegue para acao do CTA imediatamente

**Cenario 4: Dialog separado deprecado**
- **Given** codigo da Sprint B contem `client/src/components/grind-session-live/WalletReconciliationDialog.tsx`
- **When** B2 e implementada
- **Then** se nenhum outro componente importa `WalletReconciliationDialog`, arquivo eh **deletado**
- **And** se houver consumidor remanescente (verificar via grep), arquivo eh **preservado** com comentario header `// DEPRECATED — logica migrada para SessionSummaryModal (Sprint B2). Remover quando consumidor X migrar.`

#### Arquivos Afetados
- `client/src/components/grind-session-live/SessionSummaryModal.tsx` — adicionar secao "Bancas" + estado de reportedBalances + submit handler
- `client/src/components/grind-session-live/WalletReconciliationDialog.tsx` — deletar OU adicionar header de deprecation
- `client/src/components/grind-session-live/GrindSessionLive.tsx` — remover `showReconcileDialog` state, remover `WalletReconciliationDialog` JSX, simplificar `runSessionEndFlow`
- `client/src/lib/grind-session-end-flow.ts` (se existir helper extraido) — atualizar fluxo

#### Telemetria (eventos novos)
- `summary_inline_reconcile_submitted` — payload `{ sessionId, walletCount, walletsWithAdjustment }`
- `summary_inline_reconcile_skipped_no_changes` — payload `{ sessionId, walletCount }`
- `summary_inline_reconcile_failed` — payload `{ sessionId, errorCode, errorMessage }`

#### Casos de Erro
- **POST /reconcile-wallets retorna 409 (idempotencia):** snapshot ja existe; tratar como sucesso silencioso, prosseguir CTA, log warning.
- **POST /reconcile-wallets retorna 400 (validacao):** mostrar toast com mensagem do server, manter modal aberto, **nao** avancar CTA.
- **POST /reconcile-wallets retorna 5xx:** mostrar toast generico "Falha ao reconciliar. Tente novamente.", manter modal, **nao** avancar.
- **Network failure:** mesmo tratamento de 5xx.

#### Edge Cases
- Jogador clica CTA mas reconcile esta in-flight: bloquear CTAs durante mutation (state `isReconciling`).
- Jogador altera `reportedBalance` durante mutation: input fica disabled enquanto mutation roda.
- Wallet com `expectedDelta === 0` (jogou mas nao houve buy-in/payout naquela plataforma): nao mostrar na secao "Bancas" (filtro: so wallets com `playedPlatforms` e atividade financeira).

#### Out of Scope (Sprint F)
- Inline edit de torneios individuais a partir do summary — F.
- Captura de screenshots dos resultados inline — F.

---

### M2 — Setting `bankrollManagementEnabled`

#### User Story
> Como jogador casual que usa apenas a banca legada (campo unico), quero desligar o fluxo multi-wallet para que sessoes finalizem rapido, sem me pedir reconciliacao de saldos por plataforma.

#### Critérios de Aceitação

**Cenario 1: Setting visivel em Settings**
- **Given** usuario autenticado em `/settings`
- **When** ve a secao "Banca"
- **Then** secao tem **switch no header** com label "Gestao multi-wallet (reconcile pos-sessao)"
- **And** abaixo do switch: help text "Quando desativado, a sessao finaliza sem pedir reconciliacao de saldos. Banca legada (campo unico) continua funcionando."
- **And** estado inicial do switch reflete `user_settings.bankroll_management_enabled` (default `true`)

**Cenario 2: Setting OFF — UI esconde wallets**
- **Given** `bankrollManagementEnabled === false`
- **When** usuario abre `/settings`
- **Then** lista de wallets **nao aparece**
- **And** botao "Adicionar wallet" **nao aparece**
- **And** campos `bankrollAmount` e `bankrollRule` **continuam visiveis e editaveis**

**Cenario 3: Setting OFF — summary sem reconcile**
- **Given** `bankrollManagementEnabled === false`, sessao finalizada com torneios em multiplas plataformas
- **When** `SessionSummaryModal` abre
- **Then** secao "Bancas" **nao eh renderizada**
- **And** banner de missing platforms **nao eh renderizado** (M3)
- **And** CTAs avancam direto sem chamar `POST /reconcile-wallets`
- **And** snapshots **nao sao gravados** (skip da gravacao no servidor quando setting=false)
- **And** sistema emite telemetria `reconcile_skipped_setting_off` com payload `{ sessionId }`

**Cenario 4: Toggle OFF → ON**
- **Given** `bankrollManagementEnabled === false`, usuario decide ativar
- **When** clica o switch para ON
- **Then** PUT em `/api/user-settings` com `{ bankrollManagementEnabled: true }`
- **And** lista de wallets reaparece imediatamente (otimisticamente)
- **And** se nao tem wallet cadastrada, lista vazia + CTA "Adicionar wallet"
- **And** proxima sessao usa fluxo multi-wallet completo

**Cenario 5: Toggle ON → OFF mid-session**
- **Given** sessao ativa em andamento, jogador desliga setting via `/settings` em outra aba
- **When** sessao termina
- **Then** sistema le `bankrollManagementEnabled` no momento do `endSessionMutation` (nao no momento de start) — fonte de verdade eh o estado atual do settings
- **And** comportamento segue Cenario 3 (skip reconcile)

#### Arquivos Afetados
- `client/src/pages/Settings.tsx` — adicionar switch na secao banca, condicional render de wallets
- `client/src/components/grind-session-live/SessionSummaryModal.tsx` — guardar render da secao "Bancas" com `if (bankrollManagementEnabled)`
- `client/src/components/grind-session-live/GrindSessionLive.tsx` — guardar chamada de `runReconcile` com setting check
- `server/routes/user-settings.ts` (ou rota correspondente) — aceitar `bankrollManagementEnabled` no PUT
- `server/storage.ts` — atualizar `getUserSettings` / `updateUserSettings` para incluir nova coluna
- `shared/schema.ts` — coluna nova em `user_settings`
- `migrations/000X_user_settings_bankroll_management_flag.sql` — migracao SQL

#### Schema Delta

```sql
ALTER TABLE user_settings
  ADD COLUMN bankroll_management_enabled BOOLEAN NOT NULL DEFAULT TRUE;
```

Drizzle (`shared/schema.ts`):
```ts
// dentro do objeto userSettings
bankrollManagementEnabled: boolean('bankroll_management_enabled').notNull().default(true),
```

Zod schema correspondente: `optional + default(true)` no insert/update schema (lesson learned #7 — deprecation gradual).

#### Telemetria (eventos novos)
- `bankroll_management_setting_toggled` — payload `{ from: boolean, to: boolean }`
- `reconcile_skipped_setting_off` — payload `{ sessionId }` (emitido server-side ao receber endSession com setting=false)

#### Casos de Erro
- **PUT /user-settings retorna 5xx:** toggle reverte para estado anterior, toast erro.
- **Setting=false mas request inclui reconcile payload:** server **ignora** payload, retorna 200, log warning. Cliente nao deve enviar payload nesse caso, mas server eh defensivo.

#### Edge Cases
- Usuario sem wallet cadastrada e com setting=true: lista vazia + CTA "Adicionar wallet". Summary nao mostra secao "Bancas" (sem wallets matched).
- Usuario com setting=true mas todas wallets inativas (`active=false`): tratar como zero wallets, idem acima.
- Setting=false e usuario ja tem wallets cadastradas: dados preservados no banco, apenas escondidos da UI. Toggle ON faz reaparecer sem perda.

#### Out of Scope (Sprint F)
- Migracao de `bankrollAmount` legado para wallet primaria automatica — fora desta sprint.

---

### M3 — Wallets Eligibility por Plataformas Jogadas

#### User Story
> Como jogador que jogou em uma plataforma cuja wallet ainda nao foi cadastrada, quero ser avisado no summary com link direto para cadastrar antes de finalizar, para que o reconcile cubra todas as plataformas da sessao.

#### Critérios de Aceitação

**Cenario 1: Endpoint retorna missingPlatforms**
- **Given** sessao com `session_tournaments` em ['SupremaPoker', 'GGPoker'], usuario tem wallet ativa apenas para 'SupremaPoker'
- **When** `GET /api/grind-sessions/:id/reconcilable-wallets`
- **Then** response inclui `wallets: [<suprema wallet com expectedDelta>]`
- **And** response inclui `missingPlatforms: ['GGPoker']`
- **And** response inclui `playedPlatforms: ['SupremaPoker', 'GGPoker']` (informativo)

**Cenario 2: Banner amber no summary**
- **Given** `bankrollManagementEnabled=true`, response do endpoint tem `missingPlatforms.length > 0`
- **When** `SessionSummaryModal` renderiza
- **Then** banner amber aparece **acima** da secao "Bancas" com texto: "Cadastre wallet pra: GGPoker" (separar por virgula se multiplas)
- **And** banner contem link/botao "Cadastrar agora"
- **And** clique no botao abre `WalletCreateDialog` inline (modal-em-modal aceitavel) com `defaultPlatform='GGPoker'` e `defaultCurrency` derivada da plataforma quando heuristica existir (caso contrario campo aberto)

**Cenario 3: Submit bloqueado com missingPlatforms**
- **Given** banner amber visivel (`missingPlatforms.length > 0`)
- **When** jogador clica `Finalizar Sessao` (ou qualquer cooldown CTA)
- **Then** sistema **NAO** dispara reconcile e **NAO** avanca CTA
- **And** exibe toast "Cadastre as wallets pendentes antes de finalizar."
- **And** banner permanece destacado

**Cenario 4: Cadastro inline desbloqueia submit**
- **Given** banner amber, jogador clica "Cadastrar agora"
- **When** preenche `WalletCreateDialog` com platform='GGPoker', currency='USD', balance=100
- **And** submit do dialog retorna 201
- **Then** `WalletCreateDialog` fecha
- **And** sistema **invalida** `['/api/grind-sessions', sessionId, 'reconcilable-wallets']`
- **And** refetch retorna `missingPlatforms: []`
- **And** banner amber desaparece
- **And** secao "Bancas" agora inclui a wallet recem-criada com `reportedBalance` pre-preenchido com `expectedClosingBalance`
- **And** CTAs voltam a estar habilitados

**Cenario 5: Setting OFF supera M3**
- **Given** `bankrollManagementEnabled=false`, sessao com `playedPlatforms=['SupremaPoker', 'GGPoker']`, sem wallets cadastradas
- **When** summary abre
- **Then** banner amber **nao aparece** (M2 esconde toda a secao multi-wallet)
- **And** CTAs prosseguem normalmente sem reconcile

#### Arquivos Afetados
- `server/routes/grind-sessions.ts` (ou onde mora `reconcilable-wallets`) — calcular `playedPlatforms` e `missingPlatforms`
- `server/storage.ts` — funcao `getPlayedPlatforms(sessionId)` que retorna distinct sites de `session_tournaments` finalizados
- `server/scoring/site-to-wallet-mapper.ts` (ou equivalente) — funcao auxiliar `findMissingPlatforms(playedPlatforms, userWallets)` — reusa `mapSiteToWallet` invertido
- `client/src/components/grind-session-live/SessionSummaryModal.tsx` — banner amber + integracao `WalletCreateDialog`
- `client/src/components/bankroll/WalletCreateDialog.tsx` — adicionar 2 props opcionais `defaultPlatform?: string` e `defaultCurrency?: string` (se ja nao existem). Quando passados, pre-preenchem campos correspondentes
- `shared/schema.ts` — atualizar Zod schema da response de `reconcilable-wallets` se for tipado

#### Telemetria (eventos novos)
- `summary_missing_platforms_shown` — payload `{ sessionId, missingPlatforms: string[] }`
- `summary_missing_platforms_create_clicked` — payload `{ sessionId, platform: string }`
- `summary_missing_platforms_resolved` — payload `{ sessionId, platform: string, walletId: string }`
- `summary_submit_blocked_missing_platforms` — payload `{ sessionId, missingPlatforms: string[] }`

#### Casos de Erro
- **`getPlayedPlatforms` retorna vazio** (sessao sem torneios finalizados ou todos `not_played`): `missingPlatforms = []`, banner nao aparece, secao "Bancas" pode ficar vazia (nao renderiza nada se sem wallets matched).
- **`mapSiteToWallet` retorna 2+ matches para um site:** usa o primeiro match (lesson learned: sempre validar shape, nao assumir 1:1). Documentar em ADR se virar problema recorrente.
- **`WalletCreateDialog` falha:** dialog mostra erro inline, summary continua bloqueado. Jogador pode tentar novamente ou fechar dialog (banner permanece).

#### Edge Cases
- Plataforma com nome ambiguo (ex: 'Suprema' vs 'SupremaPoker'): normalizacao deve usar a mesma canonicalizacao usada em `mapSiteToWallet` (case-insensitive, trim, alias map). Garantir que `missingPlatforms` retornado eh o nome **canonico** (pra UI exibir consistente).
- Multiplas plataformas missing: banner lista todas separadas por virgula. Botao "Cadastrar agora" abre dialog para a primeira; apos cadastro, banner atualiza com as restantes; botao continua disponivel.
- Jogador cadastra wallet com platform diferente da sugerida (typo, escolha consciente): `missingPlatforms` continua incluindo a plataforma original. Banner persiste. Comportamento aceitavel; jogador pode forcar atualizacao da plataforma manualmente.

#### Out of Scope (Sprint F)
- Auto-deteccao de moeda baseada em CSV historico — fora desta sprint.
- Sugestao de saldo inicial baseado em CSV — fora.

---

### M4 — Bug: "Concluir cooldown" Ausente no Bloco 3

#### User Story
> Como jogador rodando cooldown full no Bloco 3 (tilt), quero ver o botao "Concluir cooldown" para conseguir sair do fluxo se ja estiver pronto, sem ficar preso aguardando algum trigger que nao existe.

#### Critérios de Aceitação

**Cenario 1: Botao aparece a partir do Bloco 2**
- **Given** sessao em cooldown `mode='full'`
- **When** usuario chega no Bloco 2 (`currentBlock === 'abc'`)
- **Then** botao com `data-testid="cooldown-finish"` esta visivel e habilitado
- **And** mesmo botao continua visivel quando avanca para Bloco 3 (`currentBlock === 'tilt'`)
- **And** mesmo botao continua visivel quando avanca para Bloco 4 (`currentBlock === 'sleep'`, dentro de `BlockFourSleepGate`)

**Cenario 2: Bloco 1 nao tem botao**
- **Given** cooldown em Bloco 1 (`currentBlock === 'reflection'`, ou primeiro bloco)
- **When** componente renderiza
- **Then** botao `cooldown-finish` **nao aparece** (Sprint F vai mover essa restricao)

**Cenario 3: Cooldown quick**
- **Given** cooldown `mode='quick'`
- **When** componente renderiza qualquer bloco
- **Then** comportamento **permanece** como pre-B2 (botao nos blocos atuais; B2 nao mexe em quick)

**Cenario 4: Comentario sinalizando intencao Sprint F**
- **Given** codigo do `CoolDownRunner`
- **When** Sprint F precisar mover botao para apenas Bloco 4
- **Then** comentario `// Sprint F vai mover pra Bloco 4 ultimo` esta presente proximo a logica de visibilidade do botao

#### Arquivos Afetados
- `client/src/components/cooldown/CoolDownRunner.tsx` — relaxar condicional de visibilidade do `cooldown-finish` button para incluir Bloco 3 em mode='full'
- `tests/unit/cooldown/cooldown-runner-finish-button.test.ts` (ou equivalente) — atualizar testes que cobriam visibilidade

#### Telemetria
Sem eventos novos. M4 eh bug fix puro.

#### Casos de Erro
- Sem casos novos; comportamento de click ja existente eh reusado.

#### Edge Cases
- Bloco 4 com gate de sleep (`BlockFourSleepGate`): botao continua sendo renderizado por dentro do gate como hoje. Nao duplicar.
- Transicao Bloco 2 → Bloco 3 com botao ja em foco/hover: botao deve permanecer estavel (mesmo `data-testid`, mesmo handler).

#### Out of Scope (Sprint F)
- Mover botao para apenas Bloco 4 ultimo — Sprint F. Comentario sinaliza.

---

### M5 — Bug: "Concluir cooldown" Nao Marca Sessao Completed

#### User Story
> Como jogador concluindo cooldown, quero que minha sessao apareca como "concluida" na lista `/grind` e que eu seja levado de volta para `/grind` (nao `/dashboard`), para fechar o fluxo e iniciar a proxima sessao quando quiser.

#### Critérios de Aceitação

**Cenario 1: Cooldown finish persiste status=completed**
- **Given** cooldown em qualquer bloco com botao visivel, sessao ainda com `status='active'` ou `status='ending'` (estado intermediario apos summary mas antes do cooldown finish)
- **When** jogador clica `cooldown-finish`
- **Then** sistema dispara `POST /api/cooldown-logs/:logId/finish`
- **And** server marca `cooldown_log.completed_at` e retorna 200
- **And** sistema dispara `PUT /api/grind-sessions/:sessionId` com `{ status: 'completed' }` **se ainda nao estiver completed** (verificar idempotencia: se ja eh completed, skip)
- **And** server retorna 200

**Cenario 2: Invalidar queries**
- **Given** apos sucesso de M5 Cenario 1
- **When** mutations completam
- **Then** sistema invalida (TanStack Query): `['/api/grind-sessions']`, `['/api/grind-sessions', sessionId]`, `['/api/cooldown-logs']`
- **And** lista `/grind` ao recarregar mostra sessao como `completed`

**Cenario 3: Redirect para /grind**
- **Given** apos invalidacao de queries
- **When** redirect dispara
- **Then** rota destino eh `/grind` (Wouter `useLocation` ou `setLocation('/grind')`)
- **And** **NAO** vai para `/dashboard`

**Cenario 4: Sessao ja completed (idempotencia)**
- **Given** sessao ja foi marcada `completed` durante o summary (caso futuro de M1 + M5 sequencial), agora cooldown termina
- **When** click em `cooldown-finish`
- **Then** sistema **nao** dispara segundo `PUT /api/grind-sessions/:id` (skip se status ja eh completed)
- **And** dispara `POST /cooldown-logs/:id/finish` normal
- **And** redirect para `/grind` ocorre

#### Arquivos Afetados
- `client/src/components/cooldown/CoolDownRunner.tsx` — handler do `cooldown-finish` button: encadear cooldown finish + session status update + invalidacao + redirect
- `client/src/pages/CoolDown.tsx` (ou pagina wrapper) — confirmar redirect destino
- `server/routes/cooldown-logs.ts` — opcional: server faz status update da sessao ao receber finish (alternativa centralizada). Decisao: **manter no client** para ser consistente com pattern existente (`endSessionMutation` ja roda client-side). Documentar em comentario.

#### Telemetria (eventos novos)
- `cooldown_finish_marked_session_completed` — payload `{ sessionId, cooldownLogId, mode: 'full' | 'quick' }`
- `cooldown_finish_session_already_completed` — payload `{ sessionId, cooldownLogId }` (idempotencia, debug)

#### Casos de Erro
- **POST /cooldown-logs/:id/finish retorna 5xx:** toast erro, mantem usuario na pagina cooldown, **nao** redireciona, **nao** marca session completed.
- **POST sucesso mas PUT /grind-sessions/:id 5xx:** cooldown ja foi marcado completo no DB. Toast warning "Cooldown concluido mas falhou ao atualizar status da sessao. Tente recarregar." Redireciona para `/grind` mesmo assim (sessao aparecera como `active`; jogador pode abrir e finalizar manual). Log telemetria evento `cooldown_finish_session_update_failed`.

#### Edge Cases
- Jogador fecha aba antes do PUT completar: cooldown_log fica `completed` mas sessao fica `active`. Aceitavel; auto-recovery na proxima abertura nao implementado nesta sprint.
- Multiplas sessoes em cooldown simultaneo (impossivel hoje, mas defensivo): handler usa `sessionId` capturado no mount, nao stale closure.

#### Out of Scope (Sprint F)
- Server-side hook que automaticamente marca sessao completed ao receber cooldown finish — F (junto com revamp).

---

### M6 — Auditoria Visual: Backgrounds Brancos

#### User Story
> Como jogador navegando o app dark-themed, quero que modais do fluxo session-end sigam a paleta poker-green/gold consistente com o resto do app, para que minha sessao termine sem quebra de imersao visual.

#### Critérios de Aceitação

**Cenario 1: Componentes auditados**
- **Given** Sprint B2 em revisao final
- **When** auditoria visual roda
- **Then** os seguintes componentes foram revisados:
  - `client/src/components/grind-session-live/SessionSummaryModal.tsx`
  - `client/src/components/grind-session-live/ConfirmationModal.tsx` (auto-finish)
  - `client/src/components/cooldown/CoolDownRunner.tsx` e blocos filhos
  - `client/src/components/bankroll/WalletCreateDialog.tsx` (quando aberto inline em M3)
  - Qualquer modal/dialog renderizado no fluxo session-end (mapeamento via grep no diff)

**Cenario 2: Tokens substituidos**
- **Given** componente da lista do Cenario 1 contendo `bg-white`, `bg-gray-100` ou `bg-gray-50`
- **When** B2 e implementada
- **Then** classes substituidas pela paleta:
  - **Bg principal de modal/card:** `bg-poker-surface` (preferencial) ou `bg-gray-900`
  - **Borders:** `border-gray-700`
  - **Inputs:** `bg-gray-800 border-gray-600 text-white`
  - **Accent CTA primario:** `bg-poker-green` ou `bg-gold` (manter convencao do commit `cf9e163`)
- **And** texto sobre fundo escuro usa `text-white` ou `text-gray-100` (legibilidade WCAG AA minimo)

**Cenario 3: Nao tocar A2**
- **Given** componente A2 (lista de no-touch)
- **When** auditoria roda
- **Then** componente **nao eh modificado** mesmo se contiver `bg-white`. Auditoria registra em comentario do PR "TODO A2: bg-white em AlertsPanel — deferido para sprint A2 ou pos-A2."

**Cenario 4: Validacao visual**
- **Given** B2 implementada
- **When** founder roda app local e abre fluxo session-end
- **Then** transicao confirmation → summary → cooldown nao tem flash branco em nenhum modal
- **And** screenshots antes/depois anexados ao PR

#### Arquivos Afetados
- Determinados via grep dinamico durante implementacao. Lista mais provavel:
  - `client/src/components/grind-session-live/SessionSummaryModal.tsx`
  - `client/src/components/grind-session-live/ConfirmationModal.tsx`
  - `client/src/components/cooldown/CoolDownRunner.tsx`
  - `client/src/components/cooldown/blocks/*.tsx`
  - `client/src/components/bankroll/WalletCreateDialog.tsx`
  - Wrappers Radix Dialog que aplicam fundo (verificar `client/src/components/ui/dialog.tsx`)

#### Telemetria
Sem eventos novos. M6 eh refactor visual puro.

#### Casos de Erro
- N/A (refactor visual; nao introduz logica nova).

#### Edge Cases
- Tema light hipotetico: app eh dark-only hoje. Tokens substituidos assumem dark. Se light vier no futuro, tokens semanticos (`bg-poker-surface`) ja resolverao via theme switching.
- Tailwind purge: garantir que tokens novos (`bg-poker-surface`, `bg-poker-green`, `bg-gold`) ja existem em `tailwind.config.ts`. Caso contrario, M6 incluir adicao.

#### Out of Scope (Sprint F)
- Redesign visual dos blocos do cooldown — F.
- Animacoes de transicao entre modais — F.

---

## Requisitos Nao-Funcionais

- **Performance:** `GET /reconcilable-wallets` deve manter p95 < 300ms mesmo com `playedPlatforms` calculado (uma query agregadora extra em `session_tournaments`).
- **Seguranca:** todas as rotas mantem `requireAuth`. Setting `bankrollManagementEnabled` eh do usuario logado, nao admin-only. Server valida ownership da sessao antes de retornar `playedPlatforms`.
- **Idempotencia:** reconcile mantido idempotente via snapshot unique constraint (`session_id, wallet_id`). M5 cooldown finish idempotente via check de status antes de PUT.
- **Compatibilidade A2:** flag `alertsSuspended` mantida com novo calculo simplificado. Contrato externo inalterado.
- **Acessibilidade:** banner amber tem `role="alert"` e botao "Cadastrar agora" tem `aria-label` explicito. Switch do setting tem label associada via `htmlFor`.

---

## Endpoints Afetados

| Metodo | Rota | Descricao | Mudanca | Auth |
|---|---|---|---|---|
| GET | /api/grind-sessions/:id/reconcilable-wallets | Lista wallets matched + playedPlatforms + missingPlatforms | **Atualizado** (novos campos `missingPlatforms`, `playedPlatforms`) | JWT |
| POST | /api/grind-sessions/:id/reconcile-wallets | Submit reconcile (existing) | **Inalterado** (server respeita `bankrollManagementEnabled` e ignora se false) | JWT |
| PUT | /api/user-settings | Atualiza settings do usuario | **Atualizado** (aceita `bankrollManagementEnabled`) | JWT |
| GET | /api/user-settings | Le settings | **Atualizado** (retorna `bankrollManagementEnabled`) | JWT |
| POST | /api/cooldown-logs/:id/finish | Marca cooldown completo | **Inalterado** | JWT |
| PUT | /api/grind-sessions/:id | Atualiza status sessao | **Inalterado** (M5 client-side chama existente) | JWT |
| POST | /api/wallets | Cria wallet | **Inalterado** (M3 reusa via dialog) | JWT |

---

## Modelos de Dados Afetados

### `user_settings` (alteracao)

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| bankroll_management_enabled | boolean | NOT NULL DEFAULT TRUE | M2 |

Migracao SQL em `migrations/000X_user_settings_bankroll_management_flag.sql`.

### `session_wallet_snapshots` (inalterado)

Tabela ja existe da Sprint B. B2 nao altera schema — apenas o servidor passa a **nao gravar** snapshots quando `bankrollManagementEnabled=false`.

### `wallet_transactions` (inalterado)

Mantido como ledger imutavel (ADR-017). B2 nao altera shape.

---

## Cenarios de Teste Derivados

### Happy Path
- [ ] Sessao multi-wallet com matched wallets, sem missing → summary mostra secao Bancas, CTA finalize submete reconcile + redirect
- [ ] Sessao single-wallet com setting OFF → summary sem secao Bancas, CTA finalize redirect direto
- [ ] Cooldown full Bloco 3 → click finish → status=completed → redirect /grind

### Validacao de Input
- [ ] `reportedBalance` negativo: aceito (jogador pode estar reportando saldo zerado por desistencia, mas nunca negativo real). **Decisao:** validar `reportedBalance >= 0` no client (Zod refinement); server tambem valida.
- [ ] `reportedBalance` formato invalido (string nao numerica): input bloqueia entrada (number input controlado).
- [ ] Setting toggle: aceita boolean strict, rejeita outros tipos.

### Regras de Negocio (M1)
- [ ] Submit automatico apenas para wallets com `manualAdjustment != 0` (nao envia payload zerado)
- [ ] Submit bloqueado se `missingPlatforms.length > 0` (M3 interage com M1)
- [ ] CTAs disabled durante reconcile in-flight

### Regras de Negocio (M2)
- [ ] Setting OFF esconde wallets list, banco-rule visivel
- [ ] Setting OFF + sessao multi-platform → snapshot **nao** gravado, telemetria `reconcile_skipped_setting_off`
- [ ] Toggle OFF→ON reaparece wallets sem perda de dados

### Regras de Negocio (M3)
- [ ] `playedPlatforms` calculado apenas de torneios finalizados (`outcome != 'not_played'`)
- [ ] `missingPlatforms` exclui plataformas com wallet ativa
- [ ] Banner amber + bloqueio de submit + cadastro inline desbloqueia
- [ ] Setting OFF supera M3 (banner nao aparece)

### Regras de Negocio (M4)
- [ ] Bloco 1 sem botao
- [ ] Blocos 2, 3, 4 com botao em mode='full'
- [ ] Mode='quick' inalterado

### Regras de Negocio (M5)
- [ ] Cooldown finish marca cooldown_log + session status=completed + redirect /grind
- [ ] Idempotencia: sessao ja completed nao dispara segundo PUT
- [ ] Falha PUT mas cooldown OK: warning + redirect mesmo assim

### Edge Cases
- [ ] Network failure no submit reconcile (modal aberto, retry possivel)
- [ ] Multiplas plataformas missing (banner lista todas, cadastro um a um atualiza)
- [ ] Toggle setting durante sessao ativa (le no momento de endSession)
- [ ] Wallet criada inline em M3 mas com platform diferente da sugerida (banner persiste)
- [ ] CSV historico nao tem influencia (B2 nao toca CSV)
- [ ] Reconcile mid-flight + jogador clica CTA novamente (CTAs disabled)

### Visual / M6
- [ ] Inspecao visual de cada modal do fluxo session-end pos-implementacao
- [ ] Screenshots antes/depois no PR
- [ ] Componentes A2 NAO modificados (validar via git diff)

---

## Telemetria — Resumo Consolidado

### Eventos novos B2

| Evento | M | Payload |
|---|---|---|
| summary_inline_reconcile_submitted | M1 | { sessionId, walletCount, walletsWithAdjustment } |
| summary_inline_reconcile_skipped_no_changes | M1 | { sessionId, walletCount } |
| summary_inline_reconcile_failed | M1 | { sessionId, errorCode, errorMessage } |
| bankroll_management_setting_toggled | M2 | { from, to } |
| reconcile_skipped_setting_off | M2 | { sessionId } (server-side) |
| summary_missing_platforms_shown | M3 | { sessionId, missingPlatforms } |
| summary_missing_platforms_create_clicked | M3 | { sessionId, platform } |
| summary_missing_platforms_resolved | M3 | { sessionId, platform, walletId } |
| summary_submit_blocked_missing_platforms | M3 | { sessionId, missingPlatforms } |
| cooldown_finish_marked_session_completed | M5 | { sessionId, cooldownLogId, mode } |
| cooldown_finish_session_already_completed | M5 | { sessionId, cooldownLogId } |
| cooldown_finish_session_update_failed | M5 | { sessionId, cooldownLogId, errorCode } |

### Eventos B (Sprint anterior) mantidos
Todos os 9 eventos da Sprint B continuam ativos. M1 deprecou conceito de "dialog separado" mas eventos `reconcile_dialog_*` (se existiam) podem ser renomeados ou mantidos com semantica equivalente — decisao no implementer (preferencia: renomear para `reconcile_inline_*`).

---

## Restricoes de Coordenacao (Recap)

### NAO TOCAR (A2 paralela)
- `AlertsPanel.tsx`, `TournamentAlertDialog.tsx`, `fireAlert.ts`
- `sessionAlertManagerRef` e funcoes correlatas em `GrindSessionLive.tsx`
- `checkAlerts` useEffect em `GrindSessionLive.tsx` (linhas 928-1007)
- Secao "Alertas e Voz" em `Settings.tsx`

### Contrato mantido com A2
```ts
// Calculo simplificado — showReconcileDialog removido (dialog deprecado em M1)
const alertsSuspended = showSessionSummary || showConfirmationModal;
```
A2 ja consome `alertsSuspended` — nenhum trabalho cross-sprint.

### NAO ANTECIPAR (Sprint F)
- `session_screenshots` table — F
- UX Bloco 1 do cooldown — F
- Bloco 4 respiracao — F
- Mover botao "Concluir cooldown" para Bloco 4 ultimo — F (M4 reverte regressao; comentario sinaliza intent)
- Drag-drop de prints — F

---

## Fora de Escopo

- Migracao automatica de `bankrollAmount` legado para wallet primaria — fora.
- Auto-deteccao de moeda da plataforma — fora.
- Sugestao de saldo inicial baseado em CSV historico — fora.
- Inline edit de torneios a partir do summary — fora (Sprint F).
- Captura de screenshots dos resultados — fora (Sprint F).
- Server-side hook automatico cooldown→session status — fora (Sprint F).
- Animacoes de transicao entre modais — fora (Sprint F).
- Redesign visual dos blocos cooldown — fora (Sprint F).
- Modificacao de qualquer codigo da Sprint A2 (lista no-touch) — fora.

---

## Dependencias

- Sprint B (commit `21fca11`) — entregue. B2 constroi em cima.
- Sprint A2 — paralela. Contrato `alertsSuspended` mantido.
- ADR-017 (ledger imutavel) — respeitado.
- ADR-033 (currency normalizer) — respeitado.
- ADR-038 (optimistic concurrency) — respeitado.

---

## Notas de Implementacao

### Ordem sugerida
1. **M2 schema first:** migracao + Drizzle + storage + endpoint settings. Sem essa coluna, M1 nao consegue checar setting.
2. **M3 endpoint:** `playedPlatforms` + `missingPlatforms` no GET. Independente de M1 server-side.
3. **M1 client:** SessionSummaryModal com secao Bancas + submit automatico. Consume M2 + M3.
4. **M3 client banner:** apos M1 client estar em pe.
5. **M4 + M5:** cooldown bugs em sequencia. M5 depende do M4 estar OK (nao se pode finalizar cooldown em Bloco 3 se botao nao aparece).
6. **M6 ultimo:** auditoria visual sobre o codigo ja merged.

### Pattern reuso
- `WalletCreateDialog` ja eh modal Radix. Modal-em-modal funciona desde que use Radix Portal corretamente. Validar z-index hierarquico no QA visual de M6.
- `setQueryData` + `enabled: false` pattern (lesson learned #12) NAO se aplica aqui — preferir invalidacao explicita.

### Riscos identificados
- **Modal-em-modal (M3):** pode ter bug de focus trap. Testar em Chromium + Firefox.
- **Setting=false mid-session (M2 Cenario 5):** edge case raro mas testavel. Garantir que `endSessionMutation` le setting fresh (nao stale closure).
- **`playedPlatforms` performance:** se sessao tiver muitos torneios, query distinct deve usar index em `session_tournaments(session_id, site)`. Validar EXPLAIN antes do merge.

---

## Pre-requisitos para Sprint F

A B2 entrega como base os seguintes elementos sobre os quais a Sprint F (cooldown revamp + prints) construira:

1. **Setting `bankrollManagementEnabled`** — F pode usar para condicionalmente esconder fluxo de prints quando setting=false (caso prints sejam tied a wallets).
2. **Eligibility por plataformas jogadas (M3)** — F pode reusar `playedPlatforms` para sugerir prints relevantes (1 print por plataforma jogada).
3. **Botao "Concluir cooldown" estavel a partir do Bloco 2 (M4)** — F vai mover para Bloco 4 ultimo, mas o `data-testid="cooldown-finish"` e o handler ficam estaveis. F so muda visibilidade, nao a logica.
4. **Sessao marcada `completed` no cooldown finish (M5)** — F mantem essa logica e adiciona side-effects (ex: auto-snapshot de print final).
5. **Paleta visual consistente (M6)** — F construi telas novas (Bloco 4, prints) sobre paleta ja unificada.
6. **Submit inline no summary (M1)** — F pode estender `SessionSummaryModal` para incluir botao "Adicionar print" sem refatorar o submit, ja que reconcile virou inline.
7. **Telemetria 12 eventos B2** — F adiciona eventos de print sem colidir com namespace existente.
8. **Restricoes A2 documentadas** — F continua respeitando lista no-touch (A2 podera ainda estar viva ou recem-merged).
