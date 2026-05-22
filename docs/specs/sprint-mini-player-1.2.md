# Sprint Mini Player 1.2 — Consolidacao Pos-Reviewer R2 (MP1.1)

## Status

**Proposta** — aguardando aprovacao founder. Sprint dedicada de divida tecnica fechando os 5 follow-ups deixados pela R2 do reviewer na Sprint Mini Player 1.1 (ja shipped commit `9d2957ac`).

## Origem

- Sprint base: `Docs/specs/sprint-mini-player-1.1.md` (9 RFs shipped + 1 SKIP)
- Memory: `memory/session_2026-05-22-mini-player-1.1-shipped.md`
- ADRs vivos: 187 (`AudioSourceEngine`) + 188 (`MiniPlayer FSM + z-index`) — addendum esperado em 188 se RF-05 splittar context
- Reviewer R2: deixou HIGH-1 (latente safeUseQuery) + LOW-2 (cn() helper) + MEDIUM-3 (data:image policy) + NIT-1 (X button overlap) + RF-04 deferido MP1.1 (React.memo profiler) = 5 follow-ups
- Founder ordenou por ICE (manter ordem); RF-01 e o unico bug latente real (Rules-of-Hooks)

## 1. Sumario Executivo

**Objetivo.** Pagar divida tecnica residual da Sprint MP1.1 num unico ciclo TDD — sem feature nova, antes de iniciar MP2 (Spotify integration) ou MP3 (polish). Foco: fechar bug latente (`safeUseQuery` violando Rules-of-Hooks), padronizar primitives (`cn()`), documentar policy de seguranca (`data:image`), validar UX (X button overlap), e perf condicional (React.memo APENAS se profiler real-data confirmar).

**Tese.** MP1.1 fechou 9/10 follow-ups da R1, mas o reviewer R2 marcou HIGH-1 (latente) + 4 menores. Consolidar em MP1.2 evita drift; e ultimo ciclo do bloco MP1 antes de MP2.

**Constraints duros.**
- Sem migration.
- Sem feature nova — strict consolidacao.
- Zero regressao na baseline MP1+MP1.1 (199 MP1 + 55 MP1.1 + 218 c/baseline + 3213 client tests verdes).
- Reusa `tests/setup.ts` (lesson #38 ja aplicada).
- RF-05 (React.memo / split context) e CONDICIONAL — gate em profiler real-data.

**5 RFs em 1 linha:**

- **RF-01** — `safeUseQuery` refactor via ErrorBoundary local + sub-componente fetcher (lesson #29)
- **RF-02** — Migrar `MiniPlayerBar:189` cover className de string concat para `cn()` helper
- **RF-03** — JSDoc `@policy` / `@security` em `sanitizeCoverUrl.ts` documentando `data:image/*` bloqueado by-design
- **RF-04** — Verify manual /grind-live: X button shadcn nao sobrepoe search input em LessonPickerDialog
- **RF-05** — Profiler real-data VolumeControl + SpeedControl → React.memo OU split context, decisao em runtime

---

## 2. Contexto Tecnico

### Onde MP1.1 deixou divida

MP1.1 shippou em ~1d (1 ciclo TDD completo). R2 deixou 5 items: 1 HIGH latente (safeUseQuery) + 1 LOW (cn() helper) + 1 MEDIUM (policy doc) + 1 NIT (UX manual verify) + 1 deferido (RF-04 MP1.1 profiler-gated).

Stack atual (post-MP1.1):
- `LessonPickerDialog.tsx` (`client/src/components/audio-player/`) — usa `safeUseQuery` wrapper em try/catch para tolerar provider ausente em testes standalone.
- `MiniPlayerBar.tsx` (`client/src/components/audio-player/`) — cover className com string concat condicional.
- `sanitizeCoverUrl.ts` (`client/src/lib/audio-engine/`) — bloqueia javascript:/data:/file:/ftp:/relative paths.
- `VolumeControl.tsx` + `SpeedControl.tsx` (`client/src/components/audio-player/`) — consumers de `AudioPlayerContext`.
- `AudioPlayerContext.tsx` (`client/src/contexts/`) — surface unica state+controls.

### Onde MP1.2 NAO toca

- Feature nova (Spotify integration, queue, floating icon — MP2/MP3).
- Backend (zero mudanca em `server/routes/library.ts`).
- `LessonViewer.tsx` / `PodcastPlayer.tsx` (Biblioteca-1).
- Outros consumers de `safeUseQuery` (se houver — RF-01 e scoped a LessonPickerDialog).

---

## 3. Requisitos Funcionais

### RF-01 — Refactor `safeUseQuery` via ErrorBoundary local [HIGH-1 latente]

**ICE:** I=4, C=4, E=3 → 5.3 (top do sprint — unico bug real)

**User Story.**
Como dev mantenedor, quero que `LessonPickerDialog` siga Rules-of-Hooks (ordem estavel entre renders), para que mudanca de mount status do `QueryClientProvider` nao quebre o componente em prod.

**Descricao do bug.**
Hoje `LessonPickerDialog.tsx` faz `safeUseQuery(...)` em try/catch. Se `QueryClientProvider` mount status mudar entre renders (raro em prod, mas possivel em SSR/lazy boot/Strict Mode), a ordem de hooks muda → React warning "Rendered fewer hooks than expected" + crash potencial. Bug funcionalmente latente (providers sempre presentes em prod hoje), mas viola Rules-of-Hooks.

**Solucao (lesson #29 do CLAUDE.md).**
1. Extrair fetcher para sub-componente (`LessonPickerDialogFetcher`).
2. Sub-componente chama `useQuery` direto (sem try/catch — assume provider presente).
3. ErrorBoundary local envolve sub-componente; captura "No QueryClient set" hard error.
4. Fallback: lista vazia + mensagem "Erro ao carregar — tente novamente." (consistente com tratamento existente do detail fetch — MEDIUM-4 R2).
5. Remover `safeUseQuery` wrapper + JSDoc warn.

**Files afetados.**
- `client/src/components/audio-player/LessonPickerDialog.tsx` (refactor principal)
- Deletar/inline `safeUseQuery` helper se nao reusado em outros lugares (verificar via grep antes — RF-04 do simplify).

**Aceitacao.**
- [ ] Hooks na mesma ordem entre renders (sem try/catch em useQuery).
- [ ] ErrorBoundary local captura "No QueryClient set" → renderiza mensagem fallback (`role="alert"`).
- [ ] Lista vazia quando ErrorBoundary ativa.
- [ ] Tests existentes do LessonPickerDialog continuam verdes (199 MP1 + 55 MP1.1).
- [ ] Novo test: render do dialog SEM `QueryClientProvider` → ErrorBoundary captura, renderiza fallback, sem crash.
- [ ] `safeUseQuery` removido (ou marcado deprecated se usado em outros lugares — grep confirma).

**Riscos.**
- **R-01.1**: ErrorBoundary local conflita com error boundaries pai. Mitigar: usar boundary minima local (so captura render errors do sub-componente, re-throw outros).
- **R-01.2**: Tests MP1.1 dependem de `safeUseQuery` mockado. Mitigar: refactor preserva surface de testes (mock no level de `useQuery` continua funcionando).

**Out-of-Scope RF-01.**
- Migrar outros consumers de `safeUseQuery` (se existirem) para o padrao ErrorBoundary.
- Generalizar `LessonPickerDialogFetcher` para reuso em outros dialogs.

---

### RF-02 — Migrar `MiniPlayerBar` cover className para `cn()` helper [LOW-2]

**ICE:** I=2, C=5, E=1 → 5.0 (one-liner, consistency)

**User Story.**
Como dev, quero usar `cn()` helper de `@/lib/utils` consistentemente em todo o codebase, para seguir o padrao shadcn/CVA ja canonico no projeto.

**Descricao.**
Hoje `MiniPlayerBar.tsx:189` (linha aproximada) usa string concat para condicionar animacao:
```tsx
'w-12 h-12 rounded-md object-cover ...' + (isPlaying && !reducedMotion ? ' animate-spin-slow' : '')
```
Padrao shadcn no resto do codebase: `cn('base classes', condition && 'conditional class')`.

**Solucao.**
```tsx
import { cn } from '@/lib/utils';

className={cn(
  'w-12 h-12 rounded-md object-cover ...',
  isPlaying && !reducedMotion && 'animate-spin-slow'
)}
```

**Files afetados.**
- `client/src/components/audio-player/MiniPlayerBar.tsx` (1 linha)

**Aceitacao.**
- [ ] Linha usa `cn()` import de `@/lib/utils`.
- [ ] Comportamento identico (cover gira quando `isPlaying && !reducedMotion`).
- [ ] Snapshot/visual igual (regressao MP1 verde).

**Riscos.** Nenhum — refactor trivial.

**Out-of-Scope RF-02.**
- Auditar outros componentes do MiniPlayer pra mesma migracao (deferido MP1.3 se houver demanda).

---

### RF-03 — JSDoc policy em `sanitizeCoverUrl.ts` [MEDIUM-3]

**ICE:** I=2, C=4, E=1 → 4.0 (doc-only)

**User Story.**
Como dev futuro implementando MP2 (Spotify), quero entender por que `data:image/*` esta bloqueado em `sanitizeCoverUrl`, para que eu nao introduza vulnerabilidade XSS por descuido se Spotify retornar embedded placeholders.

**Descricao.**
Hoje `sanitizeCoverUrl.ts` bloqueia `data:image/*` (alem de `javascript:`/`file:`/`ftp:`/relative paths) sem documentacao da policy. Reviewer R2 marcou MEDIUM-3: "se MP2 quiser embedded placeholder, vai abrir excecao errada".

**Solucao (doc-only).**
Adicionar JSDoc top-of-file + per-branch:

```ts
/**
 * Sanitize cover URL for safe rendering in <img> + Media Session API.
 *
 * @policy
 * - HTTPS preferido; HTTP aceito (Media Session API tolera).
 * - URLs relativas REJEITADAS (sem base path confiavel no contexto cross-driver).
 * - `data:image/*` BLOQUEADO by-design (ver @security).
 * - Outros schemes (javascript:, file:, ftp:, blob:) BLOQUEADOS.
 *
 * @security
 * `data:image/*` rejeitado para evitar XSS payload via data URI (atacante
 * pode embarcar SVG com <script> inline, escapando CSP img-src). Se MP2
 * (Spotify driver) quiser embedded placeholder, abrir excecao explicita
 * com branch dedicado + validacao de mime-type estrita (`data:image/png`,
 * `data:image/jpeg` apenas, NUNCA `data:image/svg+xml`).
 *
 * @returns URL string normalizada ou null se invalida/bloqueada.
 */
```

**Files afetados.**
- `client/src/lib/audio-engine/sanitizeCoverUrl.ts` (so JSDoc).

**Aceitacao.**
- [ ] JSDoc `@policy` + `@security` claros no topo do arquivo.
- [ ] Comentario inline em cada branch de bloqueio explicando motivo (1 linha).
- [ ] `tsc --noEmit` exit 0 (sem warnings).
- [ ] ESLint exit 0 (sem complaints sobre JSDoc syntax).
- [ ] NAO implementar excecao `data:image/png` ainda — so documentar para MP2.

**Riscos.** Nenhum — doc-only.

**Out-of-Scope RF-03.**
- Implementar excecao para `data:image/png` (MP2 quando Spotify driver entrar).
- Auditar CSP `img-src` do app (separado).

---

### RF-04 — Verify manual: X button shadcn nao sobrepoe search input [NIT-1]

**ICE:** I=2, C=5, E=1 → 5.0 (verify-only, 5min)

**User Story.**
Como user, quero ver o X de fechar do dialog sem que ele tape o input de busca, para que eu possa fechar o dialog sem cliques acidentais no input.

**Descricao.**
RF-05 do MP1.1 migrou `LessonPickerDialog` para Radix `Dialog` (shadcn). `<DialogContent>` shadcn renderiza X automatico no top-right (`DialogPrimitive.Close` interno com `absolute right-4 top-4`). NIT-1 da R2: "X pode sobrepor search input se o input estiver muito proximo do top".

**Solucao (verify manual primeiro, fix so se necessario).**
1. Abrir `/grind-live` em dev (`npm run dev` porta 3000).
2. Clicar botao "Escolher aula" para abrir `LessonPickerDialog`.
3. Verificar viewports:
   - **>= 640px (desktop/tablet)**: X visivel no top-right, search input com padding-top suficiente.
   - **< 640px (mobile)**: X nao tapa input.
4. Se sobrepor:
   - **Opcao A (preferida)**: Adicionar padding-top no container que envolve search input (`pt-8` ou `pt-10`).
   - **Opcao B**: Esconder X interno via `[&>button]:hidden` no DialogContent + renderizar Close manual em posicao custom.
   - **Opcao C**: `DialogContent` shadcn aceita `showCloseButton={false}` prop? Verificar — se sim, renderizar Close manual.
5. Se NAO sobrepor: registrar verify OK em comentario do PR + fechar RF-04 sem code change.

**Files afetados (se fix necessario).**
- `client/src/components/audio-player/LessonPickerDialog.tsx` (1 linha de padding OU custom Close).

**Aceitacao.**
- [ ] Verify manual >= 640px: X visivel, nao sobrepoe input — print/screenshot no PR.
- [ ] Verify manual < 640px (DevTools responsive mode 375px): idem — print/screenshot no PR.
- [ ] SE fix aplicado: novo test snapshot DOM verifica X + input distintos visualmente.
- [ ] SE verify OK sem fix: comentario no PR `RF-04 verify: OK (sem code change) — [screenshots anexos]`.

**Riscos.**
- **R-04.1**: Founder pode pedir fix em viewport intermediario nao testado. Mitigar: testar 3 viewports comuns (375 / 768 / 1280) por default.

**Out-of-Scope RF-04.**
- Reestilizar X (cor, size, hover state) — fora do escopo NIT-1.

---

### RF-05 — Profiler real-data VolumeControl + SpeedControl → React.memo OU split context [RF-04 MP1.1 deferido]

**ICE:** I=3, C=3, E=3 → 3.0 (condicional ao profiler)

**User Story.**
Como user, quero que controles do mini-player nao re-renderizem desnecessariamente em cada timeupdate do audio (4 ticks/s), para que a UI permaneca leve em sessoes longas (>1h grind).

**Descricao.**
RF-04 do MP1.1 foi SKIPADO porque profiler estimado mostrou re-renders "baratos" sem audio real tocando. R2 deferiu para MP1.2 com gate em profiler real-data.

**Solucao (profiler-gated, decisao em runtime).**

**Pre-requisito (gate obrigatorio).**
Implementer roda React Profiler com audio REAL tocando em `/grind-live`:
1. Iniciar audio (qualquer lesson da biblioteca).
2. Profiler grava 10s via **React DevTools Profiler oficial** (browser extension). Leitura: contagem de commits de cada componente alvo no flamegraph. NAO usar console.count em useEffect (efeitos pos-commit mascaram bailouts de memo) nem why-did-you-render (intrusivo).
3. Contar re-renders de `VolumeControl` + `SpeedControl` em 1s (4 ticks ~250ms timeupdate cada).
4. Output medido = `N re-renders/s`.

**Decisao em runtime baseada em N.**

- **SE N > 20 re-renders/s** → implementar uma das opcoes:
  - **Opcao A (simples — preferida)**: Aplicar `React.memo` em `VolumeControl` + `SpeedControl` com `arePropsEqual` custom (compare so props relevantes).
  - **Opcao B (refactor maior)**: Split `AudioPlayerContext` em `AudioStateContext` (state + currentTime + duration) + `AudioControlsContext` (play/pause/seek/setVolume/setSpeed). Components consumers de controles so leem `AudioControlsContext` (que so muda quando handlers mudam, raro). Unskippar os 4 tests em `tests/client/mini-player-1.1/AudioContext.split.test.tsx` (describe.skip).
  - Decisao A vs B em runtime: implementer escolhe baseado em complexidade observada (se memo resolve, parar; se nao, split).
  - Documentar decisao em ADR-188 addendum (RF-05 measurement + chosen path).

- **SE N <= 20 re-renders/s** → SKIP definitivo:
  - Documentar resultado em ADR-188 addendum (RF-05 measurement + skip rationale).
  - Manter `describe.skip` nos 4 tests `AudioContext.split.test.tsx` com comentario "skipped indefinitely — RF-05 MP1.2 profiler measured N=X re-renders/s, abaixo do threshold de 20".
  - Fechar RF-05 sem code change funcional.

**Files afetados (se gate passa, opcao A — React.memo).**
- `client/src/components/audio-player/VolumeControl.tsx` (`memo()` wrap + custom comparator).
- `client/src/components/audio-player/SpeedControl.tsx` (idem).

**Files afetados (se gate passa, opcao B — split context).**
- `client/src/contexts/AudioStateContext.tsx` (NOVO).
- `client/src/contexts/AudioControlsContext.tsx` (NOVO).
- `client/src/contexts/AudioPlayerContext.tsx` (refactor — wrapper que compoe ambos).
- `client/src/components/audio-player/VolumeControl.tsx` (migrar para `useAudioControls()`).
- `client/src/components/audio-player/SpeedControl.tsx` (idem).
- `tests/client/mini-player-1.1/AudioContext.split.test.tsx` (unskip 4 tests).

**Files afetados (se gate falha).**
- `Docs/architecture/decisions/188-mini-player-displaymode-fsm.md` (addendum measurement + skip rationale).
- Nenhum codigo.

**Aceitacao (se gate passa, qualquer opcao).**
- [ ] Profiler antes: N re-renders/s medidos e documentados.
- [ ] Profiler depois: N reduzido (alvo < 5 re-renders/s).
- [ ] 9 controles operando sem regressao funcional.
- [ ] ADR-188 addendum com numero medido + decisao registrada (A ou B).

**Aceitacao (se gate falha).**
- [ ] ADR-188 addendum: "RF-05 MP1.2 profiler: N=X re-renders/s, abaixo threshold 20 → SKIP definitivo. React.memo nao necessario. Re-avaliar se MP2 introduzir re-render adicional."
- [ ] 4 tests `describe.skip` mantidos com comentario justificativa.
- [ ] Spec MP1.2 commit final marca RF-05 como `[SKIPPED — gate failed at N=X]`.

**Riscos.**
- **R-05.1**: Profiler ambiguo (50/50). Mitigar: rodar 2x (cold + warm cache) — se medias divergem >50%, default SKIP.
- **R-05.2**: Opcao B (split) quebra back-compat de `useAudioPlayer()`. Mitigar: wrapper `useAudioPlayer()` continua existindo, le de ambos os contexts internamente.
- **R-05.3**: Opcao A (React.memo) com comparator custom incorreto introduz bug visual (controle nao atualiza quando deveria). Mitigar: comparator so ignora props que sabidamente nao afetam render (e.g., `currentTime` se nao for usado).

**Out-of-Scope RF-05.**
- Otimizar outros componentes do MiniPlayer (MiniPlayerBar/MiniPlayerExpanded — separado).
- Profiler outros consumers de `AudioPlayerContext` (LessonPickerDialog — fora do escopo).

---

## 4. Requisitos Nao-Funcionais

- **RNF-01.** Zero regressao na baseline MP1+MP1.1 (199 MP1 + 55 MP1.1 + 218 c/baseline + 3213 client tests verdes). CI verde antes de merge.
- **RNF-02.** TSC exit 0.
- **RNF-03.** Reusa `tests/setup.ts` (lesson #38 ja aplicada) — sem novas hacks de setup.
- **RNF-04.** Sem migration. Sem backend change.
- **RNF-05.** A11y: RF-01 ErrorBoundary fallback com `role="alert"`. RF-04 X button mantem accessibility shadcn (aria-label).
- **RNF-06.** Perf: RF-05 condicional ao profiler. Outros RFs sem impacto perf.
- **RNF-07.** Sem mudanca de design tokens. RF-02 cn() migration visual identica. RF-04 padding (se aplicado) cosmetic only.

---

## 5. Open Questions

### Q-A — RF-01 ErrorBoundary scope: capturar so render errors ou tambem effect errors?
- React ErrorBoundary captura render errors by-default; effect errors (useEffect throw) NAO sao capturados.
- Para LessonPickerDialog, `useQuery` "No QueryClient" throw acontece em render (no hook). Boundary basico cobre.
- Recomendacao: usar ErrorBoundary minima (so render errors). Sem `componentDidCatch` para effect errors.

### Q-B — RF-05 profiler quem roda: implementer ou founder?
- Founder ja confirmou em MP1.1: "implementer roda no green phase".
- Recomendacao: implementer roda + screenshot/log no PR. Founder valida output.

### Q-C — RF-05 split context (opcao B): quebrar `useAudioPlayer()` ou manter back-compat?
- Recomendacao: manter back-compat. `useAudioPlayer()` continua existindo como wrapper que le de ambos `useAudioState()` + `useAudioControls()`. Novos consumers usam hooks granulares.

### Q-D — RF-04 verify manual: founder confirma viewports a testar?
- Default: 375 (mobile) / 768 (tablet) / 1280 (desktop).
- Se founder pedir viewport adicional, adicionar pre-implementacao.

---

## 6. Riscos

1. **R-01** — RF-01 refactor quebra tests existentes que mockam `safeUseQuery`. Mitigar: preservar surface de mock no level de `useQuery` (mocks ja apontam para `@tanstack/react-query`, nao para wrapper).
2. **R-02** — RF-05 gate ambiguo. Mitigar: 2 runs profiler + threshold conservador (20 re-renders/s).
3. **R-03** — RF-04 verify revelar problema em viewport nao testado. Mitigar: testar 3 viewports comuns por default; documentar limitacao no PR.
4. **R-04** — RF-01 ErrorBoundary local engole erro real de bug (mascaramento). Mitigar: ErrorBoundary loga console.error antes do fallback (lesson #9).

---

## 7. Out-of-Scope

- **Feature nova.** MP2 (Spotify), MP3 (floating icon), queue de reproducao.
- **Backend changes.** Zero mudanca em `server/routes/library.ts`.
- **Refactor `LessonViewer.tsx` / `PodcastPlayer.tsx`.** Continuam como estao.
- **Novos design tokens.** Visual mantido.
- **Migrar outros consumers de `safeUseQuery`.** RF-01 e scoped a LessonPickerDialog.
- **Auditar `cn()` em outros componentes do MiniPlayer.** RF-02 e scoped a `MiniPlayerBar:189`.
- **Implementar excecao `data:image/png` em sanitizeCoverUrl.** RF-03 e doc-only; excecao vira em MP2 se Spotify pedir.
- **CSP `img-src` audit.** Fora do escopo (sprint security dedicada).

### Out-of-Scope ADR

**Nenhum ADR novo necessario.** MP1.2 e consolidacao, nao decisao arquitetural nova. Updates aos ADRs vivos:

- **ADR-187 (`AudioSourceEngine` abstraction):** sem mudanca.
- **ADR-188 (`MiniPlayer displayMode FSM + z-index`):** addendum apenas se RF-05 splittar context (opcao B) ou se profiler measurement for documentado (qualquer gate result).

### Diagramas existentes — status

- `Docs/architecture/diagrams/mini-player-1/autoplay-sequence.mermaid` — **sem update**.
- `Docs/architecture/diagrams/mini-player-1/displayMode-state-machine.mermaid` — **sem update**.
- Sem diagrama novo (so consolidacao).

---

## 8. Files Afetados (resumo)

```
client/src/
  components/
    audio-player/
      LessonPickerDialog.tsx          [RF-01 — refactor safeUseQuery + ErrorBoundary local]
      MiniPlayerBar.tsx               [RF-02 — cn() helper]
      VolumeControl.tsx               [RF-05 cond — memo OU split consumer]
      SpeedControl.tsx                [RF-05 cond — memo OU split consumer]
  contexts/
    AudioPlayerContext.tsx            [RF-05 cond B — wrapper compoe ambos]
    AudioStateContext.tsx             [RF-05 cond B — NOVO]
    AudioControlsContext.tsx          [RF-05 cond B — NOVO]
  lib/
    audio-engine/
      sanitizeCoverUrl.ts             [RF-03 — JSDoc policy + security]

Docs/
  architecture/
    decisions/
      188-mini-player-displaymode-fsm.md  [RF-05 — addendum measurement OU split]

tests/
  client/
    mini-player-1.2/                  [RF-01 + outros — red phase]
    mini-player-1.1/
      AudioContext.split.test.tsx     [RF-05 cond B — unskip 4 tests]
```

---

## 9. Cenarios de Teste (high-level — test-writer detalha)

### Happy Path
- [ ] RF-01: dialog com `QueryClientProvider` ativo → render normal, lista carrega.
- [ ] RF-02: cover className aplicada via `cn()`, cover gira quando `isPlaying && !reducedMotion`.
- [ ] RF-03: JSDoc presente, tsc + eslint exit 0.
- [ ] RF-04: verify manual screenshots OK em 3 viewports.
- [ ] RF-05: profiler executado, decisao documentada em ADR-188 addendum.

### Edge Cases
- [ ] RF-01: dialog SEM `QueryClientProvider` → ErrorBoundary captura, renderiza fallback `role="alert"`, sem crash.
- [ ] RF-01: refactor preserva tests MP1.1 (199 MP1 + 55 MP1.1 verdes).
- [ ] RF-02: `isPlaying=false || reducedMotion=true` → classe `animate-spin-slow` ausente.
- [ ] RF-05 (se gate passa opcao A): React.memo comparator nao engole update relevante (test atualizar `volume` re-renderiza VolumeControl).
- [ ] RF-05 (se gate passa opcao B): `useAudioPlayer()` back-compat (test legacy consumer continua funcionando).

### Regressao MP1 + MP1.1
- [ ] Autoplay sequencial funciona (RF-05 MP1).
- [ ] Media Session API ativa (D17 MP1).
- [ ] Fullscreen handler (D22 MP1).
- [ ] sanitizeCoverUrl bloqueia URLs invalidas (RF-02 MP1.1).
- [ ] Radix Dialog Esc + focus trap (RF-05 MP1.1).
- [ ] LibraryAudioDriver.destroy libera src (RF-07 MP1.1).
- [ ] VolumeControl slider hover fecha apos 200ms (RF-08 MP1.1).
- [ ] LessonPickerDialog lazy fetch `/api/library/courses/:slug` (RF-01 MP1.1).

---

## 10. Pipeline TDD

```
pm-spec (este doc)
  ↓
system-architect
  → verifica scope de RF-01 (grep outros consumers de safeUseQuery)
  → confirma gate de RF-05 (profiler steps + threshold)
  → zero ADR novo; possivel addendum ADR-188 (RF-05 measurement)
  ↓
test-writer (red phase)
  → 5 RFs com testes pre-acceptance
  → reuse lesson #38 setup.ts
  → RF-04 verify-only (sem red test, so checklist manual)
  → RF-05 gate-dependent (testes provisionados para opcao A e opcao B em arquivos separados)
  ↓
implementer (green phase)
  → ordem ICE: RF-02 (one-liner) → RF-03 (doc) → RF-04 (verify) → RF-01 (refactor) → RF-05 (gate + impl OU skip)
  → RF-05: rodar profiler ANTES; PASS opcao A/B ou SKIP definitivo
  → tests verdes
  ↓
/simplify
  → DRY pos-impl (ErrorBoundary local — verificar reuso)
  ↓
reviewer
  → 1-2 rodadas esperadas
  → R2 target: APPROVED ou APPROVED-WITH-NITS
  ↓
commit + push origin/main
```

---

## 11. Definition of Done

- [ ] 5 RFs implementados (RF-04 verify ok ou fix aplicado; RF-05 PASS opcao A/B ou documentado SKIP).
- [ ] 100% acceptance criteria checados.
- [ ] Baseline MP1 + MP1.1 tests verdes (199 + 55 + 218 + 3213).
- [ ] Novos tests MP1.2 verdes.
- [ ] TSC exit 0.
- [ ] Build exit 0.
- [ ] Reviewer APPROVED (com ou sem NITs).
- [ ] Commit em main + push.
- [ ] Memory file `session_2026-05-22-mini-player-1.2-shipped.md` criado.
- [ ] ADR-188 addendum apenas se RF-05 produzir mudanca documentavel.
- [ ] Status Tracker atualizado (Mini Player 1.2 — SHIPPED).
