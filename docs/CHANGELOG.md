# Changelog — Road News

> Mantido por `tech-docs-agent`, uma entrada por mudança de **comportamento observável** (não por refactor interno sem efeito externo). Não confundir com o changelog interno do PDF em `docs/dist/.docs-pdf-manifest.json` (esse é só sobre a publicação do PDF em si) nem com [`docs/HISTORY.md`](HISTORY.md) (registro fiel de toda mudança, incluindo internas, mantido por `project-historian`).

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
