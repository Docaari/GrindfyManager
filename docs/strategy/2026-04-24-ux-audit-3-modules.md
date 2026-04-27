# Auditoria UX + Gerador de Ideias — Tournament Selector, Grade Planner, Grind Session Live

**Data:** 2026-04-24
**HEAD:** 333d6bf
**Autor:** Strategist (Product Agent)
**Contexto:** Pos Sprint 1 + 2 (Tournament Selector + Bankroll), pivot para aprofundar os 3 modulos core em vez de criar features novas. Foco em wins de UX de pouca friccao e alto impacto percebido.

---

## 1. Resumo da auditoria

Fiz walkthrough dos 3 modulos no codigo real (sem rodar UI, mas lendo toda a cadeia: pagina -> sub-componente -> hook -> mutation). Os 3 modulos tem boa qualidade de engenharia (Sprints 1/2 aumentaram a barra), mas sofrem dos problemas tipicos de quem iterou muito e acumulou camadas sem refinar: **feedback inconsistente apos acoes**, **decisoes escondidas em menus de 3 cliques**, **nomes tecnicos na UI** e **estados vazios/edge cases pouco cuidados**. Nenhum problema arquitetural — so polimento.

**Tamanho dos modulos:**
- `GrindSessionLive.tsx`: 1868 linhas (god component — renderiza 8 dialogs diretos)
- `GradePlanner.tsx`: 924 linhas (bem modularizado ja)
- Tournament Selector: 5 componentes (~600 linhas total) — mais enxuto

---

## 2. Auditoria por modulo

### 2.1 Tournament Selector

Widget em duas entradas: aba "Tournament Selector" no desktop (`GradePlanner.tsx:815`) e aba "Selector" no mobile (`GradePlanner.tsx:796`). Produz ranking 0-100 + grade S/A/B/C/D com rationale em PT-BR. Sprint 1 foi aprovado; agora falta polir o surface.

#### Friction points

| # | Problema | Evidencia | Severidade |
|---|----------|-----------|------------|
| TS-1 | **"Fonte" oculta o significado.** O label "Suprema + Biblioteca" nao diz ao usuario que Suprema = torneios agendados vindos da API externa, Biblioteca = historico salvo. Usuario nao sabe o que perde ao desabilitar. | `SelectorFilters.tsx:28-32` | Media |
| TS-2 | **Sliders "Score minimo" e "Sample minimo" sem contexto.** Valor default 0 nunca filtra nada. Usuario nao entende que "minSample 50" corta 90% dos itens. | `SelectorFilters.tsx:94-114` | Media |
| TS-3 | **Filtro por bankroll aparece disabled sem caminho claro.** Tooltip avisa "Configure em /settings" mas nao ha link, so texto. | `SelectorFilters.tsx:118-139` | Alta |
| TS-4 | **Cold start usa dois tipos de banner mas o texto nao diz o que fazer.** `'pure'` diz "importe pelo menos 50" — usuario nao sabe se vai para upload ou biblioteca. | `SelectorPanel.tsx:81-100` | Alta |
| TS-5 | **Suprema offline e erro silencioso nos scores.** Quando `supremaUnavailable === true`, o ranking roda so com biblioteca sem explicar que scores podem mudar drasticamente quando Suprema voltar. | `SelectorPanel.tsx:102-110` | Baixa |
| TS-6 | **"Ver Detalhes" mostra tabela tecnica com "ROI bruto / Sample / Shrink / Peso".** Jogadores de poker entendem ROI, mas nao "shrinkage Bayesian (K=30)". O tooltip da confianca esta escondido atras de hover. | `SelectorDetailsModal.tsx:50-93` | Media |
| TS-7 | **Badge "Fora do bankroll" aparece mas nao explica quanto acima.** `<Badge variant="destructive">Fora do bankroll</Badge>` nao diz "R$50 acima do limite" ou "150% do limite" — usuario nao sabe se e shot ou overshoot. | `SelectorCard.tsx:148-150` | Media |
| TS-8 | **Acao primaria e "Adicionar a grade" — mas qual dia/perfil?** O `addMutation` envia `tournament.dayOfWeek` direto (`SelectorCard.tsx:55-64`), sem escolha do usuario. Se o torneio Suprema esta agendado quarta 20h e o usuario esta planejando terca, entra na quarta sem aviso. | `SelectorCard.tsx:53-94` | Alta |
| TS-9 | **`alreadyInGrid` nao avisa ONDE esta na grade.** Botao vira "Ja na grade" mas nao deeplink para celula. | `SelectorCard.tsx:186-191` | Baixa |
| TS-10 | **Botao "Atualizar" faz invalidate + refetch simultaneos, cria race condition visual.** Query key invalida dispara fetch automatico, e `refetch()` dispara outro — em ambientes lentos aparecem 2 loaders em sequencia. | `SelectorPanel.tsx:70-73` | Baixa |

#### Oportunidades nao exploradas

- **Grade do card ja tem icon/bg/texto semantico** (`SelectorCard.tsx:24-31`) — mas a cor semantica nao esta usada no summary: "3 de 25 torneios" poderia ser "3 grade-A disponiveis, 8 grade-B, ..." como pills clicaveis.
- **`tournament.metadata.fromSelector`** e salvo no planned tournament — mas nunca e exibido de volta no chip da Grade. Usuario nao ve que aquele torneio veio da recomendacao.
- **`SelectorDetailsModal`** ja tem todos os dados de signals em estrutura rica — com 1h de trabalho vira um mini-radar chart.

---

### 2.2 Grade Planner (GradePlanner.tsx + WeekGrid.tsx + BibliotecaPanel.tsx)

O planejador e o modulo com mais sub-componentes (grade-planner/ tem 17 arquivos). O refactor foi bem feito; o que falta e polir o fluxo de interacao.

#### Friction points

| # | Problema | Evidencia | Severidade |
|---|----------|-----------|------------|
| GP-1 | **Clicar em celula OFF so mostra toast — sem acao rapida.** `handleClickEmptyCell` avisa "Este dia esta OFF", mas nao oferece botao "Ativar perfil A" inline. Usuario tem que fechar toast + ir na celula do header + escolher perfil. | `GradePlanner.tsx:391-401` | Alta |
| GP-2 | **OFF Dialog mostra os torneios afetados mas sem acao contextual.** Lista os torneios (name + time + buyIn) mas nao deixa o usuario movelos para outro dia direto dali — so cancelar ou desativar. | `GradePlanner.tsx:882-920` | Media |
| GP-3 | **Perfis A/B/C sem semantica visivel.** Usuario precisa abrir `ProfileComparison` (clicar "Comparar") para ver o que sao os perfis. O proprio header da coluna nao mostra nem uma pista ("A = agressivo" etc.). | `WeekGrid.tsx:137-153` | Media |
| GP-4 | **4 botoes A/B/C/OFF em header apertado de 80-120px.** Em mobile, os botoes `w-9 h-7` (36px largura) lado a lado ficam ilegiveis — 4 botoes x 36px = 144px, maior que a coluna. | `WeekGrid.tsx:137-153` | Alta (mobile) |
| GP-5 | **Chip na celula trunca nome agressivamente sem fallback.** `TournamentChip` usa `truncate` sem mostrar buyIn preservado — em viewport estreito, usuario ve "$5 WPN..." sem distinguir qual WPN. | `TournamentChip.tsx:69-71` | Media |
| GP-6 | **Overflow indicator "+N torneios" esconde torneios menores.** Se 5 torneios cabem no mesmo slot, o sistema mostra 3 e esconde 2 — escolhe por ordem de criacao, nao por prioridade. Usuario de alto volume nao sabe que tem torneios escondidos. | `WeekGrid.tsx:228-235`, `grade-cell-overflow.ts` | Media |
| GP-7 | **"Comparar perfis" tem 1 clique para abrir mas nao da para fechar clicando fora.** `ProfileComparison` expande inline e so fecha no proprio botao. Usa espaco vertical do viewport. | `GradePlanner.tsx:693-700` | Baixa |
| GP-8 | **Biblioteca: drop disabled (so drag para grade).** Mas nao tem toast quando usuario tenta arrastar para dentro da propria biblioteca — drop falha silenciosamente. | `BibliotecaPanel.tsx:270, 624` | Baixa |
| GP-9 | **Biblioteca: "Importar" tem 4 botoes (Manual/Historico/Suprema/Bodog) mas Bodog esta disabled "Em breve".** Ocupa slot util sem data. | `BibliotecaPanel.tsx:483-492` | Baixa |
| GP-10 | **Editar torneio abre dialog com 18+ campos expandidos.** `editForm` tem gameType, startingStack, maxPlayers, blindLevelMinutes, lateRegMinutes, alertMinutesBefore, allowsAddOn, addOnCost, allowsReentry, maxReentries. A maioria vem null do upload. Form e esmagador. | `GradePlanner.tsx:301-322`, `EditDialog.tsx` | Alta |
| GP-11 | **Banner empty-state "Adicione primeiro torneio" nao some quando o usuario arrasta da biblioteca.** So some quando `plannedTournaments.length > 0` — o que e correto, mas o banner sobrepoe a grade ate a query invalidar. | `GradePlanner.tsx:727-751` | Baixa |
| GP-12 | **Sticky summary bar + CTA Banner + Tabs = 3 faixas horizontais antes da grade aparecer.** Em laptop 13" o usuario ve ~2 slots antes de rolar. | `GradePlanner.tsx:718-832` | Media |

#### Oportunidades nao exploradas

- **`calculateMove`** ja tem logica de drag-entre-celulas validando profile do destino — mas se o destino ta em perfil diferente, move silenciosamente. Poderia perguntar "Mover para perfil B?" (1 confirm).
- **Tooltip do chip** tem todos os dados (`TournamentChip.tsx:80-106`). Virar popover com "Duplicar / Mover / Remover" dobra valor com 20 linhas de codigo.
- **`gradeStartHour/gradeEndHour`** ja e configuravel. Mostrar preview "Sua grade vai de 12h as 3h (15h de janela)" no settings reduz tentativa-erro.
- **Botao "Comparar"** poderia abrir uma ROW compacta no topo com A/B/C ao inves de tela cheia de `ProfileComparison`.

---

### 2.3 Grind Session Live (GrindSessionLive.tsx)

1868 linhas, renderiza 8 dialogs, mistura state de bankroll, breaks, alerts, reentry, timer e selecao bulk. E o modulo mais critico porque e usado **durante** a jogatina — cada segundo perdido e EV perdido.

#### Friction points

| # | Problema | Evidencia | Severidade |
|---|----------|-----------|------------|
| GL-1 | **Bankroll Shot Modal e bloqueante mas nao tem keyboard shortcut (Enter = Confirmar).** Em meio a sessao com 10 torneios rodando, um modal sem shortcut e 2 cliques extras. | `GrindSessionLive.tsx:1829-1865` | Alta |
| GL-2 | **Bankroll toast "Exposicao elevada (10% da banca)" dispara a cada 1%.** `lastAccumulatorWarnedRef.current < Math.floor(pctExposed * 100)` — em sessao longa, um usuario com 20 torneios pode ver 10 toasts. Ruido. | `GrindSessionLive.tsx:162-178` | Media |
| GL-3 | **Botao "GG!" vermelho no canto direito do card registrado sem confirmacao.** Dois cliques de GG destroem o registro. Apenas quando tem ReA pergunta "re-entry ou bust". Para torneios normais, nenhum undo. | `TournamentCard.tsx:285-291` | Alta |
| GL-4 | **"Registrar Resultado" e "GG!" sao botoes separados — mas ambos finalizam o torneio.** Usuario confunde: "Registrar" abre dialog com premio/bounty; "GG!" finaliza direto. Semantica invertida do esperado (registrar deveria cadastrar, nao finalizar). | `TournamentCard.tsx:275-291` | Alta |
| GL-5 | **Re-entry queue FIFO nao mostra quantos estao na fila.** Se o usuario busta 3 torneios ReA em sequencia, o segundo e terceiro ficam em queue mas sem badge visivel. | `GrindSessionLive.tsx:221-224`, `reentryQueue.items` | Media |
| GL-6 | **`window.confirm('Remover este torneio?')` no delete — inconsistente com outros dialogs.** Todos os outros fluxos usam shadcn/ui Dialog; `handleDeleteTournament` usa confirm nativo. | `GrindSessionLive.tsx:1167` | Media |
| GL-7 | **Timer de sessao via DOM direct manipulation.** `document.getElementById('sessionTimer')` atualizado por useEffect — anti-pattern React. Se o elemento desmonta, timer continua escrevendo em DOM fantasma. | `GrindSessionLive.tsx:1250-1258` | Media (tecnica) |
| GL-8 | **Screen cap alert via toast com throttle de 60s — mas nao mostra acao.** Toast "Limite atingido!" aparece mas nao diz "Finalize um torneio antes de adicionar".| `GrindSessionLive.tsx:1276-1282` | Media |
| GL-9 | **Site filter buttons tem UX esquisito: um clique seleciona, outro clique no MESMO filtro volta pra "all".** `siteFilter === site ? "all" : site`. Usuario espera comportamento de radio, nao toggle. | `GrindSessionLive.tsx:1557` | Baixa |
| GL-10 | **Bulk select mostra checkbox em cada card, mas so aparece se `onToggleSelect` for passado.** Isso significa que o usuario ve checkboxes direto — sem botao "modo selecao". Em mobile e facil acionar por acidente. | `TournamentCard.tsx:97-105`, `GrindSessionLive.tsx:1602-1627` | Media |
| GL-11 | **Break banner tem 3 botoes (Responder / Adiar 15min / Pular) mas "Pular" some se `breakSnoozeCount >= max`.** Usuario nao sabe que usou todos os snoozes. | `GrindSessionLive.tsx:1436-1444` | Baixa |
| GL-12 | **"Finalizar sessao" + "Notas finais" vai para modal com textarea — mas o modal `Dialog` abre sobre os torneios pendentes sem mostra-los.** Usuario clica "Finalizar" sem saber que tem 3 torneios rodando. | `GrindSessionLive.tsx:1786-1815` | Alta |
| GL-13 | **Suprema import modal: `excludeExternalIds={[]}`.** Sempre vazio — imports duplicados sao possiveis. | `GrindSessionLive.tsx:1818` | Alta (bug disfarcado de UX) |
| GL-14 | **Sessao com `dailyGoals` mostra card grande "OBJETIVOS DA SESSAO" em cima.** Depois de 4h de sessao ja nao e relevante; sem "dismiss" a faixa ocupa 120px. | `GrindSessionLive.tsx:1473-1480` | Baixa |
| GL-15 | **Result dialog tem 3 inputs (Premio/Bounty/Posicao) sempre visiveis — mas PKOs tem bounty, Vanilla nao.** Mostrar bounty para Vanilla e ruido; nao mostrar para PKO e erro. | `TournamentCard.tsx:330-354` | Media |

#### Oportunidades nao exploradas

- **`addOnState`** ja existe e funciona — mas o `AddTournamentDialog` nao permite marcar addOn/ReA no momento do registro. Obriga editar depois.
- **Alert Bell popover** ja cria alertas pontuais de late reg. Juntar com o `AlertsPanel` generico reduziria 2 UIs separadas para alerta.
- **`getFilteredSuggestions`** tem ranking de similaridade por site/type/speed/buyIn — mas so mostra dentro do dialog de adicionar. Mostrar "3 similares foram bons ROI" direto no card de upcoming e 1 linha.
- **Quick notes ja persistem em JSON no `finalNotes` do session.** So falta exibir lista consolidada durante a sessao, nao so no finalize.
- **`calculateSessionStats`** ja retorna `totalEntries`, `reentradas`, `addOnsPaid`. Dashboard ja mostra — poderia mostrar **delta vs plan** (plano dizia 15 torneios, voce ta em 8 = "off-pace").

---

## 3. Ideias de melhoria (15-20 ideias)

### Tournament Selector

| ID | Titulo | Problema | Solucao | Arquivos | Esforco | Impacto | Ready |
|----|--------|----------|---------|----------|---------|---------|-------|
| TS-A | Deep link para bankroll config | TS-3: filtro disabled sem caminho | Tooltip + `<a href="/settings#bankroll">` como botao dentro do tooltip. | `SelectorFilters.tsx` | S | 3 | SIM |
| TS-B | Cold start CTA direciona pra upload | TS-4: banner cold-start sem acao | Adicionar `<Button onClick={() => setLocation('/upload-history')}>Importar agora</Button>` no banner `coldStart === 'pure'`. | `SelectorPanel.tsx` | S | 4 | SIM |
| TS-C | Badge bankroll mostra delta em $ | TS-7: "Fora do bankroll" vago | Trocar `<Badge>Fora do bankroll</Badge>` por `<Badge>$X acima (Y% do limite)</Badge>` usando `tournament.buyInUSD` vs `bankroll.maxBuyInUSD`. | `SelectorCard.tsx` | S | 4 | SIM |
| TS-D | Escolha de dia/perfil ao adicionar | TS-8: adicao silenciosa no dia errado | Trocar mutation direta por `showDayPickerDialog` quando `tournament.dayOfWeek` difere do hoje. Reusar `EditDialog showDayPicker=true`. | `SelectorCard.tsx`, `GradePlanner.tsx` | M | 5 | SIM |
| TS-E | Source summary pills (A=5, B=8, ...) | Oportunidade: visual de grade | Adicionar linha acima da lista: 5 pills `[S 2] [A 5] [B 8] [C 7] [D 3]` clicaveis que filtram. Usar `useMemo` sobre `data.tournaments`. | `SelectorPanel.tsx` | M | 4 | SIM |
| TS-F | Details modal: explicacao em PT | TS-6: termos tecnicos | Adicionar `<Accordion>` "Como funciona?" abaixo da tabela com texto em PT-BR sobre shrinkage e peso. | `SelectorDetailsModal.tsx` | S | 2 | SIM |
| TS-G | Chip "via Selector" na Grade | Oportunidade: feedback loop | No `TournamentChip`, se `tournament.metadata?.fromSelector`, adicionar estrela dourada com tooltip "Recomendado por Selector (score X)". | `TournamentChip.tsx`, `shared/grade-chip-data.ts` | S | 3 | SIM |

### Grade Planner

| ID | Titulo | Problema | Solucao | Arquivos | Esforco | Impacto | Ready |
|----|--------|----------|---------|----------|---------|---------|-------|
| GP-A | Clique em celula OFF sugere ativar | GP-1: toast sem acao | Trocar `toast({title: "... OFF"})` por toast com `action: <Button>Ativar perfil A</Button>`. Shadcn toast suporta. | `GradePlanner.tsx` | S | 5 | SIM |
| GP-B | OFF dialog permite "mover para outro dia" | GP-2: acao contextual | Adicionar `<Select>` no dialog "Para onde mover?" com dias A/B/C ativos. Submit move os torneios via `updateTournamentMutation`. | `GradePlanner.tsx` | M | 4 | SIM |
| GP-C | EditDialog colapsa campos avancados | GP-10: form esmagador | Envolver campos gameType/stack/blinds/etc em `<Collapsible>` "Avancado". Default fechado. | `EditDialog.tsx` | S | 4 | SIM |
| GP-D | Overflow chip ordenado por prioridade | GP-6: esconde torneios caros | `getCellDisplayInfo` ordena por `prioridade ASC` antes de cortar. Top 3 sempre sao os mais importantes. | `shared/grade-cell-overflow.ts` | S | 4 | SIM |
| GP-E | Profile labels customizaveis | GP-3: perfis opacos | Adicionar `profileLabels` em `user_settings` (A/B/C = strings ate 20 char). Renderizar no header `A (Agressivo)`. | `schema.ts`, `WeekGrid.tsx`, settings | M | 3 | SIM |
| GP-F | Mobile: picker de perfil em popover | GP-4: botoes A/B/C/OFF ilegiveis | Em breakpoint `sm`, trocar 4 botoes por 1 botao "Perfil: A" que abre popover. | `WeekGrid.tsx` | M | 4 | SIM |
| GP-G | Remove botao Bodog em breve | GP-9: slot morto | Remover temporariamente o botao desabilitado ate haver integracao. | `BibliotecaPanel.tsx` | S | 2 | SIM |

### Grind Session Live

| ID | Titulo | Problema | Solucao | Arquivos | Esforco | Impacto | Ready |
|----|--------|----------|---------|----------|---------|---------|-------|
| GL-A | Bankroll modal suporta Enter | GL-1: 2 cliques extras | Adicionar `onKeyDown={e => e.key === 'Enter' && handleConfirm()}` no modal div + focus no botao confirm ao abrir. | `GrindSessionLive.tsx` | S | 5 | SIM |
| GL-B | GG! com undo toast de 8s | GL-3: sem confirmacao de GG | Ao clicar GG (sem ReA), disparar `updateTournamentMutation` + mostrar toast com `action: <Button>Desfazer</Button>` por 8s que reverte status. | `GrindSessionLive.tsx`, `TournamentCard.tsx` | M | 5 | SIM |
| GL-C | Dedupe Suprema import | GL-13: duplicatas | Popular `excludeExternalIds` com `sessionTournaments.filter(t => t.site === 'Suprema').map(t => t.externalId)`. | `GrindSessionLive.tsx:1818` | S | 5 | SIM |
| GL-D | Confirm session end lista pendentes | GL-12: modal cego | No dialog de finalizar, listar `pendingList` antes do textarea: "Voce tem X torneios rodando:". | `GrindSessionLive.tsx:1786` | S | 5 | SIM |
| GL-E | Bankroll toast: throttle por tier (10/15/25%) | GL-2: toasts repetidos | Substituir `Math.floor(pctExposed * 100)` por tiers discretos `[10, 15, 25, 50]` — so dispara ao cruzar tier novo. | `GrindSessionLive.tsx:170-178`, helpers | S | 4 | SIM |
| GL-F | Result dialog adapta ao tipo | GL-15: PKO vs Vanilla | No `RegisteredCard`, so mostrar bounty input se `tournament.type === 'PKO' \|\| 'Mystery'`. | `TournamentCard.tsx:330-354` | S | 3 | SIM |
| GL-G | Reentry queue badge | GL-5: fila invisivel | Mostrar `{reentryQueue.items.length > 1 ? '+N na fila' : ''}` no `ReentryConfirmDialog` header. | `ReentryConfirmDialog.tsx` | S | 3 | SIM |
| GL-H | Delete tournament usa shadcn Dialog | GL-6: confirm nativo | Trocar `window.confirm` por `AlertDialog` do shadcn (ja usado em DeleteDialog do GradePlanner). | `GrindSessionLive.tsx:1167` | S | 2 | SIM |
| GL-I | Timer via React state, nao DOM | GL-7: DOM direto | Trocar `document.getElementById('sessionTimer').textContent = ...` por state + props do `SessionHeader`. | `GrindSessionLive.tsx:1240-1264` | M | 3 | SIM |

**Total:** 22 ideias (7 TS + 7 GP + 9 GL — 1 a mais que o pedido, GL tem mais friccao).

---

## 4. Priorizacao ICE (Top 8)

Score ICE = Impact (1-10) x Confidence (1-10) x Ease (1-10) / 10, onde Ease inverte esforco (S=10, M=6, L=3). Confidence alto (8-10) quando e quick-win baseado em problema confirmado no codigo.

| Rank | ID | Titulo | I | C | E | ICE |
|------|-----|--------|---|---|---|-----|
| 1 | GL-C | Dedupe Suprema import | 9 | 10 | 10 | 90 |
| 2 | GL-A | Bankroll modal Enter shortcut | 8 | 10 | 10 | 80 |
| 3 | GL-D | Confirm session end lista pendentes | 9 | 9 | 10 | 81 |
| 4 | GP-A | Toast OFF com acao "Ativar perfil A" | 9 | 9 | 10 | 81 |
| 5 | GL-B | GG! com undo toast | 10 | 8 | 6 | 48 |
| 6 | TS-C | Badge bankroll delta em $ | 8 | 9 | 10 | 72 |
| 7 | TS-B | Cold start CTA "Importar agora" | 8 | 9 | 10 | 72 |
| 8 | GL-F | Result dialog adapta a PKO/Vanilla | 7 | 9 | 10 | 63 |

Lista actionable para o implementer:

```
#1 [ICE 90] Dedupe Suprema import (GL-C)
  Arquivo: B:/grindfy/client/src/pages/GrindSessionLive.tsx:1818
  Problema: SupremaImportModal e chamado com `excludeExternalIds={[]}` sempre
    vazio. Usuario pode importar o mesmo torneio Suprema duas vezes na mesma
    sessao sem aviso, duplicando contagem de registros e poluindo calculos.
  Solucao: Popular excludeExternalIds com os externalIds dos session
    tournaments ja importados via Suprema. Usar useMemo pra computar:
    const excludeIds = useMemo(() =>
      (sessionTournaments || [])
        .filter(t => t.site === 'Suprema' && t.externalId)
        .map(t => t.externalId), [sessionTournaments]);
  Acceptance:
    [ ] Import modal nao oferece checkbox para torneios ja importados
    [ ] Toast "X novos importados, Y ja estavam na sessao" se houver dedupe
    [ ] Testes unitarios com fixture tendo 2 torneios dup

#2 [ICE 81] Toast OFF com acao "Ativar perfil A" (GP-A)
  Arquivo: B:/grindfy/client/src/pages/GradePlanner.tsx:391-401
  Problema: Clicar em celula de dia OFF mostra toast "dia esta OFF" sem
    botao de acao. Usuario precisa fechar toast + clicar botao A/B/C do
    header = 3 cliques para adicionar 1 torneio.
  Solucao: Usar `action` property do shadcn toast:
    toast({
      title: `${dayName} esta OFF`,
      description: "Ative perfil A para adicionar torneios",
      action: <ToastAction altText="Ativar A" onClick={() => {
        executeProfileSwitch(dayOfWeek, 'A');
        setTimeout(() => onClickEmptyCell(dayOfWeek, time), 100);
      }}>Ativar A</ToastAction>
    });
  Acceptance:
    [ ] Toast OFF mostra botao "Ativar A"
    [ ] Clicar no botao ativa o perfil E reabre dialog de adicionar
    [ ] Acessivel via teclado (focus no botao)

#3 [ICE 81] Confirm session end lista pendentes (GL-D)
  Arquivo: B:/grindfy/client/src/pages/GrindSessionLive.tsx:1786-1815
  Problema: Modal "Finalizar sessao?" so mostra textarea de notas mas nao
    indica quantos torneios ainda estao rodando. Usuario finaliza sem saber
    que 3 torneios serao auto-encerrados como GG zerado.
  Solucao: Computar `pendingCount = filteredRegistered.length` e mostrar
    antes do Textarea:
    {pendingCount > 0 && (
      <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-3 text-sm">
        <strong className="text-amber-300">{pendingCount} torneio(s) rodando</strong>
        <p className="text-amber-200/80 text-xs mt-1">
          Serao marcados como encerrados (resultado zero).
        </p>
      </div>
    )}
  Acceptance:
    [ ] Modal mostra count de pendentes quando > 0
    [ ] Modal nao mostra aviso se pendentes = 0
    [ ] Cor amarela (amber) para indicar atencao

#4 [ICE 80] Bankroll modal Enter shortcut (GL-A)
  Arquivo: B:/grindfy/client/src/pages/GrindSessionLive.tsx:1829-1865
  Problema: Modal bloqueante sem keyboard shortcut. Em sessao ativa
    (multitable) cada modal sem atalho custa 2 cliques com trackpad.
  Solucao: Adicionar useEffect dentro do render condicional do modal:
    useEffect(() => {
      if (!bankrollShotModalOpen) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Enter') handleConfirmBankrollShot();
        if (e.key === 'Escape') handleCancelBankrollShot();
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [bankrollShotModalOpen]);
    E adicionar `autoFocus` no botao "Registrar como shot".
  Acceptance:
    [ ] Enter confirma shot
    [ ] Esc cancela
    [ ] Botao confirm tem autoFocus ao abrir
    [ ] Focus trap (Tab nao escapa do modal)

#5 [ICE 72] Badge bankroll delta em $ (TS-C)
  Arquivo: B:/grindfy/client/src/components/tournament-selector/SelectorCard.tsx:148-150
  Problema: Badge "Fora do bankroll" nao diz quanto acima — usuario nao
    distingue shot de 20% vs 200%.
  Solucao: Computar delta usando bankroll context:
    {!tournament.bankrollOk && (() => {
      const overshoot = tournament.buyInUSD - bankroll.maxBuyInUSD;
      const pct = ((tournament.buyInUSD / bankroll.maxBuyInUSD) - 1) * 100;
      return (
        <Badge variant="destructive" data-testid="warn-bankroll">
          ${overshoot.toFixed(0)} acima ({pct.toFixed(0)}%)
        </Badge>
      );
    })()}
    Requer passar bankroll via context/prop (pode usar useBankroll hook
    direto no componente).
  Acceptance:
    [ ] Badge mostra valor absoluto e percentual
    [ ] Usa buyInUSD (nao buyIn bruto) para comparacao consistente
    [ ] Se bankroll nao configurado, mostra apenas "Fora do bankroll"

#6 [ICE 72] Cold start CTA "Importar agora" (TS-B)
  Arquivo: B:/grindfy/client/src/components/tournament-selector/SelectorPanel.tsx:81-100
  Problema: Banner "Importe mais historico" sem botao leva usuario a
    procurar na nav onde importar.
  Solucao: Adicionar acao dentro do Alert:
    <Alert data-testid="selector-cold-start-pure">
      <Info className="w-4 h-4" />
      <AlertTitle>Importe mais historico</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-2">
        <span>Voce tem poucos torneios importados...</span>
        <Button size="sm" onClick={() => setLocation('/upload-history')}>
          Importar agora
        </Button>
      </AlertDescription>
    </Alert>
    Idem para `coldStart === 'partial'` com texto diferente.
  Acceptance:
    [ ] Botao visivel em ambos banners pure/partial
    [ ] Wouter navigate para /upload-history
    [ ] Banner mantem o mesmo layout em mobile

#7 [ICE 63] Result dialog adapta a PKO/Vanilla (GL-F)
  Arquivo: B:/grindfy/client/src/components/grind-session-live/TournamentCard.tsx:330-354
  Problema: Result dialog mostra input "Bounty" mesmo para Vanilla — causa
    input inutil. Esconder para Vanilla reduz campos para 2 (premio +
    posicao) simplificando 33% do form.
  Solucao: Envolver bloco do bounty em:
    {(tournament.type === 'PKO' || tournament.type === 'Mystery') && (
      <div className="flex flex-col">... Bounty input ...</div>
    )}
  Acceptance:
    [ ] Vanilla nao mostra input Bounty
    [ ] PKO e Mystery mostram Bounty
    [ ] handleFinishTournamentDirect ainda funciona (bounty=0 padrao)
    [ ] Teste unit para os 3 tipos

#8 [ICE 48] GG! com undo toast (GL-B)
  Arquivo: B:/grindfy/client/src/pages/GrindSessionLive.tsx (handleFinishTournamentDirect)
  Problema: Clicar GG! finaliza torneio direto sem confirmacao — 2 cliques
    acidentais destroem registro. Unico caso de confirm e ReA.
  Solucao: Salvar snapshot antes da mutation e mostrar undo toast:
    const handleFinishTournamentDirect = (id) => {
      const tournament = sessionTournaments?.find(t => t.id === id);
      const prevStatus = tournament?.status;
      if (tournament && shouldShowReentryModal(tournament)) {
        setReentryQueue(q => ({items: [...q.items, {...tournament}]}));
        return;
      }
      applyFinishWithRegistrationData(id);
      toast({
        title: 'Torneio encerrado',
        description: 'Desfazer em 8s',
        duration: 8000,
        action: <ToastAction altText="Desfazer" onClick={() => {
          updateTournamentMutation.mutate({id, data: {status: prevStatus, endTime: null}});
        }}>Desfazer</ToastAction>
      });
    };
  Acceptance:
    [ ] GG mostra toast "Desfazer" por 8s
    [ ] Clique em Desfazer reverte status e resultado
    [ ] Se usuario ja editou registrationData, snapshot preserva
    [ ] ReA flow nao mostra undo (ja tem modal)
```

---

## 5. Agrupamento de commits recomendado

**Bloco 1 — "Quick wins de confiabilidade" (1 commit, ~1.5h):**
- GL-C (dedupe Suprema)
- GL-D (confirm end lista pendentes)
- TS-B (cold start CTA)
- GP-G (remover Bodog em breve)

Justificativa: sao fixes de dados/navegacao sem mudar UX mental. Zero risco.

**Bloco 2 — "Feedback loop de bankroll e GG" (1 commit, ~2h):**
- GL-A (Enter no bankroll modal)
- GL-B (GG undo toast)
- GL-E (bankroll toast tiers)
- TS-C (badge delta em $)

Justificativa: melhorias de feedback acionavel relacionadas a bankroll/encerramento. Conceitualmente ligadas; testar juntas.

**Bloco 3 — "Fluxo Grade Planner" (1 commit, ~2h):**
- GP-A (toast OFF com acao)
- GP-B (OFF dialog mover torneios)
- GP-C (editdialog colapsa avancados)
- GP-D (overflow ordenado por prioridade)

Justificativa: todas tocam no fluxo de "o que fazer quando tenho dia/celula inativa ou cheia". Narrativa unificada.

**Bloco 4 — "Tournament Selector polish" (1 commit, ~2h):**
- TS-A (deep link bankroll)
- TS-E (source summary pills)
- TS-F (explicacao PT no modal)
- TS-G (chip via Selector na Grade)

Justificativa: sao todas melhorias cosmeticas/UX no Selector. Commit coeso, facil de reverter.

**Bloco 5 — "Mobile polish + tecnica" (1 commit opcional, ~3h):**
- GP-F (mobile picker perfil)
- GL-I (timer React state)
- GL-H (delete usa shadcn Dialog)
- GL-G (reentry queue badge)

Justificativa: mudancas mais invasivas, separar para rollback facil.

**Deixar para outro sprint (exigem decisao):**
- GP-E (profile labels customizaveis) — precisa definir se persiste em user_settings ou profile_states
- TS-D (escolha de dia ao adicionar do Selector) — precisa UX do dialog; semelhante ao EditDialog mas com ranking; pode virar feature media

---

## 6. Resumo executivo (150 palavras)

**Top 8 quick wins (~10h total) para reduzir friccao nos 3 modulos core.**

Dedupe Suprema import (bug disfarcado de UX — usuario hoje pode importar duplicatas sem aviso). Toast OFF na Grade vira acao em 1 clique ("Ativar perfil A" inline) em vez de 3 cliques. Confirmacao de fim de sessao agora lista torneios rodando antes de auto-encerra-los como GG zerado. Modal bloqueante de bankroll ganha suporte a Enter/Esc (critico durante multitable). Badge "Fora do bankroll" passa a mostrar delta em $ e %. Cold start do Selector ganha CTA "Importar agora". Result dialog do grind adapta campos conforme PKO/Vanilla. GG! ganha undo toast de 8s eliminando risco de finalizar torneio por acidente.

Todos sao commits de ~2h no max, em 5 blocos tematicos. Zero refactor arquitetural. Esforco total: 10h; retorno: reducao de friccao significativa em fluxos usados milhares de vezes por sessao ativa.
