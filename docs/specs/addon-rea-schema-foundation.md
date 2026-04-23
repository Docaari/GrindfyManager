# Add-on & Re-Entry — Schema Foundation

**ID:** spec-addon-rea-foundation
**Data:** 2026-04-23
**Status:** Draft
**Prioridade:** Alta
**Estimativa:** M
**Dependências:** nenhuma

Pré-requisito técnico das specs `spec-addon-rea-addon-ux` (`grind-live-addon-ux.md`) e `spec-addon-rea-reentry-flow` (`grind-live-reentry-flow.md`). Esta spec entrega schema, migração, backfill, parser e cálculo. **Não há nenhuma mudança visível ao usuário final.** Deploy é seguro e independente.

---

## 1. Problema

### User story
> "Como jogador profissional de MTT, eu registro meus torneios na sessão ao vivo, mas o sistema não diferencia torneios que permitem Add-on (incremento opcional de stack no intervalo, tipicamente 100% do buy-in) de torneios regulares. Além disso, não diferencia torneios ReA (Re-entry Allowed) de torneios com rebuy tradicional — o que me força a usar o botão REBUY como workaround. Resultado: meu ROI fica inflado e meu ABI fica subestimado."

### Quantificação do leak (auditoria do estrategista, /grind-live)

| Leak | Incidência | Impacto |
|------|------------|---------|
| **Add-on não rastreado** | ~20% dos torneios jogados são "Plus" | ROI inflado em **8–15 pontos percentuais** nos torneios afetados (add-on = ~100% do buy-in não contabilizado no investimento) |
| **ReA usando REBUY como workaround** | ~15% do volume total (torneios com "Re-Entry" ou "ReA" no nome) | ABI errado em **~22%** nesses torneios; KPI de "Rebuys" e "Re-Entries" confundido semanticamente |

### Quem sofre
- **100% dos usuários ativos** do Grind Live. Um jogador típico profissional joga 40–80 torneios/semana — 8–16 deles Plus, 6–12 deles ReA. Todo fim de semana ou festival (KO Series, WCOOP, SCOOP) esses números dobram.

### Por que importa
- **Grindfy é ferramenta de decisão financeira.** ROI errado leva o jogador a insistir em um horário/estrutura perdedora ou a abandonar uma estrutura lucrativa por ruído estatístico. O leak compromete a proposta de valor central do produto.
- O dashboard de Analytics, Library Stats, Studies (correlação estudo-performance) e AI Coach **todos** consomem esses números. Corrigir na base propaga para todo o pipeline analítico.

---

## 2. Objetivo

**Outcome mensurável (7–14 dias pós-deploy das 3 specs):**

1. **>=95% dos torneios importados via CSV e Suprema** com flags `allowsAddOn` e `allowsReentry` preenchidas (não nulas) no backfill.
2. **Cálculo de `totalInvestido` e `roi` 100% equivalente** ao anterior para torneios sem flags (regressão zero). Os testes de `calculateSessionStats` passam tanto no caminho novo (com flags) quanto no caminho legado (sem flags).
3. **Nenhum endpoint existente quebra.** Todos os 23 endpoints que tocam `session_tournaments`, `tournaments`, `planned_tournaments` e `tournament_library` continuam respondendo corretamente.

**Outcome desta spec isolada (sem Spec 2 e 3):**

- Base técnica pronta e testada; zero impacto visível; `% torneios com allowsAddOn=true` no banco > 15% (backfill bem-sucedido); `% torneios com allowsReentry=true` > 10%.

---

## 3. Escopo

### Incluído

- Migração `drizzle-kit push` adicionando 6 colunas nullable em 4 tabelas.
- Script de backfill via regex no nome do torneio (Plus, Re-Entry, ReA, R/A, Reentry).
- Atualização do `server/csvParser.ts` (WPN, GGNetwork, PokerStars, PartyPoker, 888, Bodog, CoinPoker, Chico, Revolution, iPoker) para detectar Plus e ReA no nome.
- Atualização do `server/routes/suprema.ts` (integração Suprema Poker) para popular as flags.
- Atualização do `shared/schema.ts` — Drizzle + Zod (`insertSessionTournamentSchema`, `insertPlannedTournamentSchema`, `insertTournamentLibrarySchema`, `insertTournamentSchema`).
- Atualização do `client/src/components/grind-session-live/calculateSessionStats.ts` — nova fórmula `totalInvestido = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0)`. Aplicar em ambas funções: `calculateSessionStats` (linha 122–127) e `calculateFinalSessionStats` (linha 269–274).
- **Atualização do `server/storage.ts`** (linhas ~1910–2060, agregação de `getTournamentStats`): a fórmula atual de `totalInvested = totalBuyins + totalReentriesCost` **ignora rebuys e add-on**. Substituir por `totalInvested = Σ buyIn + Σ (rebuys * buyIn) + Σ (reentries * buyIn) + Σ (addOnTaken ? addOnCost : 0)`. Isto corrige o leak no Dashboard/Analytics de forma consistente com o live-session.
- **Atualização do `server/routes/analytics.ts`** (linha 480, função `avgROI` por sessão): a fórmula `(totalPrize - totalBuyIn) / totalBuyIn` também ignora rebuys/reentries/add-on. Atualizar para usar a mesma base de `totalInvested` expandido.
- Atualização do `client/src/components/grind-session-live/types.ts` — tipos `SessionTournament` e `SessionStats`. `SessionTournament` ganha `allowsAddOn, addOnCost, addOnTaken, allowsReentry, maxReentries, reentries`; `NewTournamentForm` ganha os mesmos campos opcionais (usados pelo AddTournamentDialog na Spec 2 e 3).
- Endpoints GET continuam retornando os novos campos; endpoints POST/PUT aceitam os novos campos como opcionais.
- **Processamento numérico no `PUT /api/session-tournaments/:id`** (`server/routes/grind-sessions.ts:706-760`): o handler atual já coage `rebuys` → `parseInt`. Adicionar coerção equivalente para `reentries` (parseInt, default 0) e `addOnTaken` (Boolean). Caso contrário, Zod refinements recebem string e falham inesperadamente.
- Testes unitários para: schema Zod, regex do backfill, fórmula de cálculo (3 lugares: `calculateSessionStats`, `calculateFinalSessionStats`, `storage.getTournamentStats`), parser CSV.

### Fora do escopo (NÃO fazer aqui)

- **Nenhuma UI nova.** Sem botão, sem badge, sem modal, sem tooltip. Spec 2 cuida do Add-on UX, Spec 3 cuida do ReA UX.
- **Nenhuma mudança no `handleRebuyTournament`** em `GrindSessionLive.tsx` (linha 922–924). Spec 3 separa Rebuy de Re-entry.
- **Nenhum KPI novo** ("Entradas Totais" fica para Spec 3).
- Não tocar em `tournaments.reentries` já existente (linha 202 de `shared/schema.ts`) — apenas reusar. Spec 3 vai usar o campo em `session_tournaments`.
- Não atualizar `client/src/pages/GrindSession.tsx` (dashboard de histórico de sessões) — ele lê o snapshot salvo, não precisa mudança.
- Sem feature flag. A migração é aditiva; nullable em produção; rollback = `ALTER TABLE DROP COLUMN`.

---

## 4. Solução técnica

### 4.1 Schema (Drizzle)

Adicionar **em 4 tabelas** os seguintes campos. Todos `nullable`/com default para zero breakage.

#### `tournament_library` — `B:\grindfy\shared\schema.ts:1401-1417`

```ts
allowsAddOn: boolean("allows_addon").default(false),
addOnCost: decimal("addon_cost"),                      // nullable; default buyIn na UI
allowsReentry: boolean("allows_reentry").default(false),
maxReentries: integer("max_reentries"),                // nullable = ilimitado
```

(Não adicionar `addOnTaken` nem `reentries` em `tournament_library` — essas são **instâncias de jogo**, não características de torneio.)

#### `planned_tournaments` — `B:\grindfy\shared\schema.ts:257-288`

```ts
allowsAddOn: boolean("allows_addon").default(false),
addOnCost: decimal("addon_cost"),
allowsReentry: boolean("allows_reentry").default(false),
maxReentries: integer("max_reentries"),
```

(Não adicionar `addOnTaken`/`reentries` aqui. Planned é o template do dia; só no `session_tournaments` há instância de jogo.)

**Copy-on-promote:** quando um `planned_tournament` é promovido a `session_tournament` (fluxo em `GrindSessionLive.tsx:965` via `handleRegisterTournament`, que chama `addTournamentMutation.mutate({ ... })`), o payload **deve copiar** `allowsAddOn`, `addOnCost`, `allowsReentry` e `maxReentries` do planned para o session. O handler atual (linha 948 e 965) explicitamente passa cada campo — adicionar esses 4 campos ao payload. Sem isso, torneios entram na sessão sem as flags mesmo quando o planejamento as tem.

#### `session_tournaments` — `B:\grindfy\shared\schema.ts:356-388`

```ts
// Características do torneio (copiadas de planned ao registrar)
allowsAddOn: boolean("allows_addon").default(false),
addOnCost: decimal("addon_cost"),
allowsReentry: boolean("allows_reentry").default(false),
maxReentries: integer("max_reentries"),
// Instância de jogo (ações do jogador)
addOnTaken: boolean("addon_taken").default(false),
reentries: integer("reentries").default(0),
```

**Nota importante:** `session_tournaments` atualmente **NÃO possui coluna `reentries`** (já existe em `tournaments` linha 202, mas não em `session_tournaments` nem em `planned_tournaments`). Esta migração **adiciona `reentries` em duas tabelas novas** (session e planned) — verificar que o `db:push` gere o comando correto em ambas. Testar: `\d session_tournaments` pós-migração confirma presença da coluna.

#### `tournaments` (histórico) — `B:\grindfy\shared\schema.ts:187-219`

```ts
allowsAddOn: boolean("allows_addon").default(false),
addOnCost: decimal("addon_cost"),
addOnTaken: boolean("addon_taken").default(false),
allowsReentry: boolean("allows_reentry").default(false),
maxReentries: integer("max_reentries"),
// reentries já existe (linha 202); reusar
```

#### Relatório de índices recomendados (opcionais, baixa prioridade)

```ts
// em session_tournaments:
index("idx_session_tournaments_addon_taken").on(table.sessionId, table.addOnTaken),
// em tournaments:
index("idx_tournaments_user_reentry").on(table.userId, table.allowsReentry),
```

### 4.2 Migração em 3 fases

**Fase 1 — Schema push (zero downtime):**
```bash
npm run db:push
```
Drizzle adiciona colunas nullable com defaults. Código antigo continua funcionando — ignora campos novos.

**Fase 2 — Backfill (script idempotente em `server/scripts/backfill-addon-rea.ts`):**

```ts
// Regex patterns (case-insensitive, word boundaries)
// Plus: detectar "Plus" mas NÃO "Surplus", "ExpressPLUS", "SurpluS"
const PLUS_REGEX = /(?<![A-Za-z])plus(?![A-Za-z])|\+\s*add[- ]?on/i;
// ReA: detectar variantes "Re-Entry", "ReA", "R/A" mas evitar "ReAl", "ReAlly"
const REA_REGEX = /(?<![A-Za-z])(re[- ]?entry|re[- ]?entries|rea|r\/a|reentry)(?![A-Za-z])/i;

// Em PostgreSQL, \m e \M são word boundaries com sensibilidade correta:
// UPDATE ... SET
//   allows_addon = true WHERE name ~* '(^|[^a-z])plus($|[^a-z])|\+\s*add[- ]?on' AND allows_addon IS NOT TRUE;
//   allows_reentry = true WHERE name ~* '(^|[^a-z])(re-?entry|re-?entries|rea|r/a|reentry)($|[^a-z])' AND allows_reentry IS NOT TRUE;
//   addon_cost = buy_in WHERE allows_addon = true AND addon_cost IS NULL;
```

**Blocklist explícito de falsos positivos** (hardcode via `NOT name ~* pattern`):
- `ExpressPLUS`, `ExpressPlus` (freeroll da 888, não tem add-on real)
- `SurPlus`, `Surplus` (torneio "excedente" em algumas redes)
- `APlus`, `A+` isolado em nomes

Aplicar como segunda camada: primeiro matches pela regex, depois `UPDATE ... SET allows_addon = false WHERE name ~* '(ExpressPlus|Surplus|APlus)' AND allows_addon = true`.

Rodar em transação. Log de amostra (10 registros por categoria). Taxa de detecção esperada: >70% Plus e >60% ReA (alguns nomes não seguem convenção).

**Escopo do backfill — comportamento diferente por tabela:**

| Tabela | `allowsAddOn` / `allowsReentry` | `addOnCost` | `addOnTaken` / `reentries` |
|--------|----------------------------------|-------------|-----------------------------|
| `tournaments` (histórico) | Detectar via regex | `= buyIn` se detectar | **NÃO tocar.** `reentries` já existe com valor do CSV; `addOnTaken` fica `false` (histórico não tem como saber) |
| `tournament_library` | Detectar via regex | `= buyIn` se detectar | N/A (colunas não existem na tabela) |
| `planned_tournaments` | Detectar via regex | `= buyIn` se detectar | N/A (colunas não existem na tabela) |
| `session_tournaments` | Detectar via regex | `= buyIn` se detectar | **NÃO tocar.** `addOnTaken=false` e `reentries=0` como defaults |

**Isolação do backfill por usuário:** rodar via iteração `user_id` para permitir retry parcial. Log por usuário: `[backfill] user=USER-1234: 42 Plus, 15 ReA detected in tournaments table`.

**Fase 3 — Código consumindo as flags:** feito junto da Spec 2 e Spec 3.

### 4.3 API (contratos)

**Princípio:** nenhum endpoint **muda contrato existente**; todos passam a **retornar os novos campos** e **aceitar os novos campos** como opcionais em POST/PUT.

#### Endpoints afetados — retornam os novos campos no JSON

- GET `/api/tournaments` — inclui `allowsAddOn`, `addOnCost`, `addOnTaken`, `allowsReentry`, `maxReentries`, `reentries`
- GET `/api/tournament-library` — inclui `allowsAddOn`, `addOnCost`, `allowsReentry`, `maxReentries`
- GET `/api/tournaments/library` (se existir)
- GET `/api/planned-tournaments` — inclui `allowsAddOn`, `addOnCost`, `allowsReentry`, `maxReentries`
- GET `/api/grind-sessions/:sessionId/tournaments` — inclui todos os 6 campos (library + instance)
- GET `/api/dashboard/stats`, `/api/dashboard/performance`, `/api/analytics/*` — campos não precisam ser expostos ao front (Spec 2 e 3 consumirão), mas usados internamente no cálculo de ROI.

#### Endpoints que aceitam os novos campos como opcionais em POST/PUT

- POST/PUT `/api/tournaments/:id`
- POST/PUT `/api/tournament-library/:id`
- POST/PUT `/api/planned-tournaments/:id`
- POST `/api/grind-sessions/:sessionId/tournaments` (se existir; ou cria via PUT de planned→session)
- POST `/api/upload-history` (via `csvParser` internamente)

**Schemas Zod** (em `shared/schema.ts`):

```ts
// extend em insertSessionTournamentSchema, insertPlannedTournamentSchema,
// insertTournamentLibrarySchema e insertTournamentSchema:
allowsAddOn: z.boolean().optional().default(false),
addOnCost: z.union([z.string(), z.number()]).nullable().optional()
  .transform(v => v == null ? null : String(v)),
addOnTaken: z.boolean().optional().default(false),   // apenas session_tournaments + tournaments
allowsReentry: z.boolean().optional().default(false),
maxReentries: z.number().int().nullable().optional(),
reentries: z.number().int().nonnegative().optional().default(0),  // apenas session_tournaments
```

**Validação cruzada** (em `insertSessionTournamentSchema` e `insertTournamentSchema`):

```ts
.refine(
  d => !d.addOnTaken || d.allowsAddOn,
  { message: "addOnTaken só pode ser true se allowsAddOn for true", path: ['addOnTaken'] }
)
.refine(
  d => (d.reentries ?? 0) === 0 || d.allowsReentry,
  { message: "reentries > 0 só em torneios com allowsReentry=true", path: ['reentries'] }
)
.refine(
  d => d.maxReentries == null || (d.reentries ?? 0) <= d.maxReentries,
  { message: "reentries excede maxReentries", path: ['reentries'] }
)
.refine(
  d => !d.addOnTaken || (d.addOnCost != null && parseFloat(String(d.addOnCost)) > 0),
  { message: "addOnCost deve ser > 0 quando addOnTaken=true", path: ['addOnCost'] }
)
.refine(
  d => d.maxReentries == null || d.maxReentries >= 0,
  { message: "maxReentries não pode ser negativo", path: ['maxReentries'] }
)
```

**Atenção — updates parciais (PUT):** os refinements acima assumem payload completo. No handler `PUT /api/session-tournaments/:id` em `server/routes/grind-sessions.ts:706`, o update é **parcial** (Partial<SessionTournament>). Se o request só envia `addOnTaken=true`, o refinement `!d.addOnTaken || d.allowsAddOn` falha porque `d.allowsAddOn` vem undefined no payload. **Solução**: antes de validar, carregar o registro atual do banco e fazer merge `{ ...existing, ...body }` para validar contra o estado final. Documentar isso no handler e adicionar teste cobrindo update parcial.

#### Status codes

- POST/PUT com `addOnTaken=true` e `allowsAddOn=false` → **400** com `{ message: "Torneio não permite add-on" }`
- POST/PUT com `reentries=3` e `maxReentries=2` → **400** com `{ message: "Excede limite de re-entradas (max 2)" }`
- POST/PUT sem os campos → **200** com defaults (`false`, `0`, `null`)

### 4.4 UI

**Nenhuma.** Explícito: esta spec é pré-requisito técnico. Toda UI fica em Spec 2 (Add-on) e Spec 3 (ReA).

### 4.5 Lógica de negócio

#### Fórmula nova de `totalInvestido`

Substituir, em `client/src/components/grind-session-live/calculateSessionStats.ts:122-127`:

```ts
// ANTES
const totalInvestido = allSessionTournaments.reduce((sum: number, t: any) => {
  const buyIn = parseFloat(t.buyIn || '0');
  const rebuys = parseInt(t.rebuys) || 0;
  const invested = buyIn * (1 + rebuys);
  return sum + invested;
}, 0);
```

```ts
// DEPOIS
const totalInvestido = allSessionTournaments.reduce((sum: number, t: any) => {
  const buyIn = parseFloat(t.buyIn || '0');
  const rebuys = parseInt(t.rebuys) || 0;
  const reentries = parseInt(t.reentries) || 0;
  const addOnTaken = Boolean(t.addOnTaken);
  const addOnCost = parseFloat(t.addOnCost || '0');
  const invested = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0);
  return sum + invested;
}, 0);
```

Aplicar **a mesma fórmula** em `calculateFinalSessionStats` (linhas 269–274 do mesmo arquivo) para que o summary modal coincida com o dashboard ao vivo.

#### Invariantes

1. `addOnTaken === false` para todos os torneios novos (sem UI pra marcar true ainda — esta spec não inclui o botão).
2. `reentries === 0` para todos os torneios novos (sem UI pra incrementar ainda — esta spec não inclui o flow).
3. Para torneios pré-existentes sem as flags: comportam-se como `allowsAddOn=false`, `addOnTaken=false`, `allowsReentry=false`, `reentries=0` → fórmula nova é **numericamente idêntica** à antiga.
4. Após backfill: torneios com "Plus" no nome passam a ter `allowsAddOn=true` mas `addOnTaken=false` (ninguém clicou ainda) → ainda numericamente idêntico.

#### Parser CSV (`server/csvParser.ts`)

Adicionar na função que cria o objeto de torneio a partir do nome:

```ts
const plusMatch = /\b(plus|\+\s*add[- ]?on)\b/i.test(tournamentName);
const reaMatch = /\b(re[- ]?entry|re[- ]?entries|rea|r\/a|reentry)\b/i.test(tournamentName);

return {
  ...existingFields,
  allowsAddOn: plusMatch,
  addOnCost: plusMatch ? buyIn : null,   // default = buyIn; usuário pode editar depois
  allowsReentry: reaMatch,
  // addOnTaken e reentries vêm do histórico do torneio (se disponível nos dados do CSV)
};
```

**WPN, GGNetwork, PokerStars:** muitas vezes trazem `Re-Entries` como coluna separada — se existir, popular `reentries`. Caso contrário, ficar em 0.

#### Integração Suprema (`server/routes/suprema.ts`)

A API da Suprema às vezes traz `reentry: true/false` como flag. Mapear direto. Para add-on, Suprema não tem flag explícita — usar mesma regex do nome.

---

## 5. Fluxo do usuário

**Nenhum.** Esta spec não tem fluxo de usuário. O usuário continua usando o app do jeito que usa hoje, e o banco/cálculo silenciosamente começam a suportar add-on/re-entry. Spec 2 e 3 adicionam os fluxos.

---

## 6. Critérios de aceitação

Cada bullet é testável. >= 1 teste automatizado por bullet.

- [ ] `npm run db:push` aplica a migração sem erro em banco limpo e em banco populado (testar ambos)
- [ ] Após migração, `tournaments`, `tournament_library`, `planned_tournaments` e `session_tournaments` têm as 6 colunas (exceto combinações omitidas: `addOnTaken`/`reentries` só em session_tournaments e tournaments)
- [ ] Script `backfill-addon-rea.ts` é idempotente — rodar 2x produz mesmo resultado
- [ ] Torneios com "Plus" no nome (case-insensitive) → `allowsAddOn=true` após backfill
- [ ] Torneios com "Re-Entry", "Re-entry", "ReA", "R/A", "Reentry" no nome → `allowsReentry=true` após backfill
- [ ] Torneios sem esses padrões no nome → flags permanecem `false`
- [ ] Após backfill, `addOnCost = buyIn` para torneios com `allowsAddOn=true` que tinham `addOnCost=null`
- [ ] `calculateSessionStats` com torneios sem flags → `totalInvestido` bit-a-bit igual ao cálculo anterior
- [ ] `calculateSessionStats` com `addOnTaken=true` e `addOnCost=10.50` → adiciona 10.50 a `totalInvestido`
- [ ] `calculateSessionStats` com `reentries=2` e `buyIn=5.50` → `totalInvestido += 5.50 * 2` (independente de rebuys)
- [ ] `calculateFinalSessionStats` (linha 269) espelha o mesmo cálculo — dashboard ao vivo e summary modal batem
- [ ] GET `/api/tournaments` retorna os 6 campos novos em cada torneio
- [ ] GET `/api/grind-sessions/:id/tournaments` retorna os 6 campos novos
- [ ] POST `/api/tournament-library` aceita `{ allowsAddOn: true, addOnCost: "10.00" }` e persiste
- [ ] POST `/api/planned-tournaments` aceita `{ allowsReentry: true, maxReentries: 3 }` e persiste
- [ ] POST `/api/grind-sessions/:id/tournaments` com `{ addOnTaken: true, allowsAddOn: false }` → **400**
- [ ] POST com `{ reentries: 5, maxReentries: 3 }` → **400** com mensagem "Excede limite de re-entradas (max 3)"
- [ ] Parser CSV WPN, GGNetwork e PokerStars detecta "Plus" e "ReA" corretamente em 10 fixtures de cada (usar `tests/fixtures/`)
- [ ] Parser rejeita falso positivo "Surplus Championship" (`allowsAddOn=false`) — teste com fixture explícita
- [ ] Parser rejeita falso positivo "ExpressPLUS" (freeroll 888) — teste com fixture explícita. Blocklist é aplicado após regex match.
- [ ] Integração Suprema popula as flags corretamente
- [ ] Testes unitários do schema Zod cobrem: addOnTaken sem allowsAddOn, reentries acima de maxReentries, valores default, coercion de string→number, `addOnTaken=true` com `addOnCost=null` rejeitado, `maxReentries=-1` rejeitado
- [ ] Update parcial PUT com refinement cruzado: payload `{addOnTaken: true}` sobre torneio com `allowsAddOn=false` retorna 400 (merge com DB antes da validação)
- [ ] `storage.getTournamentStats` retorna `totalInvested` calculado com `rebuys + reentries + addOn` — teste com dataset de 20 torneios variados confirmando o novo cálculo
- [ ] `server/routes/analytics.ts` linha 480 atualizada: `avgROI` por sessão inclui rebuys/reentries/addOn no denominador
- [ ] Copy-on-promote: ao chamar `addTournamentMutation` com `fromPlannedTournament=true`, o session_tournament criado tem `allowsAddOn, addOnCost, allowsReentry, maxReentries` copiados do planned. Teste de integração.
- [ ] Nenhum endpoint pré-existente regride em comportamento (suite de integração passa sem mudanças de expectativa) **EXCETO** valores de ROI/ABI em `dashboard/stats` e `analytics/*` que passam a considerar rebuys corretamente — documentar como mudança esperada no changelog

---

## 7. Casos de borda

1. **Nome com "Plus" dentro de outra palavra (ex: "Surplus Warriors")**: regex com lookbehind/lookahead `(?<![A-Za-z])plus(?![A-Za-z])` evita o falso positivo. Teste explícito com nome "Surplus Championship".
2. **Nome "Re-Entry Allowed Mystery Plus PKO 25+2"**: todas 3 flags (`allowsAddOn`, `allowsReentry`, tipo=Mystery/PKO) disparam — flags ortogonais não se excluem.
3. **Torneio `allowsAddOn=true` mas `addOnCost=null`**: fórmula trata como 0 (sem impacto). UI da Spec 2 exige preencher ao clicar no botão. Adicionalmente, refinement Zod rejeita `addOnTaken=true` se `addOnCost` é null.
4. **`reentries=3` com `maxReentries=null`**: válido (null = ilimitado). Nenhuma rejeição.
5. **Backfill rodando enquanto usuário insere novo torneio**: transação por batch (1000 rows) minimiza lock; conflito: update sempre toma o valor do backfill, mas o campo `allowsAddOn` novo do insert do usuário é respeitado. Testar com `tournament cuja row já foi atualizada` → segundo run do backfill não sobrescreve.
6. **Torneio com `rebuys=2` e `reentries=1` e `addOnTaken=true` e `buyIn=10` e `addOnCost=5`**: `totalInvestido = 10 * (1 + 2 + 1) + 5 = 45`. Invariante contra double-count: rebuys e reentries são independentes; pagar add-on é 1x por torneio.
7. **Edição de torneio finalizado**: PUT `/api/tournaments/:id` permite mudar `addOnTaken` de false→true (usuário esqueceu). Recalcular snapshot da sessão? **Não nesta spec** — snapshot só recalcula em próxima GET de stats.
8. **Import CSV de torneio já no banco (duplicata)**: comportamento atual é upsert por `external_id`/nome+data. Nas flags: novo valor do parser **sobrescreve** flags antigas. Add-on taken/reentries **não são sobrescritos** (preserva ação do jogador).
9. **Torneio com nome em alemão/espanhol/português ("Reinscrição Permitida")**: regex atual não detecta — aceitar como limitação v1. UI da Spec 2/3 permitirá marcar manualmente.
10. **Flags nullable no banco mas default `false` no Drizzle**: testar insert sem os campos → retorna `false`/`null` consistente; update parcial sem tocar o campo → preserva valor existente.
11. **Migração em tabela com >1M rows**: backfill via batched UPDATE com `LIMIT 10000` e loop; não fazer tudo numa transação só. Log progresso a cada batch.
12. **`reentries` como `null` em row antiga em `tournaments` (pré-existente)**: cálculo usa `parseInt(t.reentries) || 0` (defensivo).
13. **Freeroll com "Plus" no nome que NÃO tem add-on (ex: "ExpressPLUS" da 888)**: blocklist hardcoded no backfill evita falso positivo. Regra: após regex match, rodar `UPDATE SET allows_addon=false WHERE name ~* '(ExpressPlus|Surplus|APlus|\+\+)'`. Testar com fixture de 888 e CoinPoker que tenham ExpressPLUS.
14. **`addOnCost = 0` e `addOnTaken = true`**: refinement Zod adicional (Spec 1) rejeita. Mensagem: "addOnCost deve ser > 0 quando addOnTaken=true". Se usuário realmente quer um "freeroll add-on" (raro), defensivamente permitir `addOnCost > 0` mínimo `0.01`.
15. **`addOnCost > buyIn * 3` (add-on muito mais caro que buy-in)**: algumas redes têm "mega add-on" a preço diferente. **Não rejeitar.** Aceitar qualquer decimal positivo. UI pode mostrar warning visual mas backend aceita.
16. **Fórmula inconsistente entre live-session e dashboard antes desta spec**: o `calculateSessionStats` atual usa `buyIn * (1 + rebuys)` **sem** reentries; o `storage.getTournamentStats` usa `totalBuyins + totalReentriesCost` **sem** rebuys. Esta spec converge as 2 fórmulas para `buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0)`. **Teste obrigatório**: dataset com torneios que têm `rebuys>0` → ROI do dashboard pré-spec **vai mudar** (é correção, não regressão). Documentar no changelog do usuário.
17. **Update parcial PUT com refinement cruzado**: ver nota na seção 4.3. Se payload tem só `addOnTaken=true` mas banco tem `allowsAddOn=false`, o handler PUT precisa fazer merge com o registro atual antes de validar.
18. **`rebuys` em `tournaments` nunca foi considerado no ROI do dashboard**: bug pré-existente. Após esta spec, ROI passa a considerar rebuys. Impacto em métricas históricas: ROI de jogadores que fazem muitos rebuy vai **cair** — isso é correção, não erro. Preparar comunicado ao usuário nas métricas de sucesso.

---

## 8. Impactos em cascata

Arquivos que mudam (fora do core schema):

- `B:\grindfy\shared\schema.ts` — 4 tabelas + 4 Zod schemas (~30 linhas adicionadas)
- `B:\grindfy\server\csvParser.ts` — regex de Plus/ReA (~10 linhas). Verificar fallback em `tournaments.reentries` quando CSV traz coluna `Re-Entries` separada (WPN, GG, PokerStars).
- `B:\grindfy\server\routes\suprema.ts` — mapping Suprema → flags (~5 linhas)
- `B:\grindfy\server\routes\grind-sessions.ts` — validação extra no PUT/POST de session-tournament (auto via Zod) + coerção `reentries` (parseInt) e `addOnTaken` (Boolean) no handler linha 706. **Também**: no `addTournamentMutation` (POST linha 659), aceitar `allowsAddOn, addOnCost, allowsReentry, maxReentries` no payload (copy-on-promote da Spec 1).
- `B:\grindfy\server\routes\tournaments.ts` — idem
- `B:\grindfy\server\routes\tournament-library.ts` — idem
- `B:\grindfy\server\routes\grade-planner.ts` — idem para planned-tournaments
- `B:\grindfy\server\routes\analytics.ts` — atualizar fórmula ROI em `avgROI` por sessão (linha 480) para considerar rebuys/reentries/addOn.
- `B:\grindfy\server\routes\dashboard.ts` — revisar se consome `storage.getTournamentStats` (provavelmente sim) e documentar efeito da mudança de fórmula.
- `B:\grindfy\server\storage.ts` — fórmula de `totalInvested` em `getTournamentStats` (linhas ~1914–2060) e onde mais `reentries * buyIn` é calculado sem rebuys (linhas 2316, 2321, 2387).
- `B:\grindfy\server\scripts\backfill-addon-rea.ts` — **arquivo novo** (~80 linhas)
- `B:\grindfy\client\src\components\grind-session-live\calculateSessionStats.ts` — fórmula em 2 funções (linhas 122–127 e 269–274)
- `B:\grindfy\client\src\components\grind-session-live\types.ts` — `SessionTournament` com 6 campos novos + `NewTournamentForm` com 4 campos de configuração (allowsAddOn, addOnCost, allowsReentry, maxReentries) para uso pelas Specs 2 e 3
- `B:\grindfy\client\src\types\index.ts` — tipos compartilhados (verificar se existe algum Tournament type ali)
- `B:\grindfy\migrations\` — nova migração gerada pelo drizzle-kit
- `B:\grindfy\docs\architecture\data-model.mermaid` — atualizar diagrama ER com as novas colunas
- Testes: `tests/unit/grind-session/`, `tests/unit/upload/`, `tests/unit/dashboard/` ganham novos arquivos/casos

Explicitamente **NÃO afetados (para essa spec)**:
- `TournamentCard.tsx`, `AddTournamentDialog.tsx`, `EditTournamentDialog.tsx`, `SessionDashboard.tsx`, `GrindSessionLive.tsx` (exceto types) — intocados nesta spec; usados por Spec 2 e 3.
- `client/src/pages/Dashboard.tsx`, `client/src/pages/Analytics.tsx`, `client/src/pages/TournamentLibrary.tsx` — intocados. Recebem valores corrigidos do backend via fórmula nova.

---

## 9. Métricas de sucesso

Aferir 7 dias pós-deploy:

- **Taxa de preenchimento:** `SELECT COUNT(*) WHERE allows_addon IS NOT NULL / COUNT(*)` em `tournaments`. Meta: 100% (não-null por default).
- **Taxa de detecção Plus:** `SELECT COUNT(*) WHERE allows_addon=true / COUNT(*)` em tournaments com nome não-null. Meta: **>15% e <30%** (sanity check).
- **Taxa de detecção ReA:** idem. Meta: **>10% e <25%**.
- **Erros 500 em endpoints afetados:** zero (sentry/logs).
- **Erros 400 por validação cruzada:** <0.1% dos requests POST/PUT (validações são defensivas; alta taxa indica UI passando dado ruim).
- **Regressão nos testes existentes:** testes de cálculo de ROI em `getTournamentStats` vão precisar ser atualizados (fórmula nova inclui rebuys+addOn). Esperado: ~15–25 testes atualizados (expectativas numéricas), nenhum deletado. Todos os demais (~2206–2216 de 2231 no último count, session 2026-04-06) continuam passando sem mudança.
- **Mudança esperada em métricas de ROI exibidas ao usuário:** ROI histórico no Dashboard/Analytics **vai cair** para usuários com muitos rebuys (correção de bug de longa data). Esperado: 2–5 p.p. de queda em usuários com volume de rebuy > 10%. Monitorar ticket de suporte "meu ROI caiu".
- **Queries mais lentas em `session_tournaments`:** p95 < 50ms (check via `pg_stat_statements`). Esperado: zero impacto (6 colunas a mais, sem nova join).

---

## 10. Rollout

**Estratégia:** feature flag **não necessária** — campos nullable, fórmula numericamente idêntica para dados antigos. Rollout linear em 3 etapas:

1. **Deploy 1 (dia D):** schema push + Zod + fórmula. Backfill **não roda ainda**. Torneios novos inseridos já podem ter flags se vierem do CSV (parser atualizado junto).
2. **Deploy 2 (dia D+1):** rodar script `backfill-addon-rea.ts` em produção. Monitorar tempo (esperado <5 min pra banco atual ~200k torneios) e logs.
3. **Deploy 3 (dia D+2 em diante):** Spec 2 e Spec 3 podem ser deployadas em paralelo ou sequencial (Spec 2 primeiro recomendado — feature visível "add-on" é mais simples que flow de re-entry).

**Rollback:**
- Se Deploy 1 falhar: `git revert` + `ALTER TABLE DROP COLUMN` (script reverso). Código antigo ignora os campos.
- Se backfill produzir dados errados: rodar rollback do backfill (`SET allows_addon=false WHERE ...`) e reprocessar com regex corrigida.
- Não há aviso a usuários ativos — é silencioso.

**Monitoramento ativo 48h pós-deploy:**
- Dashboard Grafana/Sentry em endpoints `/api/grind-sessions/*/tournaments`, `/api/tournaments`, `/api/dashboard/stats`.
- Query ad-hoc diária: `SELECT COUNT(*) FILTER (WHERE allows_addon), COUNT(*) FILTER (WHERE allows_reentry) FROM tournaments GROUP BY DATE(created_at)`.

---

## 11. Ações para outros agentes

- **system-architect:**
  - Atualizar `B:\grindfy\docs\architecture\data-model.mermaid` com os 6 campos nas 4 tabelas.
  - Produzir ADR curto documentando: "por que flags ortogonais em vez de expandir enum `type`" (evita explosão combinatória: 3 types × 2 Plus × 2 ReA = 12 variantes vs 3 + 2 + 2 flags).
  - Fluxograma Mermaid em `docs/architecture/flows/addon-rea/README.md` mostrando o ciclo: CSV/Suprema → parser → backfill → sessionTournaments → cálculo → dashboard.

- **test-writer:**
  - Áreas críticas:
    - `calculateSessionStats` com 6 combinações das flags (00, 10, 01, 11, maxReentries, edge cases). Regressão bit-a-bit no caminho sem flags.
    - Regex do parser CSV — fixtures com "Plus" dentro/fora de palavra, "Re-Entry" com e sem hífen, "R/A" isolado.
    - Zod refinements — testes negativos cada validação cruzada.
    - Testes de integração em endpoints: GET retorna campos, POST aceita campos, backfill é idempotente.
  - Priorizar testes de regressão numérica de ROI/ABI — zero tolerância.

- **implementer:**
  - **Ordem sugerida:**
    1. Adicionar colunas no `shared/schema.ts` + `npm run db:push` local + verificar no banco.
    2. Atualizar Zod schemas com refinements.
    3. Atualizar tipo `SessionTournament` em `types.ts`.
    4. Nova fórmula em `calculateSessionStats.ts` (ambas funções). Rodar testes — todos existentes passam.
    5. Parser CSV (1 regra por vez: Plus primeiro, depois ReA).
    6. Suprema routes.
    7. Script de backfill em `server/scripts/`.
    8. Testes novos.
    9. Migração em produção (já documentado em `docs/migrations/`).
  - **Não** adicionar nenhum botão, dialog ou KPI.

- **reviewer:**
  - Focar em:
    - **Numerical parity:** a fórmula nova produz exatamente o mesmo resultado quando flags são false/0. Fuzz test com 1000 torneios aleatórios.
    - **Zod refinements ativos:** 400 retornado para combinações inválidas (addOnTaken sem allowsAddOn, reentries>maxReentries).
    - **Idempotência do backfill:** rodar 2x no banco de teste e diff no resultado.
    - **Backward compat da API:** nenhum consumidor atual (front, scripts) quebra com campos extras no payload.
    - **Regex safety:** patterns não permitem catastrophic backtracking (`re2`-safe).
    - **Segurança:** novos campos entram nas permissões existentes (usuário só vê seus torneios). Nada mais a verificar.
