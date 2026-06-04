# ADR-200: Key canônica de dedup da Biblioteca + fluxo de merge

## Status
Aceito

## Data
2026-06-04

## Contexto

A `tournament_library` (store permanente por-user, soft-delete via `deletedAt`) é a fonte de "modelos de torneio" que alimentam a Grade (`planned_tournaments.libraryTemplateId`). Hoje há **três caminhos de deduplicação divergentes**, cada um com uma noção diferente de "mesmo torneio", o que produz duplicatas que o jogador não consegue limpar — e o problema piora com volume (grinder de alto volume tem centenas/milhares de templates):

| Caminho | Arquivo | Key atual | Defeito |
|---|---|---|---|
| Auto-populate (Grade → biblioteca) | `server/services/libraryAutoPopulate.ts:63` `decideLibraryAction` | `(userId, name, site, buyIn, time)` **exatos** | `$21.60` vs `$22` no mesmo slot = entries distintas (duplica); `name` exato sensível a sufixos. |
| Import (grind-live / Suprema) | `shared/library-dedup.ts:61` `filterNewTournaments` | `externalId` OU `(name.toLowerCase, site, buyIn)` — **IGNORA `time`** | torneios do mesmo nome/buy-in em horários diferentes são mesclados errado. |
| Agrupamento aba Torneios | `server/services/libraryGrouping.ts:170` `groupTournaments` | `(site, buyInTier, typePrimary, speed, fieldBucket, timeBin)` — esperta (snap de buy-in, `nameSignature`, type derivado) | é a lógica **boa**, mas serve só a aba Torneios; não governa dedup de inserção. |

Cada divergência é uma fonte de duplicata. Esta decisão **unifica os três caminhos numa única key canônica**, reusando os helpers já maduros de `libraryGrouping.ts`, e define o **fluxo de merge** (flag-and-confirm) que limpa as duplicatas já existentes sem quebrar a Grade.

Decisões de produto já travadas pelo founder (documentadas como **dadas**, não reabertas aqui): a key inclui `type`; dedup é flag-and-confirm (nunca auto-merge); o merge re-aponta `libraryTemplateId` ANTES do soft-delete; a regra lixeira→skip é mantida com um sinal "restaurar?"; `dayOfWeek=null` vira balde no topo.

Restrições do projeto que moldam a decisão:
- `nanoid()` para IDs; nunca auto-increment.
- Drizzle + `drizzle-zod` em `shared/schema.ts`.
- Helpers de dedup vivem em `shared/` (consumíveis por server e por código isomórfico).
- `db.transaction` precisa de fallback gentil quando `db` não está inicializado em testes (lesson #32 do CLAUDE.md).
- Handlers testáveis aceitam `injectedStorage?` como 3º arg (lesson #34).
- Alto volume: a query de candidatos não pode ser O(n²) nem carregar a base inteira sem índice.

---

## Parte A — Key canônica de dedup (Fatia 1)

### Decisão

Criar um helper puro compartilhado **`shared/library-canonical-key.ts` → `libraryCanonicalKey(entry)`** que retorna uma string determinística:

```
key = `${site}|${dayOfWeek}|${timeBin}|${canonicalBuyIn}|${typePrimary}`
```

com cada dimensão derivada assim:

| Dimensão | Derivação | Token de ausência |
|---|---|---|
| `site` | `(entry.site ?? "Unknown").toString()` | — |
| `dayOfWeek` | `0..6` literal | `"sem-dia"` quando `null` |
| `timeBin` | parse da hora inteira de `time` HH:MM → `timeBin2h(hour)` (já aceita 0-23) | `NO_TIME_BIN` (`"sem-horario"`) quando `time` ausente/inválido |
| `canonicalBuyIn` | `canonicalBuyIn(parseFloat(buyIn))` — snap ±3% reusado de `libraryGrouping.ts` | `0` para buy-in inválido (não derruba) |
| `typePrimary` | `enrichTournamentTypeFields({ name, category: type }).type` — PKO/Vanilla/Mystery/Satellite | default Vanilla quando indetectável |

A função é **pura, determinística, sem I/O, sem `Date.now()`**. Reusa `canonicalBuyIn` / o `typePrimary` (via `enrichTournamentTypeFields`) de `libraryGrouping.ts` e `timeBin2h` de `shared/time-bin.ts`. **Não reimplementar** nenhum desses.

`libraryCanonicalKey` torna-se a **única definição de "mesmo torneio"** consumida por TODOS os caminhos:
1. `libraryAutoPopulate.decideLibraryAction` / `ensureLibraryEntryForPlanned` (RF-02),
2. `shared/library-dedup.ts:filterNewTournaments` (RF-03),
3. detecção de grupos candidatos do merge (RF-10, Fatia 3),
4. backfill read-only (RF-17, Fatia 6),
5. detecção do sinal de lixeira-recriada (RF-15, Fatia 5).

### Por que incluir `type` na key

`type` separa **PKO de Vanilla no mesmo slot** `(site, dia, hora, buy-in)`. São produtos distintos com EV/variância diferentes; mesclá-los é um falso-positivo que corromperia o modelo de torneio. `typePrimary` usa o SSoT `enrichTournamentTypeFields`, que eleva `Bounty→PKO`, `→Satellite` por nome etc. — corrige detecção fraca do import sem re-importar.

**Trade-off aceito (R2):** `type=null`/desconhecido resolve para Vanilla por default. Isso pode mesclar um `null` com um Vanilla real. É aceitável porque a Fatia 3 nunca auto-mescla — a confirmação interativa do jogador protege. Documentado como comportamento esperado.

### Por que `speed` fica FORA da key (só aviso)

A `speed` (Normal/Turbo/Hyper) sofre de detecção legada inconsistente — imports antigos sub-detectaram Hyper como Normal. Incluí-la na key re-fragmentaria o que deveria ser o mesmo torneio. Mantemos `speed` **fora da key** (não separa o grupo) e a expomos como **aviso visual / tiebreaker** no review de merge (Fatia 3). Mesma motivação pela qual `libraryGrouping` faz `normalizeSpeed` read-side: a velocidade gravada não é confiável o bastante para ser dimensão de identidade.

### Por que `nameSignature` fica FORA da key (mas dentro da classificação)

`nameSignature` é alta-resolução demais para ser dimensão de identidade — variações legítimas do mesmo torneio (sufixos, dia 1A/1B, "deepstack") produziriam keys distintas e travariam a unificação. Por isso a key da Fatia 1 **não** inclui `nameSignature`. Em vez disso, ele é usado **dentro do grupo candidato** (Fatia 3) para graduar confiança: mesma key + mesmo `nameSignature` → "Duplicata" (confiança alta, vencedora pré-sugerida); mesma key + `nameSignature` divergente → "Parecidos, confira" (confiança baixa, NÃO pré-marcado). Isso mantém a unificação agressiva onde é segura e empurra a ambiguidade para a confirmação humana.

### Por que `timeBin` deriva de `time` (HH:MM), NÃO de `datePlayed`

`timeBin2h` em `libraryGrouping`/aba Torneios deriva de `datePlayed`/`startTime` (timestamp de histórico). **Entradas de `tournament_library` não têm `datePlayed`** — têm o campo `time` (HH:MM varchar). Para a key canônica de biblioteca:
1. parsear a hora inteira de `time` (`"19:30"` → `19`);
2. passar o número a `timeBin2h(hour)` (já aceita 0-23 direto) → `"18-20"`;
3. `time` ausente/`null`/inválido → `NO_TIME_BIN`.

Encapsular essa derivação **dentro** de `libraryCanonicalKey` garante uma única definição de "mesmo slot de horário" e evita drift entre os caminhos (R5). É a mesma `timeBin2h`, alimentada por fonte diferente — sem duplicar a lógica de binning.

### Back-compat e idempotência

- **Estado preservado em `decideLibraryAction`:** já-linkado (`libraryTemplateId` presente) → `skip`; match ativo pela key → `link`; só match trashed → `skip` (D5); nenhum → `create`. O comportamento de máquina-de-estados não muda; só a noção de "match" passa de exata para canônica.
- **Não re-duplicar nem re-linkar o que já está linkado:** planned com `libraryTemplateId` setado sempre `skip` (idempotência — RF-02 critério). Rodar `ensureLibraryEntryForPlanned` 2× para o mesmo planned cria no máximo 1 entry.
- **`filterNewTournaments` (RF-03):** preserva o curto-circuito por `externalId` (Suprema); sem `externalId`, compara por `libraryCanonicalKey` contra ativos **E** trashed (não re-importa trashed — D5).
- **Risco assumido (R4):** a key canônica é mais agressiva que a exata (snap de buy-in + speed fora + name fora). Vai **linkar** onde antes **criava** — comportamento desejado, mas exige testes cobrindo entries já linkadas (não re-duplicar) e o caso `$21.60`↔`$22`.

### Performance da query de candidatos (RF-04)

A canonicalização é **em memória** (a key não é coluna). A query base deve ser barata em alto volume. Decisão por caminho:

- **Auto-populate (`ensureLibraryEntryForPlanned`):** a query atual filtra por `(userId, name, site, buyIn)` exatos — incompatível com a key canônica (snap de buy-in + name fora). Trocar para busca **coarse por `(user_id, site)`** trazendo `{ id, name, site, buyIn, time, type, dayOfWeek, deletedAt }` e canonicalizar+filtrar em memória. Em alto volume, `(user_id, site)` reduz drasticamente o conjunto vs `(user_id)` puro.
  - **Índice sugerido (nova migration `0095`):** `idx_tournament_library_user_site ON tournament_library (user_id, site)`. Cobre tanto a busca coarse do auto-populate quanto a do sinal de lixeira (Fatia 5). Incluir `WHERE deleted_at IS NULL` **não** é adequado aqui porque o auto-populate precisa enxergar trashed (para o `skip` da D5); manter o índice sem cláusula parcial.
  - O `idx_tournament_library_user_active` existente (`(user_id) WHERE deleted_at IS NULL`) continua servindo a tela Administrar / detecção sobre ativos.
- **Detecção de grupos / backfill (Fatia 3/6):** carregam todos os **ativos** do user (`idx_tournament_library_user_active`), agrupam por key em **O(n)** num `Map`, e retornam grupos com ≥2 membros. Payload **resumido + paginado** (top N grupos; detalhe sob demanda) para não estourar resposta com milhares de entries.
- **Mitigação de latência:** o auto-populate roda fire-and-forget (`ensureLibraryEntryForPlannedSafe`), então a busca coarse não bloqueia o `create` do planned.

Decisão final de índice: **criar `idx_tournament_library_user_site` na migration `0095_tournament_library_user_site_idx.sql`** (com `_rollback.sql`). Aditivo, idempotente (`CREATE INDEX IF NOT EXISTS`), sem coluna nova.

### Critérios de aceitação consolidados (Parte A)
- Determinístico: mesma entry N vezes → mesma key.
- PKO ≠ Vanilla no mesmo `(site, dia, hora, buyIn)` → keys diferentes.
- `$21.60` ≡ `$22` no mesmo slot → mesma key; `$5` ≠ `$500` → diferentes.
- `dayOfWeek=null` → token `"sem-dia"` (isolado das com dia, mas não distinto entre si).
- `time=null` → `timeBin = "sem-horario"`.
- Speed Normal ≡ Hyper no mesmo slot → mesma key.
- Planned já linkado → `skip`; 2× `ensure` → ≤1 entry.
- Import que difere só no `time` → tratado como diferente; `externalId` dup → curto-circuito; key casando trashed → não re-importa.

---

## Parte B — Fluxo de merge (Fatia 3)

### Decisão

Endpoint novo **`POST /api/tournament-library/merge { winnerId, loserIds[] }`** (sob `requireAuth`), que consolida um grupo de duplicatas escolhido pelo jogador. Nunca auto-merge — o endpoint só executa o que o jogador confirmou na UI lado-a-lado (D2).

#### Detecção de grupos candidatos (read-only, RF-10)
Agrupa os ativos do user por `libraryCanonicalKey`; grupos com **≥2 entries** são candidatos. Classificação dentro do grupo:
- `nameSignature` igual entre membros → **"Duplicata"** (confiança alta; sugere vencedora pré-selecionada).
- `nameSignature` divergente → **"Parecidos, confira"** (confiança baixa; NÃO pré-marcado).
- `speed` divergente → **aviso visual** (não separa o grupo).
A detecção é determinística e não escreve nada. Disponível tanto on-the-fly (Fatia 3) quanto sobre a base inteira no backfill (Fatia 6 / `GET /api/tournament-library/duplicate-groups`).

#### Regra de vencedora (D3)
A UI **sugere** a vencedora; o jogador pode trocar. A sugestão segue:
1. **Mais completa vence** — entry com mais campos não-nulos (contagem dos campos significativos: `guaranteed, time, type, speed, fieldSize, dayOfWeek, currency, addon, reentry, lateRegMinutes, registrationTime`).
2. **Empate → mais recente** (`updatedAt` maior).
3. **`guaranteed` → maior valor preenchido** entre TODOS os membros do grupo, aplicado à vencedora (não apenas o da vencedora).

#### Passo OBRIGATÓRIO: re-apontar a Grade ANTES do soft-delete (D3-d)
A ordem é **inviolável e atômica**:
1. **Validar** (Zod + ownership): todos os ids pertencem ao user do JWT; `winnerId ∉ loserIds`; `loserIds` não-vazio; todos **ativos** (não trashed — race tratado em 4).
2. **Re-apontar** `planned_tournaments.libraryTemplateId` de cada loser → `winnerId` (`UPDATE ... SET library_template_id = winnerId WHERE library_template_id IN (loserIds) AND user_id = jwtUserId`).
3. **Atualizar `guaranteed`** da vencedora para o maior valor preenchido entre os membros (D3-c). Demais campos da vencedora NÃO são alterados (a escolha já foi do jogador).
4. **Soft-delete** das losers (`deletedAt = now()`).

Tudo em **uma transação** (`db.transaction`). Se o re-aponte (passo 2) falhar, **rollback total** — nenhum soft-delete é aplicado (D3-d). Fallback gentil: quando `db.transaction` não está disponível (testes com `db` não inicializado), detectar em runtime e executar o runner direto com `tx = undefined`, conforme lesson #32:
```
const txAvailable = db && typeof db.transaction === "function";
if (txAvailable) await db.transaction(runner); else await runner(undefined);
```
Os storage helpers aceitam `tx?` como último arg opcional e **não** o passam quando `undefined` (preserva aridade que os testes inspecionam).

#### Resposta e idempotência
- Retorno: `{ winnerId, mergedCount, repointedPlannedCount }`.
- **Idempotência / race (RF-12):** re-merge com losers já trashed → **409** com mensagem clara (não re-processa). Loser de outro user → **403/404** (sem vazamento). `winnerId ∈ loserIds` → **400**. `loserIds` vazio → **400**.
- Handler testável com `injectedStorage?` 3º arg (lesson #34); em produção faz lazy `await import("../storage")` quando ausente.

### Por que re-apontar ANTES de soft-deletar (e não depois / em paralelo)
Se soft-deletássemos primeiro (ou em paralelo) e o re-aponte falhasse, planneds ficariam apontando para uma entry trashed → link quebrado na Grade, sem recuperação automática. Re-apontar primeiro garante que, mesmo com rollback, nenhum planned fica órfão. A atomicidade fecha a janela de inconsistência. Este é o risco R1 (falso-positivo de merge quebrando a Grade) e é mitigado por D2 (confirmação) + D3-d (ordem atômica) + classificação "parecidos, confira".

### Performance do re-aponte
`UPDATE planned_tournaments SET library_template_id = ? WHERE library_template_id IN (...) AND user_id = ?`. Hoje **não há índice** em `planned_tournaments.library_template_id` — em alto volume de planneds o re-aponte vira seq scan. **Índice sugerido (mesma migration `0095`):** `idx_planned_tournaments_library_template ON planned_tournaments (library_template_id) WHERE library_template_id IS NOT NULL` (parcial — a maioria das rows pode ter o link nulo). Aditivo, idempotente.

### Critérios de aceitação consolidados (Parte B)
- Após merge, todo `planned_tournaments` que apontava para loser aponta para winner.
- Losers com `deletedAt` setado (lixeira); winner ativo; `guaranteed` = maior do grupo.
- Loser de outro user → 403/404; `winnerId ∈ loserIds` → 400; `loserIds` vazio → 400.
- Falha no re-aponte → rollback, NENHUM soft-delete (regressão obrigatória).
- Re-merge com losers já trashed → 409.
- Grupo "Duplicata" sugere vencedora; "Parecidos" sem pré-seleção; jogador pode trocar.

---

## Opções Consideradas

### Para a key canônica
- **Opção 1 (escolhida): helper puro único em `shared/` reusando os helpers de `libraryGrouping`.**
  - Prós: uma definição de "mesmo torneio"; reusa lógica madura (snap de buy-in, type SSoT); determinística e testável isoladamente; sem migração de dados.
  - Contras: canonicalização em memória (não é coluna indexável) — exige busca coarse + índice de suporte.
- **Opção 2: coluna materializada `canonical_key` na tabela, preenchida por trigger/back-fill.**
  - Prós: dedup por índice UNIQUE no DB; query O(1).
  - Contras: trigger acopla a lógica ao DB (drift com o helper TS); back-fill caro; mudar a regra exige re-materializar tudo; viola o padrão Zod-only/sem-CHECK do projeto. **Rejeitada.**
- **Opção 3: manter as 3 keys e só somar `type` na key exata.**
  - Prós: mudança mínima.
  - Contras: não resolve a divergência (import ainda ignora `time`; auto-populate ainda não snapa buy-in); duplicatas persistem. **Rejeitada.**

### Para o merge
- **Opção 1 (escolhida): endpoint `merge` com re-aponte ANTES do soft-delete, atômico, flag-and-confirm.**
  - Prós: nunca quebra a Grade; reversível (soft-delete); jogador no controle.
  - Contras: exige transação + índice de re-aponte; UI de confirmação.
- **Opção 2: hard-delete das losers após re-aponte.**
  - Contras: irreversível; perde a "lixeira" como rede de segurança. **Rejeitada** (D3 = soft-delete).
- **Opção 3: auto-merge de "Duplicata" confiança-alta sem confirmação.**
  - Contras: proibido por D2; risco de falso-positivo silencioso. **Rejeitada.**

---

## Consequências

**Positivas:**
- Uma única fonte de verdade para "mesmo torneio" — elimina a divergência das 3 keys.
- Reuso de helpers maduros; sem reimplementação.
- Jogador limpa duplicatas legadas sem quebrar a Grade.
- Sem coluna nova; só índices aditivos.

**Negativas / custos:**
- Auto-populate passa a fazer busca coarse + canonicalização em memória (mitigado por índice `(user_id, site)` + fire-and-forget).
- Key mais agressiva pode linkar onde antes criava (R4) — exige bateria de testes de back-compat.
- `type=null`→Vanilla pode sugerir merge de tipos distintos (R2) — coberto pela confirmação.

**Neutras:**
- Nova migration `0095` (2 índices); `BibliotecaPanel` da Grade intacto; regra lixeira→skip preservada; aba Torneios (`groupTournaments`) inalterada.

## Migrations
- **`0095_tournament_library_user_site_idx.sql`** (+ `_rollback.sql`): `idx_tournament_library_user_site ON tournament_library (user_id, site)` + `idx_planned_tournaments_library_template ON planned_tournaments (library_template_id) WHERE library_template_id IS NOT NULL`. Aditivo, `IF NOT EXISTS`, sem coluna nova.
- A Fatia 5 (sinal de lixeira-recriada) pode introduzir uma migration própria posterior (tabela `library_trash_recreate_signals`) — fora do escopo desta rodada; ver diagrama de alto nível.

## Confiança
Alta (Parte A — key canônica e back-compat bem delimitadas pelos helpers existentes).
Alta (Parte B — fluxo de merge com ordem atômica e validações explícitas).
