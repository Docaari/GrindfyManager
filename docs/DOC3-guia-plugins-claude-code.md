# Guia de Plugins para Claude Code
## Tudo que você precisa saber para montar seu ambiente de desenvolvimento

*Snapshot original: Março 2026 — Última revisão de dados: Maio 2026*

> **Aviso importante:** as contagens de instalações listadas na maior parte deste documento são snapshot de Março 2026. O ecossistema de plugins muda toda semana. **Para os números mais recentes confira a tabela "Atualização Mai/2026" logo abaixo e [claude.com/plugins](https://claude.com/plugins) antes de instalar.**

---

## Atualização Maio 2026 — O que mudou em 2 meses

Esta seção foi adicionada na revisão de Mai/2026. As contagens explodiram em vários plugins (CLAUDE.md Management saiu de 1.4k → 205k em 2 meses) — sinal de que o ecossistema está em curva de adoção acelerada.

### Top 10 plugins por instalações (Mai/2026)

| # | Plugin | Installs | Selo | O que faz |
|---|---|---|---|---|
| 1 | **Frontend Design** | 760k | Anthropic Verified | Frontends production-grade com design diferenciado |
| 2 | **Superpowers** | 681k | Comunidade | Brainstorming + subagentes + code review + TDD + skill authoring |
| 3 | **Context7** | 328k | Community-managed | Docs versionadas em tempo real (MCP da Upstash) |
| 4 | **Code Review** | 322k | Anthropic Verified | Review automático de PRs com agentes especializados |
| 5 | **Code Simplifier** | 265k | Anthropic Verified | Refina código recém-modificado preservando comportamento |
| 6 | **Skill Creator** | 256k | Anthropic Verified | Cria, melhora e mede skills |
| 7 | **GitHub** | 246k | Oficial | MCP do GitHub para gestão completa de repos |
| 8 | **Playwright** | 230k | Microsoft | Automação de browser e testes E2E |
| 9 | **Feature Dev** | 206k | Anthropic Verified | Workflow guiado de desenvolvimento de feature |
| 10 | **CLAUDE.md Management** | 205k | Anthropic Verified | Mantém e mede qualidade dos CLAUDE.md (era 1.4k em Mar/2026!) |

### Plugins novos relevantes para SaaS (Mar→Mai/2026)

**Backend e data:** `convex-backend`, `clickhouse` (+ `clickhouse-best-practices`), `cockroachdb`, `alloydb`, `cloud-sql-postgresql`, `astronomer-data-agents`, `datahub-skills`.

**Infra e deploy:** `aws-core`, `aws-serverless`, `aws-dev-toolkit` (34 skills, 11 agents, 3 MCP), `deploy-on-aws`, `azure` (50+ serviços), `cloudflare`.

**Segurança (categoria que mais cresceu):** `42crunch-api-security-testing`, `aikido` (SAST + secrets + IaC), `ai-plugins` da Endor Labs.

**Qualidade/testes:** `coderabbit`, `codspeed` (benchmarking + flamegraphs).

**DevTools:** `chrome-devtools-mcp` (debug visual integrado).

### Mudanças de comando e manifesto (importante)

- `/extra-usage` foi renomeado para **`/usage-credits`** na v2.1.144. O alias antigo ainda funciona, mas será descontinuado.
- Manifestos de plugin devem mover `themes` e `monitors` para `"experimental": {…}` desde v2.1.129 — atualize seu plugin se for autor.
- Output style "Explanatory" segue descontinuado (use o plugin `explanatory-output-style` como substituto).

### Plugins descontinuados (Mar→Mai/2026)

Nenhum plugin individual foi marcado como deprecated na marketplace oficial nesse intervalo. O ecossistema cresceu, ninguém saiu.

### Stack de produção real (caso de estudo Mai/2026)

Um projeto SaaS em produção (analytics de domínio especializado, Node + React, ~8.500 testes verdes server-side) declara em `.claude/settings.json` esta combinação de 5 plugins:

| Plugin | Por que está nessa stack |
|---|---|
| **Caveman** | Workflow customizado de desenvolvimento. Não documentado no topo do ranking — vale investigar |
| **hookify** | Hooks customizados via markdown. Anthropic Verified, 12k+ installs (Mar/2026) |
| **claude-md-management** | Manter qualidade do CLAUDE.md em projeto que já tem 40KB de manual — escolha alinhada |
| **code-simplifier** | Roda após cada feature antes do commit. Combate complexidade acidental |
| **session-report** | Plugin que ainda não está no top 10 — gera relatório da sessão para acompanhamento. Vale ficar de olho |

**Lição prática:** stacks reais raramente são "todos os plugins do topo do ranking". São 4-6 plugins que cobrem o workflow específico do time. Mais que 6 vira ruído e custo de tokens (cada MCP consome contexto ao iniciar). Comece com 2-3 e adicione conforme dor real.

---

## Conteúdo histórico (snapshot Mar/2026)

> A partir daqui, as contagens são de Mar/2026 — preserve como contexto histórico. Para números atualizados consulte a tabela acima.

---

## Antes de Tudo: Entenda o Ecossistema

Existem três peças que se encaixam no Claude Code. É importante não confundi-las:

**Skill** = receita. Ensina o Claude a fazer algo. Funciona em todo lugar (claude.ai, API, Claude Code).

**Plugin** = eletrodoméstico. Pacote instalável que pode conter skills, comandos, agentes, hooks e conexões MCP. Funciona apenas no Claude Code.

**MCP (Model Context Protocol)** = ingredientes externos. Conecta o Claude a ferramentas e dados de fora — GitHub, bancos de dados, Slack, APIs. Funciona em Claude Code, API e claude.ai (conectores).

Um plugin pode conter tudo isso junto. Quando você instala um plugin, ele pode trazer skills, configurar MCPs e adicionar comandos automaticamente.

### Como instalar um plugin

No terminal do Claude Code:
```
/plugin install nome-do-plugin@claude-plugins-official
```

Ou diretamente de um repositório GitHub:
```
/plugin install usuario/repositorio
```

### Aviso importante

Plugins são criados pela comunidade. A Anthropic faz uma revisão básica, e plugins com selo "Anthropic Verified" passam por revisão adicional de qualidade e segurança. Mesmo assim, sempre revise o conteúdo de um plugin antes de instalar — especialmente se ele configura MCP servers ou executa scripts.

---

## Plugins por Área

---

### 1. Qualidade de Código e Review

Estes plugins são os que mais impactam a qualidade do que você entrega.

**Code Review** — Anthropic Verified — 57k installs
O que faz: Review automático de PRs usando agentes especializados com scoring baseado em confiança. Só sinaliza issues com score acima de 80, reduzindo falsos positivos.
Comando: `/code-review`
Por que usar: Pega bugs, vulnerabilidades e problemas de padrão antes do merge. Roda 5 agentes em paralelo (CLAUDE.md compliance, detecção de bugs, contexto histórico, histórico de PRs, comentários de código).
Custo: Alto — usa 5 agentes em paralelo. Esteja preparado para consumo elevado de tokens.

**PR Review Toolkit** — Anthropic Verified — 24k installs
O que faz: Conjunto de agentes para review de PRs cobrindo comentários, testes, erros, types, qualidade e simplificação.
Por que usar: Mais granular que o Code Review — permite escolher quais aspectos revisar.

**Code Simplifier** — Anthropic Verified — 39k installs
O que faz: Agente de clareza de código. Simplifica e refina código recém-modificado preservando funcionalidade e consistência.
Por que usar: Combate complexidade acidental. Rode depois de implementar uma feature para limpar o código antes do commit.

**Security Guidance** — Anthropic Verified — 32k installs
O que faz: Hook que monitora 9 padrões de segurança enquanto você edita — command injection, XSS, eval, HTML perigoso, pickle deserialization, os.system.
Por que usar: Funciona como um linter de segurança em tempo real. Previne vulnerabilidades no momento da escrita, não depois.

---

### 2. Desenvolvimento de Features

Plugins que aceleram o ciclo de construção de funcionalidades novas.

**Feature Dev** — Anthropic Verified — 55k installs
O que faz: Workflow guiado de desenvolvimento de features com 3 agentes: code-explorer (análise do codebase), code-architect (design de arquitetura) e code-reviewer (review de qualidade).
Comando: `/feature-dev`
Por que usar: Transforma o Claude de "assistente que responde perguntas" em "engenheiro que desenvolve features completas" com exploração, design e revisão.

**Ralph Loop** — Anthropic Verified — 38k installs
O que faz: Loops interativos de IA para desenvolvimento iterativo. O Claude trabalha na mesma tarefa repetidamente, vendo o trabalho anterior, até completar.
Comandos: `/ralph-loop`, `/cancel-ralph`
Por que usar: Para tarefas que precisam de múltiplas iterações até ficarem certas — visual testing, refinamento de UI, debug complexo.
Custo: Pode ser muito alto. Há relatos de usuários que consumiram toda a quota do plano de $20 em um único loop.

**Frontend Design** — Anthropic Verified — 120k installs
O que faz: Skill auto-invocada para trabalho de frontend. Orienta escolhas de design ousadas, tipografia, animações e detalhes visuais. Gera código polido que evita estéticas genéricas de IA.
Por que usar: O plugin mais instalado do ecossistema. Transforma o output de "template Bootstrap genérico" para "interface com personalidade e qualidade de produção".

---

### 3. Inteligência de Código e LSPs

Language Server Protocols dão ao Claude entendimento profundo do código — tipos, erros, refactoring.

**TypeScript LSP** — Anthropic Verified — 40k installs
O que faz: Language server TypeScript/JavaScript para inteligência avançada de código.
Por que usar: O Claude passa a entender tipos, interfaces, erros de compilação e sugestões de refactoring do seu projeto TS/JS em tempo real.

**Pyright LSP** — Anthropic Verified — 21k installs
O que faz: Language server Python (Pyright) para type checking e inteligência de código.
Por que usar: Essencial para projetos Python. Dá ao Claude visão real dos tipos e erros do seu código.

**Serena** — 38k installs
O que faz: Servidor MCP de análise semântica de código. Entende código via Language Server Protocol para navegação, refactoring e compreensão inteligente.
Por que usar: Vai além dos LSPs individuais — análise semântica cross-linguagem para entender dependências e arquitetura.

Outros LSPs disponíveis por linguagem: **Go (gopls)** 8k, **C#** 7k, **Rust Analyzer** 6k, **PHP (Intelephense)** 5k, **Java (Eclipse JDT.LS)** 5k, **Swift (SourceKit-LSP)** 5k, **Lua** 3k, **Kotlin** 2k.

---

### 4. Repositório e Versionamento

Plugins que conectam o Claude ao seu fluxo de Git e gestão de código.

**GitHub** — 57k installs
O que faz: MCP server oficial do GitHub. Cria issues, gerencia PRs, faz review de código, busca em repos e acessa toda a API do GitHub.
Por que usar: Indispensável se seu código vive no GitHub. O Claude pode criar PRs, responder issues e navegar pelo histórico do repo diretamente.

**GitLab** — 7k installs
O que faz: Integração com GitLab para repos, merge requests, pipelines CI/CD, issues e wikis.
Por que usar: A mesma utilidade do plugin GitHub, mas para quem usa GitLab.

**Commit Commands** — Anthropic Verified — 36k installs
O que faz: Comandos para workflows de git commit incluindo commit, push e criação de PR.
Por que usar: Padroniza o fluxo de commit. Mensagens consistentes, push automatizado e PRs criados sem sair do Claude.

---

### 5. Documentação e Contexto

Plugins que garantem que o Claude saiba o que está acontecendo — no seu projeto e nas libs que usa.

**Context7** — 83k installs
O que faz: MCP server da Upstash para busca de documentação em tempo real. Puxa docs e exemplos de código versionados direto dos repositórios fonte.
Por que usar: Segundo plugin mais instalado. Resolve o problema de "documentação desatualizada no treinamento". O Claude consulta a doc mais recente de qualquer biblioteca antes de escrever código.

**CLAUDE.md Management** — Anthropic Verified — 1.4k installs
O que faz: Ferramentas para manter o CLAUDE.md — auditar qualidade, capturar aprendizados e manter a memória do projeto atualizada.
Por que usar: O CLAUDE.md é o "manual do projeto" que o Claude lê ao iniciar cada sessão. Este plugin ajuda a mantê-lo útil e atualizado.

**Explanatory Output Style** — Anthropic Verified — 14k installs
O que faz: Adiciona insights educacionais sobre escolhas de implementação e padrões do codebase. Replica o estilo "Explanatory" que foi descontinuado.
Por que usar: O Claude não só escreve código — explica por que escolheu aquela abordagem. Excelente para aprendizado e onboarding.

---

### 6. Backend e Infraestrutura

Plugins para conectar o Claude ao seu stack de backend e deploy.

**Supabase** — 23k installs
O que faz: MCP completo para Supabase — operações de banco, auth, storage, real-time. Gerencia projetos, roda SQL e interage com seu backend.
Por que usar: Se seu backend é Supabase, o Claude pode consultar dados, modificar schemas e debuggar queries diretamente.

**Firebase** — 5k installs
O que faz: MCP para Firebase — Firestore, auth, functions, hosting e storage.
Por que usar: O mesmo que Supabase, para quem usa o ecossistema Google.

**Vercel** — 9k installs
O que faz: Integração para gerenciar deployments, builds, logs, domínios e infra frontend.
Por que usar: Deploy direto do Claude. Verificar logs de build, status de deployment e configurar domínios sem sair do terminal.

**Stripe** — 6k installs
O que faz: Plugin de desenvolvimento para integração com Stripe.
Por que usar: Facilita implementação de pagamentos, consulta de transações e testes de webhooks.

**Laravel Boost** — 7k installs
O que faz: MCP server para comandos Artisan, queries Eloquent, routing, migrations e geração de código específica do framework.
Por que usar: Se seu backend é Laravel, este plugin transforma o Claude em um especialista no framework.

---

### 7. Design e Frontend Avançado

Plugins para quem trabalha com interface e design.

**Figma** — 21k installs
O que faz: Integração com Figma — acessa arquivos de design, extrai componentes, lê tokens e traduz para código. Conecta design e desenvolvimento.
Por que usar: O Claude pode ler seus designs no Figma e gerar código que corresponde ao layout, cores e componentes definidos pelo designer.

**Hugging Face Skills** — 3k installs
O que faz: Construir, treinar, avaliar e usar modelos open source de IA, datasets e spaces.
Por que usar: Para projetos que integram modelos de ML — o Claude pode buscar e testar modelos diretamente do Hugging Face.

---

### 8. Gestão de Projetos e Comunicação

Plugins que conectam o Claude ao fluxo de trabalho da equipe.

**Atlassian** — 19k installs
O que faz: Conecta a Jira e Confluence. Busca e cria issues, acessa docs, gerencia sprints e integra workflows de desenvolvimento.
Por que usar: O Claude pode ler tickets do Jira para entender o contexto de uma tarefa antes de começar a implementar.

**Linear** — 11k installs
O que faz: Cria issues, gerencia projetos, atualiza status e busca no workspace.
Por que usar: Alternativa ao Atlassian para quem usa Linear. Mesmo benefício — contexto direto da gestão de projeto.

**Asana** — 2k installs
O que faz: Cria e gerencia tasks, busca projetos, atualiza atribuições e acompanha progresso.
Por que usar: Para equipes que usam Asana como ferramenta de gestão.

**Slack** — 8k installs
O que faz: Busca mensagens, acessa canais, lê threads e mantém conexão com a comunicação da equipe enquanto codifica.
Por que usar: O Claude pode buscar contexto de discussões no Slack relevantes para a tarefa atual.

**Circleback** — 1.1k installs
O que faz: Integração de contexto conversacional. Busca e acessa reuniões, emails, eventos de calendário.
Por que usar: O Claude pode consultar o que foi decidido em reuniões recentes antes de implementar algo.

---

### 9. Monitoramento e Debug

Plugins para quando as coisas dão errado em produção.

**Sentry** — 8k installs
O que faz: Acessa relatórios de erro, analisa stack traces, busca issues e debugga erros de produção.
Por que usar: O Claude pode ler erros do Sentry e sugerir correções baseadas no stack trace real — não em suposições.

**Playwright** — 36k installs
O que faz: MCP server da Microsoft para automação de browser e testes end-to-end. O Claude pode interagir com páginas web, tirar screenshots, preencher formulários e automatizar fluxos de teste.
Por que usar: Essencial para testes de interface. O Claude pode verificar visualmente se a UI está funcionando corretamente.

---

### 10. Workflow e Produtividade

Plugins que melhoram como o Claude trabalha, não o que ele faz.

**Superpowers** — 18k installs
O que faz: Framework de lifecycle — brainstorming, desenvolvimento de subagentes com review, debugging, TDD e criação de skills.
Por que usar: Meta-plugin. Ensina o Claude a trabalhar melhor em todas as áreas. Especialmente útil para quem está criando skills e agentes customizados.

**Hookify** — Anthropic Verified — 12k installs
O que faz: Cria hooks customizados via markdown para prevenir comportamentos indesejados a partir de padrões de conversa ou instruções explícitas.
Por que usar: Se o Claude tem algum comportamento que te incomoda repetidamente, você pode criar um hook para corrigi-lo automaticamente.

**Plugin Developer Toolkit** — Anthropic Verified — 14k installs
O que faz: 7 skills especializadas para desenvolvimento de plugins — hooks, MCP, comandos, agentes, validação e boas práticas.
Por que usar: Se você vai criar seus próprios plugins, este é o ponto de partida.

**Claude Code Setup** — Anthropic Verified — 1.1k installs
O que faz: Analisa codebases e recomenda automações sob medida — hooks, skills, MCP servers e subagentes.
Por que usar: Não sabe por onde começar? Este plugin examina seu projeto e sugere o que instalar.

---

### 11. Agentes e Orquestração Avançada

Para workflows complexos com múltiplos agentes trabalhando juntos.

**Agent SDK Dev** — Anthropic Verified — 21k installs
O que faz: Kit de desenvolvimento para trabalhar com o Claude Agent SDK. Inclui setup interativo e verificadores para Python e TypeScript.
Por que usar: Para quem está construindo agentes customizados com o SDK oficial da Anthropic.

**Greptile** — 12k installs
O que faz: Busca inteligente de codebase com IA. Consulta repositórios em linguagem natural para encontrar código, entender dependências e explorar arquitetura.
Por que usar: Para codebases grandes onde "grep" não basta. O Claude pode fazer perguntas como "onde é implementada a lógica de autenticação?" e receber respostas precisas.

---

## Stacks Recomendados

### Stack Mínimo (para começar)
- **Context7** — docs sempre atualizadas
- **GitHub** — gestão de repos
- **Security Guidance** — segurança passiva

### Stack para Dev Solo
Stack Mínimo +
- **Feature Dev** — workflow de features
- **Code Review** — review antes do merge
- **Commit Commands** — git padronizado
- **LSP da sua linguagem** — inteligência de código

### Stack para Equipe
Stack Dev Solo +
- **Atlassian** ou **Linear** — gestão de projeto
- **Slack** — contexto de comunicação
- **Sentry** — monitoramento
- **Playwright** — testes de interface
- **CLAUDE.md Management** — memória do projeto

### Stack Full (projeto complexo)
Stack Equipe +
- **Superpowers** — meta-workflows
- **Figma** — design-to-code
- **Supabase** ou **Firebase** — backend
- **Vercel** — deploy
- **Hookify** — customização de comportamento

---

## Dicas Importantes

**Sobre consumo de tokens:** Cada MCP server consome tokens ao iniciar a sessão. Um setup com 5 servers e 58 ferramentas pode consumir ~55.000 tokens antes de qualquer conversa. O Tool Search do Claude reduz isso em 85% carregando ferramentas sob demanda, mas esteja consciente do custo.

**Menos é mais:** A recomendação prática é 2-3 MCP servers + algumas skills customizadas. Não instale tudo — instale o que seu workflow realmente precisa.

**Plugins não são skills:** Um plugin pode até conter skills, mas a diferença fundamental é que plugins adicionam ferramentas (ações que o Claude pode executar), enquanto skills adicionam conhecimento (instruções sobre como fazer algo). Ambos se complementam.

**Sobre o claude-mem:** Este plugin (18k stars) promete memória persistente entre sessões. O conceito é interessante, mas o projeto está vinculado a um token crypto ($CMEM), o que levanta questões de confiabilidade. Para memória persistente, considere usar o CLAUDE.md nativo + o plugin CLAUDE.md Management, ou o Memory Tool oficial do Claude.

**Skills funcionam em todo lugar:** Se você criar uma skill, ela funciona no claude.ai, na API e no Claude Code. Se você criar um plugin, ele só funciona no Claude Code. Pense nisso ao decidir o que criar.

---

*Este documento é um snapshot de Março 2026. O ecossistema de plugins evolui rapidamente — novos plugins aparecem toda semana. Consulte [claude.com/plugins](https://claude.com/plugins) para a lista mais atualizada.*
