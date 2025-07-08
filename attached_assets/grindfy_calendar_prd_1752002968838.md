# PRD - Calendário Inteligente do Grindfy

## 1. Visão Geral do Produto

### 1.1 Problema a ser Resolvido
Jogadores de poker precisam organizar manualmente suas rotinas semanais, combinando sessões de jogo, estudos e descanso, o que resulta em:
- Perda de tempo na organização manual
- Conflitos de horários não identificados
- Falta de visibilidade sobre a distribuição do tempo semanal
- Dificuldade em manter uma rotina equilibrada e de alta performance

### 1.2 Solução Proposta
O Calendário Inteligente é uma ferramenta que gera automaticamente a rotina semanal completa do jogador com base nos dados já inseridos no sistema Grindfy, eliminando a necessidade de organização manual.

### 1.3 Objetivos do Produto
- **Primário**: Automatizar a criação da rotina semanal do jogador
- **Secundários**: 
  - Otimizar a distribuição do tempo entre grind, estudo e descanso
  - Prevenir conflitos de horários
  - Aumentar a aderência à rotina planejada

## 2. Escopo e Funcionalidades

### 2.1 Funcionalidades Principais

#### 2.1.1 Geração Automática de Rotina
- **Descrição**: Sistema coleta dados de múltiplas fontes e gera automaticamente a semana completa
- **Comportamento**: Processo executado automaticamente sempre que há alterações nas fontes de dados
- **Entrada**: Dados da Grade, Estudos e configurações do usuário
- **Saída**: Calendário semanal estruturado com todos os blocos de atividades

#### 2.1.2 Integração com Grade (Grind)
- **Fonte de dados**: Aba Grade do sistema
- **Dados coletados**:
  - Dias planejados para jogar
  - Horário de início de cada sessão
  - Horário de fim de cada sessão
  - Status de ativação/desativação dos dias
- **Processamento**: Criação de blocos de grind no calendário apenas para dias ativos

#### 2.1.3 Integração com Estudos
- **Fonte de dados**: Cartões de estudo
- **Dados coletados**:
  - Dias planejados para estudo
  - Horários definidos para cada sessão de estudo
- **Processamento**: Distribuição equilibrada dos blocos de estudo ao longo da semana

#### 2.1.4 Warm-up Automático
- **Comportamento**: Inserção automática de 15 minutos de preparação antes de cada sessão de grind
- **Configuração**: Tempo fixo de 15 minutos (não customizável na versão inicial)
- **Posicionamento**: Imediatamente antes do horário de início do grind

#### 2.1.5 Descanso Automático
- **Comportamento**: Reserva automática de 3 horas de descanso após cada sessão de grind
- **Configuração**: Tempo fixo de 3 horas (não customizável na versão inicial)
- **Posicionamento**: Imediatamente após o horário de fim do grind

### 2.2 Funcionalidades Secundárias

#### 2.2.1 Visualização da Rotina Semanal
- Interface clara mostrando todos os blocos de atividades
- Diferenciação visual entre tipos de atividades (grind, estudo, warm-up, descanso)
- Visão completa da distribuição do tempo semanal

#### 2.2.2 Detecção de Conflitos
- Identificação automática de sobreposições de horários
- Alertas visuais para conflitos detectados
- Sugestões de reorganização quando possível

## 3. Requisitos Técnicos

### 3.1 Fontes de Dados
1. **Grade (Grind)**
   - Dias ativos/inativos
   - Horários de início e fim
   - Configurações específicas por dia

2. **Estudos**
   - Cartões de estudo com horários definidos
   - Frequência e duração das sessões

3. **Configurações do Sistema**
   - Tempo de warm-up (15 min fixo)
   - Tempo de descanso (3h fixo)

### 3.2 Processamento de Dados
- Atualização automática quando dados de origem são modificados
- Algoritmo de distribuição equilibrada para estudos
- Validação de conflitos de horários
- Geração de estrutura de dados para o calendário

### 3.3 Interface do Usuário
- Visualização em formato de calendário semanal
- Códigos de cores para diferentes tipos de atividades
- Responsividade para diferentes tamanhos de tela

## 4. Regras de Negócio

### 4.1 Priorização de Atividades
1. **Grind**: Prioridade máxima - horários fixos definidos pelo usuário
2. **Warm-up**: Automaticamente agendado 15 min antes do grind
3. **Descanso**: Automaticamente agendado 3h após o grind
4. **Estudo**: Distribuído nos horários livres disponíveis

### 4.2 Tratamento de Conflitos
- Grind tem prioridade sobre estudo
- Warm-up e descanso são obrigatórios e não podem ser sobrepostos
- Conflitos são sinalizados mas não resolvidos automaticamente

### 4.3 Dias Desativados
- Dias com grind desativado na Grade são ignorados
- Não são criados blocos de grind, warm-up ou descanso para esses dias
- Estudos podem ser mantidos em dias sem grind

## 5. Critérios de Aceitação

### 5.1 Geração Automática
- [ ] Sistema gera rotina completa baseada em dados existentes
- [ ] Atualização automática quando fontes de dados são modificadas
- [ ] Processamento executado em menos de 3 segundos

### 5.2 Integração com Dados
- [ ] Todos os dias ativos da Grade são incluídos no calendário
- [ ] Horários de grind são respeitados exatamente
- [ ] Sessões de estudo são distribuídas adequadamente
- [ ] Dias desativados são ignorados corretamente

### 5.3 Automatização de Rotinas
- [ ] Warm-up de 15 min é inserido antes de cada grind
- [ ] Descanso de 3h é reservado após cada grind
- [ ] Não há sobreposição entre warm-up/grind/descanso

### 5.4 Experiência do Usuário
- [ ] Interface clara e intuitiva
- [ ] Diferentes tipos de atividades são visualmente distintos
- [ ] Conflitos são claramente identificados
- [ ] Rotina semanal completa é visualizada de forma organizada

## 6. Métricas de Sucesso

### 6.1 Métricas Técnicas
- Tempo de geração da rotina < 3 segundos
- Taxa de erro na geração < 1%
- Disponibilidade do sistema > 99%

### 6.2 Métricas de Usuário
- Redução no tempo gasto organizando rotina manualmente
- Aumento na aderência à rotina planejada
- Redução de conflitos de horário não identificados
- Satisfação do usuário com a ferramenta

## 7. Limitações e Restrições

### 7.1 Versão Inicial
- Tempos de warm-up e descanso são fixos (não customizáveis)
- Resolução automática de conflitos não implementada
- Sincronização com calendários externos não disponível

### 7.2 Dependências
- Dados devem estar preenchidos na Grade e Estudos
- Sistema requer que usuário mantenha informações atualizadas
- Funcionalidade depende da estabilidade das fontes de dados

## 8. Roadmap Futuro

### 8.1 Próximas Versões
- Customização de tempos de warm-up e descanso
- Resolução automática de conflitos
- Integração com calendários externos (Google Calendar, Outlook)
- Sugestões inteligentes de otimização da rotina
- Análise de performance da rotina executada vs planejada

### 8.2 Melhorias Incrementais
- Notificações sobre mudanças na rotina
- Histórico de rotinas anteriores
- Exportação da rotina em diferentes formatos
- Compartilhamento da rotina com coaches/mentores