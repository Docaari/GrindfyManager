# Review Final Bankroll v2 — 2026-04-26 (deltas)

**Reviewer:** Claude (Opus 4.7) — agente reviewer
**Escopo:** apenas os deltas sobre o review anterior (`Docs/reports/bankroll-v2-review-2026-04-26.md`).
- 7 fixes HIGH (HIGH-1..7)
- 5 UX quick wins (QW-A, B, D, F, G)
- Hosting da pagina `/bankroll` (Bankroll.tsx v2)

## Resumo

**Status:** APROVADO COM RESSALVAS

Os 7 HIGH fixes estao tecnicamente corretos e resolvem o que o review anterior pediu — em particular HIGH-1 (csvParser FX) e HIGH-3 (wrapper `getBankrollState` -> `getConsolidatedBalance`) eliminam os bloqueadores criticos. HIGH-5 (snapshot consolidado em USD) e HIGH-7 (updateWalletScoped com filtro userId) entregam defesa-em-profundidade conforme solicitado.

Tres das cinco UX quick wins (QW-A, QW-D, QW-F) estao 100% corretas e bem implementadas. **QW-B e QW-G dependem de um campo `id` nas entries de `consolidated.byWallet` que o servidor nao expoe — o serializer emite `walletId`** (server/services/walletService.ts:550 e 67-77). Isso quebra silenciosamente:
- A linha "~ $X USD" no `WalletList` nunca aparece para wallets nao-USD (`Bankroll.tsx:67` faz `byId.set(w.id, w)` mas `w.id` e undefined).
- O preview "Impacto banca consolidada" no `WalletTransactionDialog` nunca renderiza (`WalletTransactionDialog.tsx:77` faz `find(w => w.id === wallet.id)` que retorna undefined; alem disso, o serializer `byWallet` nao inclui `fxRateUSDPerNative`).

Esses dois bugs sao MEDIUM (nao bloqueantes) — o usuario nao perde dinheiro, apenas perde recursos visuais opcionais. Recomendo um patch curto antes de promover para producao, mas nao bloqueio commit.

O hosting `/bankroll` esta funcional, com auto-selecao da primeira wallet, fallback para empty state e preservacao do widget v1. Tem ressalvas menores: layout 2-paineis nao e responsivo de fato em telas pequenas (sidebar e detalhe se empilham mas a sidebar nao colapsa); para >50 wallets, a sidebar nao tem scroll dedicado.

**Tests:** 5074 passing, 10 falhas legadas FX + 1 csv-parser legacy esperada pos-HIGH-1 (todas confirmadas como pre-existentes nao-bloqueantes). 9 transform errors do Coach Sprint 2A continuam fora-do-escopo. `npm run check` (tsc) zero erros.

---

## Validacao dos 7 HIGH fixes

### HIGH-1: csvParser FX convention (`* rate` -> `/ rate`)
- **Status:** OK.
- Verifiquei `grep -c "\\* conversionRate" csvParser.ts` -> 0. Total de divisoes (`/ conversionRate`) > 40, distribuidas em PokerStars, GG, 888, WPN, Suprema, Chico, Brazilian, etc. Todas as ocorrencias trocaram corretamente.
- A funcao `applyCurrencyConversion` (linha 1797) ja era nova convencao — agora consistente com os parsers.
- Test legado em `tests/unit/upload/csv-parser.test.ts:413` falha (esperava 59.64, recebe 3042.85 com taxa LEGACY 0.14). Confirmado ressalva esperada.
- **Nao introduz regressao no escopo do fix.** Casos USD permanecem identidade (`/ 1.0`).

### HIGH-2: WalletDetailPanel archive button = no-op -> chama API real
- **Status:** OK.
- `handleArchiveSubmit` (linha 57-74) chama `apiRequest("PATCH", "/api/wallets/${wallet.id}/archive")` com try/catch, toast de erro destrutivo em falha, toast de sucesso, invalidacao de 4 query keys (`/api/wallets`, `/api/wallets/:id`, `/api/bankroll/consolidated`, `/api/bankroll`).
- Loading state (`archiving`) bloqueia double-submit corretamente. Cancel ainda e idempotente.
- Toast usa o helper padrao do projeto (`@/hooks/use-toast`). Padrao consistente com outros flows.

### HIGH-3: `getBankrollState` agora wraps `getConsolidatedBalance`
- **Status:** OK (com salvaguardas adequadas).
- `bankrollService.ts:229-260` faz dynamic `import("./walletService")` dentro de try/catch para evitar circular dependency (preocupacao razoavel — `walletService` ja importa `bankrollCache` e poderia fechar o ciclo).
- Quando `walletCount > 0`, sobreescreve `settings.bankrollAmount` com `String(consolidated.totalUSD)` antes de passar para `buildStateFromSettings`. Coerente com ADR-035.
- Quando `walletCount === 0` (pre-migration ou usuario sem wallets), preserva `bankrollAmount` legado. Fallback correto.
- **Falta teste de integracao real** validando que criar 2 wallets aumenta `state.amount` somando USD — no review anterior a recomendacao 1 foi dada e continua valida (it.todo em `tests/integration/compat/bankroll-v1-compat.test.ts`).

### HIGH-4: unique partial index `(userId, name) WHERE status='active'`
- **Status:** OK.
- `shared/schema.ts:2352-2354`:
  ```ts
  uniqueIndex("uq_wallets_user_name_active")
    .on(table.userId, table.name)
    .where(sql`status = 'active'`),
  ```
- Import de `sql` em linha 11 do schema confirmado.
- Nao validei se `npm run db:push` foi rodado — se ainda nao foi, a migration efetiva nao chegou ao DB. Verificar antes de produzir trafego real.

### HIGH-5: snapshot espelho consolidado em USD (todas wallets ativas)
- **Status:** OK.
- `walletService.ts:425-454` agora itera `tx.getActiveWalletsByUser(userId)` para somar `otherUSD` excluindo a wallet atual, depois calcula `prevConsolidatedUSD` e `newConsolidatedUSD`.
- Tolerante a mocks de teste que nao expoem `getActiveWalletsByUser` (default `otherUSD = 0`). Defensivo e correto — fallback degrada para o comportamento single-wallet, sem crash.
- Colunas v2 (`walletId`, `nativeAmount`, `nativeCurrency`, `fxRateUSDPerNative`) populadas no INSERT (linhas 449-453). RF-04 atendido.
- Calculo USD usa `parseDecimal(w.balance) / (wRate || 1)` — evita divisao por zero. Correto.
- **Pequeno risco:** o calculo `otherUSD` consulta wallets ATIVAS mas faz isso DENTRO da transacao. Se ha SELECT FOR UPDATE em apenas uma wallet (a que esta sendo movida), as outras wallets podem mudar entre essa leitura e o commit. Em pratica, com isolation level READ COMMITTED isso pode produzir snapshot ligeiramente desatualizado se houver concorrencia em wallets diferentes. Aceitavel para audit trail (eventual consistency e a norma), mas vale documentar como limitacao conhecida.

### HIGH-6: Settings.tsx exchangeRates default + labels
- **Status:** OK.
- `Settings.tsx:45`: `useState({ CNY: 7.20, EUR: 0.92 })` — convencao nova ADR-033.
- Labels invertidas em linha 467 (`1 USD = {exchangeRates.CNY} CNY`) e 485 (`1 USD = {exchangeRates.EUR} EUR`). Coerente com a nova convencao.
- Comentario ADR-033 explicito na linha 44.
- **Ressalva:** o estado inicial e hardcoded — se o backend ainda tiver legacy nas settings (usuario nao-migrado), a UI mostra os defaults novos e nao reflete o que esta no DB ate o useEffect de fetch popular. Falta um `loading` enquanto busca. Cosmetico.

### HIGH-7: `tx.updateWalletScoped(walletId, userId, patch)` com filtro userId no WHERE
- **Status:** OK.
- `storage.ts:4178-4191` adiciona a fn nova com `WHERE id = ? AND user_id = ?`.
- `walletService.ts:299-301` faz `typeof tx.updateWalletScoped === "function" ? scoped : legacy` — feature-detection que mantem mocks legados funcionando (preserva tests).
- Defesa-em-profundidade implementada como solicitado.
- **Pequena observacao:** o legacy `tx.updateWallet` ainda existe sem o filtro userId. Se um dev futuro chamar `tx.updateWallet(walletId, patch)` em uma transacao sem fazer `getWalletById` antes, o cross-tenant write retorna ao buraco. Sugestao: deprecate `tx.updateWallet` (jsdoc com `@deprecated use updateWalletScoped`) ou — melhor — remova-o apos atualizar mocks legados em sprint posterior.

---

## Validacao dos 5 UX quick wins

### QW-A: empty state com CTA + chips de sugestao
- **Status:** OK.
- `WalletList.tsx:82-118` renderiza empty state condicional, com CTA grande "Criar primeira carteira" e tres chips ("GG Main", "Suprema", "Banco BRL").
- Cada chip chama `onCreateClick(s)` com WalletSuggestion correto. `Bankroll.tsx:93-100` recebe e propaga via prop `prefill` para `WalletCreateDialog`. `WalletCreateDialog.tsx:43-49` faz `useEffect` de prefill no open.
- A11y: textos em pt-BR claros, copy curta. Botao tem `data-testid` estaveis.

### QW-B: moeda nativa formatada + label "~ $X USD"
- **Status:** PARCIAL — formato OK, label nao renderiza nunca.
- Formatacao native (`pt-BR`, 2 decimais) corretamente aplicada via `formatNumber`.
- Lable `~ $X USD` cinza e com tooltip aparece em `WalletList.tsx:161-169`, MAS depende de `w.balanceUSD != null`.
- **Bug:** `Bankroll.tsx:67` faz `consolidated?.byWallet?.forEach((w) => byId.set(w.id, w))` — o servidor emite `walletId` (nao `id`) em `byWallet`. `byId` fica vazio, `walletItems[*].balanceUSD` sempre `undefined`, `showUsdEquiv` sempre `false`, label nunca aparece para wallets nao-USD.
- **Fix sugerido:** `byId.set(w.walletId, w)` no Bankroll.tsx, OU expor um campo `id` espelhado no serializer do backend (alternativa: mudar a interface de `byWallet` para `id` para alinhar com o schema). Optar pela opcao com menor impacto: ajustar o frontend.

### QW-D: WALLET_PLATFORM_LABELS + WALLET_PLATFORM_GROUPS com optgroup
- **Status:** OK.
- `shared/wallet-platforms.ts:48-99`: mapping completo + 3 grupos (poker, off-platform, outros).
- `WalletCreateDialog.tsx:149-155` usa `<optgroup>` corretamente.
- `WalletList.tsx:58-60, 154, 192` usa `platformLabel(w.platform)` em ambas as listas (active e archived). Consistente.
- A11y: select nativo + optgroup tem boa acessibilidade out-of-the-box.

### QW-E (parcial): "Shot pocket" com helper text
- **Status:** OK (declarado parcial pelo proprio dev).
- Helper text em `WalletCreateDialog.tsx:194-197` explicita o conceito ("carteira reservada para tentativas em buy-ins acima da banca de gestao. Nao entra no calculo da banca consolidada").
- Tooltip HoverCard ficou para sprint futuro (declarado).

### QW-F: ArchiveConfirmDialog com warning + checkbox
- **Status:** OK.
- `WalletDetailPanel.tsx:157-233` extrai dialog separado. Quando `balance > 0`, mostra warning amber-bordered com saldo formatado, copy explicativa, e checkbox obrigatorio.
- Botao "Arquivar" `disabled={submitting || (hasBalance && !acknowledged)}` — gate correto.
- A11y: `role="dialog"` + `aria-modal="true"`. Copy em pt-BR clara. Use of `cursor-pointer` no label do checkbox.
- Estado `acknowledged` reseta quando dialog reabre (via reset `useState` quando ArchiveConfirmDialog desmonta — verificado: `archiveConfirmOpen` controla mount/unmount em linha 145-152, entao toda re-abertura cria nova instancia; OK).

### QW-G: preview "Impacto banca consolidada"
- **Status:** PARCIAL — UI codada, mas nao renderiza em nenhuma situacao real.
- `WalletTransactionDialog.tsx:62-84` faz `useQuery("/api/bankroll/consolidated")` (gated por `enabled: open && wallet.nativeCurrency !== "USD"`).
- `consolidatedImpact` (linha 73-84) faz `consolidated?.byWallet?.find(w => w.id === wallet.id)?.fxRateUSDPerNative`.
- **Dois bugs em sequencia:**
  1. Server emite `walletId`, nao `id`. `find` retorna undefined.
  2. Mesmo se acertasse o nome, o serializer NAO inclui `fxRateUSDPerNative` em `byWallet[*]` — apenas `balanceNative` e `balanceUSD` (verificavel em `walletService.ts:549-557`).
- Resultado: `consolidatedImpact` sempre null, preview nunca renderiza.
- **Fix sugerido:** ou (a) fazer fallback simples derivando `fxRate = parseFloat(balanceUSD) > 0 ? parseFloat(balanceNative) / parseFloat(balanceUSD) : 1` no client, ou (b) expor `fxRateUSDPerNative` e `id` em `ConsolidatedBalance.byWallet[]` no server. Opcao (b) e mais limpa (uma linha em walletService) e ja prepara o terreno para outras telas.

---

## Validacao do hosting (Bankroll.tsx v2)

- **Status:** Funcional com 3 ressalvas LOW.
- Layout: header (titulo + 2 botoes) -> BankrollWidget -> grid 2-paineis (WalletList + WalletDetailPanel) -> BankrollHistoryTable -> dialogs portais. Estrutura correta e legivel.
- Auto-selecao da primeira wallet ativa em `useEffect` (linha 83-88) — boa UX, evita panel vazio depois de criar primeira wallet.
- `useQuery` x2 (`/api/bankroll/consolidated` e `/api/wallets`) — sem memory leak (TanStack gerencia). `staleTime: 30_000` razoavel; nenhum `refetchOnWindowFocus` explicito (default true do Query Client global) — pode causar refetch ao trocar de aba mas e o comportamento padrao do projeto.
- Edge case `0 wallets`: o `walletItems` vai estar vazio, o painel direito mostra empty state ("Crie sua primeira carteira"), o `WalletList` mostra empty state com chips. Coerente.
- Edge case `>50 wallets`: a HARD_WALLET_LIMIT do server e 50 (`walletService.ts:34`), entao em pratica nunca passa. Mas mesmo dentro do limite, `WalletList` nao tem scroll dedicado — o sidebar e `flex flex-col gap-1` direto. Em telas pequenas/medias com 30+ wallets, a sidebar empurra o conteudo principal para baixo. **LOW:** adicionar `max-h-screen overflow-y-auto` no `WalletList` aside.
- Mobile: `flex-col md:flex-row min-h-[400px]`. Em mobile, sidebar (`w-full md:w-[280px]`) ocupa largura total e empilha em cima do detail panel. Nao colapsa nem ha drawer. **LOW:** com 5+ wallets em mobile, fica bastante scroll antes de ver o detalhe. Sugestao: `<details>` collapsible em mobile, ou tabbar.
- Bug compartilhado com QW-B: `Bankroll.tsx:67` faz `byId.set(w.id, w)` mas o server emite `walletId`. **(MEDIUM)** — alinhamento de campo critico para QW-B funcionar.

---

## Issues remanescentes

| Severity | Item | Localizacao |
|----------|------|-------------|
| MEDIUM | QW-B + QW-G nao renderizam: `consolidated.byWallet[*].id` nao existe (server emite `walletId`); `fxRateUSDPerNative` nao e exposto | `client/src/pages/Bankroll.tsx:67`, `client/src/components/bankroll/WalletTransactionDialog.tsx:77`, `server/services/walletService.ts:550` |
| LOW | Sidebar `WalletList` sem scroll dedicado em telas com muitas wallets | `client/src/components/bankroll/WalletList.tsx:67` |
| LOW | Layout mobile nao colapsa sidebar; com 5+ wallets, scroll longo antes do detail panel | `client/src/pages/Bankroll.tsx:135` |
| LOW | `Settings.tsx` hardcoded defaults — usuario com legacy no DB ve UI dessincronizada ate fetch popular state | `client/src/pages/Settings.tsx:45` |
| LOW | `tx.updateWallet` legado coexiste com `updateWalletScoped` — deprecate ou remover | `server/storage.ts:4162` |
| LOW | HIGH-3 sem teste de integracao real validando soma USD via wallets (it.todo) | `tests/integration/compat/bankroll-v1-compat.test.ts` |
| INFO | HIGH-5: snapshot consolidado tem janela de eventual consistency em concorrencia entre wallets | `server/services/walletService.ts:425-438` |
| INFO | HIGH-4: confirmar `npm run db:push` rodou para o index efetivar | `migrations/` |

---

## Recomendacao

**APROVADO PARA COMMIT** — os 7 HIGH fixes estao corretos e desbloqueiam producao. Os bugs MEDIUM (QW-B/G nao renderizando) sao silenciosos (nao quebram funcionalidade core) e podem virar follow-up imediato pos-commit.

Antes de promover deploy:
1. Corrigir o pareamento `walletId`/`id` em `byWallet` — fix de 1 linha em `Bankroll.tsx` (mudar para `w.walletId`) e expor `fxRateUSDPerNative` no serializer (1 linha em `walletService.ts`).
2. Rodar `npm run db:push` para garantir o unique partial index efetivado.
3. Fazer um smoke manual: criar 2 wallets (1 USD, 1 BRL), registrar tx, ver `BankrollWidget` somando consolidado, conferir snapshot novo no DB com `walletId/nativeAmount/fxRate` populados.

Pos-commit:
- Implementar `it.todo` de validacao de integracao para HIGH-3 (createWallet x2 -> getBankrollState soma).
- Adicionar teste para QW-B/G assegurando que o lookup encontra a wallet certa.
- Reduzir `FUTURE_GRACE_MS` para 5min depois de migrar fixtures dos tests legados (MED-5 reverteu).
