# Premium Library — contrato de storage (ADR-240)

Métodos novos. Recomendado em módulo dedicado `server/storage/premiumLibraryStorage.ts`
(attach pattern, igual `mdaStorage.ts`/`goalsStorage.ts`) OU como métodos em `storage.ts`.
Os handlers de rota aceitam `injectedStorage?` como 3º arg (lesson #34) para testabilidade
sem `vi.mock('../storage')`.

Tipos derivados do schema Drizzle novo em `shared/schema.ts`:

```ts
// shared/schema.ts (novo)
export const premiumLibraryHighlights = pgTable("premium_library_highlights", {
  id: varchar("id").primaryKey().notNull(),
  site: varchar("site").notNull(),
  familyKey: varchar("family_key").notNull(),
  groupName: varchar("group_name"),
  buyInTier: varchar("buy_in_tier"),
  type: varchar("type"),
  metrics: jsonb("metrics"),
  reasons: jsonb("reasons"),
  source: varchar("source").default("library"),       // 'library' | 'import'
  curatedBy: varchar("curated_by").notNull(),
  sourceUserId: varchar("source_user_id"),
  sourceHighlightId: varchar("source_highlight_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_premium_highlight_family").on(table.familyKey),
  index("idx_premium_highlight_site").on(table.site),
  index("idx_premium_highlight_created").on(table.createdAt),
]);
export type PremiumLibraryHighlight = typeof premiumLibraryHighlights.$inferSelect;
export type InsertPremiumLibraryHighlight = typeof premiumLibraryHighlights.$inferInsert;
```

## Assinaturas dos métodos

```ts
/**
 * RF-02 — Lista a Biblioteca Premium global, opcionalmente filtrada por site.
 * Ordenacao: created_at DESC. Tabela pequena (curada manualmente) — sem paginacao.
 * Retorna [] em erro (lesson #9: logar antes do fallback).
 */
listPremiumHighlights(site?: string): Promise<PremiumLibraryHighlight[]>;

/**
 * RF-03 — Le 1 row Premium por id (para o drill-down resolver o familyKey antes
 * de chamar getFamilyDetails(viewerUserId, familyKey)). null se inexistente -> 404.
 */
getPremiumHighlight(id: string): Promise<PremiumLibraryHighlight | null>;

/**
 * RF-01 + RF-07 — Promove uma familia a Premium (snapshot COPIA de metrics/reasons).
 * Usado tanto pela promocao direta (source='library', sourceUserId/sourceHighlightId null)
 * quanto pelo import cross-user (source='import' + rastreabilidade).
 * Dedup global por UNIQUE(family_key): em conflito (pg 23505) sinaliza already_in_premium
 * SEM lancar para o caller decidir o 409. id via nanoid().
 *
 * Contrato de retorno (discriminado): o handler mapeia conflict -> 409, row -> 200.
 */
promotePremiumHighlight(input: {
  site: string;
  familyKey: string;
  groupName?: string | null;
  buyInTier?: string | null;
  type?: string | null;
  metrics?: any;
  reasons?: any;
  source?: "library" | "import";   // default 'library'
  curatedBy: string;               // user_platform_id do curador
  sourceUserId?: string | null;    // so quando source='import'
  sourceHighlightId?: string | null;
}): Promise<
  | { ok: true; row: PremiumLibraryHighlight }
  | { ok: false; conflict: "already_in_premium" }
>;

/**
 * RF-04 — Remove (hard delete) uma row Premium por id. NAO escopa por curatedBy
 * (curadoria colaborativa, R-5). false se :id inexistente -> 404.
 */
removePremiumHighlight(id: string): Promise<boolean>;

/**
 * RF-06 — Painel cross-user: lista os saved_tournament_highlights de TODAS as contas
 * (bypass intencional do tenant scoping — guard requireGranularPermission garante curador).
 * JOIN users para atribuicao (userPlatformId + username/email legivel).
 * Cada item indica alreadyInPremium (familyKey ja na Premium) para desabilitar "Importar".
 * Paginacao limit/offset (default limit=50). Filtros opcionais site/userId.
 */
listAllUserHighlights(params: {
  site?: string;
  userId?: string;     // USER-XXXX (user_platform_id)
  limit?: number;      // default 50
  offset?: number;     // default 0
}): Promise<{
  items: Array<{
    id: string;
    userId: string;          // dono (user_platform_id)
    username: string | null; // atribuicao legivel
    email: string;           // atribuicao legivel
    site: string;
    familyKey: string;
    groupName: string | null;
    buyInTier: string | null;
    type: string | null;
    metrics: any;
    reasons: any;
    source: string | null;
    createdAt: string | null;
    alreadyInPremium: boolean;
  }>;
  total: number;
}>;

/**
 * RF-07 — Le 1 saved_tournament_highlights por id SEM escopo de owner (curador ve
 * de qualquer conta). Fonte do snapshot a copiar na importacao. null -> 404.
 */
getSavedHighlightByIdAnyUser(
  sourceHighlightId: string,
): Promise<SavedTournamentHighlight | null>;
```

## Reuso (NÃO criar novo)
- `getFamilyDetails(viewerUserId: string, familyKey: string)` — já existe em `storage.ts:4007`.
  Reusado pelo drill-down (RF-03) re-derivando do histórico **do viewer**. Retorna
  `{ found, metrics, recentResults }`.

## Notas para test-writer (lesson #3 — shape REAL)
- `req.user` mockado: `{ email, userPlatformId, permissions: string[] }` (permissions já vem do attach `auth.ts:259`).
- `promotePremiumHighlight` retorna **objeto discriminado** `{ ok, ... }`, não lança no conflito — o handler decide o 409. NÃO mockar como `throw`.
- `listAllUserHighlights.items[].alreadyInPremium` deriva de um SELECT do set de `family_key` já na Premium — validar o shape real do JOIN `users` (`username` é nullable, `email` not null).
- `getSavedHighlightByIdAnyUser` NÃO filtra por `userId` — é o ponto sensível anti-IDOR; o guard é a única barreira.
