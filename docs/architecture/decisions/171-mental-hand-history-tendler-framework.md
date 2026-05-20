# ADR-171: Mental Hand History (framework Tendler) — tabela dedicada `mental_hand_history` (situação + emoção enum + resposta real vs ideal + tags + linked_grind_session_id FK ON DELETE SET NULL) com 2 índices `(user_id, occurred_at DESC)` + `(user_id, emotion)` + tool LLM `log_mental_hand` write/confirm Pro+/Trial via `isToolEligibleTier` + endpoints HTTP `GET/POST/DELETE /api/coach/mental-hands` (POST aberto a free com rate limit; DELETE com ownership check 404-not-403) + viewer/form UI em `MentalHandHistoryList` + `MentalHandForm` na tab "Mental" do `/coach-ai` (free pode usar UI form, tool LLM gated) + Quarterly Report seleciona top 3 highlights por intensidade/recência via `selectTopHighlights`

## Status
Aceito

## Data
2026-05-20

## Sprint
AI-2B (`Docs/specs/sprint-ai-2b.md` — RF-01.2, RF-06; Q-E locked 2026-05-20)

## Decision owner
system-architect (founder locked Q-E em 2026-05-20: tabela dedicada, não JSONB em `warmup_rituals` — queryability + filtros por emoção/tempo indexáveis)

## Related
- Depende de: ADR-145/146 (`coachToolRunner` confirm v1), ADR-148 (Grindfy AI agente único — tool no registry), ADR-167 (`isToolEligibleTier` — Pro+/Trial recebe tool; Free não), ADR-169 (Quarterly Report consome top 3 highlights em `mentalHandHighlights`).
- Reusa: `grind_sessions.id` (FK ON DELETE SET NULL — preserva mental hand quando sessão é deletada); `coach_actions` (undo via DELETE do row, janela 30min).
- Sucessor de: nada — primeiro modelo de Mental Hand History (Tendler "Mental Game of Poker"). Substitui ideia D5 inicial de "JSONB em warmup_rituals.sessionIntention" (queryability ruim, overload semântico).
- Diagramas: `Docs/architecture/diagrams/coach-ai-2b/mental-hand-history-er.mermaid`.

---

## 1. Contexto

Framework Tendler ("The Mental Game of Poker"): jogador anota "mental hands" — situações onde a decisão mental/emocional foi crítica. Estrutura padrão: (1) situação, (2) emoção dominante, (3) resposta real (o que fez), (4) resposta ideal (o que deveria ter feito). User revisita esses registros para condicionar resposta ideal em situações similares.

A pergunta central: schema (Q-E — tabela dedicada vs JSONB em `warmup_rituals.sessionIntention`); tool LLM vs UI form direto; tier gating de captura; viewer.

### Restrições

- **Lesson #2 (`data-testid`):** UI usa testid estáveis.
- **Lesson #19 (CTAs):** form e viewer linkam para rotas existentes.
- **Lesson #28 (mock paths):** testes mockam handlers via path canônico.
- **Lesson #34 (`injectedStorage?`):** handlers HTTP aceitam 3º arg.
- **Privacidade (Q6 founder + spec §Requisitos Não-Funcionais):** Mental Hand é texto livre sensível — nunca enviado a 3rd parties **exceto** Anthropic via Quarterly Report context, e mesmo lá só os 3 highlights, não tudo.

### O que está fora de escopo

- Upload de mão de poker estruturada (FK para uma tabela `hands` que não existe ainda) — tags texto livre por enquanto.
- Análise LLM por entrada (custo proibitivo se user gravar 100/mês). LLM em chat pode comentar sob demanda quando user pedir; Quarterly Report agrega top 3 com 1 padrão observado.
- Compartilhamento com coach humano externo — feature de paid tier futura.
- Edição de entries existentes (só CREATE + DELETE no MVP). Update via DELETE + INSERT.

---

## 2. Decisão

Adotada: **tabela dedicada `mental_hand_history` + tool LLM gated + endpoints HTTP abertos (free via form direto) + viewer UI**.

### 2.1. Schema

```sql
CREATE TABLE mental_hand_history (
    id                          VARCHAR(21) PRIMARY KEY,
    user_id                     VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    occurred_at                 TIMESTAMP NOT NULL,
    situation                   TEXT NOT NULL,
    emotion                     VARCHAR(32),
    real_response               TEXT NOT NULL,
    ideal_response              TEXT NOT NULL,
    tags                        TEXT[],
    linked_grind_session_id     VARCHAR(21) REFERENCES grind_sessions(id) ON DELETE SET NULL,
    created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT mental_hh_emotion_enum
        CHECK (emotion IS NULL OR emotion IN ('frustration','tilt','fear','overconfidence','fatigue','other'))
);
CREATE INDEX idx_mental_hh_user_occurred ON mental_hand_history(user_id, occurred_at DESC);
CREATE INDEX idx_mental_hh_user_emotion   ON mental_hand_history(user_id, emotion);
```

- `emotion` enum CHECK — defensivo, mas nullable (user pode não classificar).
- `tags` `text[]` — array nativo PG. Sem índice GIN no MVP (queries por tag específica raras; follow-up se virar hot path).
- `linked_grind_session_id` ON DELETE SET NULL — preserva mental hand quando sessão é deletada (registro mental sobrevive ao tracking da sessão).

### 2.2. Tool LLM `log_mental_hand` (RF-06.1)

- Handler: `server/coachTools/handlers/logMentalHand.ts`.
- Input zod `.strict()`:
  ```ts
  {
    situation: string,                  // max 1000
    emotion: z.enum(['frustration','tilt','fear','overconfidence','fatigue','other']),
    realResponse: string,               // max 1000
    idealResponse: string,              // max 1000
    tags?: z.array(z.string()).max(10).optional(),
    linkedGrindSessionId?: string,
    occurredAt?: string,                // ISO; default = now (no execute)
  }
  ```
- Preview: o que será gravado (echo do input + `id` proposto via `nanoid()`).
- Execute: INSERT em `mental_hand_history`.
- `requiresConfirmation: true` (lesson "default mínimo" #11 — coisa que mexe em DB sempre confirma), `auditLevel: 'persist'`.
- Gating: `isToolEligibleTier(user, 'log_mental_hand')` Pro+/Trial. Free não vê a tool no `listToolsForUser`.
- Undo: DELETE da row dentro de janela 30min (consistente AI-2A).

### 2.3. Endpoints HTTP (RF-06.2)

| Método | Rota | Auth | Tier | Body / Query | Descrição |
|---|---|---|---|---|---|
| GET | `/api/coach/mental-hands` | JWT | Free+ | `?limit=20&offset=0&emotion=...` | Lista paginada com filtro por emoção. |
| POST | `/api/coach/mental-hands` | JWT | Free+ | `{ situation, emotion, realResponse, idealResponse, tags?, linkedGrindSessionId?, occurredAt? }` | Cria entry direto (UI form sem chat). |
| DELETE | `/api/coach/mental-hands/:id` | JWT + ownership | Free+ | — | Hard delete. Ownership check `WHERE id=$1 AND user_id=$userPlatformId` → 404 (não 403 — não leakar existência). |

- **Free pode usar UI form** (POST direto) — sem custo LLM, sem gate. Tool LLM continua gated. Política: registro é gratuito, automação via LLM é Pro.
- Rate limit POST: 20 entries/dia/user (anti-abuse — UI form pode ser usada para spam).

### 2.4. UI — `MentalHandHistoryList` + `MentalHandForm`

- Hub `/coach-ai` aba "Mental" (mesma do RF-05 ADR-170) ganha section abaixo do Inchworm.
- `MentalHandHistoryList.tsx`:
  - Lista paginada (20/page).
  - Filtro por emoção (Radix Select).
  - Botão "+ Nova" → abre `MentalHandForm` modal (chama POST endpoint direto, NÃO via tool LLM — economiza tokens).
  - Cada row: data, emoção (badge colorido), situação resumida (truncada 80 chars), botão expand para ver `realResponse` + `idealResponse` completos, botão delete (confirm dialog).
- `MentalHandForm.tsx`: form Zod-validated. Submit → POST `/api/coach/mental-hands`.
- `data-testid`: `mental-hand-list`, `mental-hand-form`, `mental-hand-card-{id}`, `mental-hand-delete-{id}`, `mental-hand-emotion-filter`.
- Lesson #27 (Radix Tabs onMouseDown): se UI usar sub-tabs dentro da aba "Mental" (Inchworm vs Mental Hands), passar `onClick` redundante.

### 2.5. Integração com Quarterly Report (RF-03.3 seção 13)

- `selectTopHighlights(rituals, n)` em `server/services/mentalHandsSelector.ts`:
  - Ordena por `occurred_at DESC` (recência) + agrupa por `emotion`.
  - Seleciona top N (default 3) priorizando diversidade de `emotion` (1 de `tilt`, 1 de `frustration`, 1 de outra — se houver) — máximo 1 do mesmo `emotion`.
  - Fallback: se só houver 1 emoção, pega os 3 mais recentes dela.
- Output vai em `ReportContent.mentalHandHighlights` array:
  ```ts
  Array<{ id: string, occurredAt: string, emotion: string, situation: string, idealResponse: string }>
  ```
- Markdown renderiza seção 13 — situação + emoção (badge) + ideal response.
- LLM no quarterly compõe 1 padrão observado data-grounded ("Frustração predominou em 6 de 12 mental hands no trimestre — foco recomendado: condicionar resposta ideal pós-bad-beat.") — não inventa fora dos dados (lesson #11).

---

## 3. Opções consideradas

### Opção A — Tabela dedicada `mental_hand_history` (Q-E lock) — ESCOLHIDA
**Prós:**
- Queryability — filtros por emoção/tempo são indexáveis nativos PG.
- Schema explícito → Drizzle Zod gera schemas válidos.
- ON DELETE SET NULL em `linked_grind_session_id` preserva mental hand.
- Sem overload semântico (warm-up = pré-sessão; mental hand = qualquer momento).
- LLM no quarterly recebe top 3 via query SQL barata.
**Contras:**
- 1 tabela a mais para manter.
- Schema rígido — mudança futura (ex: adicionar `intensity` 1-5) exige migration.

### Opção B — JSONB em `warmup_rituals.sessionIntention`
**Prós:**
- Zero migration nova.
**Contras:**
- Overload semântico — `sessionIntention` é {focus, tiltPlan, stopCriteria}, NÃO log de mental hands.
- Mental hands podem ser registradas FORA de um warm-up (pós-grind, durante o dia, em uma revisão semanal) — não fica claro onde encaixar.
- Queryability ruim — filtro por emoção pesado.

### Opção C — Reusar `starred_hands` (tabela existente, com type novo `'mental'`)
**Prós:**
- Reusa tabela existente que já tem `notes`, `tags`, `userId`, `sessionId`.
**Contras:**
- `starred_hands` é "mãos críticas do poker durante cooldown/grind-live/drill" — semântica diferente.
- `type` enum já tem 9 valores (tilt/leak/soulread/...), adicionar `mental` polui mais.
- `starred_hands` não tem `realResponse`/`idealResponse` separados — colidiria com `notes` (texto livre).

---

## 4. Consequências

### Positivas
- Framework Tendler ganha schema próprio + tool LLM + UI form + viewer.
- Quarterly Report ganha seção 13 (3 highlights) data-grounded.
- Free pode usar (UI form) — engajamento; tool LLM Pro/Trial é o "premium" do registro automático.
- ON DELETE SET NULL preserva histórico mental quando sessão é deletada.
- Privacidade — texto sensível só vai para Anthropic via top 3 (não tudo).

### Negativas
- Schema novo → migration 0071 + Drizzle Zod schemas + endpoints + UI + tool + viewer = ~600 linhas de código.
- Sem GIN em `tags` — query por tag específica O(n). Aceito hoje (volume baixo); follow-up se virar hot.

### Neutras
- `selectTopHighlights` lógica de diversidade pode evoluir (priorizar por intensidade vs recência). Hoje recência + diversidade emoção. Founder valida em piloto.
- `linked_grind_session_id` ON DELETE SET NULL → row pode ficar órfã (sem session); ainda válida — mental hand sobrevive.

## Confiança
**Alta** — schema simples, semântica clara, framework Tendler estabelecido na comunidade poker. Privacidade endereçada com top 3 only.
