# ADR-013: Eliminar PlanningDialog e redistribuir funcionalidades

## Status
Aceito

## Data
2026-03-21

## Contexto

O `PlanningDialog.tsx` e um modal complexo que concentra multiplas responsabilidades:
- Metricas semanais (volume, buy-in, ABI)
- Formulario para adicionar torneio planejado
- Lista de torneios do dia selecionado
- Sugestoes de torneios da biblioteca
- Selecao de favoritos

Este modal foi desenhado quando a grade era baseada em DayCards (cards por dia). Com o redesign para grade temporal (WeekGrid com horarios), o modal se torna redundante e contra-producente:
1. Abre sobre a grade, bloqueando a visao
2. Mistura responsabilidades que agora tem locais proprios
3. Nao suporta o conceito de horarios configuraveis
4. Impede interacao direta (inline) que e o objetivo do redesign

## Opcoes Consideradas

### Opcao 1: Manter PlanningDialog adaptado
- **Pros:** Menos trabalho (adaptar vs reescrever). Usuarios ja conhecem o modal.
- **Contras:** Modal sobre grade temporal nao faz sentido (o usuario quer ver a grade enquanto planeja). Mistura responsabilidades que agora tem locais proprios. Complica drag-and-drop (modal bloqueia a grade). Semantica de "abrir modal para planejar" conflita com "interacao direta na celula".

### Opcao 2: Eliminar e redistribuir funcionalidades
- **Pros:** Cada funcionalidade vai para o local mais adequado. Interacao direta (inline) e mais rapida. Grade visivel o tempo todo. Compativel com drag-and-drop. UX moderna (popovers, inline forms).
- **Contras:** Mais componentes novos para criar. Risco de regredir funcionalidade se a redistribuicao nao for completa. Usuarios acostumados com o modal precisam reaprender.

## Decisao

Eliminar `PlanningDialog.tsx` completamente. Redistribuicao:

| Funcionalidade no PlanningDialog | Novo local | Componente |
|---|---|---|
| Metricas semanais (volume, buy-in, ABI) | Header da grade | WeeklySummaryBar (ja existe, ja tem as 5 metricas) |
| Formulario para adicionar torneio | Celula vazia da grade | CellPopover (novo) — mini-form inline |
| Formulario para adicionar torneio | Biblioteca | ManualAddForm (novo) — form na biblioteca |
| Lista de torneios do dia | Celulas da grade | TournamentChip inline (evolucao do TournamentPill) |
| Detalhes de torneio planejado | Chip clicado | ChipPopover (novo) — detalhes + acoes |
| Sugestoes de torneios | Removido | Fora de escopo desta versao |
| Selecao de favoritos | Removido | Fora de escopo desta versao |

Componentes eliminados junto com PlanningDialog:
- `DayCard.tsx` — substituido pela grade temporal (WeekGrid)
- `WeeklySummaryDashboard.tsx` — substituido por ProfileComparison

Componentes preservados:
- `EditDialog.tsx` — continua util para edicao detalhada de torneio
- `DeleteDialog.tsx` — continua util para confirmacao de exclusao

## Consequencias

- **Positiva:** UX mais direta — usuario interage com a grade sem modal intermediario
- **Positiva:** Compativel com drag-and-drop (grade sempre visivel)
- **Positiva:** Cada componente tem responsabilidade unica
- **Positiva:** WeeklySummaryBar ja implementa as metricas corretas (zero retrabalho)
- **Negativa:** Sugestoes e favoritos removidos (podem voltar em versao futura)
- **Negativa:** Usuarios do modal atual precisam reaprender (mitigado: interacao inline e mais intuitiva)
- **Neutra:** PlanningDialog pode ser mantido em branch de backup se necessario para referencia

## Confianca
Alta
