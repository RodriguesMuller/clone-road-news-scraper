# Changelog — Road News

> Mantido por `tech-docs-agent`, uma entrada por mudança de **comportamento observável** (não por refactor interno sem efeito externo). Não confundir com o changelog interno do PDF em `docs/dist/.docs-pdf-manifest.json` (esse é só sobre a publicação do PDF em si) nem com [`docs/HISTORY.md`](HISTORY.md) (registro fiel de toda mudança, incluindo internas, mantido por `project-historian`).

## 2026-11-19 — Resumo semanal: PDF vira boletim para o cliente
- **Alterado**: "Exportar resumo em PDF" gera um boletim próprio para enviar ao cliente, em vez de imprimir o modal. O boletim não tem links e tira dos títulos o "»" e o nome do portal. Seções: cabeçalho com período e nível da semana, resumo executivo, 8 indicadores (os 7 do resumo e mais ocorrências distintas), com variação em número e % e a definição de cada um, panorama por gravidade, tipo e UF, recomendações, pontos de atenção, trechos críticos, principais ocorrências com impacto e confirmação por fontes, segurança da carga, clima INMET e metodologia.
- **Alterado**: o PDF não mostra mais "about:blank" e a data do navegador no topo e no rodapé. Toda página tem rodapé do Road News, e o nome do arquivo sugerido traz o período.
- **API**: `/api/weekly-summary` devolve `summary.report` (`events`, `severe`, `roads`, `states`, `by_level[]`, `by_category[]`, `by_state[]`), calculado por `api/_weekly_report.js`. A lista de ocorrências não sai do servidor. O e-mail e a paridade JS/Python não mudam.

## 2026-11-18 — Resumo semanal: comparação honesta e sem notícia velha, desdobramento ou morte de animal
- **Corrigido**: quando a coleta fica parada na semana anterior (houve um buraco de 05/10 a 09/11/2026), o resumo deixa de mostrar "▲ vs semana anterior" e diz "sem base de comparação", no painel, no e-mail e no texto da IA. Antes, 86 bloqueios contra 44 pareciam uma alta, mas a semana anterior tinha só 2 dias de coleta.
- **Corrigido**: notícia publicada mais de 2 dias antes de ser coletada conta na data em que saiu, não na semana da coleta. Ex.: o acidente de Teófilo Otoni de dez/2024 (38 mortos) entrava como acidente desta semana.
- **Corrigido**: júri, perfil da vítima ("Quem era…") e cobrança de familiar sobre acidente antigo passam a ser desdobramento (Baixo), sem contar como novo acidente com morte.
- **Corrigido**: ERS-135 e RS-135 (e MT-40 e MT-040) são a mesma rodovia: o mesmo acidente não conta duas vezes.
- **Corrigido**: morte só de animal ("três bois morrem", "cavalo morre atropelado") não conta como acidente com vítima fatal. Morte de pessoa em acidente com animal continua contando.
- Efeito no resumo de 18/11/2026: 86/30/112/170/4/5/9 → 78/29/110/154/4/4/9 (bloqueios totais, programados, pesados, fatais, roubos, paralisações, INMET), sem comparação com a semana anterior.

## 2026-11-18 — Redesign "Boletim de Aviso": o painel responde se a carga pode sair
- **Alterado**: nova identidade visual em todo o painel. Cada ocorrência aparece como um aviso oficial (grau, trecho, vigência, despacho).
  - Barra lateral azul-tinta e fundo claro de boletim; o **tema claro passa a ser o padrão** (o escuro continua no seletor).
  - Fonte Archivo em tudo, com números tabulares.
  - As únicas cores fortes são de **grau**, iguais às do INMET: vermelho Crítico, laranja Alto, amarelo Médio, cinza-azulado Baixo. Mapa, gráficos, selos e card de resumo usam a mesma régua; categorias passaram para tons azul-acinzentados.
- **Alterado**: a tela inicial virou **"Situação agora"** (antes "Dashboard"). No topo, o veredito (ex.: "Atenção: 5 trechos com risco alto"); abaixo, os avisos das últimas 24h por grau, cada um com número EV, ação de despacho e "Por que alto?"; ao lado, a **régua de vigência** de cada trecho. O carrossel de destaques e os 6 indicadores de volume saíram; tendência, temas, mapa e últimas notícias ficam em "Panorama do período".
- **Adicionado**: **Modo torre** (`/torre`): tela cheia escura, sem menu, com letra grande, para monitor fixo ou TV. Mostra só o veredito, os avisos e a régua; redesenha a cada minuto sem chamar a API.
- **Alterado**: Minha Rota mostra a recomendação operacional antes dos indicadores e do mapa (também no celular). No traçado, fluxo normal azul, lento amarelo, congestionado laranja; vermelho só para ocorrência crítica.
- **Alterado**: Notícias com miniatura pequena (título e impacto em destaque); Central de Evento, Alertas, Mapa, Resumo e telas de gestão no mesmo visual; login em duas colunas ("Entrar no painel").
- **Alterado**: card de resumo (PNG de "Gerar resumo") redesenhado como aviso: faixa do grau, "O que fazer", resumo e "Por que crítico".
- **Alterado**: e-mail do resumo semanal no mesmo visual: papel claro, cabeçalho azul-tinta e selos de grau preenchidos com as cores do INMET (antes fundo escuro e verde neon). No mapa da Minha Rota, origem azul, destino azul-tinta e paradas brancas (antes verde, azul e amarelo, que se confundiam com o grau Médio).
- **Corrigido**: título do card com o começo do resumo grudado ("…em Governador Valadares Na região da BR-381"); reticências em texto que cabia inteiro; acentos nas páginas de Privacidade e Termos; impressão do resumo semanal agora em papel branco com texto mínimo de 10px.

## 2026-11-18 — Alertas vira "Meus trechos"
- **Adicionado**: na tela **Alertas**, o cliente cadastra as rodovias (ex.: BR-116, SP-330) e os estados (ex.: PR) onde a frota roda. A lista de alertas passa a mostrar só o que acontece neles, com o link "Ver também N em outros trechos". Sem trecho cadastrado, a tela continua como antes. A lista fica salva no navegador.
- **Removido**: os cards "Última coleta / Última hora / Últimas 24h / Total de notícias" da tela Alertas. Eram métricas internas da coleta e não ajudavam a decidir; o horário do dado continua no selo do topo.
- **Corrigido**: com a coleta atrasada, a lista vazia dizia "Nenhum alerta operacional acionável". Agora diz que não há dado novo na janela e de quando é a última coleta.

## 2026-11-18 — Resumo semanal sem números inflados por notícia repetida
- **Corrigido**: a mesma ocorrência noticiada por veículos diferentes contava várias vezes nos números do resumo semanal (painel e e-mail) quando só um veículo citava a rodovia ou a UF. Agora:
  - rodovia ou UF ausente em uma das notícias não impede juntar; só rodovia ou UF **diferentes** separam;
  - mesma rodovia e mesma família de ocorrência (ex.: "carreta tomba" e "acidente com morte") vira um evento só em até 24h com a mesma UF, ou em até 12h quando uma das notícias não cita a UF.
- **Corrigido**: "Acidentes com vítima fatal" contava notícias sem morte que citavam "Zona da Mata" ou "incêndio em mata". "Mata/matam" só conta como morte seguido da vítima ("mata motorista", "mata 3 pessoas").
- **Corrigido**: "vs semana anterior (0)" em todos os números. A busca parava em 800 notícias e não chegava à semana anterior. Agora a API pagina (até 10 mil linhas) e o e-mail usa teto de 10 mil.

## 2026-11-17 — Painel nunca mostra "tudo tranquilo" com dado ausente ou velho
- **Adicionado**: selo **"Dados de HH:MM"** no topo do painel, que também é o botão de atualizar. Fica âmbar com leitura de mais de 75 min e vermelho em falha ("Falha ao atualizar · dados de HH:MM" ou "Sem dados · tentar de novo").
- **Adicionado**: o painel se atualiza sozinho **de hora em hora** (depois do minuto 15, quando a coleta já terminou), só com a aba visível. Cada atualização consome 1 consulta da cota de notícias, como a carga manual. Falhas são retentadas no máximo a cada 10 min.
- **Corrigido**: falha ao carregar o feed fazia Dashboard, Alertas, Resumo operacional e o sino mostrarem "sem ocorrência"/"Normal". Agora:
  - sem nenhuma leitura, mostram **"Sem dados: não interprete como ausência de risco"**;
  - com leitura anterior, mantêm o último dado e avisam o horário dele.
- **Alterado**: a barra lateral separa "Painel desatualizado"/"Painel sem atualizar" de "Coleta atrasada".
- **Alterado**: na Central de Evento, sem análise da IA 2h depois de acompanhar, o aviso diz que a análise não saiu e orienta decidir pelas notícias, em vez de "Aguardando" indefinidamente.
- **Alterado**: mensagens de recurso bloqueado dizem se o motivo é o limite do mês ("Você usou 10 de 10 consultas de rota deste mês") ou o pacote, e mandam falar com o gestor da empresa. O aviso do topo passou a ser anunciado por leitor de tela e usa a cor do tema (legível no tema claro).

## 2026-11-10 — Novo design da página de Notícias e das imagens
- **Alterado**: a página de Notícias segue o mockup aprovado, nas cores Overhaul.
  - Filtros por categoria com ícone e contagem (Todas, Acidentes, Interdições, Obras, Clima, Outros) e seletor de período.
  - Cards em duas colunas com imagem, faixa e selo na cor da categoria, título, local, tempo, fonte, etiquetas (risco, rodovia, categoria), impacto na frota e as ações "Gerar resumo", "Acompanhar evento" e "Ver detalhe". A borda vermelha de rodovia bloqueada continua.
  - Rodapé com o total de notícias e as principais fontes.
- **Alterado**: as ilustrações de reserva (quando a fonte não publica foto) viraram cenas de estrada em perspectiva, com céu ao entardecer, horizonte e vegetação, mais um elemento por categoria: placa e cones, barreira, obra, faróis no trânsito, chuva, neblina, caminhão, ponte, posto. Nunca há veículo acidentado nem pessoas. Valem no Dashboard e nas Notícias.

## 2026-11-10 — Central de Evento: o cliente escolhe, a IA acompanha
- **Alterado**: a IA não decide mais o que vai para a Central de Evento. Cada notícia (Notícias, Alertas, Salvos) tem o botão **"Acompanhar evento"**, e o evento fica visível para toda a empresa.
- **Adicionado**: a cada coleta (de hora em hora), a IA revisa cada evento acompanhado. Ela confirma quais notícias novas são do mesmo evento e atualiza a situação (resumo, impacto para a frota, **decisão de despacho**, ações recomendadas, duração) e a linha do tempo. O evento é **encerrado** quando uma notícia afirmar a liberação. O cliente também pode encerrar, reabrir ou parar de acompanhar.
- **Removido**: a triagem automática de eventos (`EVENT_INTELLIGENCE_ENABLED=false`; código mantido) e a republicação do evento curado de Santos. Os eventos que a IA tinha publicado deixam de aparecer na Central.
- **Migration**: `scripts/supabase_followed_events.sql`.

## 2026-11-10 — Correção: painel sem notícias
- **Corrigido**: depois do PR #22, o feed (`/api/news-feed`) e o resumo semanal respondiam `FUNCTION_INVOCATION_FAILED` e o painel ficou zerado. O vocabulário do conserto de acento estava em `config/`, que o `.vercelignore` exclui do deploy. O arquivo foi para `public/accented_words.json`, e sem ele o conserto vira no-op em vez de derrubar o feed.

## 2026-11-10 — Central de Evento pela decisão de despacho; texto com acento quebrado
- **Alterado**: a triagem de eventos passa a perguntar "isso muda a decisão de liberar caminhões de carga?". Acidente, mesmo grave, só vira evento com bloqueio total, nos dois sentidos ou sem previsão; o resto fica em Alertas. Evento novo já encerrado não entra na Central. Notícia de liberação da via chega à IA para encerrar o evento publicado.
- **Adicionado**: **decisão de despacho** em cada evento ("Segurar veículos para o trecho", "Liberar com desvio", "Liberar com atenção"; encerrado = "Trecho liberado: despacho normal"), no selo, no banner e nos indicadores. As ações recomendadas passam a ser de despacho.
- **Corrigido**: título com acento corrompido na fonte (ex.: "Not??cias - Grave acidente…", Guia Crissiumal). A coleta conserta o acento pela palavra conhecida (`public/accented_words.json`) e tira o rótulo de seção "Notícias - ". As notícias já gravadas são consertadas na exibição (feed e resumo semanal).

## 2026-11-10 — Triagem de eventos: resposta da IA cortada
- **Corrigido**: após o prompt v2, a triagem falhou em produção com `JSONDecodeError`. A resposta da IA era cortada pelo limite de 3000 tokens de saída. O limite passou para 8000, e resposta incompleta agora gera erro claro no log (`resposta da IA incompleta (motivo)`) em vez de erro de JSON.

## 2026-11-10 — Central de Evento só com o que afeta frota de carga
- **Corrigido**: acidente pontual com interdição parcial (ex.: tombamento na Raposo Tavares que parou linhas de ônibus) virava evento "Crítico" na Central. Agora a triagem descarta acidente com interdição parcial sem bloqueio total, e impacto só em ônibus, metrô ou passageiros não conta como gravidade. Essas ocorrências continuam em Alertas e Notícias. O prompt da IA define evento grave como o que obriga o gestor de frota de carga a replanejar rotas ou janelas.
- **Adicionado**: botão "Descartar: não é evento grave" para Admin/Gestor. O evento sai da Central para todos e a triagem automática não o republica.

## 2026-11-10 — QA da Central de Evento
- **Corrigido**: sem evento ativo, a Central não promove mais um evento antigo encerrado a destaque; "Eventos encerrados" mostra só os últimos 30 dias.
- **Corrigido**: a IA não reabre um evento encerrado pelo gestor sem notícia publicada depois do encerramento; reabrir apaga a data de encerramento antiga; a data de encerramento não muda mais a cada coleta; o início do evento usa a data real da notícia mais antiga.
- **Adicionado**: selo "Sem atualização há N dias" em evento ativo parado há mais de 72h.
- **Atenção**: a detecção automática exige o secret `OPENAI_API_KEY` no GitHub Actions (ausente até hoje). Relatório: `docs/qa-audit/2026-11-10-central-de-eventos.md`.

## 2026-11-10 — QA de pacotes e limites
- **Adicionado**: **pacote do cliente**. O pacote passa a ser configurado no cadastro do cliente e todos os usuários da empresa **herdam** recursos e limites dele. O **consumo continua sendo de cada usuário**: cada um tem o próprio saldo mensal. Cliente sem pacote mantém o modelo antigo (pacote por usuário). `max_users` do pacote herdado limita os usuários Cliente ativos da empresa. Migration: `scripts/supabase_client_package.sql`.
- **Corrigido**: requisições simultâneas furavam o limite (reserva atômica de uso); pacote com início no futuro já liberava; trocar para pacote inválido deixava o usuário sem pacote; `max_users` contava a plataforma inteira e vínculos vencidos; a gestão subcontava o consumo acima de 1000 eventos/mês.
- **Alterado**: Minha Rota com entrada inválida ou falha do Google não consome a consulta.
- Relatório completo: `docs/qa-audit/2026-11-10-pacotes-e-limites.md`.

## 2026-11-10 — mais fotos reais: feeds regionais do G1
- **Adicionado**: 24 feeds RSS regionais do G1 (um por estado), com o mesmo filtro de keywords e de frota. O G1 é o veículo mais frequente por trás das buscas do Google News, que chegam sem foto; o feed direto traz a foto e o link original. Avaliados antes: robots.txt liberado e 93 notícias relevantes, todas com foto.
- **Adicionado**: deduplicação entre fontes (`prefer_direct_sources`): a cópia do Google News sai quando a mesma notícia veio do feed direto.
- **Impacto**: notícias com foto passaram de 1% para 32% da coleta; mais cobertura regional de rodovias estaduais.

## 2026-11-10 — dropdowns do cabeçalho e imagem da notícia
- **Corrigido**: o painel de alertas (sino) e o menu do usuário não fechavam, e o seletor de período aparecia fora do Dashboard. Causa: `display: grid/inline-flex` dos componentes vencia o atributo `hidden`. Agora `[hidden]` sempre esconde, e os menus fecham ao clicar fora, ao escolher uma opção (inclusive "Sair") ou com Esc; abrir um fecha o outro.
- **Adicionado**: imagem da notícia vinda da fonte (feed ou `og:image` de fontes diretas), com crédito, gravada em `news.image_url` (migration `scripts/supabase_news_image_url.sql`). Sem imagem, ilustração neutra por tema, nunca cena de acidente, pessoas ou vítimas. Se a imagem da fonte falhar ao carregar, a ilustração assume.

## 2026-11-10 — identidade visual Overhaul (paleta e tipografia)
- **Alterado**: o painel, o PDF do resumo semanal e o e-mail de segunda passam a usar a paleta oficial. **Escuro**: fundo Midnight Green `#0F1814`, superfícies derivadas do Dark Green `#2A3E33`, texto Grey `#F4F9FA`/Cool Steel, marca Vivid Green `#1EFF95` com texto Dark Purple `#1E0D43`. **Claro**: fundo Grey `#F4F9FA`, cartões brancos/White Smoke, texto Midnight Green/Dim Grey, destaque Vivid Purple `#5029FF`. Gravidade: Crítico Deep Orange `#FC3700` (a paleta não tem vermelho), Alto Burnt Yellow `#FFCD00`, Médio Sky Blue `#00ACFF`, Baixo Vivid/Heritage Green. Temas e indicadores com a paleta secundária.
- **Alterado**: tipografia **Archivo** (títulos e texto) e **Geist Mono** (rótulos, links, botões e números). Archivo hospedada no projeto (`public/assets/fonts/archivo/`, licença OFL junto), sem requisição a terceiros.
- **Corrigido**: as fontes usavam caminho relativo (`assets/fonts/...`) e não carregavam em rotas aninhadas como `/developer/clientes`; agora o caminho é absoluto.

## 2026-11-10 — design executivo: Dashboard, cabeçalho e temas claro/escuro
- **Adicionado**: página **Dashboard** (início, `/dashboard`): 6 indicadores com variação contra o período anterior, sparkline, tooltip e contador animado (notícias coletadas, com impacto na frota, alertas importantes, críticas, rodovias afetadas, fontes ativas); **destaque editorial** com as 3 ocorrências mais graves do período (gira sozinho; bloqueio já liberado não entra); **tendência** (coletadas × com impacto × período anterior, com tooltip); **principais temas** (rosca); **panorama** (mini-mapa com marcadores por gravidade); **últimas notícias** com filtros rápidos. Período: 24h / 7 / 30 dias.
- **Adicionado**: cabeçalho superior com busca global (leva a Notícias filtradas), sino de alertas altos/críticos das últimas 24h, alternância **claro/escuro** (preferência salva, aplicada antes da primeira pintura), seletor de período e menu do usuário. Sidebar com status da coleta (última notícia e sparkline de 24h).
- **Alterado**: identidade passa a azul-marinho + azul elétrico (dark) e branco/cinza + azul (light), em tokens; cores fixas verdes do CSS viraram variáveis de tema. "Alertas" ganhou rota própria (`/alertas`) e o Cliente ganhou "Relatórios".
- **Interno**: `public/dashboard.js` (vanilla, sem dependência nova; gráficos em SVG, mapa no Leaflet existente), carregado após `risk.js` e `brief.js`.

## 2026-11-10 — resumo operacional, menu do Cliente e refresh visual
- **Alterado**: "Resumo operacional" deixou de ser quatro cartões de contagem (categorias, estados, rodovias citadas, risco) e virou **Situação operacional**: janela de 6h/24h/72h/7 dias comparada à janela anterior; situação geral; KPIs (bloqueios totais, restrições parciais, programados, acidentes com pesado, vítimas fatais, roubo de carga, avisos INMET); **rodovias com restrição** (pior situação por rodovia, há quanto tempo, ação; bloqueio com liberação posterior vira "Liberada (confirmar)"); ações imediatas; atenção nos próximos dias; risco por estado; evolução no período; segurança da carga e clima.
- **Alterado**: o ambiente **Cliente** não mostra mais **Fontes** nem **Configurações**, e as rotas `/fontes` e `/configuracoes` redirecionam para o painel nesse ambiente (Gestor/Admin seguem com acesso).
- **Alterado**: refresh visual "escuro refinado": texto em sans-serif (monoespaçada só em números), paleta grafite em camadas, verde da marca como destaque, cartões com raio e sombra suaves, navegação lateral com indicador de item ativo.
- **Interno**: o motor do resumo semanal foi para `public/brief.js` (UMD, usado no navegador e pela API via `api/_weekly_brief.js`), com `windowMs` e `includeEvents` opcionais; saída semanal inalterada.

## 2026-11-10 — resumo semanal da frota
- **Alterado**: o resumo semanal (painel e e-mail) deixou de ser contagem de notícias ("rodovias mais citadas", "fontes com maior volume") e passou a ser um briefing de decisão: veredito da semana; números (bloqueios totais e programados, acidentes com pesado, vítimas fatais, roubo de carga, paralisações, avisos INMET de Perigo) com comparativo contra a semana anterior; **Atenção para os próximos dias**; trechos mais críticos com a ação; segurança da carga; clima por UF; até 5 ações; principais ocorrências.
- **Adicionado**: a mesma ocorrência noticiada por vários veículos conta uma vez só (com o nº de fontes); bloqueio programado já passado sai da lista; bloqueio total sem notícia de liberação aparece como "pode seguir bloqueado".
- **Alterado**: números, seções e ações são calculados sem IA (`api/_weekly_brief.js`, espelho `scraper/weekly_brief.py`); a IA, quando configurada, só redige título e abertura. `GET/POST /api/weekly-summary` mudou o formato da resposta (ver `docs/API.md`).
- **Adicionado**: `classifyRisk` passa a retornar `kind` (tipo de ocorrência) e `fatal`.

## 2026-11-10 — régua única de risco (Baixo/Médio/Alto/Crítico)
- **Alterado**: risco passa a medir o **impacto na operação da frota**, não a gravidade humana do fato. Crítico = via indisponível agora (bloqueio total em curso, manifestação bloqueando, INMET Grande Perigo); Alto = impacto forte provável (pesado tombado/incendiado, vítima fatal, produto perigoso, roubo de carga, greve anunciada, bloqueio total **programado**, INMET Perigo); Médio = atraso/atenção (acidente sem interdição, bloqueio parcial, obra, neblina, INMET Perigo Potencial, corredor internacional); Baixo = sem impacto atual (liberado, fora do Brasil, desdobramento judicial/luto, simulado, boato, greve negada).
- **Corrigido**: em amostra real de 254 notícias, 39% saíam como Crítico (qualquer morte, inclusive no exterior e em notícia de julgamento); agora 8%. Caminhão tombado sem a palavra "tombamento" saía como "Monitorar"; INMET Perigo Potencial saía como Alto.
- **Corrigido**: seis réguas divergentes (painel, Minha Rota, resumo individual, resumo semanal JS e Python, `risk_level` gravado pelo scraper) foram unificadas em `public/risk.js` (espelho `scraper/utils/risk.py`). A IA não define mais o risco.
- **Adicionado**: justificativa de cada nível (passe o mouse no selo de risco; campo `risk_reason` na Minha Rota e no resumo individual). Notícia sem local identificado fica limitada a Médio.
- **Corrigido**: títulos "Fato - Veículo" (ex.: "... - G1") geravam o resumo "há alerta de ... publicado pelo INMET".

## 2026-11-10 — Minha Rota: ocorrências de fora do trajeto
- **Corrigido**: a Minha Rota listava ocorrências de outros estados como "relacionadas à rota" (ex.: bloqueio da BR-101 no Espírito Santo numa rota Santo André → Itaquaquecetuba), porque a origem/destino era casada palavra a palavra ("santo" ⊂ "Espírito Santo"). Agora casa a localidade inteira com limite de palavra, descarta ocorrência geolocalizada a mais de 45 km do trajeto e ocorrência que cita só rodovias fora da rota.
- **Melhorado**: ocorrência casada pela cidade de origem/destino passa a ser marcada nessa ponta do mapa; bloqueio sem ponto identificável no traçado exibe aviso explícito.

## 2026-11-10 — impacto na frota, destaque de bloqueios e mapa
- **Corrigido**: o mapa rodoviário e o mapa da Minha Rota exibiam "API KEY REQUIRED" porque os tiles `dark_all` do CARTO passaram a exigir chave. Agora usam tiles do OpenStreetMap (sem chave), escurecidos via CSS; provedor centralizado em `BASE_TILE_URL`.
- **Adicionado**: destaque de rodovia bloqueada: borda vermelha e faixa "Rodovia bloqueada" (total) ou "parcialmente bloqueada" (tracejada) em notícias, alertas, salvos, ocorrências da rota e pop-up do mapa. Marcadores de bloqueio ficam fora do cluster e com anel pulsante.
- **Alterado**: `POST /api/news-feed` retorna `road_blocked`/`block_level` por ocorrência, ordena bloqueios primeiro e recomenda rota alternativa quando há bloqueio total.
- **Alterado**: o scraper descarta notícias sem impacto operacional para frota (filtro `fleet_relevance`); fontes podem desligá-lo com `fleet_filter: false`.
- **Adicionado**: linha "Impacto na frota" com ação sugerida em cada card; ordenação padrão passa a ser "Impacto na frota".

## 2026-11-09 — acesso por senha temporária
- **Alterado**: o convite por e-mail e a recuperação de senha por e-mail foram removidos. O admin/gestor cria o acesso com **senha temporária** e o usuário é obrigado a trocá-la no primeiro login (`POST /api/my-access`); enquanto não troca, toda a API responde 403. Política única de senha: mínimo 8 caracteres, 1 minúscula, 1 maiúscula, 1 caractere especial (validada no navegador e no servidor). O admin pode redefinir uma senha temporária pela edição do usuário.
- **Aplicado em produção**: `scripts/supabase_security_hardening.sql` — leitura anônima de `news` e RPC anônimo bloqueados (retestado: 401/42501); consultas do feed de 11–17 ms para 0,2–0,8 ms com `news_created_at_idx`.

## 2026-11-09 (auditoria QA)
- **Segurança**: a tabela `news` deixa de ser legível sem login pela chave pública; o frontend lê notícias só via `/api/news-feed` (também no modo demo) e o scraper não recria mais a policy anônima. Migration `scripts/supabase_security_hardening.sql`.
- **Corrigido**: fonte "Band - Notícias" retornava 0 itens após mudança no formato de URL do portal.
- **Segurança**: teto de tamanho no texto enviado à IA (`/api/news-summary`) e no corpo de todas as requisições (400 para JSON inválido); exclusão de usuário por e-mail com correspondência exata; `supabase-js` fixado em 2.118.0 com SRI; headers de segurança.
- **Atualizado**: `requests` 2.33.1 e `python-dotenv` 1.2.2 (CVEs).
- **Adicionado**: CI de testes (`.github/workflows/tests.yml`) e relatório de auditoria em `docs/qa-audit/`.

## 2026-08-06
- **Adicionado**: arquitetura de 23 subagents especializados do Claude Code (`.claude/agents/`), documentada em `docs/AGENTS.md` e `CLAUDE.md`.
- **Adicionado**: `docs-publisher` — consolida `/product` + `/docs` em um PDF único e sempre atualizado (`docs/dist/road-news-documentation.pdf`).
- **Corrigido**: resumo do card gerado pelo botão "Gerar Resumo" (canvas em `public/index.html`) podia truncar sem indicação visual de corte (`completeCardSummary`); agora sempre termina com reticências quando o texto é cortado.
- **Melhorado**: card do botão "Gerar Resumo" ganhou badge de rota (rodovia + região) e cor de severidade específica no badge de risco (crítico/alto/médio/baixo), em vez de usar a cor de marca para todos os níveis.
- **Melhorado**: prompt do resumo individual (`api/news-summary.js`) passa a extrair km, sentido e status da via quando existirem, e marca `insufficient_data: true` explicitamente em vez de gerar frase vaga de impacto não confirmado.
- **Corrigido**: fontes "Google News — ..." (`config/sources.yaml`) gravavam o nome da query de busca como fonte da notícia; `scraper/sources/rss.py` agora resolve o veículo real por trás do redirect.

## 2026-08-05
- **Melhorado**: marcadores de risco sobrepostos no mapa agora se agrupam e reagrupam por nível de zoom.
- **Corrigido**: rodovias citadas na análise de rota sem geolocalização precisa agora ainda recebem marcador no mapa.
- **Melhorado**: marcador da rota mostra km e descrição curta sempre visíveis.
- **Melhorado**: visibilidade de trechos de risco no mapa da tela Minha Rota.
- **Adicionado**: sinalização de bloqueios/riscos na rota com descrição e segmento destacado no mapa.
- **Corrigido**: janela de notícias consideradas na análise de rota reduzida de 72h para 24h (relevância).
- **Adicionado**: suporte a paradas intermediárias na análise de rota (Minha Rota).
- **Corrigido**: lacunas de classificação de risco identificadas em QA visual; bug de KPI exibindo vazio quando o valor real era zero.
- **Melhorado**: resumos de IA agora são instruídos a agregar valor além de repetir o título.
- **Corrigido**: campo de região corrompido quando a saída de IA não era validada.
- **Melhorado**: classificação de risco diferenciada em vez de default para "Alto".
- **Segurança**: removidos detalhes internos de arquitetura do copy do painel admin.

---

*Entradas anteriores a 2026-08-05 não foram retroativamente documentadas aqui — consultar `git log` para o histórico completo do repositório.*
