# Spec: EST-3 — Study Recording + Stat Analysis

> Parte do overhaul Estudo + IA (`00-master-plan.md` §EST-3). **D7: EST-4 absorvido** — Parte A (análise de stat NET-NEW) + Parte B (registro enriquecido) entregues juntas, em **1 migration** e **1 form de registro unificado**. **D4: estender `study_sessions_v2`**, não criar tabela nova.

## Status
Proposta

## Resumo
Permite ao jogador (a) **analisar uma stat HUD específica dentro de um tema**: filtrar suas jogadas por essa stat e, por jogada, salvar print da jogada + print da solução GTO + texto de erro + texto de aprendizado, tudo revisável depois sob `tema → stat`; e (b) **registrar sessões de estudo enriquecidas** com nº de mãos solucionadas, nº de filtros analisados e insights da aula. Consumidores: jogador MTT (revisão própria) e o Weekly Report do Coach (EST-2, consome os counts/métricas).

## Contexto
Hoje `study_sessions_v2` registra modo/tempo/tema mas não captura o trabalho de revisão de stat (print da jogada + print da solução + insight) nem métricas finas de produtividade (mãos solucionadas, filtros). O founder quer transformar o estudo de stat num artefato persistente e revisável, e enriquecer o registro para alimentar a interpretação qualitativa do mentor (EST-2). Prioridade no grafo: EST-3 produz métricas que EST-2 consome (master-plan §grafo).

## Usuários
- **Jogador MTT (owner):** cria sessão de estudo (qualquer modo), cria sessão `stat_analysis` a partir de uma stat, faz upload dos 2 prints por jogada, escreve erro/aprendizado, revê depois por tema/stat.
- **Coach AI (consumidor indireto, EST-2):** lê counts agregados (mãos solucionadas, filtros analisados, nº de entradas `stat_analysis`, tempo por tema) — **não nesta spec**, apenas a fonte de dados é criada aqui.

---

## Requisitos Funcionais

### RF-01: Novo modo `stat_analysis` em `study_sessions_v2`
**Descrição:** adicionar o modo `stat_analysis` ao enum de modos. Uma sessão nesse modo representa a análise de **uma** stat HUD dentro de **um** tema.
**Regras de negócio:**
- `stat_analysis` **exige** `themeId` (não-nulo, ownership do user) — espelha a regra de `drill_gto`/`other` em `validateModeRequirements`.
- `stat_analysis` **exige** `statId` (não-nulo).
- `statId` é um id do catálogo HUD estático (`shared/hud-stat-catalog.ts`) **ou** um id custom no formato `custom_*`. **Não é FK** (catálogo é estático, segue padrão de `user_focus_stats.statId`).
- Demais modos (`drill_gto|tournament_review|hand_review|lesson|other`) continuam funcionando; `statId` permanece nulo para eles.
**Critério de aceitação:**
- [ ] `STUDY_SESSION_MODES` inclui `stat_analysis`.
- [ ] Criar sessão `stat_analysis` sem `themeId` → 400 `MISSING_THEME`.
- [ ] Criar sessão `stat_analysis` sem `statId` → 400 `MISSING_STAT`.
- [ ] `statId` aceito quando é id do catálogo OU casa `^custom_[A-Za-z0-9_-]{1,48}$`; caso contrário → 400 `INVALID_STAT_ID`.
- [ ] Modos existentes continuam aceitando `statId` ausente/nulo sem erro (regressão).

### RF-02: Coluna `statId` + estrutura `statAnalysisEntries`
**Descrição:** adicionar à tabela `study_sessions_v2`:
- `statId varchar(64)` (nullable).
- `statAnalysisEntries jsonb` (nullable) = array de entradas de jogada analisada.
**Shape de uma entry:**
```
{
  id: string,                 // nanoid(21), gerado server-side por entry (estável p/ upload/edição)
  filters: string,            // descrição livre dos filtros usados (ex: "BTN vs BB, 3bet pot, SPR<3"); ver Q-OPEN-2 p/ object vs string
  playImageKey: string|null,  // key privada da imagem da jogada (RF-04)
  solutionImageKey: string|null, // key privada do print da solução GTO (RF-04)
  errorText: string,          // o que errou (max 1000)
  learnedText: string,        // o que aprendeu (max 1000)
  createdAt: string           // ISO, server-side
}
```
**Regras de negócio:**
- `statAnalysisEntries` cap **10** entradas por sessão.
- `filters` max 500 chars. `errorText`/`learnedText` max 1000 chars cada.
- Apenas sessões `mode='stat_analysis'` podem ter `statAnalysisEntries` não-vazio. Para outros modos → 400 `STAT_ENTRIES_WRONG_MODE`.
- `playImageKey`/`solutionImageKey` começam `null` e são preenchidos via RF-04 (upload separado, referenciam entry por `id`).
**Critério de aceitação:**
- [ ] Coluna `stat_id` e `stat_analysis_entries` existem na migration (ver Schema Delta).
- [ ] Criar sessão `stat_analysis` com 11 entries → 400 `TOO_MANY_ENTRIES` (limite 10).
- [ ] `errorText`/`learnedText` > 1000 ou `filters` > 500 → 400 `INVALID_BODY`.
- [ ] `statAnalysisEntries` enviado em modo != `stat_analysis` → 400 `STAT_ENTRIES_WRONG_MODE`.
- [ ] Cada entry recebe `id` (nanoid) + `createdAt` server-side mesmo se cliente não enviar.

### RF-03: Registro enriquecido (Parte B — campos polish)
**Descrição:** adicionar campos opcionais de registro a `study_sessions_v2`, aplicáveis a qualquer modo:
- `handsSolvedCount int` — nº de mãos solucionadas na sessão.
- `filtersAnalyzedCount int` — nº de filtros analisados.
- `lessonInsights text` — insights da aula (texto livre). `lessonId` já existe.
**Regras de negócio (lesson #7 — optional+default+back-fill, NÃO required puro):**
- Todos os 3 campos são **opcionais** no Zod (default `null`/back-fill no storage). NUNCA `required`.
- `handsSolvedCount` / `filtersAnalyzedCount`: inteiro `>= 0`, cap superior `1000`.
- `lessonInsights`: max 2000 chars.
- Editáveis via PATCH (RF-06).
**Critério de aceitação:**
- [ ] Criar sessão sem os 3 campos → 201 (back-compat; campos ficam null).
- [ ] `handsSolvedCount` negativo → 400 `INVALID_BODY`.
- [ ] `handsSolvedCount`/`filtersAnalyzedCount`/`lessonInsights` persistem e voltam no GET.
- [ ] Sessões existentes (pré-migration) continuam legíveis com os 3 campos null.

### RF-04: Upload privado de imagem por entrada (play + solução)
**Descrição:** endpoint para anexar uma imagem (jogada **ou** solução) a uma entry específica de uma sessão `stat_analysis`. Reusa o pattern `spotImageStorage` mas em **layout/storage dedicado privado** `private-uploads/stat-analysis/`.
**Regras de negócio:**
- Storage **PRIVADO** — NUNCA servido por static `/uploads`. Prints de solução GTO são copyright de ferramentas (PioSolver/GTO Wizard); exposição pública é violação. Servir só via endpoint com ownership check (espelha ADR-052/`handleServeSpotImage`).
- Upload multipart, **1 arquivo por request**, campo `file`.
- MIME guard por **magic bytes** (`detectMimeFromBuffer`), allowlist `png/jpg/jpeg/webp`; cap **5MB**.
- Request identifica: `sessionId` (path), `entryId` (body/path), `slot` ∈ `{play, solution}`.
- Ownership: sessão pertence ao user E `mode='stat_analysis'`; entry existe na sessão.
- Substituir imagem existente no mesmo slot → deleta a key antiga (rollback/cleanup) e grava a nova; atualiza `playImageKey`/`solutionImageKey` da entry.
- Rollback: se gravou imagem mas falhou ao atualizar a entry no DB, deletar a key órfã (espelha `rollbackSpotImage`).
**Critério de aceitação:**
- [ ] Upload PNG/JPG/JPEG/WebP válido em slot `play` → 200/201; `playImageKey` setado na entry.
- [ ] Upload em slot `solution` → `solutionImageKey` setado.
- [ ] GIF / PDF / mime não-allowlist → 400 `invalid_mime`.
- [ ] Arquivo > 5MB → 413 `file_too_large`.
- [ ] Upload em sessão de outro user → 404 (não confirma existência).
- [ ] Upload em sessão `mode != stat_analysis` → 409 `STAT_ENTRIES_WRONG_MODE`.
- [ ] `entryId` inexistente na sessão → 404 `ENTRY_NOT_FOUND`.
- [ ] Re-upload no mesmo slot substitui a key antiga e a deleta do storage.
- [ ] Key persistida no formato relativo (sem path traversal); imagem NÃO acessível via GET `/uploads/...`.

### RF-05: Servir imagem de entry com ownership
**Descrição:** endpoint que serve o binário de uma imagem (`play`/`solution`) de uma entry, validando ownership (espelha `handleServeSpotImage`, ADR-052).
**Regras de negócio:**
- 404 (não 403) quando a sessão não pertence ao user — não confirma existência.
- `Cache-Control: private, max-age=300`.
- Slot sem imagem → 404.
**Critério de aceitação:**
- [ ] Owner busca imagem existente → 200 + binário + header `Cache-Control: private`.
- [ ] Não-owner → 404.
- [ ] Slot/entry sem imagem → 404.

### RF-06: Editar sessão (stat_analysis + demais modes)
**Descrição:** estender o PATCH de sessão para aceitar os campos novos editáveis. Mantém imutabilidade de `mode/source/durationMinutes/startedAt/endedAt` (regra existente).
**Regras de negócio:**
- PATCH passa a aceitar: `statAnalysisEntries` (só em `stat_analysis`; re-valida cap 10 + tamanhos + preserva keys de imagem já setadas — ver Q-OPEN-3), `handsSolvedCount`, `filtersAnalyzedCount`, `lessonInsights`, além dos atuais (`notes`, `themeId`, `wasProductive`, `attachments`).
- `statId` **imutável** após criação (vincula a sessão a uma stat; mudar quebra a revisão por stat). Tentar editar → 400 `IMMUTABLE_FIELD`.
- Editar `statAnalysisEntries` em sessão `mode != stat_analysis` → 400 `STAT_ENTRIES_WRONG_MODE`.
**Critério de aceitação:**
- [ ] PATCH com `handsSolvedCount`/`filtersAnalyzedCount`/`lessonInsights` → 200 + persiste.
- [ ] PATCH adicionando entry (até cap 10) → 200; > 10 → 400 `TOO_MANY_ENTRIES`.
- [ ] PATCH com `statId` → 400 `IMMUTABLE_FIELD`.
- [ ] PATCH `mode`/`durationMinutes` continua 400 `IMMUTABLE_FIELD` (regressão).

### RF-07: Revisão por stat dentro do tema
**Descrição:** método de storage + endpoint de leitura que retorna as entradas de análise de stat de um tema (opcionalmente filtradas por `statId`), para renderizar a revisão "por stat dentro do tema" no ThemeDetailView.
**Regras de negócio:**
- `getStatAnalysisEntries(userId, themeId, statId?)` retorna as sessões `mode='stat_analysis'` do user no tema (e stat, se informado), com suas entries + counts.
- Ownership: filtra por `userId`; tema deve pertencer ao user.
- **Ver risco/Q-OPEN-1 (índice) — decisão do architect.**
**Critério de aceitação:**
- [ ] `GET .../stat-analysis?themeId=X` retorna todas as sessões `stat_analysis` do tema do user.
- [ ] `GET .../stat-analysis?themeId=X&statId=Y` filtra por stat.
- [ ] Tema de outro user → 403/404 (não vaza entries).
- [ ] Resposta inclui, por sessão: `statId`, entries (com URLs de imagem servidas via RF-05, não keys cruas), counts.

### RF-08: UI — form de registro unificado + surfaces
**Descrição:** um único form de registro de sessão, com campos condicionais por `mode`. Modo `stat_analysis` acessível a partir de uma stat (StatsView / ThemeDetailView) via "Analisar esta stat".
**Regras de negócio (fluxo):**
- Form unificado renderiza campos base (modo, tema, duração, notas) + bloco condicional por modo.
- Bloco `stat_analysis`: stat pré-preenchida (vinda do contexto), campo de filtros usados, lista de jogadas — cada jogada com: upload print da jogada, upload print da solução, campo erro, campo aprendizado. Botão "adicionar jogada" (até 10).
- Bloco enriquecido (qualquer modo): campos `handsSolvedCount`, `filtersAnalyzedCount` e, se `lessonId` presente, `lessonInsights`.
- Surface 1: StatsView e ThemeDetailView têm ação "Analisar esta stat" → abre o form em modo `stat_analysis` com `statId`+`themeId` pré-preenchidos.
- Surface 2: ThemeDetailView lista as entradas de análise agrupadas por stat (consome RF-07).
- Surface 3: `/estudos/sessao/:id` mostra as entries (prints + erro/aprendizado) + os counts (`handsSolvedCount`/`filtersAnalyzedCount`).
**Critério de aceitação:**
- [ ] "Analisar esta stat" em StatsView/ThemeDetailView abre form com stat+tema pré-preenchidos.
- [ ] Form permite adicionar até 10 jogadas; bloqueia a 11ª.
- [ ] Cada jogada permite upload de 2 prints (jogada+solução) + 2 textos.
- [ ] ThemeDetailView lista entradas por stat.
- [ ] `/estudos/sessao/:id` exibe entries + counts.
- [ ] (lesson #29) componentes que usam `useQuery` sem provider em teste são isolados via ErrorBoundary local.

---

## Requisitos Não-Funcionais
- **Segurança:** imagens de stat_analysis em `private-uploads/stat-analysis/`, NUNCA sob static `/uploads`; acesso só via endpoint com ownership (404 para não-owner). MIME por magic bytes, não por header. Path-traversal bloqueado pelo `LocalFsSpotImageStorage`.
- **Performance:** `getStatAnalysisEntries` deve usar índice (ver Q-OPEN-1); evitar full-scan de `study_sessions_v2` por tema. Servir imagem com `Cache-Control: private, max-age=300`.
- **Rate limiting:** upload de imagem limitado (espelhar `screenshotUploadLimiter` ~30/5min/user); serve-image ~100/min/user.
- **Compatibilidade (lesson #7):** todos os campos novos opcionais + default/back-fill no storage; zero quebra para sessões e modos existentes.
- **Custo de storage:** cap 10 entries × 2 imagens × 5MB = 100MB pior caso por sessão `stat_analysis` — aceitável; documentar limpeza ao deletar sessão (RF — ver Edge Cases).

## Endpoints Previstos
| Método | Rota | Descrição | Auth | Notas |
|---|---|---|---|---|
| POST | /api/study-sessions | Criar sessão (todos modos, incl. stat_analysis + campos B) | JWT | estende handler existente |
| PATCH | /api/study-sessions/:id | Editar sessão (entries + counts + lessonInsights) | JWT | estende handler existente |
| GET | /api/study-sessions/:id | Detalhe da sessão (entries com URLs de imagem) | JWT | **confirmar se já existe; pode precisar criar** (Q-OPEN-4) |
| POST | /api/study-sessions/:id/stat-analysis/entries/:entryId/image | Upload imagem (slot play/solution) | JWT | multipart, campo `file`, query/body `slot` |
| GET | /api/study-sessions/:id/stat-analysis/entries/:entryId/image/:slot | Servir imagem com ownership | JWT | 404 não-owner; Cache-Control private |
| GET | /api/study-themes/:themeId/stat-analysis | Entradas de análise por tema (filtro `?statId=`) | JWT | consome `getStatAnalysisEntries` (Q-OPEN-5 path) |

> Os contratos de body/resp dos endpoints estendidos seguem o shape de `study_sessions_v2`. O architect formaliza os paths exatos dos endpoints novos (Q-OPEN-5).

## Modelos de Dados Afetados

### `study_sessions_v2` (alteração — 1 migration)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `stat_id` | varchar(64) | nullable | catalog id OU `custom_*`; NÃO FK (igual `user_focus_stats.stat_id`) |
| `stat_analysis_entries` | jsonb | nullable | array de entries (RF-02); cap 10 enforced em serviço/Zod |
| `hands_solved_count` | integer | nullable, `>=0` | RF-03 |
| `filters_analyzed_count` | integer | nullable, `>=0` | RF-03 |
| `lesson_insights` | text | nullable | RF-03, max 2000 |

**Índice novo (ver Q-OPEN-1 — decisão do architect):** sugerido `(user_id, theme_id, stat_id, mode)` parcial `WHERE mode = 'stat_analysis' AND deleted_at IS NULL` para suportar `getStatAnalysisEntries`.

**Enum:** `STUDY_SESSION_MODES` ganha `stat_analysis` (Zod). CHECK constraint DB-level a critério do architect (existe `mode` como varchar livre hoje; o enum é Zod-only).

**Migration:** drizzle-kit + `_rollback.sql`. Aplicar via psql local (localhost:5433) + documentar pendência prod (convenção §4 master-plan).

## Integrações Externas
Nenhuma nova. Reusa `spotImageStorage` (LocalFs, ADR-057). EST-2 (Coach) consumirá os counts depois — fora desta spec.

## Cenários de Teste Derivados

### Happy Path
- [ ] Criar sessão `stat_analysis` com tema+stat+3 entries (sem imagens) → 201.
- [ ] Upload print da jogada + print da solução em uma entry → keys setadas.
- [ ] GET detalhe da sessão → entries com URLs servíveis + counts.
- [ ] ThemeDetailView lista entradas por stat (RF-07).
- [ ] Criar sessão `drill_gto` com `handsSolvedCount`/`filtersAnalyzedCount` → 201 (Parte B em qualquer modo).

### Validação de Input
- [ ] `stat_analysis` sem `themeId` → 400 `MISSING_THEME`.
- [ ] `stat_analysis` sem `statId` → 400 `MISSING_STAT`.
- [ ] `statId` inválido (não-catalog, não `custom_*`) → 400 `INVALID_STAT_ID`.
- [ ] `errorText`/`learnedText` > 1000, `filters` > 500, `lessonInsights` > 2000 → 400.
- [ ] `handsSolvedCount` negativo / > 1000 → 400.
- [ ] Upload mime não-allowlist → 400 `invalid_mime`; > 5MB → 413.

### Regras de Negócio
- [ ] 11 entries na criação → 400 `TOO_MANY_ENTRIES`.
- [ ] `statAnalysisEntries` em modo != stat_analysis → 400 `STAT_ENTRIES_WRONG_MODE`.
- [ ] Editar `statId` via PATCH → 400 `IMMUTABLE_FIELD`.
- [ ] Editar `mode`/`durationMinutes` → 400 `IMMUTABLE_FIELD` (regressão).
- [ ] Re-upload no mesmo slot substitui e deleta a key antiga.

### Edge Cases
- [ ] **Cap de entries:** PATCH que ultrapassa 10 → rejeitado; entries existentes preservadas.
- [ ] **Sessão sem tema:** `stat_analysis` exige tema → 400; demais modos sem tema seguem regra atual.
- [ ] **Upload órfão:** imagem gravada mas falha no DB → key deletada (rollback). Verificar.
- [ ] **statId custom:** `custom_meu_stat` aceito; `custom_` vazio ou com `/`/`..` → 400 `INVALID_STAT_ID`.
- [ ] **Deletar sessão `stat_analysis`:** soft delete 24h gate (existente) — definir se imagens privadas são limpas no hard-delete/cron (ver Q-OPEN-6).
- [ ] **Entry sem imagem:** GET serve-image → 404; detalhe da sessão não quebra (URLs null).
- [ ] **Ownership cross-user:** upload/serve/lista em sessão ou tema de outro user → 404/403 sem vazar.
- [ ] **Path traversal:** `entryId`/`slot` maliciosos não escapam o root (validado por `LocalFsSpotImageStorage`).

## Questões Abertas pro Architect (ADR)
- **Q-OPEN-1 (RISCO CRÍTICO — D4 tradeoff):** `study_sessions_v2` é **session-level**, mas a revisão pedida é "por stat dentro do tema". Precisa de **índice** `(user_id, theme_id, stat_id, mode)` (parcial `WHERE mode='stat_analysis'`) + método storage `getStatAnalysisEntries(userId, themeId, statId?)`. Confirmar a forma do índice (parcial vs total), se `deleted_at IS NULL` entra na cláusula, e se a agregação é por-sessão ou achatada por-entry. **Decisão do ADR, não resolvida aqui.**
- **Q-OPEN-2:** `filters` deve ser `string` livre ou `object` estruturado (`{position, potType, spr, ...}`)? Master-plan permite ambos (`{...}|string`). Spec assume **string livre** por simplicidade; architect decide se vale estruturar (impacta UI + futura agregação no Coach).
- **Q-OPEN-3:** semântica do PATCH de `statAnalysisEntries` — substituição total do array vs merge por `entry.id`? Como preservar `playImageKey`/`solutionImageKey` já setados via upload quando o cliente reenvia o array (lesson #43 — PATCH semantic, omitir vs sobrescrever). Recomendação: PATCH faz merge por `id` e nunca zera keys de imagem se a entry não as menciona.
- **Q-OPEN-4:** existe `GET /api/study-sessions/:id` hoje? (handler atual só tem create/list/patch/delete/finalize). Se não, criar para a surface `/estudos/sessao/:id` (RF-08 surface 3).
- **Q-OPEN-5:** paths exatos dos endpoints novos (image upload/serve, lista por tema) — sob `/api/study-sessions/...` vs `/api/study-themes/...`. Definir no ADR + checar colisão de rota (lição starred-hands: `/:id/discard` separado de `/:id`).
- **Q-OPEN-6:** ciclo de vida das imagens privadas — ao hard-delete da sessão (pós 24h soft-delete), as keys em `private-uploads/stat-analysis/` devem ser limpas por cron? (espelha cron de expiração de spots F2). Definir.
- **Q-OPEN-7:** instância de storage — reusar o singleton `spotImageStorage` (root `private-uploads/spots`) com sub-path `stat-analysis`, ou instanciar um `LocalFsSpotImageStorage` dedicado com root `private-uploads/stat-analysis`? `put()` hoje grava `userId/sessionId/file` — para stat-analysis o `sessionId` da sessão de estudo serve como segundo nível; confirmar se o `slot`/`entryId` entram na key ou ficam no DB.

## Fora de Escopo
- Conteúdo/prompt do Weekly Report ou consumo das métricas pelo Coach (**EST-2**).
- Ritual de segunda interativo (**EST-5**) e planejamento da semana (**EST-6**).
- Análise automática (OCR/IA) dos prints de jogada/solução. Aqui o jogador escreve erro/aprendizado manualmente.
- Comparação automática jogada vs solução; é só armazenamento + revisão manual.
- Backend S3 para imagens (`SPOT_IMAGE_STORAGE_BACKEND=s3` permanece não-implementado, ADR-057).
- Migração das imagens de estudo públicas existentes (`uploads/study-images/`) para privado.
- Cronômetro live para `stat_analysis` (assume `manual_post_hoc`/`completed`; reuso de `running` não é objetivo desta spec).

## Dependências
- `study_sessions_v2` + handlers existentes (`server/routes/study-sessions.ts`).
- `spotImageStorage` (ADR-057) + `detectMimeFromBuffer`/`extFromMime`.
- HUD catalog (`shared/hud-stat-catalog.ts`) para validar `statId` de catálogo.
- StatsView / ThemeDetailView (frontend) para as surfaces da UI.

## Notas de Implementação (não-normativas)
- Handlers novos: aceitar `injectedStorage?` como 3º arg (lesson #34) para testabilidade sem `vi.mock('../storage')`.
- Testes `.tsx`: usar `await import(...)`, nunca `require()` (lessons #14/#26/#38).
- Componentes com `useQuery` sem provider em teste: isolar via ErrorBoundary local (lesson #29).
- Reusar `multerErrorHandler` + `rollbackSpotImage` pattern do `starred-hands.ts`.
- `statId` validável contra catálogo via lookup em `hud-stat-catalog` + regex para `custom_*`.
