# Fluxo: Upload e Parsing de CSV/XLSX de Torneios

## Trigger
Usuario clica em "Upload" na pagina de Upload History (`/upload`) e seleciona um arquivo CSV ou XLSX exportado de uma rede de poker.

## Atores
- Usuario autenticado (jogador)
- Express API (upload endpoint)
- PokerCSVParser (parser multi-formato)
- PostgreSQL (Neon)

## Pre-condicoes
- Usuario autenticado com JWT valido
- Arquivo no formato CSV ou XLSX exportado de uma das redes suportadas
- Redes suportadas: WPN, GGPoker, PokerStars, PartyPoker, 888poker, Bodog/Bovada, CoinPoker, Chico Network, Revolution Network, iPoker Network

## Caminho Principal (Happy Path)
1. Usuario seleciona arquivo CSV/XLSX via componente FileUpload
2. Frontend envia POST `/api/upload-history` com arquivo via multipart/form-data (Multer memory storage)
3. Backend extrai userId do token JWT (`req.user.userPlatformId`)
4. Backend detecta formato do arquivo (CSV vs XLSX via extensao)
5. Para XLSX: converte para CSV string usando `xlsx` lib
6. Para CSV: le buffer diretamente
7. PokerCSVParser detecta automaticamente a rede de poker pelo formato dos dados (headers, padroes de valores)
8. Parser extrai torneios: nome, buyIn, prize, position, datePlayed, site, format, category, speed, fieldSize, currency, rake
9. Parser aplica conversao de moeda se necessario (usando exchangeRates do userSettings)
10. Backend verifica duplicatas comparando tournamentId + datePlayed + buyIn
11. Backend insere torneios nao-duplicados no banco em batch
12. Backend atualiza/cria tournament_templates agrupando por nome+site+format
13. Backend registra no upload_history: filename, status, tournaments_count, duplicates_found
14. Backend retorna resumo: total importado, duplicatas encontradas, erros

## Caminhos de Erro
- Arquivo vazio ou corrompido -> 400 "Arquivo invalido"
- Formato nao reconhecido (rede desconhecida) -> parser tenta formato generico, pode retornar 0 torneios
- Arquivo muito grande -> Multer rejeita (limite de memory storage)
- Nenhum torneio encontrado no arquivo -> 200 com tournaments_count: 0
- Erro de parsing em linhas individuais -> linhas ignoradas, resto importado
- Falha na conexao com banco -> 500 "Erro interno"
- Token JWT expirado -> 401 (middleware requireAuth)

## Regras de Negocio
- Upload usa Multer com memory storage (arquivo fica em buffer, nao em disco)
- Deteccao automatica da rede de poker pelo conteudo do CSV, nao pelo nome do arquivo
- Duplicatas detectadas por combinacao de tournamentId + datePlayed + buyIn para o mesmo usuario
- Acao de duplicatas configuravel pelo usuario: import_new_only, import_all, skip_upload
- Moedas suportadas: BRL, USD, EUR, CNY, USDT e outras (conversao via exchangeRates do userSettings)
- Tournament templates sao recalculados automaticamente apos importacao
- Campos calculados: finalTable (se position <= 9 em field >= 100), bigHit (se prize/buyIn >= bigHitMultiplier)

## Endpoints Envolvidos
- POST `/api/upload-history` — Upload principal com parsing e importacao
- POST `/api/check-duplicates` — Preview de duplicatas antes de importar
- POST `/api/upload-with-duplicates` — Upload com estrategia de duplicatas definida
- DELETE `/api/upload-history/:id` — Remove registro de upload
- GET `/api/tournaments` — Lista torneios importados (para verificacao)

## Cenarios de Teste Derivados
- [ ] Happy path: Upload CSV PokerStars com 50 torneios -> 50 torneios importados, upload_history registrado
- [ ] Happy path: Upload XLSX GGPoker -> conversao XLSX->CSV funciona, torneios importados
- [ ] Happy path: Upload com duplicatas (import_new_only) -> apenas novos importados, duplicatas contadas
- [ ] Erro: Arquivo vazio -> retorna erro adequado
- [ ] Erro: CSV com formato nao reconhecido -> 0 torneios, status registrado
- [ ] Erro: Token expirado -> 401 antes de processar
- [ ] Edge case: CSV com moeda CNY -> conversao aplicada usando exchangeRates
- [ ] Edge case: CSV com linhas malformadas -> linhas ignoradas, resto importado
- [ ] Edge case: Upload de arquivo WPN com formato especifico de rake
- [ ] Edge case: Torneio com reentries -> reentries contabilizados no buyIn total
- [ ] Edge case: CoinPoker formato TXT com USDT -> deteccao e parsing especifico
- [ ] Performance: Upload de arquivo grande (1000+ torneios) -> batch insert funciona
- [ ] Templates: Apos importacao, tournament_templates atualizados corretamente
