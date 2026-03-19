# Team 3: Refatoracao em Larga Escala

## Quando usar
Mudancas que tocam muitos arquivos em multiplos modulos — renomear entidade,
migrar de uma lib para outra, reestruturar diretorios, mudar padrao.

## Pre-requisitos
- Plano de refatoracao aprovado
- Todos os testes passando ANTES de comecar (green baseline)

## Prompt (copie e cole no Claude Code)

```
Crie um Agent Team para refatorar: "[DESCRICAO DA REFATORACAO]"

Contexto:
- Leia CLAUDE.md para entender a arquitetura atual
- Todos os testes passam atualmente (verificar com: npm run check)
- Plano de refatoracao: [descrever ou apontar para arquivo]

Teammates:

1. Backend Refactorer (nome: "backend"):
   - Escopo: server/
   - [Descrever mudancas especificas nesta camada]
   - Apos cada mudanca significativa, rode os testes
     do modulo afetado
   - Se testes quebrarem, corrija antes de avancar
   - Comunique mudancas de interface/contrato ao "frontend"

2. Frontend Refactorer (nome: "frontend"):
   - Escopo: client/src/
   - [Descrever mudancas especificas nesta camada]
   - Adapte a mudancas de contrato comunicadas pelo "backend"
   - Atualize testes de componente afetados

3. Test Updater (nome: "tests"):
   - Escopo: tests/ e shared/
   - Atualize testes afetados pela refatoracao
   - Garanta que a cobertura nao diminua
   - Se a refatoracao exige novos cenarios, escreva-os
   - Rode a suite completa apos cada batch de mudancas

4. Doc Updater (nome: "docs") — opcional:
   - Escopo: docs/, CLAUDE.md
   - Atualize diagramas de arquitetura afetados
   - Atualize API docs se endpoints mudaram
   - Crie ADR documentando a refatoracao e seu motivo

Coordenacao:
- Backend lidera as mudancas de contrato
- Frontend e Tests se adaptam apos comunicacao do Backend
- Nenhum teammate faz commit com testes falhando
- Se a refatoracao esta quebrando mais coisas do que o
  esperado, PARE e reporte

Require plan approval before any teammate makes changes.

Apos todos terminarem:
- Rode a suite completa de testes
- Compare cobertura antes/depois
- Liste todos os arquivos modificados
- Confirme zero regressao
```

## Dica de economia
Configure teammates como Sonnet e mantenha o Lead como Opus.
Sonnet e suficiente para refatoracao mecanica.

## Custo estimado
~5x sequencial. Tempo: 30-60 min vs 3-5 horas sequencial.
