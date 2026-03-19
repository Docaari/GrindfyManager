# Arquitetura de Agentes para Desenvolvimento de SaaS
## Quais agentes usar, quando, e como orquestrar

*Março 2026*
*Fontes: Documentação oficial Anthropic, Simon Willison, Addy Osmani, PubNub Engineering, Heeki Park, Claudio Novaglio, workshop Agile Manifesto 2026, e experiências documentadas de produção.*

---

## O Mapa Completo

Existem três formas de usar agentes no Claude Code. Cada uma resolve um problema diferente:

**Sessão única (você + 1 Claude)** — O dev conversa com um Claude Code em um terminal. O Claude pode internamente spawnar subagentes para tarefas pontuais, mas o dev interage com uma sessão só.

**Subagentes** — Trabalhadores focados que operam dentro da sessão principal. Fazem uma tarefa, retornam o resultado, e desaparecem. Não conversam entre si. Como um entregador: faz a entrega e volta.

**Agent Teams** — Múltiplas instâncias independentes de Claude trabalhando em paralelo, cada uma com seu próprio contexto. Compartilham uma lista de tarefas, comunicam-se entre si, e podem ser observadas e redirecionadas individualmente. Como uma equipe de engenharia: cada um tem seu papel, mas conversam quando precisam.

A pergunta que decide qual usar: **seus trabalhadores precisam se comunicar entre si?**

- Não → Subagentes
- Sim → Agent Teams
- A tarefa é simples → Sessão única

---

## Quando Usar o Quê

### Sessão Única (80% do trabalho de um dev solo)

Use para a grande maioria das tarefas do dia a dia. Um Claude Code bem instrumentado com CLAUDE.md, skills e MCPs cobre:

- Implementar uma feature seguindo TDD
- Debuggar um problema isolado
- Refatorar um módulo
- Escrever testes para uma funcionalidade
- Revisar e melhorar código existente
- Configurar CI/CD
- Escrever documentação

A Anthropic documenta que Claude 4.x tem capacidade de raciocínio de longo horizonte com tracking de estado excepcional. Para a maioria das tarefas de um SaaS em construção, uma sessão é suficiente.

### Subagentes (Delegação pontual sem coordenação)

Use quando precisa de foco isolado em uma subtarefa que não requer comunicação com outras. O subagente opera em seu próprio contexto, preservando o contexto principal limpo.

**Casos ideais:**
- Pesquisa no codebase ("encontre todos os lugares que usam esta função")
- Análise de um subsistema ("resuma como o módulo de auth funciona")
- Verificação de impacto ("esta mudança quebraria algum contrato existente?")
- Geração de testes para uma feature específica
- Review de segurança de um arquivo

**Custo:** 4-7x mais tokens que sessão única (documentado pela Anthropic). Mas 90%+ dos tokens são leituras de cache a custo reduzido.

**Regra prática (validada por ksred.com):** Use subagentes para tarefas read-heavy e bounded, com output claro e definido. Mantenha a sessão principal para trabalho que requer contexto cross-cutting e sustentado.

**Subagentes built-in do Claude Code:**
- **Explore** — Roda em Haiku (rápido, read-only). Para "onde está X?" ou "encontre todos os arquivos que importam Y"
- **Plan** — Herda o modelo principal. Escaneia o codebase e retorna resumo destilado para planejamento
- **General-purpose** — Acesso total a ferramentas. Lê, escreve, executa

### Agent Teams (Colaboração real entre agentes)

Use quando a tarefa tem componentes distintos que precisam se comunicar. Cada teammate é uma instância completa de Claude com seu próprio contexto de 1M tokens.

**Casos ideais (documentados pela Anthropic):**
- Cross-layer: mudanças que tocam frontend, backend e testes simultaneamente
- Debate e consenso: agentes argumentam posições diferentes sobre decisão arquitetural
- Inventário em larga escala: dividir dataset grande entre agentes
- Feature completa: um agente no backend, um no frontend, um nos testes

**Quando NÃO usar:**
- Tarefas sequenciais (uma depende da outra linearmente)
- Edições no mesmo arquivo (conflitos de merge)
- Trabalho com muitas dependências cruzadas
- Tarefas simples que um agente resolve sozinho

**Custo:** ~15x o uso de tokens de uma sessão única (documentado pela Anthropic). Um time de 3 agentes usa 3-4x os tokens de fazer o mesmo trabalho sequencialmente, mas o tempo cai de horas para minutos.

**Configuração:**
- Requer Claude Opus 4.6 (Pro $20/mês ou Max $100-200/mês)
- Feature experimental: habilitar em settings.json
- tmux recomendado para visualizar cada agente em seu painel

**Regra de ouro:** 3-5 teammates é o sweet spot. Comece com 3. Escale só quando o trabalho genuinamente se beneficia de paralelismo. Três agentes focados superam cinco dispersos.

---

## A Equipe de Agentes para um SaaS

Baseado na pesquisa de PubNub Engineering, Heeki Park, Claudio Novaglio, e práticas documentadas, esta é a arquitetura recomendada de agentes para construir um SaaS de ponta a ponta:

### Agentes Customizados (definidos em .claude/agents/)

Cada agente é um arquivo Markdown com YAML frontmatter. O Claude Code os descobre automaticamente e pode invocá-los por nome ou delegação.

---

#### 1. PM-Spec (Product Manager)

**Papel:** Transforma ideias vagas em especificações estruturadas.

**Quando é invocado:** Início de cada feature nova. Antes de qualquer código.

**Ferramentas permitidas:** Read-only. Busca, docs via MCP. Sem escrita de código.

**O que faz:**
- Gera documento de especificação com: resumo, contexto, requisitos (cada um com lista de comportamentos esperados), notas de implementação, critérios de aceitação, itens fora de escopo
- Faz perguntas de clarificação ao dev
- Escreve o output em arquivo local para review humano antes de submeter

**Arquivo:** `.claude/agents/pm-spec.md`

```yaml
---
name: pm-spec
description: "Gera especificações estruturadas de features a partir de descrições de alto nível. Invoque ao iniciar qualquer feature nova."
allowed-tools: [Read, Glob, Grep, WebSearch]
---
```

---

#### 2. Architect (Arquiteto)

**Papel:** Valida design contra constraints do projeto. Produz ADR (Architecture Decision Record).

**Quando é invocado:** Após spec aprovada, antes de testes.

**Ferramentas permitidas:** Read-only + busca de docs. Sem escrita de código.

**O que faz:**
- Lê a spec e o CLAUDE.md
- Verifica se o design respeita padrões existentes
- Identifica impacto em outros módulos
- Produz ADR com: contexto, decisão, consequências, alternativas consideradas
- Sinaliza riscos de segurança e performance

**Arquivo:** `.claude/agents/architect.md`

```yaml
---
name: architect
description: "Revisa especificações e produz decisões de arquitetura (ADRs). Invoque após spec aprovada para validar design antes de implementação."
allowed-tools: [Read, Glob, Grep, WebSearch, MCP]
---
```

---

#### 3. Test-Writer (Escritor de Testes)

**Papel:** Escreve testes baseados na spec. Nunca implementa.

**Quando é invocado:** Após arquitetura aprovada. Fase Red do TDD.

**Ferramentas permitidas:** Read + Write (apenas em diretórios de teste).

**O que faz:**
- Lê spec e ADR
- Escreve testes unitários + integração
- Usa mocks para dependências inexistentes
- Cobre: happy path, inputs inválidos, duplicatas, limites, auth, not found
- Garante que todos os testes falham (red phase)

**Arquivo:** `.claude/agents/test-writer.md`

```yaml
---
name: test-writer
description: "Escreve testes TDD baseados em especificações. Nunca implementa funcionalidade. Invoque na fase de testes de cada feature."
allowed-tools: [Read, Write, Glob, Grep, Bash]
---
```

---

#### 4. Implementer (Implementador)

**Papel:** Implementa código para fazer testes passarem. Nada mais.

**Quando é invocado:** Após testes escritos e validados. Fase Green do TDD.

**Ferramentas permitidas:** Acesso total (Read, Write, Bash, MCP).

**O que faz:**
- Lê testes existentes
- Implementa o mínimo necessário para testes passarem
- Roda testes após cada implementação
- Não inventa features além do que os testes pedem
- Não modifica testes existentes

**Arquivo:** `.claude/agents/implementer.md`

```yaml
---
name: implementer
description: "Implementa código para fazer testes passarem. Nunca modifica testes. Nunca adiciona funcionalidade além do especificado. Invoque na fase de implementação."
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, MCP]
---
```

---

#### 5. Reviewer (Revisor)

**Papel:** Revisa código produzido por outros agentes. Encontra bugs, vulnerabilidades e violações de padrão.

**Quando é invocado:** Após implementação, antes de merge.

**Ferramentas permitidas:** Read-only.

**O que faz:**
- Revisa diff do PR/commit
- Verifica: bugs, vulnerabilidades (OWASP), performance, aderência a padrões do CLAUDE.md
- Pontua issues por severidade (critical, high, medium, low)
- Só sinaliza issues com confiança alta (evita falsos positivos)

**Arquivo:** `.claude/agents/reviewer.md`

```yaml
---
name: reviewer
description: "Revisa código para bugs, segurança, performance e padrões. Invoque antes de merge de qualquer feature."
allowed-tools: [Read, Glob, Grep]
---
```

---

#### 6. Deployer (Deploy)

**Papel:** Executa pipeline de deploy com checklist de verificação.

**Quando é invocado:** Quando todos os testes passam e review está aprovado.

**Ferramentas permitidas:** Apenas o necessário para build e deploy.

**O que faz:**
- Roda lint, testes, análise de vulnerabilidades
- Executa build
- Faz deploy para ambiente alvo
- Verifica health check pós-deploy
- Reporta status

**Arquivo:** `.claude/agents/deployer.md`

```yaml
---
name: deployer
description: "Executa pipeline de deploy com verificações de qualidade. Invoque quando feature está pronta para produção."
allowed-tools: [Read, Bash, Glob]
---
```

---

## Pipeline: Como os Agentes se Encadeiam

O fluxo segue a sequência validada pelo workshop Agile Manifesto 2026 e pelo GitHub Spec Kit:

```
                    ┌──────────────────────────────────────────┐
                    │            DEV (Você)                     │
                    │  Decide o quê, valida cada transição      │
                    └──────────┬───────────────────────────────┘
                               │
                    ┌──────────▼───────────┐
                    │   1. PM-Spec          │  ← Spec da feature
                    │   (read-only)         │
                    └──────────┬───────────┘
                               │ review humano
                    ┌──────────▼───────────┐
                    │   2. Architect        │  ← ADR + validação
                    │   (read-only)         │
                    └──────────┬───────────┘
                               │ review humano
                    ┌──────────▼───────────┐
                    │   3. Test-Writer      │  ← Testes (red)
                    │   (write em /tests)   │
                    └──────────┬───────────┘
                               │ review humano
                    ┌──────────▼───────────┐
                    │   4. Implementer      │  ← Código (green)
                    │   (acesso total)      │
                    └──────────┬───────────┘
                               │ testes passam?
                    ┌──────────▼───────────┐
                    │   5. Reviewer         │  ← Review
                    │   (read-only)         │
                    └──────────┬───────────┘
                               │ aprovado?
                    ┌──────────▼───────────┐
                    │   6. Deployer         │  ← Deploy
                    │   (bash limitado)     │
                    └──────────────────────┘
```

**O dev está no loop em cada transição.** Nenhum agente avança para a próxima fase sem aprovação humana. Isso é intencional — é o que o PubNub Engineering chama de "human-in-the-loop (HITL)".

**Automação via hooks:** Registre um hook `SubagentStop` que lê uma fila e sugere o próximo comando. O dev aprova e o próximo agente é invocado. Isso mantém o fluxo sem perder controle.

---

## Quando Usar Agent Teams no Fluxo

Agent Teams não substituem o pipeline acima. Eles se encaixam **dentro** de fases específicas quando o trabalho é paralelizável:

### Cenário 1 — Feature cross-layer (mais comum)

Quando uma feature toca backend, frontend e testes simultaneamente:

```
"Crie um Agent Team para a feature 'Team Settings':
- Teammate 1 (Backend): API CRUD em /api/teams/:id/settings
- Teammate 2 (Frontend): Componente React em /src/pages/TeamSettings.tsx
- Teammate 3 (Testes): Testes de integração para os endpoints"
```

Cada agente trabalha em sua camada. Quando o agente de backend define o contrato da API, comunica ao de frontend e testes.

### Cenário 2 — Code review multi-perspectiva

```
"Monte um team de review para este PR:
- Teammate 1: Review de segurança (OWASP top 10)
- Teammate 2: Review de performance (queries, N+1, caching)
- Teammate 3: Review de conformidade (padrões do CLAUDE.md)"
```

### Cenário 3 — Refatoração em larga escala

Quando precisa refatorar algo que toca muitos módulos:

```
"Equipe para renomear 'userId' para 'accountId' em todo o sistema:
- Teammate 1: Backend (models, services, controllers)
- Teammate 2: Frontend (components, hooks, API calls)
- Teammate 3: Testes (atualizar todos os testes afetados)"
```

### Quando NÃO usar Agent Teams

- **Feature simples** que cabe numa sessão → sessão única
- **Tarefas sequenciais** onde B depende de A → pipeline com subagentes
- **Edições no mesmo arquivo** → conflitos garantidos
- **Orçamento limitado** → 15x tokens. Comece com subagentes
- **Primeiras fases do projeto** (Fase 1-2 do workflow) → planejamento é melhor em sessão única com foco total

---

## Setup: Terminais Paralelos com tmux

Para o dev que opera múltiplos agentes manualmente (sem Agent Teams), tmux é a ferramenta:

```bash
# Instalar
brew install tmux  # macOS
sudo apt install tmux  # Linux

# Iniciar sessão
tmux new-session -s saas-dev

# Dividir em painéis
Ctrl+b %    # split vertical
Ctrl+b "    # split horizontal

# Navegar entre painéis
Ctrl+b ←/→/↑/↓
```

**Setup recomendado para SaaS:**

```
┌─────────────────────┬─────────────────────┐
│                     │                     │
│  Terminal Principal  │  Terminal de Testes │
│  (Claude Code)      │  (npm test:watch)   │
│                     │                     │
├─────────────────────┼─────────────────────┤
│                     │                     │
│  Terminal de Logs   │  Terminal Livre      │
│  (docker logs -f)   │  (git, comandos)    │
│                     │                     │
└─────────────────────┴─────────────────────┘
```

Para Agent Teams com split panes:
```json
// settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

---

## Custos e Limites Práticos

| Abordagem | Tokens vs Sessão Única | Plano Recomendado | Nota |
|---|---|---|---|
| Sessão única | 1x | Pro ($20/mês) | 80% do trabalho diário |
| Subagentes pontuais | 4-7x | Pro ($20/mês) | Cuidado com rate limits |
| Agent Team (3 agentes) | ~15x | Max ($100/mês) | Para tarefas complexas |
| Agent Team (5+ agentes) | ~25x+ | Max ($200/mês) | Raramente necessário |

**Referência real:** O projeto do compilador C em Rust usou 16 agentes, 2.000 sessões, 2 semanas, e custou $20.000. Isso é completamente inapropriado como modelo para um dev solo em SaaS. A lição que transfere é o princípio de decomposição: cada agente trabalhava em um teste falhando independente, sem dependências cruzadas.

**Regra prática:** No plano Pro, 5 subagentes paralelos em modo exploratório atingem rate limit em ~20 minutos. Use escopo estreito.

---

## Decisão Rápida: Qual Abordagem Usar

```
A tarefa é simples?
  └─ Sim → Sessão única

A tarefa precisa de pesquisa isolada?
  └─ Sim → Subagente (Explore ou custom)

A tarefa tem componentes independentes?
  └─ Sim → Os componentes precisam se comunicar?
      └─ Não → Subagentes paralelos ou /batch
      └─ Sim → Agent Team (3-5 teammates)

A tarefa é sequencial (B depende de A)?
  └─ Sim → Pipeline de subagentes com hooks

O orçamento é limitado?
  └─ Sim → Sessão única + subagentes pontuais
```

---

## O que Devs Experientes Reportam

**Heeki Park** (AWS, Mar 2026): Usa ciclo PM → Dev → Test com Claude Code e tmux. Para a maioria do trabalho, subagentes são suficientes. Agent Teams são úteis mas "candidly, para a maioria do que eu faço, imagino que subagentes são suficientes em termos de complexidade e tempo."

**ksred.com** (Mar 2026): Criou agentes customizados, deu nomes e restrições de ferramentas. Depois parou de usá-los porque "Claude simplesmente começou a lidar bem o suficiente sozinho." O que realmente funciona: subagentes para tarefas read-heavy e bounded com output claro. Sessão principal para contexto sustentado.

**Claudio Novaglio** (Mar 2026): Usa teams de 3-5 agentes regularmente para pesquisa, escrita e review em paralelo. Confirma que o valor real não é velocidade — é qualidade por múltiplas perspectivas.

**Dára Sobaloju** (Fev 2026): "Você ainda precisa ser um bom tech lead. Defina tarefas claras, forneça contexto rico, monitore progresso, e corrija quando desviar. As equipes que produzem o melhor output são as com a direção humana mais cuidadosa."

**Workshop Agile Manifesto** (Fev 2026): "Devs experientes são mais eficazes em supervisionar agentes de IA, graças ao entendimento de arquitetura de sistema. Mas devs juniores também têm valor aumentado — são melhores com ferramentas de IA por nunca terem desenvolvido os hábitos e suposições que desaceleram a adoção."

---

## Resumo: A Equipe Mínima Viável

Para um dev solo construindo um SaaS:

**Sempre presentes (agentes customizados em .claude/agents/):**
1. **PM-Spec** — spec de features (read-only)
2. **Test-Writer** — testes TDD (write em /tests)
3. **Implementer** — código (acesso total)
4. **Reviewer** — review antes de merge (read-only)

**Quando o projeto cresce:**
5. **Architect** — ADRs e validação de design
6. **Deployer** — pipeline de deploy

**Agent Teams — use pontualmente para:**
- Features cross-layer (backend + frontend + testes)
- Reviews multi-perspectiva
- Refatorações em larga escala

**Nunca esqueça:** O dev é o tech lead. Os agentes são a equipe. Sem direção humana clara, agentes produzem "big ball of mud" mais rápido que qualquer dev humano conseguiria.
