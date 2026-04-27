# ADR-047: TTS browser-native (SpeechSynthesis) vs cloud TTS

## Status
Aceito — 2026-04-27

## Context

A feature **Alarmes 2.0** (sprint Alarmes 2.0 — TTS) substitui o beep oscillator 880Hz/200ms da pagina `/grind-session-live` por narracao em voz pt-BR. Founder pediu (R1/R2/R3): narrar `label` do alarme, narrar torneio com buy-in opcional, repetir N vezes ate dispensa.

Existem dois caminhos arquiteturais para TTS:

1. **Browser-native** — `SpeechSynthesis` API + voz nativa do SO (Maria/Luciana).
2. **Cloud TTS** — ElevenLabs Multilingual v2, Google Cloud Neural2/WaveNet, Amazon Polly Neural.

Pesquisa documentada em `Docs/strategy/2026-04-27-tts-research.md`. Spec em `Docs/specs/alarmes-2-0-tts.md`.

Forcas em jogo:
- **Custo** — Cloud TTS cobra ~$0.016/1k chars (Google) a ~$0.30/1k chars (ElevenLabs). Grinder em sessao long pode disparar 50–200 alarmes/dia.
- **Latencia** — Cloud TTS = 200–800ms (server roundtrip + render + download). Browser-native <100ms.
- **Qualidade** — ElevenLabs lidera fiction/non-fiction (>4.5). Maria (Windows) e Luciana (macOS) sao "robóticas mas inteligiveis".
- **Offline** — Browser-native funciona offline pos-load. Cloud TTS exige conexao a cada chamada (ou cache MP3 client-side).
- **Publico-alvo Grindfy** — desktop Windows/Mac (grind acontece em desktop). Linux dev users sao minoria estatistica. Mobile fora de escopo.
- **Bug Chrome 15s** — utterances >15s sao cortadas no Chrome desktop. Narracoes da feature sao curtas (<5s sempre).

## Decision

**Browser-native `SpeechSynthesis` puro com fallback para beep oscillator quando voz pt-BR ausente.**

Implementacao em `client/src/lib/tts/` (modulo novo):
- `speakUtterance.ts` — wrapper low-level
- `useTTSVoices.ts` — hook com `voiceschanged` listener (Chrome async)
- `narrationQueue.ts` — state module singleton com priority queue
- `buildTournamentNarration.ts` — helper puro

`fireAlert.ts` ganha `soundMode: 'tts' | 'beep' | 'mute'` em `FireAlertOptions`. Quando voz pt-BR detectada (`useTTSVoices().available === true`), narra via `SpeechSynthesisUtterance`. Senao, fallback transparente para o beep atual + toast informativo (1x por sessao).

User gesture unlock implicito no botao "Iniciar Sessao" (`handleStartSession`) — utterance volume 0 destrava engine no Chrome/Safari sem modal de permissao.

**Cloud TTS NAO sera implementado na v1.** Deixa-se em backlog para reavaliacao em v2.

## Options Considered

### Opcao 1: Browser-native puro (ESCOLHIDA)
- **Pros:**
  - Custo zero (sem API recurring fee).
  - Latencia <100ms — usuario sente "instantaneo".
  - Offline OK pos-load — sessao em hotel com WiFi instavel funciona.
  - Vozes Maria/Luciana cobrem ~95% do publico desktop Windows/Mac.
  - Narracao curta (<5s) elimina bug Chrome 15s — non-issue.
  - User gesture ja capturado em "Iniciar Sessao" (zero friction onboarding).
- **Contras:**
  - Linux sem voz pt-BR cai em fallback beep (subset minoritario).
  - Sem controle fino de prosodia (browser TTS limitado).
  - Qualidade Maria robotica — pode incomodar usuarios sensiveis.
  - iOS Safari respeita switch fisico de mute (mobile fora de escopo).

### Opcao 2: Cloud TTS com cache MP3 client-side
- **Pros:**
  - Qualidade superior (ElevenLabs neural 4.5+, naturalidade humana).
  - Controle de prosodia (SSML) e voz especifica garantida cross-platform.
  - Cache MP3 reduz custo recurring para narracoes repetidas.
- **Contras:**
  - Custo recurring — cenario 100 alarmes/dia × 50 chars × 30 dias = 150k chars/mes/usuario = $2.40 (Google) a $45 (ElevenLabs). Multiplica por 1000 usuarios.
  - Latencia 200–800ms na primeira disparada — perceptivel.
  - Endpoint server-side a manter + storage de MP3s + cache invalidation.
  - Falha de rede = sem audio (mesmo com cache, primeiro alarme apos restart sem cache).
  - Complexidade alta para v1 — sprint duplica em tamanho.

### Opcao 3: Hibrido (browser-native default + cloud opcional)
- **Pros:**
  - Maioria usa browser-native (custo zero) + opcao de upgrade para premium.
  - Permite A/B test em v2.
- **Contras:**
  - Dois codigos para manter — fireAlert v2 ja complica com queue priority.
  - UX confuso — "qual som vou ouvir hoje?".
  - Pricing tier para premium = mudanca de modelo de negocio. Fora do escopo do sprint.
  - Adicionar depois e facil; remover depois e dificil.

## Consequences

### Positivas
- **Zero custo recurring** — sprint nao adiciona linha de OPEX.
- **Latencia <100ms** — sentido como "instantaneo" pelo grinder em multi-tabling.
- **Onboarding zero-friction** — gesture ja capturado, sem modal "ative audio".
- **Offline-resilient** — pos-load funciona sem internet (uteis para sessoes em casa com queda de rede).
- **Stack simples** — toda complexidade em client (sem rota nova, sem storage MP3, sem cache invalidation).
- **Reversivel** — se v2 precisar cloud TTS, adicionar branch no `fireAlert` por soundMode novo (ex: `'tts-cloud'`) sem quebrar `'tts'` existente.

### Negativas
- **Linux dev users → fallback beep**. Documentado, aceito. Toast `[TTS indisponivel — usando beep]` informa.
- **Sem controle fino de prosodia** — pronuncia "Bounty Builder" com sotaque PT (R-08). Aceito como custo da v1.
- **Qualidade Maria/Luciana** — robotica em Windows. Se reclamacao sistemica, ABRE-SE v2 (nao bloqueia sprint).
- **Mobile iOS respeita mute fisico** — mas mobile esta fora de escopo formal.

### Neutras
- Trecho de codigo browser-only (`speechSynthesis` undefined em SSR test environments). `tests/setup.ts` ganha mock global.
- Telemetria `tts.voice.unavailable` permite monitorar % de fallback em prod e justificar (ou nao) v2 cloud.

## Reavaliar quando (gatilhos para v2)
- Founder reclamar de qualidade Maria sistematicamente em uso real.
- Telemetria mostrar >5% sessoes em SO sem voz pt-BR (Linux + Android).
- Demanda de vozes customizadas (clone, multi-idioma en-US para nomes em ingles).
- Crescimento de userbase para tier que comporta custo recurring de TTS.

## Confianca
Alta. Decisao alinhada com publico-alvo desktop Win/Mac, sem custo, latencia OK, fallback coerente. Trade-offs aceitos sao conhecidos e documentados.

## Referencias
- Spec: `Docs/specs/alarmes-2-0-tts.md`
- Dossie de pesquisa: `Docs/strategy/2026-04-27-tts-research.md`
- ADRs relacionados:
  - ADR-048 (priority queue para multi-tabling)
  - ADR-049 (privacy-by-default `ttsRedactBuyIn=true`)
  - ADR-050 (state em module-level singleton)
- Mermaid:
  - `Docs/architecture/sequence-fire-alert-v2.mermaid`
  - `Docs/architecture/component-tts-module.mermaid`
