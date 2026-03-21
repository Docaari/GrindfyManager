# Fluxo: Studies Reform (Reforma da Pagina Estudos)

## Trigger
Usuario acessa a pagina `/estudos` no Grindfy.

## Atores
- **Jogador de poker (usuario autenticado):** Cria temas, organiza notas por spot, cola prints de solvers, escreve anotacoes.

## Pre-condicoes
- Usuario autenticado com JWT valido
- Tabelas `study_themes` e `study_tabs` existem no banco
- Diretorio `uploads/study-images/` existe no filesystem do servidor

## Caminho Principal (Happy Path)

### Primeira Visita
1. Usuario acessa `/estudos`
2. GET `/api/study-themes` retorna lista vazia
3. Backend cria 7 temas padrao (IP vs BB, BB vs IP, SB vs BB BW, BB vs SB BW, 3bet Pot IP, 3bet Pot OOP, ICM)
4. Cada tema recebe 4 abas padrao (Flop, Turn, River, Tendencias) com `isDefault=true`
5. Grid de temas e exibido

### Criar Tema Custom
1. Usuario clica "Novo Tema"
2. Preenche nome (obrigatorio, max 50 chars), cor (opcional, default verde), emoji (opcional)
3. POST `/api/study-themes` cria tema
4. Backend cria 4 abas padrao automaticamente
5. Usuario e redirecionado para a vista do tema

### Editar Conteudo
1. Usuario clica num tema no grid
2. Vista do tema abre com abas horizontais (Flop, Turn, River, Tendencias, + customizadas)
3. Usuario seleciona uma aba
4. BlockNote editor carrega com conteudo da aba (content jsonb)
5. Usuario digita, formata, insere blocos via slash menu
6. Apos 1 segundo sem edicao, auto-save dispara PUT `/api/study-tabs/:id`
7. Indicador visual muda de "Salvando..." para "Salvo"

### Upload de Imagem
1. Usuario cola screenshot (Ctrl+V), arrasta arquivo, ou usa file picker
2. Client valida formato (PNG/JPG/GIF/WebP) e tamanho (<= 5MB)
3. Client comprime imagem se necessario
4. POST `/api/study-images` envia imagem via multipart/form-data
5. Servidor salva em `uploads/study-images/{nanoid}.{ext}`
6. Servidor retorna URL da imagem
7. Editor insere bloco de imagem com a URL

### Toggle/Acordeao
1. Usuario digita `/` e seleciona "Toggle"
2. Bloco toggle e inserido (titulo + area colapsavel)
3. Usuario arrasta blocos (texto, imagens) para dentro do toggle
4. Toggle pode ser expandido/colapsado clicando no titulo

## Caminhos de Erro
- **Nome de tema vazio** -> Validacao impede criacao, mensagem de erro
- **Nome de tema > 50 chars** -> Validacao trunca ou rejeita com mensagem
- **Imagem > 5MB** -> Client exibe toast "Imagem excede 5MB"
- **Formato de imagem invalido** -> Client exibe toast "Formato nao suportado"
- **Auto-save falha (rede/servidor)** -> Indicador "Erro ao salvar", retry automatico em 3s
- **Deletar aba padrao** -> Acao bloqueada, botao desabilitado ou oculto
- **Deletar tema** -> Confirmacao obrigatoria, cascade deleta abas e conteudo

## Regras de Negocio
- 7 temas padrao criados na primeira visita (seed on first access, nao no registro)
- 4 abas padrao criadas com cada novo tema (Flop, Turn, River, Tendencias)
- Abas padrao (`isDefault=true`) nao podem ser deletadas
- Temas favoritados (`isFavorite=true`) aparecem primeiro no grid
- Conteudo do editor armazenado como JSON (BlockNote format) em coluna `jsonb`
- Imagens armazenadas em disco, nao como base64 no banco
- Auto-save com debounce de 1 segundo
- Deletar tema faz cascade delete de todas as abas (FK com `onDelete: cascade`)
- Tabelas antigas de estudo (study_cards, study_notes, etc.) nao sao removidas

## Endpoints Envolvidos

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/study-themes` | Listar temas do usuario (seed se vazio) |
| POST | `/api/study-themes` | Criar tema + 4 abas padrao |
| PUT | `/api/study-themes/:id` | Atualizar tema (nome, cor, emoji, favorito, ordem) |
| DELETE | `/api/study-themes/:id` | Deletar tema (cascade abas) |
| GET | `/api/study-themes/:themeId/tabs` | Listar abas de um tema |
| POST | `/api/study-themes/:themeId/tabs` | Criar aba customizada |
| PUT | `/api/study-tabs/:id` | Atualizar aba (nome ou conteudo) |
| DELETE | `/api/study-tabs/:id` | Deletar aba customizada |
| POST | `/api/study-images` | Upload de imagem (Multer) |

## Cenarios de Teste Derivados

### Happy Path
- [ ] Usuario novo: GET `/api/study-themes` retorna 7 temas padrao criados automaticamente
- [ ] Cada tema padrao tem 4 abas (Flop, Turn, River, Tendencias)
- [ ] Criar tema custom com nome + cor -> tema aparece no grid
- [ ] Criar tema -> 4 abas padrao criadas automaticamente
- [ ] Selecionar aba -> editor carrega com conteudo salvo
- [ ] Digitar texto -> auto-save apos 1s -> recarregar -> conteudo preservado
- [ ] Colar screenshot (Ctrl+V) -> imagem aparece inline no editor
- [ ] Drag-and-drop de arquivo de imagem -> upload + insercao no editor
- [ ] File picker -> selecionar imagem -> upload + insercao
- [ ] Criar toggle -> adicionar conteudo dentro -> expandir/colapsar funciona
- [ ] Favoritar tema -> PUT atualiza isFavorite -> tema aparece primeiro

### Validacao de Input
- [ ] Nome de tema vazio -> erro 400
- [ ] Nome de tema > 50 chars -> erro 400 ou truncamento
- [ ] Nome de aba vazio -> erro 400
- [ ] Nome de aba > 30 chars -> erro 400
- [ ] Imagem > 5MB -> rejeicao client-side com mensagem
- [ ] Formato invalido (ex: .bmp, .tiff) -> rejeicao com mensagem
- [ ] Cor invalida (nao hex) -> erro 400

### Regras de Negocio
- [ ] Deletar tema -> confirmacao -> cascade deleta todas abas
- [ ] Abas padrao (isDefault=true) nao podem ser deletadas -> erro 403 ou bloqueio
- [ ] Auto-save usa debounce (nao salva a cada keystroke)
- [ ] Temas favoritados aparecem antes dos nao-favoritados
- [ ] Seed so ocorre na primeira visita (nao duplica temas se ja existem)

### Edge Cases
- [ ] Tema sem abas (todas deletadas) -> nao crashar, exibir estado vazio
- [ ] Conteudo vazio na aba -> salva como array vazio `[]`
- [ ] Upload de imagem com rede offline -> erro gracioso sem crash
- [ ] Multiplos uploads simultaneos -> todos completam independentemente
- [ ] Auto-save enquanto upload em andamento -> ambos funcionam sem conflito
- [ ] Usuario acessa tema de outro usuario -> 403 Forbidden
- [ ] Deletar aba que esta sendo editada -> redirecionar para outra aba
