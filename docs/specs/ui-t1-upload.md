# Spec: Sprint UI-T1-Upload — Upload Onboarding por Rede + Tutorial Visual (P0)

## Status
Proposta — aguarda aprovacao do founder antes de spawn `system-architect`

## Resumo
Refactor da pagina `/upload` (`UploadHistory.tsx`, 605 linhas), pagina P0 de entrada do app pos-cadastro, para:
(1) eliminar abandono de novos usuarios via tutorial visual + sample CSVs por rede de poker;
(2) reduzir blast radius removendo `GranularDataCleanup` (acao destrutiva) da mesma pagina de upload;
(3) elevar qualidade de UX das listas/stats via filtros, sparklines, confirmacoes e error inline.

Resolve achados U1, U3, U4, U5, U6, U7, U8, U11 do audit `Docs/ux-audit-2026-05-02/audit-tier1-library-upload.md`.

## Contexto
- **Por que P0:** `UploadHistory` eh a primeira pagina que um usuario novo encontra apos cadastro. Sem onboarding adequado (qual rede aceita? qual formato? como exportar?) o usuario abandona — o app nao tem dados sem upload, e o app nao tem valor sem dados.
- **Posicao no roadmap UX:** Fase 2 do `implementation-plan.md`, sprint UI-T1-Upload. Pre-requisitos UI-FND-1 (Foundation: PageHeader/EmptyState/FilterChip/tokens) e UI-QW-1 (PageHeader + EmptyState ja aplicados em UploadHistory) ESTAO ENTREGUES.
- **Independente:** sprint stats analyzer paralelo nao toca esta pagina (Dashboard.tsx, Studies.tsx). Conflito esperado: nenhum.
- **Founder QA OBRIGATORIA antes merge** — pagina P0, regressao em onboarding = abandono real de novos signups.

## Usuarios

- **Novo usuario (signup recente, sem dados):** chega aqui, precisa entender qual rede usa, como exportar CSV de la, e testar o sistema sem precisar exportar dados reais. Hoje encontra apenas um drop-zone generico — alta friccao.
- **Usuario ativo (importa semanalmente):** ja sabe usar, mas precisa de filter bar + delete confirmation para gerenciar uploads acumulados. Hoje a lista cresce indefinidamente sem filtros.
- **Power user (limpeza de dados antigos):** ocasionalmente precisa de bulk delete por site/periodo. Hoje encontra `GranularDataCleanup` colado no fim da pagina de upload — acao destrutiva acoplada a fluxo de import. Move-out para Settings reduz risco de confusao.

## Requisitos Funcionais

### RF-01: Tutorial visual por rede de poker (resolve U1, P0 critico)

**Descricao:** acima do card `<AutoUpload>` na pagina `/upload`, exibir componente `<NetworkImportGuide>` com tabs horizontais por rede de poker. Cada tab mostra 3 steps numerados de "como exportar do site origem" + botao "Baixar exemplo CSV" + link opcional para documentacao do parser.

**Regras de negocio:**

- **Redes suportadas (10 tabs, ordem fixa):** WPN, GGNetwork, PokerStars, PartyPoker, 888poker, Bodog, CoinPoker, Chico, Revolution, iPoker. Lista deriva de `server/csvParser.ts` linhas 711-743 (network detection) + parsers especificos.
- **Layout das tabs:** horizontal scrollavel em mobile (overflow-x-auto + snap), pills no desktop. Tab ativa destacada via `tokens.color.action.bg` (Foundation).
- **Persistencia:** tab ativa salva em `localStorage` com chave `grindfy.upload.activeNetworkTab`. Default na primeira visita = `WPN` (rede mais comum). Carrega valor salvo em `useEffect` apos hooks (lesson #1 hooks-first).
- **Conteudo de cada tab (estrutura uniforme via sub-componente `<NetworkGuideContent>`):**
  - Header: logo PNG da rede (de `attached_assets/`) + nome legivel + 1 frase curta de contexto.
  - 3 steps numerados (1, 2, 3) com:
    - Texto curto (1-2 frases) descrevendo a acao no site origem (ex: "Acesse historico de torneios no client").
    - Optional placeholder para screenshot futuro (slot reservado em `<figure>` com `aria-label` mas SEM imagem real nesta sprint — ver Decisao Pendente DP-2).
  - Botao "Baixar exemplo CSV" (`<Button variant="default">`) → trigger download via `<a download>` apontando para asset estatico `client/src/assets/samples/<rede>.csv`. Use `tokens.color.action` (CTA primario).
  - Link secundario "Ver redes suportadas no parser" → URL `/docs/parser` (rota nao existe ainda — link inerte ate Sprint dedicado de Docs; pode usar `<a>` com `aria-disabled` por ora).
- **Persistencia accessibility:** tabs implementadas via Radix `<Tabs>` (`@/components/ui/tabs`). Cada `<TabsTrigger>` ganha `data-testid="network-tab-{redeKey}"`. Conteudo ganha `data-testid="network-guide-{redeKey}"`.
- **Empty content fallback:** se conteudo de uma rede nao for preenchido na entrega (improvavel mas defensivo), tab existe mas mostra mensagem "Tutorial em preparacao" + botao "Baixar exemplo CSV" ainda funcional.

**Criterio de aceitacao:**

- [ ] 10 tabs renderizadas na ordem WPN, GGNetwork, PokerStars, PartyPoker, 888poker, Bodog, CoinPoker, Chico, Revolution, iPoker.
- [ ] Tab ativa muda conteudo da `<NetworkGuideContent>` sem reload.
- [ ] Tab ativa persiste em localStorage (`grindfy.upload.activeNetworkTab`) e carrega na proxima visita.
- [ ] Cada tab tem 3 steps numerados visualmente distintos (badge numerico + texto).
- [ ] Botao "Baixar exemplo CSV" inicia download de `<rede>-sample.csv` (verificavel via `download` attr no `<a>` ou intercepcao de click no teste).
- [ ] Mobile: tabs scrollam horizontalmente sem quebrar layout.
- [ ] `<NetworkImportGuide>` aparece ACIMA do card `<AutoUpload>` (ordem DOM auditavel).
- [ ] `data-testid` aplicados conforme spec acima (testabilidade — lesson #2).

### RF-02: Error inline por secao (resolve U3)

**Descricao:** substituir error global da pagina (linhas 104-123 atuais) por errors INLINE em cada query/secao. Upload card sempre disponivel mesmo se uma query falha.

**Regras de negocio:**

- Remover bloco `if (uploadHistoryQuery.isError && siteStatsQuery.isError) return ...` (linhas 104-125).
- Cada secao independente ganha tratamento proprio:
  - **Upload card (`<AutoUpload>`):** SEMPRE renderizado (nao depende de query). Permanece intacto.
  - **Stats cards (3 cards de RF-06):** se `siteStatsQuery.isError` ou `uploadHistoryQuery.isError`, exibir card individualmente em estado de erro inline:
    - Numero principal substituido por `"—"`.
    - Texto secundario "Falha ao carregar — clique para tentar de novo".
    - Card inteiro virara `<button>` com `onClick={refetch}`.
    - Tooltip Radix com mensagem de erro detalhada (`error?.message`) para debug.
  - **Lista de uploads:** se `uploadHistoryQuery.isError`, em vez do `<EmptyState>` ou da lista, exibir mensagem de erro inline com botao "Tentar novamente" → `uploadHistoryQuery.refetch()`. Use `tokens.color.danger` para feedback visual (Foundation).
- Tratamento de loading mantido por secao (skeleton por secao, nao spinner full-page).
- Remover spinner full-page da pagina (linhas 94-103). Substituir por skeletons inline por card/secao usando `<Skeleton>` shadcn.

**Criterio de aceitacao:**

- [ ] Quando `siteStatsQuery` falha mas `uploadHistoryQuery` sucesso: stats cards mostram "—" + retry; lista normal; upload card normal.
- [ ] Quando ambas falham: 3 cards stats em erro + lista em erro; upload card AINDA renderiza e funcional.
- [ ] Quando ambas loading: 3 skeletons + lista skeleton + upload card normal (sem spinner full-page).
- [ ] Botao retry em cada secao chama `query.refetch()` da query daquela secao.
- [ ] `<EmptyState>` so aparece quando `data.length === 0` E nao ha erro.
- [ ] `data-testid="stats-card-error-{kind}"`, `data-testid="upload-list-error"`.

### RF-03: Mover GranularDataCleanup para Settings (resolve U4)

**Descricao:** cortar componente `GranularDataCleanup` (linhas 354-588 + 377-605) de `UploadHistory.tsx`. Mover para `client/src/components/settings/GranularDataCleanup.tsx` (export default funcional inalterado). Adicionar entrada em `Settings.tsx` como section "Avancado > Limpeza de Dados", SEM refatorar Settings shell (sera Sprint UI-REF-2).

**Regras de negocio:**

- **Mover, nao copiar.** UploadHistory perde definicao + uso do componente.
- **Novo path:** `client/src/components/settings/GranularDataCleanup.tsx`. Export default. Renomear o sub-componente local `function GranularDataCleanup()` para `export default function GranularDataCleanup()`.
- **Imports preservados:** queries, mutations, hooks ja autocontidos no componente — sem dependencia externa quebrada.
- **Integracao em Settings.tsx:**
  - Adicionar nova section/card no fim do Settings principal (apos as ultimas sections existentes ou em uma `Card` proprio).
  - Section ganha `id="cleanup"` no DOM (anchor) + heading h2 "Limpeza de Dados Avancada".
  - Renderizar `<GranularDataCleanup />` dentro da section.
  - **NAO refatorar shell de Settings** (1176 linhas). Adicao minima invasiva — 5-10 linhas de JSX.
  - **Manter scrollIntoView funcional:** rota `/settings#cleanup` deve scrollar para a section. Adicionar `useEffect` curto que checa `window.location.hash === '#cleanup'` e chama `document.getElementById('cleanup')?.scrollIntoView({ behavior: 'smooth' })`.
- **Recovery affordance em UploadHistory:** rodape da pagina (apos lista de uploads) ganha link discreto:
  - Componente: `<Link to="/settings#cleanup">` (Wouter).
  - Texto: "Precisa limpar dados antigos? Acesse Settings > Limpeza de Dados".
  - Visual: `text-sm text-muted-foreground`, sem CTA destacado (acao rara — power user).
  - `data-testid="link-to-cleanup"`.
- **Smoke test ambas paginas:** `/upload` deve continuar funcional sem o componente; `/settings` deve renderizar componente movido com mesma funcionalidade.

**Criterio de aceitacao:**

- [ ] `GranularDataCleanup` removido de `UploadHistory.tsx` (grep "GranularDataCleanup" em UploadHistory retorna 0 hits da definicao + 0 hits de `<GranularDataCleanup />`).
- [ ] `client/src/components/settings/GranularDataCleanup.tsx` existe com `export default`.
- [ ] `Settings.tsx` importa e renderiza componente em section com `id="cleanup"`.
- [ ] Rota `/settings#cleanup` scrolla para a section ao carregar.
- [ ] Link em UploadHistory rodape leva para `/settings#cleanup`.
- [ ] Smoke test: importar CSV em `/upload` continua funcional. Limpeza em `/settings#cleanup` continua funcional.

### RF-04: Confirmacao no delete de upload (resolve U5)

**Descricao:** substituir delete direto do botao trash (linhas 305-313 atuais) por `<AlertDialog>` Radix com confirmacao explicita.

**Regras de negocio:**

- Botao trash (icone `Trash2`) abre `<AlertDialog>` em vez de chamar `deleteUploadMutation.mutate(upload.id)` direto.
- Conteudo do dialog:
  - Titulo: `"Excluir upload?"`.
  - Descricao (interpolada): `"Excluir upload '{filename}'? {tournamentsCount} torneios serao removidos. Esta acao nao pode ser desfeita."`.
  - Botao cancelar: `<AlertDialogCancel>` com texto `"Cancelar"`.
  - Botao confirmar: `<AlertDialogAction>` com texto `"Excluir N torneios"` (interpolado), `variant="destructive"` (vermelho via `tokens.color.danger`).
- Dialog usa Radix `<AlertDialog>` ja em `client/src/components/ui/alert-dialog.tsx` (ja existe).
- **Estado:** componente local `<UploadRow>` (extraido) gerencia open state com `useState`. Uma vez aberto e confirmado, chama mutation. Cancelar fecha dialog sem chamada.
- **Loading:** durante `deleteUploadMutation.isPending`, botao confirmar disabled + texto "Excluindo...".
- **Decisao founder D-04:** padronizar copy "Excluir N torneios" (verbo+objeto descritivo conforme `ui-patterns.md` secao 4 — CTA primario).
- `data-testid="delete-upload-button-{id}"` (trash original), `data-testid="confirm-delete-upload-{id}"` (botao confirmar no dialog).

**Criterio de aceitacao:**

- [ ] Click no trash abre AlertDialog (nao deleta direto).
- [ ] Cancelar fecha dialog SEM chamar mutation (verificavel via mock).
- [ ] Confirmar chama mutation com `upload.id`.
- [ ] Botao confirmar tem variant destructive (red).
- [ ] Texto interpolado correto: filename + tournamentsCount.
- [ ] Durante pending: botao disabled + texto "Excluindo...".
- [ ] Apos sucesso: toast success + dialog fechado + lista atualizada.
- [ ] Apos erro: toast error + dialog fechado.

### RF-05: Filter bar na lista de uploads (resolve U6)

**Descricao:** acima da lista de uploads, adicionar barra de filtros (Status + Site + busca por filename). Aplicar filter local (sem chamada server). Chips ativos via `<FilterChipGroup>` Foundation.

**Regras de negocio:**

- **3 controles na barra:**
  1. Select "Status": opcoes `Todos | Sucesso | Erro`. Default `Todos`. `data-testid="filter-status"`.
  2. Select "Site": opcoes derivadas dos sites distintos em `uploadHistoryQuery.data` (extrair via `Array.from(new Set(uploads.map(u => u.site || 'Desconhecido')))`). Adicionar opcao `Todos` no inicio. Default `Todos`. `data-testid="filter-site"`.
     - **Nota:** se `upload` nao tiver campo `site` (modelo atual nao garante), usar campo equivalente disponivel ou exibir badge "Desconhecido". Verificar via test-writer/system-architect contra schema real (`upload_history` table) — assumido `site` mas pode ser inferido via extension ou metadado.
  3. Input busca filename: `<Input>` com placeholder `"Buscar por nome do arquivo..."`. Match case-insensitive `includes`. `data-testid="filter-filename"`.
- **Aplicacao:** filtro local em useMemo derivado de `uploadHistoryQuery.data`:
  ```ts
  const filteredUploads = useMemo(() => {
    return (uploadHistoryQuery.data ?? []).filter(u =>
      (statusFilter === 'all' || u.status === statusFilter) &&
      (siteFilter === 'all' || (u.site ?? 'Desconhecido') === siteFilter) &&
      (filenameFilter === '' || u.filename.toLowerCase().includes(filenameFilter.toLowerCase()))
    );
  }, [uploadHistoryQuery.data, statusFilter, siteFilter, filenameFilter]);
  ```
- **Chips ativos via `<FilterChipGroup>`:** abaixo da barra de filtros, exibir chips para filtros ativos (nao `'all'` e nao string vazia). Cada chip remove o filtro correspondente ao clicar X.
  ```tsx
  <FilterChipGroup
    chips={[
      ...(statusFilter !== 'all' ? [{ key: 'status', label: `Status: ${labelStatus}`, onRemove: () => setStatusFilter('all') }] : []),
      ...(siteFilter !== 'all' ? [{ key: 'site', label: `Site: ${siteFilter}`, onRemove: () => setSiteFilter('all') }] : []),
      ...(filenameFilter !== '' ? [{ key: 'filename', label: `Busca: "${filenameFilter}"`, onRemove: () => setFilenameFilter('') }] : []),
    ]}
    onClearAll={() => { setStatusFilter('all'); setSiteFilter('all'); setFilenameFilter(''); }}
  />
  ```
- **Empty state pos-filtro:** se `filteredUploads.length === 0` E `uploadHistoryQuery.data.length > 0` (ha uploads, mas filtros zeraram), exibir `<EmptyState>` com:
  - title: `"Nenhum upload corresponde aos filtros"`.
  - description: `"Ajuste os filtros para ver mais resultados."`.
  - ctaLabel: `"Limpar filtros"`.
  - ctaAction: `() => { setStatusFilter('all'); setSiteFilter('all'); setFilenameFilter(''); }`.
  - area: `"upload-filtered"`.
- **Empty state original** (`uploadHistoryQuery.data.length === 0`) continua intocado (cobrindo "nunca importou").
- **Decisao founder D-05:** filtros NAO persistem em URL (decisao founder pendente — assume default `false` para Sprint atual; pode ser feature futura). Filtros vivem em `useState` local apenas.

**Criterio de aceitacao:**

- [ ] 3 controles renderizados acima da lista (Status, Site, Filename).
- [ ] Aplicar filtro Status="Erro" reduz lista para apenas uploads com `status === 'error'`.
- [ ] Aplicar filtro Site="WPN" reduz lista para uploads com `site === 'WPN'`.
- [ ] Busca por filename match case-insensitive substring.
- [ ] Chips ativos aparecem abaixo da barra para cada filtro ativo.
- [ ] Click em X do chip remove o filtro correspondente.
- [ ] Botao "Limpar tudo" aparece quando >=2 chips ativos.
- [ ] EmptyState pos-filtro aparece quando filtros zeram resultado.
- [ ] EmptyState original (sem uploads) continua funcionando.

### RF-06: Stats cards com sparkline + delta vs semana passada (resolve U7)

**Descricao:** os 3 stat cards atuais (Total Torneios, Sites Ativos, Uploads Concluidos) ganham sparkline de 7 dias + delta numerico vs semana passada. Backend nao precisa mudar — calculos client-side a partir de `uploadHistoryQuery.data`.

**Regras de negocio:**

- **Calculo de timeseries 7d (client-side):**
  - Para cada um dos ultimos 7 dias (incluindo hoje), contar:
    - **Total Torneios:** soma de `tournamentsCount` de uploads com `uploadDate` no dia.
    - **Sites Ativos:** count distinct `site` de uploads com `uploadDate` no dia.
    - **Uploads Concluidos:** count de uploads com `status === 'success'` e `uploadDate` no dia.
  - Output: `Array<{ value: number; date: string }>` com 7 itens em ordem cronologica.
  - Helper extraido: `client/src/lib/upload-stats.ts` exportando `computeStatsTimeseries(uploads, days = 7)`.
- **Calculo de delta:**
  - **Esta semana:** soma/count dos ultimos 7 dias (incluindo hoje).
  - **Semana passada:** soma/count dos 7-14 dias atras.
  - **Delta:** `esta - passada`. Exibir como `"+12 essa semana"` (verde se >0), `"-3 essa semana"` (vermelho se <0), `"0 essa semana"` (cinza se =0).
  - Para "Sites Ativos" o delta tem semantica diferente — comparar count distinct atual vs count distinct semana passada (mesma logica `count distinct sites`).
- **Visual em cada card:**
  - Numero principal mantido (texto grande).
  - Sparkline `<Sparkline>` (componente existente em `client/src/components/Sparkline.tsx`) com `type="area"`, `height={40}`, `trend` derivado do delta (positivo=up/verde, negativo=down/vermelho, neutro=color default).
  - Delta abaixo do sparkline: pequeno texto em cor semantica via `tokens.color.{success|danger|neutral}`.
- **Edge cases:**
  - Sem dados nos ultimos 7d: sparkline mostra placeholder "-" (componente ja trata `data.length === 0`).
  - Sem dados na semana anterior: delta mostra "Primeira semana" em cinza (info, nao success/danger).
- **Hover scale removido:** lesson global UI-QW-1 ja deve ter removido `hover:scale-[1.02]` dos cards. Verificar e limpar se ainda presente.
- `data-testid="stat-card-{kind}"` (kind = `total-tournaments | active-sites | completed-uploads`), `data-testid="stat-sparkline-{kind}"`, `data-testid="stat-delta-{kind}"`.

**Criterio de aceitacao:**

- [ ] 3 cards continuam renderizando com numero principal correto.
- [ ] Cada card mostra `<Sparkline>` com 7 pontos (1 por dia).
- [ ] Cada card mostra delta numerico textual abaixo do sparkline.
- [ ] Delta positivo: cor success (verde).
- [ ] Delta negativo: cor danger (vermelho).
- [ ] Delta zero: cor neutra.
- [ ] Sem dados na semana anterior: texto "Primeira semana" exibido em cor info/neutra.
- [ ] Helper `computeStatsTimeseries(uploads, 7)` testavel em isolamento (unit test).
- [ ] Sparkline `trend` casa com sinal do delta.

### RF-07: Remover bloco morto `uploadResult` (resolve U8)

**Descricao:** o state `uploadResult` (linhas 26-31) e o bloco JSX condicional `{uploadResult?.show && ...}` (linhas 341-368) sao codigo morto — `setUploadResult` nunca eh chamado em lugar algum. Remover ambos.

**Regras de negocio:**

- **Opcao A (escolhida na spec — cleanup):** remover declaracao do state + bloco JSX completamente. Mantem `AutoUpload onUploadComplete` apenas com toast/invalidate (logica existente preservada).
- **Justificativa:** lesson #11 (sem default decorativo) + anti-pattern 2.10 (codigo morto). Reintroducao futura possivel via `AutoUpload onUploadComplete` se feature `result.imported/errors/duplicates` for desejada — mas nao e escopo desta sprint.
- **Decisao founder D-07:** se founder quiser ATIVAR a feature (Opcao B), reverter eh trivial — passar `result` do `AutoUpload` para `setUploadResult({ ...result, show: true })`. Mas spec atual = Opcao A.

**Criterio de aceitacao:**

- [ ] State `uploadResult` removido (grep retorna 0 hits em UploadHistory.tsx).
- [ ] Bloco JSX `{uploadResult?.show && ...}` removido.
- [ ] Funcionalidade existente (toast pos-upload + invalidate queries) preservada.
- [ ] Type check + tests passam.

### RF-08: Helper `invalidateAfterUpload` centralizado (resolve U11)

**Descricao:** extrair as 12 chamadas `queryClient.invalidateQueries` (linhas 152-168) para helper reutilizavel em `client/src/lib/upload-helpers.ts`. UploadHistory consome o helper. Futuros consumers (ex: AutoUpload em outras paginas) tambem.

**Regras de negocio:**

- **Novo arquivo:** `client/src/lib/upload-helpers.ts`.
- **Export named:**
  ```ts
  import type { QueryClient } from '@tanstack/react-query';

  export function invalidateAfterUpload(queryClient: QueryClient): void {
    const keys = [
      ['/api/upload-history'],
      ['/api/upload-stats'],
      ['/api/tournaments/sites'],
      ['/api/dashboard/stats'],
      ['/api/tournaments'],
      ['/api/analytics/by-site'],
      ['/api/analytics/by-category'],
      ['/api/analytics/by-speed'],
      ['/api/analytics/by-buyin'],
      ['/api/analytics/by-month'],
      ['/api/analytics/by-field'],
      ['/api/analytics/final-table'],
      ['/api/debug/date-range'],
    ];
    keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
  }
  ```
- **UploadHistory consumo:** substituir bloco de 13 linhas no `AutoUpload onUploadComplete` por uma linha:
  ```tsx
  onUploadComplete={(result) => {
    setIsUploading(false);
    invalidateAfterUpload(queryClient);
    toast({ title: "Sucesso", description: result.message ?? "Upload realizado com sucesso" });
  }}
  ```
- **Decisao founder D-08:** lista de queryKeys mantida igual a hoje (13 keys). Se novo upload-related query for adicionado no futuro, atualizar helper em UM lugar — nao em multiples consumers.
- **Mesma chamada deve existir tambem em** `GranularDataCleanup.tsx` movido (linhas 423-428 originais — ja invalida 5 keys). Avaliar SE faz sentido reutilizar `invalidateAfterUpload` la (pode invalidar excessivo) ou manter helper separado `invalidateAfterCleanup`. **Decisao na spec:** manter `GranularDataCleanup` com sua propria lista atual (5 keys) — nao force consolidacao desnecessaria. Helper `invalidateAfterUpload` exclusivo para fluxo de import.

**Criterio de aceitacao:**

- [ ] `client/src/lib/upload-helpers.ts` exporta `invalidateAfterUpload(queryClient)`.
- [ ] Funcao invalida 13 query keys especificas (verificavel via mock `vi.spyOn(queryClient, 'invalidateQueries')`).
- [ ] UploadHistory chama helper em `onUploadComplete` em vez do bloco literal.
- [ ] Type check passa.
- [ ] Unit test do helper isolado.

## Requisitos Nao-Funcionais

- **Performance:** `<NetworkImportGuide>` renderiza tab ativa apenas (lazy via Radix `<TabsContent>` controlled). Outras tabs renderizam ao clicar. Bundle adicional <15KB minified ungzipped (10 tabs + sub-componentes + tutorial content).
- **Acessibilidade:**
  - Tabs com keyboard navigation nativa Radix (arrow keys, Home/End).
  - Focus visible em todos botoes (`focus-visible:ring-2`).
  - Sample CSV download via `<a download>` ou `<button>` com `aria-label="Baixar CSV exemplo da rede X"`.
  - AlertDialog confirmacao de delete: focus trap + Escape close (Radix nativo).
  - `motion-reduce:transition-none` em quaisquer transicoes adicionais.
- **Idioma:** todas strings de UI em PT-BR (consistente com app). Codigo em ingles.
- **Foundation compliance:** componente novo (`<NetworkImportGuide>`) consome tokens (`tokens.space`, `tokens.color`, `tokens.font`) e nao introduz magic numbers ou color values inline. Reviewer reprova drift.
- **Testabilidade:** `data-testid` em todos elementos chave (lesson #2). Sample CSVs sao assets estaticos (testaveis via Vite import + mock).
- **i18n-ready:** strings centralizadas em consts no topo do componente para futura migracao i18n (sem implementar i18n agora — apenas evitar strings inline duplicadas).

## Endpoints Previstos

**Nenhum endpoint novo.** Sprint e 100% frontend (consume endpoints existentes):

| Metodo | Rota | Uso atual |
|---|---|---|
| GET | /api/upload-history | Lista de uploads (RF-02, RF-04, RF-05, RF-06) |
| GET | /api/upload-stats | Stats agregadas (RF-02, RF-06) |
| GET | /api/tournaments/sites | Sites ativos (RF-02, RF-06) |
| DELETE | /api/upload-history/:id | Deletar upload (RF-04) |
| POST | /api/tournaments/bulk-delete/preview | Preview de bulk delete (movido para Settings em RF-03) |
| POST | /api/tournaments/bulk-delete | Bulk delete (movido para Settings em RF-03) |

## Modelos de Dados Afetados

**Nenhum modelo afetado.** Sprint nao toca schema, migrations ou tabelas Drizzle.

**Assuncao a validar (system-architect):** modelo `upload_history` retorna campo `site` (necessario para filter Site em RF-05). Caso nao retorne, opcoes:
1. Inferir site do filename ou metadados existentes.
2. Adicionar `site` ao schema (defere para Sprint dedicado de schema).
3. Em Sprint atual: filtro Site so funciona se campo existe; senao mostra "Desconhecido" e filtro reduz a 1 opcao.

## Integracoes Externas

**Nenhuma.** Sprint nao adiciona integracoes externas. AutoUpload component permanece intocado.

## Cenarios de Teste Derivados

### Happy Path

- [ ] Usuario novo abre `/upload`: ve tabs por rede com WPN ativa, ve `<AutoUpload>` abaixo, ve EmptyState na lista (sem uploads).
- [ ] Usuario clica tab "PokerStars": conteudo da tab muda para tutorial PokerStars; tab fica ativa visualmente; localStorage atualiza.
- [ ] Usuario clica "Baixar exemplo CSV" em tab "WPN": browser inicia download do arquivo `wpn-sample.csv`.
- [ ] Usuario importa CSV via `<AutoUpload>`: invalidateAfterUpload chamado; toast success; lista atualiza com novo upload.
- [ ] Usuario aplica filtro Site="WPN": lista filtra; chip "Site: WPN" aparece.
- [ ] Usuario clica X no chip: filtro removido; lista volta ao normal.
- [ ] Usuario clica trash em upload: AlertDialog abre; clica "Excluir N torneios"; mutation chamada; toast success; lista atualiza.

### Validacao de Input

- [ ] Filtro Status com valor invalido (ex: undefined em useState inicial): comportamento default `'all'`.
- [ ] Busca por filename com string vazia: nao filtra (mostra todos).
- [ ] Busca por filename com whitespace: trim antes de comparar (decisao spec: NAO trim — match literal; founder pode mudar).

### Regras de Negocio

- [ ] Tab ativa persiste apos reload (localStorage).
- [ ] Sem dados nos ultimos 7d: sparkline mostra placeholder; delta mostra "Primeira semana".
- [ ] Sem dados na semana passada (so esta semana): delta mostra "Primeira semana" (nao numero negativo).
- [ ] Delta positivo: cor verde + icone up no sparkline.
- [ ] Delta negativo: cor vermelha + icone down no sparkline.
- [ ] AlertDialog confirmar: chama mutation com id correto.
- [ ] AlertDialog cancelar: NAO chama mutation.
- [ ] Apos delete: lista re-fetch + chip de filtro permanece se aplicado.

### Edge Cases

- [ ] Stats query falha: cards mostram "—" + retry funcional.
- [ ] Lista query falha: erro inline + retry funcional.
- [ ] Upload card ainda renderiza mesmo com ambas queries falhando.
- [ ] Filtros zeram lista: EmptyState "Nenhum upload corresponde aos filtros" com botao "Limpar filtros".
- [ ] Lista vazia (nunca importou): EmptyState "Nenhum upload encontrado" original mantido.
- [ ] localStorage corrompido (`'PokerStars2'` invalido): fallback para `'WPN'` default.
- [ ] localStorage indisponivel (incognito + storage disabled): tab ativa funciona em memoria, nao quebra.
- [ ] 100+ uploads na lista: filtro funciona instantaneo (filter local com useMemo).
- [ ] Upload sem campo `site`: filtro Site mostra "Desconhecido" como opcao.
- [ ] AlertDialog aberto durante refresh de lista: dialog state preservado (estado local do `<UploadRow>`).
- [ ] Click duplo rapido no trash: dialog abre 1 vez (Radix gerencia).
- [ ] Mobile portrait: tabs scrollam horizontal sem quebrar layout.
- [ ] Click rapido em multiplas tabs: ultima clicada vence (Radix controlled).
- [ ] Settings.tsx scroll para `#cleanup` falha (id nao existe): nao crasha, scroll fica no topo.

### Regressao (zero quebra de existente)

- [ ] AutoUpload component renderiza intocado (sem mudanca de props ou logica interna).
- [ ] `<PageHeader>` Foundation continua aplicado (UI-QW-1).
- [ ] `<EmptyState>` Foundation continua aplicado (UI-QW-1).
- [ ] Toast de sucesso/erro funciona como antes.
- [ ] Mutation de delete funciona como antes (so envolve dialog).
- [ ] GranularDataCleanup movido para Settings funciona EXATAMENTE como antes (preview + bulk delete + confirmacao "CONFIRMAR").
- [ ] Outras paginas que talvez consumam `/api/upload-history` ou `/api/upload-stats` nao quebram (Dashboard pode consumir indiretamente — verificar).

## Fora de Escopo

Explicitamente NAO faz parte deste sprint (para evitar scope creep do implementer):

- **Refatorar `Settings.tsx` shell** (1176 linhas) — fica para Sprint UI-REF-2.
- **Implementar i18n real** — strings ficam em consts no componente, mas sem framework i18n.
- **Persistir filtros em URL** — fica para feature futura ou padrao global (Dashboard FP-11 ja persiste; pode virar padrao).
- **Substituir confirmacao "CONFIRMAR" do GranularDataCleanup por contextual** (achado U12 do audit) — sem mudanca, so move o componente.
- **Adicionar screenshot real** em cada step do tutorial — slot reservado mas conteudo deferido para Sprint dedicado de "assets visuais".
- **Implementar pagina `/docs/parser`** — link inerte ate Sprint dedicado de documentacao.
- **Mudar parser CSV** (`server/csvParser.ts`) — sprint e 100% frontend.
- **Adicionar campo `site` ao schema `upload_history`** — se nao existe, fallback "Desconhecido".
- **Implementar feature de result summary** (Opcao B do RF-07) — apenas remove codigo morto.
- **Migrar `<AutoUpload>` para outra pagina** — componente intocado.
- **Refatorar `Dashboard.tsx` ou `Studies.tsx`** — sprint stats analyzer paralelo.
- **Adicionar reatividade real-time** (websocket de upload progress) — feature futura.

## Dependencias

**Pre-requisitos ja entregues:**

- **Sprint UI-FND-1 (Foundation):** ENTREGUE. Componentes consumidos: `<PageHeader>`, `<EmptyState>`, `<FilterChip>`, `<FilterChipGroup>`, tokens (`tokens.space`, `tokens.color`, `tokens.font`, `tokens.motion`).
- **Sprint UI-QW-1 (Quick Wins):** ENTREGUE. UploadHistory ja tem PageHeader + EmptyState aplicados.
- **Componentes existentes:** `<Sparkline>`, `<AlertDialog>` Radix, `<Tabs>` Radix, `<AutoUpload>` (intocado), `<Skeleton>` shadcn.

**Dependencias internas (mesma sprint):**

- RF-03 (mover GranularDataCleanup) deve ser feito ANTES de RF-05 (filter bar) — para evitar conflito de import/scope no arquivo.
- RF-08 (helper invalidate) deve ser feito ANTES de RF-02 (error inline) — helper sera testado isolado e usado em onUploadComplete refatorado.

**Sem dependencia externa de outras sprints em paralelo:**

- Stats analyzer paralelo: NAO toca `Dashboard.tsx`, `Studies.tsx`, ou `client/src/components/studies/**`. Upload e independente.

## Riscos e Mitigacoes

| Risco | Severidade | Mitigacao |
|---|---|---|
| Sample CSVs nao validos (parser rejeita) | Alta | Extrair de `tests/fixtures/*.csv` que ja passam por testes do parser. Ver Decisao Pendente DP-1. |
| Tutorial sem screenshot fica visualmente vazio | Media | Slot reservado em `<figure>` com aria-label. Texto + numeros suficientes para MVP. Screenshots em sprint dedicado depois. Founder QA decide se aceita "tutorial textual" como MVP. |
| Tabs em mobile quebram layout | Media | Radix `<Tabs>` + `overflow-x-auto` + smoke test mobile pelo founder. |
| `upload.site` nao existe no schema | Media | Filter Site fallback "Desconhecido". Verificar com system-architect via grep no schema antes de implementar. |
| GranularDataCleanup movido quebra Settings.tsx (1176 linhas) | Alta | Adicao minima invasiva (5-10 linhas JSX). Smoke test obrigatorio em ambas paginas pos-implementer. |
| Helper `invalidateAfterUpload` invalida queries demais (perf) | Baixa | Lista identica a atual — nao adiciona invalidacoes; apenas centraliza. |
| Anel de tab ativo em localStorage corrompido | Baixa | Fallback para `'WPN'` se valor invalido (try/catch + lista de validos). |
| AlertDialog em loop (click trash multiplo) | Baixa | Radix gerencia open state internamente. State no `<UploadRow>` extraido. |
| Bundle size +15KB excede orcamento Foundation (<8KB tokens) | Baixa | Tutorial content + 10 tabs sao maiores que tokens. Aceitavel — NFR Foundation se aplica so a tokens, nao a sprint Tier 1. |
| Test snapshot churn massivo | Media | Test-writer escreve testes novos para `<NetworkImportGuide>` + atualiza testes existentes de `UploadHistory` que quebrarem. Limite ao escopo desta sprint. |
| Founder QA reprova "tutorial textual sem screenshot" | Alta | DP-2 — perguntar antes de implementer. Se reprovado, sprint divide em duas: T1-Upload-A (textual) + T1-Upload-B (screenshots). |
| `Settings.tsx` ja tem section "Avancado" (conflito de nome) | Baixa | Verificar com grep. Se existir, adicionar `id="cleanup"` na existente; senao criar nova. |

## Decisoes Founder Pendentes (responder ANTES de spawn `system-architect` ou `test-writer`)

| ID | Pergunta | Default proposto | Impacto se default errado |
|---|---|---|---|
| **DP-1** | **Sample CSV format**: extrair de `tests/fixtures/*.csv` (WPN/888/GG/iPoker disponiveis) ou criar fixtures novos minimos (3-5 torneios fake)? | Extrair de fixtures existentes para WPN/888/GGNetwork/iPoker. Para PokerStars/PartyPoker/Bodog/CoinPoker/Chico/Revolution: criar minimal (3 torneios fake) baseado em headers do parser. | Se errado: usuario baixa CSV que parser rejeita → frustacao maior que problema original. |
| **DP-2** | **Screenshot fonte do tutorial**: (a) usar slots vazios com placeholder + texto descritivo (MVP textual), (b) capturar screenshots reais agora (founder fornece), (c) deferir screenshots para sprint dedicada futura. | (a) MVP textual com slot reservado. Sprint futura (UI-T1-Upload-screenshots) adiciona imagens. | Se founder reprova MVP textual: sprint atrasa ou divide em duas. |
| **DP-3** | **Conteudo do tutorial por rede**: founder fornece textos finais OU pm-spec/implementer escreve drafts e founder ajusta no PR? | Implementer escreve drafts curtos (1-2 frases por step) baseados em conhecimento de cada rede. Founder ajusta no PR. | Se errado: drafts ruins → founder reescreve manualmente. |
| **DP-4** | **Confirmacao delete dialog texto**: "Excluir N torneios" (verbo+objeto descritivo, padrao `ui-patterns.md`) ou "Confirmar exclusao" (mais conservador)? | "Excluir N torneios" interpolado. | Pequeno — founder pode ajustar copy no PR. |
| **DP-5** | **Filtros persistem em URL**: SIM (URL state, padrao Dashboard FP-11) ou NAO (apenas useState local nesta sprint)? | NAO — useState local. URL state vira padrao global em sprint dedicada (escopo). | Se SIM: spec cresce ~20% (URL state + back/forward). |
| **DP-6** | **Link inerte para `/docs/parser`**: incluir mesmo sem rota existir (anchor preparada para futuro) ou omitir ate rota existir? | Incluir com `aria-disabled="true"` + tooltip "Em breve". | Pequeno — pode omitir se founder preferir limpeza. |
| **DP-7** | **Settings.tsx scroll-to-anchor**: usar `useEffect` com `setTimeout(scrollIntoView, 100)` (aguarda mount) ou Wouter hash navigation? | `useEffect` com hash check. Wouter nao tem hash navigation nativa. | Pequeno — fallback simples. |
| **DP-8** | **`upload.site` field existe?** Verificar com system-architect ou pm-spec antes de assumir. Se NAO existir: implementar fallback ou adicionar ao schema? | Fallback "Desconhecido" + log warn. Adicionar ao schema fica para sprint futura. | Se SIM existe: filter funciona perfeitamente. Se NAO: filter Site degradado (so 1 opcao "Desconhecido"). |

## Notas de Implementacao (sugestoes para o Implementer)

- **Ordem recomendada de RFs:** RF-08 (helper) → RF-07 (cleanup morto) → RF-03 (mover Cleanup) → RF-04 (delete confirm) → RF-02 (error inline) → RF-05 (filter bar) → RF-06 (sparkline+delta) → RF-01 (tutorial — maior). Razao: RFs simples primeiro (cleanup + helpers), refator estrutural meio, feature nova maior por ultimo.
- **Extrair `<UploadRow>` como sub-componente:** linhas 282-335 de UploadHistory hoje viram componente `client/src/components/upload/UploadRow.tsx`. Recebe props `{ upload, onDelete }`. Gerencia estado local de AlertDialog. Reduz UploadHistory.tsx + permite testar isoladamente.
- **Co-localizar testes:**
  - `client/src/components/upload/__tests__/NetworkImportGuide.test.tsx`
  - `client/src/components/upload/__tests__/UploadRow.test.tsx`
  - `client/src/lib/__tests__/upload-helpers.test.ts`
  - `client/src/lib/__tests__/upload-stats.test.ts`
  - `client/src/components/settings/__tests__/GranularDataCleanup.test.tsx` (smoke test pos-mudanca de path)
  - `client/src/pages/__tests__/UploadHistory.test.tsx` (integration)
- **Hooks-first (lesson #1):** todos useState/useEffect/useQuery/useMutation ANTES de qualquer early return. Tab ativa, filtros, AlertDialog state — tudo no topo.
- **data-testid (lesson #2):** aplicar em tudo que tests precisarem assertar — vide cada RF.
- **Mocks idealizados (lesson #3):** test-writer deve usar shape REAL de `upload_history` retornado pelo backend, NAO inventar. Validar via grep no `storage.ts` ou rodar query manual.
- **Vitest 4 (lesson #4):** projetos ja configurados (`test.projects` em vitest.config). Usar `tests/setup.ts` existente. Polyfills Radix ja presentes.
- **Default minimo (lesson #11):** `<EmptyState>` requer `ctaAction` por design — implementer JA cumpre se usar Foundation.
- **Pode usar `useMemo` para filtros** (RF-05) — performance gratis em listas <1000 itens.
- **Estimativa de esforco:** ver secao abaixo.

## Estimativa de Esforco (Implementer)

| RF | Descricao | Estimativa |
|---|---|---|
| RF-01 | Tutorial visual por rede + sample CSVs (10 redes) | 8-10h |
| RF-02 | Error inline por secao | 2-3h |
| RF-03 | Mover GranularDataCleanup para Settings | 2h |
| RF-04 | AlertDialog confirmacao delete | 1.5h |
| RF-05 | Filter bar + chips ativos | 3h |
| RF-06 | Sparkline + delta vs semana passada | 3-4h |
| RF-07 | Remover uploadResult morto | 0.5h |
| RF-08 | Helper invalidateAfterUpload | 1h |
| **Subtotal codigo** | | **21-25h** |
| Testes TDD (test-writer) | Unit + integration | 6-8h |
| Smoke + reviewer + ajustes | | 2-3h |
| Founder QA + ajustes pos-QA | | 2-4h |
| **TOTAL sprint** | | **~31-40h (4-5 dias dev solo)** |

Bate com estimativa do plano (5 dias). Critical path: RF-01 (tutorial — 25% do esforco). Se DP-1/DP-2 atrasarem, RF-01 destrava primeiro.

---

**Fim da spec UI-T1-Upload v1.0.**
