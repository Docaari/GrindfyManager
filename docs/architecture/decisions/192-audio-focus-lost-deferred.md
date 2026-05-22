# ADR-192: Telemetria `audio_focus_lost` — descartada do escopo MP3

## Status

Aceito — 2026-05-22.

Escopo: deferida sem prazo. Sera reavaliada se aparecer um caller concreto em MP4+ (auto-pause cross-tab, attribution de quem tomou o foco, etc).

## Data

2026-05-22

## Contexto

O evento `audio_focus_lost` foi definido em ADR-191 (telemetria audio reuse `user_activity`) e na spec MP2 (D11). Shape canonico (ADR-191):

```ts
action: 'audio_focus_lost'
feature: driver name que perdeu (e.g. 'html_audio' ou 'spotify')
metadata: { driverWhoLost, driverWhoTook, gapMs }
```

A motivacao era cobrir cenarios onde o driver ativo PERDESSE o audio focus sem que o Engine arbitrasse explicitamente:

1. Outra aba toma o Spotify SDK (CDC `not_ready`).
2. SO pausa o `<audio>` HTML5 via API media nativa (e.g. Bluetooth disconnect).
3. Browser visibility change + autoplay policy revoga play.

No fechamento MP2 e na auditoria pre-MP3, **nenhum caller no codigo emite `audio_focus_lost`**. O `driverSwitchHtmlToSpot`/`driverSwitchSpotToHtml` no diagrama `mini-player-2/driver-switch-sleep-timer.mermaid` mostra o evento como side-effect de `pause(old)`, mas o handler nunca foi implementado — o swap atualmente emite apenas `audio_driver_switch`. Os 3 cenarios acima nao tem path de codigo dedicado:

- **(1)** Spotify SDK `not_ready` event ja existe no driver (MP2 RF-01.5) mas dispatcha `markSpotifyDisconnected`, nao telemetria de focus.
- **(2)** API media-session OS-level events nunca foram cabeados (MP1+MP2 escopo).
- **(3)** `visibilitychange` + MediaSession sao tratados nativamente pelo browser; o Engine nao tem visibilidade do evento de perda.

Sem caller, o evento e ruido no schema da telemetria — registra-se na ADR-191 mas nao gera dado. Pior: cria expectativa em quem le o ADR de que existe instrumentacao real.

Strategist auditou ICE pos-MP2 (6 modos): `audio_focus_lost` com I=2/C=2/E=3 = 1.3 — abaixo do corte do sprint. Founder concordou via spec MP3 secao 13 (fora de escopo).

## Opcoes Consideradas

### Opcao 1: Implementar caller em MP3 cobrindo os 3 cenarios

- **Pros:** schema da ADR-191 fica internamente consistente.
- **Contras:**
  - 3 paths distintos (Spotify SDK CDC, OS Bluetooth, visibilitychange) = 1-2d implementacao + tests.
  - Nenhuma decisao de produto downstream depende do dado hoje.
  - `audio_driver_switch` ja cobre o 95% dos cenarios praticos (switch explicito por user action — ADR-189).
  - Browser ja faz auto-pause via APIs nativas; replicar em telemetria nao acrescenta UX.

### Opcao 2: Remover evento do enum da ADR-191

- **Pros:** schema "limpo".
- **Contras:**
  - Break back-compat com quem ja leu o ADR (lesson MP1 #38 — divergencia silenciosa).
  - Se MP4 trouxer caller (cross-tab attribution), precisamos re-numerar evento.
  - Remocoes em enum de telemetria sao um sinal ruim para quem audita historicos.

### Opcao 3 (escolhida): Manter o evento no enum, documentar `deferred / no caller`

- **Pros:**
  - Back-compat preservada (lesson #38).
  - ADR-191 ainda lista o evento — quem audita ve o status no presente ADR.
  - Zero custo de implementacao em MP3.
  - Se MP4+ implementar (cross-tab auto-pause, SO-level mute attribution), o caller pluga sem renumeracao.
- **Contras:**
  - Comentario "no caller" precisa estar visivel no ADR-191 + na ADR-192 + no diagrama `mini-player-2/driver-switch-sleep-timer.mermaid` (a flecha tracejada do evento deve receber sufixo `(deferred)` em update futuro — fora de escopo MP3 estrito; documenta-se aqui).

## Decisao

**`audio_focus_lost` permanece registrado na ADR-191 mas e DEFERIDO em MP3 (sem caller). Re-avaliacao quando emergir um caller concreto.**

Concretamente:

- ADR-191 NAO e editado (linha 131 do MD permanece como esta).
- Nenhum codigo cliente ou server emite `audio_focus_lost` em MP3.
- O diagrama `Docs/architecture/diagrams/mini-player-3/keyboard-shortcuts-dispatch-flow.mermaid` e os demais MP3 NAO referenciam o evento.
- `visibilitychange` + MediaSession API continuam exclusivamente nativos do browser — o Engine nao escuta nem traduz para telemetria.
- O Engine continua emitindo apenas `audio_driver_active` heartbeat + `audio_driver_switch` no swap explicito (ADR-189) + `audio_driver_destroyed` no teardown.

### Re-avaliacao gatilhada por

1. MP4+ adicionar auto-pause cross-tab via Spotify CDC `not_ready` event com attribution.
2. MP4+ adicionar OS-level integration (Bluetooth pause, AirPlay).
3. Strategist identificar via ICE/UX audit que > 5% sessoes apresentam audio interruption sem `audio_driver_switch` correspondente — sinal de "foco perdido sem caller".

## Consequencias

### Positivas

- MP3 escopo nao infla com instrumentacao especulativa (lesson #38: divergencia silenciosa de schemas).
- Custo dev MP3 reduz ~1d (paralelizacao RF-01..RF-06 nao precisa cobrir caller foco).
- Schema da ADR-191 permanece estavel — quem audita ve a entrada com status conhecido (deferred / no caller).

### Negativas

- ADR-191 linha 131 fica com um evento "documentado mas nao emitido". Mitigacao: este ADR e a fonte de verdade pelo status.
- Se MP4 quiser usar `gapMs` consistente entre `focus_lost` e `driver_switch`, precisa garantir paridade no momento de implementar.

### Neutras

- `audio_driver_switch` (ADR-191 linha 130) ja cobre o caso practical mais comum (user action explicita troca driver) — diminui demanda urgente por `focus_lost`.

## Confianca

Alta. Decisao consistente com:

- Strategist ICE rodado pre-MP3.
- Spec MP3 secao 13 (fora de escopo, founder AFK).
- Lesson #38: nao adicionar instrumentacao sem caller observavel.

## Referencias

- ADR-189 (queue homogenea + troca driver explicita).
- ADR-191 (telemetria audio reuse `user_activity`) — linha 131 do .md.
- Spec `Docs/specs/sprint-mini-player-3.md` secao 13 + secao 18 (numeracao reservada).
- Diagrama `Docs/architecture/diagrams/mini-player-2/driver-switch-sleep-timer.mermaid` (flecha tracejada que documentava o emitter).
- Memory `session_2026-05-22-mini-player-1-shipped.md` (3 iteracoes abstracao — lesson "evitar over-instrumentation").
