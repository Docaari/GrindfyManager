# Auditoria UX — Sprint B2 Session-End Reconcile

**Data:** 2026-04-27
**Spec base:** `Docs/specs/sprint-b2-summary-inline-reconcile.md`
**Modo:** Auditoria UX (Strategist)
**Foco:** otimizar fluxo session-end pos-B2 — reconcile inline, banner missing platforms, toggle setting, bugfix cooldown, paleta visual.

---

## JTBD do fluxo

> Quando **acabo uma sessao multi-mesa em 2-5 plataformas**, quero **revisar saldos e decidir cooldown na mesma tela**, para **fechar sessao em < 60 segundos com banca conferida e sem ficar trocando de modal**.

Heuristica dominante: **Nielsen #4 — Consistency & standards** (paleta, padroes de modal-em-modal) e **#5 — Error prevention** (bloqueio submit com missing platforms). Lei UX: **Hick's Law** (reduzir decisoes simultaneas) + **Miller (7±2)** ao listar 5-10 wallets.

---

## 1. Layout reconcile inline (M1)

### Decisao recomendada
**Tabela densa** (1 linha por wallet) com **inputs inline e preview de ajuste a direita**, posicionada **entre stats e CTAs** (ordem stats → bancas → CTAs como proposto). Para 6+ wallets, adicionar `max-h-[280px] overflow-y-auto`.

### Justificativa
Dev poker pos-sessao multi-mesa pode ter 5-10 wallets ativas (Suprema BRL + GG USD + Stars USD + Crypto + Bank). Cards consomem 80-120px verticais cada — com 8 wallets viram 800px+ de scroll, jogador perde visao do CTA. Tabela densa (40-48px por linha) cabe 8 wallets em ~350px sem scroll. Heuristica Nielsen #8 (aesthetic & minimalist design) + Lei de Fitts (CTA visivel sem scroll = clique mais rapido). Posicao stats → bancas → CTAs respeita **fluxo cognitivo natural**: contexto (o que aconteceu) → conferencia (saldos) → acao (proximo passo). CTAs no final aproveitam **lei do recente** — ultimo elemento visto e o que se age.

### Trade-off
Tabela densa sacrifica respiro visual e dificulta toque em mobile (target < 44px). Mitigar com `min-h-12` em rows e padding lateral generoso.

### Detalhes
- **Preview manualAdjustment em tempo real:** lado direito do input, formato `+R$ 50,00` (verde `text-poker-green`) ou `-R$ 80,00` (vermelho `text-destructive`) ou `Sem ajuste` (cinza `text-muted-foreground`). Icone opcional `↑`/`↓`. Atualiza a cada keystroke (debounce 150ms se virar gargalo).
- **Estado vazio:** sessao com 0 plataformas finalizadas (cancelada antes de fechar tournament) → **omitir secao Bancas inteiramente**. Spec ja cobre via filtro `expectedDelta === 0`. Nao mostrar header "Bancas" vazio (ruido).
- **Header da secao:** `Bancas (3)` com count entre parenteses para reforcar quantidade visivel sem scroll.

---

## 2. Banner missingPlatforms (M3)

### Decisao recomendada
Copy: **"Voce jogou na Suprema e GG, mas ainda nao tem wallet pra essas plataformas."** + CTA unico **"Cadastrar wallet"**. Truncar com **"+N mais"** se >3 plataformas.

### Justificativa
"Cadastre wallet pra: Suprema, GG" e funcional mas ressoa como ordem (imperativo). Reescrita em **voz reflexiva** ("voce jogou em X, mas...") evoca reconhecimento ao inves de obrigacao — Nielsen #1 (visibility of system status) + nudge de **awareness gap** (Eyal: trigger interno por dissonancia). CTA "Cadastrar wallet" e generico o suficiente para multiplas plataformas (nao exige variantes "Configurar Suprema" / "Configurar GG"); a plataforma e pre-preenchida no dialog. Truncar com "+N mais" evita banner ocupando 3 linhas com 5+ plataformas — Lei de Miller.

### Trade-off
Copy mais longo (15 vs 6 palavras) reduz scanability em primeira leitura. Aceitavel pois banner e dispositivo de bloqueio — jogador **deve** ler.

### Detalhes
- **Re-render apos cadastro inline:** banner some imediatamente via `queryClient.invalidateQueries(['/api/grind-sessions', sessionId, 'reconcilable-wallets'])` + nova wallet aparece na tabela com `reportedBalance` pre-preenchido. Spec ja cobre. Adicionar **toast de confirmacao** "Wallet GGPoker cadastrada" para reforcar acao.
- **5+ plataformas faltando:** mostrar `Suprema, GG, Stars +2 mais`. Tooltip ou linha 2 (recolhida) lista os restantes ao hover/click.
- **Cor:** manter amber (`bg-amber-500/10 border-amber-500/40 text-amber-200`). Amber em dark theme com accent gold do app pode parecer redundante — ver auditoria #6 abaixo. Recomendo amber **com border esquerda mais espessa** (`border-l-4 border-l-amber-500`) para diferenciar de elementos gold (CTAs).

---

## 3. WalletCreateDialog inline (M3)

### Decisao recomendada
**Modo enxuto:** ocultar campos avancados (cor, shot pocket, deposito inicial). Mostrar apenas Nome (auto-preenchido sugerido tipo "GG Main"), Plataforma (locked, vinda do banner), Moeda (locked, derivada da plataforma). Botao secundario **"Mostrar opcoes avancadas"** revela campos extras se necessario.

### Justificativa
Jogador esta no fluxo session-end, focado em sair. Cada campo extra e friccao adicional (Nielsen #8 + Hick's Law). Plataforma vem do banner (`defaultPlatform`), moeda nativa segue mapping determinístico (Suprema=BRL, GG=USD, Stars=USD, WPN=USD, Suprema=BRL, OffPlatform_Bank=BRL/USD configuravel, Crypto=USDT). Nome pode ter sugestao default `${WALLET_PLATFORM_LABELS[platform]} Main`. Saldo inicial **NAO** deve ser pedido inline — confunde com `reportedBalance` do reconcile (jogador pode duplicar). Em vez disso: criar wallet com saldo 0, fluxo do summary preenche saldo via reconcile na mesma sequencia. Reduz cognicao (1 valor por wallet, nao 2).

### Mapping platform → currency default
| Platform | Currency default |
|---|---|
| Suprema | BRL |
| GGNetwork | USD |
| PokerStars | USD |
| WPN | USD |
| 888 | USD |
| PartyPoker | USD |
| CoinPoker | USDT |
| Chico | USD |
| Revolution | USD |
| iPoker | EUR |
| OffPlatform_Bank | BRL (default user locale) |
| OffPlatform_Crypto | USDT |
| OffPlatform_Staker | USD |
| OffPlatform_Other | USD |
| GenericUSD | USD |

### Trade-off
Esconder campos pode frustrar power user que quer customizar cor/shot pocket no momento do cadastro. Mitigado pelo "Mostrar opcoes avancadas" + edicao posterior em `/bankroll`.

### Detalhes
- **Submit do dialog:** fechar e voltar pro summary atualizado. **NAO** pedir balance inline. Saldo flui pelo reconcile da nova linha que aparece na tabela.
- **WalletCreateDialog ja aceita `prefill: WalletPrefill`** (visto em `WalletCreateDialog.tsx:17-21`). Spec menciona `defaultPlatform` / `defaultCurrency` — alinhar nomenclatura: usar `prefill={{ platform, nativeCurrency }}` (ja existente, evita prop drift).

---

## 4. Toggle bankrollManagementEnabled (M2)

### Decisao recomendada
**Switch no header da secao "Banca"** em `Settings.tsx`, label **"Gestao multi-wallet (reconcile pos-sessao)"**, com **callout azul informativo** na primeira ativacao (onboarding leve). Default = ON, mas mostrar callout **apenas para usuarios que nao cadastraram nenhuma wallet ainda** (`wallets.length === 0`).

### Justificativa
Posicao no header da secao = **affordance imediata** (Nielsen #6 — recognition rather than recall). Help text proposto e claro mas pode ser refinado: **"Quando ativo, sessoes pedem reconciliacao por plataforma ao terminar. Desligue se voce usa apenas a banca total (campo unico)."** — explicita o contraste entre os dois modos. Onboarding silencioso para usuario novo evita ruido (default ON cobre 90% dos casos), mas callout para quem nunca cadastrou wallet evita confusao "porque nada aparece em /bankroll?".

### Trade-off
Default ON pode confundir jogador casual que **so** quer banca legada — ele veria reconcile na primeira sessao sem entender o que e. Mitigado pelo callout + setting visivel/discoverable em /settings.

### Detalhes
- **Posicao:** header da secao banca, ao lado direito do titulo "Banca". Switch shadcn com `aria-label="Ativar gestao multi-wallet"`.
- **Help text revisado:** ver acima.
- **Onboarding:** banner azul `Voce ainda nao tem wallets cadastradas. A gestao multi-wallet permite reconciliar saldo por plataforma apos cada sessao. Comece criando sua primeira wallet ou desligue para usar so a banca total.` com 2 CTAs: "Adicionar wallet" e "Desligar gestao multi-wallet". Mostrar so para `wallets.length === 0`.
- **Mid-session toggle:** spec ja resolve (le no momento de endSession). OK.

---

## 5. Sequencia cognitiva summary (M1)

### Decisao recomendada
Ordem **stats → bancas → CTAs** com **CTA primario = "Iniciar Cool-down (full)"** quando ha red flags, e **CTA primario = "Finalizar Sessao"** quando nao ha. CTAs secundarios em outline. Adicionar **resumo agregado de ajuste total** acima dos CTAs ("Ajuste total: -R$ 30,00") para forcar atencao a banca antes do clique.

### Justificativa
Lei de Fitts + lei do recente: ultimo elemento antes do CTA tem mais peso. Resumo agregado **"+R$ 50 / -R$ 30 / Ajuste total: +R$ 20"** atua como **endowed progress** (Eyal): jogador percebe que conferiu, ganha sensacao de fechamento. Forca atencao sem irritar (nao bloqueia, so reflete). Heuristica Nielsen #1 (visibility) + nudge de **prova social com proprio comportamento** ("voce ajustou X").

CTA primario condicional ao red-flag respeita **jornada saudavel** (Hook Model: variable reward = sentir-se cuidando da saude mental quando o jogo correu mal) sem forcar cooldown quando sessao foi tranquila. Atalho rapido "Finalizar" continua disponivel mas em outline (peso visual menor).

### Trade-off
Logica condicional do CTA primario aumenta complexidade do componente (2 estados visuais). Mitigado pela classe ja existente `cooldown-cta-warning` vs `cooldown-cta-neutral` (visto em `SessionSummaryModal.tsx:96`).

### Detalhes
- **Ordem visual exata:**
  1. Header (titulo + subtitulo)
  2. Stats grid (volume, profit, ROI, FTs, cravadas)
  3. Melhor resultado (se houver)
  4. Performance mental (5 medias)
  5. Objetivos / quick notes
  6. Notas finais (textarea)
  7. **Banner missing platforms (amber)** — se aplicavel
  8. **Secao "Bancas"** (tabela densa) — se aplicavel
  9. **Resumo de ajuste total** (1 linha, font-medium) — se ha ajuste
  10. Warning red flags (se houver)
  11. CTAs (em row, primario gold/green, secundario outline)
- **Forcar atencao sem irritar:** banner missing platforms ja bloqueia submit. Sem missing platforms, fluir natural. Nao adicionar modal extra de confirmacao "tem certeza?" — viola Nielsen #5 falso-positivo.

---

## 6. Auditoria cores cooldown + summary (M6)

### Decisao recomendada
Padronizar para **tokens semanticos do design system** (`bg-card`, `bg-background`, `border-border`, `text-foreground`, `bg-primary`, `text-primary-foreground`) ao inves de classes raw (`bg-poker-surface`, `bg-gray-900`). Isso aproveita o trabalho ja feito no commit `cf9e163` e preserva theme switching futuro.

### Justificativa
Commit `cf9e163` ja unificou bankroll v2 com tokens semanticos (`bg-card`, `border-border`). Spec B2 propoe tokens raw (`bg-gray-900`, `bg-gray-800`) — isso e regressao para hardcoded values e quebra a abstracao. Heuristica Nielsen #4 (consistency). Tailwind config provavelmente ja tem `--card`, `--background`, `--border` mapeados pra paleta poker-green/gold (validar em `tailwind.config.ts`). Tokens semanticos = manutencao mais barata e theme-safe.

### Trade-off
Migrar tokens raw → semanticos exige verificar mapping no `tailwind.config.ts` antes do merge. Pequeno custo upfront, ganho de longo prazo.

### Tokens recomendados

| Elemento | Token | Fallback raw (se token faltar) |
|---|---|---|
| Bg modal/card principal | `bg-card` | `bg-gray-900` |
| Bg overlay (backdrop) | `bg-black/40` | OK |
| Bg secao interna | `bg-background` | `bg-gray-950` |
| Border | `border-border` | `border-gray-700` |
| Border ativo / hover | `border-primary/60` | `border-poker-green` |
| Input bg | `bg-background` | `bg-gray-800` |
| Input border | `border-input` | `border-gray-600` |
| Input text | `text-foreground` | `text-white` |
| Input placeholder | `placeholder:text-muted-foreground` | `placeholder:text-gray-400` |
| CTA primario (gold/green sólido) | `bg-primary text-primary-foreground hover:bg-primary/90` | `bg-poker-green hover:bg-poker-green/90` |
| CTA secundario (outline) | `border border-border bg-transparent hover:bg-accent` | — |
| CTA destrutivo / warning | `bg-amber-500/10 border-amber-500/40 text-amber-200` | OK |
| Texto principal | `text-foreground` | `text-white` |
| Texto secundario | `text-muted-foreground` | `text-gray-400` |
| Profit positivo | `text-primary` (poker-green) | `text-emerald-400` |
| Profit negativo | `text-destructive` | `text-red-400` |

### Estados
- **hover:** `hover:bg-primary/90` (CTAs primarios), `hover:bg-accent` (secundarios). Nunca usar `opacity-90` generico (perde contraste de texto).
- **focus-visible:** `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background` (acessibilidade WCAG 2.1 AA — 3:1 contrast ratio mínimo no ring).
- **disabled:** `disabled:opacity-60 disabled:cursor-not-allowed` (CTAs durante mutation in-flight).

### Banner amber missingPlatforms no dark theme
Amber sobre dark e legivel mas pode conflitar visualmente com gold do CTA primario quando ambos estao na mesma viewport. **Recomendacao:** usar amber com **border-l-4 border-l-amber-500** + bg amber-500/10 (sutil). Preserva semantica de warning sem competir com CTA gold primario. Alternativa se conflito persistir: trocar para **vermelho-laranja** (`border-orange-500/60 bg-orange-500/10 text-orange-200`) — distingue de gold por matiz, mantem semantica de "atencao".

---

## Quick Wins (3-5 ajustes baixo custo / alto impacto)

1. **Auto-foco no primeiro input editavel da tabela Bancas** ao abrir summary com matched wallets. Reduz tempo ate primeira interacao em ~1.5s (sem scroll/click). Custo: 1 linha (`useEffect` + `inputRef.current?.focus()`). Heuristica Nielsen #7 (efficiency).

2. **Atalho keyboard `Cmd/Ctrl + Enter` para acionar CTA primario** no summary (apos confirmar reconcile). Power users (jogadores grinder) economizam mouse trip. Custo: 5-10 linhas (`onKeyDown` no container). Heuristica Nielsen #7.

3. **Tooltip no `expectedClosingBalance`** explicando como foi calculado (`Saldo inicial + buy-ins + payouts`). Jogador entende por que valor esta ali e confia mais. Custo: 1 componente Tooltip ja existente em shadcn. Heuristica Nielsen #1 + #10 (help & docs).

4. **Persistir `reportedBalance` em estado local** durante a sessao (sessionStorage) caso modal feche acidentalmente (Esc, click fora, refresh). Restaurar ao reabrir. Evita perda de input e re-trabalho. Custo: ~15 linhas (`useEffect` save + restore com chave `summary-reconcile-${sessionId}`). Heuristica Nielsen #5 (error recovery).

5. **Indicador visual "Reconcile pendente" ao tentar fechar summary com ajustes nao submetidos** (caso de fechar via Esc / click overlay). Confirmacao light: `Voce tem ajustes nao submetidos. Fechar mesmo assim?` com 2 botoes. Custo: ~20 linhas + dialog confirmacao. Heuristica Nielsen #5 (error prevention).

---

## Riscos UX nao cobertos pela spec

- **Modal-em-modal (banner → WalletCreateDialog):** spec menciona em "Riscos identificados". Reforco: testar **focus trap em cascata** (Esc do dialog deve fechar **so** o dialog, nao o summary). Radix Portal cuida em teoria, mas validar visualmente.
- **Layout shift quando wallet criada inline aparece na tabela:** evitar `flex-grow` que reflua tudo. Usar `gap` consistente + `transition-all duration-200` na tabela para suavizar.
- **Telemetria silenciosa de skip-no-changes:** se 80% dos jogadores nao mexem em nada e fluem direto, sinal de que o reconcile e ruido para a maioria. Monitorar evento `summary_inline_reconcile_skipped_no_changes` por 2 semanas pos-merge — se > 70% das sessoes, considerar deslocar reconcile para opt-in (botao "Conferir saldos" colapsado).

---

Analise completa.

Recomendacao principal: priorizar tabela densa + tokens semanticos + auto-foco + persistencia em sessionStorage; refinar copy do banner para voz reflexiva e enxugar WalletCreateDialog inline.

Proximos passos:
→ Validar mapping platform→currency com csvParser canonicalization (consistencia Nielsen #4).
→ Confirmar tokens semanticos em `tailwind.config.ts` antes de M6 implementer.
→ Telemetria pos-merge: monitorar skip-no-changes ratio por 2 semanas para validar hipotese de friccao.
→ PM-Spec: incorporar quick wins 1-3 na proxima sub-spec se nao couberem em B2.

Quer que eu aprofunde em algum ponto?
