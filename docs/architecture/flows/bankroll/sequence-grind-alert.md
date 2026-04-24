# Sequence: Alerta de Banca em Grind Live (`POST /api/session-tournaments`)

Fluxo de validacao quando jogador adiciona torneio na sessao. Compara `tournament.buyIn` (normalizado para USD) com `maxBuyInUSD` e dispara modal se exceder.

## Atores
- **Jogador** (frontend)
- **GrindSessionLive.tsx** (UI)
- **BankrollAlertModal.tsx** (UI — pode ser integrado no existente)
- **routes/grind-sessions.ts** (HTTP handler — modificacao leve)
- **currencyNormalizer** (reuso puro)
- **bankrollRules** (puro)
- **useBankroll** (React Query cache)
- **PostgreSQL**

## Cenario A: Torneio dentro da regra (sem modal)

```mermaid
sequenceDiagram
    autonumber
    actor J as Jogador
    participant UI as GrindSessionLive.tsx
    participant UB as useBankroll (cache)
    participant CN as currencyNormalizer
    participant BR as bankrollRules
    participant R as routes/grind-sessions.ts
    participant DB as PostgreSQL

    J->>UI: adiciona torneio da Suprema, buyIn=R$30 (BRL)
    UI->>UB: bankroll = useBankroll() (cache hit 30s)
    UB-->>UI: {configured:true, amount:1000, rule:"1pct", maxBuyInUSD:15}

    UI->>CN: normalizeBuyInToUSD(30, "BRL", exchangeRates)
    CN-->>UI: 5.77 USD

    UI->>BR: computeThresholds({amount:1000, rule:"1pct"})
    BR-->>UI: {softLimitUSD:10, hardLimitUSD:15, maxBuyInUSD:15}

    UI->>UI: 5.77 <= 10 softLimit -> sem warning, sem modal
    UI->>UI: incrementa sessionAccumulatorUSD = 5.77
    UI->>UI: 5.77 < 1000 * 0.10 = 100 -> sem warning 10%

    UI->>R: POST /api/session-tournaments {sessionId, buyIn:30, currency:"BRL", ...}
    R->>DB: INSERT session_tournaments
    DB-->>R: ok
    R-->>UI: 201 Created
    UI->>J: card aparece na grade da sessao
```

## Cenario B: Torneio entre softLimit e hardLimit (shot — warning mas sem modal)

```mermaid
sequenceDiagram
    autonumber
    actor J as Jogador
    participant UI as GrindSessionLive.tsx
    participant UB as useBankroll (cache)
    participant CN as currencyNormalizer
    participant BR as bankrollRules

    J->>UI: adiciona torneio buyIn=$12 USD (acima do softLimit 10, dentro do hardLimit 15)
    UI->>UB: bankroll = {amount:1000, rule:"1pct", maxBuyInUSD:15, softLimitUSD:10}
    UI->>CN: normalizeBuyInToUSD(12, "USD") -> 12
    UI->>BR: computeThresholds(...) -> {soft:10, hard:15}

    UI->>UI: 12 > 10 softLimit && 12 <= 15 hardLimit -> warning "shot"
    UI->>UI: NAO bloqueia, apenas exibe badge "Shot" no card
    UI->>UI: prossegue adicao direto (sem modal)
    UI->>J: card com badge amarelo "Shot"
```

## Cenario C: Torneio acima do hardLimit (modal de confirmacao)

```mermaid
sequenceDiagram
    autonumber
    actor J as Jogador
    participant UI as GrindSessionLive.tsx
    participant M as BankrollAlertModal
    participant UB as useBankroll (cache)
    participant CN as currencyNormalizer
    participant BR as bankrollRules
    participant R as routes/grind-sessions.ts
    participant DB as PostgreSQL

    J->>UI: adiciona torneio buyIn=R$100 (BRL)
    UI->>UB: bankroll = {configured:true, amount:1000, rule:"1pct", maxBuyInUSD:15}
    UI->>CN: normalizeBuyInToUSD(100, "BRL") -> 19.23 USD
    UI->>BR: computeThresholds(...) -> {soft:10, hard:15}

    UI->>UI: 19.23 > 15 hardLimit -> ABRE MODAL
    UI->>M: open {buyInUSD:19.23, buyInDisplay:"R$100", maxBuyInUSD:15, rulePct:1.0, amount:1000}

    M-->>J: "Torneio acima da regra de banca"
    M-->>J: "Este torneio custa R$100 (~$19.23), mas sua regra (1% de $1000) limita a $15"
    M-->>J: [Cancelar] [Registrar como shot]

    alt Jogador cancela
        J->>M: clica Cancelar
        M-->>UI: canceled=true
        UI->>J: fecha modal, torneio NAO registrado
    else Jogador confirma shot
        J->>M: clica "Registrar como shot"
        M-->>UI: confirmed=true
        UI->>R: POST /api/session-tournaments {sessionId, buyIn:100, currency:"BRL", aboveBankrollRule:true}
        R->>R: auth + validacao Zod
        R->>DB: INSERT session_tournaments (com flag metadata.aboveBankrollRule=true)
        DB-->>R: ok
        R-->>UI: 201 Created
        UI->>UI: incrementa sessionAccumulatorUSD += 19.23
        UI->>J: card com badge vermelho "Shot (acima da regra)"
    end
```

## Cenario D: Warning de 10% da banca por sessao (Q5)

```mermaid
sequenceDiagram
    autonumber
    actor J as Jogador
    participant UI as GrindSessionLive.tsx
    participant UB as useBankroll (cache)

    Note over UI: estado em memoria: sessionAccumulatorUSD (zera ao iniciar sessao, Q5)

    J->>UI: ja adicionou 5 torneios somando $80 USD na sessao
    Note over UI: sessionAccumulatorUSD = 80 (banca=1000, 10% threshold=100)

    J->>UI: adiciona 6o torneio, buyIn=$25 USD
    UI->>UI: novoAcumulado = 80 + 25 = 105 > 100 (10% de 1000)
    UI->>UI: dispara TOAST PERSISTENTE (warning, nao bloqueante) "Voce ja exposto 10.5% da banca hoje"
    UI->>J: Toast amarelo no topo da tela
    UI->>UI: prossegue com adicao normalmente (modal de hardLimit nao dispara se $25 <= $15 hardLimit ... espera, $25 > $15, entao TAMBEM abre modal de shot)

    Note over UI: Ambos alertas podem coexistir: modal de shot + toast de 10%.<br/>Modal eh bloqueante (precisa decisao do user); toast eh persistente mas nao bloqueia.

    alt Usuario encerra sessao
        J->>UI: clica "Encerrar sessao"
        UI->>UI: sessionAccumulatorUSD = 0 (reseta — Q5 "por sessao")
    end
```

## Cenario E: Banca nao configurada (feature transparente)

```mermaid
sequenceDiagram
    autonumber
    actor J as Jogador
    participant UI as GrindSessionLive.tsx
    participant UB as useBankroll (cache)
    participant R as routes/grind-sessions.ts

    J->>UI: adiciona torneio buyIn=R$500 (BRL), banca NAO configurada
    UI->>UB: bankroll = {configured:false, amount:null, ...}
    UI->>UI: configured=false -> NAO valida regra, NAO abre modal, NAO incrementa accumulator
    UI->>R: POST /api/session-tournaments normalmente
    R-->>UI: 201 Created
    UI->>J: card sem badge (comportamento igual a pre-Sprint 2)
```

## Invariantes

1. **Fail-open:** Se `useBankroll` falhar (rede, cache miss, etc.), UI NAO bloqueia adicao. Assume `bankroll.configured=false` e prossegue sem validacao. Feature degrada mas nao impede o jogador de jogar.
2. **Estado de sessao em memoria:** `sessionAccumulatorUSD` eh `useState` em `GrindSessionLive.tsx`. Reseta quando sessao eh encerrada ou componente desmonta (Q5).
3. **Source of truth:** `bankrollRules.computeThresholds` eh a fonte unica. UI nao reimplementa formula — chama a funcao.
4. **Normalizacao sempre USD:** Compara `buyInUSD` vs `maxBuyInUSD`. Nunca BRL vs BRL.
5. **Flag `aboveBankrollRule` no backend:** Quando jogador confirma shot, payload tem `aboveBankrollRule:true` que vira metadata da `session_tournaments`. Util para analytics futuras ("quantos shots o jogador fez este mes?").
6. **Ordem: modal primeiro, toast depois:** Se torneio dispara ambos (shot + 10% sessao), modal aparece primeiro (bloqueante). Toast aparece apos confirmacao, se ainda ultrapassar 10%.

## Cenarios de erro

| Cenario | Resposta |
|---------|----------|
| `useBankroll` retorna erro de rede | UI assume `configured=false`, prossegue |
| `currencyNormalizer` retorna NaN (taxa de cambio faltando) | UI assume USD (pior caso: filtro falso-negativo para nao-USD) |
| Cache stale apos banca atualizada em outro tab | No pior caso, proximo request do GrindLive usa valor antigo por ate 30s (TTL do React Query). Apos, refetch automatico |
| Usuario muda banca durante sessao em outro tab | Proximo torneio adicionado ja usa nova `maxBuyInUSD` apos refetch. `sessionAccumulatorUSD` nao reseta (mantem historico da sessao) |

## Cenarios de Teste Derivados

- [ ] Banca $1000, rule 1pct, torneio $5 USD -> sem modal, sem warning
- [ ] Banca $1000, rule 1pct, torneio $12 USD -> badge "Shot" no card, sem modal
- [ ] Banca $1000, rule 1pct, torneio $20 USD -> modal "Torneio acima da regra"
- [ ] Banca $1000, rule 1pct, torneio R$100 BRL (~$19.23) -> modal aparece com display BRL + USD
- [ ] Modal: cancelar -> torneio NAO persistido no DB
- [ ] Modal: confirmar shot -> torneio persistido com `aboveBankrollRule:true`
- [ ] Acumulado sessao $105, banca $1000 -> toast "Voce ja exposto 10.5% da banca hoje"
- [ ] Encerrar sessao -> sessionAccumulatorUSD reseta para 0
- [ ] Banca nao configurada -> nunca abre modal nem toast (feature transparente)
- [ ] Cache de useBankroll invalida apos PUT /api/bankroll em outro tab (via React Query invalidation) - fora do escopo direto desta feature, mas observavel
- [ ] useBankroll com erro de rede -> UI nao quebra, assume configured=false
