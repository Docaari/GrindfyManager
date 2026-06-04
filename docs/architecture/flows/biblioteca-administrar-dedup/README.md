# Fluxo: Biblioteca de Torneios — Administrar + Dedup Canônico

Artefatos de arquitetura para o upgrade da Biblioteca. Foco desta rodada: **Fatia 1 (key canônica)** e **Fatia 3 (merge)** — núcleo técnico que destrava as demais fatias. As outras fatias estão cobertas em diagrama de alto nível.

- **ADR:** `Docs/architecture/decisions/200-library-canonical-dedup-key-and-merge-flow.md` (Parte A = key canônica; Parte B = merge).
- **Spec:** `Docs/specs/biblioteca-administrar-dedup-2026-06-04.md`.

## Diagramas
- `auto-populate-old-vs-new.mermaid` — decisão de dedup do auto-populate ANTES (key exata) vs DEPOIS (key canônica + sinal de lixeira da Fatia 5).
- `merge-sequence.mermaid` — sequência do merge com re-aponte de `libraryTemplateId` ANTES do soft-delete (atômico, D3).
- `fatias-overview.mermaid` — visão de alto nível das 7 fatias + dependências.

## Trigger
- Fatia 1: criação de planned (POST rota / Series Day2 / coach `register_tournament_in_grade`) e import (grind-live / Suprema) — disparam dedup via os caminhos existentes, agora usando `libraryCanonicalKey`.
- Fatia 3: jogador confirma merge de um grupo de duplicatas na tela Administrar.

## Atores
- Jogador (grinder) — único ator. Escopo sempre per-user (`userId` do JWT).

## Pré-condições
- `tournament_library` com entries do user; `planned_tournaments.libraryTemplateId` linkando Grade↔biblioteca.
- Migration `0095` aplicada (2 índices de suporte) — recomendada antes de alto volume.

## Decisões TRAVADAS (dadas — não reabrir)
- Key inclui `type` (PKO ≠ Vanilla); `speed` fora (só aviso); `nameSignature` fora da key (classifica confiança no merge).
- `timeBin` deriva de `time` HH:MM (não `datePlayed`).
- Dedup é flag-and-confirm; nunca auto-merge.
- Merge re-aponta `libraryTemplateId` ANTES do soft-delete, atômico.
- Regra lixeira→skip mantida + sinal "restaurar?".
- `dayOfWeek=null` → token `"sem-dia"` + balde no topo.

## Regras de Negócio (núcleo)
- `libraryCanonicalKey = ${site}|${dayOfWeek|"sem-dia"}|${timeBin|"sem-horario"}|${canonicalBuyIn}|${typePrimary}` — pura, determinística.
- Reusar `canonicalBuyIn` / `typePrimary` (`libraryGrouping.ts`) e `timeBin2h` (`shared/time-bin.ts`). Não reimplementar.
- Auto-populate: já-linkado→skip; ativo→link; só trashed→skip(+sinal); nenhum→create.
- Merge: vencedora = mais completa > `updatedAt` mais recente; `guaranteed` = maior do grupo; re-aponte → soft-delete, em transação com fallback gentil (lesson #32).

## Endpoints Envolvidos
- `POST /api/tournament-library/merge` — NOVO (Fatia 3). Body `{ winnerId, loserIds[] }`. Auth JWT.
- `GET /api/tournament-library/duplicate-groups` — NOVO read-only (Fatia 6, mesma engine da detecção).
- Auto-populate e import: sem endpoint novo (mudança interna nos services).

## Cenários de Teste Derivados

### Fatia 1 — `libraryCanonicalKey` (puro)
- [ ] Determinismo: mesma entry N vezes → mesma key.
- [ ] PKO vs Vanilla no mesmo `(site, dia, hora, buyIn)` → keys DIFERENTES.
- [ ] `$21.60` e `$22` no mesmo slot → MESMA key (via `canonicalBuyIn`).
- [ ] `$5` e `$500` no mesmo slot → keys diferentes.
- [ ] `dayOfWeek=null` em duas entries → ambas token `"sem-dia"` (isoladas das com dia).
- [ ] `time=null`/inválido → `timeBin = "sem-horario"`.
- [ ] Speed Normal vs Hyper no mesmo slot → MESMA key (speed fora).
- [ ] `buyIn` com vírgula/símbolo inválido → `canonicalBuyIn=0`, não derruba.

### Fatia 1 — `decideLibraryAction` / `ensureLibraryEntryForPlanned`
- [ ] Planned `$21.60` casa entry `$22` no mesmo slot → `link` (antes: `create`).
- [ ] PKO planned NÃO casa Vanilla existente no mesmo slot → `create`.
- [ ] Planned já com `libraryTemplateId` → `skip` (idempotência).
- [ ] Match só na lixeira → `skip` (D5 mantida).
- [ ] `ensure` 2× pro mesmo planned → no máximo 1 entry criada.
- [ ] Back-compat: entry já corretamente linkada não é re-duplicada/re-linkada.

### Fatia 1 — `filterNewTournaments` (import)
- [ ] Import que difere só no `time` de um existente → tratado como DIFERENTE.
- [ ] `externalId` duplicado → filtrado (curto-circuito Suprema).
- [ ] Casa entry trashed por key canônica → filtrado (não re-importa).

### Fatia 3 — detecção de grupos
- [ ] 2 entries mesma key + mesmo `nameSignature` → "Duplicata" (vencedora pré-sugerida).
- [ ] 2 entries mesma key + `nameSignature` diferente → "Parecidos, confira" (sem pré-seleção).
- [ ] Grupo com 1 entry → não listado.
- [ ] Speed divergente → aviso, grupo mantido.
- [ ] Detecção read-only: contagem de entries inalterada após chamar.

### Fatia 3 — `POST /merge`
- [ ] Após merge, todo `planned_tournaments` que apontava para loser aponta para winner.
- [ ] Losers com `deletedAt` setado (lixeira); winner ativo.
- [ ] `guaranteed` da vencedora = maior valor preenchido do grupo.
- [ ] Loser de outro user → 403/404 (sem vazamento).
- [ ] `winnerId ∈ loserIds` → 400; `loserIds` vazio → 400.
- [ ] **Regressão crítica:** falha no re-aponte → rollback, NENHUM soft-delete aplicado (atomicidade D3-d).
- [ ] Re-merge com losers já trashed → 409 (idempotência/race).
- [ ] `db.transaction` indisponível (teste) → fallback gentil executa runner com `tx=undefined` (lesson #32).
