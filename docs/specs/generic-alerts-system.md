# Spec: Sistema de Alertas Genericos no Grind Live

## Status
Aprovada

## Resumo
Expandir o sistema de alertas do Grind Live — atualmente limitado a late registration — para suportar alertas genericos definidos pelo usuario para qualquer horario e motivo, mantendo botoes rapidos de conveniencia para cenarios comuns de late reg. Alertas sao transientes (client-side, por sessao), reutilizando a infraestrutura existente de toast, som e browser notification.

## Contexto
O Grind Live ja possui um sistema de alertas funcional para late registration (RF-09/RF-10 da spec `suprema-enriched-data.md`), implementado com:
- `LateRegAlertManager` em `client/src/lib/lateRegAlerts.ts` — deduplicacao e threshold
- Timer `setInterval` de 30s no `GrindSessionLive.tsx` — verifica deadlines
- 3 camadas de notificacao: toast (shadcn), som (Web Audio API), browser notification
- Configuracoes em `user_settings`: `lateRegAlertMinutes`, `lateRegAlertEnabled`, `lateRegAlertSound`
- Override por torneio via `alertMinutesBefore` em `planned_tournaments` e `session_tournaments`

O jogador pediu a capacidade de criar alertas para qualquer momento (ex: "lembrar de registrar torneio X as 19:45", "break em 30min", "verificar stack as 21:00"), com atalhos rapidos baseados no late reg como conveniencia.

## Usuarios
- **Jogador (user)**: Cria, visualiza e gerencia alertas customizados durante uma sessao de grind ativa

## Requisitos Funcionais

### RF-01: Modelo de alerta generico (client-side)
**Descricao:** Definir a estrutura de um alerta generico que vive em estado local (React) durante a sessao. Alertas NAO sao persistidos no banco — sao transientes e existem apenas enquanto a sessao esta ativa no browser.

**Estrutura do alerta:**

| Campo | Tipo | Obrigatorio | Notas |
|---|---|---|---|
| id | string | Sim | Gerado com `crypto.randomUUID()` ou `nanoid()` |
| type | enum | Sim | `"late-reg"` \| `"custom"` |
| label | string | Sim | Texto curto exibido no alerta (max 80 chars) |
| triggerAt | Date | Sim | Momento exato em que o alerta deve disparar |
| tournamentId | string \| null | Nao | Referencia ao torneio associado (se aplicavel) |
| tournamentName | string \| null | Nao | Nome do torneio (para exibicao no alerta) |
| fired | boolean | Sim | Se o alerta ja foi disparado (default false) |
| dismissed | boolean | Sim | Se o usuario descartou manualmente (default false) |
| createdAt | Date | Sim | Momento de criacao (para ordenacao) |

**Regras de negocio:**
- Alertas vivem em um `useState<Alert[]>` no GrindSessionLive (ou em um hook dedicado `useAlerts`)
- Ao recarregar a pagina, todos os alertas sao perdidos — comportamento aceitavel, consistente com o sistema atual de late reg
- Ao encerrar a sessao, alertas sao descartados
- Limite maximo de 50 alertas ativos por sessao (prevencao de abuso)

**Criterio de aceitacao:**
- [ ] Interface TypeScript `Alert` definida com todos os campos acima
- [ ] Estado local `alerts` inicializado como array vazio ao montar o componente
- [ ] Alertas sao limpos quando a sessao e encerrada ou a pagina desmontada

### RF-02: Criacao de alerta customizado via formulario inline
**Descricao:** O usuario pode criar um alerta customizado preenchendo um mini-formulario inline no painel de alertas do Grind Live.

**Campos do formulario:**

| Campo | Tipo | Obrigatorio | Default | Validacao |
|---|---|---|---|---|
| label | text input | Sim | — | Min 1 char, max 80 chars |
| Modo de horario | radio/toggle | Sim | "horario" | "horario" ou "em X minutos" |
| horario | time input (HH:MM) | Condicional | — | Obrigatorio se modo = "horario". Deve ser no futuro |
| minutosAFrente | number input | Condicional | — | Obrigatorio se modo = "em X minutos". Min 1, max 480 |
| torneio associado | select (opcional) | Nao | Nenhum | Lista torneios da sessao atual |

**Fluxo:**
1. Usuario clica em botao "+ Novo Alerta" no painel de alertas
2. Mini-formulario aparece inline (nao um dialog/modal — manter leve)
3. Usuario preenche label e define horario (absoluto ou relativo)
4. Opcionalmente associa a um torneio da sessao
5. Clica "Criar" — alerta e adicionado ao estado local
6. Formulario fecha e o alerta aparece na lista

**Regras de negocio:**
- Se modo = "em X minutos", `triggerAt` = `new Date(Date.now() + minutos * 60000)`
- Se modo = "horario", `triggerAt` = hoje com o horario informado. Se o horario ja passou, rejeitar com erro "Horario ja passou"
- O campo `type` e setado como `"custom"`
- Se um torneio e associado, preencher `tournamentId` e `tournamentName`
- Ao criar, validar que o limite de 50 alertas nao foi atingido

**Criterio de aceitacao:**
- [ ] Formulario inline com campos label, modo de horario, horario/minutos, torneio opcional
- [ ] Modo "horario" cria alerta com triggerAt no horario absoluto informado
- [ ] Modo "em X minutos" cria alerta com triggerAt relativo ao momento atual
- [ ] Horario no passado e rejeitado com mensagem de erro
- [ ] Limite de 50 alertas exibe mensagem "Limite de alertas atingido"
- [ ] Alerta criado aparece imediatamente na lista

### RF-03: Botoes rapidos de late reg
**Descricao:** Para cada torneio upcoming com `lateRegMinutes > 0` na sessao, exibir botoes de atalho que criam alertas de late reg com um clique. Estes botoes NAO substituem o sistema automatico existente — sao uma conveniencia adicional para criar alertas manuais com labels e horarios pre-preenchidos.

**Botoes rapidos oferecidos (para cada torneio com late reg):**

| Botao | Label gerado | triggerAt |
|---|---|---|
| "5min antes" | "Late Reg: [nome] - 5min" | lateRegDeadline - 5min |
| "10min antes" | "Late Reg: [nome] - 10min" | lateRegDeadline - 10min |
| "15min antes" | "Late Reg: [nome] - 15min" | lateRegDeadline - 15min |

**Regras de negocio:**
- Botoes rapidos so aparecem para torneios com `lateRegMinutes > 0` e `status === "upcoming"`
- Cada botao cria um alerta com `type = "late-reg"` e `tournamentId` preenchido
- Se o `triggerAt` calculado ja passou (deadline - Xmin < now), o botao aparece desabilitado com tooltip "Horario ja passou"
- Se ja existe um alerta com o mesmo `tournamentId` e mesmo `triggerAt` (dentro de 1 minuto de tolerancia), o botao aparece como "Ja criado" e nao cria duplicata
- O botao rapido cria o alerta generico — o disparo usa o mesmo mecanismo do RF-04
- O sistema automatico de late reg (LateRegAlertManager) continua funcionando independentemente. Alertas manuais via botao rapido sao ADICIONAIS ao alerta automatico

**Onde exibir os botoes:**
- No painel de alertas, em uma secao "Atalhos de Late Reg" que lista torneios elegiveis com seus botoes
- Alternativamente, como icone de sino ao lado de cada torneio na lista de torneios da sessao, com dropdown dos 3 botoes

**Decisao tomada:** Exibir como icone de sino ao lado de cada torneio upcoming na lista de torneios da sessao. Ao clicar no sino, aparece um popover com os 3 botoes (5/10/15min). Motivo: menor poluicao visual, contexto proximo ao torneio, nao precisa de secao separada.

**Criterio de aceitacao:**
- [ ] Icone de sino aparece ao lado de torneios upcoming com lateRegMinutes > 0
- [ ] Clicar no sino abre popover com 3 opcoes (5, 10, 15min antes)
- [ ] Cada opcao cria alerta generico com type="late-reg" e dados pre-preenchidos
- [ ] Botao desabilitado se triggerAt ja passou
- [ ] Botao indica "Ja criado" se alerta duplicado existe
- [ ] Sistema automatico de late reg continua funcionando normalmente

### RF-04: Motor de disparo unificado
**Descricao:** Substituir o timer atual que so verifica late reg por um timer unificado que verifica TODOS os alertas (customizados + late reg automaticos). O timer continua com intervalo de 30 segundos.

**Logica do timer (a cada 30s):**
1. Percorrer array de `alerts` no estado local
2. Para cada alerta onde `fired === false` e `dismissed === false`:
   - Se `triggerAt <= now` → disparar alerta
3. Percorrer torneios upcoming com lateRegMinutes (logica existente do LateRegAlertManager)
   - Manter o `LateRegAlertManager` existente para os alertas automaticos
4. Disparar usando as 3 camadas existentes (toast + som + browser notification)

**Regras de negocio:**
- O `LateRegAlertManager` existente continua funcionando para alertas AUTOMATICOS de late reg (baseado em threshold global/override por torneio)
- Alertas genericos (RF-01) sao verificados em paralelo, no mesmo `setInterval`
- Ao disparar um alerta generico, setar `fired = true` no estado
- Alertas genericos usam as mesmas 3 camadas de notificacao, porem com titulo e icone diferenciados:
  - Late reg automatico: titulo "Late Reg Encerrando!" (manter atual)
  - Alerta generico custom: titulo "Lembrete"
  - Alerta generico late-reg (botao rapido): titulo "Late Reg: [nome torneio]"
- O master switch `lateRegAlertEnabled` controla APENAS os alertas automaticos de late reg. Alertas customizados criados manualmente sempre disparam (o usuario criou intencionalmente)
- O toggle de som `lateRegAlertSound` aplica-se a TODOS os alertas (automaticos e customizados). Renomear visualmente na UI de Settings para "Som dos alertas" (sem mudar nome do campo no banco)

**Criterio de aceitacao:**
- [ ] Timer de 30s verifica alertas genericos E late reg automaticos
- [ ] Alerta generico dispara toast + som + browser notification ao atingir triggerAt
- [ ] Alerta generico marcado como fired=true apos disparo
- [ ] Alerta ja disparado nao dispara novamente
- [ ] Alertas customizados disparam mesmo com lateRegAlertEnabled=false
- [ ] Toggle de som afeta todos os tipos de alerta
- [ ] Label na Settings renomeado para "Som dos alertas"

### RF-05: Painel de alertas no Grind Live
**Descricao:** Adicionar um painel/secao no Grind Live que exibe os alertas ativos, permitindo visualizar, criar e gerenciar alertas.

**Layout do painel:**
- Posicao: Card/secao no Grind Live, abaixo ou ao lado dos torneios da sessao
- Titulo: "Alertas" com badge de contagem de alertas pendentes (nao disparados)
- Estado colapsavel: pode ser colapsado para economizar espaco (default expandido)

**Conteudo do painel:**
1. **Botao "+ Novo Alerta"** — abre formulario inline (RF-02)
2. **Lista de alertas pendentes** (fired=false, dismissed=false), ordenados por triggerAt crescente:
   - Icone de tipo (sino para late-reg, relogio para custom)
   - Label do alerta
   - Countdown: "em Xmin" ou horario absoluto "as HH:MM"
   - Botao X para descartar (seta dismissed=true)
3. **Lista de alertas disparados** (fired=true), colapsavel, estilo muted:
   - Mesmo layout mas com visual de "concluido" (texto riscado ou opacidade reduzida)
   - Botao para re-disparar (seta fired=false, permitindo ouvir novamente)
4. **Contagem**: "X pendentes, Y disparados"

**Regras de negocio:**
- Alertas descartados (dismissed=true) desaparecem da lista imediatamente
- Alertas disparados movem-se para a secao "disparados" automaticamente
- Se nao ha alertas, exibir mensagem "Nenhum alerta configurado"
- O painel so aparece quando ha uma sessao ativa
- Countdown atualiza a cada 30s (sincronizado com o timer de verificacao) ou a cada 1 minuto para economia de renders

**Criterio de aceitacao:**
- [ ] Card "Alertas" visivel no Grind Live durante sessao ativa
- [ ] Badge com contagem de alertas pendentes
- [ ] Lista de alertas pendentes ordenada por triggerAt
- [ ] Countdown exibido para cada alerta ("em Xmin" ou "as HH:MM")
- [ ] Botao X descarta alerta (remove da lista)
- [ ] Secao de alertas disparados com visual muted
- [ ] Botao re-disparar seta fired=false
- [ ] Mensagem "Nenhum alerta configurado" quando lista vazia
- [ ] Painel colapsavel

## Requisitos Nao-Funcionais
- **Performance:** O timer de 30s com ate 50 alertas nao deve impactar a responsividade do Grind Live. Toda a logica e O(n) sobre array pequeno — sem preocupacao.
- **UX:** Formulario de criacao deve ser rapido (2-3 cliques para alerta simples). Botoes rapidos de late reg devem ser 1 clique.
- **Acessibilidade:** Toasts devem ter role="alert" (ja implementado pelo shadcn). Browser notifications seguem padrao existente.

## Endpoints Previstos

Nenhum endpoint novo. Todo o sistema e client-side:
- Alertas vivem em estado React local (`useState`)
- Timer usa `setInterval` existente
- Configuracoes de som usam `user_settings` existentes (campo `lateRegAlertSound`)
- Nenhuma tabela nova no banco

## Modelos de Dados Afetados

### Nenhuma alteracao no banco de dados

O sistema e inteiramente client-side. Os campos existentes continuam sendo usados:
- `user_settings.lateRegAlertEnabled` — master switch para alertas AUTOMATICOS de late reg
- `user_settings.lateRegAlertSound` — som para TODOS os alertas
- `user_settings.lateRegAlertMinutes` — threshold default para late reg automatico
- `planned_tournaments.alertMinutesBefore` — override por torneio (late reg automatico)
- `session_tournaments.alertMinutesBefore` — override por torneio (late reg automatico)

### Tipos TypeScript novos (client-side only)

```typescript
// client/src/lib/alerts.ts (novo arquivo)

type AlertType = "late-reg" | "custom";

interface Alert {
  id: string;
  type: AlertType;
  label: string;
  triggerAt: Date;
  tournamentId: string | null;
  tournamentName: string | null;
  fired: boolean;
  dismissed: boolean;
  createdAt: Date;
}

interface CreateAlertInput {
  label: string;
  mode: "absolute" | "relative";
  time?: string;          // HH:MM, obrigatorio se mode="absolute"
  minutesAhead?: number;  // obrigatorio se mode="relative"
  tournamentId?: string;
  tournamentName?: string;
}
```

## Integracoes Externas

Nenhuma. Sistema inteiramente client-side.

## Cenarios de Teste Derivados

### Happy Path
- [ ] Criar alerta customizado com horario absoluto (ex: 21:00) — alerta aparece na lista pendente com countdown correto
- [ ] Criar alerta customizado com tempo relativo (ex: "em 30min") — triggerAt calculado corretamente
- [ ] Alerta dispara ao atingir triggerAt — toast + som + browser notification
- [ ] Botao rapido de late reg cria alerta com label e triggerAt pre-preenchidos
- [ ] Painel exibe alertas pendentes ordenados por triggerAt

### Validacao de Input
- [ ] Label vazio rejeita criacao com erro
- [ ] Label com mais de 80 chars e truncado ou rejeitado
- [ ] Horario no passado rejeita com "Horario ja passou"
- [ ] Minutos = 0 ou negativo rejeitado
- [ ] Minutos > 480 rejeitado
- [ ] Limite de 50 alertas atingido exibe mensagem e impede criacao

### Regras de Negocio
- [ ] Alerta customizado dispara mesmo com lateRegAlertEnabled=false
- [ ] Alerta automatico de late reg NAO dispara com lateRegAlertEnabled=false
- [ ] Som desabilitado (lateRegAlertSound=false) silencia TODOS os alertas
- [ ] Botao rapido desabilitado quando triggerAt ja passou
- [ ] Botao rapido indica "Ja criado" para duplicatas
- [ ] Alerta disparado (fired=true) nao re-dispara no proximo ciclo do timer
- [ ] Alerta descartado (dismissed=true) nao dispara
- [ ] Re-disparar alerta (fired=false) permite novo disparo

### Edge Cases
- [ ] Reload da pagina perde todos os alertas (comportamento aceitavel, documentado)
- [ ] Encerrar sessao limpa todos os alertas
- [ ] 50 alertas simultaneos — timer processa todos sem lag perceptivel
- [ ] Dois alertas com mesmo triggerAt — ambos disparam no mesmo ciclo de 30s
- [ ] Alerta criado com triggerAt no passado imediato (ex: "em 0min") — nao deve ser permitido (validacao min 1min)
- [ ] Torneio removido da sessao — alertas associados continuam (tipo generico, independente do torneio)
- [ ] Tab em background — browser notification funciona, toast acumula ao voltar

## Fora de Escopo
- Persistencia de alertas no banco de dados (alertas sao transientes por sessao)
- Alertas fora do Grind Live (ex: no Grade Planner ou Dashboard)
- Alertas recorrentes (ex: "a cada 1h lembrar de...")
- Alertas com sons customizados (usa o mesmo beep do late reg)
- Historico de alertas entre sessoes
- Integracao com sistema de notificacoes do banco (tabela `notifications`)
- Alertas via push notification (service worker) quando o app esta fechado
- Configuracao separada de som por tipo de alerta

## Dependencias
- RF-09 e RF-10 da spec `suprema-enriched-data.md` devem estar implementados (sistema de late reg alerts atual). Status: implementado.
- Componentes shadcn usados: Toast, Popover, Switch, Input, Select, Button, Card, Badge, Collapsible

## Notas de Implementacao (opcional)

1. **Hook dedicado `useAlerts`:** Extrair toda a logica de alertas (estado, criacao, disparo, timer) para um hook customizado em `client/src/hooks/useAlerts.ts`. O GrindSessionLive chamaria `const { alerts, createAlert, dismissAlert, pendingCount } = useAlerts(options)`. Isso mantem o GrindSessionLive limpo e facilita testes.

2. **Refatorar `LateRegAlertManager`:** NAO substituir — manter o `LateRegAlertManager` existente para alertas automaticos. O hook `useAlerts` gerencia alertas genericos em paralelo. Ambos usam a mesma funcao de disparo (toast + som + browser notification), que deve ser extraida para uma funcao utilitaria `fireAlert(title, description, soundEnabled)` em `client/src/lib/alerts.ts`.

3. **Funcao utilitaria `fireAlert`:** Extrair as 3 camadas de notificacao (linhas 504-538 do GrindSessionLive.tsx) para uma funcao reutilizavel:
   ```
   fireAlert({ title, description, soundEnabled, duration? })
   ```
   Tanto o LateRegAlertManager quanto os alertas genericos chamam essa mesma funcao.

4. **Popover de botoes rapidos:** Usar o componente Popover do Radix/shadcn ja disponivel no projeto. O icone de sino pode ser o `Bell` do Lucide React.

5. **Countdown no painel:** Calcular `minutesRemaining = Math.ceil((triggerAt - now) / 60000)`. Exibir "em Xmin" se < 60min, "as HH:MM" se >= 60min. Atualizar a cada ciclo do timer (30s).

6. **Label de Settings:** Renomear apenas o texto visual do toggle de som de "Som do alerta de late reg" para "Som dos alertas". O campo no banco (`lateRegAlertSound`) mantem o mesmo nome para evitar migracao desnecessaria.
