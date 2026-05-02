# UX/UI Research Reference — SaaS Analitico (2026-05-02)

Documento-base para auditoria do Grindfy. Sintese de boas praticas modernas de UX/UI para SaaS de dados, com foco em jogadores profissionais (publico tecnico, exigente, multi-tela).

---

## PARTE 1 — Boas Praticas UX/UI 2025

### 1.1 Hierarquia visual e scanability
- **Lei de Hick**: cada elemento na tela tem custo cognitivo. Reduzir opcoes visiveis simultaneas (max ~7 em uma area).
- **F-pattern** (paginas com texto/listas): titulo + linha-resumo + bullets. Usuario le diagonalmente.
- **Z-pattern** (landing/marketing): logo top-left -> CTA top-right -> valor mid -> CTA bottom-right.
- **Lei de Fitts**: alvos clicaveis grandes (>=44px) e proximos do cursor (CTA primario do lado da mao dominante OU central).
- **Tipografia hierarquica**: 4-5 tamanhos max (display/h1/h2/body/caption). Pesos 400 + 600 + 700 sao suficientes.
- **Whitespace deliberado**: espaco em branco e elemento ativo, nao desperdicio. Densidade alta em tools, baixa em paginas de leitura.
- **Cores semanticas**: verde=sucesso, vermelho=erro, amarelo=warn, azul=info. Manter consistente.
- **Contraste**: minimo 4.5:1 para texto, 3:1 para texto grande. Verificar com WebAIM.

### 1.2 Navegacao moderna
- **Sidebar** persistente quando >7 destinos top-level. Colapsavel para reduzir distracao.
- **Topbar** quando <=5 destinos OU app focado em conteudo (ex: editor).
- **Breadcrumbs**: obrigatorio em hierarquias 3+ niveis (Library > Curso > Licao). Padrao: separador `/` ou `>`.
- **Command palette** (Cmd/Ctrl+K): padrao 2024+ em SaaS. Linear, Notion, Stripe Dashboard, Vercel, GitHub. Permite navegacao por busca.
- **Active state** explicito: sidebar item atual deve ser visualmente OBVIO (cor + barra lateral + bold).
- **Search global** com type-ahead: melhor que menu profundo.

### 1.3 Empty states
- **NUNCA** so "Nenhum item encontrado". Empty state deve **ensinar** ou **oferecer acao**:
  - Icone/ilustracao tematica (~80px)
  - Titulo curto ("Nenhum torneio importado")
  - Subtexto explicando o motivo + valor ("Importe seu primeiro CSV pra ver dashboard")
  - **CTA primario** ("Importar agora") apontando pro proximo passo
  - Opcional: link "Como funciona?" pra docs
- **Tipos**: nunca-teve-dados, filtros-zerados, busca-sem-resultado, erro-de-rede.

### 1.4 Loading states
- **Skeleton screens** > spinners. Reduz percepcao de tempo em ~30%.
- **Optimistic UI**: aplicar mudanca antes do server confirmar (toggle, like, delete). Reverter on error.
- **Progressive loading**: carregar primeiro o que aparece on-screen, lazy o resto.
- **Spinner** so para acoes >2s onde nao ha skeleton possivel (ex: PDF gen, export).
- **Loading granular**: cada card carrega proprio skeleton, nao tela inteira em branco.

### 1.5 Error states e validacao
- **Inline validation**: erro aparece no campo, abaixo, em vermelho, com icone e texto especifico ("Email invalido"). Nao usar so cor.
- **On-blur** > on-change para validacao (evita "esta digitando, ja errado").
- **Toast** para resultado de acao (save, delete). Inline para form errors.
- **Mensagens humanas**: "Senha precisa de 8+ caracteres" > "Erro 400: validation_failed".
- **Recover affordance**: botao "Desfazer" em toast de delete, retry em erro de rede.
- **Empty error**: "Nao encontramos nada com esses filtros" com botao "Limpar filtros".

### 1.6 Onboarding
- **Time-to-value < 5 min**: usuario ve valor real na primeira sessao OU desiste.
- **Progressive disclosure**: pedir minimo no signup (email+senha). Resto via onboarding wizard ou inline.
- **Checklist visivel**: "3/5 passos concluidos: Importar dados [X], Criar wallet [X], ..." persistente ate completar.
- **Tour produto**: opcional, dismissable, baseado em tooltips contextuais > modal full-screen.
- **First import / first action** com sample data: deixar usuario ver dashboard com dados de exemplo antes de pedir CSV.
- **Empty state da home** = onboarding implicito.

### 1.7 Tabelas de dados grandes
- **Virtualizacao** (react-virtual / TanStack Virtual) acima de 200 linhas. Sem isso, 1000+ linhas trava browser.
- **Sticky header** ao rolar.
- **Sort visual**: setas explicitas, ASC/DESC, indicador de coluna ativa.
- **Filter pill UI**: filtros aplicados aparecem como chips removiveis no topo. Exemplo: `Buy-in: $5-$20 [x]  Rede: WPN [x]`.
- **Bulk actions**: checkbox por linha + master + bar de acoes contextuais quando ha selecao.
- **Density toggle**: compact / comfortable / spacious (Linear, Stripe).
- **Column visibility**: usuario escolhe colunas. Persistir em localStorage.
- **Pagination + infinite scroll**: prefer pagination em data analitica (jumping). Infinite em feeds.
- **Empty cell**: traco "—", nao "null" / "undefined" / vazio.

### 1.8 Modais vs Slide-overs vs Full pages
- **Modal (dialog)**: confirmacoes destrutivas, criacao rapida (1-3 campos). Max ~500px.
- **Slide-over (sheet)**: edicao em contexto (4-10 campos), drill-in sem perder contexto da tela. Linear usa slide-over para ticket detail.
- **Full page**: forms longos (>10 campos), workflows multi-step.
- **Anti-pattern**: modal > 80% altura da tela, modal com scroll interno >1 secreens.
- **Anti-pattern**: chain modals (modal abre modal abre modal).

### 1.9 Graficos e charts
- **Bar chart**: comparacoes discretas (ROI por rede, horas por dia).
- **Line/Area**: serie temporal continua (banca ao longo do tempo).
- **Pie**: NUNCA com >5 fatias. Prefer bar horizontal.
- **Heatmap**: padrao temporal (heatmap de horas-do-dia x dia-da-semana).
- **Sparkline**: tendencia inline em metric card. Sem eixos. Cor +/-.
- **Tooltip on hover**: numero exato + contexto (data, %).
- **Anotacoes**: marcar eventos importantes (deposito, big win) na linha.
- **Comparacao**: serie atual vs anterior em cor secundaria + label "vs mes passado".
- **Contraste**: cor primaria pro destaque, neutros para fundo. Evitar arco-iris.

### 1.10 Mobile/responsive em SaaS desktop-first
- Tabela vira **cards stack** em <768px.
- Sidebar vira **bottom-nav** ou **drawer** em mobile.
- Chart com legenda lateral vira legenda em baixo.
- Modal pequeno -> full-screen sheet em mobile.
- Inputs grandes (44px+), evitar select nativo confuso.

### 1.11 Acessibilidade WCAG 2.2
- **Contraste** texto: 4.5:1 (normal), 3:1 (large 18px+ bold).
- **Focus visible**: outline OU box-shadow, nunca `outline:none` sem substituto.
- **Keyboard nav**: Tab order logico, Esc fecha modal, Enter envia form.
- **ARIA labels** em icon buttons (`aria-label="Fechar"`).
- **Roles semanticos**: `<nav>`, `<main>`, `<button>` (nao `<div onClick>`).
- **Form labels** sempre presentes (visualmente OU sr-only).
- **Live regions** para toasts (`aria-live="polite"`).
- **Skip link** "Pular para conteudo".
- **Reduced motion**: respeitar `prefers-reduced-motion`.

### 1.12 Microinteracoes
- **Hover states** em todo elemento clicavel.
- **Active/pressed states** (opacity 0.8 ou scale 0.98).
- **Transitions** 150-300ms cubic-bezier. Mais que isso vira lento.
- **Feedback de acao**: toast + change visual (ex: salvar -> botao vira "Salvo!" 2s -> volta).
- **Skeleton -> content** com fade-in 200ms.
- **Animation respeitando `prefers-reduced-motion`**.

---

## PARTE 2 — Erros Comuns que IA Comete em Interface SaaS

Padrao recorrente quando LLMs geram UI sem revisao humana cuidadosa:

### 2.1 Inconsistencia de espacamento e tipografia
- Variacoes de padding entre componentes do mesmo tipo (`p-4` aqui, `p-6` ali, `py-3 px-5` la).
- Tamanhos de heading inconsistentes (`text-xl` vs `text-2xl` para mesmo nivel hierarquico).
- **Fix**: definir scale rigida (4/8/12/16/24/32 spacing; 12/14/16/20/24/32 font sizes) e aplicar.

### 2.2 Excesso de cards aninhados
- Card dentro de card dentro de card. Cada um com border + padding + shadow. Resulta em "Russian doll" visualmente pesado.
- **Fix**: 1 card por agrupamento logico. Conteudo interno usa whitespace + dividers, nao mais cards.

### 2.3 Botoes CTA fracos ou ambiguos
- Multiplos "Salvar" / "OK" / "Confirmar" sem distinguir contexto.
- Botao primario e secundario com peso visual igual.
- **Fix**: 1 CTA primario por tela (cor solida cheia), demais ghost/outline. Texto descritivo: "Importar 47 torneios" > "Confirmar".

### 2.4 Estados hover/focus inexistentes
- Botoes/links sem mudanca visual no hover. Foco invisivel ao keyboard.
- **Fix**: SEMPRE definir hover (bg darker/lighter) e focus-visible (ring).

### 2.5 Mobile/responsive quebrado
- Tabela com 8 colunas que nao quebra no mobile, scroll horizontal.
- Modal que nao cabe na tela mobile.
- Sidebar que ocupa 80% da viewport em <768px.
- **Fix**: testar em 375px e 768px. Cada breakpoint tem layout dedicado.

### 2.6 Hierarquia visual plana
- Tudo com mesmo peso visual. Usuario nao sabe onde olhar.
- 5 botoes do mesmo tamanho lado a lado.
- **Fix**: 1 elemento dominante por sessao (CTA, metrica principal, titulo). Resto subordinado.

### 2.7 Cores semanticas sem padrao
- Verde para "Confirmar" em uma tela, vermelho em outra.
- Vermelho para "Error" e tambem para "Action" (delete).
- **Fix**: criar token system rigido (`color.success`, `color.danger`, `color.action`) e aplicar.

### 2.8 Microinteracoes ausentes
- Click sem feedback. Hover sem mudanca. Loading sem skeleton.
- Acao executa mas nada na tela muda visualmente -> usuario clica de novo achando que falhou.
- **Fix**: 100% das acoes tem feedback (toast + state change).

### 2.9 Form validation pobre
- Erro so depois de submit, lista no topo. Usuario nao sabe qual campo.
- "Invalid input" sem dizer o que esperar.
- **Fix**: validacao on-blur, mensagem inline com contexto especifico.

### 2.10 Genericos demais (sem personalidade)
- "Sample SaaS Dashboard" — funciona pra qualquer produto.
- Ausencia de copy especifica do dominio.
- **Fix**: copy reflete o usuario ("Vai jogar agora?" > "Iniciar sessao").

### 2.11 Densidade errada
- Dashboard de poker pro com whitespace de blog. Ou fanasic com 0px de respiro.
- **Fix**: pro user (poker) = densidade alta, mas com respiro entre grupos.

### 2.12 Skeumorfismo desnecessario
- Sombras 3D, gradients, bevels que nao agregam.
- **Fix**: flat com nivel sutil de elevacao (1-2 niveis de shadow).

### 2.13 Falta de estados intermediarios
- So tem "loading" e "loaded". Ignora "loaded mas vazio", "loaded mas sem permissao", "rede caiu".
- **Fix**: 5 estados minimo: idle, loading, loaded-with-data, loaded-empty, error.

### 2.14 Modais para tudo
- Cada acao abre modal. Usuario perde contexto. Modal abre modal abre modal.
- **Fix**: prefer slide-over para edicao, modal so para confirmacao destrutiva e criacao curta.

### 2.15 Copy em ingles/portunhol misturado
- "Salvar" + "Cancel" no mesmo botao group.
- **Fix**: i18n consistente. PT-BR puro neste app.

### 2.16 Icone sem texto em destinos pouco usados
- Sidebar collapsed, icone ambiguo, sem tooltip.
- **Fix**: tooltip on hover SEMPRE em icon-only buttons.

### 2.17 Multipla fonte de verdade visual
- 3 lugares mostram "saldo" com numeros divergentes (cache stale).
- **Fix**: invalidar query global apos mutation. Usar TanStack Query keys consistentes.

---

## PARTE 3 — Checklist de Auditoria por Pagina

Aplicar em CADA pagina:

### Estrutura
- [ ] Titulo da pagina claro (h1) com proposito explicito
- [ ] Hierarquia visual: 1 elemento dominante, resto subordinado
- [ ] Whitespace consistente entre secoes (gap-4/6/8)
- [ ] Mobile: layout funciona em 375px

### Estados
- [ ] Empty state ensina ou oferece acao (nao so "Nada aqui")
- [ ] Loading state (skeleton, nao spinner full-screen)
- [ ] Error state com retry
- [ ] Estado "sem permissao" tratado

### Navegacao
- [ ] Breadcrumb se profundidade >=3
- [ ] Active state na sidebar visivel
- [ ] Botao back/voltar quando aplicavel
- [ ] URL reflete estado (filtros via query params)

### Acoes
- [ ] 1 CTA primario por tela
- [ ] Botoes com texto descritivo (acao + objeto)
- [ ] Hover/focus state em todo clicavel
- [ ] Confirmacao em acoes destrutivas
- [ ] Feedback visual pos-acao (toast + state change)

### Formularios
- [ ] Labels visiveis
- [ ] Validacao inline on-blur
- [ ] Mensagens de erro especificas
- [ ] Botao submit com loading state
- [ ] Botao cancelar/voltar
- [ ] Campos required marcados

### Tabelas
- [ ] Sticky header
- [ ] Sort visual (setas)
- [ ] Filter chips removiveis
- [ ] Empty cell = "—"
- [ ] Virtualizacao se >200 linhas
- [ ] Density apropriada
- [ ] Bulk actions se aplicavel

### Acessibilidade
- [ ] Contraste >=4.5:1
- [ ] Focus-visible
- [ ] Keyboard nav (Tab, Esc, Enter)
- [ ] aria-labels em icon buttons
- [ ] Roles semanticos

### Performance / UX
- [ ] Sem CLS (layout shift) on load
- [ ] Imagens com width/height fixos
- [ ] Lazy load de pesado
- [ ] Optimistic UI em acoes rapidas

### Domain-fit (poker pro)
- [ ] Copy em PT-BR consistente
- [ ] Numeros monetarios com moeda + formatacao
- [ ] Datas em formato BR (dd/mm/yyyy ou relativo)
- [ ] Densidade compativel com pro user (alta)
- [ ] Atalhos teclado para acoes frequentes

---

## PARTE 4 — Padroes Best-in-Class (referencias)

- **Linear**: command palette, density toggle, slide-over, optimistic UI, animacoes 150ms
- **Stripe Dashboard**: filtro por data globalmente, breadcrumbs, drill-down, skeleton screens
- **Notion**: empty states pedagogicos, inline edit
- **Vercel**: dark mode-first, navegacao por search, status visual claro
- **GitHub**: keyboard shortcuts (`?` mostra atalhos), toast cantos, copy direta
- **Sharkscope/Pocket52** (poker): tabelas densas, filtros multiplos, comparacao multi-jogador

---

## Conclusao

Este documento e a referencia. Cada pagina sera auditada contra:
1. Boas praticas Parte 1 (12 secoes)
2. Anti-patterns IA Parte 2 (17 itens)
3. Checklist Parte 3

Saida do audit: lista priorizada de melhorias por pagina com:
- **Severidade**: P0/P1/P2/P3
- **Esforco**: low/med/high
- **Impacto**: low/med/high
- **Tipo**: bug visual / inconsistencia / oportunidade / acessibilidade
