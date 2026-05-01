# ADR-051: Storage de spot screenshots em disco local em F2 (S3/R2 deferido para F3)

## Status

Proposto

## Data

2026-04-27

> **Nota de numeracao:** Spec Sprint F2 (`Docs/specs/sprint-f2-spot-screenshots.md`)
> referenciava como "ADR-039". Quando a spec foi redigida, 039 parecia livre, mas a contagem
> sequencial de ADRs ja consumiu 039 (`039-rakeback-as-wallet-tx-reason.md`) e segue ate 050.
> O proximo numero realmente livre eh **051**. Os ADRs companheiros desta sprint recebem
> **052** (ownership) e **053** (cron) — ver referencias no fim do documento.
>
> Existe ainda colisao previa em `047` e `048` (dois arquivos cada — `047-summary-inline-reconcile`
> + `047-tts-browser-native-vs-cloud`; `048-tts-priority-queue` + `048-wallets-eligibility`).
> Esta colisao **nao eh introduzida por F2** e fica fora do escopo desta sprint, mas fica
> documentada aqui para futura limpeza pelo Reviewer.

## Contexto

A Sprint F2 ("Print de Spots durante Grind") permite que o jogador cole screenshots
(Ctrl+V) durante uma sessao live de grind. Cada print eh anexado a um `session_tournament`,
expira em 14 dias, eh revisado no cooldown (drag-to-review) ou em `/studies > Spots Pendentes`.

A spec RF-02 define o endpoint `POST /api/starred-hands/screenshot` (multipart/form-data,
max 5MB, MIME png/jpg/webp). RF-06 define cron diario que purga rows expiradas e arquivos
em disco. RF-NF-Storage estima budget inicial de **1GB** para `uploads/spot-screenshots/`.

A questao arquitetural: **onde os bytes da imagem ficam armazenados?** Disco local do
servidor? Bucket S3/R2/Spaces? Banco de dados (BLOB)? CDN com signed URLs?

A decisao precisa equilibrar:
- **Hoje (F2):** projeto roda local em dev. Founder ainda nao deployou em prod (regra
  `memory/deploy_strategy_2026-04-24.md`). Single-instance. Budget de codigo eh apertado;
  ROI de integrar provedor cloud eh negativo enquanto nao houver users reais consumindo.
- **F3 (futuro):** quando deploy for invocado (Vercel/Railway/Coolify), o file system tipico
  do PaaS eh **efemero** (Vercel) ou **nao compartilhado entre instancias** (Railway com
  scale > 1). Disco local quebra naquele momento.
- **Single-source-of-truth:** path do arquivo eh persistido em `starred_hands.imageUrl`. A
  decisao de storage define o **shape** dessa coluna (path relativo vs URL absoluto vs key
  S3). Mudar dpois exige migration de dados.

Pre-requisitos confirmados:
- Pattern Multer disk ja existe em `server/routes/studies-v2.ts:38-71` (uploads de PDF/img
  para study_materials). Reaproveitavel.
- `uploads/` ja eh path conhecido pelo projeto; configuracao de `.gitignore` esta em vigor.
- Nenhum SDK de S3/R2/Spaces esta no `package.json`.
- `express.static` eh usado em outros pontos.

### Restricoes

- **Convencao do projeto:** uploads servidos via rota Express (nao CDN externo). Todos os
  pipelines de teste/CI rodam local sem cloud creds.
- **Custo Vercel/Railway/etc:** S3 + Cloudflare R2 + DigitalOcean Spaces tem free tier, mas
  obrigam variaveis de ambiente, secret management e CORS que nao existem hoje.
- **Privacidade:** prints sao do user. Bucket publico esta vetado pela spec. Bucket privado
  + signed URL adiciona complexidade que tem ADR proprio (ADR-052).
- **Single-instance dev:** F2 nao precisa multi-instancia. F3 (deploy) precisa.
- **Budget de fan-out:** 10 prints/sessao * 5MB max * (estimativa) 30 sessoes/mes/user = 1.5GB/mes/user
  no pior caso. Cron purga 14 dias, entao steady-state ~700MB/user. Budget 1GB local cobre 1
  user pesado em F2 dev. Em prod, escala linearmente em users — disco local **nao escala**.

## Opcoes Consideradas

### Opcao A: Disco local em `uploads/spot-screenshots/<nanoid>.<ext>` em F2, migrar para S3/R2 em F3 (ESCOLHIDA)

Multer disk storage grava em diretorio relativo a raiz do projeto. `imageUrl` armazena
**path relativo** `/uploads/spot-screenshots/<file>`. Servidor serve via rota Express
custom (`GET /api/starred-hands/:id/image`) com middleware ownership (ADR-052).

```
B:/grindfy/
├── uploads/
│   └── spot-screenshots/
│       ├── abc123.png
│       ├── xyz789.jpg
│       └── ...
└── server/
    └── routes/
        └── starred-hands.ts  ← Multer config + GET /image endpoint
```

DDL relevante:

```sql
-- starred_hands.imageUrl text NULL
-- valor exemplo: '/uploads/spot-screenshots/abc123.png'
```

**Migracao para F3 (S3/R2):**

1. Provisionar bucket privado em provedor escolhido (gatilho: founder invoca deployer).
2. Job de migracao unica: percorre rows com `imageUrl LIKE '/uploads/spot-screenshots/%'`,
   faz upload do arquivo correspondente para bucket, atualiza `imageUrl` para nova key
   (ex: `s3://grindfy-spots/<userId>/<nanoid>.<ext>` ou apenas a key sem schema).
3. Endpoint `GET /api/starred-hands/:id/image` muda de `res.sendFile(localPath)` para
   `res.redirect(signedUrl)` ou stream do bucket. Contrato externo (`imageUrl` retornado
   ao client) **nao muda** — client continua usando `<img src="/api/starred-hands/.../image">`.
4. Cron purga (ADR-053) muda de `fs.unlink` para `s3.deleteObject` na mesma row de codigo
   (abstracao via `lib/spotStorage.ts` em F2 ja prepara essa interface).
5. Disco local pode ser limpo apos validacao.

- **Pros:**
  - **Zero custo cloud em F2.** Sem secret management, sem CORS, sem free tier accounting.
  - **Codigo minimo.** Multer + `express.static` (ou rota custom — ADR-052) + `fs.unlink`.
    Total ~50 linhas de infra.
  - **Reaproveita pattern de `studies-v2.ts`.** Implementer copia/adapta. Menor chance de
    bug novo (lesson #generic — pattern conhecido).
  - **Testavel sem mocks de cloud.** Vitest abre arquivo temporario, valida fluxo, deleta.
  - **Reverter eh trivial.** `rm -rf uploads/spot-screenshots/` + drop colunas (migration
    0012 reversal).
  - **Migration future-proof.** Se F2 abstrair a interface de storage atras de
    `lib/spotStorage.ts` com metodos `save()`, `read()`, `delete()`, `getServeStream()`,
    a troca de implementacao em F3 fica em **1 arquivo**. Contrato externo
    (`starred_hands.imageUrl` + endpoint de servir) nao muda.
  - **Backup local trivial em dev.** Founder pode tar/zip `uploads/` se quiser snapshot.
  - **Casa com decisao de deploy local atual.** F2 nao deploya — entao multi-instance,
    geo-replication, CDN edge sao todas fora de escopo.

- **Contras:**
  - **Nao escala multi-instance.** Se 2 servers rodarem em paralelo, instance A grava
    arquivo, instance B nao ve no disco dela. Mitigacao: F2 = single-instance por design;
    ADR-053 documenta o mesmo debt para o cron.
  - **Disco do server eh efemero em PaaS modernos.** Vercel/Netlify/Cloudflare reciclam fs
    a cada deploy. Mitigacao: F3 obriga migration; documentado abaixo.
  - **Backup automatizado eh manual.** Sem versionamento como S3 oferece. Mitigacao: prints
    sao auxiliares (nao financeiros), perda eh recuperavel (jogador re-cole).
  - **Path traversal exige cuidado** se filename vier de input do user. Mitigacao: spec
    forca `nanoid()` como filename — ataque inviavel.
  - **Servir arquivo sem CDN eh lento globalmente.** Mitigacao: F2 dev = localhost. F3 com
    S3 + Cloudfront resolve quando relevante.
  - **Migration F3 nao eh free.** Implementer paga custo de fazer o move. Compensado por
    nao pagar agora algo que pode mudar (escolha de provedor depende do PaaS final).

### Opcao B: S3 / Cloudflare R2 desde F2 com signed URLs

Provisionar bucket privado, instalar SDK (`@aws-sdk/client-s3` ou compatible), configurar
env vars (access key, secret, bucket name, region). Multer memory storage -> upload stream
para bucket. `imageUrl` guarda key (`<userId>/<nanoid>.<ext>`). Servir via signed URL
(presigned GET) com TTL curto (5 min).

- **Pros:**
  - Future-proof: zero migration em F3.
  - Multi-instance ready de cara.
  - Signed URLs entregam CDN-grade performance (R2 + Cloudflare edge).
  - Backup/versioning nativos.

- **Contras:**
  - **Secret management adicional:** R2 access keys ou AWS IAM em `.env`. Founder ainda
    nao tem o pattern; cada agente futuro precisa lembrar de configurar.
  - **CORS + bucket policy:** configuracao manual no provedor — nao eh codigo no repo.
  - **Custo dev:** mesmo no free tier, request count eh contado. CI rodando testes contra
    bucket real polui metricas. Mockar bucket em testes dobra superficie.
  - **Adiciona dep `@aws-sdk/client-s3`** (~12MB bundled). Bundle do server engorda.
  - **Lock-in de provedor.** Codigo escrito para AWS S3 nao roda em R2 sem ajuste; R2 usa
    AWS SDK mas tem quirks (ex: virtualhost vs path-style URL). Cloudflare Stream/Images,
    DigitalOcean Spaces, MinIO local — cada um tem detalhes diferentes.
  - **Decidir provedor agora forca decisao de deploy agora.** Founder ainda nao escolheu
    PaaS. Custo de retrabalho real.
  - **Signed URL adiciona complexidade fora do escopo do ADR-052 (ownership middleware).**
    Em vez de check de JWT no servidor, vira token assinado. ADRs separados — espalha o
    raciocinio.
  - **Rejeitada por: custo presente alto, valor presente baixo, decisao prematura de
    provedor.**

### Opcao C: BLOB no PostgreSQL (`bytea` em coluna `starred_hands.image_blob`)

Adicionar `image_blob bytea` em `starred_hands`. Multer memory storage. Backup automatico
junto com `pg_dump`.

- **Pros:**
  - Zero infra extra.
  - Backup unico.
  - Transacoes ACID com a row.

- **Contras:**
  - **Toast/heap inflado.** PostgreSQL TOAST move bytea > 2KB para storage secundario,
    mas tabelas viram lentas em SELECT \*. Anti-pattern reconhecido para 5MB blobs.
  - **`pg_dump` cresce massivamente.** 1GB de prints = 1GB+ de dump. Backup vira impraticavel.
  - **Neon Serverless cobra storage por byte.** Custo 10x maior que S3/R2 para mesmo MB.
  - **Streaming via Drizzle nao eh trivial.** ORM nao otimiza para blob streaming;
    `res.sendBlob` precisa ler tudo em memoria.
  - **Migration eh mais cara.** Sair do Postgres exige dump + transform + upload +
    UPDATE — mais complexo que mover arquivos.
  - **Rejeitada por: anti-pattern de DB para blobs grandes.**

### Opcao D: Filesystem mounted volume em PaaS (Railway volumes / Fly volumes)

Mesma ideia de Opcao A, mas em prod usar volume persistente do PaaS (Railway oferece
volumes; Fly tem volumes attached). Skipar S3.

- **Pros:**
  - Sem cloud SDK.
  - Persistente entre deploys.
  - Backup eh do PaaS.

- **Contras:**
  - **Lock-in de PaaS.** Vercel nao tem volumes. Trocar de Railway para Vercel = migration
    forcada para S3 mesmo assim.
  - **Multi-region eh dor.** Volume Railway eh por regiao; sair da regiao quebra.
  - **Volume size cobranca eh por GB-mes.** R2 free tier eh mais barato.
  - **CDN eh inexistente.** Servir global continua lento.
  - **Mesma migration de A se PaaS mudar.** Custo nao some.
  - **Rejeitada por: lock-in com beneficios marginais.**

## Decisao

**Adotar Opcao A: disco local em `uploads/spot-screenshots/` em F2, com interface
abstrata `lib/spotStorage.ts` que isola Multer + fs do resto do codigo. Migracao para
S3/R2 fica para F3 (gatilho: founder invoca deployer ou pede deploy explicitamente).**

### Detalhes-chave do design

1. **Path absoluto no disco:**
   - `<repoRoot>/uploads/spot-screenshots/<nanoid(16)>.<ext>` onde `ext` ∈ {png, jpg,
     jpeg, webp}.
   - `nanoid(16)` evita colisao mesmo com 1B prints.
   - Multer `diskStorage` com `destination` e `filename` callbacks; nunca usar
     `originalname`.
2. **Coluna `starred_hands.imageUrl`:**
   - Path **relativo** comecando em `/uploads/...` (NAO `https://...`).
   - F3 muda para key S3 (ex: `spots/<userId>/<nanoid>.<ext>`); migration job atualiza.
   - Client SEMPRE acessa via `GET /api/starred-hands/:id/image` (ADR-052), nao via
     `<img src={imageUrl}>` direto. Isso isola o client de mudancas de storage.
3. **Interface de storage (preparacao para F3):**
   - Criar `server/lib/spotStorage.ts` com:
     ```ts
     export interface SpotStorage {
       save(buffer: Buffer, ext: string): Promise<{ key: string; absolutePath?: string }>;
       getReadStream(key: string): Promise<NodeJS.ReadableStream>;
       delete(key: string): Promise<void>;
       healthCheck(): Promise<{ ok: boolean; details: string }>;
     }
     ```
   - Implementacao F2: `LocalDiskSpotStorage` usa `fs/promises` + `path.join(uploadsDir, ...)`.
   - Implementacao F3 (futuro): `S3SpotStorage` usa SDK; troca via `process.env.SPOT_STORAGE`.
   - Rota e cron consumem **so a interface**.
4. **Diretorio criado on-demand:**
   - `await fs.mkdir(uploadsDir, { recursive: true })` no boot do server (ou primeiro upload).
5. **`.gitignore`:** adicionar `uploads/spot-screenshots/` para nao commitar prints reais.
6. **Health check:** endpoint `GET /api/health` (se existir) ou expor via spotStorage para
   monitorar uso de disco. Em F2, log warning se diretorio > 80% do budget de 1GB.
7. **Multer max file size:** 5MB (RF-NF). Acima retorna 413.
8. **MIME validacao no Multer fileFilter:** aceita png/jpg/jpeg/webp; rejeita gif e demais.

### Estrategia de migracao F2 -> F3

Quando founder pedir deploy, invocar o pipeline:

1. **system-architect** registra ADR-XXX (futuro) escolhendo provedor (S3 vs R2 vs Spaces)
   — depende do PaaS escolhido.
2. **implementer** cria `S3SpotStorage` que implementa `SpotStorage` interface.
3. **implementer** cria script `scripts/migrate-spot-storage-to-s3.mjs`:
   - Le todas rows com `imageUrl LIKE '/uploads/spot-screenshots/%'`.
   - Para cada: read disk -> upload to S3 -> UPDATE row com nova key.
   - Idempotente: skip se row ja tem key formato S3.
   - Dry-run mode para validacao.
4. **implementer** atualiza `process.env.SPOT_STORAGE=s3` em config de prod.
5. **deployer** valida em staging primeiro.
6. **reviewer** checa que nenhum codigo le filesystem direto (deve passar pela interface).
7. Apos validacao, disco local pode ser limpo manualmente.

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **Portability:** disco local quebra em PaaS efemero | F2 nao deploya. F3 migra. |
| **Multi-instance:** dois servers nao compartilham fs | F2 single-instance. ADR-053 herda mesmo debt para cron. |
| **Backup:** nao automatizado | Prints sao auxiliares; perda eh recuperavel. F3 com S3 ganha versioning. |
| **Performance global:** sem CDN | F2 = localhost dev. F3 com R2 + CF resolve. |
| **Lock-in temporario:** codigo F2 conhece disco local | Mitigado por interface `SpotStorage`. Troca em F3 = 1 arquivo. |
| **Refactor em F3:** custo de migration | < custo de escolher provedor errado em F2. |

## Consequencias

### Positivas

- **F2 entrega valor sem dependencia cloud.** Founder pode iterar UX (paste, drag, review)
  sem provisionar nada externo.
- **Pattern reaproveitado:** Multer + disk eh padrao em `studies-v2.ts`. Implementer
  espelha desenho conhecido.
- **Testes sem mocks cloud.** `vitest tests/integration/spot-screenshots.test.ts` opera
  em `tmp/` real. Sem flake de network.
- **Migration F3 isolada em 1 arquivo (`spotStorage.ts`).** Refactor previsivel.
- **Reverter eh trivial.** Drop migration 0012 + `rm -rf uploads/spot-screenshots/`.
- **`.gitignore` evita pollution do repo.**
- **Compatibilidade com a regra `deploy_strategy_2026-04-24.md`:** F2 nao invoca deployer.
- **Custo presente = zero;** valor presente = ship F2.

### Negativas

- **Migration F3 sera necessaria** quando deploy for invocado. Documentado.
- **Multi-instance debt:** F3 com 2+ servers em paralelo precisa storage compartilhado
  (S3 ou volume mount). ADR-053 herda o mesmo debt para o cron.
- **Disco do dev pode encher** se cron falhar. Mitigado por log warning a 80% de 1GB
  budget. ADR-053 define cron com idempotencia.
- **Mais um diretorio sob `.gitignore`:** facilmente esquecido em CI/Docker. Documentar
  em CLAUDE.md secao 5 quando spec for implementada.

### Neutras

- **Interface `SpotStorage` adiciona uma camada de indirecao.** Vale o trade pela
  preparacao de F3.
- **Decisao revisitavel:** se F3 vier antes do esperado e founder escolher provedor antes
  de F2 fechar, aceitavel saltar Opcao A e ir direto para B. Custo de re-trabalho do
  Implementer eh ~0.5 dia.

## Confianca

**Alta.** Disco local + Multer eh pattern provado no projeto (`studies-v2.ts`,
`csvParser` upload). A decisao de adiar S3/R2 alinha com a regra de deploy local
(`memory/deploy_strategy_2026-04-24.md`) e com o principio de KISS. A interface
`SpotStorage` mitiga o risco de lock-in. F3 paga o preco de migration **uma vez**, em
contraste com F2 que pagaria **sempre** (todo upload, todo teste, todo deploy).

## Referencias

- **Spec:** `Docs/specs/sprint-f2-spot-screenshots.md` (RF-02, RF-NF-Storage, RF-NF-Seguranca).
- **ADR-052:** `052-spot-screenshots-ownership.md` — middleware ownership para servir imagem
  privada (companheiro de F2).
- **ADR-053:** `053-spot-screenshots-cron.md` — cron de purge que opera sobre este storage.
- **Pattern existente:** `server/routes/studies-v2.ts:38-71` (Multer disk para study_materials).
- **Regra de deploy:** `memory/deploy_strategy_2026-04-24.md` — gatilho explicito do founder.
- **Lessons learned:** `Docs/architecture/lessons-learned.md#schemas` — colunas nullable
  + back-fill (aplicado em RF-02 do spec; nao impacta storage diretamente, mas ressoa
  com o principio "preparar evolucao desde o inicio").
- **Diagrama:** `Docs/architecture/feature-flows/spot-screenshots-flow.mermaid` (paste +
  review + purge sequences).
- **Diagrama:** `Docs/architecture/feature-flows/spot-screenshots-components.mermaid`.
