# ADR-035: Compatibilidade v1->v2 e Migracao de Snapshots

## Status
Aceito

## Data
2026-04-25

## Contexto

O Bankroll v1 (Sprint 2) esta deployed e tem usuarios ativos. Estes usuarios tem:
- `user_settings.bankrollAmount > 0` (saldo configurado em USD).
- `bankroll_snapshots` com historico de movimentacoes (deposits, withdrawals, manual_adjustments) referenciando `userId`.
- Tournament Selector e Coach AI consumindo `GET /api/bankroll` para filtros e respostas.

O Sprint Bankroll-2 introduz **multi-wallet** (ADR-034). Cada usuario sera modelado como N wallets em vez de banca unica. A pergunta central: **como migrar usuarios existentes para o modelo multi-wallet sem quebrar audit trail nem comprometer consumidores externos (Tournament Selector, Coach AI)?**

### Restricoes

- **Audit trail intocavel.** Snapshots existentes em `bankroll_snapshots` sao a fonte da verdade do que aconteceu na banca v1. Migration NAO pode deletar nem reescrever esses dados.
- **Tournament Selector e Coach AI** consomem `GET /api/bankroll`. Migration NAO pode quebrar o contrato publico desse endpoint.
- **BankrollWidget legado** (frontend Sprint 2) renderiza estado v1. Apos migration, deve continuar funcionando — usuario nem precisa abrir `/bankroll` (pagina nova) para ver banca.
- **Idempotencia.** Migration roda manualmente em deploy; re-execucao nao deve criar wallets duplicadas.
- **Rollback disponivel.** Se migration der problema parcial, rollback restaura estado pre-v2 sem perder snapshots.
- **Performance:** rodar para ~1000 usuarios em <2 minutos (aceitavel — operacao manual unica).

## Opcoes Consideradas

### Opcao A: Migration one-shot cria 1 wallet `Default USD` + backfill `walletId` em snapshots existentes (ESCOLHIDA)

Para cada usuario com `bankrollAmount > 0`:
1. Verificar idempotencia: `SELECT 1 FROM wallets WHERE userId=X` — se existe, pular.
2. Em UMA transacao por usuario:
   - INSERT em `wallets`: `name='Banca Padrao USD'`, `platform='GenericUSD'`, `nativeCurrency='USD'`, `balance=user_settings.bankrollAmount`, `status='active'`, `isShotPocket=false`.
   - UPDATE em `bankroll_snapshots WHERE userId=X AND walletId IS NULL SET walletId=defaultWallet.id` — backfill retroativo.
   - **NAO criar `wallet_transactions` espelho dos snapshots.** Snapshots existentes JA sao o ledger v1; criar tx de migracao duplicaria audit trail.
3. Log estruturado: `{userId, walletId criada, snapshotsBackfilled, originalBankrollAmount}`.
4. `userSettings.bankrollV2Migrated = true` (flag para idempotencia rapida).

`GET /api/bankroll` legado vira wrapper:
```
const consolidated = walletService.getConsolidatedBalance(userId);
return {
  amount: consolidated.totalUSD,
  currency: 'USD',
  rule: userSettings.bankrollRule,
  ...rest_of_v1_shape,
  aggregationMode: userSettings.bankrollAggregationMode, // novo
  walletCount: consolidated.byWallet.length, // novo
};
```

**Pros:**
- **Audit trail preservado.** `bankroll_snapshots` continua intocado como ledger global v1; os pre-v2 ficam com `walletId` retroativo apontando para a default wallet (passam a ser legiveis no contexto v2).
- **Sem duplicacao.** Snapshots e wallet_transactions nao sobrepoem. Snapshots = audit historico (v1 + retro-backfilled); wallet_transactions = ledger pos-v2 por wallet.
- **Idempotente por design.** Re-execucao detecta wallet existente e pula. `bankrollV2Migrated` flag torna o check trivial.
- **Tournament Selector / Coach AI continuam funcionando** sem qualquer mudanca de codigo no consumidor — `GET /api/bankroll` mantem shape v1 + 2 campos adicionais (compativel com clients que ignorem campos nao reconhecidos).
- **Rollback tratavel.** Drop colunas novas + UPDATE `bankroll_snapshots SET walletId=NULL WHERE source_marker_v2 = true` restaura estado pre-v2 sem tocar em snapshots originais.
- **Performance previsivel.** Transacao por usuario; ~1000 usuarios em <2min.
- **Cobertura UX.** Onboarding tooltip na primeira visita pos-migration: "Voce tinha banca de $X em USD. Criamos uma carteira 'Banca Padrao USD' automaticamente. Adicione mais carteiras para refletir cada plataforma."

**Contras:**
- **Backfill de `walletId` em snapshots e operacao destrutiva por linha.** Se rollback for necessario, precisa flag `migrationBackfilled` para reverter so o que foi tocado. Mitigado por log estruturado por snapshot.
- **`userSettings.bankrollAmount` continua sendo cache autoritativo em v1.** Em v2, tecnicamente redundante com `sum(wallets.balance)`. Decisao: mantido como espelho — atualizado pelo wallet service em cada mutacao da default wallet (ou da unica wallet em modo single-wallet). Em sprint futuro pode ser removido apos verificacao de que ninguem mais consome.

### Opcao B: Migration cria wallet + 1 `wallet_transaction` "migration_v1" inicial replicando o saldo

Mesmo de A, mas adicionalmente: INSERT em `wallet_transactions` com `reason='migration_v1'`, `direction='in'`, `nativeAmount=bankrollAmount`, `previousNativeBalance=0`, `newNativeBalance=bankrollAmount`. Ledger comeca limpo.

**Pros:**
- Ledger por wallet sem "buraco" no inicio.
- Auditoria mais simples se alguem consultar so `wallet_transactions`.

**Contras:**
- **Duplicacao do audit trail.** Snapshots existentes JA representam o saldo. Criar tx replicando dobra o evento — relatorio que combine snapshots + wallet_transactions ve o aporte 2x.
- **Conflita com invariante.** `wallet_transactions[N+1].previousNativeBalance == wallet_transactions[N].newNativeBalance` por walletId. Tx de migration vira N=0; OK ate aqui. Mas snapshots existentes nao tem `previousNativeBalance` no formato v2 — sao deltas USD agregados. Misturar os dois ledgers em audit cria confusao.
- **Rejeitada** por duplicar dado e por dificultar reconciliacao audit.

### Opcao C: Migration deleta snapshots v1 e cria wallet_transactions equivalentes

Para cada snapshot v1, criar `wallet_transaction` correspondente com `nativeAmount=delta * exchangeRates[USD]`, etc. Depois DELETE snapshots v1.

**Pros:**
- Modelo limpo apenas com `wallet_transactions`.
- Nao tem 2 ledgers.

**Contras:**
- **Destruir audit trail v1 e moralmente errado.** Snapshots deletados nao podem ser auditados em logs de IR antigos.
- **FX em snapshots v1 nao existe** — `delta` ja era em USD. Recriar `wallet_transaction` exige inferir `fxRateUSDPerNative` retroativo (impossivel para `manual_adjustment` que pode ter sido em qualquer moeda).
- **Operacao irreversivel.** Rollback teria que recriar snapshots a partir de wallet_transactions — possivel, mas complexo.
- **Rejeitada** por destruir dado historico e por inferencia retroativa de FX.

### Opcao D: Lazy migration on-first-access (em vez de one-shot batch)

Quando usuario chama `GET /api/bankroll` ou `GET /api/wallets`, se nao tem wallet, criar default na hora.

**Pros:**
- Sem script manual de deploy.
- Custo distribuido no tempo.

**Contras:**
- **Coach AI / Tournament Selector** podem chamar `GET /api/bankroll` antes do usuario abrir a UI. Migration ocorre em request quente — risco de lentidao ou erro durante peak.
- **Estado inconsistente entre requests concorrentes.** Dois requests simultaneos podem tentar criar wallet duplicada. Mitigavel com SELECT FOR UPDATE em `user_settings`, mas adiciona complexidade.
- **Sem visibilidade global** de quem foi migrado vs nao migrado. Difical telemetry e suporte.
- **Logs de migration espalhados** em runtime, nao em uma execucao concentrada — auditoria mais dificil.
- **Rejeitada** por concorrencia + observabilidade.

## Decisao

**Adotar Opcao A: migration one-shot cria 1 wallet `Default USD` por usuario; snapshots existentes recebem `walletId` retroativo SEM criar wallet_transaction de migracao; `GET /api/bankroll` legado vira wrapper sobre `getConsolidatedBalance`.**

### Detalhes-chave do design

1. **Script `server/scripts/migrate-v2-multi-wallet.ts`.**
   - SELECT users com `userSettings.bankrollAmount > 0 AND bankrollV2Migrated IS NOT TRUE`.
   - Para cada um:
     - SELECT FOR UPDATE em `user_settings` (lock).
     - SELECT count(wallets WHERE userId=X) — se > 0, marca `bankrollV2Migrated=true` e pula (idempotencia).
     - INSERT wallet com:
       - `name='Banca Padrao USD'`
       - `platform='GenericUSD'` (enum reservado para migration)
       - `nativeCurrency='USD'`
       - `balance=userSettings.bankrollAmount`
       - `status='active'`
       - `isShotPocket=false`
       - `displayOrder=0`
       - `bankrollRule=NULL` (usa default de `user_settings.bankrollRule`)
     - UPDATE `bankroll_snapshots SET walletId=defaultWallet.id WHERE userId=X AND walletId IS NULL`.
     - UPDATE `user_settings SET bankrollV2Migrated=true WHERE userId=X`.
     - COMMIT.
     - Log estruturado: `{userId, walletId, snapshotsBackfilled, originalAmountUSD, durationMs}`.
   - Roda em transacao por usuario (lock granular — limita raio de explosao).
   - `BANKROLL_V2_DRY_RUN=true` ativa modo dry-run (so log, sem escrita).

2. **Migration de schema (Drizzle):**
   - NOVO: `wallets`, `wallet_transactions`, `wallet_pending` (tabelas).
   - `bankroll_snapshots`: 4 colunas nullable adicionais (`walletId`, `nativeAmount`, `nativeCurrency`, `fxRateUSDPerNative`).
   - `user_settings`: 3 colunas (`bankrollAggregationMode='global'` default, `bankrollDisplayCurrency='USD'` default, `bankrollV2Migrated=false` default).
   - Indice `idx_bankroll_snapshots_wallet ON bankroll_snapshots(wallet_id)`.
   - `db:push` + script manual.

3. **NAO criar `wallet_transactions` durante migration.**
   - Snapshots existentes em `bankroll_snapshots` JA sao o ledger v1 do usuario.
   - Criar wallet_transaction "migration_v1" duplicaria audit trail.
   - Apos migration: snapshots v1 ficam acessiveis via `GET /api/bankroll/history` (compat); wallet_transactions ficam vazias ate primeira movimentacao pos-v2.

4. **`GET /api/bankroll` (legado) vira wrapper sobre `getConsolidatedBalance`.**
   - Le `consolidated = walletService.getConsolidatedBalance(userId)`.
   - Mapeia para shape v1: `{amount: consolidated.totalUSD, currency: 'USD', rule, rulePct, tolerance, softLimitUSD, hardLimitUSD, maxBuyInUSD, maxBuyInDisplay}`.
   - Adiciona campos NOVOS: `aggregationMode`, `walletCount`, `displayCurrency`.
   - `softLimit/hardLimit` computados em modo `global` (default). Em modo `per_wallet`, retorna `null` (cliente legado nao precisa ler — Tournament Selector default e `global`).

5. **`userSettings.bankrollAmount` mantido como espelho.**
   - Atualizado pelo `walletService` em cada mutacao da default wallet OU da unica wallet ativa do usuario.
   - Em mode `global`: espelha `consolidated.totalUSD`.
   - Em sprint futuro pode ser removido; manter por compat com BankrollWidget legado.

6. **Rollback estrategia (`server/scripts/rollback-v2-multi-wallet.ts`).**
   - DROP wallet criada com `platform='GenericUSD' AND createdAt < migration_cutoff_time` (filtro identifica criadas pela migration).
   - UPDATE `bankroll_snapshots SET walletId=NULL WHERE walletId=defaultWallet.id`.
   - UPDATE `user_settings SET bankrollV2Migrated=false`.
   - **NAO** dropar colunas novas (mantem schema; rollback so reverte dados).
   - Log estruturado por usuario revertido.

7. **Onboarding tooltip pos-migration** (UI).
   - Trigger: usuario migrado abre `/bankroll` pela primeira vez (detecta `bankrollV2Migrated=true` AND `lastBankrollPageVisitV2=null`).
   - Texto: "Voce tinha uma banca de $X em USD. Criamos automaticamente uma carteira 'Banca Padrao USD'. Voce pode adicionar carteiras adicionais para refletir cada plataforma (Suprema, GG, etc.)."
   - Marca `lastBankrollPageVisitV2=now()` apos primeiro dismiss.

8. **Detector de inconsistencia pos-migration.**
   - SQL diagnostico: `SELECT u.userPlatformId, us.bankrollAmount, w.balance FROM users u JOIN user_settings us ON ... LEFT JOIN wallets w ON ... WHERE us.bankrollV2Migrated=true AND ABS(us.bankrollAmount - w.balance) > 0.01`.
   - Esperado: 0 rows. Se >0, alerta admin (drift entre espelho e wallet).

### QUESTAO ABERTA: Usuario com snapshots corrompidos pre-existentes

Migration pode falhar em usuario com `bankroll_snapshots` em estado inconsistente (drift de invariante v1). **Decisao:** transacao por usuario isolada — usuario com erro fica em v1 (sem wallet, `bankrollV2Migrated=false`), proximo run da migration tenta de novo. Log + alerta admin para investigacao manual.

### QUESTAO ABERTA: Usuario sem `bankrollAmount` (nao configurou banca v1)

Usuario nunca configurou banca em v1 — `bankrollAmount IS NULL`. Migration pula esses usuarios. Quando abrirem `/bankroll` pos-v2, veem empty state com CTA "Criar primeira carteira" (fluxo de novo usuario).

## Consequencias

### Positivas
- **Audit trail v1 preservado intacto.** Snapshots ficam acessiveis para IR e auditoria.
- **Sem duplicacao de ledger.** Snapshots = historico v1 (com walletId retroativo); wallet_transactions = ledger pos-v2.
- **`GET /api/bankroll` legado mantem contrato.** Tournament Selector, Coach AI e BankrollWidget continuam funcionando sem mudanca.
- **Idempotente por design.** Re-execucao da migration e segura.
- **Rollback disponivel** sem perder snapshots originais.
- **Onboarding suave.** Tooltip explicita decisao automatica; usuario ganha contexto.

### Negativas
- **Snapshots v1 nao tem `nativeAmount`/`fxRateUSDPerNative` populados** — apenas `delta` em USD. Para FX historico real, so wallet_transactions pos-v2 contam. Aceitavel — historico v1 era em USD por design.
- **Backfill de `walletId` em N snapshots por usuario** e UPDATE pesado. Mitigado por: (a) operacao manual em janela de baixo trafico; (b) transacao por usuario evita lock global.
- **`userSettings.bankrollAmount` continua redundante** com sum(wallets.balance) ate sprint futuro. Custo de manutencao trivial.

### Neutras
- **`GET /api/bankroll` legado eternamente disponivel** ate decisao explicita de descontinuar. Marcado em docs como "v1 wrapper — preferir /api/bankroll/consolidated".
- **`platform='GenericUSD'`** e enum reservado para migration. UI permite editar wallet para uma plataforma especifica depois (ex: "Banca Padrao USD" -> "GG Network USD"). Documentado.
- **Usuario sem `bankrollAmount`** segue fluxo de novo usuario — sem wallet ate criar a primeira manualmente.

## Confianca

**Alta.** Padrao classico de migration multi-step com flag de idempotencia (`bankrollV2Migrated`) + transacao por usuario + log estruturado + rollback. Risco principal — backfill de `walletId` em prod com snapshots em estado inesperado — mitigado por dry-run, transacao isolada e log granular. Reversibilidade: total via script de rollback ate decisao de remover `userSettings.bankrollAmount` em sprint futuro.

## Referencias

- Spec principal: `Docs/specs/bankroll-v2-multi-wallet-foundation.md` (RF-08).
- ADR-017 (companion): `bankroll_snapshots` invariantes — preservados.
- ADR-033 (pre-requisito): convencao FX consistente.
- ADR-034 (companion): modelo multi-wallet.
- Plano estrategico: `Docs/strategy/bankroll-v2-plan-2026-04-25.md`, secao 6 (Riscos & Mitigacoes — "Migracao v1->v2 quebra usuarios existentes").
- Diagrama de migracao: `Docs/architecture/flows/bankroll-multi-wallet.md` (Fluxo B).
