# CLAUDE.md — Road News

## O produto

Road News é o produto de inteligência operacional de uma **gerenciadora de risco de transporte rodoviário de cargas**: coleta notícias de portais e órgãos públicos, filtra o que afeta rotas/cargas, e entrega a clientes **multi-tenant** uma resposta a "isso afeta minha operação, onde, quão grave, o que fazer" — não um agregador de notícias. Entidades centrais de domínio: rodovia, km, sentido, município, UF, trecho/concessionária, categoria (acidentes, bloqueios, enchentes, clima severo, roubo de carga, greves, fiscalização, obras), severidade (baixo/médio/alto/crítico, sempre com justificativa).

## Stack real (não a aspiracional)

Este projeto usa deliberadamente uma stack enxuta. Antes de sugerir Next.js, NestJS, Playwright, Docker ou qualquer dependência nova, leia isto:

| Camada | Realidade |
|---|---|
| Scraper | Python 3.11, `feedparser` + `requests` + `BeautifulSoup4`/`lxml`. **Sem** browser headless. |
| Backend | Vercel Serverless Functions, Node.js puro (CommonJS), **zero dependências npm** (sem `package.json`). |
| Frontend | `public/index.html` único (~6.800 linhas), HTML/CSS/JS vanilla, **sem** build step/framework. |
| Dados | Supabase Postgres gerenciado, RLS via funções SECURITY DEFINER. Migrations = SQL idempotente manual em `scripts/*.sql`. |
| IA | OpenAI Responses API (`gpt-4.1-mini` padrão), 4 pontos de uso. Sem roteamento multi-provedor. |
| Deploy | Vercel + GitHub Actions. **Sem** Docker/Coolify/Railway/Azure. |
| Testes | `unittest` (Python) + `node:test` (JS) nativos. **Sem** Jest/Vitest/Playwright. CI ainda não roda a suíte automaticamente. |

A stack "de referência" mais ampla (framework web, headless browser, containerização) é uma **caixa de ferramentas futura**: só entra via ADR de `system-architect`, quando um caso concreto justificar — nunca por padrão. Ver [`docs/adr/0001-arquitetura-de-subagents.md`](docs/adr/0001-arquitetura-de-subagents.md) para o histórico dessa decisão.

## Arquitetura de subagents

Este projeto usa 23 subagents especializados (`.claude/agents/*.md`), documentados por completo em **[`docs/AGENTS.md`](docs/AGENTS.md)** (roster, matriz de propriedade de arquivo, grafo de dependências, sobreposições resolvidas, 5 workflows oficiais, e o guia de uso de cada agente). Este arquivo traz só o mapa rápido de roteamento — para qualquer dúvida de fronteira entre agentes, `docs/AGENTS.md` é a fonte completa.

### Mapa rápido: qual agente chamar

| Se a tarefa é sobre... | Chame |
|---|---|
| Onde um código deve morar, dependência nova, framework/Docker | `system-architect` |
| Fonte de notícia nova, seletor quebrado, `config/sources.yaml` | `scraping-engineer` |
| Notícia duplicada entre portais, extração de rodovia/km/UF | `data-pipeline-engineer` |
| Chamada a LLM, schema de resposta, fallback, cache | `ai-engineer` |
| Texto de prompt, tokens, teste A/B | `prompt-engineer` |
| O que é "crítico", taxonomia, régua de severidade | `logistics-intelligence` |
| Schema, migration, índice, RLS, query lenta | `database-expert` |
| Endpoint em `api/news-feed.js`/`news-summary.js`/etc. | `backend-engineer` |
| Tela do painel, `public/index.html` | `frontend-engineer` |
| E-mail semanal, alerta, anti-flood, canal novo | `notification-engineer` |
| Auth, papel (admin/gestor/client), pacote, quota, `api/_auth.js`/`admin-*.js` | `saas-platform-engineer` |
| GitHub Actions, cron, `vercel.json`, variável de ambiente | `devops-engineer` |
| Teste novo, reproduzir bug, fixture | `qa-test-engineer` |
| Revisão de segurança (SSRF, XSS, isolamento de tenant, segredo) | `security-reviewer` |
| Fonte legal (robots.txt/ToS), direito autoral, LGPD de notícia | `compliance-advisor` |
| Custo de IA/infra, trade-off de economia | `finops-agent` |
| Fluxo/hierarquia de tela, onboarding | `ux-product-designer` |
| Métrica de volume/qualidade/latência/engajamento | `data-analyst` |
| Meta tag, robots.txt/sitemap.xml, palavra-chave | `seo-content-agent` |
| Pricing, persona, posicionamento, `/product` | `product-docs-agent` |
| README, `/docs`, arquitetura documentada, API documentada | `tech-docs-agent` |
| Registro de mudança em `docs/HISTORY.md` | `project-historian` |
| PDF único consolidado de `/product` + `/docs` (`docs/dist/road-news-documentation.pdf`) | `docs-publisher` |

## Definition of Done

Nenhuma alteração é considerada concluída enquanto os agentes de documentação aplicáveis não tiverem validado e atualizado suas respectivas áreas, **nesta ordem**:

1. **`tech-docs-agent`** — obrigatório em **toda** mudança de código, schema, endpoint, variável de ambiente ou dependência.
2. **`product-docs-agent`** — obrigatório quando a mudança altera **capacidade percebida pelo cliente**, precificação, posicionamento ou material de venda. Em mudança puramente interna, ele mesmo registra "sem impacto de produto" e encerra — é decisão dele, não do agente que implementou.
3. **`project-historian`** — obrigatório em **toda** mudança, registrando também as alternativas descartadas.
4. **`docs-publisher`** — regenera `docs/dist/road-news-documentation.pdf` **se e somente se** o hash de `/product` ou `/docs` mudou desde a última publicação (idempotente: sem mudança de conteúdo, não roda de novo). Nunca cria um segundo PDF nem sufixa por data/versão — sempre sobrescreve o mesmo arquivo.

**Gate de qualidade antes do merge:** `qa-test-engineer` verde → `security-reviewer` sem achado `[BLOQUEANTE]` → os 4 passos de documentação acima.

Os 5 workflows oficiais (nova feature, correção de bug, novo scraper, deploy em produção, ciclo mensal de otimização de IA) estão detalhados em `docs/AGENTS.md`.

## Regras que valem para qualquer agente

- Least privilege: agentes consultivos (`security-reviewer`, `compliance-advisor`, `finops-agent`, e as camadas de produto/UX/SEO fora de seus artefatos próprios) não têm `Write`/`Edit` em código de aplicação.
- Um dono por artefato — a matriz completa está em `docs/AGENTS.md`. Se dois agentes parecem precisar escrever no mesmo arquivo, é um sinal de que falta uma fronteira clara: pare e chame `system-architect` para arbitrar, não escolha um dono ad hoc.
- Nenhum agente afirma que o produto usa uma tecnologia que não está na tabela de stack real acima sem marcar explicitamente como planejado/avaliado (ver ADR correspondente).
