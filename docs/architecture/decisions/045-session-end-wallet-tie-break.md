# ADR-045: Session-end reconciliation — site-to-wallet tie-break policy

## Status
Proposto

## Data
2026-04-27

## Contexto

A spec `Docs/specs/session-end-reconciliation-v2.md` (RF-02 e RF-03) introduz o helper server-side `mapSiteToWallet(site, wallets)` para resolver, no fim da sessao de grind, qual wallet deve receber o `expectedDelta` derivado de cada `session_tournament`.

A maioria dos casos eh trivial: um site (ex `BlackChip`) tem exatamente 1 wallet ativa do mesmo `platform` ("WPN"). O delta inteiro vai para essa wallet, sem ambiguidade.

Existe, porem, um caso real e recorrente do publico-alvo (jogadores profissionais MTT) que exige decisao explicita: o jogador mantem **2+ wallets ativas para o mesmo site**. Cenarios:

- **Wallet principal + reserva** — o jogador divide saldo entre uma wallet "BlackChip Main" (operacional) e uma "BlackChip Reserve" (cofrinho fora do giro diario). Buy-ins durante a sessao saem das duas dependendo do contexto, mas o `session_tournaments.site` eh um unico string ("BlackChip") sem indicar a wallet de origem.
- **Wallet por moeda** — futuro caso onde um site oferece BRL e USD (ex PokerStars.BR vs PokerStars.com). Ate ter coluna `currency` em `session_tournaments` (out-of-scope da spec), as duas matcheiam pelo mesmo `platform`.
- **Wallet por contexto fiscal** — jogador mantem wallet "BlackChip CNPJ" e "BlackChip Pessoa Fisica" para separar movimentacao contabil. Mesmo site, duas wallets ativas.

A v1 da spec de reconciliacao (`Docs/specs/session-end-wallet-reconciliation.md`, ADR-040) nao enderecou esse caso — assumia 1-1 implicitamente porque filtrava wallets por `wallet_transactions.session_id` (logica que sempre retornava vazio em producao, P1). A v2 expoe o problema de frente: preciso decidir como dividir `expectedDelta` quando 2+ wallets ativas tem `platform === group(tournament.site)`.

## Decisao

Quando `mapSiteToWallet(site, wallets)` retorna 2 ou mais wallets candidatas (todas ativas, todas com `platform` no mesmo grupo do site apos normalizacao via `SITE_ALIASES`), o helper `calculateExpectedDeltaPerWallet` distribui o `expectedDelta` agregado dos `session_tournaments` daquele site **proporcionalmente ao saldo atual de cada wallet candidata**.

Pseudocodigo:

```
candidates = mapSiteToWallet(site, wallets)
if candidates.length === 0:
    contribution_total -> orphanContribution[currency]
elif candidates.length === 1:
    contribution_total -> candidates[0].expectedDelta
else:
    sumBalances = Σ candidates.map(w => w.balance)
    if sumBalances === 0:
        weight_i = 1 / candidates.length        // distribui igualmente
    else:
        weight_i = candidates[i].balance / sumBalances
    candidates[i].expectedDelta += contribution_total * weight_i
```

A divisao acontece **antes** da conversao de moeda (cada wallet ja recebe sua parte na moeda nativa do site, depois cada parte eh convertida para `wallet.nativeCurrency` se necessario, conforme RF-02).

O `WalletReconciliationDialog` (RF-05) renderiza ambas linhas com seus `expectedDelta` proporcionais pre-calculados. O jogador edita `reportedBalance` independente em cada — o dialog continua sendo a verdade de campo final. O `manualAdjustment` por wallet captura qualquer divergencia entre a distribuicao proporcional e a realidade.

## Consequencias

### Positivas

- **Aproxima realidade quando o jogador mantem proporcao estavel** entre wallets do mesmo site. Ex: 70% main + 30% reserva — distribuicao proporcional acerta a media e o `manualAdjustment` fica perto de zero.
- **Sem friccao adicional de UX** — nao introduz dialog extra antes do reconcile, nao exige que o jogador rotule cada torneio com walletId no momento do registro.
- **Determinista e reproduzivel** — duas execucoes do mesmo helper com o mesmo input retornam o mesmo `expectedDelta` distribuido. Snapshot em `session_wallet_snapshots` (ADR-046) preserva os pesos aplicados.
- **Editavel pelo jogador** — qualquer divergencia entre a heuristica e a realidade eh corrigida no input "Saldo final reportado" do dialog. `manualAdjustment` documenta o desvio.
- **Sem custo de migration** — politica vive no helper puro, nao toca schema.

### Negativas

- **Snapshot pode divergir do real ate o jogador editar** — se 90% dos buy-ins reais sairam da wallet "BlackChip Main" mas as duas wallets tinham saldos parecidos, a distribuicao 50-50 do helper mente sobre a realidade ate o jogador corrigir manualmente.
- **Heuristica pode "sumir" em wallets com saldo proximo de zero** — wallet recem-zerada ganha peso quase nulo. Se foi justamente a wallet onde o jogador depositou e jogou nessa sessao, o `manualAdjustment` precisa absorver tudo. Mitigacao: o dialog deixa esse caso visivel via label "+R$ X (extra nao registrado)".
- **Caso `sumBalances === 0`** (todas wallets candidatas zeradas) — fallback para distribuicao igualitaria, que tambem pode mentir. Mitigacao: idem (manualAdjustment).
- **Politica nao se ajusta automaticamente para preferencias do jogador** — quem prefere "tudo na main" precisa editar todo fim de sessao. Possivel evolucao futura: campo `defaultWalletId` por platform em `users` ou `wallets`.

### Neutras

- O dialog deixa explicito ao jogador o `expectedDelta` por wallet (verde/vermelho/cinza) e o `expectedClosingBalance` pre-calculado. A semantica de "delta esperado vs ajuste manual" fica visivel — nao eh caixa-preta.
- Caso futuro de `defaultWalletId` ou tagging por torneio (out-of-scope) substitui esta politica sem quebrar dados — `session_wallet_snapshots` continua imutavel.

## Alternativas Consideradas

### (b) Primeira por `createdAt` ASC (wallet mais antiga concentra delta)

- **Pros:** trivial de implementar (1 linha, sem peso). Determinista e estavel ao longo do tempo.
- **Contras:** arbitrario do ponto de vista do jogador. Se a "BlackChip Main" foi criada DEPOIS da "BlackChip Reserve", toda sessao a Reserve recebe os 100% do delta, forcando edicao manual sempre. Fere o principio "evite trabalho que o pre-calculo deveria poupar".
- **Veredito:** rejeitado — nao melhora UX em relacao a fazer o jogador escolher a cada vez.

### (c) Usuario decide na hora (1 dialog extra antes do reconcile)

- **Pros:** politica mais "correta" — o jogador eh a unica fonte de verdade sobre divisao real.
- **Contras:** introduz friccao alta no caso comum (jogador com 1 wallet por site, que eh a maioria). Dialog extra so faz sentido para 2+ candidatas, mas adiciona ramo de UX e estado a uma sequencia ja densa (confirmation -> summary -> reconcile). Risco de churn de fim de sessao.
- **Veredito:** rejeitado — custo de UX alto; a opcao (a) ja entrega 80% do valor sem o dialog extra.

### (d) Marcar `walletId` em `session_tournaments` no momento do buy-in

- **Pros:** elimina o problema na raiz — cada torneio ja sabe sua wallet.
- **Contras:** muda o fluxo de buy-in (`AddTournamentDialog`, `RegisteredCard`, copy-on-promote planned->session em `GrindSessionLive.tsx:1314-1321`). Requer migration de schema (`session_tournaments.wallet_id`), back-fill de dados antigos, e UX nova de selecao de wallet em todos os pontos de entrada. Out-of-scope da spec atual (que ja cobre 5 endpoints + 1 tabela nova + 12 RFs).
- **Veredito:** considerado para sprint futura — a politica proporcional desta ADR vive bem ate la, e quando (d) aterrissar, esta ADR fica deprecated com substituto explicito.

### (e) Distribuir igualmente entre candidatas (1/N para cada)

- **Pros:** simples, sem estado.
- **Contras:** ainda mais arbitrario que (b) quando os saldos sao desiguais. Wallet com 5% do saldo total recebe os mesmos 50% do delta — mente sobre realidade tipica.
- **Veredito:** rejeitado, mas reusado como fallback explicito quando `sumBalances === 0` (ja descrito na Decisao).

## Referencias

- Spec: `Docs/specs/session-end-reconciliation-v2.md`, RF-02 e RF-03.
- ADR companheiro: `045-session-end-wallet-tie-break.md` (esta), `046-session-wallet-snapshots-table.md` (persistencia).
- ADR-040: spec v1 arquivada (predecessora).
- ADR-033: convencao de FX (`exchangeRates` em units-per-USD), aplicada a parte da contribuicao em moeda nativa apos a divisao.
- ADR-038: optimistic concurrency em `wallet_transactions` (preservada na reconciliacao).
- ADR-017: ledger imutavel — snapshots e tx geradas pela reconciliacao seguem o mesmo principio.
