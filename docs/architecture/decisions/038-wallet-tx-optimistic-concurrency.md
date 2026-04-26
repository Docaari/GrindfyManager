# ADR-038: Optimistic concurrency em wallet transactions via `expectedPreviousBalance`

## Status
Proposto

## Data
2026-04-26

## Contexto

A feature `wallet-balance-mode` (spec `Docs/specs/wallet-balance-mode.md`) adiciona um modo alternativo no `WalletTransactionDialog` em que o usuario reporta o **saldo final observado** da carteira (ex: "abri a sala apos a sessao e o saldo e R$ 1.247") em vez do **delta** do movimento. O cliente calcula localmente:

```
delta = novoSaldo - saldoConhecido
```

`saldoConhecido` e snapshot de `wallet.balance` capturado no momento em que o dialog abriu. Entre o `GET /api/wallets/:id` (que produziu `saldoConhecido`) e o `POST /api/wallets/:id/transactions` (que envia o delta derivado), outra fonte pode ter atualizado a wallet:

- Outra aba/dispositivo do mesmo usuario submetendo movimento concorrente.
- Auto-import de sessao de Grind (reservado em `bankroll_snapshots.sessionId`, abre porta para multiple writers).
- Script administrativo / ajuste backoffice.

Hoje o `walletService.recordWalletTransaction` (ADR-034) ja serializa concorrencia via `SELECT FOR UPDATE` em `wallets`, garantindo que dois writes nao corrompam `balance`. Mas isso **nao detecta drift semantico**: se o `delta` calculado pelo cliente baseou-se em `saldoConhecido = 1180` e nesse meio-tempo outra origem moveu a wallet para 1247, o backend aceita a transacao com delta como se fosse legitima — e o `newNativeBalance` fica errado pelo ponto de vista do usuario (que viu 1247 na sala, digitou 1247, mas o sistema calculou delta sobre 1180 stale).

A pergunta: **como detectar drift entre o saldo que o cliente assumiu e o saldo real no servidor antes de aplicar a transacao, sem quebrar callers existentes (modo "Movimento" classico, auto-snapshots de sistema, etc.)?**

### Restricoes

- **Backward-compat 100%.** Modo "Movimento" e clientes legados nao enviam `expectedPreviousBalance`. Comportamento atual nao pode mudar.
- **Invariante ADR-017 preservada.** `wallet_transactions[N+1].previousNativeBalance == wallet_transactions[N].newNativeBalance` por wallet.
- **Validacao DEPOIS do `SELECT FOR UPDATE`.** Para garantir leitura serializada (sem race entre check e write).
- **Toleravel a float drift.** `decimal` em PostgreSQL via Drizzle pode chegar como string ou number; comparacao precisa epsilon.
- **Sem nova coluna.** Solucao deve viver no service-layer + body do POST.

## Opcoes Consideradas

### Opcao A (ESCOLHIDA): Campo opcional `expectedPreviousBalance` validado dentro da TX

Body do POST aceita campo opcional `expectedPreviousBalance: number`. Quando presente, o service compara dentro da transacao (apos `SELECT FOR UPDATE`) com `parseDecimal(wallet.balance)` usando epsilon `0.01`. Divergencia → throw `makeError('balance_mismatch', 409)` com payload `{ currentBalance: parseDecimal(wallet.balance) }`. Sem o campo → comportamento atual preservado.

```ts
// dentro de walletService.recordWalletTransaction, apos SELECT FOR UPDATE:
if (typeof input.expectedPreviousBalance === 'number') {
  const actual = parseDecimal(wallet.balance);
  const expected = input.expectedPreviousBalance;
  if (Math.abs(actual - expected) > 0.01) {
    throw makeError('balance_mismatch', 409, { currentBalance: actual });
  }
}
```

**Pros:**
- **Detecta drift semantico real.** Cliente sabe imediatamente que seu `saldoConhecido` esta stale; pode refetch + recomputar preview de delta com baseline atualizado.
- **Backward-compat 100%.** Callers que nao enviam o campo (modo movement, scripts, auto-snapshot) continuam funcionando sem alteracao.
- **Validacao na transacao** garante que o check e o write sao atomicos — sem race entre "li 1180" e "vou escrever".
- **Invariante ADR-017 preservada.** Quando o check passa, o write subsequente continua mantendo `previousNativeBalance == ultimo newNativeBalance`.
- **Zero schema delta.** Solucao puramente de service-layer + Zod do endpoint.
- **Prepara terreno para auto-import de sessao.** Quando spec futura ativar escrita automatica de session_result via parser, a wallet vira multi-writer e o check `expectedPreviousBalance` fica disponivel para o frontend.

**Contras:**
- **Cliente precisa lidar com 409 com refetch+retry.** Adiciona handler de erro no `WalletTransactionDialog` (RF-06 da spec ja cobre).
- **Epsilon 0.01 escolhido arbitrariamente.** Justificativa: PostgreSQL `decimal(19,2)` arredonda para 2 casas; epsilon menor que isso seria inutil. Epsilon maior abriria janela para bugs reais passarem como "drift toleravel". 0.01 e o limite inferior util.

### Opcao B: Refetch no client antes do submit

Ao clicar Salvar, o cliente refaz `GET /api/wallets/:id`, recalcula delta e so entao envia o POST.

**Pros:**
- 0 mudanca no backend.

**Contras:**
- **Race ainda existe** entre o refetch e o POST — outra origem pode escrever entre os dois requests.
- **Forca round-trip extra** sempre, mesmo quando nao ha drift (custo previsivel para nenhum ganho na maioria dos casos).
- **Falsa sensacao de seguranca.** O bug fica raro, nao impossivel.
- **Rejeitada — nao resolve o problema, apenas o esconde estatisticamente.**

### Opcao C: Coluna `version` (ETag) na tabela `wallets`

Adicionar `version integer NOT NULL DEFAULT 0` em `wallets`, incrementar em cada UPDATE. POST envia `If-Match: <version>`; backend compara dentro da TX.

**Pros:**
- Padrao classico de optimistic locking.
- Contador monotonico — sem ambiguidade de epsilon.

**Contras:**
- **Mais codigo (migration + coluna + middleware) por ganho marginal.** Cardinalidade do check e identica a comparar `balance` direto: ambos acertam ou erram pelos mesmos motivos.
- **`balance` ja e um proxy natural de versao no dominio.** Toda mudanca de balance e uma "versao" semantica — versionar separado e indireto.
- **Migration extra para back-compat** (clientes antigos ignoram versao = falso positivo de "match").
- **Rejeitada — ganho marginal nao justifica overhead.**

### Opcao D: Sempre exigir `expectedPreviousBalance`

Tornar o campo obrigatorio. Body sem ele = 400.

**Pros:**
- Forca todos os callers a se proteger.

**Contras:**
- **Quebra backward-compat sem ganho real.** Callers de sistema (auto-snapshot, scripts, migrations) nao tem `expectedPreviousBalance` natural — teriam que ler antes de escrever, recriando o problema da Opcao B no servidor.
- **Modo "Movimento" classico nao precisa de protecao** (usuario digita +50 explicitamente; conceito de drift nao se aplica).
- **Rejeitada.**

## Decisao

Adotar **Opcao A**: aceitar campo opcional `expectedPreviousBalance: z.number().optional()` no body do `POST /api/wallets/:id/transactions`. Dentro de `walletService.recordWalletTransaction`, apos `SELECT FOR UPDATE` em `wallets`, comparar `parseDecimal(wallet.balance)` com `expectedPreviousBalance` usando epsilon `0.01`. Divergencia → throw `makeError('balance_mismatch', 409, { currentBalance: parseDecimal(wallet.balance) })`. Ausencia do campo → comportamento atual preservado.

### Detalhes-chave

1. **Epsilon 0.01 documentado.** Match com precisao `decimal(19,2)` da coluna; abaixo disso e ruido de serializacao numerica entre Drizzle e PostgreSQL.
2. **Erro tipado em handler.** Handler HTTP mapeia `'balance_mismatch'` para 409 com body `{ code: 'balance_mismatch', currentBalance: <number> }`.
3. **Frontend (RF-06):** ao receber 409, o dialog exibe alerta inline com `currentBalance`, oferece botao "Atualizar" → refetch da wallet → atualiza `saldoConhecido` → recomputa preview de delta mantendo `novoSaldo` digitado pelo usuario. Re-submit manual.
4. **Telemetria sugerida (futuro):** logar contador de 409 `balance_mismatch` por usuario para detectar concorrencia anomala (ex: bug de cache, multiple-tab abuse).
5. **Modo "Movimento" nao envia o campo.** Continua igual.

## Consequencias

### Positivas
- **Modo balance fica seguro contra drift.** Usuario que reporta saldo nunca cria delta mentiroso.
- **Prepara terreno para auto-import de sessao.** `bankroll_snapshots.sessionId` ja reservado (ADR-034) — quando spec futura ativar escrita automatica via parser, a wallet vira multi-writer e o frontend ja sabe lidar com 409.
- **Invariante ADR-017 mantida.** O check roda apos `SELECT FOR UPDATE`, dentro da mesma TX que faz o INSERT — `previousNativeBalance == ultimo newNativeBalance` continua valendo.
- **Backward-compat 100%.** Callers existentes (modo movement, migrations, scripts) nao tocados.
- **Zero schema delta.** Solucao puramente de service + Zod.

### Negativas
- **Cliente precisa lidar com 409 com refetch+retry.** Adiciona codigo no `WalletTransactionDialog` (RF-06 cobre — alerta inline + botao Atualizar).
- **Epsilon 0.01 escolhido arbitrariamente.** Documentado neste ADR; revisita se aparecerem bugs reais com diferenca de centavo.
- **Erros 409 podem confundir usuario na primeira ocorrencia.** Mitigado por copy clara no alerta ("O saldo da carteira mudou enquanto voce editava. Saldo atual: R$ X,XX.").

### Neutras
- **Sem custo de storage.** Nenhuma coluna nova.
- **Sem custo de CPU.** Comparacao numerica trivial dentro da TX.
- **Telemetria opcional.** Logar 409 e backlog; nao bloqueia P0.

## Confianca

Alta. Padrao classico de optimistic concurrency adaptado ao dominio (comparar valor autoritativo em vez de coluna `version` artificial). Reversibilidade: remover o check e a unica acao necessaria para rollback — nenhum dado migrado. Risco principal — epsilon mal calibrado gerar falso positivo — mitigado por testes com fixtures de `balance` ate centavo.

## Referencias

- Spec principal: `Docs/specs/wallet-balance-mode.md` (RF-04, RF-05, RF-06).
- ADR-017 (companion): invariantes de snapshot — preservadas pelo check intra-TX.
- ADR-034 (companion): modelo multi-wallet com FX historico — `wallet.balance` autoritativo + `SELECT FOR UPDATE` ja existem; este ADR adiciona check semantico em cima.
- Sequence: `Docs/architecture/flows/bankroll/sequence-wallet-tx-balance-mode.mermaid` — fluxo completo do balance mode com caminho 409.
