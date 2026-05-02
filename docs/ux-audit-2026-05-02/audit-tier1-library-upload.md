# UX Audit — Tier 1 (TournamentLibraryNew + UploadHistory)

---

## 3. TournamentLibraryNew (`/library`) — `TournamentLibraryNew.tsx`

### Contexto
1019 linhas. Biblioteca estatistica de torneios agrupados. KPIs (4 cards) + filtros expandivel (periodo, sites, categorias, speeds, ROI, volume min, buy-in range) + grid de cards de grupos com modal-detalhe (tabela + 5+4 stats).

### Achados

#### P1 — Filtros visualmente excessivos
- **Problema**: Cada filtro tem gradiente proprio (emerald, blue, orange, purple, green, cyan, yellow), bullet colorido, header uppercase, border + background. 7 cores de "destaque" lutando entre si. Anti-pattern 2.7 (cores semanticas sem padrao).
- **Linhas**: 408-606. Cada secao replica padrao de "feature box" com gradient.
- **Fix**: Cards de filtro usam estilo **uniforme neutro**. Cor so no badge ativo. Reduz peso visual 60%.

#### P1 — Filter chips e filter buttons duplicam funcao
- **Problema**: Linha 628-672 mostra filter chips (`Periodo: Mes atual [x]`). Mas filtros tambem aparecem como botoes selecionados acima (linha 412-433 etc). Usuario tem 2 lugares pra mesma info.
- **Anti-pattern**: 2.17 (multipla fonte de verdade visual).
- **Fix**: Manter SO chips no topo (acima da grid) + collapsable filter panel. Quando colapsado, chips sao a unica fonte. Quando expandido, reusar mesmos chips.

#### P1 — Card de grupo extremamente denso
- **Problema**: Cada card mostra: badge confidence + nome + site badge + ROI + IC + Profit + 3-grid Volume/ABI/Field + 3-grid Volat/Pos/ROI ajustado + 3-grid ITM/FT/Reentries + 2 tags + outlier alert. **15 datapoints por card**. Em grid de 4 colunas, virar muro de numeros.
- **Anti-pattern**: 2.6 (cards aninhados implicitos), saturacao.
- **Fix**:
  - Card resumido: **3 stats principais** (ROI, Volume, Profit). Badge confidence + nome + site.
  - Hover/click expande com resto. Ou usar density toggle (compact / detail).
  - Modal-detalhe ja tem TUDO (linha 877+) — ok para expansao.

#### P1 — Empty state passa visualmente
- **Problema**: Linha 712-738. Card centrado com icone + texto + botao. OK semanticamente, mas **nao difere visualmente** dos outros cards. Usuario pode confundir.
- **Fix**: Empty state em hero centralizado da viewport com mais ar. Diferente do card pattern.

#### P2 — Sort dropdown sem persistencia
- **Problema**: `sortBy` + `sortOrder` sao state local. Refresh perde escolha. Power user que sempre ordena por "ROI desc" tem que reset toda vez.
- **Fix**: Persistir em URL (mesmo padrao do Dashboard FP-11) ou localStorage.

#### P2 — Sem virtualizacao
- **Problema**: Grid renderiza TODOS grupos. Se usuario tem 200+ grupos (possivel pra grinder old), DOM trava. `filteredAndSortedGroups.map(...)` direto.
- **Anti-pattern**: 1.7 (virtualizacao).
- **Fix**: react-virtual pra grid quando >50 grupos.

#### P2 — Modal de detalhe sem export
- **Problema**: Modal mostra tabela de torneios (linha 947-1010). Sem botao "Exportar CSV" / "Compartilhar este grupo". Power user precisa.
- **Fix**: Header do modal: `[Exportar] [Comparar com outro grupo]`.

#### P2 — Tabela do modal sem sort/filter
- **Problema**: Tabela ordenada por data desc apenas. Sem clique-pra-sortear-coluna. 8 colunas (Data, Site, Nome, Tipo, Velocidade, Buy-in, Pos/Total, Profit).
- **Fix**: Sortable headers. Filtro de buy-in / data range no topo.

#### P2 — Confidence grade tooltip inconsistente
- **Problema**: Card tem `Tooltip` com `getConfidenceTooltip(group.confidenceGrade)` (helper externo). Mas modal mostra grade sem tooltip (linha 916-919). Inconsistencia.
- **Fix**: Tooltip em todo lugar com `confidenceGrade`.

#### P2 — Volatilidade mostrada em "BI" sem afford
- **Problema**: `4.5 BI` precisa contexto (BI = Buy-Ins de SD). Power users entendem; new users nao. Tooltip ajuda mas o numero solto e cripto.
- **Fix**: Label inline "(SD em buy-ins)". OU mantive so tooltip e aceitar audience pro.

#### P3 — Loading skeleton nao bate com layout final
- **Problema**: Skeleton (linha 256-304) mostra 4 KPIs + sidebar 1col + 6 cards 3col. Mas layout real e 4 KPIs + filtros expandidos + grid 4col. Layout shift garantido.
- **Fix**: Skeleton matchando final.

#### P3 — Botao toggle filtros invisivel no flow
- **Problema**: Linha 612-623. Botao 16px x 8px chevron isolado no centro. Pequeno, mole.
- **Fix**: Header dos filtros tem label "Mostrar/Ocultar filtros". Ou substituir por X no canto direito.

#### P3 — Periodo "all" como default mascara performance recente
- **Problema**: "Tudo" desde sempre. Usuario novo ve dados mortos de 2 anos atras misturados com agora.
- **Fix**: Default = "Ultimos 90d". Mantem "Tudo" disponivel.

### Recomendacoes Acionaveis Library

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| L1 | Filtros uniformes (sem 7 gradientes) | P1 | M | High |
| L2 | Filter chips como unica fonte de verdade | P1 | M | High |
| L3 | Card compacto + density toggle | P1 | M | High |
| L4 | Empty state hero centralizado | P1 | L | Med |
| L5 | Persistir sort em URL | P2 | L | Med |
| L6 | Virtualizar grid >50 grupos | P2 | M | Low |
| L7 | Export do modal de detalhe | P2 | L | Med |
| L8 | Sortable headers no modal | P2 | L | Med |
| L9 | Tooltip confidence em todo lugar | P2 | L | Low |
| L10 | Default periodo = 90d | P3 | L | High |
| L11 | Skeleton match layout | P3 | L | Low |
| L12 | Botao toggle filtros mais visivel | P3 | L | Low |

---

## 4. UploadHistory (`/upload`) — `UploadHistory.tsx`

### Contexto
590 linhas. Pagina ENTRY do app (sem upload, app nao tem dados). Componentes: AutoUpload + 3 stat cards + lista uploads + GranularDataCleanup (sub-component).

### Achados

#### P0 — Pagina critica sem onboarding inline
- **Problema**: Primeira visita do user pos-cadastro: chega aqui, ve `<AutoUpload>` (sem saber qual rede aceita, formato, etc). Sem **guia visual** "como exportar do PokerStars", "como pegar do GG". Sem sample CSV pra testar.
- **Anti-pattern**: 1.6 (onboarding fraco).
- **Fix**:
  - Acima do upload: tabs "WPN | GG | Stars | Party | 888 | Bodog | ..." cada uma com **tutorial visual** (3 steps + screenshot do site origem).
  - Botao "Baixar exemplo CSV" pra testar sem dados reais.
  - Empty state da lista (linha 258-263) mostra "Voce ainda nao importou. Veja como [aqui]" link inline.

#### P1 — Loading state spinner full
- **Problema**: Linha 92-101. Quando ambas queries `isLoading`, mostra spinner gigante centralizado. Layout shift quando carrega.
- **Anti-pattern**: 1.4 (spinner > skeleton).
- **Fix**: Skeleton que reflete layout (header + upload card + 3 stat cards + lista).

#### P1 — Error state engole UI util
- **Problema**: Linha 104-123. Se ambas queries falham, esconde TUDO e mostra so error+retry. Usuario nao consegue importar nem ver data section.
- **Fix**: Erro inline em CADA secao. Upload card sempre disponivel. Stats e lista mostram erro localmente.

#### P1 — `GranularDataCleanup` colado no fim da pagina
- **Problema**: Linha 354-588. Acao destrutiva (delete bulk torneios) na MESMA pagina de upload, sem separacao visual forte. User pode confundir "Upload" com "Limpar".
- **Anti-pattern**: 1.5 (recover affordance nao basta — reduzir blast radius).
- **Fix**:
  - Mover pra Settings > "Dados" tab.
  - OU manter aqui mas em **section separada com aviso forte** + collapsed by default.

#### P2 — Stat cards sem trend
- **Problema**: 3 cards (Total Torneios, Sites Ativos, Uploads Concluidos). Numeros estaticos. Sem "+12 essa semana".
- **Fix**: Sparkline ou delta vs semana passada.

#### P2 — Lista de uploads sem filtros
- **Problema**: Lista cresce indefinidamente. Sem filtro por status (success/error), sem search por filename, sem date range.
- **Fix**: Filter bar acima da lista: `[Status: Todos] [Site: Todos] [Buscar...]`.

#### P2 — Upload result `uploadResult.show` nunca dispara
- **Problema**: Linhas 26-31 e 325-352. State `uploadResult` definido mas `setUploadResult` nunca chamado. Codigo morto.
- **Anti-pattern**: 2.10 (codigo morto).
- **Fix**: REMOVER bloco OU implementar chamada via `AutoUpload onUploadComplete` (passar imported/errors/duplicates de `result`).

#### P2 — Delete sem confirmacao
- **Problema**: Linha 305-313. Botao trash deleta upload + invalida queries SEM confirmar. Acao destrutiva (perde torneios associados).
- **Anti-pattern**: 2.x (destruction without confirm).
- **Fix**: AlertDialog "Excluir N torneios deste upload?" antes do delete.

#### P2 — Duplicacao "scale-[1.02]" em cards
- **Problema**: Cards stats tem `hover:scale-[1.02]`. Mesma critica do Home.
- **Fix**: Remover.

#### P2 — Header centralizado (text-center) inconsistente com app
- **Problema**: Linha 128-131. Resto do app usa h1/h2 alinhado a esquerda. Aqui esta `text-center`. Quebra consistencia.
- **Fix**: Esquerda padrao.

#### P3 — `AutoUpload` invalida 12 queries
- **Problema**: Linha 152-166. Lista hardcoded de queryKeys. Manter sincronizado dificil.
- **Fix**: Helper `invalidateAfterUpload(queryClient)` em `lib/`.

#### P3 — `GranularDataCleanup` "CONFIRMAR" exato
- **Problema**: Linha 555. User digita "CONFIRMAR" exato. Bom pra evitar acidente, mas anti-pattern em UX moderno (Github usa nome do repo, mais memoravel).
- **Fix**: Pedir digitar `excluir <N> torneios` ou similar contextual.

### Recomendacoes Acionaveis Upload

| # | Acao | Severidade | Esforco | Impacto |
|---|------|------------|---------|---------|
| U1 | Tutorial por rede + sample CSV | P0 | H | High |
| U2 | Skeleton ao inves de spinner | P1 | L | Med |
| U3 | Error inline por secao | P1 | M | Med |
| U4 | Mover GranularDataCleanup pra Settings | P1 | M | High |
| U5 | Confirmacao no delete de upload | P2 | L | High |
| U6 | Filter bar na lista de uploads | P2 | M | Med |
| U7 | Stats com sparkline/delta | P2 | M | Med |
| U8 | Remover uploadResult morto | P2 | L | Low |
| U9 | Remover hover:scale | P2 | L | Low |
| U10 | Header alinhado esquerda | P2 | L | Low |
| U11 | Helper invalidate centralizado | P3 | L | Low |
| U12 | Confirmacao contextual no bulk delete | P3 | L | Low |
