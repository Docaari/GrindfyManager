# ADR-151: Perfil estruturado do jogador — JSONB em `users.ai_structured_profile` (fonte confiavel pro prompt + base do ciclo de vida do Grindfy AI)

## Status
Aceito

## Data
2026-05-12

## Contexto

O Sprint AI-1A (`Docs/specs/sprint-ai-1a.md`, RF-01/05/06/09) introduz a "memoria estruturada" do Grindfy AI: campos confiaveis e versionados `{ nivel, nivelConfirmado, metas, focoDoMes, tomPreferido, padroesConhecidos, redesPrincipais, onboarding*, ... }` que o system prompt usa de forma **deterministica** (vs a prosa livre em `user_ai_profile.content`, que e gerada por Haiku e nao tem garantia de shape).

Hoje a memoria de longo prazo (ADR-015 / `ai-coach/adr-002`) e **so prosa**:
- `user_ai_profile.content` (text, default `''`, max 2000 chars no insert) — notas qualitativas mescladas por Haiku ao arquivar sessao.
- `monthly_coach_summaries` — resumos mensais consolidados por Haiku.

Nenhum desses tem campos estruturados — o prompt nao consegue extrair "qual o nivel do jogador" ou "qual a meta do mes" de forma confiavel. O onboarding (RF-07), a deteccao de nivel (RF-08) e o system prompt enriquecido (RF-06) precisam de um lugar **estruturado**.

A pergunta central: **onde mora o perfil estruturado — coluna JSONB nova em `users`, tabela nova, ou expandir `user_ai_profile`?** E: **como evitar o erro classico de adicionar um campo "required" sem back-fill (lesson #7)?**

### Restricoes

- **Lesson #7 (schema deprecation gradual):** TODA coluna nova de perfil que o codigo le precisa ser `nullable` (ou com `DEFAULT`) + back-fill no storage via `??`. NUNCA `ALTER ... SET NOT NULL` sem default. A maioria dos users hoje tem perfil de IA vazio — uma coluna `NOT NULL` sem default quebraria todos.
- **Cardinalidade 1:1 com `users`:** o perfil estruturado e pequeno (~10-15 campos, alguns arrays pequenos), sempre 1 por user, sempre lido junto com dados do user (onboarding/nivel tocam `users.createdAt`, `users.subscriptionPlan`). Uma JOIN com tabela separada e overhead sem ganho.
- **A prosa continua:** NAO migrar `user_ai_profile.content` — a prosa qualitativa (notas via Haiku) permanece intacta; o estruturado e **aditivo**.
- **Versionamento de shape:** o shape vai evoluir (campos novos em sprints futuros — AI-1B/2A). Precisa de um `schemaVersion` para migracoes de shape lazy.
- **Sincronizacao com `userCoachPreferences.coachTone`:** `tomPreferido` existe em dois lugares e precisa ficar consistente (RF-09).
- **Lesson #9 (try/catch logado) + #19/#21 (cache TTL):** acesso a DB loga estruturado antes do fallback safe; se cachear, expor `_resetForTests()` + invalidar em escrita.
- **Lesson #3 (mocks idealizados):** o normalize protege consumers — mocks de `getAiStructuredProfile` que retornam shape parcial nao quebram.

## Opcoes Consideradas

### Opcao A: Coluna JSONB nova `users.ai_structured_profile` (nullable, normalizada no storage) — ESCOLHIDA

```sql
-- migrations/0065_users_ai_structured_profile.sql
ALTER TABLE users ADD COLUMN ai_structured_profile jsonb DEFAULT '{}'::jsonb;
-- nullable: sem NOT NULL. DEFAULT '{}' garante que rows novos nascem com {} (o storage normaliza para { schemaVersion: 1 }).
-- rows existentes ficam com NULL (o ALTER nao reescreve a tabela) — getAiStructuredProfile trata NULL e {} igualmente.
```

```ts
// shared/schema.ts — em users
aiStructuredProfile: jsonb("ai_structured_profile"),  // sem .notNull(); o storage normaliza
```

**Shape (versionado — `schemaVersion: 1`):**

```ts
interface AiStructuredProfile {
  schemaVersion: number;                       // 1 — incrementa em migracoes de shape (lazy, no storage)
  nivel?: PlayerLevel | null;                  // estimado pela heuristica (ADR-154)
  nivelConfirmado?: boolean;                   // true se o usuario confirmou; false/undefined se so estimado
  nivelEstimadoEm?: string | null;             // ISO timestamp da ultima estimativa
  metas?: Array<{ id: string; texto: string; prazo?: 'mes' | 'trimestre' | null;
                  criadaEm: string; origem: 'onboarding' | 'chat' | 'manual' }>;  // max 3
  focoDoMes?: string | null;                   // max 200 chars — 1 leak/area de foco
  focoDoMesDefinidoEm?: string | null;
  tomPreferido?: 'gentle' | 'balanced' | 'direct';  // sincronizado com userCoachPreferences.coachTone (ADR-152 §sincronizacao)
  padroesConhecidos?: string[];                // max 10, cada um max 120 chars — so declarados, nunca inferidos
  redesPrincipais?: string[];                  // max 10, cada um max 50 chars
  stakesTipico?: string | null;                // max 50 — texto livre
  volumeTipicoMes?: number | null;             // torneios/mes (declarado)
  tempoJogaSerioMeses?: number | null;
  perfilDeclarado?: 'recreativo_serio' | 'semi_pro' | 'pro' | null;
  onboardingCompletedAt?: string | null;       // ISO — null se nunca completou
  onboardingVersion?: number | null;           // versao do flow completado (1)
  onboardingSkippedAt?: string | null;
  onboardingDraft?: { step: number; mode: 'full' | 'light'; startedAt: string } | null;  // estado do wizard p/ retomar
  reOnboardingOfferedAt?: string | null;
  reOnboardingDeclinedAt?: string | null;
  updatedAt?: string;                          // ISO — toda escrita atualiza
}

type PlayerLevel = 'sem_dados' | 'iniciando' | 'micro_ascensao' | 'mid_consistente' | 'high_stakes' | 'recreativo_serio';
```

**Storage layer (novo modulo `server/storage/aiStructuredProfile.ts`):**
- `getAiStructuredProfile(userId): Promise<AiStructuredProfile>` — le `users.ai_structured_profile`; `null` ou `{}` → retorna `{ schemaVersion: 1 }`; aplica `normalizeAiStructuredProfile` (back-fill `schemaVersion`, clampa tamanhos de arrays/strings). Lesson #9: try/catch + log estruturado + retorna `{ schemaVersion: 1 }` em erro. Cache TTL 30s opcional (se cachear: `_resetAiStructuredProfileCacheForTests()` + invalidar em todo write — lesson #19/#21).
- `updateAiStructuredProfile(userId, delta: Partial<AiStructuredProfile>): Promise<AiStructuredProfile>` — merge **raso** com o atual (arrays substituem por completo, nunca append automatico), seta `updatedAt`, valida/clampa tamanhos (metas → 3, padroes → 10, redes → 10, strings ao max), `UPDATE users SET ai_structured_profile = $1`. Invalida cache.
- `isStructuredProfileEmpty(profile): boolean` — `true` se nenhum de `{ nivelConfirmado, metas (nao-vazio), focoDoMes, tomPreferido, onboardingCompletedAt }` esta presente. Usado pelo gatilho de re-onboarding (RF-07.3) e pelo bloco "vazio" do system prompt (RF-06).
- `normalizeAiStructuredProfile(raw): AiStructuredProfile` — pura, testavel; back-fill + clamp.

**No system prompt (ADR-152 §bloco STATIC + RF-06):** `buildStaticSystemBlock` recebe `structuredProfile?: AiStructuredProfile | null` e renderiza `## Perfil Estruturado do Jogador:` (linhas curtas legiveis, NAO JSON cru) entre `## Perfil do jogador:` e `## Perfil do Jogador (memoria de longo prazo):`. Vai no bloco STATIC cacheado (`cache_control: ephemeral`). Quebra unica de cache aceita (lesson #10 + ADR-019).

**Versionamento de shape:** `schemaVersion` incrementa quando o shape muda de forma incompativel. A migracao de shape e **lazy no storage** (`normalizeAiStructuredProfile` detecta `schemaVersion < N` e converte) — nunca uma migracao SQL que reescreve JSONB de todas as rows (caro, e o JSONB tolera campos ausentes). Para a v1 nao ha conversao — `schemaVersion: 1` e o piso.

- **Pros:**
  - **Lesson #7 honrada:** nullable + `DEFAULT '{}'` + normalize no storage; nenhuma row quebra; back-fill e implicito (o storage da o default ao ler).
  - **1:1 sem JOIN:** lido junto com `users` (o onboarding/nivel ja tocam `users`); zero overhead relacional.
  - **JSONB flexivel:** o shape evolui sem migracao SQL (so `schemaVersion` + normalize). Pattern ja consolidado no projeto (ADR-119 `home_layout_settings`, ADR-132 `study_weekly_plans`, ADR-141 `linkedStats`).
  - **Prosa intacta:** `user_ai_profile.content` nao e tocado; o estruturado e aditivo. Sem risco de regressao na memoria existente.
  - **Testavel:** `normalizeAiStructuredProfile` + `isStructuredProfileEmpty` puras; `getAiStructuredProfile` com `injectedStorage` (lesson #34).

- **Contras:**
  - **`users` ganha mais uma coluna JSONB** (ja tem `home_layout_settings` etc.) — aceitavel; e a tabela natural para um perfil 1:1 com o user.
  - **Sem constraint de shape no DB:** o JSONB aceita qualquer coisa; a validacao mora no storage (`updateAiStructuredProfile` clampa/valida). Aceito — padrao do projeto para JSONB de perfil/config.
  - **Merge raso (nao deep):** atualizar `metas` substitui o array inteiro — o caller (endpoints do onboarding) precisa enviar o array completo. Documentado; arrays pequenos.

### Opcao B: Tabela nova `user_structured_profile`

- **Pros:** colunas tipadas (constraint de shape no DB); indices por campo se precisar (ex: query "todos os users nivel high_stakes" — mas isso e analytics, nao hot path).
- **Contras:**
  - **JOIN extra** em todo caminho que monta o system prompt (ja faz varias queries — RF-12 reclama de queries mortas).
  - **Migracao de shape = `ALTER TABLE`** toda vez que um campo novo entra — friccao alta para um perfil que vai evoluir.
  - **Arrays (`metas`, `padroesConhecidos`, `redesPrincipais`) viram tabelas-filhas ou colunas array** — over-engineering para ≤3-10 itens.
  - **Rejeitada** — cardinalidade 1:1 + shape mutavel = JSONB e o ajuste certo (mesma logica do ADR-141 junction-vs-jsonb).

### Opcao C: Expandir `user_ai_profile` (adicionar colunas estruturadas ali)

- **Pros:** "a memoria ja mora ali"; uma tabela so para tudo de IA.
- **Contras:**
  - `user_ai_profile` e a tabela da **prosa** (`content` + `version` + `tokenCount` — semantica de "blob de texto compactado por Haiku"). Misturar campos estruturados ali confunde o modelo (a `version` ja existe e significa outra coisa — versao da prosa, nao do shape estruturado).
  - O onboarding/nivel tocam `users.createdAt`/`subscriptionPlan` — ainda precisaria de JOIN com `users`.
  - **Rejeitada** — separacao de conceitos: `user_ai_profile.content` = prosa qualitativa (Haiku); `users.ai_structured_profile` = estruturado deterministico (onboarding/heuristica/write tools futuras). Co-habitam, nao se misturam.

### Opcao D: Coluna JSONB mas em `user_ai_profile` (`user_ai_profile.structured`)

- **Pros:** uma tabela so de IA; sem tocar `users`.
- **Contras:** mesma confusao da Opcao C (a tabela e "blob de prosa") + JOIN com `users` ainda necessario. **Rejeitada** — sem ganho sobre a Opcao A.

## Decisao

**Adotar Opcao A: coluna JSONB nova `users.ai_structured_profile` — nullable, `DEFAULT '{}'::jsonb`, shape versionado (`schemaVersion: 1`), normalizada e validada no storage layer (`server/storage/aiStructuredProfile.ts`).** A prosa em `user_ai_profile.content` continua intacta; o estruturado e aditivo. Lesson #7 (nullable + default + back-fill no storage). Migracao **0065** (`0065_users_ai_structured_profile.sql`) — separada da migracao do anti-fadiga (ADR-152, migracao 0066) por concern.

### Detalhes-chave

1. **Migracao 0065:** `ALTER TABLE users ADD COLUMN ai_structured_profile jsonb DEFAULT '{}'::jsonb;` — **sem `NOT NULL`** (rows existentes ficam `NULL`; `getAiStructuredProfile` trata `NULL` e `{}` como vazio). `db:push` local + commit da migration (autonomia liberada — `memory/autonomy_db_and_push_2026-05-03.md`). Confirmar que 0064 e o ultimo (e — 0064_perf_indexes.sql).
2. **`shared/schema.ts`:** `aiStructuredProfile: jsonb("ai_structured_profile")` em `users` — sem `.notNull()`. Tipo `AiStructuredProfile` exportado de `shared/schema.ts` (ou de um modulo `shared/ai-profile.ts` — implementer decide; preferir junto do schema para co-localizar com os outros tipos).
3. **Storage modulo novo** `server/storage/aiStructuredProfile.ts` com as 4 funcoes acima + `_resetForTests()` se cachear. Handlers de route recebem `injectedStorage?` (lesson #34).
4. **Normalizacao no read:** `getAiStructuredProfile` sempre retorna um objeto valido com `schemaVersion >= 1`; nunca `null`, nunca throw (lesson #9 — log + default safe).
5. **Validacao no write:** `updateAiStructuredProfile` clampa `metas` a 3, `padroesConhecidos`/`redesPrincipais` a 10, strings ao max declarado (textos de meta a 200, foco a 200, redes a 50, padroes a 120, stakes a 50). Itens alem do limite sao **truncados** (nao erro) — a validacao "dura" (400) mora nos endpoints REST (Zod), o storage e o ultimo guarda-corpo.
6. **`isStructuredProfileEmpty`:** `true` ⟺ nenhum de `{ nivelConfirmado === true, metas?.length, focoDoMes, tomPreferido, onboardingCompletedAt }`. Usado por: gatilho de re-onboarding (RF-07.3) + bloco "perfil vazio" do system prompt (RF-06) + GET `/api/coach/onboarding` (campo `completed`).
7. **No system prompt (ADR-152 §STATIC):** o bloco `## Perfil Estruturado do Jogador:` entra entre `## Perfil do jogador:` e `## Perfil do Jogador (memoria de longo prazo):`. Quando `isStructuredProfileEmpty` E (`reOnboardingDeclinedAt` ausente ou >30 dias) → o bloco vira **uma linha** instruindo o agente a oferecer um diagnostico rapido (3 perguntas). Quando vazio mas `reOnboardingDeclinedAt` recente (<30 dias) → o bloco e **omitido**. Formato: lista de bullets em pt-BR (`- Nivel estimado: ...`), nunca JSON cru.
8. **Sincronizacao `tomPreferido` ↔ `userCoachPreferences.coachTone`** (RF-09 — detalhada na §abaixo): o onboarding grava nos dois; o `PUT /api/coach/preferences` espelha `coachTone` → `tomPreferido`; o `buildStaticSystemBlock` usa **so** `structuredProfile.tomPreferido` (uma fonte no prompt); se o perfil estruturado nao tem `tomPreferido` mas `userCoachPreferences.coachTone` tem (dado legado), o **route handler** que monta os inputs do builder faz um back-fill lazy (copia `coachTone` → `structuredProfile.tomPreferido` na primeira leitura via `updateAiStructuredProfile`) — consistencia eventual barata.
9. **Versionamento de shape:** `schemaVersion` incrementa em mudancas incompativeis; conversao **lazy no storage** (`normalizeAiStructuredProfile` detecta versao antiga e converte); nunca migracao SQL que reescreve JSONB. v1 nao tem conversao.
10. **Nao-objetivos:** NAO migrar `user_ai_profile.content`; NAO tocar `monthly_coach_summaries`; NAO criar uma tabela; NAO inferir `padroesConhecidos` automaticamente (so declarados no onboarding ou registrados explicitamente — write tools de carreira sao AI-2A).

### Sincronizacao `tomPreferido` ↔ `coachTone` (RF-09 — resolvida)

- **Onboarding (`POST /api/coach/onboarding/complete`) e re-onboarding:** gravam nos **dois** — `updateAiStructuredProfile({ tomPreferido })` + `upsertCoachPreferences({ coachTone: tomPreferido })`. Atomico do ponto de vista do usuario (sequencial; se a segunda falhar, log + a primeira fica — a divergencia e corrigida no proximo back-fill lazy).
- **Edicao manual (`PUT /api/coach/preferences` com `coachTone`):** o handler **tambem** chama `updateAiStructuredProfile({ tomPreferido: coachTone })` (espelha). O `PUT` e a fonte de verdade da edicao manual; o espelhamento mantem o prompt consistente.
- **Leitura no prompt:** `buildStaticSystemBlock` recebe **so** `structuredProfile.tomPreferido` (nao recebe `coachTone` separado — uma fonte). Se `structuredProfile.tomPreferido` ausente (legado), o **route handler de `/api/coach/chat`** (quem monta `StaticInputs`), apos `getAiStructuredProfile(userId)`, se ve `!profile.tomPreferido && prefs.coachTone` → chama `updateAiStructuredProfile(userId, { tomPreferido: prefs.coachTone })` e usa o valor. **Decisao: back-fill lazy no handler** (nao no `getAiStructuredProfile` — para nao acoplar o read ao `getCoachPreferences`).

## Consequencias

### Positivas
- **Prompt confiavel:** o agente "sabe quem o jogador e" (nivel, metas, foco, tom, redes) de forma deterministica — base de todos os relatorios automaticos (AI-1B+).
- **Lesson #7 honrada por design:** nullable + default + normalize; zero risco de quebra.
- **Shape evolutivo barato:** campos novos via JSONB + `schemaVersion`; sem `ALTER TABLE`.
- **Separacao limpa:** prosa (Haiku, `user_ai_profile.content`) ⊥ estruturado (onboarding/heuristica, `users.ai_structured_profile`). Co-habitam.
- **Reusavel:** AI-1B (relatorios usam `nivel`/`metas`/`focoDoMes` para calibrar tom), AI-2A (write tools de carreira escrevem `metas`/`padroesConhecidos` aqui).

### Negativas
- **Sem constraint de shape no DB:** validacao no storage + endpoints. Aceito (padrao do projeto).
- **Merge raso:** o caller envia arrays completos. Documentado.
- **Mais uma coluna JSONB em `users`:** aceitavel; tabela natural.
- **Sincronizacao `tomPreferido`/`coachTone` em dois lugares:** ha uma janela de divergencia (se o `upsert` espelhado falhar) — mitigada pelo back-fill lazy no handler. Aceito.

### Neutras
- **`onboardingDraft` mora no proprio JSONB** (campo `onboardingDraft`) — nao precisa de coluna separada; e parte do perfil ("estado do wizard"). Limpo no `complete`.
- **Cache TTL opcional:** se nao cachear, `getAiStructuredProfile` e 1 query rapida (PK lookup em `users`) — provavelmente nem precisa de cache. Implementer decide; se cachear, lesson #19/#21.

## Confianca

**Alta.** Pattern JSONB-em-`users` para perfil/config 1:1 ja consolidado no projeto (ADR-119, ADR-132, ADR-141, `users.home_layout_settings`). Lesson #7 honrada. Risco principal — divergencia `tomPreferido`/`coachTone` — mitigado por espelhamento + back-fill lazy.

## Code references

- `migrations/0065_users_ai_structured_profile.sql` (NOVO) — `ALTER TABLE users ADD COLUMN ai_structured_profile jsonb DEFAULT '{}'::jsonb;`
- `shared/schema.ts` — `aiStructuredProfile: jsonb("ai_structured_profile")` em `users`; tipo `AiStructuredProfile` + `PlayerLevel` exportados.
- `server/storage/aiStructuredProfile.ts` (NOVO) — `getAiStructuredProfile`, `updateAiStructuredProfile`, `isStructuredProfileEmpty`, `normalizeAiStructuredProfile`, (`_resetForTests` se cachear).
- `server/coachSystemBuilder.ts` — `StaticInputs` ganha `structuredProfile?: AiStructuredProfile | null`; `buildStaticSystemBlock` insere `## Perfil Estruturado do Jogador:`; `formatStructuredProfile(profile)` (NOVO — testavel).
- `server/coachContext.ts` — `assembleContext` ganha loader `getStructuredProfile`.
- `server/routes/coach.ts` — `handleCoachChat` fornece `getStructuredProfile` via `getAiStructuredProfile(userId)`; back-fill lazy de `tomPreferido` a partir de `coachTone`.

## Related ADRs

- [ADR-015](015-scoring-linear-vs-ml.md) (`scoring-linear-vs-ml`) — referencia do "rule-based, sem ML" (a deteccao de nivel — ADR-154 — segue a mesma logica).
- [AI-002](../ai-coach/adr-002-memory-architecture.md) — Memoria persistente — **estendido**: a memoria agora tem um componente estruturado (este ADR) alem da prosa.
- [ADR-019](019-coach-prompt-cache-strategy.md) (`coach-prompt-cache-strategy`) — quebra unica de cache aceita ao introduzir o bloco STATIC novo (lesson #10).
- [ADR-148](148-grindfy-ai-consolidation-single-agent-with-lens.md) — Agente unico — o perfil estruturado e do agente unico (a "lente" `coachType` nao gateia o perfil).
- [ADR-152](152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md) — Anti-fadiga — `tomPreferido` ↔ `coachTone` (sincronizacao); migracao 0066 (separada).
- [ADR-153](153-onboarding-conversacional-wizard-guiado.md) — Onboarding — escreve o perfil estruturado via endpoints REST.
- [ADR-154](154-deteccao-nivel-rule-based.md) — Deteccao de nivel — alimenta `nivel`/`nivelConfirmado`/`nivelEstimadoEm`.

## Lessons learned aplicadas
- **#7** (schema deprecation gradual) — coluna nullable + `DEFAULT '{}'` + normalize/back-fill no storage; nunca required puro; nunca `SET NOT NULL` sem default.
- **#9** (try/catch logado) — `getAiStructuredProfile` loga estruturado + retorna `{ schemaVersion: 1 }` em erro; distingue "no rows" de "DB explodiu".
- **#3** (mocks idealizados) — `normalizeAiStructuredProfile` protege consumers; mocks parciais nao quebram.
- **#19/#21** (cache TTL) — se cachear, `_resetForTests()` + invalidar em todo write.
- **#34** (storage injetavel) — handlers de route recebem `injectedStorage?`; lazy `await import('../storage')` em prod.
- **#10** (DRY prompts) — o bloco do perfil estruturado em `coachSystemBuilder.ts` (fonte unica); quebra unica de cache aceita.
