# Spec: UX-Biblioteca-1 — Polimento UX da Biblioteca (Top 5 ICE)

## Status
Proposta

## Resumo
Sprint de polimento UX na pagina Biblioteca (LMS) cobrindo Top 5 friction points priorizados via ICE pelo strategist em 2026-05-03. Resolve copy inconsistente, fluxo de pedido de acesso alpha (substitui mailto), velocidade de video, remocao de CTA decorativo nao-funcional e melhorias de progresso/transicao entre aulas. Sem mudanca de escopo do produto — apenas polimento.

## Contexto
Bloco A "Antes das Cartas" foi para producao em 2026-05-03 (commit `9afb21f` main) com 9 episodios. Audit do strategist identificou 21 friction points; founder aprovou Top 5 ICE. Esta spec NAO depende de novas features — apenas refina UI/UX existente e adiciona um endpoint pequeno (access requests).

Pre-requisitos:
- Sprint Biblioteca-1 (`Docs/specs/biblioteca-spec-1.md`) — schema base + endpoints
- Sprint Biblioteca-2 (`Docs/specs/biblioteca-spec-2.md`) — articles + sanitizer
- Sprint Bloco-A-Polish (`Docs/specs/biblioteca-spec-bloco-a-polish.md`) — hero + telemetry + breadcrumb
- ADR-078 (UI Foundation) e `Docs/conventions/ui-patterns.md`

## Objetivo + Sucesso (metricas)
**Objetivo:** Reduzir friction percebido na Biblioteca eliminando ambiguidade de copy, abandono no banner alpha (mailto cru) e CTAs decorativos.

**Metricas de sucesso (qualitativas, nao bloqueantes):**
- Zero divergencia copy locked vs em-breve (validado por teste).
- Pedidos de acesso alpha rastreaveis no banco (vs mailto opaco hoje).
- Telemetria opcional: `library_access_request_sent` (eventType ja existente da Biblioteca-1 + extensao via enum, OU log endpoint-side simples).
- Conversao para "proxima aula" via CTA inline >> via toast (nao mensuravel diretamente nesta sprint, ficar visivel em telemetria futura).

## Usuarios
- **Player alpha sem acesso entitlement:** ve banner -> abre modal -> envia pedido -> recebe toast confirmacao.
- **Player com acesso aos cursos:** beneficia de copy unificada, controle de velocidade, transicao melhor entre aulas.
- **Admin:** ja tem painel admin (Biblioteca-1) — nao toca nesta sprint. Acessa `library_access_requests` via DB direto (out of scope criar UI admin).

---

## Requisitos Funcionais

### RF-01: Unificar copy de "locked state"

**Descricao:** Eliminar divergencia entre `CourseCard.tsx` ("Acesso restrito") e `LessonRow.tsx` ("Em breve") quando o motivo eh **falta de entitlement**. Reservar "Em breve" exclusivamente para conteudo nao publicado (`isPublished=false`).

**Componentes afetados:**
- `client/src/components/biblioteca/CourseCard.tsx:72-91` (locked badge ja diz "Acesso restrito" — manter, ajustar tom de texto auxiliar se necessario).
- `client/src/components/biblioteca/LessonRow.tsx:157-159` (label "Em breve" amber-300 quando `!lesson.hasAccess`).

**Regras de negocio:**
- Se aula/curso tem `isPublished === false` -> exibir "Em breve" com cor `text-amber-300` (semantica: lancamento futuro).
- Se aula/curso tem `isPublished === true` mas usuario nao tem entitlement (`!hasAccess`) -> exibir "Acesso restrito" com cor neutra `text-gray-400` + Lock icon (lucide-react `Lock`, size 12) inline antes do texto.
- Tooltip opcional em ambos (via `TooltipProvider` ja em uso no CourseCard) — se viavel sem complicar LessonRow, mostrar mesma mensagem do CourseCard ("Liberacao manual durante alpha - fale com suporte"). Se complicar, omitir tooltip no LessonRow.
- Em CourseCard: badge ja diz "Acesso restrito" + "Liberar via suporte" — manter como esta. Texto auxiliar permanece `text-gray-400`.

**Critério de aceitação:**
- [ ] `LessonRow` exibe `<Lock /> Acesso restrito` (cinza) quando `!lesson.hasAccess && lesson.isPublished !== false`.
- [ ] `LessonRow` exibe "Em breve" (amber) quando `lesson.isPublished === false`. (Hoje LessonRow nao recebe `isPublished` por aula; se nao receber, considerar TODO documentado e tratar todos `!hasAccess` como locked-by-entitlement por enquanto — registrar no spec como nota explicita.)
- [ ] `CourseCard` mantem "Acesso restrito" + "Liberar via suporte" no badge locked (sem mudanca, validar consistencia).
- [ ] Cor do label `LessonRow` muda de `text-amber-300` para `text-gray-400` quando locked-por-entitlement.
- [ ] Lock icon (lucide `Lock`, 12px) renderizado antes do texto no LessonRow quando locked.
- [ ] `data-testid` estaveis: `lesson-row-locked-label` e `course-card-locked-badge` (test-writer pode ajustar nomes; manter principio do lesson #2 hoje).

**Nota de implementacao:** Se `LessonRow` nao recebe `isPublished` da lesson hoje (verificar prop drilling em CourseDetailPage), o Implementer deve **simplesmente** assumir todos `!hasAccess` = locked-por-entitlement. Adicionar `isPublished` ao payload eh out-of-scope (entra em UX-Biblioteca-2).

---

### RF-02: Modal in-app pedido acesso alpha

**Descricao:** Substituir o link `mailto:` no banner alpha (`BibliotecaPage.tsx:113-122`) por botao que abre modal com formulario estruturado. Submissao cria registro no banco com idempotencia.

**Componentes afetados:**
- `client/src/pages/biblioteca/BibliotecaPage.tsx:107-133` — substituir `<a href="mailto:...">` por `<button>` que abre modal.
- Novo componente: `client/src/components/biblioteca/AccessRequestDialog.tsx`.
- Novo endpoint: `POST /api/library/access-requests`.
- Novo endpoint: `GET /api/library/access-requests/me` (para idempotencia + estado do botao).
- Schema novo: tabela `library_access_requests`.

**Regras de negocio:**

*Form (modal):*
- Campo "Nome": pre-preenchido com `user.name || \`${user.firstName} ${user.lastName}\`.trim() || user.username`. Editavel. Required, 2-120 chars.
- Campo "Plano atual": pre-preenchido com `user.subscriptionPlan` (read-only, exibido como chip/pill, nao input).
- Campo "Motivo": textarea required, 20-1000 chars, placeholder "Conte rapidamente: por que quer acesso e o que pretende estudar primeiro?".
- CTA primary: "Enviar pedido" (verde, mesma classe dos outros CTAs Bloco A).
- CTA secondary: "Cancelar" (ghost) ou Esc/X.
- Mostrar texto auxiliar: "Resposta em ate 24h por email."

*Submissao:*
- POST `/api/library/access-requests` com body `{ name: string, reason: string }` (plano vem do user logado, nao do payload).
- Sucesso (201): toast `"Pedido enviado, retorno em 24h"` + fechar modal + travar botao do banner em estado "Pedido enviado" (label muda para "Pedido em analise") por aquela sessao. Estado persiste via refetch GET `/api/library/access-requests/me`.
- Erro 409 (duplicate, status=pending existente): toast warning `"Voce ja tem um pedido em analise"` + fechar modal + travar botao igual ao sucesso.
- Erro 400 (validacao Zod): exibir erro inline no campo, NAO fechar modal.
- Erro 5xx: toast destrutivo `"Falha ao enviar. Tente novamente em instantes."` + manter modal aberto.

*Idempotencia:*
- Backend valida: se ja existe registro pra `userId` com `status='pending'`, retorna 409 `{ message: "request_already_pending", existingId }`.
- Frontend: ao montar `BibliotecaPage`, faz GET `/api/library/access-requests/me`. Se retornar `{ status: 'pending' }`, banner mostra botao em estado disabled "Pedido em analise" (mesmo tom amber).
- Status `approved` ou `denied` no GET: banner volta ao estado normal "Pedir liberacao" (permite re-pedir; rationale: se foi denied o user pode querer aclarar; se approved e ainda ve banner, algo deu errado mas nao bloqueamos).
- Rate limit no endpoint POST: max 5 requests/hora por usuario (alinhado a `express-rate-limit` ja em uso em `auth.ts`).

*Telemetria:*
- Emitir log server-side `[library access-request] user=USER-XXXX created request id=...` em sucesso.
- Frontend opcional: chamada `POST /api/library/events` com `eventType='access_request_sent'` SE este eventType for adicionado ao enum (`libraryEventTypeEnum` em `shared/schema.ts:3566`). **Decisao:** NAO adicionar eventType nesta sprint. Logging server-side eh suficiente. Adicionar enum value entra em UX-Biblioteca-2.

**Critério de aceitação:**
- [ ] Botao no banner alpha abre modal (substitui `<a href="mailto:">`).
- [ ] Modal tem campos: Nome (pre-fill, edit), Plano atual (pre-fill, read-only), Motivo (textarea, required).
- [ ] Submit chama `POST /api/library/access-requests`.
- [ ] Toast "Pedido enviado, retorno em 24h" em sucesso.
- [ ] Modal fecha em sucesso.
- [ ] Botao do banner muda para "Pedido em analise" disabled apos sucesso.
- [ ] Refresh da pagina mantem botao em "Pedido em analise" (via GET /me).
- [ ] Tentar enviar segundo pedido com pending existente -> 409 + toast "ja tem um pedido em analise".
- [ ] Validacao Zod: name 2-120, reason 20-1000 — erro inline no modal.
- [ ] Rate limit 5/h retorna 429 + toast "muitas tentativas, aguarde".
- [ ] Modal acessivel via Esc, focus trap, focus inicial no campo "Motivo".

---

### RF-03: Velocidade de reproducao do video Mux

**Descricao:** Habilitar controle de velocidade no MuxPlayer e persistir preferencia globalmente em localStorage.

**Componentes afetados:**
- `client/src/pages/biblioteca/LessonViewer.tsx:805-811` (componente `VideoPanel`).

**Regras de negocio:**
- Adicionar prop `playbackRates={[0.75, 1, 1.25, 1.5, 1.75, 2]}` ao `<MuxPlayer>` (prop suportada pelo `@mux/mux-player-react`).
- Velocidade default: 1.0.
- Persistencia: `localStorage` chave `library-video-speed`, valor numerico (string serializada).
- Restauracao no mount: ler chave, validar (numero entre 0.5 e 3), aplicar via `playbackRate` setter no elemento `<mux-player>` (ou via prop `defaultPlaybackRate` se suportado).
- Persistir mudanca: listener `ratechange` no elemento -> grava no localStorage.
- Escopo: **global** (todas aulas usam mesma velocidade preferida — nao por aula). Rationale: comportamento esperado em LMS (Udemy, YouTube).
- Server-side: nenhuma mudanca. Persistencia eh local-only.

**Critério de aceitação:**
- [ ] Player exibe menu de velocidade com 6 opcoes (0.75, 1, 1.25, 1.5, 1.75, 2).
- [ ] Velocidade selecionada persiste apos reload da pagina.
- [ ] Velocidade selecionada eh aplicada na proxima aula carregada.
- [ ] Valor invalido em localStorage (ex: "abc", 99) -> fallback para 1.0 sem crash.
- [ ] Polyfill localStorage no setup.ts node env (lesson #15 — ja existe MemoryStorage, validar que cobre `Storage.prototype.getItem/setItem`).

**Edge cases:**
- localStorage indisponivel (Safari private mode, etc): fallback silencioso para velocidade 1.0 sem persistir. Nao bloquear render.
- MuxPlayer nao montado (`MuxPlayerFallback` ativa): nao tentar setar velocidade. RFA-03 nao aplica.

---

### RF-04: Remover CTA "Adicionar lista" disabled do hero

**Descricao:** Aplicar lesson learned #11 (default minimo) — remover botao decorativo que nao tem funcionalidade implementada.

**Componentes afetados:**
- `client/src/components/biblioteca/LessonHero.tsx:297-314`.

**Regras de negocio:**
- Remover completamente o botao `lesson-hero-cta-add-list`.
- Manter botao primario (`Iniciar aula` / "Pular intro" / variantes). Ele continua sendo o unico CTA do hero.
- Quando feature de listas existir (futuro), nova spec pode re-adicionar o botao com handler real.
- Test cleanup: remover/ajustar testes que validam presenca do botao em `tests/unit/library-polish/LessonHero*.test.tsx` ou similares.

**Critério de aceitação:**
- [ ] Elemento com `data-testid="lesson-hero-cta-add-list"` NAO existe mais no DOM.
- [ ] Botao primario continua renderizado e funcional.
- [ ] Animacao stagger do hero permanece consistente (apenas 1 botao ao inves de 2 — verificar `DELAY_CTA_PRIMARY` aplicado, `DELAY_CTA_SECONDARY` orphan removido se nao usado em outro lugar).
- [ ] Testes existentes que asseravam presenca do "Adicionar lista" sao atualizados para asserer **ausencia**.

**Nota:** A constante `DELAY_CTA_SECONDARY` em LessonHero pode virar dead code. Se nao for usada por outro elemento, remover tambem. Implementer decide.

---

### RF-05: Progress visual incremental + auto-CTA "Proxima aula" inline

**Descricao:** Melhorar feedback visual de progresso da aula e substituir o toast "Proxima aula" por CTA inline persistente abaixo do player com auto-navegacao countdown.

**Componentes afetados:**
- `client/src/pages/biblioteca/LessonViewer.tsx:344-359` — substituir useEffect que dispara toast.
- `client/src/pages/biblioteca/LessonViewer.tsx:770-799` — refinar progress label com states visuais.

**Regras de negocio:**

*Parte A — Progress label visual states:*

| Faixa `maxProgressPct` | Cor texto | Cor barra | Badge |
|---|---|---|---|
| `< 50` | `text-gray-400` (atual) | `bg-green-500` (atual) | nenhum |
| `>= 50 && < 90` | `text-green-400` | `bg-green-500` | nenhum |
| `>= 90 && < 100` | `text-green-300` | `bg-green-500` | `<Badge>Quase la</Badge>` ao lado do `%` |
| `=== 100` | `text-green-300` font-semibold | `bg-green-400` | `<Badge>Concluida ✓</Badge>` proeminente |

- Badge usa `Badge` do shadcn ja disponivel ou span estilizado simples.
- Trasicao suave entre estados (`transition-colors duration-300`).
- Manter texto "Progresso da aula: X%" + (do <formato>) — apenas mudar cor + adicionar badge.

*Parte B — Auto-CTA "Proxima aula" inline:*

- Remover `useEffect` que dispara toast (lines 344-359).
- Adicionar componente novo `<NextLessonCTA>` renderizado abaixo do progress bar (apos line 799), DENTRO do `LessonViewer` mas fora do player.
- Visivel quando: `maxProgressPct >= 90 && nextLessonRef !== null`.
- Conteudo: `Proxima aula: {nextLessonRef.displayLabel} - {nextLessonRef.title}` + botao "Ir agora" + countdown "Auto-iniciando em Ns" + botao "Cancelar".
- Comportamento:
  - Aparece quando `maxProgressPct >= 90` (uma vez por mount — ref guard como ja existe).
  - Auto-focus no botao "Ir agora" ao aparecer (acessivel via teclado).
  - Countdown decrescente de 5s.
  - Quando chega 0s OU usuario clica "Ir agora" -> navega para proxima aula via `useLocation()` setLocation.
  - "Cancelar" ou Esc: para o countdown, mantem CTA visivel (sem auto-nav), botao "Ir agora" ainda funciona manualmente.
  - Se usuario navega para outra aula manualmente antes do countdown: CTA desmonta com aula atual, ref guard reseta no mount da proxima.
- Caso especial **ultima aula do curso**: `nextLessonRef === null`. Nao renderizar `<NextLessonCTA>`. Renderizar (opcionalmente) banner de conclusao "Curso concluido ✓ — voce terminou {courseTitle}". Se isso complicar, deixar so para UX-Biblioteca-2 e nesta sprint apenas NAO mostrar nada.
- Toast de "Proxima aula" eh removido. Justificativa: viewport mobile pequeno tinha valor manter, mas CTA inline eh sempre visivel se usuario rolar para baixo. Trade-off aceitavel para reduzir noise.

**Critério de aceitação Parte A:**
- [ ] Progress label cinza < 50%.
- [ ] Progress label verde claro >= 50% e < 90%.
- [ ] Badge "Quase la" aparece >= 90% e < 100%.
- [ ] Badge "Concluida ✓" proeminente em 100%.
- [ ] Cor da barra muda sutilmente em 100% (green-400 vs green-500).

**Critério de aceitação Parte B:**
- [ ] Toast `Proxima aula: ...` NAO eh mais disparado.
- [ ] CTA inline `<NextLessonCTA>` aparece quando `maxProgressPct >= 90 && nextLessonRef`.
- [ ] CTA mostra titulo da proxima aula.
- [ ] Countdown 5s visivel e decrescente.
- [ ] Auto-nav apos 5s -> `setLocation('/biblioteca/curso/.../aula/...')` (ou rota equivalente).
- [ ] Botao "Ir agora" navega imediatamente.
- [ ] Botao "Cancelar" para countdown sem desmontar CTA.
- [ ] Esc tem mesmo efeito que "Cancelar".
- [ ] Auto-focus em "Ir agora" ao aparecer (testavel via `document.activeElement`).
- [ ] Ultima aula do curso (sem `nextLessonRef`) -> CTA NAO renderiza (sem crash).
- [ ] Ref guard previne re-aparicao no mesmo mount apos cancel.

**Edge cases:**
- Progress chega a 90, depois volta para 80 (ex: switch tab pra outro formato com progresso menor): CTA fica visivel uma vez aparecido (ref guard ja garante). Aceitavel.
- Usuario clica "Cancelar", depois progress vai para 100: CTA continua visivel, botao "Ir agora" ainda funcional, sem novo countdown.
- `nextLessonRef.displayLabel` undefined: usar fallback string vazia (ja eh padrao no codigo atual line 352).

---

## Requisitos Nao-Funcionais

- **Performance:** Endpoints novos respondem < 100ms p95. Modal abre em < 50ms (sem fetch sincrono no open — pre-fill do user vem do AuthContext).
- **Seguranca:** RF-02 endpoint POST com `requireAuth` + Zod validation + rate limit (5/h por user). Sanitizar input "name" e "reason" no servidor (apenas trim + length, sem HTML — campos sao texto plano, exibidos no admin via DB direto/futuro UI sem dangerouslySetInnerHTML).
- **Acessibilidade:** Modal RF-02 com focus trap, Esc para fechar, aria-labels nos campos. CTA inline RF-05 com `aria-live="polite"` para anunciar "Proxima aula em N segundos" para screen readers (ou `aria-live="off"` se for muito ruidoso — Implementer testa).
- **i18n:** Todos os textos user-facing em PT-BR (ja eh padrao do projeto).
- **Telemetria:** Apenas server log no RF-02 (sem novo eventType library).

---

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| POST | `/api/library/access-requests` | Criar pedido de acesso alpha | JWT |
| GET | `/api/library/access-requests/me` | Pedido pending atual do usuario logado (ou null) | JWT |

### Detalhes

**POST `/api/library/access-requests`**

Request body (Zod):
```ts
{
  name: z.string().trim().min(2).max(120),
  reason: z.string().trim().min(20).max(1000),
}
```

Response 201:
```json
{
  "id": "<nanoid>",
  "status": "pending",
  "createdAt": "2026-05-03T12:34:56.000Z"
}
```

Response 409 (pending existente):
```json
{ "message": "request_already_pending", "existingId": "<nanoid>" }
```

Response 400 (validacao):
```json
{ "message": "validation_error", "errors": [...] }
```

Response 429 (rate limit):
```json
{ "message": "rate_limit_exceeded", "retryAfterSeconds": 1234 }
```

Plano (`subscriptionPlan`) extraido do `req.user` server-side (NAO do body), evita spoofing.

**GET `/api/library/access-requests/me`**

Response 200:
```json
{ "id": "<nanoid>", "status": "pending", "createdAt": "...", "name": "...", "reason": "..." }
```
ou
```json
null
```

Retorna o pedido **mais recente** do usuario, qualquer status. Frontend trata: `status === 'pending'` -> banner em "Pedido em analise". Caso contrario, banner normal.

---

## Modelos de Dados Afetados

### Tabela nova: `library_access_requests`

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | varchar | PK, default `nanoid()` | Padrao do projeto |
| `userId` | varchar | not null, FK -> `users.userPlatformId` ON DELETE CASCADE | |
| `name` | varchar(120) | not null | Nome submetido pelo user (pode divergir do user.name atual) |
| `subscriptionPlanSnapshot` | varchar(50) | not null | Snapshot do plano no momento do pedido |
| `reason` | text | not null | Motivo (max 1000 chars validado por Zod, sem cap em DB) |
| `status` | enum (`pending`, `approved`, `denied`) | not null, default `pending` | |
| `reviewedBy` | varchar | nullable, FK -> `users.userPlatformId` ON DELETE SET NULL | Admin que revisou (futuro) |
| `reviewedAt` | timestamp | nullable | |
| `reviewNotes` | text | nullable | Nota interna admin |
| `createdAt` | timestamp | not null, default `now()` | |
| `updatedAt` | timestamp | not null, default `now()` | Trigger ou app-level |

**Indices:**
- `idx_library_access_requests_user_status` on (`userId`, `status`) — query principal: pending por user.
- `idx_library_access_requests_status_created` on (`status`, `createdAt` DESC) — admin futuro lista pending mais recentes.

**Migration:** `migrations/0036_library_access_requests.sql` (proximo numero apos 0035 ja aplicado).

**Drizzle schema:** Adicionar em `shared/schema.ts` proximo as outras `library*` tables (linha ~3700). Usar `pgEnum("library_access_request_status", ["pending", "approved", "denied"])`.

### Sem mudancas em outras tabelas

`libraryEventTypeEnum` NAO recebe novo valor `access_request_sent` nesta sprint (decidido no escopo).

---

## Integracoes Externas
Nenhuma. Sem envio de email automatico nesta sprint (founder revisa pedidos via DB direto / UI admin futura). Se desejado, **out of scope** notificar founder via email no submit.

---

## Componentes UI afetados (resumo)

| Arquivo | Mudanca | RF |
|---|---|---|
| `client/src/components/biblioteca/CourseCard.tsx` | Validar copy "Acesso restrito" (provavel no-op) | RF-01 |
| `client/src/components/biblioteca/LessonRow.tsx:157-159` | Trocar "Em breve" amber -> "Acesso restrito" cinza + Lock icon | RF-01 |
| `client/src/pages/biblioteca/BibliotecaPage.tsx:107-133` | Substituir mailto por botao + modal | RF-02 |
| `client/src/components/biblioteca/AccessRequestDialog.tsx` | **NOVO** — modal com form | RF-02 |
| `client/src/pages/biblioteca/LessonViewer.tsx:805-811` (VideoPanel) | Add `playbackRates` + persist localStorage | RF-03 |
| `client/src/components/biblioteca/LessonHero.tsx:297-314` | Remover botao "Adicionar lista" | RF-04 |
| `client/src/pages/biblioteca/LessonViewer.tsx:344-359` | Remover toast useEffect | RF-05 (B) |
| `client/src/pages/biblioteca/LessonViewer.tsx:770-799` | Adicionar progress states visuais | RF-05 (A) |
| `client/src/components/biblioteca/NextLessonCTA.tsx` | **NOVO** — CTA inline com countdown | RF-05 (B) |

## Backend afetado

| Arquivo | Mudanca | RF |
|---|---|---|
| `shared/schema.ts` | Adicionar tabela `libraryAccessRequests` + enum + insert schema + relacao | RF-02 |
| `server/storage.ts` | Adicionar `createLibraryAccessRequest`, `findPendingLibraryAccessRequest`, `getLatestLibraryAccessRequestForUser` | RF-02 |
| `server/routes/library.ts` (ou novo `library-access-requests.ts`) | Handlers POST + GET `/me` | RF-02 |
| `server/routes/library-register.ts` | Registrar novas rotas + rate limit middleware | RF-02 |
| `migrations/0036_library_access_requests.sql` | Migration | RF-02 |

---

## Cenarios de Teste Derivados

### RF-01 — Locked copy unification

#### Happy path
- [ ] LessonRow com `lesson.hasAccess === false` renderiza texto "Acesso restrito" (nao "Em breve").
- [ ] LessonRow com `lesson.hasAccess === true` nao renderiza badge nenhum.
- [ ] Lock icon (lucide-react Lock) presente quando locked.
- [ ] Cor do label eh `text-gray-400` (snapshot ou className assert).

#### Regressao
- [ ] CourseCard locked badge ainda diz "Acesso restrito" + "Liberar via suporte".
- [ ] Tooltip do CourseCard ainda funcional.

### RF-02 — Modal pedido acesso

#### Happy path
- [ ] Banner alpha tem `<button>` (nao mais `<a href="mailto:">`).
- [ ] Click no botao abre modal.
- [ ] Modal pre-preenche campo "Nome" com user.name.
- [ ] Modal exibe plano atual (chip read-only).
- [ ] Submit valido cria registro DB (`library_access_requests` com status pending).
- [ ] Toast "Pedido enviado, retorno em 24h" aparece.
- [ ] Modal fecha apos sucesso.
- [ ] Botao do banner muda para "Pedido em analise" disabled.

#### Validacao input
- [ ] Submit com `name = ""` -> erro inline "obrigatorio".
- [ ] Submit com `reason` < 20 chars -> erro inline "muito curto".
- [ ] Submit com `reason` > 1000 chars -> erro inline "muito longo".
- [ ] Submit com `name` > 120 chars -> erro inline "muito longo".

#### Idempotencia
- [ ] Segundo POST com pending existente -> 409 + toast "ja tem um pedido em analise".
- [ ] GET /me com pending -> retorna registro -> banner mostra "Pedido em analise" no mount.
- [ ] GET /me sem pending -> retorna null OR registro com status approved/denied -> banner mostra "Pedir liberacao" normal.

#### Edge cases
- [ ] Rate limit 5/h por user -> 6a tentativa retorna 429.
- [ ] User sem `name` (null/undefined) -> field pre-preenchido com fallback `firstName lastName` ou `username`.
- [ ] Modal acessivel: Esc fecha, focus trap, focus inicial em `<textarea>` motivo.
- [ ] Modal nao fecha em click fora do dialog (preserva input). Apenas X / Cancelar / Esc fecham.
- [ ] Endpoint POST sem `requireAuth` -> 401.
- [ ] Endpoint GET sem `requireAuth` -> 401.
- [ ] Body com campos extras (ex: `subscriptionPlan: "premium"`) -> servidor IGNORA e usa req.user.subscriptionPlan (anti-spoofing).

### RF-03 — Video speed

#### Happy path
- [ ] MuxPlayer renderiza com prop `playbackRates`.
- [ ] User altera velocidade -> localStorage `library-video-speed` recebe valor numerico.
- [ ] Reload pagina -> velocidade persiste.
- [ ] Aula diferente carregada -> velocidade aplicada.

#### Edge cases
- [ ] `localStorage.getItem('library-video-speed')` retorna "abc" -> fallback 1.0.
- [ ] `localStorage.getItem('library-video-speed')` retorna "99" -> fallback 1.0 (validar range 0.5-3).
- [ ] localStorage indisponivel (mock throw) -> nao crash, velocidade default 1.0.
- [ ] MuxPlayer fallback ativo -> nao tenta setar velocidade.

### RF-04 — Remover CTA "Adicionar lista"

#### Happy path
- [ ] LessonHero NAO renderiza elemento com `data-testid="lesson-hero-cta-add-list"`.
- [ ] Botao primario (`Iniciar aula` / "Pular intro") ainda renderiza e funcional.

#### Regressao
- [ ] Animacao de stagger do hero ainda funciona (verificar entrada do CTA primario nao quebrou).
- [ ] Testes anteriores que asseravam presenca do botao foram atualizados para asserer ausencia.

### RF-05 — Progress + Next Lesson CTA

#### Happy path Parte A
- [ ] Progress label tem cor cinza < 50%.
- [ ] Progress label muda para verde claro >= 50%.
- [ ] Badge "Quase la" aparece quando >= 90% e < 100%.
- [ ] Badge "Concluida ✓" aparece em 100%.

#### Happy path Parte B
- [ ] Toast "Proxima aula" NAO eh disparado em `maxProgressPct >= 90`.
- [ ] CTA inline `NextLessonCTA` aparece em `maxProgressPct >= 90`.
- [ ] CTA mostra titulo da proxima aula corretamente.
- [ ] Countdown decresce de 5s a 0s.
- [ ] Em 0s, navega via setLocation para proxima aula.
- [ ] Click "Ir agora" navega imediatamente.
- [ ] Click "Cancelar" para countdown, CTA continua visivel, botao "Ir agora" funcional.
- [ ] Esc para countdown.

#### Edge cases
- [ ] Ultima aula do curso (`nextLessonRef === null`) -> CTA nao renderiza, sem crash.
- [ ] Ref guard previne re-aparicao apos cancel no mesmo mount.
- [ ] Auto-focus em "Ir agora" ao montar (validar `document.activeElement`).
- [ ] Progress oscila >= 90 -> < 90 -> >= 90: CTA aparece uma vez (ref guard).

#### Regressao
- [ ] Progress bar continua funcional para todos os formatos (video, audio, article).
- [ ] `maxProgressPct` correto (maximo entre formats, ja existe).

---

## Fora de Escopo

Explicitamente NAO faz parte desta sprint:

- **F-01** (empty state com Bloco A) — depende de access request flow (tem agora) + decisao de quando mostrar Bloco A vs gated. Entra em UX-Biblioteca-2.
- **F-04** (revisitar/repensar hero) — decisao de produto pendente.
- **F-05, F-12, F-13, F-16-F-21** — friction P1/P2 nao priorizados no Top 5 ICE.
- **UI admin** para revisar `library_access_requests` (founder le via DB direto nesta fase).
- **Email de notificacao** automatica para founder no submit (out of scope; pode entrar em UX-Biblioteca-2 com SendGrid/SMTP existente).
- **Email de resposta** ao user quando approved/denied (founder responde manualmente por enquanto).
- **Extensao do `libraryEventTypeEnum`** com `access_request_sent` (decidido NAO adicionar nesta sprint).
- **Banner conclusao curso** ("Curso concluido") — opcional em RF-05; se complicar, deferir.
- **Persistir velocidade por aula** (apenas global nesta sprint).
- **Bloqueio de re-pedido apos `denied`** — nesta sprint user pode re-pedir; spec admin futura decide se travar.

---

## Dependencias

- ADR-078 (UI Foundation) + `ui-patterns.md` — para Dialog/Button/Toast components.
- `useToast` hook ja existente.
- `Dialog` component shadcn ja existente.
- `AuthContext` user shape (id, name, subscriptionPlan).
- MuxPlayer (`@mux/mux-player-react`) suporta `playbackRates` (validar versao instalada — caso nao suporte, plano B: usar `<video>` element nativo `playbackRate`).
- nanoid + Drizzle ORM + Zod.

---

## Riscos + Mitigacoes

| Risco | Mitigacao |
|---|---|
| MuxPlayer `playbackRates` prop nao existe na versao instalada | Implementer valida package.json + docs Mux. Fallback: usar `defaultPlaybackRate` ou `attr playbackrate` no DOM. Se nada funcionar, usar `ref.current.playbackRate = X`. |
| Nao quebrar testes Bloco A polish (LessonHero RF-04) | Test-writer atualiza tests asserting absence em `tests/unit/library-polish/`. Implementer rodar suite full antes commit. |
| Idempotencia race (2 requests POST simultaneos do mesmo user) | UNIQUE INDEX parcial em `library_access_requests` `(user_id) WHERE status = 'pending'` ou validacao por transaction. Implementer escolhe — index parcial eh mais robusto. |
| `LessonRow` nao tem `isPublished` da lesson hoje | Spec aceita usar todos `!hasAccess` como locked-by-entitlement. UX-Biblioteca-2 pode adicionar a distincao. |
| localStorage nao disponivel em SSR/test env | Polyfill ja existe (lesson #15). Implementer valida acesso defensivo (`typeof window !== 'undefined' && 'localStorage' in window`). |
| `NextLessonCTA` overlap com progress bar / fora do viewport | CTA renderiza abaixo de progress bar (dentro do mesmo container). Test-writer valida visibilidade no DOM, nao posicao pixel. |

---

## Notas de Implementacao (sugestoes, nao obrigatorias)

- Reaproveitar `Badge` shadcn existente para "Quase la" / "Concluida ✓".
- `NextLessonCTA` pode ser componente standalone testavel isoladamente (props: `nextLesson, onCancel, onGo, autoStartSeconds=5`).
- `AccessRequestDialog` pode usar `Dialog` shadcn + `react-hook-form` + Zod resolver (ja eh padrao).
- Storage method names: alinhar com convencao `getX/createX/findX` ja em uso.
- Migration deve ter rollback (DROP TABLE + DROP TYPE enum).

---

## Checklist Deploy

Antes de mergear na main:

- [ ] Migration `0036_library_access_requests.sql` criada e aplicada local via `npm run db:push` ou `psql` direto.
- [ ] Drizzle schema sincronizado (`npm run check` sem erros).
- [ ] Vitest full suite verde (`npx vitest run`).
- [ ] Manual QA: enviar pedido, verificar toast, refresh, ver banner em "Pedido em analise".
- [ ] Manual QA: video speed muda, reload mantem.
- [ ] Manual QA: progress bar muda cor nas faixas, badge aparece.
- [ ] Manual QA: ir ate 90% video -> CTA inline aparece, countdown 5s, click "Cancelar" -> nao navega, click "Ir agora" -> navega.
- [ ] Manual QA: "Adicionar lista" sumiu do hero.
- [ ] Manual QA: locked LessonRow mostra "Acesso restrito" cinza com Lock icon.
- [ ] Reviewer GO.
- [ ] Founder review.
- [ ] Migration aplicada em prod (futuro deploy).
- [ ] Push origin (so apos founder OK).

---

## Anexos / Referencias

- ADRs Biblioteca-1: 071, 072, 076.
- ADRs Biblioteca-2: 092, 093, 094, 095, 096, 097, 098.
- Lessons learned relevantes:
  - #2 (data-testid estavel)
  - #11 (default minimo — RF-04)
  - #15 (polyfill localStorage — RF-03 testes)
  - #16 (DOMPurify — nao aplica aqui mas referencia)
- `memory/biblioteca_decisions_2026-05-01.md`
- `memory/session_2026-05-02-biblioteca-1.md`
- `memory/session_2026-05-03-biblioteca-bloco-a.md`
