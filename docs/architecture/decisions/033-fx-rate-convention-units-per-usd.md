# ADR-033: Convencao oficial de `exchangeRates` — "unidades nativas equivalentes a 1 USD"

## Status
Aceito

## Data
2026-04-25

## Contexto

O Sprint 2 (Bankroll v1) entregou conversao de moeda em duas camadas distintas que **interpretam o campo `user_settings.exchangeRates` (jsonb) de formas inversas**, gerando o bug HIGH-2 do plano estrategico Bankroll v2:

| Camada | Codigo | Formula | Convencao implicita |
|---|---|---|---|
| Tournament Selector (Sprint 1) | `server/scoring/currencyNormalizer.ts:normalizeBuyInToUSD` | `usd = native * rate` | "USD por unidade nativa" (BRL=0.20 -> 1 BRL vale 0.20 USD) |
| Bankroll Widget (Sprint 2) | `server/services/bankrollService.ts:buildStateFromSettings` | `display.BRL = usdAmount * rate` | "unidades nativas por 1 USD" (BRL=5.0 -> 1 USD vale 5 BRL) |

**Sintoma visivel:** Com `DEFAULT_EXCHANGE_RATES.BRL = 0.20` (convencao do `currencyNormalizer`), o `BankrollWidget` mostra `1000 USD * 0.20 = 200 BRL` — 25x menor que o real (~5000 BRL). Usuario brasileiro com banca consolidada ve numero absurdo.

A pergunta central: **qual das duas convencoes deve ser canonica em todo o codebase?**

### Restricoes

- **Bug em producao.** Bankroll v1 ja esta deployed; Tournament Selector ja usa `currencyNormalizer` corretamente para filtrar torneios; nao podemos quebrar nenhum dos dois consumidores.
- **Pre-requisito do Sprint Bankroll-2.** A spec `multi-wallet-foundation` introduz `wallet_transactions.fxRateUSDPerNative` (FX historico imutavel). Construir multi-wallet em cima de FX bugado e moralmente errado e produz dado historico corrompido (ex: tx criada hoje com `fxRateUSDPerNative=0.20` ficaria eterna no ledger).
- **Migracao de dados existentes.** Usuarios que ja editaram `user_settings.exchangeRates` manualmente podem ter valores na convencao antiga (BRL=0.20). Migration heuristica deve corrigir SEM destruir dados manuais corretos (ex: cripto BTC=0.000015 e correto na nova convencao tambem).
- **Defaults sem entrada manual.** `DEFAULT_EXCHANGE_RATES` em `scoringConstants.ts` tem que estar na convencao canonica desde o primeiro deploy.

## Opcoes Consideradas

### Opcao A: Padronizar como "unidades nativas equivalentes a 1 USD" (ESCOLHIDA)

`exchangeRates[ccy] = N` significa: **1 USD vale N unidades de ccy**. Exemplo: `{BRL: 5.0, EUR: 0.92}`.

Formulas canonicas:
- **Native -> USD:** `usd = native / rate`
- **USD -> Native (display):** `native = usd * rate`

Acoes:
1. Inverter a formula do `currencyNormalizer.normalizeBuyInToUSD` para `amount / rate`.
2. Inverter `DEFAULT_EXCHANGE_RATES`: `BRL: 5.0`, `EUR: 0.92`, `GBP: 0.78`, etc.
3. `bankrollService.buildStateFromSettings` mantem formula atual (`display.BRL = usdAmount * rate`) — ja era correta nesta convencao.
4. Migration heuristica conservadora: para fiat majors com `rate < 1`, inverte (`newRate = 1 / rate`). Cripto (`rate < 1` e correto na nova convencao) nao toca.

**Pros:**
- **Leitura semantica natural para o usuario brasileiro.** "BRL=5.0" la em `user_settings.exchangeRates` = "dolar a 5 reais hoje". Bate com noticiario.
- **Permite UI futura de "editar cotacao manual"** sem necessidade de helper para inverter o numero antes de mostrar/salvar. Campo direto.
- **Cripto naturalmente funciona.** `BTC=0.000015` (~ 1 USD em BTC) ja segue a regra "unidades por 1 USD" sem caso especial.
- **`bankrollService` ja estava certo.** Apenas inverte o `currencyNormalizer` (1 funcao) + defaults. Codigo mais novo (Sprint 2) preservado.
- **Compativel com FX historico do Sprint Bankroll-2.** `wallet_transactions.fxRateUSDPerNative` armazena rate na mesma convencao — campo `usdAmount = nativeAmount / fxRateUSDPerNative` (formula consistente em todo lugar).
- **Funcao mais segura matematicamente.** `usd = native / rate` quando `rate > 0` nao pode dar overflow para amounts realistas. `usd = native * rate` em cenarios de cripto cara (`rate=70000` para BTC inverso) poderia, em casos extremos, criar valores absurdos.

**Contras:**
- **Migration unica de usuarios existentes.** Heuristica conservadora: so inverte fiat majors com `rate < 1` (BRL, EUR, GBP, CNY, JPY, ARS, MXN, CAD, AUD, CHF). Cripto e USD/USDT permanecem.
- **Risco de inverter rate manual ja correto na nova convencao.** Mitigado por: (a) heuristica so toca rates `< 1`; (b) dry-run obrigatorio antes do deploy; (c) log estruturado por usuario com snapshot do `before/after`; (d) script de rollback consultando logs.
- **Tests existentes do `currencyNormalizer` quebram.** Esperado e mapeado: `tests/unit/scoring/currencyNormalizer.test.ts`. Atualizados no PR junto com a implementacao.

### Opcao B: Manter convencao antiga ("USD equivalente a 1 unidade") e corrigir `bankrollService`

Manter `currencyNormalizer.normalizeBuyInToUSD` (`usd = native * rate`) e mudar `bankrollService.buildStateFromSettings` para `display.BRL = usdAmount / rate`.

**Pros:**
- Sprint 1 (Tournament Selector) sem mudanca alguma — codigo mais antigo preservado.
- Nao requer migration de defaults ou usuarios.

**Contras:**
- **`BRL=0.20` e contraintuitivo para o usuario brasileiro.** Quem edita manualmente espera digitar "5", nao "0.20". UI futura de "editar cotacao" exige helper para inverter antes de mostrar.
- **Cripto fica em caso especial.** `BTC` precisaria ser `66000` (USD por 1 BTC) na convencao antiga, OU `0.000015` (BTC por 1 USD) na nova — mas `66000` no `exchangeRates.BTC` confunde com "voce tem 66000 reais em BTC?" no widget de display.
- **`bankrollService` (Sprint 2) ja estava na convencao errada** segundo essa opcao — teria que reescrever o codigo mais novo. Inverte o sentido da escolha (preservar mais antigo).
- **Migration ainda necessaria** para defaults — `DEFAULT_EXCHANGE_RATES.BRL=0.20` e generated, e qualquer usuario que importe defaults (provavelmente todos) tem o bug.
- **Rejeitada** por inverter prioridade (codigo novo perdendo) e pela falta de naturalidade UX.

### Opcao C: Criar segundo campo `exchangeRatesUSDPerNative` separado (manter ambos)

Manter `exchangeRates` na convencao antiga + adicionar coluna nova `exchangeRatesUSDPerNative` na convencao nova. Cada consumidor le o que precisa.

**Pros:**
- Sem migration destrutiva.
- Sem mudanca de comportamento em codigo existente.

**Contras:**
- **Dois campos com a mesma informacao.** Risco de drift se um for atualizado e outro nao.
- **Triplica a logica de FX.** Cada novo consumidor tem que decidir qual campo ler. Documentacao confusa.
- **Sprint Bankroll-2 multiplica:** `wallet_transactions.fxRateUSDPerNative` virou `wallet_transactions.fxRate*` com decisao de qual versao usar. Imediatamente forca uma terceira convencao.
- **Rejeitada — overengineering.**

### Opcao D: Salvar ambos os formatos em jsonb estruturado

`exchangeRates: { BRL: { unitsPerUSD: 5.0, usdPerUnit: 0.20 }, ... }`

**Pros:**
- Cada consumidor le o campo que precisa.

**Contras:**
- **Schema mais complexo sem ganho real.** Drift entre os 2 numeros em uma mesma chave (impossibilita auditoria simples).
- **Validacao Zod fica feia.** Cada chave e objeto, nao numero — quebra UI atual de edicao.
- **Migration complica.** Precisa popular ambos os campos.
- **Rejeitada — overengineering.**

## Decisao

**Adotar Opcao A: padronizar `exchangeRates[ccy] = N` como "1 USD vale N unidades de ccy".**

### Detalhes-chave do design

1. **Convencao canonica unica em todo o codebase.**
   - `exchangeRates[ccy] = N` -> 1 USD = N unidades de ccy.
   - Native -> USD: `usd = native / rate`.
   - USD -> Native (display): `native = usd * rate`.
   - USD: `rate = 1.0` (no-op).
   - USDT: `rate = 1.0` (assumindo paridade).

2. **Defaults na nova convencao (referencia 2026-04-25).**
   ```
   USD: 1.0
   BRL: 5.0
   EUR: 0.92
   GBP: 0.78
   CNY: 7.20
   USDT: 1.0
   BTC: 0.000015
   ```

3. **Comentario unico no topo de `currencyNormalizer.ts` e `scoringConstants.ts`.**
   ```
   // FX CONVENTION: rates[ccy] = ccy units per 1 USD. See ADR-033.
   ```

4. **Migration heuristica conservadora** (`server/scripts/migrate-qw1-fx-convention.ts`):
   - Lista de fiat majors: `BRL, EUR, GBP, CNY, JPY, ARS, MXN, CAD, AUD, CHF`.
   - Para cada chave em `user_settings.exchangeRates`:
     - Se ccy in fiat_majors AND rate < 1.0: inverte (`newRate = 1 / rate`).
     - Se ccy in fiat_majors AND rate >= 1.0: nao toca (assumido ja correto).
     - Se ccy in cripto OR USD/USDT: nao toca (semantica especial).
     - Outras chaves: log + nao toca.
   - Roda em transacao por usuario (nao single transaction global).
   - `BANKROLL_QW1_DRY_RUN=true` ativa modo dry-run.
   - Snapshot completo do `exchangeRates` antes/depois e logado para rollback.

5. **Telemetria pos-deploy** (`bankrollService.getBankrollState`).
   - Se `state.exchangeRateBRL < 1.0`: emitir `console.warn('bankroll_fx_rate_suspect_legacy', {userId, ccy, rate})`.
   - Uma vez por sessao por usuario (Map em memoria).
   - Meta: zero ocorrencias 7 dias apos deploy.

6. **Cross-validation test obrigatoria em CI.**
   - Para cada moeda nas defaults: round-trip `native -> usd -> native` com erro relativo <= 0.001.
   - Garantia de que as duas formulas sao inversas exatas.

7. **Rollback disponivel** via `server/scripts/rollback-qw1-fx.ts` consultando os logs gravados pela migration.

### QUESTAO ABERTA: Cache do Tournament Selector apos mudanca de defaults

Tournament Selector tem cache TTL 30min keyed por (userId, filtros). Mudanca de `DEFAULT_EXCHANGE_RATES` no deploy afeta apenas usuarios sem `exchangeRates` populado (defaults aplicados em fallback). **Decisao:** invalidar cache do selector no script de migration (`selectorCache.invalidateAllForUser` para cada userId tocado). Aceitar drift de ate 30min para usuarios nao tocados pela migration (mas que dependem dos defaults).

### QUESTAO ABERTA: Trim de `currency` com whitespace

Bug pre-existente: `"BRL "` e tratado como diferente de `"BRL"`. Fora de escopo deste ADR. Documentar como divida tecnica.

## Consequencias

### Positivas
- **Mental model alinhado com noticiario brasileiro.** "Dolar a 5" = `BRL: 5.0`.
- **Codigo mais legivel.** Uma unica formula em todo lugar.
- **`bankrollService` (Sprint 2) preservado** — codigo mais novo nao precisa reescrita.
- **FX historico do Sprint Bankroll-2 fica consistente.** `wallet_transactions.fxRateUSDPerNative` segue a mesma convencao.
- **UI futura de cotacao manual** funciona sem helper inverso.
- **Cripto sem caso especial.** `BTC: 0.000015` faz sentido na regra geral.
- **Cross-validation em CI** previne regressao silenciosa.

### Negativas
- **Migration unica de usuarios existentes** com risco residual de inverter rate manual ja correto. Mitigado por heuristica conservadora + dry-run + rollback.
- **Tests existentes do `currencyNormalizer` (~7 cenarios) quebram.** Esperado; atualizados no PR.
- **Janela de risco entre deploy do codigo e deploy da migration** — usuarios que entrarem nesse intervalo veem widget com valor errado por minutos. Mitigado por deploy sequencial: codigo + migration no mesmo PR.
- **Telemetria residual roda indefinidamente** (warning quando rate < 1). Aceitavel — overhead trivial; sera removida em sprint posterior se 0 ocorrencias por 60 dias.

### Neutras
- **Trim de currency com whitespace** continua bug pre-existente; tratado em spec separada.
- **Suporte a cotacao live (CoinGecko)** continua fora de escopo (Sprint Bankroll-3). ADR-033 nao impede — a convencao e a mesma para qualquer fonte de cotacao.

## Confianca

**Alta.** Mudanca matematica simples (1 / rate vs * rate), local (1 funcao + 1 constante + 1 service comment), com migration idempotente e dry-run. Risco principal — heuristica errar em rate manual — mitigado por (a) faixa conservadora (so fiat majors com rate < 1), (b) dry-run obrigatorio em prod, (c) rollback automatico via logs estruturados. Reversibilidade: total ate o deploy da migration; apos, exige rodar rollback script.

## Referencias

- Spec: `Docs/specs/bankroll-v2-qw1-fix-exchange-rates.md` (RF-01 ate RF-06).
- Plano estrategico: `Docs/strategy/bankroll-v2-plan-2026-04-25.md`, secao 3 (HIGH-2) e 6 (QW-1).
- ADR-017 (companion): `bankroll_snapshots` invariantes — preservadas, FX nao afeta `delta` em USD.
- ADR-018 (companion): `tolerance` 1.5x hardcoded — preservada.
- ADR-034 (sequencia): Multi-wallet com FX historico imutavel — usa esta convencao em `wallet_transactions.fxRateUSDPerNative`.
- ADR-035 (sequencia): Compatibilidade v1->v2 — depende desta convencao para retrocompat de display BRL.
