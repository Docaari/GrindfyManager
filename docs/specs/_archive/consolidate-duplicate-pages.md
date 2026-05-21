# Spec: Consolidar Paginas Duplicadas

## Status
Concluida

## Resumo
Migrar funcionalidade unica do `HomePage.tsx` para `Home.tsx` e deletar o arquivo duplicado. Das 5 duplicatas documentadas no CLAUDE.md, 4 ja foram resolvidas — resta apenas o par `HomePage.tsx` / `Home.tsx`.

## Contexto
O CLAUDE.md secao 10.2 item 9 documenta pares de paginas duplicadas (Login/LoginPage, Register/RegisterPage, etc.). Investigacao revelou que 4 dos 5 pares ja foram consolidados em sessoes anteriores. Apenas `HomePage.tsx` permanece como codigo morto, porem contem uma feature unica (`WelcomeNameModal`) que precisa ser migrada antes da delecao.

## Usuarios
- **Jogador:** Ve o modal de boas-vindas no primeiro login (quando `user.name` esta vazio)

## Requisitos Funcionais

### RF-01: Migrar WelcomeNameModal para Home.tsx
**Descricao:** Adicionar a logica do `WelcomeNameModal` que existe em `HomePage.tsx` para `Home.tsx`.
**Regras de negocio:**
- O modal aparece quando `user.name` esta vazio E `localStorage` key `hasSetName_{userPlatformId}` NAO existe
- Apos o usuario definir o nome, setar `hasSetName_{userPlatformId}` no localStorage
- Importar `WelcomeNameModal` de `../components/WelcomeNameModal`
- Adicionar `useState` para controle de visibilidade do modal
- Adicionar `useEffect` para verificar condicao de exibicao
**Criterio de aceitacao:**
- [ ] `Home.tsx` importa e renderiza `WelcomeNameModal`
- [ ] Modal aparece no primeiro login quando usuario nao tem nome definido
- [ ] Modal nao aparece apos usuario definir nome
- [ ] `localStorage` key e setada corretamente apos definicao do nome

### RF-02: Deletar HomePage.tsx
**Descricao:** Remover o arquivo `client/src/pages/HomePage.tsx` apos migracao da RF-01.
**Regras de negocio:**
- Verificar que nenhum arquivo importa `HomePage` antes de deletar
- `HomePage.tsx` NAO e referenciado em `App.tsx` nem em nenhum outro componente
**Criterio de aceitacao:**
- [ ] `HomePage.tsx` deletado
- [ ] Zero referencias a `HomePage` no codebase (grep confirma)
- [ ] Aplicacao compila sem erros

### RF-03: Atualizar CLAUDE.md
**Descricao:** Atualizar documentacao para refletir a consolidacao.
**Regras de negocio:**
- Remover `HomePage.tsx` da listagem de diretorios (secao 3)
- Atualizar secao 10.2 item 9 para indicar que todas as duplicatas foram consolidadas
**Criterio de aceitacao:**
- [ ] CLAUDE.md secao 3 nao lista mais `HomePage.tsx`
- [ ] CLAUDE.md secao 10.2 item 9 atualizado

## Requisitos Nao-Funcionais
- **Performance:** Nenhum impacto (mesmo componente, mesmo bundle)
- **Seguranca:** Nenhum impacto

## Modelos de Dados Afetados
Nenhum.

## Cenarios de Teste Derivados

### Happy Path
- [ ] Usuario novo (sem nome) ve o WelcomeNameModal ao acessar Home
- [ ] Usuario com nome definido NAO ve o modal

### Regressao
- [ ] Todas as rotas de Home (`/`, `/home`) continuam funcionando
- [ ] Nenhum componente quebra apos remocao do HomePage.tsx
- [ ] Build de producao compila sem erros

### Edge Cases
- [ ] Usuario limpa localStorage — modal reaparece se nome nao estiver definido
- [ ] Usuario com nome vazio ("") ve o modal

## Fora de Escopo
- Alterar design ou layout do Home.tsx
- Modificar o componente WelcomeNameModal em si
- Deletar WelcomeNameModal.tsx (continua existindo, apenas importado por Home.tsx)
- Consolidar outros pares de paginas (ja resolvidos)

## Dependencias
Nenhuma.
