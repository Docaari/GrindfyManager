# ADR-186: Tournament Selector ticket boost via campo NOVO opcional `availableTicket?: { id, valueUsd, expiresAt }` em `ScoringInputTournament` (ownership: `server/scoring/buildScoringInput.ts` extension — NAO `server/services/scoring*`); `+10 score` quando ticket presente com clamp 100; bypass do bankroll filter (`effectiveBuyIn > maxBuyIn` IGNORADO quando ticket disponivel pq `effectiveBuyIn=0`); UI badge `Ticket disponivel ($X)` em `SelectorPanel` (edit direto + grep antes de adicionar import — lesson #28)

## Status
Aceito

## Data
2026-05-21

## Sprint
D — Grind Live + Tickets cluster (`Docs/specs/sprint-grind-live-cluster.md`, RF-03.4 + spec original RF-07)

## Decision owner
system-architect (auto-mode defaults Q-B: estender `server/scoring/buildScoringInput.ts` — campo NOVO opcional, sem mexer em logica existente; Q-E: edit direto SelectorPanel + grep antes).

## Related
- Depende de: ADR-145/146/147 (AI-0A `buildScoringInput.ts` extracao + helpers — ownership atual), ADR-036 (`getEffectiveBuyIn` em `shared/ticketScoring.ts`), ADR-037 (`tickets` table), ADR-180 (Coach tool tournament-selector consolidation TS-3 — extend pattern paralelo).
- Reusa: `shared/scoring.ts` (`ScoringInputTournament` interface), `server/scoring/buildScoringInput.ts` (`bucketBuyIn`, `mapCategory`, etc), `shared/ticketScoring.ts:getEffectiveBuyIn`, `server/services/ticketService.ts` (`getActiveTicketsByUser`), `server/routes/tournament-selector.ts` (route que chama `buildScoringInput`).
- Sucessor de: nada — primeira extensao do scoring pos AI-0A.
- Diagramas: `Docs/architecture/diagrams/sprint-grind-live-cluster/selector-ticket-boost.mermaid`.

---

## 1. Contexto

Selector hoje:
- Calcula score 0-100 + grade S/A/B/C/D usando `buildScoringInput` -> `computeTournamentScore`.
- Aplica bankroll filter (`effectiveBuyIn` vs `maxBuyIn` derivado de banca + regras).
- **NAO sabe que user tem ticket.** Torneio que custa $215 com ticket disponivel aparece como "fora do BR".

Gap RF-03.4 = selector boost. Cenario alvo: user tem ticket Sunday Million ($215). Selector deve:
1. Aumentar score do Sunday Million em +10 (cap 100).
2. Bypass bankroll filter — torneio aparece mesmo se `maxBuyIn=$50` (porque `effectiveBuyIn` real com ticket = $0).
3. Badge UI "🎟️ Ticket disponivel ($215)" no card.

### Restricoes ownership

Spec D linha 207: "PROIBIDO mexer em `server/services/scoring*.ts`". TS-3 (Sprint paralelo) ja mexeu `tournamentScoringService.ts` (ADR-180 Coach tool extension). Locked Q-B: nossa janela eh `server/scoring/buildScoringInput.ts` (AI-0A territory).

`buildScoringInput.ts` produz `ScoringInputTournament` consumido por:
1. `server/routes/tournament-selector.ts` (rota /api/tournament-selector — UI selector)
2. `server/services/tournamentScoringService.ts` (Coach tool — ADR-180)

**Decisao:** estender `ScoringInputTournament` shape com campo OPCIONAL `availableTicket?` — quem nao preenche, quem nao consome, nada quebra. Compatibilidade total.

### Outras restricoes

- **Lesson #28 (vi.mock por path):** UI edit em `SelectorPanel.tsx` precisa grep antes de adicionar import novo. Se test mockou `@/components/tournament-selector/SelectorPanel` mas codigo importa de `@/components/grade-planner/SelectorPanel` -> shim. `SelectorPanel` ja eh shim (sprint coach-page-reform-1 conforme lesson #28); reusar.
- **Lesson #11 (default minimo):** badge UI so renderiza quando `availableTicket` presente. Sem ticket = sem badge (nao "(sem ticket)").
- **Lesson #17 (grep antes de declarar):** ao adicionar campo em `ScoringInputTournament`, grep `availableTicket` em todo `shared/` + `server/scoring/` + `server/services/` pra garantir zero conflito.
- **ADR-145 (buildScoringInput single source):** TODO consumer do scoring vai ler atraves desse helper. Adicionar campo aqui = propagacao garantida.
- **Clamp 100:** `Math.min(100, baseScore + 10)`. Hard cap. Score = 100 com ticket = "S++" implicito (mesmo tier S).

---

## 2. Decisoes

### 2.1 Shape de `ScoringInputTournament`

`shared/scoring.ts`:
```ts
export interface ScoringInputTournament {
  // ... campos existentes ...
  /** Sprint D / RF-03.4 (ADR-186) — ticket disponivel matching este torneio.
   *  null/undefined = sem ticket. Quando presente:
   *  - score recebe +10 (clamp 100) em computeTournamentScore
   *  - bankroll filter eh bypassado (effectiveBuyIn=0 — usar ticket nao consome banca)
   *  Resolvido em buildScoringInput a partir de getActiveTicketsByUser(userId) + match heuristica. */
  availableTicket?: {
    id: string;
    valueUsd: number;       // valor original do ticket em USD
    expiresAt: string | null;
  } | null;
}
```

**Justificativa "campo aninhado em vez de flag boolean":** valueUsd + expiresAt sao uteis pra UI (badge) e pra LLM (Coach context). Boolean perderia info.

### 2.2 Match heuristica ticket <-> torneio

Em `buildScoringInput` (ou helper irmao `enrichWithTickets(input, tickets)`):

```
matchTicket(tournament, userTickets):
  candidates = userTickets.filter(t =>
    t.status === 'available' &&
    (t.expiresAt == null || new Date(t.expiresAt) > tournament.date)  // ticket valido na data
  )
  if candidates.length === 0 return null

  // Heuristica 1 (exact): sourceName casa nome do torneio (case-insensitive)
  exact = candidates.find(t =>
    tournament.name.toLowerCase().includes(t.sourceName.toLowerCase())
  )
  if (exact) return pickShape(exact)

  // Heuristica 2 (value): mesmo valor USD (tolerancia 1%)
  valueMatch = candidates.find(t =>
    Math.abs(t.valueUsd - tournament.buyInUsd) / tournament.buyInUsd < 0.01
  )
  if (valueMatch) return pickShape(valueMatch)

  return null
```

**FIFO desempate:** se multiplos exact ou valueMatch, escolher o de menor `expiresAt` (consumir o que vai expirar primeiro). Reusa principio FIFO de ADR-036 / `ticketScoring.ts`.

**Trade-off heuristica vs casamento explicito:**
- Casamento explicito (ticket aponta direto pro `tournament_id`) seria mais preciso mas exige migration `tickets.tournament_id FK`. Out of scope spec D.
- Heuristica nome+valor cobre ~80% dos casos reais (qualifier ticket tipicamente tem `sourceName = "Sunday Million"` ou valor = buy-in alvo).
- Falso positivo (ticket de $50 generico apontando p/ torneio de $50 que nao era o alvo) eh aceitavel: user ainda pode usar — UI mostra `valueUsd`, user decide.

### 2.3 Wiring em `buildScoringInput`

Assinatura existente preservada. Helper novo:

```ts
export function enrichWithTickets(
  sct: ScoringInputTournament,
  userTickets: Array<{id:string; sourceName:string; valueUsd:number; expiresAt:string|null; status:string}>,
  tournament: { name: string; date: string; buyInUsd: number }
): ScoringInputTournament {
  const match = matchTicket(tournament, userTickets);
  if (!match) return sct;
  return { ...sct, availableTicket: { id: match.id, valueUsd: match.valueUsd, expiresAt: match.expiresAt } };
}
```

Call site em `server/routes/tournament-selector.ts`:
```ts
const userTickets = await storage.getActiveTicketsByUser(userId);
const inputs = candidates.map(row => {
  const sct = supremaToScoringInput(row, exchangeRates); // existente
  return enrichWithTickets(sct, userTickets, { name: row.name, date: row.date, buyInUsd: sct.buyInUsd });
});
```

**Coach tool consumer (ADR-180, `tournamentScoringService`):** pode optar por NAO chamar `enrichWithTickets` (tool returns pure scoring), ou chamar. Decisao a partir do consumer — sem mudar shape. **Recomendacao:** chamar tambem, p/ paridade UI/Coach. Founder pode confirmar ao implementer.

### 2.4 `computeTournamentScore` (em `server/services/scoring*` — PROIBIDO mexer)

Spec D linha 207 proibe edit. **Workaround:** boost +10 aplicado em camada **acima** de `computeTournamentScore`, no caller:

```ts
const baseScore = computeTournamentScore(sct);
const ticketBoost = sct.availableTicket ? 10 : 0;
const finalScore = Math.min(100, baseScore.score + ticketBoost);
const finalGrade = scoreToGrade(finalScore);
return { ...baseScore, score: finalScore, grade: finalGrade, ticketBoost };
```

`scoreToGrade` ja existe em `shared/scoring.ts`. Re-derivar grade apos boost garante consistencia (score 88 -> A; +10 boost -> 98 -> S).

**Caller path:** `server/routes/tournament-selector.ts` (rota UI). Coach tool (`tournamentScoringService`) decide separadamente — possivelmente mesma camada apos chamada de `computeTournamentScore`.

### 2.5 Bankroll filter bypass

`server/routes/tournament-selector.ts` aplica filtro:
```ts
candidates = candidates.filter(c => c.effectiveBuyIn <= maxBuyIn)
```

Update:
```ts
candidates = candidates.filter(c =>
  c.availableTicket != null ||      // bypass: ticket cobre buy-in
  c.effectiveBuyIn <= maxBuyIn
)
```

Hierarquia: ticket trumpa bankroll. Justificativa: ticket eh pre-pago — usar nao consome banca, nao viola regra de gestao.

### 2.6 UI badge em `SelectorPanel`

Edit direto em `client/src/components/tournament-selector/SelectorPanel.tsx` (lesson #28: grep antes — confirmar que `import` esta correto). Card item recebe:

```tsx
{item.availableTicket && (
  <div
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs"
    data-testid={`ticket-badge-${item.id}`}
    title={`Ticket disponivel de $${item.availableTicket.valueUsd.toFixed(2)}${item.availableTicket.expiresAt ? ` (expira em ${daysUntil(item.availableTicket.expiresAt)} dias)` : ""}`}
  >
    🎟️ Ticket disponivel (${item.availableTicket.valueUsd.toFixed(0)})
  </div>
)}
```

Tokens UI: usar `tokens.color` se houver entry pra amber/highlight (lesson #22). Provavel adicionar `tokens.color.ticket` se nao existir — separar em sprint UI-tokens dedicado se conflito.

### 2.7 Telemetria

Evento `selector_item_shown_with_ticket_boost` em `user_activity` quando item com `availableTicket != null` eh renderizado. Sweep RF-03.5 vai cobrir esse + os outros 6.

---

## 3. Consequencias

### Positivas
- User finalmente ve torneios com ticket priorizados.
- Zero migration, zero breaking change (campo opcional).
- Ownership respeitado — `buildScoringInput` (AI-0A) extendido, `computeTournamentScore` (Sprint B) intocado.
- Coach context (ADR-185) + selector boost (este ADR) cooperam: LLM ve inventario + selector destaca matches.
- Padrao replicavel para futuras "boosts" (study completion bonus, FT recent bonus, etc).

### Negativas
- Heuristica match (sourceName/value) pode dar falso positivo. Mitigacao: badge mostra valueUsd explicito; user decide.
- Boost aplicado fora de `computeTournamentScore` -> potential drift se logica de scoring mudar e nao re-derivar grade. Mitigacao: re-derive grade no caller (§2.4).
- `enrichWithTickets` faz N*M iteracoes (N candidates x M tickets). N tipicamente <50, M tipicamente <10 — irrelevante. Sem necessidade de index.

### Neutras
- `ScoringInputTournament.availableTicket` opcional — modulos legacy (sem ticket) nao notam mudanca.
- Coach tool pode optar in (recomendado) ou opt out — decisao do implementer Sprint D.

---

## 4. Alternativas consideradas

### A1: Boost +20 ou +30
Descartado — +10 ja eh significativo (sobe 1 tier S/A/B/C/D na maioria dos casos). +20/30 distorceria scoring de forma irrecuperavel quando ticket nao representa real "vantagem competitiva" (so vantagem financeira).

### A2: Multiplicador (`score *= 1.1`) em vez de soma
Descartado — distorce ranking nao-linear; torneio com score 50 viraria 55 (+5), torneio score 90 viraria 99 (+9). Quero boost UNIFORME (+10 em todos) pra preservar diferencas relativas.

### A3: Sem clamp 100
Descartado — score 95 + 10 = 105 quebra contrato `0..100`. Clamp obrigatorio.

### A4: Migration `tickets.tournament_id` FK explicita
Descartado — out of scope spec D + heuristica cobre 80%. Pode entrar em Tickets-4 dedicado se necessario.

### A5: Boost dinamico baseado em `valueUsd` (ticket caro = boost maior)
Descartado — overengineer. Ticket eh ticket; usar = +10 score uniforme.

### A6: Defer feature pra Sprint Tickets-3 dedicado
Considerado se ownership conflitasse com Sprint paralelo. Q-B locked: posso estender — sem conflito.

---

## 5. Validacao

**Como verificar:**
1. User com 0 tickets em /tournament-selector -> nenhum badge, score original.
2. User com 1 ticket `valueUsd=215` `sourceName="Sunday Million"`, candidate Sunday Million com score base 75 -> score final 85, badge visivel.
3. User com 1 ticket `valueUsd=50`, candidate Daily $50 com score base 95 -> score final 100 (clamp), badge visivel.
4. User com 1 ticket `valueUsd=215`, `maxBuyIn=$50` na banca -> Sunday Million APARECE (bypass bankroll filter).
5. User com 1 ticket sem match (nome random, valor random) -> sem badge, sem boost.

**Testes** (`tests/scoring/selectorTicketBoost.test.ts`):
- enrichWithTickets sem tickets -> sct igual.
- enrichWithTickets exact match.
- enrichWithTickets value match (tolerancia 1%).
- enrichWithTickets sem match -> sct igual.
- enrichWithTickets FIFO desempate.
- Bankroll filter bypass (integration test em routes/tournament-selector).
- Score clamp 100.
- Grade re-derive (88+10=98 -> S).

## 6. Confianca
**Media-alta.** Padrao consistente com ADRs anteriores. Risco unico = heuristica match (false positive aceitavel ja documentado).
