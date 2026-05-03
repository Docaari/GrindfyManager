# ADR-107 — Home Profile Detection: Smart Auto-Adapt Server-Side (Onda 1.5)

- Status: Proposto
- Data: 2026-05-03
- Sprint: home-reform-1-5 (Onda 1.5 da reforma da Home)
- Decision owner: system-architect (formaliza D-FOUNDER-7 + D1.5-7 + D1.5-8 + D1.5-9 da Spec home-reform-1-5)
- Related: ADR-099 (cockpit pattern), ADR-102 (home overview cache strategy), ADR-016 (bundle aggregation)
- Spec: `Docs/specs/home-reform-1-5.md` §2 D-FOUNDER-7, §3 D1.5-7/8/9/11, RF-25, RF-26

---

## 1. Contexto

### 1.1. Diagnostico

Home Onda 1 (ADR-099) trata todos os usuarios identicamente. Strategist identificou tres perfis distintos com necessidades divergentes:

| Perfil | Comportamento | Empty state ideal |
|---|---|---|
| `upload-only` | Usa Grindfy como tracker pos-fato. Importa CSV diariamente, raramente usa Grind Live. | "Importe seu CSV de hoje" |
| `session-only` | Usa Grindfy como cockpit de sessao live. Raramente importa CSVs (joga em poucos sites com tracking nativo). | "Iniciar sessao de grind agora" |
| `hybrid` | Usa ambos. Mais comum em pros que multi-tablearem em redes diferentes. | Mostra ambos CTAs |
| `new` | User novo, zero CSV + zero session. | Onboarding em vez de empty states |

Strategist apresentou tres caminhos (§10.1 Q3 da audit):

1. **Toggle manual em `/settings`** — user escolhe perfil. Friction inicial, requer UI nova.
2. **Smart auto-adapt server-side** — heuristica detecta perfil, frontend reage. Zero UI extra.
3. **Detection client-side via lifetime stats** — frontend conta a partir do `data` ja recebido.

Founder respondeu Q3 com `ACCEPT` (Opcao 2 = smart auto-adapt server-side, default `'hybrid'` em duvida).

### 1.2. Forcas em jogo

- **Friction zero:** Onda 1.5 nao introduz UI de configuracao. User experiencia adapta-se sozinho.
- **Precisao:** backend tem acesso direto a `tournaments` + `session_tournaments` (counts exatos). Cliente recebe so payload agregado — perde granularidade.
- **Reversibilidade:** thresholds calibraveis via constants em `server/routes/home.ts`. Toggle manual Onda 2 nao quebra contrato (apenas override).
- **Cache compatibility:** ADR-102 cache TTL 30s in-memory per-userId. Profile e estavel (raramente muda em 30s) — nao invalida cache mais cedo.
- **Default seguro:** em ambiguidade, retornar `'hybrid'` mostra tudo (erro de comissao, nao omissao).

---

## 2. Decisao

**Profile detection e server-side, no orchestrator de `/api/home/overview`**, e expoe `profile` no payload de resposta. Frontend reage adaptando copy de empty states + descriptions; **nao esconde blocos** em Onda 1.5.

### 2.1. Contrato de resposta

Extensao do payload `/api/home/overview` (ADR-102):

```ts
export type HomeProfile = 'upload-only' | 'session-only' | 'hybrid' | 'new';

export interface HomeProfileMeta {
  csvCount: number;            // tournaments WHERE uploadedAt IS NOT NULL
  sessionCount: number;        // session_tournaments rows
  detectedAt: string;          // ISO timestamp
  reason: string;              // human-readable: "csv=120 ses=45 → hybrid"
}

export interface HomeOverviewResponse {
  // ... campos existentes Onda 1 ...
  profile: HomeProfile;
  profileMeta: HomeProfileMeta;
}
```

### 2.2. Heuristica (backend `server/routes/home.ts`)

```ts
const HYBRID_CSV_THRESHOLD = 50;
const HYBRID_SESSION_THRESHOLD = 20;

function detectProfile(csvCount: number, sessionCount: number): HomeProfile {
  if (csvCount === 0 && sessionCount === 0) return 'new';
  if (csvCount >= HYBRID_CSV_THRESHOLD && sessionCount >= HYBRID_SESSION_THRESHOLD) return 'hybrid';
  if (csvCount >= HYBRID_CSV_THRESHOLD && sessionCount < HYBRID_SESSION_THRESHOLD) return 'upload-only';
  if (csvCount < HYBRID_CSV_THRESHOLD && sessionCount >= HYBRID_SESSION_THRESHOLD) return 'session-only';
  // Caso ambiguo: 1 <= csvCount < 50 OR 1 <= sessionCount < 20 sem bater hybrid
  if (csvCount > sessionCount * 2) return 'upload-only';
  if (sessionCount > csvCount * 2) return 'session-only';
  return 'hybrid'; // default seguro em empate ou range central
}
```

Thresholds `50` e `20` calibrados via spec home-reform-1-5 D1.5-8. Reavaliacao Onda 2 com telemetria real.

### 2.3. Implementacao no orchestrator

Adicionar 1 query simples ao `Promise.allSettled` ja existente em `/api/home/overview` (ADR-102). Reuso do `storage.ts` direto (ADR-102 D5):

```ts
// dentro de buildHomeOverview(userId)
const [
  /* ... existing 8 promises ... */,
  csvCountPromise,
  sessionCountPromise,
] = await Promise.allSettled([
  /* ... existing ... */,
  storage.countTournamentsWithCsvImport(userId),     // tournaments WHERE uploadedAt IS NOT NULL
  storage.countSessionTournaments(userId),            // session_tournaments rows
]);

const csvCount = csvCountPromise.status === 'fulfilled' ? csvCountPromise.value : 0;
const sessionCount = sessionCountPromise.status === 'fulfilled' ? sessionCountPromise.value : 0;
const profile = detectProfile(csvCount, sessionCount);
```

Latencia adicional estimada: <30ms p95 (2 counts indexados em paralelo). Budget Onda 1 (<500ms p95) preservado.

### 2.4. Cache invalidation

Cache 30s in-memory per-userId (ADR-102). Profile e parte do payload cacheado — refrescado quando cache expira naturalmente. Mudanca de perfil (ex: user passa de `upload-only` para `hybrid`) e detectada em ate 30s. Aceitavel (perfil nao e tempo-real).

**Observacao operacional:** adicao de `profile` + `profileMeta` ao payload **invalida cache existente em runtime** (estrutura mudou — clientes antigos podem receber payload novo). Cache antigo expira em 30s naturalmente. Sem migration de cache.

### 2.5. Uso no frontend (Onda 1.5)

**Apenas adapta copy.** Zero conditional render de blocos.

```tsx
// client/src/components/home/EmptyHomeOnboarding.tsx
const copyByProfile: Record<HomeProfile, { title: string; description: string; primaryCta: string }> = {
  'upload-only': {
    title: 'Bem-vindo de volta',
    description: 'Importe o CSV de hoje para ver seu desempenho atualizado.',
    primaryCta: 'Importar CSV',
  },
  'session-only': {
    title: 'Bem-vindo de volta',
    description: 'Pronto pra grindar? Comece uma sessao live.',
    primaryCta: 'Iniciar Grind Live',
  },
  'hybrid': {
    title: 'Bem-vindo de volta',
    description: 'Importe um CSV ou comece uma sessao live agora.',
    primaryCta: 'Importar CSV',
  },
  'new': {
    title: 'Vamos comecar',
    description: 'Importe seu primeiro CSV ou inicie uma sessao live.',
    primaryCta: 'Importar primeiro CSV',
  },
};
```

Adapta tambem:
- `<RecentSessionsList>` empty state copy
- `<TodayCard>` empty state copy
- `<EmptyHomeOnboarding>` description + primary CTA

**NAO adapta** em Onda 1.5:
- Ordem de blocos (mantem fixa Onda 1)
- Visibilidade de blocos (todos sempre renderizam)
- Tamanhos / hierarquia visual

---

## 3. Alternativas consideradas

### 3.1. Toggle manual em `/settings` (Opcao 1)

Pros:
- Controle explicito do user (zero ambiguidade)
- Permite preferencia consciente (player que e `hybrid` mas quer foco `session-only`)

Contras:
- Friction inicial: novo user nao sabe que perfil escolher
- Requer UI nova em Settings (fora escopo Onda 1.5)
- Defaults precisariam ser auto-detectados de qualquer jeito

**Defer Onda 2:** introduzir como **override** sobre o auto-detect. Schema sugerido: `users.preferences.homeProfileOverride: 'auto' | 'upload-only' | 'session-only' | 'hybrid'`. Default `'auto'` mantem comportamento atual.

### 3.2. Detection client-side via lifetime stats (Opcao 3)

Pros:
- Zero query backend extra
- Funciona com payload existente (`data.lifetime.csvImports` + `data.lifetime.sessionCount`)

Contras:
- Lifetime stats sao **agregacoes** — perdem granularidade vs counts diretos
- Cliente precisa re-implementar a heuristica (duplicacao de logica)
- Backfill / migration de logica e mais dificil (multiplos clients)
- Coach AI Onda 2 pode usar `profile` server-side para context-aware tools (cliente nao consegue exportar)

**Rejeitado** — server-side e marginalmente mais caro (<30ms) mas centraliza logica.

### 3.3. ML clustering (k-means sobre features de uso)

Pros:
- Personalizacao real
- Pode descobrir perfis nao-obvios (ex: "upload-burst" — importa em rajadas semanais)

Contras:
- Overengineered Onda 1.5
- Sem dataset suficiente (precisaria meses de telemetria)
- Custo training/serving

**Rejeitado** — reavaliar quando base de usuarios justificar.

---

## 4. Consequencias

### 4.1. Positivas

- **Zero friction:** novo user recebe Home adaptada sem onboarding extra
- **Centralizado:** logica em 1 lugar (server). Multiplos clients (web/mobile futuro) consomem sem duplicar
- **Auditavel:** `profileMeta.reason` no payload permite debugging ("por que minha Home esta no modo X?")
- **Calibravel:** thresholds em constantes — ajustar via PR sem migration
- **Compativel com cache:** TTL 30s e adequado (perfil e estavel)
- **Coach AI Onda 2 ready:** tool registry (ADR-023) pode usar `profile` em prompts context-aware

### 4.2. Negativas

- **Inconsistencia transitoria:** user que cruza threshold (49 → 50 CSVs) ve Home mudar copy "subitamente". Aceitavel — copy e suave (nao quebra navegacao)
- **Threshold magic numbers:** 50/20 sao palpites educados. Telemetria Onda 2 deve calibrar
- **+1 query backend:** ~30ms p95. Mitigado pelo `Promise.allSettled` paralelo (ADR-102)

### 4.3. Neutras

- Spec D1.5-9 explicita: profile NAO esconde blocos em Onda 1.5. ADR confirma — apenas adapta copy
- Onda 2 pode introduzir override manual sem quebrar contrato (campo `profile` continua valido)

---

## 5. Pontos de extensao para Onda 2

Codigo desenhado para nao-quebrar quando Onda 2 chegar:

1. **Toggle manual em `/settings`:** schema sugerido `users.preferences.homeProfileOverride` JSONB. Default `'auto'`. Server resolve `effectiveProfile = override !== 'auto' ? override : detectProfile(...)`. Frontend usa `effectiveProfile`.
2. **Profile-aware ordenacao de blocos:** Onda 2 pode reordenar/esconder blocos baseado em perfil. Ex: `upload-only` esconde `<NextTournamentCountdown>` (sem grade ativa). Implementacao: `<HomeLayout profile={profile}>` com layout schemas per-profile.
3. **Telemetria:** novo evento `home_profile_detected` em `analytics_events` (quando ADR-055 stub virar tabela real Onda 2). Tracking: distribuicao real de perfis na base, calibracao de thresholds.
4. **Coach AI tool integration:** Coach AI prompt context (ADR-025 zod whitelist) pode incluir `profile` para respostas adaptadas ("voce e session-only — vou focar em sessoes live").
5. **Profile churn detection:** alerta quando user muda de perfil drasticamente (`upload-only` → `session-only` em <30d) — pode indicar mudanca de comportamento worth surfacing.

---

## 6. Confianca

**Alta** para implementacao server-side e contrato. **Media** para os thresholds 50/20 — chute educado, telemetria Onda 2 deve calibrar. Risco baixo (default `'hybrid'` cobre ambiguidade).

---

## 7. Referencias

- `Docs/specs/home-reform-1-5.md` §2 D-FOUNDER-7, §3 D1.5-7/8/9/11, RF-25, RF-26
- `Docs/strategy/home-reform-1-ux-audit-and-onda-1-5.md` §10.1 Q3 (caminhos avaliados)
- ADR-099 (Operations Cockpit pattern) — contexto Home Onda 1
- ADR-102 (`/api/home/overview` cache strategy) — orchestrator host
- ADR-016 (bundle aggregation pattern) — precedente de payload composto
- ADR-023 (Coach tool registry) — referencia Onda 2 para profile-aware tools
- ADR-025 (Coach page context zod whitelist) — referencia Onda 2 para profile no prompt
