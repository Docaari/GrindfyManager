# ADR-214: Grind Live ↔ Day Detail Parity — bucketing HH:00 client-side, endpoint resolver por prefixo, alerta Max Late client-side transiente, dedup por tournamentId, rollover cross-midnight, optimistic+rollback, PUT semantic null explicito, sub-render de prioridade compartilhado

## Status

Aceito — 2026-05-29.

Cobre Sprint **grind-live-detail-parity** (`Docs/specs/sprint-grind-live-detail-parity.md`).
Traz paridade visual + funcional entre o modal `DayDetailZoom` (ADR-213) e a listagem de
torneios da pagina `/grind-live` (`GrindSessionLive.tsx` + `client/src/components/grind-session-live/*`).

**Relacao com ADRs anteriores:**

- **Extende ADR-213** (DayDetailZoom Consolidation). ADR-213 D1 definiu o bucketing `HH:00`
  via `maxLate ?? time` para o modal `DayDetailZoom`. Este ADR **replica a semantica de
  bucketing HH:00** no `/grind-live`, mas via helper **novo e isolado** — NAO compartilha
  codigo com o `plannedSlots` do modal (componentes/dominios diferentes). NAO substitui ADR-213.
- **Coexiste com a infra de alertas client-side** ja existente em `/grind-live`
  (`SessionAlertManager` + tick `checkAlerts` 30s) — reusa, nao reescreve.

## Data

2026-05-29

## Contexto

O `/grade-planner → Detalhes do dia` (`DayDetailZoom`) ganhou, no cluster shippado em
`2a2a514c..439bb60c` (formalizado em ADR-213): bucketing por `maxLate ?? time` em `HH:00`,
prioridade 1/2/3 (Alta vermelha + Flame; Media amarela; Baixa cinza/opacity), badge
"Max Late HH:MM" (Hourglass ambar) e KPI Mediana Field.

A pagina `/grind-live` ficou **divergente**: nao mostra Max Late no card, a prioridade fica
no meio das badges (nao no topo), nao agrupa por hora cheia, e nao gera alerta de Max Late.
Resultado pratico: o jogador em sessao ao vivo **perde a janela de late reg / rebuy** por
nao ter aviso sonoro/visual.

Forcas principais:

- **Zero migration** — `session_tournaments` (schema.ts:699/690) E `planned_tournaments`
  (schema.ts:566/556) ja tem `registration_time` + `prioridade`. Sprint nao introduz schema
  delta. (Q-A.)
- **Zero endpoint novo** — os handlers genericos PUT `/api/session-tournaments/:id` e PUT
  `/api/planned-tournaments/:id` ja persistem `registrationTime` no else-branch generico.
- **Infra de alerta ja existe** — `SessionAlertManager` (shared/generic-alerts.ts) + tick
  `setInterval(checkAlerts, 30000)` em `GrindSessionLive.tsx:~1495` + `fireAlert` (TTS via
  Web Speech) ja em producao. Reusar, nao criar engine novo. (Q-B.)
- **Cards em 3 modos** — `RegisteredCard`, `UpcomingCard`, `CompletedCard` em
  `client/src/components/grind-session-live/TournamentCard.tsx`. O tratamento de prioridade +
  chip Max Late se repete nos tres → risco de divergencia tripla.
- **GrindSessionLive.tsx tem 3326 LoC** — refactor em hooks esta **fora de escopo** (sprint
  dedicada futura). As decisoes abaixo minimizam superficie de mudanca nesse arquivo.

As decisoes abaixo precisam estar documentadas **antes** do `test-writer` escrever os testes,
porque definem os contratos puros e testaveis (`resolveTournamentEndpoint`,
`bucketUpcomingByHour`, `replaceMaxLateAlert`) que os testes vao exercitar.

## Decisoes

### D1 — `bucketUpcomingByHour` helper novo (HH:00), NAO reusar `organizeTournamentsByBreaks` (HH:55)

**Contexto:** ja existe `organizeTournamentsByBreaks` (helpers.ts:438) que agrupa torneios
por hora, mas em **`HH:55`** (semantica de "aviso pre-break" — minuto 55 da hora). A spec
RF-05 pede agrupamento por **`HH:00`** (grade visual de hora cheia, paridade `DayDetailZoom`
plannedSlots / ADR-213 D1). Os dois numeros sao incompativeis no mesmo helper.

**Decisao:** criar helper puro novo em `helpers.ts`:

```ts
// bucketRef espelha DayDetailZoom D1 (maxLate ?? time), aqui registrationTime ?? time
const bucketRef = tournament.registrationTime || tournament.time;
const [hh] = String(bucketRef).split(':');
const slotKey = `${hh.padStart(2, '0')}:00`;   // "HH:00"
```

`bucketUpcomingByHour(tournaments) → Array<{ hour: string; tournaments: any[] }>`:

- `bucketRef = registrationTime || time` (registrationTime e o "ate quando registro" — mesma
  logica do `maxLate` no modal).
- `slotKey = "${HH.padStart(2,'0')}:00"`.
- Torneio sem hora valida (`time` e `registrationTime` ausentes) → cai no **primeiro bucket /
  fallback**, nunca some da lista.
- Sort DENTRO de cada bucket: **prioridade ASC (1=Alta no topo) → time ASC → buyIn DESC**
  (paridade `DayDetailZoom:324-334`).
- Buckets ordenados por hora **ASC**.
- Aplica **SOMENTE** a secao "Proximos torneios" (upcoming). "Em andamento" (registered) e
  "Concluidos" (completed) permanecem flat com o sort atual de `organizeTournaments`.

`organizeTournamentsByBreaks` permanece **intacto** (HH:55) — semantica diferente, consumidor
diferente.

**Consequencias:**

- (+) Zero risco de regressao no fluxo de breaks (`organizeTournamentsByBreaks` nao muda).
- (+) Helper puro, testavel isolado sem montar a pagina.
- (−) Duas funcoes de bucketing coexistem em `helpers.ts` (HH:00 e HH:55). Mitigado por nome
  explicito + comentario apontando a diferenca semantica.
- (neutro) O sort intra-bucket (prioridade ASC → time ASC → buyIn DESC) difere do sort flat
  de `organizeTournaments` (getRegSortKey ASC → prioridade → time). Intencional: dentro do
  bucket horario, Alta sobe ao topo; entre secoes o sort flat persiste (spec RF-01 NOTA).

### D2 — `resolveTournamentEndpoint(id)` helper puro por prefixo

**Contexto:** `registrationTime` mora em **ambas** as tabelas (Q-A). Um card cujo `id` comeca
com `planned-` corresponde a uma linha de `planned_tournaments`; os demais a
`session_tournaments`. O PUT precisa ir para o endpoint certo.

**Decisao:** helper puro em `helpers.ts`:

```ts
resolveTournamentEndpoint(id: string): string
//  id.startsWith('planned-')  -> `/api/planned-tournaments/${id.slice(8)}`
//  caso contrario             -> `/api/session-tournaments/${id}`
```

(`'planned-'.length === 8` → `slice(8)` remove o prefixo; mesma convencao ja usada em
`organizeTournaments` helpers.ts:351-352, `substring(8)`.)

**Consequencias:**

- (+) Resolve Q-A sem migration nem endpoint novo — reusa os dois handlers PUT existentes.
- (+) Testavel isolado (`planned-abc` → planned/abc; `sess-1` → session/sess-1).
- (neutro) Acopla a convencao do prefixo `planned-` (ja estabelecida no codebase). Se a
  convencao mudar, este helper e o unico ponto a ajustar.

### D3 — Alerta 2min Max Late client-side reusando SessionAlertManager + tick existente (sem server enqueue)

**Contexto:** Q-B resolveu: o alerta e **client-side**. A infra ja existe — `SessionAlertManager`
(Map em memoria), `addTournamentAlert`, `getAlertsToFire` (filtra `!fired && !dismissed &&
triggerAt<=now`), e o tick `setInterval(checkAlerts, 30000)` que chama `getAlertsToFire` +
`fireAlert` (TTS). NAO ha enqueue server-side de notificacao para este caso.

**Decisao:** o alerta de Max Late 2min antes reusa **integralmente** essa infra:

- Agendamento: `manager.addTournamentAlert({ tournamentId, triggerAt, label, narrationText })`.
  - `label`: `Max Late: {nome} ({site})`.
  - `narrationText`: `buildTournamentNarration({ site, name, buyIn }, { redactBuyIn })` —
    mesmo padrao do `TournamentAlertDialog`, respeitando `redactBuyIn`.
- Disparo: o tick `checkAlerts` (30s) + `getAlertsToFire` ja existente — **NAO** criar novo
  engine, loop ou interval.

**Consequencias:**

- (+) Integra com TTS / fireAlert ja em producao; zero engine novo; zero server enqueue;
  zero migration.
- (−) **Alerta transiente por sessao**: vive no Map em memoria do `SessionAlertManager`. Some
  no F5 / reload / troca de aba que desmonta a pagina. Persistir cross-reload esta **fora de
  escopo** (spec "Fora de Escopo"). Aceito: a sessao ao vivo e um contexto de foreground
  continuo; o reconcile-on-mount (D4) re-agenda os alertas dos upcoming que ainda tem
  `registrationTime` quando a pagina remonta.
- (−) Resolucao de disparo limitada ao tick de 30s — o alerta pode disparar ate ~30s apos o
  triggerAt. Aceito para a janela de 2min (o jogador ainda tem >=90s de folga).

### D4 — `replaceMaxLateAlert` — dedup/replace por `tournamentId` (NAO usar `hasDuplicateLateReg`)

**Contexto:** Q-D (toggle OFF limpa alerta) + Q-E (rebuy/re-save substitui alerta). Re-salvar
`registrationTime` com um horario diferente precisa **substituir** o alerta antigo, nao
adicionar um segundo. O `SessionAlertManager` ja tem `hasDuplicateLateReg(tournamentId,
triggerAt)`, mas ele compara com **tolerancia de 1 minuto** — nao detecta substituicao quando
o novo `triggerAt` muda mais de 1min, e nao remove o antigo.

**Decisao:** helper puro novo `replaceMaxLateAlert(manager, tournament, opts?)`:

1. Localizar todos os alertas `type === 'tournament'` cujo `tournamentId === tournament.id`
   (varrendo o manager) e `removeAlert(id)` cada um — **cleanup garantido** (cobre Q-D quando
   chamado no toggle OFF, e Q-E na substituicao).
2. Calcular `triggerAt` (ver D5). Se `registrationTime` ausente/vazio OU `triggerAt <= now`
   (janela perdida) → **NAO** agenda (so removeu — comportamento de OFF / janela perdida).
3. Caso futuro → `manager.addTournamentAlert(...)`.

`opts.now?: Date` (default `new Date()`) injetavel para teste deterministico de rollover /
janela perdida. NAO usa `hasDuplicateLateReg`.

**Consequencias:**

- (+) Resolve Q-D + Q-E com um unico helper idempotente: chamar 2x com o mesmo
  `registrationTime` deixa exatamente 1 alerta `tournament` por `tournamentId`.
- (+) Toggle OFF = `replaceMaxLateAlert` com `registrationTime` nulo → so remove.
- (+) Reconcile-on-mount idempotente: iterar upcoming/registered com `registrationTime` e
  chamar o helper nao acumula alertas duplicados.
- (−) Varredura O(n) sobre os alertas do manager (cap `MAX_ALERTS=50`) — irrelevante para a
  escala de uma sessao (dezenas de torneios).
- (neutro) `hasDuplicateLateReg` continua existindo para o fluxo de late-reg classico; nao e
  removido nem alterado.

### D5 — Rollover cross-midnight + janela perdida

**Contexto:** o jogador faz grind cruzando a meia-noite. `registrationTime="00:30"` salvo as
`23:00` deve agendar para `00:28` do **dia seguinte**. E quando faltam <2min agora, nao deve
agendar (janela ja perdida). Padrao a espelhar: `TournamentAlertDialog.tsx:134-142`.

**Decisao:** calculo de `triggerAt` (dentro de `replaceMaxLateAlert`, `now` injetavel):

```ts
const [hh, mm] = registrationTime.split(':').map(Number);
const target = new Date(now);
target.setHours(hh, mm, 0, 0);
// rollover: o registrationTime de hoje ja passou -> alvo e amanha
if (target.getTime() <= now.getTime()) {
  target.setDate(target.getDate() + 1);
}
const triggerAt = new Date(target.getTime() - 2 * 60_000);  // -2min
// janela perdida: mesmo apos rollover, se faltam <2min -> nao agenda
if (triggerAt.getTime() <= now.getTime()) return; // so removeu o antigo (D4)
```

**Consequencias:**

- (+) Cross-midnight: `"00:30"` as `23:00` → alvo `00:30` de amanha → `triggerAt 00:28` +1d.
- (+) Janela perdida: `"20:00"` salvo as `19:59` → triggerAt `19:58` no passado → nao agenda.
- (+) `now` injetavel torna o rollover/janela 100% deterministico em teste (sem fakeTimers
  obrigatorio para o helper puro).
- (neutro) Assume que o `registrationTime` do dia "hoje" e a referencia; nao tenta inferir
  data absoluta (a sessao ao vivo e do dia corrente / madrugada seguinte). Coerente com o
  comportamento de `absolute` no `TournamentAlertDialog`.

### D6 — Optimistic update + rollback + invalidate centralizado no onSettled

**Contexto:** paridade com a lesson HIGH-3 do day-detail (ADR-213 — mover/editar com
`setQueryData` + rollback). A mutation de `registrationTime` (toggle ON/OFF, picker) precisa
de feedback imediato e seguranca contra falha de rede.

**Decisao:** a mutation segue o padrao:

- `onMutate`: snapshot do cache (`getQueryData`), `setQueryData` aplicando o novo
  `registrationTime` (ou `null`) otimisticamente.
- `onError`: restaura o snapshot (rollback).
- `onSettled`: `invalidateQueries` centralizado de `['/api/session-tournaments']` E
  `['/api/planned-tournaments']` (ambas, porque o card pode ser de qualquer das duas tabelas).

**Consequencias:**

- (+) UX imediata + consistencia eventual; rollback em falha (criterio RF-03).
- (+) Invalidate centralizado no `onSettled` (nao espalhado) — paridade ADR-213 HIGH-2/HIGH-3.
- (neutro) Invalida as duas query keys sempre, mesmo que o card seja de uma so tabela —
  custo de um refetch extra desprezivel; evita logica condicional fragil.

### D7 — PUT semantic: OFF envia `registrationTime: null` explicito (lesson #43)

**Contexto:** lesson #43 (day-detail): no Edit dialog, enviar `""` como `"0"` ou omitir a
chave fazia o valor antigo sobreviver. Limpar um campo exige enviar `null` explicito, nao
omitir.

**Decisao:**

- Toggle **ON** + picker confirmado: valida `^\d{1,2}:\d{2}$`; invalido → nao envia, erro
  inline. Valido → `PUT { registrationTime: "HH:MM" }`.
- Toggle **OFF**: `PUT { registrationTime: null }` (explicito) + `replaceMaxLateAlert` so-remove
  (D4).

**Consequencias:**

- (+) OFF efetivamente limpa a coluna no banco (handler generico recebe `null`).
- (−) Depende do handler PUT generico aceitar `null` no campo (else-branch generico ja
  persiste o valor recebido). Documentado como premissa; se o handler ignorar `null`, e um
  ajuste de backend (fora do escopo de feature desta sprint, mas sinalizado ao implementer).

### D8 — Paridade visual de prioridade + chip Max Late via sub-render compartilhado

**Contexto:** o tratamento de prioridade (Flame/border) + chip Max Late se repete em
`UpcomingCard`, `RegisteredCard` e `CompletedCard`. Duplicar o JSX nos tres convida
divergencia (foi exatamente o smell que ADR-213 D-visual combateu no modal).

**Decisao:** espelhar `DayDetailZoom:1109-1171`:

- `prioridade = Number(tournament.prioridade) || 2` (default Media).
- `isHigh (===1)` → `border-l-4 border-l-red-500` no card + badge `<Flame/>` "Alta" como
  **primeiro** elemento da linha de cabecalho (antes do site badge).
- `isLow (===3)` → `opacity-90` + nome em `text-gray-400`.
- Media (2) → sem badge inline, border padrao.
- Chip Max Late: exibir SE `typeof registrationTime === 'string' && registrationTime.trim() !== ''`
  → `bg-amber-500/15 text-amber-300 border border-amber-500/30` + `<Hourglass/>` +
  `title="Reg final {registrationTime}"`, posicionado entre o site badge e o nome.
- Extrair um **sub-render compartilhado** (`TournamentCardMeta` ou helper de className/JSX)
  consumido pelos 3 modos. **Completed = read-only** (chip visivel, sem toggle/picker).
  Toggle + picker (RF-03/RF-06) montados apenas em Upcoming e Registered.
- `data-testid` estaveis (lesson #2): `live-tournament-priority-badge-{id}`,
  `live-tournament-maxlate-{id}`, `live-maxlate-toggle-{id}`, `live-maxlate-picker-{id}`,
  `live-bucket-header-{HH}`.

**Consequencias:**

- (+) Uma fonte de verdade visual para prioridade + Max Late nos 3 cards — sem divergencia
  tripla.
- (+) `data-testid` estaveis derivados do `id` (lesson #2) habilitam testes deterministicos.
- (−) Introduz um componente/sub-render novo a ser testado. Mitigado: o sub-render e
  apresentacional (sem estado), facil de testar via render isolado.
- (neutro) Decisao final entre componente (`TournamentCardMeta`) vs helper de className fica a
  cargo do implementer, desde que os 3 modos consumam a MESMA fonte (contrato: zero JSX de
  prioridade/chip duplicado).

## Consequencias gerais

**Positivas:**
- Paridade total `/grind-live` ↔ `DayDetailZoom` sem migration, sem endpoint novo, sem engine
  de alerta novo.
- Tres helpers puros (`resolveTournamentEndpoint`, `bucketUpcomingByHour`,
  `replaceMaxLateAlert`) testaveis isolados — superficie de teste limpa para o `test-writer`.
- Sub-render compartilhado elimina o risco de divergencia visual tripla.

**Negativas / trade-offs aceitos:**
- Alerta de Max Late transiente (some no reload) — reconcile-on-mount mitiga, persistencia
  fica para sprint futura.
- Resolucao de disparo limitada ao tick de 30s.
- Duas funcoes de bucketing (HH:00 / HH:55) coexistem em `helpers.ts`.

**Neutras:**
- `GrindSessionLive.tsx` (3326 LoC) nao e refatorado; mudancas pontuais. Split em hooks
  permanece como divida tecnica conhecida (fora de escopo, paralelo a INFO-1 do ADR-213).
- `organizeTournamentsByBreaks`, `hasDuplicateLateReg` permanecem intactos.

## Confianca

**Alta** — todas as 6 questoes abertas (Q-A..Q-F) foram resolvidas na spec com evidencia de
codigo (schema, generic-alerts, GrindSessionLive, TournamentAlertDialog, DayDetailZoom). Sem
migration, sem endpoint novo, sem engine novo. Os tres helpers puros + sub-render sao padroes
ja validados no cluster `DayDetailZoom` (ADR-213). Risco residual concentrado em D7 (handler
PUT generico aceitar `null`) — sinalizado ao implementer.

## Referencias

- Spec: `Docs/specs/sprint-grind-live-detail-parity.md`
- ADR-213: `Docs/architecture/decisions/213-day-detail-zoom-consolidation.md` (bucketing HH:00, lessons #43/HIGH-3)
- Diagramas: `Docs/architecture/diagrams/grind-live-detail-parity/maxlate-alert-sequence.mermaid`, `.../card-render-flow.mermaid`
- Codigo: `shared/generic-alerts.ts`, `client/src/components/grind-session-live/{TournamentCard,TournamentAlertDialog,helpers}.{tsx,ts}`, `client/src/components/grade/DayDetailZoom.tsx`
- Lessons: #1 (hooks first), #2 (data-testid), #43 (PATCH/PUT semantic), HIGH-3 (optimistic+rollback)
