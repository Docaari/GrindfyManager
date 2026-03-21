# Spec: Biblioteca de Torneios v2 + Redesign Grade Semanal

## Status
Aprovada

---

## Resumo Executivo

Redesign completo de duas areas interligadas do Grindfy: a **Biblioteca de Torneios** (catalogo de torneios do usuario) e a **Grade Semanal** (planejamento de quais torneios jogar em cada dia/horario).

A biblioteca deixa de ser um sidebar minusculo inutilizavel e vira um painel grande e funcional. A grade elimina o modal sobrecarregado atual e passa a funcionar com interacao direta (inline). Horarios passam a ser configuraveis para grinders noturnos. O sistema de perfis e corrigido para incluir A/B/C/OFF corretamente.

---

## Gap Analysis: Spec vs Estado Atual do Codigo

### O QUE JA EXISTE E PODE SER REAPROVEITADO

| Componente | Arquivo | O que faz | Como reaproveitar |
|---|---|---|---|
| **WeekGrid** | `components/grade-planner/WeekGrid.tsx` | Grid temporal 7 dias x N horas | Base da grade v2 — expandir para suportar horarios configuraveis e drag-drop |
| **TournamentPill** | `components/grade-planner/TournamentPill.tsx` | Pill compacta com buy-in, site, badges | Evoluir para "chip" da spec — adicionar logo do site, cor por tipo, tooltip |
| **WeeklySummaryBar** | `components/grade-planner/WeeklySummaryBar.tsx` | Barra com metricas semanais (Total Buy-in, Torneios, ABI, Dias Ativos, Horas Est.) | Reaproveitar diretamente — ja tem as 5 metricas certas da spec |
| **EditDialog** | `components/grade-planner/EditDialog.tsx` | Dialog de edicao de torneio | Manter para edicao — funciona com campos enriquecidos |
| **DeleteDialog** | `components/grade-planner/DeleteDialog.tsx` | Confirmacao de exclusao | Manter como esta |
| **TournamentLibrary (sidebar)** | `components/grade-planner/TournamentLibrary.tsx` | Sidebar colapsavel com top 15 torneios | Substituir pelo painel v2, mas reusar logica de busca/filtro |
| **CopyDayDropdown** | `components/grade-planner/CopyDayDropdown.tsx` | Copiar torneios entre dias | Manter — util na grade v2 |
| **LoadingScreen** | `components/grade-planner/LoadingScreen.tsx` | Splash screen de loading | Manter como esta |
| **SupremaImportModal** | `components/SupremaImportModal.tsx` | Modal importacao Suprema com dados enriquecidos | Reaproveitar — agora sera chamado da Biblioteca, nao do PlanningDialog |
| **useProfileStates hook** | `hooks/useProfileStates.ts` | Gerencia perfis A/B/C por dia | Expandir para suportar 'OFF' como valor valido |
| **profile_states tabela** | `shared/schema.ts` | activeProfile por dia | Expandir para aceitar 'OFF' |
| **planned_tournaments tabela** | `shared/schema.ts` | Torneios planejados com todos os campos | Reusar integralmente — ja tem campos enriquecidos |
| **user_settings tabela** | `shared/schema.ts` | Configuracoes do usuario | Adicionar gradeStartHour/gradeEndHour |
| **Suprema service/mapper/cache** | `server/suprema*.ts` | Toda a infra de integracao Suprema | Reaproveitar — sync automatica sera wrapper sobre isso |
| **react-beautiful-dnd** | `package.json` | Lib de drag-and-drop | Instalada, nunca usada — ativar para biblioteca→grade |
| **react-resizable-panels** | `package.json` | Paineis redimensionaveis | Instalada, nunca usada — ativar para split biblioteca/grade |
| **Logos das redes** | `attached_assets/` | 12 logos de redes de poker | Usar nos cards da biblioteca |
| **types.ts** | `components/grade-planner/types.ts` | Constantes: weekDays, sites, types, speeds | Reaproveitar e expandir |

### O QUE PRECISA SER CRIADO DO ZERO

| Componente | Descricao | Complexidade |
|---|---|---|
| **tournament_library tabela** | Nova tabela no schema — catalogo pessoal de torneios separado de tournament_templates | Media |
| **tournament_library_settings tabela** | Config de importacao por usuario (autoImportSuprema, lastSync, etc.) | Baixa |
| **Biblioteca Panel (frontend)** | Painel esquerdo com cards, filtros, importacao, lixeira | Alta |
| **LibraryCard component** | Card de torneio arrastavel com logo, buy-in, badges, acoes | Media |
| **LibraryFilters component** | Filtros avancados: buy-in range, tipo, velocidade, site, horario | Media |
| **LibraryTrash component** | Tela de lixeira com restaurar/deletar permanente | Baixa |
| **ImportGrindLiveModal** | Modal para importar torneios das ultimas 7 sessoes | Media |
| **ManualAddForm** | Formulario inline para adicionar torneio manual a biblioteca | Baixa |
| **CellPopover component** | Popover ao clicar em chip da grade — detalhes + acoes | Media |
| **OverflowIndicator** | Chip "+N torneios" com expansao | Baixa |
| **ProfileComparison component** | Card expandivel inferior comparando A vs B vs C | Media |
| **GradeSettings component** | Dialog para configurar horario inicio/fim da grade | Baixa |
| **Suprema auto-sync job** | Backend: buscar novos torneios a cada 1h quando toggle ativo | Media |
| **Lixeira cleanup job** | Backend: deletar torneios na lixeira ha >7 dias | Baixa |
| **Rotas da biblioteca** | 12 novos endpoints (CRUD, trash, import, sync, settings) | Media |

### O QUE PRECISA SER ALTERADO

| Componente | Alteracao | Impacto |
|---|---|---|
| **GradePlanner.tsx** | Redesign completo: substituir layout atual por split panels (biblioteca + grade) | Alto |
| **WeekGrid.tsx** | Horarios configuraveis (nao mais fixo 12:00-03:00), drag-drop target, celulas com chips empilhados | Alto |
| **TournamentPill.tsx → TournamentChip.tsx** | Renomear e evoluir: logo do site, cor de fundo por tipo, tooltip, drag source | Medio |
| **PlanningDialog.tsx** | ELIMINAR — funcionalidade redistribuida entre biblioteca e grade inline | Alto |
| **WeeklySummaryDashboard.tsx** | ELIMINAR — substituido por ProfileComparison | Baixo |
| **DayCard.tsx** | ELIMINAR — substituido pela grade temporal v2 | Baixo |
| **profile_states schema** | Aceitar 'OFF' como valor de activeProfile (default 'OFF' em vez de null) | Baixo |
| **user_settings schema** | Adicionar gradeStartHour (default 12), gradeEndHour (default 3) | Baixo |
| **shared/schema.ts** | Nova tabela tournament_library + tournament_library_settings | Medio |
| **server/routes/** | Novos arquivos de rota para biblioteca | Medio |
| **server/storage.ts** | Novos metodos de storage para biblioteca | Medio |

### INCONSISTENCIAS ENTRE SPEC E CODIGO ATUAL

| # | Inconsistencia | Spec diz | Codigo atual | Resolucao sugerida |
|---|---|---|---|---|
| 1 | **Tabela tournament_library vs tournament_templates** | Spec propoe tabela `tournament_library` nova | Ja existe `tournament_templates` com campos similares (name, site, category, speed, avgBuyIn) mas com foco em analytics (avgRoi, totalPlayed, totalProfit) | **Criar tabela nova** `tournament_library` — finalidade diferente. `tournament_templates` e para analytics historicos (agrupamento automatico). `tournament_library` e catalogo pessoal editavel. Manter ambas. |
| 2 | **Campo `category` vs `type`** | Spec usa `category` (PKO, Vanilla, Bounty, Mystery) | `planned_tournaments` usa `type` para o mesmo conceito. `tournament_templates` usa `category`. `tournaments` (historico) usa `category`. | **Usar `type`** na tournament_library para consistencia com planned_tournaments. A spec sera ajustada. |
| 3 | **Perfil 'C' = "dia OFF" na spec vs "terceiro perfil" no codigo** | Spec diz: perfis sao A/B/C/OFF onde OFF desativa o dia | Codigo atual: perfis sao A/B/C onde C e um perfil valido com torneios proprios. `profile_states.activeProfile` aceita 'A', 'B', 'C' ou null. | **Manter C como perfil valido, adicionar OFF.** A spec sera ajustada: perfis A/B/C + OFF. OFF desativa o dia. C continua sendo perfil jogavel. |
| 4 | **Horarios fixos vs configuraveis** | Spec: configuraveis, salvos em user_settings | Codigo: fixos em WeekGrid.tsx (12:00-03:00 hardcoded) | **Implementar conforme spec** — adicionar campos ao user_settings e tornar WeekGrid dinamico |
| 5 | **Sidebar da biblioteca (150px) vs painel (40-50%)** | Spec: painel redimensionavel com react-resizable-panels | Codigo: sidebar simples de ~250px com top 15 torneios | **Substituir** — criar painel v2 com react-resizable-panels |
| 6 | **PlanningDialog** | Spec: eliminar completamente | Codigo: modal complexo com metricas, sugestoes, favoritos, formulario, lista de torneios planejados | **Eliminar com cuidado** — redistribuir: metricas → WeeklySummaryBar (ja existe), formulario → ManualAddForm na biblioteca + CellPopover na grade, lista de torneios → chips inline na grade, sugestoes → remover (fora de escopo) |
| 7 | **Importacao Suprema na spec** | Spec: toggle auto-sync na biblioteca, sync a cada 1h | Codigo: botao manual no PlanningDialog que abre SupremaImportModal para dia especifico | **Hibrido** — adicionar toggle auto-sync E manter import manual por dia. O modal Suprema existente continua util para importacao seletiva. |
| 8 | **Campo `source` na tournament_library** | Spec: 'manual', 'suprema', 'grind-live' | Nao existe equivalente | **Implementar conforme spec** — campo novo na tabela |
| 9 | **Deduplicacao Suprema** | Spec: por nome + site + buy-in (inclui lixeira) | Codigo atual: por externalId (suprema-{id}) em planned_tournaments | **Usar ambos** — externalId para planned_tournaments (preciso), nome+site+buyIn para tournament_library (mais flexivel pois agrupa torneios similares) |
| 10 | **Drag entre celulas** | Spec: arrastar chip de celula para celula (reposicionar) | Codigo: nenhum drag implementado | **Implementar** — react-beautiful-dnd com DragDropContext envolvendo grade + biblioteca |
| 11 | **Horario do torneio na biblioteca** | Spec: campo `startTime` (varchar "20:00") | Codigo: `time` em planned_tournaments, `startTime` (timestamp) tambem existe | **Usar `time` (varchar "HH:mm")** na tournament_library, consistente com planned_tournaments |
| 12 | **Velocidade "Regular" vs "Normal"** | Spec usa "Regular" | Codigo usa "Normal" em todo lugar (schema, mapper, types.ts) | **Manter "Normal"** — mudar na spec, nao no codigo |

---

## Decomposicao em Fases (adaptada ao sistema real)

### Fase 1: Fundacao (Schema + Rotas + Layout base)
**Escopo:** Criar tabelas, endpoints, layout split panels
**Entregaveis:**
- Tabela `tournament_library` no schema
- Tabela `tournament_library_settings` no schema
- Campos `gradeStartHour`/`gradeEndHour` em user_settings
- Profile states aceitar 'OFF'
- 12 endpoints da biblioteca
- 2 endpoints de grade hours
- Layout split panels com react-resizable-panels
- Estado vazio funcional

### Fase 2: Biblioteca Funcional
**Escopo:** Cards, filtros, importacao, lixeira
**Entregaveis:**
- LibraryCard component (logo site, buy-in, badges, acoes)
- LibraryFilters (busca, buy-in range, tipo, velocidade, site)
- ManualAddForm (adicionar torneio manual)
- ImportGrindLiveModal (importar das ultimas 7 sessoes)
- Integracao Suprema (toggle + sync manual + dedup)
- Lixeira (mover, restaurar, deletar permanente, expiracao 7d)
- Contador: "X de Y torneios"
- Modo colapsado vs expandido

### Fase 3: Grade v2
**Escopo:** Horarios configuraveis, perfis A/B/C/OFF, eliminar PlanningDialog
**Entregaveis:**
- GradeSettings (configurar horario inicio/fim)
- WeekGrid dinamico (horarios do user_settings)
- Perfis A/B/C/OFF com segmented control
- Dia OFF visualmente desativado (opacidade, sem interatividade)
- Aviso ao mudar para OFF com torneios existentes
- Click em celula vazia → mini-form inline (CellPopover)
- TournamentChip (evolucao do TournamentPill)
- Tooltip no chip com detalhes completos
- Click no chip → popover com detalhes + remover + mover

### Fase 4: Drag & Drop
**Escopo:** Arrastar da biblioteca para grade, entre celulas
**Entregaveis:**
- DragDropContext envolvendo biblioteca + grade
- LibraryCard como drag source
- Celulas da grade como drop targets
- Dia OFF rejeita drop (cursor proibido)
- Chip na celula como drag source (reposicionar entre celulas)
- Feedback visual durante drag (ghost, highlight do target)
- Torneio permanece na biblioteca apos drop (e catalogo)

### Fase 5: Metricas + Comparacao
**Escopo:** Header e card de comparacao
**Entregaveis:**
- WeeklySummaryBar atualizado (ja existe, ajustar se necessario)
- ProfileComparison card expandivel (A vs B vs C)
- 7 metricas comparadas: buy-ins, torneios, field medio, % turbo/regular/hyper, % PKO/vanilla, % por site, horario medio
- OFF nao aparece na comparacao
- Perfil sem torneios: "Sem dados"

---

## Requisitos Funcionais (da spec original, adaptados)

### RF-01: Layout Split Panels
Conforme spec original, usando react-resizable-panels.

### RF-02: Biblioteca — Cards de Torneio
Conforme spec original. Ajuste: campo `type` (nao `category`), velocidade "Normal" (nao "Regular").

### RF-03: Biblioteca — Fontes de Importacao
Conforme spec original. Ajuste: manter SupremaImportModal existente para import seletivo por dia, adicionar toggle auto-sync como complemento.

### RF-04: Biblioteca — Filtros
Conforme spec original.

### RF-05: Biblioteca — Lixeira
Conforme spec original. Campo `deletedAt` na tournament_library.

### RF-06: Grade — Horarios Configuraveis
Conforme spec original. Novos campos em user_settings.

### RF-07: Grade — Perfis A/B/C/OFF
Ajuste: **4 perfis** (A/B/C jogaveis + OFF desativado). C e perfil valido, nao equivale a OFF. Default: OFF.

### RF-08: Grade — Celulas com Chips
Conforme spec original. Chips empilhados, overflow "+N", popover.

### RF-09: Grade — Eliminacao do PlanningDialog
Conforme spec original. Redistribuicao de funcionalidades.

### RF-10: Header — Metricas de Planejamento
WeeklySummaryBar ja implementa as 5 metricas corretas. Validar e ajustar se necessario.

### RF-11: Comparacao Semanal por Perfil
Conforme spec original. Card expandivel inferior.

### RF-12: Drag & Drop
Conforme spec original. Biblioteca → grade, entre celulas, dia OFF rejeita.

---

## Modelos de Dados (adaptados ao schema real)

### tournament_library (NOVA)
| Campo | Tipo Drizzle | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK, nanoid | — |
| userId | varchar | FK users.userPlatformId, not null | — |
| name | text | not null | Nome do torneio |
| site | varchar | not null | Rede de poker |
| buyIn | decimal | not null | Buy-in (> 0 validado no Zod) |
| guaranteed | decimal | nullable | Garantido |
| time | varchar | nullable | Horario (ex: "20:00") — consistente com planned_tournaments |
| type | varchar | nullable | PKO, Vanilla, Mystery — consistente com planned_tournaments |
| speed | varchar | nullable | Normal, Turbo, Hyper — consistente com planned_tournaments |
| fieldSize | integer | nullable | Participantes |
| source | varchar | not null, default 'manual' | 'manual', 'suprema', 'grind-live' |
| externalId | varchar | nullable | "suprema-{id}" para dedup |
| deletedAt | timestamp | nullable | null=ativo, preenchido=lixeira |
| createdAt | timestamp | not null, default now | — |
| updatedAt | timestamp | not null, default now | — |

### tournament_library_settings (NOVA)
| Campo | Tipo Drizzle | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK, nanoid | — |
| userId | varchar | FK users.userPlatformId, unique | 1 por usuario |
| autoImportSuprema | boolean | default false | Toggle Suprema |
| lastSupremaSync | timestamp | nullable | Ultima sync |
| lastSupremaSyncStatus | varchar | nullable | 'success', 'error' |
| createdAt | timestamp | default now | — |

### user_settings (ALTERACAO — 2 novos campos)
| Campo | Tipo | Default | Notas |
|---|---|---|---|
| gradeStartHour | integer | 12 | 0-23 |
| gradeEndHour | integer | 3 | 0-23 |

### profile_states (ALTERACAO)
- Campo `activeProfile`: aceitar 'A', 'B', 'C', 'OFF'
- Default: 'OFF' (atualmente e null para inativo)

---

## Endpoints Previstos (adaptados)

### Biblioteca
| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/tournament-library | Listar biblioteca ativa (deletedAt IS NULL) | JWT |
| POST | /api/tournament-library | Adicionar manualmente | JWT |
| PUT | /api/tournament-library/:id | Editar torneio | JWT |
| PATCH | /api/tournament-library/:id/trash | Mover para lixeira (set deletedAt) | JWT |
| POST | /api/tournament-library/:id/restore | Restaurar da lixeira (set deletedAt=null) | JWT |
| DELETE | /api/tournament-library/:id | Deletar permanente | JWT |
| GET | /api/tournament-library/trash | Listar lixeira | JWT |
| GET | /api/tournament-library/import/grind-live/available | Torneios importaveis (7 sessoes) | JWT |
| POST | /api/tournament-library/import/grind-live | Importar selecionados | JWT |
| GET | /api/tournament-library/settings | Config de importacao | JWT |
| PUT | /api/tournament-library/settings | Atualizar toggles | JWT |
| POST | /api/tournament-library/sync/suprema | Sync manual Suprema | JWT |

### Grade (novos)
| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/grade-planner/hours | Range de horarios do usuario | JWT |
| PUT | /api/grade-planner/hours | Atualizar range (min 4h, max 20h) | JWT |
| GET | /api/grade-planner/profile-comparison | Comparacao A vs B vs C | JWT |

### Existentes (manter)
- CRUD de planned-tournaments (GET, POST, PUT, DELETE)
- CRUD de profile-states (GET, PUT)
- POST /api/active-days/toggle
- GET /api/suprema/tournaments

---

## Cenarios de Teste (da spec original)

### Happy Path
- [ ] Biblioteca abre colapsada, expande ao arrastar divisor ou clicar toggle
- [ ] Cards mostram logo + buy-in + nome + badges corretamente
- [ ] Toggle Suprema ativa sync, torneios aparecem
- [ ] "Sincronizar agora" traz novos torneios
- [ ] Importacao grind-live filtra duplicatas, mostra apenas novos das ultimas 7 sessoes
- [ ] Adicionar manualmente funciona com validacao
- [ ] Arrastar torneio para celula Ter 20:00 (perfil A) → chip aparece
- [ ] Celula com 8 torneios mostra 3 chips + "+5 torneios"
- [ ] Click em "+5" expande/mostra todos
- [ ] Click em chip abre popover com detalhes + remover
- [ ] Click em celula vazia abre mini-form inline
- [ ] Configurar horario 18:00-08:00 → grade mostra 18h as 07h (noturno)
- [ ] Lixeira funciona: mover, restaurar, deletar permanente
- [ ] Comparacao de perfis mostra 7 metricas corretas

### Regras de Negocio
- [ ] Suprema nao duplica (externalId na biblioteca + lixeira)
- [ ] Grind-live filtra existentes (ativa + lixeira)
- [ ] Dia OFF rejeita drop com cursor proibido
- [ ] Dia OFF visualmente desativado ANTES de tentar drag
- [ ] Mudar para OFF com torneios → aviso (nao deleta, oculta)
- [ ] Voltar de OFF para A/B/C → torneios reaparecem
- [ ] Torneio arrastado permanece na biblioteca (e catalogo)
- [ ] Lixeira expira em 7 dias (automatico)
- [ ] Todo dia sempre tem perfil (nunca null), default OFF
- [ ] Perfis A, B e C sao todos jogaveis (C nao e OFF)

### Edge Cases
- [ ] API Suprema offline → sistema continua, tenta proximo ciclo
- [ ] Biblioteca com 0 torneios → estado vazio com CTA para importar
- [ ] Todas 7 sessoes ja importadas → mensagem informativa
- [ ] Lixeira vazia → mensagem "Nenhum torneio na lixeira"
- [ ] Filtros sem resultado → "Nenhum torneio encontrado" + limpar filtros
- [ ] Perfil sem torneios na comparacao → "Sem dados"
- [ ] Range de horarios < 4h → erro de validacao
- [ ] Torneios fora do novo range → aviso informativo
- [ ] Mobile → tabs Biblioteca/Grade (nao side-by-side)
- [ ] Celula com 20+ torneios → scroll interno, nao quebra layout

---

## Fora de Escopo
- Analise de ROI/performance dos torneios (e do Dashboard/TournamentLibraryNew)
- Sugestoes do Grade Coach baseadas na biblioteca
- Configuracao de intensidade dos perfis A/B/C (ja existe)
- Integracao Bodog scraping (apenas placeholder)
- Upload de planilha/CSV de schedules
- Compartilhamento de biblioteca entre usuarios
- Notificacoes push de novos torneios Suprema
- Edicao em massa de torneios
- Secao "Sugestoes" (removida — reavaliar no futuro)
- Reordenacao de torneios dentro de uma celula
- TournamentLibraryNew.tsx (pagina /library de analytics — permanece separada)
- tournament_templates (tabela de analytics — permanece separada)

---

## Dependencias
- API Suprema ja integrada e retornando dados ✅
- Tabela session_tournaments populada pelas sessoes grind-live ✅
- Tabela profile_states existente ✅
- Tabela planned_tournaments existente (com campos enriquecidos) ✅
- react-beautiful-dnd instalado ✅
- react-resizable-panels instalado ✅
- framer-motion instalado ✅
- Logos das redes em attached_assets/ ✅
- WeeklySummaryBar ja implementa metricas corretas ✅
- SupremaImportModal funcional com dados enriquecidos ✅
