# ADR-150: Hub `/coach-ai` — layout de tabs (Chat / Relatórios e avisos / Histórico de ações / Preferências) + esqueleto da timeline de relatórios

## Status
Aceito

## Data
2026-05-12

## Sprint
AI-0B (`Docs/specs/sprint-ai-0b.md`, RF-07)

## Decision owner
system-architect (UX refinável pelo strategist no sub-handoff de RF-07; founder valida no marco)

## Related
- Depende de: ADR-148 (consolidação — o hub mostra o agente único, não 3 coaches), ADR-149 (page context — o hub monta `{ route: 'coach-ai', activeCoachType }`).
- Reusa: ADR-125 (padrão de tabs URL-persisted em `/coach` via `useTabFromUrl`), endpoints `/api/coach/audit` + `/api/coach/preferences` (Sprint Coach-0).
- **Não** mexe na página `/coach` (GradePlanner — ADR-125): essa é o "hub de planejamento", outra página. (`/coach-ai` ≠ `/coach`.)
- Diagrama: `Docs/architecture/diagrams/coach-ai-0b/coach-ai-hub-wireframe.mermaid`.

---

## 1. Contexto

A página `/coach-ai` (`client/src/pages/CoachAI.tsx`, ~415 linhas) é hoje um chat simples com 3 abas seletoras de coach (Mental / Torneios / Técnico — via `useState` local, não URL-persisted), sidebar de sessões, streaming SSE. `MiniChat.tsx` é um chat compacto reusável que também tem 3 abas de coach.

Com a consolidação (ADR-148), não há mais 3 coaches — há o **Grindfy AI** (agente único), e o `coachType` vira "lente inicial". A `/coach-ai` precisa refletir isso. Além disso, o plano de melhoria (Fase 1) prevê **relatórios automáticos** (Daily/Weekly/Monthly/Quarterly), **nudges proativos** e **onboarding conversacional** — tudo isso vai ter UI no hub `/coach-ai`. Mas **nenhum deles existe ainda** (não há endpoint de relatórios; os 8 toggles de nudge existem em `coach_preferences` mas a maioria dos crons é Fase 1).

Endpoints que **já existem** (Sprint Coach-0): `GET /api/coach/audit` (lista cronológica de `coach_actions`), `POST /api/coach/audit/:id/dismiss`, `POST /api/coach/audit/export` (JSON); `GET /api/coach/preferences` (retorna `{ nudges: { bSnapshot, bLeak, bStudy, bVolume, bGrade, bDownswing, bLife, bMental }, quietHours..., caps... }`), `PUT /api/coach/preferences`. **Não há UI no frontend que os consuma** (verificado: nenhum componente em `client/src/` faz `useQuery` em `/api/coach/audit` ou `/api/coach/preferences`).

A **pergunta central:** como estruturar o hub `/coach-ai` para (a) refletir o agente único agora e (b) deixar o layout pronto para a Fase 1 encaixar sem refatorar — sem implementar o que não existe.

### Restrições
- **Não implementar features que não existem** — timeline de relatórios funcional (não há relatórios), nudges proativos no hub, onboarding conversacional → Fase 1. Só **esqueleto/layout** + EmptyState.
- **Reusar, não duplicar** — a lógica de `/api/coach/audit` e `/api/coach/preferences` deve ter um componente reusável; se a página de settings já tiver um (não tem hoje), reusar; senão, criar um simples.
- **Consistência com `/coach`** — ADR-125 já usa tabs URL-persisted (`?tab=`, `useTabFromUrl`); o hub `/coach-ai` deve seguir o mesmo padrão.
- **Não regredir o chat** — quem usa o chat hoje continua usando; a capacidade de "começar focado em X" (lente) não some.
- **Lessons aplicáveis** — #27 (Radix Tabs reage a `onMouseDown` — `onClick` redundante em `<TabsTrigger>` controlado), #28 (`vi.mock` por path — re-export shim), #29 (`useQuery` sem provider → ErrorBoundary local), #30 (hook test jsdom — config-level).

---

## 2. Decisão

**`/coach-ai` vira um hub com tabs URL-persisted (`?tab=chat|reports|audit|prefs`, default `chat`) — reusa `useTabFromUrl(['chat','reports','audit','prefs'], 'chat')` como `/coach` (ADR-125). 4 tabs:**

| Slug `?tab=` | Label (PT-BR) | Conteúdo | Estado |
|---|---|---|---|
| `chat` (default) | Chat | Chat do Grindfy AI (agente único) + chips de "lente/foco" (Mental / Seleção / Técnico) que setam o `coachType` enviado + sidebar de sessões + streaming SSE + page context `{ route: 'coach-ai', activeCoachType }` | **Funcional** — reforma do chat existente |
| `reports` | Relatórios e avisos | `EmptyState` explicativo: "Os relatórios automáticos do Grindfy AI (semanal, mensal) vêm em breve." — **sem fetch de nada** (não há endpoint) | **Esqueleto** — só layout/posição; Fase 1 (AI-1B) pluga `GET /api/coach/reports` sem mexer no layout |
| `audit` | Histórico de ações | Lista cronológica de `coach_actions` — consome `GET /api/coach/audit`; ações de dismiss (`POST /api/coach/audit/:id/dismiss`) + export (`POST /api/coach/audit/export`) | **Funcional** — componente reusável novo (`CoachAuditPanel`) |
| `prefs` | Preferências | 8 toggles de nudge (`bSnapshot, bLeak, bStudy, bVolume, bGrade, bDownswing, bLife, bMental`) + quiet hours (2 time inputs) + caps (2 number inputs) — `useQuery` no `GET /api/coach/preferences`, `useMutation` no `PUT` | **Funcional** — componente reusável novo (`CoachPreferencesPanel`) |

### 2.1 Chat tab — agente único + chips de lente

- As 3 abas seletoras (Mental / Torneios / Técnico) **deixam de ser "qual coach"**. Decisão: **3 chips pequenos de "foco/lente"** ("Foco: Mental | Seleção | Técnico") que setam o `coachType` enviado ao `/api/coach/chat` (= lente inicial, ADR-148 §2.3). Visualmente mais leve que abas; não promete "3 coaches separados". O título da página vira **"Grindfy AI"** (não "Coach Mental").
- O `coachType` da lente **pode** ser URL-persisted via um hook estilo `useTabFromUrl(['mental','tournament','technical'], 'technical')` (param `?focus=`) — **recomendado mas não obrigatório** neste sprint (pode ser followup). Se feito: refresh F5 / bookmark `/coach-ai?tab=chat&focus=mental` mantém a lente; `?focus=invalido` cai no default e limpa o param.
- Empty state e placeholder do textarea passam a falar do **"Grindfy AI"** (não "Coach Mental/Técnico/de Torneios").
- `pageContext` (ADR-149): a tab Chat monta `{ route: 'coach-ai', activeCoachType: <coachType> }` e o passa ao `useCoachChat` (que o inclui no body do POST).

### 2.2 Reports tab — esqueleto, NÃO funcional

- `EmptyState` (componente já existente no design system) com copy explicativo + ícone. **Nenhum `useQuery`** — não há `GET /api/coach/reports` (esse é Fase 1 AI-1B). Não quebra, não faz fetch de endpoint inexistente.
- A posição/layout fica pronta: a Fase 1 substitui o `EmptyState` por uma timeline (`<ReportsTimeline />` consumindo `GET /api/coach/reports`) **sem mexer no layout do hub** (a tab já existe, só troca o conteúdo).

### 2.3 Audit tab — reusa o endpoint existente

- Componente novo `client/src/components/coach/CoachAuditPanel.tsx` (ou nome equivalente): `useQuery(['coach','audit'], () => apiRequest('GET', '/api/coach/audit'))` → lista cronológica de `coach_actions` (cada uma com tipo, descrição, status, timestamp); botão de dismiss por item (`useMutation` → `POST /api/coach/audit/:id/dismiss`); botão de export (`POST /api/coach/audit/export` → download JSON).
- **Se existir** uma página `/settings/coach-actions` que já consome esses endpoints (não existe hoje), o `CoachAuditPanel` extrai a lógica dela e ambos reusam o componente. Como não existe, o `CoachAuditPanel` é criado do zero aqui — barato (lista + 2 mutations).
- **Critério mínimo:** o hub tem uma tab que mostra o audit de ações do Coach, reusando o componente (não duplicando a lógica).
- Lesson #29: o `useQuery` é encapsulado de forma que um teste de layout do hub sem `QueryClientProvider` não dê "No QueryClient set" hard error — extrair o fetcher como sub-componente isolado por uma `ErrorBoundary` local, OU o teste provê o provider.

### 2.4 Prefs tab — reusa o endpoint existente

- Componente novo `client/src/components/coach/CoachPreferencesPanel.tsx`: `useQuery(['coach','preferences'], () => apiRequest('GET', '/api/coach/preferences'))` → preenche 8 switches + 2 time inputs (quiet hours start/end) + 2 number inputs (caps); `useMutation` → `PUT /api/coach/preferences` no save (com optimistic update opcional + toast de confirmação — lesson #21 sobre cache server-side não se aplica aqui, é client cache).
- **Critério mínimo:** o hub tem uma tab que mostra e edita as preferências de nudge. (A maioria dos nudges ainda não tem cron — Fase 1 — mas os toggles já existem na infra `coach_preferences`.)
- Lesson #13: `apiRequest` retorna JSON parseado, não `Response` — mocks em testes retornam o JSON.

### 2.5 MiniChat.tsx

- Ajustar para o agente único: título "Grindfy AI" (não "Coach Mental/etc"); 3 chips de **lente/foco** em vez de 3 abas de coach; page context da rota onde está montado (ADR-149 — `useCoachPageContext` lê `useLocation`). **Não vira um hub** — é só o chat compacto. Empty state e placeholder falam do "Grindfy AI".

### 2.6 `/settings/coach-actions` (se existir)

Não existe hoje. **Não criar.** Se um dia existir, pode virar um redirect para `/coach-ai?tab=audit` (decisão de baixo risco — não vale ADR só pra isso).

### 2.7 Não-objetivos do RF-07 (reafirmados)

- Implementar a timeline de relatórios funcionalmente (Fase 1 AI-1B).
- Nudges proativos no hub (Fase 1).
- Onboarding/diagnóstico conversacional no hub (Fase 1).
- Quick suggestions contextuais ricas (que mudam por página/estado — anti-blank-page completo — Fase 1). Neste sprint, no máximo um conjuntinho **fixo** de chips de exemplo no hub ("Analisar meu ROI por site", "Quais meus leaks?", "Simular: perder 10 buy-ins", "Sugerir grade da semana") — **opcional, não obrigatório**.
- Mexer na página `/coach` (GradePlanner — ADR-125). Fora do escopo.

---

## 3. Alternativas consideradas

### A. Tabs URL-persisted no hub (`?tab=chat|reports|audit|prefs`) — ESCOLHIDA

Reusa o padrão de `/coach` (ADR-125). Já argumentado.

### B. Layout de painel lateral (chat fixo + painéis colapsáveis para audit/prefs/reports)

- **Prós:** o chat fica sempre visível; audit/prefs são "ferramentas" laterais.
- **Contras:** inconsistente com `/coach` (que usa tabs); o "hub" mental model pede tabs peer (cada coisa tem seu lugar); painel lateral em mobile é hostil (a sidebar de sessões já compete por espaço). **Descartada** — tabs é consistente e mais simples.

### C. Manter as 3 abas de coach + adicionar audit/prefs como links em settings

- **Prós:** mínima mudança no `/coach-ai`.
- **Contras:** as 3 abas de coach **não fazem mais sentido** (agente único — ADR-148); deixá-las contradiz a consolidação. Audit/prefs em settings deixa o hub incompleto (o plano quer o loop fechado **no hub**). **Descartada** — o sprint exige o hub.

### D. Implementar a timeline de relatórios já agora (com dados mock)

- **Prós:** o hub fica "completo" visualmente.
- **Contras:** não há endpoint de relatórios; mockar dados no frontend é dívida que a Fase 1 vai ter que limpar; o EmptyState comunica honestamente "vem em breve" sem prometer o que não existe. **Descartada** — esqueleto/EmptyState é o escopo certo (a spec é explícita).

---

## 4. Consequências

### 4.1 Positivas
- **Hub coerente** — chat (agente único) + relatórios (esqueleto) + audit + preferências, tudo num lugar. Loop fechado preparado para a Fase 1.
- **Consistente com `/coach`** — mesmo padrão de tabs URL-persisted (`useTabFromUrl`).
- **Audit e preferences ganham UI** — os endpoints do Sprint Coach-0 finalmente têm tela.
- **Layout pronto para a Fase 1** — a tab `reports` já existe; AI-1B só troca o EmptyState por uma timeline.
- **MiniChat alinhado** — agente único, chips de lente, page context da rota.
- **Não regride o chat** — capacidade de "começar focado em X" preservada (chips de lente).

### 4.2 Negativas
- **`CoachAI.tsx` cresce** — de chat simples para hub com 4 tabs + 2 componentes novos (`CoachAuditPanel`, `CoachPreferencesPanel`). Mitigação: extrair sub-componentes por tab (como ADR-125 prevê para `/coach`).
- **Testes de `CoachAI.tsx` quebram** — os que dependiam das 3 abas de coach (auto-scroll, delete-confirm, prompt-starters, session-search, skeletons) precisam ser atualizados. Lessons #27/#28/#29/#30 aplicáveis para as novas tabs/hooks.
- **2 componentes novos** (`CoachAuditPanel`, `CoachPreferencesPanel`) — mais código + testes. Aceito; são simples (lista + 2 mutations / form de 8 switches + 4 inputs).
- **Esqueleto da tab `reports`** — alguém pode achar "incompleto"; o EmptyState comunica que é intencional.

### 4.3 Neutras
- **`coachType` URL-persisted (`?focus=`)** — recomendado mas opcional; pode ser followup.
- **Quick suggestions fixas** — opcional; embrião da versão rica da Fase 1.
- **`/settings/coach-actions`** — não existe; se um dia existir, redireciona para `/coach-ai?tab=audit`.

---

## 5. O que o test-writer precisa saber

**Testes existentes que quebram (mudança intencional):** `tests/...CoachAI...` que dependiam das 3 abas de coach (auto-scroll, delete-confirm, prompt-starters, session-search, skeletons) — atualizar para os chips de lente + as 4 tabs do hub. `tests/...MiniChat...` que dependiam das 3 abas — atualizar para os chips de lente.

**Testes novos esperados:**
1. `/coach-ai` mostra "Grindfy AI" (não "Coach Mental/Técnico/de Torneios") como título.
2. `/coach-ai` tem 4 tabs acessíveis: Chat (default), Relatórios e avisos, Histórico de ações, Preferências. Default `?tab=chat`. (Radix Tabs: `fireEvent.click(tabTrigger)` num teste RTL não alterna a menos que o `<TabsTrigger>` tenha `onClick` redundante — lesson #27; usar `userEvent.click` ou adicionar o `onClick`.)
3. Tab "Relatórios e avisos" mostra um `EmptyState` explicativo — **não** faz `useQuery` de endpoint inexistente; não quebra; sem erro de console.
4. Tab "Histórico de ações" lista os `coach_actions` (mock de `GET /api/coach/audit` → array de ações). Renderizada standalone num teste sem `QueryClientProvider` → o fetcher é isolado por ErrorBoundary local (lesson #29) ou o teste provê o provider — não dá "No QueryClient set" hard error.
5. Tab "Preferências" mostra 8 toggles de nudge + 2 time inputs + 2 number inputs; `GET /api/coach/preferences` inicial preenche os valores; desligar `bStudy` + save → `PUT /api/coach/preferences` chamado com o estado novo. (Mock de `apiRequest` retorna JSON parseado — lesson #13.)
6. Chips de lente: clicar "Foco: Mental" → o `coachType` enviado ao `/api/coach/chat` muda para `'mental'`; o page context passa a ser `{ route: 'coach-ai', activeCoachType: 'mental' }`. Em nenhum caso a UI promete "3 coaches separados".
7. `pageContext` é enviado no body do POST `/api/coach/chat` a partir de `/coach-ai` (`{ route: 'coach-ai', activeCoachType }`) e a partir do `MiniChat` (page context da rota onde está montado, se instrumentada — senão sem `pageContext`).
8. `MiniChat` não promete "3 coaches" — usa o conceito de lente/foco e o agente único; empty state e placeholder falam do "Grindfy AI".
9. (Se `?focus=` URL-persisted for implementado) refresh F5 / bookmark `/coach-ai?tab=chat&focus=mental` mantém a lente; `?focus=invalido` cai no default e limpa o param (estilo `useTabFromUrl`).

**Lessons aplicáveis:** #13 (`apiRequest` retorna JSON), #21 (não confundir cache server-side com client cache aqui), #27 (Radix Tabs `onMouseDown` — `onClick` redundante em `<TabsTrigger>` controlado), #28 (`vi.mock` por path — re-export shim se um teste mockar um componente em path diferente; aplicável se `CoachAuditPanel`/`CoachPreferencesPanel` forem mockados de path X mas importados de Y), #29 (`useQuery` sem provider → ErrorBoundary local), #30 (hook test jsdom — config-level: incluir `.test.ts` com `renderHook` no projeto `client`), #31 (`*/` em comentário JSDoc fecha o bloco — evitar em path patterns nos comentários dos testes).

---

## 6. Confiança

**Média-alta.** O padrão de tabs URL-persisted já foi validado em `/coach` (ADR-125 — confiança alta lá). Os endpoints de audit/preferences já existem e são simples de consumir. O risco é a reforma de `CoachAI.tsx` quebrar testes legacy — esperado e documentado (§5); o test-writer reescreve. A decisão de "esqueleto, não funcional" para a tab `reports` é conservadora e segue a spec à risca. Pontos opcionais (`?focus=` URL-persisted, quick suggestions fixas) estão sinalizados como não-obrigatórios.

## Referências
- Spec: `Docs/specs/sprint-ai-0b.md` (RF-07, RF-08)
- ADR-125 (tabs URL-persisted em `/coach` — padrão reusado), ADR-148 (consolidação — agente único, lente), ADR-149 (page context — `coach-ai` variant)
- Endpoints: `GET/POST /api/coach/audit*`, `GET/PUT /api/coach/preferences` (Sprint Coach-0 — `server/routes/coach.ts` linhas ~957-986)
- `client/src/pages/CoachAI.tsx`, `client/src/components/MiniChat.tsx`, `client/src/components/UpgradeCoachModal.tsx`, `client/src/hooks/useTabFromUrl.ts`, `client/src/hooks/useCoachChat.ts`, `client/src/hooks/useCoachPageContext.ts` (novo), `client/src/components/coach/CoachAuditPanel.tsx` (novo), `client/src/components/coach/CoachPreferencesPanel.tsx` (novo)
- Diagrama: `Docs/architecture/diagrams/coach-ai-0b/coach-ai-hub-wireframe.mermaid`
- Lessons #13, #21, #27, #28, #29, #30, #31 (`Docs/architecture/lessons-learned.md` / CLAUDE.md §9)
