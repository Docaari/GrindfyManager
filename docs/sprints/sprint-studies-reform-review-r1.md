# Review R1 — Sprint Studies-Reform

**Data:** 2026-05-01
**Branch:** `feature/studies-page-reform` (worktree `B:\grindfy-studies-reform`)
**Commits revisados:** `dff6afa..HEAD` (4 commits, 51 arquivos, +6004 / -965 linhas)
**Veredicto:** **MUDANCAS NECESSARIAS** (1 CRITICAL + 5 HIGH + 6 MEDIUM bloqueiam producao)

---

## Resumo Executivo

A sprint entrega um shell solido (sidebar/bottom-nav/wizard/dashboard/recs) com testes verdes,
mas tem **1 bug CRITICO de protocolo cliente-servidor** (uso incorreto da assinatura de
`apiRequest` quebra revisao de spots e bump de streak em producao) e **5 issues HIGH**
incluindo metodos de storage inexistentes, endpoints backend nao implementados que o
frontend assume disponiveis, e um `useEffect` de resize que tem leak em condicao nula.

A causa raiz do CRITICAL eh exatamente o anti-pattern da lesson #3 do CLAUDE.md
("mocks idealizados") — o test mock foi escrito com `(url, opts)` enquanto a funcao real
eh `apiRequest(method, url, data)`. O proprio comentario no codigo admite a divergencia
("Test fixture mocks apiRequest com (url, opts). Producao usa apiRequest(method, url, body)").

---

## Issues

### [CRITICAL] `apiRequest` invocado com assinatura errada — POST/PATCH quebram em producao
**Arquivos:**
- `client/src/components/studies/SpotsView.tsx:124-128`
- `client/src/hooks/useBumpStudyStreak.ts:74-76`
**Categoria:** Correcao
**Confianca:** Alta

`apiRequest` em `client/src/lib/queryClient.ts:39` tem assinatura
`(method: string, url: string, data?: any, headers?)`. As duas chamadas da sprint passam
`(url, opts)`:

```ts
// SpotsView linha 124
return await (apiRequest as any)(url, {
  method: 'PATCH',
  body: { themeId: vars.themeId, reviewedAt: new Date().toISOString() },
});

// useBumpStudyStreak linha 74
const data = await (apiRequest as any)('/api/study/streak/bump', {
  method: 'POST',
});
```

Em producao isso resulta em:
- `method = '/api/starred-hands/<id>/review'` (URL como verbo HTTP — fetch rejeita)
- `url = { method: 'PATCH', body: ... }` (objeto serializado pelo fetch como `[object Object]`)
- CSRF header nao eh setado (porque `method !== 'GET'` falha — `'/api/...'` parece truthy mas o
  header `X-CSRF-Token` so vai se `csrfToken` truthy E method nao for GET, mas o request
  ja vai estar quebrado antes)

Os testes passam porque o mock em `SpotThemeLinkButton.test.tsx:32` aceita qualquer shape:

```ts
apiRequest: (...a: any[]) => apiRequestMock(...a),
```

E a implementacao do mock em `linha 85` espelha a assinatura **errada**: `async (url, opts)`.

**Impacto:** Toda a feature de "vincular spot a tema" e toda atualizacao de streak (RF-05 + RF-12)
**falham silenciosamente em producao**. Spots nunca sao marcados como revisados e a streak
sempre cai pro fallback localStorage (que nao sincroniza entre dispositivos).

**Sugestao:** Ou (a) trocar para a forma correta `apiRequest('PATCH', url, body)` e
`apiRequest('POST', '/api/study/streak/bump')`; ou (b) escrever um wrapper helper
`apiRequestWithOpts(url, { method, body })` que faz a traducao internamente. Atualizar os
testes para usar a assinatura real do mock (lesson #3). Documentar no proprio mock que
ele esta espelhando a assinatura de producao.

---

### [HIGH] Storage methods chamados via `(storage as any)` nao existem no Storage interface
**Arquivos:**
- `server/routes/study-theme-spot-links.ts:44, 54, 64, 110, 120, 152`
- `server/services/studyRecommendationsService.ts:176-182`
- `server/coachTools/readThemeWithLinkedSpots.ts:76, 78, 89, 90`
**Categoria:** Correcao
**Confianca:** Alta

`grep` em `server/storage.ts` para `getStudyTheme`, `getStudyThemeByName`,
`getStudyTabsByTheme`, `getLinkedSpots`, `linkSpotToTheme`, `unlinkSpotFromTheme`,
`getStatsLeaks`, `getStaleSpots`, `getDormantThemes` retorna **zero** matches. Esses
metodos foram referenciados via `(storage as any).method(...)`, o que silencia o type checker
mas nao cria as implementacoes.

Em runtime, qualquer rota nova vai estourar `TypeError: storage.getStudyTheme is not a function`.
Os testes passam porque `tests/routes/study-theme-spot-links.test.ts` mocka o storage inteiro.

**Impacto:** As rotas `POST /api/study/theme-spot-links`, `GET /api/study-themes/:id/linked-spots`,
`DELETE /api/study/theme-spot-links/:linkId`, `GET /api/study/recommendations` e a coach tool
`read_theme_with_linked_spots` estao **100% quebradas em producao**. Migration aplicada,
schema correto, mas o data layer nao foi implementado.

**Sugestao:** Implementar os metodos faltantes em `server/storage.ts` usando Drizzle
queries reais sobre `studyThemeSpotLinks`, `studyThemes`, `studyTabs` e `starredHands`.
Adicionar a interface `IStorage` (em torno de linha 478 onde `getStarredHand` esta). Remover
todos os `as any` apos implementacao para que TS cubra futuras divergencias. Adicionar um
teste de smoke "boot e bate em uma rota real com DB de teste" para detectar essa classe
de bug sem precisar de mocks.

---

### [HIGH] Endpoints frontend-only — `/api/study/streak`, `/api/study-snapshots`, `/api/dashboard/leaks/{active,delta}`, `/api/dashboard/insights/week` nao existem
**Arquivos:** (consumidores)
- `client/src/components/studies/StudyStreakBadge.tsx:99` (`/api/study/streak`)
- `client/src/hooks/useBumpStudyStreak.ts:74` (`/api/study/streak/bump`)
- `client/src/components/studies/dashboard/StudiesDashboard.tsx:51-89` (insights/week, streak, recommendations)
- `client/src/components/studies/StatsView.tsx:31` (`/api/dashboard/leaks/active`)
- `client/src/components/studies/ThemesView.tsx:55` (`/api/dashboard/leaks/delta`)
- `client/src/components/studies/onboarding/OnboardingWizard.tsx:78-80` (`/api/study-snapshots`)
**Categoria:** Correcao
**Confianca:** Alta

`grep -rn "study/streak\|study-snapshots\|leaks/active\|leaks/delta\|insights/week" server/`
retorna zero. O frontend faz queries para 6 URLs que **nenhuma rota implementa**. Como cada
queryFn tem fallback `try/catch` retornando array vazio / objeto default, o frontend NAO
QUEBRA visualmente — ele apenas renderiza a UI vazia para sempre.

**Impacto:**
- Streak badge sempre mostra 0 dias (cai pro localStorage que so atualiza apos `/api/study/streak/bump`,
  que **tambem nao existe**, entao cai pro fallback de fallback — o `bumpLocalStreak` so
  conta dias localmente).
- Botao "Sugerir temas baseado em leaks" no StatsView **fica permanentemente disabled**
  (linha 41: `hasLeaks = (leaks?.length ?? 0) > 0`; leaks sempre `[]`).
- Filtro "Sugerido" nos cards de tema nunca aparece (delta sempre `0 > -5` falso).
- Dashboard mostra `0 temas abertos / 0 spots revisados / 0.0h estudadas` para todo
  usuario para sempre.
- OnboardingWizard pode pular incorretamente para "tem dados" se `themes` ou `spots` estiverem
  preenchidos, mas o test de `snapshots >= 1` nunca dispara — bug mascarado.

**Sugestao:** Decidir explicitamente: ou (a) adicionar o backend desses 6 endpoints a este
sprint antes do merge, ou (b) marcar a UI como WIP / atras de feature flag e remover do
shell ate o backend estar pronto. A solucao que **NAO** funciona eh a atual ("frontend
silencioso, parece estar funcionando"). Documentar como debt explicito em
`memory/studies_reform_pending_endpoints.md` se for adiar.

---

### [HIGH] `useEffect` de resize com cleanup retornado em branch condicional viola Rules of Hooks
**Arquivo:** `client/src/pages/Studies.tsx:95-104, 107-119`
**Categoria:** Correcao
**Confianca:** Alta

```ts
useEffect(() => {
  function handleResize() { setBreakpoint(detectBreakpoint()); }
  handleResize();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);  // <- cleanup so existe se window
  }
  // <- branch sem return: useEffect retorna undefined (OK em si)
}, []);
```

Tecnicamente o React aceita `undefined` como retorno valido. O problema real eh: se o componente
re-roda no client durante hydration (SSR -> client), na primeira render `typeof window === 'undefined'`,
o effect roda mas listener NUNCA eh registrado. Depois no client, o effect ja rodou (deps `[]`),
nunca mais roda — entao **o resize listener nunca eh registrado**.

Mesmo problema em linha 107-119 (Cmd+K).

**Impacto:** Em build SSR (Vite SSR ou pre-render), o app perde o handler de resize (sidebar
nunca vira bottom-nav em mobile depois de resize) e o atalho Cmd+K nao funciona. Em pure CSR
(estado atual do projeto, o `window` esta sempre disponivel) o problema nao se manifesta.
Mas se algum dia ligarmos SSR, vira bug com sintoma silencioso.

**Sugestao:** Inverter o teste:

```ts
useEffect(() => {
  if (typeof window === 'undefined') return;
  const handleResize = () => setBreakpoint(detectBreakpoint());
  handleResize();
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

Ou usar `useSyncExternalStore` para casamento canonico com matchMedia. Aplica-se aos dois
useEffect.

---

### [HIGH] `LinkSpotToThemeDropdown` espelho `<select>` sr-only com onChange duplo
**Arquivo:** `client/src/components/studies/workflow/LinkSpotToThemeDropdown.tsx:75-89`
**Categoria:** Correcao + acessibilidade
**Confianca:** Media

O componente renderiza dois controles que invocam o mesmo `onChange`: a lista de botoes
visiveis E um `<select>` sr-only com `aria-hidden tabIndex={-1}`. Mas:

1. `aria-hidden + sr-only` torna o select invisivel para screen readers — entao o "espelho
   para acessibilidade" nao acessa nada (sr-only **mostra** ao reader, aria-hidden **esconde**;
   os dois juntos = sem efeito util).
2. Se um teste E2E usar tab-keyboard, o select nao recebe foco (tabIndex -1) — a navegacao
   por teclado fica restrita aos botoes, sem keyboard listing/option-pickup nativo.
3. Risco de double-fire: se algum teste/codigo dispara `change` no select, `onChange` corre,
   o estado atualiza e re-renderiza — sem incidente, mas o select vai estar sempre
   defasado vs `value` ate o re-render seguinte (ele nao eh controlled da mesma forma
   que os botoes).

**Impacto:** Acessibilidade promete e nao entrega. Em SR (NVDA/JAWS), o usuario so escuta
"Vincular a tema" (label) seguido de uma lista nao anunciada de botoes — sem indicacao de
quantas opcoes ha ou qual eh a selecionada.

**Sugestao:** Remover o `<select>` sr-only inteiro e adicionar `role="listbox"` + `role="option"`
+ `aria-selected` aos botoes da lista. Ou usar `<RadioGroup>` do Radix (ja na stack).

---

### [HIGH] Routes faltam rate limiting em endpoints de mutacao
**Arquivos:** `server/routes/study-theme-spot-links.ts:170-186` (registro)
**Categoria:** Seguranca
**Confianca:** Alta

`POST /api/study/theme-spot-links`, `DELETE /api/study/theme-spot-links/:linkId` sao mutacoes
autenticadas mas **sem rate-limit**. CLAUDE.md secao 8 ("Rate limiting: express-rate-limit em
auth/bankroll/coach") nao cita estudos, mas eh o padrao da casa: starred-hands tem rate-limit
(linha 476: `keyGenerator: (req) => req.user?.userPlatformId`).

**Impacto:** Usuario malicioso pode spammar links theme<->spot ate exaurir IDs nanoid,
encher disco com `reasoning_text: "<2KB string>"` x N, ou bagunar telemetria. Cada call dispara
um `console.log [telemetry]` (linha 72), entao logs explodem rapidamente.

**Sugestao:** Aplicar `rateLimit({ windowMs: 60_000, max: 60, keyGenerator: req => req.user?.userPlatformId || req.ip })`
aos POST e DELETE. Considerar limit menor para POST (15-20/min). GET pode ficar sem limit
ou com limit generoso.

---

### [MEDIUM] `pushRecent` em QuickSearchPalette: sem cap de tamanho do label nem validacao
**Arquivo:** `client/src/components/studies/QuickSearchPalette.tsx:38-47`
**Categoria:** Seguranca / Storage
**Confianca:** Media

```ts
function pushRecent(item: { type: string; id: string; label: string }) {
  const list: any[] = raw ? JSON.parse(raw) : [];
  const next = [item, ...list.filter((x) => x?.id !== item.id)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}
```

Theme name pode ter tamanho arbitrario — se o backend nao limitar `name`, um nome muito
grande inflar localStorage rapidamente. Tambem nao ha sanitizacao do `parsed` JSON.parse
(se algum dia outro modulo escrever na mesma chave com shape diferente, `x?.id !== item.id`
roda em qualquer coisa, mas se a entrada for `null` o `slice(0,8)` ignora silenciosamente).

**Impacto:** Storage quota exception (raro, ~5MB) ou comportamento inesperado se a chave for
manipulada externamente.

**Sugestao:** Truncar `item.label` em 100 chars antes de gravar. Adicionar `Array.isArray(list)`
guard antes do filter. Considerar usar `useEffect` + try/catch wrapper compartilhado.

---

### [MEDIUM] `findSuggestedThemeId` — heuristica fuzzy fragil, pode dar falsos positivos
**Arquivo:** `shared/spot-theme-mapping.ts:70-83`
**Categoria:** Correcao
**Confianca:** Media

```ts
if (
  nameSlug === tagSlug ||
  nameSlug.includes(tagSlug) ||
  tagSlug.includes(nameSlug) ||  // <- FALSO POSITIVO LATENTE
  themeTags.includes(tagSlug)
) {
```

O terceiro caso (`tagSlug.includes(nameSlug)`) eh perigoso. Se o usuario tem um tema chamado
"a" (nameSlug = "a"), QUALQUER tag com a letra "a" da match (ex: tag "ip_vs_bb" -> includes
"a"? nao; tag "calling_ranges" -> includes "a"? sim). Pior caso: tema "icm" (nameSlug = "icm")
da match com a tag "icm_advanced" -> mas tambem da match com qualquer tema cujo nome contem
"icm"... ok aqui eh segura porque o operador `includes` eh string-contains nao token-contains.

Outro problema: se tema chama-se "b" entao nameSlug = "b" (1 char) e a tag "bluff_strategy"
includes "b" -> match indevido.

**Impacto:** Sugestao de tema errada quando usuario tem temas com nomes muito curtos. Nao
quebra nada, mas afeta UX da feature D5 (RF-05).

**Sugestao:** Remover o caso `tagSlug.includes(nameSlug)` — soa simetrico mas o assimetrico
correto eh "name contains tag", nao "tag contains name". Adicionar threshold minimo de 3 chars
no name antes de aplicar fuzzy.

---

### [MEDIUM] Lazy toast em SpotsView — race entre primeiro click e dynamic import
**Arquivo:** `client/src/components/studies/SpotsView.tsx:28-92`
**Categoria:** Correcao / UX
**Confianca:** Media

```ts
let _toastFn: ToastFn = () => {};   // <- module-level mutable singleton
let _toastLoadPromise: Promise<void> | null = null;
function ensureToastLoaded(): void {
  if (_toastLoadPromise) return;
  _toastLoadPromise = import('@/hooks/use-toast').then(...).catch(...);
}
function emitToast(opts: any): void { _toastFn(opts); }
```

`ensureToastLoaded()` eh chamado durante o render (linha 91) — sem await. Se o usuario clicar
"Salvar revisao" **antes** do dynamic import resolver (network slow / bundle splitting), o
toast vira no-op silencioso. O usuario salva o spot mas nao ve confirmacao nem erro.

Tambem: module-level mutable state significa que multiplas instancias de SpotsView (rotas
distintas? portal?) compartilham o mesmo `_toastFn`. Se uma instancia carrega antes que outra
re-monte, ok — mas o pattern eh fragil.

**Impacto:** UX degradada em primeiro carregamento, especialmente em conexoes lentas. Comentario
no codigo sugere que isso eh para contornar TDZ em testes — pattern eh "test-driven shape"
em vez de "real-world correctness".

**Sugestao:** Voltar ao import estatico `import { useToast } from '@/hooks/use-toast'` e
arrumar o test mock para usar `vi.hoisted()` (que eh exatamente o que existe para esse caso).
Se nao for possivel, fazer `await ensureToastLoaded()` antes do mutate, e usar um state
boolean para mostrar fallback inline ate o import resolver.

---

### [MEDIUM] `parseSearch` nao trata fragmento `#` — pode bagunar em URLs com hash
**Arquivo:** `client/src/lib/url.ts:8-12`
**Categoria:** Correcao (edge case)
**Confianca:** Media

```ts
export function parseSearch(path: string): URLSearchParams {
  const idx = path.indexOf('?');
  if (idx < 0) return new URLSearchParams();
  return new URLSearchParams(path.slice(idx + 1));
}
```

Se o location chegar como `/estudos/spots?showAll=1#section`, o `URLSearchParams` recebe
`showAll=1#section` — `URLSearchParams` parseia o `#` como parte do valor: `params.get('showAll')`
retorna `'1#section'`, nao `'1'`. O check `params.get('showAll') === '1'` falha silenciosamente
(ThemesView linha 42, SpotsView linha 85).

**Impacto:** Filtros via URL falham se o caller passar fragmento. Wouter normalmente nao
expoe fragmento em `useLocation()`, mas qualquer codigo que faca `navigate('/estudos/spots?showAll=1#xxx')`
via `<a href>` ou similar quebra.

**Sugestao:** Strip do hash: `const stripped = path.split('#')[0]; const idx = stripped.indexOf('?');`.

---

### [MEDIUM] OnboardingWizard salva `COMPLETED_KEY` em side effect dentro de `useEffect`
**Arquivo:** `client/src/components/studies/onboarding/OnboardingWizard.tsx:99-104`
**Categoria:** Correcao / state machine
**Confianca:** Media

```ts
useEffect(() => {
  if (open && hasData) {
    setCompleted();      // <- localStorage write
    onOpenChange(false); // <- parent state mutation
  }
}, [open, hasData, onOpenChange]);
```

Setar localStorage como side effect baseado em dados que vem de `useQuery` significa que se
o usuario cancelar (close manualmente) e voltar com `?force=onboarding`, mas tiver dados,
o wizard fecha automaticamente sem o usuario ver. Mais grave: as 3 queries (`themes`, `spots`,
`snapshots`) tem `enabled: open`, entao quando `open=true` elas disparam, o effect roda
**enquanto loadings** com `hasData=false` (todas `[]` por default), depois resolvem e o
effect roda **de novo** com `hasData=true`, fechando o wizard. Mas **se** o usuario foi
rapido e clicou "Proximo" durante o loading, o wizard fecha em cima da intencao dele.

Nota: `/api/study-snapshots` nao existe (HIGH-3), entao `snapshots` sempre `[]`. O `hasData`
fica baseado so em `themes + spots`, que eh o que importa. Mas ainda tem o race com loading.

**Impacto:** Wizard pode fechar abruptamente em meio de interacao do usuario.

**Sugestao:** So fechar se `themesQ.isSuccess && spotsQ.isSuccess` (i.e. apos o loading
terminar). Ou nao verificar `hasData` no shell — invocar o wizard a partir de `Studies.tsx`
so depois das queries terminarem.

---

### [MEDIUM] `studyRecommendationsService` — filtro de stale_spots nao exclui spots ja vinculados
**Arquivo:** `server/services/studyRecommendationsService.ts:177` (comentario menciona, codigo nao confirma)
**Categoria:** Correcao
**Confianca:** Media

O comentario do schema (linha 2030) diz "studyRecommendationsService (RF-06) para excluir
spots ja vinculados de stale_spots". O service chama `(storage as any).getStaleSpots(userId, 7)`
e nao tem garantia de que o storage filtra. Como o storage method nao existe (HIGH-2), nao
podemos validar. **Se** o eventual implementador esquecer o filtro, recommendations vao
sugerir revisao de spots ja revisados/vinculados — duplicidade na UX.

**Impacto:** Recommendations duplicadas ou sugerindo trabalho ja feito.

**Sugestao:** Documentar contrato no JSDoc de `getStaleSpots`: "MUST exclude spots that have
a row in study_theme_spot_links". Adicionar teste de integracao que cria 1 spot, vincula,
chama `getStaleSpots` e espera 0 results.

---

### [INFO] Dead code de cleanup em StudiesDashboard — empty CTA com `className="hidden"`
**Arquivo:** `client/src/components/studies/dashboard/StudiesDashboard.tsx:139-146`

```tsx
<button
  type="button"
  data-testid="studies-dashboard-empty-cta"
  onClick={() => navigate('/estudos/temas')}
  className="hidden"
>
```

Botao invisivel renderizado so para atender um teste que olha pelo testid. Anti-pattern
da lesson #2: testid deve ser estavel **em elemento real**, nao em fantasma. Substituir
por testid no `<EmptyState ctaLabel>` ou ajustar o teste para procurar pelo testid do
EmptyState (`empty-state-cta`).

Mesmo padrao em `ThemesView.tsx:131`:
```tsx
<div data-testid="themes-empty" className="hidden" aria-hidden />
```

---

### [INFO] `useEffect` deps incompletas em useBumpStudyStreak (false positive — mutation eh stable)
**Arquivo:** `client/src/hooks/useBumpStudyStreak.ts:97-103`

`onSuccess` invalida queries — qc instance referenciado de outside-scope. Isso eh ok porque
TanStack `useQueryClient` retorna referenecia estavel. Apenas comentario para futuro:
considerar mover invalidation para um custom hook `useStudyActivityInvalidation` que ja
existe e centralizar.

---

### [INFO] `as any` espalhado pelo backend reduz seguranca de tipo
**Arquivos:** 11 ocorrencias em `server/routes/study-theme-spot-links.ts`, 7 em `useBumpStudyStreak.ts`,
5 em `readThemeWithLinkedSpots.ts`, 3 em `studyRecommendationsService.ts`.

Se `IStorage` tivesse os tipos corretos (HIGH-2), nenhum desses `as any` seria necessario.
A divida cresce linearmente com cada nova feature — limpar agora eh barato.

---

### [INFO] Magic strings duplicadas
**Arquivos:**
- `STREAK_LOCAL_KEY` em `useBumpStudyStreak.ts:15` E em `StudyStreakBadge.tsx:26` (mesmo valor)
- `COMPLETED_KEY` em `OnboardingWizard.tsx:17` E `Studies.tsx:42` (`ONBOARDING_KEY`, mesmo valor)

Centralizar em um `client/src/lib/studies-storage-keys.ts` para evitar drift.

---

### [INFO] `localStorage` sem feature detection em alguns helpers
**Arquivos:** `OnboardingWizard.tsx:25-51` (3 helpers), `useBumpStudyStreak.ts:23-39`.

Todos tem `try/catch` (bom), mas a maioria so checa availability dentro do try. `Studies.tsx`
faz o mesmo padrao. Considerar um helper compartilhado `safeLocalStorage.get/set/remove`
em `client/src/lib/storage.ts` para reduzir boilerplate (8+ replicacoes do mesmo try/catch
na sprint).

---

### [NIT] `isStudiesNavItemActive` pode dar match cruzado
**Arquivo:** `client/src/components/studies/navItems.ts:39-45`

```ts
return location === path || location.startsWith(`${path}/`) || location.startsWith(`${path}?`);
```

Se algum dia tivermos `/estudos/temas` e `/estudos/temas-v2`, `location='/estudos/temas-v2'`
nao ativa nem um nem outro (o startsWith eh seguido de `/` ou `?`, entao OK). Atual eh seguro.
Mero alerta para futuro.

---

### [NIT] `viewFromPath` usa `startsWith('/estudos/dashboard')` mas tambem trata path raiz
**Arquivo:** `client/src/pages/Studies.tsx:67-77`

`/estudos/dashboardx` cairia em `dashboard`. Trocar para `=== '/estudos/dashboard' ||
.startsWith('/estudos/dashboard/') || .startsWith('/estudos/dashboard?')`. Mero polish.

---

## Cobertura de Testes

| Area | Status | Nota |
|---|---|---|
| Happy path (RF-01..06, 09, 10, 11, 12) | Coberto | 147 testes red->green em 18 arquivos |
| Validacao de input (Zod nos handlers) | Coberto | Schema parse com try/catch + 400 |
| Regras de negocio (cross-user isolation) | Coberto | tests/routes/* tem casos 403 |
| Edge cases | Parcial | Falta: apiRequest assinatura real, storage methods reais, endpoint shapes do backend nao implementado |
| Erro de servico externo | Parcial | `Promise.allSettled` em service tem teste; rotas tem 500 fallback testado |
| Smoke test boot real (sem mocks) | **Ausente** | Esta eh a lacuna que mascarou HIGH-1, HIGH-2, HIGH-3 |

---

## Pontos Positivos

- **Cross-user isolation rigorosa** em todos os 3 handlers de routes (theme.userId match,
  spot.userId match, 403 com mensagens claras). RF-08 entregou seguranca de verdade.
- **Coach tool tier-gated** corretamente (`gateByTier: ['pro', 'premium', 'admin']`),
  registry consome o gating em `coachTools/registry.ts:100`. Free tier nao acessa.
- **Promise.allSettled + lesson #9 logging** em `studyRecommendationsService` — falha de uma
  fonte nao bloqueia recommendations. Padrao excelente.
- **Hooks-first respeitado** em todos os componentes — useQuery/useState/useEffect ANTES
  de qualquer return condicional (Studies.tsx linhas 81-119, idem ThemesView/SpotsView).
- **Telemetria estruturada** em `study-theme-spot-links.ts:72` (shape consistente com
  lesson #3).
- **Schema migration limpa** com IF NOT EXISTS + rollback dedicado, indices apropriados
  (uq composto + tres single-col + indice parcial em `users.study_streak_days > 0`).
- **Single source of truth** para nav items (`navItems.ts`), evitando drift sidebar/bottomnav.
- **EmptyState component generico** com telemetria opcional via window.__telemetry — bem
  desacoplado.
- **Fallback localStorage** em `useBumpStudyStreak` e `StudyStreakBadge` permite uso offline
  (boa UX), com lesson #9 logging antes de cair pro fallback.

---

## Resumo

A sprint tem arquitetura solida (4 ADRs, schema bem desenhado, separation of concerns
limpa entre shell / dashboard / cards / workflow / hooks). Mas **a fase Green foi
declarada verde em cima de mocks que nao casam com producao** — o pattern explicitamente
documentado como anti-pattern na lesson #3 do CLAUDE.md.

Os 3 problemas dominantes sao todos sintomas do mesmo **gap de teste**: nenhum teste boot-up
real (sem mock de storage, sem mock de apiRequest). Os testes unitarios passaram porque
mockaram tudo abaixo do componente; o subsistema integrado **nunca foi exercitado**.

**Bloqueadores para merge:**
1. CRITICAL-1: trocar assinatura de `apiRequest` ou criar wrapper.
2. HIGH-2: implementar storage methods reais (ou substituir por queries Drizzle inline).
3. HIGH-3: decidir se backend dos 6 endpoints frontend-only entra no sprint ou fica como
   feature flag.
4. HIGH-4: inverter check de `typeof window` em useEffects de Studies.tsx.
5. HIGH-5 (rate limit) e HIGH-6 (`<select>` sr-only) podem ser resolvidos rapido.

Recomendo:
- Voltar ao Implementer para resolver CRITICAL e HIGH-2/3 (provavel scope creep — pode ser
  uma sub-sprint dedicada de "studies-reform-backend").
- Adicionar smoke test boot que sobe o express e bate em uma rota real com DB local — um
  unico teste teria pego HIGH-1 e HIGH-2.
- Apos correcoes, re-review focando nos pontos resolvidos.
