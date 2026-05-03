# ADR-104 — Persistencia global de velocidade de video em localStorage (chave canonica `library-video-speed`)

- Status: Proposto
- Data: 2026-05-03
- Sprint: UX-Biblioteca-1 (RF-03)
- Decision owner: system-architect (formaliza spec founder-aprovada)
- Related: ADR-072 (Mux video integration), ADR-074 (progress sync cross-format), ADR-056 (onboarding dismiss localStorage), ADR-096 (hero localStorage skip)
- Spec: `Docs/specs/ux-biblioteca-1.md`

---

## 1. Contexto

A spec UX-Biblioteca-1 RF-03 pede controle de velocidade de reproducao no `MuxPlayer` da pagina `LessonViewer.tsx:805-811` (componente `VideoPanel`). O `@mux/mux-player-react` suporta a prop `playbackRates` que renderiza menu de velocidades nativo (UI do player).

A questao de design e: **onde persistir a preferencia do user?**

Tres caminhos possiveis:
1. **Per-aula**: chave localStorage `library:lesson:{lessonId}:video-speed`. Cada aula lembra sua propria velocidade.
2. **Global**: chave `library-video-speed`. Toda biblioteca compartilha mesma velocidade.
3. **Server-side**: coluna `users.preferences.library.videoSpeed` JSONB ou tabela `user_settings.library_video_speed`. Persiste cross-device.

### Forcas

- **Comportamento esperado em LMS**: Udemy, YouTube, Spotify, Netflix usam velocidade global. Usuario que define 1.5x espera que TODA aula que ele assistir va a 1.5x sem precisar reconfigurar. Requerer reset por aula seria UX hostil.
- **Simplicidade da implementacao**: localStorage e operacao sincrona, sem payload de network, sem dependencia de auth refresh. Zero mudanca em backend.
- **Zero migration**: nao introduz schema delta no banco.
- **Cross-device consistency**: SE o user tiver expectativa de "minha velocidade preferida me segue do desktop pro mobile", precisaria server-side. Mas:
  - Pro player Grindfy quase sempre usa um dispositivo principal (desktop com 4 monitores grindando). Mobile e secundario.
  - Devices diferentes podem ter network quality diferente — fone Bluetooth bagunca audio em 2x; user pode preferir 1x no mobile sem polluir desktop.
  - Cross-device sync complica (precisaria refetch settings antes de montar player; precisaria endpoint PATCH ao mudar; precisaria invalidacao de cache).
- **Convencao Grindfy**: localStorage ja eh padrao para preferencias frontend-only (ADR-056 onboarding dismiss, ADR-096 hero skip, `localStorage:home:f6:range`, `localStorage:home:skipOnboarding`). Adicionar 1 chave de speed nao e exotico.
- **Lesson #15**: localStorage indisponivel em SSR/test env (Safari private mode, Storage.prototype ausente em Node test). Polyfill `MemoryStorage` ja existe em `tests/setup.ts`. Helper canonico precisa de try/catch defensivo.

---

## 2. Decisao

Persistir a velocidade do video em **localStorage global** com chave canonica `library-video-speed`. Valor: numero serializado como string (ex: `"1.5"`). Range valido: `0.5` a `3.0`. Default: `1.0`.

### Implementacao concreta

Helper file novo `client/src/lib/library-video-speed-storage.ts`:

```ts
export const LIBRARY_VIDEO_SPEED_STORAGE_KEY = "library-video-speed";
export const DEFAULT_VIDEO_SPEED = 1.0;
const MIN_SPEED = 0.5;
const MAX_SPEED = 3.0;

export function readVideoSpeed(): number {
  if (typeof window === "undefined") return DEFAULT_VIDEO_SPEED;
  try {
    const raw = window.localStorage.getItem(LIBRARY_VIDEO_SPEED_STORAGE_KEY);
    if (raw === null) return DEFAULT_VIDEO_SPEED;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_VIDEO_SPEED;
    if (parsed < MIN_SPEED || parsed > MAX_SPEED) return DEFAULT_VIDEO_SPEED;
    return parsed;
  } catch {
    return DEFAULT_VIDEO_SPEED;
  }
}

export function writeVideoSpeed(speed: number): void {
  if (typeof window === "undefined") return;
  try {
    if (!Number.isFinite(speed) || speed < MIN_SPEED || speed > MAX_SPEED) return;
    window.localStorage.setItem(LIBRARY_VIDEO_SPEED_STORAGE_KEY, String(speed));
  } catch {
    // localStorage indisponivel (private mode, quota cheia) — fallback silencioso.
  }
}
```

`VideoPanel` em `LessonViewer.tsx`:

1. Em mount, ler `readVideoSpeed()` e armazenar em ref ou state local `[videoSpeed, setVideoSpeed]`.
2. Passar prop `playbackRates={[0.75, 1, 1.25, 1.5, 1.75, 2]}` ao `<MuxPlayer>` (renderiza menu).
3. Aplicar velocidade restaurada via `defaultPlaybackRate={videoSpeed}` ou via ref `mux-player` element + setter `playbackRate` em `onLoadedMetadata`.
4. Listener `onRateChange` (ou `addEventListener('ratechange')` no element) -> `writeVideoSpeed(event.target.playbackRate)`.
5. Em troca de aula (re-mount do `VideoPanel`), `readVideoSpeed()` no useEffect inicial garante que velocidade preferida e re-aplicada.

### Range validation defensiva

Dois layers:
- **Helper `readVideoSpeed`**: rejeita NaN, infinity, fora de [0.5, 3.0]. Retorna 1.0.
- **MuxPlayer prop `playbackRates`**: limita opcoes do menu a [0.75, 1, 1.25, 1.5, 1.75, 2]. User nao consegue escolher fora desse range pela UI.

Defesa em depth: mesmo que DevTools manipule localStorage para `"99"` ou `"abc"`, helper resolve com fallback 1.0.

---

## 3. Opcoes Consideradas

### Opcao 1 — Per-aula: `library:lesson:{lessonId}:video-speed`

**Pros:**
- Granularidade fina (user pode acelerar aula chata, devagar aula tecnica).
- Consistente com chave `library:lesson:{id}:hero-seen` (ADR-096) — namespace coerente.

**Contras:**
- Comportamento contra-intuitivo. LMS estabelecidos (Udemy, Coursera) usam global. Forcaria user a re-selecionar 1.5x em cada aula nova.
- Storage cresce linearmente com numero de aulas (cada aula vista = 1 chave). Cap eventual de localStorage (5MB) atingido em produto LMS grande.
- Sem caso de uso real validado pelo founder — adicionaria complexidade sem ganho.

### Opcao 2 — Global: `library-video-speed` (ESCOLHIDA)

**Pros:**
- Comportamento esperado em LMS (Udemy/YouTube/Spotify/Netflix). User configura 1x e tudo na biblioteca usa 1x.
- Storage minimo (1 chave fixa).
- Implementacao simples (helper trivialmente testavel).
- Aderente a convencao Grindfy localStorage-first para preferencias frontend-only.

**Contras:**
- User que quisesse aula-tecnica em 1x e aula-leve em 1.5x precisa re-selecionar a cada troca. Edge case raro; LMS estabelecidos provam que comportamento global e aceito.

### Opcao 3 — Server-side: coluna em `users.preferences` JSONB

**Pros:**
- Cross-device sync (preferencia segue user em qualquer browser/maquina).
- Padrao "settings page" no produto.

**Contras:**
- Schema delta + migration + endpoint PATCH + invalidacao de cache TanStack Query. Custo desproporcional ao ganho (preferencia de speed de video nao e critica como FX rate ou banca).
- Requer refetch antes de montar player (ou fallback para 1.0 ate response chegar — gera flicker visual de velocidade mudando no meio do video).
- Pro player Grindfy usa primariamente desktop. Mobile secundario; cross-device sync overhead nao se justifica.
- Lesson #56: Sprint F4 onboarding dismiss tomou exatamente esta decisao (localStorage vs `users.preferences`). ADR-056 escolheu localStorage pelos mesmos motivos.

### Opcao 4 — Hibrido: localStorage primario + sync opcional ao servidor

**Pros:**
- Melhor dos dois mundos: instant load + cross-device.

**Contras:**
- Complexidade alta para feature de baixo valor. Conflict resolution (qual e o source of truth?) abre furo de UX.
- Founder nao pediu cross-device. YAGNI.

---

## 4. Consequencias

### 4.1. Positivas

- **Comportamento esperado**: user configura velocidade 1x e toda biblioteca respeita. Nao precisa re-aplicar.
- **Implementacao trivial**: helper file ~30 linhas + 2 listeners no `VideoPanel`. Zero mudanca backend.
- **Zero migration**: schema do banco intocado. Migration `0036` da Sprint UX-Biblioteca-1 trata apenas de `library_access_requests` (ADR-103).
- **Convencao Grindfy aderente**: localStorage-first para preferencias frontend-only (igual ADR-056, ADR-096, home flags).
- **TDD-friendly**: helper isolado em arquivo proprio facilita test-writer escrever red phase. Polyfill `MemoryStorage` ja existe em `tests/setup.ts` (lesson #15).
- **Defesa em depth**: 2 layers de validacao (helper + prop `playbackRates`). DevTools manipulando localStorage nao quebra player.

### 4.2. Negativas

- **Sem cross-device sync**: user em mobile nao herda velocidade do desktop. Aceito (motivos descritos em §3 Opcao 3).
- **localStorage quota cheia**: chave nao persiste; user re-seleciona velocidade em cada sessao. Edge case raro; helper trata silenciosamente sem crash.
- **MuxPlayerFallback ativo (Mux indisponivel)**: nao tenta setar velocidade. RF-03 nao aplica nesse caso (degradacao graceful).
- **Convivencia com chave `library:lesson:{id}:hero-seen` (ADR-096)**: namespacing diferente (`library-video-speed` vs `library:lesson:*:hero-seen`). Nao e inconsistente — uma e global, outra e per-resource. Ainda assim, time futuro pode questionar; este ADR documenta a divergencia intencional.

### 4.3. Neutras

- **Listener `ratechange`**: MuxPlayer dispara ao trocar velocidade via menu OU programmaticamente. Listener captura ambos. Listener tambem dispara se `defaultPlaybackRate` muda em re-mount; idempotente (writeVideoSpeed escreve mesmo valor, sem efeito).
- **Lesson aprendida em Bloco-A-Polish**: ADR-096 `library:lesson:{id}:hero-seen` foi a primeira chave biblioteca em localStorage. Esta ADR usa namespacing diferente (kebab-case sem prefixo `library:`) por simetria com `coach:tier:locked`, mas convivem sem conflito. Time futuro pode unificar se justificar (custo migracao = mover 1 chave por user).
- **MuxPlayer `playbackRates` prop**: confirmar versao instalada do `@mux/mux-player-react`. Spec mitigation: se prop nao existir, fallback para `attr playbackrate` no DOM ou `ref.current.playbackRate = X`.

### 4.4. Migracao reversivel

Reverter = remover prop `playbackRates` do MuxPlayer + remover helper file. Chaves antigas em localStorage ficam orfas (nao causam dano; apenas ocupam ~10 bytes por user). Custo de reversao: 1 PR.

---

## 5. Confianca

**Alta.** Padrao "preferencia frontend-only via localStorage" estabelecido em 4 ADRs anteriores (056, 096, home-reform-1 flags). MuxPlayer `playbackRates` documentado pelo Mux. Range validation defensiva (helper + prop). Polyfill `MemoryStorage` ja em setup.ts. Sem novos riscos.

---

## 6. Notas de Implementacao

- Helper `client/src/lib/library-video-speed-storage.ts` deve ser testavel isoladamente (test-writer escreve `tests/unit/library/library-video-speed-storage.test.ts` com 4 cenarios: read default, read invalid, read out-of-range, write success + fallback).
- `VideoPanel` em `LessonViewer.tsx:805-811` recebe import do helper. Em useEffect inicial, le velocidade e aplica via prop `defaultPlaybackRate` OU via ref + setter no `onLoadedMetadata`.
- Listener pode ser `<MuxPlayer onRateChange={(e) => writeVideoSpeed(e.detail || e.target?.playbackRate)} />` ou via `useEffect` + `addEventListener('ratechange', handler)` direto no element. Implementer escolhe baseado em API estavel da versao do `@mux/mux-player-react`.
- Range em prop `playbackRates`: spec define [0.75, 1, 1.25, 1.5, 1.75, 2]. Helper valida [0.5, 3.0] como super-set para defesa em depth (DevTools manipulation nao quebra). Spec define UI; helper define guard.
- Reviewer checklist: zero hardcoded `localStorage.getItem(...)` em components — sempre via helper. Zero `try/catch` em components — helper ja trata.
- Cleanup de chaves orfas (apos eventual mudanca futura): script de migration manual via DevTools console; sem urgencia em produto vivo.
