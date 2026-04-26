# ADR-034: Modelo Multi-Wallet com FX Historico Imutavel

## Status
Aceito

## Data
2026-04-25

## Contexto

O Bankroll v1 (Sprint 2) modela banca como **valor unico em USD** em `user_settings.bankroll_amount` + ledger global em `bankroll_snapshots`. Isso nao reflete a realidade do MTT pro brasileiro:

- Maioria opera em **2 a 5 redes** com **moedas distintas** (BRL na Suprema, USD em GG/Stars, USDT em CoinPoker, BRL fora de plataforma em conta bancaria).
- Forca **conversao mental constante** em toda interacao (HIGH-1 do plano estrategico).
- **Concentracao de risco em uma rede** vira ponto cego (dor #4).
- **ROI por rede** e impossivel — banca consolidada esconde performance heterogenea.
- **FX historico** nao existe — snapshot de 60 dias atras recalcula `delta` em USD com taxa atual; valor original em moeda nativa e perdido (HIGH-3).

A pergunta central: **como evoluir do modelo de banca unica para um modelo multi-carteira que preserve auditoria e adicione FX historico imutavel sem quebrar Tournament Selector e Coach AI?**

### Restricoes

- **Compatibilidade reversa.** Tournament Selector e Coach AI consumem `consolidatedUSD` via `GET /api/bankroll`. Nao podem quebrar.
- **Auditabilidade enterprise.** Invariantes ADR-017 (`snapshot[n+1].previous == snapshot[n].new`) preservadas, agora **por wallet**.
- **FX historico imutavel.** Cada wallet_transaction guarda a cotacao do momento (`fxRateUSDPerNative`). Mudar `user_settings.exchangeRates` de 5.0 para 4.5 NAO recalcula tx antigas — auditoria, IR e ROI verdadeiro exigem isso.
- **Atomicidade obrigatoria.** Update de `wallets.balance` + INSERT em `wallet_transactions` em UMA transacao com SELECT FOR UPDATE.
- **Limite hard de 50 wallets/user** (warning em 20). Restricao de produto: superficie UX vira inviavel acima disso.
- **`fx_rate` consistente com ADR-033.** `fxRateUSDPerNative = ccy units per 1 USD`. `usdAmount = nativeAmount / fxRateUSDPerNative`.
- **DELETE de wallet recusado (405).** Apenas archive (status='archived'). Auditoria/IR exige preservacao perpetua.

## Opcoes Consideradas

### Opcao A: 2 tabelas novas (`wallets` + `wallet_transactions`) + `wallet_pending` reservada (ESCOLHIDA)

Modelo:

| Tabela | Papel |
|---|---|
| `wallets` | Estado autoritativo: `id`, `userId`, `name`, `platform`, `nativeCurrency`, `balance` (espelho do ultimo `wallet_transactions.newNativeBalance`), `status`, `bankrollRule`, `isShotPocket`, etc. |
| `wallet_transactions` | Ledger imutavel por wallet. Cada movimento e linha com `nativeAmount`, `nativeCurrency`, `fxRateUSDPerNative` (IMUTAVEL pos-insert), `usdAmount`, `previousNativeBalance`, `newNativeBalance`, `reason`, `direction`. |
| `wallet_pending` | **Reservada** (estrutura criada, sem comportamento) para spec futura: saques/depositos em transito. |
| `bankroll_snapshots` | **Mantida** (compat v1) com 4 colunas nullable adicionais (`walletId`, `nativeAmount`, `nativeCurrency`, `fxRateUSDPerNative`). |
| `user_settings` | 2 colunas adicionais: `bankrollAggregationMode` ('global' default | 'per_wallet'), `bankrollDisplayCurrency` ('USD' default | 'BRL' | etc.). |

`balance` em `wallets` e ESPELHO autoritativo do ultimo `wallet_transactions.newNativeBalance` para a wallet. Recomputa-se em transacao apos cada tx. Permite query barata para listagens (sem agregar tx).

**Pros:**
- **Movimentos por wallet sao naturais.** Aporte BRL na Suprema, saque USD em GG, transferencia entre wallets — cada um e linha em `wallet_transactions` da wallet certa, com FX da hora.
- **FX historico imutavel garantido por design.** `fxRateUSDPerNative` e `decimal NOT NULL` no insert; trigger ou validacao no service-layer rejeita UPDATE. Tx antiga preserva cotacao da epoca para sempre.
- **Auditabilidade equivalente ao v1.** Invariante ADR-017 transposta: `wallet_transactions[N+1].previousNativeBalance == wallet_transactions[N].newNativeBalance` por `walletId` ordenado por `occurredAt`. Detector SQL trivial.
- **Performance previsivel.** GET wallet -> 1 row em `wallets` (via PK). GET history -> indice `(walletId, occurredAt DESC)`, paginado. Nao agrega tx para mostrar saldo.
- **Modos de agregacao expressam realidade.** `global` (banca consolidada em USD, mantem mental model v1), `per_wallet` (cada wallet com sua propria regra — futuro Tournament Selector mode), `shot_pocket` (wallet com `isShotPocket=true` excluida do calculo core — pocket de high roller localizado).
- **Compatibilidade Sprint 1/Coach AI.** `GET /api/bankroll` legado vira wrapper sobre `getConsolidatedBalance(userId)`. Tournament Selector e Coach AI continuam consumindo o mesmo shape.
- **Schema preparado para specs futuras** sem schema delta pesado: `transferGroupId` reserva transferencia cross-wallet, `stakingDealId` reserva Sprint Bankroll-3, `wallet_pending` reservada para saque em transito.
- **DELETE por design impossivel.** Endpoint retorna 405. Archive preserva tudo.

**Contras:**
- **3 tabelas novas + 6 colunas adicionais em existentes.** Migration robusta necessaria.
- **`balance` em `wallets` e redundante com soma de `wallet_transactions`.** Risco de drift se algum write escapar do service. Mitigado por: (a) toda mutacao passa por `walletService.recordWalletTransaction`; (b) detector SQL `wallet.balance == ultimo wallet_transactions.newNativeBalance` por wallet.
- **Migration v1->v2 cria 1 wallet "default" por usuario** (ADR-035 trata). Custo cognitivo de transicao para usuario existente.
- **UI 2-paineis (sidebar de wallets + detalhe)** e novidade no projeto; mobile precisa colapsar.

### Opcao B: Tabela unica `bankroll_snapshots` com `walletId` (sem tabela `wallets`)

Estender `bankroll_snapshots` com colunas (walletId, nativeAmount, nativeCurrency, fxRate, etc). Sem tabela `wallets` separada — derivar metadata (nome, platform, status) de uma `wallet_metadata` simples ou inferir da ultima tx.

**Pros:**
- 1 tabela menos.
- Reusa schema existente.

**Contras:**
- **`balance` por wallet vira agregacao em cada query.** GET wallets -> agrega `SUM(delta) GROUP BY walletId` toda vez. Performance degrada com volume.
- **Status (`active/archived`) vira outro campo derivado.** Forca migration adicional.
- **Mistura concerns.** `bankroll_snapshots` era ledger global (Sprint 2 v1) — virar ledger por wallet mistura compat v1 com modelo novo. Confunde queries.
- **Rejeitada por performance + clareza arquitetural.**

### Opcao C: Multi-wallet sem FX historico (FX recalcula sempre)

`wallets` + `wallet_transactions` com apenas `nativeAmount` (sem `fxRateUSDPerNative`). Conversao para USD em cada query usando `user_settings.exchangeRates` atual.

**Pros:**
- Schema mais simples.
- Sem coluna imutavel.

**Contras:**
- **HIGH-3 do plano nao e resolvido.** ROI calculado em USD bruto continua se ajustando com FX atual. IR + audit + ROI verdadeiro impossiveis.
- **Tx de janeiro com cotacao 5.5 BRL/USD reinterpretada em abril com 5.0 BRL/USD muda valor historico** — relatorio mensal contradiz mes anterior.
- **Vacuo de mercado mantido.** Benchmark do plano mostra que NENHUM app tem FX historico — diferencial estrategico do Grindfy seria perdido.
- **Rejeitada por traicao do diferencial e por ferir credibilidade financeira.**

### Opcao D: 1 tabela por moeda (USD wallets, BRL wallets, etc.)

`wallets_usd`, `wallets_brl`, `wallets_eur`, etc. Cada uma com tipos especificos.

**Pros:**
- Type safety por moeda.

**Contras:**
- **Explosao de tabelas.** N moedas = N tabelas. Cada nova moeda exige migration.
- **Queries multi-moeda viram UNION feio.** `getConsolidatedBalance` precisa juntar todas as tabelas.
- **Schema delta a cada nova moeda** (USDT, BTC, novas). Custo de manutencao alto.
- **Rejeitada — overengineering, hostil a evolucao.**

## Decisao

**Adotar Opcao A: 3 tabelas (`wallets` + `wallet_transactions` + `wallet_pending` reservada) com FX historico imutavel em cada `wallet_transaction` + 6 colunas adicionais em tabelas existentes (`bankroll_snapshots`, `user_settings`).**

### Detalhes-chave do design

1. **`wallets.balance` e ESPELHO autoritativo.**
   - Atualizada em transacao apos cada `wallet_transactions` insert.
   - Invariante: `wallet.balance == ultimo wallet_transactions.newNativeBalance` por walletId.
   - Detector SQL: `SELECT w.id FROM wallets w WHERE w.balance != (SELECT newNativeBalance FROM wallet_transactions WHERE walletId = w.id ORDER BY occurredAt DESC LIMIT 1);` deve retornar 0 rows.

2. **`fxRateUSDPerNative` e IMUTAVEL pos-insert.**
   - Validacao no service-layer (`walletService.recordWalletTransaction`): nunca expoe API de UPDATE.
   - Convencao ADR-033: `usdAmount = nativeAmount / fxRateUSDPerNative`.
   - Para `nativeCurrency='USD'`: `fxRateUSDPerNative = 1.0` sempre.

3. **Toda mutacao em `wallet_transactions` em UMA transacao.**
   - SELECT FOR UPDATE em `wallets` para serializar concorrencia.
   - Calcula `prev = balance`, `next = direction='in' ? prev + nativeAmount : prev - nativeAmount`.
   - Pega FX corrente: `user_settings.exchangeRates[ccy] ?? DEFAULT_EXCHANGE_RATES[ccy]`.
   - INSERT em `wallet_transactions` com `previousNativeBalance, newNativeBalance, fxRateUSDPerNative`.
   - UPDATE `wallets.balance = next, updatedAt = now()`.
   - Cria entrada espelho em `bankroll_snapshots` (compat v1) com `walletId`, `nativeAmount`, `fxRateUSDPerNative`, `delta` em USD.
   - **Recusa em wallet `archived`** (409 Conflict).

4. **Modos de agregacao em `user_settings.bankrollAggregationMode`:**
   - **`global`** (default): banca = sum(`wallet.balance / FX(ccy)`) para `status='active' AND isShotPocket=false`. Aplica regra global. `maxBuyIn = total_USD * rulePct%`.
   - **`per_wallet`**: cada wallet tem sua regra (`wallets.bankrollRule` override). Tournament Selector mode `per_wallet` (vira spec separada) usa `wallets[platform=X].balance * wallet.bankrollRule`.
   - **shot pockets**: wallet com `isShotPocket=true` nunca entra no calculo core. Listada separadamente em `getConsolidatedBalance`.

5. **`getConsolidatedBalance(userId)` retorna shape unico para todos os modos.**
   ```
   { totalUSD, totalDisplayCurrency, displayCurrency, byWallet: [...], shotPockets: [...] }
   ```
   Cache em memoria por userId, TTL 30s, invalida em qualquer mutacao de wallet.

6. **`GET /api/bankroll` (legado) vira wrapper sobre `getConsolidatedBalance`.**
   - `amount = totalUSD`, `currency = "USD"`, `rule = user_settings.bankrollRule`.
   - Adiciona campo NOVO `aggregationMode` + `walletCount` para clientes que ja saibam.
   - Tournament Selector e Coach AI continuam funcionando sem mudanca.

7. **Limite hard de 50 wallets/usuario** (resposta a open question 1).
   - Validacao no `walletService.createWallet`: `count(wallets WHERE userId=X) < 50`.
   - Acima: 400 com mensagem `"Limite de 50 carteiras atingido. Arquive carteiras nao utilizadas."`
   - Warning em 20 wallets (resposta no payload com `warnings: ['approaching_wallet_limit']`).

8. **Archive de wallet com `balance != 0` permitido com warning** (resposta a open question 2).
   - PATCH `/api/wallets/:id/archive` aceita; retorna `warning: "wallet_archived_with_balance"`.
   - UI exige confirmacao destrutiva (modal botao vermelho).
   - Wallet preservada perpetuamente; pode ser desarquivada em sprint futuro (fora deste P0).

9. **Reservas de schema sem comportamento P0.**
   - `wallet_transactions.transferGroupId`: P1 (transferencia cross-wallet).
   - `wallet_transactions.stakingDealId`: Sprint Bankroll-3 (staking).
   - `wallet_pending`: tabela criada com estrutura final mas zero comportamento (insert/list bloqueados em P0). Spec futura ativa.
   - Reasons P0: `deposit, withdrawal, session_result, manual_adjustment`. Reasons P1+ existem no schema mas endpoint POST recusa em P0.

10. **DELETE retorna 405.** Mensagem: "Wallets nao podem ser deletadas. Use PATCH /archive para preservar historico."

11. **`isShotPocket=true` exclui da consolidacao core.**
    - Listado em `shotPockets[]` separado em `getConsolidatedBalance`.
    - Tournament Selector NAO considera shot pockets em filtro `bankrollFilter` global (decisao de produto: dinheiro de shot e segregado por design).

### QUESTAO ABERTA: Tournament Selector mode `per_wallet`

Resposta do founder (open question 3): **fora deste sprint**. Spec separada. Em P0, `per_wallet` aceita ser SETADO em settings mas Tournament Selector continua filtrando por `consolidatedUSD` em modo global. UI exibe banner: "Modo per_wallet ativo, mas filtro do Tournament Selector ainda usa banca consolidada — aguardando feature."

### QUESTAO ABERTA: Auto-snapshot pos-sessao

Fora do P0. Quando spec futura entrar, `walletService.recordWalletTransaction` aceita `reason='session_result'` + `sessionId`. P0 ja suporta no schema mas endpoint POST aceita reason `session_result` apenas se sessionId for valido (FK check).

## Consequencias

### Positivas
- **Mental model alinhado com a realidade do MTT pro brasileiro.** N redes, N moedas, N regras se desejado.
- **FX historico imutavel** resolve HIGH-3 do plano. Auditoria, IR e ROI verdadeiro viaveis.
- **Auditabilidade equivalente ao v1.** Invariante ADR-017 preservada por wallet.
- **Compatibilidade Sprint 1/Coach.** Wrapper de `GET /api/bankroll` mantem contratos.
- **Schema preparado para specs futuras** (transferencia, pending, staking) sem novas tabelas.
- **Concentracao de risco visivel.** Por wallet, usuario ve "55% da banca esta na Suprema" — abre porta para spec futura de rebalanceamento sugerido.
- **Vacuo de mercado endereco.** FX historico + multi-wallet + FX consistente = combo unico no benchmark.

### Negativas
- **3 tabelas novas + 6 colunas adicionais** em existentes. Migration robusta + tests de regressao.
- **`balance` redundante com soma das tx.** Risco de drift; mitigado por detector SQL e disciplina de service-layer.
- **Migration v1->v2** cria wallet default por usuario. Onboarding tooltip explicita; aceitacao via ADR-035.
- **UI 2-paineis** novidade. Pode confundir mobile; layout responsive obrigatorio.
- **Schema preparado para specs futuras** = colunas nullable extras desde o P0 (`transferGroupId`, `stakingDealId`). Custo de storage trivial.
- **Tests legados de bankroll v1 quebram.** Esperado; atualizados no PR.

### Neutras
- **`wallet_pending` criada sem comportamento** ate spec futura. Tabela vazia ate la — custo zero.
- **DELETE 405** e divergencia de RESTfullness convencional. Justificada por audit trail obrigatorio.
- **Cache de `getConsolidatedBalance` TTL 30s** — drift aceitavel para escala atual.
- **Limites 50/20 wallets** sao escolha de produto, nao tecnica. Revisaveis em sprints futuros se demanda real surgir.

## Confianca

**Alta** para o P0. Padrao classico de modelagem multi-tenant com FX historico (sistemas de pagamento, contabilidade enterprise, exchanges fazem assim). Risco principal — concorrencia gerar race em `balance` — mitigado por SELECT FOR UPDATE + tests de stress (10 tx simultaneas em uma wallet). Reversibilidade: rollback via ADR-035 (drop de colunas novas, manutencao de `bankroll_snapshots` intocados).

## Referencias

- Spec principal: `Docs/specs/bankroll-v2-multi-wallet-foundation.md` (RF-01 ate RF-14).
- Plano estrategico: `Docs/strategy/bankroll-v2-plan-2026-04-25.md`, secoes 4 (modelo de dados) e 5 (priorizacao ICE).
- ADR-017 (companion): `bankroll_snapshots` invariantes — preservadas e adaptadas por wallet.
- ADR-018 (companion): tolerancia 1.5x hardcoded — preservada em modo global.
- ADR-033 (pre-requisito): convencao FX `units per 1 USD` — todo `fxRateUSDPerNative` segue.
- ADR-035 (companion): compatibilidade v1->v2 e migracao de snapshots.
- Diagramas: `Docs/architecture/data-model/bankroll-v2.md`, `Docs/architecture/flows/bankroll-multi-wallet.md`, `Docs/architecture/c4/component-bankroll.md`.
- Open questions resolvidas: (1) limite 50 wallets warning 20, (2) archive com balance != 0 permite com warning, (3) Tournament Selector per_wallet vira spec separada.
