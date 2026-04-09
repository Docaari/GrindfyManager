# Spec: UX Sprint 4 — Landing Page & Conversao

## Status
Proposta

## Resumo
Reescrita completa da landing page em PT-BR com pricing, social proof, FAQ e CTAs de conversao, acompanhada da integracao do Google OAuth na UI de login e registro. Sprint focado em aquisicao e conversao de novos usuarios.

## Contexto
A landing page atual (`Landing.tsx`) esta inteiramente em ingles num produto PT-BR, nao tem pricing visivel, nao tem prova social, o unico CTA e "Login" (sem opcao de registro), e o footer mostra "2024". Isso causa abandono imediato de visitantes. O Google OAuth ja existe no backend (`server/oauth.ts` + `server/routes/auth.ts`) mas nao aparece na UI, adicionando friccao desnecessaria ao registro. Este sprint ataca os dois maiores gargalos de conversao do funil de aquisicao.

**Referencia:** FP-01 e FP-03 do master plan em `Docs/specs/ux-audit-master-plan.md`

## Usuarios
- **Visitante anonimo:** Chega na landing, precisa entender o produto e converter para registro
- **Jogador retornando:** Chega na landing, precisa de acesso rapido ao login (inclusive via Google)
- **Jogador novo registrando:** Precisa de caminho de menor friccao para criar conta

---

## FP-01: Landing Page Completa em PT-BR

### RF-01: Hero Section com proposta de valor
**Descricao:** Secao principal no topo da pagina com headline, subtitulo e CTA primario.
**Regras de negocio:**
- Headline em PT-BR comunicando o beneficio principal (ex: "Controle total sobre sua carreira no poker")
- Subtitulo explicando o que o Grindfy faz em 1-2 frases
- CTA primario: botao "Criar Conta Gratis" que navega para `/register`
- CTA secundario: link "Ja tem conta? Fazer Login" que navega para `/login`
- Logo do Grindfy no header (usar asset existente em `attached_assets/`)
**Criterio de aceitacao:**
- [ ] Hero exibe headline e subtitulo em PT-BR
- [ ] Botao "Criar Conta Gratis" navega para `/register`
- [ ] Link de login navega para `/login`
- [ ] Texto nao contem nenhuma palavra em ingles (exceto termos tecnicos de poker: ROI, buy-in, MTT, grind)

### RF-02: Secao de Features (6 cards)
**Descricao:** Grid de 6 cards descrevendo as funcionalidades principais do Grindfy.
**Regras de negocio:**
- 6 cards com icone, titulo e descricao em PT-BR
- Cards devem representar funcionalidades REAIS do produto:
  1. **Dashboard de Performance** — Acompanhe ROI, lucro e metricas com graficos detalhados
  2. **Biblioteca de Torneios** — Analise seus torneios agrupados por template com estatisticas de confianca
  3. **Grade Semanal** — Planeje sua semana de grind com perfis A/B/C e drag-and-drop
  4. **Grind ao Vivo** — Acompanhe sessoes em tempo real com tracking mental e breaks inteligentes
  5. **Preparacao Mental** — Warm-up antes das sessoes com checklist e auto-avaliacao
  6. **Import Multi-Rede** — Importe historico de 10+ redes de poker (GGPoker, PokerStars, WPN, 888, etc.)
- Cada card usa um icone do Lucide React ja disponivel no projeto
- Layout: grid de 3 colunas em desktop, 2 em tablet, 1 em mobile
**Criterio de aceitacao:**
- [ ] 6 cards renderizados com icone, titulo e descricao em PT-BR
- [ ] Layout responsivo: 3 colunas em lg, 2 em md, 1 em sm
- [ ] Icones sao do Lucide React (nao imagens externas)

### RF-03: Secao de Pricing com 3 planos
**Descricao:** Secao mostrando os planos disponiveis com precos e features de cada um.
**Regras de negocio:**
- Buscar dados dos planos do objeto `PLANS` definido em `shared/permissions.ts`:
  - **Mensal:** R$ 29,90/mes
  - **Anual:** R$ 19,90/mes (R$ 238,80/ano) — com badge "33% OFF"
- Adicionar plano gratuito (nao existe em `PLANS`, definir estaticamente na landing):
  - **Gratis:** Trial de 7 dias com acesso completo, sem cartao de credito
- Cada card de plano lista as features incluidas
- Plano recomendado (Anual) deve ter destaque visual (borda colorida, badge "Mais Popular")
- CTA de cada plano: "Comecar Gratis" para o plano gratuito, "Assinar Agora" para pagos
- Todos os CTAs de pricing levam para `/register` (registro primeiro, pagamento depois)
- Moeda exibida: BRL (R$)
- Toggle mensal/anual NAO e necessario — exibir os 3 cards lado a lado
**Criterio de aceitacao:**
- [ ] 3 cards de plano exibidos: Gratis, Mensal, Anual
- [ ] Precos do Mensal e Anual correspondem ao `PLANS` de `shared/permissions.ts`
- [ ] Plano Anual tem badge de desconto "33% OFF"
- [ ] Plano Anual tem destaque visual como "Mais Popular"
- [ ] CTA de todos os planos navega para `/register`
- [ ] Valores exibidos em BRL com formatacao brasileira (R$ X,XX)

### RF-04: Secao de Social Proof
**Descricao:** Secao com numeros do produto e depoimentos para gerar confianca.
**Regras de negocio:**
- Exibir contadores estaticos (hardcoded inicialmente, substituir por API futuramente):
  - "X+ torneios analisados" (hardcoded com valor representativo, ex: "50.000+")
  - "10+ redes de poker suportadas"
  - "Dados 100% seguros e privados"
- Exibir 3 depoimentos hardcoded de jogadores ficticios (com nome, foto placeholder e quote)
- Depoimentos devem soar naturais e mencionar beneficios reais do produto
- Nota: nao criar endpoint de API para social proof neste sprint — tudo hardcoded no frontend
**Criterio de aceitacao:**
- [ ] 3 contadores exibidos com numeros e labels em PT-BR
- [ ] 3 depoimentos com nome, avatar placeholder e texto em PT-BR
- [ ] Nenhuma chamada de API para dados de social proof

### RF-05: Secao FAQ
**Descricao:** Secao de perguntas frequentes usando componente Accordion.
**Regras de negocio:**
- 6-8 perguntas frequentes cobrindo:
  1. "O que e o Grindfy?" — Explicacao do produto
  2. "De quais redes de poker posso importar dados?" — Listar as 10 redes suportadas
  3. "Meus dados estao seguros?" — Privacidade e seguranca
  4. "Como funciona o trial gratuito?" — 7 dias, acesso completo, sem cartao
  5. "Posso usar no celular?" — Responsivo, funciona em qualquer dispositivo
  6. "Como importo meu historico?" — Passo a passo simples (upload CSV/XLSX)
  7. "O Grindfy funciona para cash game?" — Nao, focado em MTT
  8. "Posso cancelar a qualquer momento?" — Sim, sem fidelidade
- Usar componente Accordion do shadcn/ui (Radix Accordion) ja disponivel
- Apenas uma pergunta aberta por vez (tipo "single")
**Criterio de aceitacao:**
- [ ] 6-8 FAQs renderizadas em componente Accordion
- [ ] Todas as perguntas e respostas em PT-BR
- [ ] Apenas uma FAQ aberta por vez
- [ ] Respostas sao precisas em relacao ao produto real

### RF-06: CTA Final + Footer
**Descricao:** Secao final de conversao e footer da pagina.
**Regras de negocio:**
- CTA final: card com headline motivacional e botao "Criar Conta Gratis" → `/register`
- Footer com:
  - Logo Grindfy
  - Links: "Sobre", "FAQ" (anchor para secao FAQ na mesma pagina), "Contato" (mailto: admin@grindfyapp.com)
  - Copyright: "(c) 2026 Grindfy. Todos os direitos reservados."
  - Texto: "Feito para jogadores de poker por jogadores de poker"
- Footer NAO inclui links para redes sociais (nao existem ainda)
**Criterio de aceitacao:**
- [ ] CTA final com botao que navega para `/register`
- [ ] Footer com copyright 2026 em PT-BR
- [ ] Link FAQ faz scroll suave para secao FAQ
- [ ] Nenhum texto em ingles no footer

### RF-07: Responsividade Mobile-First
**Descricao:** A landing page deve funcionar perfeitamente em todos os tamanhos de tela.
**Regras de negocio:**
- Breakpoints seguindo Tailwind padrao: sm (640px), md (768px), lg (1024px)
- Mobile: todos os grids em 1 coluna, hero com texto menor, pricing em stack vertical
- Tablet: features em 2 colunas, pricing em 2+1
- Desktop: features em 3 colunas, pricing em 3 colunas
- Header: em mobile, botoes do header devem permanecer visiveis (nao usar hamburger menu — a landing e uma pagina unica sem navegacao complexa)
- Imagens/icones devem ser dimensionados proporcionalmente
**Criterio de aceitacao:**
- [ ] Landing renderiza corretamente em 375px (mobile)
- [ ] Landing renderiza corretamente em 768px (tablet)
- [ ] Landing renderiza corretamente em 1440px (desktop)
- [ ] Nenhum overflow horizontal em nenhum breakpoint
- [ ] Textos legiveIs em todos os tamanhos (minimo 14px em mobile)

---

## FP-03: Login Social (Google OAuth)

### RF-08: Botao Google OAuth na pagina de Login
**Descricao:** Adicionar botao "Continuar com Google" na pagina de login.
**Regras de negocio:**
- Botao posicionado ABAIXO do formulario de login existente
- Divisor visual entre formulario e botao: linha horizontal com texto "ou" centralizado
- Texto do botao: "Continuar com Google" com icone do Google (SVG inline — nao usar biblioteca externa)
- Estilo do botao: fundo branco, borda cinza, texto escuro (seguindo guidelines visuais do Google)
- Ao clicar:
  1. Chamar `GET /api/auth/google` para obter a `authUrl`
  2. Redirecionar o browser para a `authUrl` retornada (window.location.href)
  3. Google processa autenticacao e redireciona para `/api/auth/google/callback`
  4. Backend callback retorna JSON com tokens — PROBLEMA: callback atual retorna JSON, nao redireciona para o frontend
- Se `GOOGLE_CLIENT_ID` nao estiver configurado no backend, o endpoint `/api/auth/google` retornara erro — neste caso, o botao NAO deve aparecer na UI
**Criterio de aceitacao:**
- [ ] Botao "Continuar com Google" visivel abaixo do formulario de login
- [ ] Divisor "ou" entre formulario e botao
- [ ] Click no botao inicia fluxo OAuth com redirect para Google
- [ ] Botao usa estilo visual consistente com guidelines do Google
- [ ] Botao nao aparece se OAuth nao estiver configurado no backend

### RF-09: Botao Google OAuth na pagina de Registro
**Descricao:** Adicionar botao "Continuar com Google" na pagina de registro.
**Regras de negocio:**
- Mesma implementacao visual e tecnica do RF-08
- Botao posicionado ABAIXO do formulario de registro
- Divisor "ou" entre formulario e botao
- Texto: "Registrar com Google"
- Mesmo fluxo OAuth: chama `/api/auth/google` → redirect → callback
**Criterio de aceitacao:**
- [ ] Botao "Registrar com Google" visivel abaixo do formulario de registro
- [ ] Divisor "ou" entre formulario e botao
- [ ] Click no botao inicia fluxo OAuth identico ao login
- [ ] Estilo visual identico ao botao no login

### RF-10: Callback OAuth — Redirect para Frontend
**Descricao:** O callback atual (`GET /api/auth/google/callback`) retorna JSON. Precisa redirecionar para o frontend apos autenticacao.
**Regras de negocio:**
- Alterar o endpoint `GET /api/auth/google/callback` em `server/routes/auth.ts`:
  - Apos autenticacao bem-sucedida e geracao de tokens:
    - Setar cookies httpOnly com access_token e refresh_token (ja faz isso)
    - Em vez de retornar JSON, fazer `res.redirect('/home')` para redirecionar ao frontend
  - Em caso de erro:
    - Redirecionar para `/login?error=oauth_failed` com query param indicando erro
- O frontend (`LoginPage.tsx`) deve verificar o query param `error` ao montar e exibir toast de erro se presente
- Se usuario chegou via OAuth e ja tem cookie valido, o `AuthContext` existente deve detectar a sessao automaticamente ao carregar `/home`
**Criterio de aceitacao:**
- [ ] Callback de sucesso redireciona para `/home` (nao retorna JSON)
- [ ] Callback de erro redireciona para `/login?error=oauth_failed`
- [ ] Cookies httpOnly sao setados antes do redirect
- [ ] Frontend exibe mensagem de erro se query param `error` estiver presente
- [ ] AuthContext detecta sessao OAuth automaticamente via cookies

### RF-11: Vinculacao de Conta Existente
**Descricao:** Se o email do Google ja existe como conta local, vincular o Google ID automaticamente.
**Regras de negocio:**
- Logica ja existe em `OAuthService.createOrUpdateOAuthUser()`:
  - Se `users.email` corresponde ao email do Google → atualiza `googleId`, `profileImageUrl`, `emailVerified`
  - Se email nao existe → cria nova conta com dados do Google
- A conta criada via OAuth:
  - Recebe `emailVerified: true` automaticamente (Google ja verificou)
  - Recebe `status: 'active'`
  - Recebe `subscriptionPlan: 'trial'` (comportamento padrao de novo usuario)
  - NAO precisa de senha (campo `password` pode ser null para contas OAuth-only)
- Se usuario tem conta local (com senha) e vincula Google: ambos os metodos de login devem funcionar
**Criterio de aceitacao:**
- [ ] Email Google existente vincula conta sem criar duplicata
- [ ] Novo email Google cria conta automaticamente
- [ ] Conta criada via OAuth tem `emailVerified: true`
- [ ] Conta com Google vinculado ainda permite login com email/senha
- [ ] Conta criada via OAuth-only funciona sem senha definida

### RF-12: Verificacao de Disponibilidade do OAuth
**Descricao:** O frontend deve verificar se o Google OAuth esta configurado antes de exibir o botao.
**Regras de negocio:**
- Criar endpoint simples: `GET /api/auth/providers` que retorna quais providers OAuth estao disponiveis
  - Retorna `{ google: true }` se `GOOGLE_CLIENT_ID` estiver configurado
  - Retorna `{ google: false }` se nao estiver configurado
- Frontend chama este endpoint ao montar LoginPage e RegisterPage
- Se `google: false`, nao renderiza o botao nem o divisor "ou"
- Endpoint NAO requer autenticacao
- Cache no frontend: resultado pode ser cacheado via React Query com `staleTime: Infinity`
**Criterio de aceitacao:**
- [ ] Endpoint `GET /api/auth/providers` retorna status dos providers
- [ ] Endpoint nao requer autenticacao
- [ ] Botao Google so aparece quando provider esta disponivel
- [ ] Ausencia de configuracao nao causa erro no frontend

---

## Requisitos Nao-Funcionais

- **Performance:** Landing page deve carregar em < 2s no Lighthouse (sem dados de API). Nenhum fetch bloqueante no render inicial da landing.
- **SEO:** Usar tags semanticas (section, article, h1/h2/h3) para estrutura da landing. Meta tags basicas (title, description) em PT-BR.
- **Acessibilidade:** Botoes com labels descritivos, contraste minimo WCAG AA, FAQ navegavel via teclado (Accordion do Radix ja suporta).
- **Seguranca OAuth:** State parameter validado no callback (ja implementado). Tokens OAuth nao expostos ao frontend. Cookies httpOnly para JWT.

---

## Endpoints Previstos

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| GET | /api/auth/providers | Retorna providers OAuth disponiveis | Nao |
| GET | /api/auth/google | Gera URL de autorizacao Google (ja existe) | Nao |
| GET | /api/auth/google/callback | Callback OAuth — alterar para redirect (ja existe) | Nao |

**Nota:** O endpoint `/api/auth/google` ja existe e retorna `{ authUrl }`. O `/api/auth/google/callback` ja existe mas precisa ser alterado de JSON response para redirect. O unico endpoint NOVO e o `/api/auth/providers`.

---

## Modelos de Dados Afetados

### users (alteracao minima)
| Campo | Tipo | Constraints | Notas |
|-------|------|-------------|-------|
| googleId | varchar | nullable | Ja existe no schema. Preenchido apos OAuth. |
| profileImageUrl | varchar | nullable | Ja existe. Atualizado com foto do Google. |
| emailVerified | boolean | default false | Ja existe. Setado para true apos OAuth com email verificado. |
| password | varchar | nullable | Ja permite null. Contas OAuth-only nao tem senha. |

**Nenhuma migracao necessaria** — todos os campos ja existem no schema.

---

## Integracoes Externas

| Servico | Proposito | Quando | Configuracao |
|---------|-----------|--------|--------------|
| Google OAuth 2.0 | Autenticacao social | Login/Registro via Google | `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env` |

### Configuracao Necessaria para Google OAuth

Para o Google OAuth funcionar, o operador deve:

1. Criar projeto no [Google Cloud Console](https://console.cloud.google.com/)
2. Ativar a API "Google+ API" ou "Google Identity" no projeto
3. Criar credenciais OAuth 2.0 (Client ID + Client Secret)
4. Configurar "Authorized redirect URIs":
   - Desenvolvimento: `http://localhost:3000/api/auth/google/callback`
   - Producao: `https://app.grindfy.com/api/auth/google/callback` (ou URL de producao)
5. Adicionar variaveis ao `.env`:
   ```
   GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxx
   ```
6. Reiniciar o servidor

**Se as variaveis nao estiverem configuradas:** O botao Google simplesmente nao aparece na UI (graceful degradation via `/api/auth/providers`).

---

## Cenarios de Teste Derivados

### Happy Path — Landing Page
- [ ] Landing carrega com todos os textos em PT-BR
- [ ] Clicar "Criar Conta Gratis" no hero navega para /register
- [ ] Clicar "Ja tem conta? Fazer Login" navega para /login
- [ ] Scroll ate pricing mostra 3 planos com precos corretos
- [ ] FAQ abre/fecha corretamente (apenas uma aberta por vez)
- [ ] Footer mostra "(c) 2026 Grindfy"
- [ ] Landing renderiza corretamente em mobile (375px)
- [ ] Landing renderiza corretamente em desktop (1440px)

### Happy Path — Google OAuth
- [ ] Botao "Continuar com Google" visivel no login quando OAuth configurado
- [ ] Botao "Registrar com Google" visivel no registro quando OAuth configurado
- [ ] Click no botao redireciona para Google
- [ ] Apos autenticacao no Google, usuario e redirecionado para /home
- [ ] Usuario logado via OAuth tem acesso normal ao sistema
- [ ] Novo usuario criado via OAuth tem trial ativo

### Validacao e Erros — Google OAuth
- [ ] Se OAuth nao configurado, botao nao aparece (sem erro)
- [ ] Se usuario cancela no Google, e redirecionado para /login com mensagem
- [ ] Se callback falha (state invalido), redireciona para /login?error=oauth_failed
- [ ] Se Google retorna email que ja existe, vincula conta sem duplicar

### Edge Cases — Google OAuth
- [ ] Usuario com conta local (email+senha) faz login via Google: vincula googleId, ambos metodos funcionam
- [ ] Usuario OAuth-only tenta "esqueci senha": deve funcionar (gera senha nova)
- [ ] Dois requests simultaneos de OAuth com mesmo email: nao cria duplicata (unique constraint em email)
- [ ] Token OAuth expirado no state store: retorna erro e redireciona

### Edge Cases — Landing Page
- [ ] Nenhuma imagem externa carregada (tudo local ou SVG inline)
- [ ] Links de anchor (#faq, #pricing) funcionam com scroll suave
- [ ] Navegacao back/forward do browser funciona corretamente

---

## Fora de Escopo
- **Apple Sign-In:** Nao incluir neste sprint. Pode ser adicionado futuramente seguindo o mesmo padrao.
- **Pagina de checkout na landing:** Os CTAs de pricing levam para `/register`, nao para um fluxo de pagamento. Checkout e tratado na area logada (pagina de assinaturas existente).
- **A/B testing na landing:** Nao implementar variantes de teste neste sprint.
- **Blog ou pagina de conteudo:** Nao criar paginas adicionais alem da landing.
- **Endpoint de contagem real de torneios:** Social proof usa numeros hardcoded. Endpoint de contagem para substituir e escopo futuro.
- **Login com Facebook, Apple, ou outros providers:** Apenas Google neste sprint.
- **Animacoes complexas ou parallax:** Manter animacoes sutis. Nao usar bibliotecas de animacao pesadas (Framer Motion permitido para transicoes simples ja que esta no projeto).
- **Internacionalizacao (i18n):** Landing e fixa em PT-BR. Sem suporte a outros idiomas.
- **Imagens reais / screenshots do produto:** Usar icones e descricoes textuais. Screenshots reais sao escopo futuro (precisam ser gerados e curados manualmente).

---

## Dependencias
- **shared/permissions.ts:** Contem `PLANS` com precos de Mensal e Anual — fonte de verdade para pricing
- **server/oauth.ts:** Servico OAuth ja implementado — nao precisa ser reescrito
- **server/routes/auth.ts:** Endpoints OAuth ja existem — callback precisa de alteracao (JSON → redirect)
- **shadcn/ui Accordion:** Necessario para FAQ. Verificar se ja esta instalado; se nao, instalar via `npx shadcn-ui@latest add accordion`
- **Variaveis de ambiente:** `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` devem estar configurados para OAuth funcionar

---

## Notas de Implementacao

1. **Landing.tsx** deve ser reescrita do zero. O arquivo atual tem ~140 linhas de conteudo em ingles que sera 100% substituido.
2. **Pricing:** Importar `PLANS` de `@shared/permissions` para garantir que precos na landing sempre refletem os precos reais. O plano "Gratis" (trial 7 dias) e hardcoded na landing pois nao existe como plano formal.
3. **OAuth callback:** A alteracao mais delicada e mudar o callback de retornar JSON para fazer redirect. O fluxo atual retorna `res.json(...)` — precisa mudar para `res.redirect('/home')` mantendo os cookies httpOnly. Testar que o `AuthContext` pega a sessao via cookie apos redirect.
4. **OAuth state store em memoria:** O `oauthStateStore` em `server/oauth.ts` usa `Map` em memoria. Isso funciona em single-instance mas perde state apos restart. Para producao futura, migrar para banco (similar ao que foi feito com auth_tokens). Nao e escopo deste sprint.
5. **Google icon SVG:** Usar SVG inline do logo do Google (4 cores). Nao adicionar dependencia de biblioteca de icones. O SVG e pequeno (~1KB).
6. **`createOrUpdateOAuthUser` nao seta `userPlatformId`:** Verificar se a criacao de usuario via OAuth gera o `userPlatformId` no formato `USER-XXXX`. O metodo atual usa `nanoid()` para `id` mas pode nao estar setando `userPlatformId`. Se nao estiver, corrigir para manter consistencia com o registro normal.
