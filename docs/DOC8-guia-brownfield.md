# Guia Brownfield — Aplicando o Kit em Projetos Existentes
## Como trazer disciplina para um codebase que já existe

*Março 2026*
*Baseado em Nick Tune (O'Reilly), GitHub Spec Kit discussions, ClaudeKit brownfield docs, e práticas validadas.*

---

## O Problema

Nosso pipeline foi desenhado para greenfield (do zero): spec → arquitetura → testes → implementação → review → deploy. Mas quando o projeto já existe:

- Não tem CLAUDE.md — o agente começa cego toda sessão
- Não tem testes — não dá para fazer TDD se não há rede de segurança
- Não tem documentação de arquitetura — ninguém sabe como os serviços se conectam
- Pode ter dívida técnica acumulada — código que "funciona" mas é frágil
- Tem padrões implícitos que ninguém documentou — naming, estrutura, convenções

Tentar aplicar o pipeline completo de uma vez é paralisante. A abordagem correta é **incremental: estabilize primeiro, documente segundo, melhore terceiro**.

---

## A Estratégia: 4 Fases

```
Fase A: Arqueologia ──▶ Fase B: Estabilização ──▶ Fase C: Disciplina ──▶ Fase D: Evolução
(entender o que existe)   (rede de segurança)     (pipeline nos novos)    (melhorar o legado)
     1-2 dias                  3-5 dias                contínuo               contínuo
```

Você NÃO precisa completar todas as fases antes de trabalhar. A Fase A (1-2 dias) já muda radicalmente a qualidade do trabalho com IA. Cada fase subsequente adiciona mais segurança.

---

## Fase A — Arqueologia (Entender o Que Existe)

### Objetivo
Criar a documentação mínima que permite aos agentes operar com contexto. Sem esta fase, todo agente começa cego e reinventa a roda a cada sessão.

Nick Tune (O'Reilly, 2026): "Imagine o valor para alguém novo num codebase, ou um sistema legado que ninguém mais entende. Claude Code analisa o sistema e mapeia os fluxos end-to-end — e depois usa essa documentação para resolver problemas reais com entendimento profundo."

### Passo A1 — Gerar CLAUDE.md inicial

No Claude Code, na raiz do projeto:

```
Analise este codebase completo. Crie um CLAUDE.md contendo:

1. Visão geral do projeto (o que faz, para quem)
2. Stack tecnológica com versões exatas (leia package.json, go.mod, etc.)
3. Estrutura de diretórios com descrição de cada pasta principal
4. Convenções de código observadas (naming, imports, patterns)
5. Variáveis de ambiente (leia .env.example ou .env se existir)
6. Comandos de build, test, lint, dev, deploy
7. Serviços e como se comunicam (se houver múltiplos)
8. Dependências externas (APIs, bancos, filas)

O arquivo será usado por agentes de IA para entender e trabalhar
neste projeto. Seja específico — não use genéricos como "aplicação web".
Use os nomes reais dos módulos, endpoints e entidades que existem no código.

Mínimo 200 linhas. Se o projeto for complexo, 500+.
```

Revise o output. O Claude vai acertar ~80% — corrija os 20% restantes manualmente. Este CLAUDE.md é imperfeito, mas infinitamente melhor que nenhum.

### Passo A2 — Mapear a arquitetura real

Use o System-Architect com modo de leitura:

```
Use o agente system-architect. O projeto já existe mas não tem
documentação de arquitetura. Analise o código fonte e crie:

1. docs/architecture/containers.mermaid — os serviços reais,
   bancos, filas, e como se comunicam (leia o código, não invente)
2. docs/architecture/data-model.mermaid — as entidades reais do
   banco (leia os models/schemas/migrations)

Base tudo no código que existe, não no que "deveria ser".
Se encontrar inconsistências, documente-as.
```

### Passo A3 — Mapear fluxos críticos

Identifique os 3-5 fluxos mais importantes do sistema (auth, fluxo principal de negócio, pagamento se houver) e mapeie cada um:

```
Use o agente system-architect. Analise o código e mapeie o fluxo
completo de [login do usuário / checkout / criação de pedido].

Trace desde a ação do usuário no frontend até o resultado final
no banco de dados. Documente cada serviço que participa, cada
endpoint chamado, cada query executada.

Salve em docs/architecture/flows/[nome-do-fluxo]/ com README.md
e diagram.mermaid.

Inclua cenários de erro que você observar no código.
```

### Passo A4 — Inventário de dívida técnica

```
Analise o codebase e identifique:

1. Arquivos sem testes (liste todos)
2. TODOs e FIXMEs no código
3. Dependências desatualizadas com vulnerabilidades (npm audit)
4. Código duplicado significativo
5. Funções com complexidade ciclomática alta
6. Endpoints sem validação de input
7. Queries sem tratamento de erro

Salve como docs/tech-debt-inventory.md com prioridade
(critical / high / medium / low) para cada item.
```

### Entregáveis da Fase A
- CLAUDE.md (200+ linhas, baseado no código real)
- docs/architecture/containers.mermaid
- docs/architecture/data-model.mermaid
- docs/architecture/flows/ (3-5 fluxos críticos)
- docs/tech-debt-inventory.md

**Tempo:** 1-2 dias. Maioria feita pelo Claude, você revisa e corrige.

---

## Fase B — Estabilização (Rede de Segurança)

### Objetivo
Adicionar testes aos módulos que vão ser modificados. Não é reescrever o sistema — é criar a rede de segurança mínima para que mudanças não quebrem o que funciona.

### Princípio: Teste o que vai tocar

Não tente atingir 100% de cobertura no projeto inteiro. Isso é desperdício. Foque:

1. **Módulos que vão ser alterados** — se você vai mexer em auth, teste auth primeiro
2. **Fluxos críticos de negócio** — o que não pode quebrar (pagamentos, registro, core business)
3. **Código com bugs conhecidos** — se vai corrigir um bug, escreva o teste que reproduz antes de corrigir

### Passo B1 — Testes de caracterização

Testes de caracterização documentam o comportamento ATUAL do código, mesmo que esteja errado. O objetivo não é validar se está correto — é criar um baseline para detectar regressões.

```
Use o agente test-writer. O projeto já existe mas não tem testes
para o módulo [nome do módulo].

Leia o código fonte em [caminho] e escreva testes que documentam
o comportamento ATUAL:
- O que cada função retorna para inputs comuns
- Como erros são tratados atualmente
- Quais efeitos colaterais existem (banco, filas, APIs)

Estes são testes de CARACTERIZAÇÃO, não de especificação.
Eles devem PASSAR com o código atual — se falharem,
o teste está errado (não o código).

Use mocks para dependências externas (banco, APIs).
```

A diferença dos testes normais: testes de caracterização passam desde o início (diferente do TDD onde começam falhando). Eles existem para pegar regressões quando você mudar o código.

### Passo B2 — Testes para o que vai mudar

Antes de fazer qualquer correção ou ajuste, adicione testes específicos:

```
Use o agente test-writer. Vou corrigir [descrever o bug/ajuste]
no módulo [nome].

Escreva testes que:
1. Reproduzam o bug atual (este teste vai PASSAR porque o bug existe)
2. Descrevam o comportamento CORRETO (este teste vai FALHAR)
3. Cubram edge cases relacionados

Após a correção, o teste 1 pode ser removido ou adaptado,
e o teste 2 deve passar.
```

Agora sim é TDD: o teste do comportamento correto falha, e o Implementer vai fazê-lo passar.

### Passo B3 — Pipeline de CI mínimo

Se o projeto não tem CI, crie o mínimo:

```
Use o agente deployer. O projeto já existe mas não tem CI/CD.
Crie um pipeline mínimo com:

1. Lint (usar o linter que o projeto já usa, ou configurar um)
2. Rodar os testes que existem
3. Build (se aplicável)

NÃO configure deploy automático ainda — apenas validação.
O objetivo é pegar regressões em PRs.
```

### Entregáveis da Fase B
- Testes de caracterização para módulos críticos
- Testes específicos para bugs/ajustes planejados
- Pipeline de CI mínimo (lint + test + build)

**Tempo:** 3-5 dias. Proporcional ao tamanho do que vai ser alterado.

---

## Fase C — Disciplina (Pipeline nos Novos)

### Objetivo
A partir daqui, toda mudança nova segue o pipeline completo. O código legado continua como está — você não reescreve. Mas todo código NOVO é tratado como greenfield.

### Como funciona

**Para features novas:**
Pipeline completo: PM-Spec → System-Architect → Test-Writer → Implementer → Reviewer → Deployer.

A feature nova pode interagir com código legado, mas o código novo tem spec, testes e review.

**Para correções de bugs:**
1. Test-Writer: escreva teste que reproduz o bug (deve falhar)
2. Implementer: corrija o bug (teste passa)
3. Reviewer: review da correção
4. Registre no CLAUDE.md (seção Erros Conhecidos) se for padrão recorrente

**Para ajustes e melhorias:**
1. Testes de caracterização primeiro (se não existem para o módulo)
2. Depois TDD normal para a melhoria
3. Todos os testes devem passar ao final

### Regra de Ouro

```
Código que você NÃO vai mexer → Deixe como está
Código que você VAI mexer → Teste de caracterização primeiro
Código NOVO → Pipeline completo (TDD)
```

Isso evita a paralisia de "preciso testar tudo antes de mudar qualquer coisa". Você testa sob demanda, expandindo a rede de segurança conforme toca em mais partes do sistema.

---

## Fase D — Evolução (Melhorar o Legado)

### Objetivo
Gradualmente trazer o código legado para o padrão do código novo. Isso é opcional e contínuo — não é um projeto separado.

### Estratégia: Boy Scout Rule

"Deixe o código melhor do que encontrou." Toda vez que tocar num módulo legado:

1. Adicione testes de caracterização se não existem
2. Faça a mudança que precisa
3. Se possível, melhore algo pequeno (rename, extract function, add validation)
4. Garanta que todos os testes passam

Não refatore módulos inteiros de uma vez. Melhore incrementalmente. Em 3-6 meses, os módulos mais tocados estarão com boa qualidade.

### Quando usar teams para refatoração legada

Se um módulo precisa de refatoração significativa (trocar ORM, migrar pattern, reestruturar):

1. Testes de caracterização completos primeiro (Fase B)
2. ADR documentando a decisão de refatorar e o motivo
3. Team 3 (Refatoração em Larga Escala) para executar
4. Validação completa após refatoração (zero regressão)

---

## Adaptação dos Agentes para Brownfield

Os agentes funcionam em brownfield com ajustes nas instruções:

### PM-Spec — Sem mudança
Funciona igual. Specs para features novas e para correções.

### System-Architect — Modo de leitura primeiro

Em brownfield, o System-Architect tem uma responsabilidade extra: **ler o código real antes de criar artefatos**. Em greenfield ele trabalha a partir da spec. Em brownfield ele precisa reconciliar spec com código existente.

Instrução adicional ao invocar:
```
O projeto já existe. Antes de criar qualquer artefato,
leia o código fonte e a estrutura real. Os diagramas devem
refletir o que EXISTE, não o que DEVERIA existir.
Se encontrar divergência entre código e documentação existente,
documente a divergência.
```

### Test-Writer — Testes de caracterização

Em brownfield, o Test-Writer tem dois modos:

**Modo TDD (padrão):** Para código novo. Testes falham primeiro.
**Modo Caracterização:** Para código existente. Testes passam desde o início.

Instrução ao invocar para caracterização:
```
Use o agente test-writer em modo caracterização.
O código já existe em [caminho]. Escreva testes que documentam
o comportamento ATUAL — estes testes devem PASSAR imediatamente.
O objetivo é criar rede de segurança contra regressões.
```

### Implementer — Respeitar o existente

Em brownfield, o Implementer precisa seguir padrões do código existente mesmo que não sejam ideais:

Instrução adicional:
```
O projeto já existe com padrões estabelecidos.
Siga os padrões existentes mesmo que não sejam os que você
escolheria num projeto novo. Consistência com o legado é
mais importante que "melhor prática" isolada.
Se o projeto usa callbacks, use callbacks. Se usa classes, use classes.
Mudanças de padrão são decisões de arquitetura (ADR), não de implementação.
```

### Reviewer — Contexto legado

O Reviewer precisa calibrar severidade considerando que é brownfield:

Instrução adicional:
```
Este é um projeto existente com código legado.
Foque o review no código NOVO ou MODIFICADO.
Não sinalize problemas no código legado que não foi tocado
neste PR — isso pertence ao inventário de dívida técnica.
Se o código novo perpetua um antipadrão do legado,
sinalize como INFO com sugestão, não como bloqueante.
```

### Deployer — Sem mudança significativa
Se já existe CI/CD, respeite e melhore. Se não existe, crie.

---

## Checklist de Onboarding para Projeto Existente

Copie e siga na ordem:

```markdown
## Fase A — Arqueologia (1-2 dias)
- [ ] CLAUDE.md criado e revisado (200+ linhas, dados reais)
- [ ] containers.mermaid reflete a arquitetura real
- [ ] data-model.mermaid reflete os models reais
- [ ] 3-5 fluxos críticos mapeados em docs/architecture/flows/
- [ ] Inventário de dívida técnica criado
- [ ] Agentes instalados em .claude/agents/

## Fase B — Estabilização (3-5 dias)
- [ ] Testes de caracterização para módulos que serão alterados
- [ ] Testes que reproduzem bugs conhecidos
- [ ] Pipeline de CI mínimo (lint + test + build)
- [ ] Primeiro PR passando pelo pipeline

## Fase C — Disciplina (contínuo)
- [ ] Próxima feature nova segue pipeline completo
- [ ] Próximo bugfix segue ciclo teste-que-reproduz → correção
- [ ] CLAUDE.md atualizado após cada sessão significativa
- [ ] Erros da IA registrados na seção Erros Conhecidos

## Fase D — Evolução (contínuo)
- [ ] Boy Scout Rule aplicado a cada PR
- [ ] Módulos mais tocados ganhando cobertura incremental
- [ ] ADRs para mudanças de padrão significativas
```

---

## Erros Comuns em Brownfield

**"Vou reescrever tudo antes de começar"**
Não. Reescrita total é o projeto que nunca termina. Estabilize o que existe, discipline o que é novo, evolua o legado incrementalmente.

**"Vou atingir 100% de cobertura de testes"**
Desperdício. Teste o que vai tocar. O resto ganha cobertura naturalmente conforme você trabalha no projeto.

**"O agente não entende o código legado"**
Provavelmente falta contexto. Melhore o CLAUDE.md. Adicione exemplos de padrões usados no projeto. Quanto melhor o CLAUDE.md, melhor o agente opera.

**"O CLAUDE.md gerado automaticamente está errado"**
Esperado. O Claude acerta ~80%. Revise e corrija os 20%. Um CLAUDE.md 80% correto é infinitamente melhor que nenhum.

**"Os testes de caracterização são inúteis — testam código bugado"**
Esse é o ponto. Eles não validam se o código está correto — eles detectam quando o comportamento muda. Se você corrigir um bug, o teste de caracterização vai falhar. Isso é bom — significa que a rede de segurança está funcionando. Você atualiza o teste para refletir o comportamento correto.

**"Misturar código novo TDD com legado sem teste é confuso"**
No curto prazo, sim. No médio prazo, a fronteira entre código testado e não-testado fica cada vez mais clara. Em 3-6 meses, os módulos mais ativos já terão boa cobertura.

---

## Resumo Visual

```
PROJETO EXISTENTE
       │
       ▼
┌──────────────────────────────┐
│  Fase A: Arqueologia         │ ← CLAUDE.md + diagramas + inventário
│  (1-2 dias)                  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Fase B: Estabilização       │ ← Testes de caracterização + CI
│  (3-5 dias)                  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│  Fase C: Disciplina (contínuo)                        │
│                                                       │
│  Feature nova → Pipeline completo (TDD)               │
│  Bug fix → Teste que reproduz → Correção              │
│  Ajuste → Caracterização → TDD → Implementação        │
│                                                       │
│  Código legado intocado → Deixe como está             │
│  Código legado que vai mexer → Teste primeiro          │
│  Código novo → Pipeline completo                      │
└──────────┬───────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Fase D: Evolução (contínuo) │ ← Boy Scout Rule + refatoração incremental
└──────────────────────────────┘
```

---

*Não espere o projeto ficar perfeito para começar a usar os agentes. Crie o CLAUDE.md hoje — mesmo imperfeito — e melhore a cada sessão. Disciplina é um processo, não um estado.*
