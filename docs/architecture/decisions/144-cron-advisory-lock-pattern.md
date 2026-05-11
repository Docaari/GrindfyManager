# ADR-144 — Cron single-instance guard via `pg_try_advisory_lock`

**Status:** Accepted (2026-05-11)
**Context:** Fase 3 Wave D (escalabilidade). Audit Agent B 2026-05-11.

## Context

Crons in-process (node-cron + setInterval) ja existem: FX rates, news refresh, weekly study plan, drill materialize, spot purge, study freezes, coach cleanup/B-snapshot/B-study/weekly-rec, suprema autosync, library cleanup, refresh-token cleanup. Hoje todos rodam em todos os replicas porque cada processo Node tem seu agendador.

Em deploy single-replica (estado atual local + launch) eh inofensivo. Em multi-replica (Fase 4+):

- **BCB PTAX rate-limit** (FX) — 429 batendo N×
- **Anthropic / xAI cost** — chamada Claude/Grok N× por tick (news, study plan, B-snapshot, B-study, coach recommendations)
- **Caps diarios racy** — drill materialize tem cap de 5 spots/dia/user; cada replica le contagem antes do insert sem isolation = overshoot
- **Suprema scraping** — fala com pagina publica externa; N× = potencial anti-bot
- **Idempotent waste** — spot purge, library cleanup, refresh-token cleanup, study-freezes reset sao idempotentes mas escaneiam tabelas grandes; N× = waste

## Decision

Adotar **PostgreSQL advisory locks** via `pg_try_advisory_lock(bigint)` como single-instance guard pra todo tick de cron. Implementado em `server/lib/advisoryLock.ts`.

Padrao de uso:

```ts
cron.schedule(EXPR, () => {
  withAdvisoryLock("cron:fx-rates", runFxRatesRefresh).catch((err) =>
    console.error("[fx/cron] erro top-level", err),
  );
});
```

Mecanica:
1. Hash 32-bit estavel do nome → key inteiro
2. `pg_try_advisory_lock(key)` retorna `true` se conseguiu, `false` se outro processo segura
3. Se `false` → log info + skip (proximo tick tenta de novo)
4. Se `true` → roda `fn`, depois `pg_advisory_unlock(key)` (mesmo se fn throw)
5. `client.release()` sempre — pool nao vaza

## Por que advisory lock e nao Redis / SETNX / outro

- **Sem dep nova.** Postgres ja eh dep core. Redis adicionaria infra-cost + complexity sem ganho proporcional (~10 crons globais, nao milhares).
- **Sem latencia extra.** Locks resolvem na mesma conexao pg que o cron ja vai usar pra trabalhar.
- **Lock libera com a sessao.** Se o processo crashar mid-tick, PG libera o lock automaticamente quando a conexao fecha — sem zombie locks. (Redis SETNX precisa TTL artificial.)
- **Cross-replica trivial.** Mesma chave + mesmo PG = mutex distribuido nativo. PgBouncer transaction-pooling NAO afeta (advisory locks no PG sao session-scoped — usamos session pooling implicito via `pool.connect` + release dentro do mesmo tick).
- **node-cron `withLock` builtin existe** mas eh in-process apenas. Nao funciona multi-replica.

## Alternativas consideradas

| Opcao | Pros | Cons | Decisao |
|---|---|---|---|
| **PG advisory lock** | Sem dep nova, sem zombie, latencia zero | Atrelado ao pg pool | ✅ Aceita |
| Redis SETNX + TTL | Comum em SaaS | Dep nova + TTL artificial pra crash recovery | Rejeitada |
| Etcd / Zookeeper | Robusto | Infra-cost absurdo pra 10 crons | Rejeitada |
| Eleicao via env (`CRON_LEADER=true` em 1 replica) | Trivial | Falha se leader cair; manual | Rejeitada |
| node-cron `singletonMode` | In-process | Nao cobre multi-replica | Rejeitada |

## Trade-offs e detalhes

### Hash 32-bit
`pg_try_advisory_lock` aceita `bigint` mas usamos `int32` (32-bit hash do nome). Collision space 2^32; com ~15 crons no projeto, probabilidade de collision eh negligenciavel (~1e-9). Documentado em `hashLockKey`.

### Test fallback (lesson #34)
Se `pool` nao estiver inicializado (test que NAO mocka `../db`), `withAdvisoryLock` faz fallback e roda `fn` direto — preserva back-compat dos testes existentes. Producao sempre tem pool, fallback nunca dispara la.

### Connection failure
Se `pool.connect` falhar (ex: Neon cold-stall), `withAdvisoryLock` retorna sem rodar `fn` — mais seguro que rodar sem guard. Cron tickara de novo no proximo schedule.

### Unlock failure
`pg_advisory_unlock` em finally; se falhar (ex: conn dropou), log error + `client.release` ainda eh chamado. Lock fica orfao ate PG detectar session-end + timeout (default ~minutos), depois libera automaticamente.

### Naming convention
Prefixo `cron:` em todos os nomes (`cron:fx-rates`, `cron:news`, `cron:coach-cleanup`, ...). Helper aplica prefixo extra `grindfy:` internamente pra evitar collision com outros sistemas eventualmente compartilhando o mesmo PG.

### Performance
`pg_try_advisory_lock` eh O(1) em-memoria do PG. Custo: 1 round-trip extra por tick. Ticks de 1min (coach cleanup) custam +60 RTTs/min = trivial.

## Migration path

- **Hoje (single-replica local):** lock sempre `got=true`, comportamento identico ao pre-Wave-D.
- **Multi-replica (Fase 4):** 1 replica vence o lock, outras skipam. Logs `[advisoryLock] skipped — held elsewhere` confirmam.
- **Rollback:** remover wrap `withAdvisoryLock(...)` deixa a logica original intacta. Reversivel sem schema change.

## Tests

`tests/unit/lib/advisoryLock.test.ts`:
- hashLockKey deterministico + range int32
- fn roda quando got=true + unlock + release chamados
- fn skipa quando got=false + release chamado
- unlock chamado mesmo se fn throw + propaga erro
- unlock failure nao explode
- pool ausente -> fallback roda fn
- pool ausente + opt-out -> nao roda fn
- pool.connect falha -> skip silencioso

10 testes passando.

## Crons cobertos (Wave D)

| Cron | Site | Lock name |
|---|---|---|
| FX rates refresh | `server/jobs/refreshFxRates.ts` | `cron:fx-rates` |
| News orchestrator | `server/jobs/refreshNews.ts` | `cron:news` |
| Weekly study plan | `server/jobs/generateWeeklyStudyPlan.ts` | `cron:weekly-study-plan` |
| Drill materialize | `server/jobs/materializeDrillDifficultSpots.ts` | `cron:drill-materialize` |
| Spot purge | `server/jobs/purgeSpotScreenshots.ts` | `cron:spot-purge` |
| Study freezes reset | `server/jobs/resetStudyFreezes.ts` | `cron:reset-study-freezes` |
| Coach cleanup (1min) | `server/coach/cronRunner.ts` | `cron:coach-cleanup` |
| Coach B-snapshot | `server/coach/cronRunner.ts` | `cron:coach-b-snapshot` |
| Coach B-study | `server/coach/cronRunner.ts` | `cron:coach-b-study` |
| Coach weekly rec | `server/coach/cronRunner.ts` | `cron:coach-weekly-rec` |
| Suprema autosync (hourly) | `server/supremaAutoSync.ts` | `cron:suprema-autosync` |
| Library cleanup (hourly) | `server/libraryCleanup.ts` | `cron:library-cleanup` |
| Refresh-token cleanup (6h) | `server/index.ts` | `cron:refresh-token-cleanup` |

13 sites cobertos.

## Consequencias

- Multi-replica seguro pra todo cron in-process. Fase 4 deploy pode escalar replicas sem racy crons.
- Test fallback preserva 8495 testes pasando baseline.
- ADR documentado; futuros crons devem seguir o pattern.
- Sem dep nova; sem schema change; reversivel.

## Referencias

- Postgres docs: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
- Lesson #34 (handler 3o arg testavel) — pattern dual injection
- CLAUDE.md §9 (lessons learned)
- Audit Agent B 2026-05-11 — P0 cron single-instance guard
