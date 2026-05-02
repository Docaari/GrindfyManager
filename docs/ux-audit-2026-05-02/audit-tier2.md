# UX Audit — Tier 2 (CoachAI, Bankroll, MentalPrep, GradePlanner)

---

## 7. CoachAI (`/coach-ai`) — `CoachAI.tsx`

### Contexto
415 linhas. Chat AI com 3 personas (Mental, Torneios, Tecnico) + sidebar de sessoes (lista, archive, delete) + streaming markdown + recommend_lesson cards inline.

### Achados

#### P1 — Sem indicador de tokens/limites no UI
- **Problema**: Component nao mostra quantas msgs/tokens consumidos do plano (Coach tem upgrade modal e tier system). Usuario manda 50 msgs e descobre limite no toast.
- **Anti-pattern**: 1.5 (mensagens humanas, recover affordance).
- **Fix**: Counter no header "12/50 msgs hoje" com tooltip "Plano Pro: ilimitado". Color amber quando 80%, red 95%.

#### P1 — Sem prompt starters/suggestions
- **Problema**: Empty state (linha 335-351) mostra so descricao do coach. Usuario novo nao sabe o que perguntar. Primeiro prompt e travamento comum.
- **Anti-pattern**: 1.3 (empty state nao ensina) + 1.6 (onboarding).
- **Fix**: 4-6 prompt cards clicaveis: "Como melhorar foco em sessoes longas?", "Analise minhas estatisticas de Maio", "ICM em final table 6-handed". Por persona.

#### P1 — Sidebar de sessoes sem search/filter
- **Problema**: Lista de conversas (linha 153-218). Sem busca por titulo. Sem filtro por status (active/archived). Em 100+ conversas, scroll infinito.
- **Fix**: Search box no topo da sidebar. Toggle "Mostrar arquivadas".

#### P2 — Markdown streaming sem code highlighting
- **Problema**: `prose-pre:bg-gray-900` mas sem syntax highlighting. Coach pode mandar code (raro mas possivel).
- **Fix**: react-syntax-highlighter no `<pre>` blocks.

#### P2 — Auto-scroll forca para baixo agressivo
- **Problema**: Linha 247-249. Toda mudanca em messages OU streamedText scroll smooth para o fim. Se usuario subiu pra ler, e nova streaming chega, perde posicao.
- **Anti-pattern**: 2.8 (microinteracoes erradas).
- **Fix**: Auto-scroll so se usuario ja esta no fim. Se subiu, mostrar botao "↓ Novas mensagens" floating.

#### P2 — Delete session sem confirmacao
- **Problema**: Linha 207-211. Botao trash chama `onDeleteSession(session.id)` direto. Acao destrutiva.
- **Fix**: AlertDialog "Excluir esta conversa?".

#### P2 — Sem export da conversa
- **Problema**: Insights valiosos do coach. Sem botao "Exportar como markdown" / "Copiar conversa".
- **Fix**: Action no header da conversa.

#### P2 — Tabs trocam sem confirmar conversa em andamento
- **Problema**: `handleTabChange` (linha 265-268). Limpa input. Mas usuario pode estar mid-conversation. Mensagens da tab antiga ficam la, mas perde foco.
- **Fix**: Tooltip "Trocar para tab X" warning OU toast pos-troca.

#### P2 — Streaming bubble sem affordance "Parar"
- **Problema**: StreamingBubble (linha 103-119). User pediu coisa errada, nao tem botao "Stop generating". Tem que esperar.
- **Fix**: Botao "Parar geracao" visivel durante streaming.

#### P3 — Mobile sidebar sem indicador de unread
- **Problema**: Sheet sidebar mobile (linha 294-303). Quando coach responde em conversa de outra tab/sessao, sem badge.
- **Fix**: Badge no Menu icon se ha conversas com novas msgs.

#### P3 — Footer hint pequeno demais
- **Problema**: Linha 407-409. `text-[10px]` "Enter para enviar...". Quase invisivel.
- **Fix**: `text-xs` (12px) minimo.

#### P3 — Textarea max-h-120px corta texto longo
- **Problema**: Linha 389. Textarea cresce ate 120px. Em prompt longo (300+ chars), scroll interno. Indicacao visual fraca.
- **Fix**: Indicador "X/2000 chars" no canto.

### Recomendacoes Acionaveis CoachAI

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| C1 | Counter de msgs/limites visivel | P1 | M | High |
| C2 | Prompt starters por persona | P1 | M | High |
| C3 | Search + filter na sidebar | P1 | M | Med |
| C4 | Code syntax highlighting | P2 | L | Low |
| C5 | Auto-scroll inteligente | P2 | M | High |
| C6 | Confirm delete conversa | P2 | L | High |
| C7 | Export conversa markdown | P2 | L | Med |
| C8 | Stop generation button | P2 | L | Med |
| C9 | Warning ao trocar tab | P2 | L | Low |
| C10 | Badge unread mobile | P3 | M | Low |
| C11 | Footer hint text-xs | P3 | L | Low |
| C12 | Char counter no textarea | P3 | L | Low |

---

## 8. Bankroll (`/bankroll`) — `Bankroll.tsx`

### Contexto
279 linhas. Layout 2-paineis: WalletList sidebar + WalletDetailPanel. Header com 4 acoes (Reportar rakeback, Transferir, Reportar saldo, Aporte/saque legado, + Nova carteira). Historico consolidado abaixo. Fallback v1 (BankrollWidget + History) sempre visivel.

### Achados

#### P1 — Header com 5 botoes lutando entre si
- **Problema**: Linha 167-208. Reportar rakeback (warning surface), Transferir (border), Reportar saldo (border), Aporte/saque legado (muted), + Nova carteira (primary). 5 botoes, 4 estilos visuais diferentes, hierarquia confusa.
- **Anti-pattern**: 2.3 (CTA fraco) + 2.6 (saturacao).
- **Fix**:
  - 1 primary: "+ Nova carteira"
  - 1 secondary destacado: "Transferir" (acao mais comum)
  - 3 em dropdown "Mais acoes": Reportar rakeback, Reportar saldo, Aporte/saque legado.

#### P1 — "Aporte/saque legado" ainda visivel
- **Problema**: Linha 195. Botao com label "Aporte/saque legado" e variant muted. Indicacao de que e fluxo deprecated MAS exposto.
- **Anti-pattern**: 2.10 (genericos / deprecated visivel).
- **Fix**: Mover pra Settings > Avancado. OU se usuarios ainda dependem, renomear sem "legado" e documentar.

#### P1 — `BankrollWidget` duplica dados que ja aparecem
- **Problema**: Linha 212. Renderiza `<BankrollWidget />` (mesmo widget do Dashboard) **alem** do consolidated query no header + WalletList + WalletDetailPanel + Historico. 4 fontes de verdade visual potenciais.
- **Anti-pattern**: 2.17 (multipla fonte de verdade).
- **Fix**: Bankroll page so deve ter UM resumo consolidado (proprio header). Remove BankrollWidget da pagina dedicada.

#### P2 — `useEffect` auto-select sem cleanup de stale walletId
- **Problema**: Linha 106-111. Auto-seleciona primeira active. Se user deletar wallet selecionada, `selectedWalletId` aponta pra inexistente. `selectedWallet` retorna null mas state nao limpa.
- **Fix**: Effect que reseta selectedWalletId se wallet sumir do walletItems.

#### P2 — `fetch` direto, nao apiRequest
- **Problema**: Linhas 70 e 79. Usa `fetch("/api/...", { credentials: 'include' })` direto. Resto do app usa `apiRequest`. Inconsistencia.
- **Fix**: Migrar pra apiRequest (ja tem no helper).

#### P2 — Dialogs sem indicacao de loading no trigger
- **Problema**: 6 dialogs abertos via setX. Botao nao mostra spinner enquanto carrega query da wallet.
- **Fix**: Botoes com `disabled={isLoading}` quando aplicavel.

#### P2 — Historico consolidado em section separada
- **Problema**: Linha 239-242. `<BankrollHistoryTable />` embaixo da view 2-paineis. Scroll obrigatorio. Em wallet detail panel ja deve ter historico per-wallet, e aqui no global.
- **Fix**: Sticky tab "Historico" abrindo modal/sheet, ou collapsible.

#### P3 — Fallback v1 sem feedback do que e v2
- **Problema**: Comment no topo "Fallback: usuario sem wallets v ainda usa stack v1". Mas user nao ve isso. Se sem wallet, ve so empty state.
- **Fix**: Empty state com CTA: "Crie sua primeira wallet pra acessar o novo sistema multi-moeda".

#### P3 — Reportar rakeback abre direto sem context
- **Problema**: Linha 167. Botao no header sem indicar de qual wallet (defaultUndefined). User precisa selecionar dentro do dialog.
- **Fix**: Tooltip explicando, ou pre-select wallet selecionada se houver.

### Recomendacoes Acionaveis Bankroll

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| B1 | Header 1 primary + 1 secondary + dropdown | P1 | M | High |
| B2 | Mover legado pra Settings | P1 | M | Med |
| B3 | Remover BankrollWidget duplicado | P1 | L | High |
| B4 | Cleanup stale selectedWalletId | P2 | L | Med |
| B5 | Migrar fetch -> apiRequest | P2 | L | Low |
| B6 | Loading nos botoes triggers | P2 | L | Low |
| B7 | Historico em sheet/tab | P2 | M | Med |
| B8 | Empty state CTA explicito | P3 | L | Med |
| B9 | Pre-select wallet no Rakeback | P3 | L | Low |

---

## 9. MentalPrep (`/mental`, "Warm Up") — `MentalPrep.tsx`

### Contexto
210 linhas (refatoracao recente Sprint W-1, RF-01). Card primario "Iniciar warm-up (10min)" + ResumeRitualPrompt + WarmupHistoryCard + collapsible Ferramentas de Apoio (3 dialogs).

### Achados

#### P0 — Mesma issue Rules of Hooks
- **Problema**: Linha 51-58. Early return de AccessDenied apos `usePermission` mas antes dos useState. **Inconsistente** com outros chamados que vem antes (linha 35-38).
- **Linha**: 35-58.
- **Fix**: Mover early return depois de TODOS hooks (incluindo useState).

#### P1 — Card primario sem urgencia visual quando warm-up vencido
- **Problema**: Botao "Iniciar Grind" (linha 135-148) tem variant condicional. Mas botao "Iniciar warm-up" NAO muda visual quando user ja jogou hoje sem warm-up (gating ativo).
- **Anti-pattern**: 2.13 (estados intermediarios).
- **Fix**: Quando `!canStartGrind`, card "Iniciar warm-up" com border vermelha pulsante + texto "Faca antes de jogar".

#### P1 — Collapsible "Ferramentas de Apoio" sem afford de descoberta
- **Problema**: Linha 157-191. Collapsible fechado por default. Usuario novo nem sabe que tem meditacao/visualization/audio. Title "▸" sem feedback claro.
- **Fix**: Open por default na primeira visita. Persist state apos.

#### P2 — `WarmUpRunner` como tela inteira sem header de progresso
- **Problema**: Linha 89-96. Quando `showRunner`, retorna SO o runner (sem header da pagina). User perde contexto. Sem progresso "3/5 blocos" visivel ate entrar.
- **Fix**: Verificar componente. Se nao tem header, adicionar.

#### P2 — Comentario tecnico "Removidos:" no codigo
- **Problema**: Linha 12-16. JSDoc lista o que foi removido. Util pra dev mas anti-pattern em comment publico (rot conforme codigo evolui).
- **Fix**: Mover pra commit message ou changelog.

#### P3 — Ferramentas de apoio renderizam dialogs mesmo quando fechado
- **Problema**: Linha 193-207. MeditationDialog/VisualizationDialog/AudioLibraryDialog sao renderizados sempre. Pesos de import lazy podem somar.
- **Fix**: Conditional render baseado em open state.

#### P3 — Toast "Bom grind!" sem CTA
- **Problema**: Linha 75-82. Apos warm-up, toast "Warm-up registrado / Bom grind!". Sem CTA "Iniciar grind agora".
- **Fix**: ToastAction "Iniciar grind agora" no toast.

### Recomendacoes Acionaveis MentalPrep

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| MP1 | Mover early return apos hooks | P0 | L | High |
| MP2 | Card warm-up com urgencia quando vencido | P1 | L | High |
| MP3 | Collapsible aberto na primeira visita | P1 | L | Med |
| MP4 | Header progresso no Runner | P2 | M | Med |
| MP5 | Remover comentario "Removidos:" | P2 | L | Low |
| MP6 | Lazy render dos dialogs | P3 | L | Low |
| MP7 | Toast com CTA "Iniciar grind" | P3 | L | High |

---

## 10. GradePlanner (`/coach`, "Grade") — `GradePlanner.tsx`

### Contexto
978 linhas. Pagina de planejamento semanal de torneios. Sem leitura completa por economia de context — audit baseado em tamanho + role + nome dos componentes (PlanningDialog, EditDialog, DeleteDialog, NewTournamentPlanningDialog).

### Achados (preliminar — requer leitura completa para final)

#### P1 — 978 linhas em uma pagina sugere monolitismo
- **Problema**: Tamanho indica mistura de logica de planejamento + view + state + dialogs. Mesmo padrao de GrindSessionLive em escala menor.
- **Fix**: Extrair em sub-componentes (DayColumn, TournamentRow, FilterBar).

#### P1 — Rota `/coach` ambigua
- **Problema**: Sidebar label "Grade" mas rota `/coach`. Confunde com `/coach-ai`.
- **Anti-pattern**: 2.10 (sem personalidade/clareza).
- **Fix**: Migrar rota pra `/grade` (com redirect /coach -> /grade pra compat).

#### P1 — 4 dialogs (Planning, Edit, Delete, NewTournamentPlanning) sem mutex
- **Problema**: Mesma issue de outros: 4 booleans state. Possibilidade de overlay.
- **Fix**: Reducer.

### Recomendacoes Preliminares GradePlanner

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| GP1 | Refatorar em sub-componentes | P1 | H | High |
| GP2 | Migrar rota /coach -> /grade | P1 | M | Med |
| GP3 | Reducer pra dialog state | P1 | M | Med |
| GP4 | **TODO**: leitura completa para audit detalhado | — | — | — |

**Nota**: GradePlanner precisa leitura completa numa proxima iteracao do audit. 978 linhas exigem ~5000 tokens isoladamente.
