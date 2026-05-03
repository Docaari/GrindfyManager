# ADR-094 — Article bundle endpoint + postMessage protocol entre parent e iframe sandbox

- Status: Proposto
- Data: 2026-05-03
- Sprint: Biblioteca-2 (RF-04 + RF-06 + D8 + D9)
- Decision owner: system-architect
- Related: ADR-092 (iframe sandbox), ADR-093 (trusted bypass), ADR-074 (progress sync)
- Spec: `Docs/specs/biblioteca-spec-2.md` RF-04 + RF-06

---

## Contexto

ADR-092 escolheu iframe sandbox `allow-scripts` (sem
`allow-same-origin`) pra renderizar HTML rico Docari. Iframe vive
em **origin null**: nao acessa cookies, storage, DOM do parent.

Pra HTML interativo funcionar (resize dinamico do iframe, salvar
scroll-depth como progresso), precisa de **protocolo de mensageria
explicito** entre parent (LessonViewer / ArticleIframe) e child
(srcdoc com `lesson.js.transformed`).

Tres decisoes interconectadas:

1. **Como o parent entrega o bundle** (HTML + URLs assets +
   metadata) ao iframe.
2. **Cache busting** quando founder atualiza `article-styles.css`
   ou `article-scripts.js` (versao via hash query string).
3. **Protocolo postMessage** parent <-> child (resize, scroll-depth)
   com whitelist segura.

### Forcas

- **HTTP roundtrip count:** parent precisa de bundle eficiente —
  HTML + URLs assets em 1 fetch (vs 3 fetches separados pra
  bundle + CSS + JS).
- **Cache busting CSS/JS:** founder edita arquivos uma vez por
  sprint (~1x por mes); browsers devem cache 30d mas reagir a
  novas versoes.
- **Cache invalidation no client:** TanStack Query precisa
  invalidar cache do bundle quando assets mudam (sem refresh
  manual usuario).
- **postMessage XSS surface:** sandbox + same-origin = atacante
  pode forjar mensagens. Sandbox sem same-origin = forging
  blocked. Mas validacao `event.source` ainda eh requisito.
- **Anti-DoS no resize:** child malicioso (CVE futura) pode mandar
  postMessage com `height: Infinity` pra travar parent.
- **Throttle scroll-depth:** scroll fires 60x/s; PATCH endpoint ja
  tem throttle 5s server-side; client throttle 1s previne flood
  postMessage.
- **Schema do progress:** `library_progress` foi pensado pra
  video/audio em segundos. Article nao tem "duracao em segundos".
  Spec 2 D9 + RF-06 escolhem usar percent (0-100) como `lastPositionSeconds`
  e 100 como `totalDurationSeconds` (proxy contract).

## Opcoes Consideradas

### Opcao A: 3 fetches separados (HTML, CSS, JS) (rejeitada)

Parent pega HTML do `getLibraryLesson(id)`, monta srcdoc com
URLs hard-coded `/api/library/static/article-styles.css?v=hash`.
Child pega CSS via `<link>`, JS via `<script src>`.

- **Contras:**
  - **3 requests:** lesson + CSS + JS. CSS + JS cacheaveis 30d
    (OK), mas hash precisa vir de algum lugar (4o request pra
    `mediaStorage.computeHash`).
  - **Cache invalidation:** cliente nao sabe quando hash mudou
    (depende do server validar).
  - **TanStack Query** precisa de chave instavel pra detectar
    invalidation.
- **Rejeitada por:** UX inferior + complexidade de cache
  busting distribuido.

### Opcao B: Bundle endpoint dedicado retorna `{html, stylesUrl, scriptsUrl, version}` (ESCOLHIDA)

```
GET /api/library/lessons/:id/article-bundle
Auth: requireAuth + lesson access
Response 200:
{
  html: '<sanitized HTML>',
  stylesUrl: '/api/library/static/article-styles.css?v=abc123def456',
  scriptsUrl: '/api/library/static/article-scripts.js?v=789xyz012345',
  version: 'sha256(stylesHash + scriptsHash).slice(0, 16)',
  meta: {
    title: '...',
    learningObjectives: [...]
  }
}
```

- **Pros:**
  - **1 request** retorna tudo necessario pra montar srcdoc.
  - **Server computa hashes** das CSS/JS no momento do request
    (cache 5min em-memory pra evitar I/O em todo request).
  - **`version` unificado** combina hashes — TanStack Query usa
    como chave: `['library', 'lesson', id, 'article-bundle', version]`.
  - **Cache invalidation atomico**: founder reupload via RF-11
    troca hashes; proximo bundle request retorna `stylesUrl`/`scriptsUrl`/
    `version` novos; client invalida queries antigas.
  - **Auth + access check** centralizados (RF-04 D8).
  - **404 logica unificada**: lesson sem articleHtml retorna
    `article_not_available` (consistente).
  - **503 logica unificada**: assets staticos ausentes retorna
    `static_assets_not_uploaded` (founder esqueceu RF-11).
- **Contras:**
  - **Endpoint novo** — RF-04. Aceitavel.
  - **Hash computation cost**: ~5ms por arquivo CSS/JS (sha256 em
    Node). Cache em-memory 5min mitiga.
  - **Drift entre clients antigos** — apos reupload, clientes com
    bundle stale tem CSS/JS antigos. Cache 30d significa ate 30d
    de drift potencial. Mitigado: founder rerolha so quando
    necessario; UX worst-case = layout temporariamente estranho.

### Opcao C: WebSocket bidirecional (rejeitada)

Iframe abre WS pro parent; mensagens via WS em vez de postMessage.

- **Contras:**
  - **WS via iframe sandbox sem same-origin** nao consegue voltar
    pro parent (sandbox bloqueia).
  - **Over-engineering** — postMessage ja resolve.
- **Rejeitada por:** infraestrutura desnecessaria.

### Opcao D: HTML embedded com tudo inline (rejeitada)

Bundle retorna HTML com `<style>` + `<script>` ja inline (sem
URLs externas).

- **Contras:**
  - **Perda de cache 30d** — CSS/JS re-baixado a cada lesson view.
  - **HTML pesa 30KB+** vs ~12KB com URLs externas.
  - **Sem versionamento independente** de CSS/JS.
- **Rejeitada por:** performance e custo de banda inferiores.

## Decisao

**Adotar Opcao B: endpoint `GET /api/library/lessons/:id/article-bundle`
retorna `{ html, stylesUrl, scriptsUrl, version, meta }`.
Cache busting via query string `?v={hash12}`. Protocolo postMessage
parent <-> iframe com whitelist `'grindfy:library:resize'` +
`'grindfy:library:scroll'`.**

### Detalhes-chave

1. **Endpoint shape:**
   ```ts
   // server/routes/library-register.ts
   router.get('/api/library/lessons/:id/article-bundle',
     requireAuth,
     async (req, res) => {
       const lessonId = req.params.id;
       const userId = req.user!.userPlatformId;

       // Auth: lesson access check
       const access = await storage.findLessonAccess({
         userId, lessonId,
       });
       if (!access) {
         return res.status(401).json({ message: 'access_denied' });
       }

       // Lesson exists?
       const lesson = await storage.getLibraryLesson(lessonId);
       if (!lesson) {
         return res.status(404).json({ message: 'lesson_not_found' });
       }
       if (!lesson.articleHtml) {
         return res.status(404).json({ message: 'article_not_available' });
       }

       // Hashes dos assets staticos (cache em-memory 5min)
       const cssHash = await computeStaticAssetHash(
         'library/static/article-styles.css'
       );
       const jsHash = await computeStaticAssetHash(
         'library/static/article-scripts.js'
       );
       if (!cssHash || !jsHash) {
         return res.status(503).json({
           message: 'static_assets_not_uploaded',
         });
       }

       const version = sha256(cssHash + jsHash).slice(0, 16);
       const stylesUrl = `/api/library/static/article-styles.css?v=${cssHash.slice(0, 12)}`;
       const scriptsUrl = `/api/library/static/article-scripts.js?v=${jsHash.slice(0, 12)}`;

       res.json({
         html: lesson.articleHtml,
         stylesUrl,
         scriptsUrl,
         version,
         meta: {
           title: lesson.title,
           learningObjectives: lesson.learningObjectives ?? [],
         },
       });
     }
   );
   ```

2. **Hash cache em-memory:**
   ```ts
   const HASH_CACHE_TTL_MS = 5 * 60 * 1000;
   const hashCache = new Map<string, { hash: string; expiresAt: number }>();

   async function computeStaticAssetHash(key: string): Promise<string | null> {
     const cached = hashCache.get(key);
     if (cached && cached.expiresAt > Date.now()) return cached.hash;
     const buffer = await mediaStorage.get(key).catch(() => null);
     if (!buffer) return null;
     const hash = createHash('sha256').update(buffer).digest('hex');
     hashCache.set(key, { hash, expiresAt: Date.now() + HASH_CACHE_TTL_MS });
     return hash;
   }
   ```

   Trade-off: ate 5min de drift entre reupload e endpoint refletir.
   Aceitavel — founder reupload eh raro, e cache 30d no client
   significa que client ja tem versao antiga ate F5/cleanup.

3. **Frontend `useQuery` integration:**
   ```ts
   const { data: bundle } = useQuery<ArticleBundle>({
     queryKey: ['library', 'lesson', lessonId, 'article-bundle'],
     queryFn: () => apiRequest('GET', `/api/library/lessons/${lessonId}/article-bundle`),
     staleTime: 5 * 60 * 1000,
   });
   ```

   Quando founder reupload assets, founder pode invalidar cache
   manualmente via `queryClient.invalidateQueries(...)` em rota
   admin (out of scope MVP — staletime 5min cobre).

4. **`buildSrcdoc` helper:**
   ```ts
   function buildSrcdoc(bundle: ArticleBundle, userPlatformId: string): string {
     return `<!doctype html>
   <html lang="pt-BR">
   <head>
     <meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${escapeHtml(bundle.meta.title)}</title>
     <link rel="stylesheet" href="${bundle.stylesUrl}">
     <script>
       window.__GRINDFY_LIBRARY = {
         userPlatformId: ${JSON.stringify(userPlatformId)},
         lessonTitle: ${JSON.stringify(bundle.meta.title)},
       };
     </script>
   </head>
   <body>
   ${bundle.html}
   <script src="${bundle.scriptsUrl}" defer></script>
   </body>
   </html>`;
   }
   ```

   `escapeHtml` escapa entities em campos do bundle pra defender
   contra HTML entity injection no `<title>`.

5. **Protocolo postMessage parent -> child (NAO IMPLEMENTADO MVP):**
   - Parent **nao envia** mensagens pra iframe nesta versao.
   - Comunicacao unidirecional child -> parent.

6. **Protocolo postMessage child -> parent:**

   **Whitelist de tipos:**
   - `'grindfy:library:resize'`:
     - Payload: `{ height: number }`.
     - Validacao parent: `typeof payload.height === 'number'`,
       `payload.height >= 0`, `payload.height <= 50000` (anti-DoS).
     - Acao parent: `setIframeHeight(Math.min(payload.height, 50000))`.
   - `'grindfy:library:scroll'`:
     - Payload: `{ percent: number }`.
     - Validacao parent: `typeof payload.percent === 'number'`,
       clamp `Math.max(0, Math.min(100, payload.percent))`.
     - Acao parent: `onScrollDepth?.(clampedPercent)`.

   Mensagens fora desse contrato sao **ignoradas silenciosamente**.

7. **Source validation:**
   ```ts
   function onMessage(event: MessageEvent) {
     // Critical security check
     if (event.source !== iframeRef.current?.contentWindow) {
       return; // ignore foreign messages
     }
     const { type, payload } = event.data ?? {};
     if (type === 'grindfy:library:resize'
         && typeof payload?.height === 'number') {
       const capped = Math.min(Math.max(0, payload.height), 50000);
       setIframeHeight(capped);
     } else if (type === 'grindfy:library:scroll'
                && typeof payload?.percent === 'number') {
       const pct = Math.max(0, Math.min(100, payload.percent));
       onScrollDepth?.(pct);
     }
     // else: ignore
   }
   ```

   Sem validar `event.origin` porque iframe sandbox sem
   same-origin tem `event.origin === 'null'`. `event.source` ja eh
   contraint suficiente.

8. **Child-side script (`lesson.js.transformed`):**
   ```js
   // Resize: ResizeObserver em document.body
   function reportHeight() {
     const h = document.documentElement.scrollHeight;
     parent.postMessage({
       type: 'grindfy:library:resize',
       payload: { height: h },
     }, '*');
   }
   const ro = new ResizeObserver(reportHeight);
   ro.observe(document.body);
   window.addEventListener('load', reportHeight);

   // Scroll: throttle 1s
   let scrollTimeout = null;
   function reportScroll() {
     const total = document.documentElement.scrollHeight - window.innerHeight;
     const percent = total > 0 ? (window.scrollY / total) * 100 : 100;
     parent.postMessage({
       type: 'grindfy:library:scroll',
       payload: { percent },
     }, '*');
   }
   window.addEventListener('scroll', () => {
     if (scrollTimeout) return;
     scrollTimeout = setTimeout(() => {
       reportScroll();
       scrollTimeout = null;
     }, 1000);
   });
   ```

9. **Anti-DoS:**
   - Cap altura 50000px.
   - Sem cap explicit pra mensagens/segundo (postMessage tem rate
     natural via 1s throttle do scroll + ResizeObserver).
   - Se payload mal-formado, ignorado silenciosamente (nao quebra
     parent).

10. **Throttle PATCH progress** (parent-side):
    ```ts
    const lastSentPercent = useRef(0);
    function handleScrollDepth(percent: number) {
      if (Math.abs(percent - lastSentPercent.current) < 5) return;
      lastSentPercent.current = percent;
      articleProgressMutation.mutate(percent);
    }
    ```
    Dedup 5% — cliente nao envia PATCH se delta < 5%. Combina com
    throttle server-side 5s ja existente (Spec 1 RF-06).

11. **Cleanup:**
    ```ts
    useEffect(() => {
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, [onScrollDepth]);
    ```
    Lesson #1 hooks-first; previne memory leak.

### Tradeoffs aceitos

| Tradeoff | Aceito porque |
|---|---|
| Hash cache 5min = drift de 5min apos reupload | Founder rara reupload; UX worst-case = layout estranho 5min. |
| Cap 50000px de altura | Conteudo Bloco A maior ~5000px renderizado; cap 10x. |
| Sem postMessage origin validation | Sandbox sem same-origin = origin = null = forging impossivel; source check suficiente. |
| Throttle scroll 1s no child + 5% dedup parent + 5s server = 3 camadas | Cada camada cobre escapatoria possivel. |
| Article progress proxy via percent-as-seconds | Schema reusado sem migration; completedAt logic agnostic. |
| 1 endpoint para html + URLs em vez de embed inline | Performance ganho >> custo extra request. |

### Quando rever esta decisao

- **Bidirectional messaging needed** (Spec 5+ inline edit retornar
  contagem de palavras live): adicionar `parent -> child` types
  `grindfy:library:font-size` etc.
- **CVE em postMessage**: padrao W3C estavel; sem precedent.
- **Reupload assets > 1x/dia frequencia** (CMS dinamico): reduzir
  cache TTL ou switch pra ETag-based invalidation explicit.
- **Multi-tenant `userPlatformId`** vazando em
  `__GRINDFY_LIBRARY`: limitar shape ou cifrar (out of scope MVP).

## Consequencias

### Positivas

- **1 request retorna bundle completo** — UX rapida.
- **Cache busting transparente** via hash query string.
- **TanStack Query reage automatico** ao `version` mudar.
- **Auth + access check centralizados** num endpoint.
- **postMessage protocol seguro** (whitelist + source check + cap).
- **Throttle 3-camadas** evita flood PATCH progress.
- **Padrao reutilizavel** pra futuras integracoes embedded.

### Negativas

- **Endpoint novo (RF-04)** — codigo + testes.
- **Hash cache 5min** — drift potencial pos-reupload.
- **Inter-process drift** — `_assetCache` eh in-memory por processo.
  Em deploy multi-worker (PM2 cluster, K8s replicas), admin upload
  invalida apenas o worker que recebeu o POST; outros servem
  CSS/JS antigos por ate 5min. Aceitavel em MVP single-process
  (Neon serverless atual). Em scaling: trocar invalidation por
  Redis pubsub OU encurtar TTL pra 30s.
- **postMessage protocol** precisa documentado em ADR + diagramas.
- **Article progress proxy** (percent-as-seconds) eh hack — precisa
  documentar bem.

### Neutras

- **Decisao revisitavel** se demanda surgir.
- **Lesson learned a registrar:** "endpoint bundle eh padrao
  simples pra entrega de iframe content; cache busting via hash
  query string + TanStack Query keying eh idiom; postMessage com
  source validation + whitelist tipos cobre 95% surface XSS".

## Confianca

**Alta.** Padroes industria consolidados:
- Bundle endpoint = REST resource pattern.
- Hash query string cache busting = pattern Webpack/Vite/etc.
- postMessage com whitelist = MDN documented.
- TanStack Query keying = doc oficial.

Risco unico = drift de 5min pos-reupload, mitigado por raridade do
event.

## Referencias

- **Spec:** `Docs/specs/biblioteca-spec-2.md` RF-04 + RF-06 + D8 + D9
- **ADR-092** — Iframe sandbox (substrate desta decisao).
- **ADR-093** — Trusted bypass (ainda sanitiza HTML).
- **ADR-074** — Progress sync cross-format (article percent proxy).
- **Lessons learned:**
  - #1 hooks-first (cleanup).
  - #2 data-testid (`library-article-iframe`).
  - #13 (`apiRequest` retorna JSON parseado).
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/biblioteca-spec-2-article-bundle-flow.mermaid`
    — sequence user → iframe render → postMessage scroll-depth → progress save.
  - `Docs/architecture/diagrams/biblioteca-spec-2-iframe-lifecycle.mermaid`
    — state machine load → resize → scroll → unload + cleanup.
- **External:**
  - MDN Window.postMessage
  - TanStack Query docs
  - HTTP Cache-Control RFC 7234
- **Out of scope:**
  - Bidirectional messaging (parent -> child).
  - WebSocket alternative.
  - SSE pra notify clientes de reupload assets.
