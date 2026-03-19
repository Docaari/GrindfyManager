# Guia Completo: Desenvolvimento de SaaS com Agentes de IA
## Para devs e para os agentes que trabalham com eles

*Versão 1.0 — Março 2026*
*Validado contra documentação Anthropic, workshop Agile Manifesto 2026, Simon Willison, Martin Fowler, DORA Report 2025, e práticas de produção.*

---

## Parte 1 — Conceitos Chave

### 1.1 Anti-Vibe Coding

O oposto de "vibe coding" (pedir para a IA gerar tudo sem estrutura). O princípio é: **o dev pensa, a IA executa**. Sem inversão de papéis.

A metáfora central: o dev entrega o esqueleto (arquitetura, testes, regras), a IA preenche com os órgãos (implementação). Sem esqueleto, o resultado é uma "big ball of mud" — código que funciona em demo mas quebra em produção.

Isso não é opinião. O relatório DORA 2025 posiciona a IA como **amplificador**: ela acelera o que você já tem. Se você tem disciplina, ela amplifica qualidade. Se não tem, ela amplifica dívida técnica. Um estudo de 5.000 programas com 6 LLMs diferentes confirmou que o risco de defeitos é 30% maior em codebases com baixa qualidade — e essa relação piora de forma não-linear.

### 1.2 TDD como Forma Suprema de Prompt Engineering

Esta é provavelmente a descoberta mais importante da era do desenvolvimento com IA. O workshop dos signatários do Agile Manifesto (Fev 2026, The Register) concluiu:

> "TDD produz resultados dramaticamente melhores com agentes de IA. TDD previne um modo de falha onde agentes escrevem testes que verificam comportamento quebrado. Quando os testes existem antes do código, agentes não podem trapacear escrevendo testes que simplesmente confirmam qualquer implementação incorreta que produziram."

Simon Willison (Feb 2026) reforça: "Red/green TDD é um atalho que todo bom modelo entende para o processo completo — escreva testes primeiro, confirme que falham, depois implemente até passarem."

Martin Fowler (Feb 2026): "Estou ouvindo de pessoas na vanguarda do uso de LLMs sobre o valor de testes claros e do ciclo TDD."

**Por que funciona tão bem com IA:**
- IA prospera com objetivos claros e mensuráveis — um teste binário (passa/falha) é o objetivo mais claro possível
- Sem TDD, a IA gera código que "parece correto" e depois gera testes que confirmam o que o código já faz (não o que deveria fazer)
- TDD inverte: força a IA a pensar em requisitos antes de implementação
- O ciclo Red→Green→Refactor dá à IA um loop de feedback rápido para auto-correção

### 1.3 CLAUDE.md como Fonte de Verdade

O CLAUDE.md é o manual do projeto que o agente lê ao iniciar cada sessão. Ele substitui a necessidade de re-explicar contexto. Para o agente, é como memória de longo prazo.

Funciona porque Claude Code (e outros agentes) automaticamente descobre estado do filesystem local. Um CLAUDE.md bem escrito dá ao agente toda a informação para operar de forma autônoma: o que o projeto faz, como está estruturado, quais são as regras, e o que já deu errado antes.

### 1.4 Desenvolvimento em Fases Sequenciais

Projetos com IA falham quando tentam fazer tudo de uma vez. A decomposição em fases sequenciais (planejar → testar → implementar → otimizar → deploy) é validada por múltiplas fontes:

- GitHub Spec Kit (Set 2025) formalizou: specify → plan → tasks → implement
- O workflow plan/act de Carl Annaberg restringindo ferramentas por fase
- A própria Anthropic com prompt chaining: "ainda útil quando você precisa inspecionar outputs intermediários"

A ideia central: **restrinja o que o agente pode fazer em cada fase**. Na fase de planejamento, ele não escreve código. Na fase de teste, ele não implementa. Na fase de implementação, ele faz testes passarem — não inventa features.

---

## Parte 2 — O Workflow Completo

### Fase 1 — Ambiente Seguro

**O que fazer:**
Isole o ambiente de desenvolvimento antes de qualquer código. O agente opera dentro de limites definidos.

**Ações concretas:**
- Configure Docker (Dockerfile + docker-compose.yml) com o runtime necessário
- Crie .env.example com todas as variáveis (sem valores reais)
- Defina permissões: o agente pede aprovação antes de comandos destrutivos (rm, drop, deploy)
- Se o projeto é simples ou de aprendizado, Docker é opcional — mas registre essa decisão

**Entregáveis:** Dockerfile, docker-compose.yml, .env.example, README.md com setup

**Por que importa:** Sem isolamento, um erro do agente pode afetar seu sistema real. O "permission model" é a primeira linha de defesa.

---

### Fase 2 — Planejamento e Arquitetura

**O que fazer:**
Zero código nesta fase. Apenas documentação e decisões. Esta é a fase mais importante — ela define o esqueleto que a IA vai preencher.

**Passo 2.1 — Entrevista com o usuário:**

Colete estas informações antes de qualquer decisão técnica:

1. Qual problema o SaaS resolve? (1 frase)
2. Quem é o usuário-alvo?
3. Quais as 3-5 funcionalidades do MVP? (não mais que 5 — escopo controlado)
4. Qual a interface de saída? (web, API, bot, CLI, mobile)
5. Preferência de stack? (linguagem, framework, banco)
6. É para produção real ou para aprendizado?

**Passo 2.2 — Decisão de stack:**

A escolha depende de três fatores: experiência do dev, tipo do projeto, e objetivo.

*Por experiência:*
- **Iniciante:** Node.js + Express/Fastify + PostgreSQL + Next.js. Uma linguagem reduz carga cognitiva.
- **Intermediário:** Escolha por tipo de projeto. Pode misturar stacks.
- **Avançado / Build to Learn:** Qualquer stack, desde que documente as justificativas.

*Por tipo de projeto:*
- **MVP solo dev, precisa ser rápido:** Next.js full-stack + Prisma + PostgreSQL
- **CRUD intenso, time pequeno:** Rails + Hotwire + PostgreSQL
- **Performance crítica:** Go (API) + Next.js (front) + PostgreSQL
- **Real-time (chat, notificações):** Elixir Phoenix + LiveView + PostgreSQL
- **Processamento pesado de dados:** Python FastAPI + Celery + PostgreSQL + Redis

*Banco de dados — PostgreSQL como padrão a menos que haja motivo forte:*
- Suporta JSON/JSONB (cobre muitos casos de NoSQL)
- Extensões: PostGIS (geo), pg_cron (agendamento), pgvector (IA/embeddings)
- ACID, escalável para 99% dos SaaS
- SQLite para aprendizado sem servidor; Redis para cache/sessões; MongoDB só se schema realmente flexível

*Monorepo vs Multi-repo:*
- Monorepo quando há 2+ serviços com código compartilhado — especialmente com agentes de IA (contexto compartilhado permite refatoração multi-serviço)
- Multi-repo quando serviços são completamente independentes ou mantidos por times diferentes
- Para aprendizado, pastas simples num repo são suficientes

*Hosting:*
- Vercel + Railway ($0-20/mês) para frontend + API
- Coolify + Hetzner ($5-15/mês) para controle total
- Fly.io free tier para aprendizado sem custo
- AWS/GCP ($50+/mês) para escala enterprise

**Passo 2.3 — Gerar o CLAUDE.md:**

O coração do método. O CLAUDE.md é um contrato que qualquer agente deve conseguir ler e operar. Deve cobrir:

1. **Visão geral** — propósito, tipo, status, metodologia
2. **Arquitetura** — diagrama textual, tipo (monolito/monorepo/micro), comunicação entre serviços
3. **Stack completa** — backend, frontend, infra — cada item com versão exata e justificativa
4. **Estrutura de diretórios** — árvore completa com descrição de cada pasta
5. **Variáveis de ambiente** — tabela: variável, serviço, descrição, exemplo
6. **Features do MVP** — para cada: descrição, serviço responsável, endpoints, regras de negócio, testes necessários
7. **Modelos de dados** — tabela por model: campo, tipo, constraints, descrição
8. **APIs externas** — propósito, autenticação, link da doc
9. **Convenções** — naming (kebab-case arquivos, PascalCase classes, camelCase funções, snake_case banco), commits (conventional commits), branches (main/develop/feature/fix)
10. **Erros conhecidos da IA** — inicialmente vazio, preenchido durante o desenvolvimento. Formato: erro, contexto, correto, data
11. **Comandos úteis** — setup, dev, test, lint, migrate, seed, build, deploy

**Tamanho mínimo:** 200 linhas (projeto simples), 500+ (complexo). Se está curto, falta informação.

**Passo 2.4 — Estrutura de diretórios:**

Crie a árvore completa de pastas sem código. Exemplo padrão:

```
projeto/
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── .env.example
├── .github/workflows/ci.yml
├── services/
│   ├── api/
│   │   ├── src/ (controllers, services, models, middlewares, routes, config)
│   │   └── tests/ (unit, integration)
│   └── worker/
│       ├── src/ (jobs, processors)
│       └── tests/
├── packages/shared/ (types, utils)
├── web/
│   ├── src/ (app, components, hooks, lib, styles)
│   └── tests/
└── scripts/ (setup.sh, seed.sh, deploy.sh)
```

**Entregáveis:** CLAUDE.md (200+ linhas), README.md, estrutura de diretórios, docker-compose.yml, configs de conexão

---

### Fase 3 — Testes (Red Phase do TDD)

**O que fazer:**
Primeiro código do projeto = APENAS testes. Zero implementação.

**Regras:**
- Escreva testes para cada funcionalidade planejada na Fase 2
- Use mocks para dependências que ainda não existem
- Se o agente sugerir implementação junto com teste: recuse
- Organize testes espelhando a estrutura do código fonte
- Inclua unitários + integração

**Como instruir o agente:**
```
"Escreva APENAS os testes para [feature X].
NÃO implemente a funcionalidade.
Use mocks para todas as dependências."
```

Se o agente incluir implementação:
```
"Remova a implementação. Quero APENAS os testes."
```

**Dica avançada (validada):** Para evitar que o agente "trapaceie" consultando código existente, rode a sessão de criação de testes a partir do diretório /tests, isolado do código fonte. Isso força o agente a basear-se apenas nas especificações.

**Checklist de cobertura para cada feature:**

*Obrigatórios:*
- Happy path (funciona como esperado)
- Input inválido (dados faltando, formato errado)
- Duplicatas (email, username)
- Limites (string vazia, negativo, zero, max int)
- Autorização (sem permissão, token expirado)
- Not found (recurso inexistente)

*Integração (quando aplicável):*
- Comunicação entre serviços
- Timeout / falha de serviço externo
- Transação de banco (rollback em erro)
- Race condition (requests simultâneos)

*Antipadrões a evitar:*
- Teste que depende de outro teste (ordem importa)
- Teste que acessa internet real (sempre mock)
- Teste que depende de data/hora atual (freeze time)
- Teste que testa implementação ao invés de comportamento
- "Kitchen Sink Test" — um teste verificando 15 coisas (1 comportamento por teste)
- "Mock Everything" — só mock externo, não funções puras

**Entregáveis:** Arquivos de teste, mocks, script de testes, todos falhando (red) — isso é esperado e correto

---

### Fase 4 — Implementação (Green Phase do TDD)

**O que fazer:**
Implemente funcionalidades uma a uma, fazendo testes passarem.

**Regras:**
- Uma funcionalidade por vez
- Após implementar: rodar testes. O correspondente DEVE passar
- Se surgir feature nova: PARAR → teste primeiro → depois implementar
- Não otimizar agora — foco em testes passarem
- Se o agente quebrar testes existentes: rejeitar e pedir correção

**Como instruir o agente:**
```
"Implemente [feature X] para que os testes em [arquivo de teste] passem.
Não modifique os testes existentes.
Não adicione funcionalidade além do que os testes pedem."
```

**Fluxo:** escolher feature → implementar → testar → passou: commit → próxima. Falhou: explicar erro ao agente, documentar no CLAUDE.md se for padrão.

**Sobre erros do agente:**
1. NÃO edite o código manualmente
2. Explique o erro em linguagem natural
3. Registre na seção "Erros Conhecidos" do CLAUDE.md
4. Peça ao agente para corrigir

Isso cria uma memória cumulativa — o agente aprende com erros anteriores ao reler o CLAUDE.md em sessões futuras.

**Entregáveis:** Código implementado, todos testes passando (green), CLAUDE.md atualizado

---

### Fase 5 — Refatoração (Refactor Phase do TDD)

**O que fazer:**
Com tudo funcionando, otimize sem quebrar nada.

**Ações:**
- Gargalos de performance (queries lentas, N+1, endpoints pesados)
- Arquivos grandes → módulos menores
- Caching (Redis), filas para jobs pesados, índices no banco
- Repensar decisões de API se necessário
- **Rodar testes após CADA refatoração**

**Regra:** Se qualquer teste quebrar durante refatoração, reverta imediatamente. Refatoração que quebra teste não é refatoração — é regressão.

**Entregáveis:** Código otimizado, testes passando, CLAUDE.md atualizado com decisões

---

### Fase 6 — Interface

**O que fazer:**
Construa a interface que o usuário final vai usar.

**Regras:**
- A interface consome serviços já testados — zero lógica de negócio na interface
- Escreva testes para a interface (componente + E2E quando possível)
- MVP: funcionalidade > estética. Interface bonita que não funciona é pior que interface feia que funciona

**Entregáveis:** Interface funcional conectada aos serviços, testes, documentação

---

### Fase 7 — Deploy e CI/CD

**O que fazer:**
Monte a esteira de entrega contínua e faça o primeiro deploy.

**Pipeline CI/CD (nesta ordem):**
1. Lint e validação de código
2. Análise de code smells
3. Execução de todos os testes (unit + integration)
4. Análise de vulnerabilidades (npm audit, safety, snyk)
5. Build dos serviços
6. Deploy (se branch principal)

**Produção:** provedor, env vars, banco, domínio, SSL

**Entregáveis:** CI/CD funcional, servidor configurado, primeiro deploy, README com instruções

---

## Parte 3 — Regras para o Agente de IA

### Comportamento geral

- **Releia o CLAUDE.md** no início de cada sessão
- **Atualize o CLAUDE.md** ao final de cada sessão com decisões e erros
- **Nunca comece com código.** "Cria um SaaS de X" = inicie pela Fase 2 (entrevista)
- **Nunca pule Fundação (Fase 2) ou Testes (Fase 3).** Pode compactar, nunca eliminar
- **Versões exatas.** Não use "latest" — use "18.3.1"
- **Justifique cada escolha técnica.** "Porque sim" não é justificativa

### Quando o usuário quer pular fases

Explique que planejamento é o que separa software profissional de uma "big ball of mud". Ofereça versão compacta da fase, mas nunca elimine. Lembre: empresas gastam milhares aprendendo essa lição.

### Quando o agente erra

Ciclo: identificar → explicar em linguagem natural → registrar no CLAUDE.md (seção Erros Conhecidos) → pedir correção ao agente. Nunca editar manualmente.

### Gestão de contexto entre sessões

- CLAUDE.md é a memória principal
- Git log é o histórico de progresso
- Para sessões longas: salve estado antes de atingir limite de contexto
- Ao retomar: leia CLAUDE.md, git log, e rode testes para verificar estado atual

---

## Parte 4 — O que Faltava nos Documentos Originais

Após validação e pesquisa, identificamos lacunas que precisam ser cobertas:

### 4.1 Segurança desde o início

Os documentos originais mencionam segurança apenas no CI/CD (Fase 7). Isso é tarde demais.

**Adicionar na Fase 2 (Planejamento):**
- Definir modelo de autenticação (JWT, sessions, OAuth)
- Identificar dados sensíveis e como serão armazenados (hashing, encryption)
- Definir política de CORS
- Planejar rate limiting em endpoints públicos

**Adicionar na Fase 3 (Testes):**
- Testes de autorização para cada endpoint (quem pode acessar o quê)
- Testes de input sanitization (SQL injection, XSS)
- Testes de rate limiting

### 4.2 Observabilidade

Nenhum dos documentos menciona logging estruturado ou monitoramento.

**Adicionar na Fase 5 ou antes:**
- Logging estruturado (JSON) com correlation IDs
- Health checks para cada serviço
- Métricas básicas (latência, taxa de erro, uptime)
- Alertas para erros críticos (Sentry ou similar)

### 4.3 Gestão de Migrações de Banco

O template menciona `db:migrate` mas não detalha estratégia.

**Adicionar:**
- Toda alteração de schema via migration versionada (nunca manualmente)
- Migrations devem ser reversíveis (up + down)
- Seed data separado de migrations
- Em produção: sempre backup antes de migration

### 4.4 Tratamento de Falhas de Serviços Externos

Os testes de integração mencionam "timeout/falha de serviço externo" mas não há orientação sobre implementação.

**Adicionar:**
- Circuit breaker para APIs externas
- Retry com backoff exponencial
- Fallbacks quando serviço externo está indisponível
- Timeouts explícitos em toda chamada HTTP externa

### 4.5 Documentação de API

O template do CLAUDE.md pede "endpoints" mas não detalha formato.

**Adicionar para cada endpoint:**
- Método + rota (GET /api/users/:id)
- Headers obrigatórios (Authorization, Content-Type)
- Body de request com exemplo JSON
- Respostas possíveis (200, 400, 401, 404, 500) com exemplo de body
- Query parameters quando aplicável

### 4.6 Estratégia de Branching para IA

O documento menciona branches (main, develop, feature, fix) mas não orienta como o agente deve usá-las.

**Adicionar:**
- Agente trabalha em branch `feature/nome` — nunca diretamente na main
- Commit on green (a cada teste que passa, commit)
- PR para merge — mesmo quando o "reviewer" é o próprio dev
- Mensagens de commit no formato conventional commits: `tipo(escopo): descrição`

### 4.7 Limites de Escopo por Sessão

O documento não orienta sobre quanto fazer por sessão de trabalho com o agente.

**Adicionar:**
- Uma feature por sessão de trabalho (não tente fazer 5 de uma vez)
- Se a sessão ficar longa: salve estado no CLAUDE.md antes de trocar de contexto
- Ao retomar: peça ao agente para reler CLAUDE.md e rodar testes para verificar estado
- Se o agente perder o fio da meada: não force — inicie sessão nova com contexto limpo

### 4.8 Quando NÃO Usar Este Workflow

Os documentos não definem limites.

**Este workflow é para:**
- Projetos novos (greenfield)
- MVPs com 3-5 features
- Devs que querem aprender com disciplina
- Equipes pequenas (1-3 pessoas + IA)

**Não é ideal para:**
- Manutenção de sistemas legados (adapte apenas as fases relevantes)
- Projetos com prazo de 24h (use versão ultracompacta: CLAUDE.md mínimo + testes das regras críticas + implementação)
- Features únicas e isoladas em projetos existentes (use TDD direto, sem o workflow completo)

### 4.9 Qualidade do Codebase Importa para IA

O estudo "Code for Machines, Not Just Humans" (2025) com 5.000 programas e 6 LLMs demonstrou que LLMs têm performance consistentemente melhor em codebases saudáveis. O risco de defeitos em código de baixa qualidade é 30% maior — e essa relação é não-linear (piora exponencialmente em código legado).

**Implicação prática:** Mantenha o código limpo conforme avança. A Fase 5 (Refatoração) não é opcional — é investimento em produtividade futura com IA.

---

## Resumo: Os 12 Mandamentos

1. **Planeje antes de codar.** O CLAUDE.md é seu contrato com o agente.
2. **Teste antes de implementar.** TDD é a forma mais eficaz de direcionar agentes de IA.
3. **Uma coisa de cada vez.** Uma fase, uma feature, uma sessão.
4. **Justifique cada decisão.** Se não há razão documentada, não houve decisão — houve acidente.
5. **Nunca edite manualmente o que a IA errou.** Explique, documente, peça correção.
6. **Versões exatas, sempre.** "Latest" é uma bomba-relógio.
7. **Segurança desde o dia 1.** Não é feature de sprint final.
8. **Testes são especificação.** Não são burocracia — são o contrato do que o software deve fazer.
9. **Refatoração não é opcional.** Código limpo faz a IA render mais.
10. **Git é estado.** Commit on green, branch por feature, mensagens descritivas.
11. **O CLAUDE.md é memória viva.** Leia no início, atualize no final.
12. **Escopo controlado.** 3-5 features no MVP. Mais que isso é desperdício.

---

## Fontes de Validação

1. Workshop Agile Manifesto 25 anos — TDD e agentes de IA (The Register, Fev 2026)
2. Simon Willison — Red/Green TDD - Agentic Engineering Patterns (Fev 2026)
3. Martin Fowler — Fragments: TDD e AI coding (Fev 2026)
4. DORA Report 2025 — IA como amplificador de práticas existentes
5. "Code for Machines, Not Just Humans" — estudo com 5.000 programas e 6 LLMs
6. Anthropic — Prompting Best Practices Claude 4.x (docs.anthropic.com)
7. GitHub Spec Kit — Specification-Driven Development (Set 2025)
8. QASkills — TDD with AI Agents Best Practices (Fev 2026)
9. Eric Elliott — Better AI Driven Development with TDD (Medium, 2025)
10. Builder.io — Test-Driven Development with AI (2025)
