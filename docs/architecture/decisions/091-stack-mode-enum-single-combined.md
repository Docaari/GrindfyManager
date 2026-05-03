# ADR-091 — Stack mode enum: `single` | `combined` (best-stack fora de escopo MVP)

- Status: Accepted
- Date: 2026-05-02
- Sprint: Flight-1
- Decision owner: system-architect (founder revisa post-pipeline)
- Relacionado: ADR-090 (Tournament Series como single source of truth)

## Contexto

Torneios multi-flight (Phased / Stage / Day 1 X) tem 3 variacoes de stack management universalmente reconhecidas pelas redes de poker:

1. **Single-bag** — Jogador paga 1 buy-in para 1 Day 1; Day 2 mantem aquele unico stack. Default historico (Sunday Million Phased single-entry).
2. **Combined stacks** — Jogador paga N buy-ins para N Day 1s; todas stacks que sobrevivem sao **somadas** no Day 2. Exemplo: 3 entries de $215 = $645 buy-in total, 1 prize do Day 2 conta uma vez.
3. **Best stack** — Jogador paga N buy-ins para N Day 1s; apenas o **maior stack** sobrevive ao Day 2. Modelo do GG WSOP / WSOP Online.

Spec Flight-1 D3 ja decidiu: **MVP suporta apenas `single` e `combined`**, com `best` fora do escopo (defer para Sprint Flight-2). Decisao operacional: como modelar isso no schema?

## Decisao

**Criar ENUM Postgres `series_stack_mode` com valores `single` e `combined`. Sem `best`. Adicionar valor via `ALTER TYPE` em sprint futuro quando best-stack entrar no roadmap.**

```sql
CREATE TYPE series_stack_mode AS ENUM ('single', 'combined');
-- Em Sprint Flight-2 (futuro):
-- ALTER TYPE series_stack_mode ADD VALUE 'best';
```

Coluna em `tournament_series`:
```sql
stack_mode series_stack_mode NOT NULL DEFAULT 'single'
```

## Razoes

### Por que ENUM Postgres em vez de `varchar(16)` com CHECK constraint

- **Type safety nativa:** Postgres rejeita valores invalidos no INSERT/UPDATE sem necessidade de Zod paralelo no backend (defesa em profundidade).
- **Storage compacto:** ENUM e int4 internamente (4 bytes), mais barato que varchar.
- **Drizzle ORM nativo:** `pgEnum('series_stack_mode', ['single', 'combined'])` gera tipos TS automaticamente.
- **Padrao Grindfy:** schema ja usa ENUMs Postgres em outros lugares (ex: `series_day2_status`, ENUMs em `chat_messages.role`).
- **Migration extensivel:** `ALTER TYPE ... ADD VALUE` e operacao online (sem lock pesado em Postgres 12+), permitindo adicionar `best` no futuro sem downtime.

### Por que **rejeitar `best` agora**

- **Cobertura founder:** Founder joga PokerStars (Sunday Million Phased = combined) e GG opcionalmente (best-stack), mas relatou explicitamente que best-stack representa <5% do volume.
- **Complexidade P&L:** combined-stack soma N buy-ins / 1 prize. Best-stack precisa de logica adicional: identificar qual stack "ganhou" (maior chip count entrando no Day 2), descartar os outros (mas buy-ins ainda contam pra P&L). Requer campo extra (`winning_entry_id`?) e edge cases (empate de stack, late-reg que ultrapassa).
- **Tests:** combined adiciona ~5 cenarios de test; best adicionaria ~10 (edge cases de tie-breaking). Fora do orcamento de Sprint Flight-1 (~8-10 dias).
- **UI:** wizard de criacao de serie ficaria com 3 opcoes em vez de 2 — adiciona friccao para 95% dos casos.
- **YAGNI:** founder pode usar `combined` como aproximacao quando best-stack acontecer (P&L sera ligeiramente impreciso para ~5% do volume; aceitavel no MVP).

### Por que **NAO usar varchar livre**

- **Sem garantia de integridade:** typo no codigo TS resulta em insert silencioso de "Combined" / "single_bag" / "comb" — bug invisivel ate quebrar query.
- **Sem auto-complete:** Drizzle ORM nao infere valores de varchar.
- **Custos de migration similares:** ENUM e varchar+CHECK tem custo de migration equivalente para adicionar valor.

### Por que **NAO suportar todos 3 valores agora**

- **Escopo MVP explicito** (D3 spec): founder priorizou shipping rapido sobre completude.
- **Best-stack tem assumptions diferentes:** modelo de stack management afeta calculo de ROI medio do Selector, FX conversion em snapshots, e renderizacao de detalhe da serie. Cada uma dessas integracoes precisa de pensamento dedicado.
- **Sprint Flight-2 ja planejado** com best-stack como goal central — nao se perde nada adiando.

## Alternativas Consideradas

### 1. Suportar todos 3 valores (`single` / `combined` / `best`)
- **Pros:** Cobertura completa de modelos de stack management. Sem migration futura.
- **Cons (REJEITADO):** ~10 testes adicionais, ~2 dias dev extras, UI mais complexa, P&L logic mais intrincada. Founder explicitamente fora-de-escopo.

### 2. `varchar(16)` com CHECK constraint em vez de ENUM
- **Pros:** Adicionar valor futuro = `ALTER TABLE DROP CONSTRAINT + ADD CONSTRAINT` (sem `ALTER TYPE`).
- **Cons (REJEITADO):** Custo similar de migration. ENUM tem melhor type safety + storage compacto. Padrao Grindfy ja e ENUM.

### 3. JSON config blob em `user_settings` (sem coluna dedicada)
- **Pros:** Maxima flexibilidade.
- **Cons (REJEITADO):** Sem indice por stackMode (queries "minhas series combined" lentas). Sem garantia de schema. Fora do padrao Grindfy.

### 4. Boolean `is_combined` em vez de ENUM
- **Pros:** Mais simples para 2 valores.
- **Cons (REJEITADO):** Nao extensivel — adicionar `best` futuramente exigiria migration grande (boolean → enum). ENUM cobre melhor a semantica de "modo de stack" como categoria.

## Consequencias

### Positivas
- Schema explicito e type-safe.
- Migration futura para `best` e operacao online de baixo risco (`ALTER TYPE ... ADD VALUE`).
- UI wizard simples (radio com 2 opcoes).
- Testes focados no MVP (cobertura de combined-stack edge cases sem dispersao).
- P&L logic em `calculateSessionStats` (RF-15) implementa apenas 2 branches.

### Negativas
- Founder que jogar GG WSOP Phased em best-stack mode precisara usar `combined` como aproximacao (~5% do volume; aceitavel).
- Migration futura para adicionar `best` requer `ALTER TYPE ... ADD VALUE` — nao e DDL transacional em algumas versoes do Postgres (rollback parcial possivel). Mitigacao: rodar em janela de baixa atividade.
- Documentar limitacao em `Docs/api/endpoints.md` (POST `/api/tournament-series` aceita apenas `single` e `combined`).

### Neutras
- Sprint Flight-2 ja planejado com `best` como goal central — adicao trivial quando chegar.
- Drizzle ORM declaration: `export const seriesStackModeEnum = pgEnum('series_stack_mode', ['single', 'combined'] as const);`

## Confianca

**Alta.** Decisao alinhada com:
- Spec D3 founder (explicito).
- Princípios YAGNI + escopo MVP.
- Padrao Grindfy de ENUM Postgres + Drizzle.
- Path de extensao bem definido para Sprint Flight-2.

Riscos residuais:
- Founder pode mudar de ideia e querer `best` no meio do sprint — mitigacao: ADR documenta rejeicao explicita, qualquer reabertura exige novo ADR.
- `ALTER TYPE` futuro tem caveats em Postgres < 12 — Grindfy roda Postgres 16, sem problema.

## Referencias

- ADR-090 — Tournament Series single source of truth (introduz a tabela)
- Spec Flight-1 D3 — `Docs/specs/sprint-flight-1.md`
- Sprint Flight-2 (planejado) — best-stack mode + Day 3+
- Postgres docs — `ALTER TYPE ... ADD VALUE`: https://www.postgresql.org/docs/16/sql-altertype.html
- Migration: `0029_add_tournament_series.sql` (cria ENUM)
