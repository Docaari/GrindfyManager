# Auditoria UX — Bankroll v2 (Quick Wins)

**Data:** 2026-04-26
**Modo:** Auditoria UX focada (Strategist)
**Escopo:** Componentes Multi-Wallet (P0 do Sprint Bankroll-2) + integracao com a pagina `/bankroll`
**Origem da analise:** leitura direta dos componentes, da spec `bankroll-v2-multi-wallet-foundation.md` e do plano `bankroll-v2-plan-2026-04-25.md`.

---

## 1. Sumario executivo

A entrega do P0 do Bankroll v2 cumpriu o objetivo tecnico: schema, services, rotas, FX correto, compat reverso e cinco componentes `Wallet*` em `client/src/components/bankroll/`. No entanto, a auditoria visual do que o jogador hoje encontra ao acessar `/bankroll` revela duas categorias de friccao:

1. **Friccao estrutural — falta o "tecido conectivo".** A pagina `client/src/pages/Bankroll.tsx` ainda renderiza apenas `BankrollWidget` + `BankrollHistoryTable` + `BankrollMovementDialog` (UX v1). Os cinco componentes novos (`WalletList`, `WalletDetailPanel`, `WalletCreateDialog`, `WalletEditDialog`, `WalletTransactionDialog`) nao sao montados em nenhuma rota. Sao componentes orfaos. Isso bloqueia testes de campo do P0 e e o item de maior impacto.
2. **Friccao de polimento — copy, contraste, conversao, prevencao.** Mesmo quando os componentes forem montados, varios detalhes pequenos podem inflar abandono no primeiro uso (jogador novo) e na manutencao recorrente (jogador que volta apos 30 dias).

A auditoria abaixo propoe **9 quick wins** (1-3h cada incluindo testes), priorizados por score Impact / Effort. O top 5 deve ir para o proximo bloco de implementacao.

---

## 2. Auditoria detalhada por componente

### 2.1 `pages/Bankroll.tsx` — pagina hospedeira

**Sintoma:** Pagina hoje so mostra widget + historico legado + dialog de movimento simples. Nenhuma referencia a `WalletList` / `WalletDetailPanel`. Jogador nao tem como criar wallet via UI — apenas via curl.

**Impacto:** Bloqueador. Sem hospedar os componentes, todo o resto desta auditoria e teorico.

**Proposta:** Refatorar para layout 2-paineis quando o backend retornar `walletCount > 0` ou flag `aggregationMode='per_wallet'` no `/api/bankroll`. Caso contrario, manter UX v1 e adicionar CTA "Migrar para multi-carteira" (que cria a wallet default explicitamente).

> Esta refatoracao nao e quick win — e spec propria. Documentada na secao 4 deste relatorio.

### 2.2 `WalletList.tsx`

Pontos visiveis:
- Header com titulo "CARTEIRAS" + botao "+ Nova".
- Empty state textual ("Voce ainda nao criou nenhuma carteira") sem CTA grande, sem ilustracao, sem onboarding.
- Card por wallet: dot de cor, nome, plataforma, balance native + USD equivalente em texto pequeno cinza.
- Badge "Shot" amarelo no canto direito (so quando `isShotPocket=true`).
- Wallets arquivadas em `<details>` colapsado com label "Arquivadas (N)".

Friccoes:
- **Empty state mole.** Texto curto, cinza, sem CTA destacado. Botao "+ Nova" no header e pequeno (`text-xs px-2 py-1`). Jogador novo precisa "procurar" o caminho.
- **Sem skeleton loading.** Lista pisca para vazia antes de aparecer cheia (porque `wallets.length === 0` e o estado inicial ate chegar resposta).
- **Conversao USD ao lado, BRL ausente.** O jogador BR ve "$1.234,50" + "$200,00" (USD equivalente) em uma wallet BRL. Nao ve "R$ 1.234,50" claramente — ele vai ter que mentalmente confirmar que aquele valor sem prefixo era BRL.
- **Sem indicador de staleness.** Nao mostra "ultima atualizacao: 3 dias atras" — jogador que retorna apos 30 dias nao tem pista visual de que precisa atualizar.

### 2.3 `WalletCreateDialog.tsx`

Pontos visiveis:
- Modal com 6 campos: nome, plataforma (select com 14+ valores), moeda nativa (7 opcoes), cor (`<input type="color">`), checkbox shot pocket, deposito inicial.
- Validacao inline so em "nome obrigatorio" / "nome > 80 char".
- Botao submit "Criar carteira" com loading state.

Friccoes:
- **Color picker nativo.** `<input type="color">` abre o picker do SO; isso quebra UX consistente com o restante do app (shadcn). A spec RF-12 dizia explicitamente "8 cores predefinidas + custom hex" — nao foi entregue.
- **Plataforma com 14 enums "tecnicos"** (`OffPlatform_Bank`, `OffPlatform_Crypto`, `GenericUSD`). Usuario final nao entende `GenericUSD` ou `OffPlatform_Staker`. Faltam labels human-readable.
- **Sem placeholder no campo deposito inicial alem de "0.00".** Sem hint "comece com o saldo atual da sua conta".
- **Shot pocket sem tooltip explicando.** Label diz "Pocket de shot (excluir do calculo principal)" — termo "shot" e jargao de poker, mas mistura com "pocket" cria sentido nao-obvio. Falta uma frase: "Carteira reservada para tentativas em buy-ins acima da sua banca de gestao."
- **Sem preview do USD-equivalente.** Se o jogador escolhe BRL e digita 5000 no deposito inicial, ele nao ve "R$ 5.000,00 (~ $1.000,00 USD)" para conferir.
- **Sem sugestao de nomes comuns.** Datalist ou chips com "GG Main", "Suprema Conta Principal", "Banco Inter", "Conta cripto" agilizaria primeira criacao.

### 2.4 `WalletEditDialog.tsx`

Pontos visiveis:
- Modal com 4 campos: nome, cor, regra de banca (texto livre), shot pocket.
- Sem aviso de que `nativeCurrency`, `platform`, `balance`, `status` sao imutaveis.

Friccoes:
- **Spec RF-09 lista 5 campos editaveis (incluindo `displayOrder`)** — `displayOrder` nao foi exposto na UI. Jogador com 6 wallets nao tem como reordenar.
- **Regra de banca exige formato regex `1pct|2pct|5pct|custom:\d+`.** Campo aceita texto livre — usuario digita "1%" e recebe 400 do backend. Falta dropdown ou helper text.
- **Sem aviso "Para mudar plataforma/moeda, crie nova carteira".** Spec mencionou — nao foi implementado. Usuario tenta editar plataforma, nao acha o campo, fica confuso.

### 2.5 `WalletDetailPanel.tsx`

Pontos visiveis:
- Header: nome grande + plataforma cinza + balance grande a direita + sigla da moeda abaixo.
- 3 botoes: "Registrar movimento", "Editar", "Arquivar".
- Banner amarelo quando arquivada.
- Placeholder "Lista de movimentos sera renderizada aqui (WalletTransactionsTable)" — componente nao existe.
- Modal de confirmar arquivamento com texto generico.

Friccoes:
- **WalletTransactionsTable nao existe.** Lista de movimentos da wallet selecionada e um placeholder textual. Jogador nao consegue auditar o ledger por wallet — perde o principal valor da feature.
- **Confirmacao de arquivar e generica.** Nao alerta "Esta carteira tem saldo R$ 5.000". Spec RF-13 dizia `warnArchiveWithBalance`. Risco de jogador arquivar wallet ainda com saldo e perder visao do dinheiro.
- **Balance USD nao mostrado quando moeda != USD.** Header so mostra moeda nativa. Para wallet BRL com R$ 5.000, jogador nao ve "$ 1.000 USD" para entender quanto pesa na banca consolidada.
- **Sem mostrar share da banca consolidada.** Algo como "Representa 23% da sua banca" daria contexto imediato.
- **Sem ultima movimentacao no header.** "Ultimo deposito: 12 dias atras" ajudaria staleness.

### 2.6 `WalletTransactionDialog.tsx`

Pontos visiveis:
- Modal com 6 campos: direcao (in/out), motivo, valor, data/hora, sessao (condicional), nota.
- Preview "Novo saldo: $X" funcional (bom).
- Warning "Saldo ficou negativo" condicional pos-submit.

Friccoes:
- **`session_result` exige ID textual.** "ID da sessao" pede `ses_...` — jogador nao tem acesso facil a esse ID. Deveria ser dropdown das ultimas N sessoes do usuario.
- **Direcao + motivo redundantes.** Selecionar "Saque" ja implica direcao "out", mas jogador precisa selecionar os dois. Risco de inconsistencia (deposito + direcao=out e logicamente errado mas aceito). Direcao deveria derivar do motivo ou apenas direcao deveria existir.
- **Preview so mostra moeda nativa.** Se wallet e BRL e jogador deposita R$ 1.000, preview diz "Novo saldo: R$ 6.000,00". Nao mostra impacto na banca consolidada USD ("~ $1.200 USD; +20% na banca").
- **Data padrao = agora local.** Bom default. Mas nao impede futuro nem alerta se for muito no passado.

### 2.7 `BankrollWidget.tsx` (modificado)

Pontos visiveis:
- Mostra "Banca atual" + valor USD + valor BRL + sparkline + projecao mensal.
- Nova linha condicional "{N} carteira(s)" quando `walletCount > 0`.

Friccoes:
- **`{N} carteiras` e texto pequeno cinza.** Nao convida ao clique, nao e link para `/bankroll`. Jogador no dashboard nao percebe que ha um detalhamento.
- **Sem breakdown top 3 wallets.** Spec RF-12 mencionou "breakdown sumario (top 3 wallets por share)" — nao foi entregue.

---

## 3. Quick wins priorizados

Cada item: titulo, componente, sintoma, proposta, esforco em horas (incluindo testes), impacto (LOW/MED/HIGH), score Impact/Effort numa escala 1-10.

| # | Quick win | Componente | Sintoma | Proposta | Esforco | Impacto | Score |
|---|-----------|------------|---------|----------|---------|---------|-------|
| QW-A | **Empty state da WalletList com CTA grande** | `WalletList.tsx` | Texto cinza sem destaque, botao "+ Nova" miudo no header | Quando `wallets.length === 0`, renderizar painel grande: titulo "Voce ainda nao tem carteiras", subtitulo educativo ("Carteiras refletem cada conta sua: GG, Suprema, banco, cripto. Adicione uma para comecar."), botao primary grande "Criar primeira carteira" + 3 chips de sugestao ("GG Main", "Suprema Conta", "Banco BRL") que pre-preenchem nome/plataforma/moeda no dialog | 1.5h | HIGH | 9 |
| QW-B | **Mostrar BRL explicito + simbolos consistentes na WalletList** | `WalletList.tsx` | Wallet BRL hoje mostra "R$ 1234,50" + "$200,00" lado a lado sem rotular qual e USD-equivalente. Confunde | Adicionar label `~ $200 USD` cinza com til indicando "equivalente" e formatar nativa em moeda completa (`R$ 1.234,50` com locale BR). Tooltip no `~`: "Conversao a R$ 5,01 / USD" | 1h | HIGH | 9 |
| QW-C | **Color picker com 8 cores predefinidas (spec RF-12)** | `WalletCreateDialog.tsx`, `WalletEditDialog.tsx` | `<input type="color">` nativo abre OS picker, quebra UX | Substituir por grid 8 cores predefinidas (`#3366FF`, `#FF5733`, `#33C39F`, `#A663FF`, `#FFC233`, `#FF3399`, `#666666`, `#10B981`) com `aria-label` por cor + opcao "Custom" que mostra hex input. Default = primeira cor nao usada por outra wallet do user | 2h | MED | 7 |
| QW-D | **Labels human-readable para plataformas tecnicas** | `WalletCreateDialog.tsx` (+ `shared/wallet-platforms.ts`) | Selects mostram `OffPlatform_Bank`, `GenericUSD`, etc. Tecnico demais | Criar mapeamento `WALLET_PLATFORM_LABELS` em `shared/wallet-platforms.ts` (ex: `OffPlatform_Bank => "Conta bancaria"`, `GenericUSD => "Generica (USD)"`, `Suprema => "Suprema Poker"`). Renderizar label no `<option>` mas value continua com enum. Ordenar redes de poker primeiro, off-platform depois com separador | 1h | HIGH | 9 |
| QW-E | **Tooltip e copy melhor para Shot Pocket** | `WalletCreateDialog.tsx`, `WalletEditDialog.tsx`, `WalletList.tsx` | "Pocket de shot" e jargao misto. Badge "Shot" sem explicacao | Adicionar `<HoverCard>` ao lado do checkbox e do badge: "Shot pocket: carteira reservada para tentativas em buy-ins acima da sua banca de gestao. Nao entra no calculo de banca consolidada." | 1h | MED | 7 |
| QW-F | **Confirmacao de arquivar com aviso de saldo** | `WalletDetailPanel.tsx` | Modal generico sem alertar saldo restante | Quando `parseFloat(wallet.balance) > 0`, exibir warning vermelho-amarelo: "Esta carteira ainda tem **R$ 5.000,00 (~ $1.000 USD)**. Movimente o saldo antes de arquivar para nao perder visibilidade do dinheiro." E exigir checkbox "Confirmo que entendi" antes de habilitar botao | 1.5h | HIGH | 8 |
| QW-G | **Preview com impacto USD/% na banca consolidada** | `WalletTransactionDialog.tsx` | Preview so mostra moeda nativa | Adicionar segunda linha cinza no preview: `Equivale a $X USD; sua banca consolidada vai para $Y (+Z%)`. Requer ler consolidated balance (ja em cache via `/api/bankroll/consolidated`) | 2h | HIGH | 7 |
| QW-H | **Helper de regra de banca + dropdown de presets** | `WalletEditDialog.tsx` | Campo texto livre com regex backend; usuario digita "1%" e recebe 400 | Trocar `<input>` por `<Select>` com 4 opcoes: "1% da banca", "2% da banca", "5% da banca", "Personalizada". Ao escolher "Personalizada", aparece um numeric input que monta `custom:N` no submit. Helper text: "Define o buy-in maximo recomendado" | 2h | MED | 6 |
| QW-I | **Indicador de staleness por wallet** | `WalletList.tsx` (+ servidor opcional) | Jogador volta apos 30 dias e nao sabe quais wallets estao desatualizadas | Calcular `daysSinceLastTx` no payload de `GET /api/wallets` (ja existe `lastTransactionAt` na spec RF-09). No card, badge cinza "atualizada ha 12 dias"; >30 dias vira amber "ha 32 dias — atualize". Sem nudge intrusivo, so visual | 2h | MED | 6 |

### Items considerados mas nao incluidos (e por que)

- **WalletTransactionsTable completo:** spec propria, ~6h. Nao e quick win, e core feature P1.
- **Reordenacao por drag (`displayOrder`):** depende de WalletTransactionsTable e da pagina hospedeira. Mover para Sprint Bankroll-3.
- **Importar de CSV no empty state:** feature nova, ainda nao tem backend.
- **Atalho Cmd+K:** padrao novo de produto, nao quick win isolado.
- **Skeleton loading:** baixissimo impacto perceptivel; carregamento e sub-segundo na maioria das vezes.

---

## 4. Issue UX que NAO e quick win — merece spec propria

**Hospedar os componentes Wallet na pagina `/bankroll`.** Esta entrega P0 produziu cinco componentes orfaos: `WalletList`, `WalletCreateDialog`, `WalletEditDialog`, `WalletDetailPanel`, `WalletTransactionDialog` existem em `client/src/components/bankroll/` mas nenhum esta montado em rota. A pagina `Bankroll.tsx` continua usando exclusivamente o stack v1 (`BankrollWidget` + `BankrollHistoryTable` + `BankrollMovementDialog`). A spec original RF-12 ("`Bankroll.tsx` refatora para layout 2-paineis com `WalletList` + `WalletDetailPanel` + `ConsolidatedBalanceCard`") ainda nao foi executada.

Razoes para virar spec propria e nao quick win:
- Estima-se 6-10h: nova rota ou refactor da existente, layout responsivo (mobile colapsa list), deep-link via `?walletId=...`, fallback para usuario v1, integracao com `/api/wallets` + `/api/bankroll/consolidated`, testes RTL + integracao.
- Decisao de produto pendente: como conviver com o `BankrollMovementDialog` legado durante a transicao (esconder, manter como fallback, depreciar)?
- Implica criar `WalletTransactionsTable` e `ConsolidatedBalanceCard` que sao componentes proprios.

Recomendacao: abrir spec `bankroll-v2-page-host-2026-04-26.md` (escopo P0.5 do Sprint Bankroll-2) e priorizar como item #1 imediatamente apos ou em paralelo aos quick wins. Os quick wins QW-A a QW-I sao polimento dos componentes — todos ficam mais visiveis e testaveis depois que a pagina os hospedar.

---

## 5. Ordem recomendada de implementacao

Pelo score Impact/Effort, top 5 para implementar agora:

1. **QW-A** — Empty state com CTA + chips de sugestao (1.5h, HIGH, 9)
2. **QW-D** — Labels human-readable para plataformas (1h, HIGH, 9)
3. **QW-B** — BRL explicito + simbolos consistentes na lista (1h, HIGH, 9)
4. **QW-F** — Confirmacao de arquivar com aviso de saldo (1.5h, HIGH, 8)
5. **QW-G** — Preview de transacao com impacto USD/% (2h, HIGH, 7)

Total top 5: ~7h de implementacao + ~2h de teste = ~9h.

Bloco seguinte (QW-C, E, H, I): mais 6h. Pode ser feito em paralelo a spec da pagina hospedeira.

---

## 6. Recomendacao final

A pergunta "o que construir agora?" tem duas respostas em camadas:

1. **Antes de polir, hospede.** Spec da pagina `/bankroll` v2 e bloqueador. Sem ela, jogador nao consegue criar wallet via UI. Inicie por ai.
2. **Em paralelo, polir os 5 quick wins HIGH.** A, D, B, F, G podem ser feitos sem que a pagina esteja completa (testes em isolamento via RTL). Quando a pagina entrar, ja entra polida.

**Contraindicacao:** nao iniciar polimento sem antes confirmar com o founder se a refatoracao de `/bankroll` esta aprovada. Se a decisao for adiar a refatoracao, os quick wins ficam pendentes ate a pagina existir — nao agregam valor sozinhos.
