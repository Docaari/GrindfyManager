# Fix: Pagina MentalPrep (/mental) -- dados fake, hooks condicionais, sliders e validacao

## Status
Proposta

## Comportamento Atual (bugado)

A pagina `/mental` (`client/src/pages/MentalPrep.tsx`, ~1900 linhas) apresenta 11 problemas concretos distribuidos entre frontend e backend:

1. **Dados 100% fake sem persistencia** -- Toda a pagina usa dados hardcoded (`defaultStats`, `sessionCorrelationData`, `defaultAchievements`). Nenhuma chamada API e feita. O backend ja tem endpoints prontos (`GET/POST /api/preparation-logs`). Ao clicar "Iniciar Grind", os dados sao salvos apenas em `localStorage` e o usuario e redirecionado para `/grind`. Nenhum `preparation_log` e criado no banco.

2. **Hooks chamados condicionalmente** -- Em `MentalPrep.tsx:414-421`, o componente faz early return com `<AccessDenied>` ANTES de declarar qualquer `useState`/`useEffect`. Isso viola a regra de hooks do React e pode causar crash em re-renders.

3. **Slider aceita valor 0 mas cores nao cobrem 0** -- `MentalSlider.tsx:118` define `min={0}`, mas a funcao `getColorClasses` (linhas 26-54) so trata ranges `1-3`, `4-6`, `7-10`. Valor 0 cai no fallback cinza, inconsistente com a UI que mostra "Nao avaliado".

4. **onWheel com preventDefault em passive listener** -- `MentalSlider.tsx:75-88` e `MentalPrep.tsx:1295-1296,1333-1334,1371-1372,1409-1410` usam `onWheel` inline com `e.preventDefault()`. Navegadores modernos registram wheel listeners como passive por padrao, causando warning no console e comportamento inconsistente.

5. **Textarea sem maxLength** -- `MentalPrep.tsx:1451` tem textarea de notas pessoais sem atributo `maxLength`. O contador visual mostra `{personalNotes.length}/200` mas nao impede digitacao alem do limite.

6. **Stale closure no BreakFeedbackPopup** -- `BreakFeedbackPopup.tsx:104-148` registra event listener de teclado via `useEffect`. O array de deps (linha 148) inclui `[isOpen, isInTextarea, hoveredField, onClose]` mas a funcao `handleKeyPress` referencia `feedback` (via `setFeedback`) e chama `handleSubmit` que usa `onSubmit(feedback)`. `feedback` nao esta nas deps, causando stale closure quando o usuario altera sliders e depois pressiona Enter.

7. **Erro silenciado no loadSessionBreaks** -- `BreakFeedbackPopup.tsx:79-86` tem `catch (error) {}` vazio. Falha na busca de breaks passa despercebida.

8. **Backend expoe error.message ao cliente** -- `grind-sessions.ts:582-585` retorna `error: error instanceof Error ? error.message : "Unknown error"` no response JSON. Isso pode vazar detalhes internos (nomes de tabela, SQL, stack).

9. **Sem validacao de range 0-10 no backend para break feedbacks** -- `grind-sessions.ts:569-573` usa `parseInt(req.body.foco) || 5` sem clampar ao range valido. Um client malicioso pode enviar `foco: 999` e o valor e salvo no banco.

10. **Codigo de slider duplicado 4x** -- `MentalPrep.tsx:1293-1432` repete estrutura identica de slider customizado para energia, foco, confianca e equilibrio. O componente `MentalSlider` ja existe em `client/src/components/MentalSlider.tsx` mas nao e importado nem usado.

11. **MentalSlider existe mas nao e integrado** -- `client/src/components/MentalSlider.tsx` implementa exatamente a funcionalidade necessaria (label, cor por range, wheel, keyboard) mas a pagina MentalPrep reimplementa tudo inline.

## Comportamento Esperado (correto)

1. **Persistencia real**: Ao montar, a pagina faz `GET /api/preparation-logs` para carregar historico. Ao clicar "Iniciar Grind", faz `POST /api/preparation-logs` para persistir no banco ANTES de redirecionar. Stats, historico rapido e correlacao sao derivados dos dados reais. Dados default servem como fallback apenas para usuarios sem historico.

2. **Hooks antes do early return**: Todos `useState`, `useEffect` e demais hooks sao declarados ANTES do check de permissao. O early return fica apos todos os hooks.

3. **Slider min=1**: `MentalSlider.tsx` usa `min={1}` em vez de `min={0}`. Valor minimo e 1 em todos os contextos.

4. **Wheel via addEventListener non-passive**: Sliders usam `useEffect` + `ref.addEventListener('wheel', handler, { passive: false })` em vez de `onWheel` inline.

5. **Textarea com maxLength={200}**: Atributo HTML `maxLength` impede input alem de 200 caracteres.

6. **Closure correta no BreakFeedbackPopup**: O `useEffect` de teclado inclui `feedback` nas deps, OU usa `useRef` para manter referencia atualizada ao feedback sem re-registrar o listener.

7. **Erro visivel no loadSessionBreaks**: O catch mostra feedback ao usuario (ex: `console.error` + indicador visual de falha na secao de historico).

8. **Backend nao expoe error.message**: O campo `error` e removido do response. O erro completo e logado no servidor com `console.error`.

9. **Validacao de range no backend**: Valores de break feedback sao clampados ao range 0-10 antes de salvar. Implementar via Zod `.min(0).max(10)` no schema de insercao, ou clampar com `Math.min(10, Math.max(0, value))` no handler.

10. **Sliders unificados**: Os 4 blocos duplicados de slider inline sao substituidos por 4 instancias do componente `MentalSlider`.

11. **MentalSlider integrado**: A pagina importa e usa `MentalSlider` de `@/components/MentalSlider`.

## Modulos Afetados

- `client/src/pages/MentalPrep.tsx` -- issues 1, 2, 4, 5, 10, 11
- `client/src/components/MentalSlider.tsx` -- issues 3, 4
- `client/src/components/BreakFeedbackPopup.tsx` -- issues 6, 7
- `server/routes/grind-sessions.ts` -- issues 8, 9
- `shared/schema.ts` -- issue 9 (se usar Zod para validacao de range)

## Requisitos Funcionais

### RF-01: Integrar MentalPrep com backend (preparation-logs)
**Descricao:** A pagina deve consumir e produzir dados reais via API.
**Regras de negocio:**
- Ao montar o componente, executar `useQuery` para `GET /api/preparation-logs`
- O `useQuery` deve usar a key `['preparation-logs']`
- Ao clicar "Iniciar Grind", executar `useMutation` para `POST /api/preparation-logs` com os campos: `mentalState` (score final 0-100), `focusLevel` (valor do slider foco 0-100), `confidenceLevel` (valor do slider confianca 0-100), `exercisesCompleted` (array de nomes das atividades completadas), `warmupCompleted` (true se score >= 50), `notes` (conteudo da textarea de notas pessoais)
- Apos mutation bem-sucedida, salvar em localStorage (para integracao com GrindSession) e redirecionar para `/grind`
- Se mutation falhar, mostrar toast de erro e NAO redirecionar
- A secao "Historico Rapido" (linhas 1468-1510, atualmente hardcoded com "Hoje 85%", "Ontem 72%", "Anteontem 45%") deve renderizar os 3 logs mais recentes do `useQuery`
- A secao de estatisticas (`stats`) deve derivar `totalSessions`, `averageScore`, `currentStreak` e `scoreHistory` dos dados retornados pelo GET
- A secao de correlacao (`correlationData`) deve cruzar `preparation_logs.createdAt` com `grind_sessions` do mesmo dia para calcular correlacao warmup vs profit. Se nao houver dados suficientes (< 3 sessoes), exibir mensagem "Complete pelo menos 3 sessoes para ver correlacao"
- Manter `defaultStats` e `defaultAchievements` como fallback para usuarios sem historico (0 logs retornados)

**Criterio de aceitacao:**
- [ ] `useQuery(['preparation-logs'])` e chamado ao montar
- [ ] `useMutation` faz POST para `/api/preparation-logs` ao clicar "Iniciar Grind"
- [ ] Mutation envia campos compatíveis com `insertPreparationLogSchema`: mentalState (integer), focusLevel (integer), confidenceLevel (integer), exercisesCompleted (string[]), warmupCompleted (boolean), notes (string|null)
- [ ] Secao "Historico Rapido" mostra os 3 logs mais recentes reais
- [ ] Stats sao calculados a partir dos logs reais
- [ ] Falha no POST mostra toast de erro e nao redireciona
- [ ] Usuario sem historico ve dados default como fallback
- [ ] localStorage ainda e preenchido para integracao com GrindSession

### RF-02: Corrigir hooks condicionais
**Descricao:** Mover todos os hooks para antes do check de permissao.
**Regras de negocio:**
- Todos `useState`, `useEffect`, `useRef`, `useQuery`, `useMutation` devem ser declarados antes de qualquer early return
- O check `if (!hasPermission) return <AccessDenied ...>` deve ficar DEPOIS de todos os hooks
- A ordem no componente deve ser: (1) usePermission, (2) todos useState, (3) todos useRef, (4) useQuery/useMutation, (5) useEffect, (6) early return de permissao, (7) funcoes auxiliares, (8) JSX

**Criterio de aceitacao:**
- [ ] Nenhum hook e declarado apos o `if (!hasPermission)` check
- [ ] O early return com `<AccessDenied>` fica apos todos os hooks
- [ ] Nenhum warning "React Hook is called conditionally" em dev mode

### RF-03: Corrigir MentalSlider min e cores
**Descricao:** O slider deve ter min=1 e a funcao de cores deve cobrir todo o range.
**Regras de negocio:**
- `MentalSlider.tsx`: Alterar `min={0}` para `min={1}` na prop do Slider (linha 118)
- `MentalSlider.tsx`: Nas funcoes de keyboard (linhas 67-68), `Math.max(1, ...)` ja esta correto
- `MentalSlider.tsx`: Na funcao handleWheel (linha 87), `Math.max(1, ...)` ja esta correto
- A funcao `getColorClasses` nao precisa mudar porque valor 0 nao sera mais possivel

**Criterio de aceitacao:**
- [ ] Slider nao permite valor abaixo de 1
- [ ] Valor 1 exibe cor vermelha (nao cinza)
- [ ] Feedback textual nao mostra "Nao avaliado" em uso normal

### RF-04: Corrigir onWheel passive listener
**Descricao:** Substituir `onWheel` inline por `addEventListener` com `{ passive: false }`.
**Regras de negocio:**
- Em `MentalSlider.tsx`: Remover prop `onWheel={handleWheel}` do div (linha 112). Adicionar `useEffect` que registra `addEventListener('wheel', handler, { passive: false })` na ref do div. Cleanup no return do useEffect com `removeEventListener`.
- Em `MentalPrep.tsx`: Os 4 blocos de slider inline (linhas 1293-1432) serao substituidos pelo componente `MentalSlider` (RF-06), que ja tera o fix. Se por alguma razao os sliders inline permanecerem, aplicar o mesmo pattern de `useEffect` + `ref`.

**Criterio de aceitacao:**
- [ ] Nenhum `onWheel` inline em MentalSlider.tsx
- [ ] Nenhum `onWheel` inline nos sliders de MentalPrep.tsx
- [ ] Wheel scroll funciona nos sliders sem warnings no console
- [ ] `addEventListener` usa `{ passive: false }`

### RF-05: Adicionar maxLength na textarea de notas
**Descricao:** Impedir digitacao alem de 200 caracteres.
**Regras de negocio:**
- Adicionar atributo `maxLength={200}` na textarea de notas pessoais (`MentalPrep.tsx:1451`)
- O contador visual `{personalNotes.length}/200` ja existe e deve continuar funcionando

**Criterio de aceitacao:**
- [ ] Textarea tem atributo HTML `maxLength={200}`
- [ ] Nao e possivel digitar mais de 200 caracteres
- [ ] Contador visual reflete o tamanho real

### RF-06: Substituir sliders duplicados pelo componente MentalSlider
**Descricao:** Eliminar duplicacao de codigo usando o componente existente.
**Regras de negocio:**
- Importar `MentalSlider` de `@/components/MentalSlider`
- Substituir os 4 blocos inline (energia, foco, confianca, equilibrio) em `MentalPrep.tsx:1293-1432` por 4 instancias de `<MentalSlider>`
- Adaptacao necessaria: os sliders inline da MentalPrep operam em escala 0-100 (percentual), enquanto `MentalSlider` opera em escala 1-10. Duas opcoes:
  - **Opcao A (recomendada):** Converter o estado `mentalState` para escala 1-10 (consistente com o backend `preparation_logs` que usa integer). Ajustar `calculateMentalScore` e `calculateFinalScore` para refletir a nova escala.
  - **Opcao B:** Adicionar props `min`/`max` ao MentalSlider para suportar range customizado. Mais complexo e menos consistente com o backend.
- Decisao: **Opcao A** -- converter mentalState para escala 1-10.
- Mapear props: `label` para o nome, `icon` para o emoji correspondente, `value` e `onChange` para os respectivos campos do `mentalState`

**Criterio de aceitacao:**
- [ ] `MentalSlider` e importado de `@/components/MentalSlider`
- [ ] Os 4 blocos de slider inline (140 linhas) sao removidos
- [ ] 4 instancias de `<MentalSlider>` os substituem
- [ ] Escala e 1-10 para todos os 4 sliders de estado mental
- [ ] `calculateMentalScore` e `calculateFinalScore` funcionam com escala 1-10
- [ ] Comportamento visual e funcional equivalente (cores, wheel, labels)

### RF-07: Corrigir stale closure no BreakFeedbackPopup
**Descricao:** Garantir que o listener de teclado sempre use o estado mais recente de `feedback`.
**Regras de negocio:**
- Em `BreakFeedbackPopup.tsx:104-148`, o `useEffect` que registra `handleKeyPress` deve usar uma ref para `feedback` em vez de depender do estado diretamente
- Criar `const feedbackRef = useRef(feedback)` e atualizar no corpo do componente: `feedbackRef.current = feedback`
- Dentro de `handleKeyPress`, usar `feedbackRef.current` ao chamar `onSubmit`
- Isso evita re-registrar o listener a cada mudanca de slider (que causa flickering e perda de performance)

**Criterio de aceitacao:**
- [ ] `feedbackRef` criado com `useRef`
- [ ] `feedbackRef.current` atualizado a cada render
- [ ] `handleKeyPress` usa `feedbackRef.current` para submit
- [ ] Pressionar Enter apos mover sliders submete os valores corretos (nao os valores iniciais)

### RF-08: Tratar erro no loadSessionBreaks
**Descricao:** Mostrar indicador de falha em vez de silenciar.
**Regras de negocio:**
- Em `BreakFeedbackPopup.tsx:79-86`, o catch deve fazer `console.error('Failed to load session breaks:', error)` e setar um estado de erro (`setBreaksError(true)`)
- Na UI do historico de breaks, se `breaksError === true`, mostrar texto "Erro ao carregar historico" em vez de lista vazia

**Criterio de aceitacao:**
- [ ] Catch nao e vazio -- loga o erro
- [ ] Estado de erro e setado
- [ ] UI indica falha ao usuario

### RF-09: Remover error.message do response do backend
**Descricao:** Nao expor detalhes internos de erro ao cliente.
**Regras de negocio:**
- Em `server/routes/grind-sessions.ts:582-585`, remover o campo `error` do JSON de resposta
- Manter apenas `{ message: "Failed to create break feedback" }`
- Adicionar `console.error('Break feedback creation failed:', error)` antes do `res.status(400)`

**Criterio de aceitacao:**
- [ ] Response de erro nao contem campo `error`
- [ ] Response contem apenas `{ message: "Failed to create break feedback" }`
- [ ] Erro completo e logado no servidor

### RF-10: Validar range 0-10 no backend para break feedbacks
**Descricao:** Garantir que valores fora do range nao sejam salvos.
**Regras de negocio:**
- Em `server/routes/grind-sessions.ts:569-573`, clampar cada valor antes de passar ao schema:
  ```
  foco: Math.min(10, Math.max(0, parseInt(req.body.foco) || 5))
  energia: Math.min(10, Math.max(0, parseInt(req.body.energia) || 5))
  confianca: Math.min(10, Math.max(0, parseInt(req.body.confianca) || 5))
  inteligenciaEmocional: Math.min(10, Math.max(0, parseInt(req.body.inteligenciaEmocional) || 5))
  interferencias: Math.min(10, Math.max(0, parseInt(req.body.interferencias) || 5))
  ```
- Alternativa (complementar): Adicionar `.min(0).max(10)` nos campos integer do `insertBreakFeedbackSchema` em `shared/schema.ts`. Isso daria validacao via Zod alem do clamping manual.

**Criterio de aceitacao:**
- [ ] Enviar `foco: 999` resulta em `foco: 10` salvo no banco
- [ ] Enviar `foco: -5` resulta em `foco: 0` salvo no banco
- [ ] Enviar `foco: undefined` resulta em `foco: 5` (default)
- [ ] Validacao funciona para todos os 5 campos de slider

## Endpoints Previstos

Nenhum endpoint novo. Endpoints existentes utilizados:

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/preparation-logs | Listar logs de preparacao do usuario | JWT |
| POST | /api/preparation-logs | Criar log de preparacao | JWT |
| GET | /api/break-feedbacks | Listar feedbacks de break (query: sessionId) | JWT |
| POST | /api/break-feedbacks | Criar feedback de break | JWT |

## Modelos de Dados Afetados

Nenhuma alteracao estrutural nas tabelas. Apenas validacao adicional no Zod schema:

### break_feedbacks (validacao)
| Campo | Tipo | Constraint Adicionada |
|---|---|---|
| foco | integer | .min(0).max(10) |
| energia | integer | .min(0).max(10) |
| confianca | integer | .min(0).max(10) |
| inteligenciaEmocional | integer | .min(0).max(10) |
| interferencias | integer | .min(0).max(10) |

### preparation_logs (referencia -- sem alteracao)
| Campo | Tipo | Notas |
|---|---|---|
| mentalState | integer | Score geral (0-100) |
| focusLevel | integer | Nivel de foco (0-100 ou 1-10 apos RF-06) |
| confidenceLevel | integer | Nivel de confianca (0-100 ou 1-10 apos RF-06) |
| exercisesCompleted | jsonb (string[]) | Nomes das atividades completadas |
| warmupCompleted | boolean | true se score >= 50 |
| notes | text | Notas pessoais (max 200 chars, validado no frontend) |

## Cenarios de Teste Derivados

### Happy Path
- [ ] Pagina carrega e exibe dados do GET /api/preparation-logs
- [ ] Usuario completa checklist, ajusta sliders, clica "Iniciar Grind" -- POST e feito, localStorage e preenchido, redirect para /grind
- [ ] Historico rapido mostra os 3 logs mais recentes com data e score
- [ ] MentalSlider responde a click, drag, wheel e keyboard (setas)
- [ ] BreakFeedbackPopup: mover sliders e pressionar Enter submete valores corretos

### Validacao de Input
- [ ] Textarea de notas nao aceita mais de 200 caracteres
- [ ] Slider nao permite valor abaixo de 1
- [ ] Backend clampa valores de break feedback ao range 0-10

### Regras de Negocio
- [ ] Falha no POST /api/preparation-logs mostra toast e nao redireciona
- [ ] Usuario sem historico ve dados default (not empty state)
- [ ] Correlacao so aparece com >= 3 sessoes com preparation_log

### Edge Cases
- [ ] Pagina carrega com rede lenta -- loading state visivel
- [ ] GET /api/preparation-logs retorna array vazio -- fallback para defaults
- [ ] Backend recebe foco=999 -- salva como 10
- [ ] Backend recebe foco=-5 -- salva como 0
- [ ] Backend recebe foco=undefined -- salva como 5 (default)
- [ ] Response de erro do POST /api/break-feedbacks nao contem campo `error`
- [ ] loadSessionBreaks falha -- UI mostra indicador de erro, nao silencia
- [ ] Wheel scroll em slider nao gera warning "Unable to preventDefault inside passive event listener"
- [ ] React hooks nao geram warning "called conditionally" em dev mode

## Fora de Escopo
- Refatorar MentalPrep.tsx (~1900 linhas) em sub-componentes menores (spec separada)
- BreakHistoryPopup inline styles (cosmetico)
- Testes automatizados (o agente test-writer cuidara disso)
- Criacao de novos endpoints (todos ja existem)
- Alteracao de schema de banco (apenas validacao Zod)
- Sistema de achievements/gamificacao com persistencia (pode ser spec futura -- atualmente roda em memoria e esta OK como MVP)
- Audio tracks e biblioteca de audios (dados estaticos por design, nao sao "fake data")

## Dependencias
- Endpoints `GET/POST /api/preparation-logs` e `GET/POST /api/break-feedbacks` ja existem em `server/routes/grind-sessions.ts`
- Componente `MentalSlider` ja existe em `client/src/components/MentalSlider.tsx`
- Tabelas `preparation_logs` e `break_feedbacks` ja existem no schema

## Notas de Implementacao

1. **Ordem de implementacao sugerida:** RF-02 (hooks) primeiro, pois move codigo que sera modificado pelos demais RFs. Depois RF-03+RF-04 (MentalSlider), RF-06 (integracao do componente), RF-01 (API), e por ultimo os fixes pontuais RF-05, RF-07, RF-08, RF-09, RF-10.

2. **Escala 0-100 vs 1-10:** O estado `mentalState` atual usa 0-100 (percentual). O backend `preparation_logs` usa integer sem restricao explicita de range. Ao converter para 1-10 (RF-06), o `calculateFinalScore` precisa ser ajustado: `mentalScore = (energia + foco + confianca + equilibrio) / 4` retornara valor 1-10, que deve ser mapeado para 0-100 antes de compor com `checklistScore`. Formula sugerida: `mentalScorePercent = (mentalScore / 10) * 100`.

3. **POST /api/preparation-logs payload:** O `insertPreparationLogSchema` espera `mentalState` (integer), `focusLevel` (integer), `confidenceLevel` (integer). Se a escala for 1-10, enviar os valores raw. Se precisar manter compatibilidade com dados existentes em 0-100, multiplicar por 10. Verificar se ja existem dados na tabela antes de decidir.

4. **Correlacao warmup vs performance:** Requer cruzar `preparation_logs` com `grind_sessions` por data. Isso pode ser feito no frontend (buscar ambos via useQuery e cruzar) ou via novo endpoint. Recomendacao: fazer no frontend para evitar criar endpoint novo (fora de escopo). Buscar `grind_sessions` com `useQuery(['grind-sessions'])` que ja deve existir em outras paginas.
