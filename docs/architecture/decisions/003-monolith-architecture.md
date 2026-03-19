# ADR-003: Monolito Express Servindo API + SPA na Mesma Porta

## Status
Aceito

## Data
2025-01-01

## Contexto
O Grindfy precisa servir uma SPA React e uma API Express. A questao e como organizar e servir esses dois componentes. O projeto se originou no Replit, onde a arquitetura de single-port era o padrao imposto pela plataforma. Ao migrar para deploy independente, a decisao de manter ou separar precisou ser reavaliada.

O sistema tem ~173 endpoints em um unico arquivo `routes.ts` (~7000 linhas), com funcionalidades que vao de auth ate analytics complexos.

## Opcoes Consideradas

### Opcao 1: Monolito (Express serve API + SPA na mesma porta)
- **Pros:** Deploy simples (um unico processo/container), sem problemas de CORS, sem necessidade de proxy reverso, Vite dev server integrado via middleware em desenvolvimento, unico repositorio e build, menor custo de infraestrutura (um servico)
- **Contras:** Escalonamento acoplado (API e SPA escalam juntos), arquivo routes.ts monolitico (7000+ linhas), nao e possivel escalar API independentemente do serving de assets estaticos

### Opcao 2: Frontend e Backend separados (SPA em CDN + API separada)
- **Pros:** Escalonamento independente, SPA servida por CDN (latencia minima), API pode escalar horizontalmente, separacao clara de responsabilidades, builds independentes
- **Contras:** Necessidade de configurar CORS, dois deploys separados para manter sincronizados, complexidade adicional de infraestrutura (CDN + API server), problema de CORS com cookies/headers

### Opcao 3: Microservicos (auth, tournaments, analytics, grind como servicos separados)
- **Pros:** Escalonamento granular, cada servico pode usar stack otimizada, isolamento de falhas, deploys independentes
- **Contras:** Overhead massivo de infraestrutura para um time de 1-2 pessoas, complexidade de orquestracao (service discovery, API gateway), latencia inter-servico, consistencia de dados entre servicos, debugabilidade drasticamente reduzida

## Decisao
Opcao 1: Monolito Express servindo API e SPA na mesma porta (3000).

Em desenvolvimento, o Vite dev server e integrado como middleware do Express (`setupVite` em `server/vite.ts`), permitindo HMR. Em producao, o Express serve os assets estaticos buildados pelo Vite (`serveStatic`).

A decisao e pragmatica: o projeto e mantido por 1-2 pessoas, o volume de usuarios e baixo, e a complexidade de microservicos ou separacao frontend/backend nao se justifica. O principal risco (arquivo routes.ts monolitico de 7000 linhas) pode ser mitigado com modularizacao em arquivos de rota separados sem mudar a arquitetura.

## Consequencias

**Positivas:**
- Deploy extremamente simples: `npm run build` + `npm start` (um processo)
- Zero configuracao de CORS (frontend e API na mesma origem)
- Vite HMR funciona transparentemente em desenvolvimento
- Menor custo de infraestrutura (um unico servico/container)
- Simplicidade de debugging (tudo em um processo)

**Negativas:**
- `routes.ts` com 7000+ linhas e 173 endpoints e difícil de manter — precisa ser modularizado
- Endpoints duplicados encontrados (forgot-password aparece 3x, reset-password 3x, verify-email 2x)
- Endpoints de debug em producao (`/api/debug-user`, `/api/debug-upload-security`)
- SPA e API escalam juntas — se analytics pesados sobrecarregarem o servidor, o frontend tambem e afetado
- Host hardcoded como `0.0.0.0` — adequado para containers mas pode precisar de configuracao em alguns ambientes

**Neutras:**
- A migracao para Opcao 2 (separar frontend em CDN) seria relativamente simples se necessario no futuro — o frontend ja e buildado como SPA estatica pelo Vite
- A modularizacao do `routes.ts` em arquivos separados (auth.routes.ts, tournaments.routes.ts, etc.) e o proximo passo natural

## Confianca
Alta — monolito e a escolha correta para o estagio atual do projeto. A modularizacao interna (dividir routes.ts) e mais urgente do que mudar a arquitetura.
