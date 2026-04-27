# ADR-048: Priority queue para multi-tabling TTS (FLUSH inteligente + cap 3 itens / 30s)

## Status
Aceito — 2026-04-27

## Context

Em sessoes de **multi-tabling intenso** (4+ mesas simultaneas), o grinder pode ter varios alarmes disparando em rajada (<5s entre eles). Cenarios reais:

- Alarme custom "5min para break" tocando.
- 1s depois, late-reg automatico de SCOOP cluster dispara.
- 2s depois, custom de outra mesa "10min para break" dispara.

Sem politica de fila/interrupcao, `speechSynthesis.speak()` empilha utterances internamente — comportamento padrao do browser e `ADD` (nao cancela anterior). Resultado: usuario ouve 30+ segundos de audio acumulado, perdendo timing critico de late-reg.

Spec original (v1.0) propunha **FLUSH puro** — toda chamada nova cancela anterior. Strategist em UX audit (2026-04-27) apontou regressao: cluster SCOOP com 5 late-regs em sequencia mostraria so o ultimo. Late-reg de Sunday Plus ($100) seria interrompido por late-reg de Mini Daily ($5), perdendo info critica.

Forcas em jogo:
- **Critical timing** — late-reg encerrando em 3min vence "5min para break". late-reg perdido = dinheiro perdido.
- **Queue overflow** — 5+ alarmes em <5s = >30s de audio acumulado, atrapalha multi-tabling.
- **Engine stuck** — se `utterance.onend`/`onerror` nao dispara (browser bug), queue trava.
- **Toast vs audio** — toast empilha sempre (info visual nao pode ser perdida); audio precisa policy.

## Decision

**Priority queue inteligente com FLUSH condicional, cap 3 itens, cap 30s, watchdog 30s.**

### Logica completa

State em module-level (`narrationQueue.ts`):
```ts
type QueueItem = {
  alertId: string;
  priority: 'high' | 'normal';
  text: string;
  voice: SpeechSynthesisVoice | null;
  volume: number;
  enqueuedAt: number;
};
let _currentlySpeaking: QueueItem | null = null;
let _queue: QueueItem[] = [];
const _alertTimeouts: Map<string, number> = new Map();
const QUEUE_MAX_ITEMS = 3;
const QUEUE_MAX_TIME_MS = 30000;
```

### Decisao de FLUSH vs QUEUE

| Estado atual | Nova chamada | Acao |
|---|---|---|
| `_currentlySpeaking === null` | qualquer | toca imediato, vira current |
| current = `'normal'` | `'high'` | **FLUSH** — cancel + descarta queue inteira + toca high |
| current = `'high'` | `'high'` | QUEUE atras (mesma priority) |
| current = `'normal'` | `'normal'` | QUEUE atras |
| current = `'high'` | `'normal'` | QUEUE atras (sem FLUSH reverso) |

### Mapeamento de priority por origem

| Origem do alarme | Priority |
|---|---|
| late-reg automatic (`checkAlerts` detecta janela late-reg encerrando) | `'high'` |
| Alarme custom (label livre) | `'normal'` |
| Alarme de torneio (criado via `TournamentAlertDialog`) | `'normal'` |

### Caps

- **`cap_items`** — `_queue.length >= 3` ao tentar enqueue → drop. Toast continua via fluxo paralelo. Telemetria `tts.queue.dropped { reason: 'cap_items' }`.
- **`cap_time`** — ao promover proximo, se `Date.now() - item.enqueuedAt > 30000` → descarta. Telemetria `tts.queue.dropped { reason: 'cap_time' }`.

### Repeat policy em queue

- Item que vira `_currentlySpeaking` direto (queue vazia) toca com `repeatCount` configurado (default 2 — P1-4).
- Item promovido apos espera em queue toca **apenas 1x** (sem repeat). Justificativa: nao acumular tempo total apos espera.

### Watchdog (R-12)

`setInterval` 5s checa: se `_currentlySpeaking._startedAt > 30s atras`, forca `speechSynthesis.cancel()` + `_promoteNext()`. Defesa contra `utterance.onend`/`onerror` nunca dispararem (engine travada).

## Options Considered

### Opcao 1: FLUSH puro (spec v1.0 original)
- **Pros:**
  - Implementacao trivial (`cancel()` + `speak()` sempre).
  - Zero acumulo de audio.
- **Contras:**
  - Late-reg de torneio importante (Sunday Plus) interrompido por custom "5min break" — info critica perdida.
  - Cluster de late-regs SCOOP em sequencia mostra so o ultimo. Grinder perde 4 de 5 windows.
  - Inverso: custom interrompendo late-reg = perda de dinheiro real.

### Opcao 2: ADD ilimitado (default browser)
- **Pros:**
  - Comportamento padrao `speechSynthesis.speak()`.
  - Zero codigo adicional.
- **Contras:**
  - 5 alarmes em rajada = 30+s de audio empilhado. Atrapalha multi-tabling severamente.
  - Late-reg de Sunday Plus pode ouvir-se 20s depois ja inutil.
  - Sem forma de cancelar alarme antigo na fila (precisaria scoped cancel sobre fila do browser).

### Opcao 3: Sem queue (apenas FLUSH ou ignore)
- **Pros:**
  - Codigo mais simples que opcao escolhida.
- **Contras:**
  - Mesmos problemas da opcao 1.
  - Sem semantica de priority — late-reg vs custom indistinguiveis.

### Opcao 4: Priority queue inteligente (ESCOLHIDA)
- **Pros:**
  - late-reg sempre vence custom — preserva info critica.
  - Customs proximos formam fila ate cap (3 itens × ~5s = ~15s max sequencial).
  - Drop logado permite tunning v2.
  - Watchdog protege contra engine stuck.
- **Contras:**
  - Logica mais complexa (testes precisam cobrir 5 cenarios + caps + watchdog).
  - State em module-level exige `__resetForTesting()` (ver ADR-050).
  - Decisao de policy em mais lugares — pode nao casar com outro caso futuro (ex: alarme de seguranca que deveria ser "highest").

## Consequences

### Positivas
- **Late-reg vence custom** — info critica preservada em multi-tabling.
- **Cluster SCOOP cabe** — late-regs sequenciais com mesma priority `'high'` formam fila, todos sao narrados.
- **Cap protege contra rajada** — usuario nunca ouve >15s sequencial.
- **Toast nao perde nada** — todos alarmes geram toast (camada paralela).
- **Telemetria permite tunning** — `tts.queue.dropped` + `tts.flush.triggered` informam frequencia real.
- **Watchdog 30s previne stuck** — engine bug nao trava feature toda.

### Negativas
- **Implementacao com 5+ branches** — testes precisam cobrir cada cenario explicitamente. Test-writer atencao.
- **`_alertTimeouts` Map exige cleanup cuidadoso** — bug = vazamento de timers.
- **Assimetria normal-then-high vs high-then-normal** — primeiro flush, segundo queue. Pode confundir reviewer; documentar bem inline.
- **Cap 3 itens e cap 30s sao magic numbers** — escolhidos por design, nao por dado. Ajustar via telemetria em v2.

### Neutras
- Spec v1.1 aprova P1-8 que define exatamente esta logica.
- ADR coexiste com ADR-049 (privacy) e ADR-050 (state model).

## Reavaliar quando (gatilhos para v2)
- Telemetria `tts.queue.dropped` >10% das narracoes — ajustar cap.
- Founder pedir "highest" priority (ex: critical timer estourou).
- Pedido para alarme custom interromper late-reg em casos especificos.

## Confianca
Alta. Decisao alinhada com cenario real de multi-tabling. Caps sao tunaveis via env. Watchdog protege contra edge cases.

## Referencias
- Spec: `Docs/specs/alarmes-2-0-tts.md` (RF-13 — P1-8 atualizado)
- ADR-047 (TTS browser-native — base da feature)
- ADR-050 (state em module-level — host da queue)
- Mermaid: `Docs/architecture/sequence-fire-alert-v2.mermaid` (cenarios A-F)
- Risco R-12: queue stuck — `Docs/specs/alarmes-2-0-tts.md#riscos`
