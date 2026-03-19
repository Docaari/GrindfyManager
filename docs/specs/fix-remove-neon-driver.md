# Fix: Remover dependencia @neondatabase/serverless nao utilizada

## Status
Aprovada

## Contexto
O pacote `@neondatabase/serverless` (versao ^0.10.4) esta listado como dependencia em `package.json` (linha 19), mas nao e importado ou referenciado em nenhum arquivo do projeto. O servidor usa exclusivamente o driver `pg` (node-postgres) via `server/db.ts`, que instancia `pg.Pool` diretamente com a connection string do `DATABASE_URL`.

Uma busca por `@neondatabase` e `neon` em todos os arquivos de `server/` e `shared/` retornou zero resultados. O driver Neon era provavelmente uma dependencia do ambiente Replit que nunca foi utilizada no codigo da aplicacao.

## Escopo
**O que sera feito:**
- Remover `@neondatabase/serverless` do campo `dependencies` em `package.json`
- Rodar `npm install` para atualizar `package-lock.json`

**O que NAO sera feito:**
- Nenhuma alteracao em codigo fonte (nenhum arquivo importa este pacote)
- Nenhuma alteracao em configuracao de banco de dados
- Nenhuma alteracao no driver `pg` que e o driver real em uso

## Analise Tecnica

### Evidencia de que o pacote nao e usado

**package.json linha 19:**
```
"@neondatabase/serverless": "^0.10.4",
```

**server/db.ts (arquivo completo, 27 linhas) -- usa apenas `pg`:**
```typescript
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
// ...
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ... });
export const db = drizzle({ client: pool, schema });
```

**Grep por `@neondatabase` em server/ e shared/:** Zero resultados.
**Grep por `neon` (case-insensitive) em server/ e shared/:** Zero resultados.

### Driver real em uso
O projeto usa `pg` (node-postgres) versao ^8.19.0 com `drizzle-orm/node-postgres`. O pool PostgreSQL suporta conexao tanto local quanto remota (Neon Serverless Postgres via connection string padrao), sem precisar do driver especifico `@neondatabase/serverless`.

## Solucao Proposta

1. Remover a linha `"@neondatabase/serverless": "^0.10.4"` de `package.json` dependencies
2. Executar `npm install` para regenerar `package-lock.json`
3. Verificar que `npm run build` continua funcionando
4. Verificar que `npm run dev` inicia normalmente

## Criterios de Aceite
- [ ] `@neondatabase/serverless` nao aparece em `package.json`
- [ ] `package-lock.json` foi atualizado (sem referencia ao pacote)
- [ ] `npm run build` completa com sucesso
- [ ] `npm run dev` inicia o servidor sem erro
- [ ] Nenhum import quebrado em nenhum arquivo do projeto

## Riscos
**Risco: Baixo.**
O pacote nao e importado em nenhum lugar. A remocao e uma operacao puramente de limpeza de dependencias. Nao ha risco de quebrar funcionalidade existente.

Unico cenario de atencao: se algum script de CI/CD ou deploy referencia este pacote fora do codebase. Isso deve ser verificado no ambiente de deploy (Render), mas e improvavel.

## Estimativa de Complexidade
Baixa -- alteracao em 1 arquivo, zero risco funcional.

## Arquivos Afetados
- `package.json` (remover 1 linha)
- `package-lock.json` (regenerado automaticamente)

## Dependencias
Nenhuma. Esta correcao e independente e pode ser feita a qualquer momento.
