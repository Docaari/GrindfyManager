# ADR-049: Privacy default `ttsRedactBuyIn=true` ("Modo discreto" ativo por padrao)

## Status
Aceito — 2026-04-27 (P0-2 da spec v1.1)

## Context

A feature **Alarmes 2.0 — TTS** narra alertas em voz alta na pagina `/grind-session-live`. Alarmes de torneio podem incluir buy-in:
- Modo normal: `"Suprema, Sunday Plus, buy-in 100"`
- Modo discreto: `"Suprema, Sunday Plus, atencao"` (sem valor)

Cenarios reais que motivaram a decisao:
- Grinder em **streaming Twitch/Kick** — viewers ouvem buy-in. Pode atrair scams ou piedade ("ele perdeu $215, vamos doar").
- Grinder em **ambiente compartilhado** (familia, colega de quarto) — vergonha social ao narrar valores em voz alta.
- Grinder em **coaching gravado** — coach veria valores narrados na gravacao.
- Grinder em **cafe/co-working** — pessoas ao redor ouvem buy-in.

Spec v1.0 propunha `ttsRedactBuyIn` default `false` (opt-in privacy). Strategist UX audit (2026-04-27) apontou que isto e **anti-pattern de privacy** — defaults amigaveis devem ser os mais conservadores. Usuarios que ATIVAMENTE querem ouvir valores (jogo solo no quarto privado) podem desativar facilmente em Settings; usuarios que precisam de privacidade mas nao sabem que existe a opcao ficam expostos.

Adicionalmente, **DP-03 originalmente propunha threshold $100** (so redatar se buy-in >= 100 USD). P1-7 da v1.1 substituiu por **toggle binario puro** — quando `redactBuyIn === true`, NUNCA narra valor, independente do montante. Justificativa: vergonha social nao escala linear com buy-in. Usuario que ativa "Modo discreto" quer ZERO valores narrados.

Forcas em jogo:
- **Privacy by default** principle (W3C TAG, GDPR Article 25).
- **Opt-in tardio = pessoas expostas que nao sabiam que precisavam optar**.
- **Toggle binario** > threshold configuravel — menos campos no schema, menos confusao.
- **Migration silenciosa** — usuarios existentes (sem registro nas novas colunas) ganham `true` ao primeiro alarme pos-deploy. Pode estranhar.
- **Helper assinatura limpa** — `buildTournamentNarration(t, { redactBuyIn })` sem `redactThresholdUSD`.

## Decision

**Default `ttsRedactBuyIn = true` no schema (`shared/schema.ts`). Toggle binario puro — sem threshold.**

Schema change:
```sql
ALTER TABLE user_settings
  ADD COLUMN tts_redact_buy_in boolean DEFAULT true;
```

Comportamento:
- `redactBuyIn === true` (default novo): `"{site}, {name}, atencao"` — independente de buyIn.
- `redactBuyIn === false`: `"{site}, {name}, buy-in {valor}"`.

Helper `buildTournamentNarration` perde param `redactThresholdUSD` (assinatura P1-7). Sem dependencia de `normalizeBuyInToUSD` (binario nao precisa converter moeda).

Settings UI:
- Switch "**Modo discreto**" (renomeado de "Redatar buy-in alto" — P1-6).
- Default ativo (true).
- Help text: "Narra alertas sem mencionar valores. Recomendado para streaming, ambientes compartilhados ou jogo perto de outras pessoas."

Migration de usuarios existentes (DP-07 resolvida — opcao a):
- **Aceitar** que defaults aplicam-se a registros antigos (NULL → default value ao ler).
- **Release notes** documentam mudanca de privacy default.
- **First-run hint (P0-1, RF-10b)** menciona Settings — usuario que estranhar pode trocar facilmente.
- **NAO fazer back-fill** com `false` para legacy users — contradiz spirit privacy-by-default.

## Options Considered

### Opcao 1: Default `false` (opt-in privacy)
- **Pros:**
  - Comportamento "transparente" — usuario ouve valor a menos que opte por esconder.
  - Sem migration silenciosa — defaults aplicam ao usuario aceitando feature.
- **Contras:**
  - **Anti-pattern de privacy** — usuarios expostos por default.
  - Streamers e ambientes compartilhados ficam vulneraveis ate descobrirem o switch.
  - Contradiz GDPR Article 25 / W3C TAG / industry best practices.

### Opcao 2: Threshold-based (default `false`, redact se buy-in >= $100)
- **Pros:**
  - Compromisso entre transparencia e privacy.
  - "Buy-ins baixos sao OK narrar" — premissa intuitiva.
- **Contras:**
  - **Vergonha social nao escala linear com buy-in.** Usuario que joga $5 mas mora com pais nao quer narrar $5.
  - Threshold configuravel = campo extra no schema + UI extra + Zod extra.
  - Conversao de moeda obrigatoria — `normalizeBuyInToUSD` no client (duplicacao de logica server).
  - Edge cases: buy-in 99 narra, buy-in 100 redata — comportamento "salta" estranho.
  - DP-03/DP-05 desperdicam decision time discutindo valor exato.

### Opcao 3: Default `true` com toggle binario (ESCOLHIDA — P0-2 + P1-7)
- **Pros:**
  - **Privacy-by-default** — alinhado com industria.
  - Toggle binario simples — usuario entende em 2s.
  - Sem threshold = sem conversao de moeda = sem complexidade.
  - Helper `buildTournamentNarration` assinatura limpa — sem `redactThresholdUSD`.
  - Streamers e ambientes compartilhados protegidos sem ato explicito.
- **Contras:**
  - Migration silenciosa — usuarios existentes ganham privacy sem ter pedido (R-11).
  - Usuarios solo no quarto privado precisam ativamente desativar para ouvir buy-in.
  - Educacao via release notes e first-run hint.

### Opcao 4: Threshold + binary fallback (multi-modo)
- **Pros:**
  - Flexibilidade maxima.
- **Contras:**
  - Sobre-engineering. Spec v1 ja tem 13 mudancas P0+P1.
  - Confunde usuario.

## Consequences

### Positivas
- **Privacy-by-default** alinhado com industria — sem callback PR de "usuarios expostos por default".
- **Streamers protegidos** sem ato explicito.
- **Schema simples** — 1 boolean, sem decimal de threshold.
- **Helper assinatura limpa** — `buildTournamentNarration(t, { redactBuyIn })`. Sem `normalizeBuyInToUSD` no client.
- **Toggle binario** — UX trivial, sem conceito de "alto" para definir.
- **Release notes ganham conteudo educativo** sobre privacy.

### Negativas
- **Migration silenciosa para usuarios existentes** (R-11 documentado).
  - Usuario joga $5 ha 6 meses, sempre ouviu valor → primeiro alarme pos-deploy nao narra mais valor → estranha.
  - Mitigacao: release notes + first-run hint (RF-10b) menciona Settings.
- **Usuarios solo no quarto privado** precisam ativamente desativar — friction educativo.
- **Trade-off "transparente vs protetor"** resolvido a favor de protetor.

### Neutras
- Helper `buildTournamentNarration` perde 1 param — API mais limpa.
- Telemetria `tournament_alert.created { redacted: boolean }` permite monitorar % de redaction em uso real.
- Coexiste com `soundMode: 'mute'` (silencio total) — nao redundante (mute desliga audio, redact apenas oculta valor).

## Reavaliar quando (gatilhos para v2)
- Founder reportar usuarios solicitando "narrar valor pra mim, mora sozinho" frequente — considerar adicionar tutorial/onboarding mais ativo.
- Pedido de threshold configuravel ressurgir com base em dados reais — reavaliar opcao 2 com telemetria em maos.
- Multi-perfil de usuario (ex: "streaming mode" preset) — ai sim faz sentido toggle automatico.

## Confianca
Alta. Decisao alinhada com industry best practice (privacy by default). Trade-offs aceitos sao educativos, nao bloqueantes.

## Referencias
- Spec: `Docs/specs/alarmes-2-0-tts.md` (RF-05 P1-7, RF-07 P0-2, DP-07)
- ADR-047 (TTS browser-native — base)
- Risco R-11 — privacy migration silenciosa
- Lessons learned: `Docs/architecture/lessons-learned.md#schemas` (defaults com Zod optional)
