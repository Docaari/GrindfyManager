# ADR-240: Biblioteca Premium curada (tabela própria, guard granular dedicado, dedup global por familyKey)

## Status
Aceito

## Data
2026-06-02

## Contexto

A spec `Docs/specs/premium-library.md` (Fase 1) introduz uma **Biblioteca Premium global**: curadores (contas com a permissão concedível `premium_library_curate`) promovem famílias de torneios "as melhores da grade" para uma vitrine que aparece no topo da aba Torneios para **todos** os usuários autenticados. Inclui um **painel de curadoria cross-user** que lista os destaques pessoais (`saved_tournament_highlights`) de todas as contas e permite importá-los para a Premium.

Já existe o conceito de **destaque pessoal** (`saved_tournament_highlights`, por-user, `UNIQUE(user_id, family_key)`, snapshot de `metrics`/`reasons` no momento do save — schema confirmado em `shared/schema.ts:412`). A Premium é uma camada **curada e global** sobre o mesmo conceito de "família + snapshot": só curador escreve, todos leem.

Forças em jogo:
- **Segurança:** a leitura cross-user (RF-06) é um bypass intencional do tenant scoping — tem de ser fail-closed atrás da permissão de curador. Um vazamento aqui é IDOR.
- **Reuso:** o padrão visual e de rota do destaque pessoal (`SavedHighlightsStrip` + `/api/library/highlights` em `upload.ts`) é a referência; queremos minimizar surpresa.
- **Regressão zero:** a mudança no guard de permissão toca `server/auth.ts`, arquivo core consumido por dezenas de callers.

Esta ADR resolve as decisões abertas R-1 a R-6 da spec.

---

## Decisão 1 — Tabela nova `premium_library_highlights` (NÃO reusar `saved_tournament_highlights`)

### Opções consideradas

**Opção A: Reusar `saved_tournament_highlights` com uma coluna `scope`/`is_premium` + `user_id` especial.**
- **Prós:** uma tabela só; reusa `saveHighlight`/`getFamilyDetails`/`listSavedHighlights` direto.
- **Contras:** o `UNIQUE(user_id, family_key)` pessoal colide com o `UNIQUE(family_key)` global da Premium (semânticas de dedup incompatíveis na mesma tabela). A rastreabilidade de curadoria (`curatedBy`/`sourceUserId`/`sourceHighlightId`) polui a tabela pessoal. O cross-user scan teria de filtrar "rows premium" vs "rows pessoais" em toda query pessoal existente — risco de vazar premium em listagens pessoais e vice-versa.

**Opção B (escolhida): Tabela dedicada `premium_library_highlights` que espelha o shape pessoal + colunas de rastreabilidade.**
- **Prós:** dedup global limpo (`UNIQUE(family_key)`); rastreabilidade isolada; queries pessoais intocadas (zero risco de regressão no destaque pessoal); `getFamilyDetails` continua reusado para o drill-down (re-deriva do histórico do viewer, sem acoplar tabelas).
- **Contras:** duplica a coluna-shape de snapshot (`site`/`familyKey`/`groupName`/`buyInTier`/`type`/`metrics`/`reasons`). Aceitável — snapshot é cópia congelada por design (não referência viva).

### Decisão
Opção **B**. Tabela nova `premium_library_highlights` (migration 0093), espelhando `saved_tournament_highlights` + `source`/`curatedBy`/`sourceUserId`/`sourceHighlightId`. Snapshot é **cópia profunda** de `metrics`/`reasons` no momento da promoção/importação — sobrevive a delete/edição da origem.

**Sem FK rígida** (padrão das tabelas recentes 0088–0092: ownership e rastreabilidade validados em app-level). `curatedBy`/`sourceUserId` apontam para `users.user_platform_id` e `sourceHighlightId` para `saved_tournament_highlights.id`, mas são **ponteiros frouxos** — se o highlight pessoal de origem for deletado, a row Premium permanece intacta (`sourceHighlightId` vira órfão tolerado). Isso é o comportamento desejado (snapshot congelado).

---

## Decisão 2 — Guard de permissão granular (R-1, o achado crítico)

### Achado confirmado (`server/auth.ts:452`)
`requirePermission(name)` faz, em ordem:
1. `!req.user` → 401.
2. `isSuperAdmin(req.user.email)` → `next()` (bypass total).
3. `name ∈ adminOnly` (`['admin_full','user_management','analytics_access','user_analytics','executive_reports','system_config']`) → **403 para todos menos super-admin**.
4. senão → `hasFullAccess(req.user)` → `next()` (**fail-open: qualquer trial/active passa**).

Portanto `requirePermission('premium_library_curate')`:
- Para super-admin: passa (ok).
- Para as 2 contas curadoras não-admin (trial/active): passa pelo branch 4 — **mas qualquer trial/active também passaria** → inseguro (não checa a permissão concedida).
- Se colocássemos `premium_library_curate` em `adminOnly`: as 2 contas curadoras não-admin seriam negadas → quebra a feature.

Confirmado também: `req.user.permissions` (array de **nomes** de permissão concedidos via `user_permissions`) **já é carregado** no attach do auth (`auth.ts:259` — `permissions: userPermissionsList.map(p => p.permissionName)`). Logo o dado para um check granular já existe em memória; não há query extra por request.

### Opções consideradas

**Opção A (escolhida): NOVO middleware dedicado `requireGranularPermission(name)`.**
```
export function requireGranularPermission(permissionName: string) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Usuário não autenticado' });
    if (isSuperAdmin(req.user.email)) { /* log granted */ return next(); }
    const granted = Array.isArray(req.user.permissions)
      && req.user.permissions.includes(permissionName);
    if (granted) { /* log granted */ return next(); }
    /* log denied */
    return res.status(403).json({ message: 'Permissão de curadoria necessária', requiredPermission: permissionName });
  };
}
```
- **Prós:** **isolamento total** — não toca `requirePermission`, logo **zero risco de regressão** nos dezenas de callers existentes (admin routes, bankroll, etc.). Semântica explícita e fail-closed por design (default = 403). Fácil de auditar e testar em isolamento. Reusa `req.user.permissions` já carregado (sem custo).
- **Contras:** mais um middleware no `auth.ts`. Dois mecanismos de permissão coexistem (`requirePermission` legado fail-open vs `requireGranularPermission` fail-closed) — exige disciplina de escolher o certo. Mitigado por nome explícito + esta ADR.

**Opção B: Estender `requirePermission` com allowlist `GRANULAR_USER_PERMISSIONS`.**
```
const GRANULAR_USER_PERMISSIONS = ['premium_library_curate'];
// antes do branch hasFullAccess:
if (GRANULAR_USER_PERMISSIONS.includes(permissionName)) {
  if (req.user.permissions?.includes(permissionName)) return next();
  return res.status(403).json({ ... });   // fail-closed só pros allowlistados
}
```
- **Prós:** um único ponto de entrada de permissão; futuras permissões granulares só entram na allowlist.
- **Contras:** **mexe no caminho quente** de um middleware usado por todos os callers. Um erro de ordenação de branch (ex.: colocar o check antes do `adminOnly` ou do super-admin) pode alterar o comportamento de permissões existentes. A inserção do branch tem de ficar **depois** do super-admin e **antes** do `adminOnly`+`hasFullAccess`, e o `adminOnly` não pode intersectar a allowlist — invariantes frágeis que dependem de revisão cuidadosa a cada mudança futura. Maior superfície de regressão.

### Decisão
Opção **A** — `requireGranularPermission(name)`, novo middleware em `server/auth.ts`.

**Justificativa:** o requisito de menor risco é explícito (R-1). A Opção A não altera **nenhuma** linha de `requirePermission`, então é **impossível** introduzir regressão nos callers existentes por construção. O custo (um segundo middleware) é trivial e o ganho de isolamento é exatamente o que R-1 pede. A Opção B economiza um conceito mas paga com risco no caminho quente — trade-off ruim para um arquivo de auth core. As rotas guarded da Premium usam `requireGranularPermission('premium_library_curate')`; o comportamento fail-open do `requirePermission` legado fica intocado.

**Fail-closed:** o default do middleware é 403. Conta sem a permissão (mesmo trial/active) → 403. Super-admin → bypass (paridade com o sistema). Revogação da permissão via AdminUsers + invalidação do auth cache (R-6) → próxima request recebe 403.

> Nota para o test-writer: testar `requireGranularPermission` em isolamento (3 casos: super-admin passa, `permissions.includes(name)` passa, ausência nega 403) **e** o teste anti-IDOR por rota (user comum → 403 em CADA rota de escrita/cross-user). Lesson #3: mockar `req.user` com o shape REAL (`{ email, userPlatformId, permissions: string[] }`), não idealizado.

---

## Decisão 3 — Chave de dedup: `UNIQUE(family_key)` global (R-2)

### Opções
- **`UNIQUE(family_key)` puro:** `family_key` já embute o site no formato `site|...` (confirmado em `getFamilyDetails`: `String(familyKey).split("|")[0]` extrai o site). Logo `family_key` é globalmente único por construção.
- **`UNIQUE(site, family_key)`:** robustez defensiva caso o formato de `family_key` mude no futuro.

### Decisão
`UNIQUE(family_key)` **puro**. O `family_key` já carrega o site como primeiro segmento — `(site, family_key)` seria redundante (o `site` é função do `family_key`). A coluna `site` permanece na tabela (denormalizada) **apenas para o filtro `?site=`** da faixa, não para dedup. A dedup é garantida no **DB** (UNIQUE), não só app-level, resolvendo a corrida entre dois curadores promovendo a mesma família simultaneamente (o segundo recebe 409 `already_in_premium`). O storage detecta o conflito (Postgres error code `23505`) e sinaliza `already_in_premium`.

---

## Decisão 4 — Leitura pública vs escrita/cross-user gated

- `GET /api/library/premium` (listar) e `GET /api/library/premium/:id/details` (drill-down) → **`requireAuth` apenas**. Qualquer autenticado lê. A lista é idêntica para todos (curada globalmente). O drill-down re-deriva do histórico **do viewer** via `getFamilyDetails(viewerUserId, familyKey)` — pode dar `found:false` se a família não está no histórico próprio (mesmo comportamento já aceito no strip pessoal).
- `POST /api/library/premium` (promover), `DELETE /api/library/premium/:id` (remover), `GET /api/library/premium/curator/highlights` (cross-user), `POST /api/library/premium/import` → **`requireGranularPermission('premium_library_curate')`**. Fail-closed.

**Detecção de `isCurator` no front (R-3):** ler `permissions.includes('premium_library_curate')` do payload `/auth/me` (que já expõe `permissions` — confirmado no attach `auth.ts:259`). Sem endpoint extra, sem flag derivada no GET. O guard do backend é a fonte de verdade da segurança; o front só usa `isCurator` para mostrar/esconder botões (defense-in-depth UI, não segurança).

---

## Decisão 5 — Rastreabilidade da curadoria

Cada row Premium grava:
- `curated_by` (NOT NULL) — `user_platform_id` do curador que promoveu/importou.
- `source` — `'library'` (promoção direta de um card, RF-01) | `'import'` (do painel cross-user, RF-07).
- `source_user_id` (nullable) — dono do highlight pessoal importado (só `source='import'`).
- `source_highlight_id` (nullable) — id da row `saved_tournament_highlights` de origem (só `source='import'`).

Sem log de "quem removeu" nem versionamento (fora de escopo Fase 1). `curated_by` + `created_at` são a auditoria mínima. **RF-04 (R-5):** qualquer curador remove qualquer item (curadoria colaborativa) — o DELETE **não** escopa por `curated_by`. Decisão de produto travada; se o founder quiser dono-único, escopar depois.

---

## Decisão 6 — Módulo de rota dedicado + ordem de registro (lesson est-3/mda)

Rotas em **módulo próprio** `server/routes/premiumLibrary.ts` (`registerPremiumLibraryRoutes(app, requireAuth)` chamado em `server/index.ts`), namespace `/api/library/premium/*`.

**Por que módulo próprio:** o namespace `/api/library/highlights/*` já existe em `upload.ts` com `/:id` e `/:id/details` registrados em ordem (e a confirmação visual: em `upload.ts` o `DELETE /:id` é registrado **antes** do `GET /:id/details` — em Express 4 isso funciona porque os métodos HTTP diferem, mas misturar GET de 1-segmento com `:id` no mesmo módulo é frágil). Um módulo dedicado evita herdar qualquer colisão do namespace `highlights`.

**Ordem de registro (Express 4 é ordem-pura — lessons est-3, mda):** registrar **sub-paths estáticos e de 2 segmentos ANTES do `/:id` puro**:
1. `GET  /api/library/premium`                       (estático)
2. `GET  /api/library/premium/curator/highlights`     (sub-path estático — ANTES de `:id`)
3. `POST /api/library/premium/import`                 (sub-path estático — ANTES de `:id`)
4. `POST /api/library/premium`                        (estático)
5. `GET  /api/library/premium/:id/details`            (2 segmentos — ANTES de `:id` puro de 1 seg)
6. `DELETE /api/library/premium/:id`                  (`:id` puro — por último)

> Atenção (lesson #25 da MDA): um `:id` de 1 segmento **shadowa** qualquer rota estática de 1 segmento registrada **depois** no mesmo namespace e método. `curator/highlights`, `import` e `:id/details` são de 2 segmentos OU método diferente de `DELETE :id`, então não colidem com `DELETE /:id`. Como não há `GET /api/library/premium/:id` puro (só `:id/details`), não há shadowing de `curator`/`import` por um `:id` GET. Guard test recomendado: `tests/integration/routes/premium-library-route-collision.test.ts` validando que `GET /curator/highlights` e `POST /import` não caem no handler de `:id`.

---

## Consequências

### Positivas
- Destaque pessoal intocado (zero regressão); Premium é camada aditiva limpa.
- `requireGranularPermission` reutilizável para futuras permissões concedíveis fail-closed, sem tocar o guard legado.
- Dedup garantida no DB (corrida resolvida), não só app-level.
- Snapshot congelado → Premium é independente da origem (resistente a delete/edição do highlight pessoal).
- Reuso de `getFamilyDetails` no drill-down → consistência com o strip pessoal sem acoplar tabelas.

### Negativas
- Dois mecanismos de permissão coexistem (`requirePermission` fail-open legado vs `requireGranularPermission` fail-closed). Exige escolher o certo — mitigado por nome explícito + esta ADR + teste anti-IDOR por rota.
- Shape de snapshot duplicado entre as duas tabelas (custo de manutenção baixo — snapshot é congelado, não evolui em lockstep).
- `source_highlight_id` pode virar ponteiro órfão (por design — tolerado).

### Neutras
- `family_key` carrega o site; o filtro `?site=` usa a coluna denormalizada `site`, não o split do `family_key`.
- Ordenação default da faixa = `created_at DESC` (R-4 — sem ranking manual nesta fase).
- Migration 0093 aplica local + PROD (Neon) no deploy (a tabela e o seed da permissão são pré-requisito das rotas).

---

## Confiança
**Alta** — shapes reais validados em `shared/schema.ts` (permissions: `id`/`name unique`/`description`/`createdAt`; saved_tournament_highlights; users: `user_platform_id`/`username`/`email`), guard real lido em `server/auth.ts:452`, `req.user.permissions` confirmado em `auth.ts:259`, rotas e `getFamilyDetails`/`listSavedHighlights` confirmados em `upload.ts`/`storage.ts`. As decisões A (guard isolado) e tabela própria são as de menor risco para os callers existentes.
