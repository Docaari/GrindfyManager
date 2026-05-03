# ADR-096 — Hero Prologue Routing Pattern: Wouter rota dupla `/curso/:slug/:lesson` (hero) + `/play` (player) com localStorage skip

- Status: Proposto
- Data: 2026-05-03
- Sprint: Bloco-A-Polish (RF-02 + RF-03 + D9)
- Decision owner: system-architect (formaliza founder D1+D9 da Spec Bloco-A-Polish)
- Related: ADR-092 (iframe sandbox), ADR-094 (article-bundle), ADR-097 (telemetry events), ADR-098 (animation strategy)
- Spec: `Docs/specs/biblioteca-spec-bloco-a-polish.md` RF-02 + RF-03

---

## Contexto

Sprint Biblioteca-2 entregou o `LessonViewer` fim-a-fim (player + tabs + iframe sandbox + sticky bar + watermark). A rota `/biblioteca/curso/:courseSlug/:lessonSlug` carrega o player diretamente — usuario clica num item de aula em `CourseDetailPage` e cai instantaneamente nas tabs Video/Podcast/Article.

Founder validou conteudo Bloco A LIVE em alpha. Auditoria UX (`Docs/strategy/biblioteca-bloco-a-launch.md` §6) identificou que "abrir aula = transacional" reduz engajamento — falta o **momento Netflix** entre clique e player: hero cinematic com capa, titulo, subtitle, chips meta, CTAs primarios. Investimento previo de 3 segundos na hero aumenta completion bias (psicologia: usuario que olha capa fica 5x mais propenso a engajar).

Spec Bloco-A-Polish RF-02 define que abrir uma aula NAO deve mais cair direto no player. Deve cair num `LessonHero` cinematic; click "Iniciar aula" cross-fade pro player.

Em revisita (2a, 3a vez na mesma aula), forcar hero seria UX hostil — usuario quer voltar onde parou rapidamente. Spec D9 + RF-03 definem skip via localStorage flag canonica `library:lesson:{lessonId}:hero-seen=true`.

Tres caminhos arquiteturais para implementar a divisao hero vs player:

1. **Single route + state condicional**: rota `/biblioteca/curso/:slug/:lesson` mantem; pagina renderiza hero ou player baseado em estado interno (e.g. `useState('hero' | 'player')` + flag localStorage). Toda navegacao se mantem em uma URL — back button volta pra CourseDetailPage.
2. **Dual route, hero default**: rota generica carrega hero; sub-rota `/play` carrega player. URL `/play` distinguivel — deep link, share, telemetria URL-based clarissima.
3. **Modal hero overlay**: hero vira modal full-screen sobre o player ja montado em background. User clicar "Iniciar" fecha modal.

Forcas:
- **Deep linking**: founder + alpha tester querem compartilhar URL especifica do player ("manda esse link pra ele ver o A.4 direto").
- **Telemetria**: distinguir "hero visualizado" vs "player iniciado" via URL fica trivial em analytics (eventos por path).
- **Back button UX**: depois de iniciar aula, click back deve voltar pra CourseDetailPage (nao pro hero — hero ja foi visto).
- **localStorage flag**: revisita pula hero — implementacao deve ser simples, sem race condition entre setState e navegacao.
- **Pre-load do player**: cross-fade exige que player monte rapido; preload progressivo do bundle do player pode acontecer em paralelo ao hero animar.

---

## Opcoes Consideradas

### Opcao 1 — Single route + state condicional

**Pros:**
- Sem mudanca em `App.tsx` routing.
- Estado da pagina coeso em uma URL.
- Cross-fade trivial (mesma React tree).

**Contras:**
- Deep link `/biblioteca/curso/X/Y` ambiguo (hero ou player?).
- Telemetria URL-based confusa (mesma rota = 2 estados).
- Back button volta pra CourseDetailPage mesmo apos iniciar aula — entao revisitar hero so via cleanup manual de localStorage.
- Compartilhar URL "leva a aula direto" exige flag URL `?play=true` (gambiarra).

### Opcao 2 — Dual route com `/play` sub-rota (ESCOLHIDA)

**Pros:**
- URL semanticamente clara: `/biblioteca/curso/X/Y` = hero, `/biblioteca/curso/X/Y/play` = player.
- Deep link share funciona: founder manda URL `/play` direto pra alguem que ja viu o hero.
- Telemetria URL-based natural (eventos `library:hero:viewed` em path `/Y`, `library:player:started` em path `/Y/play`).
- Back button funciona instintivamente: do player volta pro hero (se quiser); do hero volta pra CourseDetailPage.
- localStorage skip implementado com `setLocation('/play', { replace: true })` — replace evita poluir history.
- Wouter resolve ordem de declaracao — rota `/play` (4 segmentos) declarada apos `/lesson` (3 segmentos) NAO entra em conflito.

**Contras:**
- 1 rota nova em `App.tsx` (custo trivial).
- Cross-fade entre rotas exige Framer Motion AnimatePresence + `mode="wait"` (ADR-098 cobre).
- Direct URL `/play` sem ver hero antes — deve funcionar (deep link), aceitavel skipar prologue mesmo sem flag localStorage.

### Opcao 3 — Modal hero overlay

**Pros:**
- Player ja esta montado em background (cross-fade natural).
- Reusa Radix Dialog primitive.

**Contras:**
- Player montar em paralelo carrega audio + iframe sandbox em background — desperdica recursos pra usuario que vai pular hero.
- Animacao de fechar modal + revelar player em background nao eh "cross-fade" — eh slide ou fade simultaneo, perde fidelidade Netflix-style.
- localStorage skip = abrir modal e fechar imediatamente = flicker visivel.
- Modal eh padrao para acoes secundarias, nao para hero entry — quebra intencao semantica.

---

## Decisao

Escolhida **Opcao 2: dual route**. Wouter recebe duas rotas:

```tsx
<Route path="/biblioteca/curso/:courseSlug/:lessonSlug">
  <LessonHeroPage ... />
</Route>
<Route path="/biblioteca/curso/:courseSlug/:lessonSlug/play">
  <LessonViewerPage ... />
</Route>
```

`LessonHeroPage` (componente novo, NAO lazy-loaded — entry point critico) faz:
1. Fetch lesson via `useQuery('GET /api/library/lessons/by-slug/:courseSlug/:lessonSlug')`.
2. Em mount + lesson load, ler localStorage flag `library:lesson:{lesson.id}:hero-seen`.
3. Se flag `=== "true"` → `setLocation('/biblioteca/curso/:courseSlug/:lessonSlug/play', { replace: true })`. Replace evita poluir history (back button pula direto pra CourseDetailPage).
4. Se flag null → renderiza `<LessonHero {...} onStart={handleStart} onSkipIntro={handleSkip} />`.
5. Apos 1s de mount sem flag, escreve flag `"true"` + dispara `prologue_viewed` event (ADR-097).
6. `handleStart` / `handleSkip` disparam events + `setLocation('/play')` com cross-fade (ADR-098).

`LessonViewerPage` permanece lazy-loaded (ja eh no Spec 2). Direct URL `/play` carrega player sem passar pelo hero — comportamento esperado (deep link).

**Storage key canonica (D9):** `library:lesson:{lessonId}:hero-seen` = string `"true"`. Helper functions em `client/src/lib/library-hero-storage.ts` com try/catch silent (tolerante a localStorage indisponivel — private mode, quota cheia).

**Delay de 1s antes de marcar como "seen":** evita flag setada quando usuario clica back imediatamente (intent "abri por engano"). Race com click "Iniciar aula" antes de 1s resolvido por `onStart` handler que tambem chama `writeHeroSeenFlag` defensivamente.

---

## Consequencias

**Positivas:**
- URL semanticamente clara facilita deep link, share, telemetria, debug.
- Back button funciona instintivamente em ambas rotas.
- Skip via localStorage eh operacao instantanea (replace navigation), sem flicker.
- Cross-fade entre rotas via AnimatePresence (ADR-098) preserva fidelidade Netflix.
- Helpers de storage testaveis isoladamente (read/write/clear) — TDD-friendly.

**Negativas:**
- 1 rota nova em `App.tsx` — manutencao trivial.
- Multiple tabs com mesma aula podem race no flag (primeira tab a chegar 1s seta; segunda redireciona em sync). Race aceito — UX consequence eh "user vai direto pro player na 2a tab", ainda OK.
- localStorage manipulado externamente (DevTools) — usuario pode resetar flag e ver hero novamente. **Esperado** — aceitavel.
- Quota cheia → flag nao persiste; hero aparece em todo refresh. Corner case, aceitavel.

**Neutras:**
- LessonHeroPage NAO eh lazy (carrega imediato com bundle CourseDetailPage). Trade-off: bundle maior em ~3KB por componente, ganha 100ms em first paint do hero.
- Hero flag `hero-seen` nunca expira — usuario nao deve ver hero 2x da mesma aula. Se founder quiser "show hero again" feature, implementa botao em settings que limpa todas flags `library:lesson:*:hero-seen`.

---

## Confianca

**Alta.** Padrao dual-route eh idiomatico em SPAs (Wouter, React Router, Next.js). localStorage skip eh padrao Netflix/YouTube/Spotify. Storage key namespacing (`library:lesson:{id}:hero-seen`) segue convencao Grindfy ja existente (e.g. `coach:tier:locked`). Sem novos riscos.
