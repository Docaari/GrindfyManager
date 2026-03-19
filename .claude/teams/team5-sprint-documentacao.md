# Team 5: Sprint de Documentacao

## Quando usar
Projeto cresceu e a documentacao ficou defasada. Precisa atualizar
tudo de uma vez: arquitetura, API docs, CLAUDE.md.

## Pre-requisitos
- Projeto funcional com codigo estavel

## Prompt (copie e cole no Claude Code)

```
Crie um Agent Team para atualizar toda a documentacao do projeto.

Contexto:
- Leia o codigo fonte como fonte de verdade
- A documentacao existente pode estar desatualizada
- O objetivo e que qualquer agente de IA consiga entender
  e trabalhar no projeto lendo apenas a documentacao

Teammates:

1. Architecture Documenter (nome: "arch"):
   - Atualize docs/architecture/overview.mermaid
   - Atualize docs/architecture/containers.mermaid
   - Atualize docs/architecture/data-model.mermaid
   - Crie ou atualize fluxos em docs/architecture/flows/
     para cada feature que existe no codigo
   - Garanta que diagramas refletem o codigo REAL, nao
     o que foi planejado originalmente
   - Foco em: shared/schema.ts (data model), server/routes.ts (fluxos)

2. API Documenter (nome: "api"):
   - Leia todas as rotas em server/routes.ts
   - Atualize docs/api/endpoints.md com cada endpoint real
   - Inclua request/response examples testados
   - Identifique endpoints sem documentacao e documente
   - Referencia: CLAUDE.md secao 7 (lista atual de endpoints)

3. Project Documenter (nome: "project"):
   - Atualize CLAUDE.md: stack (versoes atuais do package.json),
     estrutura de diretorios, variaveis de ambiente,
     comandos, erros conhecidos
   - Verifique que .env tem todas as variaveis
     que o codigo realmente usa
   - Atualize secao de problemas identificados

Coordenacao:
- Cada documenter tem escopo de arquivos definido
- Se um documenter encontrar inconsistencia no codigo
  (endpoint sem teste, variavel nao documentada),
  reporte na sintese final — nao tente corrigir o codigo
- Cross-reference: o que o arch documenter escreve nos
  fluxos deve ser consistente com o que o api documenter
  encontra nos endpoints

Apos todos terminarem:
- Liste inconsistencias encontradas entre codigo e docs
- Liste documentacao que estava faltando e foi criada
- Confirme que CLAUDE.md tem 300+ linhas com dados reais
```

## Custo estimado
~3x sequencial. Tempo: 20-40 min vs 2-3 horas sequencial.
