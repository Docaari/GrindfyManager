# Spec: Enriquecimento de Dados da API Suprema Poker

## Status
Aprovada

## Resumo
Coletar e armazenar todos os campos uteis da API Pokerbyte (late registration, stack inicial, max jogadores, tipo de jogo NLH/PLO) que atualmente sao ignorados, exibi-los no Grade Planner e no Grind Live, permitir edicao do horario de late registration, e notificar o jogador antes do late reg encerrar com tempo configuravel.

## Contexto
A integracao com a Suprema Poker (spec `integracao-suprema-poker.md`, status Concluida) ja importa torneios, mas descarta campos valiosos da API:
- `late` (minutos de late registration) — essencial para o jogador saber ate quando pode se registrar
- `stack` (stack inicial) — importante para decisoes estrategicas
- `maxPl` (max jogadores) — indica tamanho do field
- `type` (NLH/PLO5) — atualmente so exibido como badge, nao salvo

Estes dados sao criticos para planejamento (Grade Planner) e para gestao em tempo real (Grind Live), onde o jogador precisa saber:
- "Ate que horas posso me registrar neste torneio?" (late reg deadline)
- "Qual o stack inicial?" (afeta estrategia de open)
- "Quantos jogadores cabem?" (indica prize pool potencial)

## Usuarios
- **Jogador (user)**: Visualiza informacoes enriquecidas dos torneios Suprema na grade e no grind live

## Requisitos Funcionais

### RF-01: Novos campos no schema planned_tournaments
**Descricao:** Adicionar campos para armazenar dados enriquecidos de torneios importados da Suprema (e futuras integracoes).

**Campos novos:**

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| lateRegMinutes | integer | nullable | Minutos de late registration (da API: campo `late`) |
| startingStack | integer | nullable | Stack inicial do torneio (da API: campo `stack`) |
| maxPlayers | integer | nullable | Maximo de jogadores (da API: campo `maxPl`) |
| gameType | varchar | nullable | Tipo de jogo: "NLH" ou "PLO" (da API: campo `type`) |
| blindLevelMinutes | integer | nullable | Duracao de cada nivel de blind em minutos (da API: campo `temponivelmMeta`) |

**Regras de negocio:**
- Todos os campos sao nullable — torneios manuais e de outras redes nao tem esses dados
- Torneios criados manualmente continuam funcionando sem preencher esses campos
- O campo `gameType` armazena o tipo simplificado: "NLH" ou "PLO" (a API retorna "PLO5", mapear para "PLO")
- O campo `blindLevelMinutes` armazena o valor original da API (temponivelmMeta), que atualmente so e usado para derivar o speed mas e perdido apos o mapeamento
- O horario de fim do late registration e CALCULADO no frontend/exibicao: `startTime + lateRegMinutes minutos`. NAO armazenar como campo separado pois e derivado

**Criterio de aceitacao:**
- [ ] 5 novos campos adicionados ao schema Drizzle em shared/schema.ts
- [ ] Campos adicionados ao insertPlannedTournamentSchema (todos opcionais)
- [ ] Tipo PlannedTournament inclui os 5 novos campos como nullable
- [ ] Migracao aplicada sem perder dados existentes (todos nullable, sem default)
- [ ] Torneios manuais existentes continuam funcionando com campos null

### RF-02: Novos campos no schema session_tournaments
**Descricao:** Espelhar os mesmos campos enriquecidos na tabela session_tournaments, pois torneios do Grind Live podem vir da grade (via Suprema) ou ser adicionados diretamente.

**Campos novos (identicos ao RF-01):**

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| lateRegMinutes | integer | nullable | Minutos de late registration |
| startingStack | integer | nullable | Stack inicial |
| maxPlayers | integer | nullable | Maximo de jogadores |
| gameType | varchar | nullable | "NLH" ou "PLO" |
| blindLevelMinutes | integer | nullable | Duracao de cada nivel de blind em minutos |

**Regras de negocio:**
- Quando um torneio e importado da grade (fromPlannedTournament=true), os campos enriquecidos devem ser copiados do planned_tournament de origem
- Torneios adicionados manualmente no Grind Live continuam sem esses campos (null)

**Criterio de aceitacao:**
- [ ] 5 campos adicionados ao schema de sessionTournaments
- [ ] Campos incluidos no insertSessionTournamentSchema (opcionais)
- [ ] Ao importar torneio da grade para sessao, campos enriquecidos sao preservados

### RF-03: Atualizar mapeamento da API Pokerbyte
**Descricao:** Expandir o mapeamento no backend (supremaMapper.ts) e no frontend (SupremaImportModal.tsx) para incluir os novos campos.

**Mapeamento expandido:**

| Campo API (Pokerbyte) | Campo Grindfy | Transformacao |
|---|---|---|
| late | lateRegMinutes | Direto (integer). Se null/undefined/0 → null |
| stack | startingStack | Direto (integer). Se null/undefined/0 → null |
| maxPl | maxPlayers | Direto (integer). Se null/undefined/0 → null |
| type | gameType | "NLH" → "NLH", "PLO5" → "PLO", qualquer outro → null |
| temponivelmMeta | blindLevelMinutes | Direto (integer). Se null/undefined/0 → null |

**Regras de negocio:**
- O mapeamento de `speed` (Normal/Turbo/Hyper) a partir de `temponivelmMeta` continua existindo — `blindLevelMinutes` e o valor original preservado alem do speed derivado
- Valores 0 sao tratados como "nao informado" (null), pois 0 minutos de late reg ou 0 de stack nao fazem sentido
- A interface `MappedSupremaTournament` (backend) e `MappedTournament` (frontend) devem incluir os 5 novos campos
- O endpoint GET /api/suprema/tournaments continua retornando dados raw da API (o mapeamento ocorre no frontend ao importar). Isso nao muda.

**Criterio de aceitacao:**
- [ ] MappedSupremaTournament inclui lateRegMinutes, startingStack, maxPlayers, gameType, blindLevelMinutes
- [ ] MappedTournament (frontend) inclui os mesmos 5 campos
- [ ] mapSupremaTournament() popula os novos campos corretamente
- [ ] mapRawTournament() (frontend) popula os novos campos corretamente
- [ ] Valores null/undefined/0 resultam em null nos campos mapeados
- [ ] "PLO5" mapeado para "PLO" em gameType

### RF-04: Exibicao enriquecida no SupremaImportModal
**Descricao:** Mostrar os novos dados no modal de importacao para que o jogador tome decisoes informadas antes de importar.

**Informacoes a exibir por torneio no modal:**

Layout atual (mantido):
```
[HH:mm] [$BuyIn] [Nome] [R$ GTD] [Tipo badge] [Speed badge]
```

Layout enriquecido (nova linha abaixo de cada torneio):
```
[HH:mm] [$BuyIn] [Nome] [R$ GTD] [Tipo badge] [Speed badge] [Game badge]
  Late: HH:mm (Xmin) | Stack: Xk | Max: X jogadores | Blinds: Xmin
```

**Regras de exibicao:**

| Dado | Formato de exibicao | Condicao |
|---|---|---|
| Late Registration | "Late: HH:mm (Xmin)" onde HH:mm = startTime + X minutos | Somente se lateRegMinutes > 0 e != null |
| Stack Inicial | "Stack: Xk" (dividir por 1000 se >= 1000, senao valor direto) | Somente se startingStack != null |
| Max Jogadores | "Max: X jogadores" | Somente se maxPlayers != null |
| Game Type | Badge: "NLH" (azul) ou "PLO" (roxo) | Somente se gameType != null |
| Blind Level | "Blinds: Xmin" | Somente se blindLevelMinutes != null |

**Regras de negocio:**
- A segunda linha so aparece se pelo menos 1 dos campos enriquecidos estiver preenchido
- Se nenhum campo enriquecido disponivel, layout permanece identico ao atual (sem linha extra)
- O horario de fim do late registration e calculado: `startTime + lateRegMinutes` e formatado como HH:mm
- Campos individuais que forem null sao omitidos (nao exibir "Late: --" ou "Stack: --")
- Separador entre campos: " | " (pipe com espacos)
- Cor do texto da segunda linha: texto secundario (text-muted-foreground, padrao do projeto)
- Badge de gameType: "NLH" em azul claro (bg-blue-100 text-blue-700), "PLO" em roxo (bg-purple-100 text-purple-700)

**Criterio de aceitacao:**
- [ ] Torneio com late=60 e startTime 19:00 exibe "Late: 20:00 (60min)"
- [ ] Torneio com stack=10000 exibe "Stack: 10k"
- [ ] Torneio com stack=5000 exibe "Stack: 5k"
- [ ] Torneio com stack=500 exibe "Stack: 500"
- [ ] Torneio com maxPl=500 exibe "Max: 500 jogadores"
- [ ] Torneio com type="NLH" exibe badge "NLH" azul
- [ ] Torneio com type="PLO5" exibe badge "PLO" roxo
- [ ] Torneio com temponivelmMeta=12 exibe "Blinds: 12min"
- [ ] Torneio sem nenhum campo enriquecido nao exibe segunda linha
- [ ] Torneio com apenas late reg (demais null) exibe segunda linha somente com late reg

### RF-05: Exibicao enriquecida no Grade Planner
**Descricao:** Mostrar informacoes enriquecidas dos torneios Suprema na grid de planejamento do GradePlanner.

**Onde exibir:**
- Na celula/card de cada torneio planejado que tenha campos enriquecidos
- No tooltip ou popover ao passar o mouse sobre o torneio (se houver)
- No dialog de edicao/detalhes do torneio

**Informacoes a exibir no card do torneio (resumo):**

```
19:00 | $22 | Torneio Name
[PKO] [Turbo] [NLH]
Late ate 20:00
```

**Regras de negocio:**
- Exibir "Late ate HH:mm" abaixo do nome do torneio, somente se lateRegMinutes != null e > 0
- O badge de gameType (NLH/PLO) aparece junto aos badges existentes (tipo, speed)
- No dialog de detalhes/edicao, exibir todos os campos enriquecidos disponiveis em formato de lista
- Para torneios manuais (sem dados enriquecidos), a exibicao permanece identica a atual
- A informacao de late registration e a mais critica — deve ter destaque visual (icone de relogio + texto)
- Se o horario atual ja passou do deadline de late reg, exibir em vermelho: "Late encerrado"
- Se faltam menos de 30 minutos para o late reg encerrar, exibir em amarelo/laranja: "Late ate HH:mm (em Xmin)"

**Criterio de aceitacao:**
- [ ] Torneio Suprema com late=60 exibe "Late ate 20:00" na grade
- [ ] Torneio manual sem dados enriquecidos nao exibe nada extra
- [ ] Badge NLH/PLO aparece junto a badges de tipo e speed
- [ ] Dialog de detalhes mostra stack, max players, blind level quando disponiveis
- [ ] Late reg expirado aparece em vermelho com "Late encerrado"
- [ ] Late reg proximo (<30min) aparece em amarelo/laranja

### RF-06: Exibicao enriquecida no Grind Live
**Descricao:** Mostrar informacoes enriquecidas dos torneios na sessao ao vivo (GrindSessionLive), onde o timing do late registration e critico.

**Onde exibir:**
- No card de cada torneio na lista de torneios ativos/upcoming da sessao
- Destaque especial para o deadline de late registration

**Informacoes a exibir no card do torneio:**

```
19:00 | $22 | Torneio Name | [PKO] [Turbo] [NLH]
Stack: 10k | Max: 500 | Blinds: 12min
⏰ Late ate 20:00 (faltam 32min)
```

**Regras de negocio:**
- **Late registration e a informacao MAIS importante no Grind Live** — e o que determina se o jogador ainda pode entrar
- Exibir countdown em tempo real: "faltam Xmin" atualizado a cada minuto
- Cores do late reg no Grind Live:
  - Verde: mais de 30 minutos restantes
  - Amarelo/laranja: entre 10 e 30 minutos restantes
  - Vermelho: menos de 10 minutos restantes
  - Cinza riscado: late registration encerrado (horario ja passou)
- Stack, max players e blind level exibidos em linha secundaria
- Badge de gameType (NLH/PLO) junto aos badges existentes
- Para torneios com status "registered" ou "active", o late reg nao e mais relevante — nao exibir
- Somente exibir late reg para torneios com status "upcoming"

**Criterio de aceitacao:**
- [ ] Torneio com late=60 e startTime 19:00 exibe "Late ate 20:00 (faltam Xmin)" com countdown
- [ ] Countdown atualiza a cada minuto sem reload da pagina
- [ ] Cor verde quando faltam >30min
- [ ] Cor amarela quando faltam 10-30min
- [ ] Cor vermelha quando faltam <10min
- [ ] Texto riscado em cinza quando late encerrou
- [ ] Torneio com status "registered" nao exibe late reg
- [ ] Stack, max players e blind level exibidos na segunda linha
- [ ] Badge NLH/PLO visivel

### RF-07: Importacao preserva dados enriquecidos
**Descricao:** Garantir que o fluxo completo de importacao (API → modal → planned_tournament → session_tournament) preserva todos os campos enriquecidos.

**Fluxos:**

1. **API → Modal → POST /api/planned-tournaments**: Os 5 campos enriquecidos devem ser incluidos no body do POST ao criar torneio planejado
2. **Grade → Grind Live (importar torneios planejados para sessao)**: Ao carregar torneios planejados na sessao de grind, os campos enriquecidos devem ser copiados para session_tournaments
3. **Suprema → Grind Live (importacao direta)**: Ao importar torneios da Suprema diretamente no Grind Live (sem passar pela grade), os mesmos campos devem ser populados

**Regras de negocio:**
- O endpoint POST /api/planned-tournaments deve aceitar os 5 novos campos opcionais no body
- O endpoint que cria session_tournaments a partir de planned_tournaments deve copiar os campos enriquecidos
- O SupremaImportModal no GrindLive deve enviar os campos enriquecidos da mesma forma que no GradePlanner

**Criterio de aceitacao:**
- [ ] POST /api/planned-tournaments aceita lateRegMinutes, startingStack, maxPlayers, gameType, blindLevelMinutes
- [ ] Torneio salvo via POST tem os campos enriquecidos persistidos no banco
- [ ] GET /api/planned-tournaments retorna os campos enriquecidos
- [ ] Torneio importado da grade para sessao preserva todos os campos enriquecidos
- [ ] Importacao direta Suprema → Grind Live preserva campos enriquecidos

## Requisitos Nao-Funcionais
- **Performance:** Nenhum impacto — os novos campos ja vem na mesma chamada da API (sem requests adicionais)
- **Retrocompatibilidade:** Torneios existentes (manuais e Suprema) continuam funcionando — todos os campos novos sao nullable
- **Consistencia de dados:** O calculo de late reg deadline e sempre feito no frontend (startTime + lateRegMinutes) para evitar inconsistencias de timezone

## Endpoints Afetados
| Metodo | Rota | Alteracao |
|---|---|---|
| GET | /api/suprema/tournaments | Nenhuma (ja retorna dados raw com todos os campos) |
| POST | /api/planned-tournaments | Aceitar 5 novos campos opcionais no body |
| GET | /api/planned-tournaments | Retornar 5 novos campos (automatico via Drizzle) |
| PUT | /api/planned-tournaments/:id | Aceitar 5 novos campos opcionais (incluindo lateRegMinutes editavel) |
| POST | /api/grind-sessions (session tournaments) | Aceitar/copiar 5 novos campos |
| GET | /api/grind-sessions/:id/tournaments | Retornar 5 novos campos |
| PUT | /api/user-settings | Aceitar 3 novos campos: lateRegAlertMinutes, lateRegAlertEnabled, lateRegAlertSound |
| GET | /api/user-settings | Retornar 3 novos campos com defaults |

## Modelos de Dados Afetados

### planned_tournaments (alteracao — 5 novos campos)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| lateRegMinutes | integer | nullable | Minutos de late registration |
| startingStack | integer | nullable | Stack inicial do torneio |
| maxPlayers | integer | nullable | Max jogadores permitidos |
| gameType | varchar | nullable | "NLH" ou "PLO" |
| blindLevelMinutes | integer | nullable | Duracao de cada nivel de blind |

### session_tournaments (alteracao — 5 novos campos identicos)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| lateRegMinutes | integer | nullable | Minutos de late registration |
| startingStack | integer | nullable | Stack inicial do torneio |
| maxPlayers | integer | nullable | Max jogadores permitidos |
| gameType | varchar | nullable | "NLH" ou "PLO" |
| blindLevelMinutes | integer | nullable | Duracao de cada nivel de blind |

### planned_tournaments (alteracao adicional — 1 campo de alerta)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| alertMinutesBefore | integer | nullable | Override por torneio: minutos antes do deadline. Null = usa default global |

### session_tournaments (alteracao adicional — 1 campo de alerta)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| alertMinutesBefore | integer | nullable | Override por torneio (copiado de planned_tournament) |

### user_settings (alteracao — 3 novos campos)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| lateRegAlertMinutes | integer | default 10 | Default global: minutos antes do deadline |
| lateRegAlertEnabled | boolean | default true | Master switch: habilitar/desabilitar alertas |
| lateRegAlertSound | boolean | default true | Habilitar/desabilitar som no alerta |

## Integracoes Externas
Nenhuma nova. A mesma API Pokerbyte ja retorna todos os campos necessarios.

## Cenarios de Teste Derivados

### Happy Path
- [ ] Torneio Suprema importado com late=60, stack=10000, maxPl=500, type="NLH", temponivelmMeta=12 — todos os 5 campos salvos corretamente
- [ ] Torneio exibido no Grade Planner com "Late ate 20:00", badge NLH, e detalhes no dialog
- [ ] Torneio exibido no Grind Live com countdown de late reg e cores corretas
- [ ] Torneio movido da grade para sessao preserva todos os campos

### Validacao de Input
- [ ] POST /api/planned-tournaments sem campos enriquecidos (todos null) funciona normalmente
- [ ] POST /api/planned-tournaments com lateRegMinutes=-5 (invalido) rejeita ou ignora
- [ ] POST /api/planned-tournaments com gameType="INVALID" rejeita ou ignora

### Regras de Negocio - Mapeamento
- [ ] API late=0 → lateRegMinutes=null (zero tratado como "nao informado")
- [ ] API late=null → lateRegMinutes=null
- [ ] API late=60 → lateRegMinutes=60
- [ ] API late=120 → lateRegMinutes=120
- [ ] API stack=0 → startingStack=null
- [ ] API stack=10000 → startingStack=10000
- [ ] API maxPl=0 → maxPlayers=null
- [ ] API maxPl=500 → maxPlayers=500
- [ ] API type="NLH" → gameType="NLH"
- [ ] API type="PLO5" → gameType="PLO"
- [ ] API type=null → gameType=null
- [ ] API type="OUTRO" → gameType=null
- [ ] API temponivelmMeta=12 → blindLevelMinutes=12 E speed="Normal"
- [ ] API temponivelmMeta=0 → blindLevelMinutes=null E speed="Normal"

### Regras de Negocio - Exibicao Late Reg
- [ ] Late reg deadline calculado corretamente: startTime 19:00 + 60min = 20:00
- [ ] Late reg deadline calculado corretamente: startTime 23:30 + 90min = 01:00 (dia seguinte)
- [ ] Cor verde quando faltam >30min para late encerrar
- [ ] Cor amarela quando faltam 10-30min
- [ ] Cor vermelha quando faltam <10min
- [ ] Texto riscado quando late ja encerrou
- [ ] Late reg nao exibido para torneios com status "registered" ou "active"
- [ ] Late reg nao exibido quando lateRegMinutes e null

### Regras de Negocio - Exibicao Stack
- [ ] Stack 10000 exibido como "10k"
- [ ] Stack 15000 exibido como "15k"
- [ ] Stack 5000 exibido como "5k"
- [ ] Stack 500 exibido como "500" (sem "k")
- [ ] Stack null — campo omitido

### Regras de Negocio - Edicao Late Reg (RF-08)
- [ ] Alterar lateRegMinutes de 60 para 90 recalcula deadline corretamente
- [ ] Limpar campo salva como null e remove exibicao
- [ ] Valor -5 rejeitado pelo frontend (validacao) e pelo backend (schema Zod)
- [ ] Valor 1000 rejeitado (max 999)
- [ ] Torneio manual pode receber lateRegMinutes pela primeira vez
- [ ] Edicao via PUT /api/planned-tournaments/:id persiste o novo valor

### Regras de Negocio - Preferencia de Alerta (RF-09)
- [ ] Default lateRegAlertMinutes=10 para usuario sem configuracao
- [ ] Default lateRegAlertEnabled=true para usuario sem configuracao
- [ ] Default lateRegAlertSound=true para usuario sem configuracao
- [ ] Alterar para 20 minutos persiste via PUT /api/user-settings
- [ ] Desabilitar alertas persiste lateRegAlertEnabled=false
- [ ] Desabilitar som persiste lateRegAlertSound=false
- [ ] Preferencia carregada corretamente ao abrir Grind Live
- [ ] Override por torneio: alertMinutesBefore=5 salvo via PUT /api/planned-tournaments/:id
- [ ] Torneio com alertMinutesBefore=5 alerta 5min antes (ignora default 10)
- [ ] Torneio com alertMinutesBefore=null usa default global de 10
- [ ] lateRegAlertEnabled=false desabilita TODOS, mesmo com override por torneio

### Regras de Negocio - Notificacao Late Reg (RF-10)
- [ ] Toast disparado exatamente quando minutesRemaining <= threshold resolvido
- [ ] Toast exibe nome do torneio, deadline HH:mm e minutos restantes
- [ ] Botao "Registrar" no toast muda status para "registered"
- [ ] Som de 880Hz/200ms toca quando lateRegAlertSound=true
- [ ] Som NAO toca quando lateRegAlertSound=false
- [ ] Browser notification aparece com titulo, body e icone corretos
- [ ] Browser notification NAO aparece quando permissao negada (sem erro)
- [ ] Clicar na browser notification foca a aba do Grindfy
- [ ] Permissao solicitada apenas 1 vez ao abrir Grind Live
- [ ] Segundo alerta NAO disparado para mesmo torneio (deduplicacao por ID)
- [ ] Alterar lateRegMinutes permite novo alerta se deadline ainda no futuro
- [ ] Alertas desabilitados → nenhum toast/som/browser notification aparece
- [ ] Sessao nao ativa → timer nao roda
- [ ] Torneio "registered" → sem alerta
- [ ] Torneio "active" → sem alerta
- [ ] Late reg ja encerrado quando sessao inicia → sem alerta

### Edge Cases
- [ ] Torneio manual (sem dados enriquecidos) nao mostra nenhuma informacao extra
- [ ] Torneio Suprema antigo (importado antes dessa feature) tem campos null — funciona sem erro
- [ ] Torneio com todos os campos enriquecidos preenchidos exibe todos
- [ ] Torneio com apenas late reg preenchido (demais null) exibe so late reg
- [ ] Late reg que cruza meia-noite (startTime 23:00 + late 120min = 01:00) calcula corretamente
- [ ] Countdown de late reg atualiza a cada minuto sem memory leak (cleanup de interval)
- [ ] Multiple torneios com countdown simultaneo no Grind Live funcionam sem lag
- [ ] Timer de alerta limpo ao sair do Grind Live (cleanup do useEffect)
- [ ] 10+ torneios com late reg na mesma sessao — alertas disparam em sequencia sem conflito
- [ ] Usuario edita lateRegMinutes para valor que ja passou — nao dispara alerta
- [ ] Usuario recarrega pagina do Grind Live — timer reinicia, alertas resetam (aceitavel)

### RF-08: Edicao do horario de late registration
**Descricao:** Permitir que o usuario edite o valor de lateRegMinutes em torneios planejados e em torneios de sessao, pois o valor da API pode estar desatualizado ou o jogador pode querer ajustar baseado em informacao propria.

**Onde permitir edicao:**
1. **Grade Planner — dialog de edicao do torneio:** Campo editavel "Late Reg (minutos)" com input numerico
2. **Grind Live — dialog de edicao do torneio:** Mesmo campo editavel

**Regras de negocio:**
- O campo e editavel apenas como "minutos de late registration" (integer)
- O deadline (horario de fim) e recalculado automaticamente ao alterar: `startTime + novoValor`
- Valor minimo: 0 (sem late reg). Valor maximo: 999
- Se o usuario limpar o campo, salvar como null (sem late reg)
- A edicao atualiza via PUT /api/planned-tournaments/:id (grade) ou PUT do session_tournament (grind live)
- Torneios manuais (sem dados da Suprema) tambem podem ter lateRegMinutes preenchido manualmente
- Ao editar, o countdown e notificacoes recalculam imediatamente com o novo valor

**Criterio de aceitacao:**
- [ ] Dialog de edicao no Grade Planner tem campo "Late Reg (min)" editavel
- [ ] Dialog de edicao no Grind Live tem campo "Late Reg (min)" editavel
- [ ] Alterar de 60 para 90 recalcula deadline (19:00 + 90 = 20:30)
- [ ] Limpar campo salva como null e remove exibicao de late reg
- [ ] Valor negativo rejeitado (validacao no frontend e backend)
- [ ] Valor > 999 rejeitado
- [ ] Torneio manual pode receber lateRegMinutes pela primeira vez

### RF-09: Preferencia de alerta de late registration (global + por torneio)
**Descricao:** Sistema de configuracao de alertas em dois niveis: preferencia global (default em user_settings) e override por torneio individual.

**Nivel 1 — Preferencia global (user_settings):**

| Campo | Tipo | Default | Notas |
|---|---|---|---|
| lateRegAlertMinutes | integer | 10 | Default de minutos antes do deadline para alerta |
| lateRegAlertEnabled | boolean | true | Habilitar/desabilitar alertas globalmente |
| lateRegAlertSound | boolean | true | Habilitar/desabilitar som no alerta |

**Onde configurar global:**
- Pagina de Settings (`/settings`) — nova secao "Alertas de Sessao"
- Select de tempo default: 5min, 10min (default), 15min, 20min, 30min
- Toggle habilitar/desabilitar alertas de late reg
- Toggle habilitar/desabilitar som

**Nivel 2 — Override por torneio (campo em planned_tournaments e session_tournaments):**

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| alertMinutesBefore | integer | nullable | Override: minutos antes do deadline para este torneio. Se null, usa o default global |

**Onde configurar por torneio:**
- No dialog de edicao do torneio (Grade Planner e Grind Live), campo "Alerta (min antes)" com:
  - Placeholder mostrando o valor global: "Default: 10min"
  - Input numerico para override
  - Botao "Usar default" para limpar o override (salvar como null)

**Hierarquia de resolucao:**
1. Se `alertMinutesBefore` do torneio != null → usa o valor do torneio
2. Se `alertMinutesBefore` do torneio == null → usa `lateRegAlertMinutes` do user_settings
3. Se `lateRegAlertEnabled` == false → nenhum alerta, independente do valor por torneio

**Regras de negocio:**
- Configuracao global e por usuario, persistida em user_settings
- Override por torneio e persistido em planned_tournaments / session_tournaments
- Se o usuario desabilitar globalmente (lateRegAlertEnabled=false), NENHUM alerta dispara, mesmo torneios com override
- O toggle global e o "master switch" — o override por torneio so define QUANDO alertar, nao SE alertar
- Valor minimo: 1 minuto. Valor maximo: 120 minutos
- Ao importar torneios da Suprema, alertMinutesBefore fica null (usa default global)

**Criterio de aceitacao:**
- [ ] Secao "Alertas de Sessao" visivel na pagina Settings
- [ ] Select com opcoes: 5, 10, 15, 20, 30 minutos (default global)
- [ ] Toggle habilitar/desabilitar alertas globalmente
- [ ] Toggle habilitar/desabilitar som
- [ ] Preferencia global salva via PUT /api/user-settings
- [ ] Default 10 minutos para usuarios que nunca configuraram
- [ ] Dialog de edicao de torneio tem campo "Alerta (min antes)" com placeholder do default
- [ ] Override por torneio salvo via PUT /api/planned-tournaments/:id
- [ ] Torneio com alertMinutesBefore=5 usa 5min (ignora default global de 10)
- [ ] Torneio com alertMinutesBefore=null usa default global
- [ ] lateRegAlertEnabled=false desabilita TODOS os alertas, mesmo com override por torneio

### RF-10: Notificacao de late registration no Grind Live (visual + sonora + browser)
**Descricao:** Disparar alerta visual (toast), sonoro (beep) e browser notification quando o deadline de late registration de um torneio upcoming esta proximo, baseado na preferencia do usuario (RF-09).

**Mecanismo de alerta:**
- **Timer client-side** (setInterval a cada 30 segundos) que verifica todos os torneios upcoming na sessao ativa
- Para cada torneio com lateRegMinutes != null e status "upcoming":
  - Calcula `lateRegDeadline = startTime + lateRegMinutes`
  - Calcula `minutesRemaining = lateRegDeadline - now`
  - Resolve o threshold de alerta: `torneio.alertMinutesBefore ?? userSettings.lateRegAlertMinutes`
  - Se `minutesRemaining <= threshold` e alerta ainda nao foi disparado para este torneio → dispara

**Camada 1 — Toast in-app (sempre):**
- **Toast notification** (use-toast.ts, ja existe no projeto) com:
  - Variante: "destructive" (vermelha, urgente)
  - Titulo: "Late Reg Encerrando!"
  - Descricao: "[Nome do Torneio] — Late ate HH:mm (faltam Xmin)"
  - Duracao: 30 segundos (auto-dismiss) ou ate o usuario fechar
  - Acao: botao "Registrar" que muda o status do torneio para "registered"

**Camada 2 — Som (se habilitado):**
- Reproduzir som de alerta curto (beep/chime, ~1 segundo) usando Web Audio API
- Som gerado programaticamente (oscillator tone) — sem necessidade de arquivo de audio externo
- Frequencia: 880Hz (La5), duracao 200ms, com fade-out para nao ser abrupto
- Tocar APENAS se `lateRegAlertSound == true` no user_settings
- Se o browser bloquear autoplay de audio, falhar silenciosamente (sem erro)

**Camada 3 — Browser Notification (se permitido):**
- Usar API nativa `Notification` do browser para mostrar notificacao do sistema operacional
- Titulo: "Grindfy — Late Reg Encerrando!"
- Body: "[Nome do Torneio] — Late ate HH:mm (faltam Xmin)"
- Icon: logo do Grindfy (attached_assets/grindfy-logo.png)
- Ao clicar na notification, focar a aba do Grindfy (window.focus)
- **Permissao:** Solicitar `Notification.requestPermission()` ao abrir Grind Live pela primeira vez
  - Se usuario concede → browser notifications ativas
  - Se usuario nega → funciona apenas com toast + som (sem erro, degradacao graceful)
  - Se `Notification.permission == "denied"` → nao solicitar novamente, usar apenas toast + som
- Browser notification e COMPLEMENTAR ao toast — ambos disparam juntos. O toast e garantido (sempre funciona), a browser notification depende de permissao

**Regras de negocio:**
- Cada torneio so dispara alerta UMA VEZ por sessao (manter Set de IDs ja alertados em estado local)
- O threshold de minutos vem do override do torneio (alertMinutesBefore) ou do default global (lateRegAlertMinutes)
- Se o usuario muda lateRegMinutes (RF-08), o alerta recalcula com o novo valor. Se o novo deadline ainda esta no futuro e dentro do range de alerta, dispara novamente (resetar o ID do torneio no Set de alertados)
- Se o usuario desabilita alertas globalmente (lateRegAlertEnabled=false), o timer nao roda — nenhum alerta
- Se a sessao nao esta ativa (status != "active"), o timer nao roda
- Se o torneio ja esta "registered" ou "active", nao dispara alerta
- Se lateRegDeadline ja passou quando a sessao inicia, nao dispara alerta
- O timer deve ser limpo (clearInterval) no cleanup do useEffect para evitar memory leaks
- NAO usar o sistema de notificacoes do banco (tabela notifications) — este alerta e transiente, client-side only
- As 3 camadas (toast, som, browser notification) disparam simultaneamente num unico evento de alerta

**Criterio de aceitacao:**
- [ ] Toast vermelho aparece X minutos antes do late reg encerrar
- [ ] Toast exibe nome do torneio, deadline e minutos restantes
- [ ] Botao "Registrar" no toast muda status do torneio para "registered"
- [ ] Som de alerta toca quando lateRegAlertSound=true
- [ ] Som NAO toca quando lateRegAlertSound=false
- [ ] Browser notification aparece quando permissao concedida
- [ ] Browser notification NAO aparece quando permissao negada (sem erro)
- [ ] Clicar na browser notification foca a aba do Grindfy
- [ ] Permissao de notification solicitada apenas 1 vez ao abrir Grind Live
- [ ] Cada torneio dispara alerta apenas uma vez
- [ ] Torneio com alertMinutesBefore=5 alerta 5min antes (ignora default global)
- [ ] Torneio com alertMinutesBefore=null usa default global
- [ ] Alterar lateRegMinutes permite novo alerta se deadline ainda no futuro
- [ ] Desabilitar alertas globalmente impede TODOS os alertas (toast, som, browser)
- [ ] Timer limpo ao sair da pagina (sem memory leak)
- [ ] Timer nao roda se sessao nao esta ativa
- [ ] Torneios ja registrados nao disparam alerta
- [ ] Multiplos torneios podem disparar alertas em sequencia

## Requisitos Nao-Funcionais (atualizados)

Alem dos requisitos nao-funcionais originais:

- **Late reg alerts:** Timer client-side (setInterval 30s) — leve o suficiente para nao impactar performance mesmo com muitos torneios. Nao requer WebSocket nem polling de API.
- **Confiabilidade do alerta:** Se o usuario sai e volta ao Grind Live, o timer reinicia e verifica deadlines restantes. Alertas ja disparados sao perdidos (Set resetado) — aceitavel pois o countdown visual continua funcionando independente.

## Fora de Escopo
- Notificacao por email/push notification nativa de plataforma (apenas browser Notification API + toast + som)
- Persistencia de alertas ja disparados entre reloads (Set em memoria, resetado ao recarregar)
- Filtragem por game type (NLH/PLO) no Grade Planner (ja existe no modal de importacao)
- Calculo de late reg para torneios de outras redes (apenas Suprema fornece esse dado via API)
- Adicionar campos enriquecidos a tabela `tournaments` (historico de torneios jogados) — escopo diferente
- Arquivo de audio customizavel (som gerado via Web Audio API, sem upload de audio)
- Alertas fora do Grind Live (ex: alertar na pagina de Grade Planner)

## Dependencias
- Schema atual de planned_tournaments e session_tournaments (ja existem)
- Integracao Suprema Poker funcional (spec anterior, status Concluida)
- Campo externalId no schema (ja existe)

## Notas de Implementacao

1. **Calculo de late reg deadline:** Usar `addMinutes(startTime, lateRegMinutes)` do date-fns (ja no projeto). Atentar para torneios que cruzam meia-noite.

2. **Countdown no Grind Live:** Usar `useEffect` com `setInterval` de 60 segundos. Limpar interval no cleanup. Calcular `differenceInMinutes(lateRegDeadline, now)` do date-fns.

3. **Timer de alerta:** Separar do countdown. Usar `setInterval` de 30 segundos dedicado. Manter `Set<string>` de IDs ja alertados como `useRef` para nao causar re-renders. Resetar o Set quando lateRegMinutes de um torneio e editado.

4. **Migracao:** Os 15 novos campos (6 em cada tabela de torneios + 3 em user_settings) sao todos nullable ou com default, entao `db:push` adicionara sem risco. Dados existentes ficam com null/default.

5. **Consistencia frontend/backend:** O mapeamento duplicado (supremaMapper.ts no backend e mapRawTournament no frontend) precisa ser atualizado nos dois lugares. Considerar mover o mapeamento inteiramente para o backend no futuro.

6. **Toast de alerta:** Usar o `useToast` existente com variant "destructive". O toast atual tem TOAST_LIMIT=1 — considerar aumentar para 3 durante sessao ativa, ou usar fila onde alertas aparecem em sequencia.

7. **Infraestrutura existente aproveitada:** O break timer no GrindLive (setInterval cada 60s, linha 391) ja demonstra o padrao. O alerta de late reg segue a mesma arquitetura, apenas com intervalo de 30s e logica diferente.

8. **Som via Web Audio API:** Criar helper `playAlertSound()` que usa `AudioContext` + `OscillatorNode` (880Hz, sine wave, 200ms com gain fade-out). Sem dependencia de arquivo de audio. Tratar erro de autoplay silenciosamente (`catch(() => {})`).

9. **Browser Notification API:** Solicitar permissao com `Notification.requestPermission()` no `useEffect` de montagem do GrindLive. Se `Notification.permission === 'granted'`, criar `new Notification(title, { body, icon })`. Se `denied`, ignorar silenciosamente. Usar `notification.onclick = () => window.focus()` para focar aba ao clicar.

10. **Campo alertMinutesBefore:** Adicionado em planned_tournaments E session_tournaments. Copiado junto com os demais campos enriquecidos ao mover torneio da grade para sessao. No dialog de edicao, exibir com placeholder "Default: Xmin" (onde X = preferencia global do usuario).
