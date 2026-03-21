# ADR-007: Usar BlockNote como editor block-based para pagina Estudos

## Status
Aceito

## Data
2026-03-21

## Contexto

A reforma da pagina Estudos (docs/specs/studies-reform.md) exige um editor de anotacoes rico, estilo Notion, com os seguintes requisitos:

1. **Editor block-based** com blocos de paragrafo, heading, listas, imagens, separadores
2. **Slash menu** (`/`) para inserir novos tipos de bloco
3. **Toggle/acordeao** para organizar conteudo colapsavel (spots de poker agrupados)
4. **Upload de imagens** via paste (Ctrl+V), drag-and-drop e file picker
5. **Drag-and-drop de blocos** para reordenacao
6. **Toolbar inline** para formatacao (bold, italic, etc.)
7. **Output em JSON** para armazenamento em coluna `jsonb` no PostgreSQL
8. **Auto-save** com debounce sem travar a UI

O editor e o componente central da feature — jogadores de poker usam-no para colar screenshots de solvers (GTO Wizard), anotar ranges e organizar analises por spot.

## Opcoes Consideradas

### Opcao 1: BlockNote (`@blocknote/react`)

- **Pros:**
  - Editor Notion-like out-of-the-box (slash menu, drag handles, inline toolbar, image blocks)
  - API de custom blocks simples para criar o bloco toggle/acordeao
  - Upload de imagens configuravel via `uploadFile` callback — integra diretamente com o endpoint `/api/study-images`
  - Output nativo em JSON (array de blocks) — mapeamento direto para `jsonb`
  - Documentacao completa com exemplos para React
  - Comunidade ativa, releases frequentes
  - Suporte a theming (dark mode compativel com Tailwind)
- **Contras:**
  - Depende do Mantine (`@mantine/core`, `@mantine/hooks`) como peer dependency — adiciona ~50KB gzipped ao bundle
  - Projeto mais jovem que Tiptap/ProseMirror (desde 2023)
  - Menos plugins de terceiros que o ecossistema Tiptap
  - Toggle/acordeao nao e built-in — precisa de custom block (mas a API para isso e documentada)

### Opcao 2: Tiptap (`@tiptap/react`)

- **Pros:**
  - Ecossistema maduro baseado em ProseMirror (desde 2020)
  - Grande quantidade de extensoes oficiais e comunitarias
  - Controle granular sobre schema e comportamento
  - Sem dependencia de UI library (usa headless)
  - Usado em producao por Notion alternatives (GitBook, etc.)
- **Contras:**
  - Nao tem UX Notion-like out-of-the-box — slash menu, drag handles e toolbar precisam ser construidos manualmente
  - Toggle/acordeao requer implementacao custom significativa (ProseMirror node spec + plugin)
  - Upload de imagem requer extensao custom ou `@tiptap/extension-image` + handler manual
  - Output padrao e HTML — para JSON precisa de transformacao extra
  - Tempo de implementacao estimado: 3-5x mais que BlockNote para atingir mesma UX
  - Versao PRO (paga) tem drag-and-drop e colaboracao, versao open-source nao

### Opcao 3: Lexical (`@lexical/react`)

- **Pros:**
  - Desenvolvido pelo Meta, base do editor do Facebook/Instagram
  - Arquitetura performante baseada em state machine
  - Sem dependencias de UI (totalmente headless)
  - Bom para editores altamente customizados
- **Contras:**
  - Curva de aprendizado alta — API fundamentalmente diferente de ProseMirror/Tiptap
  - Nenhum componente visual pronto (tudo precisa ser construido do zero)
  - Slash menu, drag handles, image blocks, toggles — tudo custom
  - Documentacao com foco em conceitos, poucos exemplos praticos de "como fazer X"
  - Tempo de implementacao: 5-10x mais que BlockNote
  - Overhead de complexidade desproporcional para o caso de uso (note-taking, nao Google Docs)

## Decisao

**Usar BlockNote** (`@blocknote/core` + `@blocknote/react` + `@blocknote/mantine`).

A prioridade da feature e entregar uma experiencia Notion-like funcional com o menor tempo de implementacao. BlockNote entrega slash menu, drag-and-drop de blocos, toolbar inline, image blocks e output JSON sem nenhum boilerplate. O unico componente que precisa ser custom e o toggle/acordeao, e a API de custom blocks do BlockNote e bem documentada para isso.

A dependencia do Mantine e o principal trade-off. O projeto usa Radix/shadcn para UI, e Mantine sera uma segunda design system no bundle. Porem, o BlockNote encapsula o Mantine internamente — nenhum componente Mantine sera usado fora do editor. O acrescimo de ~50KB gzipped e aceitavel dado que a pagina Estudos e uma SPA carregada sob demanda (lazy loading via React.lazy).

Tiptap seria a escolha se precisassemos de controle granular sobre o schema do editor ou colaboracao em tempo real. Lexical seria a escolha se estivessemos construindo um editor como produto (ex: Google Docs competitor). Para note-taking de poker com prints de solver, BlockNote entrega o melhor custo-beneficio.

## Consequencias

### Positivas
- Tempo de implementacao reduzido: editor funcional em 1-2 dias vs 5-10 dias com Tiptap/Lexical
- UX Notion-like familiar para usuarios que ja usam Notion para organizar estudos
- JSON output mapeia diretamente para `jsonb` no PostgreSQL sem transformacao
- Upload de imagem integrado via callback `uploadFile` — sem plugin separado

### Negativas
- Mantine adicionado ao bundle como dependencia indireta (~50KB gzipped)
- Duas design systems no projeto (Radix/shadcn + Mantine) — podem causar conflitos de CSS se nao isoladas
- Se no futuro precisarmos de colaboracao em tempo real, BlockNote nao suporta nativamente (precisariamos migrar para Tiptap + Yjs ou similar)
- Toggle/acordeao e custom block — precisara de manutencao se a API do BlockNote mudar em major versions

### Neutras
- O formato JSON do BlockNote e proprietario (nao e Markdown nem HTML padrao). Migrar para outro editor no futuro requer transformacao dos dados
- BlockNote renderiza os blocos internamente — customizacao visual (cores, fontes) e feita via theming, nao via Tailwind diretamente

## Confianca
Alta — BlockNote e a escolha mais pragmatica para o caso de uso. O risco principal (dependencia do Mantine) e mitigado pelo encapsulamento e lazy loading.
