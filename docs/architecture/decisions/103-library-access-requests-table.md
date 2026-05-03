# ADR-103 — Tabela `library_access_requests` com idempotencia via UNIQUE INDEX parcial e enum status

- Status: Proposto
- Data: 2026-05-03
- Sprint: UX-Biblioteca-1 (RF-02)
- Decision owner: system-architect (formaliza spec founder-aprovada)
- Related: ADR-073 (entitlements model), ADR-076 (sanitization deprecada parcial), ADR-095 (learning_objectives JSONB)
- Spec: `Docs/specs/ux-biblioteca-1.md`

---

## 1. Contexto

A pagina Biblioteca (LMS) hoje mostra um banner alpha quando o user nao tem acesso aos cursos. O CTA atual e um link `<a href="mailto:suporte@grindfy.app?subject=Acesso+Biblioteca">` em `client/src/pages/biblioteca/BibliotecaPage.tsx:113-122`. Tres problemas observaveis:

1. **Opacidade**: founder nao tem visibilidade dos pedidos. Mailto abre cliente externo (Outlook/Gmail/Mail.app) e a comunicacao acontece fora do produto. Nada chega ao banco. Audit de funil "viu banner -> pediu acesso -> foi liberado" e impossivel.
2. **UX hostil em alpha**: usuario clica e cai num cliente de email vazio ou em prompt de "qual app voce quer usar?". Em mobile particularmente quebrado. Abandono alto.
3. **Sem idempotencia**: o mesmo user pode mandar 5 emails repetidos (founder nao sabe se sao duplicados); ou pode achar que mandou e nao mandou, perdendo o pedido.

Spec UX-Biblioteca-1 RF-02 substitui o mailto por modal in-app + endpoint `POST /api/library/access-requests` + tabela dedicada. Na 1a iteracao founder revisa pedidos via DB direto (sem UI admin); UI admin entra em sprint futura.

### Forcas

- **Idempotencia robusta**: enviar 2 pedidos consecutivos do mesmo user em estado `pending` deve retornar 409 (nao 201 + duplicata silenciosa). Race entre 2 requests simultaneos do mesmo browser (double-click, retry pos-network blip) NAO pode criar 2 rows.
- **Re-pedido permitido apos `denied`**: user nao fica banido permanentemente. Founder pode mudar de ideia; user pode justificar melhor.
- **Snapshot do plano**: subscription pode mudar entre o pedido e a revisao. Snapshot `subscription_plan_snapshot` no momento da criacao garante audit trail (founder ve "user pediu enquanto era basico", nao confunde com plano atual).
- **Anti-spoofing**: usuario NAO pode enviar `subscriptionPlan: "premium"` no body do POST e enganar o founder. Plano vem do `req.user` server-side.
- **Convencoes Grindfy**:
  - PK varchar nanoid (lesson #5).
  - FK ON DELETE CASCADE em `userId` (consistente com `coach_actions`, `cooldown_logs`, `library_progress`).
  - Enum status via `pgEnum` Postgres (lesson aprendida em `series_day2_status`, `series_stack_mode`, `library_event_type`).
  - Drizzle Zod `optional + default` em colunas insertadas pos-criacao (lesson #7 — deprecation gradual).

### Pendencia residual deixada pelo PM-Spec

A spec menciona "UNIQUE INDEX parcial em `library_access_requests` `(user_id) WHERE status = 'pending'`" como uma das mitigacoes de race (linha 500 da spec). PM-Spec deixou para o architect:

1. Confirmar UNIQUE parcial vs validacao por transaction (SELECT FOR UPDATE).
2. Confirmar enum Postgres vs varchar com CHECK constraint.
3. Confirmar trigger de `updated_at` vs app-level set.

---

## 2. Decisao

Criar tabela `library_access_requests` com:

1. **Enum Postgres `library_access_request_status`** com 3 valores: `pending`, `approved`, `denied`. Default `pending`. Drizzle `pgEnum("library_access_request_status", ["pending", "approved", "denied"])`. Justificativa abaixo.
2. **UNIQUE INDEX parcial** em `(user_id) WHERE status = 'pending'`. Garante idempotencia em nivel de constraint (nao apenas validacao app-level). 2 requests simultaneos: 1 vence o INSERT, o outro recebe 23505 (unique violation) e o handler converte em 409. Justificativa abaixo.
3. **Snapshot do plano**: coluna `subscription_plan_snapshot` varchar(50) NOT NULL preenchida server-side a partir de `req.user.subscriptionPlan` no momento do POST (anti-spoofing).
4. **`updated_at`** via trigger Postgres `updated_at_trigger` (padrao reusado de `wallets`/`coach_actions`). App-level set tambem aceita, mas trigger e mais robusto a writes diretos no banco (founder revisa via DB direto na fase alpha).
5. **2 indices secundarios**: `(user_id, status)` para query principal "user logado tem pending?"; `(status, created_at DESC)` para query admin futura "pending mais recentes primeiro".
6. **FKs com ON DELETE**: `user_id` CASCADE (consistente com tabelas correlatas; quando user deleta conta, pedidos somem). `reviewed_by` SET NULL (futuro admin pode ser deletado sem perder o audit).

### Schema final

```sql
-- migrations/0036_library_access_requests.sql

CREATE TYPE library_access_request_status AS ENUM ('pending', 'approved', 'denied');

CREATE TABLE library_access_requests (
    id VARCHAR(21) PRIMARY KEY,
    user_id VARCHAR(21) NOT NULL REFERENCES users(user_platform_id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    subscription_plan_snapshot VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    status library_access_request_status NOT NULL DEFAULT 'pending',
    reviewed_by VARCHAR(21) REFERENCES users(user_platform_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uniq_library_access_requests_user_pending
    ON library_access_requests(user_id)
    WHERE status = 'pending';

CREATE INDEX idx_library_access_requests_user_status
    ON library_access_requests(user_id, status, created_at DESC);

CREATE INDEX idx_library_access_requests_status_created
    ON library_access_requests(status, created_at DESC);

-- Trigger updated_at (reusa padrao de wallets/coach_actions; assume trigger function existe)
CREATE TRIGGER trg_library_access_requests_updated_at
    BEFORE UPDATE ON library_access_requests
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

Drizzle (em `shared/schema.ts`, perto da linha ~3700 onde estao as outras `library*` tabelas):

```ts
export const libraryAccessRequestStatusEnum = pgEnum(
  "library_access_request_status",
  ["pending", "approved", "denied"] as const,
);

export const libraryAccessRequests = pgTable(
  "library_access_requests",
  {
    id: varchar("id", { length: 21 }).primaryKey().$defaultFn(() => nanoid()),
    userId: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.userPlatformId, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    subscriptionPlanSnapshot: varchar("subscription_plan_snapshot", { length: 50 }).notNull(),
    reason: text("reason").notNull(),
    status: libraryAccessRequestStatusEnum("status").notNull().default("pending"),
    reviewedBy: varchar("reviewed_by", { length: 21 }).references(
      () => users.userPlatformId,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqUserPending: uniqueIndex("uniq_library_access_requests_user_pending")
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
    idxUserStatus: index("idx_library_access_requests_user_status")
      .on(table.userId, table.status, table.createdAt),
    idxStatusCreated: index("idx_library_access_requests_status_created")
      .on(table.status, table.createdAt),
  }),
);
```

Zod insert/update via `drizzle-zod` `createInsertSchema` + `optional + default` para colunas que NAO sao do payload do user (status, snapshot, reviewedBy, reviewedAt, reviewNotes, createdAt, updatedAt) — lesson #7 (deprecation gradual + write-tool aware aderencia ADR-077).

### Storage methods (em `server/storage.ts`)

- `createLibraryAccessRequest({ userId, name, reason, subscriptionPlanSnapshot })` — INSERT; em caso de violation 23505 (unique user_id pending), throw erro tipado `LibraryAccessRequestPendingError` que o handler converte em 409.
- `findPendingLibraryAccessRequest(userId: string)` — SELECT WHERE user_id = ? AND status = 'pending' LIMIT 1.
- `getLatestLibraryAccessRequestForUser(userId: string)` — SELECT WHERE user_id = ? ORDER BY created_at DESC LIMIT 1. Usado pelo GET `/me`.

---

## 3. Opcoes Consideradas

### Opcao A — UNIQUE parcial no enum status='pending' (ESCOLHIDA)

**Pros:**
- Idempotencia em nivel de banco (constraint vs validacao app). Race condition entre 2 INSERTs simultaneos resolvida pelo Postgres com 23505. Handler converte para 409 limpo.
- Re-pedido apos `approved`/`denied` funciona naturalmente — partial WHERE so cobre `pending`, entao N rows com status final podem coexistir.
- Performance: index parcial e menor que index completo (so cobre rows com status='pending' que e populacao pequena).

**Contras:**
- Drizzle precisa expressar partial index via `sql\`${table.status} = 'pending'\`` literal. Nao tem helper sintatico ainda (drizzle-orm 0.30+).
- DBA familiarizado com Postgres precisa entender sintaxe — comum em projetos modernos, nao e blocker.

### Opcao B — Validacao app-level via SELECT FOR UPDATE em transaction

**Pros:**
- Sem partial index — schema mais "vanilla".
- Drizzle helper sintatico direto.

**Contras:**
- Race condition real: 2 requests simultaneos no mesmo connection pool = ambos veem "no pending" e ambos INSERTam. SERIALIZABLE isolation evitaria, mas penaliza performance e complica o handler.
- Dependencia do app respeitar a regra. Founder rodando SQL direto em DBeaver pode criar 2 rows pending sem perceber. Constraint de banco e a unica garantia robusta.
- Mais codigo de handler (lock + SELECT + INSERT + COMMIT) vs INSERT puro com try/catch 23505.

### Opcao C — Sem constraint, apenas index nao-unique + dedup app-level

**Pros:**
- Schema mais simples.

**Contras:**
- Sem garantia de idempotencia. Bug de concorrencia silencioso (founder pode descobrir tarde via 2 emails iguais ou 2 toasts duplos no client).
- Anti-pattern para o uso ("pending" e estado mutuamente exclusivo por user; modelar como UNIQUE e correto).

### Opcao D — Enum Postgres (ESCOLHIDA) vs varchar com CHECK

**Pros enum:**
- Constraint forte em nivel de schema (Postgres rejeita INSERT com valor invalido).
- TypeScript types automaticos via Drizzle (`libraryAccessRequestStatusEnum.enumValues`).
- Performance equivalente para 3 valores (Postgres armazena como int4 internamente).

**Contras enum:**
- ALTER TYPE ADD VALUE em prod requer transaction nao-DEFERRED (limitacao Postgres).
- Renomear valor exige `RENAME VALUE`. Drop value nao suportado nativamente (precisa migration manual).

**Pros varchar+CHECK:**
- ALTER mais flexivel (drop/rename via migration regular).

**Contras varchar+CHECK:**
- TypeScript types manuais; CHECK constraint sobreposicao com Zod nao-DRY.
- Padrao do projeto (e.g. `series_stack_mode`, `library_event_type`) ja usa enum.

Decisao: enum Postgres consistente com o resto do projeto. Adicionar valor (caso futuro: `expired`) em sprint dedicada via `ALTER TYPE ADD VALUE`.

---

## 4. Consequencias

### 4.1. Positivas

- **Idempotencia em nivel de banco**: 2 requests simultaneos do mesmo user produzem 1 row + 1 erro 409 limpo. Founder nao precisa deduplicar manualmente.
- **Audit trail**: cada pedido tem snapshot de plano + nome submetido + reason. Founder ve "user pediu como basico, hoje e premium" sem precisar joinar com tabela `subscriptions`.
- **Re-pedido natural**: user que foi `denied` pode pedir de novo. UNIQUE parcial nao bloqueia; index secundario `(user_id, status)` resolve query "ultimo pedido nao-pending".
- **Future-proof**: estrutura `reviewed_by` + `reviewed_at` + `review_notes` pronta para UI admin futura. Adicionar UI nao exige migration adicional.
- **Convencoes Grindfy aderentes**: nanoid PK, FK CASCADE, enum Postgres, trigger updated_at, indices nomeados no padrao `idx_<table>_<cols>` e `uniq_<table>_<cols>`.

### 4.2. Negativas

- **Founder revisa via DB direto na alpha**: sem UI admin nesta sprint. Aceito (escopo). UI admin entra em UX-Biblioteca-2 ou sprint dedicada.
- **Drop/rename de valor enum exige migration manual** se um dia precisarmos. Trade-off conhecido (igual nas outras enums do projeto).
- **Reviewer alerta sobre partial index**: Drizzle helper sintatico nao existe; precisa `sql\`...\``. Lesson aprendida — outras tabelas usam padrao similar (e.g. `idx_starred_expires WHERE status = 'pending'` em `starred_hands`).

### 4.3. Neutras

- **Sem rate limit em DB**: rate limit (5/h por user) e responsabilidade do middleware `express-rate-limit` no handler (igual a `auth.ts`). DB nao tem opiniao sobre frequencia, apenas idempotencia.
- **Sem coluna `email`**: nome + plano + reason ja chegam no banco; founder consegue cruzar com `users.email` via JOIN (SELECT u.email, r.* FROM library_access_requests r JOIN users u ON u.user_platform_id = r.user_id). Adicionar coluna email seria duplicacao.

### 4.4. Migracao reversivel

`migrations/0036_library_access_requests.sql` tem rollback simples:

```sql
DROP TABLE IF EXISTS library_access_requests;
DROP TYPE IF EXISTS library_access_request_status;
```

Sem dependencia de outras tabelas (FK so para `users`). Reverter custa 1 PR + 1 db push.

---

## 5. Confianca

**Alta.** Padrao UNIQUE parcial WHERE status = 'X' e idiomatico em Postgres para idempotencia em state machines. Convencoes Grindfy aderentes. Schema testado conceitualmente contra os 4 cenarios principais (happy path, race condition, re-pedido apos denied, snapshot anti-spoofing). Migration reversivel. Sem blockers.

---

## 6. Notas de Implementacao

- Migration `0036_library_access_requests.sql` numero confirmado: ultima aplicada e 0035 (Sprint Bloco-A-Polish). 0034 reservado pra `late_reg_alert_disable_existing.sql` (ja em git status). 0036 e proximo livre.
- Storage method `createLibraryAccessRequest` deve detectar erro Postgres 23505 com `error.code === '23505'` E `error.constraint === 'uniq_library_access_requests_user_pending'`. Caso contrario, propagar erro original (pode ser outro UNIQUE violado em sprints futuras).
- Handler POST converte erro tipado `LibraryAccessRequestPendingError` (que carrega `existingId`) em response 409 `{ message: "request_already_pending", existingId }`.
- Storage `getLatestLibraryAccessRequestForUser` retorna NULL se user nao tem nenhum registro. Frontend trata como "banner normal".
- Trigger `set_updated_at` ja existe no schema (reusada por `wallets`, `coach_actions`). Confirmar via `SELECT proname FROM pg_proc WHERE proname = 'set_updated_at'` antes da migration; se nao existir, criar inline com `CREATE OR REPLACE FUNCTION`.
