# Spec: Grind Session UX Reform

## Status
Aprovada

## Resumo
Corrigir bugs criticos, melhorar UX e performance nas paginas /grind e /grind-live. Foco em: recuperacao de sessao, simplificacao do fluxo de finalizacao, persistencia de notas, consolidacao do start flow, responsividade mobile e otimizacao de queries.

## Requisitos Funcionais

### RF-01: Recuperacao de sessao (CRITICO)
- Ao montar /grind-live, verificar se existe sessao ativa no banco
- Se sim, restaurar automaticamente (timer, torneios, notas)
- Mostrar banner "Sessao retomada"
- Prevenir sessoes orfaos

### RF-02: Simplificar finalizacao (CRITICO)
- Botao "Finalizar Sessao" → 1 confirmacao → auto-finish pending → summary inline
- Maximo 2 cliques (confirmar + notas finais)
- Remover dialogs intermediarios de pending tournaments

### RF-03: Persistir quick notes no banco (CRITICO)
- Salvar notas imediatamente via POST ao criar
- Carregar notas do banco ao montar pagina
- Remover dependencia de sessionStorage para notas

### RF-04: Consolidar start flow
- Usar APENAS EpicStartSessionModal (de GrindSession.tsx)
- Remover dialog inline de start do GrindSessionLive.tsx
- Se usuario acessa /grind-live sem sessao ativa, mostrar EpicStartSessionModal

### RF-05: Navegacao de volta ao dashboard
- Adicionar breadcrumb/botao "← Dashboard" no SessionHeader
- Permite navegar para /grind sem finalizar sessao
- Sessao continua ativa em background

### RF-06: Responsividade do input de resultado
- Tornar grid de inputs responsivo (stack em mobile)
- Labels visiveis em cada campo (Bounty, Prize, Posicao)
- Aceitar decimais com virgula ou ponto

### RF-07: Otimizar queries/refetch
- Remover setTimeout cascades apos mutations
- Usar unico invalidateQueries por mutation
- Remover removeQueries + invalidateQueries duplicados
- Reduzir polling de sessao ativa de 5s para 30s

### RF-08: Busca de torneio na sessao live
- Input de busca acima da lista de torneios
- Filtra por nome, site ou buyIn
- Mostra contagem de resultados

### RF-09: Pausar sessao
- Botao "Pausar" no header (ao lado de Finalizar)
- Pausa o timer (nao conta tempo parado)
- "Retomar" volta a contar
- Tempo pausado registrado separadamente

### RF-10: Corrigir avgParticipants hardcoded
- Calcular media real de participantes dos torneios da sessao
- Se nao ha dados, mostrar "N/A" em vez de 728.33

### RF-11: Normalizar status de torneio
- Padronizar para: upcoming | active | busted | finished
- "registered" → "active" (jogando)
- "completed" → "finished" (resultado registrado)
- Mostrar badge de status no card do torneio

### RF-12: Progressive disclosure no modal de adicionar torneio
- Form principal visivel (site, time, buyIn, name)
- Sugestoes colapsadas por default ("Expandir sugestoes")
- Campos avancados (type, speed, guaranteed, priority) em secao expansivel

### RF-13: Persistir filtros do dashboard
- Salvar filtros em localStorage
- Restaurar ao voltar na pagina

### RF-14: Break feedback menos interruptivo
- Adicionar botao "Lembrar em 5min" (snooze)
- Remover countdown timer agressivo
- Tornar popup movivel (draggable) ou menor

### RF-15: Animacao de metricas so no load
- Animacao de scale/opacity apenas na primeira renderizacao
- Updates subsequentes usam fade simples

### RF-16: Remover dead code e inconsistencias
- Remover dialog inline de start no GrindSessionLive
- Normalizar terminologia (Finalizar em todos os lugares)

## Fora de Escopo
- Undo de status de torneio
- Refactor total de state management (useReducer/context)
- Historico comparativo entre sessoes
