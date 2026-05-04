# News Audit — 2026-05-04

**Contexto:** Grok provider gera noticias via xAI Responses API standard (LLM-only, sem web_search).
Founder suspeita de hallucination (datas em outubro 2024, hoje 2026-05-04).

**Metodologia:**
- 5 ultimas noticias por source / category / global, ordenadas por `published_at DESC`.
- HEAD check com timeout 8s + redirect follow + fallback GET (Range bytes=0-0) em 405.
- User-Agent `GrindfyNewsAudit/1.0`.

## Sumario

| Metrica | Valor |
|---------|-------|
| Total items DB | 53 |
| URLs unicas | 53 |
| URLs alive (2xx/3xx) | 14 |
| URLs dead (4xx/5xx/timeout/network) | 39 |
| % URLs vivas | 26.4% |

> Nota: muitas URLs alive sao homepage (substituidas pelo fix item 11). Item-level original era hallucinated; homepage substitute volta 200 mas nao prova que titulo+summary+data sao reais.

## Como classificar (founder)

Marcar coluna `Veredicto` com:
- `[REAL]` — titulo+summary+data correspondem a artigo real existente.
- `[FAKE]` — totalmente alucinado (titulo nao existe, data falsa, etc).
- `[PARCIAL]` — titulo existe mas data/summary errados, OU URL homepage substitui item real perdido.
- `[HOME]` — URL apenas aponta pra homepage da source (substituicao item 11).

## Por Source (top 5)

### gossip :: MundoPoker (mundopoker)

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-18 | Joao Simoes vence High Roller no PokerStars na Itália | [link](https://www.mundopoker.com.br) | 200 OK | Pros brasileiro Joao Simoes leva High Roller de €10k em Campione. Prêmio de €150k e performance imp… |  |
| 2024-10-17 | Escândalo de trapaça no BSOP: Jogador banido permanentemente | [link](https://www.mundopoker.com.br) | 200 OK | Jogador flagrado usando dispositivo no BSOP São Paulo. Comissão de ética bane por vida. Impacto no … |  |
| 2024-10-16 | Ranking GPI: 3 brasileiros no Top 100 mundial | [link](https://www.mundopoker.com.br) | 200 OK | Atualização do Global Poker Index coloca três pros BR no Top 100. Destaque para Yuri Martins em 45º… |  |
| 2024-10-15 | Brasileiro conquista bracelete no WSOP e agita poker nacion… | [link](https://www.mundopoker.com.br) | 200 OK | Jogador brasileiro leva bracelete no WSOP 2024 após heads-up épico. Prêmio de US$ 500 mil e vaga no… |  |
| 2024-10-14 | WCOOP 2024: Brasil fatura 5 títulos e US$ 2M em premiações | [link](https://www.mundopoker.com.br) | 200 OK | Resumo da WCOOP com domínio brasileiro: 5 braceletes e mais de US$ 2 milhões. Destaques para NegriU… |  |

### gossip :: SuperPoker (superpoker)

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-06 | Musa do poker brasileira anuncia OnlyFans: 'Poker me deu li… | [link](https://superpoker.com.br/musa-poker-onlyfans-anuncio) | 404 | Influencer e jogadora revela bastidores da vida de pro e lança conteúdo exclusivo. Post viraliza co… |  |
| 2024-10-05 | SuperPoker lança campanha: 'Parem de roubar os grinders bra… | [link](https://superpoker.com.br/campanha-grinders-roubo-pagamentos) | 404 | Portal inicia petição contra sites que congelam saques de jogadores BR. Milhares assinam em 24h, co… |  |
| 2024-10-04 | Drama entre pros: Negueba acusa rivais de trapaça em mesas … | [link](https://superpoker.com.br/negueba-acusa-trapaca-high-stakes) | 404 | Felipe 'Negueba' Pacheco revela supostas fraudes em jogos privados de alto valor. Áudios vazados ag… |  |
| 2024-10-02 | João Simão declara: 'Poker online no Brasil está morto sem … | [link](https://superpoker.com.br/joao-simao-poker-online-brasil-morto) | 404 | Pro brasileiro João Simão faz thread explosiva criticando falta de leis para poker online. Chama go… |  |
| 2024-10-01 | Yuri Martins expõe polêmica com site de poker: 'Eles me dev… | [link](https://superpoker.com.br/yuri-martins-polemica-site-poker-dividas) | 404 | Yuri Dzivielevski Martins detona plataforma online por atrasos em pagamentos e dívidas milionárias.… |  |

### sites :: 888poker (888poker)

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-19 | Bônus de recarga 100% até $400 na 888poker esta semana | [link](https://www.888poker.com/promotions/reload-bonus-400/) | 404 | Promo especial: Deposite agora e ganhe 100% até $400 em bônus de recarga + 50 free spins. Válido at… |  |
| 2024-10-18 | 888poker anuncia Super Series com $10M em GTDs | [link](https://twitter.com/888poker/status/1847001234567890123) | 403 | Nova Super Series na 888poker com mais de $10 milhões em prêmios garantidos. 100+ eventos de 5 a 20… |  |
| 2024-10-17 | Atualização de software 888poker: Novos recursos de multi-t… | [link](https://www.888poker.com/software-update-v7-2/) | 404 | 888poker atualiza software com suporte aprimorado a multi-tabling, HUDs customizáveis e redução de … |  |
| 2024-10-16 | Promo Flash: Freeroll diário com $5.000 garantidos na 888po… | [link](https://www.888poker.com/promotions/daily-freeroll-5000/) | 404 | Nova promoção freeroll diária na 888poker com $5.000 em prêmios garantidos. Participe todos os dias… |  |
| 2024-10-15 | 888poker lança novo torneio Mystery Bounty no XL Inferno Se… | [link](https://www.888poker.com/poker-news/xl-inferno-series-mystery-bounty/) | 404 | A 888poker anunciou o lançamento de Mystery Bounty no XL Inferno Series, com buy-ins a partir de $1… |  |

### sites :: CoinPoker (coinpoker)

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-09 | Freeroll Semanal CoinPoker com $10k GTD Todo Sábado | [link](https://x.com/CoinPoker_Official/status/1843204567890123456) | 403 | Novo freeroll semanal inicia amanhã com $10k garantidos. Qualifique-se jogando cash games. Detalhes… |  |
| 2024-10-08 | CoinPoker Anuncia Parceria com Nova Carteira Cripto para De… | [link](https://coinpoker.com/promotions/trust-wallet-partnership) | ERR (fetch failed) | Integração com Trust Wallet para depósitos instantâneos em BTC, ETH e CHP. Bônus de 100% no primeir… |  |
| 2024-10-07 | Atualização de Software CoinPoker: Modo Dark e Filtros Apri… | [link](https://coinpoker.com/blog/software-update-v2-4-1) | ERR (fetch failed) | Update v2.4.1 traz modo dark, filtros de torneios por buy-in e suporte a mais criptos. Disponível a… |  |
| 2024-10-06 | Nova Série de Torneios CoinPoker Arena Começa em 10/10 | [link](https://coinpoker.com/news/coinpoker-arena-series-launch) | ERR (fetch failed) | Série Arena com buy-ins de $5 a $100 e GTD de $500k. Inscrições abertas no app e site. Novas featur… |  |
| 2024-10-05 | CoinPoker Lança Promoção de Rakeback Aumentado para Novos J… | [link](https://coinpoker.com/promotions/rakeback-boost) | ERR (fetch failed) | CoinPoker anunciou rakeback de até 33% para novos depósitos via cripto. Válido até 15/10. Acesse o … |  |

### sites :: PartyPoker (partypoker)

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-19 | Série Million: Garantia de $1M com eventos diários no party… | [link](https://www.partypoker.com/blog/en/million-series-announcement) | 403 | Nova Million Series com torneios diários, main event $500k GTD e satellites acessíveis. Começa 21/1… |  |
| 2024-10-18 | Lançamento: Novos jogos de cash Power Up no partypoker | [link](https://x.com/partypoker/status/1846723456789012345) | 403 | Introdução de variantes Power Up com mecânicas inovadoras em mesas de cash. Buy-ins de $0.01/$0.02 … |  |
| 2024-10-17 | Atualização de software: Novos recursos de multi-tabling no… | [link](https://www.partypoker.com/blog/en/software-update-multi-tabling) | 403 | Cliente atualizado com suporte aprimorado para multi-tabling, HUDs customizáveis e performance otim… |  |
| 2024-10-16 | Promoção de recarga: 50% extra até $200 no partypoker esta … | [link](https://www.partypoker.com/promotions/reload-bonus) | 200 OK | Recarregue sua conta e ganhe 50% bônus até $200 em tickets para a Power Series. Válido até 20/10. T… |  |
| 2024-10-15 | Power Series: Novos torneios com buy-ins a partir de $5 no … | [link](https://www.partypoker.com/blog/en/power-series-launch) | 403 | A partypoker anunciou o lançamento da Power Series, uma nova série de torneios com mais de 100 even… |  |

### sites :: PokerStars (pokerstars)

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-29 | Atualização de software PokerStars: Novos recursos de multi… | [link](https://pokerstars.com/poker/room/news/software-update-2024/) | 404 | PokerStars libera update no cliente com melhorias no multi-tabling, HUDs customizáveis e correções … |  |
| 2024-10-28 | PokerStars lança a série Hot $55 com $500.000 em prêmios ga… | [link](https://pokerstars.com/news/hot-55-series-launch/) | ERR (This operation was aborted) | A PokerStars anunciou o início da Hot $55 Series, uma nova série de torneios com buy-in de $55 e ma… |  |
| 2024-10-27 | Promo Spin & Go: Freerolls diários com $10.000 GTD na Poker… | [link](https://pokerstars.com/promotions/spin-go-freeroll-promo/) | 404 | Nova promoção Spin & Go: Participe de freerolls diários às 20h com $10k GTD. Qualifique jogando Spi… |  |
| 2024-10-26 | Mudança nas regras de cash games: Novos limites de mesas na… | [link](https://pokerstars.com/poker/room/rules/cash-game-update/) | 404 | PokerStars atualiza regras de cash games: Aumenta limite de mesas simultâneas para 24 e introduz no… |  |

### sites :: WPN / ACR (wpn-acr)

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-03 | Promo Beat the Clock: Freerolls diários com $50K garantidos | [link](https://x.com/ACRPoker/status/1842000000000000000) | 403 | Nova promoção Beat the Clock no ACR: Freerolls diários às 18h ET com $50.000 em prêmios. Qualifique… |  |
| 2024-10-01 | High Hand Promo: Prêmios extras em cash games até fim do mês | [link](https://x.com/ACRPoker/status/1841500000000000000) | 403 | Promo High Hand no ACR: Ganhe até $1.000 por mão alta em hold'em cash games. Ativa em mesas selecio… |  |

### studies :: GTO Wizard - Estudos (gto-wizard-studies)

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-28 | Teoria MTT Avançada: Modelando ICM com Multiway Pots | [link](https://blog.gtowizard.com) | 200 OK | Exploração de ICM em pots multiway durante MTTs. Soluções solver para ranges e sizing, com foco em … |  |
| 2024-10-25 | Corrigindo Leaks em ICM: Overfolding em Spots de Bubble MTT | [link](https://blog.gtowizard.com) | 200 OK | Identificação e fixes para leaks comuns em decisões ICM durante bubble de MTTs. Compara plays GTO v… |  |
| 2024-10-22 | Thread: Evolução de Ranges Preflop no GTO Wizard Trainer (A… | [link](https://blog.gtowizard.com) | 200 OK | Thread no X com breakdown de novas ranges preflop para cash games e MTTs. Inclui links para drills,… |  |
| 2024-10-20 | Thread: Fixes de Leaks em Estratégia MTT Mid-Game | [link](https://x.com/GTOWizard/status/1845001234567890123) | 403 | Thread no X com 15 posts analisando leaks comuns em MTTs mid-game: overfolding rivers, sizing errad… |  |
| 2024-10-20 | Soluções Postflop GTO: Defendendo BB vs RFI em 50bb Stacks | [link](https://blog.gtowizard.com) | 200 OK | Estudo prático de soluções GTO para pós-flop no big blind contra raise first in. Foco em mixing fre… |  |

### tools :: Hand2Note (hand2note)

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-05 | Hand2Note 3.2.0.9 lançado com correções de bugs e melhorias… | [link](https://hand2note.com/release-notes/) | 200 OK | Nova versão 3.2.0.9 do Hand2Note corrige bugs no HUD, melhora estabilidade em mesas múltiplas e oti… |  |
| 2024-10-04 | Integração oficial com solver PioSOLVER no Hand2Note | [link](https://twitter.com/Hand2Note/status/1842000000000000000) | 403 | Hand2Note anuncia integração nativa com PioSOLVER para análise GTO em tempo real. Nova feature disp… |  |
| 2024-10-03 | Hotfix 3.2.0.8 para suporte a GGPoker atualizado | [link](https://hand2note.com/changelog/) | 200 OK | Hotfix rápido corrige scraping de mãos no GGPoker após update da sala. HUD agora 100% compatível co… |  |
| 2024-10-02 | Nova feature: Hotkeys personalizáveis para range viewer | [link](https://twitter.com/Hand2Note/status/1841500000000000000) | 403 | Adicionado hotkeys customizáveis no range viewer do Hand2Note. Facilita análise rápida durante sess… |  |
| 2024-10-01 | Melhorias no Hand2Note ICMIZER para torneios SNG | [link](https://hand2note.com/blog/icmizer-update/) | 200 OK | Update no módulo ICMIZER com cálculos mais precisos e suporte a estruturas turbo. Integração aprimo… |  |

### tournament-results :: Cravadas BR (cravadas-br)

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-06 | Yuri Martins crava o Sunday Million por $156.000! | [link](https://www.pokerstars.com/news) | ERR (This operation was aborted) | Yuri 'theNERDguy' Martins venceu o Sunday Million no PokerStars, garantindo $156.000 após deal. Gra… |  |
| 2024-10-06 | Renan Bruschi ITM no Omaholic $1.050 por $18.900 | [link](https://www.pokerstars.com/news) | ERR (This operation was aborted) | Renan 'Internettz95' Bruschi faz 4º no Omaholic $1.050 High Roller no GGPoker, com $18.900. Bom res… |  |
| 2024-10-06 | Pedro Garagnani crava Mystery Bounty $109 por $28.500 | [link](https://www.pokerstars.com/news) | ERR (This operation was aborted) | Pedro 'paDiNhA_SP' Garagnani vence o Mystery Bounty $109 no GGPoker, faturando $28.500 após bounty … |  |

---

## Por Category (top 5)

### gossip

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-18 | Joao Simoes vence High Roller no PokerStars na Itália | [link](https://www.mundopoker.com.br) | 200 OK | Pros brasileiro Joao Simoes leva High Roller de €10k em Campione. Prêmio de €150k e performance imp… |  |
| 2024-10-17 | Escândalo de trapaça no BSOP: Jogador banido permanentemente | [link](https://www.mundopoker.com.br) | 200 OK | Jogador flagrado usando dispositivo no BSOP São Paulo. Comissão de ética bane por vida. Impacto no … |  |
| 2024-10-16 | Ranking GPI: 3 brasileiros no Top 100 mundial | [link](https://www.mundopoker.com.br) | 200 OK | Atualização do Global Poker Index coloca três pros BR no Top 100. Destaque para Yuri Martins em 45º… |  |
| 2024-10-15 | Brasileiro conquista bracelete no WSOP e agita poker nacion… | [link](https://www.mundopoker.com.br) | 200 OK | Jogador brasileiro leva bracelete no WSOP 2024 após heads-up épico. Prêmio de US$ 500 mil e vaga no… |  |
| 2024-10-14 | WCOOP 2024: Brasil fatura 5 títulos e US$ 2M em premiações | [link](https://www.mundopoker.com.br) | 200 OK | Resumo da WCOOP com domínio brasileiro: 5 braceletes e mais de US$ 2 milhões. Destaques para NegriU… |  |

### sites

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-29 | Atualização de software PokerStars: Novos recursos de multi… | [link](https://pokerstars.com/poker/room/news/software-update-2024/) | 404 | PokerStars libera update no cliente com melhorias no multi-tabling, HUDs customizáveis e correções … |  |
| 2024-10-28 | PokerStars lança a série Hot $55 com $500.000 em prêmios ga… | [link](https://pokerstars.com/news/hot-55-series-launch/) | ERR (This operation was aborted) | A PokerStars anunciou o início da Hot $55 Series, uma nova série de torneios com buy-in de $55 e ma… |  |
| 2024-10-27 | Promo Spin & Go: Freerolls diários com $10.000 GTD na Poker… | [link](https://pokerstars.com/promotions/spin-go-freeroll-promo/) | 404 | Nova promoção Spin & Go: Participe de freerolls diários às 20h com $10k GTD. Qualifique jogando Spi… |  |
| 2024-10-26 | Mudança nas regras de cash games: Novos limites de mesas na… | [link](https://pokerstars.com/poker/room/rules/cash-game-update/) | 404 | PokerStars atualiza regras de cash games: Aumenta limite de mesas simultâneas para 24 e introduz no… |  |
| 2024-10-19 | Bônus de recarga 100% até $400 na 888poker esta semana | [link](https://www.888poker.com/promotions/reload-bonus-400/) | 404 | Promo especial: Deposite agora e ganhe 100% até $400 em bônus de recarga + 50 free spins. Válido at… |  |

### studies

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-28 | Teoria MTT Avançada: Modelando ICM com Multiway Pots | [link](https://blog.gtowizard.com) | 200 OK | Exploração de ICM em pots multiway durante MTTs. Soluções solver para ranges e sizing, com foco em … |  |
| 2024-10-25 | Corrigindo Leaks em ICM: Overfolding em Spots de Bubble MTT | [link](https://blog.gtowizard.com) | 200 OK | Identificação e fixes para leaks comuns em decisões ICM durante bubble de MTTs. Compara plays GTO v… |  |
| 2024-10-22 | Thread: Evolução de Ranges Preflop no GTO Wizard Trainer (A… | [link](https://blog.gtowizard.com) | 200 OK | Thread no X com breakdown de novas ranges preflop para cash games e MTTs. Inclui links para drills,… |  |
| 2024-10-20 | Thread: Fixes de Leaks em Estratégia MTT Mid-Game | [link](https://x.com/GTOWizard/status/1845001234567890123) | 403 | Thread no X com 15 posts analisando leaks comuns em MTTs mid-game: overfolding rivers, sizing errad… |  |
| 2024-10-20 | Soluções Postflop GTO: Defendendo BB vs RFI em 50bb Stacks | [link](https://blog.gtowizard.com) | 200 OK | Estudo prático de soluções GTO para pós-flop no big blind contra raise first in. Foco em mixing fre… |  |

### tools

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-05 | Hand2Note 3.2.0.9 lançado com correções de bugs e melhorias… | [link](https://hand2note.com/release-notes/) | 200 OK | Nova versão 3.2.0.9 do Hand2Note corrige bugs no HUD, melhora estabilidade em mesas múltiplas e oti… |  |
| 2024-10-04 | Integração oficial com solver PioSOLVER no Hand2Note | [link](https://twitter.com/Hand2Note/status/1842000000000000000) | 403 | Hand2Note anuncia integração nativa com PioSOLVER para análise GTO em tempo real. Nova feature disp… |  |
| 2024-10-03 | Hotfix 3.2.0.8 para suporte a GGPoker atualizado | [link](https://hand2note.com/changelog/) | 200 OK | Hotfix rápido corrige scraping de mãos no GGPoker após update da sala. HUD agora 100% compatível co… |  |
| 2024-10-02 | Nova feature: Hotkeys personalizáveis para range viewer | [link](https://twitter.com/Hand2Note/status/1841500000000000000) | 403 | Adicionado hotkeys customizáveis no range viewer do Hand2Note. Facilita análise rápida durante sess… |  |
| 2024-10-01 | Melhorias no Hand2Note ICMIZER para torneios SNG | [link](https://hand2note.com/blog/icmizer-update/) | 200 OK | Update no módulo ICMIZER com cálculos mais precisos e suporte a estruturas turbo. Integração aprimo… |  |

### tournament-results

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-06 | Yuri Martins crava o Sunday Million por $156.000! | [link](https://www.pokerstars.com/news) | ERR (This operation was aborted) | Yuri 'theNERDguy' Martins venceu o Sunday Million no PokerStars, garantindo $156.000 após deal. Gra… |  |
| 2024-10-06 | Renan Bruschi ITM no Omaholic $1.050 por $18.900 | [link](https://www.pokerstars.com/news) | ERR (This operation was aborted) | Renan 'Internettz95' Bruschi faz 4º no Omaholic $1.050 High Roller no GGPoker, com $18.900. Bom res… |  |
| 2024-10-06 | Pedro Garagnani crava Mystery Bounty $109 por $28.500 | [link](https://www.pokerstars.com/news) | ERR (This operation was aborted) | Pedro 'paDiNhA_SP' Garagnani vence o Mystery Bounty $109 no GGPoker, faturando $28.500 após bounty … |  |

---

## Top 5 Global

| Data | Titulo | URL | HTTP | Summary | Veredicto |
|------|--------|-----|------|---------|-----------|
| 2024-10-29 | Atualização de software PokerStars: Novos recursos de multi… | [link](https://pokerstars.com/poker/room/news/software-update-2024/) | 404 | PokerStars libera update no cliente com melhorias no multi-tabling, HUDs customizáveis e correções … |  |
| 2024-10-28 | Teoria MTT Avançada: Modelando ICM com Multiway Pots | [link](https://blog.gtowizard.com) | 200 OK | Exploração de ICM em pots multiway durante MTTs. Soluções solver para ranges e sizing, com foco em … |  |
| 2024-10-28 | PokerStars lança a série Hot $55 com $500.000 em prêmios ga… | [link](https://pokerstars.com/news/hot-55-series-launch/) | ERR (This operation was aborted) | A PokerStars anunciou o início da Hot $55 Series, uma nova série de torneios com buy-in de $55 e ma… |  |
| 2024-10-27 | Promo Spin & Go: Freerolls diários com $10.000 GTD na Poker… | [link](https://pokerstars.com/promotions/spin-go-freeroll-promo/) | 404 | Nova promoção Spin & Go: Participe de freerolls diários às 20h com $10k GTD. Qualifique jogando Spi… |  |
| 2024-10-26 | Mudança nas regras de cash games: Novos limites de mesas na… | [link](https://pokerstars.com/poker/room/rules/cash-game-update/) | 404 | PokerStars atualiza regras de cash games: Aumenta limite de mesas simultâneas para 24 e introduz no… |  |

---

## Decisao apos audit

- (A) Kill flag `NEWS_FEED_ENABLED=false` ate refactor (5min).
- (B) Sprint News-2: migrar grokNewsProvider pra Agent Tools API com `web_search` real (1-2 dias).
- (C) Sprint News-3: substituir Grok por RSS scrapers (PokerNewsBR, PokerNews, blog.gtowizard.com RSS).
