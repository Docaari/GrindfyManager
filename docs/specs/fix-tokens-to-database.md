# Fix: Mover tokens de verificacao/reset de Map() em memoria para tabela no banco

## Status
Concluida

## Contexto
O servico de email (`server/emailService.ts`) armazena tokens de verificacao de email e reset de senha em `Map()` JavaScript em memoria (linhas 11-24). Isso significa que:

1. **Tokens sao perdidos em qualquer restart do servidor** -- se o servidor reiniciar (deploy, crash, escalonamento), todos os tokens pendentes sao invalidados. Um usuario que pediu reset de senha e nao clicou no link antes do restart perde o token.
2. **Nao funciona com multiplas instancias** -- se o app escalar para 2+ instancias, um token gerado na instancia A nao existe na instancia B.
3. **Sem visibilidade** -- nao ha como o admin ver tokens pendentes, e nao ha como debugar problemas de verificacao.

O proprio codigo reconhece isso com comentarios nas linhas 10 e 18:
```typescript
// Email verification token storage (in production, use Redis or database)
// Password reset token storage (in production, use Redis or database)
```

## Escopo
**O que sera feito:**
- Criar nova tabela `auth_tokens` no schema Drizzle
- Migrar a logica de tokens do EmailService para usar a tabela
- Implementar cleanup automatico de tokens expirados via query SQL
- Remover os Maps em memoria

**O que NAO sera feito:**
- Nao sera adicionado Redis (complexidade desnecessaria para o momento; o banco PostgreSQL ja atende)
- Nao sera alterado o fluxo de envio de emails (SMTP continua igual)
- Nao sera alterada a interface publica do EmailService (metodos mantem mesma assinatura)

## Analise Tecnica

### Implementacao atual (server/emailService.ts)

**Dois Maps em memoria (linhas 11-24):**
```typescript
const emailVerificationTokens = new Map<string, {
  userId: string;
  email: string;
  token: string;
  expiresAt: number;
}>();

const passwordResetTokens = new Map<string, {
  userId: string;
  email: string;
  token: string;
  expiresAt: number;
}>();
```

**Operacoes realizadas nos Maps:**

| Operacao | Metodo | Linhas | Descricao |
|----------|--------|--------|-----------|
| CREATE | `generateEmailVerificationToken()` | 60-72 | Gera token crypto, salva no Map com TTL 24h |
| CREATE | `generatePasswordResetToken()` | 91-103 | Gera token crypto, salva no Map com TTL 1h |
| READ | `verifyEmailToken()` | 75-88 | Busca no Map, verifica expiracao, retorna userId+email |
| READ | `verifyPasswordResetToken()` | 106-119 | Busca no Map, verifica expiracao, retorna userId+email |
| DELETE | `verifyUserEmail()` | 213 | Deleta token apos uso (verificacao bem sucedida) |
| DELETE | `verifyUserEmailWithData()` | 249 | Deleta token apos uso (verificacao com auto-login) |
| DELETE | `cleanupExpiredTokens()` | 263-279 | Itera Maps, remove tokens expirados |

**Cleanup automatico (linha 596-598):**
```typescript
setInterval(() => {
  EmailService.cleanupExpiredTokens();
}, 5 * 60 * 1000); // A cada 5 minutos
```

**TTLs definidos (linhas 27-28):**
- Verificacao de email: 24 horas (`TOKEN_EXPIRY = 24 * 60 * 60 * 1000`)
- Reset de senha: 1 hora (`RESET_TOKEN_EXPIRY = 1 * 60 * 60 * 1000`)

### Nota sobre campos existentes na tabela users
A tabela `users` ja possui campos `emailVerificationToken` e `passwordResetToken` (linhas 46-49 do schema), mas eles NAO sao usados pelo EmailService atual. O EmailService usa apenas os Maps. Estes campos na tabela users aparentam ser restos de uma implementacao anterior que foi substituida pelos Maps.

## Solucao Proposta

### 1. Nova tabela: `auth_tokens`

Schema Drizzle completo para adicionar em `shared/schema.ts`:

```typescript
export const authTokens = pgTable("auth_tokens", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.userPlatformId, { onDelete: "cascade" }),
  email: varchar("email").notNull(),
  token: varchar("token").notNull().unique(),
  type: varchar("type").notNull(), // "email_verification" | "password_reset"
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"), // null = nao usado, timestamp = quando foi consumido
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_auth_tokens_token").on(table.token),
  index("idx_auth_tokens_user_type").on(table.userId, table.type),
  index("idx_auth_tokens_expires").on(table.expiresAt),
]);
```

**Campos e justificativas:**

| Campo | Tipo | Constraint | Justificativa |
|-------|------|------------|---------------|
| `id` | varchar PK | nanoid | Padrao do projeto |
| `userId` | varchar FK | -> users.userPlatformId, CASCADE | Identifica o dono do token (segue padrao definido na spec fix-fk-consistency) |
| `email` | varchar | NOT NULL | Email associado ao token (pode diferir do email atual do user em caso de troca) |
| `token` | varchar | UNIQUE, NOT NULL | Hash do token (64 chars hex) |
| `type` | varchar | NOT NULL | Distingue verificacao de reset |
| `expiresAt` | timestamp | NOT NULL | Momento exato de expiracao |
| `usedAt` | timestamp | nullable | Permite auditoria; token usado nao e deletado, apenas marcado |
| `createdAt` | timestamp | defaultNow | Padrao do projeto |

**Indices:**
- `idx_auth_tokens_token`: Busca rapida por token (operacao principal)
- `idx_auth_tokens_user_type`: Busca por usuario+tipo (para invalidar tokens anteriores)
- `idx_auth_tokens_expires`: Cleanup de tokens expirados

### 2. Zod schema e tipos

```typescript
export const insertAuthTokenSchema = createInsertSchema(authTokens).omit({
  id: true,
  createdAt: true,
});

export type AuthToken = typeof authTokens.$inferSelect;
export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;
```

### 3. Alteracoes no EmailService

**generateEmailVerificationToken():**
- Em vez de `emailVerificationTokens.set(token, ...)`, inserir na tabela `auth_tokens` com type="email_verification"
- Antes de inserir, invalidar tokens anteriores do mesmo usuario+tipo (DELETE WHERE userId=X AND type='email_verification' AND usedAt IS NULL)

**generatePasswordResetToken():**
- Em vez de `passwordResetTokens.set(token, ...)`, inserir na tabela `auth_tokens` com type="password_reset"
- Antes de inserir, invalidar tokens anteriores do mesmo usuario+tipo

**verifyEmailToken():**
- Em vez de `emailVerificationTokens.get(token)`, fazer SELECT WHERE token=X AND type='email_verification' AND expiresAt > NOW() AND usedAt IS NULL
- Retornar null se nao encontrar

**verifyPasswordResetToken():**
- Mesma logica, com type='password_reset'

**verifyUserEmail() e verifyUserEmailWithData():**
- Em vez de `emailVerificationTokens.delete(token)`, fazer UPDATE SET usedAt=NOW() WHERE token=X

**cleanupExpiredTokens():**
- Em vez de iterar Maps, executar: DELETE FROM auth_tokens WHERE expiresAt < NOW() - INTERVAL '7 days' (manter tokens expirados por 7 dias para auditoria, depois deletar)
- Tokens consumidos (usedAt IS NOT NULL) devem ser mantidos por pelo menos 7 dias apos uso para auditoria, depois podem ser deletados pelo cleanup

**Remover:**
- As duas variaveis `const emailVerificationTokens = new Map<...>()` e `const passwordResetTokens = new Map<...>()`
- O `setInterval` de cleanup (substituir por cleanup na propria query, ou manter setInterval mas com query SQL)

### 4. Migracao: tokens existentes em memoria

Tokens em memoria serao perdidos no deploy que aplica esta mudanca. Isso e aceitavel porque:
- Tokens de verificacao de email tem TTL de 24h; o usuario pode solicitar reenvio
- Tokens de reset de senha tem TTL de 1h; o usuario pode solicitar novo reset
- O volume de tokens pendentes em qualquer momento e baixo

Nao e necessario script de migracao de dados. Apenas a criacao da tabela e a troca da implementacao.

### 5. Remover campos legados da tabela users

Os campos `emailVerificationToken` e `passwordResetToken` na tabela `users` (linhas 46-49) nao sao usados por nenhum codigo atual. Com a nova tabela `auth_tokens`, eles ficam definitivamente obsoletos e devem ser removidos nesta spec para evitar confusao futura.

**Alteracoes no schema:**
- Remover campo `emailVerificationToken` da tabela `users` em `shared/schema.ts`
- Remover campo `passwordResetToken` da tabela `users` em `shared/schema.ts`
- Atualizar tipos derivados (Zod schemas, insert schemas) que incluam esses campos
- Aplicar migracao no banco (ALTER TABLE users DROP COLUMN)

## Criterios de Aceite
- [ ] Tabela `auth_tokens` existe no banco com todos os campos, constraints e indices
- [ ] `EmailService.generateEmailVerificationToken()` insere na tabela em vez do Map
- [ ] `EmailService.generatePasswordResetToken()` insere na tabela em vez do Map
- [ ] `EmailService.verifyEmailToken()` busca na tabela em vez do Map
- [ ] `EmailService.verifyPasswordResetToken()` busca na tabela em vez do Map
- [ ] Token consumido e marcado com `usedAt` (nao deletado imediatamente)
- [ ] Tokens anteriores do mesmo usuario+tipo sao invalidados ao gerar novo token
- [ ] Cleanup de tokens expirados funciona via query SQL (DELETE apos 7 dias)
- [ ] Os dois Maps `emailVerificationTokens` e `passwordResetTokens` foram removidos
- [ ] Campos legados `emailVerificationToken` e `passwordResetToken` removidos da tabela `users` no schema
- [ ] Campos legados removidos do banco via migracao (ALTER TABLE users DROP COLUMN)
- [ ] Tipos derivados (Zod schemas, insert schemas) atualizados sem os campos legados
- [ ] Fluxo completo de registro -> verificacao de email funciona
- [ ] Fluxo completo de forgot-password -> reset-password funciona
- [ ] Servidor reiniciado nao perde tokens pendentes
- [ ] `npm run build` compila sem erros

## Riscos

### Risco Baixo: Tokens pendentes perdidos no deploy
Usuarios com tokens pendentes no momento do deploy perderao seus tokens. Mitigacao: comunicar ou agendar deploy em horario de baixo uso. Usuarios podem solicitar novo token.

### Risco Baixo: Performance de queries
O volume de tokens e muito baixo (dezenas por dia no maximo). Os indices garantem performance adequada. Nao ha risco de performance.

### Risco Medio: Dependencia da spec fix-fk-consistency
A FK proposta usa `users.userPlatformId`, que e o padrao definido na spec de FK consistency. Se aquela spec nao for implementada primeiro, a FK pode ser temporariamente criada apontando para o campo correto mesmo sem as outras tabelas terem sido corrigidas.

## Estimativa de Complexidade
Media -- nova tabela no schema, refatoracao de 6 metodos no EmailService, sem impacto em endpoints (interface publica do EmailService nao muda).

## Arquivos Afetados
- `shared/schema.ts` (nova tabela `authTokens`, schema Zod, tipos; remover campos `emailVerificationToken` e `passwordResetToken` da tabela `users`)
- `server/emailService.ts` (refatorar 6 metodos, remover 2 Maps, ajustar cleanup)
- Migracao SQL (novo arquivo em migrations/ ou via db:push -- inclui CREATE TABLE auth_tokens + ALTER TABLE users DROP COLUMN)

## Dependencias
- Idealmente, a spec `fix-fk-consistency` deve ser implementada antes (para que a FK aponte para `users.userPlatformId` consistentemente)
- Se implementada antes da fix-fk-consistency, usar `.references(() => users.userPlatformId)` mesmo assim -- e o padrao correto baseado nos dados reais
