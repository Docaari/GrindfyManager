# ADR-001: Usar JWT com Refresh Token para Autenticacao

## Status
Aceito

## Data
2025-01-01

## Contexto
O Grindfy originalmente utilizava Replit Auth (baseado em OpenID Connect do ambiente Replit) para autenticacao. Ao migrar para deploy independente (fora do Replit), era necessario implementar um sistema de autenticacao proprio. O sistema precisa suportar:

- Login com email/senha
- Login social (Google OAuth)
- Sessoes persistentes (jogadores de poker usam a plataforma durante horas seguidas em sessoes de grind)
- Acesso via SPA React (single page application)
- Possibilidade futura de app mobile

## Opcoes Consideradas

### Opcao 1: Express Sessions (cookie-based)
- **Pros:** Simples de implementar, stateful (revogacao imediata), middleware nativo do Express (`express-session`), storage em PostgreSQL via `connect-pg-simple`
- **Contras:** Requer storage server-side (session store), nao escala bem horizontalmente sem Redis, cookies podem ter problemas com SameSite/CORS em cenarios mobile, dificuldade para futura API mobile

### Opcao 2: JWT com Access Token unico (sem refresh)
- **Pros:** Stateless, escala horizontalmente, funciona bem com SPA e mobile, facil de validar
- **Contras:** Token de longa duracao e inseguro (se vazado, acesso permanente), token de curta duracao causa logouts frequentes durante sessoes de grind que duram horas

### Opcao 3: JWT com Access Token + Refresh Token
- **Pros:** Access token de curta duracao (15min) limita janela de ataque, refresh token de longa duracao (30 dias) permite sessoes persistentes sem re-login, funciona com SPA e mobile, stateless para a maioria das requests, suporta rotacao de tokens
- **Contras:** Mais complexo de implementar, refresh tokens armazenados no cliente (localStorage/cookie), revogacao nao e imediata (precisa esperar access token expirar)

## Decisao
Opcao 3: JWT com Access Token (15 minutos) + Refresh Token (30 dias).

A natureza do produto (sessoes de grind que duram horas) exige que o jogador nao seja deslogado frequentemente. O access token de 15 minutos garante que tokens vazados tem janela limitada, enquanto o refresh token de 30 dias permite que o jogador mantenha a sessao ativa entre dias de grind sem re-login.

A implementacao usa `jsonwebtoken` (9.0.2) para gerar e verificar ambos os tokens, e `bcryptjs` (3.0.2) com 12 salt rounds para hash de senhas. O middleware `requireAuth` extrai o token do header `Authorization: Bearer <token>` e valida automaticamente.

## Consequencias

**Positivas:**
- Jogadores nao sao deslogados durante sessoes longas de grind
- Compativel com futura app mobile sem mudancas no backend
- Middleware simples e performatico (nao precisa consultar banco a cada request para validar sessao)

**Negativas:**
- Revogacao de tokens nao e imediata — se um token de acesso vazar, o atacante tem ate 15 minutos de acesso
- Refresh tokens armazenados no cliente (localStorage) sao vulneraveis a XSS
- Complexidade adicional no frontend para gerenciar refresh automatico quando access token expira

**Neutras:**
- O sistema de sessions do Express (`express-session` + `connect-pg-simple`) ainda esta presente no codigo como legado do Replit Auth, mas nao e mais o mecanismo primario de autenticacao
- A tabela `sessions` no banco permanece para compatibilidade, mas pode ser removida no futuro

## Confianca
Alta — JWT com refresh token e o padrao de mercado para SPAs com backend API. A implementacao atual funciona de forma estavel.
