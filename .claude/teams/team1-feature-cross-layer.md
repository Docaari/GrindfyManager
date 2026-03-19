# Team 1: Feature Cross-Layer

## Quando usar
Implementacao de feature que toca backend, frontend e testes simultaneamente.
Este e o team mais comum e mais util.

## Pre-requisitos
- Spec aprovada (PM-Spec) em docs/specs/
- Arquitetura documentada (System-Architect) em docs/architecture/
- Testes de backend escritos (Test-Writer)

## Prompt (copie e cole no Claude Code)

```
Crie um Agent Team para implementar a feature "[NOME DA FEATURE]".

Contexto do projeto:
- Leia CLAUDE.md para stack, convencoes e estado atual
- Spec aprovada em docs/specs/[feature].md
- Fluxo documentado em docs/architecture/flows/[feature]/
- Testes de backend existem em tests/services/

Teammates:

1. Backend (nome: "backend"):
   - Responsabilidade: Implementar servicos e rotas da API
   - Escopo de arquivos: server/
   - Deve fazer os testes existentes passarem
   - Nao modifique testes
   - Quando definir o contrato da API (request/response),
     comunique ao teammate "frontend" via mensagem

2. Frontend (nome: "frontend"):
   - Responsabilidade: Implementar componentes e paginas
   - Escopo de arquivos: client/src/
   - Aguarde o contrato da API do teammate "backend"
     antes de conectar chamadas reais
   - Use mocks para desenvolver a UI enquanto espera
   - Escreva testes de componente para o que implementar

3. Testes E2E (nome: "tester"):
   - Responsabilidade: Escrever e rodar testes de integracao
     e E2E que validam a feature de ponta a ponta
   - Escopo de arquivos: tests/
   - Aguarde backend e frontend terem versao funcional
   - Valide que a feature funciona end-to-end
   - Reporte qualquer inconsistencia entre backend e frontend

Coordenacao:
- Backend define o contrato primeiro e comunica
- Frontend desenvolve UI com mocks, depois conecta ao backend
- Tester valida depois que ambos estao funcionais
- Se qualquer teammate encontrar problema que afeta outro,
  comunique imediatamente via mensagem
- Todos devem ler CLAUDE.md e seguir convencoes do projeto

Apos todos terminarem, sintetize: quais testes passam,
quais arquivos foram criados, e se ha pendencias.
```

## Custo estimado
~4x de fazer sequencialmente. Tempo: 15-30 min vs 1-2 horas sequencial.
