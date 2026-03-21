# ADR-008: Arquitetura de alertas de late registration no Grind Live

## Status
Aceito

## Data
2026-03-21

## Contexto

A feature de enriquecimento de dados da Suprema Poker (spec `suprema-enriched-data.md`) introduz um sistema de alertas para notificar o jogador quando o deadline de late registration de um torneio esta proximo. Isso e critico no contexto de poker MTT: perder o late reg de um torneio lucrativo por distracoes durante o grind e um problema real e frequente.

O sistema precisa resolver 4 questoes arquiteturais:

1. **Como reproduzir som de alerta sem dependencias externas?** O jogador precisa de alerta sonoro alem do visual, pois frequentemente esta em outra aba ou focado no jogo.
2. **Como enviar notificacoes quando o Grind Live nao esta em foco?** O jogador pode estar em outra aba ou minimizado.
3. **Como verificar deadlines periodicamente sem sobrecarregar o sistema?** Multiplos torneios com countdowns simultaneos.
4. **Como resolver a hierarquia de configuracao (global vs. por torneio) sem complexidade desnecessaria?**

## Opcoes Consideradas

### Questao 1: Reproducao de Som

#### Opcao A: Web Audio API (oscillator programatico)
- **Pros:** Zero dependencias, sem arquivos de audio para servir, som gerado em runtime (880Hz sine wave), funciona offline, tamanho zero no bundle
- **Contras:** Som sintetico (nao um chime "bonito"), limitado em complexidade sonora, requer AudioContext que pode ser bloqueado por autoplay policies

#### Opcao B: Arquivo de audio (mp3/wav) com HTML5 Audio
- **Pros:** Pode usar sons profissionais/agradaveis, mais familiar para desenvolvedores
- **Contras:** Dependencia de arquivo estatico, precisa ser servido pelo Express, aumenta bundle, pode nao carregar se houver erro de rede, licenciamento do som

#### Opcao C: Biblioteca de sons (Howler.js, Tone.js)
- **Pros:** API mais rica, compatibilidade cross-browser melhor, sons complexos faceis
- **Contras:** Dependencia adicional (Howler.js ~10KB, Tone.js ~150KB), overkill para um beep de 200ms, mais uma lib para manter

### Questao 2: Notificacoes Fora de Foco

#### Opcao A: Browser Notification API (nativa)
- **Pros:** Nativa do browser (sem dependencias), aparece no SO mesmo com aba minimizada, suporta icone/titulo/body, onclick para focar aba, funciona em todos os browsers modernos
- **Contras:** Requer permissao do usuario (pode negar), nao funciona em iOS Safari, visual nao customizavel (depende do SO), pode ser silenciada pelo usuario no SO

#### Opcao B: Service Worker + Push Notifications
- **Pros:** Funciona mesmo com browser fechado, mais confiavel, padrao PWA
- **Contras:** Requer backend para enviar push (Web Push Protocol), necessita service worker registrado, complexidade muito maior, requer VAPID keys, overkill para alerta transiente

#### Opcao C: Apenas toast in-app (sem notificacao externa)
- **Pros:** Zero complexidade, sem permissoes, funciona sempre
- **Contras:** Invisivel quando aba nao esta em foco — exatamente o cenario onde o alerta e mais necessario

### Questao 3: Timer de Verificacao

#### Opcao A: setInterval client-side (30s)
- **Pros:** Simples, sem infraestrutura, leve (uma comparacao de timestamps por torneio a cada 30s), cleanup trivial no useEffect, padrao ja usado no projeto (break timer usa setInterval de 60s)
- **Contras:** Para de funcionar se aba suspensa pelo browser (throttling), imprecisao de ate 30s no disparo, requer re-implementar se mudar para SSR

#### Opcao B: WebSocket push do backend
- **Pros:** Preciso (server calcula e envia no momento exato), funciona mesmo com aba suspensa (conexao mantida), centralizado
- **Contras:** Requer infraestrutura de WebSocket (ja existe ws no projeto mas nao para isso), complexidade do backend para rastrear deadlines de cada usuario, estado no servidor, mais carga no banco

#### Opcao C: setTimeout recursivo por torneio
- **Pros:** Disparo preciso (calcula exatamente quando alertar), sem polling
- **Contras:** Multiplos timers simultaneos (1 por torneio), cleanup mais complexo, risco de memory leaks, mais dificil de debugar

### Questao 4: Hierarquia de Configuracao

#### Opcao A: Dois niveis (global default + override por torneio)
- **Pros:** Simples de entender (heranca), cobre 95% dos casos, master switch global para desligar tudo, override granular para torneios especificos
- **Contras:** Nao permite configuracao por site ou por categoria (ex: todos PKO com 5min, todos Vanilla com 15min)

#### Opcao B: Tres niveis (global + por categoria/site + por torneio)
- **Pros:** Mais flexivel, permite configuracao por tipo de torneio
- **Contras:** Complexidade de UI (3 niveis de configuracao), resolucao de heranca mais complexa, overkill para o caso de uso atual, mais campos no banco

#### Opcao C: Apenas global (sem override por torneio)
- **Pros:** Mais simples possivel, um unico valor para todos
- **Contras:** Jogador nao pode priorizar torneios especificos (ex: torneio caro merece mais antecedencia), todos tratados igualmente

## Decisao

**Questao 1:** Opcao A — Web Audio API com OscillatorNode.

Gerar som programaticamente com oscillator de 880Hz (nota La5), onda senoidal, duracao de 200ms com gain fade-out. Zero dependencias, zero assets, adequado para o proposito (alerta curto e reconhecivel). Se o browser bloquear autoplay, falhar silenciosamente — o toast visual e a camada garantida.

**Questao 2:** Opcao A — Browser Notification API nativa.

Complementar ao toast in-app. Solicitar permissao uma unica vez ao montar o Grind Live. Se concedida, notificacoes do SO aparecem mesmo com aba minimizada. Se negada, degradacao graceful — toast + som continuam funcionando. A simplicidade da API nativa supera os beneficios de Push Notifications, que requer infraestrutura de backend desnecessaria para alertas transientes que so existem durante a sessao.

**Questao 3:** Opcao A — setInterval client-side de 30 segundos.

O padrao ja e usado no projeto (break timer com setInterval de 60s). A imprecisao de ate 30s e aceitavel — o jogador nao precisa de alerta no segundo exato, e sim nos minutos proximos. A verificacao e leve (loop por torneios upcoming, comparacao de timestamps). O risco de throttling em abas inativas e mitigado pela Browser Notification API que funciona independentemente.

**Questao 4:** Opcao A — Dois niveis (global + override por torneio).

A hierarquia e simples: `torneio.alertMinutesBefore ?? userSettings.lateRegAlertMinutes`. O master switch `lateRegAlertEnabled` desliga tudo. O override por torneio e opcional (null = usa default). Cobre o caso de uso real: "quero ser alertado 10min antes por padrao, mas esse torneio de $100 eu quero 20min antes".

## Consequencias

### Positivas
- Zero dependencias externas adicionadas (Web Audio API, Notification API e setInterval sao nativos do browser)
- Degradacao graceful em todas as camadas: sem permissao de audio -> sem som; sem permissao de notification -> sem notificacao do SO; toast sempre funciona
- Padrao consistente com o restante do projeto (setInterval ja usado para break timer)
- Configuracao simples (2 niveis) com UI intuitiva (toggle global + override opcional por torneio)

### Negativas
- Alertas nao disparam se o browser suspender a aba (throttling em background tabs) — mitigado pela Browser Notification API
- Imprecisao de ate 30 segundos no disparo — aceitavel para o caso de uso
- Som sintetico (beep) em vez de chime profissional — funcional mas nao "premium"
- Alertas transientes (perdidos ao recarregar pagina) — aceitavel pois o countdown visual continua

### Neutras
- Se no futuro for necessario alertar fora do Grind Live (ex: na grade), o sistema pode ser refatorado para usar Service Worker + Push Notifications sem impactar os componentes atuais
- A hierarquia de 2 niveis pode ser expandida para 3 (com categoria/site) no futuro adicionando campos sem breaking change

## Confianca
Alta — todas as tecnologias escolhidas sao nativas do browser, sem dependencias, e o padrao de timer ja e provado no projeto. A hierarquia de 2 niveis e adequada ao volume de torneios tipico (5-15 por sessao).
