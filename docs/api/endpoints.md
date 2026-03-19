# API Endpoints — Grindfy Manager

Documentacao dos endpoints principais da API. Todos os endpoints estao em `server/routes.ts`.
Base URL: `http://localhost:3000/api` (dev) | `https://app.grindfy.com/api` (producao)

---

## Autenticacao

### POST /api/auth/register

**Descricao:** Registra novo usuario com email e senha
**Auth:** Nenhuma
**Rate Limit:** Sim (rateLimit em endpoints de auth)

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| name | string | body | Nao | Nome completo |
| email | string | body | Sim | Formato email validado |
| password | string | body | Sim | Min 8 caracteres |
| confirmPassword | string | body | Sim | Deve coincidir com password |

**Body exemplo:**
```json
{ "name": "Joao Silva", "email": "joao@test.com", "password": "senha12345", "confirmPassword": "senha12345" }
```

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 201 | Sucesso | `{ "message": "Conta criada com sucesso", "userId": "..." }` |
| 400 | Email duplicado | `{ "message": "Email ja cadastrado" }` |
| 400 | Validacao falha | `{ "message": "Senha deve ter pelo menos 8 caracteres" }` |

---

### POST /api/auth/login

**Descricao:** Login com email e senha, retorna JWT tokens
**Auth:** Nenhuma
**Rate Limit:** Sim

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| email | string | body | Sim | Email cadastrado |
| password | string | body | Sim | Senha do usuario |
| rememberMe | boolean | body | Nao | Sessao persistente |

**Body exemplo:**
```json
{ "email": "joao@test.com", "password": "senha12345" }
```

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 200 | Sucesso | `{ "accessToken": "jwt...", "refreshToken": "jwt...", "user": {...} }` |
| 400 | Email nao verificado | `{ "message": "Email nao verificado" }` |
| 401 | Credenciais invalidas | `{ "message": "Email ou senha incorretos" }` |
| 423 | Conta bloqueada | `{ "message": "Conta bloqueada", "remainingTime": 5 }` |

---

### POST /api/auth/refresh

**Descricao:** Renova access token usando refresh token
**Auth:** Nenhuma (usa refresh token no body)

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| refreshToken | string | body | Sim | Refresh token valido |

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 200 | Sucesso | `{ "accessToken": "jwt...", "refreshToken": "jwt..." }` |
| 401 | Token invalido | `{ "message": "Refresh token invalido" }` |

---

### POST /api/auth/verify-email

**Descricao:** Verifica email do usuario via token enviado por email
**Auth:** Nenhuma

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| token | string | body | Sim | Token de verificacao (hex) |

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 200 | Sucesso | `{ "message": "Email verificado com sucesso" }` |
| 400 | Token invalido/expirado | `{ "message": "Token invalido ou expirado" }` |

---

### GET /api/auth/user

**Descricao:** Retorna dados do usuario autenticado
**Auth:** JWT (Bearer token)

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 200 | Sucesso | `{ "id": "...", "email": "...", "username": "...", "permissions": [...] }` |
| 401 | Token invalido | `{ "message": "Token invalido ou expirado" }` |

---

## Upload de Torneios

### POST /api/upload-history

**Descricao:** Upload de arquivo CSV/XLSX com historico de torneios
**Auth:** JWT (Bearer token)

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| file | File | multipart/form-data | Sim | CSV ou XLSX |
| duplicateAction | string | body | Nao | import_new_only, import_all, skip_upload |

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 200 | Sucesso | `{ "imported": 45, "duplicates": 5, "total": 50, "uploadId": "..." }` |
| 400 | Arquivo invalido | `{ "message": "Arquivo invalido ou vazio" }` |

---

## Dashboard & Analytics

### GET /api/dashboard/stats

**Descricao:** Estatisticas gerais do dashboard
**Auth:** JWT (Bearer token)

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| period | string | query | Nao | 7d, 30d, 90d, all (default: 30d) |
| startDate | string | query | Nao | ISO date para range customizado |
| endDate | string | query | Nao | ISO date para range customizado |

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 200 | Sucesso | `{ "profit": 1500.50, "roi": 12.5, "volume": 200, "abi": 25.0, "itm": 18.5 }` |

---

### GET /api/analytics/by-site

**Descricao:** Analytics agrupados por rede de poker
**Auth:** JWT (Bearer token)

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| period | string | query | Nao | 7d, 30d, 90d, all |
| sites | string | query | Nao | Filtro de sites (comma-separated) |
| categories | string | query | Nao | Filtro de categorias |

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 200 | Sucesso | `[{ "site": "PokerStars", "profit": 800, "volume": 120, "roi": 15.2 }]` |

---

## Grind Sessions

### POST /api/grind-sessions

**Descricao:** Cria nova sessao de grind
**Auth:** JWT (Bearer token)

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| date | string | body | Sim | ISO date |
| dailyGoals | string | body | Nao | Objetivos do dia |
| screenCap | integer | body | Nao | Max telas simultaneas |
| plannedBuyins | decimal | body | Nao | Total planejado |

**Body exemplo:**
```json
{ "date": "2025-03-15T00:00:00Z", "dailyGoals": "Focar em ICM spots", "screenCap": 8 }
```

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 201 | Sucesso | `{ "id": "...", "status": "planned", "date": "..." }` |

---

### PUT /api/grind-sessions/:id

**Descricao:** Atualiza sessao (iniciar, encerrar, editar metricas)
**Auth:** JWT (Bearer token)

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| id | string | path | Sim | ID da sessao |
| status | string | body | Nao | planned, active, completed, cancelled |
| startTime | string | body | Nao | ISO timestamp |
| endTime | string | body | Nao | ISO timestamp |
| profitLoss | decimal | body | Nao | Profit/loss calculado |
| notes | string | body | Nao | Observacoes |

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 200 | Sucesso | `{ "id": "...", "status": "active", "startTime": "..." }` |
| 404 | Nao encontrada | `{ "message": "Sessao nao encontrada" }` |

---

## Planned Tournaments (Grade)

### POST /api/planned-tournaments

**Descricao:** Adiciona torneio a grade semanal
**Auth:** JWT (Bearer token)

**Request:**
| Param | Tipo | Onde | Obrigatorio | Notas |
|---|---|---|---|---|
| dayOfWeek | integer | body | Sim | 0=Dom, 6=Sab |
| profile | string | body | Sim | A, B ou C |
| site | string | body | Sim | Rede de poker |
| time | string | body | Sim | Horario (ex: "19:00") |
| name | string | body | Sim | Nome do torneio |
| buyIn | decimal | body | Sim | Buy-in |
| type | string | body | Sim | Vanilla, PKO, Mystery |
| speed | string | body | Sim | Normal, Turbo, Hyper |

**Body exemplo:**
```json
{ "dayOfWeek": 1, "profile": "A", "site": "PokerStars", "time": "19:00", "name": "Monday 6-Max", "buyIn": 22, "type": "Vanilla", "speed": "Normal" }
```

**Respostas:**
| Status | Quando | Body exemplo |
|---|---|---|
| 201 | Sucesso | `{ "id": "...", "dayOfWeek": 1, "profile": "A" }` |
| 400 | Validacao falha | `{ "message": "..." }` |

---

_Para a lista completa dos 173 endpoints, consulte `server/routes.ts`._
_Os endpoints acima cobrem os fluxos criticos documentados em `docs/architecture/flows/`._
