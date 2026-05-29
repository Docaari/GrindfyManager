# Spec: Grind Live ↔ Day Detail Parity

## Status
Proposta

## Resumo
Trazer paridade visual + funcional entre o modal "Detalhes do dia" (`DayDetailZoom`,
commits 2a2a514c..f5126976 / ADR-213) e a listagem de torneios da pagina `/grind-live`
(`GrindSessionLive.tsx` + `components/grind-session-live/*`). Adiciona prioridade no
topo do card, badge Max Late, toggle/picker de Max Late, alerta automatico 2min antes
do Max Late, e bucketing por hora cheia na secao "Proximos torneios" — mais o caso de
uso de rebuy (editar Max Late de torneio em andamento).

## Contexto
O `/grade-planner → Detalhes do dia` ganhou: bucketing por `maxLate ?? time` (HH:00),
prioridade 1/2/3 (Alta vermelha + Flame; Media amarela; Baixa cinza opacity), badge
"GTD ~XXX" + estimated field, badge "Max Late HH:MM" (Hourglass ambar), e KPI "Mediana
Field". A pagina `/grind-live` ficou divergente: nao mostra Max Late no card, prioridade
fica no meio das badges (nao no topo), nao buckets por hora, e nao gera alerta de Max
Late. Jogador em sessao ao vivo perde a janela de late reg / rebuy por nao ter aviso.

## Usuarios
- **Jogador MTT em sessao ao vivo** (`/grind-live`): registra/joga torneios, precisa ver
  prioridade e Max Late no card, receber alerta 2min antes do fechamento do reg, e
  ajustar Max Late on-the-fly (rebuy proximo ao close).

## Decisoes Abertas — RESOLVIDAS

| Q | Pergunta | Resolucao | Evidencia |
|---|----------|-----------|-----------|
| Q-A | Onde mora `registrationTime` na sessao ativa? | **Em ambas as tabelas.** `session_tournaments.registration_time` (schema.ts:699) E `planned_tournaments.registration_time` (schema.ts:566). `prioridade` idem (690 / 556). Card cujo `id` comeca com `planned-` → PUT `/api/planned-tournaments/:realId`; senao → PUT `/api/session-tournaments/:id`. **Sem migration.** | shared/schema.ts |
| Q-B | Alerta 2min: client timer ou server enqueue? | **Client-side.** Reusa `SessionAlertManager` (shared/generic-alerts.ts) + tick `setInterval(checkAlerts, 30000)` ja existente em GrindSessionLive.tsx:1495. NAO enfileira server. | GrindSessionLive.tsx:1469-1497 |
| Q-C | Bucketing conflita com sort flat das 3 secoes? | **Nao.** Mantem 3 secoes top-level (Proximos / Em andamento / Concluidos). Bucketing intra-secao SOMENTE em "Proximos torneios" (upcoming). Em andamento e Concluidos permanecem flat (sort atual). | helpers.ts:404-433 |
| Q-D | Toggle Max Late OFF limpa alerta agendado? | **Sim.** Ao desligar, remover o alerta `type='tournament'` daquele `tournamentId` (cleanup garantido). | generic-alerts.ts:105 removeAlert |
| Q-E | Rebuy edit em active substitui alerta antigo? | **Sim.** Remover alerta(s) `tournament` existente(s) do `tournamentId` antes de adicionar o novo (dedup por tournamentId). | generic-alerts.ts:179 hasDuplicateLateReg |
| Q-F | Prioridade Alta usa mesmo border-l-4 red? | **Sim, paridade.** Mesmo `border-l-4 border-l-red-500` + Flame badge "Alta". Card /grind-live e mais denso mas o tratamento de prioridade espelha DayDetailZoom (D2/D3). | DayDetailZoom.tsx:1109-1141 |

## Requisitos Funcionais

### RF-01: Prioridade no topo do bloco horario
**Descricao:** Cards em "Proximos torneios" (upcoming) e "Em andamento" (registered)
devem exibir o tratamento de prioridade espelhando DayDetailZoom: badge Flame "Alta"
quando `prioridade === 1`, `border-l-4 border-l-red-500` no card de Alta, e cinza/opacity
em Baixa (`prioridade === 3`).

**Regras de negocio:**
- `prioridade` resolve via `Number(tournament.prioridade) || 2` (default Media).
- `isHigh = prioridade === 1` → border-l-4 vermelha + badge `<Flame/>` "Alta" no inicio do card.
- `isLow = prioridade === 3` → `opacity-90` + texto do nome em `text-gray-400`.
- Media (2) → sem badge inline, border padrao.
- O badge de prioridade Alta fica como **primeiro** elemento da linha de cabecalho do card
  (antes do site badge), espelhando DayDetailZoom:1132-1141.
- Sort dentro de cada secao (upcoming + registered): **prioridade ASC (1=Alta topo) →
  `getRegSortKey` ASC → buyIn DESC**. (Hoje helpers.ts:406-414 ordena getRegSortKey →
  prioridade → time; inverter para prioridade primeiro NAO e o pedido — ver nota abaixo.)
- **NOTA de ordenacao:** o bucketing (RF-05) agrupa por hora; DENTRO do bucket o sort e
  `prioridade ASC → time ASC → buyIn DESC` (paridade DayDetailZoom:324-334). A secao
  "Em andamento" (sem bucket) mantem o sort atual de `organizeTournaments` (getRegSortKey
  → prioridade → time) — apenas ganha o visual de prioridade no topo, nao muda a ordem.

**Criterio de aceitacao:**
- [ ] Card upcoming com `prioridade=1` renderiza `data-testid="live-tournament-priority-badge-{id}"` contendo "Alta" + icone Flame.
- [ ] Card com `prioridade=1` tem classe `border-l-red-500`.
- [ ] Card com `prioridade=3` tem `opacity-90` e nome em `text-gray-400`.
- [ ] Card com `prioridade=2` NAO renderiza badge de prioridade inline.
- [ ] Dentro de um bucket horario, torneio Alta aparece antes de Media/Baixa do mesmo bucket.

### RF-02: Badge Max Late no card
**Descricao:** Renderizar `tournament.registrationTime` como chip ambar com icone
Hourglass, sempre que != null/empty. Paridade com DayDetailZoom:1161-1171 (la o campo se
chama `maxLate`; em /grind-live o raw e `registrationTime`).

**Regras de negocio:**
- Exibir SE `typeof tournament.registrationTime === 'string' && registrationTime.trim() !== ''`.
- Posicao: entre o site badge e o nome do torneio (linha de cabecalho do card).
- Classe espelha: `bg-amber-500/15 text-amber-300 border border-amber-500/30` + `<Hourglass/>`.
- `title={`Reg final ${registrationTime}`}`.
- Aplica aos 3 modos de card (Upcoming, Registered, Completed) — Completed mostra read-only
  (sem toggle, ver RF-03/RF-06 escopo).

**Criterio de aceitacao:**
- [ ] `registrationTime="23:45"` → `data-testid="live-tournament-maxlate-{id}"` exibe "23:45" + Hourglass.
- [ ] `registrationTime=null` ou `""` → chip ausente.
- [ ] Chip presente em UpcomingCard e RegisteredCard.

### RF-03: Toggle Max Late on/off (Upcoming)
**Descricao:** Botao toggle no card upcoming para ativar/desativar Max Late. OFF →
`registrationTime = null` via PUT. ON → abre time picker (input HH:MM), salva via PUT.

**Regras de negocio:**
- Toggle button `data-testid="live-maxlate-toggle-{id}"`.
- Endpoint resolvido por `resolveTournamentEndpoint(id)`:
  - `id.startsWith('planned-')` → `PUT /api/planned-tournaments/{id.slice(8)}`.
  - senao → `PUT /api/session-tournaments/{id}`.
- ON: exibe input time `data-testid="live-maxlate-picker-{id}"`; ao confirmar, PUT body
  `{ registrationTime: "HH:MM" }`.
- OFF: PUT body `{ registrationTime: null }` + cleanup do alerta (RF-04 / Q-D).
- Mutation deve ser **otimistic com rollback** (lesson HIGH-3 day-detail): snapshot do
  cache antes, `setQueryData`, `catch` restaura. `invalidateQueries` centralizado no
  `finally`/`onSettled` das queries `['/api/session-tournaments']` e
  `['/api/planned-tournaments']`.
- Validacao HH:MM: regex `^\d{1,2}:\d{2}$`; invalido → nao envia, mostra erro inline.

**Criterio de aceitacao:**
- [ ] Toggle ON em card sem registrationTime abre picker.
- [ ] Confirmar "22:30" dispara PUT no endpoint correto com `{registrationTime:"22:30"}`.
- [ ] Toggle OFF dispara PUT com `{registrationTime:null}`.
- [ ] Card `planned-abc` → PUT `/api/planned-tournaments/abc`; card `sess-1` → PUT `/api/session-tournaments/sess-1`.
- [ ] Falha de PUT restaura o estado anterior (rollback).

### RF-04: Alerta 2min antes do Max Late (Upcoming)
**Descricao:** Quando `registrationTime` definido E torneio em "Proximos torneios" (ainda
nao registrado pelo jogador), criar alerta automatico que dispara em
`(registrationTime - 2 minutos)`. Integra com `SessionAlertManager` existente.

**Regras de negocio:**
- triggerAt = hoje as `registrationTime` − 2min. Cross-midnight rollover: se o horario
  ja passou hoje (`<= Date.now()`), alvo e amanha (paridade TournamentAlertDialog:138-141).
- Se triggerAt resultante `<= Date.now()` (faltam <2min agora), **nao** agenda (janela perdida).
- Usa `manager.addTournamentAlert({ tournamentId, triggerAt, label, narrationText })`.
  - label: `Max Late: {nome} ({site})`.
  - narrationText: reusa `buildTournamentNarration` (mesmo padrao do TournamentAlertDialog),
    respeitando `redactBuyIn`.
- **Dedup (Q-E):** antes de adicionar, remover qualquer alerta `type==='tournament'` do
  mesmo `tournamentId` (substituicao). Implementar helper `replaceMaxLateAlert(manager, tournamentId, ...)`.
- Disparo: reusa o tick `checkAlerts` (30s) + `getAlertsToFire` ja existente — NAO criar
  novo engine/loop.
- Auto-criacao: ao salvar `registrationTime` via RF-03 (ON), agenda o alerta. Tambem
  reconcilia para torneios upcoming que ja tem `registrationTime` ao montar/atualizar a
  lista (ver Notas — reconciliacao idempotente via dedup).

**Criterio de aceitacao:**
- [ ] Torneio upcoming com `registrationTime="20:00"` agenda alerta com triggerAt 19:58.
- [ ] Alerta com triggerAt passado (janela <2min) nao e agendado.
- [ ] Re-salvar registrationTime substitui o alerta (nao duplica) — apenas 1 alerta `tournament` por tournamentId.
- [ ] Alerta dispara via o tick existente (mock de relogio avanca para 19:58 → `getAlertsToFire` retorna o alerta).
- [ ] registrationTime cross-midnight (ex: salvar "00:30" as 23:00) agenda para 00:28 do dia seguinte.

### RF-05: Bucketing por Max Late na secao "Proximos torneios"
**Descricao:** Agrupar torneios upcoming por hora cheia (HH:00) usando `registrationTime ??
time`. Cada bloco com header "HH:00 — N torneios". Paridade DayDetailZoom:303-336.

**Regras de negocio:**
- bucketRef = `tournament.registrationTime || tournament.time`.
- slotKey = `${parseHour(bucketRef).padStart(2,'0')}:00`; sem hora valida → primeiro bucket / fallback.
- Header do bloco: `data-testid="live-bucket-header-{HH}"`, texto `{HH}:00 — {N} torneio(s)`.
- Sort dentro do bucket: prioridade ASC → time ASC → buyIn DESC (RF-01).
- Buckets ordenados por hora ASC.
- Helper novo em helpers.ts: `bucketUpcomingByHour(tournaments)` retornando
  `Array<{ hour: string; tournaments: any[] }>` ordenado. NAO reusar `organizeTournamentsByBreaks`
  (aquele bucketiza em HH:55 para breaks — semantica diferente; manter intacto).
- Aplica SOMENTE a secao upcoming. "Em andamento" (registered) e "Concluidos" sem bucket.

**Criterio de aceitacao:**
- [ ] 2 torneios `registrationTime` "20:15" e "20:45" caem no mesmo bucket "20:00".
- [ ] Torneio "21:05" cai em bucket "21:00" separado.
- [ ] Header "20:00 — 2 torneios" renderizado.
- [ ] Torneio sem time e sem registrationTime cai no fallback (primeiro bucket), nao some.
- [ ] Buckets ordenados 20:00 antes de 21:00.

### RF-06: Click Max Late em torneio "Em andamento" (rebuy)
**Descricao:** Cards "Em andamento" (RegisteredCard) tambem tem botao Max Late clicavel
(mesmo toggle/picker do RF-03), aplicavel ao estado active. Use case: rebuy proximo ao
close — jogador ajusta Max Late para receber alerta de "ultima janela de rebuy".

**Regras de negocio:**
- Reutilizar o MESMO componente/handler do RF-03 (toggle + picker), montado no RegisteredCard.
- Ao salvar registrationTime em card registered, agenda/atualiza alerta (RF-04 + dedup Q-E).
- Endpoint: registered geralmente e session_tournament → PUT `/api/session-tournaments/{id}`
  (mesma resolucao `resolveTournamentEndpoint`).
- O alerta para registered tambem dispara 2min antes do registrationTime (label pode ser
  o mesmo "Max Late: ..."). Sem distincao de copy nesta versao.

**Criterio de aceitacao:**
- [ ] RegisteredCard renderiza `live-maxlate-toggle-{id}`.
- [ ] Editar Max Late de registered salva via PUT e substitui o alerta anterior (sem duplicar).
- [ ] Toggle OFF em registered limpa o alerta.

## Requisitos Nao-Funcionais
- **Sem regressao:** os 93 testes de Caracterizacao do DayDetailZoom e os testes legados
  de /grind-live (incl. tts-suspend) devem continuar verdes.
- **Hooks first (lesson #1):** qualquer early return depois de todos os hooks.
- **Otimistic + rollback (lesson HIGH-3):** mutations de registrationTime com snapshot,
  setQueryData, rollback no catch, invalidate centralizado no onSettled.
- **PATCH/PUT semantic (lesson #43 / D-day-detail):** OFF envia `registrationTime: null`
  explicitamente (limpar), nao omitir a chave.
- **Performance:** bucketing e reconciliacao de alertas O(n) sobre a lista de torneios da
  sessao (dezenas, nao milhares) — sem preocupacao de escala.

## Endpoints Previstos
Nenhum endpoint novo. Reusa handlers PUT existentes (generic else-branch ja persiste
`registrationTime`):

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| PUT | /api/session-tournaments/:id | Atualiza registrationTime (session row) | JWT |
| PUT | /api/planned-tournaments/:id | Atualiza registrationTime (planned row) | JWT |

## Modelos de Dados Afetados
Nenhuma alteracao de schema. Colunas ja existentes:

### session_tournaments (existente)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| registration_time | varchar | nullable | HH:MM; alias `maxLate` no dayDetailService |
| prioridade | integer | default 2 | 1=Alta, 2=Media, 3=Baixa |

### planned_tournaments (existente)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| registration_time | varchar | nullable | idem |
| prioridade | integer | default 2 | idem |

## Integracoes Externas
Nenhuma. TTS (Web Speech) ja integrado via `speakUtterance` / fireAlert.

## Cenarios de Teste Derivados

### Happy Path
- [ ] Card upcoming Alta com registrationTime mostra Flame + chip Hourglass + border vermelha.
- [ ] Salvar registrationTime agenda alerta 2min antes; tick dispara no horario.
- [ ] Bucket "20:00 — 2 torneios" agrupa corretamente.

### Validacao de Input
- [ ] Picker HH:MM invalido ("99:99" / "abc") → nao envia PUT, erro inline.
- [ ] registrationTime vazio → chip oculto, sem alerta.

### Regras de Negocio
- [ ] Endpoint resolvido por prefixo `planned-` vs session id.
- [ ] Dedup: re-salvar registrationTime mantem 1 alerta tournament por tournamentId.
- [ ] Toggle OFF remove o alerta agendado.
- [ ] Sort intra-bucket: prioridade ASC → time ASC → buyIn DESC.

### Edge Cases
- [ ] Cross-midnight: registrationTime "00:30" salvo as 23:00 agenda 00:28 +1 dia.
- [ ] Janela perdida: registrationTime "20:00" salvo as 19:59 nao agenda (triggerAt no passado).
- [ ] PUT falha → rollback do optimistic update (registrationTime volta ao valor anterior).
- [ ] Torneio sem time nem registrationTime → cai no bucket fallback, nao some da lista.
- [ ] Multi-table: card planned + card session com mesmo horario buckets juntos.

## Fora de Escopo
- Refactor do `GrindSessionLive.tsx` (3326 LoC) em hooks — sprint dedicada futura.
- Mudancas em `SessionDashboard` ou `SessionSummaryModal` (apenas cards de torneio).
- Telemetria nova alem dos `safeEmit` existentes (reusar; nenhum evento novo obrigatorio).
- Migration SQL (Q-A confirmou colunas presentes nas duas tabelas).
- Max Late toggle/picker em **Concluidos** (CompletedCard) — apenas exibe o chip read-only (RF-02).
- Copy/UX distinta de "ultima janela de rebuy" no alerta — mesma label "Max Late" nesta versao.
- Persistir alerta server-side / cross-reload (alertas continuam transientes por sessao).

## Dependencias
- `SessionAlertManager` (shared/generic-alerts.ts) — addTournamentAlert / removeAlert / getAlertsToFire (existentes).
- `buildTournamentNarration` (@/lib/tournamentNarration) — narracao do alerta.
- Tick `checkAlerts` 30s em GrindSessionLive.tsx:1494 — reuso.
- Handlers PUT genericos session/planned (registrationTime ja persistido).

## Notas de Implementacao
- **resolveTournamentEndpoint(id)**: helper puro em helpers.ts. `planned-` prefix → planned; senao session. Testavel isolado.
- **replaceMaxLateAlert(manager, tournament, opts)**: remove alertas tournament do tournamentId, calcula triggerAt = registrationTime−2min (com rollover), agenda se futuro. Helper puro testavel (injetar `now` para testes deterministicos).
- **bucketUpcomingByHour(tournaments)**: helper puro em helpers.ts (paridade DayDetailZoom plannedSlots). Testavel isolado.
- **Reconciliacao de alerta:** em useEffect que observa lista de upcoming/registered + registrationTime, chamar replaceMaxLateAlert para cada torneio com registrationTime (idempotente via dedup). Cuidado com deps do useEffect (lesson #1 hooks). Nao re-agendar a cada tick — apenas quando a lista/registrationTime muda.
- **Testes (.tsx):** usar `await import()` nao `require()` (lessons #14/#26). Radix triggers via userEvent; botoes nativos (toggle, picker confirm) via fireEvent.click ok. Polyfill jsdom ja em tests/setup.ts.
- **Injetar storage/now**: helpers de alerta recebem `now: Date` opcional (default new Date()) para teste deterministico de rollover/janela perdida.
- Visual: extrair sub-render de prioridade+maxLate chip para evitar duplicacao tripla (Upcoming/Registered/Completed) — small component `TournamentCardMeta` ou helper de className. Decisao final do architect.
