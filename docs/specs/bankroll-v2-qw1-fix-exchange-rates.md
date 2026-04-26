# Spec: QW-1 — Fix Bug exchangeRates Inconsistente (HIGH-2)

## Status
Proposta — bloqueador moral pre-Sprint Bankroll-2

## Resumo
Padronizar a interpretacao do campo `user_settings.exchangeRates` (jsonb) em todo o codebase como **"unidades da moeda nativa equivalentes a 1 USD"** (BRL=5.0 significa 1 USD = 5 BRL), corrigindo o bug em `bankrollService.buildStateFromSettings` que faz o widget BRL exibir valor 25x menor que o real, e migrando dados de usuarios existentes que estejam na convencao antiga (`BRL=0.20`). Esta spec NAO altera o contrato publico de `GET /api/bankroll`, NAO cria wallets e NAO mexe em FX historico — apenas conserta a interpretacao matematica e os dados.

## Contexto
**Por que agora:** O Plano Estrategico Bankroll v2 (`Docs/strategy/bankroll-v2-plan-2026-04-25.md`, secao 3, HIGH-2) identificou que duas funcoes interpretam `exchangeRates` de formas inversas:

- `server/scoring/currencyNormalizer.ts` faz `nativeAmount * userRate` para obter USD. Se `BRL=0.20`, entao `100 BRL * 0.20 = 20 USD` — interpretacao "USD por unidade nativa". Comportamento **correto e usado em producao** pelo Tournament Selector desde Sprint 1.
- `server/services/bankrollService.ts:buildStateFromSettings` faz `usdAmount * userRate` para obter o valor em BRL exibido pelo `BankrollWidget`. Se `BRL=0.20`, entao `1000 USD * 0.20 = 200 BRL` (deveria ser ~5000 BRL). **Bug — produz valor 25x menor**.

`DEFAULT_EXCHANGE_RATES.BRL = 0.20` em `scoringConstants.ts` segue a convencao do `currencyNormalizer`. Portanto, qualquer usuario sem `exchangeRates` populado (default) ou com a convencao herdada do scorer ve o widget BRL errado.

**Decisao estrategica (do plano, item HIGH-2 + QW-1):** Inverter a convencao do `currencyNormalizer` para alinhar com a leitura semantica natural ("a cotacao do BRL hoje e 5.0") e com a expectativa do `bankrollService`. A nova regra unica passa a ser:

> `exchangeRates[CCY] = N` significa "1 USD equivale a N unidades de CCY"
> Para converter native -> USD: `usd = native / rate`
> Para converter USD -> native (display): `native = usd * rate`

Esta convencao e mais intuitiva para o usuario brasileiro (BRL=5.0 ~ "dolar a 5 reais") e elimina a discrepancia.

**Pre-requisito do Sprint Bankroll-2:** Multi-Wallet Foundation (spec separada) introduz `wallet_transactions.fxRateUSDPerNative` que registra a cotacao no momento da transacao. Construir multi-wallet em cima de FX bugado e moralmente errado e introduz dado historico corrompido — por isso QW-1 deve mergear ANTES do schema multi-wallet.

## Usuarios

- **Jogador BR ja cadastrado:** Hoje ve `BankrollWidget` com valor BRL absurdamente baixo. Apos QW-1, ve valor BRL coerente com sua banca real.
- **Jogador novo (post-QW-1):** Toda a stack ja usa a nova convencao; nada muda visualmente.
- **Tournament Selector (consumidor interno):** Continua filtrando torneios pelo bankroll em USD; numeros internos nao mudam apos a inversao da formula + ajuste do default.
- **System-Architect e desenvolvedores futuros:** ADR-033 documenta a convencao oficial; comments no codigo previnem regressao.

## Requisitos Funcionais

### RF-01: Padronizar `currencyNormalizer.ts` para nova convencao

**Descricao:** A funcao `normalizeBuyInToUSD(amount, currency, exchangeRates)` passa a usar `nativeAmount / rate` ao inves de `nativeAmount * rate`. O fallback para `DEFAULT_EXCHANGE_RATES` segue a mesma logica.

**Regras de negocio:**
- Se `currency === "USD" || !currency`, retorna `amount` (no-op).
- Se `exchangeRates[currency]` existe e e numero positivo: `return amount / exchangeRates[currency]`.
- Se nao existe, fallback `DEFAULT_EXCHANGE_RATES[currency]` com mesma divisao.
- Se taxa <= 0 ou NaN: retornar 0 (nao crash).
- Moeda totalmente desconhecida: retornar 0 (mantem comportamento atual).

**Criterios de aceitacao:**
- [ ] `normalizeBuyInToUSD(100, "BRL", {BRL: 5.0})` retorna `20`.
- [ ] `normalizeBuyInToUSD(100, "BRL", {})` retorna `100 / 5.0 = 20` (default novo BRL=5.0).
- [ ] `normalizeBuyInToUSD(100, "USD", {})` retorna `100`.
- [ ] `normalizeBuyInToUSD(1, "EUR", {EUR: 0.92})` retorna `~1.087`.
- [ ] `normalizeBuyInToUSD(100, "BRL", {BRL: 0})` retorna `0` (sem divisao por zero).
- [ ] `normalizeBuyInToUSD(100, "ZZZ", {})` retorna `0` (moeda desconhecida).
- [ ] Comentario JSDoc no header explicita a convencao "rates[ccy] = ccy units per 1 USD".

---

### RF-02: Atualizar `DEFAULT_EXCHANGE_RATES` em `scoringConstants.ts` para nova convencao

**Descricao:** Inverter os valores numericos de cada moeda para refletir "unidades por 1 USD".

**Regras de negocio:**
- Valores novos (referencia 2026-04-25):
  - `USD: 1.0`
  - `BRL: 5.0`
  - `EUR: 0.92`
  - `GBP: 0.78`
  - `CNY: 7.20`
  - `USDT: 1.0`
  - `BTC: 0.000015` (~ 1 USD em BTC; opcional manter ou remover ate ter cotacao live)
- Comentario inline na constante explicita convencao + data da referencia.
- Manter o objeto `Record<string, number>` exportado como `DEFAULT_EXCHANGE_RATES`.

**Criterios de aceitacao:**
- [ ] `DEFAULT_EXCHANGE_RATES.BRL === 5.0`.
- [ ] `DEFAULT_EXCHANGE_RATES.USD === 1.0`.
- [ ] Header da constante tem comentario "rates[ccy] = quantas unidades de ccy equivalem a 1 USD" + ref ao ADR-033.
- [ ] Numero total de moedas suportadas mantem-se (>= 6) — sem remocao.

---

### RF-03: Validar/manter `bankrollService.buildStateFromSettings` na nova convencao

**Descricao:** A formula atual `display.BRL = hardLimitUSD * exchangeRateBRL` ja e correta na nova convencao (porque rate=5.0 significa "5 BRL por USD"). Esta RF apenas valida que nada mais precisa mudar e adiciona comentario explicativo.

**Regras de negocio:**
- Comportamento atual e PRESERVADO: `amountDisplay.BRL = amount * exchangeRateBRL` e `display.BRL = hardLimitUSD * exchangeRateBRL`.
- Adicionar comentario inline antes de cada multiplicacao referenciando ADR-033 e a convencao.
- Adicionar guard explicito: se `exchangeRateBRL <= 0`, ignorar (nao popular `display.BRL`).

**Criterios de aceitacao:**
- [ ] Com banca de 1000 USD e `exchangeRates.BRL = 5.0`, `state.amountDisplay.BRL === 5000`.
- [ ] Com banca de 1000 USD e `exchangeRates.BRL = 0` ou ausente: `amountDisplay` so contem campo USD; nao explode.
- [ ] Comentario referenciando ADR-033 esta presente acima da multiplicacao.

---

### RF-04: Migration idempotente para usuarios existentes

**Descricao:** Detectar e corrigir registros em `user_settings.exchangeRates` que ainda usam a convencao antiga (rate < 1 para fiat majors). Migration roda uma unica vez no deploy do QW-1; idempotente para casos de re-execucao.

**Estrategia de deteccao (heuristica conservadora):**
Para cada chave `ccy` em `exchangeRates`:
1. Se `ccy === "USD" && rate === 1.0`: nao tocar (correto em ambas convencoes).
2. Se `ccy === "USDT" && rate === 1.0`: nao tocar.
3. Se `ccy in {"BRL","EUR","GBP","CNY","JPY","ARS","MXN","CAD","AUD","CHF"}`:
   - Se `rate < 1.0`: invocer (`newRate = 1 / rate`). **Suspeita-se convencao antiga.**
   - Se `rate >= 1.0`: nao tocar (provavelmente ja na nova convencao OU rate manual correto).
4. Se `ccy in {"BTC","ETH"}` (cripto cara): invariante invertido — `rate < 1` e CORRETO na nova convencao (1 USD ~ 0.000015 BTC). Nao tocar.
5. Outras chaves: log + nao tocar (defensivo — evita corromper dado custom).

**Auditoria:**
- Antes da migration: `console.info` lista quantos usuarios serao afetados, com breakdown por moeda.
- Cada update e logado em `access_logs` (ou tabela proxima) com `action='migration_qw1_fx_invert'`, `before`, `after`, `userId`.
- Migration roda em uma transacao por usuario (NAO single transaction global — limita raio de explosao).

**Dry-run:**
- Variavel de ambiente `BANKROLL_QW1_DRY_RUN=true` ativa modo dry-run que SO loga sem escrever. Default: false.

**Rollback:**
- Migration grava em `migrations_log` (ou logs estruturados) o snapshot completo de `exchangeRates` antes da mudanca por usuario.
- Script de rollback (`server/scripts/rollback-qw1-fx.ts`) restaura `exchangeRates` ao estado anterior consultando esses logs.

**Regras de negocio:**
- Migration esta em arquivo TS separado em `server/scripts/migrate-qw1-fx-convention.ts`.
- NAO faz parte do `db:push` automatico — script standalone executado manualmente: `tsx server/scripts/migrate-qw1-fx-convention.ts`.
- Re-execucao no mesmo banco: rates ja invertidas (>= 1 para fiat majors) sao puladas — idempotente.
- Migration NAO remove chaves desconhecidas; preserva integridade.

**Criterios de aceitacao:**
- [ ] Usuario com `exchangeRates: {BRL: 0.20}` apos migration tem `{BRL: 5.0}`.
- [ ] Usuario com `exchangeRates: {BRL: 5.0}` ja correto: migration nao altera (idempotente).
- [ ] Usuario sem `exchangeRates` (vazio ou null): migration nao quebra nem cria valor.
- [ ] Usuario com `exchangeRates: {BTC: 0.000015}`: migration nao altera (cripto fica como esta).
- [ ] Modo dry-run: nada e escrito no banco; output mostra delta planejado.
- [ ] Log estruturado contem `userId`, `currency`, `oldRate`, `newRate` por mudanca.
- [ ] Apos migration, `SELECT COUNT(*)` de user_settings com `BRL < 1` cai para 0 (assumindo nenhum default inicial nesse range na producao real).

---

### RF-05: ADR-033 documentando a decisao

**Descricao:** Criar `Docs/architecture/decisions/033-fx-rate-convention-units-per-usd.md` com contexto, decisao, alternativas e consequencias. Formato compativel com ADRs existentes (ver ADR-017, ADR-031).

**Conteudo minimo:**
- **Status:** Aceita (2026-04-25)
- **Contexto:** Inconsistencia HIGH-2 do plano Bankroll v2; duas funcoes interpretam `exchangeRates` invertidas; bug visivel no widget BRL.
- **Decisao:** `exchangeRates[ccy] = N` -> "1 USD vale N unidades de ccy". Conversao: `usd = native / rate`; `display = usd * rate`.
- **Alternativas consideradas:**
  - Manter convencao antiga e corrigir `bankrollService` (`displayBRL = usdAmount / exchangeRates.BRL`). Rejeitada — `BRL = 0.20` e contraintuitivo (usuario esperaria "rate do dolar").
  - Criar segundo campo `exchangeRatesUSDPerNative` separado. Rejeitada — duplicacao + risco de divergencia.
  - Salvar ambos os formatos. Rejeitada — overengineering.
- **Consequencias positivas:** Codigo mais legivel; default values intuitivos; UI futura de "editar cotacao manual" tem sentido natural.
- **Consequencias negativas:** Migration unica de usuarios existentes (mitigada por heuristica conservadora + dry-run).
- **Referencias:** Plano `Docs/strategy/bankroll-v2-plan-2026-04-25.md` (HIGH-2, QW-1); spec `Docs/specs/bankroll-v2-qw1-fix-exchange-rates.md`.

**Criterios de aceitacao:**
- [ ] Arquivo criado em `Docs/architecture/decisions/033-fx-rate-convention-units-per-usd.md`.
- [ ] Formato seguindo ADRs anteriores.
- [ ] Conteudo cobre todos os pontos acima.
- [ ] Linkado a partir do CLAUDE.md ou indice de ADRs (se existir).

---

### RF-06: Telemetria pos-deploy para detectar impacto residual

**Descricao:** Adicionar log estruturado em `bankrollService.getBankrollState` quando o `exchangeRateBRL` for `< 1` (suspeita de convencao antiga residual nao migrada). Util para detectar usuarios que entraram durante a janela de deploy.

**Regras de negocio:**
- Se `state.exchangeRateBRL != null && state.exchangeRateBRL < 1.0`: emitir `console.warn('bankroll_fx_rate_suspect_legacy', {userId, ccy: 'BRL', rate, expected: '>= 1.0 in new convention'})` (uma vez por sessao por usuario para evitar spam).
- Adicionar contador em memoria simples (`Map<string, number>`) — meta: zero ocorrencias 7 dias apos deploy.
- Sem dependencia de servico de telemetria externo (so logs).

**Criterios de aceitacao:**
- [ ] Warning aparece com BRL=0.20 mock no teste.
- [ ] Warning NAO aparece com BRL=5.0.
- [ ] Warning emitido apenas uma vez por (userId, sessao).

---

## Requisitos Nao-Funcionais

- **Performance:** Migration roda em <30s para 1000 usuarios (estimativa baseada em transacoes individuais de UPDATE em coluna jsonb).
- **Seguranca:** Migration roda apenas via script CLI manual; nao expoe endpoint HTTP. Logs nao incluem PII alem de userId.
- **Disponibilidade:** Migration nao interrompe servico (lock granular por usuario). Rollback disponivel via script dedicado.
- **Compatibilidade reversa:** Tournament Selector continua funcionando com nova convencao em <10ms de overhead (so multiplicacao vira divisao). Nenhum endpoint publico muda contrato.

## Endpoints Previstos

Nenhum endpoint novo. Apenas comportamento corrigido nos existentes:

| Metodo | Rota | Mudanca |
|---|---|---|
| GET | `/api/bankroll` | `amountDisplay.BRL` agora coerente. Sem mudanca de shape. |
| GET | `/api/bankroll/history` | `series[].balance` em USD (nao muda); display BRL no client recalcula via novo state. |
| GET | `/api/tournament-selector` | Internamente usa nova divisao; resposta publica nao muda shape. |

## Modelos de Dados Afetados

### `user_settings.exchangeRates` (jsonb) — alteracao semantica

| Aspecto | Antes (legado) | Depois (QW-1) |
|---|---|---|
| Significado | "USD equivalente a 1 unidade de ccy" | "ccy unidades equivalentes a 1 USD" |
| Exemplo BRL | `{BRL: 0.20}` | `{BRL: 5.0}` |
| Conversao native -> USD | `native * rate` | `native / rate` |
| Conversao USD -> native | `usd / rate` | `usd * rate` |

Schema Drizzle (`shared/schema.ts:572`) **nao muda** — coluna ja e `jsonb` com tipo `Record<string, number>`. Apenas semantica do dado.

## Integracoes Externas

Nenhuma. QW-1 e auto-contido.

## Cenarios de Teste Derivados

### Happy Path
- [ ] `currencyNormalizer.normalizeBuyInToUSD(100, "BRL", {BRL: 5.0})` retorna 20.
- [ ] `bankrollService.getBankrollState(user)` com banca 1000 USD e BRL=5.0 retorna `amountDisplay.BRL === 5000`.
- [ ] `bankrollService.getBankrollState(user)` com banca 1000 USD e regra 1pct retorna `maxBuyInDisplay.BRL === 75` (15 * 5).
- [ ] Tournament Selector com `bankrollFilter=true` filtra torneio Suprema R$ 100 (= $20 USD apos divisao por 5.0) usando o threshold em USD corretamente.

### Cross-validation (round-trip)
- [ ] Para `amount=100 BRL`: `normalize(100, BRL, {BRL: 5})` -> 20 USD; `displayInBRL(20)` -> 100 (round-trip exato).
- [ ] Para 6 moedas no `DEFAULT_EXCHANGE_RATES`: round-trip native -> USD -> native em <= 0.001 erro relativo.

### Migration
- [ ] Usuario `{BRL: 0.20}` apos migration: `{BRL: 5.0}`.
- [ ] Usuario `{BRL: 5.0}` ja correto: nao muda (idempotente).
- [ ] Usuario `{}` (vazio): nao muda.
- [ ] Usuario null: nao muda.
- [ ] Usuario com cripto `{BTC: 0.000015}`: nao muda.
- [ ] Usuario com chave desconhecida `{XYZ: 0.5}`: nao muda + log.
- [ ] Re-execucao da migration: zero updates aplicados (idempotente).
- [ ] Modo dry-run: zero escritas mas log igual ao real.

### Rollback
- [ ] Apos migration, executar `rollback-qw1-fx.ts`: rates voltam ao estado anterior usando snapshot logado.
- [ ] Apos rollback, re-executar migration: estado final igual ao primeiro pos-migration.

### Edge Cases
- [ ] Rate = 0: `normalizeBuyInToUSD` retorna 0 sem divisao por zero.
- [ ] Rate negativo: retorna 0.
- [ ] Rate string ("5.0" como texto): tratado como NaN -> retorna 0.
- [ ] Currency `null` ou string vazia: trata como USD (no-op).
- [ ] Currency `"BRL "` com whitespace: tratada como diferente de BRL (nao trim) — bug pre-existente, fora de escopo.

### Telemetria pos-deploy
- [ ] Apos deploy, usuario com BRL=0.20 (caso a migration tenha falhado para ele) gera warning no log na primeira chamada.
- [ ] Usuario com BRL=5.0 nao gera warning.

## Fora de Escopo

- **NAO** criar wallets nem schema multi-wallet (vira spec separada — Spec 2).
- **NAO** mudar contrato publico de `GET /api/bankroll` (shape igual).
- **NAO** adicionar suporte a cotacao live (CoinGecko, fixer.io) — Sprint Bankroll-3.
- **NAO** introduzir UI de "editar cotacao manual" — Sprint Bankroll-2 ou posterior.
- **NAO** alterar `bankroll_snapshots` (sem coluna `fxRateUSDPerNative` ainda — vira na Spec 2).
- **NAO** suporte multi-wallet, transferencias, pending tx — todos Sprint Bankroll-2.
- **NAO** trim de currency string com whitespace (bug pre-existente, separado).

## Dependencias

Nenhuma. QW-1 e independente e DEVE rodar ANTES da Spec 2 (Multi-Wallet Foundation).

## Notas de Implementacao

- A migration deve gravar log estruturado em `console.info` com formato JSON parseavel (facilita auditoria pos-deploy).
- Considerar usar `pg`-level transacoes manuais ao inves de Drizzle ORM no script de migration para minimizar deps e ter controle fino do rollback.
- Tests devem ser TDD: criar `tests/unit/bankroll/qw1-fx-convention.test.ts` antes da implementacao, cobrindo todos os cenarios acima.
- Cross-validation test deve ser obrigatorio em CI (impede regressao futura).
- Adicionar comentario unico no topo do `currencyNormalizer.ts` e `scoringConstants.ts` (`// FX CONVENTION: rates[ccy] = ccy units per 1 USD. See ADR-033.`).
- Estimativa: 1 dia-dev (4h impl + 2h migration script + 2h ADR + tests).

## Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Migration inverte rate de usuario que ja tinha rate manual correto na convencao nova | MED | HIGH | Heuristica conservadora (so inverte fiat majors com rate < 1); dry-run obrigatorio antes de prod; log + rollback por usuario. |
| Tournament Selector cache invalidacao nao propaga apos mudanca de DEFAULT_EXCHANGE_RATES | LOW | MED | Cache TTL 30min; aceitavel ate expirar. Adicionar invalidacao manual no script de migration. |
| Algum codigo ainda nao mapeado usa convencao antiga | LOW | MED | Grep abrangente por `exchangeRates[` em toda codebase + telemetria RF-06. |
| Tests existentes do `currencyNormalizer` quebram | HIGH (esperado) | LOW | Atualizar tests no PR junto com a implementacao; lista explicita de arquivos: `tests/unit/scoring/currencyNormalizer.test.ts` e `tests/unit/bankroll/*`. |
