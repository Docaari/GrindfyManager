# Dossiê de pesquisa — TTS para Alarmes 2.0

**Data:** 2026-04-27
**Sessão:** Alarmes 2.0 (`/grind-session-live`)
**Objetivo:** decidir mecanismo TTS para narração de alarmes (R1/R2/R3 do founder).

---

## 1. Browser support — SpeechSynthesis API (2025–2026)

`SpeechSynthesis` (Web Speech API) tem suporte amplo em Chrome 33+, Firefox 49+, Safari 7+, Edge (Chromium). Em Chrome especificamente, o carregamento de vozes é assíncrono — `getVoices()` retorna vazio até `voiceschanged` disparar (Firefox/Safari retornam imediato). Em Chrome existe ainda dependência de rede para baixar vozes Google extras. Mobile iOS Safari requer trigger por user gesture mais estrito que desktop e respeita o switch físico de mute (TTS silencia mesmo com volume alto). Android Chrome depende do TTS engine instalado no sistema — qualidade e disponibilidade de pt-BR varia por OEM.

**Implicação:** carregamento de voz precisa esperar `voiceschanged` event no Chrome. Mobile não é prioridade desta feature (grind acontece em desktop) mas vale documentar fallback.

## 2. Qualidade de vozes pt-BR — nativa vs cloud

Browser-native pt-BR varia por SO:
- **Windows 10/11:** `Microsoft Maria` (qualidade aceitável, robótica mas inteligível)
- **macOS/iOS:** `Luciana` (qualidade boa, soa natural)
- **Linux:** geralmente sem voz pt-BR instalada por padrão — depende de `espeak-ng` ou `festival`
- **Android:** depende do Google TTS Engine + voz pt-BR baixada

Cloud TTS comparison: ElevenLabs Multilingual v2 lidera qualidade (>4.5 score em fiction/non-fiction), Google Cloud WaveNet/Neural2 forte em custo (pay-as-you-go), Amazon Polly Neural intermediário. Trade-off cloud: latência de 200–800ms (server roundtrip + TTS render + áudio download), custo recorrente (~$0.016/1k chars Google, ~$0.30/1k chars ElevenLabs), requer cache MP3 client-side para alarmes repetíveis offline.

**Implicação:** browser-native cobre Windows/Mac (público alvo grindfy = desktop) com qualidade aceitável a custo zero. Cloud TTS = upgrade v2 caso founder reclame de qualidade após uso real.

## 3. Bug Chrome — corte em 15s + workaround

Chrome desktop corta utterances longas após ~15s de fala contínua (bug histórico, ainda presente em 2025). Workarounds:
1. **Chunking** — quebrar texto em frases curtas separadas por punctuation, enviar como múltiplos `SpeechSynthesisUtterance` em fila.
2. **Pause/resume hack** — `setInterval(() => { speechSynthesis.pause(); speechSynthesis.resume(); }, 10000)` mantém engine viva. Funciona em Windows/Mac Chrome, **quebra em Android Chrome** (speech para e nunca retoma).

**Implicação:** narração de alarme grindfy é curta (< 5s sempre — ex "Suprema - Sunday Plus - buy-in 100" = ~3s). **NON-ISSUE para esta feature.** Não precisa de workaround.

## 4. User gesture requirement

Chrome/Safari exigem user gesture (click/tap/keyup) antes do primeiro `speechSynthesis.speak()`. Sem gesture, `speak()` é silenciosamente ignorado ou estado fica `pending`. iOS Safari mais estrito — gesture deve estar na call stack direta da chamada. Solução padrão: "unlock" no primeiro click do user, e cachear flag.

**Implicação:** GrindSessionLive já tem trigger natural de gesture — botão "Iniciar Sessão" (`startSessionMutation`). Nesse onClick, fazemos `speechSynthesis.speak(new SpeechSynthesisUtterance(''))` (utterance vazia) para destravar engine. Onboarding zero-friction: usuário não vê botão extra. Caso queira tocar TTS antes de iniciar sessão (raro), botão "🔊 Testar voz" no painel de alertas serve de unlock alternativo.

## 5. Best practices TTS notifications

ARIA Alert pattern (W3C): alerta não deve roubar keyboard focus, deve ser breve, não interromper task atual. Frequência alta de alerta prejudica acessibilidade (cognitive load). Queue management: ao interromper (dismiss/finish), `speechSynthesis.cancel()` para limpar fila imediatamente. Queue mode `FLUSH` (cancel + speak) para alarmes que substituem anterior; `ADD` para alarmes que se acumulam. Latência alvo: <500ms para sentir "instantâneo". Volume controlável por user (slider em settings).

**Implicação:** alarmes grindfy = `FLUSH` (alerta novo cancela narração anterior em curso, evita acúmulo durante multi-tabling intenso). Volume controlável via `user_settings.alertVolume` (novo campo, 0.0–1.0).

---

## Decisão arquitetural

**Escolhido:** Browser-native `SpeechSynthesis` puro, sem fallback cloud na v1.

### Razões
1. Custo zero, latência <100ms, offline OK pós-load.
2. Público alvo = desktop Windows/Mac → vozes nativas Maria/Luciana cobrem 95%+ do uso.
3. Narração curta (<5s) elimina bug Chrome 15s.
4. User gesture já capturado em "Iniciar Sessão".
5. Fallback `beep` (Web Audio API atual) usado quando voz pt-BR ausente OU `speechSynthesis` indisponível.

### Quando reavaliar (v2)
- Founder reclamar de qualidade Maria em Windows.
- Telemetria mostrar >5% sessões em Linux/Android sem voz pt-BR.
- Demand de vozes customizadas (clone de voz, etc).

### Trade-offs aceitos
- Linux dev users → fallback beep (pequeno mas conhecido).
- Mobile não é foco da feature (grind = desktop).
- Sem controle fino de prosódia (browser TTS limita).

---

## Cooldown gating — clarificação pendente

Schema `cooldown_logs` (linhas 2692–2714 de `shared/schema.ts`) existe mas **roda PÓS-sessão** — usuário finaliza grind → vai pra cooldown page (rota separada). Durante `/grind-session-live` ativo, **cooldown nunca está em curso**. Logo "TTS suppression durante cooldown" é vacuous nesta rota.

**Pergunta para founder na spec:**
> "TTS NÃO pode tocar quando cooldown ativo" — você quis dizer:
> (a) Durante session live, suprimir TTS quando alguma sub-modal de cooldown abre? (não existe atualmente)
> (b) Em geral, se usuário finalizou e está em /cooldown, alertas que ainda dispararem ficam silenciosos? (faz sentido, mas é fluxo separado)
> (c) Outro caso?

Default da spec: opção (b) — alertas ativos pós-finalização ficam silenciosos enquanto cooldown_log.completedAt is null. Validar com founder.

---

## Sources

- [Web Speech API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [Speech Synthesis API — Can I use](https://caniuse.com/speech-synthesis)
- [Cross browser speech synthesis — DEV](https://dev.to/jankapunkt/cross-browser-speech-synthesis-the-hard-way-and-the-easy-way-353)
- [Chrome 15s bug — phetsims/utterance-queue#60](https://github.com/phetsims/utterance-queue/issues/60)
- [Pause/resume workaround Stack Overflow gist](https://gist.github.com/woollsta/2d146f13878a301b36d7)
- [Autoplay policy Chrome — developer.chrome.com](https://developer.chrome.com/blog/autoplay)
- [Web Audio best practices — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
- [W3C ARIA Alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/)
- [TTS APIs comparison 2026 — Speechmatics](https://www.speechmatics.com/company/articles-and-news/best-tts-apis-in-2025-top-12-text-to-speech-services-for-developers)
- [ElevenLabs vs Google Cloud TTS](https://unrealspeech.com/compare/elevenlabs-vs-google-text-to-speech)
