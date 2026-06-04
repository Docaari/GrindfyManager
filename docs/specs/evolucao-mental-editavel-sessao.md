# Spec: Evolucao Mental Editavel na Sessao

## Status
Aprovada — questoes abertas resolvidas pelo founder. Arquitetura em ADR-242 (bulk-replace atomico + medias derivadas). RF-01/RF-02/RF-04 reescritos para o endpoint bulk; RF-07 invertido (sliders de media saem, viram visao derivada).

## Resumo
Permitir que o jogador, ao editar uma sessao historica de grind, visualize a EVOLUCAO do estado mental ao longo da sessao (serie temporal por break) e edite/adicione/remova os reports individuais de break (foco, energia, confianca, inteligencia emocional, interferencias, breakTime, notes) — em vez de interagir apenas com a media agregada. Para jogadores profissionais de MTT do Grindfy que ja capturam multiplas medicoes mentais durante a sessao via breaks.

## Contexto
Hoje o estado mental durante a sessao e capturado de forma granular na tabela `break_feedbacks` (uma row por break, 5 metricas int 0-10). Porem, no modal de editar sessao historica (`EditSessionDialog.tsx`), o estado mental aparece SO como 5 sliders de media (`energiaMedia`, `focoMedio`, `confiancaMedia`, `inteligenciaEmocionalMedia`, `interferenciasMedia`, campos em `grind_sessions`). A serie granular e descartada na visualizacao do historico. O jogador quer:
1. Ver a evolucao das notas ao longo da sessao (grafico temporal).
2. Reportar varias notas diferentes ao longo da mesma sessao.
3. Editar/adicionar/remover reports individuais de break ao editar uma sessao historica.

Esta feature NAO recria a captura de break (ja existe em /grind-live). Ela expoe e torna editavel, na edicao da sessao historica, a serie ja persistida.

## Usuarios
- **Jogador profissional/semi-profissional de MTT (autenticado):** edita sua propria sessao historica. Ve o grafico de evolucao mental, edita reports de break existentes, adiciona novos reports e remove reports.

## Estado Atual (codigo de referencia)
- Tabela `break_feedbacks` (`shared/schema.ts:727`): `id`, `userId`, `sessionId` (nullable), `breakTime` (timestamp NOT NULL), `foco`/`energia`/`confianca`/`inteligenciaEmocional`/`interferencias` (int 0-10 NOT NULL), `notes` (text nullable), `createdAt`.
- `clampBreakFeedback` (`shared/utils.ts:5`): clampa as 5 metricas para 0-10, default 5 quando NaN.
- `insertBreakFeedbackSchema` (`shared/schema.ts:1861`): omit `id`/`createdAt`, extend 5 metricas `z.number().int().min(0).max(10)`.
- Storage (`server/storage.ts`): `getBreakFeedbacks(userId, sessionId?)` (`:4188`, ORDER BY breakTime DESC), `getBreakFeedbacksBySessionIds` (`:4203`), `createBreakFeedback` (`:4218`, gera `nanoid()`), `deleteBreakFeedback(id)` (`:4227`, sem ownership). **NAO existe `updateBreakFeedback`.**
- Endpoints (`server/routes/grind-sessions.ts`): `GET /api/break-feedbacks?sessionId=` (`:1369`), `POST /api/break-feedbacks` (`:1381`, usa `clampBreakFeedback` + `insertBreakFeedbackSchema.parse`). **NAO existe PUT nem DELETE por id.**
- Edit dialog (`client/src/components/grind-session/EditSessionDialog.tsx`): secao "Estado Mental" = 5 sliders de media (`editData.energiaMedia` etc.).
- Save (`client/src/pages/GrindSession.tsx:1147`): `editSessionMutation` faz PUT `/api/grind-sessions/:id` com os `*Media` como string. As medias sao campos independentes em `grind_sessions`.

## Requisitos Funcionais

### RF-01: Endpoint PUT /api/break-feedbacks/:id (atualizar report de break)
**Descricao:** Atualizar um report de break existente do usuario autenticado.
**Regras de negocio:**
- Ownership check ANTES de mutar: buscar o feedback por id, e se `!feedback || feedback.userId !== req.user.userPlatformId`, retornar 404 (mesma postura do padrao audit em `grind-sessions.ts:1219`). NUNCA permitir mutar feedback de outro usuario.
- As 5 metricas devem ser clampadas via `clampBreakFeedback` antes de persistir (0-10, default 5 quando NaN) — reuso obrigatorio, sem duplicar logica.
- `breakTime` editavel: aceitar ISO string e converter para `Date`; se ausente/invalido no body, manter o `breakTime` atual (nao sobrescrever com `now`).
- `notes` editavel: aceitar string ou null; `null`/ausente limpa as notes.
- `sessionId` NAO e editavel via este endpoint (vinculo do break a sessao e imutavel aqui).
- Validar payload com Zod antes de operar (schema de patch dedicado — ver RF-04).
- O endpoint NAO recalcula as medias de `grind_sessions` (ver Questao Aberta Q-01).
**Criterio de aceitacao:**
- [ ] PUT com id valido do proprio usuario atualiza metricas/breakTime/notes e retorna o feedback atualizado (200).
- [ ] PUT em id de outro usuario retorna 404 sem mutar nada.
- [ ] PUT em id inexistente retorna 404.
- [ ] Metrica fora de 0-10 e clampada (ex: 15 -> 10, -3 -> 0).
- [ ] Metrica NaN/ausente vira 5 (paridade com POST).
- [ ] Payload invalido (ex: tipo errado que sobrevive ao clamp) retorna 400.

### RF-02: Endpoint DELETE /api/break-feedbacks/:id (remover report de break)
**Descricao:** Remover um report de break existente do usuario autenticado.
**Regras de negocio:**
- Ownership check ANTES de deletar: buscar por id, se `!feedback || feedback.userId !== userId` retornar 404.
- Apos ownership confirmado, chamar `storage.deleteBreakFeedback(id)` (hard delete; consistente com o uso atual no delete de sessao `grind-sessions.ts:1297`).
- Idempotencia de UX: deletar id ja inexistente retorna 404 (nao 500).
**Criterio de aceitacao:**
- [ ] DELETE de id proprio remove a row e retorna 200 (ex: `{ success: true }`).
- [ ] DELETE de id de outro usuario retorna 404 e NAO remove a row.
- [ ] DELETE de id inexistente retorna 404.

### RF-03: Storage updateBreakFeedback
**Descricao:** Novo metodo no storage para atualizar um break feedback.
**Regras de negocio:**
- Assinatura: `updateBreakFeedback(id: string, data: Partial<...>): Promise<BreakFeedback>` (campos atualizaveis: as 5 metricas, `breakTime`, `notes`). NAO atualiza `userId`/`sessionId`/`id`/`createdAt`.
- Faz `UPDATE ... WHERE id = ? RETURNING *`. O ownership check fica na rota (paridade com `updateGrindSession`, que tambem nao filtra por userId no storage — ver `grind-sessions.ts:1217`).
- Declarar na interface `IStorage` (junto a `createBreakFeedback`/`deleteBreakFeedback`, `server/storage.ts:599`).
**Criterio de aceitacao:**
- [ ] Metodo existe na interface e na implementacao.
- [ ] Atualiza somente campos permitidos e retorna a row atualizada.
- [ ] Nao altera `userId`/`sessionId`/`createdAt`.

### RF-04: Schema Zod de patch de break feedback
**Descricao:** Schema dedicado para validar o body do PUT.
**Regras de negocio:**
- Schema `patchBreakFeedbackSchema` em `shared/schema.ts`, `.strict()`, todos os campos opcionais: 5 metricas (`z.number().int().min(0).max(10)`), `breakTime` (string ISO ou Date coerce), `notes` (`z.string().max(<limite>)` nullable).
- A rota aplica `clampBreakFeedback` ANTES do parse (paridade com POST que clampa primeiro), entao o `.min(0).max(10)` e defense-in-depth.
- Definir limite de tamanho de `notes` (ver Questao Aberta Q-02). Default proposto: 500 chars.
**Criterio de aceitacao:**
- [ ] Body com campo desconhecido e rejeitado (`.strict()`).
- [ ] Todos os campos sao opcionais (PUT parcial permitido).

### RF-05: Grafico de evolucao mental no modal de edicao
**Descricao:** No `EditSessionDialog`, exibir um grafico de linha (Recharts) com a evolucao das 5 metricas ao longo dos breaks da sessao (eixo X = ordem/horario do break, eixo Y = 0-10).
**Regras de negocio:**
- Fonte de dados: `GET /api/break-feedbacks?sessionId=<id>` via TanStack Query (`useQuery`), habilitado apenas quando o dialog esta aberto e ha `sessionId`.
- Ordenar os pontos por `breakTime` ASC para o grafico (o endpoint retorna DESC; reordenar no client).
- 5 linhas (foco, energia, confianca, inteligencia emocional, interferencias) com legenda PT-BR e cores distintas dos `tokens` de UI.
- Eixo Y fixo 0-10.
- O grafico reflete o estado EDITADO em tempo real (apos editar um report na lista RF-06, o grafico atualiza — derivar de um estado local unico compartilhado com a lista; ver RF-06).
**Criterio de aceitacao:**
- [ ] Com >=2 breaks, renderiza linha temporal das 5 metricas ordenada por breakTime ASC.
- [ ] Com 1 break, renderiza ponto unico (sem quebrar).
- [ ] Com 0 breaks, mostra empty state PT-BR ("Nenhuma medicao registrada nesta sessao") em vez de grafico vazio.
- [ ] Editar/remover/adicionar um report (RF-06) reflete no grafico sem reload da pagina.

### RF-06: Lista editavel de reports de break no modal de edicao
**Descricao:** No `EditSessionDialog`, abaixo do grafico, listar os reports de break da sessao com edicao inline.
**Regras de negocio:**
- Cada item exibe: `breakTime` (editavel — input datetime-local ou time), 5 sliders/inputs 0-10 (foco, energia, confianca, int. emocional, interferencias), `notes` (textarea com contador de chars).
- Acao "Adicionar medicao": cria um novo report local com defaults (metricas = 5, breakTime = now ou ultimo+intervalo, notes vazio). Persistido via POST `/api/break-feedbacks` com o `sessionId` da sessao em edicao.
- Acao "Remover" por item: chama DELETE `/api/break-feedbacks/:id`. Pedir confirmacao (AlertDialog) antes de remover.
- Editar item existente: chama PUT `/api/break-feedbacks/:id`.
- Items recem-adicionados ainda nao persistidos: ou persistir on-blur/imediato (gerando id no servidor), ou manter "draft" local e persistir no salvar global. Decidir (ver Questao Aberta Q-03). Decisao default desta spec: persistir cada operacao de break IMEDIATAMENTE (POST/PUT/DELETE proprios), independente do botao "Salvar Alteracoes" da sessao — porque break feedbacks sao entidade propria, com seus proprios endpoints, e isso mantem o modelo de save simples (o save global continua so com as medias + metricas + notas da sessao).
- Apos cada mutacao de break, invalidar a query `['break-feedbacks', sessionId]` (TanStack) + a query do historico/sessoes que exibe `breakCount`/medias (`invalidateQueries` por prefixo, paridade com lesson #21 / patterns existentes).
- Estado servidor via TanStack Query (`useMutation`); UI PT-BR; codigo em ingles; sem emojis em arquivos de codigo (apenas labels de UI podem ter, seguindo o padrao ja presente no dialog — confirmar com hook).
**Criterio de aceitacao:**
- [ ] Lista mostra todos os breaks da sessao ordenados (ASC ou DESC — escolher; default ASC para casar com grafico).
- [ ] Editar valor de um slider + salvar atualiza a row via PUT e o grafico reflete.
- [ ] Adicionar medicao cria row via POST vinculada ao `sessionId` correto.
- [ ] Remover medicao pede confirmacao e deleta via DELETE.
- [ ] Mutacoes invalidam o cache e a lista/grafico re-renderizam sem reload.

### RF-07: Medias derivadas read-only (INVERTIDO por ADR-242 — Q-01 = Opcao B)
**Descricao:** Os 5 sliders de media editaveis SAEM do dialog. As medias viram visao derivada
read-only, recalculadas a partir dos breaks.
**Regras de negocio:**
- Os 5 sliders editaveis de media sao removidos da secao "Estado Mental". As medias passam a ser
  exibidas como leitura (preview calculado no client em tempo real a partir do draft da serie).
- A fonte de verdade persistida das medias e o recalculo do SERVER no bulk endpoint
  (`PUT /api/grind-sessions/:id/break-feedbacks`), na mesma tx do replace dos breaks (media aritmetica
  das 5 metricas do conjunto final). 0 breaks => medias `null` => exibir empty/"sem medicoes".
- O PUT `/api/grind-sessions/:id` legado, vindo do modal, **deixa de enviar `*Media` no body** (as
  medias nao sao mais editadas a mao). Outros caminhos que gravem `*Media` ficam intocados.
- Adicionar texto explicativo PT-BR diferenciando "media da sessao" (resumo derivado) de "evolucao por
  medicao" (serie granular editavel).
**Criterio de aceitacao:**
- [ ] Nao ha mais sliders editaveis de media no modal; as 5 medias aparecem como leitura.
- [ ] As medias exibidas batem com a media aritmetica do draft de breaks em tempo real.
- [ ] Salvar persiste as medias derivadas no server (mesma tx do bulk-replace); 0 breaks => medias null.
- [ ] Ha rotulo PT-BR distinguindo media (resumo) vs evolucao (serie).

## Requisitos Nao-Funcionais
- **Seguranca:** ownership check obrigatorio em PUT e DELETE de break (404 para nao-dono, sem vazar existencia). Validacao Zod antes de qualquer operacao de escrita.
- **Performance:** o grafico usa a query ja existente (`GET /api/break-feedbacks?sessionId=`); nenhum N+1 novo. Query habilitada so com dialog aberto.
- **Consistencia:** reuso de `clampBreakFeedback` e `insertBreakFeedbackSchema` (POST) — sem duplicar regra 0-10.
- **Testabilidade:** handlers das rotas novas devem aceitar `injectedStorage` como 3o arg opcional (lesson #34), com fallback lazy `await import('../storage')` em producao.

## Endpoints Previstos
| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/break-feedbacks?sessionId= | Le serie de breaks da sessao (JA EXISTE) | JWT |
| POST | /api/break-feedbacks | Cria report de break (JA EXISTE) | JWT |
| PUT | /api/grind-sessions/:id/break-feedbacks | **(ADR-242 — ENDPOINT DA FEATURE)** bulk-replace atomico da serie + recalculo das medias derivadas + breakCount | JWT |
| ~~PUT~~ | ~~/api/break-feedbacks/:id~~ | ~~Atualiza report de break~~ — **NAO implementado** (substituido pelo bulk, ADR-242) | — |
| ~~DELETE~~ | ~~/api/break-feedbacks/:id~~ | ~~Remove report de break~~ — **NAO implementado** (delecao via ausencia no payload do bulk, ADR-242) | — |

### Contrato PUT /api/break-feedbacks/:id
Request body (todos opcionais; `.strict()`):
```json
{
  "foco": 7,
  "energia": 6,
  "confianca": 8,
  "inteligenciaEmocional": 5,
  "interferencias": 9,
  "breakTime": "2026-06-04T14:30:00.000Z",
  "notes": "perdi foco apos bad beat"
}
```
Response 200:
```json
{
  "id": "abc123",
  "userId": "USER-0001",
  "sessionId": "sess_xyz",
  "breakTime": "2026-06-04T14:30:00.000Z",
  "foco": 7, "energia": 6, "confianca": 8,
  "inteligenciaEmocional": 5, "interferencias": 9,
  "notes": "perdi foco apos bad beat",
  "createdAt": "2026-06-04T13:00:00.000Z"
}
```
Response 404: `{ "message": "Medicao nao encontrada" }` (id inexistente ou de outro usuario).
Response 400: `{ "message": "Failed to update break feedback" }` (payload invalido).

### Contrato DELETE /api/break-feedbacks/:id
Request: sem body.
Response 200: `{ "success": true }`.
Response 404: `{ "message": "Medicao nao encontrada" }`.

## Modelos de Dados Afetados
Nenhuma alteracao de schema. Tabela `break_feedbacks` ja existe com todos os campos necessarios. **Nenhuma migration nesta feature.**

### break_feedbacks (existente — referencia)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK, nanoid | gerado no create |
| userId | varchar | FK users, NOT NULL, cascade | ownership |
| sessionId | varchar | nullable | vinculo a grind_sessions (imutavel via PUT) |
| breakTime | timestamp | NOT NULL | editavel via PUT |
| foco/energia/confianca/inteligenciaEmocional/interferencias | int | NOT NULL, 0-10 (Zod) | editaveis, clampados |
| notes | text | nullable | editavel via PUT |
| createdAt | timestamp | default now | nao editavel |

## Integracoes Externas
Nenhuma.

## Cenarios de Teste Derivados

### Happy Path
- [ ] GET serie -> renderiza grafico de 5 linhas ordenado por breakTime ASC.
- [ ] PUT atualiza metricas de um break do proprio usuario -> 200 + valores persistidos.
- [ ] DELETE remove um break do proprio usuario -> 200.
- [ ] POST (via "Adicionar medicao") cria break vinculado ao sessionId correto.

### Validacao de Input
- [ ] PUT com metrica 15 -> clampada para 10.
- [ ] PUT com metrica -3 -> clampada para 0.
- [ ] PUT com metrica NaN/ausente -> 5.
- [ ] PUT com `breakTime` invalido -> mantem breakTime atual (nao vira now).
- [ ] PUT com campo desconhecido -> 400 (.strict()).
- [ ] PUT com `notes` acima do limite -> 400 (ou truncado — confirmar Q-02).

### Regras de Negocio (ownership)
- [ ] PUT em break de OUTRO usuario -> 404, row inalterada.
- [ ] DELETE em break de OUTRO usuario -> 404, row presente.
- [ ] PUT/DELETE em id inexistente -> 404 (nao 500).

### Edge Cases
- [ ] Sessao com 0 breaks -> empty state, sem grafico quebrado.
- [ ] Sessao com 1 break -> grafico ponto unico ok.
- [ ] Remover o ultimo break restante -> grafico vira empty state.
- [ ] Editar break + grafico atualiza sem reload (cache invalidado).
- [ ] `notes` = null -> limpa notes existentes.
- [ ] `breakTime` editado para horario fora da janela da sessao -> permitido (sem validacao cruzada nesta fatia; documentar).

## Fora de Escopo
- Recalculo automatico das medias `*Media` de `grind_sessions` a partir dos breaks editados (ver Q-01).
- Validacao cruzada de `breakTime` contra a janela start/end da sessao.
- Captura de break em tempo real (ja existe em /grind-live).
- Soft-delete de break feedbacks (mantem hard delete atual).
- Exibir/editar a serie granular fora do modal de edicao (ex: na aba de historico read-only) — apenas o empty/leitura atual permanece.
- Migration de schema (nada muda no banco).
- Tier gating (break feedback nao tem gate hoje; manter paridade).

## Dependencias
- Tabela `break_feedbacks` + storage create/delete/get + endpoints GET/POST (ja existem).
- `clampBreakFeedback` (`shared/utils.ts`) e `insertBreakFeedbackSchema` (`shared/schema.ts`).
- Recharts (ja e dependencia do projeto).
- TanStack Query (ja em uso).

## Decisao Arquitetural (ADR-242 — substitui o CRUD individual desta spec)

> **IMPORTANTE — leia antes do test-writer.** As decisoes do founder (Q-01 derivar + Q-03 salvar
> junto) tornaram o desenho CRUD-individual desta spec (PUT/DELETE por id em RF-01/RF-02/RF-04)
> arquiteturalmente incorreto por atomicidade. O ADR-242 substitui por um endpoint **bulk-replace
> atomico**:
>
> - **Endpoint unico:** `PUT /api/grind-sessions/:id/break-feedbacks` (substitui o conjunto de
>   breaks da sessao numa transacao + recalcula e persiste as 5 medias derivadas + retorna serie ASC
>   + medias + `breakCount`). Os endpoints PUT/DELETE por id (RF-01/RF-02) e `patchBreakFeedbackSchema`
>   (RF-04) **NAO sao implementados** nesta fatia.
> - **Payload:** `{ breaks: [{ id?, breakTime, foco, energia, confianca, inteligenciaEmocional,
>   interferencias, notes }] }`, `.strict()`. `id` ausente = novo (nanoid no server); id no DB ausente
>   no payload = deletado; `breaks: []` = remove todos. `clampBreakFeedback` por item antes do Zod.
> - **Medias DERIVADAS (Q-01 = Opcao B):** recalculadas no server na MESMA tx = media aritmetica das
>   5 metricas do conjunto final, gravadas nas colunas `grind_sessions.*Media` (decimal/string).
>   0 breaks => medias `null`. Os 5 sliders de media editaveis **saem do modal** (viram visao derivada
>   read-only). RF-07 abaixo fica invertido.
> - **`breakCount` = DERIVADO, nao persistido** (nao existe coluna `break_count`; zero migration).
>   Vem sempre da contagem de rows; a response inclui `breakCount = breaks.length`.
> - **Salvar junto (Q-03):** o modal mantem draft local da serie; 1 clique em "Salvar Alteracoes"
>   persiste sessao + breaks atomicamente via o bulk endpoint.
> - **Atomicidade:** `db.transaction` com fallback gentil (lesson #32). Handler `injectedStorage?`
>   (lesson #34). Ownership ANTES de mutar (`getGrindSession` -> 404 nao-dono). Invalidacao por prefixo
>   de queryKey (lesson #21).
> - **Sessao sem break:** permitido criar do zero (sessoes legadas importadas ganham reports novos).
>
> Ver `Docs/architecture/decisions/242-mental-evolution-editable-bulk-replace-derived-medias.md` +
> diagrama `Docs/architecture/diagrams/mental-evolution-editable-save-sequence.mermaid`.

## Questoes Abertas (RESOLVIDAS pelo founder — ver ADR-242)

### Q-01 (CRITICA): Media derivada vs independente — RESOLVIDA: Opcao B (DERIVADA)
> Medias recalculadas a partir dos breaks ao salvar (media aritmetica), persistidas em
> `grind_sessions.*Media` na mesma tx do bulk-replace. 0 breaks => null. Sliders de media saem do
> modal (visao derivada read-only). `breakCount` = numero de breaks (derivado, sem coluna nova).

### Q-02: Limite de `notes` — RESOLVIDA: 500 chars.

### Q-03: Persistencia imediata vs draft no save global — RESOLVIDA: SALVAR JUNTO (draft no save global, via bulk endpoint atomico).

### Q-04: Ordenacao da lista — RESOLVIDA: ASC por breakTime (casa com o grafico).

---

### Q-01 (historico/contexto original): Media derivada vs independente
As medias (`energiaMedia`, `focoMedio`, etc. em `grind_sessions`) devem ser RECALCULADAS automaticamente a partir dos breaks editados, ou continuam campos INDEPENDENTES?
- **Opcao A (default desta spec):** Independentes. Editar breaks NAO toca as medias. Mantem o modelo atual simples e desacoplado; o jogador pode ter media "de cabeca" diferente da media aritmetica dos breaks. Risco: medias e serie podem divergir e confundir.
- **Opcao B:** Derivadas. Apos qualquer mutacao de break, recalcular as 5 medias = media aritmetica dos breaks da sessao e salvar em `grind_sessions`. Mais coerente, porem acopla as duas entidades, exige decidir o que acontece quando NAO ha breaks (mantem ultimo valor? zera?), e pode sobrescrever uma media editada manualmente.
- **Opcao C (hibrido):** Mostrar a media derivada (calculada no client a partir dos breaks) como sugestao, com botao "aplicar media calculada" que preenche os sliders, mas sem auto-salvar.
> **Recomendacao:** Opcao A nesta fatia (menor risco, reversivel), com a Opcao C como follow-up se o founder quiser conveniencia. Definir antes de escrever testes.

### Q-02: Limite de tamanho de `notes`
O POST atual nao impoe limite explicito de chars em `notes`. Definir limite para o PUT (e idealmente alinhar com o POST). Default proposto: 500 chars. Confirmar.

### Q-03: Persistencia imediata vs draft no save global
Reports de break sao persistidos imediatamente (POST/PUT/DELETE por operacao) ou acumulados como draft e persistidos no botao "Salvar Alteracoes" global?
- **Default desta spec:** persistencia imediata por operacao (break e entidade propria com endpoints proprios; mantem o save da sessao inalterado). Confirmar.

### Q-04: Ordenacao da lista no modal
Lista de breaks ASC (casa com o grafico) ou DESC (mais recente no topo, como o GET retorna hoje)? Default desta spec: ASC, para alinhar com o grafico.

## Notas de Implementacao (opcional)
- Registrar as rotas PUT/DELETE em `server/routes/grind-sessions.ts` proximas as existentes (`:1369`-`:1404`), com handlers extraidos aceitando `injectedStorage?` (lesson #34).
- `updateBreakFeedback` no storage segue o padrao de `updateGrindSession` (UPDATE ... RETURNING, sem filtro de userId — ownership na rota).
- O componente de grafico + lista pode ser um sub-componente novo (ex: `client/src/components/grind-session/MentalEvolutionEditor.tsx`) montado dentro da secao "Estado Mental" do `EditSessionDialog`, recebendo `sessionId` por prop. Isolar `useQuery`/`useMutation` nele.
- Reuso de `tokens` de cor de `@/lib/ui-tokens` para as 5 series do grafico (convencoes UI).
- Atencao a invalidacao de cache pos-mutacao (lesson #21): invalidar por prefixo de queryKey, nao por igualdade exata.
