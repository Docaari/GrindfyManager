# UX Audit Master Plan — Grindfy

## Status
Em Execucao

## Data da Auditoria
2026-04-09

## Resumo
Auditoria UX completa de 8 fluxos principais e 14 paginas do Grindfy. Identificados 20 friction points organizados em 5 sprints de execucao.

---

## Inventario Completo de Problemas

### Legenda de Severidade
- **CRITICO** — Bloqueia conversao ou causa abandono de feature
- **ALTO** — Degrada experiencia significativamente
- **MEDIO** — Friccao perceptivel mas contornavel
- **BAIXO** — Polish e refinamento

---

### FP-01 [CRITICO] Landing Page nao converte
- **Fluxo:** Onboarding → Landing
- **Arquivo:** `client/src/pages/Landing.tsx`
- **Problema:** Texto em ingles num produto PT-BR. Zero prova social. Sem pricing visivel. Sem CTA de registro (so "Login"). Footer "© 2024" desatualizado. Features descritas genericamente.
- **Impacto:** Usuarios novos abandonam antes de registrar. Taxa de conversao landing→registro provavelmente baixissima.
- **Fix proposto:** Reescrever landing completa em PT-BR com: hero com proposta de valor clara, pricing transparente, social proof (numero de usuarios/torneios analisados), CTA "Criar Conta Gratis", FAQ, screenshots do produto.
- **ICE:** 8.0 | **Esforco:** 1 semana

### FP-02 [MEDIO] Upload sem feedback de progresso
- **Fluxo:** Onboarding → Primeiro Upload
- **Arquivo:** `client/src/components/FileUpload.tsx`
- **Problema:** Apenas spinner "Uploading..." sem barra de progresso, percentual ou tempo estimado. Usuarios com arquivos grandes nao sabem se travou.
- **Impacto:** Abandono durante upload de arquivos grandes. Reloads desnecessarios.
- **Fix proposto:** Barra de progresso com percentual (usar XMLHttpRequest.upload.onprogress ou fetch com ReadableStream). Mostrar: nome do arquivo, tamanho, % concluido, tempo estimado.
- **ICE:** 7.3 | **Esforco:** 2 dias

### FP-03 [MEDIO] Sem login social (Google OAuth)
- **Fluxo:** Onboarding → Registro/Login
- **Arquivo:** `client/src/pages/LoginPage.tsx`, `client/src/pages/RegisterPage.tsx`
- **Problema:** Google OAuth existe no backend (`server/oauth.ts`) mas nao esta na UI. Jogadores tech-savvy esperam login social.
- **Impacto:** Friccao adicional no registro. Perda de usuarios que preferem 1-click signup.
- **Fix proposto:** Adicionar botao "Continuar com Google" nas paginas de login e registro. Conectar com `server/oauth.ts` existente.
- **ICE:** 6.3 | **Esforco:** 3 dias

### FP-04 [CRITICO] Troca de perfil usa window.confirm() nativo
- **Fluxo:** Grade Planner → Troca de perfil A/B/C/OFF
- **Arquivo:** `client/src/pages/GradePlanner.tsx` (linha ~67-71)
- **Problema:** Ao trocar perfil para OFF, usa `window.confirm()` nativo do browser. Sem estilo, sem preview dos torneios afetados, sem possibilidade de undo.
- **Impacto:** Experiencia quebrada. Usuario pode perder torneios planejados sem entender o que aconteceu.
- **Fix proposto:** Substituir por Dialog do shadcn/ui mostrando: lista de torneios que serao ocultados, opcao de cancelar, confirmacao explicita.
- **ICE:** 8.0 | **Esforco:** 1 dia

### FP-05 [MEDIO] Celulas vazias na grade sem indicacao de acao
- **Fluxo:** Grade Planner → Adicionar torneio
- **Arquivo:** `client/src/pages/GradePlanner.tsx`
- **Problema:** Grid mostra celulas completamente vazias. Novo usuario nao sabe que pode clicar ou arrastar para adicionar torneio.
- **Impacto:** Discoverability baixa. Usuarios novos nao entendem como usar a grade.
- **Fix proposto:** Celula vazia com icone "+" sutil (opacity 30%), hover mostra "Clique ou arraste para adicionar". Primeira visita mostra tooltip explicativo.
- **ICE:** 6.7 | **Esforco:** 1 dia

### FP-06 [MEDIO] Sem link direto Grade → Grind
- **Fluxo:** Grade Planner → Iniciar sessao
- **Arquivo:** `client/src/pages/GradePlanner.tsx`
- **Problema:** Apos planejar a semana, usuario precisa navegar manualmente para /grind. Nao ha CTA contextual.
- **Impacto:** Quebra de fluxo. Usuario perde momentum.
- **Fix proposto:** Banner contextual no topo da grade: "Voce tem X torneios planejados para hoje — Iniciar Grind?" com botao que leva para /grind com torneios pre-carregados.
- **ICE:** 7.3 | **Esforco:** 1 dia

### FP-07 [CRITICO] Break popup intrusivo durante grind
- **Fluxo:** Grind Live → Break feedback
- **Arquivo:** `client/src/pages/GrindSessionLive.tsx` (linhas ~424-451)
- **Problema:** Auto-dispara modal a cada 55-60 minutos sem controle do usuario. Aparece durante momentos criticos. 5 sliders obrigatorios. Sem snooze. All-or-nothing (skipBreaksToday desativa tudo).
- **Impacto:** Usuarios desativam breaks completamente, perdendo todo tracking mental. Dados de break feedback ficam vazios.
- **Fix proposto:** Substituir modal bloqueante por: (1) Notificacao nao-bloqueante (banner no topo com countdown), (2) Botao "Responder Agora" / "Adiar 15min" / "Pular este break", (3) Frequencia customizavel nas settings (30/45/60/90 min), (4) Quick feedback mode (1 slider geral em vez de 5).
- **ICE:** 7.7 | **Esforco:** 3 dias

### FP-08 [MEDIO] Conflito de sessao no mesmo dia
- **Fluxo:** Grind → Iniciar sessao
- **Arquivo:** `client/src/pages/GrindSession.tsx` (linhas ~390-403)
- **Problema:** Se ja existe sessao hoje, abre dialog de conflito obrigando escolha manual entre "Editar existente" e "Criar nova". Confuso e desnecessario na maioria dos casos.
- **Impacto:** Friccao ao iniciar sessao. 2-3 cliques extras desnecessarios.
- **Fix proposto:** Se sessao ativa existe, assumir continuacao automatica e ir direto para /grind-live. Botao "Nova Sessao" disponivel mas nao obrigatorio.
- **ICE:** 7.0 | **Esforco:** 1 dia

### FP-09 [MEDIO] Modal de inicio de sessao com campos demais
- **Fluxo:** Grind → Iniciar sessao
- **Arquivo:** `client/src/pages/GrindSession.tsx` (linhas ~743-758)
- **Problema:** Modal `EpicStartSessionModal` tem 5+ campos opcionais (preparation %, notes, goals, screen cap, skip breaks). Jogador quer comecar rapido.
- **Impacto:** Friccao ao iniciar. Usuarios pulam campos importantes por pressa.
- **Fix proposto:** Duas opcoes: "Inicio Rapido" (1 clique, usa defaults e dados do warm-up se existirem) e "Personalizar" (abre formulario completo). Default = Inicio Rapido.
- **ICE:** 7.7 | **Esforco:** 2 dias

### FP-10 [ALTO] Sem exportacao de dados do dashboard
- **Fluxo:** Dashboard → Compartilhar stats
- **Arquivo:** `client/src/pages/Dashboard.tsx`
- **Problema:** Nenhuma opcao de exportar metricas ou graficos. Jogadores profissionais precisam compartilhar stats com stakers, coaches, ou grupos de estudo.
- **Impacto:** Usuarios fazem screenshots manuais (baixa qualidade) ou desistem de compartilhar.
- **Fix proposto:** Botao "Exportar" em cada tab com opcoes: CSV (dados tabulares), PNG (screenshot do grafico). Header do export com logo Grindfy + periodo + nome do usuario.
- **ICE:** 6.7 | **Esforco:** 1 semana

### FP-11 [MEDIO] Filtros do dashboard nao persistem
- **Fluxo:** Dashboard → Navegar → Voltar
- **Arquivo:** `client/src/pages/Dashboard.tsx`
- **Problema:** Trocar de pagina e voltar reseta todos os filtros. Sem URL params ou localStorage.
- **Impacto:** Usuario precisa refazer filtros toda vez que navega.
- **Fix proposto:** Persistir filtros em URL search params (`?period=3m&site=gg&tab=site`). Usar `useSearchParams` ou equivalente com Wouter.
- **ICE:** 7.0 | **Esforco:** 2 dias

### FP-12 [MEDIO] 8 tabs do dashboard overflow em mobile
- **Fluxo:** Dashboard → Trocar tab em mobile
- **Arquivo:** `client/src/pages/Dashboard.tsx`
- **Problema:** 8 tabs horizontais (Geral, Site, ABI, Tipo, Velocidade, Periodo, Participantes, Posicao) requerem scroll horizontal em mobile.
- **Impacto:** Tabs finais ficam escondidas. Usuarios mobile nao descobrem todas as analises.
- **Fix proposto:** Em mobile (<768px), converter tabs para dropdown Select ou mostrar 4 tabs + "Mais..." que expande as demais.
- **ICE:** 5.7 | **Esforco:** 1 dia

### FP-13 [BAIXO] Metricas mentais no dashboard sem contexto
- **Fluxo:** Dashboard → Interpretar metricas mentais
- **Arquivo:** `client/src/pages/Dashboard.tsx`
- **Problema:** Mostra avg energia/foco/confianca sem explicar correlacao com ROI. Numeros isolados sem insight.
- **Impacto:** Usuarios ignoram metricas mentais por nao entenderem o valor.
- **Fix proposto:** Tooltip ou mini-card: "Seu ROI e X% maior quando foco >= 7" (calculado da correlacao break feedback vs resultado). Integrar com dados do Coach IA.
- **ICE:** 5.3 | **Esforco:** 2 dias

### FP-14 [MEDIO] Sliders de mental state sem contexto
- **Fluxo:** Warm-Up → Auto-avaliacao mental
- **Arquivo:** `client/src/pages/MentalPrep.tsx`
- **Problema:** Escala 0-10 para foco/energia/confianca/IE sem explicacao. "7 de foco" nao significa nada para o usuario.
- **Impacto:** Respostas inconsistentes. Dados de baixa qualidade.
- **Fix proposto:** Labels nos extremos ("Disperso" ↔ "Laser Focus"), benchmark pessoal ("Sua media: 6.8"), e tooltip com descricao de cada nivel.
- **ICE:** 6.0 | **Esforco:** 1 dia

### FP-15 [BAIXO] Warm-up → Grind via localStorage (fragil)
- **Fluxo:** Warm-Up → Iniciar Grind
- **Arquivo:** `client/src/pages/MentalPrep.tsx` (linhas ~218-253)
- **Problema:** Dados de preparacao passam entre paginas via localStorage. Se usuario limpa cache ou usa aba diferente, perde dados.
- **Impacto:** Dados de warm-up perdidos ocasionalmente. Sessoes iniciam sem contexto mental.
- **Fix proposto:** Salvar warm-up no banco imediatamente (POST /api/preparation-logs) e carregar via API no grind (GET /api/preparation-logs/latest).
- **ICE:** 5.3 | **Esforco:** 2 dias

### FP-16 [ALTO] Estudos sem orientacao sobre o que estudar
- **Fluxo:** Estudos → Criar tema/card
- **Arquivo:** `client/src/pages/Studies.tsx`
- **Problema:** 100% auto-dirigido. Sem templates, sem sugestoes baseadas em leaks, sem conexao com performance. Usuario precisa saber o que estudar antes de usar a feature.
- **Impacto:** Feature subutilizada. Jogadores que mais precisam de estudo sao os que menos sabem o que estudar.
- **Fix proposto:** (1) Templates de estudo pre-definidos (3bet, ICM, Blind Defense, PKO Strategy, etc.), (2) Integracao com Leak Detector: "Seus top 3 leaks → Cards sugeridos", (3) Progresso visivel por tema.
- **ICE:** 6.3 | **Esforco:** 1 semana

### FP-17 [MEDIO] Estudos sem metricas de progresso
- **Fluxo:** Estudos → Acompanhar evolucao
- **Arquivo:** `client/src/pages/Studies.tsx`
- **Problema:** Sem barra de progresso por tema, sem tracking de dominio, sem spaced repetition. Tabela `study_cards` tem `knowledgeScore` mas nao e exibido na UI.
- **Impacto:** Falta de motivacao para continuar estudando. Sem senso de progresso.
- **Fix proposto:** Barra de progresso por tema baseada em `knowledgeScore`, badge de dominio (Iniciante/Intermediario/Avancado), streak de dias estudando.
- **ICE:** 5.7 | **Esforco:** 2 dias

### FP-18 [MEDIO] Biblioteca sem empty state nos filtros
- **Fluxo:** Biblioteca → Filtrar torneios
- **Arquivo:** `client/src/pages/TournamentLibraryNew.tsx`
- **Problema:** Quando filtros nao retornam resultados, grid fica completamente vazio sem nenhuma mensagem.
- **Impacto:** Usuario pensa que a feature esta quebrada.
- **Fix proposto:** Mensagem: "Nenhum torneio encontrado com esses filtros. Tente ajustar seus criterios." com botao "Limpar Filtros".
- **ICE:** 6.3 | **Esforco:** 0.5 dia

### FP-19 [MEDIO] Sistema de confidence (A-F) nao explicado
- **Fluxo:** Biblioteca → Interpretar grades
- **Arquivo:** `client/src/pages/TournamentLibraryNew.tsx` (linhas ~73-79)
- **Problema:** Grades A-F baseadas em volume de torneios mas sem legenda ou tooltip na UI. Usuario nao sabe o que "Confidence B" significa.
- **Impacto:** Feature de confianca estatistica e invisivel/inutil para o usuario.
- **Fix proposto:** Tooltip no badge de confidence: "A = 100+ torneios (alta confianca), B = 50-99, C = 30-49, D = 10-29, F = <10 (baixa confianca)". Ou legenda fixa no topo da pagina.
- **ICE:** 6.0 | **Esforco:** 0.5 dia

### FP-20 [BAIXO] Volatilidade (SD Buyins) mostrada sem explicacao
- **Fluxo:** Biblioteca → Metricas de template
- **Arquivo:** `client/src/pages/TournamentLibraryNew.tsx`
- **Problema:** Campo `sdBuyins` existe no model e pode ser exibido mas sem contexto na UI. Usuario nao sabe o que "SD 4.2 buyins" significa.
- **Impacto:** Metrica ignorada por falta de contexto.
- **Fix proposto:** Tooltip: "Desvio padrao em buy-ins. Menor = resultados mais previsiveis. Maior = mais variancia (swings maiores)." + cor (verde se <3, amarelo 3-6, vermelho >6).
- **ICE:** 4.7 | **Esforco:** 0.5 dia

---

## Plano de Sprints

### Sprint 1 — "Quick Wins de Alto Impacto" (3-4 dias)
Fixes rapidos que melhoram dramaticamente a experiencia com minimo esforco.

| # | Fix | ICE | Esforco | Prioridade |
|---|-----|-----|---------|------------|
| FP-04 | Profile switch com Dialog styled | 8.0 | 1 dia | P0 |
| FP-05 | Celulas vazias com hint de acao | 6.7 | 1 dia | P1 |
| FP-06 | CTA Grade → Grind contextual | 7.3 | 1 dia | P1 |
| FP-08 | Continuacao automatica de sessao | 7.0 | 1 dia | P1 |
| FP-18 | Empty state na biblioteca | 6.3 | 0.5 dia | P2 |
| FP-19 | Tooltip no sistema de confidence | 6.0 | 0.5 dia | P2 |
| FP-20 | Tooltip de volatilidade | 4.7 | 0.5 dia | P2 |

**Entrega:** 7 fixes, nenhuma mudanca de backend, puro frontend polish.

---

### Sprint 2 — "Grind Experience Redesign" (4-5 dias)
Correcoes na experiencia de grind que impactam retencao de dados e engagement diario.

| # | Fix | ICE | Esforco | Prioridade |
|---|-----|-----|---------|------------|
| FP-07 | Break popup nao-bloqueante + snooze | 7.7 | 3 dias | P0 |
| FP-09 | Inicio rapido de sessao | 7.7 | 2 dias | P0 |

**Entrega:** Break system redesign + Quick Start. Impacto direto em retencao de dados mentais.

---

### Sprint 3 — "Dashboard & Data Polish" (5-6 dias)
Melhorias no dashboard e na experiencia de dados.

| # | Fix | ICE | Esforco | Prioridade |
|---|-----|-----|---------|------------|
| FP-02 | Upload com barra de progresso | 7.3 | 2 dias | P1 |
| FP-11 | Filtros persistentes via URL | 7.0 | 2 dias | P1 |
| FP-12 | Tabs mobile do dashboard | 5.7 | 1 dia | P2 |
| FP-14 | Sliders mentais com contexto | 6.0 | 1 dia | P2 |

**Entrega:** Upload melhorado, filtros persistentes, mobile polish, mental state labels.

---

### Sprint 4 — "Landing Page & Conversao" (5-7 dias)
Reescrita da landing page para maximizar conversao de novos usuarios.

| # | Fix | ICE | Esforco | Prioridade |
|---|-----|-----|---------|------------|
| FP-01 | Landing Page completa PT-BR | 8.0 | 5 dias | P0 |
| FP-03 | Login social (Google OAuth) | 6.3 | 3 dias | P1 |

**Entrega:** Landing profissional em PT-BR com pricing + Google OAuth no login/registro.

---

### Sprint 5 — "Estudos & Refinamento Final" (6-7 dias)
Features de estudo e ultimos polishes.

| # | Fix | ICE | Esforco | Prioridade |
|---|-----|-----|---------|------------|
| FP-16 | Estudos integrado com Leak Detector | 6.3 | 5 dias | P1 |
| FP-17 | Metricas de progresso nos estudos | 5.7 | 2 dias | P2 |
| FP-10 | Export de dados (CSV/PNG) | 6.7 | 5 dias | P1 |
| FP-13 | Metricas mentais com correlacao | 5.3 | 2 dias | P2 |
| FP-15 | Warm-up via banco (remover localStorage) | 5.3 | 2 dias | P2 |

**Entrega:** Estudos com orientacao de leaks, export de dados, ultimos polishes.

---

## Cronograma Estimado

| Sprint | Duracao | Fixes | ICE medio |
|--------|---------|-------|-----------|
| Sprint 1 — Quick Wins | 3-4 dias | 7 | 6.4 |
| Sprint 2 — Grind Redesign | 4-5 dias | 2 | 7.7 |
| Sprint 3 — Dashboard Polish | 5-6 dias | 4 | 6.5 |
| Sprint 4 — Landing & Conversao | 5-7 dias | 2 | 7.2 |
| Sprint 5 — Estudos & Final | 6-7 dias | 5 | 5.9 |
| **TOTAL** | **~25-30 dias** | **20 fixes** | **6.5** |

---

## Metricas de Sucesso

| Metrica | Antes (estimado) | Meta apos sprints |
|---------|-------------------|-------------------|
| Conversao landing → registro | ~5% | 15%+ |
| Completude do onboarding (4 steps) | ~30% | 60%+ |
| Usuarios que usam breaks | ~20% | 50%+ |
| Sessoes com warm-up completo | ~25% | 45%+ |
| Feature adoption: Estudos | ~10% | 30%+ |
| Export de dados por usuario/mes | 0 | 2+ |
