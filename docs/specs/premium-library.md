# Spec: Biblioteca Premium curada

## Status
Proposta

## Resumo
Curadores (contas com a permissão `premium_library_curate`) promovem famílias de torneios "as melhores da grade" para uma **Biblioteca Premium global** que aparece para TODOS os usuários autenticados no topo da aba Torneios. Inclui um painel de curadoria que lista os destaques *pessoais* de todas as contas e permite importá-los para a Premium.

## Contexto
Já existe um sistema de **Destaques salvos pessoal** (tabela `saved_tournament_highlights`, por-user, `UNIQUE(userId, familyKey)`): cada jogador salva suas famílias e elas ficam fixadas no topo de Torneios apenas para ele. A Biblioteca Premium é uma camada **curada e global** sobre esse mesmo conceito de "família + snapshot de métricas": apenas curadores escrevem, mas todos leem. O objetivo é ter uma vitrine confiável dos melhores torneios da grade, selecionada manualmente por especialistas.

Esta spec cobre a **Fase 1** completa, incluindo o painel cross-user de curadoria (decisão travada com o founder).

## Usuários
- **Usuário comum** (qualquer conta autenticada): *vê* a faixa "Biblioteca Premium" no topo de Torneios e abre o drill-down. Não escreve.
- **Curador** (conta com permissão `premium_library_curate` — founder + 2 contas): tudo que o usuário comum faz, mais: promover família à Premium, remover da Premium, acessar o painel cross-user (destaques pessoais de todas as contas) e importar deles para a Premium.

## Decisões travadas (não re-discutir)
1. Identidade do curador = permissão concedível `premium_library_curate` (NÃO hardcode de email). Concedida via `AdminUsers` / PermissionManager às 3 contas.
2. Superfície = nova faixa no topo de `TournamentLibraryNew.tsx`, acima de "Destaques salvos". Não é página dedicada nesta fase.
3. Painel cross-user de curadoria está **dentro** desta fase.
4. Snapshot de métricas no momento da promoção (sobrevive a mudança de histórico), igual ao highlight pessoal.

## Pré-requisito de infraestrutura crítico (LER ANTES — ver Riscos R-1)
O middleware atual `requirePermission(name)` (server/auth.ts:452) **não checa permissões por-usuário** para nomes arbitrários: para nomes em `adminOnly` nega todos menos super-admin; para qualquer outro nome só verifica `hasFullAccess` (qualquer trial/active passa). Porém `req.user.permissions` (array de nomes concedidos via `user_permissions`) **já é carregado** no attach do auth (auth.ts:259).

**Decisão de design desta spec:** estender `requirePermission` com uma allowlist de "permissões granulares por-usuário" que são autorizadas via `isSuperAdmin(email) || req.user.permissions.includes(name)`. `premium_library_curate` entra nessa allowlist. Sem isso, o guard ou libera para todos (inseguro) ou só para super-admin (quebra as 2 contas curadoras não-admin). Ver RF-05.

---

## Requisitos Funcionais

### RF-01: Promover família à Biblioteca Premium (curador)
**Descrição:** Curador, a partir de um card de família na aba Torneios, clica "Adicionar à Premium". Grava 1 row em `premium_library_highlights` com snapshot das métricas + reasons, `curatedBy = userId do curador`, `sourceUserId = null`, `sourceHighlightId = null`, `source = 'library'`.
**Regras de negócio:**
- Apenas curador (guard `requirePermission('premium_library_curate')`).
- Dedup por `familyKey` global: se a família já está na Premium, retorna **409** (`already_in_premium`) — não duplica (`UNIQUE(familyKey)`).
- `site` e `familyKey` obrigatórios (**400** se ausentes).
- Snapshot: `metrics` e `reasons` vêm do payload (estado do card no momento), igual ao POST pessoal existente. Curador pode editar/curar os `reasons` enviados.
- ID via `nanoid()`.
**Critério de aceitação:**
- [ ] Curador promove família nova → 200 + row criada com `curatedBy` preenchido.
- [ ] Usuário comum tenta promover → 403, nenhuma row criada.
- [ ] Promover `familyKey` já presente → 409 `already_in_premium`.
- [ ] Payload sem `familyKey` → 400.

### RF-02: Listar Biblioteca Premium (todos)
**Descrição:** Faixa "Biblioteca Premium" no topo de Torneios lista todas as famílias promovidas, filtrável por `site` (igual ao strip pessoal). Visível a qualquer usuário autenticado.
**Regras de negócio:**
- Guard = só `requireAuth` (sem permissão especial para ler).
- Suporta `?site=` opcional (filtra por plataforma; ausente = todas).
- Ordenação: `createdAt DESC` (mais recentes primeiro). [decisão default — confirmar com architect se deve ser por ROI]
- Resposta inclui flag `isCurator` (derivada do `req.user`) para o front decidir se mostra botões de remover. (Alternativa: front consulta `req.user.permissions` que já vem no `/auth/me` — ver R-3.)
**Critério de aceitação:**
- [ ] Usuário comum recebe a lista completa (mesma para todos).
- [ ] Filtro `?site=ggpoker` retorna só famílias daquele site.
- [ ] Lista vazia → `[]` (a faixa não renderiza, igual ao strip pessoal que retorna `null`).

### RF-03: Drill-down de uma família Premium (todos)
**Descrição:** Clicar num card Premium abre dialog com snapshot das métricas + "últimos resultados". Os resultados são re-derivados do histórico do **usuário que está olhando** (não do curador) — pode não existir (família não está no histórico próprio), exibindo o mesmo aviso do strip pessoal (`found: false`).
**Regras de negócio:**
- Guard `requireAuth`.
- Reusa `storage.getFamilyDetails(viewerUserId, familyKey)` (mesma assinatura do pessoal).
- 404 se o `:id` Premium não existir.
**Critério de aceitação:**
- [ ] Drill-down de família presente no histórico do viewer → métricas + resultados.
- [ ] Família ausente do histórico do viewer → `found: false` + aviso (sem erro).
- [ ] `:id` inexistente → 404.

### RF-04: Remover da Biblioteca Premium (curador)
**Descrição:** Curador remove uma família da Premium (hard delete da row).
**Regras de negócio:**
- Guard `requirePermission('premium_library_curate')`.
- 404 se o `:id` não existir.
- NÃO escopar por `curatedBy` — qualquer curador pode remover qualquer item (curadoria é colaborativa, não dono-único). [decisão travada de produto — confirmar]
**Critério de aceitação:**
- [ ] Curador remove item existente → 200, some da lista.
- [ ] Usuário comum tenta remover → 403, item permanece.
- [ ] Remover `:id` inexistente → 404.

### RF-05: Guard de permissão granular (`premium_library_curate`)
**Descrição:** Estender `requirePermission` para autorizar permissões granulares por-usuário, e seedar a permissão no catálogo.
**Regras de negócio:**
- Adicionar `premium_library_curate` a uma nova allowlist `GRANULAR_USER_PERMISSIONS` em `requirePermission`. Para nomes nessa allowlist: `next()` sse `isSuperAdmin(email)` OU `req.user.permissions.includes(name)`; caso contrário **403** (`message` + `requiredPermission`). Fail-closed.
- Seedar row `{ name: 'premium_library_curate', description: ... }` na tabela `permissions` (via migration/seed) para que apareça no PermissionManager (`AdminUsers`) e possa ser concedida.
- NÃO mexer no comportamento das permissões `adminOnly` nem nas "qualquer-full-access" existentes.
**Critério de aceitação:**
- [ ] Conta com `premium_library_curate` concedida (não super-admin) → passa nas rotas de escrita.
- [ ] Conta trial/active SEM a permissão → 403 nas rotas de escrita.
- [ ] Super-admin → passa (bypass existente).
- [ ] Permissão revogada (toggle no AdminUsers) → na próxima request (após invalidação do auth cache) recebe 403.

### RF-06: Painel de curadoria cross-user — listar destaques pessoais de todas as contas (curador)
**Descrição:** Painel acessível só a curadores lista os `saved_tournament_highlights` de TODAS as contas, com atribuição (qual user salvou: `userPlatformId` + identificador legível como `username`/`email`).
**Regras de negócio:**
- Guard `requirePermission('premium_library_curate')` — leitura cross-user é bypass **intencional** do tenant scoping; fail-closed.
- Paginação (`limit`/`offset` ou cursor — architect decide) — pode haver muitos highlights. Default `limit=50`.
- Filtros opcionais: `?site=`, `?userId=`.
- Cada item indica `alreadyInPremium: boolean` (se aquela `familyKey` já está na Premium) para o front desabilitar "Importar".
**Critério de aceitação:**
- [ ] Curador recebe highlights de múltiplos users com atribuição.
- [ ] Usuário comum acessa o endpoint → 403 (teste anti-IDOR explícito).
- [ ] Filtro `?userId=USER-XXXX` retorna só daquele user.
- [ ] Item cuja `familyKey` já está na Premium → `alreadyInPremium: true`.

### RF-07: Importar destaque pessoal de outra conta para a Premium (curador)
**Descrição:** A partir do painel cross-user, curador clica "Importar para Premium" num highlight pessoal de qualquer conta. Copia o snapshot daquele highlight para `premium_library_highlights` com rastreabilidade.
**Regras de negócio:**
- Guard `requirePermission('premium_library_curate')`.
- Recebe `sourceHighlightId` (id da row em `saved_tournament_highlights`).
- Lê a row fonte (sem escopo de owner — curador vê de todos). **404** se `sourceHighlightId` não existir.
- Cria row Premium com: campos espelhados (`site`, `familyKey`, `groupName`, `buyInTier`, `type`, `metrics`, `reasons`), `source = 'import'`, `curatedBy = curador`, `sourceUserId = userId dono do highlight`, `sourceHighlightId`.
- Dedup global por `familyKey`: se já na Premium → **409** `already_in_premium`.
- Snapshot é **cópia** no momento da importação (não referência viva) — alterar/deletar o highlight pessoal depois não afeta a Premium.
**Critério de aceitação:**
- [ ] Curador importa highlight de outra conta → row Premium com `sourceUserId`/`sourceHighlightId` corretos e `source='import'`.
- [ ] Importar `sourceHighlightId` inexistente → 404.
- [ ] Importar família já na Premium → 409.
- [ ] Deletar o highlight pessoal fonte depois → row Premium permanece intacta.
- [ ] Usuário comum tenta importar → 403.

---

## Requisitos Não-Funcionais
- **Segurança (crítico):** toda rota de escrita/promoção/leitura-cross-user é fail-closed atrás de `premium_library_curate`. Teste obrigatório: user comum recebe 403 em CADA uma (anti-pattern IDOR / D1). A leitura da Premium global é `requireAuth` apenas.
- **Performance:** listar Premium é uma query simples sobre tabela pequena (curada manualmente, dezenas de rows) — sem paginação necessária na faixa global. O painel cross-user pagina (RF-06).
- **Consistência:** dedup por `UNIQUE` no DB (não só checagem app-level) para evitar corrida entre dois curadores.
- **Convenções:** handlers novos aceitam `injectedStorage?` como 3º arg (lesson #34). IDs via `nanoid()`. Erros `try/catch` + `console.error` + `res.status().json({ message })`.

## Modelos de Dados Afetados

### `premium_library_highlights` (tabela NOVA — migration 0093)
Espelha `saved_tournament_highlights` + rastreabilidade de curadoria. **NÃO reusar a tabela pessoal.**

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK, not null | `nanoid()` |
| site | varchar | not null | plataforma |
| familyKey | varchar | not null | chave da família (agrupamento) |
| groupName | varchar | nullable | nome legível |
| buyInTier | varchar | nullable | |
| type | varchar | nullable | |
| metrics | jsonb | nullable | snapshot no momento da promoção |
| reasons | jsonb | nullable | `[{ kind, label }]` |
| source | varchar | default `'library'` | `'library'` (promoção direta) \| `'import'` (do painel cross-user) |
| curatedBy | varchar | not null | `userPlatformId` do curador que promoveu |
| sourceUserId | varchar | nullable | dono do highlight pessoal importado (só quando `source='import'`) |
| sourceHighlightId | varchar | nullable | id da row `saved_tournament_highlights` de origem (só `import`) |
| createdAt | timestamp | defaultNow | |

**Índices / UNIQUE:**
- `uniqueIndex` em `(familyKey)` — **chave de dedup global** (uma família entra na Premium uma única vez, não importa o curador/site). [decisão: dedup por `familyKey` puro; `familyKey` já embute o site no formato `site|...`. Architect: confirmar se quer `(site, familyKey)` para robustez.]
- `index` em `(site)` — filtro por plataforma na faixa.
- `index` em `(createdAt)` — ordenação default.

Sem FK rígida (padrão das tabelas recentes 0088–0092: ownership/rastreabilidade validado em app-level; `sourceUserId`/`sourceHighlightId` são ponteiros frouxos que sobrevivem ao delete da origem — snapshot é cópia).

### `permissions` (linha NOVA — seed)
Inserir `{ id: nanoid(), name: 'premium_library_curate', description: 'Curar a Biblioteca Premium global de torneios' }` para habilitar concessão via AdminUsers. (Idempotente: `ON CONFLICT (name) DO NOTHING`.)

### Schemas Zod / Drizzle
- Tabela Drizzle `premiumLibraryHighlights` em `shared/schema.ts` + tipos `PremiumLibraryHighlight` / `InsertPremiumLibraryHighlight`.
- Zod de input nas rotas de escrita (`site`+`familyKey` required; `metrics`/`reasons` passthrough validado).

## Endpoints Previstos
| Método | Rota | Descrição | Guard |
|---|---|---|---|
| GET | /api/library/premium | Listar Biblioteca Premium (todos), `?site=` | requireAuth |
| GET | /api/library/premium/:id/details | Drill-down (re-deriva do histórico do viewer) | requireAuth |
| POST | /api/library/premium | Promover família à Premium | requirePermission('premium_library_curate') |
| DELETE | /api/library/premium/:id | Remover da Premium | requirePermission('premium_library_curate') |
| GET | /api/library/premium/curator/highlights | Cross-user: highlights pessoais de todos, `?site=`/`?userId=`/`?limit=`/`?offset=` | requirePermission('premium_library_curate') |
| POST | /api/library/premium/import | Importar highlight pessoal (`{ sourceHighlightId }`) para Premium | requirePermission('premium_library_curate') |

**Ordem de registro (Express 4, lesson rota-colisão est-3/mda):** registrar sub-paths estáticos (`/curator/highlights`, `/import`) e `/:id/details` ANTES de `/:id` puro. Idealmente em módulo próprio `server/routes/premiumLibrary.ts` (`registerPremiumLibraryRoutes` em `index.ts`) — evita herdar a colisão do namespace `/api/library/highlights/:id` existente em `upload.ts`.

**Storage novo (`server/storage.ts` ou `server/storage/premiumLibraryStorage.ts`):**
- `listPremiumHighlights(site?)`
- `getPremiumHighlight(id)` → row | null (para `:id/details` resolver `familyKey`)
- `promotePremiumHighlight(input)` → lança/sinaliza `already_in_premium` no conflito UNIQUE
- `deletePremiumHighlight(id)` → boolean
- `listAllSavedHighlightsForCuration({ site?, userId?, limit, offset })` → highlights + atribuição (`username`/`email` via JOIN `users`) + `alreadyInPremium`
- `getSavedHighlightByIdAnyUser(sourceHighlightId)` → row | null (sem escopo owner — curador)
- Reusa `getFamilyDetails(viewerUserId, familyKey)` existente para o drill-down.

## Componentes de UI

### Novos
- `client/src/components/library/PremiumLibraryStrip.tsx` — faixa no topo de Torneios (espelha `SavedHighlightsStrip`: grid de cards, dialog drill-down via `/api/library/premium/:id/details`). Recebe `sites: string[]` + `isCurator: boolean`. Curador vê botão "remover" (X) nos cards; usuário comum não. Visual distinto do strip pessoal (ex.: badge "Premium" / acento dourado-premium) para diferenciar das duas faixas empilhadas.
- `client/src/components/library/PremiumCuratorPanel.tsx` — painel cross-user (só curador): lista paginada de highlights pessoais com atribuição + filtros (`site`/`userId`) + botão "Importar para Premium" (desabilitado quando `alreadyInPremium`). Pode ser um Dialog/Drawer aberto por um botão "Curadoria" visível só a curadores.
- Botão "Adicionar à Premium" no card de família (RF-01) — renderizado só para curador, ao lado/junto do botão "Salvar" pessoal existente em `OverviewPanel`/cards de família.

### Alterados
- `client/src/pages/TournamentLibraryNew.tsx` — montar `<PremiumLibraryStrip>` acima de `<SavedHighlightsStrip>`; passar `sites` selecionados; derivar `isCurator` (de `req.user.permissions` no `/auth/me` ou de flag no GET premium). Renderizar botão "Curadoria" → abre `PremiumCuratorPanel` (só curador).
- `OverviewPanel.tsx` (e/ou o componente do card de família) — adicionar ação "Adicionar à Premium" gated por `isCurator`.
- `server/auth.ts` — estender `requirePermission` (RF-05). [mudança em arquivo core — flag para architect/reviewer]

**Detecção de curador no front:** preferir ler `permissions.includes('premium_library_curate')` do payload `/auth/me` (já carrega `permissions`). Evita endpoint extra. Confirmar que `/auth/me` expõe `permissions` (auth attach já popula `req.user.permissions`).

## Casos de Borda
- **Dedup / família já na Premium:** POST direto e import retornam 409 `already_in_premium`; painel cross-user mostra `alreadyInPremium` e desabilita o botão (defense-in-depth UI + DB).
- **Importar de user sem histórico:** o snapshot do highlight pessoal é copiado mesmo que a família não esteja mais no histórico do dono — Premium guarda o snapshot, é independente. Drill-down depois re-deriva do histórico do *viewer* (não do dono).
- **Curador removido da permissão:** após revogação + invalidação do auth cache, recebe 403 nas rotas de escrita; itens que ele já promoveu permanecem na Premium (não há cascade por `curatedBy`).
- **Highlight pessoal fonte deletado após import:** row Premium permanece (snapshot é cópia; `sourceHighlightId` vira ponteiro órfão tolerado).
- **Dois curadores promovem a mesma família quase simultaneamente:** o `UNIQUE(familyKey)` garante que o segundo recebe 409 (corrida resolvida no DB, não só app-level).
- **familyKey muda de formato/re-agrupamento futuro:** snapshot fica preso ao `familyKey` do momento; drill-down pode dar `found:false` se o agrupamento do histórico mudou (mesmo comportamento já aceito no strip pessoal).
- **Site filter na faixa global:** se o usuário filtrou por um site sem itens Premium, a faixa não renderiza (sem estado de erro).

## Critérios de Aceite (testáveis — resumo para test-writer)
**Happy path**
- [ ] Curador promove família → aparece na faixa Premium de QUALQUER usuário.
- [ ] Curador importa highlight de outra conta → aparece na Premium com `source='import'` + rastreabilidade.
- [ ] Usuário comum vê a faixa Premium e abre drill-down.

**Guard / segurança (anti-IDOR, fail-closed)**
- [ ] Usuário comum → 403 em POST/DELETE/import/curator-highlights (cada rota).
- [ ] Conta com `premium_library_curate` (não super-admin) → 200 nas mesmas rotas.
- [ ] Super-admin → 200.
- [ ] GET premium (leitura global) → 200 para qualquer autenticado; 401 sem auth.

**Regras de negócio**
- [ ] POST com `familyKey` duplicada → 409 `already_in_premium`.
- [ ] Import com `sourceHighlightId` inexistente → 404.
- [ ] DELETE `:id` inexistente → 404.
- [ ] POST sem `site`/`familyKey` → 400.

**Edge**
- [ ] Deletar highlight pessoal fonte → Premium intacta.
- [ ] Família ausente do histórico do viewer → drill-down `found:false`.
- [ ] Corrida de promoção concorrente → exatamente 1 row (UNIQUE).

## Fora de Escopo (Fase 1)
- Página dedicada `/biblioteca-premium` (faixa apenas nesta fase).
- Edição in-place de métricas/reasons de um item já na Premium (só promover/remover; re-promover exige remover antes).
- Ordenação/curadoria avançada (ranking manual, pin, categorias, tags).
- Notificar usuários quando uma nova família entra na Premium.
- Versionar histórico de promoções/auditoria além de `curatedBy`+`createdAt` (sem log de "quem removeu").
- Atualização automática do snapshot Premium quando o histórico muda (snapshot é congelado por design).
- Comentário/nota do curador no item Premium.

## Dependências
- Migration `0093_premium_library_highlights.sql` (+ `_rollback.sql`) — tabela nova + seed da permissão. **Aplicar local + PROD (Neon) no deploy.**
- `requirePermission` estendido (RF-05) — pré-requisito de TODAS as rotas guarded.
- `saved_tournament_highlights` (existente) + `getFamilyDetails` (existente, reusado).
- `permissions` / `user_permissions` + AdminUsers/PermissionManager (existentes) para conceder a permissão às 3 contas.

## Notas de Implementação (para Implementer / Architect)
- Espelhar fielmente o padrão de `SavedHighlightsStrip` + rotas `/api/library/highlights` de `upload.ts` para reduzir surpresa.
- Módulo de rotas dedicado evita a colisão de namespace com `/api/library/highlights/:id` já existente.
- Snapshot = cópia de `metrics`/`reasons` (deep copy do jsonb), não referência.
- Lesson #34 (injectedStorage 3º arg) em todos os handlers para testabilidade sem `vi.mock('../storage')`.
- Lesson #3 (mocks idealizados): test-writer deve validar o shape REAL de `saveHighlight`/`getFamilyDetails`/`user_permissions` antes de mockar — bugs CRITICAL já passaram por mock idealizado em sprints anteriores.

## Riscos / Decisões abertas (para o System-Architect)
- **R-1 (alto):** estender `requirePermission` é mudança em arquivo de auth core. Architect deve decidir a forma exata da allowlist `GRANULAR_USER_PERMISSIONS` e garantir que NÃO altera o comportamento das permissões existentes (`adminOnly` e full-access). Reviewer deve auditar.
- **R-2:** chave de dedup — `UNIQUE(familyKey)` vs `UNIQUE(site, familyKey)`. Spec assume `familyKey` puro (ele já embute o site). Confirmar com o formato real de `familyKey`.
- **R-3:** detecção de `isCurator` no front — ler de `/auth/me.permissions` (preferido, sem endpoint extra) vs flag no GET premium. Confirmar que `/auth/me` expõe `permissions`.
- **R-4:** ordenação default da faixa Premium (`createdAt DESC` proposto vs por ROI/curadoria manual). Sem ranking manual nesta fase.
- **R-5:** RF-04 permite qualquer curador remover qualquer item (curadoria colaborativa). Se o founder quiser dono-único, escopar `DELETE` por `curatedBy`.
- **R-6:** auth cache — revogação de permissão só vale após invalidação do cache (já existe invalidação no fluxo do AdminUsers, admin.ts). Confirmar que cobre concessão/revogação de `premium_library_curate`.
