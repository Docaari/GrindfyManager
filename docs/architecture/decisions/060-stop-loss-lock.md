# ADR-060: Stop-loss/stop-win em USD consolidado, lock via `stop_lock_until` em `user_settings`

## Status
Proposto

## Data
2026-05-01

## Contexto

Bankroll Management 101: jogador profissional define **stop-loss diario** (limite de perda apos o qual para de jogar) e opcionalmente **stop-win** (limite de ganho apos o qual encerra dia). Disciplina via mecanismo externo (UI) eh recomendada — confiar em forca de vontade pos-tilt eh pessimo.

Grindfy hoje nao tem essa funcionalidade. Founder reportou que jogadores B (semi-profissionais) tipicamente perdem mais quando nao tem stop-loss. A spec `Docs/specs/sprint-bankroll-3.md` RF-6 introduz stops:

- `stopLossUsd` (number > 0 ou null) — limite de perda diaria em USD consolidado.
- `stopWinUsd` (number > 0 ou null) — meta de ganho diaria em USD consolidado.
- `stopLockDurationHours` (1-72, default 12) — quanto tempo o lock dura apos trigger.

A questao arquitetural eh **como modelar e enforcar** o lock:

1. **Coluna `stop_lock_until` em `user_settings` + middleware no `POST /api/grind-sessions`** (escolha proposta).
2. **Tabela dedicada `stop_lock_events`** (audit trail + lock atual derivado).
3. **Calcular delta on-the-fly em cada request** (sem coluna persistida, sem middleware).
4. **Coluna em `wallets`** (lock por wallet, nao por user).

E tambem a questao de **moeda**:

- USD consolidado (D3 — escolha) ou
- Por wallet (BRL, EUR separados) ou
- Currency principal do user.

E **reset diario:**

- 00:00 user TZ (D3 — escolha) ou
- 00:00 UTC ou
- Rolling 24h ou
- Calendar day baseado em primeiro session do dia.

E **stop-win bloqueia ou nao:**

- D3: stop-win NAO bloqueia (banner "Continuar mesmo assim").
- Alternativa: stop-win bloqueia tambem.

### Pre-requisitos satisfeitos

- `user_settings` ja existe (1:1 com users) e ja tem `bankroll_management_enabled` (B2).
- `users.timezone` existe (varchar opcional, fallback UTC).
- `grind_sessions.status` enum tem `completed`.
- `session_tournaments` tem `total_invested`, `payouts`, currency derivada via site.
- `fxResolver` (ADR-061) consolida USD via cascata.

### Forcas em jogo

- **UX:** stops devem ser efetivos (bloqueio real, nao apenas warning textual) mas nao paternalistas. D3 escolheu stop-win nao bloqueante porque ganhar muito numa noite nao eh problema; perder muito eh.
- **Currency:** jogador multi-wallet (BR + GG USD + Suprema BRL) precisa de visao consolidada — stop em "BRL ou USD?" sempre confunde. USD eh ground truth da banca.
- **Reset:** poker se joga a noite. 00:00 UTC reset bagunca jogador BR (UTC-3) que ainda esta jogando "no mesmo dia". Reset por TZ do user resolve.
- **Manual override:** founder pode querer "apenas hoje liberar" (eg. proxima ediçao de torneio especial). Endpoint admin opcional cobre.
- **Performance:** middleware em cada `POST /api/grind-sessions` adiciona latencia. Aceitavel se for 1 SELECT cheap.

## Decisao

**Adotar opcao D3: coluna `stop_lock_until` (TIMESTAMP) em `user_settings`, middleware via `stopService.assertNotStopLocked(userId)` no `POST /api/grind-sessions` (retorna 423 Locked se ainda dentro do lock), reavaliacao apos `PUT /api/grind-sessions/:id` com status=completed. USD consolidado eh fonte de verdade. Reset 00:00 user TZ (UTC fallback). Stop-win nao bloqueia (D3) — emite telemetria + banner cliente sugerindo encerrar dia. Stop-loss bloqueia 12h default (configuravel via `stop_lock_duration_hours`, range 1-72).**

### Detalhes do contrato

**Schema (`migrations/0018_auto_snapshot_meta.sql`, secao stops):**

```sql
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS stop_loss_usd DECIMAL,
  ADD COLUMN IF NOT EXISTS stop_win_usd DECIMAL,
  ADD COLUMN IF NOT EXISTS stop_lock_until TIMESTAMP,
  ADD COLUMN IF NOT EXISTS stop_lock_duration_hours INTEGER NOT NULL DEFAULT 12;
```

Drizzle (`shared/schema.ts`):

```ts
stopLossUsd: decimal("stop_loss_usd"),
stopWinUsd: decimal("stop_win_usd"),
stopLockUntil: timestamp("stop_lock_until"),
stopLockDurationHours: integer("stop_lock_duration_hours").notNull().default(12),
```

**Service (`server/services/stopService.ts`):**

```ts
export async function assertNotStopLocked(userId: string): Promise<void> {
  const settings = await storage.getUserSettings(userId);
  if (!settings.bankrollManagementEnabled) return; // D3 respeita flag
  if (!settings.stopLockUntil) return;
  if (new Date(settings.stopLockUntil) <= new Date()) return;
  throw new StopLockedError({
    lockedUntil: settings.stopLockUntil,
    reason: 'stop_loss',
    remainingMs: new Date(settings.stopLockUntil).getTime() - Date.now(),
  });
}

export async function evaluateStops(userId: string): Promise<StopResult> {
  const settings = await storage.getUserSettings(userId);
  if (!settings.bankrollManagementEnabled) return { stopReached: null };
  if (!settings.stopLossUsd && !settings.stopWinUsd) return { stopReached: null };

  const tz = settings.timezone ?? 'UTC';
  const dayStart = startOfDayInTz(new Date(), tz);
  const deltaUsd = await aggregateSessionDeltaUsd(userId, dayStart);

  if (settings.stopLossUsd && deltaUsd <= -parseFloat(settings.stopLossUsd)) {
    const lockedUntil = new Date(Date.now() + settings.stopLockDurationHours * 3600_000);
    await storage.updateUserSettings(userId, { stopLockUntil: lockedUntil });
    telemetry('stop_loss_triggered', { userId, deltaUsd, lockedUntil });
    return { stopReached: 'loss', lockedUntil, deltaUsd };
  }

  if (settings.stopWinUsd && deltaUsd >= parseFloat(settings.stopWinUsd)) {
    telemetry('stop_win_reached', { userId, deltaUsd }); // D3 nao bloqueia
    return { stopReached: 'win', deltaUsd };
  }

  return { stopReached: null, deltaUsd };
}
```

**Middleware no `POST /api/grind-sessions`:**

```ts
try {
  await stopService.assertNotStopLocked(userId);
} catch (err) {
  if (err instanceof StopLockedError) {
    return res.status(423).json({
      code: 'STOP_LOCKED',
      message: 'Sessao bloqueada por stop-loss diario.',
      lockedUntil: err.lockedUntil,
      reason: err.reason,
      remainingMs: err.remainingMs,
    });
  }
  throw err;
}
```

**Trigger reavaliacao no `PUT /api/grind-sessions/:id` (status=completed):**

Apos a logica existente de update, chama `stopService.evaluateStops(userId)` e anexa resultado ao response (`{...existing, stopResult}`).

**Endpoints novos:**

- `GET /api/user-settings/stops` → `{stopLossUsd, stopWinUsd, stopLockUntil, currentDayDeltaUsd, stopLockDurationHours}`. Calcula `currentDayDeltaUsd` on-the-fly via `aggregateSessionDeltaUsd`.
- `PUT /api/user-settings/stops` → atualiza valores. Validacao Zod (positivos, range duration).
- `POST /api/user-settings/stops/release` → admin/debug: limpa `stop_lock_until`. Disponivel apenas se config flag (default OFF).

**Conversao USD:**

`aggregateSessionDeltaUsd(userId, dayStart)` faz:

```sql
SELECT t.site, SUM(t.payouts - t.total_invested) AS native_delta
FROM grind_sessions gs
JOIN session_tournaments st ON st.session_id = gs.id
JOIN tournaments t ON t.id = st.tournament_id
WHERE gs.user_id = ?
  AND gs.status = 'completed'
  AND gs.completed_at >= ?
GROUP BY t.site
```

Depois converte cada `native_delta` para USD via `getCurrencyForSite(site)` + `fxResolver.resolveExchangeRates(userId)` (ADR-061). Soma final eh `deltaUsd`.

**Reset diario:**

`startOfDayInTz(now, tz)` calcula 00:00 do dia atual no TZ do user. `users.timezone` (se presente, ex. "America/Sao_Paulo") usado; senao UTC. Lock expira naturalmente quando `stop_lock_until <= NOW()`. Sem cron job — verificacao acontece no proximo `POST /grind-sessions`.

**Banner cliente:**

`/grind` e `/dashboard` consultam `GET /user-settings/stops`. Quando `stopLockUntil > NOW()`, banner read-only com countdown e botao "Liberar manualmente" (apenas se admin/debug flag).

Stop-win triggera toast + banner amber "Voce atingiu seu objetivo do dia (USD ${stopWinUsd}). Continuar?". Botao "Encerrar dia" sugere fechar live.

**Telemetria:**

- `stop_loss_triggered` — lock criado.
- `stop_win_reached` — meta atingida (sem lock).
- `stop_locked_session_blocked` — POST /grind-sessions retornou 423.
- `stop_lock_released_manual` — admin endpoint usado.

## Opcoes Consideradas

### Opcao A: Coluna `stop_lock_until` em `user_settings` + middleware (escolhida)

- **Pros:**
  - Schema minimo: 4 colunas em tabela existente. Sem nova tabela.
  - Lock atual eh leitura de 1 SELECT em request critico — performance OK.
  - Reuso de `user_settings` mantem 1:1 com users (consistente).
  - Avaliacao on-completed garante que cada sessao reavalia delta — sempre fresh.
  - Reset diario eh natural (lock expira; delta recalcula no proximo evaluate).
  - Endpoint admin opcional para release manual cobre edge cases (founder libera manualmente em ocasioes).

- **Contras:**
  - Audit trail de "quando bati stop?" precisa ser inferido de telemetria + snapshot de bankroll. Sem historico granular dos triggers.
  - Mudanca de `stopLockDurationHours` mid-day nao retroagre (lock atual mantem antiga duracao). Aceitavel.
  - Multiplas devices sincronizam via polling (GET /stops). Aceitavel — no real-time push.

### Opcao B: Tabela dedicada `stop_lock_events`

- **Pros:**
  - Audit trail completo: cada trigger vira row (`triggered_at, reason, delta_usd, locked_until, released_at, released_by`).
  - Permite analytics futuro ("quantas vezes bati stop esse mes?").
  - Manual release fica registrado.

- **Contras:**
  - Schema extra (1 tabela + indices) para feature MVP.
  - Lock atual exige `SELECT MAX(locked_until) WHERE released_at IS NULL` — query mais cara que coluna direta.
  - YAGNI para MVP. Audit trail pode ser adicionado em sprint futuro se demanda surgir.
  - Telemetria + snapshots ja capturam o essencial para analytics.

### Opcao C: Calcular delta on-the-fly em cada request (sem coluna persistida)

- **Pros:**
  - Schema zero novo.
  - Stateless: lock e calculado em runtime.

- **Contras:**
  - Cada `POST /grind-sessions` exige aggregate query pesada. Latencia inaceitavel.
  - Sem cache, sem `until` explicito — "stop por 12h" precisa derivar de "primeira vez que bati hoje" + 12h. Logica fragil.
  - Race conditions: 2 requests simultaneos podem ambos passar checagem antes de detectar lock.
  - Difference entre "ainda dentro do dia" e "ja expirou lock 12h" muda comportamento sem indicador claro.

### Opcao D: Coluna em `wallets` (lock por wallet)

- **Pros:**
  - Granularidade fina.
  - Jogador pode jogar em GG mesmo se locked em Suprema.

- **Contras:**
  - Stops devem refletir disciplina total do dia, nao por plataforma. Senao jogador burla trocando de site.
  - Multi-wallet ja eh complicado UX-wise; stop por wallet adiciona dimensao confusa.
  - Nao se alinha com objetivo de "parar de perder dinheiro hoje".

### Opcao E: Reset 00:00 UTC global (em vez de TZ user)

- **Pros:**
  - Trivial implementar.
  - Sem dependencia de `users.timezone`.

- **Contras:**
  - Jogador BR (UTC-3) joga ate 02:00 UTC = "tomorrow" — reset bagunca contagem.
  - Reset 00:00 UTC = 21:00 horario BR = exato no meio do prime time poker BR.
  - UX confuso ("perdi USD 350 mas o sistema diz que estou em zero hoje" porque virou UTC day).

### Opcao F: Stop-win bloqueia tambem

- **Pros:**
  - Disciplina simetrica. Encerra dia winning para evitar "playing the bag back".

- **Contras:**
  - Jogador tem freedom moral para continuar quando esta running well. Forcar parar pode bloquear deal de torneio em jogo.
  - Pesquisa de produto (founder): jogadores prefere "warning" no win, "block" no loss.
  - Stop-win bloqueia + late deep run em torneio = jogador nao pode comecar nova sessao para satellite ao mesmo tempo. UX pessimo.

## Consequencias

### Positivas

- **Disciplina enforcable.** 423 Locked impede criar nova sessao — nao depende de forca de vontade.
- **USD consolidado eh ground truth.** Multi-wallet jogador tem visao unica.
- **Reset por TZ user respeita realidade BR.** Jogador joga ate 02:00 BR e nao tem reset confuso no meio.
- **Configuravel via `stopLockDurationHours`.** Default 12h razoavel; range 1-72 cobre desde "stop curto pos-tilt" ate "lock 3 dias por decisao consciente".
- **Endpoint release manual disponivel via flag.** Founder pode debug/intervir sem hack DB.
- **Reuso `fxResolver` (ADR-061).** Conversao FX consistente em toda parte.
- **Banner cliente honesto.** Countdown, sem esconder o que ta bloqueando.
- **Stop-win nao bloqueia.** Banner sugere encerrar mas respeita autonomia.
- **Telemetria distingue 4 cenarios** para analytics futuro de comportamento.

### Negativas

- **Sem audit trail granular dos triggers.** Apenas telemetria + snapshots. Adicionar tabela `stop_lock_events` em sprint futuro se demanda.
- **Aggregate query no PUT completed adiciona ~50-100ms.** Cool-down nao eh action sub-50ms — aceitavel.
- **Multi-tab sync via polling.** Tab A poderia criar sessao antes de tab B receber update do lock. Mitigado por re-check no POST (cada request reverifica).
- **TZ string invalida** (jogador editou direto no DB) cai em UTC fallback. Pode confundir mas e edge raro.
- **Mudanca de `stopLossUsd` mid-day nao recalcula lock atual.** Aceitavel — proxima avaliacao usa novo valor.

### Neutras

- **Endpoint release manual default OFF.** Implementer ativa via env `ALLOW_STOP_LOCK_RELEASE=true` se necessario.
- **Stops respeitam `bankrollManagementEnabled`.** Jogador casual nao ve nada disso.
- **Lock manual via release nao zera `delta` acumulado.** Jogador continua dia com mesma contagem; proxima sessao completed pode re-trigger.
- **Sprint Bankroll-4 candidata** para adicionar stop por session count (ex: "max 5 sessions/dia"), stop por hours (ex: "max 6h jogando"), etc.

## Confianca

**Media-alta.** Padrao "lock_until + middleware" e estabelecido (rate limiting, auth tokens). FX consolidado via `fxResolver` reduz risco de bug currency. Edge cases TZ tem fallback robusto. Risco principal (stop-win nao bloqueante eh o ideal?) eh decisao de produto que pode ser revisitada via flag se feedback divergir.

## Referencias

- Spec: `Docs/specs/sprint-bankroll-3.md` (RF-6, D3)
- ADR-017: Bankroll snapshot vs derived
- ADR-033: FX rate convention (units per USD)
- ADR-061: `fxResolver` unificado (consolidacao USD)
- Diagrama: `Docs/architecture/diagrams/bankroll-3-stop-lock-state.mermaid`
- Service: `server/services/stopService.ts` (novo)
- Migration: `migrations/0018_auto_snapshot_meta.sql` (secao stops)
- Schema: `shared/schema.ts` (`userSettings` extension)
- Endpoint principal afetado: `server/routes/grind-sessions.ts`
