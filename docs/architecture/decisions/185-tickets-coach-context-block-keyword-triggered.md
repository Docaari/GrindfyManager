# ADR-185: Coach AI context block `buildTicketsContext` DINAMICO (append no system prompt, sem cache — segue padrao dos demais context builders); injecao CONDICIONAL por 4 keywords da spec (`ticket|satelite|grade|selecionar torneio`) OU `pageContext.surface ∈ {tournament-selector, grade-planner}`; format inventory ASCII compacto + ate 3 proximos a expirar; vazio quando 0 tickets ativos (early return — nao injeta bloco "vazio" pra preservar tokens)

## Status
Aceito

## Data
2026-05-21

## Sprint
D — Grind Live + Tickets cluster (`Docs/specs/sprint-grind-live-cluster.md`, RF-03.3 + spec original RF-08)

## Decision owner
system-architect (auto-mode defaults Q-D: 4 keywords da spec — NAO expandir; cache: bloco DINAMICO ephemeral padrao).

## Related
- Depende de: ADR-148 (Grindfy AI consolidacao single-agent — base prompt unico + bloco STATIC cacheado vs DINAMICO sem cache), ADR-019 (Coach prompt cache strategy — bloco DINAMICO NAO entra no `cache_control`), ADR-149 (page context plugado — `pageContext.surface` ja eh shape padronizado), ADR-037 (`tickets` table + `getActiveTicketsByUser` helper).
- Reusa: `server/coachSystemBuilder.ts` (`DynamicInputs`, `formatXxxBlock` helpers), `server/services/ticketService.ts` (helper `getActiveTicketsByUser` ja existe — Tickets-1), padrao "context builder" dos AI-1A/2A (`server/coach/contextBuilders/*` se existe; senao criar pasta).
- Sucessor de: nada — primeiro context builder de inventario fora dos relatorios.
- Diagramas: NAO. Bloco textual simples; nao justifica diagrama proprio.

---

## 1. Contexto

Coach hoje NAO sabe nada sobre tickets do user. Cenarios falham:
- User: "estou montando grade pra semana, o que voce sugere?" -> LLM nao prioriza torneios com ticket disponivel (gap RF-03.3 + RF-03.4).
- User: "quanto valor tenho em tickets parados?" -> LLM responde "[nao sei]" mesmo com 5 tickets ativos.
- User: "tenho um ticket pro Sunday Million expirando?" -> LLM nao tem dado.

Foundation existente:
- `getActiveTicketsByUser(userId)` ja retorna shape `{id, sourceName, valueUsd, expiresAt, status='available'}[]`.
- `coachSystemBuilder.ts` ja separa STATIC (cache) vs DINAMICO (no cache) e tem `DynamicInputs` shape extensivel.
- `pageContext` ja eh injetado (Sprint Coach-2A, ADR-149) com `surface ∈ { home | grade-planner | tournament-selector | grind-live | bankroll | study | ... }`.

Pergunta central: **(a)** injetar SEMPRE ou condicional; **(b)** se condicional, criterio; **(c)** formato (texto vs JSON); **(d)** posicao no prompt; **(e)** cache.

### Restricoes

- **Lesson #10 (DRY):** bloco DINAMICO usa padrao existente `formatBlock(...)` -> append na string final. NAO criar mecanismo de injecao novo.
- **Lesson #11 (default minimo):** bloco vazio NAO entra. Se 0 tickets ativos -> `buildTicketsContext()` retorna `null` + caller skipa append.
- **Lesson #36 (lazy schema em testes):** modulo `buildTicketsContext.ts` NAO importa `@shared/schema` no topo se usar `db` direto. Preferencia: chamar `storage.getActiveTicketsByUser()` (storage method ja eh "safe" pra teste).
- **ADR-019 (cache):** bloco DINAMICO NAO leva `cache_control: ephemeral`. **Trade-off:** ticket inventory muda relativamente raro (1x por sessao tipica) — mesmo assim, marcar ephemeral incorreria em risco de cache stale (user usa ticket, LLM continua vendo). Sem cache.
- **Sensibilidade keywords:** lower-case match + acentos normalizados. Match parcial OK (`"meu ticket"` contem `"ticket"`).

---

## 2. Decisoes

### 2.1 Localizacao do helper

`server/coach/contextBuilders/buildTicketsContext.ts`:

```ts
import type { DynamicInputs } from "../../coachSystemBuilder";
import { storage } from "../../storage";

export interface TicketsContextInput {
  userId: string;
  recentUserText?: string;        // ultimas N msgs do user (lowercased)
  pageContext?: { surface?: string } | null;
}

export interface TicketsContextBlock {
  text: string;                    // bloco markdown formatado pronto p/ append
  ticketCount: number;
  totalValueUsd: number;
}

const KEYWORDS = ["ticket", "satelite", "satélite", "grade", "selecionar torneio"];

export async function buildTicketsContext(
  input: TicketsContextInput
): Promise<TicketsContextBlock | null> {
  if (!shouldInject(input)) return null;
  const tickets = await storage.getActiveTicketsByUser?.(input.userId);
  if (!tickets || tickets.length === 0) return null;
  return formatBlock(tickets);
}

function shouldInject(input: TicketsContextInput): boolean {
  // surface-based gate
  if (input.pageContext?.surface === "tournament-selector") return true;
  if (input.pageContext?.surface === "grade-planner") return true;
  // keyword-based gate
  const txt = (input.recentUserText ?? "").toLowerCase();
  if (!txt) return false;
  return KEYWORDS.some((k) => txt.includes(k));
}

function formatBlock(tickets: any[]): TicketsContextBlock {
  // sort por expiresAt asc (null por ultimo)
  const sorted = [...tickets].sort((a, b) => {
    if (!a.expiresAt && !b.expiresAt) return 0;
    if (!a.expiresAt) return 1;
    if (!b.expiresAt) return -1;
    return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
  });
  const total = sorted.reduce((s, t) => s + (Number(t.valueUsd) || 0), 0);
  const top3 = sorted.slice(0, 3);
  const lines: string[] = [];
  lines.push(`## Inventario de tickets ativos`);
  lines.push(`Total: ${sorted.length} tickets (~$${total.toFixed(2)} USD).`);
  if (top3.length > 0) {
    lines.push(`Proximos a expirar:`);
    for (const t of top3) {
      const exp = t.expiresAt
        ? `em ${daysUntil(t.expiresAt)} dia(s)`
        : "sem data";
      lines.push(`- ${t.sourceName ?? "ticket"} ($${Number(t.valueUsd).toFixed(2)}) — ${exp}`);
    }
  }
  return { text: lines.join("\n"), ticketCount: sorted.length, totalValueUsd: total };
}

function daysUntil(expiresAt: string | Date): number {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}
```

### 2.2 Wire em `coachSystemBuilder.ts`

Adicionar a `DynamicInputs`:
```ts
ticketsContext?: { text: string; ticketCount: number; totalValueUsd: number } | null;
```

Em `buildDynamicBlock(inputs)` (ou equivalente), apos `pageContext` e antes do fim:
```ts
if (inputs.ticketsContext?.text) {
  dynamicText += `\n\n${inputs.ticketsContext.text}`;
}
```

Em `coachContext.ts` (caller do builder), invocar `buildTicketsContext({ userId, recentUserText, pageContext })` **antes** de chamar `buildSystemBlocks(...)`. Resultado vai pra `dynamicInputs.ticketsContext`.

### 2.3 Posicao no prompt

Apos `pageContext`, antes do fim do bloco DINAMICO. Justificativa: tickets sao contexto auxiliar — page context (onde user esta agora) tem precedencia, tickets complementam.

### 2.4 Cache

**NAO** `cache_control: ephemeral`. O bloco DINAMICO inteiro nao eh cacheado (ADR-019 + ADR-148). Mesmo se fosse ephemeral, ticket inventory pode mudar dentro da sessao (user usa ticket via tool `register_payment` ou cron expira). Sem cache evita stale silencioso.

### 2.5 Sensibilidade keywords

- Lower-case + Unicode NFKD strip diacriticos (`satélite` -> `satelite` no match). Implementacao: `txt.normalize("NFKD").replace(/[̀-ͯ]/g, "")`.
- Match `includes` (substring) — `"meus tickets"` matcha, `"ticketing system"` tambem matcha (false positive aceitavel — inventario eh util de qualquer forma).
- `recentUserText` = concatenacao das ultimas 3 mensagens do user (~500 chars). Reuso helper existente em `coachContext.ts` se disponivel.

### 2.6 Trade-off "sempre injetar" vs "condicional"

**Sempre injetar:**
- (+) LLM sempre sabe. Zero risco de "tinha contexto, faltei dar".
- (-) Tokens extras em 100% das conversas (mesmo "como ta o mental?").
- (-) Quando 0 tickets, bloco vazio polui prompt.

**Condicional (escolhido):**
- (+) Tokens economizados em conversas non-ticket-related.
- (+) Bloco so aparece quando relevante — sinal forte pro LLM "user perguntou disso, foca".
- (-) Risco LLM nao chamar a feature porque nao "sabia". Mitigacao: surface-based gate cobre tournament-selector + grade-planner (onde decisao de grade acontece).

**Decisao locked Q-D:** condicional.

### 2.7 Sem tool dedicada (delibarado)

NAO criar tool `query_tickets`. Bloco context cobre 90% dos casos. Para o restante (queries muito especificas tipo "tickets do PokerStars com valor entre $10 e $50"), o LLM pode pedir e nos avaliamos em sprint futuro. **YAGNI.**

---

## 3. Consequencias

### Positivas
- LLM finalmente "ve" tickets — habilita conversas naturais ("voce tem 3 tickets, recomendo focar nesses").
- Token-efficient — 0 overhead em conversas non-ticket.
- Surface-based gate cobre cenarios mais importantes (selector + planner) automaticamente.
- Zero migration, zero endpoint novo.
- Padrao replicavel: mesmo shape para futuros context builders (bankroll snapshot, study progress dynamic, etc).

### Negativas
- False negative possivel: user fala "qualifier" sem usar palavras do whitelist -> bloco nao injeta. Aceito (Q-D locked — 4 keywords spec).
- `recentUserText` extraction depende de como caller monta — fragil se conversa for muito longa (truncamento). Mitigacao: pegar so ultimas 3 mensagens do user.
- Sem cache -> token cost por chamada um pouco maior. Aceito.

### Neutras
- `server/coach/contextBuilders/` novo namespace — limpo, sem conflito.

---

## 4. Alternativas consideradas

### A1: Tool dedicada `query_tickets`
Descartado §2.7 (YAGNI).

### A2: Sempre injetar (bloco mesmo vazio)
Descartado §2.6 (token waste + polui prompt).

### A3: Injetar com `cache_control: ephemeral`
Descartado §2.4 (risco stale).

### A4: Expandir keyword list (WSOP, qualifier, supersat, sat, sit-and-go, etc)
Descartado Q-D locked (spec aprovou 4 keywords; expansao = ruido).

### A5: Bloco em JSON em vez de markdown
Descartado — markdown legivel + alinhado com restante do prompt (todos os blocos dinamicos sao markdown).

---

## 5. Validacao

**Como verificar:**
1. User com 0 tickets manda "ola" -> `buildTicketsContext` retorna `null` -> system prompt SEM bloco.
2. User com 0 tickets manda "tenho ticket pra usar?" -> `shouldInject=true`, `tickets=[]` -> retorna `null` -> SEM bloco. **Bonus:** LLM responde direto "voce nao tem tickets ativos" porque nao tem contexto que o confunda.
3. User com 3 tickets manda "ola" em /home -> `shouldInject=false` -> SEM bloco.
4. User com 3 tickets em /tournament-selector -> `shouldInject=true` por surface -> bloco aparece.
5. User com 3 tickets manda "minha grade" em qualquer surface -> matcha "grade" -> bloco aparece.
6. User com 3 tickets manda "satélite WSOP" -> normalizacao NFKD -> matcha "satelite" -> bloco aparece.

**Testes** (`tests/coach/buildTicketsContext.test.ts`):
- Happy path: surface gate + keyword gate + format.
- Edge: 0 tickets / null storage.getActiveTicketsByUser / mais de 3 tickets (top 3).
- NFKD: acento.
- Sort by expiresAt asc + null por ultimo.

## 6. Confianca
**Alta.** Padrao bem estabelecido (3+ context builders nos Coach sprints anteriores). Foundation completa.
