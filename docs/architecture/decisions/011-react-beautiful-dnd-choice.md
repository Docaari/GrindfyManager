# ADR-011: Usar react-beautiful-dnd para drag-and-drop na grade

## Status
Aceito

## Data
2026-03-21

## Contexto

A feature de drag-and-drop requer:
1. Arrastar cards da biblioteca para celulas da grade (cross-container)
2. Reposicionar chips entre celulas da grade
3. Feedback visual durante drag (ghost, highlight)
4. Rejeitar drop em celulas de dia OFF (isDropDisabled)
5. Manter performance com 50-100+ itens arrastaveis

O projeto ja tem `react-beautiful-dnd` v13.1.1 instalado no package.json (nunca usado).

## Opcoes Consideradas

### Opcao 1: react-beautiful-dnd (ja instalado)
- **Pros:** Ja instalado, zero overhead de bundle adicional. API declarativa com Draggable/Droppable. isDropDisabled nativo para rejeitar dias OFF. Animacoes suaves built-in. Ampla documentacao e community. Funciona bem com listas e grids.
- **Contras:** Projeto oficialmente descontinuado (Atlassian parou manutencao ativa). Nao suporta drag em multiplos eixos simultaneos (grid 2D e tratado como listas separadas). React 18 strict mode pode causar warnings (contornavel). Nao suporta drag handles nativos em touch sem wrapper.

### Opcao 2: @dnd-kit/core + @dnd-kit/sortable
- **Pros:** Ativamente mantido. Suporte nativo a grids 2D. Melhor performance com sensores customizaveis. API modular (core + sortable + utilities). Touch-friendly nativo.
- **Contras:** Nao instalado — adiciona ~15KB ao bundle. API mais verbosa (sensors, modifiers, collision detection). Curva de aprendizado maior. Requer refatorar o conceito de Droppable para collision areas.

### Opcao 3: HTML5 Drag and Drop nativo
- **Pros:** Zero dependencia. Nativo do browser. Leve.
- **Contras:** API de baixo nivel — muito codigo boilerplate. Sem animacoes nativas. Touch nao funciona (ondragstart nao dispara em mobile). Feedback visual requer implementacao manual. Inconsistente entre browsers. Sem isDropDisabled — requer logica manual.

## Decisao

Usar `react-beautiful-dnd` (ja instalado) pelos seguintes motivos:

1. **Ja esta no bundle** — zero custo adicional de dependencia
2. **isDropDisabled** resolve elegantemente a rejeicao de dias OFF
3. O modelo de Droppables separados por celula mapeia naturalmente para o grid da grade (cada celula e uma lista de 0-N chips)
4. Animacoes suaves sem codigo extra
5. A descontinuacao nao e critica — o projeto funciona perfeitamente com React 18, e a feature de drag nao vai evoluir alem do escopo atual

Se no futuro o react-beautiful-dnd causar problemas com React 19+, migrar para @dnd-kit sera o caminho. A API e diferente mas os conceitos sao analogos.

## Consequencias

- **Positiva:** Sem nova dependencia — bundle size inalterado
- **Positiva:** Implementacao rapida com API familiar
- **Positiva:** isDropDisabled para dias OFF funciona nativamente
- **Negativa:** Lib descontinuada — risco futuro com React 19+
- **Negativa:** Strict mode warnings possiveis (contornaveis com wrapper)
- **Neutra:** Grid 2D tratado como multiplas listas verticais (uma por celula) — funciona mas nao e o modelo ideal

## Confianca
Media — decisao pragmatica (ja instalado) com risco aceitavel de migracao futura
