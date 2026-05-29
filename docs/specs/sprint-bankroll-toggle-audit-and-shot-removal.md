# Spec: Auditoria do Toggle `bankrollManagementEnabled` + Remoção do Bankroll Shot Modal

## Status
Proposta

## Resumo
Sprint de duas frentes: (A) auditar e formalizar a cobertura de wiring do toggle `bankrollManagementEnabled` (já parcialmente entregue nos Sprints B2/M2), confirmando que todos os pontos de UI dependentes estão corretamente gateados; (B) remover por completo a feature "Bankroll Shot Modal" — o modal que bloqueia a adição de um torneio em `/grind-live` quando `buyIn > hardLimit`. O founder classificou o bloqueio como desnecessário ("totalmente desnecessario, podemos remover essa função"). Público: jogadores profissionais de MTT usando o módulo Assistente de Grind.

## Contexto
O toggle `bankrollManagementEnabled` permite que o jogador desligue toda a camada de gestão de bankroll na UI (reconciliação pós-sessão, seção de wallets no resumo). Esse wiring foi entregue de forma incremental e nunca passou por uma auditoria consolidada — esta sprint formaliza a cobertura e registra que nenhum gate adicional é necessário.

Em paralelo, o "Bankroll Shot Modal" implementa um comportamento de bloqueio rígido: ao tentar adicionar um torneio cujo buy-in excede o `hardLimit` de bankroll, um modal interrompe o fluxo e exige confirmação explícita do jogador. Para o público-alvo (profissionais que conscientemente fazem "shots" acima do limite), esse bloqueio é fricção indesejada. A feature deve ser removida sem deixar resíduo de UI ou lógica de bloqueio.

**Importante — feature adjacente que PERMANECE:** o "accumulator warning toast" (warn-soft, mensagem "Exposicao elevada") é uma feature SEPARADA do shot modal. Ela apenas avisa sem bloquear e deve continuar funcionando intacta. A remoção é cirúrgica: apenas o branch de bloqueio rígido (`block-hard`) e seu modal saem.

## Usuários
- **Jogador profissional MTT (grinder):** adiciona torneios durante uma sessão ao vivo em `/grind-live`. Após esta sprint, torneios acima do hard limit são adicionados diretamente, sem modal de confirmação. Continua recebendo o warning toast de exposição elevada (warn-soft).
- **Jogador que desligou o bankroll management:** não vê seção de bankroll no resumo de sessão nem reconciliação inline (comportamento já existente, confirmado pela auditoria).

## Decisões Resolvidas (Q-A a Q-E)

### Q-A — Default da prop `bankrollManagementEnabled?: boolean` em `SessionSummaryModal`
**Decisão:** Manter o padrão atual `bankrollManagementEnabled !== false` (undefined = ON, back-compat). NÃO trocar para `=== true`.
**Justificativa:** Preserva compatibilidade retroativa com qualquer caller que não passe a prop (undefined deve significar "ligado", o default da coluna é `true`). Lesson §10.7 (schema deprecation gradual — Zod optional + default em vez de required puro).
**Follow-up documentado:** migrar a prop para obrigatória (`bankrollManagementEnabled: boolean`) em sprint futuro, removendo o fallback `!== false`. Deixar TODO grepável no código.

### Q-B — Quais superfícies de UI o flag esconde
**Decisão:** As três (e únicas) superfícies estão cobertas; nenhum gate novo é necessário.
1. `SessionSummaryModal` — seção de bankroll (gateado via `showBankrollSection` + `hasMissing`). ✓
2. `BankrollReconcileSection` — reconciliação inline (`if (!bankrollManagementEnabled) return null`). ✓
3. `WalletReconciliationDialog` — já REMOVIDO de `GrindSessionLive` (legacy, removido 2026-05-05). ✓
**Justificativa:** Auditoria (RF-01) confirma cobertura completa. A spec apenas registra a confirmação.

### Q-C — Default da coluna `bankroll_management_enabled`
**Decisão:** Manter `default(true)` em `shared/schema.ts:913`. Sem migration nova.
**Justificativa:** Comportamento padrão deve ser "bankroll ligado" para usuários existentes e novos. Nada a alterar.

### Q-D — Feedback ao remover o bloqueio do shot
**Decisão:** Zero feedback para o caso `buyIn > hardLimit` (founder explícito: "remover essa função"). O torneio é adicionado direto.
**Esclarecimento:** O accumulator warning toast (warn-soft, "Exposicao elevada") é OUTRA feature e PERMANECE intacto. Ele dispara em condição diferente (exposição acumulada da sessão), não no cruzamento de hard limit por torneio individual.

### Q-E — Destino do helper `decideBankrollAction`
**Decisão:** Manter o helper exportado em `client/src/lib/bankrollGrindHelpers.ts:52` (back-compat) + marcar `@deprecated` no JSDoc da função. Manter os testes de helper verdes. Remover apenas os 4 `it.todo` (linhas 181-184 em `tests/unit/bankroll/GrindSessionLive.test.tsx`) que referenciam o fluxo do shot modal.
**Justificativa:** Lesson §10.7 (deprecation gradual). Deletar o helper + seus testes tocaria "bankroll core", o que está fora de escopo. Marcar `@deprecated` sinaliza intenção de remoção futura sem quebrar nada agora.
**Alternativa rejeitada:** deletar helper + testes (toca bankroll core — out-of-scope).

## Requisitos Funcionais

### RF-01: Auditoria do wiring do toggle `bankrollManagementEnabled`
**Descrição:** Formalizar e registrar (sem mudança de código) que o toggle está corretamente wirado em todas as superfícies dependentes. Onde houver lacuna detectada durante a auditoria, abrir item; a auditoria já realizada indica cobertura completa.
**Regras de negócio:**
- Schema: `shared/schema.ts:913` `bankrollManagementEnabled: boolean("bankroll_management_enabled").default(true)` — confirmar presença e default `true`.
- `SessionSummaryModal` é wirado pelo único caller `GrindSessionLive.tsx:2994` com `bankrollManagementEnabled={summaryReconcilable.bankrollManagementEnabled !== false}`.
- `SessionSummaryModal.tsx:102-104`: `bankrollEnabled = bankrollManagementEnabled !== false`; `showBankrollSection = bankrollEnabled && wallets.length > 0`; `hasMissing = bankrollEnabled && missing.length > 0`.
- `BankrollReconcileSection.tsx:66`: `if (!bankrollManagementEnabled) return null`.
- `WalletReconciliationDialog` não está mais referenciado em `GrindSessionLive` (legacy removido 2026-05-05).
**Critério de aceitação:**
- [ ] Os testes existentes `Settings.bankroll-toggle.test.tsx`, `SessionSummaryModal.bankroll-toggle.test.tsx`, `BankrollReconcileSection.test.tsx` permanecem verdes (regressão).
- [ ] Confirmado por inspeção que as 3 superfícies (SessionSummaryModal section, BankrollReconcileSection inline, WalletReconciliationDialog removido) são os únicos pontos tocados pelo flag.
- [ ] Nenhum gate novo introduzido; nenhuma mudança de comportamento do toggle.
- [ ] A auditoria é registrada na própria spec (esta seção) como evidência de cobertura completa.

### RF-02: Remoção do código do Bankroll Shot Modal (state, handlers, JSX)
**Descrição:** Remover de `client/src/pages/GrindSessionLive.tsx` todo o código exclusivo do shot modal: estado, handlers de confirmação/cancelamento, handler de teclado e o JSX do modal.
**Regras de negócio:**
- Remover state (linhas 295-297): `bankrollShotModalOpen`, `bankrollShotPendingData`, `bankrollShotBuyInUSD`.
- Remover `handleConfirmBankrollShot` (344-373) e `handleCancelBankrollShot` (375-378).
- Remover o `useEffect` do keyboard handler (386-423) que existe exclusivamente para o modal (Esc/Enter do shot modal).
- Remover o JSX do modal (3262-3300) com `data-testid` `bankroll-shot-modal`, `bankroll-shot-cancel`, `bankroll-shot-confirm`.
- NÃO remover o accumulator warning toast (warn-soft "Exposicao elevada") — feature separada.
- NÃO remover o helper `decideBankrollAction` (ver RF-03 e Q-E).
**Critério de aceitação:**
- [ ] `data-testid="bankroll-shot-modal"`, `bankroll-shot-cancel`, `bankroll-shot-confirm` não existem mais no DOM renderizado de `GrindSessionLive`.
- [ ] Os símbolos `bankrollShotModalOpen`, `bankrollShotPendingData`, `bankrollShotBuyInUSD`, `handleConfirmBankrollShot`, `handleCancelBankrollShot` não existem mais no arquivo.
- [ ] O keyboard handler `useEffect` específico do shot modal foi removido sem afetar outros handlers de teclado (se houver outros, permanecem).
- [ ] `npm run check` (tsc) passa sem variáveis/imports órfãos.
- [ ] O warning toast de exposição elevada continua disparando em seu cenário original.

### RF-03: Remoção da lógica de bloqueio (`block-hard`) no fluxo de adicionar torneio
**Descrição:** Alterar o fluxo de adição de torneio para que torneios com `buyIn > hardLimit` sejam adicionados diretamente, eliminando o branch `block-hard` que abria o modal.
**Regras de negócio:**
- Em `tryAddTournamentWithBankrollCheck` (304-341), remover o branch `block-hard` (307-312) que abre o modal. O restante da função — o accumulator warning toast (warn-soft) — PERMANECE.
- O caller `AddTournamentDialog.onAddTournament` (linha 2655) deve passar a adicionar o torneio diretamente. Avaliar se `tryAddTournamentWithBankrollCheck` ainda agrega valor (apenas o warning toast) ou se o fluxo deve chamar a adição direta + emitir o warning; manter a semântica do warning toast inalterada.
- A flag `aboveBankrollRule: true` (linha 346) deixa de ser setada. O backend pode receber `undefined` para esse campo — comportamento aceitável (sem mudança de backend).
- O import de `decideBankrollAction` (linha 86) só permanece se a função ainda for usada (ela não será mais consumida após remover o branch). Se o único consumer era o branch `block-hard`, remover o import de `GrindSessionLive` — mas manter a EXPORT do helper em `bankrollGrindHelpers.ts` (Q-E).
- Marcar `decideBankrollAction` como `@deprecated` no JSDoc em `client/src/lib/bankrollGrindHelpers.ts:52`.
- Remover os 4 `it.todo` (linhas 181-184) em `tests/unit/bankroll/GrindSessionLive.test.tsx` que referenciam o fluxo do shot modal.
**Critério de aceitação:**
- [ ] Adicionar um torneio com `buyIn > hardLimit` resulta na adição direta do torneio, sem abrir modal e sem bloquear o fluxo.
- [ ] Nenhum payload de criação de torneio envia `aboveBankrollRule: true` a partir deste fluxo (o campo fica ausente/undefined).
- [ ] O accumulator warning toast (warn-soft "Exposicao elevada") continua disparando em seu cenário (exposição acumulada), independente da remoção do bloqueio.
- [ ] `decideBankrollAction` permanece exportado e seus testes em `tests/unit/bankroll/GrindSessionLive.test.tsx` (block-hard/warn-soft/normalize) permanecem verdes — a função em si não muda; apenas perde o consumer e ganha `@deprecated`.
- [ ] Os 4 `it.todo` (181-184) que referenciam o shot modal foram removidos.
- [ ] Nenhum import órfão de `decideBankrollAction` em `GrindSessionLive.tsx` se o branch que o usava foi removido.

## Requisitos Não-Funcionais
- **Regressão zero:** as suítes de teste de bankroll toggle e de helper devem permanecer verdes. Nenhuma mudança em bankroll core, wallets ou FX.
- **Type-safety:** `npm run check` (tsc) com 0 erros após a remoção (sem variáveis, imports ou handlers órfãos).
- **Escopo cirúrgico:** alterações confinadas a `GrindSessionLive.tsx` (remoções), `bankrollGrindHelpers.ts` (apenas JSDoc `@deprecated`) e `tests/unit/bankroll/GrindSessionLive.test.tsx` (remover 4 `it.todo`).

## Endpoints Previstos
Nenhum endpoint novo ou alterado. (A flag `aboveBankrollRule` deixa de ser enviada pelo frontend; o backend a ignora quando ausente — sem alteração de contrato.)

## Modelos de Dados Afetados
Nenhuma alteração de schema. Coluna `bankroll_management_enabled` mantida com `default(true)`. Sem migration nova.

## Integrações Externas
Nenhuma.

## Cenários de Teste Derivados

### Happy Path
- [ ] Adicionar torneio com `buyIn <= hardLimit` → adicionado normalmente (comportamento inalterado).
- [ ] Adicionar torneio com `buyIn > hardLimit` → adicionado DIRETO, sem modal, sem bloqueio (novo comportamento).

### Auditoria do toggle (RF-01)
- [ ] `bankrollManagementEnabled = true` → seção de bankroll e reconciliação inline aparecem.
- [ ] `bankrollManagementEnabled = false` → seção de bankroll e reconciliação inline ocultas.
- [ ] `bankrollManagementEnabled = undefined` → tratado como ligado (`!== false`), seção aparece (back-compat).

### Remoção do shot modal (RF-02/RF-03)
- [ ] Não há `data-testid="bankroll-shot-modal"` no DOM em nenhum cenário de adição de torneio.
- [ ] Tentar adicionar torneio acima do hard limit não dispara nenhum modal/dialog de confirmação.
- [ ] Tecla Esc/Enter durante adição de torneio acima do limite não tem efeito de fechar/confirmar shot modal (handler removido).

### Feature adjacente que permanece
- [ ] Accumulator warning toast "Exposicao elevada" (warn-soft) continua disparando em cenário de exposição acumulada.
- [ ] `decideBankrollAction` retorna corretamente `block-hard`/`warn-soft`/`normalize` em seus testes unitários (função inalterada, apenas `@deprecated`).

### Edge Cases
- [ ] Adição múltipla de torneios acima do limite em sequência → todos adicionados direto, sem fricção, warning toast de exposição dispara conforme regra de exposição acumulada.
- [ ] tsc não reporta variável/import órfão após remoção (`decideBankrollAction`, state vars, handlers).

## Fora de Escopo
- Refactor de `GrindSessionLive.tsx` (3326 LoC) — apenas remoções cirúrgicas, sem reorganização.
- Telemetria nova.
- Mudança em bankroll core, wallets ou FX.
- Migration nova (coluna `bankroll_management_enabled` mantida).
- Deleção do helper `decideBankrollAction` e seus testes (deprecação gradual em vez de remoção — Q-E).
- Migração da prop `bankrollManagementEnabled` para obrigatória em `SessionSummaryModal` (follow-up futuro — Q-A).
- Remoção da flag `aboveBankrollRule` do schema/backend (frontend apenas para de enviá-la; limpeza de backend é sprint futuro).

## Dependências
Nenhuma. Sprints B2/M2 (wiring do toggle) já entregues; esta sprint apenas audita o que já existe e remove o shot modal.

## Notas de Implementação (opcional)
- A remoção em `GrindSessionLive.tsx` deve ser feita por linha/símbolo conforme o mapa de achados; após remover, rodar `tsc` para capturar órfãos imediatamente.
- Ao remover o branch `block-hard` de `tryAddTournamentWithBankrollCheck`, preservar a parte do warning toast — não remover a função inteira sem confirmar que o warn-soft path continua.
- Deixar TODO grepável em `SessionSummaryModal` para a migração futura da prop para obrigatória (Q-A follow-up).
- `@deprecated` em `decideBankrollAction` deve mencionar que o último consumer (shot modal) foi removido nesta sprint e que a função é candidata a deleção quando os testes de helper forem reavaliados.
