# Spec: Reforma Completa da Pagina Estudos

## Status
Aprovada

## Resumo
Transformar a pagina Estudos de um sistema de planejamento de estudos (cards, sessoes, agendamentos) em um sistema de organizacao de conhecimento por temas de poker, com editor visual rico, suporte a drag-and-drop de screenshots e toggles/acordeoes para categorizar spots.

## Contexto
Jogadores profissionais de MTT estudam spots especificos (ex: "IP vs BB no flop em 3bet pot") usando solvers como GTO Wizard e organizam suas anotacoes em Notion, Google Docs ou pastas no computador. A pagina Estudos atual do Grindfy foca em planejamento (cards de estudo, sessoes com timer, agendamentos) mas nao resolve o problema real: **organizar visualmente o conhecimento adquirido** com prints de ranges, anotacoes por spot e navegacao por tema.

A reforma substitui o sistema de cards/planejamento por um sistema de temas + abas + editor rico, mantendo a experiencia dentro do Grindfy.

## Usuarios
- **Jogador profissional/semi-profissional de MTT**: Organiza estudo por spot, cola prints de solvers, escreve anotacoes sobre tendencias e decisoes
- **Estudante de poker**: Categoriza aprendizado por tema, cria notas durante sessoes de estudo com coaches

## Requisitos Funcionais

### RF-01: Temas de Estudo
**Descricao:** O usuario organiza seus estudos em temas. Cada tema representa um spot ou conceito de poker.
**Regras de negocio:**
- Temas padrao pre-criados na primeira visita: "IP vs BB", "BB vs IP", "SB vs BB - BW", "BB vs SB BW", "3bet Pot IP", "3bet Pot OOP", "ICM"
- Usuario pode criar novos temas (nome obrigatorio, cor opcional)
- Usuario pode renomear, deletar e reordenar temas
- Deletar tema requer confirmacao e deleta todo conteudo associado
- Cada tema tem: nome (string, max 50 chars), cor (hex, default #16a34a), icone (emoji, default baseado no nome), updatedAt (auto)
- Tela principal mostra grid de temas com nome, cor, ultima atualizacao e contagem de notas
- Busca filtra temas por nome
- Tema pode ser favoritado (aparece no topo)
**Criterio de aceitacao:**
- [ ] 7 temas padrao criados automaticamente para usuario novo
- [ ] Criar tema custom com nome + cor
- [ ] Renomear tema existente
- [ ] Deletar tema com confirmacao
- [ ] Reordenar temas por drag-and-drop ou botoes
- [ ] Favoritar/desfavoritar tema
- [ ] Buscar temas por nome
- [ ] Grid responsivo (1 col mobile, 2 cols tablet, 3-4 cols desktop)

### RF-02: Abas dentro de cada Tema
**Descricao:** Cada tema tem abas que representam categorias de conteudo. O usuario navega entre abas para organizar notas por fase do jogo ou conceito.
**Regras de negocio:**
- Abas padrao criadas com cada tema: "Flop", "Turn", "River", "Tendencias"
- Usuario pode criar novas abas (nome obrigatorio, max 30 chars)
- Usuario pode renomear e deletar abas customizadas
- Abas padrao nao podem ser deletadas (apenas customizadas)
- Cada aba contem um editor de anotacoes independente
- Abas sao exibidas como tabs horizontais no topo do tema
- Ordem das abas: padrao primeiro (Flop, Turn, River, Tendencias), depois customizadas na ordem de criacao
**Criterio de aceitacao:**
- [ ] 4 abas padrao criadas com cada novo tema
- [ ] Criar aba customizada
- [ ] Renomear aba
- [ ] Deletar aba customizada (com confirmacao)
- [ ] Abas padrao nao podem ser deletadas
- [ ] Cada aba tem conteudo independente
- [ ] Navegacao fluida entre abas sem perda de conteudo

### RF-03: Editor de Anotacoes Rico
**Descricao:** Cada aba tem um editor block-based (estilo Notion) onde o usuario escreve, formata e organiza suas anotacoes.
**Regras de negocio:**
- Editor baseado em blocos com os tipos: paragrafo, heading (H1, H2, H3), lista (bullet, numerada, checklist), toggle/acordeao, imagem, separador, callout
- Menu slash (`/`) para inserir novos tipos de bloco
- Toolbar inline ao selecionar texto: bold, italic, underline, strikethrough, code
- Blocos podem ser reordenados por drag-and-drop (handle na esquerda)
- Toggle/acordeao: titulo clicavel que expande/colapsa conteudo aninhado
- Qualquer tipo de bloco pode ser aninhado dentro de um toggle (incluindo imagens e outros toggles)
- Auto-save com debounce de 1 segundo apos ultima edicao
- Indicador visual de "Salvo" / "Salvando..."
**Criterio de aceitacao:**
- [ ] Criar bloco de cada tipo via menu slash
- [ ] Formatar texto (bold, italic, etc) via toolbar inline
- [ ] Reordenar blocos por drag-and-drop
- [ ] Criar toggle, adicionar conteudo dentro, expandir/colapsar
- [ ] Aninhar imagens dentro de toggles
- [ ] Auto-save funciona com debounce
- [ ] Indicador de save status visivel

### RF-04: Suporte a Imagens (Drag & Drop + Paste)
**Descricao:** O usuario pode adicionar imagens (prints de solvers, ranges, spots) diretamente no editor por 3 metodos.
**Regras de negocio:**
- **Drag-and-drop**: Arrastar arquivo de imagem do desktop para o editor
- **Clipboard paste**: Ctrl+V cola screenshot da area de transferencia
- **File picker**: Clicar no bloco de imagem para abrir seletor de arquivo
- Formatos aceitos: PNG, JPG, JPEG, GIF, WebP
- Tamanho maximo: 5MB por imagem
- Imagens sao uploaded para o servidor via `POST /api/study-images` e armazenadas em disco (diretorio `uploads/study-images/`)
- Editor recebe URL da imagem apos upload
- Imagens podem ser arrastadas para dentro de toggles
- Preview da imagem aparece inline no editor apos upload
**Criterio de aceitacao:**
- [ ] Drag-and-drop de imagem do desktop funciona
- [ ] Ctrl+V cola screenshot do clipboard
- [ ] File picker abre e aceita imagens
- [ ] Formatos invalidos rejeitados com mensagem
- [ ] Imagens > 5MB rejeitadas com mensagem
- [ ] Imagem aparece inline apos upload
- [ ] Imagem dentro de toggle funciona

### RF-05: Navegacao e Organizacao
**Descricao:** A pagina principal dos estudos mostra todos os temas organizados e permite navegacao rapida.
**Regras de negocio:**
- Vista principal: grid de cards de temas
- Cada card mostra: icone/emoji, nome, cor (borda ou fundo), "Atualizado ha X" (humanized date), contagem de notas/abas
- Clicar num tema abre a vista do tema com abas
- Botao de voltar para a lista de temas
- Breadcrumb: "Estudos > [Nome do Tema] > [Aba Atual]"
- Busca global filtra temas por nome
- Temas favoritados aparecem primeiro
**Criterio de aceitacao:**
- [ ] Grid de temas renderiza corretamente
- [ ] Card mostra todas informacoes (nome, cor, data, contagem)
- [ ] Clicar abre tema com abas
- [ ] Breadcrumb funciona para navegacao
- [ ] Busca filtra em tempo real
- [ ] Favoritos aparecem primeiro

## Requisitos Nao-Funcionais
- **Performance:** Editor deve carregar em < 500ms. Auto-save nao deve travar a UI.
- **Storage:** Imagens armazenadas em disco (nao base64 no banco). Conteudo do editor em formato JSON (BlockNote format) numa coluna `jsonb`.
- **Responsividade:** Funciona em desktop e tablet. Mobile e best-effort (editor block-based tem limitacoes em mobile).

## Endpoints Previstos
| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | /api/study-themes | Listar temas do usuario | JWT |
| POST | /api/study-themes | Criar tema | JWT |
| PUT | /api/study-themes/:id | Atualizar tema (nome, cor, favorito, ordem) | JWT |
| DELETE | /api/study-themes/:id | Deletar tema e todo conteudo | JWT |
| GET | /api/study-themes/:themeId/tabs | Listar abas de um tema | JWT |
| POST | /api/study-themes/:themeId/tabs | Criar aba | JWT |
| PUT | /api/study-tabs/:id | Atualizar aba (nome, conteudo) | JWT |
| DELETE | /api/study-tabs/:id | Deletar aba | JWT |
| POST | /api/study-images | Upload de imagem | JWT + Multer |

## Modelos de Dados Afetados

### study_themes (novo)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK, nanoid | |
| userId | varchar | FK -> users.userPlatformId, not null | |
| name | varchar(50) | not null | |
| color | varchar(7) | default '#16a34a' | Hex color |
| emoji | varchar(4) | default '' | Emoji icon |
| isFavorite | boolean | default false | |
| sortOrder | integer | default 0 | |
| createdAt | timestamp | default now() | |
| updatedAt | timestamp | default now() | |

### study_tabs (novo)
| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| id | varchar | PK, nanoid | |
| themeId | varchar | FK -> study_themes.id, not null, onDelete cascade | |
| name | varchar(30) | not null | |
| content | jsonb | default '[]' | BlockNote JSON blocks |
| isDefault | boolean | default false | Abas padrao nao podem ser deletadas |
| sortOrder | integer | default 0 | |
| createdAt | timestamp | default now() | |
| updatedAt | timestamp | default now() | |

### Tabelas existentes mantidas (nao deletar)
As tabelas `study_cards`, `study_materials`, `study_notes`, `study_sessions`, `study_schedules` continuam existindo no schema. A nova pagina nao as usa, mas elas nao devem ser removidas para nao quebrar o banco.

## Biblioteca de Editor
**Recomendacao: BlockNote** (`@blocknote/core` + `@blocknote/react` + `@blocknote/mantine`)
- Editor block-based estilo Notion out-of-the-box
- Slash menu, drag-and-drop de blocos, inline toolbar incluidos
- Suporte nativo a upload de imagens via config `uploadFile`
- Custom blocks para toggle/acordeao
- Armazena conteudo em JSON (ideal para `jsonb` no PostgreSQL)

Alternativa: Tiptap (mais controle, mais boilerplate, sem toggle OOTB).

## Cenarios de Teste Derivados

### Happy Path
- [ ] Usuario novo ve 7 temas padrao na primeira visita
- [ ] Criar tema → aparece no grid → clicar → ver 4 abas padrao
- [ ] Escrever texto → auto-save → recarregar → conteudo preservado
- [ ] Colar screenshot (Ctrl+V) → imagem aparece no editor
- [ ] Criar toggle → arrastar imagem para dentro → colapsar/expandir

### Validacao de Input
- [ ] Nome de tema vazio → erro
- [ ] Nome de tema > 50 chars → erro ou truncar
- [ ] Imagem > 5MB → erro com mensagem
- [ ] Formato de imagem invalido → erro

### Regras de Negocio
- [ ] Deletar tema → confirmacao → deleta tudo (abas + imagens)
- [ ] Abas padrao nao podem ser deletadas
- [ ] Auto-save com debounce (nao salva a cada keystroke)
- [ ] Favoritar tema → aparece primeiro na lista

### Edge Cases
- [ ] Tema sem abas → nao deve crashar
- [ ] Conteudo vazio na aba → salva como array vazio
- [ ] Upload de imagem offline → erro gracioso
- [ ] Multiplos uploads simultaneos → todos completam

## Fora de Escopo
- Colaboracao em tempo real (multiplayer editing)
- Versionamento/historico de edicoes
- Exportacao para PDF/Markdown
- Integracao com GTO Wizard ou outros solvers
- App mobile nativo
- Remocao das tabelas antigas de estudo (mantidas por compatibilidade)

## Dependencias
- BlockNote: `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`
- Mantine (dependencia do BlockNote): `@mantine/core`, `@mantine/hooks`
- Multer (ja existe no projeto para upload)

## Notas de Implementacao
1. Os temas padrao devem ser criados no backend quando o endpoint GET `/api/study-themes` retorna vazio para o usuario (seed on first access).
2. O upload de imagens deve reusar o Multer ja configurado no projeto, adicionando um novo diretorio de destino.
3. O conteudo do editor (JSON) deve ser salvo como `jsonb` no PostgreSQL, nao como string serializada.
4. A pagina antiga de Studies pode ser mantida como rota separada temporariamente, ou substituida diretamente na rota `/estudos`.

## Recomendacoes de UX (baseadas em pesquisa)

### Da pesquisa sobre estudo de poker:
1. **Taxonomia por spot**: A organizacao por "IP vs BB", "3bet Pot" etc reflete como pros realmente categorizam seus estudos (validado por GTO Wizard, Upswing Poker, Smart Poker Study)
2. **Ciclo Play > Review > Study**: A pagina pode no futuro linkar temas de estudo com dados reais de performance do Dashboard (ex: "Voce tem ROI negativo em 3bet pots — revise suas notas sobre este tema")
3. **Prints de solver sao o conteudo principal**: A maioria dos jogadores estuda colando screenshots de ranges, frequencias e EV trees dos solvers. O suporte a imagem drag-and-drop e o feature mais critico.

### Da pesquisa sobre UX de note-taking:
4. **Slash menu e o padrao dominante**: Notion, BlockNote e editores modernos usam `/` para inserir novos tipos de bloco. Familiar para a maioria dos usuarios.
5. **Toggles para organizar spots**: Usar acordeoes para agrupar analises (ex: toggle "Board AKx" contendo print do solver + notas) e o padrao mais eficiente para poker.
6. **Auto-save e obrigatorio**: Nenhum note-taking app moderno tem botao "Salvar". Auto-save com debounce e indicador visual e o padrao esperado.
