# ADR-137 — Cap diario 5 cards auto-criados por user (anti-overflow R5)

- Status: Aprovado
- Data: 2026-05-08
- Sprint: spot-anki-reentry-3 (RF-2 + R5 mitigation)
- Decision owner: system-architect
- Related: spec `Docs/specs/spot-anki-reentry-3.md` §RF-2.3 + §Riscos R2/R3, ADR-136 (`spot_reentry_cards` table), Research `Docs/strategy/2026-05-08-estudos-stats-analyzer-research.md` §7.5 R5

---

## 1. Contexto

Cron `materializeDrillDifficultSpotsCron` roda diariamente 06:00 UTC, lendo `study_sessions_v2.difficult_spots` dos ultimos 7 dias (cada session pode ter ate 5 difficult_spots) e criando cards SRS automaticamente.

Sem cap, edge case real:

- Pro player loga 8h drill GTO num sabado: 16 sessions × 5 difficult_spots = 80 spots possiveis.
- Cron processa todos: 80 cards criados na manha de domingo.
- Pagina `/estudos/reentry` abre com queue **insano**: 80 cards pendentes hoje.
- User sente sobrecarga (R5 da research, validado em comunidades Anki que reportam mesmo padrao).
- User abandona feature.

Coach AI bulk-add tambem pode contribuir: sessao com 50 spots `decision_correct=false` → bulk-add → 50 cards. Cap separado em RF-2 (`bulk request max 20 spotIds`) ja mitiga.

Manual `POST /api/spots/:id/reentry` (1-spot-at-a-time) **nao tem cap** — usuario ja paga custo de UX explicito por click.

### Opcoes consideradas

#### Opcao 1: Cap 5/user/dia (ESCOLHIDO)

Cron cap 5 cards source='drill_gto_difficult_spot' por user/dia.

- **Pros:** matcha pesquisa Anki (5 cards/dia novos = sweet spot retention vs sobrecarga em communidades). Diaria e barata de queryar (`COUNT WHERE created_at >= today_start`).
- **Contras:** spots "sobrando" so entram em dias seguintes ou nunca (se cron janela 7d expirar antes). Mitigavel: priorizar mais recente em ordering + log warning.

#### Opcao 2: Cap N por session (ex: 2/session)

Cap por study_session_v2 origem.

- **Pros:** distribui melhor entre sessions.
- **Contras:** pro player com 1 session de 8h ainda fica capped em 2 — perde sinal valioso. Pior que opcao 1.

#### Opcao 3: Sem cap automatico, fila com aging

Cron cria todos. Queue endpoint prioriza por `created_at DESC` + cap visualizacao no `/reentry` (ex: max 5 visiveis).

- **Pros:** zero perda de sinal (todos cards criados).
- **Contras:** tabela infla. UX ainda estressa quando ve "73 pendentes". Backlog psicologicamente desmotivador (pesquisa Anki).

#### Opcao 4: Cap configuravel por user (`max_cards_per_day` setting)

Setting em `users.home_layout_settings`.

- **Pros:** flexivel.
- **Contras:** premature optimization MVP. Defer Sprint 4 quando user feedback ditar valor diferente.

---

## 2. Decisao

**Cap 5 cards/user/dia para auto-criados via cron.** Manual e bulk-from-coach mantidos com caps proprios (manual unlimited, bulk 20/request).

### 2.1 Implementacao server-side

Pseudo-code do cron:

```ts
async function materializeDrillDifficultSpotsForUser(userId: string) {
  const todayStart = startOfDay(new Date()); // 00:00 UTC

  const createdToday = await db
    .select({ count: count() })
    .from(spotReentryCards)
    .where(
      and(
        eq(spotReentryCards.userId, userId),
        eq(spotReentryCards.source, 'drill_gto_difficult_spot'),
        gte(spotReentryCards.createdAt, todayStart)
      )
    );

  let remainingCap = 5 - createdToday[0].count;
  if (remainingCap <= 0) {
    log.info('cap_reached', { userId, createdToday: 5 });
    return { created: 0, skipped: 'cap_reached' };
  }

  const sessions = await getRecentDrillSessions(userId, 7); // 7d window

  for (const session of sessions) {
    for (const item of session.difficult_spots ?? []) {
      if (remainingCap <= 0) {
        log.info('cap_reached_mid_run', { userId });
        return;
      }

      const hash = md5(`${session.id}|${item.context}`);
      const existing = await findStarredHand({ userId, source: 'drill_gto_difficult_spot', hash });
      if (existing && hasActiveCard(existing)) continue;

      // create starred_hand if not exists
      const spot = existing ?? await createDrillStarredHand({ userId, hash, item });

      // create reentry card
      await insertSpotReentryCard({ userId, spotId: spot.id, source: 'drill_gto_difficult_spot' });
      remainingCap -= 1;
    }
  }
}
```

### 2.2 Anti-bypass

- Cap aplica APENAS para `source='drill_gto_difficult_spot'`. Manual e bulk_coach contam como fontes separadas (sem cap cumulativo).
- User pode ter ate 5 + 20 (bulk_coach) + N (manual) novos cards no mesmo dia. Limite real e psicologico, nao tecnico — manual e intencional, cap protege apenas auto-criacao.

### 2.3 Observability

Cron emite metric:

```
log.info('cron_drill_materialize_done', {
  userId,
  sessionsProcessed: N,
  cardsCreated: M,
  cardsSkipped: K, // cap atingido
  errors: 0,
  durationMs: T
});
```

Acumular em `cronJobsLog` (table reuse Sprint News-3) para auditoria.

### 2.4 Spillover handling

Se 6 difficult_spots em uma session em 1 dia: 5 viram cards, 1 e perdido (cron de amanha NAO repuxa porque `idempotency hash` ja registrou starred_hand criado).

**Mitigacao:** Cron prioriza `created_at DESC` em difficult_spots (recentes primeiro). Spec menciona spots "selecionados pelo usuario" durante drill — mais recente tende a ser o mais critico.

**Nao mitigado (out of scope MVP):** sistema de fila persistente "to_create" com aging. Defer se feedback indicar perda significativa.

---

## 3. Consequencias

### Positivas

- **UX protegida**: queue maxima ~5/dia por origem cron. Power users com manual bulk podem ate 25 mas e intencional.
- **Reduce R5 risk**: research validou 5 cards/dia como threshold psicologico em Anki adult learners.
- **Cron determinista**: cap por count SQL, sem state externo. Idempotente (rerun no mesmo dia → 0 cards adicionais).

### Negativas

- **Possivel perda de sinal**: pro player com 50 difficult_spots/dia perde 45 que nunca viram cards. **Mitigacao:** cron janela 7d permite recovery em dias seguintes. Em pratica, jogador que tem 50/dia tem outros problemas (sinal demais → ruido).
- **Cap hardcoded** (5) — qualquer mudanca exige deploy. Setting togglavel defer Sprint 4.
- **Spillover invisivel**: usuario nao ve "X spots foram pulados pelo cron". Opcional adicionar mensagem em /estudos/reentry "Voce teve X spots difficult na semana, 5 entraram em revisao hoje. Veja em /estudos/sessions". Defer UX polish.

### Neutras

- Cap pode ser raised futuramente sem migration (apenas constant change). Cap pode ser lowered tambem — usuarios afetados ja capados nao perdem cards existentes (cap aplica apenas em criacao).

---

## 4. Alternativas defer Sprint 4+

- Setting user-level `srs_daily_cap` (3, 5, 10, 20).
- Spillover queue table com aging.
- Notificacao "X spots ficaram fora do cap, marque para entrar amanha".

---

## 5. Confianca

**Media-Alta.** Numero 5 baseado em pesquisa community Anki + research §7.5. Esperar telemetria pos-deploy para validar — se < 10% users batem cap diariamente: numero certo. Se > 30% batem cap toda semana: aumentar para 7 ou 10.
