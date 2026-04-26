# Spec: Wallet Balance Mode (Reportar Saldo)

## Status
Aprovada

## Resumo
Extensao do `WalletTransactionDialog` (multi-wallet v2) que adiciona um modo alternativo de registro: em vez de informar o VALOR do movimento, o usuario informa o SALDO ATUAL OBSERVADO da carteira (ex: ao terminar uma sessao, abre a sala e ve "R$ 1.247"). O sistema calcula o delta vs. saldo conhecido e cria a transacao equivalente. Usa optimistic concurrency via novo campo opcional `expectedPreviousBalance` no POST `/api/wallets/:id/transactions`. Caso de uso primario: fechamento rapido de sessao sem o jogador precisar somar/subtrair manualmente o resultado.

## Contexto
Multi-wallet v2 foi entregue em Sprint Bankroll-2 (commit 69c03c7). O fluxo atual exige que o jogador calcule mentalmente o delta da sessao ("comecei com 1180, terminei com 1247, lucro foi 67"). Pesquisa interna com founder identificou que o saldo final da sala e a informacao que o jogador tem em maos imediatamente apos o jogo — pedir o delta introduz friccao e erro humano. v1 (`/api/bankroll/snapshot` via `BankrollMovementDialog`) esta em deprecation; toda a implementacao desta spec ocorre em v2.

## Usuarios
- **Jogador (player):** termina sessao, abre a sala, ve o saldo, reporta no Grindfy em ~5s.
- **Jogador (deposito/saque):** continua usando o modo "Movimento" classico (default), nao afetado.

## Requisitos Funcionais

### RF-01: Toggle de modo no dialog
**Descricao:** Adicionar tabs/toggle no topo do `WalletTransactionDialog` com duas opcoes: "Movimento" (default, comportamento atual) e "Reportar saldo" (novo).
**Regras de negocio:**
- O toggle persiste durante a vida do dialog mas NAO entre aberturas (sempre reabre em "Movimento").
- Ao trocar de modo, limpar campos especificos e manter campos compartilhados (note, occurredAt, sessionId).
**Criterio de aceitacao:**
- [ ] Toggle visivel no topo do dialog com label "Movimento" e "Reportar saldo".
- [ ] Trocar para "Reportar saldo" oculta o input "Valor" e exibe o input "Saldo atual da carteira".
- [ ] Trocar de volta para "Movimento" restaura o comportamento original.

### RF-02: Input "Saldo atual da carteira"
**Descricao:** No modo balance, substituir o input de valor (+ direction in/out) por um input unico "Saldo atual da carteira" no `nativeCurrency` da wallet.
**Regras de negocio:**
- Aceita numero positivo, zero ou negativo (carteira pode estar negativa, mesmo warning do modo movement aplica).
- Mostrar saldo atual conhecido como hint abaixo do input ("Saldo atual: R$ 1.180,00").
- Pre-preencher o input com o saldo atual (UX hint) — usuario digita sobrescrevendo.
**Criterio de aceitacao:**
- [ ] Input recebe o `nativeCurrency` da wallet como prefixo/suffix (R$, USD, etc).
- [ ] Hint exibe `wallet.balance` formatado em `nativeCurrency`.
- [ ] Aceita valores numericos com decimais; rejeita texto nao numerico.

### RF-03: Preview de delta
**Descricao:** Abaixo do input "Saldo atual da carteira", mostrar preview computado do delta = `novoSaldo - saldoAtualConhecido`.
**Regras de negocio:**
- Delta > 0: label "+R$ 67,00 (lucro)" em verde.
- Delta < 0: label "-R$ 30,00 (perda)" em vermelho.
- Delta = 0 (epsilon 0.01): label "Saldo igual" em cinza; botao "Salvar" desabilitado (nao ha o que registrar).
**Criterio de aceitacao:**
- [ ] Preview atualiza em tempo real conforme usuario digita.
- [ ] Cores e labels conforme regra acima.
- [ ] Botao salvar desabilitado quando |delta| < 0.01.

### RF-04: Submit em modo balance
**Descricao:** Ao salvar em modo balance, o frontend deriva o body do POST a partir do delta computado.
**Regras de negocio:**
- `direction = delta > 0 ? 'in' : 'out'`.
- `nativeAmount = Math.abs(delta)` (sempre positivo no body).
- `expectedPreviousBalance = saldoAtualConhecido` (snapshot do `wallet.balance` carregado ao abrir o dialog).
- `reason` default = `'session_result'`. Usuario pode trocar para `deposit | withdrawal | manual_adjustment` via select (mesmo select que ja existe).
- `note`, `occurredAt`, `sessionId` preservados como no modo movement.
**Criterio de aceitacao:**
- [ ] Body POST contem `direction`, `nativeAmount`, `expectedPreviousBalance`, `reason`, `note?`, `occurredAt`, `sessionId?`.
- [ ] `nativeAmount` sempre > 0 no body (nunca negativo, nunca zero — bloqueado por RF-03).
- [ ] Default reason = 'session_result' visivel pre-selecionado no select.

### RF-05: Validacao backend de `expectedPreviousBalance`
**Descricao:** `walletService.recordTransaction` aceita campo opcional `expectedPreviousBalance: number`. Quando presente, valida dentro da transacao (apos `SELECT FOR UPDATE`) que `wallet.balance == expectedPreviousBalance` (epsilon 0.01).
**Regras de negocio:**
- Divergencia → throw erro tipado que o handler mapeia para HTTP 409 com body `{code: 'balance_mismatch', currentBalance: <valor atual da wallet>}`.
- Quando `expectedPreviousBalance` e `undefined`/ausente: comportamento atual preservado (sem validacao optimistic — backward-compat 100%).
- A validacao roda DEPOIS do `SELECT FOR UPDATE` para garantir leitura serializada; preserva invariante ADR-017 (snapshot[n+1].previous == snapshot[n].new).
**Criterio de aceitacao:**
- [ ] Schema Zod do endpoint aceita `expectedPreviousBalance: z.number().optional()`.
- [ ] Quando presente e divergente: 409 com payload exato `{code, currentBalance}`.
- [ ] Quando presente e igual (epsilon 0.01): transacao prossegue normal.
- [ ] Quando ausente: nenhuma alteracao de comportamento vs. v2 atual.

### RF-06: Tratamento de 409 no frontend
**Descricao:** Se o POST retornar 409 com `code: 'balance_mismatch'`, o dialog mostra alerta inline com o saldo atual real e oferece refresh.
**Regras de negocio:**
- Mensagem: "O saldo da carteira mudou enquanto voce editava. Saldo atual: R$ X,XX. Atualizar?"
- Botao "Atualizar" → refetch da wallet, atualiza `saldoAtualConhecido`, recomputa preview de delta com o novo baseline e mantem o `novoSaldo` digitado.
- Usuario revisa o novo delta e re-submete manualmente (nao auto-submit apos refresh).
**Criterio de aceitacao:**
- [ ] 409 nao fecha o dialog.
- [ ] Alerta inline com `currentBalance` formatado.
- [ ] Botao "Atualizar" faz refetch e atualiza hint de saldo + preview de delta.
- [ ] Estado do input "Saldo atual da carteira" preservado apos refresh.

### RF-07: Modo "Movimento" preservado (zero regressao)
**Descricao:** O modo "Movimento" continua identico ao comportamento atual. Nenhuma mudanca de UX, validacao ou body de POST quando o usuario nao alterna o toggle.
**Criterio de aceitacao:**
- [ ] Suite de testes existente do `WalletTransactionDialog` em modo movement passa sem alteracao.
- [ ] POST sem `expectedPreviousBalance` continua aceito pelo backend.
- [ ] Espelhamento em `bankroll_snapshots` (HIGH-5 fix existente) continua funcionando em ambos os modos.

## Edge Cases
- **Saldo igual ao atual (delta = 0):** botao salvar desabilitado, label "Saldo igual" cinza. Nao gera POST.
- **Saldo negativo digitado:** permitido, mesmo warning do modo movement ("Carteira ficara negativa") aparece se aplicavel.
- **Concorrencia (2 abas/dispositivos):** aba A submete, aba B agora tem `expectedPreviousBalance` desatualizado → 409 → fluxo RF-06.
- **Valor nao numerico:** input rejeita / Zod rejeita; botao salvar desabilitado.
- **Wallet recem-criada com balance = 0:** modo balance funciona normal; usuario digita o saldo atual e o delta se torna o "primeiro deposito" implicito.
- **Mudanca de moeda durante edicao:** wallet nao muda `nativeCurrency` em runtime; nao aplicavel.

## API Delta

**POST `/api/wallets/:id/transactions`** — alteracoes:

Novo campo opcional no body:
| Campo | Tipo | Notas |
|---|---|---|
| `expectedPreviousBalance` | `number?` | Saldo conhecido pelo cliente antes da transacao. Quando presente, backend valida dentro da TX (epsilon 0.01). |

Novo erro 409:
```json
{
  "code": "balance_mismatch",
  "currentBalance": 1247.50
}
```

Body de sucesso (sem mudanca): retorna a transacao criada + wallet atualizada (formato existente).

## Modelos de Dados Afetados
Nenhuma alteracao de schema. `wallets`, `wallet_transactions`, `bankroll_snapshots` permanecem identicos. Toda a logica nova vive em `walletService.recordTransaction` (validacao optional dentro da TX existente).

## Cenarios de Teste Derivados

### Happy Path
- [ ] Usuario abre dialog, alterna para "Reportar saldo", digita saldo maior, ve preview "+R$ X (lucro)", salva, transacao criada com direction=in.
- [ ] Mesmo fluxo com saldo menor → direction=out, label "-R$ X (perda)".
- [ ] Reason default = 'session_result' presente no body.

### Validacao de Input
- [ ] Saldo igual ao atual → botao desabilitado, sem POST.
- [ ] Texto nao numerico → input rejeita.
- [ ] Saldo negativo → aceito com warning.

### Optimistic Concurrency (RF-05/RF-06)
- [ ] POST com `expectedPreviousBalance` correto → 200 OK.
- [ ] POST com `expectedPreviousBalance` divergente → 409 com `code: 'balance_mismatch'` e `currentBalance`.
- [ ] POST sem `expectedPreviousBalance` → comportamento legacy preservado.
- [ ] Frontend recebe 409, mostra alerta inline com `currentBalance`, botao "Atualizar" faz refetch e atualiza preview.
- [ ] Estado do input "novo saldo" preservado apos refresh.

### Backward-Compat
- [ ] Suite existente do `WalletTransactionDialog` em modo movement passa sem mudanca.
- [ ] Espelhamento em `bankroll_snapshots` ocorre em ambos os modos.

### Edge Cases
- [ ] Race condition simulada: 2 POSTs simultaneos, um com `expectedPreviousBalance` desatualizado → primeiro vence, segundo recebe 409.
- [ ] Wallet com balance=0 e usuario digita saldo positivo → cria transacao direction=in com nativeAmount = novoSaldo.

## Q&A Interno (decisoes do founder)
- **Q1:** Suportar v1 (`/api/bankroll/snapshot`)? **R:** Nao. v1 esta em deprecation; ignorar.
- **Q2:** Optimistic locking via versao numerica ou via valor de balance? **R:** Via balance (`expectedPreviousBalance`). Mais natural ao dominio, sem migration.
- **Q3:** Dialog separado para o novo modo? **R:** Nao. Toggle dentro do mesmo `WalletTransactionDialog`.
- **Q4:** Reason default em modo balance? **R:** `'session_result'`. Outros reasons selecionaveis se usuario quiser categorizar diferente.
- **Q5:** Caso de uso primario? **R:** Jogador termina sessao, abre a sala, ve saldo, reporta. Otimizar para essa jornada.

## Metricas de Sucesso
- **Adocao:** % de transacoes criadas via modo balance vs movement, 30 dias pos-release. Meta inicial: > 30% das transacoes com `reason='session_result'` usam o modo balance.
- **Confiabilidade:** Taxa de 409 `balance_mismatch` < 1% das requisicoes que enviam `expectedPreviousBalance`.
- **Tempo medio de fechamento de sessao:** medir tempo entre abrir dialog e POST sucesso. Esperado: reducao vs. modo movement (hipotese: -30%).
- **Erro humano:** comparar variancia entre saldo reportado e saldo derivado de movimentos somados — se baixa, modo balance esta calibrando bem.

## Fora de Escopo
- Nao tocar v1 (`/api/bankroll/snapshot`, `BankrollMovementDialog`).
- Nao alterar fluxo de auto-import de sessao (resultado vem do parser, nao do usuario).
- Nao mudar schema de `bankroll_snapshots` nem invariante ADR-017.
- Nao adicionar suporte a "reportar saldo de todas as wallets de uma vez" (escopo futuro, fora desta spec).
- Nao adicionar historico/log de tentativas de 409 (telemetria pode vir em sprint futuro).

## Dependencias
- Sprint Bankroll-2 (multi-wallet v2) — entregue (commit 69c03c7).
- `walletService.recordTransaction` com `SELECT FOR UPDATE` — ja existe.
- HIGH-5 fix de espelhamento em `bankroll_snapshots` — ja existe.

## Notas de Implementacao (sugestoes)
- Adicionar `expectedPreviousBalance` ao schema Zod do endpoint em `server/routes/wallets.ts` (ou onde estiver o handler).
- Em `walletService.recordTransaction`, apos `SELECT FOR UPDATE`, comparar `wallet.balance` com `expectedPreviousBalance` se definido; lancar erro tipado (ex: `BalanceMismatchError`) que o handler mapeia para 409.
- No frontend, capturar `wallet.balance` no momento da abertura do dialog em estado local `knownBalance` — esse e o `expectedPreviousBalance` enviado no submit.
- Toggle pode ser `<Tabs>` do shadcn/ui ou `<RadioGroup>` — usar o que ja existe no projeto para consistencia visual.
