# ADR-163: FX Cascade Compartilhada (`fxResolver`) como Fonte Canonica para Variance KPI (Sprint Variance-1)

## Status
Aceito

## Data
2026-05-15

## Sprint
Variance-1 (`Docs/specs/sprint-variance-1.md`, RF-01 — dependencia indireta de fora-de-escopo)

## Decision owner
system-architect (Sprint Variance-1, decisao de **nao refatorar** + manter spec atual)

## Related
- Depende de: ADR-061 (`fxResolver` unificado — Bankroll-3), ADR-121 (`system_fx_rates` global — FX-1), ADR-122 (multi-source fallback chain BCB/frankfurter), ADR-123 (cron diario 17 UTC), ADR-033 (FX rate convention units-per-USD).
- Reusa: `server/services/fxResolver.ts` (`resolveExchangeRates(userId)` — ja exportado, ja em producao).
- Sucessor de: nenhum. **Esta ADR existe explicitamente para documentar que a spec original (sprint-variance-1.md secao "Notas de Implementacao") propunha extrair `resolveExchangeRates` de `primedopeIntegration.ts:122-157` mas isso geraria duplicacao com `fxResolver.ts` ja consolidado.**
- Sera substituido por: nenhum previsto. Refactor full de `primedopeIntegration.ts` para usar `fxResolver` direto eh follow-up fora deste sprint.

---

## 1. Contexto

A spec original do Sprint Variance-1 (versao primeira leitura, antes desta ADR) sugeria extrair a funcao `resolveExchangeRates(userId)` de `server/services/primedopeIntegration.ts:122-157` para um novo modulo `server/services/fx.ts`, reutilizavel por `storage.getVarianceVsExpected`.

Auditoria do codigo durante a etapa de design revelou:

1. **`server/services/fxResolver.ts` ja existe** (ADR-061 Bankroll-3) e exporta `resolveExchangeRates(userId): Promise<FxRates>` com a **mesma assinatura**.

2. **`fxResolver.ts` ja eh a cascata canonica** (estendida por ADR-121 FX-1 com `system_fx_rates` global):
   ```
   1. users.exchangeRates (override per-user)
   2. wallets.exchangeRates (per-wallet, agregado)
   3. system_fx_rates (global, atualizado por cron 17 UTC — ADR-122)
   4. FX_FALLBACK_CONSTANTS (BRL=5.0, EUR=0.92, etc.)
   ```

3. **`primedopeIntegration.ts:122-157` tem helper local `resolveExchangeRates`** que faz cascata **menor** (apenas users + wallets + fallback constants, sem `system_fx_rates`). Eh **legacy code** anterior a FX-1.

4. **Duplicar via novo `fx.ts`** geraria 3 implementacoes do mesmo helper (`primedopeIntegration.ts`, `fxResolver.ts`, `fx.ts`).

A pergunta: **qual fonte usar em `storage.getVarianceVsExpected`?**

3 opcoes:
- **(A) Criar `fx.ts` extraindo do `primedopeIntegration.ts`** (spec original — extracao mecanica).
- **(B) Refatorar `primedopeIntegration.ts` para usar `fxResolver.ts`** (full consolidate).
- **(C) Reusar `fxResolver.ts` direto em `getVarianceVsExpected`, deixar `primedopeIntegration.ts` legacy intacto** (escolhida).

### Restricoes

- **Lesson #6 (FX antes de threshold USD):** agregacao P&L em USD obrigatoria. `fxResolver` ja segue convencao ADR-033 (units per USD).
- **Lesson #10 (DRY de helpers):** triplicacao do helper FX seria violacao.
- **Lesson #28 (mock por path exato):** testes de `getVarianceVsExpected` mockam **`server/services/fxResolver`** (path real). Mock de `primedopeIntegration.ts` nao se aplica.
- **Escopo:** "Sprint Variance-1" foca em religar KPI, NAO refatorar PrimeDope integration. ADR-061 ja estabeleceu `fxResolver` como canonico — basta consumir.
- **Risco de regressao:** alterar `primedopeIntegration.ts` (opcao B) afeta o pipeline PrimeDope (cache hash, expiration, FX-normalized buyins enviados pra API externa). Fora de escopo.

---

## 2. Decisao

### 2.1 Regra unica

**`storage.getVarianceVsExpected(userId)` chama `resolveExchangeRates(userId)` exportado por `server/services/fxResolver.ts`.**

```ts
// server/storage.ts (novo getVarianceVsExpected)
import { resolveExchangeRates } from "./services/fxResolver";

async getVarianceVsExpected(userId: string): Promise<VarianceResult | null> {
  // ...
  const fxRates = await resolveExchangeRates(userId);
  // ...
  for (const session of sessions) {
    const pnlUsd = convertToUsd(session.pnlNative, session.currency, fxRates);
    // ...
  }
  // ...
}
```

### 2.2 Conversao native → USD

Reusar helper existente do projeto:
- `server/services/fxResolver.ts` ja exporta utilitarios (verificar nome — provavelmente `convertToUsd` ou equivalente).
- Caso nao haja helper publico, criar **inline em `storage.ts`** (`amount / fxRate` com defesa contra 0/null).

Convencao **units-per-USD** (ADR-033):
- `fxRates.BRL = 5.10` → 1 USD = 5.10 BRL → `usdValue = nativeValue / 5.10`.

### 2.3 `primedopeIntegration.ts` legacy

**Nao tocar.** O helper `resolveExchangeRates` local (linhas 122-157) continua sendo usado pela rota `POST /api/primedope/simulate`. Eh aceito como divida tecnica:

- Funciona em producao (Sprint F4 ADR-054).
- Divergencia: nao consulta `system_fx_rates` global → users sem `users.exchangeRates`/`wallets.exchangeRates` configurados caem direto pros constants. Impacto: simulacao PrimeDope pode usar FX rate ligeiramente desatualizado vs cron diario.
- Mitigacao futura: ADR follow-up para Sprint AI-2A consolidar **dentro** do refactor PrimeDope nativo.

---

## 3. Opcoes Consideradas

### 3.1 Opcao A — Criar `server/services/fx.ts` extraindo de `primedopeIntegration.ts`
**Pros:**
- Spec original sugeria isso.
- Refactor pequeno, isolado em `primedopeIntegration.ts`.

**Contras:**
- **Triplicacao do helper** (`primedopeIntegration.ts` + `fx.ts` + `fxResolver.ts`).
- Confusao para devs futuros ("qual e o canonico?").
- Lesson #10 violada (DRY de helpers).
- Helper extraido NAO incluiria `system_fx_rates` (a versao em `primedopeIntegration.ts` eh anterior a FX-1).

**Rejeitada.**

### 3.2 Opcao B — Refatorar `primedopeIntegration.ts` para chamar `fxResolver`
**Pros:**
- Consolidacao completa: uma so fonte FX em todo o backend.
- `system_fx_rates` ativo no pipeline PrimeDope automaticamente.

**Contras:**
- Mexe em codigo de producao critico (cache PrimeDope, hash determinista).
- Mudanca de FX rates pode alterar hashes de input (ADR-054: `inputHash sha256 deterministico pos-FX`) → invalida cache existente.
- Fora de escopo do Sprint Variance-1.
- Risco de regressao alto.

**Rejeitada para este sprint. Documentada como follow-up.**

### 3.3 Opcao C — Reusar `fxResolver.ts` direto, deixar `primedopeIntegration.ts` legacy intacto **(escolhida)**
**Pros:**
- Zero duplicacao nova.
- Zero risco de regressao em PrimeDope simulate.
- Lesson #10 respeitada.
- `getVarianceVsExpected` recebe FX cascade mais robusta (com `system_fx_rates`).
- Testes do storage mockam `fxResolver` (path canonico).

**Contras:**
- `primedopeIntegration.ts` continua legacy (divida tecnica conhecida).
- 2 caminhos FX coexistem (mas isolados — variance KPI vs simulate endpoint).

**Aceita.**

---

## 4. Consequencias

### 4.1 Positivas
- Sem duplicacao de helper FX.
- `getVarianceVsExpected` herda automatic upgrades do `fxResolver` (ex: `system_fx_rates` ADR-121, novos fallbacks).
- Mock simples em testes (`vi.mock('../services/fxResolver')` — lesson #28).
- ADR-061 reforcada como canonica (fxResolver = single source of truth FX).

### 4.2 Negativas
- `primedopeIntegration.ts` continua usando helper local — divergencia silenciosa entre simulate endpoint e variance KPI.
- Documentacao precisa explicar que `fxResolver` eh canonico mas existe legacy em primedope.

### 4.3 Neutras
- Nenhuma mudanca em codigo existente alem de `getVarianceVsExpected`.
- Nenhuma migration.

---

## 5. Confianca
**Alta.** `fxResolver.resolveExchangeRates` ja esta em producao desde Bankroll-3 (ADR-061), testado em 5+ services (wallet balance, snapshot, transfer, rakeback, FX-1 cron). Reuso direto = baixo risco.

---

## 6. Plano de Reversao
Nao aplicavel — esta ADR documenta **nao-acao** (nao extrair helper novo). Reversao seria criar duplicacao (rejeitada).

Caso futuro queira-se consolidar `primedopeIntegration.ts` → criar ADR-Sxxx (Sprint AI-2A ou follow-up dedicado), com plano de invalidacao de cache `primedope_runs` (rehash inputs).

---

## 7. Follow-ups (fora deste sprint)

1. **Refactor `primedopeIntegration.ts:122-157`** para usar `fxResolver` — Sprint AI-2A ou posterior. Requer:
   - Plano de invalidacao de `primedope_runs.input_hash`.
   - Migration ou re-simulacao de runs antigos.
   - Comparacao A/B (FX antigo vs novo) para auditoria.

2. **Documentar em CLAUDE.md §10** — adicionar bullet "FX divergence: `fxResolver` canonico EXCETO `primedopeIntegration.ts:122-157` (legacy F4, follow-up AI-2A)".

---

## 8. Referencias
- Spec: `Docs/specs/sprint-variance-1.md` (secao "Fora de Escopo" + "Notas de Implementacao").
- Canonico: `server/services/fxResolver.ts:88` (`export async function resolveExchangeRates(userId: string): Promise<FxRates>`).
- Legacy: `server/services/primedopeIntegration.ts:122-157`.
- ADRs reusadas: 033, 061, 121, 122, 123.
- Lessons #6, #10, #28.
