# Spec: Biblioteca de Torneios — Administrar + Dedup Canônico

## Status
Proposta

## Resumo
Upgrade da Biblioteca de Torneios do Grindfy: (1) unifica as 3 lógicas divergentes de dedup numa única key canônica reusando os helpers espertos de `libraryGrouping.ts`; (2) entrega uma tela nova "Administrar Biblioteca" agrupada por dia da semana com edição inline e ações em massa; (3) adiciona dedup interativo flag-and-confirm (banner + merge 1-clique que re-aponta a grade); (4) trata `dayOfWeek=null`, sinal de lixeira-recriada e backfill read-only de duplicatas prováveis. Para o grinder de alto volume (centenas/milhares de templates).

## Contexto
A `tournament_library` (store permanente por-user, soft-delete) hoje sofre de três problemas que pioram com volume:
- **Dedup fragmentado e inconsistente** entre 3 caminhos (`decideLibraryAction`, `library-dedup.ts`, `libraryGrouping.ts`) — gera duplicatas que o usuário não consegue limpar.
- **Sem tela de administração**: o único painel (`BibliotecaPanel.tsx`) é otimizado para arrastar na aba Grade, não para curar a lista.
- **`dayOfWeek` nullable** se acumula em entries importadas, deixando torneios "soltos" sem dia.

Este upgrade é entregue **direto na main, em fatias pequenas e independentes**, na ordem ICE definida (Fatia 1 antes de 3/6).

## Usuários
- **Jogador (grinder)**: único ator. Administra sua própria biblioteca (edita, exclui, mescla duplicatas, atribui dia). Escopo sempre per-user (`userId` do JWT). Não há ator admin/cross-user nesta spec.

---

## DECISÕES TRAVADAS (founder — não reabrir)

- **D1 — Key canônica de "mesmo torneio"** = `(site, dayOfWeek, timeBin, canonicalBuyIn, typePrimary)`. INCLUI `type` (PKO ≠ Vanilla no mesmo slot). `speed` NÃO entra na key (vira aviso/tiebreaker). `nameSignature` divergente dentro do grupo candidato → rebaixa "duplicata" → "parecidos, confira" (confiança menor, não pré-marcado).
- **D2 — Dedup é flag-and-confirm**: NUNCA auto-merge silencioso, NUNCA bloqueia a criação. Banner → grupos lado-a-lado → user escolhe vencedora → merge 1-clique.
- **D3 — Regra de merge (vencedora)**: (a) entrada mais COMPLETA (mais campos não-nulos) vence; (b) empate → mais recente (`updatedAt`); (c) `guaranteed` = maior valor preenchido; (d) **OBRIGATÓRIO re-apontar `planned_tournaments.libraryTemplateId` das perdedoras → vencedora ANTES de soft-deletar as perdedoras**. Merge = soft-delete das perdedoras (lixeira, reversível).
- **D4 — `dayOfWeek=null`**: balde "Sem dia (N)" no TOPO da tela Administrar. Quando derivável (import grind-live tem data de origem) sugerir "Domingo (sugerido)" com 1-clique confirmar. Atribuição de dia em massa.
- **D5 — Regra lixeira→skip MANTIDA** (não inverter). Adicionar SINAL: auto-populate detecta match na lixeira → NÃO ressuscita, mas registra sinal que a tela mostra: "Você recriou 'X' que está na lixeira — restaurar?" (1-clique).
- **D6 — Armazenar todo torneio criado mesmo após exclusão da grade** já funciona (tabelas separadas) — documentado como verificado; sem trabalho novo além do sinal de lixeira (D5).

---

## Estado atual verificado

- **Tabela `tournament_library`** (`shared/schema.ts:2716`): colunas `name, site, buyIn (decimal), guaranteed (decimal nullable), time (HH:MM varchar nullable), type (Vanilla/PKO/Mystery/Satellite/Add-on), speed (Normal/Turbo/Hyper), fieldSize (int nullable), dayOfWeek (int 0=Dom..6=Sáb, NULLABLE), currency (default USD), allowsAddOn/addOnCost, allowsReentry/maxReentries, lateRegMinutes, registrationTime, source (manual/suprema/grind-live/csv), externalId, deletedAt, createdAt, updatedAt`. Index parcial `idx_tournament_library_user_active ON (user_id) WHERE deleted_at IS NULL`.
- **`planned_tournaments.libraryTemplateId`** = FK lógico para `tournament_library.id` (link grade↔biblioteca).
- **3 keys de dedup divergentes (consolidar = Fatia 1)**:
  - `server/services/libraryAutoPopulate.ts:63` `decideLibraryAction`: key exata `(userId, name, site, buyIn, time)`; já-linkado→skip; ativo→link; trashed→skip; nenhum→create. Disparado fire-and-forget de `storage.createPlannedTournament` (cobre POST rota + Series Day2 + coach tool `register_tournament_in_grade`).
  - `shared/library-dedup.ts:61` `filterNewTournaments`: key `externalId` OU `(name.toLowerCase, site, buyIn)` — IGNORA time. Usado no import grind-live/Suprema.
  - `server/services/libraryGrouping.ts:170` `groupTournaments` (aba Torneios/famílias): já tem `canonicalBuyIn` (±3% snap), `nameSignature`, `buyInTier`, `timeBin2h`, `typePrimary` — a lógica esperta a reusar.
- **Helpers reusáveis confirmados** (exportados em `libraryGrouping.ts`): `canonicalBuyIn(raw:number)`, `buyInTier`, `nameSignature(name)`, `typePrimary` (via `enrichTournamentTypeFields`), `normalizeSpeed`, `fieldBucketOf`, `timeBinOf`. + `shared/time-bin.ts:timeBin2h(value)` aceita **número 0-23 direto** (relevante p/ derivar bin do campo `time` HH:MM).
- **Endpoints existentes** (`server/routes/tournament-library.ts`): `GET` lista, `GET` trash, `POST` create, `PUT/PATCH` update (~557/596), `PATCH /:id/trash`, `POST /:id/restore`, `DELETE` permanente. **Não há bulk nem merge.**
- **UI atual**: `client/src/components/grade-planner/BibliotecaPanel.tsx` (painel lateral da Grade, otimizado p/ arrastar) — **MANTER intacto**. A tela "Administrar" é NOVA.

---

## ⚠️ Ambiguidade resolvida (decisão de spec) — `timeBin` da key canônica

`timeBin2h` em `libraryGrouping`/aba Torneios deriva da **`datePlayed`/`startTime`** (timestamp de histórico). Entradas de `tournament_library` **não têm `datePlayed`** — têm o campo **`time` (HH:MM varchar)**.

**Decisão (documentada, escolha única):** para a key canônica de biblioteca, derivar o `timeBin` a partir do campo `time` HH:MM:
1. Parsear a hora inteira de `time` (ex.: `"19:30"` → `19`).
2. Passar o número à `timeBin2h(hour)` (já aceita 0-23 direto) → `"18-20"`.
3. `time` ausente/`null`/inválido → `NO_TIME_BIN` (`"sem-horario"`).

Encapsular num helper único compartilhado `libraryCanonicalKey(entry)` (Fatia 1) que **todos** os caminhos consomem. Isto garante uma única definição de "mesmo slot de horário".

---

# Fatia 1 — Unificar dedup numa key canônica (MUST · ICE 8.0 · ordem #1)

## Objetivo
Substituir as 3 keys divergentes por uma única `libraryCanonicalKey` reusando os helpers de `libraryGrouping`, incluindo `type`. Idempotente e back-compat (não duplicar o que já está linkado).

## Requisitos Funcionais

### RF-01: Helper canônico único `libraryCanonicalKey`
**Descrição:** Criar função pura compartilhada (sugestão: `shared/library-canonical-key.ts`) que recebe uma entry/planned-like e retorna a key canônica string.
**Regras de negócio:**
- Key = `${site}|${dayOfWeek}|${timeBin}|${canonicalBuyIn}|${typePrimary}` com:
  - `site` = string normalizada (`(site ?? "Unknown").toString()`).
  - `dayOfWeek` = `0..6`; `null` → token literal `"sem-dia"` (entries sem dia NÃO colidem entre si por essa dimensão).
  - `timeBin` = derivado de `time` HH:MM conforme decisão acima (`timeBin2h`), `NO_TIME_BIN` quando ausente.
  - `canonicalBuyIn` = `canonicalBuyIn(parseFloat(buyIn))` (snap ±3%).
  - `typePrimary` = `enrichTournamentTypeFields({name, category:type}).type` (PKO/Vanilla/Mystery/Satellite).
- `speed` NÃO entra na key.
- Função pura, determinística, sem I/O, sem `Date.now()`.
**Critério de aceitação:**
- [ ] Mesma entry chamada N vezes → mesma key (determinístico).
- [ ] PKO e Vanilla no mesmo `(site, dia, hora, buyIn)` → keys DIFERENTES.
- [ ] `$21.60` e `$22` no mesmo slot → MESMA key (via `canonicalBuyIn`).
- [ ] `$5` e `$500` no mesmo slot → keys diferentes.
- [ ] `dayOfWeek=null` em duas entries → ambas com token `"sem-dia"` (não tratadas como dias distintos, mas isoladas das com dia).
- [ ] `time=null` → `timeBin` = `"sem-horario"`.
- [ ] Speed Normal vs Hyper no mesmo slot → MESMA key (speed fora).

### RF-02: `decideLibraryAction` passa a usar a key canônica
**Descrição:** Migrar `libraryAutoPopulate.decideLibraryAction` + `ensureLibraryEntryForPlanned` da key exata `(name, site, buyIn, time)` para `libraryCanonicalKey`.
**Regras de negócio:**
- Comportamento de estado preservado: já-linkado→skip; match ativo→link; só match trashed→skip; nenhum→create.
- A query de candidatos NÃO pode mais filtrar por `name`/`buyIn` exatos no SQL (a canonicalização é em memória). Buscar candidatos do user por dimensões coarse e filtrar pela key canônica em memória — OU computar a key no carregamento. (Decisão de implementação delegada ao architect; ver edge case de performance.)
- `register_tournament_in_grade` (coach), Series Day2 e POST rota continuam cobertos via `createPlannedTournament` (sem mudança nos call sites).
**Critério de aceitação:**
- [ ] Planned com `$21.60` casa entry existente `$22` no mesmo slot → `link` (antes: `create`, duplicava).
- [ ] PKO planned NÃO casa Vanilla existente no mesmo slot → `create`.
- [ ] Planned já com `libraryTemplateId` → `skip` (idempotência).
- [ ] Match só na lixeira → `skip` (D5 mantida).
- [ ] Rodar `ensureLibraryEntryForPlanned` 2× pro mesmo planned → no máximo 1 entry criada.

### RF-03: `filterNewTournaments` (import) passa a usar a key canônica
**Descrição:** Migrar `shared/library-dedup.ts:filterNewTournaments` para a key canônica (mantendo o curto-circuito por `externalId` quando presente).
**Regras de negócio:**
- `externalId` não-nulo casando existente → duplicata (curto-circuito preservado — Suprema).
- Sem `externalId` → comparar por `libraryCanonicalKey` (NÃO mais `name.toLowerCase + site + buyIn` ignorando time).
- Comparar contra ativos E trashed (preserva comportamento atual de não re-importar trashed).
**Critério de aceitação:**
- [ ] Import grind-live de torneio que difere só no `time` de um existente → tratado como DIFERENTE (antes: ignorava time, mesclava errado).
- [ ] Import com `externalId` duplicado → filtrado (curto-circuito).
- [ ] Import casando entry trashed por key canônica → filtrado (não re-importa).

### RF-04: Índice de suporte à query canônica
**Descrição:** Avaliar índice para a busca coarse de candidatos por user (a key é em memória, mas a query base deve ser barata).
**Regras de negócio:**
- Reusar o `idx_tournament_library_user_active` existente quando a busca for por `(user_id) WHERE deleted_at IS NULL`.
- Se a estratégia escolhida (architect) filtrar coarse por `(user_id, site)` ou `(user_id, day_of_week)`, criar índice composto correspondente.
**Critério de aceitação:**
- [ ] Decisão de índice documentada no ADR; se nova migration, segue numeração sequencial (próxima após ~0094).

## Mudanças de Dados
- Nenhuma coluna nova obrigatória. Possível índice de suporte (RF-04) — definir no architect.

## Endpoints
- Nenhum novo. Mudança interna nos services consumidos pelos endpoints/handlers existentes.

## Componentes UI
- Nenhum.

## Edge Cases
- [ ] **Falso-positivo `type`**: torneio com `type=null`/desconhecido — `typePrimary` resolve para default Vanilla; documentar que `null`→Vanilla pode mesclar com Vanilla real (aceitável — a confirmação interativa da Fatia 3 protege).
- [ ] **Alto volume**: carregar todos os templates do user em memória para canonicalizar pode ser caro (milhares). Mitigar com busca coarse por `(user_id, site)` ou pré-cálculo. Documentar trade-off no ADR.
- [ ] **`buyIn` string com vírgula/símbolo** → `parseFloat` robusto; entrada inválida → key com `canonicalBuyIn=0` (não derruba).

## Dependências
- Nenhuma (é a base das fatias 3 e 6).

---

# Fatia 2 — Tela "Administrar Biblioteca" (MUST · ICE 7.3)

## Objetivo
Tela nova agrupada por dia da semana, balde "Sem dia" no topo, edição inline + modal full, exclusão fácil. Reusa endpoints existentes.

## Requisitos Funcionais

### RF-05: Rota e shell da tela
**Descrição:** Rota Wouter nova (sugestão `/biblioteca/administrar`) com a tela de administração. Não substitui `BibliotecaPanel`.
**Regras de negócio:**
- Página standalone (não painel lateral). Carrega `GET` lista (ativos) via TanStack Query.
- Acesso a partir de link/CTA na área de Biblioteca/Grade (architect define o ponto de entrada).
**Critério de aceitação:**
- [ ] Navegar para a rota renderiza a tela sem quebrar o `BibliotecaPanel` da Grade.
- [ ] Lista vazia → empty-state PT-BR ("Nenhum torneio na biblioteca").

### RF-06: Agrupamento por dia da semana
**Descrição:** Entries agrupadas em 8 seções: "Sem dia" (topo, destacado) + Domingo..Sábado.
**Regras de negócio:**
- Ordem fixa: "Sem dia (N)" primeiro, depois Dom(0)→Sáb(6).
- Cada seção mostra contagem. Seção vazia oculta (exceto "Sem dia" só aparece se N>0).
- Dentro da seção, ordenar por `time` (asc, `null` por último).
**Critério de aceitação:**
- [ ] Balde "Sem dia" aparece no topo quando há entries com `dayOfWeek=null`.
- [ ] Contagem por seção bate com os dados.
- [ ] Ordenação por horário dentro da seção.

### RF-07: Edição inline (dayOfWeek / time / guaranteed)
**Descrição:** Editar `dayOfWeek`, `time` e `guaranteed` inline na linha, sem abrir modal.
**Regras de negócio:**
- Persiste via `PATCH /:id` existente.
- Validação Zod no client (time HH:MM; guaranteed numérico ≥0 ou vazio→null; dayOfWeek 0-6 ou null).
- Otimistic update + invalidação de cache TanStack pós-sucesso (lesson #21 — invalidar por prefixo de queryKey).
**Critério de aceitação:**
- [ ] Editar `dayOfWeek` de "Sem dia" → linha migra para a seção do dia escolhido após sucesso.
- [ ] Editar `time` inválido → erro de validação, sem PATCH.
- [ ] `guaranteed` apagado → salvo como `null`.

### RF-08: Modal full de edição (demais campos)
**Descrição:** Modal com todos os campos editáveis (name, site, buyIn, type, speed, fieldSize, currency, addon, reentry, lateReg, registrationTime).
**Regras de negócio:**
- React Hook Form + Zod resolver; persiste via `PATCH /:id`.
- Reusar schema `insertTournamentLibrarySchemaBase` (partial para update).
**Critério de aceitação:**
- [ ] Abrir modal preenche todos os campos da entry.
- [ ] Salvar persiste e atualiza a lista.
- [ ] Editar `buyIn` para valor inválido (≤0) → erro Zod, sem PATCH.

### RF-09: Exclusão fácil (trash) por linha
**Descrição:** Botão excluir por linha → `PATCH /:id/trash` (soft-delete, vai p/ lixeira).
**Regras de negócio:**
- Confirmação leve (não modal pesado). Reversível via lixeira.
- Pós-trash, invalidar cache.
**Critério de aceitação:**
- [ ] Excluir remove da lista de ativos e aparece na lixeira.
- [ ] Não é delete permanente (continua restaurável).

## Mudanças de Dados
- Nenhuma.

## Endpoints
| Método | Rota | Status | Uso |
|---|---|---|---|
| GET | /api/tournament-library | reusado | Lista ativos |
| PATCH | /api/tournament-library/:id | reusado | Edição inline + modal |
| PATCH | /api/tournament-library/:id/trash | reusado | Excluir |

## Componentes UI
- `AdministrarBibliotecaPage` (página/rota).
- `LibraryDaySection` (seção por dia com contagem).
- `LibraryRow` (linha com edição inline).
- `LibraryEditModal` (modal full).
- Empty-states PT-BR.

## Edge Cases
- [ ] **Alto volume (milhares)**: lista virtualizada ou paginada por seção (architect decide; performance é requisito).
- [ ] Entry com `time=null` ordena por último na seção.
- [ ] Edição concorrente (duas abas) → última escrita vence (sem lock; aceitável).

## Dependências
- Independente da Fatia 1 (só reusa endpoints). Pode ser entregue em paralelo, mas a ordem global mantém Fatia 1 primeiro.

---

# Fatia 3 — Flag-and-confirm de duplicatas (MUST · ICE 6.3 · depende de Fatia 1)

## Objetivo
Detectar grupos candidatos pela key canônica, mostrar banner + UI lado-a-lado, e endpoint `merge` que re-aponta a grade antes de soft-deletar perdedoras.

## Requisitos Funcionais

### RF-10: Detecção de grupos candidatos (read-only)
**Descrição:** Agrupar os ativos do user por `libraryCanonicalKey`; grupos com ≥2 entries = candidatos a merge.
**Regras de negócio:**
- Dentro do grupo candidato, se `nameSignature` divergir entre membros → rebaixar confiança: rótulo "Parecidos, confira" (NÃO pré-marcado). `nameSignature` igual → "Duplicata" (confiança alta).
- `speed` divergente no grupo → aviso visual (tiebreaker), não separa o grupo.
- Computação determinística e read-only (não escreve nada).
**Critério de aceitação:**
- [ ] 2 entries mesma key + mesmo `nameSignature` → grupo "Duplicata".
- [ ] 2 entries mesma key + `nameSignature` diferente → grupo "Parecidos, confira".
- [ ] Grupo com 1 entry → NÃO listado.
- [ ] Speed divergente → aviso, grupo mantido.

### RF-11: Banner + UI lado-a-lado
**Descrição:** Banner na tela Administrar ("N grupos de possíveis duplicatas") → painel com grupos lado-a-lado.
**Regras de negócio:**
- Mostrar campos de cada membro lado-a-lado (name, site, buyIn, time, type, speed, guaranteed, dayOfWeek, source, updatedAt).
- Sugerir a vencedora segundo regra D3 (mais completa → mais recente), mas user pode escolher outra.
- "Parecidos, confira" NÃO vem pré-marcado; "Duplicata" pode sugerir vencedora pré-selecionada.
- Merge 1-clique após escolha.
**Critério de aceitação:**
- [ ] Banner some quando não há grupos candidatos.
- [ ] Grupo "Duplicata" vem com vencedora sugerida; "Parecidos" sem pré-seleção.
- [ ] User pode trocar a vencedora antes de confirmar.

### RF-12: Endpoint de merge
**Descrição:** `POST /api/tournament-library/merge { winnerId, loserIds[] }`.
**Regras de negócio (D3):**
- Validar: todos pertencem ao user (ownership); winner∉loserIds; loserIds não-vazio; todos ativos (não trashed).
- **ORDEM OBRIGATÓRIA e atômica**: (1) re-apontar `planned_tournaments.libraryTemplateId` de cada loser → winner; (2) só então soft-delete (`deletedAt=now()`) das losers. Em transação (com fallback gentil quando `db.transaction` indisponível em teste — lesson #32).
- `guaranteed` do winner: se alguma loser tem `guaranteed` maior que o do winner, atualizar winner para o maior valor preenchido (D3-c). Demais campos do winner NÃO são alterados (a escolha de vencedora já foi do user).
- Retornar `{ winnerId, mergedCount, repointedPlannedCount }`.
- Idempotência: re-merge com losers já trashed → erro 409/validação clara (não re-processa).
**Critério de aceitação:**
- [ ] Após merge, todo `planned_tournaments` que apontava para loser aponta para winner.
- [ ] Losers ficam com `deletedAt` setado (na lixeira).
- [ ] Winner permanece ativo; `guaranteed` = maior valor entre os membros.
- [ ] Loser de outro user → 403/404 (sem vazamento).
- [ ] `winnerId` ∈ `loserIds` → 400.
- [ ] Falha no re-aponte → rollback, NENHUM soft-delete aplicado (atomicidade — D3-d).

## Mudanças de Dados
- Nenhuma coluna nova. (Detecção é read-only; merge usa colunas existentes.)

## Endpoints
| Método | Rota | Status | Auth |
|---|---|---|---|
| POST | /api/tournament-library/merge | NOVO | JWT (requireAuth) |
| (detecção de grupos) | ver RF-10 — pode ser cliente-side sobre `GET` lista, ou endpoint read-only dedicado | a definir (architect) | JWT |

## Componentes UI
- `DuplicateBanner`.
- `DuplicateGroupReview` (lado-a-lado + seleção de vencedora + botão merge).

## Edge Cases
- [ ] **Merge que quebra o link da grade**: coberto por D3-d (re-aponte ANTES do soft-delete, atômico). Teste explícito de regressão.
- [ ] **Falso-positivo**: "Parecidos, confira" nunca pré-marca; merge sempre exige confirmação (D2).
- [ ] **Loser já trashed entre a detecção e o merge** (race) → validação 409.
- [ ] **Winner também aparece em outro grupo candidato** → permitido; cada merge é independente.
- [ ] **Alto volume de grupos** → paginar/limitar a detecção (ex.: top N grupos); documentar.

## Dependências
- **Fatia 1** (key canônica) — bloqueante.
- Fatia 2 (tela onde o banner vive) — bloqueante para a UI; o endpoint `merge` pode ser entregue antes.

---

# Fatia 4 — Ações em massa (SHOULD · ICE 7.3)

## Objetivo
Multi-select com trash em massa e atribuição de dia em massa.

## Requisitos Funcionais

### RF-13: Multi-select + trash em massa
**Descrição:** Selecionar várias linhas → `POST /api/tournament-library/bulk-trash { ids[] }`.
**Regras de negócio:**
- Validar ownership de todos os `ids`; ignorar/erro claro para ids inexistentes ou de outro user.
- Soft-delete de todos em uma operação (transação).
- Retornar `{ trashedCount }`.
**Critério de aceitação:**
- [ ] Selecionar 5 e trash → 5 vão para lixeira em uma chamada.
- [ ] id de outro user no array → não afeta (404/skip documentado), sem vazamento.
- [ ] `ids` vazio → 400.

### RF-14: Atribuir dia em massa
**Descrição:** Selecionar várias linhas (esp. do balde "Sem dia") → atribuir `dayOfWeek` em massa.
**Regras de negócio:**
- Endpoint `POST /api/tournament-library/bulk-set-day { ids[], dayOfWeek }` (ou `bulk-update` genérico — architect decide; preferir específico p/ clareza).
- `dayOfWeek` 0-6 (não permite null em massa — limpar dia é por linha).
- Ownership validada; transação.
**Critério de aceitação:**
- [ ] Selecionar 10 "Sem dia" + atribuir Domingo → 10 migram para a seção Domingo.
- [ ] `dayOfWeek` fora de 0-6 → 400.

## Mudanças de Dados
- Nenhuma.

## Endpoints
| Método | Rota | Status | Auth |
|---|---|---|---|
| POST | /api/tournament-library/bulk-trash | NOVO | JWT |
| POST | /api/tournament-library/bulk-set-day | NOVO | JWT |

## Componentes UI
- Checkbox de seleção em `LibraryRow` + barra de ações em massa (`BulkActionBar`).

## Edge Cases
- [ ] **Alto volume**: cap no tamanho do array (ex.: 500 ids/chamada); documentar limite.
- [ ] Seleção mista (com e sem dia) ao atribuir dia → todos recebem o dia escolhido (sobrescreve).

## Dependências
- Fatia 2 (a tela e as linhas com seleção).

---

# Fatia 5 — Sinal de lixeira-recriada (SHOULD · ICE 6.7)

## Objetivo
Quando auto-populate detecta match na lixeira (D5: skip mantido), registrar um sinal que a tela Administrar mostra para o user restaurar com 1-clique.

## Requisitos Funcionais

### RF-15: Registrar sinal no skip-por-lixeira
**Descrição:** Em `decideLibraryAction`/`ensureLibraryEntryForPlanned`, quando a decisão é `skip` POR causa de match trashed (não outros skips), registrar um sinal por-user.
**Regras de negócio:**
- NÃO ressuscita a entry (D5 — skip mantido).
- O sinal identifica a entry trashed candidata + contexto (nome, quando o user "recriou").
- Dedupe: não acumular sinal duplicado para a mesma entry trashed repetidamente (1 sinal ativo por entry trashed).
- Sinal expira/limpa quando o user restaura ou descarta.
**Critério de aceitação:**
- [ ] Criar planned que casa entry na lixeira → sinal registrado, entry permanece trashed.
- [ ] Repetir → não duplica o sinal.
- [ ] Restaurar a entry → sinal consumido/removido.

### RF-16: Exibição + restaurar 1-clique
**Descrição:** Tela Administrar mostra "Você recriou 'X' que está na lixeira — restaurar?" com botão.
**Regras de negócio:**
- Restaurar usa `POST /:id/restore` existente.
- Descartar o sinal sem restaurar também disponível.
**Critério de aceitação:**
- [ ] Sinal visível na tela com nome correto.
- [ ] Restaurar → entry volta para ativos + sinal some.
- [ ] Descartar → sinal some, entry continua na lixeira.

## Mudanças de Dados
- **Migration NOVA** (decisão de spec; architect confirma shape): tabela `library_trash_recreate_signals` (ou coluna/flag — architect decide). Sugestão de tabela:
  - `id varchar PK` (nanoid), `userId varchar` (FK users, cascade), `trashedLibraryId varchar` (entry na lixeira), `recreatedName varchar`, `status varchar(16) default 'active'` (active|restored|dismissed), `createdAt`, `updatedAt`.
  - UNIQUE `(userId, trashedLibraryId)` WHERE status='active' (dedupe — RF-15).
  - Sem CHECK no DB (Zod-only, padrão do projeto). nanoid id. Numeração migration sequencial.
- **Alternativa mais barata (architect avalia):** derivar o sinal on-read (sem tabela) cruzando planned recentes × entries trashed por key canônica. Trade-off: sem dedupe persistente nem "dismissed". Preferência: tabela leve para suportar "dismissed".

## Endpoints
| Método | Rota | Status | Auth |
|---|---|---|---|
| GET | /api/tournament-library/trash-signals | NOVO (se tabela) | JWT |
| POST | /api/tournament-library/trash-signals/:id/dismiss | NOVO (se tabela) | JWT |
| POST | /api/tournament-library/:id/restore | reusado | JWT |

## Edge Cases
- [ ] Sinal para entry que foi deletada permanentemente → limpar/ignorar.
- [ ] Múltiplos planned recriando a mesma entry trashed → 1 sinal (dedupe).

## Dependências
- Fatia 1 (a detecção usa a key canônica para saber que é "o mesmo torneio" da lixeira).
- Fatia 2 (a tela exibe).

---

# Fatia 6 — Backfill: relatório read-only de duplicatas prováveis (NICE · ICE 6.3 · depende de Fatia 1)

## Objetivo
Varrer a biblioteca existente do user e produzir o conjunto de grupos candidatos que alimenta o banner da Fatia 3. NÃO auto-mescla.

## Requisitos Funcionais

### RF-17: Cálculo read-only de duplicatas prováveis sobre a base existente
**Descrição:** Sobre todos os ativos do user, aplicar `libraryCanonicalKey` e retornar grupos com ≥2 entries (mesma lógica da RF-10), incluindo a classificação confiança alta/baixa.
**Regras de negócio:**
- 100% read-only (nenhuma escrita).
- É a mesma engine de detecção da RF-10 aplicada à base inteira (não só novas inserções).
- Resultado consumido pelo banner (Fatia 3).
**Critério de aceitação:**
- [ ] Biblioteca legada com duplicatas reais (mesmo slot, buy-in dentro do snap) → listadas.
- [ ] Nenhuma escrita ocorre (verificável: contagem de entries inalterada após chamar).
- [ ] Performance aceitável para milhares de entries (ver edge case).

## Mudanças de Dados
- Nenhuma.

## Endpoints
| Método | Rota | Status | Auth |
|---|---|---|---|
| GET | /api/tournament-library/duplicate-groups | NOVO (read-only) | JWT |

## Componentes UI
- Reusa `DuplicateBanner`/`DuplicateGroupReview` da Fatia 3.

## Edge Cases
- [ ] **Alto volume (milhares)**: agrupamento O(n) em memória via key (barato), mas limitar payload (resumo + top N grupos; detalhe sob demanda). Documentar.
- [ ] Idempotência de leitura: chamar 2× retorna o mesmo conjunto (sem efeito colateral).

## Dependências
- Fatia 1 (key canônica) + Fatia 3 (UI do banner). É essencialmente RF-10 aplicada à base inteira.

---

# Fatia 7 — Derivar dayOfWeek no import (SHOULD · ICE 6.7)

## Objetivo
Imports grind-live/Suprema passam a setar `dayOfWeek` a partir da data de origem, reduzindo o balde "Sem dia".

## Requisitos Funcionais

### RF-18: Derivar dayOfWeek na ingestão
**Descrição:** No caminho de import (grind-live e Suprema), quando há data de origem (`datePlayed`/`startTime`), computar `dayOfWeek` e gravar na entry de biblioteca criada.
**Regras de negócio:**
- `dayOfWeek` = dia da semana da data de origem (0=Dom..6=Sáb). Usar a mesma convenção de TZ do `timeBin2h` (UTC server-side — lesson de `time-bin.ts`) para consistência; documentar a escolha de TZ.
- Só seta quando a data existe; sem data → permanece `null` (balde "Sem dia").
- Não sobrescreve `dayOfWeek` já preenchido em entry existente (link/skip).
**Critério de aceitação:**
- [ ] Import grind-live com data de domingo → entry nasce com `dayOfWeek=0`.
- [ ] Import sem data → `dayOfWeek=null` (balde Sem dia).
- [ ] Entry existente com dia → não sobrescrita.

## Mudanças de Dados
- Nenhuma.

## Endpoints
- Nenhum novo (mudança no service de import).

## Edge Cases
- [ ] Ambiguidade de TZ (data próxima da meia-noite) → documentar que usa UTC (paridade com `timeBin2h`); divergência aceitável.
- [ ] Suprema sem data confiável → não força dia.

## Dependências
- Independente; complementa D4/Fatia 2 (reduz o balde "Sem dia").

---

## Requisitos Não-Funcionais (todas as fatias)
- **Performance:** todas as operações de leitura/agrupamento devem suportar **milhares de templates por user** sem degradar a UI. Agrupamento por key canônica é O(n) em memória; payloads de detecção devem ser resumidos/paginados. Tela Administrar com lista virtualizada ou paginada.
- **Segurança:** todo endpoint sob `requireAuth`; ownership por `userId` do JWT em TODA leitura e escrita (nenhum cross-user — esp. `merge`, `bulk-*`). Validação Zod antes de qualquer escrita.
- **Atomicidade:** `merge` (D3-d) e `bulk-*` em transação, com fallback gentil quando `db.transaction` indisponível (lesson #32).
- **Idempotência:** dedup (Fatia 1) e merge não duplicam nem reprocessam estado já consolidado.
- **Back-compat:** key canônica não deve re-duplicar entries já corretamente linkadas; `BibliotecaPanel` da Grade intacto; regra lixeira→skip preservada.

## Telemetria
- Evento ao abrir a tela Administrar (volume de entries, % sem dia).
- Evento ao executar `merge` (`mergedCount`, `repointedPlannedCount`, confiança alta vs "parecidos").
- Evento ao executar `bulk-trash` / `bulk-set-day` (count).
- Evento ao restaurar via sinal de lixeira (Fatia 5).
- Contador de grupos candidatos detectados no backfill (Fatia 6) — para medir o tamanho do problema na base.
- (Reusar o padrão de telemetria/track existente do projeto; CSRF-exempt conforme padrão atual.)

## Ordem de Entrega (obrigatória)
1. **Fatia 1** (MUST · base de tudo) — bloqueante de 3, 5 e 6.
2. **Fatia 2** (MUST · tela) — pode iniciar em paralelo à 1 (só reusa endpoints), mas entregar após/junto.
3. **Fatia 3** (MUST) — depende de 1 (key) + 2 (UI banner).
4. **Fatia 4** (SHOULD) — depende de 2.
5. **Fatia 5** (SHOULD) — depende de 1 + 2.
6. **Fatia 7** (SHOULD) — independente; complementa D4.
7. **Fatia 6** (NICE) — depende de 1 + 3.

## Fora de Escopo
- Ator admin / curadoria cross-user da biblioteca (out — escopo é per-user).
- Auto-merge silencioso de qualquer tipo (proibido por D2).
- Inverter a regra lixeira→skip (proibido por D5).
- Mudanças no `BibliotecaPanel.tsx` da Grade (manter intacto).
- Mudanças no scoring/Tournament Selector ou no agrupamento da aba Torneios (`groupTournaments` continua servindo a aba Torneios; aqui só reusamos seus helpers).
- Merge de entries entre usuários diferentes.
- Re-import / conversão de `session_tournaments` (regra §6.1 do CLAUDE.md inalterada).
- LLM/IA na detecção de duplicatas (a detecção é determinística por key + `nameSignature`).
- Histórico/auditoria de merges (não há ledger de merge nesta spec).

## Riscos
- **R1 — Falso-positivo de merge** quebrando a grade: mitigado por D2 (confirmação) + D3-d (re-aponte atômico) + classificação "parecidos, confira" para `nameSignature` divergente. Teste de regressão obrigatório do re-aponte.
- **R2 — `type=null`→Vanilla** mesclando torneios distintos: mitigado pela confirmação interativa; documentar comportamento de default de tipo.
- **R3 — Performance em alto volume**: a canonicalização em memória exige carregar candidatos; estratégia de busca coarse + paginação de detecção decidida no ADR. Risco de regressão de latência na auto-populate (fire-and-forget mitiga impacto no create).
- **R4 — Regressão de dedup na auto-populate**: a key canônica é mais "agressiva" que a exata (snap de buy-in + ignora speed + nameSignature fora da key da Fatia 1) — pode LINKAR onde antes CRIAVA. É o comportamento desejado, mas exige testes cobrindo back-compat de entries já linkadas.
- **R5 — Divergência de `timeBin`**: derivar de `time` HH:MM (biblioteca) vs `datePlayed` (aba Torneios) usa fontes diferentes; encapsular num único helper `libraryCanonicalKey` evita drift. Risco se algum caminho esquecer de usar o helper.
- **R6 — TZ na derivação de `dayOfWeek`/`timeBin`**: UTC server-side (paridade `time-bin.ts`) pode divergir do wall-clock do jogador perto da meia-noite. Aceito; documentado.

## Notas de Implementação (opcional)
- Centralizar `libraryCanonicalKey` em `shared/` e fazer TODOS os caminhos (auto-populate, import, detecção, backfill) consumirem o MESMO helper — é o coração da consistência.
- Reusar `canonicalBuyIn`, `nameSignature`, `typePrimary`, `timeBin2h` já exportados; não reimplementar.
- Para `timeBin` de biblioteca: parsear hora de `time` HH:MM e passar o número a `timeBin2h` (já aceita 0-23).
- `merge`/`bulk-*` seguem o padrão de handler testável com `injectedStorage?` 3º arg (lesson #34) e fallback de transação (lesson #32).
- Invalidação de cache TanStack por prefixo de queryKey após mutações (lesson #21).
- Links Wouter v3 single-anchor na tela nova (lesson #23).
