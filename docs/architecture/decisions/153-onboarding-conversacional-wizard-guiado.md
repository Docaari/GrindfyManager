# ADR-153: Onboarding conversacional do Grindfy AI — wizard guiado opcional, persistencia incremental, banner persistente (modos `full` / `light`)

## Status
Aceito

## Data
2026-05-12

## Contexto

O Sprint AI-1A (`Docs/specs/sprint-ai-1a.md`, RF-07/09) introduz o **onboarding conversacional** do Grindfy AI: um diagnostico inicial guiado (3-5 min) que coleta perfil de jogador, status do import, metas, foco do mes, tom preferido e preferencias de nudge/quiet hours — alimentando o **perfil estruturado** (`users.ai_structured_profile`, ADR-151). E o **re-onboarding leve** — quando o agente detecta perfil estruturado vazio/incompleto (caso da maioria dos users existentes hoje), oferece um diagnostico abreviado (3 perguntas).

Hoje nao existe nenhum onboarding para o Coach. Existem wizards similares em outras features (`client/src/components/studies/onboarding/OnboardingWizard.tsx`, `client/src/components/home/EmptyHomeOnboarding.tsx`) — padrao de referencia, nao reuso direto. `users` tem `ttsFirstRunSeen` (precedente de flag "ja viu onboarding X"); `users.timezone` (default `America/Sao_Paulo`).

A pergunta central: **o onboarding e uma conversa-LLM real (o agente faz as perguntas no chat) ou um wizard guiado (formulario multi-step com toque conversacional no copy)? Onde mora? Como persiste o progresso (retomar se abandonar)? Como o usuario sabe que existe (banner)? O que acontece se o tier muda no meio?**

### Restricoes

- **Opcional, nunca bloqueia** — o onboarding e fortemente incentivado (banner persistente) mas o usuario pode pular; nada do app/chat fica bloqueado.
- **Custo:** zero chamadas ao LLM — o onboarding e wizard guiado (determinístico, barato, testavel); o "toque conversacional" e so o copy dos headers.
- **Lesson #2 (data-testid):** todos os componentes (wizard steps, banner) tem `data-testid` estaveis; testes nao usam heuristica DOM.
- **Lesson #1 (hooks primeiro):** componentes do wizard/banner colocam hooks antes de qualquer early return.
- **Lesson #13 (apiRequest JSON):** mutations usam `apiRequest(method, url, body)` que retorna JSON parseado.
- **Lesson #29/#30:** o banner usa `useQuery` — se um teste da Home renderiza sem `QueryClientProvider`, encapsular o banner numa ErrorBoundary local OU o teste fornece provider. Hook tests em `.test.ts` que usam `renderHook` vao no projeto jsdom (config-level).
- **Lesson #14/#26:** testes que carregam `CoachOnboarding.tsx`/`OnboardingWizard.tsx`/`OnboardingBanner.tsx` usam `await import(...)`, nunca `require()`.
- **Lesson #34:** os handlers novos de route recebem `injectedStorage?`.
- **NAO usar write tools** — o onboarding escreve via endpoints REST dedicados (`PATCH /api/coach/onboarding`, `POST /api/coach/onboarding/complete`), nunca via o tool runner do Coach.
- **Sincronizacao `tomPreferido` ↔ `coachTone`** (RF-09) — o `complete` grava nos dois.

## Opcoes Consideradas

### Conversa-LLM real vs wizard guiado

**Opcao A: wizard guiado multi-step com toque conversacional no copy (ESCOLHIDA)** — full-page (`/coach-ai/onboarding`), cada step e uma "pergunta" do Grindfy AI (header conversacional: "Pra te ajudar de verdade preciso te conhecer — bora?"), respostas estruturadas (selects, inputs, chips, textareas curtas).
- **Pros:**
  - **Barato:** zero tokens; o LLM nao e chamado.
  - **Determinístico:** as perguntas sao fixas; o resultado e estruturado de forma confiavel (vai direto pro `ai_structured_profile`).
  - **Testavel:** `data-testid` por step/campo; RHF + Zod por step; sem mock de LLM.
  - **Rapido para o usuario:** 6 steps `full` (≤5 min) / 3 steps `light` (≤2 min); barra de progresso; pode pular steps opcionais.
  - **Precedente:** outros wizards do projeto (studies onboarding, EmptyHomeOnboarding) — padrao conhecido.
- **Contras:**
  - **Menos "magico"** que uma conversa de verdade. Aceito — o copy conversacional dos headers + a deteccao de nivel ("pelos seus dados parece que voce e X — confere?") dao o toque; uma conversa-LLM real fica como evolucao futura (fora da v1).

**Opcao B: conversa-LLM real (o agente conduz o diagnostico no chat)** — o usuario abre o chat, o agente faz as perguntas, extrai as respostas via write tools.
- **Pros:** mais natural; usa o proprio Coach.
- **Contras:**
  - **Caro:** N rodadas de chat (custo Anthropic) so para coletar dados que um form coleta de graca.
  - **Não-determinístico:** o LLM pode pular perguntas, interpretar errado, gerar `metas` malformadas — precisaria de validacao/correcao; o `nivel` confirmado via chat e fragil.
  - **Requer write tools de carreira** (`define_career_goal` etc. — AI-2A) — escopo maior, dependencia.
  - **Dificil de testar** (mock de LLM + tools).
  - **Rejeitada para a v1** — wizard guiado entrega o mesmo resultado (perfil estruturado populado) por uma fracao do custo/risco. A conversa-LLM real e nota para o futuro.

### Persistencia do progresso

**Opcao A: persistencia incremental — salva a cada step (ESCOLHIDA)** — o wizard faz `PATCH /api/coach/onboarding` com o body parcial do step a cada avanco; o estado fica em `users.ai_structured_profile` (campos parciais) + `ai_structured_profile.onboardingDraft = { step, mode, startedAt }`. Ao concluir (`POST /complete`): seta `onboardingCompletedAt` + `onboardingVersion: 1`, limpa `onboardingDraft`, sincroniza `tomPreferido` ↔ `coachTone` + grava os toggles de nudge + quiet hours.
- **Pros:** retoma exatamente de onde parou (`GET /api/coach/onboarding` retorna `draft.step`); nao perde dados se fechar o browser; cada PATCH e pequeno e validado pelo sub-schema do step.
- **Contras:** o `ai_structured_profile` fica parcialmente populado mesmo antes de `complete` (ex: `tomPreferido` setado mas `onboardingCompletedAt` null). Aceito — `isStructuredProfileEmpty` checa `onboardingCompletedAt` entre outros; o prompt usa o que tiver (um perfil parcial e melhor que nenhum).

**Opcao B: salva so no fim (`POST /complete` com o agregado)** — o wizard mantem o estado em `useState`/RHF; nada persiste ate concluir.
- **Contras:** fechar o browser perde tudo; nao retoma. **Rejeitada** — o onboarding e opcional; se o usuario abandona no step 4 e perde tudo, dificilmente volta.

### Banner

**Opcao A: banner persistente em `/coach-ai` (aba chat) e em `/inicio`, dismissivel por sessao (ESCOLHIDA)** — aparece quando `!onboardingCompletedAt`; texto "Configure seu perfil com o Grindfy AI — 3 min" + "Comecar" (→ `/coach-ai/onboarding`) + "agora nao" (→ `PATCH {skip:true}` → seta `onboardingSkippedAt`, esconde o banner por essa sessao; reaparece na proxima — nao ha "nunca mais"). Usa `useQuery(['/api/coach/onboarding'])`.
- **Pros:** visivel sem ser bloqueante; "agora nao" e por-sessao (nao some pra sempre — o onboarding vale a pena); o `onboardingSkippedAt` deixa espacar a insistencia se quiser (futuro).
- **Contras:** o banner reaparece toda sessao ate completar — pode irritar. Aceito (e o trade-off de "incentivado mas opcional"; o usuario completa ou tolera).

**Opcao B: banner com "nunca mais"** — um dismiss permanente.
- **Contras:** o usuario clica "nunca mais" no dia 1 e nunca configura o perfil → o agente fica cego pra sempre. **Rejeitada** — por-sessao e o equilibrio.

## Decisao

**Adotar:** (a) wizard guiado full-page em `/coach-ai/onboarding` (modos `full` 6 steps / `light` 3 steps), com toque conversacional no copy — **nao** conversa-LLM real (que fica como evolucao futura); (b) persistencia incremental via `PATCH /api/coach/onboarding` a cada step → `users.ai_structured_profile` (campos parciais) + `onboardingDraft`; conclusao via `POST /api/coach/onboarding/complete` (seta `onboardingCompletedAt`/`onboardingVersion`, limpa draft, sincroniza tom + grava prefs de nudge); (c) banner persistente em `/coach-ai` e `/inicio`, dismissivel por sessao; (d) endpoints REST dedicados (nao write tools).

### Detalhes-chave

1. **Rota e componentes:**
   - `/coach-ai/onboarding` em `App.tsx` (protegida) → `client/src/pages/CoachOnboarding.tsx`. Aceita `?mode=full|light` (o `GET` decide o default: `full` se nunca completou, `light` se perfil vazio mas conta antiga — o banner passa o que o GET sugeriu).
   - `client/src/components/coach/onboarding/OnboardingWizard.tsx` (steps internos como sub-componentes). Cada step `data-testid` estavel (lesson #2). RHF + Zod resolvers por step. `useQuery` no `GET` inicial; `useMutation` no `PATCH`/`complete` (lesson #13).
   - `client/src/components/coach/OnboardingBanner.tsx` — no topo de `/coach-ai` (aba chat) e na Home (`/inicio`) quando `!onboardingCompletedAt`. Encapsular numa ErrorBoundary local se a Home renderiza em testes sem `QueryClientProvider` (lesson #29) — badge/banner vira null silenciosamente.
   - **NAO** mexe no `MiniChat.tsx` (o banner nao aparece la).

2. **Steps `full` (6):**
   1. **Boas-vindas + perfil de jogador:** tempo joga serio (input meses / faixas), `perfilDeclarado` (recreativo serio / semi-pro / pro — chips), `stakesTipico` (input texto curto), `volumeTipicoMes` (input number), `redesPrincipais` (multi-select de redes conhecidas — WPN/ACR, GGPoker, Suprema/PokerStars BR, PartyPoker, 888, etc. + "outra" texto livre, **clampada a 50 chars** na persistencia — decisao: clamp, nao `400`).
   2. **Status do import:** mostra se o usuario ja importou (`hasImport` do `GET /api/coach/onboarding`, derivado de `getUploadHistory`/contagem de torneios) — se sim, "Vi que voce ja tem N torneios" → segue pro step de nivel; se nao, link pra `/upload` (nao bloqueia — pode continuar).
   3. **Deteccao de nivel (ADR-154):** mostra `levelEstimate` (`GET /api/coach/level-estimate`) — "Pelos seus dados parece que voce e X — confere?" (chips: "confere" → `{ nivel: estimado, nivelConfirmado: true }`; "nao, sou mais [picker]" → `{ nivel: escolhido, nivelConfirmado: true }`; "prefiro nao dizer" → `{ nivel: estimado, nivelConfirmado: false }`). Se `nivel === 'sem_dados'` → pula a estimativa, pergunta o nivel auto-declarado (opcional; `nivelConfirmado: true` se respondeu).
   4. **Metas:** ate 3 metas (textareas curtas, max 200 chars cada — Zod `400` se exceder) + `prazo` (mes/trimestre — chip por meta). **Pulavel** (Zod aceita ausencia).
   5. **Foco do mes:** input texto curto (max 200, `400` se exceder). **Pulavel**.
   6. **Tom + nudges:** chips `gentle`/`balanced`/`direct` (default `balanced`); + as 8 categorias de nudge com defaults (mapeando os rotulos UX para `B-SNAPSHOT`/`B-LEAK`/`B-STUDY`/`B-VOLUME`/`B-GRADE`/`B-DOWNSWING`/`B-LIFE`/`B-MENTAL` — `B-LIFE`/`B-MENTAL` default `false`, resto `true`) com toggles + quiet hours (2 inputs). Botao "Concluir" → `POST /api/coach/onboarding/complete`.

3. **Steps `light` (3):** (1) Tom (chips); (2) 1 meta do mes (textarea curta, opcional); (3) Foco do mes (input curto, opcional). Botao "Concluir". Header: "Vi que ja temos historico aqui — deixa eu me apresentar direito e ajustar algumas coisas. Rapidinho."

4. **Gatilho do `light`:** o agente, quando `isStructuredProfileEmpty(profile)` E o re-onboarding nao foi recusado recentemente (`reOnboardingDeclinedAt` ausente ou >30 dias), instrui (via o bloco STATIC — ADR-151 §7) a oferecer um diagnostico rapido. Quando o usuario aceita (fora do escopo automatizado), vai pra `/coach-ai/onboarding?mode=light`. O `GET` tambem retorna `mode: 'light'` quando detecta esse caso (o banner pode disparar com `?mode=light`). Decisao: **nao** criar um cron "complete seu perfil" — o banner + a oferta no prompt bastam.

5. **Endpoints novos** (todos `requireAuth`; handlers com `injectedStorage?` — lesson #34):
   | Metodo | Rota | Descricao |
   |---|---|---|
   | GET | `/api/coach/onboarding` | `{ completed: boolean, mode: 'full'\|'light'\|null, draft: {step,mode,startedAt}\|null, structuredProfile: AiStructuredProfile, levelEstimate: LevelEstimate\|null, hasImport: boolean }` (`completed` ⟺ `onboardingCompletedAt != null`) |
   | PATCH | `/api/coach/onboarding` | body Zod parcial (campos do step atual; ou `{ skip: true }`) → persiste em `ai_structured_profile` + `onboardingDraft`; `{ skip: true }` seta `onboardingSkippedAt` (nao altera `onboardingCompletedAt`) |
   | POST | `/api/coach/onboarding/complete` | valida o agregado → seta `onboardingCompletedAt` + `onboardingVersion: 1`, limpa `onboardingDraft`, `updateAiStructuredProfile({ tomPreferido, ... })` + `upsertCoachPreferences({ coachTone: tomPreferido, nudgeB*: ..., quietHoursStart/End: ... })` |
   | GET | `/api/coach/level-estimate` | roda `estimatePlayerLevel` on-demand (ADR-154), retorna `LevelEstimate`; **nao persiste** |
   - **Validacao:** `tomPreferido` ∉ `['gentle','balanced','direct']` → `400`; meta > 200 chars → `400`; `step` fora de range (`full`: 1-6; `light`: 1-3) → `400`; `duration` invalido (em `/snooze`, ADR-152) → `400`.
   - **Persistencia incremental:** o `PATCH` valida o **sub-schema do step**; o `POST /complete` valida o **agregado** (todos os campos obrigatorios do flow concluido — `tomPreferido` obrigatorio; `metas`/`focoDoMes` opcionais).

6. **Sincronizacao `tomPreferido` ↔ `coachTone`** (RF-09, ver ADR-151 §sincronizacao): o `POST /complete` grava nos dois; o `PUT /api/coach/preferences` (existente, ADR-152 §3) espelha `coachTone` → `tomPreferido`. O prompt usa **so** `structuredProfile.tomPreferido`; back-fill lazy no handler de `/api/coach/chat` se ausente mas `coachTone` presente.

7. **Mudanca de tier no meio do wizard (decisao resolvida):** o onboarding **nao** depende de tier — todos os tiers (`free`/`pro`/`premium`/`admin`) acessam o Grindfy AI (ADR-148 §2.5 — acabou o `403 tier_locked` por coach). O wizard nao gateia nada por tier. Se o usuario faz upgrade/downgrade no meio (improvavel, mas), o estado do `ai_structured_profile`/`onboardingDraft` e independente de tier — retoma normalmente. O step 6 (nudges) grava os toggles independente de tier (os toggles existem em `userCoachPreferences` para todos). **Resumo: tier nao afeta o onboarding; nada a fazer.**

8. **Frontend — mutations (lesson #13):** `apiRequest('PATCH', '/api/coach/onboarding', body)` retorna o JSON parseado direto; mocks em testes retornam o JSON, nao `{ ok, json: () => ... }`.

9. **Nao-objetivos:** NAO conversa-LLM real (futuro); NAO bloquear o app/chat; NAO criar o nudge "complete seu perfil" como cron; NAO mexer no `MiniChat`; o wizard NAO chama write tools; NAO inferir `padroesConhecidos` automaticamente.

## Consequencias

### Positivas
- **Perfil estruturado populado de forma confiavel** — base de todos os relatorios automaticos (AI-1B+); o agente "sabe quem o jogador e".
- **Barato e testavel** — zero LLM; `data-testid` estaveis; RHF + Zod por step; persistencia incremental retoma de onde parou.
- **Opcional sem ser invisivel** — banner em `/coach-ai` e `/inicio`; "agora nao" por-sessao (nao some pra sempre).
- **Re-onboarding leve cobre os users existentes** (maioria com perfil vazio) — 3 perguntas, ≤2 min; o prompt oferece naturalmente.
- **Independente de tier** — nada a gatear (ADR-148).

### Negativas
- **Menos "magico"** que uma conversa-LLM real — aceito (copy conversacional + deteccao de nivel dao o toque; conversa real e futuro).
- **Banner reaparece toda sessao ate completar** — pode irritar; e o trade-off de "incentivado".
- **`ai_structured_profile` fica parcialmente populado durante o wizard** (antes de `complete`) — aceito (`isStructuredProfileEmpty` checa multiplos campos; perfil parcial > nenhum).
- **Mais 4 endpoints + 1 rota + 3 componentes de frontend** — escopo conhecido; isolados (nenhum toca caminhos existentes).

### Neutras
- **`onboardingDraft` mora no `ai_structured_profile`** (campo) — nao precisa de coluna separada.
- **Mapeamento rotulos UX ↔ `B-*`** — fica no frontend (o step 6 mostra "Relatorio semanal"/"Aviso de leak" etc., grava `nudgeBStudy`/`nudgeBLeak`/...).
- **Wizards existentes (studies, home)** sao referencia, nao reuso — codigo novo dedicado.

## Confianca

**Alta.** Wizard multi-step com persistencia incremental e padrao conhecido no projeto. Zero LLM = zero risco de não-determinismo/custo. Lessons #1/#2/#13/#14/#26/#29/#30/#34 honradas. Risco principal — o banner irritar — mitigado pelo "agora nao" por-sessao + o onboarding ser genuinamente util.

## Code references

- `client/src/App.tsx` — rota `/coach-ai/onboarding` (protegida).
- `client/src/pages/CoachOnboarding.tsx` (NOVO).
- `client/src/components/coach/onboarding/OnboardingWizard.tsx` (NOVO) + sub-componentes de step.
- `client/src/components/coach/OnboardingBanner.tsx` (NOVO) — em `/coach-ai` (aba chat) e `/inicio`.
- `server/routes/coach.ts` — `handleGetOnboarding`, `handlePatchOnboarding`, `handleCompleteOnboarding`, `handleGetLevelEstimate` (com `injectedStorage?`).
- `server/storage/aiStructuredProfile.ts` — `getAiStructuredProfile`/`updateAiStructuredProfile`/`isStructuredProfileEmpty` (ADR-151) — usados pelos handlers de onboarding.
- `server/coach/playerLevel.ts` (ADR-154) — `estimatePlayerLevel` — usado por `handleGetLevelEstimate` e pelo step 3.

## Related ADRs

- [ADR-151](151-ai-structured-profile-jsonb.md) — Perfil estruturado — o onboarding escreve nele; sincronizacao `tomPreferido` ↔ `coachTone`.
- [ADR-152](152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md) — Anti-fadiga — o step 6 grava os toggles de nudge + quiet hours via `upsertCoachPreferences`.
- [ADR-154](154-deteccao-nivel-rule-based.md) — Deteccao de nivel — o step 3 mostra a estimativa e pede confirmacao.
- [ADR-148](148-grindfy-ai-consolidation-single-agent-with-lens.md) — Agente unico — o onboarding e do agente unico; tier nao gateia.
- [ADR-150](150-coach-ai-hub-tabs-layout.md) — Hub `/coach-ai` — o banner aparece na aba `chat`; a aba `prefs` ganha a secao de congelamento (ADR-152).
- [AI-002](../ai-coach/adr-002-memory-architecture.md) — Memoria — o onboarding e a porta de entrada do componente estruturado.

## Lessons learned aplicadas
- **#1** (hooks primeiro) — wizard/banner colocam hooks antes de qualquer early return.
- **#2** (data-testid) — `data-testid` estaveis por step/campo; testes nao usam heuristica DOM.
- **#13** (apiRequest JSON) — mutations usam `apiRequest(method, url, body)` que retorna JSON parseado; mocks retornam o JSON.
- **#14/#26** (`await import` vs `require`) — testes carregam os componentes com `await import(...)`.
- **#29** (useQuery sem provider) — `OnboardingBanner` encapsulado em ErrorBoundary local na Home se necessario.
- **#30** (hook test jsdom) — se criar `useCoachOnboarding` testado via `renderHook`, o `.test.ts` vai no projeto jsdom (config-level).
- **#34** (storage injetavel) — handlers de onboarding recebem `injectedStorage?`.
