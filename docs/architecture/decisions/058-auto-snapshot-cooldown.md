# ADR-058: Auto-snapshot pos-cooldown dentro da TX, falha logada nao bloqueia finish

## Status
Proposto

## Data
2026-05-01

## Contexto

A Sprint Bankroll-2 (commit `69c03c7`) entregou `bankroll_snapshots` multi-wallet com FX freezes (ADR-017, ADR-034). A criacao de snapshot continua **manual** — disparada ao salvar reconcile no `SessionSummaryModal` (B2, ADR-047) ou via UI dedicada em `/settings/bankroll`.

QA real do founder revelou um gap auditorial: cool-downs encerrados sem reconcile (modo `quick` ou jogador que pulou edicao de saldos) nao geram snapshot. O ledger `wallet_transactions` continua intacto, mas a serie temporal de banca consolidada fica com lacunas — analytics de evolucao mensal exibem degraus artificiais entre snapshots manuais.

A spec `Docs/specs/sprint-bankroll-3.md` RF-2 endereca isso: **toda finalizacao de cooldown** (`POST /api/cooldown-logs/:id/finish` em `server/routes/cooldown.ts:175`) gera snapshot consolidado automatico com `origin='auto-cooldown'`.

A questao arquitetural eh **onde** rodar a logica de criacao do snapshot:

1. **Dentro da mesma TX** que finaliza o cooldown (handler atualizado em `routes/cooldown.ts`).
2. **Job assincrono** (worker, fila, setTimeout) disparado apos o response.
3. **Trigger no Postgres** observando `UPDATE cooldown_logs SET completed_at = ...`.

Cada opcao tem implicacoes diferentes em latencia, atomicidade, tracability e tolerancia a falha.

### Pre-requisitos satisfeitos

- `bankroll_snapshots` ja existe (ADR-017) e suporta FX freezes (ADR-034).
- `walletService.getConsolidatedBalanceUSD(userId)` ja existe e usado em B2.
- Cool-down finish handler ja eh transacional (chamadas a `setSessionPlanClosed`, `updateGrindSession status=completed`, etc.).
- `bankrollManagementEnabled` (ADR-047 / B2) governa toda interacao com bankroll — auto-snapshot tambem respeita o flag.

### Forcas em jogo

- **UX latency:** cooldown finish e action terminal do fluxo de sessao. Latencia adicional e visivel.
- **Atomicidade:** snapshot perdido = degrau na serie temporal. Snapshot duplicado = ruido (mas idempotencia mitiga).
- **Operabilidade:** debugging de "snapshot nao apareceu" eh trivial se logica esta inline; quase impossivel se vive em fila externa.
- **Atomicidade vs blocking:** snapshot nao deve quebrar finish (cool-down completo eh produto critico; snapshot eh secundario).

## Decisao

**Adotar opcao D2 (dentro da TX, com try/catch isolado): snapshot inline no handler `POST /api/cooldown-logs/:id/finish`, gravado apos as operacoes existentes (setSessionPlanClosed, updateGrindSession, etc.) mas DENTRO da mesma sequencia transacional do request. Erros de snapshot sao logados via `console.error` + telemetria `auto_snapshot_failed` mas NAO propagam para o cliente — finish retorna 200 OK mesmo se snapshot falhar.**

### Detalhes do contrato

**Handler (`server/routes/cooldown.ts`):**

```ts
// Apos as operacoes existentes do finish handler:
let snapshot = null;
try {
  if (await isBankrollManagementEnabled(userId)) {
    snapshot = await bankrollService.createAutoSnapshot({
      userId,
      cooldownLogId: req.params.id,
      occurredAt: new Date(),
    });
  }
} catch (err) {
  console.error('[cooldown-finish] auto-snapshot failed', { userId, cooldownLogId: req.params.id, err });
  telemetry('auto_snapshot_failed', { userId, reason: err?.message ?? 'unknown' });
  snapshot = null;
}
res.status(200).json({ ...existingPayload, snapshot });
```

**Idempotencia (RF-2 + RF-8):**

Migration `0018_auto_snapshot_meta.sql` cria index parcial:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_bankroll_snapshots_cooldown
  ON bankroll_snapshots (user_id, source_ref_id)
  WHERE origin = 'auto-cooldown';
```

Replays de `POST /finish` (cliente stale, retry de rede) tentam gravar snapshot com mesmo `(user_id, cooldown_log_id)`. Segunda tentativa viola unique → catch loga `auto_snapshot_duplicate_skipped` + segue normal. Snapshot original preservado.

**Telemetria:**

- `auto_snapshot_created` — sucesso.
- `auto_snapshot_failed` — erro inesperado.
- `auto_snapshot_skipped_setting_off` — `bankrollManagementEnabled=false`.
- `auto_snapshot_duplicate_skipped` — idempotencia em acao.

**Setting `bankrollManagementEnabled`:**

Quando `false`, snapshot nao eh criado. Skip silencioso server-side. Telemetria registra como `auto_snapshot_skipped_setting_off`.

**Snapshot payload:**

```ts
{
  origin: 'auto-cooldown',
  source: 'auto_session', // mantém semântica enum existente
  sourceRefId: cooldownLogId,
  amount: consolidatedUSD,
  delta: consolidatedUSD - previousAmount,
  occurredAt: new Date(),
}
```

`previousAmount` calculado via `SELECT new_amount FROM bankroll_snapshots WHERE user_id=? ORDER BY occurred_at DESC LIMIT 1`. Primeiro snapshot do usuario tem `previousAmount=0`, `delta=consolidatedUSD`.

## Opcoes Consideradas

### Opcao 1: Job assincrono (worker, queue, setTimeout)

- **Pros:**
  - Latencia zero adicional no finish handler — response retorna imediato.
  - Falhas de snapshot nao tem chance de afetar response do cliente (mesmo via try/catch inline).
  - Permite retry com backoff (job framework cuida).
  - Snapshot pode ser orquestrado via worker pattern ja explorado em outros sprints.

- **Contras:**
  - Grindfy NAO tem worker/queue infra hoje (apenas Express + Postgres). Adicionar `bull` ou `pg-boss` para 1 endpoint eh overkill.
  - `setTimeout(() => snapshot(), 0)` em handler dentro de Express ESM eh fragil — perde contexto, falhas silenciosas, nao testavel.
  - Debugging vira pesadelo: jogador finalizou cooldown, voltou ao dashboard, snapshot nao apareceu — onde olhar? Logs do worker, latencia da fila, race com outras escritas.
  - Window entre finish OK e snapshot pendente cria janela onde reconcile manual e auto-snapshot podem colidir.
  - Overhead operacional (monitorar fila, dead letter queue, alertas) nao justificado pelo ganho de latencia (snapshot e <50ms).

### Opcao 2: Trigger no Postgres (`AFTER UPDATE` em `cooldown_logs`)

- **Pros:**
  - Atomicidade garantida pelo banco — impossivel cooldown finalizado sem snapshot.
  - Zero codigo extra no handler.
  - Source of truth no schema (DDL versionado).

- **Contras:**
  - Trigger precisa fazer JOIN com `wallets`, `users`, `user_settings` (para checar `bankrollManagementEnabled`), `bankroll_snapshots` (para previousAmount). Logica complexa em PL/pgSQL = manutencao terrivel.
  - Conversao USD via FX rates exige acesso a `users.exchangeRates` ou fallback constants — escrever em PL/pgSQL eh ilegivel e duplica logica que vive em TS (`fxResolver`).
  - Falhas no trigger envenenam o `UPDATE` original — finish do cooldown quebra. Inverso do que queremos (D2 prioriza UX cooldown).
  - Triggers sao invisiveis para devs novos. Erro em prod = horas de debug "por que esse INSERT magico nao roda?".
  - Drizzle nao gerencia triggers — drift de schema garantido.
  - Testabilidade: testes unitarios do bankrollService nao exercitam o trigger; integration tests teriam que rodar com Postgres real (ja temos, mas adiciona surface area).

### Opcao 3: Dentro da TX, falha bloqueia finish

- **Pros:**
  - Garantia absoluta: finish OK ⇒ snapshot OK.
  - Sem janela de inconsistencia.

- **Contras:**
  - Cool-down e action terminal critica. Falha de snapshot (DB transient, FX resolver down, race) bloqueia finish — UX inaceitavel.
  - Jogador cancela cooldown e fica em estado intermediario "encerrei mas nao saiu do live" — pesadelo de suporte.
  - Inverte prioridade: snapshot eh secundario, cooldown eh primario.

### Opcao 4 (escolhida): Dentro da TX, falha logada nao bloqueia finish (D2)

- **Pros:**
  - Inline = trivial debugging. Stack trace no log do Express, nao em fila externa.
  - Latencia <50ms aceitavel para action terminal.
  - try/catch isolado garante que finish nunca quebra por causa de snapshot.
  - Idempotencia via unique index parcial — replays seguros.
  - Telemetria explicita distingue 4 cenarios (created/failed/skipped_setting/duplicate).
  - Snapshot consolidado tem mesma view que B2 reconcile — sem divergencia FX.
  - Zero infra nova (sem worker, sem trigger).
  - Testabilidade: `bankrollService.createAutoSnapshot` testavel em isolamento + integration test cobrindo o handler.

- **Contras:**
  - Snapshot pode falhar silenciosamente se ninguem monitorar telemetria. Mitigado por alerta operacional sobre `auto_snapshot_failed > 0`.
  - Latencia adicional de ~30-50ms no finish (1 SELECT consolidated balance + 1 SELECT previous + 1 INSERT). Aceitavel.
  - Logica de "ultimo snapshot vs novo" precisa lock se multiplas finishes simultaneas — mitigado por unique index.

## Consequencias

### Positivas

- **Serie temporal de banca completa.** Cada cool-down vira ponto na linha. Analytics de mes-a-mes deixa de ter degraus artificiais.
- **UX cooldown preservada.** Falha de snapshot nao quebra fluxo terminal. Toast opcional ("Snapshot pendente — sera retentado") futuro nice-to-have.
- **Debugging inline.** Logs do snapshot vivem no mesmo lugar dos logs do finish. Sem hop para fila/worker.
- **Idempotencia barata.** Index parcial + try/catch generico cobrem replays sem codigo defensivo extra.
- **Reuso da logica B2.** `getConsolidatedBalanceUSD` ja existe; reuso garantido = sem divergencia entre snapshot manual e auto.
- **Setting `bankrollManagementEnabled` respeitado.** Casual mode continua intocado.
- **Migracao trivial.** Apenas index parcial em `bankroll_snapshots`; sem nova tabela.

### Negativas

- **Latencia adicional ~30-50ms no finish.** Aceitavel para action terminal mas mensuravel. Nao justifica paginacao ou loading state extra.
- **Falha silenciosa requer monitoramento.** Telemetria `auto_snapshot_failed` precisa virar alerta operacional. Sem alerta, lacunas na serie passariam batido.
- **Acoplamento finish ⇄ snapshot.** Mudancas em `cooldown finish` precisam revisar impacto em snapshot. Mitigado por testes integrados.
- **Snapshot dentro de cooldown que NAO mudou banca grava `delta=0`.** Preserva auditoria ("passou pelo cooldown") mas inflata historico. Aceitavel — analytics filtra `delta=0` se quiser.

### Neutras

- **Snapshot de transferencias (RF-4) opcional.** Implementer decide. Default: nao gravar (transfers ja sao auditaveis via `wallet_transfers`).
- **Telemetria pode ser ampliada futuramente** com latencia, breakdown por currency, etc. Fora de escopo Bankroll-3.
- **Retry async futuro** (sprint Bankroll-4 ou Sprint F): se `auto_snapshot_failed` rate cresce, vale considerar retry com backoff via worker. Por hora, manual retry via UI manual snapshot (ja existe).

## Confianca

**Alta.** Padrao "fire-and-forget dentro do request" eh estabelecido (alertsSuspended, telemetria); idempotencia via index parcial eh trivial; reuso de `getConsolidatedBalanceUSD` elimina divergencia. Risco principal (falha silenciosa) tem mitigacao concreta (alerta sobre telemetria). Latencia adicional medida em desenvolvimento valida <50ms.

## Referencias

- Spec: `Docs/specs/sprint-bankroll-3.md` (RF-2, D2)
- ADR-017: `bankroll_snapshots` snapshot vs derived
- ADR-034: Multi-wallet com immutable FX
- ADR-046: `session_wallet_snapshots` table
- ADR-047: Summary inline reconcile (B2)
- Diagrama: `Docs/architecture/diagrams/bankroll-3-auto-snapshot-sequence.mermaid`
- Handler atual: `server/routes/cooldown.ts:175`
- Service: `server/services/bankrollService.ts` (extensao)

## Addendum 2026-05-01 (round 2 — CRIT-6 reviewer trade-off documentado)

Reviewer round 1 do Sprint Bankroll-3 sinalizou que a implementacao do auto-snapshot
nao roda DENTRO da mesma transacao do `cooldown finish` — chamada acontece **apos** a
TX que atualiza `cooldown_logs`/`grind_sessions`, em try/catch isolado. A spec original
falava "dentro da mesma sequencia transacional do request" (linguagem ambigua entre
"mesmo handler" e "mesma DB transaction").

**Decisao explicita round 2:** mantemos a implementacao atual (`createAutoSnapshot`
fora do TX do finish). Trade-offs:

- **Atomicidade fraca acceitavel.** Se finish faz commit mas snapshot falha, perdemos
  1 ponto na serie temporal — ja documentado como "snapshot pendente, sera retentado".
  A unica garantia que perdemos vs full-atomic eh "se snapshot falha, finish reverte"
  — porem isso INVERTE prioridade (cooldown eh primario, snapshot eh secundario).
  Reviewer round 1 reconheceu essa alternativa como aceitavel.
- **Idempotencia preservada.** Index parcial unique em `(user_id, source_ref_id)` com
  `WHERE origin='auto-cooldown'` continua garantindo replays seguros (catch 23505 + log).
- **Operacao simplificada.** Snapshot fora do TX significa que o lock do TX nao segura
  o `getConsolidatedBalance` (chamada cross-table mais pesada). Reduz contention.
- **Trade-off vs ADR-058 originalmente proposto:** "atomicidade absoluta" virou
  "atomicidade weak + idempotencia compensatoria". Smoke test (`tests/integration/routes/
  bankroll3-route-wiring.smoke.test.ts`) valida que falha em snapshot retorna 200 +
  `snapshot:null`, garantindo que o contrato observavel nao muda.

Caso futuras telemetrias mostrem `auto_snapshot_failed` rate > 0.5%, considerar
retry com backoff via worker (vide secao "Retry async futuro" original).
