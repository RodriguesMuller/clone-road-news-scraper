# Changelog — Road News

> Mantido por `tech-docs-agent`, uma entrada por mudança de **comportamento observável** (não por refactor interno sem efeito externo). Não confundir com o changelog interno do PDF em `docs/dist/.docs-pdf-manifest.json` (esse é só sobre a publicação do PDF em si) nem com [`docs/HISTORY.md`](HISTORY.md) (registro fiel de toda mudança, incluindo internas, mantido por `project-historian`).

## 2026-11-09 (branch `qa-audit`, aguardando deploy)
- **Segurança**: a tabela `news` deixa de ser legível sem login pela chave pública; o frontend lê notícias só via `/api/news-feed` (também no modo demo) e o scraper não recria mais a policy anônima. Migration `scripts/supabase_security_hardening.sql`.
- **Corrigido**: links de convite e recuperação de senha (`/accept-invite`, `/auth/callback`) retornavam 404 na Vercel.
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
