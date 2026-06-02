# Spec: Fase D #5 — Stop-loss pré-comprometido a frio (cold commit no warm-up)

## Status
Proposta

## Resumo
Permitir que o jogador **confirme/comite o stop-loss da sessão a frio** (estado racional, durante o
warm-up, antes de jogar), reusando 100% o enforcement já existente (`stopService` + `user_settings.stopLossUsd`
+ `stopLockUntil`). Adiciona uma **heurística de sugestão em buy-ins** (3–5 BI × ABI da grade → USD) e
uma **trava de edição "quente"** (não dá pra afrouxar o limite durante a sessão sem fricção). Exibe o stop
comprometido + "quanto falta" no warm-up e no grind-live. Marca o link conceitual com o tilt `desperation` (Fase C #4).

## Contexto

**Por que:** o curso (módulo D5 + A9) ensina que o stop-loss só funciona como antídoto ao tilt `desperation`
("late-reg de high roller pra recuperar o dia") quando é **decidido a frio** — definido em estado racional,
ANTES de jogar, e **inegociável** depois. O Grindfy já tem stop-loss **mecânico que bloqueia** (423 STOP_LOCKED),
mas o limite hoje é um **valor USD estático no settings**, decidido uma única vez (não por sessão, não no momento "a frio").

**O gap (escopo desta fatia):**
1. Capturar/confirmar o stop-loss **no warm-up** (o momento "a frio" = antes de jogar), por sessão.
2. **Sugerir** o valor via heurística BI (curso: ~3–5 BI/sessão), derivada do ABI da grade → USD.
3. **Travar a edição quente** (depois de comitado a frio, afrouxar o limite durante a sessão exige fricção).
4. Exibir o stop comprometido + "quanto falta" no warm-up e grind-live.
5. Marcar o link conceitual com `desperation` (mínimo — só não quebrar o conceito).

**Achado crítico (NÃO reconstruir):** toda a infra de stop-loss já existe e DEVE ser reusada:
- `user_settings.{stopLossUsd, stopWinUsd, stopLockUntil, stopLockDurationHours}` (schema.ts:961, Bankroll-3 RF-6).
  > Correção ao briefing: o campo vive em `user_settings`, NÃO em `users`. `stopService` lê via `storage.getUserSettings(userId)`.
- `server/services/stopService.ts` (ADR-060): `assertNotStopLocked` (throws 423), `evaluateStops(userId, sessionId)`
  → `{stopReached, lockedUntil?}`, `getCurrentDayDeltaUsd(userId)` (USD via fxResolver), `releaseLock(userId)`.
- `warmup_rituals` (schema.ts:844) com `decisionToPlay` + `sessionIntention` (jsonb, bloco 4 IntentionBlock).
- Endpoints `GET/PUT` stops: `handleGetUserSettingsStops` (expõe `currentDayDeltaUsd`) / `handlePutUserSettingsStops` (auth.ts:834+).
- `StopBanner` (read-only, já wired em `GrindSession.tsx`).
- ABI da grade: `storage.getPlannedTournamentsDashboardStats` expõe `avgBuyin` de `planned_tournaments`.

**Prioridade relativa:** Board ICE 7.7. Sequência da Fase D (após Fase A/B/Metas-1). Fatia única, aditiva.

---

## Decisões de Produto — TRAVADAS

> Estas decisões resolvem a ambiguidade do briefing. O test-writer e o implementer devem segui-las literalmente.

### DEC-1 — Cold-commit ESCREVE `user_settings.stopLossUsd` (reusa enforcement). SEM campo USD por-sessão.
O cold-commit grava o valor comitado **diretamente em `user_settings.stopLossUsd`** (via o caminho de upsert
já existente). Isso reusa 100% o `stopService.evaluateStops` (que lê `settings.stopLossUsd`) e o gate 423.
NÃO cria um campo USD "por sessão" (evita duplicar enforcement e divergência de fonte de verdade).
Racional: o stop-loss já é "do dia" (reset 00:00 user TZ); confirmá-lo a frio no warm-up = re-afirmar/ajustar o valor do dia.

### DEC-2 — O "sinal de frio" é registrado em `warmup_rituals`, NÃO em coluna nova de `user_settings`.
Para saber se o stop foi comitado a frio (e quando), gravamos o snapshot dentro de
`warmup_rituals.sessionIntention` (jsonb já existente) — estendido com um sub-objeto `coldStopCommit`.
Isso evita migration em `user_settings` e mantém a rastreabilidade "stop foi comitado neste warm-up, neste valor, neste timestamp".
> Ver DEC-7 sobre migration.

### DEC-3 — Heurística BI → USD: sugere, NÃO impõe (lesson #11).
A sugestão padrão é **3 BI** (conservador, dentro do range 3–5 do curso). O slider/seletor permite 3, 4 ou 5 BI.
Fórmula: `stopLossSugeridoUsd = nBI × abiUsd`, onde `abiUsd` = ABI da grade (ver DEC-4) convertido para USD (lesson #6).
O jogador pode **sobrescrever** o valor sugerido com um valor USD livre. O número final comitado é o que vale.
A heurística aparece como texto auxiliar ("sugestão: 3 BI ≈ $X"), nunca como trava.

### DEC-4 — Fonte do ABI: `getPlannedTournamentsDashboardStats(userId).avgBuyin` (grade do perfil ativo).
O ABI vem da **grade planejada** (`planned_tournaments`, perfil ativo), via o stat `avgBuyin` já calculado em
`storage.getPlannedTournamentsDashboardStats`. Se a grade está em moeda nativa, converter para USD via `fxResolver`
(lesson #6 — normalizar ANTES de multiplicar). Se não houver grade / ABI = 0 / FX indisponível → **degrada graciosamente**
(ver edge cases): esconde a sugestão BI e oferece só o campo USD livre. NÃO inventa ABI.

### DEC-5 — "Inegociável": trava de edição QUENTE = não pode AFROUXAR durante a sessão.
Depois de comitado a frio, **durante uma sessão ativa** (existe `grind_session` com `status='active'` aberta hoje):
- **Afrouxar** (aumentar `stopLossUsd`, i.e. permitir perder mais) = **BLOQUEADO** (rejeitado pelo backend, 409 ou
  mensagem clara). Esse é o ponto do curso: a decisão a frio é inegociável quente.
- **Apertar** (diminuir `stopLossUsd`, i.e. parar antes) = **PERMITIDO** (proteger mais é sempre OK).
- Quando NÃO há sessão ativa (estado "a frio": warm-up, ou nenhuma sessão aberta) = edição livre (sobe ou desce).
Detecção de "quente" = existe sessão `status='active'` do user (reusa `storage.listGrindSessionsByUser`).
> O `stopLockUntil` existente NÃO muda — ele continua sendo o lock pós-stop-atingido (12h). A trava de DEC-5 é
> uma regra de **edição** do valor, ortogonal ao lock de execução.

### DEC-6 — Captura no warm-up: novo passo no IntentionBlock (bloco 4), abaixo do "Vou encerrar quando".
O cold-commit é um novo controle dentro do **bloco 4 (Intenção)** do warm-up — local natural, já é onde
o jogador escreve o critério de encerramento livre (`stopCriteria`). Adiciona um seletor BI + valor USD comitável.
É **opcional** (não bloqueia avançar o warm-up) — se o jogador pular, nada é comitado e o `stopLossUsd` existente
permanece como está (back-compat com o stop estático, DEC-8).

### DEC-7 — Migration: NÃO há migration de schema. Reusa colunas existentes.
- `user_settings.stopLossUsd` já existe → cold-commit escreve nela.
- `warmup_rituals.sessionIntention` (jsonb) já existe → estende o shape em Zod (lesson #7, aditivo opcional).
- Nenhuma coluna nova. Nenhum `db:push` necessário.
> Justificativa: o briefing pediu "preferir reusar `users.stopLossUsd` + sinal de frio sem migration grande".
> Esta decisão entrega exatamente isso (com a correção de que o campo é `user_settings`, não `users`).

### DEC-8 — Back-compat com stop-loss estático: cold-commit é ADITIVO.
Usuários que já têm `stopLossUsd` setado (via settings de bankroll) continuam funcionando idêntico. O cold-commit
só ESCREVE quando o jogador efetivamente comita no warm-up. Se nunca comitar, o comportamento atual é preservado 100%.
O enforcement (423) não muda.

### DEC-9 — Conexão `desperation` (Fase C #4): MÍNIMO — campo de rastreabilidade + texto.
Nesta fatia, a única integração é: gravar em `warmup_rituals.sessionIntention.coldStopCommit` o fato de que houve
(ou não) cold-commit + o valor. Isso deixa o dado disponível para o relatório/coach (Fase C/futuro) responder
"você tinha stop a frio? cumpriu?". NÃO implementamos a leitura no coach/relatório aqui — só não quebramos o link
(o dado fica persistido e consultável). Um texto curto no UI reforça o conceito ("Stop a frio é seu antídoto ao desespero").

---

## Decisões DEFERIDAS (fora desta fatia — marcar pro architect/futuro)
- **DEF-1:** Leitura do `coldStopCommit` pelo Daily Debrief / coach ("cumpriu o stop a frio?") → Fase C ou Metas.
- **DEF-2:** Stop-loss por **wallet** ou por **tipo de torneio** (hoje é consolidado USD do dia) → fora.
- **DEF-3:** Stop-win cold-commit (esta fatia é só stop-LOSS; stop-win continua telemetria como hoje).
- **DEF-4:** BRM/RoR para derivar o BI "certo" (Fase D #8, sprint separado). A heurística BI aqui é fixa 3–5.
- **DEF-5:** Histórico/analytics de "consistência de cold-commit" (quantas vezes comitou vs cumpriu) → futuro.
- **DEF-6:** Fricção de override para afrouxar quente (DEC-5 bloqueia hard; um "override com confirmação dupla"
  fica deferido — por ora é bloqueio limpo).

---

## Usuários
- **Jogador MTT (todos os tiers):** comita o stop-loss a frio no warm-up; vê o stop + "quanto falta" no grind-live;
  é impedido de afrouxar o limite durante a sessão. Sem tier gate (paridade com warm-up/stops existentes — esses não gateiam).

---

## Requisitos Funcionais

### RF-01: Cold-commit do stop-loss no warm-up (bloco Intenção)
**Descrição:** No bloco 4 (Intenção) do warm-up, o jogador pode confirmar/ajustar o stop-loss do dia a frio.
Ao comitar, o valor é persistido em `user_settings.stopLossUsd` (DEC-1) e o snapshot do commit é gravado em
`warmup_rituals.sessionIntention.coldStopCommit` (DEC-2) ao finalizar o ritual.

**Regras de negócio:**
- O controle é OPCIONAL — o jogador pode avançar sem comitar (DEC-6). Avançar sem comitar NÃO altera `stopLossUsd`.
- Comitar grava `stopLossUsd` (USD, > 0) via o caminho de upsert de settings já existente (`handlePutUserSettingsStops` ou `storage.upsertUserSettings`).
- O snapshot `coldStopCommit` tem shape: `{ committedUsd: number, basis: "bi" | "manual", nBI?: 3|4|5, abiUsd?: number, committedAt: string (ISO) }`.
  - `basis: "bi"` quando derivado da heurística; `"manual"` quando o jogador digitou USD livre.
- Se o warm-up for **abortado** (`version: "aborted"`), o `coldStopCommit` NÃO é persistido (mas se o jogador já
  tinha comitado o `stopLossUsd` antes de abortar, o valor em `user_settings` permanece — escrita é imediata no commit, não no fim do ritual).
- O commit do `stopLossUsd` deve respeitar a trava de edição quente (DEC-5 / RF-04) — comitar a frio (sem sessão ativa) é sempre livre.

**Critério de aceitação:**
- [ ] Comitar com valor USD > 0 grava `user_settings.stopLossUsd` e retorna sucesso.
- [ ] Comitar com `basis: "bi"` (nBI ∈ {3,4,5}) calcula `committedUsd = nBI × abiUsd` e grava o resultado.
- [ ] Avançar o bloco sem comitar NÃO altera `stopLossUsd` (valor anterior preservado).
- [ ] Ao finalizar warm-up `version: "full"`, `sessionIntention.coldStopCommit` é persistido com o shape correto.
- [ ] Warm-up abortado não grava `coldStopCommit`.
- [ ] Comitar valor <= 0 ou NaN → rejeitado (400, mensagem clara), `stopLossUsd` não muda.

### RF-02: Heurística BI → USD (sugestão, não imposição)
**Descrição:** No controle de cold-commit, exibir uma sugestão em buy-ins derivada do ABI da grade.
Default 3 BI; opções 3, 4, 5 BI (DEC-3). Mostra o equivalente em USD.

**Regras de negócio:**
- ABI vem de `getPlannedTournamentsDashboardStats(userId).avgBuyin` (perfil ativo) (DEC-4).
- `abiUsd` = ABI convertido para USD via `fxResolver` ANTES de multiplicar (lesson #6). Logar antes de qualquer fallback (lesson #9).
- `stopLossSugeridoUsd = nBI × abiUsd`, arredondado a 2 casas.
- A sugestão é **texto auxiliar** + pré-preenche o campo USD; o jogador pode sobrescrever com USD livre (vira `basis: "manual"`).
- Se ABI ausente / 0 / grade vazia / FX indisponível → esconder a sugestão BI; oferecer só campo USD livre (DEC-4, degrada).

**Critério de aceitação:**
- [ ] Com grade tendo `avgBuyin` válido e FX disponível: sugestão 3 BI mostra `$ (3 × abiUsd)`.
- [ ] Trocar para 4 ou 5 BI recalcula o USD sugerido.
- [ ] ABI em moeda nativa é convertido para USD antes de multiplicar.
- [ ] Sobrescrever o USD sugerido marca `basis: "manual"` no commit.
- [ ] Sem grade / ABI=0 / FX ausente: nenhuma sugestão BI é exibida; campo USD livre disponível; sem crash.

### RF-03: Exibição do stop comprometido + "quanto falta" (warm-up + grind-live)
**Descrição:** Mostrar o stop-loss comitado e quanto falta para atingi-lo, no warm-up (após comitar) e no grind-live.

**Regras de negócio:**
- "Quanto falta" = `stopLossUsd + currentDayDeltaUsd` quando `currentDayDeltaUsd < 0`; reusa
  `stopService.getCurrentDayDeltaUsd` (já exposto via `GET` stop-status / `handleGetUserSettingsStops.currentDayDeltaUsd`).
  - Ex.: stop $300, delta do dia -$120 → "faltam $180 para o stop".
  - Delta >= 0 (no lucro/zerado): "stop em $300 (você está +$X / no zero hoje)".
- No warm-up: após comitar, exibir confirmação ("Stop a frio comitado: $300 — seu antídoto ao desespero" — DEC-9).
- No grind-live: exibir o stop comitado + quanto falta. Reusa o componente/lógica do `StopBanner` ou um indicador
  leve. NÃO criar dashboard novo (briefing). Quando `stopLockUntil > now`, o `StopBanner` existente (loss) já cobre o bloqueio.
- NÃO bloqueia nada novo — é display. O bloqueio continua sendo o 423 do `stopService` (já existe).

**Critério de aceitação:**
- [ ] Após comitar no warm-up, UI confirma o valor comitado.
- [ ] No grind-live, com `stopLossUsd` setado e delta negativo, mostra "faltam $X para o stop".
- [ ] Delta >= 0 mostra estado positivo/neutro (não "faltam -$X").
- [ ] Sem `stopLossUsd` setado: não mostra indicador de "quanto falta" (nada quebra).
- [ ] Não introduz novo endpoint de bloqueio; bloqueio continua via 423 existente.

### RF-04: Trava de edição quente ("inegociável")
**Descrição:** Impedir afrouxar o stop-loss durante uma sessão ativa. Apertar é sempre permitido.

**Regras de negócio (DEC-5):**
- "Quente" = existe `grind_session` do user com `status='active'`.
- Durante quente:
  - **Aumentar** `stopLossUsd` (afrouxar) → **REJEITADO** (HTTP 409, code `STOP_LOOSEN_BLOCKED`, mensagem clara).
  - **Diminuir** `stopLossUsd` (apertar) → permitido.
  - **Setar de null para um valor** (não havia stop) → permitido (criar proteção é sempre OK).
  - **Setar de valor para null** (remover stop durante a sessão) → **REJEITADO** (= afrouxar ao máximo).
- A frio (sem sessão ativa): qualquer edição é livre (sobe, desce, null).
- A trava aplica-se ao caminho de escrita de `stopLossUsd` (`handlePutUserSettingsStops` e o commit do warm-up RF-01).
- A trava é ortogonal ao `stopLockUntil` (que é o lock pós-stop-atingido, 12h, inalterado).

**Critério de aceitação:**
- [ ] Sem sessão ativa: aumentar, diminuir, setar null → todos permitidos (200).
- [ ] Com sessão ativa: aumentar `stopLossUsd` → 409 `STOP_LOOSEN_BLOCKED`, valor não muda.
- [ ] Com sessão ativa: diminuir `stopLossUsd` → 200, valor muda.
- [ ] Com sessão ativa: `stopLossUsd` de valor → null → 409, valor não muda.
- [ ] Com sessão ativa: `stopLossUsd` de null → valor → 200 (criar proteção).
- [ ] A trava não afeta `stopWinUsd` nem `stopLockDurationHours` (fora do escopo de "afrouxar loss").

### RF-05: Link conceitual com tilt `desperation` (mínimo)
**Descrição:** Persistir o sinal de cold-commit de forma consultável + reforçar o conceito no UI.

**Regras de negócio (DEC-9):**
- `warmup_rituals.sessionIntention.coldStopCommit` é gravado quando há commit (RF-01) — o dado fica disponível
  para o coach/relatório futuro responder "tinha stop a frio? cumpriu?" (DEF-1, não implementado aqui).
- Texto curto no UI do cold-commit referencia o conceito (ex.: "Stop a frio é o antídoto ao desespero de recuperar o dia").
- NÃO implementar leitura/análise no coach nesta fatia.

**Critério de aceitação:**
- [ ] `coldStopCommit` aparece no payload de `POST /api/warmup-rituals` quando houve commit e é persistido.
- [ ] O conceito é referenciado textualmente no UI do warm-up (string presente, testável via data-testid).
- [ ] Nenhuma mudança no coach/relatório (não regride o existente).

---

## Requisitos Não-Funcionais
- **Reuso (crítico):** NÃO reconstruir `stopService`, enforcement 423, `StopBanner`, ou colunas de stops. Reusar (briefing).
- **FX:** toda conversão de moeda → USD ANTES de comparar/multiplicar (lesson #6); logar antes de fallback (lesson #9).
- **Back-compat:** extensão de `sessionIntention` é aditiva e opcional (lesson #7). Usuários com stop estático intactos (DEC-8).
- **Sem migration:** nenhuma alteração de schema / `db:push` (DEC-7).
- **Performance:** o cálculo de "quanto falta" reusa `getCurrentDayDeltaUsd` (já em uso pela stop-status); sem nova query pesada.
- **Resiliência:** falha de FX / ABI / grade degrada para campo USD livre, nunca quebra o warm-up.

## Endpoints Previstos
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | /api/user/settings/stops | (EXISTENTE) Expõe `stopLossUsd`, `stopLockUntil`, `currentDayDeltaUsd`. Reusar para "quanto falta". | JWT |
| PUT | /api/user/settings/stops | (EXISTENTE, ESTENDER) Aplicar trava de edição quente RF-04 (409 `STOP_LOOSEN_BLOCKED` ao afrouxar com sessão ativa). | JWT |
| POST | /api/warmup-rituals | (EXISTENTE, ESTENDER) Aceitar `sessionIntention.coldStopCommit` no body (Zod aditivo). | JWT |
| GET | /api/planned-tournaments dashboard stats | (EXISTENTE) Fonte do `avgBuyin` para a heurística BI. Reusar. | JWT |

> Nenhum endpoint novo. O cold-commit do `stopLossUsd` pode escrever via o `PUT /api/user/settings/stops` existente
> (preferível — centraliza a trava RF-04 num só lugar) OU via novo handler dedicado; o architect decide. Recomendação:
> reusar `handlePutUserSettingsStops` + injetar a checagem de "quente".

## Modelos de Dados Afetados
Nenhuma coluna nova. Extensão de tipo (jsonb) e reuso de coluna existente.

### user_settings (reuso — sem alteração de schema)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| stop_loss_usd | decimal | > 0 ou null | (EXISTENTE) cold-commit escreve aqui (DEC-1). |
| stop_lock_until | timestamp | nullable | (EXISTENTE) lock pós-stop, inalterado. |
| stop_lock_duration_hours | integer | default 12 | (EXISTENTE) inalterado. |

### warmup_rituals.sessionIntention (extensão de tipo jsonb — aditiva, sem migration)
Shape atual: `{ focus, tiltPlan, stopCriteria }`. Estender com sub-objeto opcional:
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| coldStopCommit | objeto \| ausente | opcional | Snapshot do cold-commit (DEC-2). |
| coldStopCommit.committedUsd | number | > 0 | Valor comitado em USD. |
| coldStopCommit.basis | "bi" \| "manual" | — | Origem do valor. |
| coldStopCommit.nBI | 3 \| 4 \| 5 | só quando basis="bi" | Buy-ins escolhidos. |
| coldStopCommit.abiUsd | number | só quando basis="bi" | ABI usado (USD). |
| coldStopCommit.committedAt | string (ISO) | — | Timestamp do commit. |

## Integrações Externas
| Serviço | Propósito | Quando |
|---|---|---|
| fxResolver (interno) | Converter ABI nativo → USD para a heurística BI | Ao calcular a sugestão no warm-up |
| stopService (interno) | `getCurrentDayDeltaUsd` para "quanto falta" | Ao exibir no grind-live / warm-up pós-commit |

Sem integrações externas novas.

## Cenários de Teste Derivados

### Happy Path
- [ ] Jogador comita 3 BI no warm-up (ABI $50 → stop $150); `stopLossUsd` = 150; `coldStopCommit` persistido `basis:"bi"`.
- [ ] Jogador sobrescreve com $200 (manual); `stopLossUsd` = 200; `coldStopCommit.basis = "manual"`.
- [ ] No grind-live, stop $150 + delta -$60 → "faltam $90 para o stop".

### Validação de Input
- [ ] Comitar USD <= 0 → 400, `stopLossUsd` inalterado.
- [ ] Comitar USD NaN / string inválida → 400.
- [ ] `nBI` fora de {3,4,5} → tratado como manual ou rejeitado (architect define; default: clamp/reject — documentar).
- [ ] `coldStopCommit` com shape inválido no POST warm-up → Zod rejeita (400) sem quebrar o resto do ritual.

### Regras de Negócio
- [ ] Avançar bloco Intenção sem comitar → `stopLossUsd` preservado, nenhum `coldStopCommit`.
- [ ] Warm-up abortado → sem `coldStopCommit`; mas `stopLossUsd` já comitado antes do abort permanece.
- [ ] Heurística BI com ABI em BRL → converte para USD antes de multiplicar (lesson #6).

### Edge Cases (CRÍTICOS — destacados pelo briefing)
- [ ] **Sem ABI / grade vazia:** `avgBuyin` = 0 ou ausente → sugestão BI escondida, só campo USD livre, sem crash (DEC-4).
- [ ] **Sem grade do perfil ativo:** `getPlannedTournamentsDashboardStats` retorna vazio → degrada como acima.
- [ ] **Já locked (`stopLockUntil > now`):** cold-commit no warm-up — comportamento esperado: pode COMITAR/ajustar o
      valor do próximo dia (a frio), mas o lock vigente permanece (não libera). Apertar OK; afrouxar segue RF-04 se houver
      sessão ativa. Documentar: comitar NÃO chama `releaseLock`.
- [ ] **Editar quente — afrouxar:** sessão `status='active'` + aumentar `stopLossUsd` → 409 `STOP_LOOSEN_BLOCKED` (RF-04).
- [ ] **Editar quente — apertar:** sessão ativa + diminuir → 200.
- [ ] **Editar quente — remover (→ null):** sessão ativa → 409.
- [ ] **FX ausente:** `fxResolver` sem cotação → não zera moeda; degrada para USD livre; loga antes do fallback (lesson #6, #9).
- [ ] **Back-compat stop estático:** usuário com `stopLossUsd` pré-existente que nunca comita a frio → comportamento idêntico ao atual (DEC-8).
- [ ] **Race (sessão criada entre GET e PUT):** afrouxar logo após iniciar sessão → a checagem de "quente" no PUT
      deve ver a sessão ativa (re-consulta no momento do write, não confiar em estado client). Sem afrouxar furtivo.
- [ ] **Mock = shape real (lesson #3):** testes de `getPlannedTournamentsDashboardStats`, `getUserSettings`,
      `listGrindSessionsByUser`, `getCurrentDayDeltaUsd` devem mockar o SHAPE REAL retornado por esses métodos
      (validar contra o storage real antes de mockar — 3 CRITICAL já passaram por mock idealizado em sprints anteriores).

## Fora de Escopo
- Reconstruir `stopService`, enforcement 423, `StopBanner`, ou colunas de stops (reusar — briefing).
- Stop-win cold-commit (continua telemetria como hoje).
- BRM / RoR para derivar o BI correto (Fase D #8, sprint separado).
- Leitura/análise do `coldStopCommit` pelo Daily Debrief / coach (DEF-1).
- Stop-loss por wallet ou por tipo de torneio (continua consolidado USD do dia).
- Histórico/analytics de consistência de cold-commit.
- Override com fricção para afrouxar quente (DEC-5 bloqueia hard; override é DEF-6).
- Migration de schema / `db:push`.
- Dashboard novo de stop-loss.

## Dependências
- `stopService.ts` + `user_settings.stopLossUsd` + `stopLockUntil` (Bankroll-3 RF-6, ADR-060) — EXISTEM.
- `warmup_rituals` + `sessionIntention` jsonb + POST `/api/warmup-rituals` (Sprint W-1) — EXISTEM.
- `getPlannedTournamentsDashboardStats.avgBuyin` (grade) — EXISTE.
- `fxResolver` — EXISTE.
- `StopBanner` + `handleGetUserSettingsStops` (`currentDayDeltaUsd`) — EXISTEM.
- Conceito de tilt `desperation` (Fase C #4) — referência conceitual, link mínimo (DEC-9).

## Notas de Implementação (opcional)
- Preferir centralizar a trava de edição quente (RF-04) no único caminho de escrita de `stopLossUsd`
  (`handlePutUserSettingsStops`), para que tanto o cold-commit do warm-up quanto o settings de bankroll passem por ela.
- Detecção de "quente": re-consultar `listGrindSessionsByUser` no momento do PUT e checar `status==='active'`
  (não confiar em flag do client — evita race do edge case).
- O grind-live hoje NÃO tem `StopBanner` (só `GrindSession.tsx` tem). O architect decide se o indicador de
  "quanto falta" em grind-live reusa o `StopBanner` (modo informativo) ou um indicador leve novo. Preferir reuso.
- `coldStopCommit` deve ser estendido no Zod do POST warm-up (`createRitualBodySchema.sessionIntention`) de forma
  `.optional()` + tolerante (lesson #7) — não tornar `sessionIntention` required.
- Verify browser faz parte do "done" (briefing): comitar no warm-up, ver "quanto falta" no grind-live, tentar afrouxar quente.
```
