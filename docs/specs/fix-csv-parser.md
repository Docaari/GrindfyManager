# Fix: Inconsistencias no parser CSV/XLSX multi-rede (csvParser.ts)

## Status
Proposta

## Comportamento Atual (bugado)

O parser CSV (`server/csvParser.ts`, 1737 linhas) possui 8 problemas que causam dados incorretos no banco e calculos errados no Dashboard. Os problemas afetam o campo `prize`, deteccao de rede, datas, deteccao de final table, classificacao de categoria e validacao de position.

### Problema 1 (HIGH): Campo `prize` armazena valores inconsistentes entre redes

O campo `prize` na interface `ParsedTournament` esta documentado como "net profit" (linha 10), mas o calculo varia por rede:

| Rede | Calculo atual de `prize` | O que `Result` significa no CSV |
|------|--------------------------|--------------------------------|
| PokerStars | `prize = Result` (linha 784) | Result JA E net profit (inclui deducao de stake+rake) |
| PokerStars(FR-ES-PT) | `prize = Result` (linha 1245) | Idem PokerStars |
| 888poker | `prize = Result` (linha 1016) | Result JA E net profit |
| GGPoker | `prize = Result - Rake` (linha 872) | Result NAO e net; precisa subtrair rake |
| WPN | `prize = Result - Rake` (linha 1519) | Result NAO e net; precisa subtrair rake |
| PartyPoker | `prize = Result - Rake` (linha 1577) | Result NAO e net; precisa subtrair rake |
| Chico | `prize = Result - Rake` (linha 1165) | Result NAO e net; precisa subtrair rake |
| iPoker (normal) | `prize = Result` (linha 1359) | Result e net para torneios normais |
| iPoker (Fury/Rebuy) | `prize = Result - Stake` (linha 1357) | Subtrai 1 stake extra |
| Brazilian format | `prize = Resultado - Rake` (linha 914) | Resultado NAO e net |
| Generic | `prize = Result - Rake` (linha 1461) | Result NAO e net |
| Bodog | `prize = Payout - BuyIn` (linha 302) | Payout e gross, subtrai buyIn |
| CoinPoker (TXT) | `prize = Deposit - Withdrawal` (linha 127) | Deposit e gross, subtrai withdrawal |
| CoinPoker (CSV) | `prize = PrizeAmount - BuyIn` (linha 483) | PrizeAmount e gross, subtrai buyIn |

**Impacto:** No Dashboard, o calculo de profit e `prize - buyIn`. Se `prize` ja e net profit (como em PokerStars), entao `profit = netProfit - buyIn`, o que resulta em profit DUPLAMENTE negativo. Se o jogador pagou $55 de buyIn e perdeu, PokerStars reporta Result = -55 (ja descontou buyIn). O Dashboard calcula profit = -55 - 55 = -110. O profit real e -55.

### Problema 2 (HIGH): Data invalida vira data atual silenciosamente

A funcao `parseDate()` (linha 1607-1611):
```typescript
private static parseDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? new Date() : date;
}
```
Quando a data nao pode ser parseada, retorna `new Date()` (data/hora atual). Isso insere torneios com data errada sem nenhum aviso. O mesmo problema ocorre em `parse888PokerFormat` (linhas 1029-1034).

### Problema 3 (HIGH): Deteccao de network e case-sensitive

Na funcao `parsePokerSiteData` (linhas 673-697), todas as comparacoes de network usam `===` com valores exatos:
```typescript
if (networkValue === 'PokerStars' || networkValue === 'PS') { ... }
if (networkValue === '888poker' || networkValue === '888' || networkValue === 'Eight88') { ... }
```
Se o CSV exportado tiver `Network = "pokerstars"` ou `Network = "POKERSTARS"`, o parser nao reconhece e cai no fallback generico, que pode calcular profit de forma diferente.

### Problema 4 (HIGH): Final table nunca detectada quando fieldSize=0

O calculo de final table (presente em todas as redes) e:
```typescript
finalTable: (position > 0 && (position <= 9 || position <= Math.ceil(fieldSize * 0.1)))
```
Quando `fieldSize = 0` (Bodog, CoinPoker, e qualquer torneio sem essa info), `Math.ceil(0 * 0.1) = 0`, entao `position <= 0` e sempre false. O critario `position <= 9` funcionaria, MAS a condicao usa `||`, entao deveria funcionar... **Porem**, na GGPoker (linha 890) o calculo e DIFERENTE:
```typescript
finalTable: (position > 0 && position <= (this.parseIntSafe(row['Players per table'], 9) || 9))
```
Isso usa "players per table" ao inves de fieldSize. Para as demais redes, quando fieldSize=0, o criterio `position <= 9` funciona corretamente pelo `||`. **O problema real e quando fieldSize > 0 mas e muito pequeno** (ex: fieldSize=5 de um SNG), onde `ceil(5*0.1) = 1` e so position=1 seria final table. Mas para fieldSize=0, a logica `||` resolve. Correcao focada: garantir consistencia entre todas as redes.

### Problema 5 (MEDIUM): "KO" na deteccao de PKO e muito generico

Na funcao `detectCategory` (linhas 1617-1638):
```typescript
nameUpper.includes('KO')
```
Qualquer nome contendo "KO" como substring e classificado como PKO. Exemplos de falsos positivos: "KNOCKOUT CITY" (se existisse), ou mais realisticamente, nomes que contenham "KO" como parte de outra palavra.

### Problema 6 (MEDIUM): iPoker regra Fury/Rebuy e muito abrangente

Na funcao `parseIPokerFormat` (linhas 1342-1343):
```typescript
const isFuryOrRebuy = nameLower.includes('fury') || nameLower.includes('rebuy');
```
Qualquer torneio com "Rebuy" no nome dobra o stake. Mas "Rebuy" pode aparecer nas flags (`Flags: "Rebuy Multi-Entry"`) sem que o torneio seja um rebuy especifico da iPoker. O nome "Fists of Fury" ativa a regra, mas um torneio chamado "Rebuy Special" que NAO e o formato especial da iPoker tambem ativaria.

### Problema 7 (MEDIUM): Moeda default inconsistente entre schema e parser

- Schema `tournaments.currency` (shared/schema.ts, linha 203): default `"BRL"`
- Schema `users.currency` (shared/schema.ts, linha 43): default `"BRL"`
- Parser: todos os metodos usam default `"USD"` quando currency nao e detectada
- Endpoint upload (routes/upload.ts, linha 249): `tournament.currency || "USD"`

O default no schema e "BRL" mas os dados reais do parser sempre chegam como "USD". A discrepancia nao causa bug hoje porque o parser SEMPRE define currency, mas cria confusao e pode causar problemas se um torneio for inserido sem passar pelo parser.

### Problema 8 (LOW): Position negativa aceita sem validacao

`parseIntSafe` pode retornar valores negativos (linha 737 remove tudo exceto `[0-9-]`). Uma position negativa no CSV seria aceita sem nenhuma validacao.

## Comportamento Esperado (correto)

### Correcao 1: Padronizar campo `prize` como NET PROFIT

**Decisao:** O campo `prize` armazenara o **net profit** (lucro liquido) do torneio, calculado de forma CONSISTENTE em todas as redes.

**Formula universal:**
```
prize = (valor total recebido pelo jogador) - (custo total do torneio incluindo rake)
```

Ou seja, se o jogador:
- Pagou $50 de stake + $5 de rake = $55 de buyIn total
- Recebeu $200 de premio

Entao:
- `buyIn` = 55 (stake + rake, como ja esta)
- `prize` = 200 - 55 = 145 (net profit)
- No Dashboard: `profit = prize` (prize JA E o net profit, nao precisa subtrair buyIn novamente)

**Correcao por rede:**

| Rede | Calculo atual | Calculo correto | Mudanca necessaria |
|------|--------------|----------------|-------------------|
| PokerStars | `prize = Result` | `prize = Result` | **Nenhuma** — Result ja e net profit |
| PokerStars(FR-ES-PT) | `prize = Result` | `prize = Result` | **Nenhuma** |
| 888poker | `prize = Result` | `prize = Result` | **Nenhuma** — Result ja e net profit |
| GGPoker | `prize = Result - Rake` | `prize = Result - Stake` | **MUDAR**: subtrair Stake ao inves de Rake, porque Result no GGPoker e gross winnings (inclui stake de volta se ganhou). Validar com CSV real. |
| WPN | `prize = Result - Rake` | `prize = Result - Stake` | **MUDAR**: idem GGPoker |
| PartyPoker | `prize = Result - Rake` | `prize = Result - Stake` | **MUDAR**: idem GGPoker |
| Chico | `prize = Result - Rake` | `prize = Result - Stake` | **MUDAR**: idem GGPoker |
| iPoker (normal) | `prize = Result` | `prize = Result` | **Nenhuma** |
| iPoker (Fury) | `prize = Result - Stake` | `prize = Result - Stake` | **Nenhuma** |
| Brazilian format | `prize = Resultado - Rake` | `prize = Resultado - Stake` | **MUDAR**: idem |
| Generic | `prize = Result - Rake` | `prize = Result - Stake` | **MUDAR**: idem |
| Bodog | `prize = Payout - BuyIn` | `prize = Payout - BuyIn` | **Nenhuma** — ja e net |
| CoinPoker (TXT) | `prize = Deposit - Withdrawal` | `prize = Deposit - Withdrawal` | **Nenhuma** — ja e net |
| CoinPoker (CSV) | `prize = PrizeAmount - BuyIn` | `prize = PrizeAmount - BuyIn` | **Nenhuma** — ja e net |

**IMPORTANTE - Nota para o implementer:** A tabela acima e uma hipotese baseada no codigo. O implementer DEVE validar com arquivos CSV reais de cada rede (disponiveis em `tests/fixtures/`) qual e o significado exato do campo `Result` antes de aplicar a correcao. Se `Result` no GGPoker/WPN/Party/Chico ja e net profit (como no PokerStars), entao `prize = Result` sem subtrair nada. Se `Result` e gross winnings, entao `prize = Result - buyIn`. A formula correta depende do formato de exportacao de cada rede.

**IMPORTANTE - Impacto no Dashboard:** Apos padronizar `prize` como net profit, o Dashboard precisa ser ajustado. Atualmente calcula `profit = prize - buyIn`. Com a correcao, deve calcular `profit = prize` diretamente (prize ja e net). Documentar os modulos do Dashboard afetados para o implementer ajustar.

### Correcao 2: Data invalida retorna null, torneio rejeitado

```typescript
private static parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}
```

Todos os call sites que usam `parseDate` ja verificam `datePlayed instanceof Date && !isNaN(datePlayed.getTime())` no metodo `parseCSV` (linha 610-611). Torneios com `datePlayed = null` serao filtrados automaticamente.

Para `parse888PokerFormat` (linhas 1029-1034), substituir o fallback `new Date()` por `return null` quando a data e invalida.

### Correcao 3: Normalizar network para lowercase antes de comparar

Na funcao `parsePokerSiteData`, antes das comparacoes:
```typescript
const networkNormalized = networkValue.toString().trim().toLowerCase();

if (networkNormalized === 'pokerstars' || networkNormalized === 'ps') { ... }
if (networkNormalized === '888poker' || networkNormalized === '888' || networkNormalized === 'eight88') { ... }
// ... etc para todas as redes
```

### Correcao 4: Final table consistente entre todas as redes

Unificar a logica de final table para todas as redes (inclusive GGPoker que usa logica diferente):
```typescript
// Logica unificada:
finalTable: position > 0 && (
    fieldSize > 0
        ? (position <= 9 || position <= Math.ceil(fieldSize * 0.1))
        : position <= 9
)
```

Isso garante:
- Se fieldSize > 0: usa o criterio proporcional (top 10%) OU top 9
- Se fieldSize = 0: usa apenas top 9

Remover a logica especial da GGPoker baseada em "Players per table" e usar a mesma logica para todas as redes.

### Correcao 5: Word boundary na deteccao de "KO"

Na funcao `detectCategory`, substituir:
```typescript
nameUpper.includes('KO')
```
Por:
```typescript
/\bKO\b/.test(nameUpper)
```

Isso garante que "KO" so faz match como palavra separada (delimitada por espacos, hifens, inicio/fim de string), nao como substring.

### Correcao 6: iPoker regra Fury mais especifica

Tornar a deteccao de Fury/Rebuy mais restrita verificando o contexto do nome:
```typescript
// Verificar padroes especificos da iPoker:
// - "Fists of Fury" ou "Fury" como formato de torneio (nao substring generica)
// - "Rebuy" somente quando aparece nos Flags E no nome simultaneamente
const isFury = /\bFury\b/i.test(name);
const isRebuyFormat = /\bRebuy\b/i.test(flags || '') && /\bRebuy\b/i.test(name);
const isFuryOrRebuy = isFury || isRebuyFormat;
```

**Nota:** Esta correcao precisa de validacao com dados reais de iPoker para garantir que os padroes estao corretos. Se nao houver CSVs de teste suficientes, manter a regra atual e adicionar um TODO.

### Correcao 7: Alinhar default de currency para 'USD'

No schema (`shared/schema.ts`):
- Linha 43 (`users.currency`): mudar default de `"BRL"` para `"USD"`
- Linha 203 (`tournaments.currency`): mudar default de `"BRL"` para `"USD"`

No parser, manter `"USD"` como default (ja esta correto).

**Justificativa:** USD e o padrao de facto no poker online. A maioria das redes exporta em USD. O schema deve refletir isso. Usuarios brasileiros que jogam em BRL podem configurar sua moeda preferida nas settings.

### Correcao 8: Position minima zero

Apos parsear position, garantir que seja >= 0:
```typescript
const position = Math.max(0, this.parseIntSafe(row['Position']));
```

Aplicar em todos os metodos de parse de cada rede.

## Modulos Afetados

- `server/csvParser.ts` — Todas as correcoes de parsing (correcoes 1-6, 8)
- `shared/schema.ts` — Default de currency (correcao 7)
- `client/src/pages/Dashboard.tsx` — Ajustar calculo de profit se necessario (impacto da correcao 1)
- `client/src/components/DashboardFilters.tsx` — Verificar calculos de metricas
- `client/src/components/DynamicCharts.tsx` — Verificar calculos de graficos
- `server/routes/upload.ts` — Nenhuma mudanca necessaria (ja usa `tournament.currency || "USD"`)
- `server/storage.ts` — Nenhuma mudanca necessaria

## Cenarios de Teste

### Correcao 1: Profit consistente

- [ ] PokerStars: jogador paga buyIn $55 (stake $50 + rake $5), perde tudo. Result = -55. prize deve ser -55. profit no Dashboard = -55 (nao -110).
- [ ] PokerStars: jogador paga buyIn $55, ganha $200. Result = 145. prize deve ser 145.
- [ ] GGPoker: jogador paga buyIn $55 (stake $50 + rake $5), ganha $200. Result = ???. prize deve ser net profit. VALIDAR com CSV real.
- [ ] WPN: mesmo cenario que GGPoker. VALIDAR com CSV real.
- [ ] PartyPoker: mesmo cenario. VALIDAR com CSV real.
- [ ] Chico: mesmo cenario. VALIDAR com CSV real.
- [ ] Bodog: buyIn = $10 (cashAmount negativo), payout = $50 (cashAmount positivo). prize = 40.
- [ ] CoinPoker: withdrawal = 25 USDT, deposit = 131.25 USDT. prize = 106.25.
- [ ] iPoker normal: Result = -32, stake = 26.62, rake = 5.38, buyIn = 32. prize = -32.
- [ ] iPoker Fury: Result = 100, stake = 26.62, rake = 5.38, buyIn = 58.62 (2*stake + rake). prize = 100 - 26.62 = 73.38.
- [ ] Upload CSV misto com PokerStars + GGPoker: profits devem ser consistentes.

### Correcao 2: Data invalida

- [ ] CSV com data "" (vazia): torneio deve ser rejeitado (nao inserido)
- [ ] CSV com data "invalid-date": torneio deve ser rejeitado
- [ ] CSV com data "2025-13-45" (data impossivel): torneio deve ser rejeitado
- [ ] CSV com data valida "2025-01-15 18:00": torneio deve ser aceito com data correta
- [ ] 888poker com data invalida: torneio deve ser rejeitado (nao usar `new Date()` como fallback)
- [ ] Upload com 10 torneios, 2 com data invalida: resposta deve indicar 8 importados, 2 rejeitados

### Correcao 3: Network case-insensitive

- [ ] Network = "PokerStars": deve parsear como PokerStars
- [ ] Network = "pokerstars": deve parsear como PokerStars
- [ ] Network = "POKERSTARS": deve parsear como PokerStars
- [ ] Network = "ggpoker": deve parsear como GGPoker
- [ ] Network = "GGNetwork": deve parsear como GGPoker
- [ ] Network = "wpn": deve parsear como WPN
- [ ] Network = "888POKER": deve parsear como 888poker
- [ ] Network = "partypoker": deve parsear como PartyPoker
- [ ] Network desconhecida "SuperPoker": deve cair no generic handler (case-insensitive)

### Correcao 4: Final table com fieldSize=0

- [ ] position=5, fieldSize=0: finalTable = true (5 <= 9)
- [ ] position=10, fieldSize=0: finalTable = false (10 > 9)
- [ ] position=9, fieldSize=0: finalTable = true
- [ ] position=1, fieldSize=100: finalTable = true (1 <= ceil(10) = 10)
- [ ] position=10, fieldSize=100: finalTable = true (10 <= 10)
- [ ] position=11, fieldSize=100: finalTable = false (11 > 10 e 11 > 9)
- [ ] position=0: finalTable = false (position > 0 falha)
- [ ] GGPoker com fieldSize=0: deve usar mesma logica (nao "Players per table")

### Correcao 5: Deteccao PKO com word boundary

- [ ] Nome "KO Series $22": categoria = PKO (KO no inicio, seguido de espaco)
- [ ] Nome "$22 NL PKO": categoria = PKO
- [ ] Nome "KNOCKOUT $55": categoria = PKO (matched por KNOCKOUT, nao KO substring)
- [ ] Nome "Turbo KO $11": categoria = PKO (KO separado por espacos)
- [ ] Nome "TOKYO $11": categoria = Vanilla (KO e substring de TOKYO, nao word boundary)
- [ ] Nome "KOS Special": categoria = Vanilla (KOS nao e KO)
- [ ] Nome "Super-KO $22": categoria = PKO (KO separado por hifen)

### Correcao 6: iPoker Fury/Rebuy

- [ ] Nome "Fists of Fury", Flags "Multi-Entry": isFuryOrRebuy = true
- [ ] Nome "$8,500 GTD | Fury", Flags "Rebuy Multi-Entry": isFuryOrRebuy = true
- [ ] Nome "$5,000 GTD Regular", Flags "Rebuy Multi-Entry": isFuryOrRebuy = false (Rebuy so nos flags, nao no nome com o padrao especifico)
- [ ] Nome "Rebuy Special $11", Flags "Rebuy Multi-Entry": isFuryOrRebuy = true (Rebuy em ambos)

### Correcao 7: Currency default

- [ ] Torneio inserido sem currency definida: banco deve ter default "USD"
- [ ] Schema `tournaments.currency` default deve ser "USD"
- [ ] Schema `users.currency` default deve ser "USD"

### Correcao 8: Position negativa

- [ ] Position = -1 no CSV: deve ser armazenado como 0
- [ ] Position = 0 no CSV: deve ser armazenado como 0
- [ ] Position = 150 no CSV: deve ser armazenado como 150

### Regressao

- [ ] Upload de CSV PokerStars existente (tests/fixtures/test_simple.csv): mesmos resultados
- [ ] Upload de CSV GGPoker existente (tests/fixtures/test_gg_simple.csv): profit corrigido
- [ ] Upload de CSV 888 existente (tests/fixtures/test_888_format.csv): mesmos resultados
- [ ] Upload de CSV iPoker existente (tests/fixtures/test_ipoker.csv): mesmos resultados
- [ ] Upload de CSV CoinPoker: mesmos resultados
- [ ] Todos os 78 testes existentes em tests/unit/upload/ devem continuar passando (ou ser atualizados para refletir comportamento corrigido)

## Fora de Escopo

- Bodog sem informacoes de position/fieldSize: limitacao do formato XLSX, nao corrigivel
- CoinPoker pareamento ambiguo de withdrawal/deposit: requer redesign mais complexo do parser
- Refatorar o parser inteiro (1737 linhas em uma unica classe): sera uma spec separada de refatoracao
- Adicionar suporte a novas redes de poker
- Migrar dados existentes no banco (torneios ja importados com prize incorreto): sera uma spec separada de migracao de dados
- Alterar a interface `ParsedTournament` (adicionar campo `grossWinnings` separado)

## Dependencias

- Nenhuma feature precisa existir antes desta correcao
- **Pos-correcao:** Sera necessaria uma spec separada para migrar dados existentes no banco que foram importados com o calculo antigo de prize

## Notas de Implementacao

1. **Ordem de implementacao sugerida:** Correcoes 2, 3, 8, 5, 4, 7 (independentes entre si), depois correcao 6, e por ultimo correcao 1 (mais complexa e com maior impacto).

2. **Correcao 1 requer validacao com CSVs reais:** Antes de mudar a formula de prize para qualquer rede, o implementer DEVE parsear um CSV real dessa rede e verificar manualmente o que o campo `Result` significa. Os CSVs em `tests/fixtures/` podem ajudar, mas idealmente o dev deve fornecer CSVs reais de GGPoker, WPN, PartyPoker e Chico.

3. **Correcao 1 tem impacto cascata:** Mudar o significado de `prize` afeta Dashboard, graficos, calculos de ROI, e qualquer lugar que faz `prize - buyIn`. O implementer deve buscar TODOS os locais que usam `prize` no frontend antes de aplicar.

4. **Testes existentes:** Ha 78 testes em `tests/unit/upload/` (csv-parser.test.ts e upload-schemas.test.ts). Varios desses testes verificam valores de `prize` e precisarao ser atualizados apos a correcao 1.

5. **Tipo de retorno de parseDate:** Mudar de `Date` para `Date | null` vai exigir atualizacao do tipo em `ParsedTournament` (`datePlayed: Date | null`) e em todos os call sites. Considerar criar uma funcao wrapper `parseDateOrReject` que retorna null e deixar `parseDate` como esta para compatibilidade.

6. **Interface ParsedTournament:** Atualizar o comentario da linha 10 de `// (net profit)` para refletir a semantica final escolhida.
