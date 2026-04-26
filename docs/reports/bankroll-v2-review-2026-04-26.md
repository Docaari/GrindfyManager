# Review Bankroll v2 — 2026-04-26

**Reviewer:** Claude (Opus 4.7) — agente reviewer
**Escopo:** QW-1 (FX convention) + Multi-Wallet Foundation (Sprint Bankroll-2)
**Specs revisadas:**
- `Docs/specs/bankroll-v2-qw1-fix-exchange-rates.md`
- `Docs/specs/bankroll-v2-multi-wallet-foundation.md`
- ADR-033, ADR-034, ADR-035
- API doc `Docs/api/wallets.md`

---

## Resumo executivo

- **Status:** BLOQUEADO ate corrigir HIGH-1, HIGH-2 e HIGH-3.
- **HIGH issues:** 7 (3 bloqueadores hard, 4 bloqueadores soft)
- **MED issues:** 8
- **LOW issues:** 5
- **Ressalvas conhecidas (preexistentes):** 2 (testes legados de FX em `tests/unit/scoring/normalizer.test.ts` e transform errors em `tests/unit/coach/*` Sprint 2A)

A mudanca de convencao FX (ADR-033) foi aplicada em 2 arquivos do escopo (`currencyNormalizer.ts`, `bankrollService.ts`) mas **NAO foi propagada para `server/csvParser.ts`**, que continua com convencao LEGACY (`amount * rate` em ~50 chamadas em parsers de PokerStars, GG, 888, WPN, Chico, Suprema, Brazilian). Esse e o item mais critico.

A migracao v1->v2 e o servico de wallets estao bem estruturados, com SELECT FOR UPDATE, invariantes ledger, e cobertura razoavel de tests para invariantes. Mas o "wrapper retroativo" do `GET /api/bankroll` que ADR-035 RF item 4 promete construir SOBRE `getConsolidatedBalance` **nao foi feito** — `bankrollService.getBankrollState` continua lendo `userSettings.bankrollAmount` v1 stored e adiciona apenas 2 campos novos.

A UI de archive em `WalletDetailPanel` tem botao de submit que NAO chama a API (no-op visual).

Recomendacao: **bloquear merge ate HIGH-1/2/3 corrigidos**. HIGH-4..7 podem ir para hotfix imediato pos-merge se houver pressao de prazo, mas em produto financeiro isso e desaconselhavel.

---

## Issues HIGH (bloqueadores de merge)

### HIGH-1 — `csvParser.ts` continua na convencao FX LEGACY (`* rate`), incompativel com QW-1

**Localizacao:** `server/csvParser.ts:813-822, 900-908, 942-956, 1012-1031, 1108-1119, 1186-1200, 1253-1264, 1327-..., 1428-..., 1530-..., 1613-..., 1671-...` (12+ funcoes de parser por rede de poker)

**Categoria:** Correctness / Bugs (CATACLISMICO em producao)

**Confianca:** Alta. Verificado por leitura direta + teste `tests/unit/upload/csv-parser.test.ts:409-414` que ativa o caminho legacy:

```javascript
const exchangeRates = { CNY: 0.14 };  // convencao LEGACY (USD por unidade)
const result = await PokerCSVParser.parseCSV(csv, 'USER-0001', exchangeRates);
expect(result[0].buyIn).toBeCloseTo(59.64, 1);  // 388 * 0.14 + 38 * 0.14
```

**Sintoma:** Todas as funcoes `parsePokerStarsFormat`, `parseGGPokerFormat`, `parseBrazilianFormat`, etc. fazem:
```typescript
let conversionRate = 1.0;
if (originalCurrency !== 'USD' && exchangeRates[originalCurrency]) {
  conversionRate = exchangeRates[originalCurrency];
}
const stake = parseFloatSafe(...) * conversionRate;
const rake = parseFloatSafe(...) * conversionRate;
```

Pos-QW-1, `exchangeRates.BRL = 5.0` significa "1 USD = 5 BRL". O parser faz `R$100 * 5.0 = $500 USD` (errado por fator 25x). O correto seria `R$100 / 5.0 = $20 USD`.

A funcao `applyCurrencyConversion` (linha 1797) ja foi REESCRITA com a convencao nova (`amount / rate`) mas **NAO E CHAMADA por nenhum dos parsers de rede** — esta orfa.

**Impacto:**
- Apos QW-1 deployed + migration, **todo upload futuro de CSV em moeda nao-USD entrega valores 25x maiores** (fator inverso do rate). Buy-ins corrompidos no banco. Dashboards quebrados. ROIs absurdos.
- Usuarios brasileiros ja existentes que rodaram QW-1 migration veem subitamente CSVs antigos sendo re-importados (em re-uploads de duplicate-check) com valores errados.
- O tournament selector (que usa `currencyNormalizer.ts` corretamente) e o csvParser (que usa convenção legacy) **divergem entre si** — um buy-in BRL e bucketizado em $20 no Selector mas armazenado como $500 no banco.

**Sugestao de fix:**
- Substituir TODAS as ocorrencias de `* conversionRate` por `/ conversionRate` em `csvParser.ts` (~50 chamadas).
- OU melhor: refatorar todas as funcoes para chamar `applyCurrencyConversion(value, currency, exchangeRates)` (que ja faz `/ rate`).
- Atualizar `tests/unit/upload/csv-parser.test.ts` para usar nova convencao (CNY=7.20 -> `388 / 7.20 = 53.89`).
- Adicionar teste de integracao cross-module: criar wallet BRL, fazer upload de CSV PokerStars BRL, comparar buy-in convertido com `bucketizeBuyIn` do tournament selector — devem dar o mesmo USD para a mesma row.

---

### HIGH-2 — `WalletDetailPanel`: botao "Confirmar Arquivar" e no-op (apenas fecha modal)

**Localizacao:** `client/src/components/bankroll/WalletDetailPanel.tsx:142-148`

**Categoria:** Correctness / UX critica

**Confianca:** Alta.

**Sintoma:**
```jsx
<button
  data-testid="wallet-archive-confirm-submit"
  onClick={() => setArchiveConfirmOpen(false)}  // <-- so fecha o modal!
  ...
>
  Arquivar
</button>
```

Nao ha chamada para `apiRequest('PATCH', '/api/wallets/${wallet.id}/archive')`. Usuario ve modal "Carteira arquivada?" -> clica "Arquivar" -> modal fecha SEM arquivar. Sem feedback de erro, sem invalidar query. Wallet permanece active.

**Impacto:** Funcionalidade core da UI nao funciona. Usuario tenta arquivar e silenciosamente nada acontece. Bug presente em qualquer usuario que use o painel via `/bankroll`.

**Sugestao de fix:**
```jsx
<button
  data-testid="wallet-archive-confirm-submit"
  onClick={async () => {
    try {
      await apiRequest('PATCH', `/api/wallets/${wallet.id}/archive`);
      queryClient.invalidateQueries({ queryKey: ['/api/wallets'] });
      queryClient.invalidateQueries({ queryKey: [`/api/wallets/${wallet.id}`] });
      setArchiveConfirmOpen(false);
    } catch (err) { /* mostrar toast de erro */ }
  }}
>
```

Adicionar teste em `tests/unit/wallets/WalletDetailPanel.test.tsx` que mock `apiRequest`, clica em archive-confirm-submit, e valida que `apiRequest('PATCH', '/api/wallets/wlt_1/archive', ...)` foi chamado.

---

### HIGH-3 — `GET /api/bankroll` legado NAO foi convertido em wrapper sobre `getConsolidatedBalance` (ADR-035 violado)

**Localizacao:** `server/services/bankrollService.ts:229-247` (funcao `getBankrollState`)

**Categoria:** Arquitetura / Correctness

**Confianca:** Alta. Comprovada por leitura direta + ausencia de teste de integracao real (apenas mocks que validam shape de saida em `tests/integration/compat/bankroll-v1-compat.test.ts`).

**Sintoma:**
```typescript
async function getBankrollState(userId: string): Promise<BankrollState> {
  const settings = await storage.getUserSettings(userId);  // <-- le bankrollAmount v1
  const snapshots = await storage.getBankrollSnapshots(userId);
  const state = buildStateFromSettings(settings, snapshots.length);
  // Augmentacao com walletCount + aggregationMode (apenas anexos)
  (state as any).walletCount = ...;
  (state as any).aggregationMode = ...;
  return state;
}
```

ADR-035 RF item 4 explicitamente diz:
> "GET /api/bankroll legado vira wrapper sobre getConsolidatedBalance.
> Le const consolidated = walletService.getConsolidatedBalance(userId);
> Mapeia para shape v1: amount = consolidated.totalUSD, currency = 'USD', ..."

A implementacao atual le `userSettings.bankrollAmount` (espelho v1 stored) ao inves de `getConsolidatedBalance`. Essa decisao tem consequencias praticas:

**Impacto:**
- Usuario migrado tem `userSettings.bankrollAmount = 1000` e default wallet com `balance = 1000`. Inicialmente coincidem.
- Usuario adiciona segunda wallet `Suprema BRL 5000` (= $1000 USD com rate 5.0). Saldo consolidado vira $2000 USD.
- `walletService.recordWalletTransaction` (linha 326-442) **NAO atualiza `userSettings.bankrollAmount`** apos cada tx (verifiquei codigo).
- `GET /api/bankroll` retorna ainda `amount: 1000` (espelho v1 desatualizado), enquanto `GET /api/bankroll/consolidated` retorna `totalUSD: 2000`.
- **Tournament Selector e Coach AI consomem `GET /api/bankroll`** — eles veem $1000, filtros e respostas baseadas em banca errada.
- **BankrollWidget no dashboard mostra valor errado** — divergente do que o usuario ve em `/bankroll` v2.

**Sugestao de fix:**
```typescript
async function getBankrollState(userId: string): Promise<BankrollState> {
  // ADR-035: wrapper sobre getConsolidatedBalance.
  const consolidated = await walletService.getConsolidatedBalance(userId);
  const settings = await storage.getUserSettings(userId);
  const snapshots = await storage.getBankrollSnapshots(userId);
  const totalUSD = parseFloat(consolidated.totalUSD);

  // Compat: amount vem de consolidated; rule vem de settings.
  const state = buildStateFromSettings({
    ...settings,
    bankrollAmount: totalUSD > 0 || consolidated.walletCount > 0
      ? String(totalUSD)
      : settings?.bankrollAmount,  // fallback v1 puro pre-migration
  }, snapshots.length);

  (state as any).walletCount = consolidated.walletCount;
  (state as any).aggregationMode = consolidated.aggregationMode;
  return state;
}
```

E adicionar teste de integracao **REAL** que valide:
1. Criar 2 wallets via service.
2. Chamar `getBankrollState` → `state.amount === sum(wallets.balance / fx)`.
3. Atualizar 1 wallet → state reflete novo total.

---

### HIGH-4 — Schema falta UNIQUE PARTIAL INDEX em `wallets(user_id, name) WHERE status='active'` (RF-01)

**Localizacao:** `shared/schema.ts:2329-2348` (definicao da tabela `wallets`)

**Categoria:** Correctness / Concorrencia

**Confianca:** Alta.

**Sintoma:** Spec RF-01 explicita:
> `uniqueIndex("uq_wallets_user_name_active").on(table.userId, table.name).where(sql`status = 'active'`)`
> "Constraint unica `(userId, name) WHERE status='active'` impede duplicata"

A definicao atual tem apenas dois indices nao-unique:
```typescript
}, (table) => [
  index("idx_wallets_user_status").on(table.userId, table.status),
  index("idx_wallets_user_platform").on(table.userId, table.platform),
]);
```

A unicidade e validada **apenas em service-layer** (`walletService.createWallet:158` chama `findActiveWalletByName` antes do INSERT). Isso e vulneravel a race condition: 2 POSTs concorrentes podem ambos passar pelo check + ambos inserir.

**Impacto:** Em ambiente de producao com clientes que retry POST (PWA, mobile flaky network), e possivel terminar com 2 wallets ativas com mesmo nome. UI fica confusa, queries que esperam 1 unique row falham.

**Sugestao de fix:**
```typescript
import { sql } from "drizzle-orm";
// ...
}, (table) => [
  index("idx_wallets_user_status").on(table.userId, table.status),
  index("idx_wallets_user_platform").on(table.userId, table.platform),
  uniqueIndex("uq_wallets_user_name_active")
    .on(table.userId, table.name)
    .where(sql`status = 'active'`),
]);
```

Rodar `npm run db:push`. Adicionar teste de integracao com `Promise.all([POST, POST])` e validar que o segundo retorna 400 (DB constraint).

---

### HIGH-5 — `walletService.recordWalletTransaction` cria snapshot v1 com `previousAmount` ERRADO (apenas saldo da wallet, nao banca consolidada)

**Localizacao:** `server/services/walletService.ts:418-431`

**Categoria:** Correctness / Audit trail

**Confianca:** Alta.

**Sintoma:**
```typescript
const usdDelta = input.direction === "in" ? usdAmount : -usdAmount;
const prevUSD = parseDecimal(wallet.balance) / (fxRate || 1);  // <-- saldo APENAS dessa wallet
await tx.insertBankrollSnapshot({
  userId,
  delta: usdDelta,
  previousAmount: prevUSD,        // <-- ERRADO em multi-wallet
  newAmount: prevUSD + usdDelta,  // <-- ERRADO em multi-wallet
  ...
});
```

`bankroll_snapshots` historicamente representa **mudancas do saldo CONSOLIDADO em USD** (banca v1). Em multi-wallet, gravar `previousAmount = balance da wallet X / fx` ignora as outras N wallets do usuario, quebrando a invariante audit ADR-017 que e usada por `bankrollService.getBankrollHistory` para reconstruir a serie temporal:

```typescript
// bankrollService.ts:493-494
const startBalance = asc.length > 0 ? parseDecimal(asc[0].previousAmount) : currentAmount;
const endBalance = asc.length > 0 ? parseDecimal(asc[asc.length - 1].newAmount) : currentAmount;
```

Se um snapshot tem `previousAmount=1000` (so wallet GG) e outro tem `previousAmount=500` (so wallet Suprema), os calculos de ROI, totalDeposits, etc. ficam corrompidos.

**Impacto:**
- Historico em `/api/bankroll/history` mostra serie temporal incorreta apos migration.
- BankrollHistoryTable (legado) renderiza linhas de balance que nao batem com `delta`.
- ROI computado incorreto.
- ADR-017 invariante: `snapshot[n+1].previous == snapshot[n].new` quebrada se 2 wallets diferentes geram tx alternadas.

**Sugestao de fix:** O snapshot espelho deve refletir a banca consolidada do usuario:
```typescript
// Antes do insert: pegar consolidated atual (sem essa wallet ainda atualizada).
const totalBeforeUSD = await tx.computeConsolidatedUSDExcept(userId, walletId);
const prevUSD = totalBeforeUSD + (parseDecimal(wallet.balance) / (fxRate || 1));
const newUSD = totalBeforeUSD + ((parseDecimal(wallet.balance) + (input.direction === "in" ? input.nativeAmount : -input.nativeAmount)) / (fxRate || 1));
await tx.insertBankrollSnapshot({
  userId,
  delta: usdDelta,
  previousAmount: prevUSD,
  newAmount: newUSD,
  walletId,
  nativeAmount: input.nativeAmount,
  nativeCurrency: wallet.nativeCurrency,
  fxRateUSDPerNative: fxRate,
  ...
});
```

Tambem **importante**: as 4 colunas novas em `bankroll_snapshots` (`walletId`, `nativeAmount`, `nativeCurrency`, `fxRateUSDPerNative`) NAO estao sendo populadas no insert atual — outra violacao da spec RF-04.

---

### HIGH-6 — `Settings.tsx` (cliente) inicializa `exchangeRates` na convencao LEGACY (`CNY: 0.14`) e mostra label "1 CNY = X USD"

**Localizacao:** `client/src/pages/Settings.tsx:44, 460-484`

**Categoria:** Correctness / UX / Data integrity

**Confianca:** Alta.

**Sintoma:**
```jsx
const [exchangeRates, setExchangeRates] = useState({ CNY: 0.14, EUR: 0.92 });
// ...
<input value={exchangeRates.CNY} ... />
<p>1 CNY = {exchangeRates.CNY} USD</p>  // texto da convencao LEGACY
```

Na convencao QW-1, "1 CNY = X USD" estaria invertido (deveria mostrar "1 USD = X CNY"). Pior — o **estado inicial** `CNY: 0.14` e a convencao antiga (`0.14 USD por 1 CNY`). Salvar isso ativa a heuristica do migration QW-1 e o widget vai inverter.

Note: nas linhas 132-136, `brlRate` e derivado de `maxBuyInDisplay.BRL / maxBuyInUSD`. Como o backend agora usa convencao nova (`maxBuyInDisplay.BRL = USD * rate`, rate=5.0), a derivacao da `brlRate = 5.0` esta correta. Mas inicializar Settings com `CNY: 0.14` e textos legacy CONFUNDE a UI:
- Usuario novo entra em /settings, ve "1 CNY = 0.14 USD", clica salvar (mesmo sem mudar nada).
- Settings persiste `exchangeRates: { CNY: 0.14 }` (legacy).
- Widget calcula buy-in CNY com convencao nova: `100 / 0.14 = 714 USD` (alem da realidade).

**Impacto:** Usuario salva valor LEGACY na convencao NOVA -> widget mostra valor 50x maior que real. Cataclismo visual + pode causar decisoes erradas de banca.

**Sugestao de fix:**
- Mudar default para `{ CNY: 7.20, EUR: 0.92 }` (nova convencao).
- Inverter labels: "1 USD = X CNY", "1 USD = Y EUR".
- Carregar valores do backend via `useUserSettings()` ou `useQuery('/api/user-settings')` em vez de hardcoded inicial.
- Adicionar teste E2E de Settings que: salva CNY=7.20, le `bankrollService.getBankrollState`, valida que widget BRL faz `usd * rate`.

---

### HIGH-7 — Storage `tx.updateWallet` ignora `userId` na clausula WHERE (cross-tenant write potencial)

**Localizacao:** `server/storage.ts:4163-4176`

**Categoria:** Seguranca / Concorrencia

**Confianca:** Media (atualmente protegido por contrato de chamadas, mas fragil).

**Sintoma:** O wrapper de transacao redefine `updateWallet` SEM filtrar por `userId`:
```typescript
updateWallet: async (walletId: string, patch: any): Promise<Wallet> => {
  // ...
  const [updated] = await tx
    .update(wallets)
    .set(updates)
    .where(eq(wallets.id, walletId))  // <-- FALTA AND eq(wallets.userId, userId)
    .returning();
  return updated;
}
```

Comentario em 4160-4162 alega: "ownership ja foi verificada via getWalletById no service antes desta chamada". Atualmente isso e verdade em `walletService.updateWallet:277-298`. Mas qualquer chamada futura (humana ou IA) que use `tx.updateWallet` sem chamar `tx.getWalletById(walletId, userId)` antes dentro da mesma transacao permite cross-tenant write — usuario A poderia atualizar wallet de usuario B se conhecer o `walletId`.

**Impacto (potencial):**
- Hoje: zero (o codigo atual respeita o invariante manual).
- Futuro: alta probabilidade de regressao em refatoracao. Padrao defesa-em-profundidade ausente.
- Defesa em profundidade: exigir `userId` em TODOS os updates como filtro obrigatorio.

**Sugestao de fix:**
- Mudar assinatura: `updateWallet: (walletId: string, userId: string, patch: any)`.
- Aplicar `WHERE id = ${walletId} AND user_id = ${userId}`.
- Service passa `userId` explicito.
- Alternativa: nao redefinir `updateWallet` no tx wrapper — usar a versao da classe direto (`this.updateWallet(walletId, userId, patch, tx)`).

---

## Issues MED (nao bloqueiam mas devem ser corrigidos antes de producao)

### MED-1 — `pagination.total` em `listWalletTransactions` e `transactions.length`, nao COUNT real

**Localizacao:** `server/services/walletService.ts:493`

```typescript
pagination: { total: transactions.length, limit, offset },
```

Deveria ser `COUNT(*)` da query sem paginacao. Frontend nao consegue saber se ha mais paginas. Spec RF-10 mostra `"total": 142` (claramente um total absoluto).

**Sugestao:** Adicionar `storage.countWalletTransactions(userId, walletId, filters)` e devolver na pagination. Atualizar `Docs/api/wallets.md`.

---

### MED-2 — `summary` em `listWalletTransactions` e calculado SOMENTE sobre a pagina atual (limit 50)

**Localizacao:** `server/services/walletService.ts:464-489`

Com `limit=50, offset=0`, o summary so soma essas 50 tx. Spec RF-10 sugere que e summary **total** (nao paginado). Em wallet com 200 tx, summary mostra fragmento.

**Sugestao:** Calcular summary em SQL agregado independente da paginacao:
```sql
SELECT direction, reason, SUM(native_amount) FROM wallet_transactions
WHERE wallet_id = ? AND user_id = ? AND occurred_at BETWEEN ? AND ?
GROUP BY direction, reason
```

---

### MED-3 — `walletCache` declarado mas NUNCA usado (cold cache em todas as leituras)

**Localizacao:** `server/services/walletCache.ts` (modulo) + `server/routes/wallets.ts` (handler)

`walletCache.get(...)` nao e chamado em `handleGetWallets`, `handleGetWallet`, `handleGetWalletTransactions`, `handleGetBankrollConsolidated`. Apenas `walletCache.invalidateAllForUser` e chamado em mutacoes. Spec RF-09 explicita: "Reads: cache em memoria 30s".

**Impacto:** Cada `GET /api/wallets` faz query no banco. Cargo computacional desnecessario.

**Sugestao:** Embrulhar reads:
```typescript
const cached = walletCache.get<any>(userId, "wallets-list");
if (cached) return res.json(cached);
const fresh = await walletService.listWallets(...);
walletCache.set(userId, "wallets-list", fresh);
return res.json(fresh);
```

---

### MED-4 — Falta script `rollback-qw1-fx.ts` (RF-04 spec)

**Localizacao:** `server/scripts/` (ausente)

Spec QW-1 RF-04 exige:
> "Script de rollback (`server/scripts/rollback-qw1-fx.ts`) restaura `exchangeRates` ao estado anterior consultando esses logs."

ADR-035 RF item 6 tambem pede `rollback-v2-multi-wallet.ts` — tambem ausente.

**Impacto:** Em caso de problema na migration, nao ha mecanismo automatizado de rollback. Operador precisa SQL manual + parsing dos logs `qw1_pre_migration_snapshot`.

**Sugestao:** Criar ambos scripts antes de production deploy. Aceitavel deixar como TODO documentado se merge for em sandbox.

---

### MED-5 — `recordWalletTransaction.occurredAt` aceita ate +24h no FUTURO (grace window excessivo)

**Localizacao:** `server/services/walletService.ts:355-359` + `server/routes/wallets.ts:70-75`

```typescript
const FUTURE_GRACE_MS = 24 * 60 * 60 * 1000;  // 24h
if (occurredAt.getTime() >= Date.now() + FUTURE_GRACE_MS) {
  throw makeError("occurredAt nao pode ser no futuro", 400);
}
```

Spec RF-10 diz: "occurredAt: nao no futuro". 24h e MUITO. Skew real de timezone client/server e ~minutos. Comentario justifica com "testes happy-path setam occurredAt em horario do dia subsequente em UTC" — isso e workaround para ajustar testes, nao requisito de produto.

**Impacto:** Usuario pode registrar tx em data ate +24h no futuro, corrompendo serie temporal e quebrando out-of-order check (proxima tx que tente datar `occurredAt = now()` real fica anterior).

**Sugestao:** Reduzir para 5 minutos (skew real). Atualizar testes que enviam datas futuras para usar dates do passado.

---

### MED-6 — `bankrollService.recordSnapshot` NAO atualiza `wallets.balance` ou `walletTransactions` (writes paralelos divergentes)

**Localizacao:** `server/services/bankrollService.ts:321-389`

Endpoint legado `POST /api/bankroll/snapshot` continua atualizando `userSettings.bankrollAmount` + `bankroll_snapshots`. Em multi-wallet, isso cria divergencia com `wallets[*].balance` (que mantem o estado real das wallets).

ADR-035 deveria mapear o que fazer:
- Se usuario migrado: snapshot v1 deveria ser gravado contra default wallet (criando wallet_transaction tambem)?
- Se usuario nao migrado: comportamento legado e OK.

Spec nao explicita, mas a implementacao atual escolhe "comportamento legado puro", criando divergencia.

**Impacto:** BankrollMovementDialog legado cria snapshot que NAO espelha em wallet_transactions. Usuario migrado que use widget legado ve divergencia entre `getBankrollState.amount` (atualizado) e `getConsolidatedBalance.totalUSD` (nao atualizado).

**Sugestao:** Em usuario migrado, `recordSnapshot` deveria delegar para `walletService.recordWalletTransaction(userId, defaultWalletId, ...)`. Documentar decisao em ADR-035.

---

### MED-7 — `WalletTransactionDialog` nao mostra preview do "novo saldo em USD" para wallets nao-USD

**Localizacao:** `client/src/components/bankroll/WalletTransactionDialog.tsx:170-174`

Atualmente mostra apenas `R$ 5500.00` (moeda nativa). Spec RF-12 implica preview rico: "Inclui preview 'novo saldo: X' antes de submeter". Em wallet BRL, usuario gostaria de ver tambem "($1100 USD apos rate 5.0)".

**Sugestao:** Adicionar conversao via `exchangeRateBRL` (ja exposta em `GET /api/bankroll`).

---

### MED-8 — Tournament Selector cache invalidacao **NAO TESTADA** apos POST `/api/wallets/:id/transactions`

**Localizacao:** `tests/integration/compat/bankroll-v1-compat.test.ts:131` (ainda `it.todo`).

Spec RF-09 e ADR-034 exigem invalidacao do `selectorCache` em qualquer mutacao de wallet. O servico chama `selectorCache.invalidateAllForUser(userId)`, mas nao ha teste validando o caminho end-to-end (POST tx -> selector retorna nova wallet em filtro). Critico em producao porque o selector tem TTL 30min — drift demorado se quebrar.

**Sugestao:** Implementar o `it.todo`.

---

## Issues LOW (nice-to-have)

### LOW-1 — `LEGACY_FX_WARNED_USERS` Set em memoria nunca e limpo (memory leak teorico em long-lived servers)

**Localizacao:** `server/services/bankrollService.ts:145`

`Set<string>` cresce indefinidamente. Em servidor com 10k usuarios ativos, fica ~500KB — nao critico mas vale TTL ou max-size.

---

### LOW-2 — Faltam testes para color picker custom (UX-1 da spec menciona "8 cores predefinidas + custom hex")

**Localizacao:** `client/src/components/bankroll/WalletCreateDialog.tsx`, teste `WalletCreateDialog.test.tsx`

UI atual usa `<input type="color">` (custom apenas, sem 8 cores preset). Cobertura de teste nao valida.

---

### LOW-3 — `WalletEditDialog` nao bloqueia tentativa de mudar `nativeCurrency` ou `platform` no client (depende de error 400 do server)

**Localizacao:** `client/src/components/bankroll/WalletEditDialog.tsx`

Os campos imutaveis nao estao no formulario (OK), mas o dialog nao mostra mensagem informando "moeda e plataforma nao podem mudar — crie nova wallet". Spec RF-12 sugere comunicacao ativa.

---

### LOW-4 — `migrate-qw1-fx-convention.ts` nao usa `storage.transaction` por usuario (RF-04 pede transacao por usuario)

**Localizacao:** `server/scripts/migrate-qw1-fx-convention.ts:130`

Apenas chama `storage.updateUserSettingsExchangeRates` direto, sem wrap em transacao. RF-04 explicita: "Migration roda em uma transacao por usuario". UPDATE de jsonb e atomic em postgres, entao na pratica funciona — mas spec foi imprecisa aqui.

---

### LOW-5 — Comentario "Wallet pending — schema reservado" em `shared/schema.ts:2385` sem indicacao de que rota retorna 405 ou similar

**Localizacao:** `shared/schema.ts:2385-2404`

Tabela `wallet_pending` criada mas spec implica que **endpoints em P0 nao devem aceitar criacao**. Atualmente, qualquer rota que use o schema poderia inserir. Defesa-em-profundidade: adicionar trigger `RAISE EXCEPTION` em INSERT ate spec futura.

---

## Ressalvas conhecidas (NAO-bloqueadores)

- 9 testes legados de FX em `tests/unit/scoring/normalizer.test.ts` e `scoringConstants.test.ts` — refletem convencao ANTIGA. CLAUDE.md erro 2026-04-25 cobre isso. Sera atualizado em sprint de "limpeza de tests legacy".
- 9 transform errors em `tests/unit/coach/tool-registry.test.ts`, `tool-runner.test.ts`, `tools/*.test.ts`, `page-context-*.test.ts` — modulos `server/coachTools/` nao existem (debito tecnico Coach Sprint 2A nao-merged). Nao-escopo Bankroll v2.

---

## Pontos positivos

1. **Schema multi-wallet bem desenhado.** Tabelas `wallets`, `wallet_transactions`, `wallet_pending` cobrem ADR-034 corretamente. Indices `(walletId, occurredAt)` e `(userId, occurredAt)` apoiam queries do RF-10. Reservas de campos (`transferGroupId`, `stakingDealId`) preparam terreno para specs futuras sem schema delta pesado.
2. **SELECT FOR UPDATE em `recordWalletTransaction`.** Concorrencia gerenciada via `selectWalletForUpdate` + transacao + UPDATE balance + INSERT tx — invariante ADR-017 preservada por wallet. Tests com 100 tx serializadas (linha 348-381 do walletService.test.ts) provam.
3. **FX historico imutavel garantido por design.** `fxRateUSDPerNative NOT NULL` no schema; service nao expoe API de UPDATE. ADR-034 RF item 2 entregue.
4. **Migration v1->v2 idempotente bem feita.** Flag `bankrollV2Migrated` + `existingWallets > 0` + transacao por usuario. Rollback (apesar de script faltar) tem dados suficientes em log.
5. **Cobertura de testes razoavel.** 4040 linhas de testes (tests/unit/wallets/* + integration/wallets/* + integration/migrations/* + integration/compat/* + currencyNormalizer.test.ts + qw1-fx-convention.test.ts + walletService.test.ts). Tests de invariante em `walletService.recordWalletTransaction` validam ADR-017.
6. **Telemetria QW-1 elegante.** `LEGACY_FX_WARNED_USERS` Set + warning unico por (userId, sessao) detecta usuarios nao-migrados pos-deploy.
7. **Cache invalidation bem orquestrada.** `selectorCache + bankrollCache + walletCache` todos invalidados em mutacoes via `invalidateCaches(userId)`.
8. **i18n pt-BR consistente.** Todas as mensagens de erro do walletService e routes em pt-BR.
9. **data-testid presente em todos os componentes UI.** Aprende a licao de CLAUDE.md 2026-04-24 — testes usam testid estavel, nao DOM heuristic.

---

## Recomendacao final

**BLOQUEADO ate HIGH-1, HIGH-2, HIGH-3 corrigidos.**

- HIGH-1 (csvParser FX) e CATACLISMICO em producao — qualquer usuario que faca upload de CSV BRL pos-deploy ve dados corrompidos. Bloqueador absoluto.
- HIGH-2 (archive no-op) e bug funcional visivel — usuario nao consegue arquivar wallets via UI. Bloqueador absoluto.
- HIGH-3 (`GET /api/bankroll` desatualizado) e bloqueador soft — Tournament Selector e Coach AI veem banca incorreta apos criar 2a wallet. Critico para produto, mas pode ir para hotfix imediato pos-merge SE o founder priorizar speed.

HIGH-4 a HIGH-7 podem ser tratados como follow-up curto (1-2 dias). Sao bugs reais mas com workaround mental + dados nao corrompidos:
- HIGH-4: race condition em criacao de nome duplicado — baixa probabilidade de explorar sem retry agressivo.
- HIGH-5: snapshot espelho errado — quebra historico mas nao quebra funcionalidade core das wallets.
- HIGH-6: Settings UI confuso — restrigido a usuarios que abrem aba de cotacoes (low traffic).
- HIGH-7: cross-tenant theoretical — nao explorado hoje pois service-layer protege.

MEDs e LOWs todas pos-merge.

**Apos correcao dos HIGH-1/2/3, recomendo:**
1. Re-rodar `npm test` para validar 5075 verdes mantidos.
2. Adicionar testes de integracao para os fixes (cross-module CSV-vs-Selector, archive PATCH real call, getBankrollState delegando para getConsolidatedBalance).
3. Re-submeter para review (eu mesmo) ou merger.

**Caminho do arquivo de review:** `Docs/reports/bankroll-v2-review-2026-04-26.md` (este arquivo).
