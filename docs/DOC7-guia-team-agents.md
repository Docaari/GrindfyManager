# Guia de Team Agents para Desenvolvimento de SaaS
## Configurações prontas para uso com prompts copy-paste

*Março 2026*
*Baseado na documentação oficial Anthropic, Claudio Novaglio, alexop.dev, Rajesh Royal (OpenZeppelin), Dára Sobaloju, e Addy Osmani.*

---

## Regra Zero: Quando NÃO Usar Team Agents

Antes de qualquer configuração, internalize isto:

**80% do trabalho de um dev solo em SaaS é feito em sessão única.** Subagentes cobrem mais 15%. Team Agents cobrem os 5% restantes — tarefas genuinamente paralelas onde os trabalhadores precisam se comunicar.

Team Agents adicionam overhead real:
- ~15x tokens de uma sessão única (Anthropic)
- 3-4x tokens do equivalente sequencial com subagentes
- Coordenação overhead (task claiming, messaging, conflitos)
- Requer Opus 4.6 + plano Pro ($20/mês mínimo) ou Max ($100-200/mês recomendado)

**Use Team Agents quando:**
- A tarefa tem componentes distintos e independentes
- Os componentes precisam se comunicar entre si
- O ganho de tempo justifica o custo de tokens
- Você pode definir boundaries claros entre teammates

**Use subagentes (nosso pipeline normal) quando:**
- O trabalho é sequencial (B depende de A)
- Teammates editariam o mesmo arquivo (conflitos)
- A tarefa é simples o suficiente para uma sessão
- O orçamento é limitado

Dára Sobaloju (Fev 2026): "Você ainda precisa ser um bom tech lead. As equipes que produzem o melhor output são as com a direção humana mais cuidadosa."

---

## Setup

### 1. Habilitar Agent Teams

```json
// .claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 2. Instalar tmux (recomendado)

```bash
# macOS
brew install tmux

# Linux
sudo apt install tmux
```

tmux permite ver cada agente em seu próprio painel. Sem ele, os teammates rodam em background (in-process) e você navega com Shift+Down.

### 3. Verificar versão

```bash
claude --version
# Requer v2.1.32 ou superior
```

---

## Os 5 Teams do Projeto SaaS

Cada team abaixo é uma configuração pronta com prompt copy-paste. Use na situação descrita.

---

### Team 1: Feature Cross-Layer

**Quando usar:** Implementação de feature que toca backend, frontend e testes simultaneamente. Este é o team mais comum e mais útil.

**Composição:** 3 teammates + lead

**Pré-requisito:** Spec aprovada (PM-Spec) + Arquitetura documentada (System-Architect) + Testes escritos (Test-Writer) para a camada de backend. Os testes de integração e frontend podem ser escritos pelos teammates.

**Prompt para o Lead:**

```
Crie um Agent Team para implementar a feature "[NOME DA FEATURE]".

Contexto do projeto:
- Leia CLAUDE.md para stack, convenções e estado atual
- Spec aprovada em docs/specs/[feature].md
- Fluxo documentado em docs/architecture/flows/[feature]/
- Testes de backend existem em tests/services/

Teammates:

1. Backend (nome: "backend"):
   - Responsabilidade: Implementar serviços e rotas da API
   - Escopo de arquivos: services/api/src/
   - Deve fazer os testes existentes passarem
   - Não modifique testes
   - Quando definir o contrato da API (request/response),
     comunique ao teammate "frontend" via mensagem

2. Frontend (nome: "frontend"):
   - Responsabilidade: Implementar componentes e páginas
   - Escopo de arquivos: web/src/
   - Aguarde o contrato da API do teammate "backend"
     antes de conectar chamadas reais
   - Use mocks para desenvolver a UI enquanto espera
   - Escreva testes de componente para o que implementar

3. Testes E2E (nome: "tester"):
   - Responsabilidade: Escrever e rodar testes de integração
     e E2E que validam a feature de ponta a ponta
   - Escopo de arquivos: tests/integration/, tests/e2e/
   - Aguarde backend e frontend terem versão funcional
   - Valide que a feature funciona end-to-end
   - Reporte qualquer inconsistência entre backend e frontend

Coordenação:
- Backend define o contrato primeiro e comunica
- Frontend desenvolve UI com mocks, depois conecta ao backend
- Tester valida depois que ambos estão funcionais
- Se qualquer teammate encontrar problema que afeta outro,
  comunique imediatamente via mensagem
- Todos devem ler CLAUDE.md e seguir convenções do projeto

Após todos terminarem, sintetize: quais testes passam,
quais arquivos foram criados, e se há pendências.
```

**Custo estimado:** ~4x de fazer sequencialmente. Tempo: 15-30 min vs 1-2 horas sequencial.

---

### Team 2: Review Multi-Perspectiva

**Quando usar:** Antes de merge de features críticas (auth, pagamentos, dados sensíveis). Substitui o subagente Reviewer quando a feature é complexa o suficiente para múltiplas perspectivas.

**Reviewer (subagente) vs Team 2 — quando usar qual:**

| Situação | Use |
|---|---|
| PR pequeno, bugfix, feature simples | **Subagente Reviewer** — rápido, barato, suficiente |
| Feature que toca auth, tokens, senhas | **Team 2** — security reviewer dedicado |
| Feature de pagamentos, dados financeiros | **Team 2** — security + performance dedicados |
| Feature que toca dados sensíveis (LGPD, PII) | **Team 2** — security é crítico |
| Refatoração grande com muitos arquivos | **Team 2** — múltiplas perspectivas pegam mais |
| Feature CRUD simples, testes passando | **Subagente Reviewer** — não justifica 3 agentes |
| Dúvida? Pergunte: "Se esse código tiver um bug, qual o impacto?" | Impacto alto → Team 2. Impacto baixo → Subagente |

O subagente Reviewer cobre 80% dos reviews do dia a dia. O Team 2 é para os 20% onde o custo de um bug em produção justifica investir 3x mais tokens em review.

**Composição:** 3 teammates + lead

**Pré-requisito:** Feature implementada, testes passando, pronto para merge.

**Prompt para o Lead:**

```
Crie um Agent Team para review da feature "[NOME DA FEATURE]"
antes do merge para main.

Contexto:
- Leia CLAUDE.md para padrões e convenções do projeto
- A feature está na branch feature/[nome]
- Diff disponível via: git diff main...feature/[nome]
- ADRs em docs/architecture/decisions/

Teammates:

1. Security Reviewer (nome: "security"):
   - Audite contra OWASP Top 10
   - Verifique: injection (SQL, XSS), auth/authz,
     exposição de dados sensíveis, rate limiting
   - Verifique que senhas são hasheadas, tokens têm
     expiração, CORS está configurado
   - Classifique cada achado: CRITICAL / HIGH / MEDIUM / LOW
   - Só reporte com confiança alta (evite falsos positivos)

2. Performance Reviewer (nome: "performance"):
   - Identifique: queries N+1, falta de índices,
     chamadas síncronas que deviam ser async,
     objetos grandes em memória, falta de paginação
   - Verifique se endpoints pesados têm caching
   - Classifique por impacto: CRITICAL / HIGH / MEDIUM / LOW

3. Standards Reviewer (nome: "standards"):
   - Verifique aderência às convenções do CLAUDE.md
   - Naming, estrutura de diretórios, patterns do projeto
   - Cobertura de testes: cada regra de negócio tem teste?
   - Verifique que não há funcionalidade sem teste
   - Verifique que ADRs existentes estão sendo respeitados
   - Classifique: MUST FIX / SHOULD FIX / NICE TO HAVE

Coordenação:
- Cada reviewer trabalha em paralelo na mesma diff
- Se um reviewer encontrar algo que afeta a área de outro
  (ex: security issue que também é performance issue),
  comunique via mensagem
- Não dupliquem achados entre si

Após todos terminarem, sintetize um relatório único:
- Achados por severidade (CRITICAL primeiro)
- Quais são bloqueantes para merge
- Quais podem ser resolvidos em PR separado
- Veredicto: APPROVE / REQUEST CHANGES / BLOCK
```

**Custo estimado:** ~3x de um review simples. Valor: pega problemas que um reviewer solo não veria.

---

### Team 3: Refatoração em Larga Escala

**Quando usar:** Mudanças que tocam muitos arquivos em múltiplos módulos — renomear entidade, migrar de uma lib para outra, reestruturar diretórios, mudar padrão de autenticação.

**Composição:** 3-4 teammates + lead

**Pré-requisito:** Plano de refatoração aprovado. Todos os testes passando ANTES de começar (green baseline).

**Prompt para o Lead:**

```
Crie um Agent Team para refatorar: "[DESCRIÇÃO DA REFATORAÇÃO]"

Contexto:
- Leia CLAUDE.md para entender a arquitetura atual
- Todos os testes passam atualmente (verificar com: npm test)
- Plano de refatoração: [descrever ou apontar para arquivo]

Teammates:

1. Backend Refactorer (nome: "backend"):
   - Escopo: services/api/src/
   - [Descrever mudanças específicas nesta camada]
   - Após cada mudança significativa, rode os testes
     do módulo afetado
   - Se testes quebrarem, corrija antes de avançar
   - Comunique mudanças de interface/contrato ao "frontend"

2. Frontend Refactorer (nome: "frontend"):
   - Escopo: web/src/
   - [Descrever mudanças específicas nesta camada]
   - Adapte a mudanças de contrato comunicadas pelo "backend"
   - Atualize testes de componente afetados

3. Test Updater (nome: "tests"):
   - Escopo: tests/
   - Atualize testes afetados pela refatoração
   - Garanta que a cobertura não diminua
   - Se a refatoração exige novos cenários, escreva-os
   - Rode a suíte completa após cada batch de mudanças

4. Doc Updater (nome: "docs") — opcional:
   - Escopo: docs/, CLAUDE.md, README.md
   - Atualize diagramas de arquitetura afetados
   - Atualize API docs se endpoints mudaram
   - Crie ADR documentando a refatoração e seu motivo

Coordenação:
- Backend lidera as mudanças de contrato
- Frontend e Tests se adaptam após comunicação do Backend
- Nenhum teammate faz commit com testes falhando
- Se a refatoração está quebrando mais coisas do que o
  esperado, PARE e reporte — pode ser sinal de que
  o escopo precisa ser reduzido

Require plan approval before any teammate makes changes.

Após todos terminarem:
- Rode a suíte completa de testes
- Compare cobertura antes/depois
- Liste todos os arquivos modificados
- Confirme zero regressão
```

**Custo estimado:** ~5x sequencial. Tempo: 30-60 min vs 3-5 horas sequencial.

**Dica de otimização (Oflight Inc.):** Configure teammates como Sonnet e mantenha o Lead como Opus. Sonnet é suficiente para refatoração mecânica, e o custo cai significativamente.

---

### Team 4: Debug com Hipóteses Paralelas

**Quando usar:** Bug em produção que pode ter múltiplas causas. Em vez de investigar uma hipótese por vez, testa todas simultaneamente.

**Composição:** 3 teammates + lead

**Pré-requisito:** Bug reproduzível ou stack trace disponível.

**Prompt para o Lead:**

```
Crie um Agent Team para debugar: "[DESCRIÇÃO DO BUG]"

Sintomas:
- [Descrever o que está acontecendo]
- [Stack trace, se disponível]
- [Quando começou, se souber]

Teste estas hipóteses em paralelo:

1. Hipótese DB (nome: "db-investigator"):
   - Verifique: queries lentas, deadlocks, conexões
     esgotadas, migrations faltando, dados corrompidos
   - Examine logs de query se disponíveis
   - Tente reproduzir o problema isolando a camada de banco

2. Hipótese Lógica (nome: "logic-investigator"):
   - Verifique: race conditions, estado inconsistente,
     edge case não tratado, erro de validação silencioso
   - Trace o fluxo completo do request que falha
   - Identifique onde o comportamento diverge do esperado

3. Hipótese Infra (nome: "infra-investigator"):
   - Verifique: timeout de serviço externo, rate limit
     atingido, variável de ambiente errada, DNS/SSL,
     memória/CPU saturados, versão de dependência
   - Examine logs de erro e health checks

Cada investigador:
- Profile o problema na sua camada
- Tente reproduzir
- Reporte achados com evidência (logs, queries, traces)

Após investigação:
- Sintetize qual hipótese tem mais evidência
- Proponha fix específico com teste que reproduz o bug
- Se nenhuma hipótese se confirmar, proponha próximos
  passos de investigação
```

**Custo estimado:** ~3x de debug sequencial. Valor: encontra a causa em 15 min vs horas de investigação linear.

---

### Team 5: Sprint de Documentação

**Quando usar:** Projeto cresceu e a documentação ficou defasada. Precisa atualizar tudo de uma vez: arquitetura, API docs, README, CLAUDE.md.

**Composição:** 3 teammates + lead

**Pré-requisito:** Projeto funcional com código estável.

**Prompt para o Lead:**

```
Crie um Agent Team para atualizar toda a documentação
do projeto.

Contexto:
- Leia o código fonte como fonte de verdade
- A documentação existente pode estar desatualizada
- O objetivo é que qualquer agente de IA consiga entender
  e trabalhar no projeto lendo apenas a documentação

Teammates:

1. Architecture Documenter (nome: "arch"):
   - Atualize docs/architecture/overview.mermaid
   - Atualize docs/architecture/containers.mermaid
   - Atualize docs/architecture/data-model.mermaid
   - Crie ou atualize fluxos em docs/architecture/flows/
     para cada feature que existe no código
   - Garanta que diagramas refletem o código REAL, não
     o que foi planejado originalmente

2. API Documenter (nome: "api"):
   - Leia todas as rotas no código fonte
   - Atualize docs/api/endpoints.md com cada endpoint real
   - Inclua request/response examples testados
   - Identifique endpoints sem documentação e documente

3. Project Documenter (nome: "project"):
   - Atualize CLAUDE.md: stack (versões atuais),
     estrutura de diretórios, variáveis de ambiente,
     comandos, erros conhecidos
   - Atualize README.md: setup, desenvolvimento, testes
   - Verifique que .env.example tem todas as variáveis
     que o código realmente usa

Coordenação:
- Cada documenter tem escopo de arquivos definido
- Se um documenter encontrar inconsistência no código
  (endpoint sem teste, variável não documentada),
  reporte na síntese final — não tente corrigir o código
- Cross-reference: o que o arch documenter escreve nos
  fluxos deve ser consistente com o que o api documenter
  encontra nos endpoints

Após todos terminarem:
- Liste inconsistências encontradas entre código e docs
- Liste documentação que estava faltando e foi criada
- Confirme que CLAUDE.md tem 200+ linhas com dados reais
```

**Custo estimado:** ~3x sequencial. Tempo: 20-40 min vs 2-3 horas sequencial.

---

## Padrão Avançado: Plan → Team

O padrão mais eficaz documentado por alexop.dev e ClaudeFast:

**Passo 1 — Plan Mode (barato, read-only):**
```
/plan

Planeje a refatoração do módulo de autenticação.
Identifique todos os arquivos afetados, dependências,
e proponha um plano passo a passo.
Não faça nenhuma mudança ainda.
```

O Claude explora o codebase em read-only e produz um plano detalhado. Custo: mínimo.

**Passo 2 — Revisar o plano:** Você lê, ajusta, aprova.

**Passo 3 — Executar com Team:**
```
Execute o plano aprovado acima usando um Agent Team.
[Colar o prompt do team relevante com ajustes baseados no plano]
```

Isso combina o melhor dos dois mundos: planejamento barato com execução paralela poderosa.

---

## Controles Durante a Execução

### Navegar entre teammates

**In-process (padrão):**
- `Shift+Down` — próximo teammate
- `Shift+Up` — teammate anterior
- Após o último teammate, volta para o lead

**Split panes (tmux):**
- Clique no painel do teammate
- Ou use `Ctrl+b` + setas para navegar

### Redirecionar um teammate

Se um teammate está indo na direção errada, mude para ele e diga:

```
PARE. Não continue com essa abordagem.
[Explicar o que está errado]
[Explicar o que deve fazer em vez disso]
```

### Exigir aprovação de plano

Adicione ao prompt do lead:

```
Require plan approval before any teammate makes changes.
```

Cada teammate planeja primeiro (read-only), envia o plano para o lead, e só executa após aprovação. Isso adiciona uma camada de segurança para refatorações arriscadas.

### Forçar modelo dos teammates

Para reduzir custo, use Sonnet nos teammates:

```
Crie um team com 3 teammates. Use Sonnet para cada teammate.
```

O lead continua rodando no modelo da sessão (Opus). Sonnet é suficiente para a maioria das tarefas de implementação e review.

---

## Custos e Limites Práticos

| Configuração | Tokens vs Sessão Única | Plano Mínimo | Nota |
|---|---|---|---|
| 3 teammates (Feature) | ~12-15x | Pro ($20/mês) | 2-3 teams/dia no Pro |
| 3 teammates (Review) | ~10x | Pro ($20/mês) | Mais leve que Feature |
| 4 teammates (Refactor) | ~20x | Max ($100/mês) | Recomendado Max |
| 3 teammates (Debug) | ~10x | Pro ($20/mês) | Read-heavy, mais barato |
| 3 teammates (Docs) | ~10x | Pro ($20/mês) | Moderado |

**No plano Pro:** 2-3 tarefas com team por dia antes de atingir rate limits. Reserve para os momentos que realmente justificam.

**No plano Max ($100/mês):** 8-10 tarefas complexas por janela de 5 horas. Suficiente para uso profissional diário.

**Dica de economia:** Para teammates que fazem trabalho mecânico (refatoração, atualização de docs), use Sonnet. Reserve Opus para o lead e para teammates que precisam de raciocínio complexo (security review, debug).

---

## Decisão Rápida: Qual Team Usar

```
Feature toca backend + frontend + testes?
  └─ Sim → Team 1: Feature Cross-Layer

Precisa de review antes do merge?
  └─ Sim → É feature crítica (auth, pagamentos, dados sensíveis)?
      ├─ Sim → Team 2: Review Multi-Perspectiva
      └─ Não → Subagente Reviewer (mais rápido e barato)

Mudança que afeta 20+ arquivos em múltiplos módulos?
  └─ Sim → Team 3: Refatoração em Larga Escala

Bug com causa incerta e múltiplas hipóteses?
  └─ Sim → Team 4: Debug Paralelo

Documentação defasada em múltiplas áreas?
  └─ Sim → Team 5: Sprint de Documentação

Nada acima se aplica?
  └─ Use sessão única ou subagentes do pipeline
```

---

## Limitações Conhecidas (Mar 2026)

Agent Teams é experimental. Saiba antes de usar:

- **Sem resumir sessão:** Se a sessão do lead morrer, teammates in-process se perdem. Spawne novos se necessário
- **Task status pode atrasar:** Teammates às vezes não marcam tarefas como completas. Se algo parecer travado, verifique manualmente e atualize o status
- **Shutdown pode ser lento:** Teammates terminam o request atual antes de desligar
- **Um team por sessão:** O lead gerencia apenas um team por vez
- **Sem nesting:** Teammates não podem criar sub-teams. Se precisar de ajuda com subtarefa, usam subagentes normais
- **Conflitos de arquivo:** Se dois teammates editam o mesmo arquivo, há risco de conflito. Defina boundaries claros de escopo de arquivos no prompt

**Mitigação para conflitos:** Use a instrução no prompt:
```
Cada teammate tem escopo exclusivo de arquivos.
Nenhum teammate deve editar arquivos fora do seu escopo.
Se precisar de mudança fora do escopo, comunique ao
teammate responsável via mensagem.
```

---

## Relação com o Pipeline de Subagentes

Os Team Agents NÃO substituem o pipeline de subagentes (PM-Spec → System-Architect → Test-Writer → Implementer → Reviewer → Deployer). Eles se encaixam DENTRO de fases específicas:

```
PM-Spec (subagente)
    │
System-Architect (subagente)
    │
Test-Writer (subagente)
    │
Implementer ← AQUI pode usar Team 1 (Feature Cross-Layer)
    │
Review ── Escolha:
    │      ├─ Feature simples → Subagente Reviewer (rápido, barato)
    │      └─ Feature crítica → Team 2: Review Multi-Perspectiva
    │
Deployer (subagente)

--- Sob demanda ---
Team 3 (Refactor) → Quando necessário na Fase 5
Team 4 (Debug) → Quando bug aparece em qualquer fase
Team 5 (Docs) → Quando documentação precisa de atualização geral
```

O pipeline sequencial garante disciplina (TDD, review, aprovação). Os teams aceleram as fases que são genuinamente paralelizáveis. O subagente Reviewer é a escolha padrão para reviews — o Team 2 entra apenas quando o impacto de um bug em produção justifica 3 reviewers especializados.

---

*Comece com os subagentes. Quando dominar o pipeline, adicione Team Agents nas situações que justificam. Três teammates focados superam cinco dispersos.*
