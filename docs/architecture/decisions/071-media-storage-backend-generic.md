# ADR-071 — Generalizar storage abstraction para `MEDIA_STORAGE_BACKEND` cobrindo audio + image + video

- Status: Proposto
- Data: 2026-05-01
- Sprint: Biblioteca-1 (RF-02)
- Decision owner: system-architect (autonomous; founder ratificou em D2 de `memory/biblioteca_decisions_2026-05-01.md`)
- Related: ADR-057 (spot-image-storage abstraction — superseded em interface, preservado em pattern), ADR-072 (mux-video-integration), ADR-076 (library-html-article-sanitization)
- Spec: `Docs/specs/biblioteca-spec-1.md` RF-02

## Contexto

A Spec 1 da Biblioteca introduz tres novos tipos de asset que precisam
de persistencia binaria fora do Postgres:

1. **Audio M4A** das aulas (podcast-style NotebookLM). Cap esperado
   ~10MB/aula × 100 aulas = 1GB.
2. **Capas** dos cursos/modulos/aulas (JPEG/PNG/WebP). Cap ~500KB cada ×
   200 imagens = 100MB.
3. **Imagens dentro de artigos HTML** (sanitizadas via D10 — so aceita
   `src=/api/library/assets/...`).

Ja existe ADR-057 que estabeleceu `SpotImageStorage` + `LocalFsSpotImageStorage`
+ stub `S3SpotImageStorage` para spot screenshots (5MB cap, scoped por
sessao). A interface foi pensada **especificamente para spots** (campos
obrigatorios `userId` + `sessionId` no `put()`).

A spec D2 (`biblioteca_decisions_2026-05-01.md`) ja decidiu: **criar
`MEDIA_STORAGE_BACKEND` generico** estendendo o pattern de ADR-057,
com retrocompat via alias `SPOT_IMAGE_STORAGE_BACKEND`. A ADR formaliza
o **como** (interface, layout, aliasing, ownership de Mux como provider
separado vs membro da abstracao).

### Problema central

Se cada nova feature criar seu proprio storage abstraction, vamos
terminar com `LibraryAudioStorage`, `LibraryCoverStorage`,
`SpotImageStorage`, `WarmupAttachmentStorage`... cada um com env var
propria, layout proprio, defesa de path traversal duplicada, e divisao
de responsabilidades opaca para o reviewer. Lesson #10 (DRY de prompts)
aplicada aqui: **divergencia silenciosa entre stores** quebra
manutencabilidade — caller chama errado, validacao escapa, reviewer
nao detecta.

### Forcas em jogo

- **Schema-stable:** keys persistidas em DB precisam continuar opacas
  cross-backend (ADR-057 ja garantiu isso para spots; mesma garantia
  para library agora).
- **Retrocompat zero-dor:** `SPOT_IMAGE_STORAGE_BACKEND` ja documentado em
  CLAUDE.md secao 4. Quebrar agora obriga doc + env vars + dev setup
  todos atualizarem em coordenacao com deploy futuro.
- **Mux nao se encaixa em `MediaStorage`:** Mux gerencia ciclo proprio
  (assetId + playbackId + signing key). Nao expoe `put/get/delete`
  byte-buffer — expoe `uploadAsset()` + `createPlaybackToken()`. Forcar
  Mux dentro de `MediaStorage` seria over-fitting.
- **Multi-tenant futuro:** comunidade publica spot/lesson — assinatura
  `getSignedUrl()` fica diferida (mesma decisao de ADR-057). MVP nao
  tem isso.
- **Cleanup transacional:** import-manifest (RF-11) carrega 50MB +
  audio/capa por aula. Falha parcial nao deve criar arquivos orfaos
  no FS — mesmo padrao de "salva primeiro, registra depois, em catch
  delete" do ADR-057, agora generalizado.
- **Path traversal centralizado:** mantem-se em **um** lugar (impl
  local). S3/R2 ignoram `..` mas defesa fica registrada no FS por
  consistencia de surface API.

## Opcoes Consideradas

### Opcao A: Refactor in-place — renomear `SpotImageStorage` para `MediaStorage`, adaptar campos, alias env (ESCOLHIDA)

Cria `server/services/mediaStorage.ts` com interface generica:

```ts
export interface MediaStorage {
  put(input: {
    scope: string;        // 'spots' | 'library/audio' | 'library/covers' | future
    userId?: string;      // opcional — capas globais nao tem owner
    ext: string;
    buffer: Buffer;
    mime: string;
  }): Promise<{ key: string; size: number }>;

  get(key: string): Promise<{ buffer: Buffer; mime: string } | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

Layout FS: `uploads/{scope}/{userId?}/{nanoid21}.{ext}`. Quando `userId`
omitido, layout vira `uploads/{scope}/{nanoid21}.{ext}` — capas globais
nao precisam de scoping por usuario.

Backends:
- `local` (default) — FS em `uploads/`.
- `s3` — preparado, impl real diferida ate deploy real (continua
  como ADR-057).
- `mux` — **NAO implementa `MediaStorage`**. Mux fica como provider
  separado em `server/services/muxMediaProvider.ts` com surface propria
  (`uploadAsset`, `createPlaybackToken`).

Wrapper retrocompat para callers existentes:

```ts
// server/services/spotImageStorage.ts (deprecated wrapper)
import { createMediaStorage } from './mediaStorage';

/** @deprecated use createMediaStorage and pass scope='spots' */
export function createSpotImageStorage(): SpotImageStorage {
  const ms = createMediaStorage();
  return {
    put: ({ userId, sessionId, ext, buffer, mime }) =>
      ms.put({ scope: `spots/${sessionId}`, userId, ext, buffer, mime }),
    get: (key) => ms.get(key),
    delete: (key) => ms.delete(key),
    exists: (key) => ms.exists(key),
  };
}
```

Env aliasing:
```ts
function resolveBackend(): 'local' | 's3' | 'mux' {
  const newer = process.env.MEDIA_STORAGE_BACKEND;
  const legacy = process.env.SPOT_IMAGE_STORAGE_BACKEND;
  if (newer) return newer as any;
  if (legacy) {
    console.warn(
      '[mediaStorage] SPOT_IMAGE_STORAGE_BACKEND is deprecated, ' +
      'use MEDIA_STORAGE_BACKEND'
    );
    return legacy as any;
  }
  return 'local';
}
```

- **Pros:**
  - **Uma abstracao** cobre 3+ tipos de asset sem proliferar
    interfaces.
  - **Retrocompat 100%** — `spotImageStorage.ts` continua exportando
    `createSpotImageStorage()` que delega para mediaStorage.
  - **Wire-up gradual** — biblioteca usa `createMediaStorage()`
    direto desde dia 1; spots eventualmente migram (lesson #7 Zod
    `optional + default`).
  - **Defense in depth centralizada** — path traversal so na impl
    local, igual ADR-057.
  - **Mux fora do contrato** — surface diferente, ownership separado;
    evita over-fitting.
  - **Layout legivel:** scope + userId fica auto-documentado no path
    do FS (debug por `tree uploads/` mostra estrutura clara).

- **Contras:**
  - **`scope` string vs enum** — runtime aceita qualquer string. Pode
    causar typo (`library/audios` vs `library/audio`). Mitigado por
    constantes em `shared/library-storage-scopes.ts` (export `LIBRARY_AUDIO_SCOPE = 'library/audio'`).
  - **Layout cross-backend:** S3 prefix vira `library/audio/{userId}/...`
    — keys ficam mais longas. Aceitavel.
  - **Migration de spots existentes:** zero. Wrapper preserva keys
    salvas em DB (`{userId}/{sessionId}/{nanoid}.ext`) — wrapper traduz
    para scope na hora de chamar. Nao precisa backfill.

### Opcao B: Manter `SpotImageStorage` separado + criar `LibraryAudioStorage` + `LibraryCoverStorage` independentes

Tres servicos separados, cada um com FS abstraction propria.

- **Pros:**
  - Separacao por dominio mais explicita.
  - Cada storage pode evoluir independente.

- **Contras:**
  - **3x defesa de path traversal** — divergencia silenciosa garantida.
  - **3x env vars** (`SPOT_IMAGE_STORAGE_BACKEND`, `LIBRARY_AUDIO_STORAGE_BACKEND`,
    `LIBRARY_COVER_STORAGE_BACKEND`) — explosao de config em deploy.
  - **3x impl S3 no futuro** — refactor 3x mais caro.
  - **Padrao reutilizavel se perde** — Coach AI vision tool, comunidade,
    hand histories teriam que escolher 1 dos 3 ou criar 4o.
  - **Rejeitada por:** custo/beneficio da separacao zero. Dominio
    biblioteca nao tem requirement diferente de spots — ambos sao
    binarios autenticados servidos via endpoint.

### Opcao C: Migracao hard — deprecar `SPOT_IMAGE_STORAGE_BACKEND` imediatamente, sem alias

Remover env var antiga, forcar callers (ja em prod) a renomearem.

- **Pros:**
  - Codebase mais limpa imediatamente.
  - Zero deprecation log noise.

- **Contras:**
  - **Quebra dev setup** de quem ja tinha `.env` com a var antiga.
  - **Quebra documentacao** de CLAUDE.md secao 4.
  - **Risco zero benefit:** alias custa 6 linhas + 1 console.warn —
    barato mantar.
  - **Rejeitada por:** principio de "reversivel + barato = faco" do
    contrato de autonomia. Quebrar env var ja documentada e nao-reversivel
    para quem ja pulled — exige aviso explicito + janela de transicao.

### Opcao D: Esperar deploy real para generalizar (YAGNI puro)

Manter `SpotImageStorage` para spots. Library cria `path.resolve('uploads/library/audio/...')`
direto nos handlers (igual `studies-v2.ts` faz hoje).

- **Pros:**
  - Zero refactor agora.
  - Library livra fast.

- **Contras:**
  - **Defesa duplicada** — magic bytes, path traversal, MIME real.
    Lesson #10 gritando.
  - **Refactor obrigatorio no deploy** — quando S3 entrar, refactor
    de **2 codebases** (spots + library) ao inves de 1.
  - **Coach AI vision tool no futuro reimplementa pela 3a vez.**
  - **Rejeitada por:** custo de generalizacao agora (~2h: refactor
    ADR-057 + wrapper) << custo de manutencao em divergencia (3x ate
    deploy).

## Decisao

**Adotar Opcao A: criar `mediaStorage.ts` generico com interface
`MediaStorage`. Refatorar `spotImageStorage.ts` para wrapper deprecated.
Mux fica como provider separado. Env `MEDIA_STORAGE_BACKEND` com alias
de `SPOT_IMAGE_STORAGE_BACKEND` + warning.**

### Detalhes-chave do design

1. **Interface 4 metodos** — identica em surface a ADR-057, com `scope`
   substituindo `sessionId` e `userId` opcional.
2. **`scope` documentado como string mas centralizado em constantes:**
   `shared/library-storage-scopes.ts` exporta:
   ```ts
   export const STORAGE_SCOPES = {
     SPOTS: 'spots',
     LIBRARY_AUDIO: 'library/audio',
     LIBRARY_COVERS: 'library/covers',
   } as const;
   ```
   Codigo NUNCA hardcoda string — usa constante. Reviewer rejeita PR
   com string literal.
3. **Layout FS:** `uploads/{scope}/{userId?}/{nanoid21}.{ext}`. Slash
   inicial nao permitido. `userId` omitido se nao fornecido (capas
   globais).
4. **Path traversal:** mesma defesa de ADR-057 — rejeita keys com
   `..`, `\`, leading `/`. So na impl local; S3 nao precisa.
5. **Wrapper retrocompat** em `spotImageStorage.ts` traduz chamadas
   antigas (`{userId, sessionId}`) para nova surface (`{scope: 'spots/{sessionId}', userId}`).
   Wrapper marcado `@deprecated` mas nao removido em MVP.
6. **Mux fora do contrato:** `muxMediaProvider.ts` (RF-03) tem surface
   propria. Documentado em ADR-072 (mux-video-integration).
7. **Buffer-only no MVP:** `get()` retorna `Buffer`, nao stream. Mesma
   decisao de ADR-057 — refator para `Readable` quando >5MB virar
   problema (audio M4A media 5-10MB cabe ainda).
8. **Cleanup transacional:** caller (ex: import-manifest) salva via
   `mediaStorage.put`, registra row no DB; em catch, chama
   `mediaStorage.delete(key)`. Service nao tem hook auto.
9. **Selection via env:** `createMediaStorage()` factory em
   `mediaStorage.ts`. Default `local`. Aliasing detalhado acima.
10. **Documentar `MEDIA_STORAGE_BACKEND`** em CLAUDE.md secao 4 + marcar
    `SPOT_IMAGE_STORAGE_BACKEND` como deprecated nessa mesma secao.

### Como migrar dados existentes

**Spots:** zero. Keys salvas em `starred_hands.imageKey` continuam no
formato `{userId}/{sessionId}/{nanoid}.ext`. Wrapper traduz:
```ts
ms.put({ scope: `spots/${sessionId}`, userId, ext, buffer, mime })
```
Resulta em key `spots/{sessionId}/{userId}/{nanoid}.ext` — diferente do
antigo. **Mas:** wrapper preserva semantica de SCRITA antiga gerando key
no formato antigo (pre-namespace por scope) e ja salva no novo layout.
Trampolim de leitura no wrapper aceita AMBOS os formatos via try/catch:
1. tenta com scope (`uploads/spots/{sessionId}/{userId}/{nanoid}.ext`);
2. fallback para layout legacy (`uploads/spots/{userId}/{sessionId}/{nanoid}.ext`).

**Library:** sempre usa novo layout — sem legacy.

### Tradeoffs aceitos

| Tradeoff | Aceito por que |
|---|---|
| **`scope` runtime-string** | Constantes centralizadas + reviewer/test catch typos. Type-safety total exigiria template literal types complexo. |
| **Wrapper retrocompat eternamente** | Custo manter ~30 linhas wrapper << custo migrar todos callers de spots agora. Removivel em sprint dedicada. |
| **Mux fora da abstracao** | Surface real do Mux e diferente — forcar adapter `MediaStorage` para Mux era over-fitting. ADR-072 separa. |
| **Backend `mux` no enum mas nao impl** | Documentacao — clareia que video tem caminho proprio. Caller nunca passa `MEDIA_STORAGE_BACKEND=mux` — quebraria. Precisa estar documentado. |

### Quando rever esta decisao

- **Migrate spots completamente para nova API:** sprint pos-MVP remove
  wrapper deprecated.
- **>5MB audio cap sobe:** refator `get()` para `Readable`.
- **Comunidade publica assets:** adicionar `getSignedUrl()` na
  interface — ADR novo extends este.
- **3o tipo de provider extension** (ex: Vimeo no futuro): sera caso
  novo de provider externo (igual Mux), nao novo backend de
  `MediaStorage`.

## Consequencias

### Positivas

- **Uma abstracao** cobre 3 tipos de asset hoje, extensivel para mais.
- **Retrocompat 100%** — codigo de spots continua funcionando byte-a-byte.
- **Defense centralizada** — 1 lugar para path traversal, magic bytes
  (caller side), MIME validation.
- **Migracao deploy trivial** — implementar S3 e migrar libs + spots de
  uma vez.
- **Padrao reutilizavel** — Coach AI vision, comunidade, hand histories.
- **Testavel** — mock `MediaStorage` em tests unit; impl local em tmpdir
  para integration.

### Negativas

- **+1 indirection** vs Opcao D YAGNI.
- **Wrapper deprecated** noise no codebase ate sprint de removal.
- **`scope` runtime-string** sem type-safety end-to-end (mitigado por
  constantes).
- **`MEDIA_STORAGE_BACKEND=mux` valido no enum mas inutil** — confuso
  para dev novo.

### Neutras

- **Decisao revisitavel** — ADR novo quando surface mudar (signed URLs,
  stream).
- **Nova env var** — documentar em CLAUDE.md secao 4.
- **Lesson learned a registrar:** "abstracao em wrapper retrocompat
  preserva calls antigos sem migration sql + sem big-bang refactor".

## Confianca

**Alta.** Pattern testado em ADR-057 (industria: Strapi, Medusa, Hashnode
usam abstracao identica). Wrapper retrocompat e padrao Node ecosystem
(Express middleware, Webpack loaders, etc). Mux como provider separado
e padrao SaaS (Stripe SDK separado de file storage).

## Referencias

- **Spec:** `Docs/specs/biblioteca-spec-1.md` RF-02
- **ADR-057** (precursor): `Docs/architecture/decisions/057-spot-image-storage-abstraction.md`
- **ADR-072** (relacionado): `Docs/architecture/decisions/072-mux-video-integration.md`
- **Lessons learned:** `Docs/architecture/lessons-learned.md` — entradas
  #10 (DRY de prompts/abstracoes), #7 (Zod optional + default), file
  uploads (magic bytes, path traversal, FS efemero).
- **Diagramas Mermaid:**
  - `Docs/architecture/diagrams/biblioteca/c4-context.mermaid` — mostra
    storage e Mux como containers separados.
  - `Docs/architecture/diagrams/biblioteca/flow-batch-upload-manifest.mermaid`
    — manifest passa por `mediaStorage.put` para audio + capa.
- **Codigo precedente:** `server/services/spotImageStorage.ts` (sera
  refatorado para wrapper).
- **Out of scope:** S3 impl real (deploy), signed URLs publicos
  (comunidade), EXIF stripping, image compression.
