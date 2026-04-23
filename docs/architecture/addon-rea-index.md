# Iniciativa: Add-on + Re-entry (ReA) — Indice de documentacao

**Status:** Arquitetura aprovada, pronto para Test-Writer
**Data de aprovacao:** 2026-04-23
**ADR principal:** [014-addon-rea-modelagem](./decisions/014-addon-rea-modelagem.md)

---

## O que e essa iniciativa

Grindfy e uma ferramenta de decisao financeira para jogadores profissionais de MTT. A auditoria identificou **dois leaks analiticos** em `/grind-live` contaminando ROI e ABI em Dashboard, Analytics, Library Stats, Studies e AI Coach:

| Leak | Incidencia | Impacto |
|------|------------|---------|
| Add-on (Plus) nao rastreado | ~20% dos torneios | ROI inflado em 8-15 p.p. |
| Re-entry (ReA) usando REBUY como workaround | ~15% do volume | ABI errado em ~22% |

Solucao: adicionar **6 flags ortogonais** ao schema (`allowsAddOn`, `addOnCost`, `addOnTaken`, `allowsReentry`, `maxReentries`, `reentries`) em 4 tabelas (`tournament_library`, `planned_tournaments`, `session_tournaments`, `tournaments`) + UI correspondente no Grind Live.

A iniciativa foi decomposta em **3 specs sequenciais**:

1. **Spec 1 — Schema Foundation:** schema, migracao, backfill, parser CSV, integracao Suprema, formula de ROI. **Zero UI.** Deploy seguro e independente.
2. **Spec 2 — Add-on UX:** botao ADD-ON no TournamentCard, AddOnDialog, AddTournamentDialog com flag "Permite add-on".
3. **Spec 3 — Re-entry Flow:** ReentryDialog apos GG, fila de modais (multi-tabling), KPI "Entradas Totais", separacao REBUY vs RE-ENTRY.

---

## Mapa dos artefatos

### Specs (input — PM-Spec)

| Arquivo | Conteudo | Status |
|---------|----------|--------|
| [`docs/specs/addon-rea-schema-foundation.md`](../specs/addon-rea-schema-foundation.md) | Schema, Zod, formula, backfill, parser | Aprovada |
| [`docs/specs/grind-live-addon-ux.md`](../specs/grind-live-addon-ux.md) | Botao e dialog de add-on | Aprovada |
| [`docs/specs/grind-live-reentry-flow.md`](../specs/grind-live-reentry-flow.md) | Modal de re-entry, fila multi-tabling, KPIs | Aprovada |

### Arquitetura (output — System-Architect)

| Arquivo | Conteudo |
|---------|----------|
| **ADR** — [`decisions/014-addon-rea-modelagem.md`](./decisions/014-addon-rea-modelagem.md) | Decisao de flags ortogonais vs expandir enum `type` vs tabela filha. Inclui RD-1 (acumulacao) e RD-2 (fila FIFO). |
| **Data model** — [`data-model.mermaid`](./data-model.mermaid) | ER diagram atualizado com 6 campos novos em 4 tabelas (busque anotacao `ADR-014`) |
| **State machine** — [`flows/addon-rea/tournament-states.md`](./flows/addon-rea/tournament-states.md) | Estados `upcoming/registered/finished`, transicoes (REGISTRAR, REBUY, ADD-ON, GG, RE-ENTRY), invariantes/guards, cenarios de teste |
| **Feature flow** — [`flows/addon-rea/feature-flow.md`](./flows/addon-rea/feature-flow.md) | Sequence diagrams de 3 fluxos: Add-on, Re-entry single, Multi-tabling queue |

---

## Mudancas no schema (resumo)

4 tabelas recebem colunas novas. Todos os campos sao aditivos — **zero breaking change** no schema atual.

```
tournament_library      ← allowsAddOn, addOnCost, allowsReentry, maxReentries
planned_tournaments     ← allowsAddOn, addOnCost, allowsReentry, maxReentries
session_tournaments     ← allowsAddOn, addOnCost, addOnTaken, allowsReentry, maxReentries, reentries
tournaments             ← allowsAddOn, addOnCost, addOnTaken, allowsReentry, maxReentries
                        (reentries ja existia)
```

Tipos exatos:
- `boolean`: default `false`, NOT NULL
- `decimal` (addOnCost): nullable (so preenche se `allowsAddOn=true`)
- `integer` (maxReentries): nullable (null = ilimitado)
- `integer` (reentries): default `0`, NOT NULL

**Regra semantica:** `addOnTaken` e `reentries` so existem em `session_tournaments` e `tournaments` (sao instancias de jogo). `tournament_library` e `planned_tournaments` so tem caracteristicas do torneio (sem instancia).

---

## Decisoes documentadas

### Principal (ADR-014)

**Flags ortogonais vs expandir enum `type`:** escolhida flags ortogonais porque Plus e ReA sao conceitos **independentes** (podem coexistir com qualquer type). Enum explodiria em 12+ variantes e quebraria queries analiticas (`GROUP BY type`).

**Tabela filha `tournament_entries` vs flags agregadas:** escolhida agregada para MVP. Granularidade por-entrada e evolucao v2 (migracao aditiva — cria filha, mantem flags como cache).

### Relacionadas (dentro do ADR-014)

**RD-1 — Acumulacao em re-entries:** prize/bounty acumulam somando, position guarda o melhor (`min` null-safe). Jogador pensa por-torneio, nao por-entrada. V1 frontend nao envia esses campos no payload de re-entry; backend e defensivo.

**RD-2 — Fila vs pilha de modais (multi-tabling):** FIFO. Primeiro torneio que bustou, primeiro modal. Preserva decisao explicita em ordem cronologica. State vira `reentryQueue: Tournament[]` (array).

---

## Invariantes chave (guards)

Valido para backend (Zod refinements em `shared/schema.ts`) e frontend (renderizacao condicional).

```
pode_fazer_addon(t)    := t.status=='registered'
                          && t.allowsAddOn
                          && !t.addOnTaken
                          && t.addOnCost != null && t.addOnCost > 0

pode_fazer_reentry(t)  := t.status=='finished'
                          && t.allowsReentry
                          && (t.maxReentries == null || t.reentries < t.maxReentries)

pode_fazer_rebuy(t)    := t.status=='registered'
                          (independente de flags — qualquer torneio registered)
```

Violacoes retornam **400 Bad Request** com mensagem descritiva.

---

## Formula nova de `totalInvestido` (Spec 1)

Aplicada em **3 lugares** (convergencia):
- `client/src/components/grind-session-live/calculateSessionStats.ts` (linhas 122-127, `calculateSessionStats`)
- `calculateSessionStats.ts` (linhas 269-274, `calculateFinalSessionStats`)
- `server/storage.ts` (linhas ~1910-2060, `getTournamentStats`)

```ts
totalInvestido = buyIn * (1 + rebuys + reentries) + (addOnTaken ? addOnCost : 0)
```

**Zero regressao para dados antigos:** torneios sem flags (todos zeros/false) produzem o mesmo resultado da formula antiga `buyIn * (1 + rebuys)`.

**Correcao esperada:** ROI historico **vai cair** para usuarios com >10% de volume em rebuys (bug pre-existente onde rebuys nao era considerado em `storage.getTournamentStats`). Documentado em `specs/addon-rea-schema-foundation.md` §9 como mudanca esperada no changelog.

---

## Proximos passos (para o Test-Writer)

1. Leia o ADR-014 primeiro para contexto de decisao
2. Leia a state machine (`tournament-states.md`) — as tabelas "Cenarios de teste derivados" sao o guia direto para tests de transicao
3. Leia os 3 fluxos em `feature-flow.md` — sequence diagrams definem mutations, invalidations e contratos de API
4. Consulte as specs para valores numericos e edge cases nao capturados nos diagramas (Spec 1 secao 7 tem 18 casos de borda)
5. Priorize (de acordo com `specs/addon-rea-schema-foundation.md` §11):
   - Regressao numerica de `calculateSessionStats` (bit-a-bit identico no caminho sem flags)
   - Regex do parser CSV (Plus, ReA, falsos positivos como "Surplus", "ExpressPLUS")
   - Zod refinements cruzados
   - Guards de transicao no state machine (rejeita `addOnTaken=true` sem `allowsAddOn`, etc.)
   - Acumulacao em re-entries (RD-1)
   - Fila de modais (RD-2) — teste de estado `reentryQueue`

## Proximos passos (para o Implementer)

Ordem recomendada (de `specs/addon-rea-schema-foundation.md` §11):

1. `shared/schema.ts` + `npm run db:push` local
2. Zod refinements com merge-before-validate em PUT
3. `SessionTournament` type em `client/src/components/grind-session-live/types.ts`
4. Formula nova em `calculateSessionStats` (ambas funcoes) — todos testes existentes continuam passando
5. Parser CSV (Plus primeiro, depois ReA)
6. Integracao Suprema
7. Script `server/scripts/backfill-addon-rea.ts`
8. Testes novos
9. Migracao em producao

## Glossario

| Termo | Significado |
|-------|-------------|
| Plus | Torneio com add-on: stack extra opcional no intervalo (~=100% do buy-in). |
| ReA | Re-entry Allowed: torneio permite re-inscricao apos bust. |
| Rebuy | Stack adicional comprado **durante a mesma entrada** (enquanto vivo). Incrementa `rebuys`. |
| Re-entry | Nova entrada **apos bust**. Incrementa `reentries`. |
| Add-on | Stack adicional opcional pago **no intervalo** (independente de estar vivo ou bustado — mas ReA nao repete; add-on e 1x por torneio). Marcado com `addOnTaken=true`. |
| ABI | Average Buy-In. Medio ponderado do investimento por torneio. |
| ROI | Return on Investment = (totalPremio - totalInvestido) / totalInvestido. |
| Copy-on-promote | Ao converter `planned_tournament` em `session_tournament`, copiar flags (`allowsAddOn`, `addOnCost`, `allowsReentry`, `maxReentries`). |
