# Product Roadmap — Modo 5 Strategist (2026-04-23)

## Status
Aprovado pelo founder — pipeline iniciado pelo Sprint 1.

## Resumo Executivo
Pesquisa competitiva completa identificou Lobbyze como concorrente mais perigoso (10+ redes, scheduling, alertas) e SharkScope como referencia em tournament selection inteligente. Grindfy mantem diferenciais defensaveis (AI Coach, mental tracking, Suprema Poker exclusivo, PT-BR nativo). Roadmap de 4 sprints prioriza fechar gap de **selecao inteligente** e **gestao de banca** antes de investir em aquisicao (sharing) e retencao (gamificacao).

---

## Mapa Competitivo

| Feature | PokerCraft | SharkScope | **Lobbyze** | HM3/PT4 | ICMIZER | **Grindfy** |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Cross-network tracking | so GG | sim | sim | sim | nao | **sim** |
| Lobby aggregator (10+ redes) | nao | nao | **sim** | nao | nao | so Suprema |
| Tournament Selector por ROI | nao | **sim** | parcial | nao | nao | nao |
| Alertas late reg/blind level | nao | nao | sim | parcial | nao | **sim** |
| Hand replay | sim | nao | nao | sim | parcial | nao |
| Mental prep + correlacao | nao | nao | nao | nao | nao | **sim** |
| AI Coach | nao | nao | nao | nao | nao | **sim** |
| Bankroll mgmt dedicado | parcial | parcial | parcial | sim | nao | nao |
| ICM/Push-fold trainer | nao | nao | nao | parcial | **sim** | nao |
| Suprema Poker | nao | nao | nao | nao | nao | **so** |
| PT-BR nativo | nao | nao | parcial | nao | nao | **sim** |

**Posicionamento defendido:** "Tracker brasileiro com gestao mental, AI Coach e selecao inteligente — para quem joga Suprema e quer profissionalizar."

---

## Catalogo Completo de Propostas (8 ideias, ICE preliminar)

> ICE = (Impact + Confidence + Ease) / 3, escala 1-10. Specs ja implementadas (subscription-reform, generic-alerts) foram excluidas.

### 1. Tournament Selector Inteligente — ICE 8.0 [SPRINT 1]
**O QUE:** Pagina/widget que cruza ROI historico do jogador (por site/buy-in/categoria/horario/dia) com torneios disponiveis hoje (Suprema + manuais) e ranqueia por EV+ esperado. Filtro: "so torneios com amostra >= 30 e ROI > 0".

**POR QUE:** Feature mais elogiada do SharkScope. Grindfy ja tem todos os dados (`/api/analytics/by-*` retorna ROI por dimensao + `/api/suprema/tournaments` traz lobby). E completar o loop de "uso o Grindfy *antes* de grindar".

**Impact 9 / Confidence 8 / Ease 7 = 8.0**

**Dependencias:** Endpoints analytics existentes, integracao Suprema, Grade Planner.

**Riscos:** Algoritmo de scoring precisa lidar com baixa amostra (cold start). Pesos de recencia/decay precisam validacao com dados reais.

---

### 2. Bankroll Management Module — ICE 7.7 [SPRINT 2]
**O QUE:** Modulo dedicado: usuario informa bankroll, sistema calcula buy-in maximo recomendado (1% rule, 100/150/200 BIs), alerta no Grade Planner quando torneio excede limite, sugere shots calculados, projeta crescimento mensal baseado em ROI.

**POR QUE:** Pain point #1 de jogadores MTT. Lobbyze/SharkScope nao tem dedicado. Reforca posicionamento "Grindfy gerencia, nao so trackeia".

**Impact 8 / Confidence 7 / Ease 8 = 7.7**

**Dependencias:** `user_settings` ja existente, dashboard de profit, Grade Planner.

**Riscos:** Definicao de regras (1% e padrao mas conservador, alguns querem 2% ou shots ate 5%). Permitir customizacao.

---

### 3. Goal Setting + Streaks/Milestones — ICE 6.7 [SPRINT 4]
**O QUE:** Metas mensais (volume, ROI, profit, sessoes), streak de aderencia a grade, milestones desbloqueaveis (primeiro KO, FT em $50+, ROI > 0 por 30 dias). Notificacao de progresso.

**POR QUE:** Retencao W4 — Grindfy ja tem warm-up, mental, AI Coach mas falta o "pra que voltar amanha".

**Impact 7 / Confidence 6 / Ease 7 = 6.7**

**Dependencias:** Tabela `user_goals` (nova), cron de avaliacao, dashboard.

**Riscos:** Gamificacao em nicho profissional pode parecer infantil. Execucao precisa ser sobria (sem badges chamativas).

---

### 4. Sharing Social — Stories de sessao + Perfil publico opt-in — ICE 6.7 [SPRINT 3]
**O QUE:** Gerar imagem shareable (estilo "Spotify Wrapped") da sessao/mes/ano com KPIs visuais. Perfil publico opcional com link compartilhavel para Telegram/Discord.

**POR QUE:** Comunidade BR de poker e ativa em Discord/Telegram/Twitter. Cada compartilhamento = funnel de aquisicao organica. `html2canvas` ja esta no stack (Sprint 5 UX).

**Impact 7 / Confidence 6 / Ease 7 = 6.7**

**Dependencias:** html2canvas (ja instalado), endpoint publico de perfil, opt-in setting.

**Riscos:** Adesao depende de diferenciacao visual. Privacidade (jogadores podem nao querer expor stats).

---

### 5. PWA Mobile-first + Push Notifications — ICE 6.0 [BACKLOG]
**O QUE:** Otimizar PWA (manifest, service worker, push notifications nativas mobile) para registrar resultado rapido pelo celular durante grind, ver dashboard, receber alertas de late reg.

**POR QUE:** Jogadores grindam de PC mas precisam de mobilidade para registrar ao vivo e checar P&L.

**Impact 7 / Confidence 6 / Ease 5 = 6.0**

**Dependencias:** Vite PWA plugin, service worker, push API stack (Web Push protocol + VAPID keys).

**Riscos:** Mobile e canal secundario para o use-case core (grind multi-mesa).

---

### 6. Hand Replay + Hand Moments shareable — ICE 6.0 [BACKLOG]
**O QUE:** Aceitar upload de hand histories (alem de tournament summaries), parser por rede, replayer visual no estilo PokerCraft, exportacao de "Hand Moments" como imagem shareable.

**POR QUE:** PokerCraft validou que hand-by-hand review e o que jogadores mais usam para melhorar.

**Impact 8 / Confidence 7 / Ease 3 = 6.0**

**Dependencias:** Parser multi-formato (gargalo principal — formatos diferem por rede), replayer visual (lib externa ou custom), html2canvas.

**Riscos:** Parsing multi-rede e MUITO complexo. Poderia ser MVP focado so em PokerStars (formato padrao da industria).

---

### 7. Push/Fold Coach + ICM Calculator — ICE 5.7 [BACKLOG]
**O QUE:** Adicionar a `/calculadoras` uma calculadora ICM Nash + treinador de push/fold (spots randomizados de torneios reais do usuario, mostra Nash range, mede acerto).

**POR QUE:** ICMIZER cobra €100+. Reforca posicionamento "training-ready". AI Coach ja existe — e a evolucao natural.

**Impact 7 / Confidence 6 / Ease 4 = 5.7**

**Dependencias:** Biblioteca Nash em JS (ou implementacao custom), validacao matematica.

**Riscos:** Implementacao matematica precisa. Alguns players ja tem ICMIZER assinado.

---

### 8. Multi-Network Lobby Aggregator (ataque ao Lobbyze) — ICE 5.7 [DESCARTADO]
**O QUE:** Replicar modelo Suprema para outras redes (GGPoker, PokerStars, ACR/WPN) via scraping ou API publica.

**POR QUE:** Lobbyze cobre 10+ redes — gap visivel.

**Impact 9 / Confidence 5 / Ease 3 = 5.7**

**DECISAO: NAO implementar.** Luta cara/fragil contra Lobbyze. Riscos de TOS, manutencao constante. Estrategia diferenciada (AI Coach + Mental + Suprema + PT-BR) e mais defensavel que comoditizar lobby aggregation.

---

## Top 4 Priorizado (Roadmap dos Proximos 4 Sprints)

| Sprint | Feature | ICE | Justificativa |
|:-:|---|---:|---|
| **1** | Tournament Selector Inteligente | 8.0 | Maior ICE, dados ja prontos, mata argumento "uso SharkScope" |
| **2** | Bankroll Management | 7.7 | Gap claro vs concorrentes, refoorca posicionamento "gestor" |
| **3** | Sharing/Stories | 6.7 | Investimento em CAC organico via comunidade BR |
| **4** | Goal Setting/Streaks | 6.7 | Fecha ciclo de retencao com gamificacao sobria |

## Backlog (revisitar pos-sprint 4)
- PWA Mobile-first (ICE 6.0)
- Hand Replay (ICE 6.0) — considerar MVP so PokerStars
- Push/Fold Coach (ICE 5.7)

## Descartado
- Multi-Network Lobby Aggregator — luta errada vs Lobbyze, atacar pelos flancos

---

## Diferenciais Defensaveis (manter e amplificar)
1. **Suprema Poker** — unica integracao nativa no mercado
2. **AI Coach** (3 personas + memoria persistente) — nenhum concorrente tem
3. **Mental tracking + correlacao com performance** — diferencial unico
4. **PT-BR nativo** com cultura brasileira de poker (PKO, Mystery, etc.)
5. **Grind Live** (sessao tempo real + alertas + breaks) — Lobbyze nao tem o lado live

## Posicionamento contra Lobbyze (resposta estrategica)
Nao tente bater frontalmente o aggregator de 10+ redes. Atacar pelos flancos:
- Quem usa Suprema → Grindfy e a unica opcao
- Quem quer melhorar mentalmente → so Grindfy tem mental + AI Coach
- Quem quer selecao baseada em ROI proprio → Tournament Selector (Sprint 1) iguala SharkScope com vantagem PT-BR
