# Fluxo: Registro de Usuario com Verificacao de Email

## Trigger
Usuario clica em "Criar conta" na pagina de registro (`/register`).

## Atores
- Usuario nao autenticado
- Express API (auth endpoints)
- Email Service (Nodemailer + Gmail SMTP)
- PostgreSQL (Neon)

## Pre-condicoes
- Nenhuma conta com o mesmo email existe no sistema
- Servidor SMTP Gmail configurado e acessivel
- Variaveis `GMAIL_USER` e `GMAIL_APP_PASSWORD` definidas

## Caminho Principal (Happy Path)
1. Usuario preenche formulario: nome, email, senha (min 8 chars), confirmacao de senha
2. Frontend valida com Zod (`registerSchema`): email valido, senha >= 8 chars, senhas coincidem
3. Frontend envia POST `/api/auth/register` com dados
4. Backend valida novamente com `registerSchema.parse(req.body)`
5. Backend verifica se email ja existe no banco (`users` table)
6. Backend gera `userPlatformId` sequencial (USER-XXXX) via `AuthService.generateNextUserPlatformId()`
7. Backend faz hash da senha com bcryptjs (salt rounds: 12)
8. Backend insere usuario com status `pending_verification` e `emailVerified: false`
9. Backend gera token de verificacao via `EmailService.generateEmailVerificationToken()` (crypto.randomBytes, 32 bytes hex)
10. Backend envia email de verificacao com link contendo o token (expira em 24h)
11. Backend retorna 201 com mensagem de sucesso
12. Frontend redireciona para `/registration-confirmation`
13. Usuario clica no link do email
14. Frontend abre `/verify-email?token=XXX`
15. Frontend envia POST `/api/auth/verify-email` com o token
16. Backend valida token (existe e nao expirou)
17. Backend atualiza usuario: `emailVerified: true`, `status: active`
18. Backend retorna sucesso
19. Frontend redireciona para `/login`

## Caminhos de Erro
- Email ja cadastrado -> 400 "Email ja cadastrado" (ou "Ja existe conta com este email")
- Senhas nao coincidem -> Validacao Zod no frontend impede envio
- Senha menor que 8 caracteres -> Validacao Zod no frontend e backend
- Falha ao enviar email -> 500 "Erro ao enviar email de verificacao" (usuario criado mas sem verificacao)
- Token de verificacao expirado (>24h) -> 400 "Token expirado" (usuario precisa solicitar reenvio)
- Token de verificacao invalido -> 400 "Token invalido"
- Falha de conexao com banco -> 500 "Erro interno do servidor"

## Regras de Negocio
- Senha minima de 8 caracteres (definido em `registerSchema`)
- Email deve ser unico no sistema
- `userPlatformId` e sequencial (USER-0001, USER-0002...) e unico
- Usuario criado com role `user`, status `pending_verification`, plano `basico`
- Token de verificacao armazenado em memoria (`Map`) — nao persiste entre restarts do servidor
- Token de verificacao expira em 24 horas
- Timezone padrao: America/Sao_Paulo, moeda padrao: BRL
- Rate limiting aplicado em endpoints de auth

## Endpoints Envolvidos
- POST `/api/auth/register` — Cria usuario e envia email de verificacao
- POST `/api/auth/verify-email` — Verifica token e ativa conta
- POST `/api/auth/resend-verification` — Reenvia email de verificacao

## Cenarios de Teste Derivados
- [ ] Happy path: Registro com dados validos -> usuario criado com status pending_verification, email enviado
- [ ] Happy path: Verificacao de email com token valido -> status muda para active, emailVerified = true
- [ ] Erro: Email duplicado -> retorna 400 com mensagem adequada
- [ ] Erro: Senha < 8 caracteres -> validacao Zod rejeita no backend
- [ ] Erro: Senhas nao coincidem -> validacao Zod rejeita
- [ ] Erro: Token de verificacao expirado -> retorna 400
- [ ] Erro: Token de verificacao inexistente -> retorna 400
- [ ] Edge case: Reenvio de verificacao para email nao cadastrado -> comportamento seguro (sem info leak)
- [ ] Edge case: Registro com email em maiusculas vs minusculas -> tratamento de case sensitivity
- [ ] Edge case: UserPlatformId gerado corretamente quando ja existem usuarios
- [ ] Seguranca: Rate limiting no endpoint de registro
- [ ] Inconsistencia conhecida: Tokens armazenados em memoria — perdem-se ao reiniciar servidor
