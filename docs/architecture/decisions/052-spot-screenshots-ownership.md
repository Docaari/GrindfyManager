# ADR-052: Servir spot screenshots via middleware ownership custom (em vez de signed URLs)

## Status

Proposto

## Data

2026-04-27

## Contexto

A Sprint F2 ("Print de Spots durante Grind") armazena imagens privadas do user em disco
local (ADR-051) com filename `<nanoid(16)>.<ext>`. A spec RF-NF-Privacidade exige que prints
**nao sejam acessiveis sem autenticacao** — outro usuario nao pode adivinhar URLs e baixar
spots alheios.

Tres formas de proteger arquivos privados em web:

1. **Middleware ownership custom:** rota Express valida JWT + checa que `imageId` pertence
   ao userId logado, depois serve o arquivo (`res.sendFile`).
2. **Signed URLs:** URL contem token assinado (HMAC ou JWT curto) com TTL; servidor valida
   o token na request. Padrao S3/Cloudfront.
3. **Bucket publico com obscuridade:** filename eh suficientemente aleatorio que adivinhar
   eh inviavel. Sem auth.

A spec rejeita explicitamente a opcao 3 (RF-NF-Privacidade exige check). A escolha real
eh entre **1** e **2**.

Pre-requisitos relevantes:
- Sistema ja usa **JWT** em `server/auth.ts` (`requireAuth` middleware).
- Coluna `starred_hands.userId` indexada via `idx_starred_user_status` (RF-Schema).
- Storage **disco local** em F2 (ADR-051) — sem provedor cloud para herdar signed URL nativo.
- Filenames sao `nanoid(16)` (15 caracteres + 16th char) — espaco de 64^16 ≈ 7.9*10^28
  combinacoes. Adivinhar eh estatisticamente inviavel, mas spec exige proteção alem disso.

A decisao de signed URL geralmente vem **junto com S3/CloudFront** (signed URLs do S3 sao
nativos da SDK). Em disco local, signed URL exige implementacao manual de HMAC + endpoint
de validacao. A diferenca em **complexidade** e **simetria com o stack atual** eh material.

### Restricoes

- **Stack atual:** JWT em `Authorization: Bearer ...` ou cookie httpOnly (verificar com
  Implementer; cookie tem vantagem para `<img src>`).
- **Fluxo do client:** `<img src="...">` precisa retornar bytes da imagem na resposta da
  primeira request. Sem JS client-side custom para inserir Authorization header — a tag
  `<img>` nao envia headers customizados.
- **Cache de browser:** imagens sao bons candidatos a cache HTTP. Decisao deve permitir
  cache controlado (`Cache-Control: private`).
- **Mobile:** se houver app nativo no futuro, o token-based pattern facilita; cookie pode
  exigir webview hibrido. F3+ talvez precise reavaliar.
- **CDN:** F2 nao tem CDN. F3 com S3 + Cloudfront muda o trade-off completamente; signed
  URL vira nativo do CDN.

## Opcoes Consideradas

### Opcao A: Middleware ownership custom em rota Express (ESCOLHIDA)

Rota `GET /api/starred-hands/:id/image` faz:

```ts
router.get('/:id/image', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.auth.userId;

  // 1. Lookup row
  const row = await storage.getStarredHandById(id);
  if (!row) return res.status(404).json({ message: 'Not found' });

  // 2. Ownership check
  if (row.userId !== userId) return res.status(404).json({ message: 'Not found' });
  //                                       ^^^ 404 (nao 403) para nao confirmar existencia

  // 3. Stream do disco
  if (!row.imageUrl) return res.status(404).json({ message: 'No image' });
  const absolutePath = resolveSpotPath(row.imageUrl);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(absolutePath);
});
```

Client usa `<img src="/api/starred-hands/abc123/image">`. JWT vai por **cookie httpOnly**
ja existente; alternativamente, se o sistema usa header Authorization, o client precisa
fetcher que retorna blob URL — mas o pattern padrao do projeto eh cookie (verificar com
Implementer ao implementar).

- **Pros:**
  - **Simetria com pattern de auth do projeto.** `requireAuth` ja eh middleware default em
    todas as rotas privadas. Zero codigo novo de validacao de identidade.
  - **Zero token management.** Sem rotacao de keys HMAC, sem TTL de URL, sem invalidation
    de cache quando senha muda. JWT rotation ja resolve.
  - **Codigo minimo:** ~10 linhas. Usa `res.sendFile` (Express built-in).
  - **Casa com disco local (ADR-051).** S3 nao precisa estar online; tudo local.
  - **Facil testar:** integration test cria 2 users, faz upload no user A, request com JWT
    de user B retorna 404. Cobertura direta.
  - **Cache HTTP funciona.** `Cache-Control: private, max-age=300` permite browser cache
    sem leak entre users (cache eh do browser do user, nao do CDN).
  - **Observabilidade:** access logs do Express ja capturam quem acessou qual imagem.
    `access_logs` table do projeto pode adicionar evento `spot.served` se necessario.
  - **Migracao para F3:** quando S3 entrar (ADR-051 transicao), rota muda `res.sendFile`
    para `res.redirect(s3.getSignedUrl(key))` — **so 1 linha**. Ownership check fica
    igual. Cliente nao percebe.
  - **Sem leak de filename.** Cliente nunca ve o filename real (nanoid). Rota expoe so
    `:id` (id do `starred_hand`). Mesmo se `imageUrl` aparecer em logs, nao vai ajudar
    atacante (precisa do JWT).

- **Contras:**
  - **Custom auth eh mais codigo que reusar S3 SDK.** Em F3, `s3.getSignedUrl` eh nativo;
    em F2 com disco local, escrever signed URL exigiria HMAC + endpoint de validacao —
    100+ linhas. Middleware ownership eh **menos** codigo, nao mais.
  - **`<img>` exige cookie ou query token.** Se o JWT vai em header Authorization, `<img>`
    nao envia o header; client precisa fetch + blob URL. Mitigacao: projeto ja usa cookie
    httpOnly (verificar). Se nao usar, alternativa eh signed URL (Opcao B).
  - **Cada request paga round-trip ao DB.** Um SELECT por imagem servida. Mitigacao:
    starred_hands tem `idx_starred_user_status`; query <5ms. Cache HTTP corta requests
    repetidos.
  - **Server processa bytes.** Em vez de redirecionar para CDN, server le do disco. Em F2
    (single-instance dev), nao importa. Em F3 com S3, redirect para signed URL evita
    isso.
  - **`req.auth` shape depende do pattern do projeto.** Verificar `server/auth.ts` antes
    de implementar.

### Opcao B: Signed URLs com HMAC custom

Server gera URL `/spot-image/<id>?sig=<hmac>&exp=<timestamp>` quando responde a outras
queries (ex: `GET /api/starred-hands/pending` retorna URLs ja assinadas). Endpoint
`/spot-image/:id` valida HMAC + exp + ownership embutida na assinatura.

- **Pros:**
  - **Cacheable em CDN futuro.** URL imutavel ate exp; CDN edge pode cachear.
  - **Sem cookie/header dependency.** URL sozinha autoriza.
  - **Pattern S3/CloudFront-like.** Migrar para CDN em F3 vira drop-in.
  - **Mobile-friendly.** App nativo so guarda URL; nao gerencia cookie.

- **Contras:**
  - **Codigo adicional significativo:**
    - Gerador de signed URL (HMAC com secret).
    - Validador no endpoint.
    - Rotacao de secret (se compromettido).
    - TTL accounting (URL expira; client precisa refresh).
  - **Estouro de complexidade.** F2 dev nao tem CDN. Investir HMAC infra para nao usar eh
    desperdicio.
  - **JWT secret reuso vs key separada.** Se reusar, JWT scope ambiguo. Se separada, nova
    secret em `.env`. Mais superficie para vazar.
  - **Cache de servico ainda exige round-trip ao DB para gerar URL.** Listagem `GET /pending`
    ja faz; URL nao economiza nada em F2.
  - **TTL eh dor de UX.** URL em pagina aberta por 10min vence; img quebra. Mitigacao:
    refresh em 401, mas adiciona complexidade frontend.
  - **Comprometimento de secret = revoga URLs em massa.** Sem keychain rotation built-in.
  - **Rejeitada por: complexidade alta sem beneficio presente.** F3 com S3 nativamente da
    signed URL — esperar ate la.

### Opcao C: Token JWT scoped no query param

`GET /spot-image/<id>?token=<jwt-curto>` onde `jwt-curto` eh JWT especifico para essa
imagem (claim `sub: imageId`, `exp: 5min`). Validacao via `jwt.verify`.

- **Pros:**
  - Reusa SDK JWT existente.
  - Sem secret separada.

- **Contras:**
  - **JWT em query param vaza em access logs / Referer header.** Anti-pattern conhecido.
  - **JWT eh grande** (~300 bytes). URL fica horrivel.
  - **Tem o mesmo TTL/refresh problem que B.**
  - **Rejeitada por: vazamento via logs/Referer.**

### Opcao D: Bucket publico com obscuridade (filename random)

Servir `GET /uploads/spot-screenshots/<file>` via `express.static` sem auth. Confiar no
nanoid(16) para inviabilizar adivinhacao.

- **Pros:**
  - Codigo zero.
  - Mais rapido (sem DB lookup).

- **Contras:**
  - **Spec rejeita.** RF-NF-Privacidade exige ownership check.
  - **URL leak (Referer, screenshot, share inadvertido) = expor pra mundo.** Sem revogacao.
  - **Bots crawlers podem brute force.** 64^16 eh inviavel, mas + de 1 print = + chances.
  - **Compliance:** padrao GDPR/LGPD recomenda least-privilege; sem auth, falha.
  - **Rejeitada explicitamente pela spec.**

## Decisao

**Adotar Opcao A: middleware ownership custom em rota Express
`GET /api/starred-hands/:id/image`.**

### Detalhes-chave do design

1. **Endpoint:**
   ```
   GET /api/starred-hands/:id/image
   ```
   - `requireAuth` (JWT — pattern do projeto).
   - Lookup `starred_hands` por id.
   - Se row nao existir OU `row.userId !== auth.userId`: **404** (nao 403, evita confirmar
     existencia).
   - Se `row.imageUrl` for null: 404 (sem imagem).
   - Resolver path absoluto via `lib/spotStorage.ts` (ADR-051) para nao acoplar a rota
     ao filesystem.
   - `res.setHeader('Cache-Control', 'private, max-age=300')`.
   - `res.sendFile(absolutePath)` em F2; `res.redirect(s3.getSignedUrl(key))` em F3.
2. **Coluna `imageUrl` permanece relativa:**
   - Ex: `/uploads/spot-screenshots/abc123.png` em F2.
   - Cliente **nao usa** essa URL diretamente. Cliente usa
     `<img src={\`/api/starred-hands/${row.id}/image\`}>`.
   - Em F3, mesmo padrao. `imageUrl` muda internamente; client nao percebe.
3. **JWT delivery:**
   - Verificar com Implementer se projeto usa cookie httpOnly (default Express + projeto
     atual aparenta usar) ou header Authorization.
   - Cookie httpOnly = `<img>` envia automaticamente. Best case.
   - Header Authorization = client precisa `fetch` + `blob` + `URL.createObjectURL`. Mais
     codigo client mas funciona.
   - **Ainda OK:** ownership check eh server-side. Client mecanica nao afeta seguranca.
4. **Logging:**
   - Log estruturado (`console.log` ou logger existente) cada request: `{event:'spot.served',
     imageId, userId, ms}`. Permite forensics sem impacto em performance.
   - Failed ownership (404) tambem loga: `{event:'spot.access_denied', imageId, attemptedUserId}`.
5. **Rate limit:**
   - `express-rate-limit` 100 req/min por user na rota de servir imagem (evita abuso de
     bot fazendo fetch em loop).
6. **Range requests:** spec nao exige; `res.sendFile` da Express suporta automaticamente
   se headers `Range` chegarem. Aceitar; sem trabalho extra.

### Quando rever esta decisao

- **Multi-tenancy entra:** se Grindfy ganhar feature de **share** de print entre users
  (ex: time/staff sharing), ownership-direto fica simplista. Signed URL com claim de
  recipient resolve.
- **CDN em prod (F3):** quando S3 + Cloudfront entrarem, signed URL S3 vira nativo. Esta
  rota **continua existindo** mas muda de `sendFile` para `redirect`. Decisao base
  (ownership check) sobrevive.
- **Mobile native app:** pode preferir signed URL pra cache offline. Reavaliar quando
  app vier (nao ha prazo definido).
- **Throughput > 100 RPS no endpoint:** se servir bytes virar gargalo, migrar para signed
  URL + CDN. Telemetria revelara.

### Risk register

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| **Filename leakar em log e atacante advinhar URL direta** | Baixa | Critico | Cliente nunca acessa `imageUrl` direto; rota `/image` exige auth + ownership. Mesmo com filename, sem JWT do dono retorna 404. |
| **Bug em ownership check (typo, fast-return)** | Baixa | Critico | Cobertura de teste obrigatoria: integration test "user A request imagem de user B = 404". |
| **DoS por fetch loop em mesma imagem** | Baixa | Baixo | Rate limit 100/min + cache HTTP cliente. |
| **Vazamento via Referer header** | Baixa | Medio | URL contem so `:id` opaco; sem signed token sensivel. Mesmo se Referer leak, atacante precisa do JWT. |
| **Cache HTTP serve imagem para session expirada** | Baixa | Medio | `Cache-Control: private, max-age=300` — 5min de cache ok mesmo apos logout (atacante precisa do device do user). |
| **JWT roubado** | Baixa | Critico | Risco geral do app, nao especifico desta rota. Mitigacao na camada de auth (refresh token rotation, https). |

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| Round-trip DB por imagem servida | <5ms via index, irrelevante em F2. F3 + CDN cache resolve. |
| Server processa bytes em F2 | Single-instance, dev local; trivial. F3 com S3 + redirect resolve. |
| Cookie/header dep no client | Pattern do projeto ja eh JWT; sem custo novo. |
| Sem TTL nativo | Refresh do cookie httpOnly resolve indiretamente. |

## Consequencias

### Positivas

- **Codigo minimo (~10 linhas).** Implementer espelha pattern de outras rotas privadas.
- **Zero infra nova.** Sem secret management, sem HMAC, sem CDN.
- **Testavel diretamente.** Integration tests `tests/integration/starred-hands-image.test.ts`
  cobrem ownership, 404, 401.
- **Migracao F3 mantem ownership check.** S3 redirect = 1 linha mudada.
- **Observabilidade unificada.** Logs de auth + access cobrem tudo.
- **Compliance-friendly.** Cada acesso eh autenticado e auditado.

### Negativas

- **Server consome CPU/IO para servir bytes em F2.** Aceito (single-instance dev).
- **Cache de browser eh client-only.** Sem CDN edge cache em F2. F3 resolve.
- **Cookie httpOnly assumption.** Verificar; se header Authorization, client paga blob URL
  cost.

### Neutras

- **Decisao revisitavel** se signed URL S3 forem necessarias para mobile/CDN — pode
  coexistir (rota custom para web, signed URL para mobile/edge).
- **CSRF nao aplica** ao GET de imagem (read-only, idempotente).

## Confianca

**Alta.** Middleware ownership eh o pattern mais simples e simétrico ao stack JWT do
projeto. Disco local + ownership check eh combinacao defensiva sem complexidade
desnecessaria. Quando F3 vier com S3, a migracao para signed URL S3 sera incremental
(redirect na mesma rota), nao um rewrite.

## Referencias

- **Spec:** `Docs/specs/sprint-f2-spot-screenshots.md` (RF-NF-Privacidade, Endpoints
  previstos linha "GET /uploads/spot-screenshots/:file").
- **ADR-051:** `051-spot-screenshots-storage.md` — disco local em F2; rota deste ADR
  consome `lib/spotStorage.ts` para resolver path.
- **ADR-053:** `053-spot-screenshots-cron.md` — cron de purge nao acessa via rota; usa
  `spotStorage.delete()` direto.
- **Pattern de auth:** `server/auth.ts` (`requireAuth` middleware).
- **Diagrama:** `Docs/architecture/feature-flows/spot-screenshots-flow.mermaid` — sequencia
  do paste -> review inclui `GET /image` com ownership check.
- **Lessons learned:** `Docs/architecture/lessons-learned.md` — pattern de ownership antes
  de qualquer dado retornado eh consistente em todo o projeto.
