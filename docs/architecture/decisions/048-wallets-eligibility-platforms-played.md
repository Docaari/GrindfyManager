# ADR-048: Eligibility de wallets = todas plataformas jogadas (cadastro inline obrigatorio)

## Status
Proposto

## Data
2026-04-27

## Contexto

A Sprint B (`21fca11`) implementou reconciliacao multi-wallet baseada em **matched wallets**: o endpoint `GET /api/grind-sessions/:id/reconcilable-wallets` retornava apenas as wallets que tinham match com pelo menos um `session_tournaments.site` da sessao via `mapSiteToWallet`. Se o jogador jogou em GG sem ter wallet GG cadastrada, a sessao terminava com:

- snapshot Suprema gravado (porque tinha wallet Suprema matched);
- nenhuma indicacao visual de que GG existiu naquela sessao;
- delta GG perdido — somava em zero, nao gerava tx, nao gerava warning.

QA real do founder reproduziu o caso: jogou na GG, terminou a sessao, abriu `/bankroll` no dia seguinte, viu saldo divergente, sem ideia do porque. O sistema sabia que o `session_tournament` GG existia (estava no banco), mas o pipeline de reconciliacao silenciava porque nao havia wallet pra mapear.

Spec B2 (M3) enderecaa isso. A questao em aberto: **como obrigar o cadastro de wallet pra plataformas jogadas?** Tres aspectos a decidir:

1. **Bloquear submit** quando ha plataforma sem wallet, ou apenas avisar?
2. **Cadastrar inline** dentro do summary, ou redirecionar pra `/bankroll`?
3. **Quando snapshot e tx para a plataforma missing existem se a wallet so vem a ser cadastrada depois?**

Ha tensao real:
- **Atrito vs accuracy:** bloquear submit aumenta accuracy do reconcile (todos os deltas refletidos), mas adiciona friccao. Jogador que joga em 5 plataformas teria que cadastrar 5 wallets *agora*.
- **Reconcile retroativo é opt-in?** Se o jogador cadastra wallet GG depois, a sessao anterior nao recupera o delta automaticamente. Snapshot ja foi gravado (ou nao, no caso de skip) — re-derivar exigiria revisitar a sessao e gerar tx retroativa.

A spec pivota a favor de **eligibility = playedPlatforms** (todas plataformas jogadas obrigatorias) com **cadastro inline + bloqueio de submit**. Esta ADR formaliza a justificativa.

### Pre-requisitos

- `mapSiteToWallet` (server/scoring/) — funcao 1-para-1 que mapeia `session_tournaments.site` para `WalletPlatform`. Deve ser invertivel pra computar plataformas ausentes.
- `session_tournaments.outcome` — campo que distingue torneios *finalizados* (resultado registrado) de *cancelados/nao-jogados*. `playedPlatforms` filtra so finalizados.
- `WalletCreateDialog` ja aceita `prefill: WalletPrefill` — cadastro inline reusa contrato existente sem prop drift.

## Decisao

`GET /api/grind-sessions/:id/reconcilable-wallets` passa a retornar **dois novos campos**:

```ts
{
  wallets: ReconcilableWallet[],            // matched wallets com expectedDelta
  playedPlatforms: WalletPlatform[],        // distinct sites de session_tournaments finalizados
  missingPlatforms: WalletPlatform[],       // plataformas jogadas SEM wallet ativa
  bankrollManagementEnabled: boolean,       // setting do user (M2)
}
```

### Regras

1. **`playedPlatforms`** = `SELECT DISTINCT site FROM session_tournaments WHERE session_id = ? AND outcome != 'not_played'`. Apenas torneios finalizados contam.
2. **`missingPlatforms`** = `playedPlatforms - sites com wallet ativa`. Inverso de `mapSiteToWallet` aplicado sobre `userWallets WHERE active=true`.
3. **Cliente bloqueia submit** quando `missingPlatforms.length > 0` E `bankrollManagementEnabled=true`. Toast `"Cadastre as wallets pendentes antes de finalizar."` Telemetry `summary_submit_blocked_missing_platforms`.
4. **Banner amber inline** no `SessionSummaryModal` lista as plataformas pendentes com CTA "Cadastrar wallet". Click abre `WalletCreateDialog` com `prefill={ platform, nativeCurrency }` derivado do platform→currency mapping (UX audit secao 3).
5. **Cadastro inline desbloqueia.** Apos POST `/api/wallets` 201, queryClient invalida `['/api/grind-sessions', sessionId, 'reconcilable-wallets']`. Refetch retorna `missingPlatforms` atualizado. Banner some quando lista vazia.
6. **Setting `bankrollManagementEnabled=false` supera.** Quando setting OFF, banner NAO aparece, missing platforms ignorado, submit prossegue. Setting eh fonte de verdade para "quero gestao multi-wallet ou nao".
7. **Sem reconcile retroativo automatico.** Se o jogador *teimosamente* cadastra wallet so depois (ignora banner via setting OFF, ou fecha modal e cadastra mais tarde), a sessao anterior nao recupera o delta. Comportamento aceito; trabalhar em sprint futura se virar pedido recorrente.
8. **Plataforma com nome ambiguo** (ex `Suprema` vs `SupremaPoker`): server retorna nome **canonico** alinhado com `mapSiteToWallet`. UI exibe canonico.
9. **Multiplas plataformas missing:** banner lista separadas por virgula. Truncar com "+N mais" se >3 (UX audit secao 2). CTA "Cadastrar wallet" abre dialog para a primeira; apos cadastro, banner atualiza com remanescentes.

### Mapping platform → currency default

(Da UX audit secao 3, alinhado com `csvParser.ts` canonicalizacao)

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
| OffPlatform_Bank | BRL |
| OffPlatform_Crypto | USDT |
| OffPlatform_Staker | USD |
| OffPlatform_Other | USD |
| GenericUSD | USD |

## Opcoes Consideradas

### Opcao 1: Apenas avisar (banner sem bloqueio de submit)
- **Pros:**
  - Zero friccao. Jogador termina sessao na velocidade que quer.
  - Respeita autonomia (Nielsen #3 — user control).
- **Contras:**
  - Mantem o sintoma do bug original (delta perdido silenciosamente).
  - Banner sem teeth eh facilmente ignorado. Jogador clica "Finalizar", banner some, dado se perde.
  - Telemetry `summary_missing_platforms_shown` viraria sinal vazio (jogador ve, nao age, sistema nao corrige).

### Opcao 2: Bloquear submit + cadastro inline (decisao escolhida)
- **Pros:**
  - Forca accuracy do reconcile (pre-condicao de submit = todas plataformas com wallet).
  - Cadastro inline reduz friccao de remediacao (modal-em-modal aceito como pequeno custo).
  - Sinal forte de telemetry (`summary_submit_blocked_missing_platforms`) permite medir frequencia do problema e ajustar UX se virar dor.
  - Reuso do `prefill` existente — zero contrato novo.
- **Contras:**
  - Friccao na primeira sessao multi-plataforma (jogador novo pode cadastrar 3-5 wallets de uma vez).
  - Modal-em-modal traz risco de focus trap.
  - Setting OFF como escape hatch (jogador pode desligar gestao multi-wallet pra escapar do bloqueio) — risco de "casual mode" pra fugir do bloqueio em vez de cadastrar.

### Opcao 3: Bloquear submit + redirect pra `/bankroll`
- **Pros:**
  - Reuso 100% do fluxo de cadastro existente (sem modal-em-modal).
  - Pagina dedicada tem espaco pra orientar (onboarding).
- **Contras:**
  - Quebra fluxo session-end. Jogador sai do summary, vai pra `/bankroll`, perde context da sessao.
  - State management complexo: precisaria persistir `pendingSessionEnd: sessionId` em localStorage, redirect-back automatic, restaurar SessionSummaryModal no estado.
  - Tempo de implementacao 3x maior. Nao justificado.

### Opcao 4: Auto-criar wallet com defaults na hora do submit
- **Pros:**
  - Zero friccao. Sistema cuida.
  - "Magic" que reduz cognitive load.
- **Contras:**
  - Cria wallets fantasma com nomes genericos (`GGNetwork Auto`) sem o jogador ter intencao explicita.
  - Saldo inicial = 0, openingBalance = 0, expectedDelta correto, mas closingBalance = ? (jogador nao reportou).
  - Pode levar a wallet duplicada se o jogador depois cria a "wallet de verdade" sem perceber que a auto-criada existe.
  - Quebra principio "user agency" (Nielsen #2 — match between system and real world).

### Opcao 5: Setting `strictEligibility` como flag
- **Pros:**
  - Permite jogador escolher entre bloqueio (default) e aviso (opt-in).
  - Granular.
- **Contras:**
  - Mais um setting num app que ja tem muitos. Hick's Law.
  - 99% dos jogadores nunca tocam. Cargo cult.
  - Setting `bankrollManagementEnabled` ja serve como escape hatch (jogador casual desliga tudo).

## Consequencias

### Positivas

- **Accuracy de reconcile = 100%** quando setting ON. Toda plataforma jogada tem wallet, todo delta vai pra ledger.
- **Friccao pedagogica:** primeira sessao multi-plataforma forca cadastro de wallet, mas isso e *necessario* pro app fazer sentido. Sem wallets, gestao multi-wallet nao funciona — bloquear no momento exato em que ela seria util reforca o conceito.
- **Telemetry mensuravel:** `summary_submit_blocked_missing_platforms` + `summary_missing_platforms_resolved` permitem medir conversao (banner mostrado → wallet cadastrada). Se conversao < 50%, sinal de que o copy do banner ou o flow nao esta funcionando.
- **Setting OFF como escape hatch sem ambiguidade:** jogador casual desliga gestao multi-wallet, banner some, fluxo simplifica. Decisao explicita do usuario, nao bypass acidental.
- **Reuso do `prefill` existente** — zero contrato novo no `WalletCreateDialog`. Consistente com lessons learned #11 (default minimo em componentes).

### Negativas

- **Friccao na primeira sessao multi-plataforma.** Jogador novo que joga em 5 plataformas tem que cadastrar 5 wallets agora. Mitigado por:
  - WalletCreateDialog modo enxuto (so name/platform/currency, avancado opcional — UX audit secao 3).
  - Currency pre-preenchida via mapping determinístico.
  - Toast de confirmacao apos cada cadastro reforça progresso.
- **Modal-em-modal risco de focus trap.** Mitigado por Radix Portal + QA manual em Chrome+Firefox.
- **Sem reconcile retroativo.** Se jogador ignora banner (via setting OFF) e depois cadastra wallet, sessoes anteriores nao recuperam delta. Aceito; trabalhar em sprint futura se virar pedido.
- **Nome ambiguo da plataforma** (alias `Suprema` vs `SupremaPoker`) depende de canonicalizacao consistente em `mapSiteToWallet`. Risk se aliases divergem em outros lugares — mitigado por uso unico do mapper como fonte.

### Neutras

- **Multiplas plataformas missing:** UX truncar com "+N mais" depois de 3 (UX audit). Implementer decide tooltip ou expansao.
- **Telemetry renomeada:** se Sprint B tinha eventos `reconcile_dialog_*`, B2 renomeia para `summary_inline_*`. Decisao executiva do implementer.
- **Nao bloqueia setting OFF.** Jogador pode usar setting como escape, e isso eh aceito como design (auto-rotulagem de "casual"). Telemetry `bankroll_management_setting_toggled` permite identificar se uso de OFF aumenta apos B2 (sinal de que bloqueio gerou frustracao).

## Confianca

**Media-Alta.** Decisao tem trade-off real (atrito vs accuracy). Acreditamos que accuracy ganha no contexto do app (gestao multi-wallet eh feature core, nao opcional). Telemetry permite revisitar se assumption errada.

## Referencias

- Spec: `Docs/specs/sprint-b2-summary-inline-reconcile.md` (M3)
- UX audit: `Docs/strategy/b2-ux-audit.md` (secoes 2, 3)
- Sequence diagram: `Docs/architecture/flows/grind/sequence-session-end-b2.mermaid` (Caminho 3)
- ADR-047: Summary inline reconcile (sibling — UX container)
- ADR-046: `session_wallet_snapshots` table
- ADR-040: Session-end wallet reconciliation (Sprint B base)
- ADR-038: Wallet tx optimistic concurrency
