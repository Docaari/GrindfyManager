# Contexto para programar a API da Suprema Poker

Este documento contém toda a informação necessária para programar/ajustar a integração com a API da Suprema Poker no projeto Grindfy.

---

## 1. O que é o Grindfy

Plataforma SaaS de gestão de performance para jogadores profissionais de poker (MTT). Stack: React 18 + TypeScript + Vite (frontend), Express + Drizzle ORM + PostgreSQL (backend). Tudo roda na mesma porta (3000).

---

## 2. O que é a integração Suprema

A Suprema Poker é uma rede de poker popular no Brasil. Ela expõe uma API pública (via pokerbyte.com.br) com a lista de torneios MTT do dia. O Grindfy usa essa API como proxy server-side (CORS da Suprema bloqueia chamadas diretas do browser) para permitir que jogadores importem torneios para sua grade de planejamento.

---

## 3. API Externa (Pokerbyte)

### Endpoint
```
GET https://api.pokerbyte.com.br/mtt/list/106/all/{YYYY-MM-DD}/guaranteed/desc
```

- **Autenticação:** Nenhuma (API pública)
- **CORS:** Restrito a supremapoker.com.br (por isso proxy no backend)
- **Response:** Array de objetos ou `{ recordsTotal, recordsFiltered, data: [...] }`

### Interface da resposta
```typescript
interface PokerbyteTournament {
  id: number;              // ID único do torneio
  liga: number;            // ID da liga (106 = Suprema)
  ligaName: string;        // Nome da liga
  name: string;            // Nome do torneio (ex: "$5K GTD NLH Regular")
  date: string;            // "YYYY-MM-DD HH:mm:ss"
  guaranteed: number;      // Garantido em R$
  buyin: number;           // Buy-in em R$
  late: number;            // Late registration (minutos ou flag)
  status: string;          // Status do torneio
  tournament: number;      // ID do torneio (pode diferir de id)
  moneyPrefix: string;     // Prefixo monetário ("R$")
  stack: number;           // Stack inicial
  temponivelmMeta: number; // Tempo de nível em minutos
  type: string;            // "NLH" ou "PLO5"
  maxPl: number;           // Máximo de jogadores
  isKO: number;            // 0 = não é KO, 1 = é KO
}
```

---

## 4. Arquitetura atual no Grindfy (já implementado)

### 4.1 Arquivos do backend

#### `server/supremaService.ts` — Fetch da API externa
```typescript
const API_BASE = 'https://api.pokerbyte.com.br/mtt/list/106/all';
const TIMEOUT_MS = 10000;

export async function fetchSupremaTournaments(date: string): Promise<any[]> {
  const url = `${API_BASE}/${date}/guaranteed/desc`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Nao foi possivel conectar a API da Suprema Poker: timeout');
    }
    throw new Error(`Nao foi possivel conectar a API da Suprema Poker: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Nao foi possivel conectar a API da Suprema Poker (status ${response.status})`);
  }

  const json = await response.json();
  const tournaments = Array.isArray(json) ? json : json.data;
  if (!Array.isArray(tournaments)) return [];

  return tournaments.filter((item: any) => item.name && item.buyin != null && item.date);
}
```

#### `server/supremaMapper.ts` — Mapeamento de campos
```typescript
interface MappedSupremaTournament {
  externalId: string;   // "suprema-{id}"
  name: string;
  site: string;         // Fixo: "Suprema"
  time: string;         // "HH:mm"
  buyIn: string;        // Decimal como string
  guaranteed: string;   // Decimal como string
  type: string;         // "Vanilla" ou "PKO"
  speed: string;        // "Normal", "Turbo" ou "Hyper"
  dayOfWeek: number;    // 0=domingo, 6=sábado
  status: string;       // Fixo: "upcoming"
  prioridade: number;   // Fixo: 2
  startTime: Date;
}

// Regras de mapeamento:
// isKO: 0 → "Vanilla", 1 → "PKO"
// temponivelmMeta: null/0 → "Normal", ≤6 → "Hyper", ≤10 → "Turbo", >10 → "Normal"
// date: "YYYY-MM-DD HH:mm:ss" → time="HH:mm", startTime=Date, dayOfWeek=Date.getDay()
// id: prefixado com "suprema-" para namespace
```

#### `server/supremaCache.ts` — Cache em memória
```typescript
// Map<string, { data, timestamp }> com TTL de 1 hora (3600000ms)
// Chave = data "YYYY-MM-DD"
// get(key): retorna data ou undefined se expirado
// set(key, data): armazena com timestamp atual
// clear(): limpa tudo
```

#### `server/supremaDedup.ts` — Deduplicação
```typescript
// Compara externalId dos torneios incoming vs existing
// Retorna apenas os que NÃO existem no existing
// Usado para filtrar torneios já importados pelo usuário
```

#### `server/routes/suprema.ts` — Endpoint Express
```typescript
// GET /api/suprema/tournaments?date=YYYY-MM-DD
// Auth: requireAuth (JWT)
// Rate limit: 10 req/min por usuário
// Fluxo: valida date → checa cache → fetch API → salva cache → retorna
// Erros: 400 (date inválido), 401 (sem JWT), 429 (rate limit), 502 (API falhou)
```

### 4.2 Frontend

#### `client/src/components/SupremaImportModal.tsx` (432 linhas)
Modal com:
- Fetch de torneios via `GET /api/suprema/tournaments?date=YYYY-MM-DD`
- Filtros de buy-in: Low (<$20), Mid ($20-$100), High (>$100)
- Filtros de tipo: NLH, PLO
- Checkbox por torneio + "Selecionar Todos"
- Badge "Já importado" para torneios com externalId existente
- Loading skeleton + erro com retry
- Badges de speed (Normal/Turbo/Hyper) e tipo (Vanilla/PKO)

#### Páginas que usam o modal:
- `client/src/pages/GradePlanner.tsx` — Botão "Importar Grade Suprema"
- `client/src/pages/GrindSessionLive.tsx` — Importação para sessão ao vivo

### 4.3 Testes (45+ testes)

Diretório: `tests/unit/suprema/`
- `suprema-mapper.test.ts` — Speed, type, date, null handling, externalId
- `suprema-cache.test.ts` — Hit/miss, TTL, clear, chaves separadas
- `suprema-dedup.test.ts` — Filtragem, mixed lists, edge cases
- `suprema-error.test.ts` — Timeouts, HTTP errors, JSON parsing, network failures

---

## 5. Schema do banco (Drizzle ORM)

### Tabela `planned_tournaments` (campos relevantes)
```typescript
// Em shared/schema.ts
plannedTournaments = pgTable("planned_tournaments", {
  id: varchar("id").primaryKey(),              // nanoid()
  userId: varchar("user_id").notNull(),        // USER-XXXX
  dayOfWeek: integer("day_of_week"),           // 0-6
  profile: varchar("profile"),                 // "A", "B", "C"
  site: varchar("site"),                       // "Suprema", "PokerStars", etc.
  time: varchar("time"),                       // "HH:mm"
  buyIn: varchar("buy_in"),                    // Decimal como string
  type: varchar("type"),                       // "Vanilla", "PKO"
  speed: varchar("speed"),                     // "Normal", "Turbo", "Hyper"
  name: varchar("name"),
  guaranteed: varchar("guaranteed"),
  status: varchar("status"),                   // "upcoming", "registered", etc.
  prioridade: integer("prioridade"),           // 1-3
  startTime: timestamp("start_time"),
  // ⚠️ CAMPO PENDENTE - NÃO ADICIONADO AO SCHEMA AINDA:
  // externalId: varchar("external_id"),       // "suprema-{id}" — nullable
});
```

**IMPORTANTE:** O campo `externalId` está nos arquivos de serviço e no frontend mas **NÃO foi adicionado ao schema Drizzle** (`shared/schema.ts`) nem ao banco. Isso é um gap conhecido.

---

## 6. Endpoints existentes relevantes

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/suprema/tournaments?date=YYYY-MM-DD` | Proxy para API Pokerbyte |
| GET | `/api/planned-tournaments` | Lista torneios planejados do usuário |
| POST | `/api/planned-tournaments` | Cria torneio planejado |
| PUT | `/api/planned-tournaments/:id` | Atualiza torneio planejado |
| DELETE | `/api/planned-tournaments/:id` | Remove torneio planejado |

---

## 7. Convenções do projeto

- **IDs:** `nanoid()`, nunca auto-increment
- **User IDs:** Formato `USER-XXXX` (campo `userPlatformId`)
- **Auth:** JWT via middleware `requireAuth`
- **Validação:** Zod schemas (ex: `insertPlannedTournamentSchema`)
- **API responses:** JSON direto (`res.json(data)`)
- **Erros:** `res.status(4xx/5xx).json({ message: "..." })`
- **Frontend state:** TanStack React Query (`useQuery`/`useMutation`)
- **UI:** Tailwind CSS + shadcn/ui (Radix primitives)
- **Idioma UI:** Português (Brasil)
- **Idioma código:** Inglês

---

## 8. O que falta / Gaps conhecidos

1. **Campo `externalId` no schema** — Precisa ser adicionado à tabela `planned_tournaments` em `shared/schema.ts` e feito `db:push` para sincronizar com o banco
2. **Validação de data** — O endpoint aceita qualquer string no formato YYYY-MM-DD sem validar se é uma data real (ex: 2026-13-45 passa na regex)
3. **Mapeamento duplicado** — O `mapRawTournament` no frontend (SupremaImportModal.tsx) duplica a lógica do `mapSupremaTournament` no backend (supremaMapper.ts). O endpoint retorna dados raw da API e o frontend faz o mapeamento. Idealmente o backend deveria mapear antes de retornar.
