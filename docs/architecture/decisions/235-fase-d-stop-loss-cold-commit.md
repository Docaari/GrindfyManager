# ADR-235: Fase D #5 — Stop-loss pré-comprometido a frio (cold commit no warm-up)

## Status
Aceito

## Data
2026-06-02

## Contexto

O curso (módulo D5 + A9) ensina que o stop-loss só funciona como antídoto ao tilt
`desperation` ("late-reg de high roller pra recuperar o dia") quando é **decidido a frio**
(estado racional, ANTES de jogar) e **inegociável depois**. O Grindfy já tem todo o motor
de stop-loss mecânico — só falta o gesto de "confirmar a frio" + a "inegociabilidade" durante
a sessão.

**Infra existente que DEVE ser reusada (verificado no código, NÃO reconstruir):**

- `user_settings.{stopLossUsd, stopWinUsd, stopLockUntil, stopLockDurationHours}`
  (`shared/schema.ts:900` — `userSettings` pgTable; `preferredCurrency` default `BRL` linha 910).
- `server/services/stopService.ts` (ADR-060): `assertNotStopLocked` (throw 423 `STOP_LOCKED`),
  `evaluateStops(userId, sessionId)` → `{stopReached, lockedUntil?}`, `getCurrentDayDeltaUsd(userId)`
  (USD via `fxResolver`, reset 00:00 user TZ), `releaseLock(userId)`.
- `warmup_rituals` (`shared/schema.ts:838+`) — `sessionIntention jsonb $type<SessionIntention | null>`
  (shape atual `{focus, tiltPlan, stopCriteria}`); tipo `SessionIntention` (linha 838) + Zod
  `sessionIntentionZod` em `shared/schema.ts:1964` **E** duplicado em
  `server/routes/warmup-rituals.ts:48` (objeto fechado, NÃO `.passthrough()`).
- Handlers stops em `server/routes/auth.ts`: `handleGetUserSettingsStops` (`:834`, expõe
  `currentDayDeltaUsd`), `handlePutUserSettingsStops` (`:862`), registrados em
  **`/api/user-settings/stops`** (hífen — a spec escreveu `/api/user/settings/stops`, **errado**;
  a rota real é `/api/user-settings/stops`, `auth.ts:807-808`).
- `storage.listGrindSessionsByUser(userId)` (`storage.ts:8848`) — retorna `GrindSession[]`
  (cada row tem `.status`); usado por `stopService.getCurrentDayDeltaUsd` filtrando `status==='completed'`.
  **Não existe** `getActiveGrindSession`; a detecção de "quente" é `listGrindSessionsByUser` +
  `.some(s => s.status === 'active')`.
- `storage.getPlannedTournamentsDashboardStats(userId)` (`storage.ts:2741`) — retorna `{ ...abi, avgBuyin, ... }`
  (`abi` === `avgBuyin`, ambos = `AVG(CAST(buy_in AS DECIMAL))` linha 2838). **Sem coluna de moeda
  por-row no SELECT** — buy-in vem em moeda do grade (derivada de `site` por torneio; a média é um
  agregado de moeda única na prática, ver D-2).
- `fxResolver` (`server/services/fxResolver.ts`): `resolveExchangeRates(userId)` → `{rates}`
  (`rates[ccy]` = unidades de ccy por 1 USD), `convertToUSD(amount, currency, rates)` (`:203`).
- `StopBanner` (`client/src/components/bankroll/StopBanner.tsx`) read-only, wired em
  `GrindSession.tsx` (`/grind`), que JÁ tem a query `["/api/user-settings/stops"]` com
  `stopLossUsd + currentDayDeltaUsd` (`GrindSession.tsx:223`). `GrindSessionLive.tsx` (`/grind-live`)
  **ainda não** mostra stop.

**Gap:** capturar/confirmar o stop a frio no warm-up (bloco 4 Intenção), sugerir via heurística BI,
travar afrouxar durante sessão ativa, exibir "quanto falta", deixar o sinal de frio consultável.

Referência: **ADR-060** (semântica stop-loss / TZ / enforcement 423), **ADR-228** (Fase B lead measures —
o cold-commit é o "lead measure" do tilt `desperation` da Fase C #4).

## Decisões

### D-1 — Trava de afrouxar quente mora no handler `handlePutUserSettingsStops` (server) + helper puro

A regra "não afrouxar com sessão ativa" vive em **um único ponto de escrita de `stopLossUsd`**:
`handlePutUserSettingsStops` (`server/routes/auth.ts`). O cold-commit do warm-up (RF-01) **escreve
`stopLossUsd` chamando esse mesmo PUT** (não escreve direto em `upsertUserSettings`), centralizando a
trava (Notas de Implementação da spec).

Detecção de "quente" (re-consulta no momento do write, anti-race do edge case):
`const sessions = await storage.listGrindSessionsByUser(userId); const hasActiveSession = sessions.some(s => s.status === 'active')`.
**Não** confiar em flag do client.

A decisão de bloquear é extraída para um **helper puro testável isolado** (paridade
`detectLeaks`/`leakFocusProgress`/`computePace` — helpers puros Fase A/C):

```ts
// server/coach/stops/canLoosenStopLoss.ts (ou server/services/stops/)
export function canLoosenStopLoss(
  currentUsd: number | null,   // valor atual em user_settings.stopLossUsd (já parseado)
  nextUsd: number | null,      // valor que o PUT quer gravar
  hasActiveSession: boolean,
): { allowed: true } | { allowed: false; code: "STOP_LOOSEN_BLOCKED" };
```

Regra (pura, sem I/O):
- `hasActiveSession === false` → sempre `{allowed: true}` (a frio, edição livre: sobe, desce, null).
- `nextUsd === current` (ou ambos null) → `{allowed: true}` (no-op).
- `current == null && nextUsd != null` → `{allowed: true}` (criar proteção é sempre OK).
- `current != null && nextUsd == null` → `{allowed: false}` (remover stop quente = afrouxar ao máximo).
- `current != null && nextUsd != null && nextUsd > current` → `{allowed: false}` (aumentar = afrouxar).
- `nextUsd < current` → `{allowed: true}` (apertar é sempre OK).

`null` vs `undefined`: o PUT só avalia a trava quando `stopLossUsd` **está presente no body**
(`!== undefined`). `undefined` = "não mexer" → nunca bloqueia. **Recomendado:** o helper recebe
`current`/`next` já resolvidos (caller faz o parse + lê settings); o helper não toca em `undefined`.

**Recomendação:** SIM, helper puro. Mantém o handler fino, cobre os 6 casos de RF-04 com testes
unitários sem mock de I/O, e o handler só faz: ler settings → resolver `current` → parse `next` →
`canLoosenStopLoss(current, next, hasActiveSession)` → 409 ou segue para `upsertUserSettings`.

### D-2 — Heurística BI → USD: helper puro `suggestColdStopLossUsd`, FX/ABI resolvidos no caller

A multiplicação BI×ABI é **pura** e mora em helper isolado; a resolução de ABI (storage) + FX
(`fxResolver`) é responsabilidade do **caller** (fronteira FX no caller — lesson #6/#36), porque o
helper puro não pode fazer I/O nem mockar storage.

```ts
// server/coach/stops/suggestColdStopLoss.ts
export function suggestColdStopLossUsd(
  nBI: 3 | 4 | 5,
  abiUsd: number,
): { suggestedUsd: number } | null;  // null se abiUsd <= 0 ou não-finito (degrada)
// suggestedUsd = round2(nBI * abiUsd)
```

Resolução de ABI→USD (no caller — endpoint/serviço que monta a sugestão, ou direto no client via
os endpoints existentes; ver D-5):
1. `const stats = await storage.getPlannedTournamentsDashboardStats(userId);`
   `const abiNative = Number(stats?.avgBuyin ?? stats?.abi ?? 0);`
2. Se `abiNative <= 0` ou `stats` vazio → **degrada** (esconde sugestão BI, só campo USD livre — DEC-4).
3. `const { rates } = await fxResolver.resolveExchangeRates(userId);`
4. **Moeda do ABI:** o SELECT não expõe moeda por-row e o agregado `AVG(buy_in)` é de moeda única
   na prática (grade do perfil ativo). Tratar `abiNative` como estando em
   `settings.preferredCurrency` (default `BRL`) e converter:
   `const abiUsd = fxResolver.convertToUSD(abiNative, preferredCurrency, rates);` (lesson #6 — converte
   ANTES de multiplicar). **Logar antes de qualquer fallback** (lesson #9):
   `console.warn("[coldStopLoss] FX fallback ...", { preferredCurrency })` quando `rates[ccy]` ausente.
5. Se FX indisponível (sem cotação → `convertToUSD` cai no fallback que retorna o nativo): **não zera
   a moeda**; mas como a sugestão BI exige USD confiável, se `preferredCurrency !== 'USD'` e
   `rates[preferredCurrency]` ausente → **degrada** (esconde sugestão BI, oferece USD livre). Documentado
   como edge "FX ausente".
6. `suggestColdStopLossUsd(nBI, abiUsd)`.

**Recomendação:** helper puro para a multiplicação + caller resolve ABI/FX. `nBI` fora de `{3,4,5}`:
o helper aceita só o tipo literal; em runtime, o caller/Zod **clampa** para o range (default 3) — NÃO
rejeita (a sugestão é auxiliar; rejeitar quebraria o degrade gracioso). O valor comitado é sempre o USD
final (que pode ser manual e ignorar o BI).

### D-3 — Shape de `coldStopCommit` em `sessionIntention` (jsonb), Zod aditivo opcional

Estende `SessionIntention` (`shared/schema.ts:838`) e os **dois** Zod (`shared/schema.ts:1964` +
`server/routes/warmup-rituals.ts:48`) de forma aditiva e opcional (lesson #7):

```ts
export type ColdStopCommit = {
  committedUsd: number;          // > 0 (valor comitado em USD)
  basis: "bi" | "manual";        // origem do número
  nBI?: 3 | 4 | 5;               // só quando basis === "bi"
  abiUsdAtCommit?: number;       // ABI (USD) usado no momento do commit; só quando basis === "bi"
  committedAt: string;           // ISO timestamp
};

export type SessionIntention = {
  focus: string;
  tiltPlan: string;
  stopCriteria: string;
  coldStopCommit?: ColdStopCommit | null;   // ADITIVO — opcional
};
```

Zod (ambos os locais — manter sincronizados, senão o objeto fechado strip-a o campo no POST):

```ts
const coldStopCommitZod = z.object({
  committedUsd: z.number().positive(),
  basis: z.enum(["bi", "manual"]),
  nBI: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
  abiUsdAtCommit: z.number().positive().optional(),
  committedAt: z.string().datetime(),
}).optional().nullable();

const sessionIntentionZod = z.object({
  focus: z.string().trim().min(1).max(200),
  tiltPlan: z.string().trim().min(1).max(200),
  stopCriteria: z.string().trim().min(1).max(200),
  coldStopCommit: coldStopCommitZod,   // ADITIVO
});
```

> Nota sobre o nome do campo ABI: a spec (§Modelos de Dados) lista `abiUsd`; o briefing pede
> `abiUsdAtCommit`. Adoto **`abiUsdAtCommit`** (deixa explícito que é snapshot do momento do commit,
> rastreabilidade DEC-9). O test-writer deve usar `abiUsdAtCommit`.

**Persistência:** `coldStopCommit` só é gravado em warm-up `version: "full"`; em `aborted`, NÃO se
persiste (mas o `stopLossUsd` já gravado no PUT durante o commit permanece — a escrita é imediata no
commit, não no fim do ritual — RF-01).

### D-4 — Contrato do 409 `STOP_LOOSEN_BLOCKED` no PUT

`PUT /api/user-settings/stops` (handler `handlePutUserSettingsStops`):

- **Quando dispara:** `stopLossUsd` presente no body (`!== undefined`) **E** `hasActiveSession === true`
  **E** `canLoosenStopLoss(...).allowed === false` (aumentar OU `valor → null`).
- **Resposta:**
  ```
  HTTP 409
  { "code": "STOP_LOOSEN_BLOCKED",
    "message": "Stop-loss decidido a frio é inegociável durante a sessão. Você pode apertar (diminuir), nunca afrouxar." }
  ```
  Nenhuma escrita ocorre (`upsertUserSettings` não é chamado); valor permanece.
- **Ordem no handler:** (1) auth → (2) Zod `safeParse` (400) → (3) `isPositiveOrNull` (400) →
  (4) ler `settings` atual + `listGrindSessionsByUser` → resolver `hasActiveSession` →
  (5) `canLoosenStopLoss` (409 se bloqueado) → (6) `upsertUserSettings` → 200.
- **Back-compat (crítico):** quando `hasActiveSession === false`, o caminho é **idêntico ao atual**
  (nenhum 409 possível) — o PUT existente para configurar stops via bankroll/settings continua 100%.
  A trava só afeta `stopLossUsd`; **não** afeta `stopWinUsd` nem `stopLockDurationHours` (RF-04 AC).
- Ortogonal ao `stopLockUntil` (lock pós-stop-atingido, 12h, ADR-060) — comitar NÃO chama `releaseLock`
  (edge "já locked": pode ajustar o valor do dia seguinte, mas o lock vigente permanece).

### D-5 — "Quanto falta": reusa `GET /api/user-settings/stops` (`stopLossUsd` + `currentDayDeltaUsd`)

O endpoint `GET /api/user-settings/stops` (`handleGetUserSettingsStops`) **já** retorna
`{ stopLossUsd, currentDayDeltaUsd, stopLockUntil, ... }` (verificado, `auth.ts:849`). Nenhum endpoint
novo. O cálculo de "quanto falta" é **derivado no client** (lógica pura):

```
quantoFaltaUsd = stopLossUsd != null
  ? stopLossUsd + currentDayDeltaUsd   // delta é negativo quando perdendo
  : null
// delta < 0  → "faltam $|quantoFalta| para o stop"   (se quantoFalta > 0)
// delta >= 0 → "stop em $stopLossUsd (você está +$X / no zero hoje)"
// stopLossUsd null → não exibe indicador
```

`GrindSession.tsx` (`/grind`) **já** tem a query `["/api/user-settings/stops"]` com esses campos
(`:223`); reusa direto. A lógica de "quanto falta" deve virar uma **função pura** pequena
(`computeStopRemaining(stopLossUsd, currentDayDeltaUsd)`) reusável no warm-up e no grind-live (testável
sem render). Recomendado colocá-la em `client/src/lib/` (ex.: `stopRemaining.ts`).

### D-6 — Exibição no warm-up + grind-live: componentes reais

**Captura (warm-up):** estender `client/src/components/warmup/IntentionBlock.tsx` (bloco 4) — adicionar,
abaixo do textarea "Vou encerrar quando" (`data-testid="intention-stop-criteria"`):
- seletor BI (3/4/5, default 3) + texto auxiliar "sugestão: 3 BI ≈ $X" (esconde se degrada — DEC-4);
- campo USD comitável (pré-preenchido pela sugestão; editar → `basis: "manual"`);
- botão "Comitar stop a frio" → chama `PUT /api/user-settings/stops` com o USD final;
- texto conceitual curto (`data-testid` estável, ex. `cold-stop-concept`):
  "Stop a frio é o antídoto ao desespero de recuperar o dia." (RF-05, lesson #2 data-testid estável);
- confirmação pós-commit ("Stop a frio comitado: $X").
O payload `coldStopCommit` é montado no client e incluído em `sessionIntention` ao finalizar o ritual
(`POST /api/warmup-rituals`). `IntentionBlock.onSubmit` deve aceitar o sub-objeto opcional no payload
`SessionIntentionPayload` (estender a interface local + `useWarmupRitual.ts`).

**Exibição (grind-live):** `client/src/pages/GrindSessionLive.tsx` (`/grind-live`) hoje NÃO mostra stop.
Adicionar um **indicador leve** de "quanto falta" reusando a query `["/api/user-settings/stops"]`
(mesma de `GrindSession.tsx`) + `computeStopRemaining` (D-5). **NÃO** reusar o `StopBanner` cheio
(ele é o banner de bloqueio pós-lock); o indicador "quanto falta" é informativo e some quando
`stopLossUsd == null`. `GrindSession.tsx` (`/grind`) também ganha o indicador "quanto falta" (já tem a
query). O `StopBanner` (bloqueio 423/lock) continua inalterado. NÃO criar dashboard novo (briefing).

### D-7 — Detecção de "sessão ativa": `storage.listGrindSessionsByUser` + filtro `status==='active'`

**Não existe** `getActiveGrindSession`. Usar o método real `storage.listGrindSessionsByUser(userId)`
(`storage.ts:8848`, retorna `GrindSession[]`) e checar `sessions.some(s => s.status === 'active')`.
Re-consultado **no momento do PUT** (anti-race do edge case "sessão criada entre GET e PUT"). Mesmo
método/shape que `stopService.getCurrentDayDeltaUsd` já consome (`status === 'completed'`) — lesson #3:
mockar o SHAPE REAL (`GrindSession[]` com `.status`).

## Opções Consideradas

### Trava de afrouxar (D-1)
- **Opção A (escolhida): no `handlePutUserSettingsStops` + helper puro `canLoosenStopLoss`.**
  - Prós: ponto único de escrita de `stopLossUsd`; cold-commit do warm-up passa pelo mesmo caminho;
    6 casos RF-04 testáveis sem I/O; anti-race (re-consulta no write).
  - Contras: o warm-up precisa chamar o PUT (não escrever direto) — uma chamada HTTP extra.
- **Opção B: trava em `storage.upsertUserSettings`.**
  - Prós: cobre qualquer caller.
  - Contras: storage não deve conter regra de negócio HTTP (409); `upsertUserSettings` é genérico
    (mexe em muitos campos); difícil distinguir "afrouxar loss" de updates de outros campos.

### Moeda do ABI (D-2)
- **Opção A (escolhida): tratar `avgBuyin` como `preferredCurrency` e converter via `convertToUSD`.**
  - Prós: simples; alinhado ao default `BRL`; degrada se FX ausente.
  - Contras: imreciso se a grade mistura sites de moedas diferentes (raro — grade do perfil ativo
    costuma ser moeda única). Aceitável: a sugestão é auxiliar (DEC-3), não enforcement.
- **Opção B: somar por-site convertendo cada buy-in.**
  - Prós: exato para grades multi-moeda.
  - Contras: exige novo método de storage (o `avgBuyin` atual é AVG agregado, sem moeda por-row);
    fora do escopo "reusar `getPlannedTournamentsDashboardStats`" (DEC-4).

## Consequências

**Positivas:**
- Zero migration (DEC-7): reusa `stopLossUsd` + estende jsonb `sessionIntention`.
- Reuso máximo do motor de stop (enforcement 423/lock ADR-060 intacto, `StopBanner` intacto).
- Helpers puros (`canLoosenStopLoss`, `suggestColdStopLossUsd`, `computeStopRemaining`) cobrem a lógica
  crítica com testes unitários sem mock pesado.
- O sinal de frio (`coldStopCommit`) fica persistido e consultável → destrava DEF-1 (coach lê "cumpriu
  o stop a frio?") sem retrabalho.

**Negativas / trade-offs:**
- Os DOIS Zod de `sessionIntention` (schema.ts + route) precisam ser estendidos em lockstep; esquecer um
  faz o objeto fechado strip-ar `coldStopCommit` no POST (o do route é o que valida o body — risco real).
- Sugestão BI imprecisa em grades multi-moeda (Opção A de D-2) — mitigado por ser auxiliar.
- O warm-up faz uma chamada HTTP extra (PUT stops) no commit, além do POST do ritual.

**Neutras:**
- A trava RF-04 é ortogonal ao `stopLockUntil`; convivem.
- `nBI` fora de `{3,4,5}` é clampado (não rejeitado) — escolha documentada (degrade gracioso).

**Achados do /simplify (2026-06-02) — documentados, não-bloqueantes:**
- **Semântica do overwrite (DEC-1):** o cold-commit ESCREVE direto em `user_settings.stopLossUsd`
  (decisão D-1, reuso do enforcement). Consequência: se o jogador tinha um stop "standing"
  em settings e comita um valor diferente a frio, o standing é SUBSTITUÍDO (não há baseline
  separado nem reset noturno de `stopLossUsd` — o reset diário do stopService é só do
  `currentDayDelta`/lock, NÃO do limite). **Isto é INTENCIONAL e alinhado ao curso D5**
  ("decida seu stop A CADA sessão, a frio") — o cold-commit É o ato de definir o stop da vez,
  não um override temporário. Trade-off aceito p/ zero-migration. Se a UX revelar confusão
  ("perdi meu stop padrão"), follow-up: snapshot `standingStopLossUsd` no `coldStopCommit` OU
  coluna por-sessão (exigiria migration).
- **Detecção de sessão ativa (D-7):** usa `listGrindSessionsByUser().some(active)` (carrega todas
  as sessões p/ 1 booleano). Aceitável a escala atual (1 user, on-demand). **Follow-up de perf:**
  `hasActiveGrindSession(userId)` via `EXISTS` (storage novo) — diferido (exige método + ajustar
  mocks dos testes; ganho pequeno hoje).

## Confiança
Alta — todos os pontos de integração (handlers, storage methods, shapes, rotas, FX) foram verificados
no código do worktree. Risco residual: sincronização dos dois Zod (mitigável extraindo `coldStopCommitZod`
para `shared/` e importando nos dois locais — recomendação ao implementer).
