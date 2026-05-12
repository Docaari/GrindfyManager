# ADR-158: Quick suggestions anti-blank-page — `GET /api/coach/suggestions` (mapa estático por rota + check leve de estado, cache TTL 30s, fallback frontend estático); não-LLM

## Status
Aceito

## Data
2026-05-12

## Sprint
AI-1B (`Docs/specs/sprint-ai-1b.md`, RF-12)

## Decision owner
system-architect (mapa rota→sugestões refinável pelo strategist no sub-handoff; founder valida no marco)

## Related
- Depende de: ADR-149 (page context — o frontend já monta `{ route, activeCoachType }`; o `useCoachPageContext` sabe a rota), ADR-150 (hub `/coach-ai` — a aba Chat renderiza os chips), ADR-148 (agente único — as sugestões são "do Grindfy AI", não por-coach).
- Substitui o conceito legado de "prompt starters" (por-coach, desativado no AI-0B — `CoachAI.prompt-starters.test.tsx` está `describe.skip`; o sujeito mudou — agora é por-rota+estado, não por-coach).
- Reusa: `apiRequest` (JSON parseado — lesson #13), padrão de cache server-side com `_resetForTests` (lesson #21 — focusStats, hudStatTargetsCache, etc.), `getDashboardStats`/`detectLeaks`/`getLastUploadAt` (check leve de estado — métodos baratos que já existem), `useCoachPageContext` (frontend).
- Diagramas: documentado neste ADR (feature menor — não precisa de mermaid dedicado; o mapa rota→sugestões está na §3).

---

## 1. Contexto

No chat (hub `/coach-ai` aba Chat + `MiniChat`), a "tela em branco" é um ponto de fricção (Tema C — C4 anti-blank-page do plano). O usuário abre o chat e não sabe o que perguntar. O conceito legado de "prompt starters" (por-coach: Mental/Torneios/Técnico) foi desativado no AI-0B (a consolidação ADR-148 acabou com os 3 coaches). Falta: **2-4 sugestões contextuais de pergunta** dependendo da rota onde o chat foi aberto **e do estado real do user** (tem downswing? tem dados? está jogando no escuro?).

A pergunta central: **endpoint server-side (que sabe o estado real) vs computado 100% no frontend (só mapa por rota); cache; fallback; o mapa rota→sugestões.**

### Restrições

- **Não-LLM** — custo zero, latência zero. As sugestões são strings num módulo, não geradas por Claude.
- **As sugestões "ricas" dependem de estado real** — "por que estou perdendo?" só faz sentido se há downswing; "como importo meus torneios?" só faz sentido se o user não tem dados. O servidor sabe isso (storage); o frontend puro não.
- **Não martelar o storage** — o chat abre toda vez que o user navega; o check de estado precisa de cache TTL ~30s por user (lesson #21 — `_resetForTests` exportado, invalidar não é necessário aqui porque é só leitura barata com TTL curto).
- **Degrade graceful** — se o endpoint falha, o frontend cai num mapa estático por rota (genérico) — não quebra a tela, sem erro de console fatal (lesson #9).
- **Lessons:** #13 (`apiRequest` JSON), #21 (cache server-side com `_resetForTests`), #29 (`useQuery` dentro de provider — o `MiniChat` em páginas standalone pode precisar de ErrorBoundary; ou o fetch é best-effort com try/catch + fallback estático), #34 (handler com `injectedStorage?`).

---

## 2. Opções consideradas

### 2.1 Endpoint server-side vs 100% frontend

**Opção A — endpoint `GET /api/coach/suggestions?route=<route>&...` que faz um check leve de estado + cache TTL 30s, com fallback frontend estático (ESCOLHIDA).**
- **Prós:** as sugestões "ricas" usam estado real (downswing, sem dados, sessão sem reconciliar) — o servidor já tem isso via storage; o frontend cai num mapa estático genérico se o endpoint falha (resiliente); o check é leve (1-2 queries baratas: `getDashboardStats('7d')` ou `detectLeaks` + `getLastUploadAt`) cacheado 30s por user.
- **Contras:** um endpoint a mais + uma camada de cache. Aceito — o ganho de relevância (sugestões que casam com o estado) vale; e o fallback frontend cobre o caso de falha.

**Opção B — 100% frontend: mapa estático rota→sugestões, sem endpoint.**
- **Prós:** zero backend; zero latência; zero falha possível.
- **Contras:** as sugestões nunca são "ricas" — só por rota, sem estado. "Por que estou perdendo?" apareceria sempre no `/dashboard`, mesmo pra quem está ganhando — ruído. **Rejeitada como única solução** — mas o mapa estático **é** o fallback (Opção A inclui ele).

**Opção C — endpoint que gera as sugestões por LLM (Claude).**
- **Contras:** custo + latência por abertura de chat — absurdo pra uma feature de "chips de sugestão"; o valor não justifica. **Rejeitada.**

### 2.2 Onde mora o mapa de sugestões

**Decisão:** módulo `server/coach/quickSuggestions.ts` — o mapa estático rota→sugestões + `computeSuggestions(userId, route, ctx, injectedStorage?)` (faz o check leve de estado + aplica o mapa + cache TTL 30s + `_resetSuggestionsCacheForTests()` exportado). O fallback frontend estático: `client/src/lib/quickSuggestionsFallback.ts` (ou inline no `ChatPanel`) — um subset do mapa (só as sugestões genéricas por rota, sem as variantes de estado). Manter os dois em sincronia é trabalho manual aceitável (o fallback é só o "modo degradado"; não precisa ser idêntico).

### 2.3 Comportamento do chip ao clicar

**Decisão:** clicar no chip **preenche o input e dá foco** (deixa o user editar antes de enviar) — menos "mágico", mais controle. (Alternativa: enviar direto — `sendOnClick: true` no shape sugere isso, mas a recomendação é preencher; o implementer/strategist confirma na red phase; o critério mínimo: o chip aciona uma pergunta útil.)

---

## 3. Decisão

### 3.1 `GET /api/coach/suggestions`

- Query params: `?route=<route>` (obrigatório-ish — rota desconhecida ou vazia → set genérico, **200 não 400**); opcionalmente campos do page context (ex `?activeTab=`).
- Response: `{ suggestions: Array<{ id: string; text: string; sendOnClick: true }> }` — 2-4 itens.
- `requireAuth`; handler com `injectedStorage?` (lesson #34). Internamente chama `computeSuggestions(userId, route, ctx, storage)`.

### 3.2 `computeSuggestions` — check leve de estado + cache

Faz 1-2 queries baratas (cacheadas 30s por user): tem downswing? (`getDashboardStats('7d')` ROI negativo / `detectLeaks` high); tem dados? (`getLastUploadAt` null / volume=0); (eventualmente) sessão sem reconciliar. Aplica o mapa rota→sugestões com as variantes de estado. Cache: `Map<userId, { suggestions, expiresAt }>` TTL 30s; `_resetSuggestionsCacheForTests()` exportado e chamado em `beforeEach` dos testes do service (lesson #21). Erro em qualquer query → cai pra as sugestões genéricas por rota (safe — não quebra; lesson #9).

### 3.3 Mapa rota→sugestões (não exaustivo — strategist refina)

| Rota / estado | Sugestões (2-4) |
|---|---|
| `/dashboard` ou `/inicio` com downswing detectado (ROI negativo na semana / `detectLeaks` high) | "Por que estou perdendo essa semana?" · "Isso é variância ou erro?" · "Quais meus leaks principais agora?" |
| `/dashboard` sem downswing, com dados | "Como está meu ROI por site?" · "Quais meus leaks principais?" · "Sugira foco de estudo pra essa semana" |
| Qualquer rota, user **sem dados** (volume=0, sem import) | "Como importo meus torneios?" · "O que o Grindfy faz?" · "Por onde eu começo?" |
| `/bankroll` | "Como está minha banca?" · "Quanto posso sacar com segurança?" · "Simular: e se eu perder 10 buy-ins?" |
| `/grade-planner` ou `/grade` | "Sugira uma grade pra essa semana" · "Esses torneios cabem na minha banca?" · "Qual o melhor horário pra eu jogar?" |
| `/grind` ou `/grind-live` | "Como foi minha última sessão?" · "Tem algum spot que vale revisar?" · "Como está meu mental hoje?" |
| `/estudos` | "O que devo estudar agora?" · "Como está meu progresso no foco do mês?" · "Quanto tempo de estudo eu registrei?" |
| `/biblioteca` | "Qual aula você recomenda pra mim?" · "Tem conteúdo sobre [foco do mês]?" |
| `/stats` | "Meus stats batem com o esperado?" · "Algum stat fora do padrão?" |
| `/coach-ai` (sem contexto específico) | "O que mudou na minha semana?" · "Quais meus leaks?" · "Sugira meu próximo passo" |

(O `[foco do mês]` é interpolado do `aiStructuredProfile.focoDoMes` quando disponível — senão a sugestão genérica.)

### 3.4 Frontend

`ChatPanel` (e o `MiniChat`) renderizam as sugestões como chips abaixo do título "Grindfy AI" **quando `messages.length === 0`** (tela vazia). `useQuery(['/api/coach/suggestions', route])` (lesson #13 — `apiRequest` JSON; o fetch é best-effort — try/catch + fallback estático se falha; lesson #29 — se o `MiniChat` em página standalone der "No QueryClient", encapsular em ErrorBoundary local ou tornar o fetch best-effort com fallback). Clicar no chip → preenche o input + foco (ou `sendMessage(text)` — conforme decisão §2.3). Quando há mensagens, os chips somem (ou viram um botão "sugestões" discreto). Reusa o `useCoachPageContext` pra saber a rota. Fallback estático: `client/src/lib/quickSuggestionsFallback.ts` (subset do mapa, só genéricas por rota).

---

## 4. Consequências

### Positivas
- Anti-blank-page resolvido — o user sempre tem 2-4 perguntas úteis pra clicar; reduz a fricção de "não sei o que perguntar".
- Sugestões relevantes — o servidor injeta variantes de estado (downswing → "por que estou perdendo?"; sem dados → "como importo?"); não é só mapa burro por rota.
- Custo zero, latência zero — não-LLM; o check de estado é cacheado 30s.
- Resiliente — endpoint falha → frontend cai no mapa estático genérico; não quebra a tela.
- Fácil de iterar — o mapa é um módulo (`server/coach/quickSuggestions.ts`); o strategist pode refinar sem mexer em lógica.

### Negativas / trade-offs
- Um endpoint + uma camada de cache + um módulo de mapa + um fallback frontend (duplicação parcial do mapa). Aceito — o fallback é só o modo degradado, não precisa ser idêntico.
- Manter o mapa server e o fallback frontend em sincronia é trabalho manual. Mitigação: o fallback é só as genéricas por rota (subset estável); as variantes de estado só existem no server.
- O check de estado adiciona 1-2 queries por abertura de chat (cacheadas 30s) — trivial.

### Neutras
- Substitui o conceito legado de "prompt starters" — `CoachAI.prompt-starters.test.tsx` (já `describe.skip`) pode ser substituído por testes do novo endpoint/UI ou ficar skip.
- O mapa rota→sugestões é refinável pelo strategist no sub-handoff de RF-12 (UX).

---

## 5. Notas para o test-writer

- **`GET /api/coach/suggestions?route=dashboard`:** `{ suggestions: [...] }` 2-4 itens, cada `{ id, text, sendOnClick }`. User **com downswing** → sugestões incluem variantes de "por que estou perdendo / variância"; user **sem dados** (qualquer rota) → sugestões de import/onboarding. `?route=bankroll` → sugestões de banca/saque/simular. Rota desconhecida ou `?route=` vazio → set genérico, **200** (não 400). Handler com `injectedStorage?` (lesson #34) — mockar `storage` (validar shape real de `getDashboardStats`/`detectLeaks`/`getLastUploadAt` — lesson #3).
- **Cache:** TTL ~30s por user (lesson #21); `_resetSuggestionsCacheForTests()` exportado e chamado em `beforeEach` dos testes do service — senão runs subsequentes herdam o cache.
- **`ChatPanel`:** `messages.length === 0` → renderiza os chips clicáveis; clicar preenche o input (ou envia — conforme decisão); com mensagens → chips somem (ou viram botão discreto). Endpoint falha → frontend usa o set estático por rota (não quebra; sem erro de console fatal). Testes de componente com `await import` (lesson #14/#26). `apiRequest` mock retorna JSON parseado (lesson #13). Se `MiniChat` standalone der "No QueryClient" — ErrorBoundary local ou fetch best-effort (lesson #29).
- **Lessons:** #3, #9, #13, #14/#26, #21, #29, #34.

## 6. Referências

- Spec: `Docs/specs/sprint-ai-1b.md` (RF-12)
- Plano: `Docs/strategy/ai-agents-improvement-plan-2026-05-11.md` (Tema C — C4 anti-blank-page)
- ADR-149 (page context), ADR-150 (hub), ADR-148 (agente único)
- Módulos: `server/coach/quickSuggestions.ts` (novo), `client/src/lib/quickSuggestionsFallback.ts` (novo), `client/src/hooks/useCoachPageContext.ts` (existente)
- CLAUDE.md §9
