# ADR-057: Storage abstraction para imagens de spots (filesystem local agora, S3/R2 no deploy)

## Status

Aceito (interim — implementacao cloud diferida ate deploy real)

## Data

2026-04-30

## Contexto

A spec `Docs/specs/spot-screenshots.md` (RF-09) introduz capacidade de anexar
screenshots de mesa a `starred_hands`. Imagens precisam ser:

1. **Persistidas** no servidor (DB nao serve binario direto — prejudica performance,
   inflar backups, sem CDN).
2. **Servidas** via endpoint autenticado (`GET /api/starred-hands/:id/image`).
3. **Deletadas** quando o spot eh removido (limpeza FS).

O ambiente atual eh **dev local** (founder roda `npm run dev` na maquina). Producao
ainda nao foi deployada. Quando for, o filesystem local **nao vai persistir** (Neon
hospeda DB; container/VM da app eh efemero ou multi-replica) — qualquer imagem salva em
`uploads/spots/` somem no proximo deploy.

Logo: precisamos de **codigo agora** que rode em dev (FS local) **e migre sem quebra**
para S3/R2 no deploy. A spec ja prefigura isso (RF-09: "Implementacao cloud (S3/R2)
fora do escopo — interface preparada, implementacao real deferida para deploy").

### Restricoes

- **Sem deps cloud em dev.** Nao quero `aws-sdk` rodando localmente sem credenciais
  ou contra LocalStack. Custo de setup desproporcional.
- **Schema neutro.** `starred_hands.image_key` precisa ser **chave opaca** que faz
  sentido para qualquer backend (FS path relativo OU S3 object key). Nao pode ser
  `s3://bucket/...` URL hardcoded; nao pode ser `/absolute/fs/path` que vaza estrutura.
- **Deploy futuro nao pode exigir backfill ou migration de schema.** Trocar backend
  de `local` -> `s3` deve ser swap de impl + migracao de **dados** (copiar arquivos
  pra bucket), zero migration SQL.
- **Defesa em profundidade.** Spec exige magic bytes check + path-traversal block +
  MIME whitelist. Tudo precisa estar no **service**, nao no controller — caso contrario
  cada caller (POST upload, futuro Coach AI vision tool, futura comunidade) reimplemente
  validacoes e divirja.
- **Stream de leitura.** Spec NFR exige <200ms p95 servindo 2MB. Bufferizar arquivo
  inteiro em memoria antes de mandar pelo response = pico de RAM em carga concorrente.
  Interface precisa permitir stream.

### Forcas em jogo

- **Velocidade > completude:** spec eh feature-MVP, nao infra-sprint. Adiar S3 ate
  deploy real evita ~8h de infra (bucket setup, IAM, signed URLs, lifecycle policies)
  pra zero usuario hoje.
- **Reversibilidade do schema.** `image_key` opaca = backend trocavel sem migration.
  Custo zero pra adicionar backend novo no futuro.
- **Padrao do projeto.** `studies-v2.ts:39` ja usa `path.resolve('uploads/...')` direto.
  Abstrair agora evita repetir o mesmo erro de hardcode.
- **Multi-tenant futuro.** Quando comunidade vier (compartilhar spot publicamente),
  precisaremos de signed URLs / public buckets — interface ja precisa expor `getUrl(key)`
  ou similar. **Adiar essa decisao** ate fase comunidade — interface MVP fica em
  `put/get/delete/exists`, **sem** `getUrl`. Quando comunidade entrar, ADR novo
  estende interface.

## Opcoes Consideradas

### Opcao A: Interface `SpotImageStorage` + impl `LocalFsSpotImageStorage` agora, `S3SpotImageStorage` no deploy (ESCOLHIDA)

Interface em `server/services/spotImageStorage.ts`:

```ts
export interface SpotImageStorage {
  /** Salva buffer e retorna key opaca para persistir no DB. */
  put(input: {
    userId: string;
    sessionId: string;
    ext: string;          // 'png' | 'jpeg' | 'webp'
    buffer: Buffer;
    mime: string;         // image/png | image/jpeg | image/webp (validado magic bytes pelo caller)
  }): Promise<{ key: string; size: number }>;

  /**
   * Le bytes pela key. Retorna null se nao existe (nao-throw).
   * Implementacao DEVE rejeitar keys com path traversal (`..`, `\`, leading `/`).
   */
  get(key: string): Promise<{ buffer: Buffer; mime: string } | null>;

  /** Remove arquivo. Idempotente — nao-throw se key nao existe. */
  delete(key: string): Promise<void>;

  /** Checa existencia barata (sem ler bytes). */
  exists(key: string): Promise<boolean>;
}
```

Impl default `LocalFsSpotImageStorage`:
- Root via `path.resolve('uploads/spots')` (segue padrao `studies-v2.ts:39`).
- Layout: `uploads/spots/{userId}/{sessionId}/{nanoid()}.{ext}`.
- Key persistida em DB: **path relativo a root** — `{userId}/{sessionId}/{nanoid}.{ext}`.
  Nunca path absoluto (vazaria estrutura do servidor + impede swap de backend).
- `put()`:
  - Gera nanoid 21 chars (default da lib).
  - `fs.mkdirSync(dir, { recursive: true })`.
  - `fs.promises.writeFile(absPath, buffer)`.
  - Retorna `{ key: '{userId}/{sessionId}/{nanoid}.{ext}', size: buffer.length }`.
- `get()`:
  - **Defense:** rejeita key contendo `..`, `\`, ou comecando com `/`. Lanca `Error`
    com mensagem `"invalid key"`. Caller traduz pra 404.
  - `fs.promises.readFile(absPath)` em try/catch — `ENOENT` retorna `null`.
  - Retorna `{ buffer, mime }` — mime vem do caller via `starred_hands.image_mime`.
- `delete()`:
  - Try/catch em `fs.promises.unlink` — `ENOENT` ignorado.
  - Nao limpa diretorios pais vazios (custo > beneficio em FS, irrelevante em S3).
- `exists()`:
  - `fs.promises.access(absPath, fs.constants.F_OK)` em try/catch.

Impl futura `S3SpotImageStorage` (NAO codada agora):
- Constructor recebe `{ bucket, region, accessKeyId, secretAccessKey, prefix? }`.
- `put()` chama `PutObjectCommand` com `Bucket`, `Key = prefix + '/' + samePathStructure`,
  `Body = buffer`, `ContentType = mime`. Key salva em DB **continua sendo path relativo
  ao prefix** — exatamente igual a key do FS local. Swap de backend zero impacto no
  schema.
- `get()` chama `GetObjectCommand`, transforma stream em buffer (ou — fase 2 —
  retorna stream direto).
- `delete()` chama `DeleteObjectCommand`. S3 ja eh idempotente.
- `exists()` chama `HeadObjectCommand`.

Selecao de backend via env:

```
SPOT_IMAGE_STORAGE_BACKEND=local       # default
SPOT_IMAGE_STORAGE_BACKEND=s3          # producao (quando deployar)
```

Factory em `server/services/spotImageStorage.ts`:

```ts
export function createSpotImageStorage(): SpotImageStorage {
  const backend = process.env.SPOT_IMAGE_STORAGE_BACKEND ?? 'local';
  if (backend === 's3') {
    return new S3SpotImageStorage({ /* ler env vars */ });
  }
  return new LocalFsSpotImageStorage({ root: path.resolve('uploads/spots') });
}
```

- **Pros:**
  - **Zero overhead em dev.** Sem deps cloud, sem credenciais, sem LocalStack.
  - **Schema-stable.** `image_key` eh opaca em ambos backends. Migracao de dev->prod
    nao paga schema migration.
  - **Testavel.** Mock `SpotImageStorage` em tests unit; `LocalFsSpotImageStorage`
    testavel com tmp dir.
  - **Defense in depth.** Validacao de path traversal mora no service (1 lugar);
    callers passam key, service checa antes de tocar FS/S3.
  - **Padrao reutilizavel.** Coach AI vision tool, futura comunidade, futura biblioteca
    de hand histories — todos podem reusar interface.
  - **Migracao trivial pra cloud.** No deploy: implementar `S3SpotImageStorage`,
    fazer dump dos arquivos do FS pro bucket (1-shot script), trocar env var. Zero
    mudanca em codigo de dominio.

- **Contras:**
  - **+1 abstracao** que nao tem benefit imediato em dev local (so a defesa de path
    traversal e o contrato testavel).
  - **Risco de over-engineering** se feature for descontinuada — mas mitigado: impl
    `LocalFs` eh 80 linhas, removivel em 5 min.
  - **Stream nao previsto na interface MVP.** `get()` retorna buffer inteiro. Pra spots
    de 5MB max em poker player solo, OK. Pra fase comunidade com video/multi-MB,
    refatorar interface (ADR novo) — `get()` retorna `Readable` stream.

### Opcao B: Apenas FS local agora; refatorar quando deployar

```ts
// server/routes/starred-hands.ts (controller direto)
const filePath = path.resolve('uploads/spots', userId, sessionId, `${nanoid()}.${ext}`);
fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, buffer);
await storage.createStarredHand({ ..., imageKey: filePath /* OU relative? */ });
```

- **Pros:**
  - **Zero abstracao.** Codigo direto, mais facil de ler.
  - **YAGNI puro.** Se feature flopar antes de deploy, nada a refatorar.

- **Contras:**
  - **Schema acoplado a FS.** `image_key` vira path FS — quando trocar pra S3, precisa
    backfill de DB (`UPDATE starred_hands SET image_key = REPLACE(image_key, '/abs/path/', '')`).
  - **Defense duplicada.** Magic bytes check no controller, path validation no GET, no
    DELETE — divergencia silenciosa garantida.
  - **Coach AI vision tool no futuro reimplementa tudo.** OU acopla diretamente em FS,
    OU refatora junto.
  - **Test coverage ruim.** Mock de `fs` nativo eh frágil.
  - **Rejeitada por: economia minima agora (~80 linhas) compra divida tecnica
    proporcional ao tamanho do uso futuro.**

### Opcao C: BLOB no Postgres (`bytea`)

- **Pros:**
  - Zero filesystem.
  - Backup unico (pg_dump cobre imagens).
  - Transacional com row.

- **Contras:**
  - **Neon free tier limita storage.** 5MB/spot * 100 spots/user * 100 users = 50GB
    rapido. Custo absurdo vs S3.
  - **Performance ruim.** Servir BLOB via Postgres mata throughput em 4MB/req em
    multiplas conexoes.
  - **Sem CDN possivel.** Sem cache compartilhado, sem signed URLs.
  - **Backups inflados.** `pg_dump` baixa imagens junto.
  - **Rejeitada por: Postgres nao eh storage de blob. Padrao da industria eh objeto.**

### Opcao D: Local FS via `multer.diskStorage` direto, sem service

Confiar no multer + manipular files dentro do controller.

- **Pros:**
  - Multer ja roteia file pra disco; controller so pega `req.file.path`.

- **Contras:**
  - Multer escreve arquivo ANTES da validacao Zod e checks de cap (10/sessao,
    3/torneio). Cap atingido = arquivo orfao no disco. Precisa cleanup manual em
    todos os 4xx paths. Errar 1 path = lixo acumulado.
  - **Magic bytes check tem que rodar APOS multer escrever** — se falhar, deletar.
    Janela de race onde arquivo invalido existe.
  - **Pior:** multer NAO valida magic bytes; so confia em `Content-Type` do cliente
    (spec **explicitamente rejeita** isso, RF-NFR seguranca).
  - **Rejeitada por: `multer.memoryStorage` + service controlado eh mais limpo,
    valida ANTES de tocar disco.**

## Decisao

**Adotar Opcao A: interface `SpotImageStorage` + `LocalFsSpotImageStorage` impl agora,
`S3SpotImageStorage` impl no deploy. Selecao via env `SPOT_IMAGE_STORAGE_BACKEND`.
`image_key` no DB eh path relativo ao root, neutro entre backends.**

### Detalhes-chave do design

1. **Interface com 4 metodos:** `put`, `get`, `delete`, `exists`. Cobertura completa
   pros 3 endpoints (POST upload, GET serve, DELETE).
2. **Multer em memoria** (`multer.memoryStorage`) — NAO escreve em disco. Buffer chega
   ao controller; controller valida MIME via magic bytes (lib `file-type`); se OK
   chama `storage.put({ buffer })`; service grava em FS.
3. **Magic bytes resolvem MIME real, nao Content-Type.** Founder confirmou: cliente
   manda `Content-Type: image/png`, magic bytes dizem JPEG → servidor usa **MIME real
   do buffer** (mais user-friendly). MIME persistido em `image_mime` eh sempre o real.
4. **`image_key` formato:** `{userId}/{sessionId}/{nanoid21}.{ext}`. Sem slash
   inicial. Sem path absoluto. Compativel byte-a-byte entre `LocalFs` e `S3`.
5. **Path traversal blocking** mora no `LocalFsSpotImageStorage.get()`:
   ```ts
   if (key.includes('..') || key.includes('\\') || key.startsWith('/')) {
     throw new Error('invalid key');
   }
   ```
   `S3` nao precisa (S3 SDK ignora `..`), mas a defesa fica no FS-impl mesmo.
6. **Cleanup transacional na criacao do spot:** salvar arquivo PRIMEIRO; se INSERT
   da row falhar, **deletar arquivo** em `catch`. Documentado em RF-NFR
   "Disponibilidade".
7. **`exists()` opcional na interface.** Hoje so usado por testes (verificar que delete
   removeu). Se `S3SpotImageStorage` nao implementar de inicio, lanca `not implemented`
   — caller (controller) nunca chama em prod.
8. **Backend selection:** factory `createSpotImageStorage()` lida via env. Default
   `local`. Producao seta `s3`. CI/test seta `local` com tmpdir custom.
9. **Stream defer:** MVP retorna `Buffer` em `get()`. Quando passar a servir vide
   pra comunidade, ADR novo refatora pra `Readable`. Para 5MB max de print, buffer
   esta dentro do orcamento de RAM por request.
10. **Servir resposta:** controller do `GET /api/starred-hands/:id/image` recebe buffer
    do service, escreve via `res.end(buffer)` com headers de Cache-Control e
    Content-Length. Lessons learned #file-uploads recomenda stream — para >5MB sim;
    para <=5MB hard cap, buffer puro eh aceitavel e mais simples. Documentar em
    lessons-learned: "stream quando arquivo > X MB; buffer aceitavel para size cap baixo".

### Como migrar dados existentes ao trocar backend

Quando deployar e quiser ligar `s3`:

1. **Pre-deploy:** rodar script local que percorre `uploads/spots/` e da
   `PutObjectCommand` em cada arquivo no bucket S3, mantendo path relativo identico.
   Script de ~30 linhas.
2. **Deploy:** seta `SPOT_IMAGE_STORAGE_BACKEND=s3` + credenciais S3 nas env vars.
3. **DB nao muda.** `image_key` ja eh relativo, ja casa com S3 object key sob o
   mesmo prefix.
4. **Validacao:** rodar smoke test (upload + get + delete) contra prod novo.
5. **Rollback:** se algo quebrar, voltar env pra `local` (FS ainda existe no host) — assumindo container persistente. Senao, restore from S3 backup.

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **Buffer em `get()` (sem stream)** | Cap de 5MB por imagem; RAM nao explode em concorrencia tipica de 1 player solo. Refatorar pra stream em fase comunidade. |
| **Sem `getUrl()` / signed URLs** | MVP serve sempre via endpoint autenticado. Signed URLs sao otimizacao de fase comunidade (publico). |
| **`exists()` so usado em tests** | Helper barato; vale interface 4-method limpa vs 3-method com helpers ad-hoc em tests. |
| **Cleanup de diretorios vazios pos-delete nao implementado** | FS aguenta diretorios vazios; S3 nao tem conceito de diretorio. Custo > beneficio. |
| **Backend selection via env, nao DB** | Backend eh decisao infra, nao runtime. Trocar = redeploy. Aceitavel. |

### Quando rever esta decisao

- **Deploy real acontece.** Implementar `S3SpotImageStorage`. ADR novo se interface
  mudar (ex: adicionar `getSignedUrl`).
- **Coach AI vision tool entra.** Tool precisa ler bytes — se buffer continuar OK,
  reusa interface. Se precisar stream pra LLM multimodal, refatorar interface.
- **Comunidade publica spots.** Precisa `getSignedUrl` + buckets publicos opt-in.
  ADR novo.
- **Tamanho de imagem cap sobe** (ex: 20MB). Buffer em RAM vira problema; stream
  obrigatorio.
- **Multi-region / CDN.** Cloudflare R2 + CDN edge pode forçar refactor de
  `S3SpotImageStorage` em `R2SpotImageStorage` (R2 e API-compatible com S3, mesma
  impl serve — provavel zero refator).

## Consequencias

### Positivas

- **Schema-stable cross-backend.** `image_key` opaca; trocar `LocalFs` ↔ `S3` sem
  migration SQL.
- **Defense in depth centralizada.** Path traversal, MIME real, cap de tamanho — tudo
  em 1 lugar.
- **Testavel.** Mock 4 metodos; integration test usa `LocalFs` em tmpdir.
- **Zero overhead dev.** FS local; sem credenciais cloud em dev.
- **Migracao cloud trivial.** Implementacao + script de copia + flip de env.
- **Padrao reutilizavel.** Coach AI vision, comunidade, hand histories — todos
  reaproveitam.

### Negativas

- **+1 indirection** em codebase pra dev local que so precisa de FS.
- **Buffer em RAM** pode virar gargalo se cap subir.
- **Sem stream** na MVP — refator forcado em fase comunidade.
- **`S3SpotImageStorage` nao implementado** — divida tecnica registrada pra deploy
  (estimativa ~4h: SDK + IAM + tests).

### Neutras

- **Decisao revisitavel.** ADR novo quando interface precisar de `getSignedUrl` ou
  `Readable`.
- **`SPOT_IMAGE_STORAGE_BACKEND` env var** vira contrato com infra — documentar em
  `CLAUDE.md` (secao 4 Variaveis de Ambiente).

## Confianca

**Alta.** Tradeoffs explicitos. Reversibilidade alta (schema neutro). Padrao
testado na industria (Strapi, Medusa, Hashnode usam abstracao identica). Sem riscos
arquiteturais identificados.

## Referencias

- **Spec:** `Docs/specs/spot-screenshots.md` (RF-09 — Storage Abstraction Layer;
  RF-10 — Endpoint Autenticado; NFR Seguranca/Disponibilidade).
- **Lessons learned:** `Docs/architecture/lessons-learned.md#file-uploads` (entrada
  nova nesta sessao — magic bytes, path traversal, FS efemero, stream vs buffer).
- **ADR-014:** `014-storage-pattern.md` (caso exista — convencao geral de storage
  layer no projeto). Se nao existir, esta ADR estabelece o padrao para image storage.
- **Codigo precedente:** `server/routes/studies-v2.ts:39` — uso atual de
  `path.resolve('uploads/...')` direto. Esta ADR substitui o pattern por service
  abstraction quando aplicado a imagens.
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/spot-screenshots-sequences.mermaid` — fluxos
    upload/serve/delete usam `SpotImageStorage`.
  - `Docs/architecture/diagrams/spot-screenshots-capture-flow.mermaid` — caminhos
    de captura convergem no service.
- **Out of scope:** S3 impl real (deploy), Cloud signed URLs (comunidade),
  EXIF stripping, image compression (sharp).
