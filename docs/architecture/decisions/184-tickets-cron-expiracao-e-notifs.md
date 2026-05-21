# ADR-184: Tickets cron expiracao + notifs in-app (`server/jobs/expireTickets.ts` housekeeping diario sem gate `COACH_NUDGES_ENABLED`; UPDATE `tickets SET status='expired'` idempotente + INSERT `notifications` `ticket_expiring` (<=48h) e `ticket_expired` com dedupe 7d por `(user_id, ticket_id, type)`; reuso `cronRunner` + tabelas existentes; zero migration)

## Status
Aceito

## Data
2026-05-21

## Sprint
D — Grind Live + Tickets cluster (`Docs/specs/sprint-grind-live-cluster.md`, RF-03.1 + RF-03.2)

## Decision owner
system-architect (auto-mode defaults Q-A: cron SEM gate `COACH_NUDGES_ENABLED`; dedupe janela 7d; re-fire mantem `triggerAt` original).

## Related
- Depende de: ADR-037 (`tickets` table + service Sprint Tickets-1), ADR-085 (`shouldSendNudge` 8 checks — NAO consultado aqui pq notifs in-app sao housekeeping, nao nudge proativo), ADR-087 (timezone-aware job runner — NAO aplica, cron eh UTC fixo 03:00), ADR-144 (`withAdvisoryLock` para evitar duplo-run em replicas), ADR-156/157 (pattern hourly tick + helpers `LIST_USERS_FOR_CRON_*`), ADR-167 (3 nudges AI-2A — gate por `COACH_NUDGES_ENABLED`, contrastar).
- Reusa: `tickets` table (`status`, `expires_at`), `notifications` table (varchar `type` livre, `deep_link`), `server/coach/cronRunner.ts` (`startCoachCrons` + `withAdvisoryLock`), `server/services/ticketService` (helpers existentes), `user_activity` (telemetria RF-03.5).
- Sucessor de: nada — primeiro cron de housekeeping de tickets pos Tickets-1/2.
- Diagramas: `Docs/architecture/diagrams/sprint-grind-live-cluster/tickets-cron-flow.mermaid`.

---

## 1. Contexto

Spec D RF-03 audit revelou Tickets-1 (foundation) + Tickets-2 (consumption) shipped; **Tickets-3 inteiro missing**. Gaps RF-03.1 + RF-03.2 deste ADR:

- **RF-03.1 cron expiracao:** hoje tickets com `expires_at < NOW()` continuam `status='available'` indefinidamente. Selector boost (ADR-183) + Coach context (ADR-182) + KPI inventario contam ticket "vivo" mesmo expirado. Bug invisivel: jogador "tem" ticket que nao pode usar.
- **RF-03.2 notifs:** zero feedback in-app quando ticket expira ou esta proximo. User abandona qualifier ganho ha 6 meses sem perceber.

Foundation existente:
- `tickets` table com `status ∈ {'available','used','expired','cancelled'}` + `expires_at TIMESTAMP NULLABLE`.
- `notifications` table aceita varchar `type` livre (sem enum) + `deep_link` + `priority ∈ {'low','medium','high'}`.
- `cronRunner` carrega `node-cron` + `withAdvisoryLock` (ADR-144).

Pergunta central: **(a)** schedule + frequency; **(b)** gate por kill switch; **(c)** dedupe de notifs entre runs; **(d)** idempotencia em re-run; **(e)** atomicidade UPDATE/INSERT.

### Restricoes

- **Lesson #9 (log antes de fallback):** cada batch envolvido em try/catch granular. Erro em 1 ticket nao trava os outros — `for ticket of expired` com try interno + `console.error` + skip.
- **Lesson #10 (DRY):** reuso `withAdvisoryLock` ja registrado em `cronRunner.ts`. NAO duplicar pattern de lock.
- **Lesson #36 (storage modules + lazy schema):** se teste mockar `drizzle-orm` parcial, modulo do job NAO importa `@shared/schema` no topo — usa lazy `await import` dentro da funcao.
- **ADR-152 NAO aplica:** spec Q-A locked — expiracao eh housekeeping de dados (estado do ticket), nao proatividade do Coach. `COACH_NUDGES_ENABLED=false` NAO desliga este cron.
- **ADR-085 NAO aplica para notifs deste ADR:** notifs in-app de ticket_expiring/expired sao **eventos de estado** (semantica `notifications` table), nao nudges. `shouldSendNudge` (frequency cap, quiet hours, snooze) bypassa. Dedupe proprio (§2.3) cobre frequency cap dedicado.
- **ADR-144 (`withAdvisoryLock`):** obrigatorio — replicas multiplas em prod nao podem rodar UPDATE+INSERT em paralelo (race condition cria 2 notifs do mesmo ticket).

---

## 2. Decisoes

### 2.1 Schedule + registro no `cronRunner`

**Cron expression:** `0 3 * * *` (03:00 UTC diario).

**Justificativa:** housekeeping de baixa frequencia; horario nordteamericano/europeu de menor trafego. Granularidade diaria suficiente porque `notifications` ticket_expiring usa janela 48h — diferenca de algumas horas no momento de criacao eh imperceptivel.

**Registro em `server/coach/cronRunner.ts`:**

```ts
import { expireTicketsTick } from "../jobs/expireTickets";

// dentro de startCoachCrons(), apos os ticks de cleanup (sempre registrado, antes do early-return do kill switch):
cron.schedule("0 3 * * *", async () => {
  try {
    await withAdvisoryLock("cron:expire-tickets", () => expireTicketsTick({}));
  } catch (err) {
    console.error("coach.cron.expire_tickets.tick.error", { err });
  }
});
```

**Posicao no arquivo:** ANTES do `if (process.env.COACH_NUDGES_ENABLED === "false") { return }` — fica fora do kill switch (Q-A locked).

**Lock key:** `cron:expire-tickets` (namespace dedicado).

### 2.2 Pipeline interno do tick

`server/jobs/expireTickets.ts` exporta `expireTicketsTick(opts: { now?: Date }): Promise<TickResult>`.

```
expireTicketsTick(opts)
  now = opts.now ?? new Date()
  result = { expired: 0, notif_expiring: 0, notif_expired: 0, errors: 0 }

  // FASE 1 — SELECT tickets que viraram expired NESTE run
  expiringSoon  = SELECT id, user_id, source_name, value_usd, expires_at
                  FROM tickets
                  WHERE status='available'
                    AND expires_at IS NOT NULL
                    AND expires_at <= now + 48h
                    AND expires_at >  now            -- ainda nao expirou, so esta perto
  justExpired   = SELECT id, user_id, source_name, value_usd, expires_at
                  FROM tickets
                  WHERE status='available'
                    AND expires_at IS NOT NULL
                    AND expires_at <= now           -- ja expirou

  // FASE 2 — UPDATE batch idempotente
  UPDATE tickets
     SET status='expired', updated_at=now
   WHERE id IN (justExpired.ids)
     AND status='available'                          -- guard race
  result.expired = updateCount

  // FASE 3 — INSERT notifs ticket_expiring (com dedupe 7d)
  for ticket of expiringSoon:
    try {
      if (await hasRecentNotif(ticket.user_id, ticket.id, 'ticket_expiring', 7d)) continue
      INSERT notifications(user_id, type='ticket_expiring', priority='medium', ...)
      result.notif_expiring++
    } catch (err) {
      result.errors++
      console.error("expire_tickets.notif_expiring.error", { ticket_id: ticket.id, err })
    }

  // FASE 4 — INSERT notifs ticket_expired (com dedupe 7d)
  for ticket of justExpired:
    try {
      if (await hasRecentNotif(ticket.user_id, ticket.id, 'ticket_expired', 7d)) continue
      INSERT notifications(user_id, type='ticket_expired', priority='medium', ...)
      INSERT user_activity(user_id, event_type='ticket_expired', payload={ticket_id, value_usd, source_name})  // RF-03.5
      result.notif_expired++
    } catch (err) {
      result.errors++
      console.error("expire_tickets.notif_expired.error", { ticket_id: ticket.id, err })
    }

  console.info("coach.cron.expire_tickets.done", result)
  return result
```

**Atomicidade:** UPDATE batch + INSERT batch em transacoes separadas. Crash entre fases 2 e 3 deixa ticket expirado mas sem notif criada. Run do dia seguinte:
- ticket ja `expired` -> nao entra em `justExpired` (filtro `status='available'`)
- notif `ticket_expired` NAO sera criada no dia seguinte. **Trade-off aceito:** raro (replicas + advisory lock + crash exato entre UPDATE e INSERT). Alternativa "INSERT primeiro, UPDATE depois" tem race pior (notif duplicada se crash entre INSERT e UPDATE; user ve 2x "expirou").

### 2.3 Dedupe de notifs (janela 7d)

`hasRecentNotif(userId, ticketId, type, windowDays)` query:

```sql
SELECT 1 FROM notifications
 WHERE user_id   = $1
   AND type      = $3
   AND deep_link LIKE '%ticket_id=' || $2 || '%'   -- ou JSONB payload se schema permite
   AND created_at > now() - ($4::text || ' days')::interval
 LIMIT 1
```

**Justificativa 7d:** balance entre "nao spammar user" (1 vez por semana eh aceitavel) e "garantir entrega se primeira notif nao foi vista". Spec aprovou inline.

**Ticket id no payload:** preferencia `notifications.payload JSONB` se ja existe coluna; senao codificar no `deep_link` `/grade-planner#tickets&ticket_id=XXX`. **Decisao:** usar `deep_link` com query param (zero migration). Helper de matching faz LIKE — index `notifications_user_type_created_idx` (existente) cobre WHERE.

### 2.4 Payload das notifs

**ticket_expiring (<=48h):**
```json
{
  "type": "ticket_expiring",
  "priority": "medium",
  "title": "Ticket expirando em breve",
  "body": "Seu ticket para {source_name} (~${value_usd}) expira em {N}h. Use ou cancele antes.",
  "deep_link": "/grade-planner#tickets&ticket_id={id}"
}
```

**ticket_expired:**
```json
{
  "type": "ticket_expired",
  "priority": "medium",
  "title": "Ticket expirou",
  "body": "Seu ticket para {source_name} (~${value_usd}) expirou em {date}.",
  "deep_link": "/grade-planner#tickets&ticket_id={id}"
}
```

Priority `medium` (Q-A aceito): ticket nao eh critico (sem perda de wallet), mas afeta planning.

### 2.5 Telemetria (atende RF-03.5 parcial)

Sweep RF-03.5 vai cobrir os outros 6 eventos em sprint paralelo (test-writer/implementer). Este ADR cobre **apenas** `ticket_expired` evento (registrado em fase 4 acima). NAO criar `ticket_expiring_notif_sent` — redundante com `notifications` table.

### 2.6 Idempotencia em re-run manual

Founder pode disparar `expireTicketsTick({})` manualmente (debug). 2 runs consecutivos no mesmo dia:
- Fase 2 UPDATE: 2o run nao acha `status='available' AND expires_at <= now` (ja virou expired) -> `result.expired = 0`.
- Fase 3 + 4 INSERT: dedupe 7d skipa -> `result.notif_* = 0`.

Resultado: 2o run = no-op. **Confirmado idempotente.**

### 2.7 Race condition cron x usuario clicando "pagar com ticket"

Cenario:
- Cron seleciona ticket X (`status='available'`, `expires_at = now`).
- User clica "pagar com ticket X" simultaneamente -> service tenta UPDATE para `status='used'`.

**Mitigacao:** UPDATE da fase 2 inclui `AND status='available'` no WHERE. Quem chega primeiro vence. Se user vence:
- Fase 2 UPDATE: skipa (status ja eh `used`)
- Fase 4 INSERT: cria notif `ticket_expired` para ticket que foi usado. **Bug.**

**Fix:** filtrar `justExpired` pre-fase 4 com SELECT re-confirmacao:
```
expiredConfirmed = SELECT id FROM tickets WHERE id IN (justExpired.ids) AND status='expired'
```
e iterar so esses. Pequeno overhead (~1 query) eh aceitavel — protege contra race rara.

---

## 3. Consequencias

### Positivas
- Tickets nunca ficam "zombie" — selector boost (ADR-186) + Coach context (ADR-185) sempre veem dados frescos.
- User recebe alerta antes da expiracao (medium severity, dedupe 7d).
- Housekeeping desacoplado do kill switch — funciona mesmo com `COACH_NUDGES_ENABLED=false` (founder pediu Q-A locked).
- Zero migration, zero novo endpoint HTTP.
- Idempotente — re-run seguro.

### Negativas
- Granularidade diaria pode atrasar notif ticket_expiring em ate ~24h (se ticket fica em janela 48h durante o dia, notif so amanha 03:00 UTC). Aceitavel pq 48h eh threshold generoso.
- Crash entre UPDATE e INSERT pode "perder" notif ticket_expired do dia (Run subsequente nao recria pq filter `status='available'`). Raro. Sem dual-write.
- Dedupe via `deep_link LIKE` eh fragil — se schema futuro mudar formato do deep link, dedupe quebra silenciosamente. Mitigacao futura: coluna `payload JSONB` (deferred).

### Neutras
- Lock key `cron:expire-tickets` novo — sem conflito com lock keys existentes (`cron:coach-cleanup`, `cron:coach-b-snapshot`, etc).
- Padronizacao `notifications.type='ticket_*'` cria namespace novo (livre, varchar).

---

## 4. Alternativas consideradas

### A1: Cron hourly em vez de diario
Mesmo tick rodando 24x/dia. Reduziria atraso de notif ticket_expiring para ~1h. **Descartado:** overhead 24x para feature sem urgencia + ticker_expiring 48h ja eh generoso. Run diario simples e suficiente.

### A2: Trigger PostgreSQL `BEFORE INSERT/UPDATE ON tickets`
Trigger atualiza status automaticamente em qualquer SELECT. **Descartado:** triggers em PG sao "magicas" — invisivel pra dev/test, dificil de debugar, lesson #5 (logue antes de fallback) violada.

### A3: Lazy expiration em runtime (no SELECT do selector/coach)
Filter `WHERE expires_at > NOW()` em vez de `status='expired'`. **Descartado:** notifs nao acontecem (sem trigger event). User nunca eh avisado. Tambem complica queries — todo consumer precisa lembrar do filtro.

### A4: Gate cron por `COACH_NUDGES_ENABLED`
Founder Q-A locked: NAO. Aceito.

### A5: Dedupe sem janela (1 notif unica por ticket+type forever)
Mais simples. **Descartado:** se primeira notif foi vista mas o user nao agiu, 1 lembrete em 7d eh util.

---

## 5. Validacao

**Como verificar pos-deploy:**
1. Inserir ticket teste com `expires_at = NOW() - 1h`. Rodar tick manualmente. Esperado: `result.expired = 1`, ticket vira `status='expired'`, 1 notif `ticket_expired` criada.
2. Re-rodar tick. Esperado: `result.expired = 0`, `result.notif_expired = 0` (dedupe).
3. Inserir ticket com `expires_at = NOW() + 24h`. Rodar tick. Esperado: 0 expired, 1 notif `ticket_expiring`.
4. Re-rodar tick mesmo dia. Esperado: 0 notifs (dedupe).
5. Avancar relogio 8 dias, re-rodar. Esperado: 1 notif `ticket_expiring` NOVA (dedupe expirou).

**Como nao quebrar em prod:**
- Adicionar `tests/integration/tickets-cron.test.ts` cobrindo cenarios 1-5 + race (2 ticks simultaneos).
- Monitorar `coach.cron.expire_tickets.done` log p/ counts plausiveis.

## 6. Confianca
**Alta.** Pattern bem testado (5 nudges AI-2A + 2 jobs AI-1B). Foundation completa. Zero novidade arquitetural.
