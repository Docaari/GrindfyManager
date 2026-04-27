# ADR-020: Rate limit do Coach em janela rolling de 24 horas (nao calendar-day-reset)

## Status
Aceito

## Data
2026-04-24

## Contexto

O Sprint Coach-1 (`docs/specs/coach-sprint-1-fundacao-economica.md`, RF-04) substitui o rate limit flat atual (30/h global, aberto a todos os planos) por **tiers baseados em `users.subscriptionPlan`**:

| Plano | Limite | Coaches |
|---|---|---|
| free / trial | 10 msg/dia | Mental |
| pro | 50 msg/dia | Mental + Tournament |
| premium | 200 msg/dia | Mental + Tournament + Technical |
| admin | Ilimitado | Todos |

O limite e diario. A **pergunta central:** o que significa "dia"? Tres abordagens tipicas:

1. **Rolling 24h:** contar mensagens das ultimas 24h a partir de `now()`. Janela desliza continuamente.
2. **Calendar day na timezone do usuario:** reseta a meia-noite do fuso do usuario (`users.timezone`, default `America/Sao_Paulo`).
3. **Calendar day UTC:** reseta a meia-noite UTC — simples mas mal alinhado ao usuario.

### Restricoes

- **Jogador de poker online joga em horarios irregulares.** Grinder do turno da noite pode comecar sessao as 22h e seguir ate 04h. Reset a meia-noite partiria a sessao ao meio.
- **Abuse de "stockpiling"** em reset fixo: usuario ve que zera a meia-noite, dispara 9 mensagens as 23:58 + 10 mensagens as 00:01 = 19 msgs em 3 minutos. O tier `free` vira inutil para controlar custo.
- **Timezone per user adiciona complexidade.** `users.timezone` existe mas pode estar desatualizado; viagem, mudanca de fuso, usuario com dois horarios. A cada request precisariamos aplicar conversao.
- **UX:** reset "claro" (a meia-noite) e intuitivo mas incentiva o stockpiling acima. Rolling e menos intuitivo mas mais previsivel (usuario sempre sabe "tenho X nas proximas 24h").
- **Operacional:** rolling 24h e uma query trivial — `COUNT(*) WHERE role='user' AND userId=? AND createdAt > now() - INTERVAL '24 hours'`. Calendar day exige comparacao `DATE_TRUNC('day', createdAt AT TIME ZONE user.timezone)`.
- **Coach-1 nao tem billing variavel.** Hard 429 quando atinge. Usuario nao paga pelo excedente. Isso muda o calculo — mais previsibilidade importa mais que conveniencia de "reset claro".

## Opcoes Consideradas

### Opcao A: Rolling 24h (janela deslizante) (ESCOLHIDA)

`COUNT chat_messages WHERE role='user' AND session.userId=? AND createdAt > now() - 24h`

- **Pros:**
  - **Abuse-proof contra stockpiling.** Nao existe "hora do reset" para explorar. Se usuario dispara 9 msgs as 23h, ainda so pode mandar 1 ate as 23h do dia seguinte.
  - **Simples no servidor.** Query direta usando indice `(role, created_at)` (ja previsto em `idx_chat_messages_role_created`).
  - **Timezone-agnostic.** Nao depende de `users.timezone`. Evita inconsistencias quando fuso muda.
  - **Previsibilidade maxima.** Usuario pode calcular "faltam X horas para essa msg especifica sair da janela" via `X-RateLimit-Reset` (createdAt da msg mais antiga na janela + 24h).
  - **Sem diferenca de custo mensal para o sistema.** Total de msgs num mes e o mesmo; so o perfil temporal muda.
  - **`X-RateLimit-Reset` e sempre um timestamp especifico** (da mensagem mais antiga), nao "meia-noite do dia X" — tooltip na UI e simples.
  - **Compativel com upgrade no meio da janela.** Se usuario passa de Free para Pro, a proxima msg ja usa o limite novo (50). Nao precisa esperar "novo dia" para liberar.

- **Contras:**
  - **Nao existe "reset claro" visivel.** Usuario Free que mandou 10 msgs em 24h espalhadas ao longo do dia ve o limite liberar gradualmente (1 msg por hora conforme msg antiga sai). Menos intuitivo do que "tudo libera a meia-noite".
  - **Mitigacao UX:** endpoint `GET /api/coach/limits` retorna `resetAt` (createdAt da msg mais antiga + 24h) + `X-RateLimit-Reset` header. Tooltip: "Proxima msg libera em Xh Ymin."

### Opcao B: Calendar day na timezone do usuario (reset a meia-noite local)

- **Pros:**
  - **Reset claro.** "Tudo libera a meia-noite" e intuitivo.
  - Formato familiar para usuarios acostumados com quota diaria (Claude.ai, ChatGPT Free, etc.).

- **Contras:**
  - **Stockpiling perto do reset.** Usuario Free pode disparar 9 msgs as 23:58 + 10 as 00:01 = 19 em 3 min. Custo mensal do sistema nao muda mas o pico de carga se concentra em 1 minuto.
  - **Depende de `users.timezone` correto.** Se default errado (usuario em outro fuso), reset acontece "na meia-noite de outra pessoa".
  - **Query mais complexa.** `WHERE DATE(createdAt AT TIME ZONE user.timezone) = DATE(now() AT TIME ZONE user.timezone)` — indice composto dificil de usar eficientemente.
  - **Upgrade no meio do dia e estranho.** Free upgrade para Pro as 15h; conta 10 msgs do proprio dia ou reseta o contador? Se reseta: abuse. Se mantem: confuso (era Free, agora e Pro, mas mensagens do Free contam no Pro).
  - **Testar fuso horario em CI vira dor.** Mockar `now()` + mockar `users.timezone` + validar DATE_TRUNC.

### Opcao C: Calendar day UTC (reset a meia-noite UTC)

- **Pros:**
  - Query simples (sem timezone).
  - Sem dependencia de `users.timezone`.

- **Contras:**
  - **Desalinhamento cultural.** UTC 00:00 = 21:00 Brasil. Usuario brasileiro ve "reset acontecer no meio da sessao" todo dia.
  - **Stockpiling ainda possivel** (agora as 20:58 + 21:01 locais).
  - **Pior dos dois mundos:** complexidade de calendar-day sem o ganho de alinhamento com o usuario.

## Decisao

**Adotar Opcao A: rolling 24h (janela deslizante).**

### Detalhes-chave do design

1. **Query de contagem:**
   ```sql
   SELECT COUNT(*) FROM chat_messages cm
   JOIN chat_sessions cs ON cs.id = cm.session_id
   WHERE cs.user_id = ? AND cm.role = 'user' AND cm.created_at > now() - INTERVAL '24 hours'
   ```
   Indexado por `(role, created_at)` em `chat_messages`.

2. **`X-RateLimit-Reset` = createdAt da msg mais antiga na janela + 24h** (se nenhuma msg na janela, omitir header ou retornar `null`).

3. **Endpoint `GET /api/coach/limits`** retorna `resetAt` (ISO string) explicito. Admin: `resetAt: null`.

4. **Helper dedicado** `coachStorage.countUserMessagesInLastDay(userId)` substitui `countUserMessagesInLastHour`.

5. **Concurrency:** contagem atomica nao e garantida por `COUNT(*)`. Mitigacao: accept race de N=2 requests no limite exato; documentar em teste como edge case aceitavel (spec RF-04 Edge Cases: "2 requests simultaneos com 1 slot — apenas 1 passa, outro 429"). Implementacao real pode usar advisory lock ou contagem pos-insert (se `count > limit`, rollback + 429).

6. **Mapeamento `subscriptionPlan` -> tier** via helper `resolveUserTier(userId)` em `server/coachAccess.ts` (ver ADR complementar sobre helpers no spec). Ordem de precedencia: `role='admin'` OU `subscriptionPlan='admin'` > `user_subscriptions` ativo > fallback `free`.

## Consequencias

### Positivas
- **Anti-abuse:** stockpiling a meia-noite inviabilizado. Custo mensal previsivel.
- **Simplicidade operacional:** uma query, um indice, sem conversao de timezone.
- **Headers HTTP standard:** `X-RateLimit-Limit/Remaining/Reset` seguem convencao da industria (GitHub, Stripe, Anthropic).
- **Compativel com upgrade instantaneo:** Free -> Pro a qualquer momento muda limite na proxima msg, sem reset artificial.
- **Testavel sem mockar timezone.** `vi.useFakeTimers()` + avancar tempo suficiente.

### Negativas
- **UX menos intuitivo que "reset a meia-noite".** Mitigado por tooltip na UI + endpoint `/limits`.
- **Nao existe ponto de virada claro.** Usuarios tecnicos entendem; usuarios casuais podem estranhar inicialmente.

### Neutras
- **Se dados futuros mostrarem preferencia clara por calendar-day** (feedback de usuarios, medida de abuse nao materializada), migrar e viavel — a unica mudanca seria no helper de contagem e no header reset. Nenhuma migration de dados.

## Confianca

**Alta.** Rolling 24h e o padrao da industria para APIs com rate limit (GitHub API, Discord, Twitter API). O unico trade-off e UX de "reset claro" — mitigado por endpoint `/limits` e header explicito.

## Referencias

- Spec: `docs/specs/coach-sprint-1-fundacao-economica.md` (RF-04, especialmente RF-04.2 e RF-04.4)
- GitHub API rate limit docs (rolling hour window pattern)
- Anthropic API rate limits (token bucket / rolling window)
- Sequence diagram: `docs/architecture/sequence-coach-chat-cached.mermaid` (branch "tier normal")
